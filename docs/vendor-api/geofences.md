# Geofences

There are two kinds:

- **Shared ("system") fences** organised in groups ("categories"); circles,
  polygons, administrative areas or routes, with optional automatic fuel cut.
- **Simple per-device fences**: a circle attached to one device.

## Shared fences

### `querygeosystemrecords`: list fences

No parameters.

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0 success |
| `cause` | String | Error text | |
| `categorys` | List | Groups | (sic) |

Group:

| Field | Type | Description |
|---|---|---|
| `categoryid` | int | Group id |
| `categoryuuid` | String | Group uuid |
| `name` | String | Group name |
| `remark` | String | Remark |
| `creater` | String | Creator |
| `records` | List | Fences (fence object, see `addgeosystemrecord`) |

### `addgeosystemcategory`: add fence group

| Parameter | Type | Description |
|---|---|---|
| `name` | String | Group name |

Response: `status` (0 success), `cause`, `record` (group object: `categoryid`,
`categoryuuid`, `name`, `remark`, `creater`).

### `delgeosystemcategory`: delete fence group

| Parameter | Type | Description |
|---|---|---|
| `categoryid` | int | Group id |

Response: `status` (0 success), `cause`.

### `addgeosystemrecord`: add fence

| Parameter | Type | Description |
|---|---|---|
| `name` | String | Fence name |
| `categoryid` | int | Group id |
| `type` | int | 1 circle, 2 polygon, 3 administrative area, 5 route |
| `useas` | int | Purpose: 0 enter/exit fence, 1 trip counting |
| `triggerevent` | int | 0 platform notification only; 11 cut fuel/power on exit; 21 cut on enter; 31 cut on exit, restore on enter; 41 restore on exit, cut on enter |
| `lat1` | double | Circle: WGS84 latitude |
| `lon1` | double | Circle: WGS84 longitude |
| `radius1` | int | Circle: radius in metres |
| `points2` | list | Polygon: list of points |
| `provinceindex3` | int | Area: province id |
| `cityindex3` | int | Area: city id |
| `areaindex3` | int | Area: district id |
| `provincestr3` | String | Area: province name |
| `citystr3` | String | Area: city name |
| `areastr3` | String | Area: district name |
| `adcode3` | String | Area: area code |
| `distance5` | int | Route: allowed deviation in metres |
| `alarmtype5` | int | Route alarm: 1 continuous alarm when off route, 2 continuous alarm when on route, 3 single alarm when leaving the route, 4 single alarm when entering the route |

The suffix of each field name says which `type` it belongs to (1 circle,
2 polygon, 3 area, 5 route). **Note:** administrative areas (type 3) use
Chinese province/city codes and are unlikely to work for African countries;
the point format of `points2` is not documented. Test with the vendor.

Response:

| Field | Type | Description |
|---|---|---|
| `status` | int | 0 success |
| `cause` | String | Error text |
| `record` | Object | Fence object |

Fence object:

| Field | Type | Description |
|---|---|---|
| `geosystemrecordid` | int | Fence id |
| `categoryid` | int | Group id |
| `georecorduuid` | String | Fence uuid |
| `name` | String | Name |
| `type` | int | 1 circle (see above) |
| `useas` | int | Purpose |
| `triggerevent` | int | Trigger event |
| `remark` | String | Remark |
| `creater` | String | Creator |

### `delgeosystemrecord`: delete fence

| Parameter | Type | Description |
|---|---|---|
| `categoryid` | int | Group id |
| `geosystemrecordid` | int | Fence id |

Response: `status` (0 success), `cause`.

## Per-device fences

### `queryallgeorecords`: list a device's fences

| Parameter | Type | Description |
|---|---|---|
| `deviceid` | String | Device serial number |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | 0 success | |
| `cause` | String | Error text | |
| `deviceid` | String | Device serial number | |
| `records` | List | Fences | `type` = 1 means a simple fence |

### `addgeorecord`: add device fence

| Parameter | Type | Description |
|---|---|---|
| `deviceid` | String | Device serial number |
| `type` | int | 1 = circle |
| `lat1` | double | WGS84 latitude |
| `lon1` | double | WGS84 longitude |
| `radius1` | int | Radius in metres |

Response: `status` (0 success), `cause`, `record` (fence object).

### `editgeorecord`: edit device fence

| Parameter | Type | Description |
|---|---|---|
| `deviceid` | String | Device serial number |
| `georecordid` | String | Fence id |
| `type` | int | 1 = circle |
| `lat1` | double | WGS84 latitude |
| `lon1` | double | WGS84 longitude |
| `radius1` | int | Radius in metres |

Response: `status` (0 success), `cause`, `record` (fence object).

### `deletegeorecord`: delete device fence

| Parameter | Type | Description |
|---|---|---|
| `georecordid` | String | Fence id |

Response: `status` (0 success), `cause`.
