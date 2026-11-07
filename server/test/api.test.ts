import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { VendorActions } from '../src/api/context.js';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { LoginThrottle } from '../src/auth/tokens.js';
import { migrate } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { normalizePush } from '../src/push/normalize.js';
import { PushEvents } from '../src/push/routes.js';
import { buildSign } from '../src/push/signature.js';
import { createDevice } from '../src/repo/devices.js';
import { createOrg } from '../src/repo/orgs.js';
import type { Role } from '../src/repo/types.js';
import { createUser } from '../src/repo/users.js';
import { PostgresPushStore } from '../src/storage/postgres.js';
import { VendorTransportError } from '../src/vendor/errors.js';
import type { CommandOutcome, DeviceRef } from '../src/vendor/types.js';
import { alarmPush, positionPush } from './fixtures.js';

/**
 * End-to-end tests of the dashboard API against a real PostgreSQL database.
 * Runs only when TEST_DATABASE_URL is set (the schema is dropped!).
 */
const url = process.env.TEST_DATABASE_URL;
const PASSWORD = 'password123';
const PUSH_SECRET = 'push-secret';

/** Records vendor calls; results can be scripted per test. */
class FakeVendor implements VendorActions {
  calls: { method: string; args: unknown[] }[] = [];
  nextOutcome: Partial<CommandOutcome> | Error = { status: 6 };

  private outcome(method: string, args: unknown[]): Promise<CommandOutcome> {
    this.calls.push({ method, args });
    const next = this.nextOutcome;
    if (next instanceof Error) return Promise.reject(next);
    const status = next.status ?? 6;
    return Promise.resolve({
      status,
      statusText: status === 6 ? 'Sent and confirmed by device' : 'Device offline, command NOT queued',
      accepted: status === 6 || status === 0 || status === 3,
      ...next,
    } as CommandOutcome);
  }
  cutEngine = (d: DeviceRef) => this.outcome('cutEngine', [d]);
  restoreEngine = (d: DeviceRef) => this.outcome('restoreEngine', [d]);
  setSpeedLimit = (d: DeviceRef, s: number, t: number) => this.outcome('setSpeedLimit', [d, s, t]);
  addDevice = (async (input: unknown) => {
    this.calls.push({ method: 'addDevice', args: [input] });
    return { status: 0, device: {} };
  }) as unknown as VendorActions['addDevice'];
}

