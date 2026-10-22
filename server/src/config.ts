import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const flag = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  /** Comma-separated extra origins allowed for state-changing requests. The request's own host is always allowed. */
  APP_ORIGIN: optionalString,
  DATABASE_URL: optionalString,
  PGLITE_DIR: z.string().default('.data/pglite'),
  APP_SECRET: optionalString,
  DEMO_MODE: flag,
  /**
   * A publicly reachable DEMO deployment (e.g. the hackathon Vercel site). Allows demo mode, on-screen
   * OTP codes, the SMS simulator and demo payments while NODE_ENV=production. Never set this for real patients.
   */
  PUBLIC_DEMO: flag,
  OTP_PROVIDER: z.enum(['dev', 'sms']).default('dev'),
  MESSAGING_PROVIDER: z.enum(['simulator', 'twilio', 'africastalking']).default('simulator'),
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  /** A Twilio phone number in E.164 (e.g. +1...) or leave empty and set TWILIO_MESSAGING_SERVICE_SID. */
  TWILIO_FROM: optionalString,
  TWILIO_MESSAGING_SERVICE_SID: optionalString,
  /** Firebase web config — these values are public by design (they identify the project, they are not secrets). */
  FIREBASE_PROJECT_ID: optionalString,
  FIREBASE_API_KEY: optionalString,
  FIREBASE_AUTH_DOMAIN: optionalString,
  FIREBASE_APP_ID: optionalString,
  AT_USERNAME: optionalString,
  AT_API_KEY: optionalString,
  AT_SENDER_ID: optionalString,
  AT_ENVIRONMENT: z.enum(['sandbox', 'live']).default('sandbox'),
  INBOUND_WEBHOOK_SECRET: optionalString,
  CRON_SECRET: optionalString,
  SMS_SHORT_CODE: z.string().default('DEMO-12345'),
  USSD_CODE: z.string().default('*123#'),
  PAYMENTS_PROVIDER: z.enum(['demo', 'fapshi']).default('demo'),
  FAPSHI_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
  FAPSHI_API_USER: optionalString,
  FAPSHI_API_KEY: optionalString,
  FAPSHI_WEBHOOK_SECRET: optionalString,
  /** Web Push (VAPID). Generate once with `npx web-push generate-vapid-keys`. The public key is not a secret. */
  VAPID_PUBLIC_KEY: optionalString,
  VAPID_PRIVATE_KEY: optionalString,
  VAPID_SUBJECT: z.string().default('https://medimate-she-codes.vercel.app'),
  /** Anthropic API key for the in-app assistant (Claude). Without it the assistant is hidden. */
  ANTHROPIC_API_KEY: optionalString,
  ASSISTANT_MODEL: z.string().default('claude-haiku-5-5'),
  REMINDER_FOLLOWUP_MINUTES: z.coerce.number().int().min(1).default(30),
  REMINDER_ESCALATE_MINUTES: z.coerce.number().int().min(1).default(60),
  REMINDER_MISSED_MINUTES: z.coerce.number().int().min(1).default(180),
  /** 0 disables the in-process interval (serverless); the engine then runs on request and via cron. */
  SCHEDULER_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(30),
});

export type Env = z.infer<typeof envSchema>;

export interface Config extends Omit<Env, 'APP_SECRET' | 'APP_ORIGIN'> {
  APP_SECRET: string;
  allowedOrigins: string[];
  isProduction: boolean;
}

const DEV_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

/** Load `.env` from the working directory or its parent (repo root) if present. */
export function loadDotEnv(): void {
  for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')]) {
    if (existsSync(p)) {
      process.loadEnvFile(p);
      return;
    }
  }
}

