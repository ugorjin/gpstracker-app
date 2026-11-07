import type pg from 'pg';
import type { Alarm, Position } from '../domain.js';
import type { PushStore, RawPush, SaveResult } from './types.js';

const json = (v: unknown) => (v === undefined ? null : JSON.stringify(v));
const n = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

export class PostgresPushStore implements PushStore {
  constructor(private readonly pool: pg.Pool) {}

  async logRawPush(raw: RawPush): Promise<void> {
    await this.pool.query(
      `INSERT INTO vendor_push_log (kind, device_id, signed, body, problem) VALUES ($1, $2, $3, $4, $5)`,
      [raw.kind, n(raw.deviceId), raw.signed, raw.body, n(raw.problem)],
    );
  }

  async savePosition(p: Position): Promise<SaveResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO positions (
           device_id, recorded_at, fix_at, received_at, lat, lon, speed_kmh, course, altitude_m, accuracy_m,
           odometer_m, source, satellites, signal_pct, voltage, battery_pct, moving, report_mode,
           status_code, status_text, alarm_code, alarm_text, io_status, park_duration_ms, fuel, sensors)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
         ON CONFLICT (device_id, recorded_at) DO NOTHING`,
        [
          p.deviceId, p.recordedAt, n(p.fixAt), n(p.receivedAt), p.lat, p.lon, n(p.speedKmh), n(p.course),
          n(p.altitudeM), n(p.accuracyM), n(p.odometerM), n(p.source), n(p.satellites), n(p.signalPct),
          n(p.voltage), n(p.batteryPct), n(p.moving), n(p.reportMode), n(p.statusCode), n(p.statusText),
          n(p.alarmCode), n(p.alarmText), n(p.ioStatus), n(p.parkDurationMs), json(p.fuel), json(p.sensors),
        ],
      );
      await client.query(
        `INSERT INTO device_state (
           device_id, device_name, recorded_at, lat, lon, speed_kmh, course, moving, voltage, battery_pct,
           odometer_m, source, status_text, alarm_text, fuel, sensors, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
         ON CONFLICT (device_id) DO UPDATE SET
           device_name = COALESCE(EXCLUDED.device_name, device_state.device_name),
           recorded_at = EXCLUDED.recorded_at, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
           speed_kmh = EXCLUDED.speed_kmh, course = EXCLUDED.course, moving = EXCLUDED.moving,
           voltage = EXCLUDED.voltage, battery_pct = EXCLUDED.battery_pct, odometer_m = EXCLUDED.odometer_m,
           source = EXCLUDED.source, status_text = EXCLUDED.status_text, alarm_text = EXCLUDED.alarm_text,
           fuel = EXCLUDED.fuel, sensors = EXCLUDED.sensors, updated_at = now()
         WHERE device_state.recorded_at < EXCLUDED.recorded_at`,
        [
          p.deviceId, n(p.deviceName), p.recordedAt, p.lat, p.lon, n(p.speedKmh), n(p.course), n(p.moving),
          n(p.voltage), n(p.batteryPct), n(p.odometerM), n(p.source), n(p.statusText), n(p.alarmText),
          json(p.fuel), json(p.sensors),
        ],
      );
      await client.query('COMMIT');
      return { inserted: (inserted.rowCount ?? 0) > 0 };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async saveAlarm(a: Alarm): Promise<SaveResult> {
    const res = await this.pool.query<{ inserted: boolean }>(
      `INSERT INTO alarms (device_id, category, alarm_code, alarm_text, started_at, last_at, count,
                           lat, lon, speed_kmh, course, odometer_m, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (device_id, alarm_code, started_at) DO UPDATE SET
         last_at = GREATEST(alarms.last_at, EXCLUDED.last_at),
         count = GREATEST(alarms.count, EXCLUDED.count),
         lat = COALESCE(EXCLUDED.lat, alarms.lat),
         lon = COALESCE(EXCLUDED.lon, alarms.lon),
         updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [
        a.deviceId, a.category, a.alarmCode, n(a.alarmText), a.startedAt, a.lastAt, a.count,
        n(a.lat), n(a.lon), n(a.speedKmh), n(a.course), n(a.odometerM), n(a.receivedAt),
      ],
    );
    return { inserted: res.rows[0]?.inserted ?? false };
  }
}
