import { camel, type AlarmRow, type CommandLogRow, type Db, type HistoryPoint } from './types.js';

export async function history(db: Db, deviceId: string, from: Date, to: Date, limit: number): Promise<HistoryPoint[]> {
  const { rows } = await db.query(
    `SELECT recorded_at, lat, lon, speed_kmh, course, moving, status_text, alarm_text
       FROM positions WHERE device_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
      ORDER BY recorded_at LIMIT $4`,
    [deviceId, from, to, limit],
  );
  return rows.map((r) => camel<HistoryPoint>(r));
}

const ALARM_COLS = `a.id, a.device_id, a.category, a.alarm_code, a.alarm_text, a.started_at, a.last_at, a.count,
                    a.lat, a.lon, a.speed_kmh, a.acknowledged_at, a.acknowledged_by_user_id, a.acknowledge_note`;

export interface AlarmFilter {
  orgIds: number[];
  deviceId?: string;
  open?: boolean;
  from?: Date;
  to?: Date;
  limit: number;
  /** Pagination: only alarms with id lower than this. */
  beforeId?: number;
}

/** Alarms of devices owned by the given organisations. */
export async function listAlarms(db: Db, f: AlarmFilter): Promise<(AlarmRow & { deviceName: string })[]> {
  const params: unknown[] = [f.orgIds];
  const where = ['d.org_id = ANY($1::bigint[])'];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (f.deviceId) add('a.device_id = ?', f.deviceId);
  if (f.open === true) where.push('a.acknowledged_at IS NULL');
  if (f.open === false) where.push('a.acknowledged_at IS NOT NULL');
  if (f.from) add('a.started_at >= ?', f.from);
  if (f.to) add('a.started_at <= ?', f.to);
  if (f.beforeId) add('a.id < ?', f.beforeId);
  params.push(f.limit);
  const { rows } = await db.query(
    `SELECT ${ALARM_COLS}, d.name AS device_name FROM alarms a JOIN devices d ON d.device_id = a.device_id
      WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => camel(r));
}

export async function getAlarm(db: Db, id: number): Promise<AlarmRow | undefined> {
  const { rows } = await db.query(`SELECT ${ALARM_COLS} FROM alarms a WHERE a.id = $1`, [id]);
  return rows[0] ? camel<AlarmRow>(rows[0]) : undefined;
}

export async function acknowledgeAlarm(db: Db, id: number, userId: number, note?: string): Promise<AlarmRow | undefined> {
  const { rows } = await db.query(
    `UPDATE alarms a SET acknowledged_at = now(), acknowledged_by_user_id = $2, acknowledge_note = $3, updated_at = now()
      WHERE a.id = $1 AND a.acknowledged_at IS NULL
     RETURNING ${ALARM_COLS}`,
    [id, userId, note ?? null],
  );
  return rows[0] ? camel<AlarmRow>(rows[0]) : undefined;
}

export async function logCommand(
  db: Db,
  c: {
    deviceId: string;
    userId: number;
    command: string;
    params?: unknown;
    status?: number;
    statusText?: string;
    accepted: boolean;
    error?: string;
  },
): Promise<number> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO command_log (device_id, user_id, command, params, status, status_text, accepted, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      c.deviceId, c.userId, c.command, c.params === undefined ? null : JSON.stringify(c.params),
      c.status ?? null, c.statusText ?? null, c.accepted, c.error ?? null,
    ],
  );
  return Number(rows[0]!.id);
}

export async function listCommands(db: Db, deviceId: string, limit: number): Promise<CommandLogRow[]> {
  const { rows } = await db.query(
    `SELECT c.id, c.device_id, c.user_id, u.name AS user_name, c.command, c.params, c.status, c.status_text,
            c.accepted, c.error, c.created_at
       FROM command_log c LEFT JOIN users u ON u.id = c.user_id
      WHERE c.device_id = $1 ORDER BY c.id DESC LIMIT $2`,
    [deviceId, limit],
  );
  return rows.map((r) => camel<CommandLogRow>(r));
}
