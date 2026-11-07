import type { Principal } from '../access.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../../auth/password.js';
import { normalizeEmail, normalizePhone } from '../../auth/phone.js';
import { deleteUserSessions } from '../../repo/sessions.js';
import { createOrg, getOrg, listOrgs, updateOrg } from '../../repo/orgs.js';
import { countActiveOwners, createUser, getUser, listUsers, updateUser, type UserPatch } from '../../repo/users.js';
import { ROLE_RANK, type Role } from '../../repo/types.js';
import { idParam, isUniqueViolation, parse, principalOf, type ApiContext } from '../context.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { orgDto, userDto } from '../dto.js';

const roleSchema = z.enum(['owner', 'admin', 'operator', 'viewer']);
const countrySchema = z
  .string()
  .regex(/^[A-Za-z]{2}$/, 'Use a 2-letter country code, e.g. NG')
  .transform((s) => s.toUpperCase());
const offsetSchema = z.number().int().min(-720).max(840);
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

const userInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: nullableText(200),
  phone: nullableText(40),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
  role: roleSchema,
});

const createOrgBody = z
  .object({
    /** Defaults to the caller's own organisation. */
    parentId: z.number().int().positive().optional(),
    type: z.enum(['reseller', 'customer']),
    customerKind: z.enum(['business', 'individual']).optional(),
    name: z.string().trim().min(1).max(200),
    countryCode: countrySchema.optional(),
    utcOffsetMinutes: offsetSchema.optional(),
    phone: nullableText(40),
    email: nullableText(200),
    /** Optionally create the first user (owner) at the same time. */
    owner: userInput.omit({ role: true }).optional(),
  })
  .refine((o) => (o.type === 'customer') === (o.customerKind !== undefined), {
    message: 'customerKind is required for customers and not allowed for resellers',
    path: ['customerKind'],
  });

const patchOrgBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  countryCode: countrySchema.optional(),
  utcOffsetMinutes: offsetSchema.optional(),
  phone: nullableText(40),
  email: nullableText(200),
  customerKind: z.enum(['business', 'individual']).optional(),
  active: z.boolean().optional(),
});

const patchUserBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: nullableText(200),
  phone: nullableText(40),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  /** Set a new password (admin reset). Logs the user out everywhere. */
  password: z.string().min(MIN_PASSWORD_LENGTH).max(200).optional(),
});

const listOrgsQuery = z.object({
  type: z.enum(['platform', 'reseller', 'customer']).optional(),
  q: z.string().max(100).optional(),
});

/** Normalises email/phone; `undefined` = not given, `null` = clear it. */
function contactFields(input: { email?: string | null; phone?: string | null }, countryCode: string) {
  const out: { email?: string | null; phone?: string | null } = {};
  if (input.email !== undefined) {
    if (input.email === null || input.email === '') out.email = null;
    else {
      const email = normalizeEmail(input.email);
      if (!email) throw badRequest('Invalid email address', [{ field: 'email', message: 'Invalid email address' }]);
      out.email = email;
    }
  }
  if (input.phone !== undefined) {
    if (input.phone === null || input.phone === '') out.phone = null;
    else {
      const phone = normalizePhone(input.phone, countryCode);
      if (!phone) throw badRequest('Invalid phone number', [{ field: 'phone', message: 'Invalid phone number' }]);
      out.phone = phone;
    }
  }
  return out;
}

function duplicateLogin(err: unknown): never {
  if (isUniqueViolation(err, 'users_email_key')) throw conflict('This email address is already used by another account');
  if (isUniqueViolation(err, 'users_phone_key')) throw conflict('This phone number is already used by another account');
  throw err;
}

