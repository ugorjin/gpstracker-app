import type { Principal } from '../access.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDummyHash, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from '../../auth/password.js';
import { normalizeEmail, normalizePhone } from '../../auth/phone.js';
import { newSessionToken } from '../../auth/tokens.js';
import { getOrg } from '../../repo/orgs.js';
import { createSession, deleteSession, deleteUserSessions } from '../../repo/sessions.js';
import { findUserByLogin, getUserWithHash, markLogin, updateUser } from '../../repo/users.js';
import type { ApiContext } from '../context.js';
import { parse, principalOf } from '../context.js';
import { badRequest, tooManyRequests, unauthorized } from '../errors.js';
import { orgDto, userDto } from '../dto.js';

const loginBody = z.object({
  /** Email address or phone number. */
  login: z.string().min(3).max(200),
  password: z.string().min(1).max(200),
});

const passwordBody = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
});

/** Turns what the user typed into an email or E.164 phone lookup. */
export function parseLogin(login: string, defaultCountry: string): { email?: string; phone?: string } | undefined {
  if (login.includes('@')) {
    const email = normalizeEmail(login);
    return email ? { email } : undefined;
  }
  const phone = normalizePhone(login, defaultCountry);
  return phone ? { phone } : undefined;
}

export const authRoutes: FastifyPluginAsync<{ ctx: ApiContext }> = async (app, { ctx }) => {
  app.post('/auth/login', async (req, reply) => {
    const body = parse(loginBody, req.body);
    const login = parseLogin(body.login, ctx.defaultCountry);
    const loginKey = login?.email ?? login?.phone ?? body.login.trim().toLowerCase();
    const ipKey = `ip:${req.ip}`;

    const wait = Math.max(ctx.loginThrottle.blockedFor(loginKey), ctx.ipThrottle.blockedFor(ipKey));
    if (wait > 0) throw tooManyRequests(`Too many failed attempts. Try again in ${Math.ceil(wait / 60_000)} minutes.`);

    const user = login ? await findUserByLogin(ctx.pool, login) : undefined;
    // Always run a hash check so response time doesn't reveal whether the account exists.
    const ok = await verifyPassword(body.password, user?.passwordHash ?? (await getDummyHash()));
    const org = user && ok ? await getOrg(ctx.pool, user.orgId) : undefined;
    if (!user || !ok || !user.active || !org?.active) {
      ctx.loginThrottle.fail(loginKey);
      ctx.ipThrottle.fail(ipKey);
      throw unauthorized('Wrong login or password');
    }
    ctx.loginThrottle.succeed(loginKey);

    const { token, hash } = newSessionToken();
    const expiresAt = new Date(Date.now() + ctx.sessionTtlDays * 86_400_000);
    await createSession(ctx.pool, { tokenHash: hash, userId: user.id, expiresAt, userAgent: req.headers['user-agent'], ip: req.ip });
    await markLogin(ctx.pool, user.id);
    const { passwordHash: _omit, ...publicUser } = user;
    return reply.send({ token, expiresAt, user: userDto(publicUser), org: orgDto(org) });
  });

  app.post('/auth/logout', async (req, reply) => {
    if (req.sessionTokenHash) await deleteSession(ctx.pool, req.sessionTokenHash);
    return reply.code(204).send();
  });

  app.get('/me', async (req) => {
    const p: Principal = principalOf(req);
    return {
      user: userDto(p.user),
      org: orgDto(p.org),
      permissions: {
        isStaff: p.isStaff,
        manageUsers: p.hasRole('admin'),
        manageCustomers: p.isStaff && p.hasRole('admin'),
        manageDeviceInventory: p.isStaff && p.hasRole('admin'),
        sendCommands: p.hasRole('admin'),
        acknowledgeAlarms: p.hasRole('operator'),
      },
    };
  });

  app.post('/me/password', async (req, reply) => {
    const p: Principal = principalOf(req);
    const body = parse(passwordBody, req.body);
    const user = await getUserWithHash(ctx.pool, p.user.id);
    if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw badRequest('Current password is wrong');
    }
    await updateUser(ctx.pool, user.id, { passwordHash: await hashPassword(body.newPassword) });
    // Log out every other device.
    await deleteUserSessions(ctx.pool, user.id, req.sessionTokenHash);
    return reply.code(204).send();
  });
};
