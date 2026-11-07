import type { Device, LiveState, Organization, User } from '../repo/types.js';
import type { Principal } from './access.js';

export type DeviceStatus = 'moving' | 'stopped' | 'offline' | 'no_data' | 'subscription_expired';

export function userDto(u: User) {
  return {
    id: u.id,
    orgId: u.orgId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    active: u.active,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export function orgDto(o: Organization) {
  return {
    id: o.id,
    parentId: o.parentId,
    type: o.type,
    customerKind: o.customerKind,
    name: o.name,
    countryCode: o.countryCode,
    utcOffsetMinutes: o.utcOffsetMinutes,
    phone: o.phone,
    email: o.email,
    active: o.active,
    createdAt: o.createdAt,
  };
}

export function positionDto(s: LiveState) {
  return {
    recordedAt: s.recordedAt,
    lat: s.lat,
    lon: s.lon,
    speedKmh: s.speedKmh,
    course: s.course,
    moving: s.moving,
    voltage: s.voltage,
    batteryPct: s.batteryPct,
    odometerKm: s.odometerM === null ? null : Math.round(s.odometerM / 100) / 10,
    source: s.source,
    statusText: s.statusText,
    alarmText: s.alarmText,
    fuel: s.fuel ?? null,
    sensors: s.sensors ?? null,
    lastSeenAt: s.updatedAt,
  };
}

export function deviceStatus(
  p: Principal,
  device: Device,
  state: LiveState | null,
  offlineAfterMinutes: number,
  now = Date.now(),
): DeviceStatus {
  if (!p.isStaff && !p.isSubscriptionActive(device, new Date(now))) return 'subscription_expired';
  if (!state) return 'no_data';
  if (now - state.updatedAt.getTime() > offlineAfterMinutes * 60_000) return 'offline';
  return state.moving ? 'moving' : 'stopped';
}

/**
 * Device as shown to a user. Customers don't see vendor/internal fields, and
 * get no position when the subscription has expired.
 */
export function deviceDto(p: Principal, device: Device, state: LiveState | null, offlineAfterMinutes: number) {
  const status = deviceStatus(p, device, state, offlineAfterMinutes);
  const base = {
    id: device.deviceId,
    orgId: device.orgId,
    name: device.name,
    kind: device.kind,
    plateNumber: device.plateNumber,
    notes: device.notes,
    active: device.active,
    paidUntil: device.paidUntil,
    subscriptionActive: p.isSubscriptionActive(device),
    status,
    position: status === 'subscription_expired' || !state ? null : positionDto(state),
  };
  if (!p.isStaff) return base;
  return {
    ...base,
    vendorDeviceType: device.vendorDeviceType,
    simNumber: device.simNumber,
    installedAt: device.installedAt,
    createdAt: device.createdAt,
  };
}
