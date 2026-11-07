# GPS tracker platform

Software for a vehicle and asset tracking business (Nigeria and other African
countries), built on top of the hardware vendor's platform API.

- **Vendor API reference (English):** [docs/vendor-api/](docs/vendor-api/README.md)
- **Backend:** [server/](server/)

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
| Customer accounts, dashboard API, web/mobile apps, notifications, billing | | Next |

## Running locally

Requirements: Node.js 20+, PostgreSQL 14+ (or Docker).

```bash
docker compose up -d          # PostgreSQL on localhost:5432
cd server
cp .env.example .env          # then fill in the values
npm install
npm run dev                   # applies migrations, listens on :3000
```

Tests:

```bash
cd server
npm test
```

The PostgreSQL tests run only when `TEST_DATABASE_URL` is set. They **drop
and recreate the schema**, so use a throwaway database:

```bash
TEST_DATABASE_URL=postgres://gpstracker:gpstracker@localhost:5432/gpstracker_test npm test
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