/**
 * Validate configuration and fail clearly at startup when something required is missing.
 * Local development works with no `.env` at all (embedded DB, simulator, demo payments).
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  const problems: string[] = [];

  if (isProduction) {
    if (!env.APP_SECRET || env.APP_SECRET.length < 32 || env.APP_SECRET.startsWith('dev-only')) {
      problems.push('APP_SECRET must be a random value of at least 32 characters in production.');
    }
    if (!env.DATABASE_URL) problems.push('DATABASE_URL is required in production (PGlite is for local development).');
    if (!env.PUBLIC_DEMO) {
      if (env.DEMO_MODE) problems.push('DEMO_MODE must be false in production (set PUBLIC_DEMO=true only for a public demo site).');
      if (env.OTP_PROVIDER === 'dev') problems.push('OTP_PROVIDER=dev is not allowed in production.');
      if (env.MESSAGING_PROVIDER === 'simulator') problems.push('MESSAGING_PROVIDER=simulator cannot deliver real SMS in production.');
      if (!env.INBOUND_WEBHOOK_SECRET) problems.push('INBOUND_WEBHOOK_SECRET is required in production.');
      if (env.PAYMENTS_PROVIDER === 'demo') problems.push('PAYMENTS_PROVIDER=demo is not allowed in production.');
    } else if (!env.DEMO_MODE) {
      problems.push('PUBLIC_DEMO=true requires DEMO_MODE=true so every surface is labelled as a demo.');
    }
    if (env.PAYMENTS_PROVIDER === 'fapshi' && env.FAPSHI_ENV === 'live' && !env.FAPSHI_WEBHOOK_SECRET) {
      problems.push('FAPSHI_WEBHOOK_SECRET is required for live Fapshi payments.');
    }
  }
  if (env.MESSAGING_PROVIDER === 'twilio' && (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || (!env.TWILIO_FROM && !env.TWILIO_MESSAGING_SERVICE_SID))) {
    problems.push('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID) are required when MESSAGING_PROVIDER=twilio.');
  }
  if (env.FIREBASE_PROJECT_ID && (!env.FIREBASE_API_KEY || !env.FIREBASE_AUTH_DOMAIN)) {
    problems.push('FIREBASE_API_KEY and FIREBASE_AUTH_DOMAIN are required with FIREBASE_PROJECT_ID.');
  }
  if (env.MESSAGING_PROVIDER === 'africastalking' && (!env.AT_USERNAME || !env.AT_API_KEY)) {
    problems.push('AT_USERNAME and AT_API_KEY are required when MESSAGING_PROVIDER=africastalking.');
  }
  if (env.OTP_PROVIDER === 'sms' && env.MESSAGING_PROVIDER === 'simulator' && !env.DEMO_MODE) {
    problems.push('OTP_PROVIDER=sms needs a real MESSAGING_PROVIDER outside demo mode.');
  }
  if (env.PAYMENTS_PROVIDER === 'fapshi' && (!env.FAPSHI_API_USER || !env.FAPSHI_API_KEY)) {
    problems.push('FAPSHI_API_USER and FAPSHI_API_KEY are required when PAYMENTS_PROVIDER=fapshi.');
  }
  if (env.VAPID_PUBLIC_KEY && !env.VAPID_PRIVATE_KEY) problems.push('VAPID_PRIVATE_KEY is required with VAPID_PUBLIC_KEY.');
  if (problems.length) throw new Error(`Configuration problems:\n${problems.map((p) => `  - ${p}`).join('\n')}`);

  const { APP_ORIGIN, ...rest } = env;
  return {
    ...rest,
    APP_SECRET: env.APP_SECRET ?? DEV_SECRET,
    allowedOrigins: (APP_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    isProduction,
  };
}

/** Values safe to expose to the browser (no secrets). */
export function publicConfig(config: Config) {
  return {
    demoMode: config.DEMO_MODE,
    publicDemo: config.PUBLIC_DEMO,
    otpProvider: config.OTP_PROVIDER,
    messagingProvider: config.MESSAGING_PROVIDER,
    messagingLive: config.MESSAGING_PROVIDER !== 'simulator',
    paymentsProvider: config.PAYMENTS_PROVIDER,
    paymentsEnvironment: config.PAYMENTS_PROVIDER === 'fapshi' ? config.FAPSHI_ENV : 'demo',
    smsShortCode: config.SMS_SHORT_CODE,
    ussdCode: config.USSD_CODE,
    vapidPublicKey: config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY ? config.VAPID_PUBLIC_KEY : null,
    assistant: Boolean(config.ANTHROPIC_API_KEY),
    firebase: config.FIREBASE_PROJECT_ID
      ? { apiKey: config.FIREBASE_API_KEY, authDomain: config.FIREBASE_AUTH_DOMAIN, projectId: config.FIREBASE_PROJECT_ID, appId: config.FIREBASE_APP_ID }
      : null,
  };
}
