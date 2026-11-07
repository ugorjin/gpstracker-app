import { describe, expect, it } from 'vitest';
import { normalizePush } from '../src/push/normalize.js';
import { alarmPush, positionPush } from './fixtures.js';

describe('normalizePush: positions', () => {
  it('converts a documented position push', () => {
    const n = normalizePush(positionPush);
    expect(n.kind).toBe('position');
    expect(n.problem).toBeUndefined();
    expect(n.alarms).toEqual([]);
    expect(n.position).toMatchObject({
      deviceId: '868035043015161',
      deviceName: 'Toyota Hilux LAG-123-XY',
      lat: 6.5244,
      lon: 3.3792,
      speedKmh: 45.6,
      course: 270,
      odometerM: 1234567,
      source: 'gps',
      satellites: 11,
      signalPct: 80,
      voltage: 12.6,
      batteryPct: 90,
      moving: true,
      statusText: 'ACC ON',
      ioStatus: undefined, // -1 = not available
    });
    expect(n.position!.recordedAt.toISOString()).toBe(new Date(1789347000000).toISOString());
    expect(n.position!.fixAt!.getTime()).toBe(1789346990000);
    expect(n.position!.receivedAt!.getTime()).toBe(1789347001000);
  });

  it('converts fuel (1/100 L) and sensors (1/100 °C, 1/10 %) and drops invalid probes', () => {
    const p = normalizePush(positionPush).position!;
    expect(p.fuel).toEqual({ totalRunningL: 1520, totalNotRunningL: 30, tanksL: [45.5, null, null, null] });
    expect(p.sensors).toEqual({ temperaturesC: [4.5, null, null, null], humidityPct: [65.5, null] });
  });

  it('omits fuel/sensors when the device has none', () => {
    const p = normalizePush({ ...positionPush, fuledata: null, tempdata: undefined }).position!;
    expect(p.fuel).toBeUndefined();
    expect(p.sensors).toBeUndefined();
  });

  it('accepts numbers sent as strings', () => {
    const p = normalizePush({ ...positionPush, lat: '6.5', lon: '3.4', updatetime: '1789347000000' }).position!;
    expect(p.lat).toBe(6.5);
    expect(p.recordedAt.getTime()).toBe(1789347000000);
  });

  it('flags positions without usable coordinates instead of storing 0,0', () => {
    const n = normalizePush({ ...positionPush, lat: 0, lon: 0 });
    expect(n.position).toBeUndefined();
    expect(n.problem).toMatch(/coordinates/);
    expect(normalizePush({ ...positionPush, lat: 200 }).position).toBeUndefined();
  });

  it('extracts an alarm embedded in a position push', () => {
    const n = normalizePush({
      ...positionPush,
      devicealarm: { alarm: 4, stralarm: 'Power cut', startalarmtime: 1789347000000, alarmtype: 1 },
    });
    expect(n.kind).toBe('position');
    expect(n.position).toBeDefined();
    expect(n.alarms).toHaveLength(1);
    expect(n.alarms[0]).toMatchObject({ deviceId: '868035043015161', alarmCode: 4, alarmText: 'Power cut', count: 1 });
  });
});

describe('normalizePush: alarms', () => {
  it('converts a documented alarm push', () => {
    const n = normalizePush(alarmPush);
    expect(n.kind).toBe('alarm');
    expect(n.position).toBeUndefined();
    expect(n.alarms).toHaveLength(1);
    expect(n.alarms[0]).toMatchObject({
      deviceId: '868035043015161',
      category: 1,
      alarmCode: 1,
      alarmText: 'SOS',
      count: 1,
      lat: 6.6,
      lon: 3.35,
      speedKmh: 0,
    });
    expect(n.alarms[0]!.startedAt.getTime()).toBe(1789347060000);
  });

  it('reports alarms it cannot use', () => {
    const { alarm: _drop, ...noCode } = alarmPush;
    expect(normalizePush(noCode)).toMatchObject({ kind: 'alarm', alarms: [], problem: expect.any(String) });
  });
});

describe('normalizePush: invalid input', () => {
  it.each([null, 42, 'text', [], {}])('handles %j without throwing', (input) => {
    expect(normalizePush(input).kind).toBe('unknown');
  });
});
