import { describe, expect, it } from 'vitest';
import { VendorClient, md5Hex } from '../src/vendor/client.js';
import { VendorApiError, VendorBudgetExceededError, VendorTransportError } from '../src/vendor/errors.js';
import { RateLimiter } from '../src/vendor/rateLimiter.js';

interface Call {
  action: string | null;
  token: string | null;
  serverid: string | null;
  body: Record<string, unknown>;
}

type Responder = (call: Call, index: number) => unknown;

function fakeVendor(respond: Responder) {
  const calls: Call[] = [];
  let tokenCounter = 0;
  const fetchFn = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const call: Call = {
      action: url.searchParams.get('action'),
      token: url.searchParams.get('token'),
      serverid: url.searchParams.get('serverid'),
      body: JSON.parse(String(init?.body ?? '{}')),
    };
    calls.push(call);
    const custom = respond(call, calls.length - 1);
    const payload =
      custom !== undefined
        ? custom
        : call.action === 'login'
          ? { status: 0, cause: 'OK', token: `tok${++tokenCounter}`, serverid: 3 }
          : { status: 0, cause: 'OK' };
    if (payload instanceof Response) return payload;
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchFn };
}

function makeClient(respond: Responder = () => undefined, opts: { now?: () => number } = {}) {
  const vendor = fakeVendor(respond);
  const client = new VendorClient({
    baseUrl: 'https://api.example.com/',
    username: 'acme',
    password: '123456',
    limiter: new RateLimiter({ perMinute: 1000, dailyBudget: 10_000 }),
    fetch: vendor.fetchFn,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    now: opts.now,
  });
  return { client, calls: vendor.calls };
}

describe('md5Hex', () => {
  it('matches the vendor example (123456)', () => {
    expect(md5Hex('123456')).toBe('e10adc3949ba59abbe56e057f20f883e');
  });
});

describe('VendorClient session handling', () => {
  it('logs in with an MD5 password, then sends token and serverid in the URL', async () => {
    const { client, calls } = makeClient();
    await client.listDevices();
    expect(calls[0]).toMatchObject({
      action: 'login',
      token: null,
      body: { type: 'USER', from: 'WEB', username: 'acme', password: 'e10adc3949ba59abbe56e057f20f883e' },
    });
    expect(calls[1]).toMatchObject({ action: 'querymonitorlist', token: 'tok1', serverid: '3', body: { username: 'acme' } });
  });

  it('reuses the token and logs in only once for concurrent calls', async () => {
    const { client, calls } = makeClient();
    await Promise.all([client.listDevices(), client.lastPositions(), client.listDeviceTypes()]);
    await client.listDevices();
    expect(calls.filter((c) => c.action === 'login')).toHaveLength(1);
  });

  it('logs in again after 23 hours', async () => {
    let now = 0;
    const { client, calls } = makeClient(undefined, { now: () => now });
    await client.listDevices();
    now = 23 * 3_600_000 - 1;
    await client.listDevices();
    now = 23 * 3_600_000 + 1;
    await client.listDevices();
    expect(calls.map((c) => c.action)).toEqual(['login', 'querymonitorlist', 'querymonitorlist', 'login', 'querymonitorlist']);
    expect(calls[4]?.token).toBe('tok2');
  });

  it.each([9903, 9906])('logs in again and retries once when the token is rejected (%i)', async (code) => {
    const { client, calls } = makeClient((call, i) => (call.action === 'lastposition' && i === 1 ? { status: code } : undefined));
    const res = await client.lastPositions();
    expect(res.status).toBe(0);
    expect(calls.map((c) => c.action)).toEqual(['login', 'lastposition', 'login', 'lastposition']);
    expect(calls[3]?.token).toBe('tok2');
  });

  it('throws a clear error when login fails', async () => {
    const { client } = makeClient((call) => (call.action === 'login' ? { status: 1, cause: 'password error' } : undefined));
    await expect(client.listDevices()).rejects.toMatchObject({ name: 'VendorApiError', action: 'login', status: 1 });
  });
});

