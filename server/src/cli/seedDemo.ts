/**
 * Fills the database with demo customers, vehicles, 24 h of history and a few
 * alarms, so the dashboard can be tried without real trackers.
 *
 *   DATABASE_URL=... npm run seed-demo
 *
 * Safe to re-run: existing demo records are kept. Do NOT run on production.
 * Then start the server and `npm run simulate` to make the vehicles move live.
 */
import { hashPassword } from '../auth/password.js';
import { migrate } from '../db/migrate.js';
import { createPool } from '../db/pool.js';
import { createDevice, getDevice } from '../repo/devices.js';
import { createOrg, getPlatformOrg, listOrgs, subtreeIds } from '../repo/orgs.js';
import type { Db, Role } from '../repo/types.js';
import { createUser, findUserByLogin } from '../repo/users.js';
import { PostgresPushStore } from '../storage/postgres.js';
import { DEMO_VEHICLES, positionAt } from './demoRoutes.js';

const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-password';

async function ensureOrg(db: Db, parentId: number, name: string, type: 'reseller' | 'customer', customerKind?: 'business' | 'individual') {
  const existing = (await listOrgs(db, await subtreeIds(db, parentId))).find((o) => o.name === name);
  return existing ?? (await createOrg(db, { parentId, type, customerKind: customerKind ?? null, name }));
}

async function ensureUser(db: Db, orgId: number, name: string, login: { email?: string; phone?: string }, role: Role) {
  if (await findUserByLogin(db, login)) return;
  await createUser(db, { orgId, name, ...login, passwordHash: await hashPassword(PASSWORD), role });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = createPool(url, 4);
  try {
    await migrate(pool, () => {});
    const platform =
      (await getPlatformOrg(pool)) ?? (await createOrg(pool, { parentId: null, type: 'platform', name: 'Demo Tracking Co' }));

    await ensureUser(pool, platform.id, 'Demo Admin', { email: 'admin@demo.ng' }, 'owner');
    const lagos = await ensureOrg(pool, platform.id, 'Lagos Logistics Ltd', 'customer', 'business');
    const chidi = await ensureOrg(pool, platform.id, 'Chidi Okafor', 'customer', 'individual');
    const reseller = await ensureOrg(pool, platform.id, 'Abuja Partners', 'reseller');
    const cabs = await ensureOrg(pool, reseller.id, 'Capital Cabs', 'customer', 'business');

    await ensureUser(pool, lagos.id, 'Bola Adeyemi', { phone: '+2348030000101' }, 'owner');
    await ensureUser(pool, lagos.id, 'Control Room', { email: 'ops@lagoslogistics.ng' }, 'operator');
    await ensureUser(pool, chidi.id, 'Chidi Okafor', { phone: '+2348030000201' }, 'owner');
    await ensureUser(pool, reseller.id, 'Aisha Bello', { email: 'aisha@abujapartners.ng' }, 'admin');
    await ensureUser(pool, cabs.id, 'Capital Cabs Dispatch', { phone: '+2348030000301' }, 'owner');

    const orgFor = { lagos: lagos.id, chidi: chidi.id, cabs: cabs.id };
    const now = Date.now();
    const store = new PostgresPushStore(pool);

    for (const v of DEMO_VEHICLES) {
      if (!(await getDevice(pool, v.deviceId))) {
        await createDevice(pool, {
          deviceId: v.deviceId,
          orgId: orgFor[v.customer],
          name: v.name,
          kind: v.kind,
          plateNumber: v.plate,
          vendorDeviceType: 1,
          paidUntil: v.paidDays === null ? null : new Date(now + v.paidDays * 86_400_000),
        });
      }
      if (v.silent) continue;

      // 24 h of history: every 30 s while moving, every 5 min while stopped.
      const rows: unknown[][] = [];
      for (let t = now - 86_400_000; t <= now; ) {
        const p = positionAt(v.route, t);
        rows.push([v.deviceId, new Date(t), p.lat, p.lon, p.speedKmh, p.course, p.moving, p.odometerM, p.moving ? 'ACC ON' : 'ACC OFF']);
        t += p.moving ? 30_000 : 300_000;
      }
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const values = chunk.map((_, r) => `(${Array.from({ length: 9 }, (_, c) => `$${r * 9 + c + 1}`).join(',')}, 'gps')`).join(',');
        await pool.query(
          `INSERT INTO positions (device_id, recorded_at, lat, lon, speed_kmh, course, moving, odometer_m, status_text, source)
           VALUES ${values} ON CONFLICT DO NOTHING`,
          chunk.flat(),
        );
      }
      // Live state = the latest point.
      const p = positionAt(v.route, now);
      await store.savePosition({
        deviceId: v.deviceId,
        deviceName: v.name,
        lat: p.lat,
        lon: p.lon,
        recordedAt: new Date(now),
        speedKmh: p.speedKmh,
        course: p.course,
        moving: p.moving,
        odometerM: p.odometerM,
        source: 'gps',
        voltage: 12.4,
        batteryPct: 100,
        statusText: p.moving ? 'ACC ON' : 'ACC OFF',
      });
      console.log(`  ${v.name}: ${rows.length} history points`);
    }

    // A few alarms.
    const alarm = async (deviceId: string, code: number, text: string, minutesAgo: number) => {
      const v = DEMO_VEHICLES.find((x) => x.deviceId === deviceId)!;
      const t = now - minutesAgo * 60_000;
      const p = positionAt(v.route, t);
      await store.saveAlarm({ deviceId, category: 1, alarmCode: code, alarmText: text, startedAt: new Date(t), lastAt: new Date(t), count: 1, lat: p.lat, lon: p.lon, speedKmh: p.speedKmh });
    };
    await alarm('860000000000101', 2, 'Overspeed', 95);
    await alarm('860000000000103', 4, 'Power cut', 40);
    await alarm('860000000000201', 1, 'SOS', 300);
    await alarm('860000000000301', 2, 'Overspeed', 15);

    console.log(`
Demo data ready. Password for every demo login: ${PASSWORD}
  Platform admin:          admin@demo.ng
  Business fleet owner:    0803 000 0101   (Lagos Logistics, 6 vehicles)
  Fleet control room:      ops@lagoslogistics.ng  (operator)
  Individual customer:     0803 000 0201   (Chidi)
  Reseller admin:          aisha@abujapartners.ng
  Reseller's customer:     0803 000 0301   (Capital Cabs)
Run "npm run simulate" to make the vehicles move.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
