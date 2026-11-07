import cors from '@fastify/cors';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { dashboardApi } from './api/index.js';
import type { ApiOptions } from './api/context.js';
import { PushEvents, pushReceiver, type PushReceiverOptions } from './push/routes.js';
import type { RateLimiter } from './vendor/rateLimiter.js';

export interface AppDeps {
  push: Omit<PushReceiverOptions, 'events'>;
  /** Dashboard/app API at /api. Left out = push receiver only. */
  api?: Omit<ApiOptions, 'events'>;
  /** Browser origins allowed to call /api, e.g. ["https://app.example.com"]. */
  corsOrigins?: string[];
  events?: PushEvents;
  limiter?: RateLimiter;
  /** Returns false if the database is unreachable. */
  checkDb?: () => Promise<boolean>;
  logger?: FastifyServerOptions['logger'];
}

/** Hides session tokens passed in the URL (live stream) from request logs. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]access_token=)[^&]*/g, '$1[redacted]');
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const logger =
    deps.logger && typeof deps.logger === 'object'
      ? {
          ...deps.logger,
          serializers: {
            req: (req: { method: string; url: string; ip?: string }) => ({ method: req.method, url: redactUrl(req.url), ip: req.ip }),
          },
        }
      : (deps.logger ?? false);

  const app = Fastify({
    logger,
    // Behind a reverse proxy (nginx/Caddy) in production.
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });
  const events = deps.events ?? new PushEvents();

  app.get('/health', async (_req, reply) => {
    const db = deps.checkDb ? await deps.checkDb().catch(() => false) : true;
    return reply.code(db ? 200 : 503).send({
      status: db ? 'ok' : 'degraded',
      db,
      vendorApi: deps.limiter?.stats(),
    });
  });

  // Encapsulated: its raw-body parser only applies to the push route.
  await app.register(pushReceiver, { ...deps.push, events });

  if (deps.api) {
    const api = deps.api;
    await app.register(
      async (scope) => {
        if (deps.corsOrigins?.length) {
          await scope.register(cors, {
            origin: deps.corsOrigins,
            methods: ['GET', 'POST', 'PATCH', 'DELETE'],
            allowedHeaders: ['Authorization', 'Content-Type'],
            maxAge: 600,
          });
        }
        await scope.register(dashboardApi, { ...api, events });
      },
      { prefix: '/api' },
    );
  }

  return app;
}
