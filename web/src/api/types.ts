// Shapes returned by the backend (see docs/dashboard-api.md). Dates arrive as ISO strings.

export type OrgType = 'platform' | 'reseller' | 'customer';
export type CustomerKind = 'business' | 'individual';
export type Role = 'owner' | 'admin' | 'operator' | 'viewer';
export type DeviceStatus = 'moving' | 'stopped' | 'offline' | 'no_data' | 'subscription_expired';

export const ROLES: Role[] = ['owner', 'admin', 'operator', 'viewer'];
export const ROLE_RANK: Record<Role, number> = { owner: 4, admin: 3, operator: 2, viewer: 1 };

export const DEVICE_KINDS = ['car', 'motorbike', 'truck', 'bus', 'boat', 'generator', 'asset', 'person', 'pet', 'other'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export interface Org {
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
  createdAt: string;
}

export interface User {
  id: number;
  orgId: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Permissions {
  isStaff: boolean;
  manageUsers: boolean;
  manageCustomers: boolean;
  manageDeviceInventory: boolean;
  sendCommands: boolean;
  acknowledgeAlarms: boolean;
}

export interface Me {
  user: User;
  org: Org;
  permissions: Permissions;
}

export interface Position {
  recordedAt: string;
  lat: number;
  lon: number;
  speedKmh: number | null;
  course: number | null;
  moving: boolean | null;
  voltage: number | null;
  batteryPct: number | null;
  odometerKm: number | null;
  source: string | null;
  statusText: string | null;
  alarmText: string | null;
  fuel: { totalRunningL?: number; totalNotRunningL?: number; tanksL: (number | null)[] } | null;
  sensors: { temperaturesC: (number | null)[]; humidityPct: (number | null)[] } | null;
  lastSeenAt: string;
}

export interface Device {
  id: string;
  orgId: number;
  name: string;
  kind: DeviceKind;
  plateNumber: string | null;
  notes: string | null;
  active: boolean;
  paidUntil: string | null;
  subscriptionActive: boolean;
  status: DeviceStatus;
  position: Position | null;
  // Staff only:
  vendorDeviceType?: number;
  simNumber?: string | null;
  installedAt?: string | null;
  createdAt?: string;
}

export interface HistoryPoint {
  recordedAt: string;
  lat: number;
  lon: number;
  speedKmh: number | null;
  course: number | null;
  moving: boolean | null;
  statusText: string | null;
  alarmText: string | null;
}

export interface HistoryResponse {
  deviceId: string;
  from: string;
  to: string;
  truncated: boolean;
  points: HistoryPoint[];
}

export interface Alarm {
  id: number;
  deviceId: string;
  deviceName: string;
  category: number;
  alarmCode: number;
  alarmText: string | null;
  startedAt: string;
  lastAt: string;
  count: number;
  lat: number | null;
  lon: number | null;
  speedKmh: number | null;
  acknowledgedAt: string | null;
  acknowledgedByUserId: number | null;
  acknowledgeNote: string | null;
}

export interface CommandLog {
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
  createdAt: string;
}

export type CommandRequest =
  | { command: 'engine_cut'; confirm: true }
  | { command: 'engine_restore'; confirm: true }
  | { command: 'speed_limit'; confirm: true; speedKmh: number; durationSeconds: number };

export interface CommandResult {
  commandId?: number;
  accepted: boolean;
  status: number;
  statusText: string;
}

/** Live stream events. */
export interface StreamPosition {
  deviceId: string;
  recordedAt: string;
  lat: number;
  lon: number;
  speedKmh: number | null;
  course: number | null;
  moving: boolean | null;
  statusText: string | null;
  alarmText: string | null;
}

export interface StreamAlarm {
  deviceId: string;
  alarmCode: number;
  alarmText: string | null;
  startedAt: string;
  lat: number | null;
  lon: number | null;
}
