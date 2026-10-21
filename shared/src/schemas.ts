import { z } from 'zod';
import {
  CARE_CATEGORIES,
  CONSENT_PURPOSES,
  REPORT_REASONS,
  ROLES,
  STOCK_STATES,
} from './constants';
import { PREMIUM_FEATURES } from './entitlements';
import { isValidTimeZone } from './time';
import { VITAL_TYPES } from './units';
import { STOCK_CSV_MAX_BYTES } from './csv';

/** Request/response contracts shared by the API (validation) and the web app (forms). */

export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM');
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const uuid = z.string().uuid();

export const phoneInputSchema = z.string().trim().min(6, 'Enter your phone number').max(20);

export const otpRequestSchema = z.object({ phone: phoneInputSchema });
export const otpVerifySchema = z.object({
  phone: phoneInputSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  dateOfBirth: localDateSchema.nullable().optional(),
  language: z.enum(['en', 'fr', 'pcm']).optional(),
  area: optionalText(80),
  timezone: z.string().refine(isValidTimeZone, 'Unknown time zone').optional(),
  stepGoal: z.number().int().min(100).max(100_000).optional(),
  waterTargetMl: z.number().int().min(250).max(10_000).optional(),
  allergies: optionalText(500),
  conditions: optionalText(500),
  completeOnboarding: z.boolean().optional(),
});

export const consentUpdateSchema = z.object({
  purpose: z.enum(CONSENT_PURPOSES),
  granted: z.boolean(),
});

const planBase = z.object({
  medicineName: z.string().trim().min(2).max(120),
  medicineId: uuid.nullable().optional(),
  /** Stored and repeated exactly as the person typed it from their prescription. */
  doseText: z.string().trim().min(1).max(300),
  frequencyText: z.string().trim().min(1).max(120),
  times: z
    .array(localTimeSchema)
    .min(1, 'Add at least one reminder time')
    .max(8)
    .refine((t) => new Set(t).size === t.length, 'Each time should appear once'),
  startDate: localDateSchema,
  endDate: localDateSchema.nullable().optional(),
  refillDate: localDateSchema.nullable().optional(),
  notes: optionalText(500),
  smsReminders: z.boolean().default(true),
  caretakerAlerts: z.boolean().default(false),
});
export const planCreateSchema = planBase.refine((p) => !p.endDate || p.endDate >= p.startDate, {
  message: 'End date must be on or after the start date',
  path: ['endDate'],
});
export const planUpdateSchema = planBase.partial().extend({ active: z.boolean().optional() });

export const confirmReminderSchema = z.object({
  action: z.enum(['taken', 'skipped']),
  idempotencyKey: z.string().max(80).optional(),
});
export const correctReminderSchema = z.object({
  status: z.enum(['taken', 'skipped', 'missed']),
  reason: z.string().trim().min(3, 'Add a short reason').max(300),
});

export const checkupCreateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  dueDate: localDateSchema,
  dueTime: localTimeSchema,
  location: optionalText(120),
  notes: optionalText(500),
  remindDayBefore: z.boolean().default(true),
});
export const checkupUpdateSchema = checkupCreateSchema.partial().extend({
  status: z.enum(['upcoming', 'done', 'cancelled']).optional(),
});

export const vitalCreateSchema = z.object({
  type: z.enum(VITAL_TYPES),
  value: z.number(),
  value2: z.number().nullable().optional(),
  unit: z.string().max(10),
  measuredAt: z.string().datetime().optional(),
  note: optionalText(200),
});
export const stepsCreateSchema = z.object({
  date: localDateSchema,
  steps: z.number().int().min(0).max(100_000),
});
export const waterCreateSchema = z.object({
  amountMl: z.number().int().min(10).max(5000),
  loggedAt: z.string().datetime().optional(),
});
export const reactionCreateSchema = z.object({
  description: z.string().trim().min(3).max(1000),
  symptoms: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  severity: z.enum(['mild', 'moderate', 'severe']),
  occurredAt: z.string().datetime(),
  medicineName: optionalText(120),
  showToClinician: z.boolean().default(false),
});

export const inquiryCreateSchema = z.object({
  pharmacyId: uuid,
  subject: z.string().trim().min(3).max(120),
  body: z.string().trim().min(2).max(1000),
});
export const messageCreateSchema = z.object({ body: z.string().trim().min(1).max(1000) });

