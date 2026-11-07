import { camel, type Db, type Device, type DeviceKind, type LiveState } from './types.js';

const COLS = `d.device_id, d.org_id, d.name, d.kind, d.plate_number, d.vendor_device_type, d.sim_number, d.notes,
              d.active, d.paid_until, d.installed_at, d.created_at`;

const STATE_COLS = `s.recorded_at, s.lat, s.lon, s.speed_kmh, s.course, s.moving, s.voltage, s.battery_pct,
                    s.odometer_m, s.source, s.status_text, s.alarm_text, s.fuel, s.sensors, s.updated_at`;

export interface DeviceWithState {
  device: Device;
  state: LiveState | null;
}

function splitRow(row: Record<string, unknown>): DeviceWithState {
  const device: Record<string, unknown> = {};
  const state: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('s_')) state[k.slice(2)] = v;
    else device[k] = v;
  }
  return {
    device: camel<Device>(device),
    state: state.recorded_at ? camel<LiveState>({ ...state, device_id: device.device_id }) : null,
  };
}

const stateSelect = STATE_COLS.split(',')
  .map((c) => c.trim())
  .map((c) => `${c} AS s_${c.slice(2)}`)
  .join(', ');

export async function getDevice(db: Db, deviceId: string): Promise<Device | undefined> {
  const { rows } = await db.query(`SELECT ${COLS} FROM devices d WHERE d.device_id = $1`, [deviceId]);
  return rows[0] ? camel<Device>(rows[0]) : undefined;
}

export async function getDeviceWithState(db: Db, deviceId: string): Promise<DeviceWithState | undefined> {
  const { rows } = await db.query(
    `SELECT ${COLS}, ${stateSelect} FROM devices d LEFT JOIN device_state s ON s.device_id = d.device_id WHERE d.device_id = $1`,
    [deviceId],
  );
  return rows[0] ? splitRow(rows[0]) : undefined;
}

export interface DeviceFilter {
  orgIds: number[];
  orgId?: number;
  q?: string;
  /** Only devices whose live state changed after this time. */
  changedSince?: Date;
  includeInactive?: boolean;
}

export async function listDevices(db: Db, f: DeviceFilter): Promise<DeviceWithState[]> {
  const params: unknown[] = [f.orgIds];
  const where = ['d.org_id = ANY($1::bigint[])'];
  if (!f.includeInactive) where.push('d.active');
  if (f.orgId !== undefined) {
    params.push(f.orgId);
    where.push(`d.org_id = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q}%`);
    const p = `$${params.length}`;
    where.push(`(d.name ILIKE ${p} OR d.plate_number ILIKE ${p} OR d.device_id ILIKE ${p})`);
  }
  if (f.changedSince) {
    params.push(f.changedSince);
    where.push(`s.updated_at > $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT ${COLS}, ${stateSelect} FROM devices d LEFT JOIN device_state s ON s.device_id = d.device_id
      WHERE ${where.join(' AND ')} ORDER BY d.name LIMIT 5000`,
    params,
  );
  return rows.map(splitRow);
}

/** Device ids the org subtree owns, for filtering live events. */
export async function deviceIdsForOrgs(db: Db, orgIds: number[]): Promise<Set<string>> {
  const { rows } = await db.query<{ device_id: string }>(
    'SELECT device_id FROM devices WHERE org_id = ANY($1::bigint[]) AND active',
    [orgIds],
  );
  return new Set(rows.map((r) => r.device_id));
}

/** Devices that send data (they are in device_state) but aren't registered to any customer yet. */
export async function listUnregistered(db: Db): Promise<{ deviceId: string; deviceName: string | null; lastSeenAt: Date }[]> {
  const { rows } = await db.query(
    `SELECT s.device_id, s.device_name, s.recorded_at AS last_seen_at FROM device_state s
      WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.device_id = s.device_id)
      ORDER BY s.recorded_at DESC LIMIT 1000`,
  );
  return rows.map((r) => camel(r));
}

export interface NewDevice {
  deviceId: string;
  orgId: number;
  name: string;
  kind?: DeviceKind;
  plateNumber?: string | null;
  vendorDeviceType: number;
  simNumber?: string | null;
  notes?: string | null;
  paidUntil?: Date | null;
  installedAt?: Date | null;
}

export async function createDevice(db: Db, d: NewDevice): Promise<Device> {
  const { rows } = await db.query(
    `INSERT INTO devices (device_id, org_id, name, kind, plate_number, vendor_device_type, sim_number, notes, paid_until, installed_at)
     VALUES ($1, $2, $3, COALESCE($4, 'car'), $5, $6, $7, $8, $9, $10)
     RETURNING ${COLS.replace(/d\./g, '')}`,
    [
      d.deviceId, d.orgId, d.name, d.kind ?? null, d.plateNumber ?? null, d.vendorDeviceType,
      d.simNumber ?? null, d.notes ?? null, d.paidUntil ?? null, d.installedAt ?? null,
    ],
  );
  return camel<Device>(rows[0]);
}

export interface DevicePatch {
  orgId?: number;
  name?: string;
  kind?: DeviceKind;
  plateNumber?: string | null;
  vendorDeviceType?: number;
  simNumber?: string | null;
  notes?: string | null;
  active?: boolean;
  paidUntil?: Date | null;
  installedAt?: Date | null;
}

export async function updateDevice(db: Db, deviceId: string, patch: DevicePatch): Promise<Device | undefined> {
  const map: Record<keyof DevicePatch, string> = {
    orgId: 'org_id',
    name: 'name',
    kind: 'kind',
    plateNumber: 'plate_number',
    vendorDeviceType: 'vendor_device_type',
    simNumber: 'sim_number',
    notes: 'notes',
    active: 'active',
    paidUntil: 'paid_until',
    installedAt: 'installed_at',
  };
  const sets: string[] = [];
  const params: unknown[] = [deviceId];
  for (const [key, col] of Object.entries(map) as [keyof DevicePatch, string][]) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length === 0) return getDevice(db, deviceId);
  const { rows } = await db.query(
    `UPDATE devices SET ${sets.join(', ')}, updated_at = now() WHERE device_id = $1 RETURNING ${COLS.replace(/d\./g, '')}`,
    params,
  );
  return rows[0] ? camel<Device>(rows[0]) : undefined;
}
