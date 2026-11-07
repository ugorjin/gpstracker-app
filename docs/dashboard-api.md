# Dashboard API

The API the web dashboard and mobile apps use. Base path: `/api`. JSON in, JSON out.

## Accounts model

```
Platform (your company)
├── Reseller (optional, can be nested)
│   ├── Customer: business fleet
│   └── Customer: individual
└── Customer
```

- Every user belongs to one organisation and sees **that organisation and
  everything below it**. Anything outside their branch returns `404` (not `403`),
  so ids can't be probed.
- **Staff** = users of the platform or a reseller. Staff admins create customer
  accounts, register trackers, assign them to customers and set subscription dates.
- **Roles** inside an organisation:

| Role | Can |
|---|---|
| `owner` | Everything below, plus manage other owners |
| `admin` | Manage users (not owners), edit devices, **engine cut/restore**, speed limit |
| `operator` | Acknowledge alarms |
| `viewer` | Read only |

Nobody can give a role higher than their own (staff admins can create a
customer's first owner). An organisation always keeps at least one active owner.

- **Subscriptions:** each device has `paidUntil` (`null` = no expiry). When it has
  passed, customers see the device with `status: "subscription_expired"` and no
  position; history and commands return `402`. Staff still see everything.

## Authentication

```http
POST /api/auth/login
{ "login": "0803 123 4567", "password": "..." }
```

`login` is an email address or a phone number. Phone numbers are normalised to
E.164, so `08031234567`, `+234 803 123 4567` and `2348031234567` are the same
login (numbers starting with `0` use the default country, `DEFAULT_COUNTRY`, Nigeria by default).

Response:

```json
{ "token": "…", "expiresAt": "2026-12-07T…", "user": { … }, "org": { … } }
```

Send the token on every other request: `Authorization: Bearer <token>`.
Sessions last `SESSION_TTL_DAYS` (default 30). After 5 failed attempts, a login
is blocked for 15 minutes (`429`).

| Method & path | Description |
|---|---|
| `POST /auth/logout` | End this session. `204` |
| `GET /me` | Current user, organisation and a `permissions` object (`isStaff`, `manageUsers`, `manageCustomers`, `manageDeviceInventory`, `sendCommands`, `acknowledgeAlarms`) for showing/hiding UI |
| `POST /me/password` | `{ currentPassword, newPassword }`; min 8 characters; ends your other sessions. `204` |

## Organisations

| Method & path | Who | Description |
|---|---|---|
| `GET /orgs?type=&q=` | all | Organisations you can see |
| `GET /orgs/:id` | all | One organisation |
| `POST /orgs` | staff admins | Create a reseller or customer (see below) |
| `PATCH /orgs/:id` | admins | `name`, `countryCode`, `utcOffsetMinutes`, `phone`, `email`; staff also `active`, `customerKind` of organisations below them |

Create a customer and its owner in one step (rolled back together if anything fails):

```json
POST /api/orgs
{
  "type": "customer",
  "customerKind": "business",          // or "individual"; required for customers
  "name": "Kano Haulage Ltd",
  "parentId": 12,                       // optional, defaults to your organisation
  "countryCode": "NG",                  // optional, defaults to the parent's
  "utcOffsetMinutes": 60,               // optional, defaults to the parent's
  "phone": "0803 999 8888",
  "owner": { "name": "Musa", "phone": "0803 777 6666", "password": "…" }
}
```

Deactivating an organisation (`"active": false`) logs all its users out.

## Users

| Method & path | Who | Description |
|---|---|---|
| `GET /orgs/:id/users` | admins | Users of an organisation |
| `POST /orgs/:id/users` | admins | `{ name, email?, phone?, password, role }`; needs an email or phone |
| `PATCH /users/:id` | admins | `name`, `email`, `phone`, `role`, `active`, `password` (reset) |

Deactivating a user or resetting their password ends their sessions. You can't
change your own role or deactivate yourself. Duplicate email/phone returns `409`.

## Devices

| Method & path | Who | Description |
|---|---|---|
| `GET /devices?orgId=&q=&includeInactive=` | all | Devices with live position and status |
| `GET /devices/:id` | all | One device (`:id` = tracker IMEI) |
| `POST /devices` | staff admins | Register a tracker (see below) |
| `PATCH /devices/:id` | admins | Customers: `name`, `kind`, `plateNumber`, `notes`. Staff also: `orgId`, `vendorDeviceType`, `simNumber`, `active`, `paidUntil`, `installedAt` |
| `GET /devices/unregistered` | platform admins | Trackers sending data that aren't assigned yet |

```json
POST /api/devices
{
  "deviceId": "868035043015161",
  "orgId": 42,
  "name": "Truck 7",
  "kind": "truck",                    // car motorbike truck bus boat generator asset person pet other
  "plateNumber": "KJA-456-AB",
  "vendorDeviceType": 1,              // vendor devicetype; 1 = JT808, decides command codes
  "simNumber": "0803…",
  "paidUntil": "2027-11-07T00:00:00Z",
  "registerWithVendor": true          // also call the vendor's adddevice
}
```

Device object:

```json
{
  "id": "868035043015161",
  "orgId": 42,
  "name": "Truck 7",
  "kind": "truck",
  "plateNumber": "KJA-456-AB",
  "notes": null,
  "active": true,
  "paidUntil": "2027-11-07T00:00:00.000Z",
  "subscriptionActive": true,
  "status": "moving",                 // moving | stopped | offline | no_data | subscription_expired
  "position": {
    "recordedAt": "…", "lat": 6.4541, "lon": 3.3947, "speedKmh": 30, "course": 90,
    "moving": true, "voltage": 12.6, "batteryPct": 90, "odometerKm": 1234.6,
    "source": "gps", "statusText": "ACC ON", "alarmText": null,
    "fuel": null, "sensors": null, "lastSeenAt": "…"
  }
  // staff only: vendorDeviceType, simNumber, installedAt, createdAt
}
```

`offline` = no data received for `OFFLINE_AFTER_MINUTES` (default 30).

## Live map

| Method & path | Description |
|---|---|
| `GET /live` | All visible devices with position: `{ serverTime, devices }` |
| `GET /live?since=<serverTime>` | Only devices that changed since the previous call |
| `GET /stream?access_token=<token>` | Server-Sent Events stream of updates |

```js
const es = new EventSource(`/api/stream?access_token=${token}`);
es.addEventListener('ready', (e) => console.log(JSON.parse(e.data)));     // { serverTime, devices }
es.addEventListener('position', (e) => updateMarker(JSON.parse(e.data))); // { deviceId, recordedAt, lat, lon, speedKmh, course, moving, statusText, alarmText }
es.addEventListener('alarm', (e) => showAlert(JSON.parse(e.data)));       // { deviceId, alarmCode, alarmText, startedAt, lat, lon }
```

The stream is the only endpoint that accepts the token in the URL (browsers
can't set headers on `EventSource`); tokens are removed from server logs.
Recommended client pattern: load `/live` once, then apply stream events;
if the stream drops, reconnect and call `/live?since=` to catch up.

## History

`GET /devices/:id/history?from=<ISO>&to=<ISO>`: up to 7 days per request,
20 000 points. From our own database, so it doesn't use the vendor's API quota.

```json
{ "deviceId": "…", "from": "…", "to": "…", "truncated": false,
  "points": [{ "recordedAt": "…", "lat": 6.45, "lon": 3.39, "speedKmh": 30, "course": 90, "moving": true, "statusText": "…", "alarmText": null }] }
```

## Commands

`POST /devices/:id/commands` (owners and admins). Every attempt is recorded.

```json
{ "command": "engine_cut", "confirm": true }
{ "command": "engine_restore", "confirm": true }
{ "command": "speed_limit", "confirm": true, "speedKmh": 100, "durationSeconds": 30 }
```

`confirm: true` is required; the UI should ask "Cut the engine of Truck 7
(KJA-456-AB)?" before sending.

| Response | Meaning |
|---|---|
| `200 { accepted: true, status, statusText, commandId }` | Confirmed by the device, sent, or queued until it reconnects |
| `409 { accepted: false, status, statusText }` | Not done, e.g. device offline and not queued (`status` 2) |
| `402` | Subscription expired |
| `502` / `503` | Vendor platform error, unreachable, or our daily call budget used up |

`GET /devices/:id/commands`: last 100 commands with who sent them and the result.

## Alarms

| Method & path | Who | Description |
|---|---|---|
| `GET /alarms?status=open\|acknowledged\|all&deviceId=&from=&to=&limit=&beforeId=` | all | Newest first. For the next page, pass `beforeId=<nextBeforeId>` |
| `POST /alarms/:id/acknowledge` | operators+ | `{ note? }`; `409` if already acknowledged |

## Errors

```json
{ "error": "bad_request", "message": "Invalid input", "details": [{ "field": "owner.phone", "message": "Invalid phone number" }] }
```

| Status | `error` |
|---|---|
| 400 | `bad_request` (with `details` for invalid fields) |
| 401 | `unauthorized`: log in again |
| 402 | `subscription_expired` |
| 403 | `forbidden`: role doesn't allow it |
| 404 | `not_found`: doesn't exist or not in your branch |
| 409 | `conflict`: duplicate, already acknowledged, command not accepted |
| 429 | `too_many_requests`: login blocked |
| 502/503 | `vendor_error`, `vendor_unreachable`, `vendor_busy` |
