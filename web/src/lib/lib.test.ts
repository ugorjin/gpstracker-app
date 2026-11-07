import { describe, expect, it } from 'vitest';
import type { HistoryPoint } from '../api/types';
import { daysUntil, formatDateTime, fromLocalInput, startOfDay, timeAgo, toLocalInput } from './format';
import { distanceM, summarize } from './geo';

const WAT = 60; // Nigeria, UTC+1

describe('time formatting in the organisation timezone', () => {
  it('shows Lagos time regardless of the browser timezone', () => {
    expect(formatDateTime('2026-11-07T23:30:00Z', WAT)).toBe('8 Nov 2026, 00:30');
    expect(formatDateTime('2026-11-07T23:30:00Z', 0)).toBe('7 Nov 2026, 23:30');
    expect(formatDateTime(null, WAT)).toBe('—');
  });

  it('round-trips datetime-local inputs', () => {
    const d = new Date('2026-11-07T07:15:00Z');
    expect(toLocalInput(d, WAT)).toBe('2026-11-07T08:15');
    expect(fromLocalInput('2026-11-07T08:15', WAT)?.toISOString()).toBe('2026-11-07T07:15:00.000Z');
    expect(fromLocalInput('garbage', WAT)).toBeUndefined();
  });

  it('finds local midnight', () => {
    // 00:30 WAT on 8 Nov is still 7 Nov in UTC.
    expect(startOfDay(new Date('2026-11-07T23:30:00Z'), WAT).toISOString()).toBe('2026-11-07T23:00:00.000Z');
  });

  it('describes how long ago', () => {
    const now = Date.parse('2026-11-07T12:00:00Z');
    expect(timeAgo('2026-11-07T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-11-07T11:55:00Z', now)).toBe('5 min ago');
    expect(timeAgo('2026-11-07T09:00:00Z', now)).toBe('3 h ago');
    expect(timeAgo('2026-11-05T12:00:00Z', now)).toBe('2 days ago');
    expect(timeAgo(null, now)).toBe('never');
  });

  it('counts subscription days left', () => {
    const now = Date.parse('2026-11-07T12:00:00Z');
    expect(daysUntil('2026-11-12T12:00:00Z', now)).toBe(5);
    expect(daysUntil('2026-11-06T12:00:00Z', now)).toBe(-1);
    expect(daysUntil(null, now)).toBeNull();
  });
});

describe('track summary', () => {
  const pt = (minute: number, lat: number, lon: number, speedKmh = 0): HistoryPoint => ({
    recordedAt: new Date(Date.UTC(2026, 10, 7, 8, minute)).toISOString(),
    lat,
    lon,
    speedKmh,
    course: 0,
    moving: speedKmh > 0,
    statusText: null,
    alarmText: null,
  });

  it('measures distance between points', () => {
    // ~1.11 km per 0.01° of latitude
    expect(Math.round(distanceM({ lat: 6.5, lon: 3.4 }, { lat: 6.51, lon: 3.4 }))).toBe(1112);
  });

  it('sums distance, max speed and finds stops of 5+ minutes', () => {
    const points = [
      pt(0, 6.5, 3.4, 0),
      pt(1, 6.5, 3.4, 0),
      pt(6, 6.5, 3.4, 0), // stopped 6 min
      pt(8, 6.51, 3.4, 40),
      pt(10, 6.52, 3.4, 55),
      pt(11, 6.52, 3.4, 0),
      pt(13, 6.52, 3.4, 0), // 2 min: not a stop
      pt(15, 6.53, 3.4, 30),
    ];
    const s = summarize(points);
    expect(s.distanceKm).toBeCloseTo(3.3, 1);
    expect(s.maxSpeedKmh).toBe(55);
    expect(s.stops).toHaveLength(1);
    expect(s.stops[0]!.durationMs).toBe(6 * 60_000);
  });

  it('ignores impossible GPS jumps', () => {
    // 100 km in one minute = GPS glitch, not driving.
    const s = summarize([pt(0, 6.5, 3.4, 30), pt(1, 7.4, 3.4, 30), pt(2, 7.401, 3.4, 30)]);
    expect(s.distanceKm).toBeLessThan(1);
  });

  it('handles empty tracks', () => {
    expect(summarize([])).toMatchObject({ distanceKm: 0, maxSpeedKmh: 0, stops: [] });
  });
});
