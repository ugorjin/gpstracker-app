import { describe, expect, it } from 'vitest';
import { buildSign, NonceCache, verifySignature } from '../src/push/signature.js';

// Official self-test case from the vendor's forwarding documentation (section 5).
const VECTOR = {
  appId: 'tracker',
  appSecret: 'qwert',
  timestamp: '1789347000000',
  nonce: '0123456789abcdef0123456789abcdef',
  body: '{"deviceid":"860123456789012"}',
  sign: '69123a4421cde65ee6cfc45bddffdb48c3742931d62768a9863c9dd3a6218044',
};

const opts = { appId: VECTOR.appId, appSecret: VECTOR.appSecret, toleranceMs: 5 * 60_000, now: Number(VECTOR.timestamp) };
const headers = { appId: VECTOR.appId, timestamp: VECTOR.timestamp, nonce: VECTOR.nonce, sign: VECTOR.sign };

describe('buildSign', () => {
  it('matches the vendor documentation test vector', () => {
    expect(buildSign(VECTOR.appId, VECTOR.appSecret, VECTOR.timestamp, VECTOR.nonce, VECTOR.body)).toBe(VECTOR.sign);
  });
});

describe('verifySignature', () => {
  it('accepts the documented example', () => {
    expect(verifySignature(headers, VECTOR.body, opts)).toEqual({ ok: true });
  });

  it('accepts an upper-case signature (comparison is case-insensitive)', () => {
    expect(verifySignature({ ...headers, sign: VECTOR.sign.toUpperCase() }, VECTOR.body, opts)).toEqual({ ok: true });
  });

  it('rejects a body changed by even one character', () => {
    expect(verifySignature(headers, '{"deviceid":"860123456789013"}', opts)).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects re-serialised JSON with different whitespace', () => {
    expect(verifySignature(headers, '{ "deviceid": "860123456789012" }', opts)).toMatchObject({ ok: false });
  });

  it('rejects the wrong secret', () => {
    expect(verifySignature(headers, VECTOR.body, { ...opts, appSecret: 'other' })).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects an unknown app id', () => {
    expect(verifySignature({ ...headers, appId: 'someone' }, VECTOR.body, opts)).toEqual({ ok: false, reason: 'wrong_app_id' });
  });

  it('rejects a timestamp in seconds instead of milliseconds', () => {
    expect(verifySignature({ ...headers, timestamp: '1789347000' }, VECTOR.body, opts)).toEqual({ ok: false, reason: 'bad_timestamp' });
  });

  it('rejects timestamps more than 5 minutes away', () => {
    expect(verifySignature(headers, VECTOR.body, { ...opts, now: opts.now + 5 * 60_000 + 1 })).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
    expect(verifySignature(headers, VECTOR.body, { ...opts, now: opts.now - 5 * 60_000 })).toEqual({ ok: true });
  });

  it('rejects missing headers', () => {
    expect(verifySignature({ ...headers, nonce: undefined }, VECTOR.body, opts)).toEqual({ ok: false, reason: 'missing_headers' });
  });

  it('rejects a malformed signature without throwing', () => {
    expect(verifySignature({ ...headers, sign: 'zz' }, VECTOR.body, opts)).toEqual({ ok: false, reason: 'bad_signature' });
  });
});

describe('NonceCache', () => {
  it('rejects a nonce seen within the TTL and allows it after', () => {
    const cache = new NonceCache(1000);
    expect(cache.checkAndAdd('a', 0)).toBe(true);
    expect(cache.checkAndAdd('a', 500)).toBe(false);
    expect(cache.checkAndAdd('a', 1001)).toBe(true);
  });

  it('evicts expired entries and caps its size', () => {
    const cache = new NonceCache(1000, 3);
    for (const n of ['a', 'b', 'c', 'd', 'e']) cache.checkAndAdd(n, 0);
    expect(cache.size).toBeLessThanOrEqual(4);
    cache.checkAndAdd('f', 2000);
    expect(cache.size).toBe(1);
  });
});
