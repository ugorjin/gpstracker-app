-- Customer accounts, users, devices and audit of commands.
--
-- Organisations form a tree:
--   platform (us) -> reseller (optional, any depth) -> customer
-- A user belongs to one organisation and can see that organisation and
-- everything below it.

CREATE TABLE organizations (
  id               bigserial PRIMARY KEY,
  parent_id        bigint REFERENCES organizations(id),
  type             text NOT NULL CHECK (type IN ('platform', 'reseller', 'customer')),
  -- Only for customers: a business fleet or a private individual.
  customer_kind    text CHECK (customer_kind IN ('business', 'individual')),
  name             text NOT NULL,
  -- ISO 3166-1 alpha-2, e.g. NG, GH, KE.
  country_code     text NOT NULL DEFAULT 'NG' CHECK (country_code ~ '^[A-Z]{2}$'),
  -- Offset from UTC in minutes for reports and display. Nigeria (WAT) = 60.
  utc_offset_minutes integer NOT NULL DEFAULT 60 CHECK (utc_offset_minutes BETWEEN -720 AND 840),
  phone            text,
  email            text,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((type = 'platform') = (parent_id IS NULL)),
  CHECK ((type = 'customer') = (customer_kind IS NOT NULL))
);
CREATE INDEX organizations_parent_idx ON organizations (parent_id);
-- Only one platform (root) organisation.
CREATE UNIQUE INDEX organizations_single_platform ON organizations ((true)) WHERE type = 'platform';

CREATE TABLE users (
  id             bigserial PRIMARY KEY,
  org_id         bigint NOT NULL REFERENCES organizations(id),
  name           text NOT NULL,
  -- Stored lower-cased.
  email          text UNIQUE,
  -- Stored in E.164, e.g. +2348031234567.
  phone          text UNIQUE,
  password_hash  text NOT NULL,
  role           text NOT NULL CHECK (role IN ('owner', 'admin', 'operator', 'viewer')),
  active         boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX users_org_idx ON users (org_id);

-- Login sessions. Only a SHA-256 hash of the token is stored.
CREATE TABLE sessions (
  token_hash    bytea PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  user_agent    text,
  ip            text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- Our device inventory. `device_id` is the vendor's device serial number (IMEI),
-- the same id used in positions / device_state / alarms.
CREATE TABLE devices (
  device_id           text PRIMARY KEY,
  org_id              bigint NOT NULL REFERENCES organizations(id),
  name                text NOT NULL,
  kind                text NOT NULL DEFAULT 'car'
                      CHECK (kind IN ('car', 'motorbike', 'truck', 'bus', 'boat', 'generator', 'asset', 'person', 'pet', 'other')),
  plate_number        text,
  -- Vendor `devicetype` (decides which command codes apply). 1 = JT808.
  vendor_device_type  integer NOT NULL,
  sim_number          text,
  notes               text,
  active              boolean NOT NULL DEFAULT true,
  -- End of the customer's paid subscription. NULL = no expiry.
  paid_until          timestamptz,
  installed_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_org_idx ON devices (org_id);

-- Every command sent to a device, who sent it, and the result.
CREATE TABLE command_log (
  id           bigserial PRIMARY KEY,
  device_id    text NOT NULL,
  user_id      bigint REFERENCES users(id),
  command      text NOT NULL,
  params       jsonb,
  -- Vendor command result code (see vendor constants), NULL if the call failed.
  status       integer,
  status_text  text,
  accepted     boolean NOT NULL DEFAULT false,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX command_log_device_idx ON command_log (device_id, created_at DESC);

-- Alarm acknowledgement now refers to a user.
ALTER TABLE alarms DROP COLUMN acknowledged_by;
ALTER TABLE alarms ADD COLUMN acknowledged_by_user_id bigint REFERENCES users(id);
ALTER TABLE alarms ADD COLUMN acknowledge_note text;
