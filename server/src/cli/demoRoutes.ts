/**
 * Demo vehicles moving along fixed routes. Positions are a pure function of
 * time, so the seeded history and the live simulator agree.
 * Coordinates are approximate points around Lagos and Abuja.
 */

export interface DemoRoute {
  /** Waypoints [lat, lon]. The vehicle drives there and back, stopping at each. */
  waypoints: [number, number][];
  speedKmh: number;
  stopMinutes: number;
  /** Shifts the cycle so vehicles aren't in sync. */
  offsetMinutes: number;
}

export interface DemoPoint {
  lat: number;
  lon: number;
  speedKmh: number;
  course: number;
  moving: boolean;
  odometerM: number;
}

const R = 6_371_000;
/** Start of the current month: keeps demo odometers realistic, and the same in seed and simulator. */
const DEMO_EPOCH = (() => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
})();
const rad = (d: number) => (d * Math.PI) / 180;

function distanceM(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(a: [number, number], b: [number, number]): number {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

type Leg =
  | { kind: 'stop'; at: [number, number]; ms: number }
  | { kind: 'drive'; from: [number, number]; to: [number, number]; ms: number; m: number };

function legs(route: DemoRoute): Leg[] {
  const out: Leg[] = [];
  const wps = route.waypoints;
  const loop = [...wps, ...wps.slice(1, -1).reverse()];
  for (let i = 0; i < loop.length; i++) {
    const from = loop[i]!;
    const to = loop[(i + 1) % loop.length]!;
    out.push({ kind: 'stop', at: from, ms: route.stopMinutes * 60_000 });
    const m = distanceM(from, to);
    out.push({ kind: 'drive', from, to, m, ms: (m / (route.speedKmh / 3.6)) * 1000 });
  }
  return out;
}

const cache = new WeakMap<DemoRoute, { legs: Leg[]; cycleMs: number; cycleM: number }>();

function plan(route: DemoRoute) {
  let p = cache.get(route);
  if (!p) {
    const l = legs(route);
    p = {
      legs: l,
      cycleMs: l.reduce((s, x) => s + x.ms, 0),
      cycleM: l.reduce((s, x) => s + (x.kind === 'drive' ? x.m : 0), 0),
    };
    cache.set(route, p);
  }
  return p;
}

export function positionAt(route: DemoRoute, t: number): DemoPoint {
  const { legs: ls, cycleMs, cycleM } = plan(route);
  const shifted = t - DEMO_EPOCH + route.offsetMinutes * 60_000;
  const cycles = Math.floor(shifted / cycleMs);
  let rest = shifted - cycles * cycleMs;
  let odometer = cycles * cycleM;
  let lastCourse = 0;
  for (const leg of ls) {
    if (rest < leg.ms) {
      if (leg.kind === 'stop') return { lat: leg.at[0], lon: leg.at[1], speedKmh: 0, course: Math.round(lastCourse), moving: false, odometerM: Math.round(odometer) };
      const f = rest / leg.ms;
      // Speed varies a little through the leg, like real traffic.
      const speed = route.speedKmh * (0.75 + 0.5 * Math.sin(f * Math.PI)) * (0.9 + 0.2 * Math.sin(t / 37_000));
      return {
        lat: leg.from[0] + (leg.to[0] - leg.from[0]) * f,
        lon: leg.from[1] + (leg.to[1] - leg.from[1]) * f,
        speedKmh: Math.round(speed * 10) / 10,
        course: Math.round(bearing(leg.from, leg.to) % 360),
        moving: true,
        odometerM: Math.round(odometer + leg.m * f),
      };
    }
    rest -= leg.ms;
    if (leg.kind === 'drive') {
      odometer += leg.m;
      lastCourse = bearing(leg.from, leg.to) % 360;
    }
  }
  const last = ls[0] as Extract<Leg, { kind: 'stop' }>;
  return { lat: last.at[0], lon: last.at[1], speedKmh: 0, course: 0, moving: false, odometerM: Math.round(odometer) };
}

// Lagos
const IKEJA: [number, number] = [6.6018, 3.3515];
const MARYLAND: [number, number] = [6.5711, 3.3676];
const YABA: [number, number] = [6.5158, 3.3786];
const OBALENDE: [number, number] = [6.4482, 3.4048];
const VI: [number, number] = [6.4281, 3.4219];
const LEKKI: [number, number] = [6.4474, 3.4703];
const AJAH: [number, number] = [6.4698, 3.5852];
const APAPA: [number, number] = [6.4489, 3.3592];
const SURULERE: [number, number] = [6.5005, 3.3536];
const OSHODI: [number, number] = [6.5547, 3.3437];
const AGEGE: [number, number] = [6.6181, 3.3209];
const FESTAC: [number, number] = [6.4664, 3.2834];
// Abuja
const WUSE: [number, number] = [9.0765, 7.4801];
const GARKI: [number, number] = [9.0333, 7.4883];
const MAITAMA: [number, number] = [9.0882, 7.4934];
const ASOKORO: [number, number] = [9.0441, 7.5242];
const LUGBE: [number, number] = [8.9806, 7.3787];
const AIRPORT: [number, number] = [9.0068, 7.2631];

export interface DemoVehicle {
  deviceId: string;
  name: string;
  plate: string | null;
  kind: 'car' | 'truck' | 'bus' | 'motorbike';
  customer: 'lagos' | 'chidi' | 'cabs';
  route: DemoRoute;
  /** Days from now; negative = already expired. */
  paidDays: number | null;
  /** This one never reports (to show "No data yet"). */
  silent?: boolean;
}

export const DEMO_VEHICLES: DemoVehicle[] = [
  { deviceId: '860000000000101', name: 'Truck 1 – Apapa run', plate: 'LND-421-XA', kind: 'truck', customer: 'lagos', paidDays: 300,
    route: { waypoints: [APAPA, SURULERE, OSHODI, IKEJA], speedKmh: 32, stopMinutes: 25, offsetMinutes: 0 } },
  { deviceId: '860000000000102', name: 'Truck 2 – Agege', plate: 'KJA-118-BC', kind: 'truck', customer: 'lagos', paidDays: 300,
    route: { waypoints: [AGEGE, OSHODI, SURULERE, APAPA], speedKmh: 30, stopMinutes: 30, offsetMinutes: 47 } },
  { deviceId: '860000000000103', name: 'Van – Island deliveries', plate: 'EKY-552-AA', kind: 'car', customer: 'lagos', paidDays: 5,
    route: { waypoints: [YABA, OBALENDE, VI, LEKKI, AJAH], speedKmh: 38, stopMinutes: 12, offsetMinutes: 13 } },
  { deviceId: '860000000000104', name: 'Staff bus', plate: 'LSR-903-DE', kind: 'bus', customer: 'lagos', paidDays: 300,
    route: { waypoints: [FESTAC, SURULERE, YABA, MARYLAND, IKEJA], speedKmh: 35, stopMinutes: 15, offsetMinutes: 90 } },
  { deviceId: '860000000000105', name: 'Old pickup', plate: 'AAA-001-ZZ', kind: 'truck', customer: 'lagos', paidDays: -20,
    route: { waypoints: [IKEJA, MARYLAND], speedKmh: 25, stopMinutes: 40, offsetMinutes: 5 } },
  { deviceId: '860000000000106', name: 'New truck (not installed)', plate: null, kind: 'truck', customer: 'lagos', paidDays: 365, silent: true,
    route: { waypoints: [IKEJA, MARYLAND], speedKmh: 25, stopMinutes: 40, offsetMinutes: 0 } },
  { deviceId: '860000000000201', name: "Chidi's Camry", plate: 'LAG-777-CO', kind: 'car', customer: 'chidi', paidDays: 200,
    route: { waypoints: [MARYLAND, YABA, OBALENDE, VI], speedKmh: 40, stopMinutes: 120, offsetMinutes: 33 } },
  { deviceId: '860000000000301', name: 'Cab 07', plate: 'ABJ-207-KP', kind: 'car', customer: 'cabs', paidDays: 150,
    route: { waypoints: [WUSE, GARKI, ASOKORO, MAITAMA], speedKmh: 42, stopMinutes: 8, offsetMinutes: 0 } },
  { deviceId: '860000000000302', name: 'Cab 12 – Airport', plate: 'ABJ-312-KP', kind: 'car', customer: 'cabs', paidDays: 150,
    route: { waypoints: [MAITAMA, WUSE, LUGBE, AIRPORT], speedKmh: 55, stopMinutes: 20, offsetMinutes: 61 } },
];
