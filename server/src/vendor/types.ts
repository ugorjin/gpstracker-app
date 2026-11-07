/**
 * Response shapes from the vendor API. Only the fields we rely on are typed;
 * every record also keeps any extra fields the vendor sends.
 * Full field lists: docs/vendor-api/.
 */

export interface VendorResponse {
  status: number;
  cause?: string;
  [key: string]: unknown;
}

export interface LoginResponse extends VendorResponse {
  token: string;
  serverid: number;
}

export interface VendorDevice {
  deviceid: string;
  devicename: string;
  devicetype: number;
  simnum?: string;
  /** Platform expiry, epoch ms. */
  overduetime?: number;
  /** Device expiry shown to users, epoch ms. */
  expirenotifytime?: number;
  remark?: string;
  creater?: string;
  videochannelcount?: number;
  lastactivetime?: number;
  /** 1 normal, 2 trial, 3 disabled, 4 due, 5 expired. */
  isfree?: number;
  allowedit?: number;
  icon?: number;
  stared?: number;
  loginname?: string;
  offlinedelay?: number;
  [key: string]: unknown;
}

export interface VendorDeviceGroup {
  groupid: number;
  groupname: string;
  remark?: string;
  devices: VendorDevice[];
}

export interface DeviceListResponse extends VendorResponse {
  groups: VendorDeviceGroup[];
}

export interface VendorDeviceType {
  devicetypeid: number;
  typename: string;
  typecode: string;
  remark?: string;
  remarken?: string;
  functionslong?: number;
  defaultofflinedelay?: number;
  defaultidlength?: number;
  enabled?: number;
  supportmodels?: string;
  price?: number;
  price3?: number;
  price5?: number;
  price10?: number;
  [key: string]: unknown;
}

/** One record of `lastposition` (also used by `reportoiltime`). */
export interface VendorPosition {
  deviceid: string;
  devicetime?: number;
  arrivedtime?: number;
  updatetime?: number;
  validpoistiontime?: number;
  callat: number;
  callon: number;
  altitude?: number;
  radius?: number;
  speed?: number;
  course?: number;
  totaldistance?: number;
  status?: number;
  strstatus?: string;
  strstatusen?: string;
  alarm?: number;
  stralarm?: string;
  stralarmsen?: string;
  gotsrc?: string;
  moving?: number;
  exvoltage?: number;
  voltagev?: number;
  voltagepercent?: number;
  reportmode?: number;
  [key: string]: unknown;
}

export interface LastPositionResponse extends VendorResponse {
  lastquerypositiontime: number;
  records: VendorPosition[];
}

export interface VendorTrackPoint {
  trackCount?: number;
  starttime?: number;
  endtime?: number;
  trackid?: number;
  arrivedtime?: number;
  updatetime?: number;
  callat: number;
  callon: number;
  altitude?: number;
  radius?: number;
  speed?: number;
  recorderspeed?: number;
  totaldistance?: number;
  course?: number;
  status?: number;
  strstatus?: string;
  strstatusen?: string;
  gotsrc?: string;
  reportmode?: number;
  [key: string]: unknown;
}

export interface TrackResponse extends VendorResponse {
  deviceid: string;
  records: VendorTrackPoint[];
}

/** Result of a command to a device. `status` is a `CommandResult` value. */
export interface CommandOutcome extends VendorResponse {
  deviceid?: string;
  /** Human-readable meaning of `status`. */
  statusText: string;
  /** True when the device confirmed, or the command is queued for when it reconnects. */
  accepted: boolean;
}

export interface BatchResult extends VendorResponse {
  total?: number;
  success?: number;
  fail?: number;
  successrecords?: unknown[];
  errorrecords?: unknown[];
}

/** Minimal identity of a device needed to send it a command. */
export interface DeviceRef {
  deviceid: string;
  devicetype: number;
}
