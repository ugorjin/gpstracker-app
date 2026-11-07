-- Data received from the vendor's push ("data forwarding").
-- All timestamps are timestamptz (stored as UTC).

-- Every push as received, for audit, debugging and re-processing.
CREATE TABLE vendor_push_log (
  id           bigserial PRIMARY KEY,
  received_at  timestamptz NOT NULL DEFAULT now(),
  kind         text        NOT NULL,          -- position | alarm | unknown
  device_id    text,
  signed       boolean     NOT NULL,
  body         text        NOT NULL,          -- raw body exactly as received
  problem      text                            -- why it was not fully processed, if so
);
CREATE INDEX vendor_push_log_device_idx ON vendor_push_log (device_id, received_at DESC);
CREATE INDEX vendor_push_log_received_idx ON vendor_push_log (received_at);

-- Full location history. One row per device per platform update time.
-- This is our own history source, so we never need to sync tracks from the vendor API.
-- For large fleets, convert to a TimescaleDB hypertable or partition by month.
CREATE TABLE positions (
  device_id        text             NOT NULL,
  recorded_at      timestamptz      NOT NULL,
  fix_at           timestamptz,
  received_at      timestamptz,
  stored_at        timestamptz      NOT NULL DEFAULT now(),
  lat              double precision NOT NULL,
  lon              double precision NOT NULL,
  speed_kmh        real,
  course           smallint,
  altitude_m       real,
  accuracy_m       real,
  odometer_m       bigint,
  source           text,
  satellites       smallint,
  signal_pct       smallint,
  voltage          real,
  battery_pct      real,
  moving           boolean,
  report_mode      smallint,
  status_code      bigint,
  status_text      text,
  alarm_code       bigint,
  alarm_text       text,
  io_status        integer,
  park_duration_ms bigint,
  fuel             jsonb,
  sensors          jsonb,
  PRIMARY KEY (device_id, recorded_at)
);

-- Latest known state per device, for the live map. Only moves forward in time.
CREATE TABLE device_state (
  device_id    text PRIMARY KEY,
  device_name  text,
  recorded_at  timestamptz      NOT NULL,
  lat          double precision NOT NULL,
  lon          double precision NOT NULL,
  speed_kmh    real,
  course       smallint,
  moving       boolean,
  voltage      real,
  battery_pct  real,
  odometer_m   bigint,
  source       text,
  status_text  text,
  alarm_text   text,
  fuel         jsonb,
  sensors      jsonb,
  updated_at   timestamptz      NOT NULL DEFAULT now()
);

-- Alarm events. A long-running alarm is pushed repeatedly with the same start
-- time; we keep one row and update its last time and count.
CREATE TABLE alarms (
  id            bigserial PRIMARY KEY,
  device_id     text             NOT NULL,
  category      smallint         NOT NULL,     -- 1 normal, 2 video
  alarm_code    bigint           NOT NULL,
  alarm_text    text,
  started_at    timestamptz      NOT NULL,
  last_at       timestamptz      NOT NULL,
  count         integer          NOT NULL DEFAULT 1,
  lat           double precision,
  lon           double precision,
  speed_kmh     real,
  course        smallint,
  odometer_m    bigint,
  received_at   timestamptz,
  created_at    timestamptz      NOT NULL DEFAULT now(),
  updated_at    timestamptz      NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by text,
  UNIQUE (device_id, alarm_code, started_at)
);
CREATE INDEX alarms_device_idx ON alarms (device_id, started_at DESC);
CREATE INDEX alarms_open_idx ON alarms (started_at DESC) WHERE acknowledged_at IS NULL;
