import type { HistoryPoint } from '../api/types';

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Stop {
  lat: number;
  lon: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface TripSummary {
  distanceKm: number;
  maxSpeedKmh: number;
  drivingMs: number;
  stops: Stop[];
  startedAt?: string;
  endedAt?: string;
}

/**
 * Summary of a track. A stop = staying within `stopRadiusM` for at least
 * `minStopMs` (default 5 minutes, like the vendor's stop report).
 * GPS jumps faster than 250 km/h are ignored for the distance.
 */
export function summarize(points: HistoryPoint[], minStopMs = 5 * 60_000, stopRadiusM = 60): TripSummary {
  let distance = 0;
  let maxSpeed = 0;
  let driving = 0;
  const stops: Stop[] = [];

  let anchor: HistoryPoint | undefined;
  let anchorIdx = 0;
  const closeStop = (endIdx: number) => {
    if (!anchor) return;
    const end = points[endIdx]!;
    const dur = Date.parse(end.recordedAt) - Date.parse(anchor.recordedAt);
    if (dur >= minStopMs) stops.push({ lat: anchor.lat, lon: anchor.lon, startedAt: anchor.recordedAt, endedAt: end.recordedAt, durationMs: dur });
  };

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    maxSpeed = Math.max(maxSpeed, p.speedKmh ?? 0);
    if (i > 0) {
      const prev = points[i - 1]!;
      const d = distanceM(prev, p);
      const dt = (Date.parse(p.recordedAt) - Date.parse(prev.recordedAt)) / 1000;
      if (dt > 0 && d / dt < 70) distance += d; // < 250 km/h
      if ((p.speedKmh ?? 0) > 3 || d > 30) driving += Math.max(0, dt * 1000);
    }
    if (!anchor) {
      anchor = p;
      anchorIdx = i;
    } else if (distanceM(anchor, p) > stopRadiusM) {
      if (i - 1 > anchorIdx) closeStop(i - 1);
      anchor = p;
      anchorIdx = i;
    }
  }
  if (anchor && points.length - 1 > anchorIdx) closeStop(points.length - 1);

  return {
    distanceKm: Math.round(distance / 100) / 10,
    maxSpeedKmh: Math.round(maxSpeed),
    drivingMs: driving,
    stops,
    startedAt: points[0]?.recordedAt,
    endedAt: points[points.length - 1]?.recordedAt,
  };
}
