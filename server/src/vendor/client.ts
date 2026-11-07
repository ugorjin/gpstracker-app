import { createHash } from 'node:crypto';
import {
  CommandCode,
  CommandResult,
  CommandResultText,
  DEVICE_TYPE_JT808,
  LoginStatus,
  PlatformStatus,
} from './constants.js';
import { VendorApiError, VendorTransportError } from './errors.js';
import { RateLimiter, type Priority } from './rateLimiter.js';
import { toDateTime, toDay } from './time.js';
import type {
  BatchResult,
  CommandOutcome,
  DeviceListResponse,
  DeviceRef,
  LastPositionResponse,
  LoginResponse,
  TrackResponse,
  VendorDeviceType,
  VendorResponse,
} from './types.js';

export interface VendorClientOptions {
  /** e.g. https://api.your-vendor-domain.com */
  baseUrl: string;
  /** Path of the API endpoint. Docs show `/openapi` (and `/webapi` in one login example). */
  path?: string;
  username: string;
  /** Plain-text password. It is MD5-hashed before sending, as the vendor requires. */
  password: string;
  /** Default timezone offset (hours) for report parameters. Nigeria = 1. */
  timezone?: number;
  /** Fixed command password for `sendcmd`. Vendor default is "zhuyi". */
  commandPassword?: string;
  limiter: RateLimiter;
  fetch?: typeof fetch;
  /** Request timeout in ms. Video/intercom calls wait up to 30 s on the vendor side. */
  timeoutMs?: number;
  logger?: Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;
  now?: () => number;
}

export interface RequestOptions {
  priority?: Priority;
  timeoutMs?: number;
  /** Which `status` values count as success. Default: only 0. */
  acceptStatus?: (status: number) => boolean;
}

/** Token is valid 24 h; the vendor recommends logging in again after ~23 h. */
const TOKEN_MAX_AGE_MS = 23 * 3_600_000;
const SYNC_CALL_TIMEOUT_MS = 45_000;

export function md5Hex(text: string): string {
  return createHash('md5').update(text, 'utf8').digest('hex');
}

function isCommandStatus(status: number): boolean {
  return status >= CommandResult.UNKNOWN && status <= CommandResult.SYNC_TIMEOUT;
}

/**
 * Client for the vendor (gwebmgr) Open API.
 *
 * - Logs in on first use, keeps the token, and logs in again after 23 h or
 *   when the vendor reports the token expired (9903/9906). Never logs in more
 *   than needed: the vendor asks clients not to log in frequently.
 * - Every call goes through the shared `RateLimiter`.
 * - All calls are HTTP POST with a JSON body; `action`, `token` and `serverid`
 *   go in the query string.
 */
export class VendorClient {
  private readonly baseUrl: string;
  private readonly path: string;
  private readonly username: string;
  private readonly passwordMd5: string;
  readonly timezone: number;
  private readonly commandPassword: string;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly log: Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;
  private readonly now: () => number;

  private session: { token: string; serverid: number; obtainedAt: number } | undefined;
  private loginInFlight: Promise<void> | undefined;

  constructor(opts: VendorClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.path = opts.path ?? '/openapi';
    this.username = opts.username;
    this.passwordMd5 = md5Hex(opts.password);
    this.timezone = opts.timezone ?? 1;
    this.commandPassword = opts.commandPassword ?? 'zhuyi';
    this.limiter = opts.limiter;
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.log = opts.logger ?? console;
    this.now = opts.now ?? Date.now;
  }

  // ---------------------------------------------------------------------------
  // Core
  // ---------------------------------------------------------------------------

  /** Calls any action. Use the typed methods below where one exists. */
  async request<T extends VendorResponse = VendorResponse>(
    action: string,
    body: Record<string, unknown> = {},
    opts: RequestOptions = {},
  ): Promise<T> {
    await this.ensureSession();
    let res = await this.send(action, body, opts, true);
    if (res.status === PlatformStatus.TOKEN_EXPIRED || res.status === PlatformStatus.TOKEN_NOT_FOUND) {
      this.log.warn(`vendor token rejected (status ${res.status}) on "${action}", logging in again`);
      this.session = undefined;
      await this.ensureSession();
      res = await this.send(action, body, opts, true);
    }
    const accept = opts.acceptStatus ?? ((s: number) => s === PlatformStatus.OK);
    if (!accept(res.status) || res.status > 8900) {
      throw new VendorApiError(action, res.status, res.cause, res);
    }
    return res as T;
  }

