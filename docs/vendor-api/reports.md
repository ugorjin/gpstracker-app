# Reports

All reports take a timezone (`offset` or `timezone`, hours from UTC, default 8 =
China). **Always pass it** (Nigeria = 1). Each call counts against the daily quota.

| Action | Report |
|---|---|
| [`reportaccsbytime`](#reportaccsbytime-acc-ignition-report) | Ignition on/off periods |
| [`reportalarm`](#reportalarm-alarm-records) | Alarm records |
| [`reportoildaily`](#reportoildaily-daily-fuel-consumption) | Daily fuel consumption |
| [`reportoiltime`](#reportoiltime-fuel-over-time) | Fuel data over time |
| [`reportoilrecord`](#reportoilrecord-refuel-and-fuel-drain-events) | Refuel and drain events |
| [`queryactivesafetytracks`](#queryactivesafetytracks-active-safety-adasdms) | Active safety (ADAS/DMS) alarms |
| [`reportparkdetailbytime`](#reportparkdetailbytime-stops) | Stops |
| [`reportgeofence`](#reportgeofence-geofence-alarms) | Geofence alarms |
| [`reportmileagedetail`](#reportmileagedetail-daily-mileage) | Daily mileage per month |
| [`querytrips`](#querytrips-trips) | Trips |
| [`reportcheck`](#reportcheck-check-in-clock-in-records) | Check-in / clock-in |
| [`reportoverspeeds`](#reportoverspeeds-overspeed) | Overspeed |

Also see [positions.md](positions.md) for `reportoffline` and the real-time driving statistics.

---

## `reportaccsbytime`: ACC (ignition) report

Records built from the device's ACC on (ignition) and off events.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceids` | List\<String\> | Device serial numbers | |
| `starttime` | String | Start time | `yyyy-MM-dd HH:mm:ss` |
| `endtime` | String | End time | `yyyy-MM-dd HH:mm:ss` |
| `offset` | int | Timezone | Default 8 |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success, other = failure |
| `cause` | String | Error text | `OK` on success |
| `records` | List | Records | |

Record:

| Field | Type | Description | Details |
|---|---|---|---|
| `accstateid` | String | Record uuid | |
| `accstate` | int | ACC state | 0 none, 2 off, 3 on |
| `begintime` | long | Start time (ms) | |
| `endtime` | long | End time (ms) | |
| `slat` | float | Start latitude | Original says "degrees-minutes-seconds" |
| `slon` | float | Start longitude | |
| `elat` | float | End latitude | |
| `elon` | float | End longitude | |

## `reportalarm`: alarm records

| Parameter | Type | Description | Details |
|---|---|---|---|
| `devices` | List\<String\> | Device serial numbers | |
| `startday` | String | Start date | `yyyy-MM-dd` |
| `endday` | String | End date | `yyyy-MM-dd` |
| `offset` | int | Timezone | Default 8 |
| `needalarm` | String | Alarm types wanted | Alarm bits 0–63 |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success |
| `cause` | String | Error text | |
| `alarmrecords` | List | Records | |

Record:

| Field | Type | Description | Details |
|---|---|---|---|
| `devicealarmid` | String | Record uuid | |
| `aggregate` | int | Aggregated alarm | 0 no, 1 yes |
| `alarm` | long | Alarm value | |
| `alarmbitsstr` | String | Alarm bits | Bits 0–63 |
| `alarmcount` | int | Alarm count | Accumulates for aggregated alarms |
| `alarmtype` | int | Alarm kind | 1 normal, 2 video |
| `alt` | float | Altitude | m |
| `arrivedtime` | long | Arrival time | UTC ms |
| `course` | int | Heading | 0–360 |
| `deviceid` | String | Device id | |
| `devicetime` | long | Device time | UTC ms |
| `disposecontent` | String | Handling note | Entered manually |
| `disposeperson` | String | Account that handled it | |
| `disposestatus` | int | Handled | 0 not handled, 1 handled |
| `disposetime` | long | Handled at | UTC ms |
| `disposeway` | String | Where handled | Not used yet |
| `lastalarmtime` | long | Last alarm time | UTC ms |
| `lat` | float | Latitude | Degrees |
| `lon` | float | Longitude | Degrees |
| `mileage` | int | Distance during the alarm | m |
| `oil` | int | Total driving fuel | 1/100 L |
| `speed` | float | Speed | m/h |
| `startalarmtime` | long | Alarm start | UTC ms |
| `stralarm` | String | Alarm text | Chinese by default |
| `stralarmen` | String | Alarm text (English) | |
| `temperature` | float | Temperature | 1/100 °C |
| `totalmileage` | int | Odometer at start | m |
| `usename` | String | Account owning the device | (sic) |

## `reportoildaily`: daily fuel consumption

| Parameter | Type | Description | Details |
|---|---|---|---|
| `devices` | List\<String\> | Device serial numbers | e.g. `["13612345678","13612345679"]` |
| `startday` | String | Start date | `yyyy-MM-dd` |
| `endday` | String | End date | `yyyy-MM-dd` |
| `offset` | int | Timezone | Default 8 |

Response: `status` (0 success), `cause`, `records` (per device).

Per-device record:

| Field | Type | Description | Details |
|---|---|---|---|
| `deviceid` | | Device id | |
| `avgoilper100km` | float | Average overall consumption, L/100 km | e.g. 27.11 |
| `avgoilperhour` | float | Average consumption per hour, L/h | e.g. 14.41 |
| `avgrunoilper100km` | float | Average driving consumption, L/100 km | e.g. 26.11 |
| `currenttotaloil` | int | Current total fuel | 1/100 L |
| `totalacc` | long | Total ignition time | ms |
| `totalidle` | long | Total idle time | ms |
| `totalidleoil` | int | Total idle fuel | 1/100 L |
| `records` | List | Daily details | |

Daily detail:

| Field | Type | Description | Details |
|---|---|---|---|
| `addnotrunningad` | int | Non-driving fuel | 1/100 L |
| `addoil` | int | Fuel added | 1/100 L |
| `avgspeed` | float | Average speed | km/h |
| `begindis` | int | Start odometer | m |
| `beginnotrunningad` | int | Start non-driving fuel | 1/100 L |
| `avgoilper100km` | float | Overall L/100 km | |
| `avgoilperhour` | float | L/h | |
| `avgrunoilper100km` | float | Driving L/100 km | |
| `currenttotaloil` | int | Current total fuel | 1/100 L |
| `totalacc` | long | Ignition time | ms |
| `totalidle` | long | Idle time | ms |
| `totalidleoil` | int | Idle fuel | 1/100 L |

## `reportoiltime`: fuel over time

| Parameter | Type | Description | Details |
|---|---|---|---|
| `devices` | List\<String\> | Device serial numbers | e.g. `["13612345678","13612345679"]` |
| `startday` | String | Start date | `yyyy-MM-dd` |
| `endday` | String | End date | `yyyy-MM-dd` |
| `offset` | int | Timezone | Default 8 |

Response: `status` (0 success), `cause`, `records`: per device, a `records`
list of **position records** (full field list in [positions.md](positions.md#position-record)).

## `reportoilrecord`: refuel and fuel drain events

| Parameter | Type | Description | Details |
|---|---|---|---|
| `devices` | List\<String\> | Device serial numbers | |
| `startday` | String | Start date | `yyyy-MM-dd` |
| `endday` | String | End date | `yyyy-MM-dd` |
| `offset` | int | Timezone | Default 8 |
| `oilindex` | int | Fuel channel | 0 total, 1–4 tank 1–4, 99 non-driving total |
| `oilstate` | int | Event type | 1 refuel, -1 drain/leak, 99 all |

Response: `status` (0 success), `cause`, `records`, `addressmap` (addresses).

Record:

| Field | Type | Description | Details |
|---|---|---|---|
| `begintime` | int | Start time | |
| `endtime` | int | End time | |
| `soil` | int | Fuel at start | |
| `eoil` | int | Fuel at end | |
| `oilstate` | int | Event type | 1 refuel, -1 drain |
| `oilIndex` | int | Fuel channel | As `oilindex` |
| `maunedit` | int | Edited manually | 0 no, 1 yes (sic) |
| `slon` | number | Start longitude | |
| `slat` | number | Start latitude | |
| `elon` | number | End longitude | |
| `elat` | number | End latitude | |

## `queryactivesafetytracks`: active safety (ADAS/DMS)

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceids` | Array | Device serial numbers | |
| `begintime` | String | Start time | `yyyy-MM-dd hh:mm:ss` |
| `endtime` | String | End time | `yyyy-MM-dd hh:mm:ss` |
| `timezone` | int | Timezone | Default 8 |
| `needaddress` | int | Return addresses | 1 yes, 0 no |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success |
| `cause` | String | Reason | |
| `records` | array | Alarm records | |
| `addressmap` | Object | Addresses | |
| `playrootpath` | String | Base URL of attachments | |

Record:

| Field | Type | Description | Details |
|---|---|---|---|
| `alarmtype` | int | Alarm type | |
| `alarmlevel` | int | Alarm level | |
| `alarmevent` | int | Alarm event | |
| `lat` | int | WGS84 latitude | |
| `lon` | int | WGS84 longitude | |
| `speed` | int | Speed | "metres" |
| `alarmtime` | int | Alarm time | Timestamp |
| `updatetime` | int | Update time | Timestamp |
| `attachstatus1`–`attachstatus5` | int | Attachment uploaded | 0 no, 1 yes |
| `attachfile1`–`attachfile5` | String | Alarm video or photo | Full URL = `playrootpath` + `attachfileN` |
| `attachfiletype1`–`attachfiletype5` | int | Attachment type | 2 video, 0 photo |

## `reportparkdetailbytime`: stops

Stop report based on stop duration.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `begintime` | String | Start time | `yyyy-MM-dd HH:mm:ss` |
| `endtime` | String | End time | `yyyy-MM-dd HH:mm:ss` |
| `timezone` | int | Timezone | Default 8 |
| `interval` | int | Minimum stop | Minutes before a stop counts; default 5 |

Response: `deviceid`, `records` (stops).

Stop record:

| Field | Type | Description | Details |
|---|---|---|---|
| `starttime` | int | Stop start | Timestamp |
| `endtime` | int | Stop end | Timestamp |
| `callon` | double | Longitude | WGS84 |
| `callat` | double | Latitude | WGS84 |
| `updatetime` | int | Update time | Timestamp |
| `address` | String | Stop address | |
| `validpoistiontime` | long | Last fix time | |
| `altitude` | double | Altitude (m) | |
| `radius` | int | Accuracy (m) | |
| `durationidle` | int | Idle time | ms |
| `speed` | double | Speed | "metres" |
| `course` | int | Heading (0–360) | |
| `totaldistance` | int | Total mileage (m) | |
| `startdistance` | int | Odometer at start (m) | |
| `enddistance` | int | Odometer at end (m) | |
| `totaloil`, `totalnotrunningad`, `masteroil`, `auxoil`, `thirdoil`, `fourthoil` | int | Fuel | Millilitres (as position record) |
| `srcad0`–`srcad3` | int | Fuel analogue values | |
| `status`, `strstatus`, `strstatusen` | | JT808 status and text | |
| `alarm`, `stralarm`, `stralarmsen` | | JT808 alarm and text | |
| `videoalarm` | long | Video alarm | |
| `gotsrc` | String | Position source | gps / wifi / cell |
| `rxlevel` | int | Cell signal | |
| `gpsvalidnum` | int | Satellites | |
| `exvoltage`, `voltagev` | double | Voltages | 0.01 V; -1 default; 0 = power cut |
| `temp1`–`temp4` | int | Temperatures | 1/100 °C; 65535 invalid |
| `humi1`, `humi2` | int | Humidity | |

## `reportgeofence`: geofence alarms

| Parameter | Type | Description | Details |
|---|---|---|---|
| `devices` | Array | Device serial numbers | |
| `startday` | String | Start date | `yyyy-MM-dd` |
| `endday` | String | End date | `yyyy-MM-dd` |
| `timezone` | int | Timezone | Default 8 |

Response: `status` (0 success), `cause`, `records`.

Record:

| Field | Type | Description | Details |
|---|---|---|---|
| `alarm` | int | Alarm type | |
| `lastalarmtime` | int | Last alarm time | |
| `lastruntime` | int | Last running time | |
| `callon` | double | Longitude | WGS84 |
| `callat` | double | Latitude | WGS84 |
| `stralarm` | String | Alarm text (Chinese) | |
| `stralarmen` | String | Alarm text (English) | |

## `reportmileagedetail`: daily mileage

Mileage per day over a period (e.g. a month).

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `startday` | String | Start date | `yyyy-MM-dd` |
| `endday` | String | End date | `yyyy-MM-dd` |
| `offset` | int | Timezone | Default 8 |
| `forcetodaydetail` | bool | Include today | Default false |

Response: `deviceid`, `records`, `status` (0 success).

Record:

| Field | Type | Description | Details |
|---|---|---|---|
| `statisticsday` | String | Date | |
| `maxtotaldistance` | int | Highest odometer of the day | |
| `mintotaldistance` | int | Lowest odometer of the day | |
| `totaldistance` | int | Distance driven | |
| `starttime` | int | Start time | |
| `endtime` | int | End time | |
| `avgspeed` | int | Average speed | "metres" |
| `totalacc` | int | Ignition time | ms |

(The same action documented as "real-time driving statistics", with fuel
fields, is in [positions.md](positions.md#reportmileagedetail-driving-statistics-real-time--daily).)

## `querytrips`: trips

Definitions used by the vendor:

- **Stop:** the position stays unchanged for more than a threshold (default 3 minutes).
- **Trip:** the movement between two stops.
- **Driving time:** sum of all trip durations.
- **Stop time:** sum of time spent stopped for more than 3 minutes.
- **Working time:** sum of ignition-on time.
- **Idle time:** sum of time with ignition on and speed 0.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `begintime` | String | Start time | `yyyy-MM-dd HH:mm:ss` |
| `endtime` | String | End time | `yyyy-MM-dd HH:mm:ss` |
| `timezone` | int | Timezone | Default 8 |

Response:

| Field | Type | Description |
|---|---|---|
| `deviceid` | String | Device serial number |
| `totalmaxspeed` | float | Maximum speed, m/h |
| `totaldistance` | int | Total distance, m |
| `totalaveragespeed` | float | Average speed, m/h |
| `totaltriptime` | long | Total time, ms |
| `totaltrips` | List | Trips |

Trip:

| Field | Type | Description |
|---|---|---|
| `averagespeed` | float | Average speed, m/h |
| `maxspeed` | float | Maximum speed, m/h |
| `elat` | float | End latitude |
| `elon` | float | End longitude |
| `endtime` | long | End time, ms |
| `slat` | float | Start latitude |
| `slon` | float | Start longitude |
| `starttime` | long | Start time, ms |
| `parktime` | long | Parked time, ms |
| `tripdistance` | int | Trip distance, m |
| `triptime` | long | Trip time, ms |

## `reportcheck`: check-in (clock-in) records

**Records of devices actively checking in (clocking in). The device must support it.**

| Parameter | Type | Description | Details |
|---|---|---|---|
| `devices` | List\<String\> | Device serial numbers | |
| `startday` | String | Start date | `yyyy-MM-dd` |
| `endday` | String | End date | `yyyy-MM-dd` |
| `offset` | int | Timezone | Default 8 |
| `checktype` | int | Check type | 0 all, 1 check in (start of work), 2 check out (end of work) |

Response:

| Field | Type | Description |
|---|---|---|
| `status` | int | 0 success, other = error |
| `cause` | String | Error text |
| `records` | List | Per device: `deviceid` and `records` (details) |

Detail records have the same fields as the [alarm report](#reportalarm-alarm-records).

## `reportoverspeeds`: overspeed

| Parameter | Type | Description | Details |
|---|---|---|---|
| `startday` | String | Start date | `yyyy-MM-dd` |
| `endday` | String | End date | `yyyy-MM-dd` |
| `deviceids` | Array | Device ids | |
| `offset` | int | Timezone | |
| `limitspeed` | int | Speed | Leave out for overspeed alarms reported by the device; set it for overspeed computed by the platform |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `cause` | String | Reason | |
| `status` | int | Status | 0 success |
| `addressmap` | Object | Addresses | Matched by coordinates |
| `records` | Array | Overspeed events | |

Record:

| Field | Type | Description |
|---|---|---|
| `deviceid` | string | Device id |
| `alarmtype` | int | Alarm type |
| `begintime` | int | Start time |
| `endtime` | int | End time |
| `sdistance` | int | Start odometer |
| `edistance` | int | End odometer |
| `sspeed` | int | Start speed |
| `espeed` | int | End speed |
| `slon` | number | Start longitude (original says "end") |
| `slat` | number | Start latitude |
| `elon` | number | End longitude |
| `elat` | number | End latitude (original says "start") |
| `maxspeed` | int | Maximum speed |
| `minspeed` | int | Minimum speed |
