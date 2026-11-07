# Platform sub-accounts

## `adduser`: create account

| Parameter | Type | Description | Details |
|---|---|---|---|
| `creater` | String | Creator | Account creating it |
| `username` | String | User name | New account name |
| `usertype` | int | User type | See table |
| `password` | String | Password | MD5 hash |
| `multilogin` | int | Multiple simultaneous logins | 1 allowed, 0 not |

User types:

| Value | Meaning |
|---|---|
| 1 | System administrator |
| 2 | Level-1 administrator |
| 3 | Level-2 administrator |
| 4 | Level-3 administrator |
| 11 | Ordinary monitor (viewer) |
| 99 | Device (device login) |

Response: `cause` (String), `status` (int, 0 success).

## `deleteuser`: delete accounts

| Parameter | Type | Description |
|---|---|---|
| `usernames` | Array | `[name1, name2]` |

Response: `cause`, `status` (0 success).

## `queryuserdetail`: account details

| Parameter | Type | Description |
|---|---|---|
| `username` | String | User name |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `cause` | String | Reason | |
| `status` | int | Status | 0 success |
| `username` | String | User name | |
| `creater` | String | Creator | |
| `showname` | String | Display name | |
| `usertype` | int | User type | |
| `multilogin` | int | Multiple logins | 1 yes, 0 no |
| `companyname` | String | Company name | |
| `companyaddr` | String | Company address | |
| `cardname` | String | Contact person | |
| `email` | String | Email | |
| `wechat` | String | WeChat | |
| `phone` | String | Phone | |
| `qq` | String | QQ | |

## `edituser`: edit account details

Parameters: the same fields as the `queryuserdetail` response: `username`,
`creater`, `showname`, `usertype`, `multilogin` (1 yes, 0 no), `companyname`,
`companyaddr`, `cardname` (contact), `email`, `wechat`, `phone`, `qq`.

Response: `cause`, `status` (0 success).
