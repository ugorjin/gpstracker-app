# Positions

## `lastposition`: latest position

Latest position for a list of devices.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `username` | String | User name to query | e.g. `demo` |
| `deviceids` | List | Device serial numbers; **empty = all devices of the account** | e.g. `["12345678901","12345678902"]` |
| `lastquerypositiontime` | long | Time of the previous query | Send `0` the first time. Each response returns a new value: save it and send it next time |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success, -1 failure |
| `cause` | String | Status text | |
| `lastquerypositiontime` | long | Time of this query | Save it and send it with the next call |
| `records` | List | Latest positions | Position records (below) |

**Note:** with `lastquerypositiontime`, later calls only return what changed,
and one call covers all devices. Still, polling every minute uses the whole
base daily quota (1440). Use the push feed for live data.

### Position record

This record is also used by `reportoiltime` and (mostly) `reportparkdetailbytime`.

| Field | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number, globally unique | |
| `devicetime` | long | Time reported by the GPS device | |
| `arrivedtime` | long | Time it reached the server | |
| `updatetime` | long | Position update time after platform processing | |
| `validpoistiontime` | long | Time of the last valid fix | (sic) |
| `callat` | double | Computed latitude | |
| `callon` | double | Computed longitude | |
| `altitude` | double | Altitude (m) | |
| `radius` | int | Accuracy (m) | |
| `speed` | double | Speed ("metres") | See README note on units |
| `course` | int | Heading (0–360) | |
| `totaldistance` | int | Total mileage (m) | |
| `totaloil` | int | Total fuel | Millilitres |
| `totalnotrunningad` | int | Total non-driving fuel use | Millilitres |
| `masteroil` | int | Tank 1 (when tanks counted separately) | Millilitres |
| `auxoil` | int | Tank 2 | Millilitres |
| `thirdoil` | int | Tank 3 | Millilitres |
| `fourthoil` | int | Tank 4 | Millilitres |
| `srcad0` | int | Fuel sensor analogue value 1 | |
| `srcad1` | int | Fuel sensor analogue value 2 | |
| `srcad2` | int | Fuel sensor analogue value 3 | |
| `srcad3` | int | Fuel sensor analogue value 4 | |
| `status` | long | JT808 status value | |
| `strstatus` | String | Status text (Chinese) | |
| `strstatusen` | String | Status text (English) | |
| `alarm` | long | JT808 alarm value | |
| `stralarm` | String | Alarm text (Chinese) | |
| `stralarmsen` | String | Alarm text (English) | (sic) |
| `videoalarm` | long | JT808 video alarm value | |
| `strvideoalarm` | String | Video alarm text (Chinese) | |
| `strvideoalarmen` | String | Video alarm text (English) | |
| `videosignalloststatus` | long | Video signal lost status | |
| `videosignalcoverstatus` | long | Camera covered status | |
| `videobehavior` | long | Abnormal driving behaviour (video) | |
| `videofatiguedegree` | long | Fatigue level (video) | |
| `gotsrc` | String | Position source | `gps`, `wifi`, `cell` |
| `rxlevel` | int | Cell signal strength | |
| `gpsvalidnum` | int | Number of satellites used | |
| `exvoltage` | double | External voltage | 0.01 V units; default -1; 0 = power cut |
| `voltagev` | double | Voltage | 0.01 V units; default -1; 0 = power cut |
| `voltagepercent` | double | Battery % | Some devices compute it from the number of reports |
| `moving` | int | Moving | 0 not moving, 1 moving |
| `parklat` | double | Latitude of last stop | |
| `parklon` | double | Longitude of last stop | |
| `parktime` | long | Time of last stop | |
| `parkduration` | long | How long it has been stopped | |
| `temp1`–`temp4` | int | Temperatures 1–4 | 1/100 °C; 65535 = invalid |
| `humi1`, `humi2` | int | Humidity 1–2 | |
| `iostatus` | int | I/O status bits | |
| `currentoverspeedstate` | int | Overspeed state | 1 overspeeding, 2 not |
| `rotatestatus` | short | Mixer drum rotation | 0 unknown, 1 forward (empty), 2 reverse (loaded), 3 stopped |
| `loadstatus` | short | Load state | 0x00 empty, 0x01 half, 0x02 overloaded, 0x03 full, 0x04 loading, 0x05 unloading |
| `weight` | long | Weight | 0.1 kg |
| `srcweightad0` | int | Load sensor ad0 | Only one channel at present |
| `reportmode` | short | Report reason | See below |

### Report modes (`reportmode`)

| Value | Meaning |
|---|---|
| 0x00 | Timed report |
| 0x01 | Distance-interval report |
| 0x02 | Corner (heading change) report |
| 0x03 | ACC (ignition) state change |
| 0x04 | Last fix re-sent after going from moving to stopped |
| 0x05 | Last valid fix re-sent after network reconnect |
| 0x06 | Forced GPS upload after ephemeris update |
| 0x07 | Button press |
| 0x08 | Power-on |
| 0x09 | Unused |
| 0x0A | Stationary: last coordinates, time updated |
| 0x0B | Wi-Fi resolved position |
| 0x0C | Reply to immediate-locate (LJDW) command |
| 0x0D | Stationary: last coordinates |
| 0x0E | GPSDUP upload (timed while stationary) |

## `reportoffline`: offline devices

(The original page title says "query latest position by device list"; the action is the offline report.)

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceids` | List | Device serial numbers; empty = all devices of the account | |
| `offlinetimeseconds` | int | Minimum time offline | Seconds |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success, -1 failure |
| `cause` | String | Status text | |
| `addressmap` | Object | Addresses | Key built from latitude/longitude |
| `records` | List | Offline devices | |

## `reportmileagedetail`: driving statistics (real-time / daily)

Listed under "latest position" as *real-time driving statistics*. The same action
is also documented as the daily mileage report ([reports.md](reports.md#reportmileagedetail-daily-mileage)).

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `startday` | String | Start date | `yyyy-MM-dd` |
| `endday` | String | End date | `yyyy-MM-dd` |
| `offset` | int | Timezone | Default 8 |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `records` | List | Mileage details | When querying today, take the first record |

Record:

| Field | Type | Description | Details |
|---|---|---|---|
| `addoil` | int | Fuel added | 1/100 L |
| `avgspeed` | float | Average speed | m/h |
| `begindis` | int | Start odometer | m |
| `beginoil` | int | Start fuel | 1/100 L |
| `enddis` | int | End odometer | m |
| `endoil` | int | End fuel | 1/100 L |
| `endtime` | long | End time | ms |
| `idleoil` | int | Idle fuel | 1/100 L |
| `leakoil` | int | Fuel drained / leaked | 1/100 L |
| `oilper100km` | float | Overall consumption per 100 km | (original says "L/KM") |
| `runoilper100km` | float | Driving consumption per 100 km | |
| `oilperhour` | float | Fuel per hour | L/h |
| `starttime` | long | Start time | ms |
| `statisticsday` | string | Date | |
| `totalacc` | long | Total ignition-on time | ms |
| `totaldistance` | int | Distance in the period | m |
