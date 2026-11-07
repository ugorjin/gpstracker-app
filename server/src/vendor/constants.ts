/**
 * Constants from the vendor (gwebmgr) API documentation.
 * See docs/vendor-api/ for the full English reference.
 */

/** Platform-level status codes returned in the `status` field of any response. */
export const PlatformStatus = {
  ERROR: -1,
  OK: 0,
  ACTION_NOT_FOUND: 8901,
  IP_RATE_LIMITED: 8902,
  ACCOUNT_RESTRICTED: 8903,
  IP_NOT_WHITELISTED: 8904,
  DAILY_QUOTA_EXHAUSTED: 8905,
  ACTION_FORBIDDEN: 8906,
  TOKEN_EXPIRED: 9903,
  TOKEN_NOT_FOUND: 9906,
} as const;

/** Status codes specific to `action=login`. */
export const LoginStatus = {
  FAILED: -1,
  OK: 0,
  WRONG_PASSWORD: 1,
  LOGIN_FORBIDDEN: 2,
  DISABLED: 3,
  DEVICE_DUE: 4,
  DEVICE_EXPIRED: 5,
} as const;

/** Result of sending a command to a device (`sendcmd`, video, intercom...). */
export const CommandResult = {
  UNKNOWN: -1,
  SENT_UNCONFIRMED: 0,
  WRONG_PASSWORD: 1,
  OFFLINE_NOT_CACHED: 2,
  OFFLINE_CACHED: 3,
  MUST_CHANGE_DEFAULT_PASSWORD: 4,
  DETAIL_ERROR: 5,
  CONFIRMED: 6,
  RETRIES_EXHAUSTED: 7,
  SYNC_TIMEOUT: 8,
} as const;

export const CommandResultText: Record<number, string> = {
  [-1]: 'Unknown error',
  0: 'Sent, no confirmation received yet',
  1: 'Wrong command password',
  2: 'Device offline, command NOT queued',
  3: 'Device offline, command queued until it reconnects',
  4: 'Default command password must be changed',
  5: 'Unknown error (detail)',
  6: 'Sent and confirmed by device',
  7: 'Failed after 3 attempts',
  8: 'No confirmation within 60 seconds',
};

/** Command codes for `sendcmd` / batch `sendcommand`. */
export const CommandCode = {
  /** GT06 protocol: relay (fuel/power) cut. params ["1"] = cut, ["0"] = restore. */
  GT06_RELAY_OIL: 'TYPE_SERVER_SET_RELAY_OIL',
  /** JT808 protocol: lock vehicle (cut fuel/power). params []. */
  JT808_LOCK_CAR: 'TYPE_SERVER_LOCK_CAR',
  /** JT808 protocol: unlock vehicle (restore fuel/power). params []. */
  JT808_UNLOCK_CAR: 'TYPE_SERVER_UNLOCK_CAR',
  /** Overspeed setting. params [speedKmh, durationSeconds]. */
  SET_SPEED_LIMIT: 'TYPE_SERVER_SET_SPEED_LIMIT',
  /** Text-to-speech announcement on the device. params [text]. */
  PUSH_TTS: 'TYPE_SERVER_PUSH_TTS',
} as const;

/** `devicetype` value for JT808 ("部标808") devices. */
export const DEVICE_TYPE_JT808 = 1;

/** Platform user types (`adduser.usertype`). */
export const UserType = {
  SYSTEM_ADMIN: 1,
  LEVEL1_ADMIN: 2,
  LEVEL2_ADMIN: 3,
  LEVEL3_ADMIN: 4,
  MONITOR: 11,
  DEVICE: 99,
} as const;

/** Why a position was reported (`reportmode`). */
export const ReportModeText: Record<number, string> = {
  0x00: 'Timed report',
  0x01: 'Distance-interval report',
  0x02: 'Corner (heading change) report',
  0x03: 'ACC (ignition) state change',
  0x04: 'Last fix after moving -> stopped',
  0x05: 'Last valid fix re-sent after reconnect',
  0x06: 'Forced GPS upload after ephemeris update',
  0x07: 'Button press',
  0x08: 'Power-on report',
  0x09: 'Unused',
  0x0a: 'Stationary: last position, time updated',
  0x0b: 'Wi-Fi resolved position',
  0x0c: 'Immediate-locate (LJDW) command reply',
  0x0d: 'Stationary: last position',
  0x0e: 'GPSDUP upload (timed while stationary)',
};

/** Sentinel values the vendor uses for "no reading". */
export const INVALID_TEMPERATURE = 65535;
export const INVALID_HUMIDITY = -1;
export const INVALID_VOLTAGE = -1;
