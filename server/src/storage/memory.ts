import type { Alarm, Position } from '../domain.js';
import type { PushStore, RawPush, SaveResult } from './types.js';

/** In-memory store for tests and local experiments. */
export class MemoryPushStore implements PushStore {
  readonly raw: RawPush[] = [];
  readonly positions = new Map<string, Position>();
  readonly state = new Map<string, Position>();
  readonly alarms = new Map<string, Alarm>();

  async logRawPush(raw: RawPush): Promise<void> {
    this.raw.push(raw);
  }

  async savePosition(p: Position): Promise<SaveResult> {
    const key = `${p.deviceId}|${p.recordedAt.getTime()}`;
    if (this.positions.has(key)) return { inserted: false };
    this.positions.set(key, p);
    const current = this.state.get(p.deviceId);
    if (!current || current.recordedAt < p.recordedAt) this.state.set(p.deviceId, p);
    return { inserted: true };
  }

  async saveAlarm(a: Alarm): Promise<SaveResult> {
    const key = `${a.deviceId}|${a.alarmCode}|${a.startedAt.getTime()}`;
    const existing = this.alarms.get(key);
    if (existing) {
      if (a.lastAt > existing.lastAt) existing.lastAt = a.lastAt;
      existing.count = Math.max(existing.count, a.count);
      return { inserted: false };
    }
    this.alarms.set(key, { ...a });
    return { inserted: true };
  }
}
