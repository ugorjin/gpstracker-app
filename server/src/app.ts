import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { PushEvents, pushReceiver, type PushReceiverOptions } from './push/routes.js';
import type { RateLimiter } from './vendor/rateLimiter.js';

export interface AppDeps {
  push: Omit<PushReceiverOptions, 'events'>;
  events?: PushEvents;
  limiter?: RateLimiter;
  /** Returns false if the database is unreachable. */
  checkDb?: () => Promise<boolean>;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? false,
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

  return app;
}
