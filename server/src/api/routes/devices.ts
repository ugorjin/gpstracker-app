import type { Principal } from '../access.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createDevice, getDeviceWithState, listDevices, listUnregistered, updateDevice } from '../../repo/devices.js';
import { getOrg } from '../../repo/orgs.js';
import { history, listCommands, logCommand } from '../../repo/tracking.js';
import { DEVICE_KINDS } from '../../repo/types.js';
import { VendorApiError, VendorBudgetExceededError, VendorTransportError } from '../../vendor/errors.js';
import type { CommandOutcome } from '../../vendor/types.js';
import { deviceIdParam, isUniqueViolation, parse, principalOf, type ApiContext } from '../context.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../errors.js';
import { deviceDto } from '../dto.js';

const MAX_HISTORY_DAYS = 7;
const MAX_HISTORY_POINTS = 20_000;

const kind = z.enum(DEVICE_KINDS);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z.coerce.date();

const listQuery = z.object({
  orgId: z.coerce.number().int().positive().optional(),
  q: z.string().max(100).optional(),
  includeInactive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

const createBody = z.object({
  deviceId: z.string().trim().regex(/^[0-9A-Za-z]{6,32}$/, 'Device id (IMEI) must be 6–32 letters/digits'),
  orgId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  kind: kind.optional(),
  plateNumber: nullableText(30),
  vendorDeviceType: z.number().int().nonnegative(),
  simNumber: nullableText(30),
  notes: nullableText(1000),
  paidUntil: isoDate.nullable().optional(),
  installedAt: isoDate.nullable().optional(),
  /** Also add the device to the vendor platform (`adddevice`). */
  registerWithVendor: z.boolean().optional(),
});

/** Fields a customer's own admin may change. */
const customerPatch = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  kind: kind.optional(),
  plateNumber: nullableText(30),
  notes: nullableText(1000),
});

/** Fields only platform / reseller admins may change. */
const staffPatch = customerPatch.extend({
  orgId: z.number().int().positive().optional(),
  vendorDeviceType: z.number().int().nonnegative().optional(),
  simNumber: nullableText(30),
  active: z.boolean().optional(),
  paidUntil: isoDate.nullable().optional(),
  installedAt: isoDate.nullable().optional(),
});

const historyQuery = z.object({ from: isoDate, to: isoDate });

const commandBody = z.discriminatedUnion('command', [
  z.object({ command: z.literal('engine_cut'), confirm: z.literal(true) }),
  z.object({ command: z.literal('engine_restore'), confirm: z.literal(true) }),
  z.object({
    command: z.literal('speed_limit'),
    confirm: z.literal(true),
    speedKmh: z.number().int().min(20).max(250),
    durationSeconds: z.number().int().min(1).max(600),
  }),
]);

function vendorFailure(err: unknown): HttpError {
  if (err instanceof VendorBudgetExceededError) {
    return new HttpError(503, 'vendor_busy', 'The tracking platform limit is reached right now. Please try again later.');
  }
  if (err instanceof VendorApiError) {
    return new HttpError(502, 'vendor_error', `The tracking platform refused the request (status ${err.status}).`);
  }
  if (err instanceof VendorTransportError) {
    return new HttpError(502, 'vendor_unreachable', 'Could not reach the tracking platform. Please try again.');
  }
  return new HttpError(500, 'internal_error', 'Something went wrong');
}

