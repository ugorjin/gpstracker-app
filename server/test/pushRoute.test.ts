import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { Alarm, Position } from '../src/domain.js';
import { PushEvents } from '../src/push/routes.js';
import { buildSign } from '../src/push/signature.js';
import { MemoryPushStore } from '../src/storage/memory.js';
import { alarmPush, positionPush } from './fixtures.js';

const APP_ID = 'tracker';
const SECRET = 'test-secret';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function setup(overrides: { allowUnsigned?: boolean; store?: MemoryPushStore } = {}) {
  const store = overrides.store ?? new MemoryPushStore();
  const events = new PushEvents();
  const seen = { positions: [] as Position[], alarms: [] as Alarm[] };
  events.on('position', (p) => seen.positions.push(p));
  events.on('alarm', (a) => seen.alarms.push(a));
  app = await buildApp({
    events,
    push: {
      store,
      appId: APP_ID,
      appSecret: SECRET,
      allowUnsigned: overrides.allowUnsigned ?? false,
      toleranceMs: 5 * 60_000,
      storeRaw: true,
    },
  });
  return { app, store, seen };
}

function signedHeaders(body: string, opts: { nonce?: string; timestamp?: number; secret?: string } = {}) {
  const timestamp = String(opts.timestamp ?? Date.now());
  const nonce = opts.nonce ?? randomUUID().replace(/-/g, '');
  return {
    'content-type': 'application/json; charset=UTF-8',
    'x-app-id': APP_ID,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-sign': buildSign(APP_ID, opts.secret ?? SECRET, timestamp, nonce, body),
  };
}

describe('POST /push/vendor', () => {
  it('stores a signed position push and answers 200 with a non-empty body', async () => {
    const { app, store, seen } = await setup();
    const body = JSON.stringify(positionPush);
    const res = await app.inject({ method: 'POST', url: '/push/vendor', headers: signedHeaders(body), payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ code: 0 });
    expect(store.positions.size).toBe(1);
    expect(store.state.get('868035043015161')?.speedKmh).toBe(45.6);
    expect(store.raw[0]).toMatchObject({ kind: 'position', signed: true, body });
    expect(seen.positions).toHaveLength(1);
  });

  it('stores a signed alarm push', async () => {
    const { app, store, seen } = await setup();
    const body = JSON.stringify(alarmPush);
    const res = await app.inject({ method: 'POST', url: '/push/vendor', headers: signedHeaders(body), payload: body });
    expect(res.statusCode).toBe(200);
    expect(store.alarms.size).toBe(1);
    expect(seen.alarms[0]?.alarmText).toBe('SOS');
  });

  it('verifies the signature over the exact raw body (whitespace preserved)', async () => {
    const { app, store } = await setup();
    const body = JSON.stringify(positionPush, null, 2);
    const res = await app.inject({ method: 'POST', url: '/push/vendor', headers: signedHeaders(body), payload: body });
    expect(res.statusCode).toBe(200);
    expect(store.raw[0]?.body).toBe(body);
  });

  it('rejects a bad signature', async () => {
    const { app, store } = await setup();
    const body = JSON.stringify(positionPush);
    const res = await app.inject({
      method: 'POST',
      url: '/push/vendor',
      headers: signedHeaders(body, { secret: 'wrong' }),
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'bad_signature' });
    expect(store.positions.size).toBe(0);
    expect(store.raw).toHaveLength(0);
  });

  it('rejects a replayed request', async () => {
    const { app, store } = await setup();
    const body = JSON.stringify(positionPush);
    const headers = signedHeaders(body);
    expect((await app.inject({ method: 'POST', url: '/push/vendor', headers, payload: body })).statusCode).toBe(200);
    const again = await app.inject({ method: 'POST', url: '/push/vendor', headers, payload: body });
    expect(again.statusCode).toBe(401);
    expect(again.json()).toMatchObject({ error: 'replayed_nonce' });
    expect(store.raw).toHaveLength(1);
  });

  it('rejects old timestamps', async () => {
    const { app } = await setup();
    const body = JSON.stringify(positionPush);
    const res = await app.inject({
      method: 'POST',
      url: '/push/vendor',
      headers: signedHeaders(body, { timestamp: Date.now() - 10 * 60_000 }),
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'stale_timestamp' });
  });

  it('rejects unsigned pushes by default', async () => {
    const { app, store } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/push/vendor',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(positionPush),
    });
    expect(res.statusCode).toBe(401);
    expect(store.positions.size).toBe(0);
  });

  it('accepts unsigned pushes when explicitly allowed, and marks them unsigned', async () => {
    const { app, store } = await setup({ allowUnsigned: true });
    const res = await app.inject({
      method: 'POST',
      url: '/push/vendor',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(positionPush),
    });
    expect(res.statusCode).toBe(200);
    expect(store.raw[0]?.signed).toBe(false);
    expect(store.positions.size).toBe(1);
  });

  it('answers 400 for invalid JSON and keeps the raw body', async () => {
    const { app, store } = await setup();
    const body = '{not json';
    const res = await app.inject({ method: 'POST', url: '/push/vendor', headers: signedHeaders(body), payload: body });
    expect(res.statusCode).toBe(400);
    expect(store.raw[0]).toMatchObject({ problem: 'invalid JSON', body });
  });

  it('acknowledges unusable payloads (so the vendor does not retry forever) and logs them', async () => {
    const { app, store } = await setup();
    const body = JSON.stringify({ hello: 'world' });
    const res = await app.inject({ method: 'POST', url: '/push/vendor', headers: signedHeaders(body), payload: body });
    expect(res.statusCode).toBe(200);
    expect(store.raw[0]).toMatchObject({ kind: 'unknown', problem: 'missing deviceid' });
  });

  it('does not emit duplicates twice', async () => {
    const { app, store, seen } = await setup();
    const body = JSON.stringify(positionPush);
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ method: 'POST', url: '/push/vendor', headers: signedHeaders(body), payload: body });
      expect(res.statusCode).toBe(200);
    }
    expect(store.positions.size).toBe(1);
    expect(seen.positions).toHaveLength(1);
  });

  it('answers 500 when storage fails, so the vendor sees the push as failed', async () => {
    const store = new MemoryPushStore();
    store.savePosition = async () => {
      throw new Error('db down');
    };
    const { app } = await setup({ store });
    const body = JSON.stringify(positionPush);
    const res = await app.inject({ method: 'POST', url: '/push/vendor', headers: signedHeaders(body), payload: body });
    expect(res.statusCode).toBe(500);
  });

  it('accepts a body sent with a non-JSON content type', async () => {
    const { app, store } = await setup();
    const body = JSON.stringify(positionPush);
    const headers = { ...signedHeaders(body), 'content-type': 'text/plain' };
    const res = await app.inject({ method: 'POST', url: '/push/vendor', headers, payload: body });
    expect(res.statusCode).toBe(200);
    expect(store.positions.size).toBe(1);
  });
});

describe('GET /health', () => {
  it('reports ok', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });
});
