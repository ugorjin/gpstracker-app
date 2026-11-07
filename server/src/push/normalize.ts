import type { Alarm, FuelReading, Position, SensorReading } from '../domain.js';
import { INVALID_HUMIDITY, INVALID_TEMPERATURE } from '../vendor/constants.js';

/**
 * Converts vendor push payloads into our domain types.
 *
 * Unit notes (vendor docs, docs/vendor-api/data-forwarding.md):
 *  - lat/lon are WGS84, times are UTC epoch milliseconds.
 *  - speed is documented only as "metres"; the report endpoints say metres/hour.
 *    We treat it as m/h -> km/h = value / 1000.
 *    TODO: confirm with a known-speed test drive once real pushes arrive.
 *  - fuel values are 1/100 L; temperatures 1/100 °C (65535 = none);
 *    humidity 1/10 % (-1 = none).
 */

type Json = Record<string, unknown>;

export type PushKind = 'position' | 'alarm' | 'unknown';

export interface NormalizedPush {
  kind: PushKind;
  deviceId?: string;
  position?: Position;
  alarms: Alarm[];
  /** Why the payload could not be used, if it could not. */
  problem?: string;
}

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : typeof v === 'number' ? String(v) : undefined;

const date = (v: unknown): Date | undefined => {
  const n = num(v);
  return n !== undefined && n > 0 ? new Date(n) : undefined;
};

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** -1 is the vendor's "not available" for many integer fields. */
const optional = (v: unknown): number | undefined => {
  const n = num(v);
  return n === undefined || n === -1 ? undefined : n;
};

const speedKmh = (v: unknown): number | undefined => {
  const n = num(v);
  return n === undefined || n < 0 ? undefined : Math.round((n / 1000) * 10) / 10;
};

function validLatLon(lat: number | undefined, lon: number | undefined): lat is number {
  return (
    lat !== undefined && lon !== undefined && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0)
  );
}

function parseFuel(v: unknown): FuelReading | undefined {
  if (!isObject(v)) return undefined;
  const litres = (x: unknown) => {
    const n = num(x);
    return n === undefined || n < 0 ? null : n / 100;
  };
  const tanksL = [v.ad0, v.ad1, v.ad2, v.ad3].map(litres);
  const totalRunningL = litres(v.totalRunningAd) ?? undefined;
  const totalNotRunningL = litres(v.totalNotRunningAd) ?? undefined;
  if (totalRunningL === undefined && totalNotRunningL === undefined && tanksL.every((t) => t === null)) return undefined;
  return { totalRunningL, totalNotRunningL, tanksL };
}

function parseSensors(v: unknown): SensorReading | undefined {
  if (!isObject(v)) return undefined;
  const temp = (x: unknown) => {
    const n = num(x);
    return n === undefined || n === INVALID_TEMPERATURE ? null : n / 100;
  };
  const humi = (x: unknown) => {
    const n = num(x);
    return n === undefined || n === INVALID_HUMIDITY ? null : n / 10;
  };
  const temperaturesC = [v.temp1, v.temp2, v.temp3, v.temp4].map(temp);
  const humidityPct = [v.humi1, v.humi2].map(humi);
  if (temperaturesC.every((t) => t === null) && humidityPct.every((h) => h === null)) return undefined;
  return { temperaturesC, humidityPct };
}

function parseAlarm(a: Json, fallbackDeviceId?: string): Alarm | undefined {
  const deviceId = str(a.deviceid) ?? fallbackDeviceId;
  const alarmCode = num(a.alarm);
  if (!deviceId || alarmCode === undefined) return undefined;
  const startedAt = date(a.startalarmtime) ?? date(a.updatetime) ?? date(a.arrivedtime);
  if (!startedAt) return undefined;
  const lat = num(a.lat);
  const lon = num(a.lon);
  const hasPos = validLatLon(lat, lon);
  return {
    deviceId,
    category: num(a.alarmtype) ?? 1,
    alarmCode,
    alarmText: str(a.stralarm),
    startedAt,
    lastAt: date(a.lastalarmtime) ?? startedAt,
    count: num(a.alarmcount) ?? 1,
    lat: hasPos ? lat : undefined,
    lon: hasPos ? lon : undefined,
    speedKmh: speedKmh(a.speed),
    course: num(a.course),
    odometerM: num(a.totaldistance),
    receivedAt: date(a.arrivedtime),
  };
}

function looksLikeAlarm(p: Json): boolean {
  return 'startalarmtime' in p || 'alarmcount' in p || 'alarmtype' in p;
}

function looksLikePosition(p: Json): boolean {
  return 'validpoistiontime' in p || 'devicealarm' in p || 'gotsrc' in p || 'moving' in p || 'devicename' in p;
}

export function normalizePush(payload: unknown): NormalizedPush {
  if (!isObject(payload)) return { kind: 'unknown', alarms: [], problem: 'payload is not a JSON object' };
  const deviceId = str(payload.deviceid);
  if (!deviceId) return { kind: 'unknown', alarms: [], problem: 'missing deviceid' };

  if (looksLikeAlarm(payload) && !looksLikePosition(payload)) {
    const alarm = parseAlarm(payload);
    return alarm
      ? { kind: 'alarm', deviceId, alarms: [alarm] }
      : { kind: 'alarm', deviceId, alarms: [], problem: 'alarm without alarm code or time' };
  }

  const lat = num(payload.lat);
  const lon = num(payload.lon);
  const recordedAt = date(payload.updatetime) ?? date(payload.validpoistiontime) ?? date(payload.arrivedtime);

  const alarms: Alarm[] = [];
  if (isObject(payload.devicealarm)) {
    const embedded = parseAlarm(payload.devicealarm, deviceId);
    if (embedded) alarms.push(embedded);
  }

  if (!validLatLon(lat, lon) || !recordedAt) {
    return {
      kind: 'position',
      deviceId,
      alarms,
      problem: !recordedAt ? 'position without timestamp' : 'position without valid coordinates',
    };
  }

  const moving = num(payload.moving);
  const signal = optional(payload.rxlevel);
  const position: Position = {
    deviceId,
    deviceName: str(payload.devicename),
    lat,
    lon: lon!,
    recordedAt,
    fixAt: date(payload.validpoistiontime),
    receivedAt: date(payload.arrivedtime),
    speedKmh: speedKmh(payload.speed),
    course: num(payload.course),
    altitudeM: num(payload.altitude),
    accuracyM: num(payload.radius),
    odometerM: num(payload.totaldistance),
    source: str(payload.gotsrc),
    satellites: optional(payload.gpsvalidnum),
    signalPct: signal,
    voltage: optional(payload.voltagev),
    batteryPct: optional(payload.voltagepercent),
    moving: moving === undefined ? undefined : moving === 1,
    reportMode: num(payload.reportmode),
    statusCode: num(payload.status),
    statusText: str(payload.strstatus),
    alarmCode: num(payload.alarm),
    alarmText: str(payload.stralarm),
    ioStatus: optional(payload.iostatus),
    parkDurationMs: num(payload.parkduration),
    // The vendor spells this field "fuledata"; accept the correct spelling too.
    fuel: parseFuel(payload.fuledata ?? payload.fueldata),
    sensors: parseSensors(payload.tempdata),
  };
  return { kind: 'position', deviceId, position, alarms };
}
