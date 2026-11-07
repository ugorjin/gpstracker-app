import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VendorBudgetExceededError } from '../src/vendor/errors.js';
import { RateLimiter } from '../src/vendor/rateLimiter.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('RateLimiter', () => {
  it('lets `perMinute` requests through, then waits for the window to slide', async () => {
    const limiter = new RateLimiter({ perMinute: 3, dailyBudget: 100 });
    const granted: number[] = [];
    for (let i = 0; i < 5; i++) void limiter.acquire().then(() => granted.push(i));
    await vi.advanceTimersByTimeAsync(0);
    expect(granted).toEqual([0, 1, 2]);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(granted).toEqual([0, 1, 2]);
    await vi.advanceTimersByTimeAsync(2);
    expect(granted).toEqual([0, 1, 2, 3, 4]);
    limiter.close();
  });

  it('serves high priority before queued low priority', async () => {
    const limiter = new RateLimiter({ perMinute: 1, dailyBudget: 100 });
    const order: string[] = [];
    void limiter.acquire('low').then(() => order.push('low-1'));
    void limiter.acquire('low').then(() => order.push('low-2'));
    void limiter.acquire('high').then(() => order.push('high'));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_001);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(order).toEqual(['low-1', 'high', 'low-2']);
    limiter.close();
  });

  it('refuses low priority once only the high-priority reserve is left', async () => {
    const limiter = new RateLimiter({ perMinute: 100, dailyBudget: 10, highPriorityReserve: 0.2 });
    for (let i = 0; i < 8; i++) await limiter.acquire('low');
    await expect(limiter.acquire('low')).rejects.toBeInstanceOf(VendorBudgetExceededError);
    await limiter.acquire('high');
    await limiter.acquire('high');
    await expect(limiter.acquire('high')).rejects.toThrow(/Daily vendor API budget/);
    limiter.close();
  });

  it('resets the daily budget at the vendor day boundary (midnight UTC+8)', async () => {
    const limiter = new RateLimiter({ perMinute: 100, dailyBudget: 1, highPriorityReserve: 0 });
    await limiter.acquire();
    await expect(limiter.acquire()).rejects.toBeInstanceOf(VendorBudgetExceededError);
    vi.setSystemTime(new Date('2026-11-06T15:59:59Z')); // 23:59:59 in UTC+8
    await expect(limiter.acquire()).rejects.toBeInstanceOf(VendorBudgetExceededError);
    vi.setSystemTime(new Date('2026-11-06T16:00:00Z')); // 00:00 next day in UTC+8
    await expect(limiter.acquire()).resolves.toBeUndefined();
    limiter.close();
  });

  it('limits track history to 5 calls per device per day', () => {
    const limiter = new RateLimiter({ perMinute: 10, dailyBudget: 100 });
    for (let i = 0; i < 5; i++) limiter.reserveTrackCall('dev1');
    expect(() => limiter.reserveTrackCall('dev1')).toThrow(VendorBudgetExceededError);
    expect(() => limiter.reserveTrackCall('dev2')).not.toThrow();
    vi.setSystemTime(new Date('2026-11-07T16:00:00Z'));
    expect(() => limiter.reserveTrackCall('dev1')).not.toThrow();
  });

  it('reports stats', async () => {
    const limiter = new RateLimiter({ perMinute: 8, dailyBudget: 1440 });
    await limiter.acquire();
    expect(limiter.stats()).toMatchObject({ usedToday: 1, dailyBudget: 1440, lastMinute: 1, perMinute: 8, queued: 0 });
  });
});
