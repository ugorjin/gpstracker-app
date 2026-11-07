import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { normalizePush } from '../src/push/normalize.js';
import { PostgresPushStore } from '../src/storage/postgres.js';
import { alarmPush, positionPush } from './fixtures.js';

/**
 * Runs against a real database when TEST_DATABASE_URL is set, e.g.
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/gpstracker_test npm test
 * The schema is dropped and recreated, so never point this at real data.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PostgresPushStore', () => {
  let pool: pg.Pool;
  let store: PostgresPushStore;

  beforeAll(async () => {
    pool = createPool(url!, 2);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    expect(await migrate(pool, () => {})).toContain('001_push_receiver.sql');
    expect(await migrate(pool, () => {})).toEqual([]); // idempotent
    store = new PostgresPushStore(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE positions, device_state, alarms, vendor_push_log');
  });

  const position = () => normalizePush(positionPush).position!;

  it('stores a position, its live state, and ignores duplicates', async () => {
    expect(await store.savePosition(position())).toEqual({ inserted: true });
    expect(await store.savePosition(position())).toEqual({ inserted: false });

    const { rows } = await pool.query('SELECT * FROM positions');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ device_id: '868035043015161', lat: 6.5244, lon: 3.3792, speed_kmh: 45.6, moving: true });
    expect(rows[0].fuel).toEqual({ totalRunningL: 1520, totalNotRunningL: 30, tanksL: [45.5, null, null, null] });
    expect(new Date(rows[0].recorded_at).getTime()).toBe(1789347000000);

    const state = await pool.query('SELECT * FROM device_state');
    expect(state.rows[0]).toMatchObject({ device_name: 'Toyota Hilux LAG-123-XY', speed_kmh: 45.6 });
  });

  it('only moves live state forward in time (late/out-of-order pushes go to history only)', async () => {
    const newer = { ...position(), recordedAt: new Date(1789347100000), lat: 7 };
    const older = { ...position(), recordedAt: new Date(1789346000000), lat: 5 };
    await store.savePosition(newer);
    await store.savePosition(older);
    const state = await pool.query('SELECT lat, recorded_at FROM device_state');
    expect(state.rows[0].lat).toBe(7);
    expect((await pool.query('SELECT count(*)::int AS n FROM positions')).rows[0].n).toBe(2);
  });

  it('keeps one row per ongoing alarm and updates its last time and count', async () => {
    const alarm = normalizePush(alarmPush).alarms[0]!;
    expect(await store.saveAlarm(alarm)).toEqual({ inserted: true });
    const repeat = { ...alarm, lastAt: new Date(alarm.startedAt.getTime() + 60_000), count: 3 };
    expect(await store.saveAlarm(repeat)).toEqual({ inserted: false });
    const { rows } = await pool.query('SELECT * FROM alarms');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ alarm_text: 'SOS', count: 3 });
    expect(new Date(rows[0].last_at).getTime()).toBe(repeat.lastAt.getTime());
  });

  it('logs raw pushes', async () => {
    await store.logRawPush({ kind: 'position', deviceId: 'd1', signed: true, body: '{"a":1}' });
    await store.logRawPush({ kind: 'unknown', signed: false, body: 'x', problem: 'invalid JSON' });
    const { rows } = await pool.query('SELECT kind, device_id, signed, body, problem FROM vendor_push_log ORDER BY id');
    expect(rows).toEqual([
      { kind: 'position', device_id: 'd1', signed: true, body: '{"a":1}', problem: null },
      { kind: 'unknown', device_id: null, signed: false, body: 'x', problem: 'invalid JSON' },
    ]);
  });
});
