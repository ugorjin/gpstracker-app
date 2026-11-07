import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryPushStore } from '../src/storage/memory.js';

describe('serving the web dashboard', () => {
  let app: FastifyInstance;
  const dir = mkdtempSync(join(tmpdir(), 'web-dist-'));

  beforeAll(async () => {
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Dashboard</title>');
    writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    app = await buildApp({
      webDir: dir,
      push: { store: new MemoryPushStore(), appId: 'a', appSecret: 's', allowUnsigned: false, toleranceMs: 1000, storeRaw: false },
    });
  });
  afterAll(() => app.close());

  it('serves index.html at / and for client-side routes, never cached', async () => {
    for (const url of ['/', '/alarms', '/history/868035043015161?x=1']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(200);
      expect(res.body).toContain('Dashboard');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('serves hashed assets with a long cache', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('returns JSON 404 for unknown API paths and missing files', async () => {
    for (const url of ['/api/nope', '/assets/missing.js', '/push/other']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json()).toMatchObject({ error: 'not_found' });
    }
  });

  it('sets basic security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('refuses to start without a built dashboard', async () => {
    await expect(
      buildApp({
        webDir: join(dir, 'assets'),
        push: { store: new MemoryPushStore(), appId: 'a', appSecret: 's', allowUnsigned: false, toleranceMs: 1000, storeRaw: false },
      }),
    ).rejects.toThrow(/no index.html/);
  });
});
