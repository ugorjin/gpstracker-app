# Authentication

## `login`

**The token is valid for 24 hours. Log in about once every 23 hours. Do not log in frequently.**

| Parameter | Type | Description | Details |
|---|---|---|---|
| `username` | String | Login name | Chinese or English; accepts a user name or a device number |
| `password` | String | Password | **MD5 hash, 32 lowercase hex characters.** e.g. password `123456` → `e10adc3949ba59abbe56e057f20f883e` |
| `from` | String | Login source | `"ANDROID"`, `"IPHONE"`, `"WEB"`, `"WEIXIN"` |
| `type` | String | Login type | `"USER"`, `"DEVICE"` |

Example request:

```
url:  https://xxxx.com/webapi?action=login
body: {"type":"USER","from":"web","username":"minigps","password":"e10adc3949ba59abbe56e057f20f883e","browser":"Chrome/104.0.0.0"}
```

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success, -1 failure, 1 wrong password, 2 login forbidden, 3 disabled, 4 device due, 5 device expired, 9903 token expired, 9906 logged in elsewhere |
| `cause` | String | Status text | `OK` on success, otherwise the error |
| `token` | String | Auth token | Valid 24 h; must be in the URL of every other call |
| `serverid` | int | Server id | Must be in the URL of every other call |

The original page includes MD5 sample code in Java and JavaScript; any standard
MD5 implementation works (Node.js: `crypto.createHash('md5').update(pw).digest('hex')`).

## `logout`

Logs out the current token. No parameters.

## `autologin`: password-free login link

Opens the vendor's **web platform** already logged in (useful for "open in
vendor platform" links). Not an API call: you build a URL.

### 1. Plain-text form

| Parameter | Type | Description | Details |
|---|---|---|---|
| `username` | String | User name | `urlencode(username)` |
| `password` | String | Password | `urlencode(password)` |
| `lg` or `lang` or `language` | String | Language | Optional: `zh`, `en` |
| `route` | String | Page to open | Optional, default `monitor`; one of `monitor`, `track` |

Steps:
1. `username=justdemo`
2. `password=Aa1357`
3. Combine: `username=justdemo&password=Aa1357`
4. Final URL: `http://yourdomain/#/login?username=justdemo&password=Aa1357`

### 2. Encoded form

| Parameter | Type | Description | Details |
|---|---|---|---|
| `authcode` | String | Authorisation code | Built from username and password |

Steps:
1. `username=justdemo`
2. `password=Aa1357`
3. Combine: `username=justdemo&password=Aa1357`
4. Apply JavaScript `encodeURIComponent()`
5. Result: `username%3Djustdemo%26password%3DAa1357`
6. Base64-encode: `dXNlcm5hbWUlM0RqdXN0ZGVtbyUyNnBhc3N3b3JkJTNEQWExMzU3`
7. Apply `encodeURIComponent()` again: `dXNlcm5hbWUlM0RqdXN0ZGVtbyUyNnBhc3N3b3JkJTNEQWExMzU3OQ%3D%3D`
8. Final URL: `http://yourdomain/#/login?authcode=dXNlcm5hbWUlM0RqdXN0ZGVtbyUyNnBhc3N3b3JkJTNEQWExMzU3OQ%3D%3D`

**Note:** the "encoded" form is only Base64, not encryption: anyone with the
link can recover the password. Don't put customers' passwords in links that
can leak (emails, SMS).

## `gensharetrackurl`: share a device's location

Creates a link that lets anyone view the device's position/track for a limited time.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | Uniquely identifies a device |
| `interval` | int | Share duration | Minutes from now during which the link can be opened |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success, -1 failure |
| `cause` | String | Status text | `OK` on success |
| `deviceid` | String | Device serial number | |
| `shareurl` | String | Share text | Ready-to-paste share message, includes the URL |
| `weburl` | String | Web URL | URL to open directly |