export const orgRoutes: FastifyPluginAsync<{ ctx: ApiContext }> = async (app, { ctx }) => {
  // ---------------------------------------------------------------- orgs

  app.get('/orgs', async (req) => {
    const p: Principal = principalOf(req);
    const q = parse(listOrgsQuery, req.query);
    return { orgs: (await listOrgs(ctx.pool, p.visibleOrgIds, q)).map(orgDto) };
  });

  app.get('/orgs/:id', async (req) => {
    const p: Principal = principalOf(req);
    const { id } = parse(idParam, req.params);
    p.assertOrgVisible(id);
    const org = await getOrg(ctx.pool, id);
    if (!org) throw notFound('Organization');
    return { org: orgDto(org) };
  });

  app.post('/orgs', async (req, reply) => {
    const p: Principal = principalOf(req);
    p.assertCanManageChildOrgs();
    const body = parse(createOrgBody, req.body);
    const parentId = body.parentId ?? p.org.id;
    p.assertOrgVisible(parentId);
    const parent = await getOrg(ctx.pool, parentId);
    if (!parent) throw notFound('Parent organization');
    if (parent.type === 'customer') throw badRequest('Customers cannot have sub-accounts');

    const countryCode = body.countryCode ?? parent.countryCode;
    const orgContact = contactFields(body, countryCode);
    const ownerContact = body.owner ? contactFields(body.owner, countryCode) : undefined;
    if (body.owner && !ownerContact?.email && !ownerContact?.phone) {
      throw badRequest('The owner needs an email address or a phone number to log in');
    }

    const client = await ctx.pool.connect();
    try {
      await client.query('BEGIN');
      const org = await createOrg(client, {
        parentId,
        type: body.type,
        customerKind: body.customerKind ?? null,
        name: body.name,
        countryCode,
        utcOffsetMinutes: body.utcOffsetMinutes ?? parent.utcOffsetMinutes,
        ...orgContact,
      });
      const owner = body.owner
        ? await createUser(client, {
            orgId: org.id,
            name: body.owner.name,
            ...ownerContact,
            passwordHash: await hashPassword(body.owner.password),
            role: 'owner',
          }).catch(duplicateLogin)
        : undefined;
      await client.query('COMMIT');
      return reply.code(201).send({ org: orgDto(org), owner: owner ? userDto(owner) : undefined });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });

  app.patch('/orgs/:id', async (req) => {
    const p: Principal = principalOf(req);
    const { id } = parse(idParam, req.params);
    p.assertCanEditOrg(id);
    const body = parse(patchOrgBody, req.body);
    const own = id === p.org.id;
    if (own && (body.active !== undefined || body.customerKind !== undefined)) {
      throw forbidden('You cannot change the status or type of your own organization');
    }
    const existing = await getOrg(ctx.pool, id);
    if (!existing) throw notFound('Organization');
    if (body.customerKind && existing.type !== 'customer') throw badRequest('Only customers have a customer kind');
    const org = await updateOrg(ctx.pool, id, {
      ...body,
      ...contactFields(body, body.countryCode ?? existing.countryCode),
    });
    return { org: orgDto(org!) };
  });

  // --------------------------------------------------------------- users

  app.get('/orgs/:id/users', async (req) => {
    const p: Principal = principalOf(req);
    const { id } = parse(idParam, req.params);
    p.assertCanManageUsers(id);
    return { users: (await listUsers(ctx.pool, id)).map(userDto) };
  });

  app.post('/orgs/:id/users', async (req, reply) => {
    const p: Principal = principalOf(req);
    const { id } = parse(idParam, req.params);
    const body = parse(userInput, req.body);
    p.assertCanManageUsers(id, body.role);
    const org = await getOrg(ctx.pool, id);
    if (!org) throw notFound('Organization');
    const contact = contactFields(body, org.countryCode);
    if (!contact.email && !contact.phone) throw badRequest('A user needs an email address or a phone number to log in');
    const user = await createUser(ctx.pool, {
      orgId: id,
      name: body.name,
      ...contact,
      passwordHash: await hashPassword(body.password),
      role: body.role,
    }).catch(duplicateLogin);
    return reply.code(201).send({ user: userDto(user) });
  });

  app.patch('/users/:id', async (req) => {
    const p: Principal = principalOf(req);
    const { id } = parse(idParam, req.params);
    const body = parse(patchUserBody, req.body);
    const target = await getUser(ctx.pool, id);
    if (!target || !p.canSeeOrg(target.orgId)) throw notFound('User');

    const self = target.id === p.user.id;
    if (self && (body.role !== undefined || body.active !== undefined)) {
      throw forbidden('You cannot change your own role or deactivate yourself');
    }
    if (self && body.password !== undefined) throw badRequest('Use /me/password to change your own password');
    p.assertCanManageUsers(target.orgId, body.role);
    // In your own organisation you can't edit someone ranked above you.
    if (target.orgId === p.org.id && ROLE_RANK[target.role] > ROLE_RANK[p.user.role]) throw forbidden();

    const losingOwner =
      target.role === 'owner' && target.active && ((body.role !== undefined && body.role !== 'owner') || body.active === false);
    if (losingOwner && (await countActiveOwners(ctx.pool, target.orgId)) <= 1) {
      throw badRequest('An organization must keep at least one active owner');
    }

    const org = await getOrg(ctx.pool, target.orgId);
    const patch: UserPatch = {
      name: body.name,
      role: body.role as Role | undefined,
      active: body.active,
      ...contactFields(body, org!.countryCode),
    };
    if (body.password) patch.passwordHash = await hashPassword(body.password);
    const merged = { email: patch.email !== undefined ? patch.email : target.email, phone: patch.phone !== undefined ? patch.phone : target.phone };
    if (!merged.email && !merged.phone) throw badRequest('A user needs an email address or a phone number to log in');

    const user = await updateUser(ctx.pool, id, patch).catch(duplicateLogin);
    if (body.password || body.active === false) await deleteUserSessions(ctx.pool, id);
    return { user: userDto(user!) };
  });
};