describe.skipIf(!url)('dashboard API', () => {
  let pool: pg.Pool;
  let app: FastifyInstance;
  const vendor = new FakeVendor();
  const events = new PushEvents();
  const ids = {} as Record<'platform' | 'reseller' | 'acme' | 'chidi' | 'otherReseller' | 'otherCustomer', number>;
  const tokens = {} as Record<string, string>;

  const inject = (method: 'GET' | 'POST' | 'PATCH', path: string, as?: string, payload?: unknown) =>
    app.inject({
      method,
      url: `/api${path}`,
      headers: as ? { authorization: `Bearer ${tokens[as]}` } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  async function login(loginId: string, password = PASSWORD) {
    const res = await inject('POST', '/auth/login', undefined, { login: loginId, password });
    expect(res.statusCode, res.body).toBe(200);
    return res.json().token as string;
  }

  async function addUser(orgId: number, key: string, role: Role, contact: { email?: string; phone?: string }) {
    await createUser(pool, { orgId, name: key, ...contact, passwordHash: await hashPassword(PASSWORD), role });
    tokens[key] = await login((contact.email ?? contact.phone)!);
  }

  beforeAll(async () => {
    pool = createPool(url!, 5);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await migrate(pool, () => {});

    app = await buildApp({
      events,
      push: {
        store: new PostgresPushStore(pool),
        appId: 'tracker',
        appSecret: PUSH_SECRET,
        allowUnsigned: false,
        toleranceMs: 300_000,
        storeRaw: true,
      },
      api: {
        pool,
        vendor,
        // Generous limits so the shared test IP isn't blocked; one test uses its own.
        loginThrottle: new LoginThrottle(5, 60_000),
        ipThrottle: new LoginThrottle(1000, 60_000),
      },
    });

    // Tree: platform -> reseller -> acme (business), chidi (individual)
    //                -> otherReseller -> otherCustomer
    ids.platform = (await createOrg(pool, { parentId: null, type: 'platform', name: 'TrackCo' })).id;
    ids.reseller = (await createOrg(pool, { parentId: ids.platform, type: 'reseller', name: 'Lagos Reseller' })).id;
    ids.acme = (await createOrg(pool, { parentId: ids.reseller, type: 'customer', customerKind: 'business', name: 'Acme Logistics' })).id;
    ids.chidi = (await createOrg(pool, { parentId: ids.reseller, type: 'customer', customerKind: 'individual', name: 'Chidi' })).id;
    ids.otherReseller = (await createOrg(pool, { parentId: ids.platform, type: 'reseller', name: 'Abuja Reseller' })).id;
    ids.otherCustomer = (await createOrg(pool, { parentId: ids.otherReseller, type: 'customer', customerKind: 'business', name: 'Other Co' })).id;

    await addUser(ids.platform, 'platformOwner', 'owner', { email: 'boss@trackco.ng' });
    await addUser(ids.reseller, 'resellerAdmin', 'admin', { email: 'admin@reseller.ng' });
    await addUser(ids.acme, 'acmeOwner', 'owner', { phone: '+2348030000001' });
    await addUser(ids.acme, 'acmeAdmin', 'admin', { email: 'admin@acme.ng' });
    await addUser(ids.acme, 'acmeOperator', 'operator', { email: 'ops@acme.ng' });
    await addUser(ids.acme, 'acmeViewer', 'viewer', { email: 'viewer@acme.ng' });
    await addUser(ids.chidi, 'chidi', 'owner', { phone: '+2348030000002' });
    await addUser(ids.otherCustomer, 'otherOwner', 'owner', { email: 'owner@other.ng' });

    const base = { vendorDeviceType: 1 };
    await createDevice(pool, { ...base, deviceId: '868035043015161', orgId: ids.acme, name: 'Hilux 1', plateNumber: 'LAG-123-XY' });
    await createDevice(pool, { ...base, deviceId: 'ACME2EXPIRED', orgId: ids.acme, name: 'Old Van', paidUntil: new Date(Date.now() - 86_400_000) });
    await createDevice(pool, { deviceId: 'CHIDI00001', orgId: ids.chidi, name: "Chidi's Camry", vendorDeviceType: 26 });
    await createDevice(pool, { ...base, deviceId: 'OTHER00001', orgId: ids.otherCustomer, name: 'Other truck', kind: 'truck' });

    const store = new PostgresPushStore(pool);
    await store.savePosition(normalizePush(positionPush).position!);
    await store.savePosition({ ...normalizePush(positionPush).position!, deviceId: 'ACME2EXPIRED' });
    await store.savePosition({ ...normalizePush(positionPush).position!, deviceId: 'UNREGISTERED9' });
    await store.saveAlarm(normalizePush(alarmPush).alarms[0]!);
    await store.saveAlarm({ ...normalizePush(alarmPush).alarms[0]!, deviceId: 'OTHER00001' });
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
  });

  // ------------------------------------------------------------------ auth

  describe('auth', () => {
    it('logs in with a Nigerian phone number typed in local format', async () => {
      const res = await inject('POST', '/auth/login', undefined, { login: '0803 000 0001', password: PASSWORD });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ user: { name: 'acmeOwner', role: 'owner' }, org: { name: 'Acme Logistics' } });
    });

    it('rejects wrong passwords and unknown users the same way', async () => {
      const a = await inject('POST', '/auth/login', undefined, { login: 'boss@trackco.ng', password: 'nope' });
      const b = await inject('POST', '/auth/login', undefined, { login: 'ghost@trackco.ng', password: 'nope' });
      expect(a.statusCode).toBe(401);
      expect(b.statusCode).toBe(401);
      expect(a.json().message).toBe(b.json().message);
    });

    it('blocks an account after 5 failed attempts', async () => {
      await addUser(ids.acme, 'throttled', 'viewer', { email: 'throttle@acme.ng' });
      for (let i = 0; i < 5; i++) await inject('POST', '/auth/login', undefined, { login: 'throttle@acme.ng', password: 'bad' });
      const res = await inject('POST', '/auth/login', undefined, { login: 'throttle@acme.ng', password: PASSWORD });
      expect(res.statusCode).toBe(429);
    });

    it('requires a valid token', async () => {
      expect((await inject('GET', '/me')).statusCode).toBe(401);
      const res = await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: 'Bearer nonsense' } });
      expect(res.statusCode).toBe(401);
    });

    it('returns the current user and what they may do', async () => {
      const viewer = (await inject('GET', '/me', 'acmeViewer')).json();
      expect(viewer.permissions).toEqual({
        isStaff: false,
        manageUsers: false,
        manageCustomers: false,
        manageDeviceInventory: false,
        sendCommands: false,
        acknowledgeAlarms: false,
      });
      const staff = (await inject('GET', '/me', 'resellerAdmin')).json();
      expect(staff.permissions).toMatchObject({ isStaff: true, manageCustomers: true, sendCommands: true });
    });

    it('logs out', async () => {
      const token = await login('ops@acme.ng');
      const headers = { authorization: `Bearer ${token}` };
      expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: '/api/me', headers })).statusCode).toBe(401);
    });

    it('changes password and ends other sessions', async () => {
      await addUser(ids.chidi, 'pwUser', 'viewer', { email: 'pw@chidi.ng' });
      const other = await login('pw@chidi.ng');
      const res = await inject('POST', '/me/password', 'pwUser', { currentPassword: PASSWORD, newPassword: 'new-password-1' });
      expect(res.statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: '/api/me', headers: { authorization: `Bearer ${other}` } })).statusCode).toBe(401);
      expect((await inject('GET', '/me', 'pwUser')).statusCode).toBe(200); // current session kept
      expect((await inject('POST', '/me/password', 'pwUser', { currentPassword: 'wrong', newPassword: 'whatever123' })).statusCode).toBe(400);
    });
  });

  // ------------------------------------------------------------------ orgs

  describe('organizations', () => {
    const names = async (as: string) => ((await inject('GET', '/orgs', as)).json().orgs as { name: string }[]).map((o) => o.name).sort();

    it('each user sees only their own branch of the tree', async () => {
      expect(await names('platformOwner')).toHaveLength(6);
      expect(await names('resellerAdmin')).toEqual(['Acme Logistics', 'Chidi', 'Lagos Reseller']);
      expect(await names('acmeViewer')).toEqual(['Acme Logistics']);
    });

    it("returns 404 for another customer's organization", async () => {
      expect((await inject('GET', `/orgs/${ids.otherCustomer}`, 'acmeOwner')).statusCode).toBe(404);
      expect((await inject('GET', `/orgs/${ids.otherCustomer}`, 'resellerAdmin')).statusCode).toBe(404);
      expect((await inject('GET', `/orgs/${ids.acme}`, 'resellerAdmin')).statusCode).toBe(200);
    });

    it('a reseller admin creates a customer with its owner, who can then log in', async () => {
      const res = await inject('POST', '/orgs', 'resellerAdmin', {
        type: 'customer',
        customerKind: 'business',
        name: 'Kano Haulage',
        phone: '08039998888',
        owner: { name: 'Musa', phone: '0803 777 6666', password: 'musa-password' },
      });
      expect(res.statusCode, res.body).toBe(201);
      const body = res.json();
      expect(body.org).toMatchObject({ parentId: ids.reseller, type: 'customer', phone: '+2348039998888', countryCode: 'NG' });
      expect(body.owner).toMatchObject({ role: 'owner', phone: '+2348037776666' });
      expect((await inject('POST', '/auth/login', undefined, { login: '08037776666', password: 'musa-password' })).statusCode).toBe(200);
    });

    it('rolls back the organization if the owner login is already taken', async () => {
      const res = await inject('POST', '/orgs', 'resellerAdmin', {
        type: 'customer',
        customerKind: 'individual',
        name: 'Duplicate',
        owner: { name: 'Dup', email: 'admin@acme.ng', password: 'password123' },
      });
      expect(res.statusCode).toBe(409);
      expect(await names('resellerAdmin')).not.toContain('Duplicate');
    });

    it('validates input', async () => {
      expect((await inject('POST', '/orgs', 'resellerAdmin', { type: 'customer', name: 'No kind' })).statusCode).toBe(400);
      expect((await inject('POST', '/orgs', 'resellerAdmin', { type: 'reseller', customerKind: 'business', name: 'x' })).statusCode).toBe(400);
      const underCustomer = await inject('POST', '/orgs', 'resellerAdmin', {
        parentId: ids.acme,
        type: 'customer',
        customerKind: 'business',
        name: 'Sub',
      });
      expect(underCustomer.statusCode).toBe(400);
    });

    it('customers cannot create organizations', async () => {
      const res = await inject('POST', '/orgs', 'acmeOwner', { type: 'customer', customerKind: 'business', name: 'x' });
      expect(res.statusCode).toBe(403);
    });

    it('customer admins can edit their own details but not deactivate themselves', async () => {
      const ok = await inject('PATCH', `/orgs/${ids.acme}`, 'acmeAdmin', { email: 'Info@Acme.ng' });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().org.email).toBe('info@acme.ng');
      expect((await inject('PATCH', `/orgs/${ids.acme}`, 'acmeAdmin', { active: false })).statusCode).toBe(403);
      expect((await inject('PATCH', `/orgs/${ids.acme}`, 'acmeViewer', { name: 'x' })).statusCode).toBe(403);
    });

    it('deactivating a customer locks its users out', async () => {
      const org = (
        await inject('POST', '/orgs', 'resellerAdmin', {
          type: 'customer',
          customerKind: 'individual',
          name: 'Late Payer',
          owner: { name: 'Late', email: 'late@payer.ng', password: 'password123' },
        })
      ).json().org;
      tokens.late = await login('late@payer.ng');
      expect((await inject('GET', '/me', 'late')).statusCode).toBe(200);
      expect((await inject('PATCH', `/orgs/${org.id}`, 'resellerAdmin', { active: false })).statusCode).toBe(200);
      expect((await inject('GET', '/me', 'late')).statusCode).toBe(401);
    });
  });

  // ----------------------------------------------------------------- users

  describe('users', () => {
    it('admins add operators but not owners', async () => {
      const ok = await inject('POST', `/orgs/${ids.acme}/users`, 'acmeAdmin', {
        name: 'Driver Supervisor',
        phone: '07012345678',
        password: 'password123',
        role: 'operator',
      });
      expect(ok.statusCode, ok.body).toBe(201);
      expect(ok.json().user.phone).toBe('+2347012345678');
      const owner = await inject('POST', `/orgs/${ids.acme}/users`, 'acmeAdmin', {
        name: 'x',
        email: 'x@acme.ng',
        password: 'password123',
        role: 'owner',
      });
      expect(owner.statusCode).toBe(403);
    });

    it('rejects duplicate logins and users without any login', async () => {
      const dup = await inject('POST', `/orgs/${ids.acme}/users`, 'acmeOwner', {
        name: 'Dup',
        phone: '08030000002', // Chidi's number
        password: 'password123',
        role: 'viewer',
      });
      expect(dup.statusCode).toBe(409);
      const none = await inject('POST', `/orgs/${ids.acme}/users`, 'acmeOwner', { name: 'No login', password: 'password123', role: 'viewer' });
      expect(none.statusCode).toBe(400);
    });

    it("viewers can't list users; other customers' users are hidden", async () => {
      expect((await inject('GET', `/orgs/${ids.acme}/users`, 'acmeViewer')).statusCode).toBe(403);
      expect((await inject('GET', `/orgs/${ids.acme}/users`, 'otherOwner')).statusCode).toBe(404);
      const list = await inject('GET', `/orgs/${ids.acme}/users`, 'acmeOwner');
      expect(list.statusCode).toBe(200);
      expect(list.json().users.every((u: Record<string, unknown>) => !('passwordHash' in u))).toBe(true);
    });

    it('protects owners and the last owner', async () => {
      const users = (await inject('GET', `/orgs/${ids.acme}/users`, 'acmeOwner')).json().users as { id: number; name: string }[];
      const ownerId = users.find((u) => u.name === 'acmeOwner')!.id;
      // An admin can't touch an owner.
      expect((await inject('PATCH', `/users/${ownerId}`, 'acmeAdmin', { name: 'hacked' })).statusCode).toBe(403);
      // Nobody can change their own role.
      expect((await inject('PATCH', `/users/${ownerId}`, 'acmeOwner', { role: 'viewer' })).statusCode).toBe(403);
      // Staff can't demote the only owner.
      expect((await inject('PATCH', `/users/${ownerId}`, 'resellerAdmin', { role: 'admin' })).statusCode).toBe(400);
    });

    it('deactivating a user or resetting their password ends their sessions', async () => {
      await addUser(ids.acme, 'leaver', 'viewer', { email: 'leaver@acme.ng' });
      const users = (await inject('GET', `/orgs/${ids.acme}/users`, 'acmeAdmin')).json().users as { id: number; name: string }[];
      const leaverId = users.find((u) => u.name === 'leaver')!.id;
      expect((await inject('PATCH', `/users/${leaverId}`, 'acmeAdmin', { active: false })).statusCode).toBe(200);
      expect((await inject('GET', '/me', 'leaver')).statusCode).toBe(401);
      expect((await inject('POST', '/auth/login', undefined, { login: 'leaver@acme.ng', password: PASSWORD })).statusCode).toBe(401);
    });
  });

  // --------------------------------------------------------------- devices

  describe('devices', () => {
    const deviceIds = async (as: string) =>
      ((await inject('GET', '/devices', as)).json().devices as { id: string }[]).map((d) => d.id).sort();

    it('customers see only their own devices, with live position', async () => {
      expect(await deviceIds('acmeViewer')).toEqual(['868035043015161', 'ACME2EXPIRED']);
      expect(await deviceIds('chidi')).toEqual(['CHIDI00001']);
      expect(await deviceIds('resellerAdmin')).toEqual(['868035043015161', 'ACME2EXPIRED', 'CHIDI00001']);
      expect(await deviceIds('platformOwner')).toHaveLength(4);

      const res = await inject('GET', '/devices/868035043015161', 'acmeViewer');
      expect(res.json().device).toMatchObject({
        name: 'Hilux 1',
        plateNumber: 'LAG-123-XY',
        subscriptionActive: true,
        position: { lat: 6.5244, lon: 3.3792, speedKmh: 45.6, odometerKm: 1234.6 },
      });
    });

    it('hides internal fields from customers but not from staff', async () => {
      const customer = (await inject('GET', '/devices/868035043015161', 'acmeOwner')).json().device;
      const staff = (await inject('GET', '/devices/868035043015161', 'resellerAdmin')).json().device;
      expect(customer).not.toHaveProperty('vendorDeviceType');
      expect(customer).not.toHaveProperty('simNumber');
      expect(staff.vendorDeviceType).toBe(1);
    });

    it("returns 404 for someone else's device", async () => {
      expect((await inject('GET', '/devices/OTHER00001', 'acmeOwner')).statusCode).toBe(404);
      expect((await inject('GET', '/devices/OTHER00001', 'resellerAdmin')).statusCode).toBe(404);
      expect((await inject('GET', '/devices/NOPE', 'acmeOwner')).statusCode).toBe(404);
    });

    it('hides position for expired subscriptions from customers, not from staff', async () => {
      const customer = (await inject('GET', '/devices/ACME2EXPIRED', 'acmeOwner')).json().device;
      expect(customer).toMatchObject({ status: 'subscription_expired', subscriptionActive: false, position: null });
      const staff = (await inject('GET', '/devices/ACME2EXPIRED', 'resellerAdmin')).json().device;
      expect(staff.position).not.toBeNull();
    });

    it('staff register devices (optionally on the vendor platform too); customers cannot', async () => {
      vendor.calls = [];
      const res = await inject('POST', '/devices', 'resellerAdmin', {
        deviceId: '860000000000001',
        orgId: ids.chidi,
        name: 'Keke 1',
        kind: 'motorbike',
        vendorDeviceType: 26,
        paidUntil: '2027-11-07T00:00:00Z',
        registerWithVendor: true,
      });
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json().device).toMatchObject({ id: '860000000000001', kind: 'motorbike', status: 'no_data', position: null });
      expect(vendor.calls[0]).toMatchObject({ method: 'addDevice', args: [{ deviceid: '860000000000001', devicetype: 26, timezone: 1 }] });

      const dup = await inject('POST', '/devices', 'resellerAdmin', { deviceId: '860000000000001', orgId: ids.chidi, name: 'x', vendorDeviceType: 26 });
      expect(dup.statusCode).toBe(409);
      const outside = await inject('POST', '/devices', 'resellerAdmin', { deviceId: '860000000000002', orgId: ids.otherCustomer, name: 'x', vendorDeviceType: 26 });
      expect(outside.statusCode).toBe(404);
      const byCustomer = await inject('POST', '/devices', 'acmeOwner', { deviceId: '860000000000003', orgId: ids.acme, name: 'x', vendorDeviceType: 26 });
      expect(byCustomer.statusCode).toBe(403);
    });

    it('customer admins rename devices but cannot change subscription or owner', async () => {
      const ok = await inject('PATCH', '/devices/868035043015161', 'acmeAdmin', { name: 'Hilux (Ikeja)', plateNumber: 'LAG-999-ZZ' });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().device).toMatchObject({ name: 'Hilux (Ikeja)', plateNumber: 'LAG-999-ZZ' });
      expect((await inject('PATCH', '/devices/868035043015161', 'acmeAdmin', { paidUntil: '2030-01-01' })).statusCode).toBe(400);
      expect((await inject('PATCH', '/devices/868035043015161', 'acmeAdmin', { orgId: ids.chidi })).statusCode).toBe(400);
      expect((await inject('PATCH', '/devices/868035043015161', 'acmeOperator', { name: 'x' })).statusCode).toBe(403);
    });

    it('staff renew subscriptions and move devices between their customers', async () => {
      const renewed = await inject('PATCH', '/devices/ACME2EXPIRED', 'resellerAdmin', { paidUntil: '2030-01-01T00:00:00Z' });
      expect(renewed.statusCode).toBe(200);
      expect((await inject('GET', '/devices/ACME2EXPIRED', 'acmeOwner')).json().device.subscriptionActive).toBe(true);
      // Can't move to a customer outside the reseller's tree.
      expect((await inject('PATCH', '/devices/ACME2EXPIRED', 'resellerAdmin', { orgId: ids.otherCustomer })).statusCode).toBe(404);
      // Put it back to expired for the following tests.
      await inject('PATCH', '/devices/ACME2EXPIRED', 'resellerAdmin', { paidUntil: '2020-01-01T00:00:00Z' });
    });

    it('lists trackers that send data but are not registered (platform only)', async () => {
      const res = await inject('GET', '/devices/unregistered', 'platformOwner');
      expect(res.json().devices.map((d: { deviceId: string }) => d.deviceId)).toEqual(['UNREGISTERED9']);
      expect((await inject('GET', '/devices/unregistered', 'resellerAdmin')).statusCode).toBe(403);
    });
  });

  // --------------------------------------------------------------- history

  describe('history', () => {
    const range = 'from=2026-09-01T00:00:00Z&to=2026-09-07T00:00:00Z';

    it('returns stored positions in a time range', async () => {
      // The fixture position is at 2026-09-14 (epoch 1789347000000).
      const res = await inject('GET', '/devices/868035043015161/history?from=2026-09-13T00:00:00Z&to=2026-09-15T00:00:00Z', 'acmeViewer');
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ truncated: false, points: [{ lat: 6.5244, lon: 3.3792, speedKmh: 45.6 }] });
      const empty = await inject('GET', `/devices/868035043015161/history?${range}`, 'acmeViewer');
      expect(empty.json().points).toEqual([]);
    });

    it('validates the range', async () => {
      expect((await inject('GET', '/devices/868035043015161/history?from=2026-09-01T00:00:00Z&to=2026-09-30T00:00:00Z', 'acmeViewer')).statusCode).toBe(400);
      expect((await inject('GET', '/devices/868035043015161/history?from=2026-09-07T00:00:00Z&to=2026-09-01T00:00:00Z', 'acmeViewer')).statusCode).toBe(400);
      expect((await inject('GET', '/devices/868035043015161/history', 'acmeViewer')).statusCode).toBe(400);
    });

    it('needs an active subscription for customers', async () => {
      expect((await inject('GET', `/devices/ACME2EXPIRED/history?${range}`, 'acmeOwner')).statusCode).toBe(402);
      expect((await inject('GET', `/devices/ACME2EXPIRED/history?${range}`, 'resellerAdmin')).statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------- commands

  describe('commands', () => {
    const cut = (as: string, body: object = { command: 'engine_cut', confirm: true }, device = '868035043015161') =>
      inject('POST', `/devices/${device}/commands`, as, body);

    it('owners/admins cut the engine; the right device type is used; it is logged', async () => {
      vendor.calls = [];
      vendor.nextOutcome = { status: 6 };
      const res = await cut('acmeAdmin');
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ accepted: true, status: 6 });
      expect(vendor.calls).toEqual([{ method: 'cutEngine', args: [{ deviceid: '868035043015161', devicetype: 1 }] }]);
      const log = (await inject('GET', '/devices/868035043015161/commands', 'acmeViewer')).json().commands;
      expect(log[0]).toMatchObject({ command: 'engine_cut', accepted: true, status: 6, userName: 'acmeAdmin' });
    });

    it('requires explicit confirmation and a valid command', async () => {
      expect((await cut('acmeAdmin', { command: 'engine_cut' })).statusCode).toBe(400);
      expect((await cut('acmeAdmin', { command: 'engine_cut', confirm: false })).statusCode).toBe(400);
      expect((await cut('acmeAdmin', { command: 'self_destruct', confirm: true })).statusCode).toBe(400);
      expect((await cut('acmeAdmin', { command: 'speed_limit', confirm: true, speedKmh: 5, durationSeconds: 10 })).statusCode).toBe(400);
    });

    it('operators, viewers and other customers cannot send commands', async () => {
      vendor.calls = [];
      expect((await cut('acmeOperator')).statusCode).toBe(403);
      expect((await cut('acmeViewer')).statusCode).toBe(403);
      expect((await cut('otherOwner')).statusCode).toBe(404);
      expect((await cut('acmeOwner', undefined, 'ACME2EXPIRED')).statusCode).toBe(402);
      expect(vendor.calls).toEqual([]);
    });

    it('reports when the device is offline (not queued)', async () => {
      vendor.nextOutcome = { status: 2 };
      const res = await cut('acmeOwner', { command: 'engine_restore', confirm: true });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ accepted: false, status: 2, statusText: 'Device offline, command NOT queued' });
    });

    it('logs and reports vendor failures', async () => {
      vendor.nextOutcome = new VendorTransportError('sendcmd', 'network error');
      const res = await cut('acmeOwner');
      expect(res.statusCode).toBe(502);
      const log = (await inject('GET', '/devices/868035043015161/commands', 'acmeOwner')).json().commands;
      expect(log[0]).toMatchObject({ command: 'engine_cut', accepted: false, status: null, error: expect.stringContaining('network error') });
      vendor.nextOutcome = { status: 6 };
    });

    it('sets a speed limit', async () => {
      vendor.calls = [];
      const res = await cut('chidi', { command: 'speed_limit', confirm: true, speedKmh: 100, durationSeconds: 30 }, 'CHIDI00001');
      expect(res.statusCode).toBe(200);
      expect(vendor.calls[0]).toEqual({ method: 'setSpeedLimit', args: [{ deviceid: 'CHIDI00001', devicetype: 26 }, 100, 30] });
    });
  });

  // ---------------------------------------------------------------- alarms

  describe('alarms', () => {
    it('lists only alarms of visible devices', async () => {
      const acme = (await inject('GET', '/alarms', 'acmeViewer')).json().alarms;
      expect(acme).toHaveLength(1);
      expect(acme[0]).toMatchObject({ deviceId: '868035043015161', alarmText: 'SOS', deviceName: expect.any(String) });
      expect((await inject('GET', '/alarms', 'otherOwner')).json().alarms.map((a: { deviceId: string }) => a.deviceId)).toEqual(['OTHER00001']);
      expect((await inject('GET', '/alarms?deviceId=OTHER00001', 'acmeViewer')).statusCode).toBe(404);
    });

    it('operators acknowledge alarms once; viewers cannot', async () => {
      const [alarm] = (await inject('GET', '/alarms?status=open', 'acmeOperator')).json().alarms;
      expect((await inject('POST', `/alarms/${alarm.id}/acknowledge`, 'acmeViewer', {})).statusCode).toBe(403);
      expect((await inject('POST', `/alarms/${alarm.id}/acknowledge`, 'otherOwner', {})).statusCode).toBe(404);
      const ok = await inject('POST', `/alarms/${alarm.id}/acknowledge`, 'acmeOperator', { note: 'Called the driver, false alarm' });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().alarm).toMatchObject({ acknowledgeNote: 'Called the driver, false alarm', acknowledgedAt: expect.any(String) });
      expect((await inject('POST', `/alarms/${alarm.id}/acknowledge`, 'acmeOperator', {})).statusCode).toBe(409);
      expect((await inject('GET', '/alarms?status=open', 'acmeOperator')).json().alarms).toEqual([]);
      expect((await inject('GET', '/alarms?status=acknowledged', 'acmeOperator')).json().alarms).toHaveLength(1);
    });
  });

  // ------------------------------------------------------------------ live

  describe('live', () => {
    it('returns a map snapshot and only changes when polled with `since`', async () => {
      const first = (await inject('GET', '/live', 'acmeViewer')).json();
      expect(first.devices).toHaveLength(2);
      const again = (await inject('GET', `/live?since=${encodeURIComponent(first.serverTime)}`, 'acmeViewer')).json();
      expect(again.devices).toEqual([]);
    });

    it('streams new positions from the push receiver to the right users only', async () => {
      await app.listen({ port: 0, host: '127.0.0.1' });
      const { port } = app.server.address() as AddressInfo;
      const base = `http://127.0.0.1:${port}`;

      const open = async (token: string) => {
        const res = await fetch(`${base}/api/stream?access_token=${token}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const next = async (event: string, timeoutMs = 3000) => {
          const deadline = Date.now() + timeoutMs;
          for (;;) {
            const idx = buffer.indexOf(`event: ${event}\n`);
            if (idx !== -1) {
              const end = buffer.indexOf('\n\n', idx);
              if (end !== -1) {
                const block = buffer.slice(idx, end);
                buffer = buffer.slice(end + 2);
                return JSON.parse(block.split('\ndata: ')[1]!);
              }
            }
            if (Date.now() > deadline) return undefined;
            const chunk = await Promise.race([
              reader.read(),
              new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), deadline - Date.now())),
            ]);
            if (chunk.value) buffer += decoder.decode(chunk.value, { stream: true });
            else if (chunk.done && Date.now() > deadline) return undefined;
          }
        };
        return { next, close: () => reader.cancel() };
      };

      const acme = await open(tokens.acmeViewer!);
      const other = await open(tokens.otherOwner!);
      expect(await acme.next('ready')).toMatchObject({ devices: 1 }); // the expired device is excluded
      expect(await other.next('ready')).toMatchObject({ devices: 1 });

      // A real signed push for Acme's vehicle.
      const body = JSON.stringify({ ...positionPush, updatetime: Date.now(), lat: 6.6, lon: 3.4 });
      const timestamp = String(Date.now());
      const nonce = randomUUID().replace(/-/g, '');
      const push = await fetch(`${base}/push/vendor`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-app-id': 'tracker',
          'x-timestamp': timestamp,
          'x-nonce': nonce,
          'x-sign': buildSign('tracker', PUSH_SECRET, timestamp, nonce, body),
        },
        body,
      });
      expect(push.status).toBe(200);

      expect(await acme.next('position')).toMatchObject({ deviceId: '868035043015161', lat: 6.6, lon: 3.4, speedKmh: 45.6 });
      expect(await other.next('position', 500)).toBeUndefined();

      // The stream token is not accepted on other endpoints.
      expect((await fetch(`${base}/api/me?access_token=${tokens.acmeViewer}`)).status).toBe(401);

      await acme.close();
      await other.close();
    });
  });
});
