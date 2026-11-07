# GPS tracker platform

Software for a vehicle and asset tracking business (Nigeria and other African
countries), built on top of the hardware vendor's platform API.

- **Web dashboard:** [web/](web/) (React; live map, history, alarms, engine cut, customers, users)
- **Backend:** [server/](server/)
- **Dashboard API (for the web and mobile apps):** [docs/dashboard-api.md](docs/dashboard-api.md)
- **Vendor API reference (English):** [docs/vendor-api/](docs/vendor-api/README.md)

## How it works

```
Trackers ──> Vendor platform ──(push: every position + alarm, signed)──> POST /push/vendor
                  ▲                                                          │
                  │  API, used sparingly:                                    ▼
                  │  commands, devices, fences,                   PostgreSQL: positions (history),
                  │  video, some reports                          device_state (live), alarms,
                  └──────────── VendorClient (rate-limited) ◄──── raw push log
```

The vendor API has strict limits (10 requests/min per IP, 1440 + 5 × paid
devices per day, track history 5×/device/day, and **automatic track syncing is
forbidden**). So:

1. **Live positions and alarms come from the push feed** ("Http Sign Json"
   data forwarding). They are stored in our own database, which is the source
   for the live map, history playback and our own reports.
2. **The API client is used only for actions**: engine cut/restore, adding
   devices, geofences, video, renewals, vendor-only reports. All calls go
   through a rate limiter that keeps 20% of the daily budget for
   user-triggered actions.

## What's built so far

