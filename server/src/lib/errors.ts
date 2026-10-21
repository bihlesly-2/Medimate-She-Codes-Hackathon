import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from './logger';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
export const forbidden = (message = 'You do not have access to this.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Item') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const premiumRequired = (feature: string) =>
  new AppError(402, 'PREMIUM_REQUIRED', 'This feature is part of MEDIMATE Premium. Your free trial has ended.', { feature });
export const consentRequired = (purpose: string) =>
  new AppError(403, 'CONSENT_REQUIRED', 'Please review and give consent in Settings before using this feature.', { purpose });

export function zodToAppError(err: ZodError): AppError {
  return new AppError(
    400,
    'VALIDATION_ERROR',
    'Some fields need attention.',
    err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  );
}

/** Consistent, safe error responses: never stack traces or configuration. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const requestId = (req as { requestId?: string }).requestId;
    let appErr: AppError;
    if (err instanceof AppError) appErr = err;
    else if (err instanceof ZodError) appErr = zodToAppError(err);
    else if (err?.type === 'entity.parse.failed') appErr = badRequest('The request body is not valid JSON.');
    else if (err?.type === 'entity.too.large') appErr = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request is too large.');
    else {
      logger.error('unhandled_error', { requestId, path: req.path, error: err instanceof Error ? err.stack : String(err) });
      appErr = new AppError(500, 'INTERNAL', 'Something went wrong on our side. Please try again.');
    }
    if (appErr.status >= 500 && appErr.code !== 'INTERNAL') {
      logger.error('server_error', { requestId, path: req.path, code: appErr.code, message: appErr.message });
    }
    res.status(appErr.status).json({ error: { code: appErr.code, message: appErr.message, details: appErr.details, requestId } });
  };
}
