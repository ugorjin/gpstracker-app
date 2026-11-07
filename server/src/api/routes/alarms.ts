import type { Principal } from '../access.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDevice } from '../../repo/devices.js';
import { acknowledgeAlarm, getAlarm, listAlarms } from '../../repo/tracking.js';
import { idParam, parse, principalOf, type ApiContext } from '../context.js';
import { conflict, notFound } from '../errors.js';

const listQuery = z.object({
  deviceId: z.string().max(64).optional(),
  status: z.enum(['open', 'acknowledged', 'all']).default('all'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  /** Pagination: pass the smallest id of the previous page. */
  beforeId: z.coerce.number().int().positive().optional(),
});

const ackBody = z.object({ note: z.string().trim().max(500).optional() });

export const alarmRoutes: FastifyPluginAsync<{ ctx: ApiContext }> = async (app, { ctx }) => {
  app.get('/alarms', async (req) => {
    const p: Principal = principalOf(req);
    const q = parse(listQuery, req.query);
    if (q.deviceId) p.assertDeviceVisible(await getDevice(ctx.pool, q.deviceId));
    const alarms = await listAlarms(ctx.pool, {
      orgIds: p.visibleOrgIds,
      deviceId: q.deviceId,
      open: q.status === 'all' ? undefined : q.status === 'open',
      from: q.from,
      to: q.to,
      limit: q.limit,
      beforeId: q.beforeId,
    });
    return { alarms, nextBeforeId: alarms.length === q.limit ? alarms[alarms.length - 1]!.id : null };
  });

  app.post('/alarms/:id/acknowledge', async (req) => {
    const p: Principal = principalOf(req);
    p.assertCanAcknowledgeAlarms();
    const { id } = parse(idParam, req.params);
    const { note } = parse(ackBody, req.body);
    const alarm = await getAlarm(ctx.pool, id);
    if (!alarm) throw notFound('Alarm');
    p.assertDeviceVisible(await getDevice(ctx.pool, alarm.deviceId));
    const updated = await acknowledgeAlarm(ctx.pool, id, p.user.id, note);
    if (!updated) throw conflict('This alarm was already acknowledged');
    return { alarm: updated };
  });
};
