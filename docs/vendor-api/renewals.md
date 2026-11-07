# Renewals and expiry

Each device has two expiry dates:

- `overduetime`: **platform expiry**: when the vendor stops serving the device.
- `expirenotifytime`: **device expiry** shown to the end user; can be set
  independently (e.g. your customer's subscription end).

## `chargedevices`: renew devices

Renews platform service. Paid with the account's **"gold beans" (金豆)**:
vendor points bought from the vendor.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceids` | Array | Device serial numbers | `[id1, id2]` |
| `years` | int | Years to renew | |
| `showfreelife` | int | Free for life | 0 no, 1 free for life |
| `overduetime` | int | Platform expiry | Send `null` |
| `syncexpirenotifytime` | int | Also update the device expiry | 1 sync, 0 don't |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `cause` | String | Reason | |
| `status` | int | Status | 0 success |
| `consumepoints` | int | Points spent | |
| `remainpoints` | int | Points remaining | |
| `successcount` | int | Devices renewed | |
| `devices` | Array | Updated devices | |

Renewal prices per device type are in `querydevicetypeownerbyuser`
(`price`, `price3`, `price5`, `price10`).

## `batchoperate` with `action: "modifyexpiretime"`: set device expiry

| Parameter | Type | Description | Details |
|---|---|---|---|
| `action` | String | `modifyexpiretime` | |
| `deviceids` | Array | Devices | `["id1","id2"]` |
| `showfreelife` | int | Free for life | 0 no, 1 yes |
| `expiretime` | int | Device expiry time | Stored as the device's `expirenotifytime` |
| `syncoverduetime` | int | Also set platform expiry | 1 yes, 0 no |

Response:

| Field | Type | Description |
|---|---|---|
| `cause` | String | Reason |
| `status` | int | 0 success |
| `errorrecords` | Array | Failed records |
| `successrecords` | Array | Successful records |
| `fail` | int | Number failed |
| `success` | int | Number succeeded |
| `total` | int | Total |
