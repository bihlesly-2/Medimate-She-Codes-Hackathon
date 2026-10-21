import type { Request } from 'express';
import type { ZodTypeAny, z } from 'zod';
import { unauthenticated, zodToAppError } from './errors';
import type { AuthInfo } from '../types';

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw zodToAppError(r.error);
  return r.data;
}

export function requireAuth(req: Request): AuthInfo {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}

/** Route params are strings in Express 5 types; normalise and validate UUID shape. */
export function param(req: Request, name: string): string {
  const v = req.params[name];
  return typeof v === 'string' ? v : '';
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
