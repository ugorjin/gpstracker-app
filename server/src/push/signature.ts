import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signature scheme of the vendor's "Http Sign Json" forwarding:
 *
 *   content = appId + "\n" + timestamp + "\n" + nonce + "\n" + rawBody
 *   sign    = lowercase hex( HMAC-SHA256(key = appSecret, data = content) )
 *
 * `timestamp` is in milliseconds. The raw body must be used byte-for-byte as
 * received; never re-serialise parsed JSON before verifying.
 */
export function buildSign(appId: string, appSecret: string, timestamp: string | number, nonce: string, body: string): string {
  const content = `${appId}\n${timestamp}\n${nonce}\n${body}`;
  return createHmac('sha256', Buffer.from(appSecret, 'utf8')).update(content, 'utf8').digest('hex');
}

export type VerifyFailure =
  | 'missing_headers'
  | 'wrong_app_id'
  | 'bad_timestamp'
  | 'stale_timestamp'
  | 'bad_signature'
  | 'replayed_nonce';

export interface SignedHeaders {
  appId?: string;
  timestamp?: string;
  nonce?: string;
  sign?: string;
}

export interface VerifyOptions {
  appId: string;
  appSecret: string;
  toleranceMs: number;
  now?: number;
}

export function verifySignature(
  headers: SignedHeaders,
  body: string,
  opts: VerifyOptions,
): { ok: true } | { ok: false; reason: VerifyFailure } {
  const { appId, timestamp, nonce, sign } = headers;
  if (!appId || !timestamp || !nonce || !sign) return { ok: false, reason: 'missing_headers' };
  if (appId !== opts.appId) return { ok: false, reason: 'wrong_app_id' };

  // Must be a 13-digit millisecond timestamp (seconds is a common sender bug).
  if (!/^\d{13}$/.test(timestamp)) return { ok: false, reason: 'bad_timestamp' };
  const now = opts.now ?? Date.now();
  if (Math.abs(now - Number(timestamp)) > opts.toleranceMs) return { ok: false, reason: 'stale_timestamp' };

  const expected = buildSign(appId, opts.appSecret, timestamp, nonce, body);
  const given = sign.toLowerCase();
  if (given.length !== expected.length || !/^[0-9a-f]+$/.test(given)) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return { ok: false, reason: 'bad_signature' };

  return { ok: true };
}

/**
 * Remembers nonces for the timestamp tolerance window so the same signed
 * request cannot be replayed. In memory: use a shared store (e.g. Redis) when
 * running more than one receiver instance.
 */
export class NonceCache {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 200_000,
  ) {}

  /** Returns false if the nonce was already used within the TTL. */
  checkAndAdd(nonce: string, now = Date.now()): boolean {
    this.evict(now);
    const expiry = this.seen.get(nonce);
    if (expiry !== undefined && expiry > now) return false;
    this.seen.set(nonce, now + this.ttlMs);
    return true;
  }

  get size(): number {
    return this.seen.size;
  }

  private evict(now: number): void {
    // Map keeps insertion order, and every entry has the same TTL, so the
    // oldest entries are first.
    for (const [key, expiry] of this.seen) {
      if (expiry > now && this.seen.size <= this.maxEntries) break;
      this.seen.delete(key);
    }
  }
}
