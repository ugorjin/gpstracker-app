import { camel, type CustomerKind, type Db, type Organization, type OrgType } from './types.js';

const COLS = `id, parent_id, type, customer_kind, name, country_code, utc_offset_minutes, phone, email, active, created_at`;

export async function getOrg(db: Db, id: number): Promise<Organization | undefined> {
  const { rows } = await db.query(`SELECT ${COLS} FROM organizations WHERE id = $1`, [id]);
  return rows[0] ? camel<Organization>(rows[0]) : undefined;
}

export async function getPlatformOrg(db: Db): Promise<Organization | undefined> {
  const { rows } = await db.query(`SELECT ${COLS} FROM organizations WHERE type = 'platform'`);
  return rows[0] ? camel<Organization>(rows[0]) : undefined;
}

/** The organisation and all organisations below it. */
export async function subtreeIds(db: Db, rootId: number): Promise<number[]> {
  const { rows } = await db.query<{ id: string }>(
    `WITH RECURSIVE tree AS (
       SELECT id FROM organizations WHERE id = $1
       UNION ALL
       SELECT o.id FROM organizations o JOIN tree t ON o.parent_id = t.id
     ) SELECT id FROM tree`,
    [rootId],
  );
  return rows.map((r) => Number(r.id));
}

export async function listOrgs(db: Db, ids: number[], filter: { type?: OrgType; q?: string } = {}): Promise<Organization[]> {
  const params: unknown[] = [ids];
  let where = 'id = ANY($1::bigint[])';
  if (filter.type) {
    params.push(filter.type);
    where += ` AND type = $${params.length}`;
  }
  if (filter.q) {
    params.push(`%${filter.q}%`);
    where += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`;
  }
  const { rows } = await db.query(`SELECT ${COLS} FROM organizations WHERE ${where} ORDER BY type, name LIMIT 1000`, params);
  return rows.map((r) => camel<Organization>(r));
}

export interface NewOrg {
  parentId: number | null;
  type: OrgType;
  customerKind?: CustomerKind | null;
  name: string;
  countryCode?: string;
  utcOffsetMinutes?: number;
  phone?: string | null;
  email?: string | null;
}

export async function createOrg(db: Db, o: NewOrg): Promise<Organization> {
  const { rows } = await db.query(
    `INSERT INTO organizations (parent_id, type, customer_kind, name, country_code, utc_offset_minutes, phone, email)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'NG'), COALESCE($6, 60), $7, $8)
     RETURNING ${COLS}`,
    [o.parentId, o.type, o.customerKind ?? null, o.name, o.countryCode ?? null, o.utcOffsetMinutes ?? null, o.phone ?? null, o.email ?? null],
  );
  return camel<Organization>(rows[0]);
}

export interface OrgPatch {
  name?: string;
  countryCode?: string;
  utcOffsetMinutes?: number;
  phone?: string | null;
  email?: string | null;
  active?: boolean;
  customerKind?: CustomerKind;
}

export async function updateOrg(db: Db, id: number, patch: OrgPatch): Promise<Organization | undefined> {
  const map: Record<keyof OrgPatch, string> = {
    name: 'name',
    countryCode: 'country_code',
    utcOffsetMinutes: 'utc_offset_minutes',
    phone: 'phone',
    email: 'email',
    active: 'active',
    customerKind: 'customer_kind',
  };
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [key, col] of Object.entries(map) as [keyof OrgPatch, string][]) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length === 0) return getOrg(db, id);
  const { rows } = await db.query(
    `UPDATE organizations SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${COLS}`,
    params,
  );
  return rows[0] ? camel<Organization>(rows[0]) : undefined;
}
