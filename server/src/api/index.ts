import type { FastifyPluginAsync } from 'fastify';
import { hashToken, LoginThrottle } from '../auth/tokens.js';
import { subtreeIds } from '../repo/orgs.js';
import { findSession } from '../repo/sessions.js';
import { Principal } from './access.js';
import type { ApiContext, ApiOptions } from './context.js';
import { HttpError, unauthorized } from './errors.js';
import { alarmRoutes } from './routes/alarms.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { liveRoutes } from './routes/live.js';
import { orgRoutes } from './routes/orgs.js';

/** Routes that don't need a logged-in user. */
const PUBLIC_ROUTES = new Set(['/api/auth/login']);

function bearerToken(header: string | undefined): string | undefined {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
}

/**
 * Dashboard / app API, mounted at /api. Clients log in with
 * POST /api/auth/login and send `Authorization: Bearer <token>`.
 * The live stream (EventSource can't set headers) also accepts `?access_token=`.
 */
export const dashboardApi: FastifyPluginAsync<ApiOptions> = async (app, opts) => {
  const ctx: ApiContext = {
    pool: opts.pool,
    vendor: opts.vendor,
    events: opts.events,
    defaultCountry: opts.defaultCountry ?? 'NG',
    sessionTtlDays: opts.sessionTtlDays ?? 30,
    offlineAfterMinutes: opts.offlineAfterMinutes ?? 30,
    loginThrottle: opts.loginThrottle ?? new LoginThrottle(5, 15 * 60_000),
    ipThrottle: opts.ipThrottle ?? new LoginThrottle(30, 15 * 60_000),
  };

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
    }
    const fastifyErr = err as { statusCode?: number; validation?: unknown; message?: string };
    if (fastifyErr.validation || (fastifyErr.statusCode && fastifyErr.statusCode < 500)) {
      return reply.code(fastifyErr.statusCode ?? 400).send({ error: 'bad_request', message: fastifyErr.message });
    }
    req.log.error({ err }, 'unhandled API error');
    return reply.code(500).send({ error: 'internal_error', message: 'Something went wrong' });
  });

  app.addHook('onRequest', async (req) => {
    const path = req.routeOptions.url ?? req.url.split('?')[0]!;
    if (PUBLIC_ROUTES.has(path)) return;
    const query = req.query as Record<string, unknown> | undefined;
    const token =
      bearerToken(req.headers.authorization) ?? (path === '/api/stream' && typeof query?.access_token === 'string' ? query.access_token : undefined);
    if (!token) throw unauthorized();
    const tokenHash = hashToken(token);
    const session = await findSession(ctx.pool, tokenHash);
    if (!session) throw unauthorized('Session expired, please log in again');
    req.principal = new Principal(session.user, session.org, await subtreeIds(ctx.pool, session.org.id));
    req.sessionTokenHash = tokenHash;
  });

  await app.register(authRoutes, { ctx });
  await app.register(orgRoutes, { ctx });
  await app.register(deviceRoutes, { ctx });
  await app.register(alarmRoutes, { ctx });
  await app.register(liveRoutes, { ctx });
};
