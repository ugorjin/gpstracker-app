import pg from 'pg';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { PushEvents } from './push/routes.js';
import { PostgresPushStore } from './storage/postgres.js';
import { VendorClient } from './vendor/client.js';
import { RateLimiter } from './vendor/rateLimiter.js';

async function main() {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
  await migrate(pool);

  const limiter = new RateLimiter({ perMinute: config.VENDOR_RATE_PER_MINUTE, dailyBudget: config.VENDOR_DAILY_BUDGET });
  // Not used by any route yet; the dashboard API and job runner will use it.
  const vendor = new VendorClient({
    baseUrl: config.VENDOR_API_BASE_URL,
    path: config.VENDOR_API_PATH,
    username: config.VENDOR_USERNAME,
    password: config.VENDOR_PASSWORD,
    timezone: config.VENDOR_TIMEZONE,
    commandPassword: config.VENDOR_COMMAND_PASSWORD,
    limiter,
  });

  const events = new PushEvents();
  const app = await buildApp({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    events,
    limiter,
    checkDb: async () => (await pool.query('SELECT 1')).rowCount === 1,
    push: {
      store: new PostgresPushStore(pool),
      appId: config.PUSH_APP_ID,
      appSecret: config.PUSH_APP_SECRET,
      allowUnsigned: config.PUSH_ALLOW_UNSIGNED,
      toleranceMs: config.PUSH_TIMESTAMP_TOLERANCE_MS,
      storeRaw: config.PUSH_STORE_RAW,
    },
  });

  events.on('alarm', (a) => app.log.info({ deviceId: a.deviceId, alarm: a.alarmText ?? a.alarmCode }, 'new alarm'));

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    limiter.close();
    await vendor.logout().catch(() => undefined);
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
