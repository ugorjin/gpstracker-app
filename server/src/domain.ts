/**
 * Our own data model, independent of any hardware vendor.
 * Vendor payloads are converted into these types at the edge (src/push/normalize.ts).
 */

export interface FuelReading {
  /** Total fuel used while driving, litres. */
  totalRunningL?: number;
  /** Total fuel used while not driving (idling), litres. */
  totalNotRunningL?: number;
  /** Fuel level per tank sensor, litres (up to 4). */
  tanksL: (number | null)[];
}

export interface SensorReading {
  /** Temperatures, °C (up to 4 probes). null = probe absent/invalid. */
  temperaturesC: (number | null)[];
  /** Relative humidity, % (up to 2 probes). null = probe absent/invalid. */
  humidityPct: (number | null)[];
}

export interface Position {
  deviceId: string;
  deviceName?: string;
  lat: number;
  lon: number;
  /** When the platform last updated this position. Sort tracks by this. */
  recordedAt: Date;
  /** Last valid GPS/Wi-Fi/cell fix. */
  fixAt?: Date;
  /** When the vendor server received it. */
  receivedAt?: Date;
  speedKmh?: number;
  /** 0-360 */
  course?: number;
  altitudeM?: number;
  accuracyM?: number;
  /** Odometer computed by the platform, metres. */
  odometerM?: number;
  /** gps | wifi | cell */
  source?: string;
  satellites?: number;
  /** Signal strength, % (10/40/60/80/100). */
  signalPct?: number;
  voltage?: number;
  batteryPct?: number;
  moving?: boolean;
  reportMode?: number;
  statusCode?: number;
  statusText?: string;
  alarmCode?: number;
  alarmText?: string;
  ioStatus?: number;
  parkDurationMs?: number;
  fuel?: FuelReading;
  sensors?: SensorReading;
}

export interface Alarm {
  deviceId: string;
  /** 1 normal, 2 video (vendor `alarmtype`). */
  category: number;
  alarmCode: number;
  alarmText?: string;
  startedAt: Date;
  lastAt: Date;
  count: number;
  lat?: number;
  lon?: number;
  speedKmh?: number;
  course?: number;
  odometerM?: number;
  receivedAt?: Date;
}
