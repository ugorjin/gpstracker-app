import type { FastifyRequest } from 'fastify';
import type pg from 'pg';
import { z, type ZodTypeAny } from 'zod';
import type { LoginThrottle } from '../auth/tokens.js';
import type { PushEvents } from '../push/routes.js';
import type { VendorClient } from '../vendor/client.js';
import type { Principal } from './access.js';
import { badRequest, unauthorized } from './errors.js';

/** Vendor operations the API uses. A subset of VendorClient so tests can fake it. */
export type VendorActions = Pick<VendorClient, 'cutEngine' | 'restoreEngine' | 'setSpeedLimit' | 'addDevice'>;

export interface ApiOptions {
  pool: pg.Pool;
  vendor: VendorActions;
  events: PushEvents;
  /** Default country (ISO-2) for phone numbers typed without a country code. */
  defaultCountry?: string;
  sessionTtlDays?: number;
  /** No push for this long = device shown as offline. */
  offlineAfterMinutes?: number;
  loginThrottle?: LoginThrottle;
  ipThrottle?: LoginThrottle;
}

export interface ApiContext extends Required<Omit<ApiOptions, 'loginThrottle' | 'ipThrottle'>> {
  loginThrottle: LoginThrottle;
  ipThrottle: LoginThrottle;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
    sessionTokenHash?: Buffer;
  }
}

export function principalOf(req: FastifyRequest): Principal {
  if (!req.principal) throw unauthorized();
  return req.principal;
}

/** Validates input with a zod schema; turns problems into a 400 with details. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw badRequest(
      'Invalid input',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const deviceIdParam = z.object({ id: z.string().min(1).max(64) });

/** Postgres unique-violation error code. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && (constraint === undefined || e.constraint === constraint);
}
