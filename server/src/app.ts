import cookieParser from 'cookie-parser';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { errorHandler, notFound } from './lib/errors';
import { originCheck, requestId, sessionLoader } from './middleware';
import { openApiDocument } from './openapi';
import { channelRoutes } from './routes/channels';
import { patientRoutes } from './routes/patient';
import { publicRoutes } from './routes/public';
import { adminRoutes, careRoutes, pharmacyRoutes } from './routes/roles';
import type { Deps } from './types';

const limiter = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } },
  });

export function createApp(deps: Deps, opts: { rateLimits?: boolean } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestId());
  app.use(
    helmet({
      contentSecurityPolicy: false, // the API serves JSON; the web app sets its own CSP
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(express.json({ limit: '600kb' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));
  app.use(cookieParser());

  const api = Router();
  if (opts.rateLimits !== false) {
    api.use('/auth/otp', limiter(10 * 60_000, 20));
    api.use('/inquiries', limiter(60 * 60_000, 120));
    api.use('/reports', limiter(60 * 60_000, 20));
    api.use('/sim', limiter(60_000, 120));
    api.use(limiter(60_000, 600));
  }
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(sessionLoader(deps));
  api.use(originCheck(deps));

  api.get('/docs/openapi.json', (_req, res) => res.json(openApiDocument()));
  api.use(publicRoutes(deps));
  api.use(channelRoutes(deps));
  api.use('/caretaker', careRoutes(deps));
  api.use('/pharmacy', pharmacyRoutes(deps));
  api.use('/admin', adminRoutes(deps));
  api.use(patientRoutes(deps));
  api.use((_req, _res, next) => next(notFound('Route')));

  app.use('/api', api);
  app.use(errorHandler(deps.logger));
  return app;
}
