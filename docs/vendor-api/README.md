# Vendor API reference (English)

English translation of the hardware vendor's platform API ("gwebmgr"), from the
original Chinese wiki at <https://gitee.com/terry3/gwebmgr/wikis>
(source: the wiki's git repository, retrieved 2026-11-06).

The translation keeps every endpoint, parameter and field from the original.
Remarks marked **Note** are ours (clarifications, inconsistencies spotted in the
original, things to verify with the vendor). The original's typos in field names
(e.g. `validpoistiontime`, `fuledata`, `creater`, `categorys`) are real field
names and are kept as-is.

## Contents

| File | Covers |
|---|---|
| [authentication.md](authentication.md) | `login`, `logout`, password-free login links, `gensharetrackurl` |
| [devices.md](devices.md) | Device list, device types, add / edit / delete device |
| [positions.md](positions.md) | `lastposition` (latest position), offline report, today's driving stats; the full **position record** field list |
| [tracks.md](tracks.md) | `querytracks` (history playback) |
| [commands.md](commands.md) | `sendcmd` (engine cut / restore, speed limit, voice), batch commands, command result codes |
| [geofences.md](geofences.md) | Shared fences and fence groups; simple per-device fences |
| [reports.md](reports.md) | ACC, alarms, fuel (daily / by time / refuel & drain), active safety (ADAS/DMS), stops, geofence alarms, daily mileage, trips, check-in, overspeed |
| [video.md](video.md) | Live video, snapshot, recorded playback, two-way intercom (JT808/JT1078 dashcams) |
| [accounts.md](accounts.md) | Platform sub-accounts |
| [renewals.md](renewals.md) | Device renewal (`chargedevices`) and expiry |
| [data-forwarding.md](data-forwarding.md) | **Push**: position and alarm forwarding, fuel and temperature payloads, `Http Sign Json` signature |
| [wechat-mini-program.md](wechat-mini-program.md) | Opening the vendor's WeChat mini program (China only) |

---

## Terms of use (summary of the vendor's notice)

- The vendor may limit, suspend or end any account's API access at any time,
  especially for frequent or abnormal use, without notice.
- Users must use the API reasonably. The vendor is not responsible for problems
  caused by abuse, scraping or large volumes of repeated requests.
- The vendor may change the usage policy, call limits, start charging, or stop
  the free service at any time.
- Using the API means accepting these terms. The vendor reserves the right to
  take legal action over attacks or disruption.

## Call limits

| Limit | Value |
|---|---|
| IP whitelist changes | At most **5 per account per day** |
| Calls per account per day | **1440 + 5 × number of validly renewed (paid) devices** |
| Track history (`querytracks`) | **5 calls per device per day** |
| Requests per IP | **10 per minute** |

The track history page adds: *track history may only be requested when a user
needs to view it. Servers must not automatically sync tracks. If this is
detected, the vendor may close API access.*

**Note:** this is why our system stores history from the push feed
([data-forwarding.md](data-forwarding.md)) instead of syncing it from the API.

## Request format

- Host: `api.yourdomain.com`: the data server domain. **Ask your service
  provider for the real domain.**
- All calls use **HTTP POST**, over HTTP or HTTPS.
- Request body is **JSON**.
- `action`, `token` and `serverid` go in the URL query string:

```
https://api.yourdomain.com/openapi?action=lastposition&token=6c1f1207c35d97a744837a19663ecdbe&serverid=0
```

| Parameter | Description | Notes |
|---|---|---|
| `action` | The operation, e.g. `lastposition` | Query latest position |
| `token` | e.g. `6c1f1207c35d97a744837a19663ecdbe` | Returned by `login`; required for all other calls |
| `serverid` | int | Returned by `login`; required for all other calls |

**Note:** the login example in the original uses the path `/webapi?action=login`,
while the general description uses `/openapi`. Confirm with the vendor which
path your account uses. Our client makes the path configurable (`VENDOR_API_PATH`).

## Response status

Every response contains `status` (int). Values above 8900 are platform errors:

| `status` | Meaning |
|---|---|
| -1 | Error |
| 0 | Success |
| 8901 | Action not found |
| 8902 | IP rate limit reached |
| 8903 | Account access restricted |
| 8904 | IP not in whitelist |
| 8905 | Account's call quota used up |
| 8906 | Action is forbidden |
| 9903 | Token expired |
| 9906 | Token not found (also: logged in elsewhere) |

Most responses also include `cause` (string): `OK` on success, otherwise a
description of the error.

## Conventions used across the API

| Topic | Convention |
|---|---|
| Device ID | `deviceid`: the device serial number (usually IMEI), globally unique |
| Times in responses | Epoch **milliseconds** (UTC) unless stated otherwise |
| Times in requests | Strings `yyyy-MM-dd HH:mm:ss` or `yyyy-MM-dd`, interpreted in the timezone you pass |
| Timezone parameter | Called `timezone` or `offset` depending on endpoint; hours from UTC, **default 8 (China)**. **Note:** always pass it; Nigeria (WAT) is `1` |
| Coordinates | The push feed and several reports say WGS84. `callat` / `callon` = latitude / longitude "computed" by the platform |
| Distance | Metres |
| Speed | Documented as "metres" in position records and "metres/hour" in reports. **Note:** we treat it as m/h (÷1000 for km/h); verify with a test drive |
| Fuel | 1/100 litre in reports and push; "millilitres" in some position-record fields (see [positions.md](positions.md)) |
| Temperature | 1/100 °C; `65535` = invalid / no probe |
| Voltage | Position records: 0.01 V units, `-1` default, `0` = power cut. Push feed: volts. **Note:** check real data |
| Status / alarm | `status` / `alarm` are JT808 ("部标", Chinese national standard) bit fields; `strstatus` / `stralarm` give the text (Chinese), `*en` variants give English |
| Device protocols | Docs mention **GT06** devices (example `devicetype` 26) and **JT808** devices (`devicetype` 1). Commands differ by protocol |
