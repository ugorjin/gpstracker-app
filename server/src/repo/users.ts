import { camel, type Db, type Role, type User, type UserWithHash } from './types.js';

const COLS = `id, org_id, name, email, phone, role, active, last_login_at, created_at`;

export async function findUserByLogin(db: Db, login: { email?: string; phone?: string }): Promise<UserWithHash | undefined> {
  if (!login.email && !login.phone) return undefined;
  const { rows } = await db.query(
    `SELECT ${COLS}, password_hash FROM users WHERE ${login.email ? 'email = $1' : 'phone = $1'}`,
    [login.email ?? login.phone],
  );
  return rows[0] ? camel<UserWithHash>(rows[0]) : undefined;
}

export async function getUser(db: Db, id: number): Promise<User | undefined> {
  const { rows } = await db.query(`SELECT ${COLS} FROM users WHERE id = $1`, [id]);
  return rows[0] ? camel<User>(rows[0]) : undefined;
}

export async function getUserWithHash(db: Db, id: number): Promise<UserWithHash | undefined> {
  const { rows } = await db.query(`SELECT ${COLS}, password_hash FROM users WHERE id = $1`, [id]);
  return rows[0] ? camel<UserWithHash>(rows[0]) : undefined;
}

export async function listUsers(db: Db, orgId: number): Promise<User[]> {
  const { rows } = await db.query(`SELECT ${COLS} FROM users WHERE org_id = $1 ORDER BY name`, [orgId]);
  return rows.map((r) => camel<User>(r));
}

export interface NewUser {
  orgId: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  passwordHash: string;
  role: Role;
}

export async function createUser(db: Db, u: NewUser): Promise<User> {
  const { rows } = await db.query(
    `INSERT INTO users (org_id, name, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLS}`,
    [u.orgId, u.name, u.email ?? null, u.phone ?? null, u.passwordHash, u.role],
  );
  return camel<User>(rows[0]);
}

export interface UserPatch {
  name?: string;
  email?: string | null;
  phone?: string | null;
  role?: Role;
  active?: boolean;
  passwordHash?: string;
}

export async function updateUser(db: Db, id: number, patch: UserPatch): Promise<User | undefined> {
  const map: Record<keyof UserPatch, string> = {
    name: 'name',
    email: 'email',
    phone: 'phone',
    role: 'role',
    active: 'active',
    passwordHash: 'password_hash',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, col] of Object.entries(map) as [keyof UserPatch, string][]) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length === 0) return getUser(db, id);
  const { rows } = await db.query(`UPDATE users SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${COLS}`, params);
  return rows[0] ? camel<User>(rows[0]) : undefined;
}

export async function markLogin(db: Db, id: number): Promise<void> {
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [id]);
}

/** Number of active owners of an organisation (to avoid removing the last one). */
export async function countActiveOwners(db: Db, orgId: number): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM users WHERE org_id = $1 AND role = 'owner' AND active`,
    [orgId],
  );
  return rows[0]?.n ?? 0;
}
