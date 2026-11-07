# Video and intercom (JT808 / JT1078 dashcams)

The `_sync` calls wait for the device: **allow up to 30 seconds** before the
vendor times out. Responses use the [command result codes](commands.md#command-result-codes-status).

## Live video

### `startvideos_sync`: start live video

The call waits up to 30 s. **After playback starts, run a 3-minute timer, then
stop the stream yourself and tell the user the viewing time is over.** The
platform stops the stream itself after about 3.5 minutes, so the user doesn't
suddenly lose the picture.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `channels` | List\<Short\> | Channels, e.g. `[1,2,3,4]` | Channels to play |
| `datatype` | short | Data type | Recommended `0`. 0 audio+video, 1 video, 2 two-way talk, 3 listen, 4 central broadcast, 5 passthrough |
| `playtype` | String | Stream type | `"rtmp"`, `"flvs"`. Use `flvs` for web, `rtmp` for apps and mini programs |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | Command result codes |
| `cause` | string | Error | |
| `records` | List | Channels | |

Channel:

| Field | Type | Description | Details |
|---|---|---|---|
| `channel` | int | Channel id | Starts at 1 |
| `hasaudio` | int | Has audio (**deprecated**) | -1 auto, 0 no, 1 yes |
| `playurl` | String | A/V URL (**deprecated**) | e.g. `https://video1.gps51.com:82/live/19000012029_1_0_1078_video.flv` |
| `playurlaudio` | String | Audio URL | e.g. `https://video1.gps51.com:82/live/19000012029_1_0_1078_audio.flv` |
| `playurlvideo` | String | Video URL | e.g. `https://video1.gps51.com:82/live/19000012029_1_0_1078_video.flv` |
| `uploadurlaudio` | String | URL for uploading talk audio | |

**Note:** the example URLs show the platform is hosted by **gps51**. Video is
streamed from the vendor's media server, so it uses the customer's mobile
data. Keep sessions short.

### `stopvideos`: stop live video

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `channels` | List\<Short\> | Channels, e.g. `[1,2,3,4]` | |
| `videoclosetype` | short | What to close | 0 all audio and video of the channel, 1 close audio keep video, 2 close video keep audio |

### `capturephoto_sync`: take a photo

Waits up to 30 s. On success returns the URL of the photo.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `channelid` | int | Channel id | Starts at 1 |
| `resolution` | int | Resolution | See list |

Resolutions: `0x01` 320×240; `0x02` 640×480; `0x03` 800×600; `0x04` 1024×768;
`0x05` 176×144 (QCIF); `0x06` 352×288 (CIF); `0x07` 704×288 (HALF D1); `0x08` 704×576 (D1).

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | -1 error, 6 sent and confirmed, 8 timed out |
| `cause` | string | Error | |
| `devicemedia` | Object | Uploaded photo | |

`devicemedia`:

| Field | Type | Description | Details |
|---|---|---|---|
| `deviceid` | string | Device id | |
| `fileext` | string | File extension | |
| `eventcode` | int | Event code | 0 platform command, 1 scheduled action, 2 robbery alarm, 3 collision/rollover alarm, other reserved |
| `url` | string | File URL | |

## Recorded video (playback from the device)

### `querymedialist_sync`: search recordings

Waits up to 30 s.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `channel` | short | Channel | Starts at 1 |
| `starttime` | String | Start time | `yyyy-MM-dd HH:mm:ss` |
| `endtime` | String | End time | `yyyy-MM-dd HH:mm:ss` |
| `mediatype` | short | Media type | 0 audio+video, 1 audio, 2 video, 3 video or audio+video |
| `storetype` | short | Storage | 0 all, 1 main storage, 2 backup storage |
| `offset` | int | Timezone | User's browser/app timezone; default 8 |

(The response format is not documented.)

### `playrecordcontrol_sync`: playback control

Waits up to 30 s. As with live video: stop after 3 minutes yourself. The
platform stops at about 3.5 minutes.

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `channel` | short | Channel | Starts at 1 |
| `playcontrol` | short | Control | 0 start, 1 pause, 2 stop, 3 fast forward, 4 key-frame rewind, 5 seek (drag), 6 key-frame play |
| `playrate` | short | Speed | For fast forward/rewind: 0 n/a, 1 1×, 2 2×, 3 4×, 4 8×, 5 16× |
| `playtype` | String | Stream type | `"rtmp"`, `"flv"`. Use `flv` for web, `rtmp` for apps |
| `starttime` | String | Start time | `yyyy-MM-dd HH:mm:ss` |
| `endtime` | String | End time | `yyyy-MM-dd HH:mm:ss` |
| `offset` | int | Timezone | Default 8 |

## Intercom (two-way audio)

### `startaudio_sync`: start talk

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `channel` | int | Talk channel id | Default 0; found via the `querydevicebyid` API (not documented) |
| `datatype` | int | Data type, default 2 | 0 audio+video, 1 video, 2 two-way talk, 3 one-way speak, 4 central broadcast, 5 passthrough |
| `playtype` | string | `flvs` or `rtmp` | How talk audio is played |

Response:

| Field | Type | Description | Details |
|---|---|---|---|
| `status` | int | Status | 0, 6 or 8 = success |
| `cause` | String | Error | |
| `record` | Json | Details | |

`record`:

| Field | Type | Description | Details |
|---|---|---|---|
| `channel` | int | Talk channel id | |
| `playurlaudio` | String | Playback URL | Play with an FLV player |
| `uploadurlaudio` | String | Upload URL | Upload via WebSocket |

### `stopaudio`: stop talk

| Parameter | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `channel` | int | Talk channel id | Default 0 |
| `datatype` | int | Data type, default 2 | 0 audio+video, 1 video, 2 two-way talk, 3 listen, 4 central broadcast, 5 passthrough |

Response: `status` (0, 6 or 8 = success), `cause`.

### Sending audio over the WebSocket

Connect to `uploadurlaudio`. First send the format message: the text
`uploadaudioinfo` immediately followed by JSON:

| Field | Type | Description | Details |
|---|---|---|---|
| `deviceid` | String | Device serial number | |
| `channel` | int | Talk channel id | Default 0 |
| `codec` | string | Audio format | `pcms16` |
| `samplebits` | int | Bits per sample | 16 |
| `samplerate` | int | Sample rate | 8000 |
| `littleedian` | int | Byte order | Default 1; 1 little-endian, 0 big-endian (sic) |
| `sn` | int | Packet sequence number | Starts at 0, +1 per packet |

```
uploadaudioinfo{"deviceid":"220380105977","codec":"pcms16","samplebits":16,"littleedian":1,"channel":0,"sn":0,"numberofchannels":1,"samplerate":8000}
```

Reply: the fixed text `OK OK`.

Then send the audio itself as **binary WebSocket messages** (raw PCM).