export const careInviteSchema = z.object({
  phone: phoneInputSchema,
  categories: z.array(z.enum(CARE_CATEGORIES)).max(CARE_CATEGORIES.length).default(['reminders']),
  alertDetail: z.boolean().default(false),
});
export const carePermissionsSchema = z.object({
  categories: z.array(z.enum(CARE_CATEGORIES)).max(CARE_CATEGORIES.length),
  alertDetail: z.boolean(),
});

export const stockUpsertSchema = z.object({
  medicineId: uuid,
  price: z.number().min(0).max(10_000_000).nullable(),
  stockState: z.enum(STOCK_STATES),
  quantity: z.number().int().min(0).max(9_999_999).nullable().optional(),
});
export const csvImportSchema = z.object({
  csv: z.string().min(1).max(STOCK_CSV_MAX_BYTES),
  commit: z.boolean().default(false),
});

export const hoursSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  opens: localTimeSchema,
  closes: localTimeSchema,
});
export const pharmacyProfileSchema = z.object({
  name: z.string().trim().min(3).max(120),
  phone: phoneInputSchema,
  address: z.string().trim().min(3).max(200),
  area: z.string().trim().min(2).max(80),
  town: z.string().trim().min(2).max(80),
  hours: z.array(hoursSchema).max(14),
});
export const verificationSubmitSchema = z.object({
  licenceNumber: z.string().trim().min(3).max(60),
  documentReference: z.string().trim().min(3).max(200),
  notes: optionalText(500),
});
export const verificationDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected', 'expired', 'suspended']),
  notes: z.string().trim().min(3).max(500),
  validUntil: localDateSchema.nullable().optional(),
});

export const medicineUpsertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  genericName: z.string().trim().min(2).max(120),
  strength: z.string().trim().max(60).default(''),
  form: z.string().trim().max(60).default(''),
  indications: optionalText(2000),
  usageNotes: optionalText(2000),
  warnings: optionalText(2000),
  interactions: optionalText(2000),
  storage: optionalText(1000),
  sideEffects: optionalText(2000),
  sourceAuthority: optionalText(200),
  sourceUrl: z.string().url().max(500).nullable().optional(),
  sourceVersionDate: localDateSchema.nullable().optional(),
});
export const reviewDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().trim().min(3).max(500),
});

export const tipUpsertSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(1000),
  topic: z.string().trim().min(2).max(40),
  language: z.enum(['en', 'fr', 'pcm']).default('en'),
  source: z.string().trim().min(3).max(200),
});

export const reportCreateSchema = z.object({
  pharmacyId: uuid,
  stockId: uuid.nullable().optional(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).default(''),
});
export const reportResolveSchema = z.object({
  status: z.enum(['investigating', 'resolved', 'dismissed']),
  note: z.string().trim().min(3).max(500),
});

export const settingsUpdateSchema = z.object({
  trialDays: z.number().int().min(0).max(365).optional(),
  premiumFeatures: z.array(z.enum(PREMIUM_FEATURES)).optional(),
  premiumPriceXaf: z.number().int().min(100).max(1_000_000).optional(),
  premiumPeriodDays: z.number().int().min(1).max(366).optional(),
  medicineSafetyNotice: z.string().trim().min(20).max(600).optional(),
  healthDisclaimer: z.string().trim().min(20).max(800).optional(),
});
export const roleUpdateSchema = z.object({ role: z.enum(ROLES), grant: z.boolean() });

export const checkoutSchema = z.object({ email: z.string().email().max(200).optional() });
export const deleteAccountSchema = z.object({ confirm: z.literal('DELETE') });

export const simSmsSchema = z.object({ phone: phoneInputSchema, text: z.string().max(480) });
export const simUssdSchema = z.object({
  sessionId: z.string().min(6).max(64),
  phone: phoneInputSchema,
  input: z.string().max(200),
  /** Demo tool: age the stored session past the timeout before applying this input. */
  expire: z.boolean().optional(),
});

export const pharmacySearchSchema = z.object({
  q: z.string().trim().max(60).optional(),
  area: z.string().trim().max(60).optional(),
  sort: z.enum(['price', 'distance', 'freshness']).default('freshness'),
  openNow: z.enum(['true', 'false']).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  includeStale: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});

export type PlanCreate = z.infer<typeof planCreateSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type PharmacySearch = z.infer<typeof pharmacySearchSchema>;
