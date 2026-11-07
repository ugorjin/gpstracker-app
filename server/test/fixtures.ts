/**
 * Example payloads in the shape documented by the vendor
 * (docs/vendor-api/data-forwarding.md). Values are made up.
 */
export const positionPush = {
  devicename: 'Toyota Hilux LAG-123-XY',
  deviceid: '868035043015161',
  lat: 6.5244,
  lon: 3.3792,
  arrivedtime: 1789347001000,
  updatetime: 1789347000000,
  validpoistiontime: 1789346990000,
  radius: 10,
  speed: 45600, // m/h -> 45.6 km/h
  altitude: 41,
  course: 270,
  totaldistance: 1234567,
  status: 3,
  strstatus: 'ACC ON',
  alarm: 0,
  stralarm: '',
  gotsrc: 'gps',
  rxlevel: 80,
  voltagev: 12.6,
  voltagepercent: 90,
  gpsvalidnum: 11,
  iostatus: -1,
  rotatestatus: -1,
  reportmode: 0,
  moving: 1,
  fuledata: { totalRunningAd: 152000, totalNotRunningAd: 3000, ad0: 4550, ad1: -1, ad2: -1, ad3: -1 },
  tempdata: { temp1: 450, temp2: 65535, temp3: 65535, temp4: 65535, humi1: 655, humi2: -1 },
  parkduration: 0,
  devicealarm: null,
};

export const alarmPush = {
  deviceid: '868035043015161',
  lat: 6.6,
  lon: 3.35,
  arrivedtime: 1789347061000,
  updatetime: 1789347060000,
  speed: 0,
  altitude: 40,
  course: 0,
  totaldistance: 1234600,
  alarmtype: 1,
  alarm: 1,
  stralarm: 'SOS',
  startalarmtime: 1789347060000,
  lastalarmtime: 1789347060000,
  alarmcount: 1,
};