describe('VendorClient errors', () => {
  it('raises VendorApiError for platform limits', async () => {
    const { client } = makeClient((call) => (call.action === 'lastposition' ? { status: 8905, cause: 'quota' } : undefined));
    const err = await client.lastPositions().catch((e) => e);
    expect(err).toBeInstanceOf(VendorApiError);
    expect(err.isQuotaProblem).toBe(true);
  });

  it('raises VendorTransportError for non-JSON and HTTP errors', async () => {
    const { client } = makeClient((call) => (call.action === 'lastposition' ? new Response('<html>', { status: 200 }) : undefined));
    await expect(client.lastPositions()).rejects.toBeInstanceOf(VendorTransportError);
    const { client: c2 } = makeClient((call) =>
      call.action === 'lastposition' ? new Response('bad gateway', { status: 502 }) : undefined,
    );
    await expect(c2.lastPositions()).rejects.toThrow(/HTTP 502/);
  });

  it('enforces 5 track calls per device per day before contacting the vendor', async () => {
    const { client, calls } = makeClient((call) => (call.action === 'querytracks' ? { status: 0, records: [] } : undefined));
    for (let i = 0; i < 5; i++) await client.queryTracks('dev1', '2026-11-06 00:00:00', '2026-11-06 23:59:59');
    await expect(client.queryTracks('dev1', '2026-11-06 00:00:00', '2026-11-06 23:59:59')).rejects.toBeInstanceOf(
      VendorBudgetExceededError,
    );
    expect(calls.filter((c) => c.action === 'querytracks')).toHaveLength(5);
  });
});

describe('VendorClient commands', () => {
  it('uses LOCK_CAR / UNLOCK_CAR for JT808 devices', async () => {
    const { client, calls } = makeClient((call) => (call.action === 'sendcmd' ? { status: 6 } : undefined));
    const cut = await client.cutEngine({ deviceid: '00006113323', devicetype: 1 });
    await client.restoreEngine({ deviceid: '00006113323', devicetype: 1 });
    expect(calls[1]?.body).toEqual({
      deviceid: '00006113323',
      devicetype: 1,
      cmdcode: 'TYPE_SERVER_LOCK_CAR',
      params: [],
      state: -1,
      cmdpwd: 'zhuyi',
    });
    expect(calls[2]?.body.cmdcode).toBe('TYPE_SERVER_UNLOCK_CAR');
    expect(cut).toMatchObject({ status: 6, accepted: true, statusText: 'Sent and confirmed by device' });
  });

  it('uses the relay command for GT06 devices', async () => {
    const { client, calls } = makeClient((call) => (call.action === 'sendcmd' ? { status: 0 } : undefined));
    await client.cutEngine({ deviceid: '868035043015161', devicetype: 26 });
    await client.restoreEngine({ deviceid: '868035043015161', devicetype: 26 });
    expect(calls[1]?.body).toMatchObject({ cmdcode: 'TYPE_SERVER_SET_RELAY_OIL', params: ['1'] });
    expect(calls[2]?.body).toMatchObject({ cmdcode: 'TYPE_SERVER_SET_RELAY_OIL', params: ['0'] });
  });

  it('returns (does not throw) command results such as "offline, not queued"', async () => {
    const { client } = makeClient((call) => (call.action === 'sendcmd' ? { status: 2, cause: 'offline' } : undefined));
    const res = await client.cutEngine({ deviceid: 'x', devicetype: 26 });
    expect(res).toMatchObject({ status: 2, accepted: false, statusText: 'Device offline, command NOT queued' });
  });

  it('sends speed limit params as strings', async () => {
    const { client, calls } = makeClient();
    await client.setSpeedLimit({ deviceid: 'x', devicetype: 1 }, 100, 35);
    expect(calls[1]?.body).toMatchObject({ cmdcode: 'TYPE_SERVER_SET_SPEED_LIMIT', params: ['100', '35'] });
  });
});

describe('VendorClient request formatting', () => {
  it('formats report dates in the configured timezone (Nigeria, UTC+1)', async () => {
    const { client, calls } = makeClient();
    await client.reportTrips('dev1', new Date('2026-11-05T23:30:00Z'), new Date('2026-11-06T22:59:59Z'));
    expect(calls[1]).toMatchObject({
      action: 'querytrips',
      body: { deviceid: 'dev1', begintime: '2026-11-06 00:30:00', endtime: '2026-11-06 23:59:59', timezone: 1 },
    });
  });

  it('defaults lastposition to all devices from time 0', async () => {
    const { client, calls } = makeClient();
    await client.lastPositions();
    expect(calls[1]?.body).toEqual({ username: 'acme', deviceids: [], lastquerypositiontime: 0 });
  });

  it('hashes sub-account passwords', async () => {
    const { client, calls } = makeClient();
    await client.addUser({ username: 'customer1', password: '123456', usertype: 11 });
    expect(calls[1]?.body).toMatchObject({ creater: 'acme', password: 'e10adc3949ba59abbe56e057f20f883e', usertype: 11 });
  });
});
