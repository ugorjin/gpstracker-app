import type pg from 'pg';

export type Db = pg.Pool | pg.PoolClient;

export type OrgType = 'platform' | 'reseller' | 'customer';
export type CustomerKind = 'business' | 'individual';
export type Role = 'owner' | 'admin' | 'operator' | 'viewer';

export const ROLE_RANK: Record<Role, number> = { owner: 4, admin: 3, operator: 2, viewer: 1 };

export const DEVICE_KINDS = ['car', 'motorbike', 'truck', 'bus', 'boat', 'generator', 'asset', 'person', 'pet', 'other'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export interface Organization {
  id: number;
  parentId: number | null;
  type: OrgType;
  customerKind: CustomerKind | null;
  name: string;
  countryCode: string;
  utcOffsetMinutes: number;
  phone: string | null;
  email: string | null;
  active: boolean;
  createdAt: Date;
}

export interface User {
  id: number;
  orgId: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface UserWithHash extends User {
  passwordHash: string;
}

export interface Device {
  deviceId: string;
  orgId: number;
  name: string;
  kind: DeviceKind;
  plateNumber: string | null;
  vendorDeviceType: number;
  simNumber: string | null;
  notes: string | null;
  active: boolean;
  paidUntil: Date | null;
  installedAt: Date | null;
  createdAt: Date;
}

export interface LiveState {
  deviceId: string;
  recordedAt: Date;
  lat: number;
  lon: number;
  speedKmh: number | null;
  course: number | null;
  moving: boolean | null;
  voltage: number | null;
  batteryPct: number | null;
  odometerM: number | null;
  source: string | null;
  statusText: string | null;
  alarmText: string | null;
  fuel: unknown;
  sensors: unknown;
  updatedAt: Date;
}

export interface HistoryPoint {
  recordedAt: Date;
  lat: number;
  lon: number;
  speedKmh: number | null;
  course: number | null;
  moving: boolean | null;
  statusText: string | null;
  alarmText: string | null;
}

export interface AlarmRow {
  id: number;
  deviceId: string;
  category: number;
  alarmCode: number;
  alarmText: string | null;
  startedAt: Date;
  lastAt: Date;
  count: number;
  lat: number | null;
  lon: number | null;
  speedKmh: number | null;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: number | null;
  acknowledgeNote: string | null;
}

export interface CommandLogRow {
  id: number;
  deviceId: string;
  userId: number | null;
  userName: string | null;
  command: string;
  params: unknown;
  status: number | null;
  statusText: string | null;
  accepted: boolean;
  error: string | null;
  createdAt: Date;
}

/** Turns a snake_case row into camelCase. pg returns bigint as string: ids are converted to numbers. */
export function camel<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
    out[key] = (key === 'id' || key.endsWith('Id')) && typeof v === 'string' && /^\d+$/.test(v) && key !== 'deviceId' ? Number(v) : v;
  }
  return out as T;
}
