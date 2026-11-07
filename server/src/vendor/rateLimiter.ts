import { VendorBudgetExceededError } from './errors.js';

/**
 * Keeps our calls inside the vendor's published limits:
 *   - 10 requests / minute per IP           -> `perMinute` (sliding window, requests wait)
 *   - 1440 + 5 × paid devices per day        -> `dailyBudget` (requests are refused)
 *   - track history: 5 calls / device / day  -> `trackPerDevicePerDay`
 *
 * Requests are queued, and `high` priority (user-triggered: commands, video,
 * "show me this route") always goes before `low` (background jobs). Part of the
 * daily budget is held back for `high` priority so background work can never
 * stop a customer from cutting an engine.
 *
 * Counters are in memory, so they reset when the process restarts. The vendor
 * still enforces its own limits (status 8902/8905), which the client reports.
 */
export type Priority = 'high' | 'low';

export interface RateLimiterOptions {
  perMinute: number;
  dailyBudget: number;
  /** Fraction of the daily budget only `high` priority may use. Default 0.2. */
  highPriorityReserve?: number;
  trackPerDevicePerDay?: number;
  /**
   * Hour offset of the vendor's "day" from UTC. The vendor is in China, so we
   * assume its daily counters reset at midnight UTC+8. Default 8.
   */
  dayBoundaryUtcOffsetHours?: number;
  now?: () => number;
}

interface Waiter {
  priority: Priority;
  resolve: () => void;
}

const MINUTE = 60_000;

export class RateLimiter {
  private readonly perMinute: number;
  private readonly dailyBudget: number;
  private readonly reserve: number;
  private readonly trackLimit: number;
  private readonly dayOffsetMs: number;
  private readonly now: () => number;

  private readonly window: number[] = [];
  private readonly queue: Waiter[] = [];
  private timer: NodeJS.Timeout | undefined;

  private dayKey = '';
  private usedToday = 0;
  private readonly trackCalls = new Map<string, number>();

  constructor(opts: RateLimiterOptions) {
    this.perMinute = opts.perMinute;
    this.dailyBudget = opts.dailyBudget;
    this.reserve = Math.floor(opts.dailyBudget * (opts.highPriorityReserve ?? 0.2));
    this.trackLimit = opts.trackPerDevicePerDay ?? 5;
    this.dayOffsetMs = (opts.dayBoundaryUtcOffsetHours ?? 8) * 3_600_000;
    this.now = opts.now ?? Date.now;
  }

  /** Resolves when the request may be sent. Rejects if the daily budget is spent. */
  acquire(priority: Priority = 'low'): Promise<void> {
    this.rollDay();
    const limit = priority === 'high' ? this.dailyBudget : this.dailyBudget - this.reserve;
    // Count queued requests too, so a burst can't overshoot the budget.
    if (this.usedToday + this.queue.length >= limit) {
      return Promise.reject(
        new VendorBudgetExceededError(
          'daily',
          `Daily vendor API budget reached (${this.usedToday}/${this.dailyBudget}, priority=${priority})`,
        ),
      );
    }
    return new Promise<void>((resolve) => {
      const waiter: Waiter = { priority, resolve };
      if (priority === 'high') {
        const firstLow = this.queue.findIndex((w) => w.priority === 'low');
        if (firstLow === -1) this.queue.push(waiter);
        else this.queue.splice(firstLow, 0, waiter);
      } else {
        this.queue.push(waiter);
      }
      this.pump();
    });
  }

  /**
   * Records a track-history call for a device; throws if the device already
   * used its 5 calls today. Call before `acquire` for `querytracks`.
   */
  reserveTrackCall(deviceId: string): void {
    this.rollDay();
    const used = this.trackCalls.get(deviceId) ?? 0;
    if (used >= this.trackLimit) {
      throw new VendorBudgetExceededError(
        'track',
        `Track history for device ${deviceId} already requested ${used} times today (limit ${this.trackLimit})`,
      );
    }
    this.trackCalls.set(deviceId, used + 1);
  }

  stats() {
    this.rollDay();
    this.pruneWindow();
    return {
      day: this.dayKey,
      usedToday: this.usedToday,
      dailyBudget: this.dailyBudget,
      highPriorityReserve: this.reserve,
      lastMinute: this.window.length,
      perMinute: this.perMinute,
      queued: this.queue.length,
    };
  }

  /** Stop the internal timer (for shutdown/tests). Queued requests stay pending. */
  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private pump(): void {
    if (this.timer) return;
    for (;;) {
      if (this.queue.length === 0) return;
      this.pruneWindow();
      if (this.window.length < this.perMinute) {
        const next = this.queue.shift()!;
        this.window.push(this.now());
        this.usedToday++;
        next.resolve();
        continue;
      }
      const wait = this.window[0]! + MINUTE - this.now();
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.pump();
      }, Math.max(wait, 1));
      return;
    }
  }

  private pruneWindow(): void {
    const cutoff = this.now() - MINUTE;
    while (this.window.length > 0 && this.window[0]! <= cutoff) this.window.shift();
  }

  private rollDay(): void {
    const key = new Date(this.now() + this.dayOffsetMs).toISOString().slice(0, 10);
    if (key !== this.dayKey) {
      this.dayKey = key;
      this.usedToday = 0;
      this.trackCalls.clear();
    }
  }
}