| Part | Where | Status |
|---|---|---|
| Push receiver: HMAC-SHA256 check, replay protection, raw-body handling | `server/src/push/` | Done, tested (incl. the vendor's official test vector) |
| Payload conversion to our own model (units, invalid sensor values) | `server/src/push/normalize.ts` | Done, tested |
| Storage: history, live state, alarms (de-duplicated), raw log | `server/src/storage/`, `server/src/db/migrations/` | Done, tested on PostgreSQL |
| Vendor API client: login/token refresh, every documented action, typed | `server/src/vendor/client.ts` | Done, tested against a fake vendor (not yet against the real one) |
| Rate limiter: per-minute, daily budget, track limit, priorities | `server/src/vendor/rateLimiter.ts` | Done, tested |
| Accounts: platform → resellers → customers (business / individual), users with roles | `server/src/api/`, `server/src/repo/` | Done, tested on PostgreSQL |
| Login by email or phone (Nigerian formats), scrypt passwords, sessions, brute-force blocking | `server/src/auth/` | Done, tested |
| Dashboard API: devices, live map, live stream (SSE), history, alarms, engine cut with audit log, subscription expiry | `server/src/api/routes/` | Done, tested on PostgreSQL |
| Web dashboard: live map (updates in real time), vehicle details, engine cut/restore with typed confirmation, history playback with stops and trip stats, alarms, vehicles, customers, users, account. Works on phones. | `web/` | Done, tested in a browser (desktop and phone) |
| Demo data and vehicle simulator | `server/src/cli/` | Done |
| Mobile app, SMS/push notifications, payments | | Next |

## Try it with demo data

Requirements: Node.js 22.9+, PostgreSQL 14+ (or Docker).

```bash
docker compose up -d                 # PostgreSQL on localhost:5432
cd server
cp .env.example .env                 # the defaults work for the demo
npm install
npm run seed-demo                    # demo customers, 9 vehicles, 24 h of history, alarms
npm run dev                          # API on :3000
```

In a second terminal, make the demo vehicles move:

```bash
cd server
npm run simulate
```

In a third terminal, start the dashboard:

```bash
cd web
npm install
npm run dev                          # http://localhost:5173
```

Demo logins (password `demo-password`):

| Who | Login | Sees |
|---|---|---|
| Your company (platform admin) | `admin@demo.ng` | Everything, customers, inventory |
| Business fleet owner | `0803 000 0101` | Lagos Logistics: 6 vehicles, one expired, one never installed |
| Fleet control room (operator) | `ops@lagoslogistics.ng` | Same vehicles; can handle alarms, cannot cut engines |
| Individual customer | `0803 000 0201` | One car |
| Reseller admin | `aisha@abujapartners.ng` | Their own customer (Capital Cabs) only |

The demo has no real vendor, so engine-cut shows "could not reach the tracking platform".

## Running for real

Create your company and its first owner (once):

```bash
cd server
ADMIN_PASSWORD='choose-a-strong-one' npm run create-admin -- --company "Your Company Ltd" --name "Your Name" --phone 0803xxxxxxx
```

Production: build the dashboard and let the server host it, so everything is on one domain:

```bash
cd web
npm ci
npm run build
```

```bash
cd server
npm ci
npm run build
WEB_DIST_DIR=../web/dist npm start
```

Put it behind HTTPS (Caddy or nginx). Map tiles: the default OpenStreetMap
servers are not for commercial traffic. Get a key from a tile provider
(MapTiler, Stadia Maps, Thunderforest…) and set `VITE_TILE_URL` in
`web/.env` before building.

## Tests

```bash
cd server
npm test
```

```bash
cd web
npm test
```

The PostgreSQL tests run only when `TEST_DATABASE_URL` is set. They **drop
and recreate the schema**, so use a throwaway database:

```bash
TEST_DATABASE_URL=postgres://gpstracker:gpstracker@localhost:5432/gpstracker_test npm test
```

Browser walkthrough of the whole dashboard (needs the demo data and Playwright):

```bash
node web/e2e/walkthrough.cjs ./screenshots http://localhost:3000
```

## Connecting the vendor platform

1. Get from the vendor: the **API domain**, your account, and confirm the API
   path (`/openapi` or `/webapi`). Ask them to whitelist your server's IP.
2. Deploy the server behind HTTPS (e.g. Caddy or nginx). **Don't let the proxy
   change the request body** (no re-encoding), or signatures will fail.
3. Generate a secret: `openssl rand -hex 24`. Check that the vendor's password
   field keeps the full length (their docs warn it may truncate long values).
4. In the vendor platform, **Forwarding parameters** → new rule:
   - Protocol: **Http Sign Json**
   - URL: `https://<your-host>/push/vendor`
   - Account name: your `PUSH_APP_ID`
   - Password: your `PUSH_APP_SECRET`
   - Ask the vendor to forward **alarms** as well as positions.
5. Watch `vendor_push_log` for the first pushes. Then check units against a
   real drive (speed and voltage units are ambiguous in the docs; see the
   notes in [docs/vendor-api/README.md](docs/vendor-api/README.md)).

## Push receiver behaviour

| Situation | Response |
|---|---|
| Valid signature, stored | `200 {"code":0}` (the vendor needs a non-empty body) |
| Bad / missing signature, stale timestamp (>5 min), reused nonce | `401` |
| Body is not JSON | `400` (raw body kept in `vendor_push_log`) |
| Valid JSON but unusable (no device id, 0,0 coordinates...) | `200`, logged with the problem so it isn't retried forever |
| Database error | `500`, so the vendor sees the push as failed |

Unsigned pushes are rejected unless `PUSH_ALLOW_UNSIGNED=true` (for testing only).

## Notes for Nigeria / Africa

- Report timezone defaults to **UTC+1 (WAT)** (`VENDOR_TIMEZONE`); the vendor's
  default is China (UTC+8). For other countries, pass the customer's offset.
- All stored times are UTC; convert per customer in the UI.
- Coordinates in the push feed are WGS84, so they work directly with
  OpenStreetMap / Google Maps.
- The vendor's daily API counters probably reset at midnight China time,
  which is **17:00 in Nigeria** (neither country uses daylight saving). The
  rate limiter assumes this; confirm with the vendor.