export const deviceRoutes: FastifyPluginAsync<{ ctx: ApiContext }> = async (app, { ctx }) => {
  app.get('/devices', async (req) => {
    const p: Principal = principalOf(req);
    const q = parse(listQuery, req.query);
    if (q.orgId !== undefined) p.assertOrgVisible(q.orgId);
    const rows = await listDevices(ctx.pool, { orgIds: p.visibleOrgIds, orgId: q.orgId, q: q.q, includeInactive: q.includeInactive });
    return { devices: rows.map((r) => deviceDto(p, r.device, r.state, ctx.offlineAfterMinutes)) };
  });

  /** Trackers sending data that aren't assigned to a customer yet (platform staff only). */
  app.get('/devices/unregistered', async (req) => {
    const p: Principal = principalOf(req);
    if (p.org.type !== 'platform' || !p.hasRole('admin')) throw forbidden();
    return { devices: await listUnregistered(ctx.pool) };
  });

  app.post('/devices', async (req, reply) => {
    const p: Principal = principalOf(req);
    p.assertCanManageDeviceInventory();
    const body = parse(createBody, req.body);
    p.assertOrgVisible(body.orgId);
    const org = await getOrg(ctx.pool, body.orgId);
    if (!org) throw notFound('Organization');

    if (body.registerWithVendor) {
      try {
        const res = await ctx.vendor.addDevice({
          deviceid: body.deviceId,
          devicename: body.name,
          devicetype: body.vendorDeviceType,
          timezone: Math.round(org.utcOffsetMinutes / 60),
        });
        req.log.info({ deviceId: body.deviceId, status: res.status }, 'device added on vendor platform');
      } catch (err) {
        // Status 1 = the device already exists on the vendor platform: fine.
        if (!(err instanceof VendorApiError && err.status === 1)) throw vendorFailure(err);
      }
    }

    const { registerWithVendor: _skip, ...input } = body;
    const device = await createDevice(ctx.pool, input).catch((err) => {
      if (isUniqueViolation(err)) throw conflict('This device is already registered');
      throw err;
    });
    const full = await getDeviceWithState(ctx.pool, device.deviceId);
    return reply.code(201).send({ device: deviceDto(p, full!.device, full!.state, ctx.offlineAfterMinutes) });
  });

  app.get('/devices/:id', async (req) => {
    const p: Principal = principalOf(req);
    const { id } = parse(deviceIdParam, req.params);
    const row = await getDeviceWithState(ctx.pool, id);
    p.assertDeviceVisible(row?.device);
    return { device: deviceDto(p, row!.device, row!.state, ctx.offlineAfterMinutes) };
  });

  app.patch('/devices/:id', async (req) => {
    const p: Principal = principalOf(req);
    const { id } = parse(deviceIdParam, req.params);
    const existing = await getDeviceWithState(ctx.pool, id);
    p.assertDeviceVisible(existing?.device);
    p.assertCanEditDevice(existing!.device);

    // Customers get a strict schema: sending staff-only fields is an error, not silently ignored.
    const body = p.isStaff ? parse(staffPatch, req.body) : parse(customerPatch.strict(), req.body);
    const newOrgId = (body as { orgId?: number }).orgId;
    if (newOrgId !== undefined) p.assertOrgVisible(newOrgId);
    await updateDevice(ctx.pool, id, body);
    const row = await getDeviceWithState(ctx.pool, id);
    return { device: deviceDto(p, row!.device, row!.state, ctx.offlineAfterMinutes) };
  });

  /** Location history from our own database (fed by the vendor push). */
  app.get('/devices/:id/history', async (req) => {
    const p: Principal = principalOf(req);
    const { id } = parse(deviceIdParam, req.params);
    const { from, to } = parse(historyQuery, req.query);
    if (to <= from) throw badRequest('"to" must be after "from"');
    if (to.getTime() - from.getTime() > MAX_HISTORY_DAYS * 86_400_000) {
      throw badRequest(`At most ${MAX_HISTORY_DAYS} days of history per request`);
    }
    const row = await getDeviceWithState(ctx.pool, id);
    p.assertDeviceVisible(row?.device);
    p.assertTrackingAllowed(row!.device);
    const points = await history(ctx.pool, id, from, to, MAX_HISTORY_POINTS + 1);
    const truncated = points.length > MAX_HISTORY_POINTS;
    return { deviceId: id, from, to, truncated, points: truncated ? points.slice(0, MAX_HISTORY_POINTS) : points };
  });

  app.get('/devices/:id/commands', async (req) => {
    const p: Principal = principalOf(req);
    const { id } = parse(deviceIdParam, req.params);
    const row = await getDeviceWithState(ctx.pool, id);
    p.assertDeviceVisible(row?.device);
    return { commands: await listCommands(ctx.pool, id, 100) };
  });

  /**
   * Send a command. Requires `"confirm": true` so a client can't send one by
   * accident. Every attempt is written to the command log, success or not.
   */
  app.post('/devices/:id/commands', async (req, reply) => {
    const p: Principal = principalOf(req);
    const { id } = parse(deviceIdParam, req.params);
    const row = await getDeviceWithState(ctx.pool, id);
    p.assertDeviceVisible(row?.device);
    const device = row!.device;
    p.assertCanCommand(device);
    const body = parse(commandBody, req.body);

    const ref = { deviceid: device.deviceId, devicetype: device.vendorDeviceType };
    const params = body.command === 'speed_limit' ? { speedKmh: body.speedKmh, durationSeconds: body.durationSeconds } : undefined;
    let outcome: CommandOutcome;
    try {
      outcome =
        body.command === 'engine_cut'
          ? await ctx.vendor.cutEngine(ref)
          : body.command === 'engine_restore'
            ? await ctx.vendor.restoreEngine(ref)
            : await ctx.vendor.setSpeedLimit(ref, body.speedKmh, body.durationSeconds);
    } catch (err) {
      const httpErr = vendorFailure(err);
      await logCommand(ctx.pool, {
        deviceId: id,
        userId: p.user.id,
        command: body.command,
        params,
        accepted: false,
        error: (err as Error).message.slice(0, 500),
      });
      req.log.warn({ err, deviceId: id, command: body.command }, 'command failed');
      throw httpErr;
    }

    const commandId = await logCommand(ctx.pool, {
      deviceId: id,
      userId: p.user.id,
      command: body.command,
      params,
      status: outcome.status,
      statusText: outcome.statusText,
      accepted: outcome.accepted,
    });
    req.log.info({ deviceId: id, command: body.command, userId: p.user.id, status: outcome.status }, 'command sent');
    return reply.code(outcome.accepted ? 200 : 409).send({
      commandId,
      accepted: outcome.accepted,
      status: outcome.status,
      statusText: outcome.statusText,
    });
  });
};
