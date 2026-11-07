/**
 * Sends signed pushes for the demo vehicles to a running server, exactly like
 * the vendor platform would, so the live map moves.
 *
 *   PUSH_APP_ID=... PUSH_APP_SECRET=... npm run simulate -- --url http://localhost:3000 --every 5
 *
 * Every few minutes it also sends an overspeed alarm for a random moving vehicle.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { buildSign } from '../push/signature.js';
import { DEMO_VEHICLES, positionAt } from './demoRoutes.js';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:3000' },
    every: { type: 'string', default: '5' },
  },
});
const appId = process.env.PUSH_APP_ID;
const secret = process.env.PUSH_APP_SECRET;
if (!appId || !secret) {
  console.error('Set PUSH_APP_ID and PUSH_APP_SECRET (same values as the server).');
  process.exit(1);
}
const endpoint = `${values.url!.replace(/\/$/, '')}/push/vendor`;
const intervalMs = Math.max(1, Number(values.every)) * 1000;

async function push(payload: object): Promise<number> {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const nonce = randomUUID().replace(/-/g, '');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-App-Id': appId!,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Sign': buildSign(appId!, secret!, timestamp, nonce, body),
    },
    body,
  });
  return res.status;
}

let tick = 0;
async function round() {
  const now = Date.now();
  const active = DEMO_VEHICLES.filter((v) => !v.silent);
  const results = await Promise.allSettled(
    active.map((v) => {
      const p = positionAt(v.route, now);
      return push({
        deviceid: v.deviceId,
        devicename: v.name,
        lat: p.lat,
        lon: p.lon,
        updatetime: now,
        validpoistiontime: now,
        arrivedtime: now,
        speed: Math.round(p.speedKmh * 1000), // vendor speed is in m/h
        course: p.course,
        totaldistance: p.odometerM,
        moving: p.moving ? 1 : 0,
        gotsrc: 'gps',
        gpsvalidnum: 9,
        rxlevel: 80,
        voltagev: 12.4,
        voltagepercent: 100,
        strstatus: p.moving ? 'ACC ON' : 'ACC OFF',
        alarm: 0,
        devicealarm: null,
      });
    }),
  );
  const ok = results.filter((r) => r.status === 'fulfilled' && r.value === 200).length;

  // Every ~3 minutes: an overspeed alarm for one moving vehicle.
  tick++;
  if (tick % Math.max(1, Math.round(180_000 / intervalMs)) === 0) {
    const moving = active.filter((v) => positionAt(v.route, now).moving);
    const v = moving[Math.floor(Math.random() * moving.length)];
    if (v) {
      const p = positionAt(v.route, now);
      await push({ deviceid: v.deviceId, lat: p.lat, lon: p.lon, updatetime: now, arrivedtime: now, speed: 112_000, alarmtype: 1, alarm: 2, stralarm: 'Overspeed', startalarmtime: now, lastalarmtime: now, alarmcount: 1 });
      console.log(`alarm: Overspeed for ${v.name}`);
    }
  }
  console.log(`${new Date().toISOString()} sent ${ok}/${active.length} positions`);
}

console.log(`Simulating ${DEMO_VEHICLES.length} vehicles -> ${endpoint} every ${intervalMs / 1000}s. Ctrl+C to stop.`);
void round();
setInterval(() => void round().catch((err) => console.error('push failed:', (err as Error).message)), intervalMs);
