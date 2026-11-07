# Track history

> **Only call this when a user needs to view a track. Servers must not
> automatically sync tracks. If this is detected, the vendor may close your
> API access.** Limit: 5 calls per device per day.

## `querytracks`: track between two times

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | e.g. `"12345678901"` |
| `begintime` | String | Start time | `yyyy-MM-dd HH:mm:ss` |
| `endtime` | String | End time | `yyyy-MM-dd HH:mm:ss` |
| `timezone` | int | Timezone | The user's browser/app timezone; default 8 (China) |

Response:

| Field | Type | Description |
|---|---|---|
| `deviceid` | String | Device serial number |
| `records` | List | Track points |

Track point:

| Field | Type | Description | Details |
|---|---|---|---|
| `trackCount` | int | Number of reports merged into this point | |
| `starttime` | long | Start time of the point | |
| `endtime` | long | End time of the point | |
| `trackid` | int | Database key of the first report | |
| `arrivedtime` | long | Time it reached the server | |
| `updatetime` | long | Update time after platform processing | |
| `callat` | double | Computed latitude | |
| `callon` | double | Computed longitude | |
| `altitude` | double | Altitude (m) | |
| `radius` | int | Accuracy (m) | |
| `speed` | double | Speed ("metres") | |
| `recorderspeed` | double | Tachograph speed | "metres" |
| `totaldistance` | int | Total mileage (m) | |
| `course` | int | Heading (0–360) | |
| `status` | long | JT808 status value | |
| `strstatus` | String | Status text (Chinese) | |
| `strstatusen` | String | Status text (English) | |
| `gotsrc` | String | Position source | `gps`, `wifi`, `cell` |
| `rxlevel` | int | Cell signal strength | |
| `gpsvalidnum` | int | Satellites used | |
| `ad0` | int | Fuel 1 | |
| `ad1` | int | Fuel 2 | |
| `temp1`–`temp4` | int | Temperatures 1–4 | 1/100 °C; 65535 = invalid |
| `humi1`, `humi2` | int | Humidity 1–2 | |
| `reportmode` | short | Report reason | See [positions.md](positions.md#report-modes-reportmode) |
