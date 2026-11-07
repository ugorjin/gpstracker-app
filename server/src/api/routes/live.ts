import type { Principal } from '../access.js';
import type { OutgoingHttpHeaders } from 'node:http';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Alarm, Position } from '../../domain.js';
import { listDevices } from '../../repo/devices.js';
import { parse, principalOf, type ApiContext } from '../context.js';
import { deviceDto } from '../dto.js';

const liveQuery = z.object({
  /** Only devices updated after this time (pass `serverTime` from the previous response). */
  since: z.coerce.date().optional(),
});

const HEARTBEAT_MS = 25_000;
const REFRESH_DEVICES_MS = 60_000;

export const liveRoutes: FastifyPluginAsync<{ ctx: ApiContext }> = async (app, { ctx }) => {
  /** Map snapshot of every visible device. Poll with `since` for changes only. */
  app.get('/live', async (req) => {
    const p: Principal = principalOf(req);
    const { since } = parse(liveQuery, req.query);
    const serverTime = new Date();
    const rows = await listDevices(ctx.pool, { orgIds: p.visibleOrgIds, changedSince: since });
    return { serverTime, devices: rows.map((r) => deviceDto(p, r.device, r.state, ctx.offlineAfterMinutes)) };
  });

  /**
   * Server-Sent Events stream of new positions and alarms for visible devices.
   *   const es = new EventSource('/api/stream?access_token=' + token);
   *   es.addEventListener('position', (e) => JSON.parse(e.data));
   *   es.addEventListener('alarm', (e) => JSON.parse(e.data));
   */
  app.get('/stream', async (req, reply) => {
    const p: Principal = principalOf(req);

    // Devices this user may follow live (active, and subscription paid unless staff).
    let allowed = new Set<string>();
    const refresh = async () => {
      const rows = await listDevices(ctx.pool, { orgIds: p.visibleOrgIds });
      allowed = new Set(rows.filter((r) => p.isStaff || p.isSubscriptionActive(r.device)).map((r) => r.device.deviceId));
    };
    await refresh();

    // Keep headers already set by hooks (e.g. CORS) before taking over the response.
    const preset = Object.fromEntries(
      Object.entries(reply.getHeaders()).filter(([, v]) => v !== undefined),
    ) as OutgoingHttpHeaders;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      ...preset,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send('ready', { serverTime: new Date(), devices: allowed.size });

    const onPosition = (pos: Position) => {
      if (!allowed.has(pos.deviceId)) return;
      send('position', {
        deviceId: pos.deviceId,
        recordedAt: pos.recordedAt,
        lat: pos.lat,
        lon: pos.lon,
        speedKmh: pos.speedKmh ?? null,
        course: pos.course ?? null,
        moving: pos.moving ?? null,
        statusText: pos.statusText ?? null,
        alarmText: pos.alarmText ?? null,
      });
    };
    const onAlarm = (a: Alarm) => {
      if (!allowed.has(a.deviceId)) return;
      send('alarm', {
        deviceId: a.deviceId,
        alarmCode: a.alarmCode,
        alarmText: a.alarmText ?? null,
        startedAt: a.startedAt,
        lat: a.lat ?? null,
        lon: a.lon ?? null,
      });
    };
    ctx.events.on('position', onPosition);
    ctx.events.on('alarm', onAlarm);

    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const refresher = setInterval(() => {
      refresh().catch((err) => req.log.warn({ err }, 'stream device refresh failed'));
    }, REFRESH_DEVICES_MS);

    const close = () => {
      clearInterval(heartbeat);
      clearInterval(refresher);
      ctx.events.off('position', onPosition);
      ctx.events.off('alarm', onAlarm);
    };
    req.raw.on('close', close);
    res.on('error', close);
  });
};
