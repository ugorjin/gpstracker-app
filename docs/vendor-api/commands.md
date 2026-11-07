# Commands to devices

All single-device commands use `action=sendcmd`. The command code and
parameters depend on the device protocol: **GT06** or **JT808** ("部标808",
`devicetype` = 1, returned by the device list).

## Lock vehicle: cut fuel/power (`sendcmd`)

### GT06 protocol devices

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `cmdcode` | String | Command code | `"TYPE_SERVER_SET_RELAY_OIL"` |
| `params` | List\<String\> | Command content | `["1"]` |
| `cmdpwd` | String | Password; use the fixed password | `"zhuyi"` |

```json
{"deviceid":"868035043015161","devicetype":26,"cmdcode":"TYPE_SERVER_SET_RELAY_OIL","params":["1"],"state":-1,"cmdpwd":"zhuyi"}
```

### JT808 protocol devices

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `devicetype` | int | Device type | Returned by the device list; JT808 is `1` |
| `cmdcode` | String | Command code | `"TYPE_SERVER_LOCK_CAR"` |
| `params` | List\<String\> | Command content | `[]` |
| `cmdpwd` | String | Fixed password | `"zhuyi"` |

```json
{"deviceid":"00006113323","devicetype":1,"cmdcode":"TYPE_SERVER_LOCK_CAR","params":[],"state":-1,"cmdpwd":"zhuyi"}
```

## Unlock vehicle: restore fuel/power (`sendcmd`)

### GT06 protocol devices

Same as lock, with `params: ["0"]`:

```json
{"deviceid":"868035043015161","devicetype":26,"cmdcode":"TYPE_SERVER_SET_RELAY_OIL","params":["0"],"state":-1,"cmdpwd":"zhuyi"}
```

### JT808 protocol devices

`cmdcode` = `"TYPE_SERVER_UNLOCK_CAR"`, `params: []`:

```json
{"deviceid":"00006113323","devicetype":1,"cmdcode":"TYPE_SERVER_UNLOCK_CAR","params":[],"state":-1,"cmdpwd":"zhuyi"}
```

**Note:** `state: -1` appears in all examples but is not described. Cutting
fuel on a moving vehicle is dangerous; many devices only apply the cut once
speed is low. Check device behaviour and add confirmations in the UI.

## Overspeed setting (`sendcmd`)

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `cmdcode` | String | Command code | `"TYPE_SERVER_SET_SPEED_LIMIT"` |
| `params` | List\<String\> | `["100","35"]` | Example: above 100 km/h for 35 seconds |

## Voice announcement / TTS (`sendcmd`)

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `cmdcode` | String | Command code | `"TYPE_SERVER_PUSH_TTS"` |
| `params` | List\<String\> | Command content | The text to speak, e.g. `"test message"` |

## Response for `sendcmd`

| Field | Type | Description |
|---|---|---|
| `deviceid` | String | Device serial number |
| `status` | int | Result (see table) |
| `cause` | String | Error text |

### Command result codes (`status`)

Used by `sendcmd`, batch commands, video and intercom calls.

| Enum | Value | Meaning |
|---|---|---|
| CMD_SEND_RESULT_UNKONWN | -1 | Unknown error |
| CMD_SEND_RESULT_UNCONFIRM | 0 | Sent, no confirmation received |
| CMD_SEND_RESULT_PASSWORD_ERROR | 1 | Wrong password |
| CMD_SEND_RESULT_OFFLINE_NOT_CACHE | 2 | Device offline, command not queued |
| CMD_SEND_RESULT_OFFLINE_CACHED | 3 | Device offline, command queued |
| CMD_SEND_RESULT_MODIFY_DEFAULT_PASSWORD | 4 | Default password must be changed |
| CMD_SEND_RESULT_DETAIL_ERROR | 5 | Unknown error |
| CMD_SEND_CONFIRMED | 6 | Sent and confirmed by the device |
| CMD_SEND_OVER_RETRY_TIMES | 7 | Failed after 3 attempts |
| CMD_SEND_SYNC_TIMEOUT | 8 | Synchronous message: no confirmation within 60 seconds |

## Batch commands (`batchoperate` with `action: "sendcommand"`)

Send the same command to many devices. (Documented on two pages; fields merged.)

| Parameter | Type | Description | Details |
|---|---|---|---|
| `action` | String | Inner batch operation | `"sendcommand"` |
| `deviceids` | List\<String\> | Devices | e.g. `["13100011111","13100011112"]` |
| `devicetype` | int | Device type | From the device list; `1` for JT808 |
| `cmdcode` | String | Command code | e.g. `"TYPE_SERVER_SET_SPEED_LIMIT"` |
| `params` | List\<String\> | Parameters | e.g. `["100","35"]`: above 100 km/h for 35 s |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success (command result codes above) |
| `cause` | String | Error text | |
| `successrecords` | | Devices that succeeded | |
| `errorrecords` | List | Devices that failed | |
| `total` | int | Total | |
| `success` | int | Number succeeded | |
| `fail` | int | Number failed | |
