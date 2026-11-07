# Devices

## `querymonitorlist`: device list

Returns an account's devices, grouped.

| Parameter | Type | Description |
|---|---|---|
| `username` | String | Login user name |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success, -1 failure |
| `cause` | String | Status text | `OK` on success |
| `groups` | List | Device groups | |

Group:

| Field | Type | Description |
|---|---|---|
| `groupid` | int | Group id |
| `groupname` | String | Group name |
| `remark` | String | Group remark |
| `devices` | List | Devices in the group |

Device:

| Field | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number, globally unique | |
| `devicename` | String | Device name | |
| `devicetype` | int | Device type | See `querydevicetypeownerbyuser` |
| `simnum` | String | SIM number | |
| `overduetime` | long | Expiry time | Platform expiry |
| `expirenotifytime` | long | Expiry notice time | The expiry shown to the user |
| `remark` | String | Remark | |
| `creater` | String | Account that created it | Helps find the group quickly |
| `videochannelcount` | int | Number of cameras | Default |
| `lastactivetime` | long | Last online time | |
| `isfree` | int | Usable? | 1 normal, 2 on trial, 3 disabled, 4 due, 5 expired |
| `allowedit` | int | Editable by sub-users | 0 level-2 / ordinary users may not edit, 1 may |
| `icon` | int | Map icon | Default is a car |
| `stared` | int | Starred | 0 not starred, 1 starred |
| `loginname` | String | Login name | |
| `offlinedelay` | int | Offline alert delay | Minutes without reports before "offline" alert |

## `querydevicetypeownerbyuser`: device types

Lists the device types available to the account. Send an empty JSON object `{}`.

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success, -1 failure |
| `cause` | String | Status text | |
| `devicetypes` | List | Device types | |

Device type (fields from both versions of this page in the original):

| Field | Type | Description | Details |
|---|---|---|---|
| `devicetypeid` | int | Device type id, globally unique | Use as `devicetype` elsewhere |
| `typename` | String | Type name | |
| `typecode` | String | Type code | |
| `remark` | String | Remark (Chinese) | |
| `remarken` | String | Remark (English) | |
| `functions` | int | | Undocumented |
| `functionslong` | int | Supported functions | Bit field (undocumented) |
| `defaultidlength` | int | Default device-id length | |
| `defaultofflinedelay` | int | Time without reports before considered offline | |
| `createtime` | int | Created | |
| `enabled` | int | In use | 1 enabled, 0 disabled |
| `supportmodels` | String | Supported manufacturer models | |
| `price` | int | 1-year renewal price | |
| `price3` | int | 3-year renewal price | |
| `price5` | int | 5-year renewal price | |
| `price10` | int | 10-year renewal price | |

## `adddevice`: add device

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `devicename` | String | Device name | |
| `devicetype` | int | Device type | |
| `creater` | String | Account to add it to | |
| `groupid` | int | Group id | |
| `calmileageway` | int | Mileage calculation | 0 automatic, 1 by device, 2 by platform |
| `deviceenable` | int | Enabled | 1 enabled, 0 disabled |
| `loginenable` | int | Device may log in | 1 yes, 0 no |
| `timezone` | int | Timezone | Default 8 (China) |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `cause` | String | Reason | |
| `device` | Object | Device info | |
| `status` | int | Status | 0 success, 1 device already exists |

## `editdevicesimple`: edit device

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `devicename` | String | Device name | |
| `loginname` | String | Login name | Can be used to log in |
| `remark` | String | Remark | |
| `icon` | int | Device icon | 0–16 |
| `simnum` | String | SIM (data card) number | |
| `needloctype` | int | Positioning type | 1 GPS, 2 cell tower, 7 GPS + cell + Wi-Fi |

Response: `cause` (String), `status` (int, 0 success).

## `deletedevice`: delete device

| Parameter | Type | Description |
|---|---|---|
| `deviceid` | String | Device serial number |

Response: `cause` (String), `status` (int, 0 success).
