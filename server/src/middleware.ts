import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ConsentPurpose, Feature, Role } from '@medimate/shared';
import { forbidden, unauthenticated } from './lib/errors';
import type { Deps } from './types';
import { loadSession, SESSION_COOKIE } from './services/auth';
import { assertConsent, assertFeature } from './services/users';

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  };
}

/** Attach the signed-in user (if any) from the httpOnly session cookie. */
export function sessionLoader(deps: Deps): RequestHandler {
  return async (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string' && token.length > 20) {
      const s = await loadSession(deps, token);
      if (s) req.auth = s;
    }
    next();
  };
}

const ORIGIN_EXEMPT = ['/api/sms/inbound', '/api/sms/twilio', '/api/ussd/', '/api/billing/fapshi/webhook', '/api/cron/'];

/**
 * CSRF defence for cookie sessions: SameSite=Lax cookies plus an Origin check on every
 * state-changing request. Provider webhooks are exempt (they use shared secrets instead).
 */
export function originCheck(deps: Deps): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (ORIGIN_EXEMPT.some((p) => req.originalUrl.startsWith(p))) return next();
    const origin = req.get('origin');
    if (origin) {
      const host = req.get('x-forwarded-host') ?? req.get('host');
      let ok = deps.config.allowedOrigins.includes(origin.replace(/\/$/, ''));
      try {
        if (new URL(origin).host === host) ok = true;
      } catch {
        ok = false;
      }
      if (!ok) return next(forbidden('This request came from another site and was blocked.'));
    } else if (req.get('sec-fetch-site') === 'cross-site') {
      return next(forbidden('This request came from another site and was blocked.'));
    }
    next();
  };
}

export const authRequired: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthenticated());
  next();
};

/** Role check. Object-level ownership is still enforced in every service call. */
export function roles(...allowed: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(unauthenticated());
    if (!req.auth.roles.some((r) => allowed.includes(r))) return next(forbidden());
    next();
  };
}

export function feature(deps: Deps, f: Feature): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthenticated());
    await assertFeature(deps, req.auth.userId, f);
    next();
  };
}

export function consent(deps: Deps, purpose: ConsentPurpose): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthenticated());
    await assertConsent(deps.db, req.auth.userId, purpose);
    next();
  };
}
