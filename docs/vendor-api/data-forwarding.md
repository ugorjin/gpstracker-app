# Data forwarding (push)

The platform can **push** data to your server as it arrives. Two formats are
supported: parsed JSON and raw device packets. Only JSON is documented.

Our receiver: `POST /push/vendor` (see `server/src/push/`).

## Position message

| Field | Type | Description | Details |
|---|---|---|---|
| `devicename` | String | Device name | Editable on the website |
| `deviceid` | String | Device id | Unique serial number |
| `lat` | double | Latitude | **WGS84** |
| `lon` | double | Longitude | **WGS84** |
| `arrivedtime` | long | Server receive time | UTC |
| `updatetime` | long | Update time | UTC. **Sort tracks by this** |
| `validpoistiontime` | long | Last fix time | Last valid fix, UTC (field name misspelt; kept for compatibility) |
| `radius` | double | Accuracy radius | Metres |
| `speed` | double | Speed | "metres" (see README note) |
| `altitude` | double | Altitude | Metres |
| `course` | int | Heading | 0–360° |
| `totaldistance` | int | Total mileage | Computed by the server, metres |
| `status` | long | Status | Not very useful |
| `strstatus` | String | Status text | For display |
| `alarm` | long | Alarm | |
| `stralarm` | String | Alarm text | For display |
| `gotsrc` | String | Position type | `cell`, `wifi`, `gps` |
| `rxlevel` | int | Signal strength % | Fixed values 10, 40, 60, 80, 100 |
| `voltagev` | double | Voltage, V | Some devices have no voltage |
| `voltagepercent` | int | Battery % | Some devices compute it from the number of reports |
| `gpsvalidnum` | int | Satellites | |
| `iostatus` | int | I/O status | Default -1 |
| `rotatestatus` | int | Drum rotation | Default -1; 0 unknown, 1 forward (empty), 2 reverse (loaded), 3 stopped |
| `reportmode` | short | Report mode | See [report modes](positions.md#report-modes-reportmode) |
| `moving` | int | Moving | 0 no, 1 yes; moved more than 1 m since the previous position |
| `fuledata` | UniFuelData | Fuel data | See below (sic) |
| `tempdata` | SuperviseTemp | Temperature/humidity | See below |
| `parkduration` | long | Stopped for | Milliseconds |
| `devicealarm` | Object | Alarm object | Default `null`. A separate alarm record; you can ignore the other data and only handle `devicealarm`. Format: [alarm message](#alarm-message) |

### Fuel data (`fuledata`)

| Field | Type | Description | Details |
|---|---|---|---|
| `totalRunningAd` | int | Total driving fuel consumption | 1/100 L |
| `totalNotRunningAd` | int | Total non-driving fuel consumption | 1/100 L |
| `ad0` | int | Fuel level, channel 1 | 1/100 L |
| `ad1` | int | Fuel level, channel 2 | 1/100 L |
| `ad2` | int | Fuel level, channel 3 | 1/100 L |
| `ad3` | int | Fuel level, channel 4 | 1/100 L |

### Temperature / humidity data (`tempdata`)

| Field | Type | Description | Details |
|---|---|---|---|
| `temp1` | int | Temperature, channel 1 | 1/100 °C; 65535 = invalid |
| `temp2` | int | Temperature, channel 2 | 1/100 °C; 65535 = invalid |
| `temp3` | int | Temperature, channel 3 | 1/100 °C; 65535 = invalid |
| `temp4` | int | Temperature, channel 4 | 1/100 °C; 65535 = invalid |
| `humi1` | int | Humidity, channel 1 | 1/10; -1 = invalid |
| `humi2` | int | Humidity, channel 2 (original says "channel 4") | 1/10; -1 = invalid |

## Alarm message

When a device raises an alarm it is pushed separately.

| Field | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device id | Unique serial number |
| `lat` | double | Latitude | WGS84 |
| `lon` | double | Longitude | WGS84 |
| `arrivedtime` | long | Server receive time | UTC |
| `updatetime` | long | Update time | UTC; sort by this |
| `speed` | double | Speed | "metres" |
| `altitude` | double | Altitude | Metres |
| `course` | int | Heading | 0–360° |
| `totaldistance` | int | Total mileage | Metres |
| `alarmtype` | int | Alarm kind | 1 normal, 2 video |
| `alarm` | long | Alarm | |
| `stralarm` | String | Alarm text | For display |
| `startalarmtime` | long | Alarm start | Some alarms are continuous and have a start and a last time |
| `lastalarmtime` | long | Last alarm time | |
| `alarmcount` | int | Count | How many times a continuous alarm has fired |

---

# Signed HTTP JSON forwarding ("Http Sign Json")

With the forwarding protocol **Http Sign Json**, the platform `POST`s each
position as JSON to your server in real time, and signs the body with
**HMAC-SHA256**. The receiver verifies the signature to confirm the data came
from the platform and wasn't changed.

## 1. Platform configuration

In **Forwarding parameters** (转发参数), create a forwarding rule with protocol
**Http Sign Json**:

| Setting | Value |
|---|---|
| Forwarding URL | The receiver's address (`http(s)://host/path`) |
| Account name | The receiver's **AppId** |
| Password | The receiver's **AppSecret** |

- The account name is sent as header `X-App-Id`. The password is only used to
  compute the signature and never appears in requests.
- Leading/trailing spaces are removed when saving.
- **If the account name or password is empty, the platform falls back to plain
  unsigned JSON** (data is still sent, but without `X-App-Id`, `X-Timestamp`,
  `X-Nonce`, `X-Sign`). Always fill in both.
- The password field has a legacy length limit. If the AppSecret is long, check
  the saved value is complete; a truncated secret makes verification fail.

## 2. Request format

- Method: `POST`
- Body: one position object (JSON, compact, UTF-8, no extra whitespace)

Headers:

| Header | Example | Description |
|---|---|---|
| `Content-Type` | `application/json; charset=UTF-8` | Fixed |
| `X-App-Id` | `tracker` | The configured account name |
| `X-Timestamp` | `1789347000000` | Unix time in **milliseconds** (13 digits, not seconds) |
| `X-Nonce` | `0123456789abcdef0123456789abcdef` | Random string, 32 lowercase hex characters (UUID without dashes) |
| `X-Sign` | `69123a44...6218044` | Signature, 64 lowercase hex characters |

Example:

```bash
curl -X POST 'https://your-host/track/receive' \
  -H 'Content-Type: application/json; charset=UTF-8' \
  -H 'X-App-Id: tracker' \
  -H 'X-Timestamp: 1789347000000' \
  -H 'X-Nonce: 0123456789abcdef0123456789abcdef' \
  -H 'X-Sign: 69123a4421cde65ee6cfc45bddffdb48c3742931d62768a9863c9dd3a6218044' \
  -d '{"deviceid":"860123456789012"}'
```

## 3. Signature

### 3.1 String to sign

Join four parts with newline `\n` (ASCII 0x0A). `body` is the **raw request body string**:

```
appId + "\n" + timestamp + "\n" + nonce + "\n" + body
```

### 3.2 Algorithm

```
sign = Hex( HMAC-SHA256( key = appSecret, data = stringToSign ) )
```

- Hex output, **lowercase**, 64 characters.
- UTF-8 throughout.
- The body must match the transmitted bytes **exactly**: the receiver
  recomputes the signature from the body it received.

### 3.3 Reference implementation (sender, Java)

```java
List<Header> headers = new ArrayList<Header>();
headers.add(new BasicHeader("Content-Type", CONTENT_TYPE_JSON));   // application/json; charset=UTF-8
headers.add(new BasicHeader(HEADER_APP_ID, appId));                // X-App-Id
headers.add(new BasicHeader(HEADER_TIMESTAMP, "" + timestamp));    // X-Timestamp, milliseconds
headers.add(new BasicHeader(HEADER_NONCE, nonce));                 // X-Nonce
headers.add(new BasicHeader(HEADER_SIGN, sign));                   // X-Sign

private static String hmacSha256Hex(String secret, String content) {
    Mac hmacSha256 = Mac.getInstance("HmacSHA256");
    byte[] keyBytes = secret.getBytes("UTF-8");
    hmacSha256.init(new SecretKeySpec(keyBytes, 0, keyBytes.length, "HmacSHA256"));
    byte[] signBytes = hmacSha256.doFinal(content.getBytes("UTF-8"));
    return bytesToHex(signBytes);   // lowercase hex
}

long timestamp = System.currentTimeMillis();                         // milliseconds
String nonce = UUID.randomUUID().toString().replace("-", "");
String signContent = appId + "\n" + timestamp + "\n" + nonce + "\n" + body;
String sign = hmacSha256Hex(appSecret, signContent);
```

## 4. Receiver verification steps

1. **Read the raw body first**: read the raw input stream to get the body
   string. Do not deserialise and re-serialise: field order, whitespace and
   `null` handling change, and the signature will not match.
2. Read headers `X-App-Id`, `X-Timestamp`, `X-Nonce`, `X-Sign`.
3. Recompute the signature with the AppSecret you gave the platform, per 3.1.
4. Compare signatures **case-insensitively**.
5. Check the timestamp: more than **5 minutes** from local time = expired
   (replay protection). Also de-duplicate `nonce` for a short time.
6. On success, return **HTTP 200 with a non-empty body** (e.g. `{"code":0}`).
   The platform counts a push as delivered only on a non-empty response.

```java
public static boolean verifySign(String appId, String appSecret, long timestamp, String nonce,
                                 String body, String sign, long tolerantMillis) {
    if (sign == null || sign.length() == 0) return false;
    long now = System.currentTimeMillis();
    if (Math.abs(now - timestamp) > tolerantMillis) return false;   // default 5 * 60 * 1000
    String expectedSign = buildSign(appId, appSecret, timestamp, nonce, body);
    return expectedSign.equalsIgnoreCase(sign);
}
```

Quick check with openssl:

```bash
printf 'tracker\n1789347000000\n0123456789abcdef0123456789abcdef\n{"deviceid":"860123456789012"}' \
  | openssl dgst -sha256 -hmac 'qwert'
```

## 5. Test case

| Item | Value |
|---|---|
| AppId | `tracker` |
| AppSecret | `qwert` |
| X-Timestamp | `1789347000000` |
| X-Nonce | `0123456789abcdef0123456789abcdef` |
| body | `{"deviceid":"860123456789012"}` |

String to sign (4 lines, joined by `\n`):

```
tracker
1789347000000
0123456789abcdef0123456789abcdef
{"deviceid":"860123456789012"}
```

Expected signature:

```
69123a4421cde65ee6cfc45bddffdb48c3742931d62768a9863c9dd3a6218044
```

If your implementation produces this value, the signing logic is correct.
(Checked by `server/test/signature.test.ts`.)

## 6. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Signature never matches | The body was modified: deserialised and re-serialised, trimmed or reformatted by a framework, or nginx decompressed it and the original wasn't used |
| Signature mismatch (maybe different length) | Wrong AppSecret, or it was truncated when saved: compare both sides |
| Always "timestamp expired" | `X-Timestamp` in seconds (10 digits); it must be milliseconds (13 digits) |
| No `X-Sign` header | Account name or password empty on the platform: unsigned fallback |
| Platform shows push failed | Receiver returned an empty body or a non-200 status |
| Chinese text garbled | Parse the body as UTF-8 |

## 7. Summary

- The signature covers 4 parts in this order: `appId`, `timestamp`, `nonce`, `body`, joined by `\n`.
- Lowercase hex HMAC; compare case-insensitively.
- Timestamp in milliseconds; allow 5 minutes and de-duplicate nonces.
- Treat the body as the raw string throughout: this decides whether verification works.
- Return 200 with a non-empty body; the platform uses this to track the forwarding link status.
