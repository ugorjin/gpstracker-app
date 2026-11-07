import { describe, expect, it } from 'vitest';
import { Principal } from '../src/api/access.js';
import { HttpError } from '../src/api/errors.js';
import { parseLogin } from '../src/api/routes/auth.js';
import { redactUrl } from '../src/app.js';
import { hashPassword, verifyPassword } from '../src/auth/password.js';
import { normalizeEmail, normalizePhone } from '../src/auth/phone.js';
import { LoginThrottle } from '../src/auth/tokens.js';
import type { Device, Organization, Role, User } from '../src/repo/types.js';

describe('passwords', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('wrong horse', hash)).toBe(false);
    expect(await hashPassword('correct horse')).not.toBe(hash); // salted
  });

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword('x', 'md5$abc')).toBe(false);
  });
});

describe('normalizePhone', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['0803 123 4567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['002348031234567', '+2348031234567'],
    ['8031234567', '+2348031234567'],
    ['(0803) 123-4567', '+2348031234567'],
  ])('Nigeria: %s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('uses the country for national numbers', () => {
    expect(normalizePhone('0241234567', 'GH')).toBe('+233241234567');
    expect(normalizePhone('0712345678', 'KE')).toBe('+254712345678');
    expect(normalizePhone('+254712345678', 'NG')).toBe('+254712345678');
  });

  it.each(['', 'abc', '0803-ABC', '123', '+0123456789'])('rejects %j', (input) => {
    expect(normalizePhone(input)).toBeUndefined();
  });
});

describe('normalizeEmail / parseLogin', () => {
  it('lower-cases emails and rejects junk', () => {
    expect(normalizeEmail('  Ada@Example.NG ')).toBe('ada@example.ng');
    expect(normalizeEmail('not-an-email')).toBeUndefined();
  });

  it('decides between email and phone', () => {
    expect(parseLogin('Ada@Example.ng', 'NG')).toEqual({ email: 'ada@example.ng' });
    expect(parseLogin('08031234567', 'NG')).toEqual({ phone: '+2348031234567' });
    expect(parseLogin('nonsense', 'NG')).toBeUndefined();
  });
});

describe('LoginThrottle', () => {
  it('blocks after too many failures and unblocks later', () => {
    let now = 0;
    const t = new LoginThrottle(3, 1000, () => now);
    t.fail('k');
    t.fail('k');
    expect(t.blockedFor('k')).toBe(0);
    t.fail('k');
    expect(t.blockedFor('k')).toBe(1000);
    now = 1001;
    expect(t.blockedFor('k')).toBe(0);
  });

  it('clears on success', () => {
    const t = new LoginThrottle(1, 1000);
    t.fail('k');
    expect(t.blockedFor('k')).toBeGreaterThan(0);
    t.succeed('k');
    expect(t.blockedFor('k')).toBe(0);
  });
});

describe('redactUrl', () => {
  it('hides the stream token', () => {
    expect(redactUrl('/api/stream?access_token=abc123&x=1')).toBe('/api/stream?access_token=[redacted]&x=1');
  });
});

// ------------------------------------------------------------- Principal

const org = (id: number, type: Organization['type'], parentId: number | null = null): Organization => ({
  id,
  parentId,
  type,
  customerKind: type === 'customer' ? 'business' : null,
  name: `org${id}`,
  countryCode: 'NG',
  utcOffsetMinutes: 60,
  phone: null,
  email: null,
  active: true,
  createdAt: new Date(),
});

const user = (orgId: number, role: Role): User => ({
  id: 1,
  orgId,
  name: 'u',
  email: 'u@example.com',
  phone: null,
  role,
  active: true,
  lastLoginAt: null,
  createdAt: new Date(),
});

const device = (orgId: number, paidUntil: Date | null = null): Device => ({
  deviceId: 'd1',
  orgId,
  name: 'Car',
  kind: 'car',
  plateNumber: null,
  vendorDeviceType: 1,
  simNumber: null,
  notes: null,
  active: true,
  paidUntil,
  installedAt: null,
  createdAt: new Date(),
});

const code = (fn: () => void) => {
  try {
    fn();
    return 'ok';
  } catch (e) {
    return e instanceof HttpError ? e.statusCode : 'other';
  }
};

describe('Principal', () => {
  const reseller = (role: Role) => new Principal(user(2, role), org(2, 'reseller', 1), [2, 3, 4]);
  const customer = (role: Role) => new Principal(user(3, role), org(3, 'customer', 2), [3]);

  it('hides organisations outside the tree with 404', () => {
    expect(code(() => customer('owner').assertOrgVisible(4))).toBe(404);
    expect(code(() => reseller('viewer').assertOrgVisible(4))).toBe('ok');
  });

  it('only lets staff admins manage customer accounts and inventory', () => {
    expect(code(() => reseller('admin').assertCanManageChildOrgs())).toBe('ok');
    expect(code(() => reseller('operator').assertCanManageChildOrgs())).toBe(403);
    expect(code(() => customer('owner').assertCanManageChildOrgs())).toBe(403);
    expect(code(() => customer('owner').assertCanManageDeviceInventory())).toBe(403);
  });

  it('limits which roles can be given', () => {
    expect(code(() => customer('admin').assertCanManageUsers(3, 'operator'))).toBe('ok');
    expect(code(() => customer('admin').assertCanManageUsers(3, 'owner'))).toBe(403);
    expect(code(() => customer('owner').assertCanManageUsers(3, 'owner'))).toBe('ok');
    expect(code(() => customer('operator').assertCanManageUsers(3, 'viewer'))).toBe(403);
    // Staff admin can create the first owner of a customer.
    expect(code(() => reseller('admin').assertCanManageUsers(3, 'owner'))).toBe('ok');
  });

  it('blocks tracking for expired subscriptions, except for staff', () => {
    const expired = device(3, new Date(Date.now() - 1000));
    expect(code(() => customer('owner').assertTrackingAllowed(expired))).toBe(402);
    expect(code(() => reseller('viewer').assertTrackingAllowed(expired))).toBe('ok');
    expect(code(() => customer('owner').assertTrackingAllowed(device(3, null)))).toBe('ok');
  });

  it('only owners and admins send commands', () => {
    expect(code(() => customer('admin').assertCanCommand(device(3)))).toBe('ok');
    expect(code(() => customer('operator').assertCanCommand(device(3)))).toBe(403);
    expect(code(() => customer('admin').assertCanCommand({ ...device(3), active: false }))).toBe(403);
  });

  it('viewers cannot acknowledge alarms', () => {
    expect(code(() => customer('viewer').assertCanAcknowledgeAlarms())).toBe(403);
    expect(code(() => customer('operator').assertCanAcknowledgeAlarms())).toBe('ok');
  });
});