  async login(): Promise<LoginResponse> {
    const res = await this.send(
      'login',
      { type: 'USER', from: 'WEB', username: this.username, password: this.passwordMd5, browser: 'gpstracker-server' },
      { priority: 'high' },
      false,
    );
    if (res.status !== LoginStatus.OK || typeof res.token !== 'string') {
      throw new VendorApiError('login', res.status, res.cause, res);
    }
    const login = res as LoginResponse;
    this.session = { token: login.token, serverid: Number(login.serverid ?? 0), obtainedAt: this.now() };
    this.log.info(`vendor login ok (serverid ${this.session.serverid})`);
    return login;
  }

  async logout(): Promise<void> {
    if (!this.session) return;
    try {
      await this.request('logout', {}, { priority: 'high' });
    } finally {
      this.session = undefined;
    }
  }

  get hasSession(): boolean {
    return this.session !== undefined;
  }

  private async ensureSession(): Promise<void> {
    if (this.session && this.now() - this.session.obtainedAt < TOKEN_MAX_AGE_MS) return;
    if (!this.loginInFlight) {
      this.loginInFlight = this.login()
        .then(() => undefined)
        .finally(() => {
          this.loginInFlight = undefined;
        });
    }
    await this.loginInFlight;
  }

  private async send(
    action: string,
    body: Record<string, unknown>,
    opts: RequestOptions,
    withAuth: boolean,
  ): Promise<VendorResponse> {
    await this.limiter.acquire(opts.priority ?? 'low');

    const url = new URL(this.baseUrl + this.path);
    url.searchParams.set('action', action);
    if (withAuth && this.session) {
      url.searchParams.set('token', this.session.token);
      url.searchParams.set('serverid', String(this.session.serverid));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new VendorTransportError(action, controller.signal.aborted ? 'request timed out' : 'network error', {
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
      throw new VendorTransportError(action, `HTTP ${response.status}: ${text.slice(0, 200)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new VendorTransportError(action, `response is not JSON: ${text.slice(0, 200)}`);
    }
    if (typeof parsed !== 'object' || parsed === null || typeof (parsed as VendorResponse).status !== 'number') {
      throw new VendorTransportError(action, 'response has no numeric "status" field');
    }
    const res = parsed as VendorResponse;
    if (res.status > 8900) this.log.warn(`vendor "${action}" -> status ${res.status} ${res.cause ?? ''}`);
    return res;
  }

  private commandOutcome(res: VendorResponse): CommandOutcome {
    return {
      ...res,
      statusText: CommandResultText[res.status] ?? `Unknown status ${res.status}`,
      accepted:
        res.status === CommandResult.CONFIRMED ||
        res.status === CommandResult.SENT_UNCONFIRMED ||
        res.status === CommandResult.OFFLINE_CACHED,
    };
  }

  private async command(action: string, body: Record<string, unknown>, timeoutMs?: number): Promise<CommandOutcome> {
    const res = await this.request(action, body, { priority: 'high', acceptStatus: isCommandStatus, timeoutMs });
    return this.commandOutcome(res);
  }

  // ---------------------------------------------------------------------------
  // Login helpers
  // ---------------------------------------------------------------------------

  /** Public link that shows a device's live position for `minutes` minutes. */
  shareTrackUrl(deviceid: string, minutes: number) {
    return this.request<VendorResponse & { shareurl: string; weburl: string }>(
      'gensharetrackurl',
      { deviceid, interval: minutes },
      { priority: 'high' },
    );
  }

  // ---------------------------------------------------------------------------
  // Devices
  // ---------------------------------------------------------------------------

  /** All devices of an account, grouped (`querymonitorlist`). */
  listDevices(username = this.username) {
    return this.request<DeviceListResponse>('querymonitorlist', { username });
  }

  listDeviceTypes() {
    return this.request<VendorResponse & { devicetypes: VendorDeviceType[] }>('querydevicetypeownerbyuser', {});
  }

  addDevice(input: {
    deviceid: string;
    devicename: string;
    devicetype: number;
    /** Account the device is added under. Defaults to our API account. */
    creater?: string;
    groupid?: number;
    /** 0 auto, 1 device, 2 platform. */
    calmileageway?: number;
    deviceenable?: 0 | 1;
    loginenable?: 0 | 1;
    timezone?: number;
  }) {
    return this.request<VendorResponse & { device: Record<string, unknown> }>(
      'adddevice',
      { creater: this.username, calmileageway: 0, deviceenable: 1, loginenable: 1, timezone: this.timezone, ...input },
      { priority: 'high' },
    );
  }

  editDevice(input: {
    deviceid: string;
    devicename?: string;
    loginname?: string;
    remark?: string;
    /** 0-16 */
    icon?: number;
    simnum?: string;
    /** 1 GPS, 2 cell, 7 GPS + cell + Wi-Fi. */
    needloctype?: 1 | 2 | 7;
  }) {
    return this.request('editdevicesimple', input, { priority: 'high' });
  }

  deleteDevice(deviceid: string) {
    return this.request('deletedevice', { deviceid }, { priority: 'high' });
  }

  // ---------------------------------------------------------------------------
  // Positions & history
  // ---------------------------------------------------------------------------

  /**
   * Latest positions. Pass the `lastquerypositiontime` from the previous call
   * to only get devices that changed. Empty `deviceids` = all devices.
   * This is a fallback: live positions normally arrive via the push receiver.
   */
  lastPositions(params: { deviceids?: string[]; lastquerypositiontime?: number; username?: string } = {}) {
    return this.request<LastPositionResponse>('lastposition', {
      username: params.username ?? this.username,
      deviceids: params.deviceids ?? [],
      lastquerypositiontime: params.lastquerypositiontime ?? 0,
    });
  }

  /**
   * Track history. Limited to 5 calls per device per day, and only allowed when
   * a user asks to see it. The vendor forbids syncing tracks automatically
   * and may revoke API access if it happens. Our own database (fed by
   * the push receiver) is the normal source of history.
   */
  async queryTracks(deviceid: string, begin: Date | string, end: Date | string, timezone = this.timezone) {
    this.limiter.reserveTrackCall(deviceid);
    return this.request<TrackResponse>(
      'querytracks',
      { deviceid, begintime: toDateTime(begin, timezone), endtime: toDateTime(end, timezone), timezone },
      { priority: 'high' },
    );
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

  sendCommand(device: DeviceRef, cmdcode: string, params: string[] = []): Promise<CommandOutcome> {
    return this.command('sendcmd', {
      deviceid: device.deviceid,
      devicetype: device.devicetype,
      cmdcode,
      params,
      state: -1,
      cmdpwd: this.commandPassword,
    });
  }

  /**
   * Cut fuel/power (immobilise). JT808 devices (devicetype 1) use LOCK_CAR,
   * everything else is treated as GT06 (relay = "1"). Check the protocol of
   * any new device model before relying on this.
   */
  cutEngine(device: DeviceRef): Promise<CommandOutcome> {
    return device.devicetype === DEVICE_TYPE_JT808
      ? this.sendCommand(device, CommandCode.JT808_LOCK_CAR, [])
      : this.sendCommand(device, CommandCode.GT06_RELAY_OIL, ['1']);
  }

  /** Restore fuel/power. See `cutEngine` for protocol handling. */
  restoreEngine(device: DeviceRef): Promise<CommandOutcome> {
    return device.devicetype === DEVICE_TYPE_JT808
      ? this.sendCommand(device, CommandCode.JT808_UNLOCK_CAR, [])
      : this.sendCommand(device, CommandCode.GT06_RELAY_OIL, ['0']);
  }

  /** Overspeed alarm when above `speedKmh` for `durationSeconds`. */
  setSpeedLimit(device: DeviceRef, speedKmh: number, durationSeconds: number) {
    return this.sendCommand(device, CommandCode.SET_SPEED_LIMIT, [String(speedKmh), String(durationSeconds)]);
  }

  /** Text-to-speech announcement on the device speaker. */
  speak(device: DeviceRef, text: string) {
    return this.sendCommand(device, CommandCode.PUSH_TTS, [text]);
  }

  /** Same command to many devices of one type (`batchoperate` / `sendcommand`). */
  batchCommand(deviceids: string[], devicetype: number, cmdcode: string, params: string[] = []) {
    return this.request<BatchResult>(
      'batchoperate',
      { action: 'sendcommand', deviceids, devicetype, cmdcode, params },
      { priority: 'high', acceptStatus: isCommandStatus },
    );
  }

  // ---------------------------------------------------------------------------
  // Geofences: shared ("system") fences organised in groups
  // ---------------------------------------------------------------------------

  listFenceGroups() {
    return this.request<VendorResponse & { categorys: unknown[] }>('querygeosystemrecords', {});
  }

  addFenceGroup(name: string) {
    return this.request('addgeosystemcategory', { name }, { priority: 'high' });
  }

  deleteFenceGroup(categoryid: number) {
    return this.request('delgeosystemcategory', { categoryid }, { priority: 'high' });
  }

  /** See docs/vendor-api/geofences.md for the fields of each fence `type`. */
  addFence(fence: {
    name: string;
    categoryid: number;
    /** 1 circle, 2 polygon, 3 administrative area, 5 route. */
    type: 1 | 2 | 3 | 5;
    /** 0 enter/exit alerts, 1 trip counting. */
    useas?: 0 | 1;
    /** 0 notify only, 11 cut on exit, 21 cut on enter, 31 cut on exit/restore on enter, 41 restore on exit/cut on enter. */
    triggerevent?: 0 | 11 | 21 | 31 | 41;
    [key: string]: unknown;
  }) {
    return this.request('addgeosystemrecord', fence, { priority: 'high' });
  }

  deleteFence(categoryid: number, geosystemrecordid: number) {
    return this.request('delgeosystemrecord', { categoryid, geosystemrecordid }, { priority: 'high' });
  }

  // ---------------------------------------------------------------------------
  // Geofences: simple circles attached to one device
  // ---------------------------------------------------------------------------

  listDeviceFences(deviceid: string) {
    return this.request<VendorResponse & { records: unknown[] }>('queryallgeorecords', { deviceid });
  }

  addDeviceFence(deviceid: string, lat: number, lon: number, radiusMeters: number) {
    return this.request('addgeorecord', { deviceid, type: 1, lat1: lat, lon1: lon, radius1: radiusMeters }, { priority: 'high' });
  }

  editDeviceFence(deviceid: string, georecordid: string, lat: number, lon: number, radiusMeters: number) {
    return this.request(
      'editgeorecord',
      { deviceid, georecordid, type: 1, lat1: lat, lon1: lon, radius1: radiusMeters },
      { priority: 'high' },
    );
  }

  deleteDeviceFence(georecordid: string) {
    return this.request('deletegeorecord', { georecordid }, { priority: 'high' });
  }

  // ---------------------------------------------------------------------------
  // Reports (prefer computing from our own data where possible: saves quota)
  // ---------------------------------------------------------------------------

  /** Ignition on/off periods. */
  reportAcc(deviceids: string[], start: Date | string, end: Date | string, tz = this.timezone) {
    return this.request('reportaccsbytime', {
      deviceids,
      starttime: toDateTime(start, tz),
      endtime: toDateTime(end, tz),
      offset: tz,
    });
  }

  /** Alarm records. `needalarm` filters by alarm bit (0-63). */
  reportAlarms(devices: string[], startDay: Date | string, endDay: Date | string, needalarm?: string, tz = this.timezone) {
    return this.request('reportalarm', {
      devices,
      startday: toDay(startDay, tz),
      endday: toDay(endDay, tz),
      offset: tz,
      ...(needalarm === undefined ? {} : { needalarm }),
    });
  }

  reportFuelDaily(devices: string[], startDay: Date | string, endDay: Date | string, tz = this.timezone) {
    return this.request('reportoildaily', { devices, startday: toDay(startDay, tz), endday: toDay(endDay, tz), offset: tz });
  }

  reportFuelByTime(devices: string[], startDay: Date | string, endDay: Date | string, tz = this.timezone) {
    return this.request('reportoiltime', { devices, startday: toDay(startDay, tz), endday: toDay(endDay, tz), offset: tz });
  }

  /**
   * Refuelling / fuel theft events.
   * oilindex: 0 total, 1-4 tank, 99 non-running total. oilstate: 1 refuel, -1 drain, 99 all.
   */
  reportFuelEvents(
    devices: string[],
    startDay: Date | string,
    endDay: Date | string,
    oilindex = 0,
    oilstate = 99,
    tz = this.timezone,
  ) {
    return this.request('reportoilrecord', {
      devices,
      startday: toDay(startDay, tz),
      endday: toDay(endDay, tz),
      offset: tz,
      oilindex,
      oilstate,
    });
  }

  /** ADAS / driver monitoring (active safety) alarms with photo/video attachments. */
  reportActiveSafety(deviceids: string[], begin: Date | string, end: Date | string, needaddress = false, tz = this.timezone) {
    return this.request('queryactivesafetytracks', {
      deviceids,
      begintime: toDateTime(begin, tz),
      endtime: toDateTime(end, tz),
      timezone: tz,
      needaddress: needaddress ? 1 : 0,
    });
  }

  /** Stops longer than `minMinutes` (default 5). */
  reportStops(deviceid: string, begin: Date | string, end: Date | string, minMinutes = 5, tz = this.timezone) {
    return this.request('reportparkdetailbytime', {
      deviceid,
      begintime: toDateTime(begin, tz),
      endtime: toDateTime(end, tz),
      timezone: tz,
      interval: minMinutes,
    });
  }

  reportGeofenceAlarms(devices: string[], startDay: Date | string, endDay: Date | string, tz = this.timezone) {
    return this.request('reportgeofence', { devices, startday: toDay(startDay, tz), endday: toDay(endDay, tz), timezone: tz });
  }

  /** Daily mileage per day (also used for "today's driving stats"). */
  reportDailyMileage(deviceid: string, startDay: Date | string, endDay: Date | string, includeToday = false, tz = this.timezone) {
    return this.request('reportmileagedetail', {
      deviceid,
      startday: toDay(startDay, tz),
      endday: toDay(endDay, tz),
      offset: tz,
      forcetodaydetail: includeToday,
    });
  }

  /** Trips between stops (a stop = no movement for 3+ minutes). */
  reportTrips(deviceid: string, begin: Date | string, end: Date | string, tz = this.timezone) {
    return this.request('querytrips', {
      deviceid,
      begintime: toDateTime(begin, tz),
      endtime: toDateTime(end, tz),
      timezone: tz,
    });
  }

  /** Clock-in/out records (device must support it). checktype 0 all, 1 in, 2 out. */
  reportCheckIns(devices: string[], startDay: Date | string, endDay: Date | string, checktype: 0 | 1 | 2 = 0, tz = this.timezone) {
    return this.request('reportcheck', {
      devices,
      startday: toDay(startDay, tz),
      endday: toDay(endDay, tz),
      offset: tz,
      checktype,
    });
  }

  /** Overspeed events. Pass `limitspeed` to use the platform's own threshold instead of device alarms. */
  reportOverspeed(deviceids: string[], startDay: Date | string, endDay: Date | string, limitspeed?: number, tz = this.timezone) {
    return this.request('reportoverspeeds', {
      deviceids,
      startday: toDay(startDay, tz),
      endday: toDay(endDay, tz),
      offset: tz,
      ...(limitspeed === undefined ? {} : { limitspeed }),
    });
  }

  /** Devices offline for at least `seconds`. Empty list = all devices. */
  reportOffline(seconds: number, deviceids: string[] = []) {
    return this.request('reportoffline', { deviceids, offlinetimeseconds: seconds });
  }

  // ---------------------------------------------------------------------------
  // Video (JT808 / JT1078 dashcams)
  // ---------------------------------------------------------------------------

  /**
   * Start live video. The vendor stops the stream after ~3.5 min, so the UI
   * should stop it itself after 3 min. `flvs` for web, `rtmp` for apps.
   * datatype: 0 audio+video (recommended), 1 video, 2 two-way talk, 3 listen, 4 broadcast, 5 passthrough.
   */
  startLiveVideo(deviceid: string, channels: number[], playtype: 'flvs' | 'rtmp' = 'flvs', datatype = 0) {
    return this.command('startvideos_sync', { deviceid, channels, datatype, playtype }, SYNC_CALL_TIMEOUT_MS);
  }

  /** videoclosetype: 0 close audio+video, 1 close audio only, 2 close video only. */
  stopLiveVideo(deviceid: string, channels: number[], videoclosetype: 0 | 1 | 2 = 0) {
    return this.request('stopvideos', { deviceid, channels, videoclosetype }, { priority: 'high', acceptStatus: isCommandStatus });
  }

  /**
   * Take a photo. resolution: 1 320x240, 2 640x480, 3 800x600, 4 1024x768,
   * 5 176x144, 6 352x288, 7 704x288, 8 704x576.
   */
  capturePhoto(deviceid: string, channelid = 1, resolution = 2) {
    return this.command('capturephoto_sync', { deviceid, channelid, resolution }, SYNC_CALL_TIMEOUT_MS);
  }

  /** Recordings stored on the device. mediatype: 0 AV, 1 audio, 2 video, 3 video or AV. storetype: 0 all, 1 main, 2 backup. */
  listRecordings(
    deviceid: string,
    channel: number,
    start: Date | string,
    end: Date | string,
    mediatype = 0,
    storetype = 0,
    tz = this.timezone,
  ) {
    return this.request(
      'querymedialist_sync',
      { deviceid, channel, starttime: toDateTime(start, tz), endtime: toDateTime(end, tz), mediatype, storetype, offset: tz },
      { priority: 'high', timeoutMs: SYNC_CALL_TIMEOUT_MS, acceptStatus: isCommandStatus },
    );
  }

  /**
   * Control playback of a recording.
   * playcontrol: 0 start, 1 pause, 2 stop, 3 fast-forward, 4 key-frame rewind, 5 seek, 6 key-frame play.
   * playrate: 0 n/a, 1 1x, 2 2x, 3 4x, 4 8x, 5 16x.
   */
  playbackControl(input: {
    deviceid: string;
    channel: number;
    playcontrol: number;
    playrate?: number;
    playtype?: 'flv' | 'rtmp';
    start: Date | string;
    end: Date | string;
    tz?: number;
  }) {
    const tz = input.tz ?? this.timezone;
    return this.command(
      'playrecordcontrol_sync',
      {
        deviceid: input.deviceid,
        channel: input.channel,
        playcontrol: input.playcontrol,
        playrate: input.playrate ?? 0,
        playtype: input.playtype ?? 'flv',
        starttime: toDateTime(input.start, tz),
        endtime: toDateTime(input.end, tz),
        offset: tz,
      },
      SYNC_CALL_TIMEOUT_MS,
    );
  }

  /**
   * Start two-way audio. The response `record` has `playurlaudio` (FLV) and
   * `uploadurlaudio` (WebSocket for sending PCM audio).
   */
  startIntercom(deviceid: string, channel = 0, playtype: 'flvs' | 'rtmp' = 'flvs', datatype = 2) {
    return this.command('startaudio_sync', { deviceid, channel, datatype, playtype }, SYNC_CALL_TIMEOUT_MS);
  }

  stopIntercom(deviceid: string, channel = 0, datatype = 2) {
    return this.command('stopaudio', { deviceid, channel, datatype });
  }

  // ---------------------------------------------------------------------------
  // Platform sub-accounts
  // ---------------------------------------------------------------------------

  /** `password` is plain text; it is MD5-hashed here. usertype: see `UserType`. */
  addUser(input: { username: string; password: string; usertype: number; multilogin?: 0 | 1; creater?: string }) {
    return this.request(
      'adduser',
      {
        creater: input.creater ?? this.username,
        username: input.username,
        usertype: input.usertype,
        password: md5Hex(input.password),
        multilogin: input.multilogin ?? 1,
      },
      { priority: 'high' },
    );
  }

  deleteUsers(usernames: string[]) {
    return this.request('deleteuser', { usernames }, { priority: 'high' });
  }

  getUser(username: string) {
    return this.request('queryuserdetail', { username });
  }

  editUser(input: { username: string; [key: string]: unknown }) {
    return this.request('edituser', input, { priority: 'high' });
  }

  // ---------------------------------------------------------------------------
  // Renewals
  // ---------------------------------------------------------------------------

  /** Renew platform service for devices. Spends the account's vendor points. */
  renewDevices(deviceids: string[], years: number, syncExpiry = true) {
    return this.request<
      VendorResponse & { consumepoints?: number; remainpoints?: number; successcount?: number; devices?: unknown[] }
    >(
      'chargedevices',
      { deviceids, years, showfreelife: 0, overduetime: null, syncexpirenotifytime: syncExpiry ? 1 : 0 },
      { priority: 'high' },
    );
  }

  /** Set the user-facing expiry (`expirenotifytime`) of devices. `expiretime` is epoch ms. */
  setDeviceExpiry(deviceids: string[], expiretime: number, syncPlatformExpiry = false) {
    return this.request<BatchResult>(
      'batchoperate',
      { action: 'modifyexpiretime', deviceids, showfreelife: 0, expiretime, syncoverduetime: syncPlatformExpiry ? 1 : 0 },
      { priority: 'high' },
    );
  }
}
