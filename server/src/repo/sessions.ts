import { camel, type Db, type Organization, type User } from './types.js';

export async function createSession(
  db: Db,
  s: { tokenHash: Buffer; userId: number; expiresAt: Date; userAgent?: string; ip?: string },
): Promise<void> {
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip) VALUES ($1, $2, $3, $4, $5)`,
    [s.tokenHash, s.userId, s.expiresAt, s.userAgent?.slice(0, 300) ?? null, s.ip ?? null],
  );
}

/**
 * Finds a valid session: not expired, user active, organisation active.
 * Also touches `last_used_at` (at most once a minute).
 */
export async function findSession(db: Db, tokenHash: Buffer): Promise<{ user: User; org: Organization } | undefined> {
  const { rows } = await db.query(
    `UPDATE sessions s SET last_used_at = now()
       FROM users u JOIN organizations o ON o.id = u.org_id
      WHERE s.token_hash = $1 AND s.user_id = u.id
        AND s.expires_at > now() AND u.active AND o.active
     RETURNING
       u.id AS u_id, u.org_id AS u_org_id, u.name AS u_name, u.email AS u_email, u.phone AS u_phone,
       u.role AS u_role, u.active AS u_active, u.last_login_at AS u_last_login_at, u.created_at AS u_created_at,
       o.id AS o_id, o.parent_id AS o_parent_id, o.type AS o_type, o.customer_kind AS o_customer_kind,
       o.name AS o_name, o.country_code AS o_country_code, o.utc_offset_minutes AS o_utc_offset_minutes,
       o.phone AS o_phone, o.email AS o_email, o.active AS o_active, o.created_at AS o_created_at`,
    [tokenHash],
  );
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) return undefined;
  const pick = (prefix: string) =>
    Object.fromEntries(Object.entries(row).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
  return { user: camel<User>(pick('u_')), org: camel<Organization>(pick('o_')) };
}

export async function deleteSession(db: Db, tokenHash: Buffer): Promise<void> {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

/** Logs a user out everywhere (e.g. after a password change), optionally keeping one session. */
export async function deleteUserSessions(db: Db, userId: number, exceptHash?: Buffer): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1 AND ($2::bytea IS NULL OR token_hash <> $2)', [userId, exceptHash ?? null]);
}

export async function deleteExpiredSessions(db: Db): Promise<number> {
  const res = await db.query('DELETE FROM sessions WHERE expires_at <= now()');
  return res.rowCount ?? 0;
}
