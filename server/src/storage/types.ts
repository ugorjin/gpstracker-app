import type { Alarm, Position } from '../domain.js';
import type { PushKind } from '../push/normalize.js';

export interface RawPush {
  kind: PushKind;
  deviceId?: string;
  signed: boolean;
  body: string;
  problem?: string;
}

export interface SaveResult {
  /** False when it was a duplicate (already stored). */
  inserted: boolean;
}

/** Where the push receiver writes. Postgres in production, memory in tests. */
export interface PushStore {
  logRawPush(raw: RawPush): Promise<void>;
  /** Stores the position in history and moves the device's live state forward if newer. */
  savePosition(position: Position): Promise<SaveResult>;
  /** Inserts an alarm, or updates last time/count of the same ongoing alarm. */
  saveAlarm(alarm: Alarm): Promise<SaveResult>;
}
