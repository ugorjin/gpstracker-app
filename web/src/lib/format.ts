import type { DeviceKind, DeviceStatus, Role } from '../api/types';

/**
 * Times are shown in the organisation's timezone (utcOffsetMinutes), not the
 * browser's: a Lagos fleet manager travelling abroad still sees Lagos times.
 */
function shifted(iso: string | Date, offsetMinutes: number): Date {
  const t = typeof iso === 'string' ? Date.parse(iso) : iso.getTime();
  return new Date(t + offsetMinutes * 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "7 Nov 2026, 14:05" */
export function formatDateTime(iso: string | Date | null | undefined, offsetMinutes: number): string {
  if (!iso) return '—';
  const d = shifted(iso, offsetMinutes);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "14:05:09" */
export function formatTime(iso: string | Date, offsetMinutes: number): string {
  const d = shifted(iso, offsetMinutes);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** "7 Nov 2026" */
export function formatDate(iso: string | Date | null | undefined, offsetMinutes: number): string {
  if (!iso) return '—';
  const d = shifted(iso, offsetMinutes);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Value for <input type="datetime-local"> in the organisation's timezone. */
export function toLocalInput(date: Date, offsetMinutes: number): string {
  const d = shifted(date, offsetMinutes);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Parses a datetime-local value typed in the organisation's timezone. */
export function fromLocalInput(value: string, offsetMinutes: number): Date | undefined {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - offsetMinutes * 60_000);
}

/** Midnight today in the organisation's timezone. */
export function startOfDay(now: Date, offsetMinutes: number): Date {
  const d = shifted(now, offsetMinutes);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - offsetMinutes * 60_000);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago" */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  const days = Math.round(h / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function formatSpeed(kmh: number | null | undefined): string {
  return kmh === null || kmh === undefined ? '—' : `${Math.round(kmh)} km/h`;
}

export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return '—';
  return `${km.toLocaleString('en-NG', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

export const STATUS_LABEL: Record<DeviceStatus, string> = {
  moving: 'Moving',
  stopped: 'Stopped',
  offline: 'Offline',
  no_data: 'No data yet',
  subscription_expired: 'Subscription expired',
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  operator: 'Operator',
  viewer: 'Viewer',
};

export const ROLE_HELP: Record<Role, string> = {
  owner: 'Full control, including other owners',
  admin: 'Manage users and vehicles, cut/restore engine',
  operator: 'View everything and acknowledge alarms',
  viewer: 'View only',
};

export const KIND_LABEL: Record<DeviceKind, string> = {
  car: 'Car',
  motorbike: 'Motorbike / Keke',
  truck: 'Truck',
  bus: 'Bus',
  boat: 'Boat',
  generator: 'Generator',
  asset: 'Asset / container',
  person: 'Person',
  pet: 'Pet',
  other: 'Other',
};

/** Days until a subscription ends (negative = already ended). */
export function daysUntil(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.floor((Date.parse(iso) - now) / 86_400_000);
}
