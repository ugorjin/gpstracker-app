import { createHash, randomBytes } from 'node:crypto';

/** New session token (sent to the client) and its hash (stored in the database). */
export function newSessionToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * Counts failed logins per identifier and IP and blocks for a while after too
 * many. In memory: per process. Use a shared store when running several.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly maxFailures = 5,
    private readonly blockMs = 15 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Milliseconds until the key may try again, or 0. */
  blockedFor(key: string): number {
    const entry = this.failures.get(key);
    if (!entry || entry.count < this.maxFailures) return 0;
    const left = entry.until - this.now();
    if (left <= 0) {
      this.failures.delete(key);
      return 0;
    }
    return left;
  }

  fail(key: string): void {
    const entry = this.failures.get(key);
    const until = this.now() + this.blockMs;
    if (!entry || entry.until < this.now()) this.failures.set(key, { count: 1, until });
    else this.failures.set(key, { count: entry.count + 1, until });
    if (this.failures.size > 100_000) this.failures.clear();
  }

  succeed(key: string): void {
    this.failures.delete(key);
  }
}
