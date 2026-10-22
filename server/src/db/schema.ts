import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * MEDIMATE data model (PostgreSQL). See docs/DATA_MODEL.md for the ER diagram.
 * - Timestamps are UTC (timestamptz). Local calendar dates use `date` columns plus the user's IANA zone.
 * - Money uses numeric(12,2); measurements use numeric with an explicit canonical unit column.
 * - Status columns are text enums validated in code (shared/constants.ts) — never a single boolean.
 */

const id = () => uuid('id').defaultRandom().primaryKey();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();
const updatedAt = () => ts('updated_at').notNull().defaultNow();

export const users = pgTable('users', {
  id: id(),
  /** E.164 phone — the identity for SMS/USSD. Optional for people who sign up by email. */
  phone: text('phone').unique(),
  /** Email and Firebase uid — present when the person signs in with Firebase (email/password or Google). */
  email: text('email').unique(),
  firebaseUid: text('firebase_uid').unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  displayName: text('display_name'),
  dateOfBirth: date('date_of_birth', { mode: 'string' }),
  language: text('language').notNull().default('en'),
  area: text('area'),
  timezone: text('timezone').notNull().default('Africa/Douala'),
  stepGoal: integer('step_goal').notNull().default(6000),
  waterTargetMl: integer('water_target_ml').notNull().default(2000),
  allergies: text('allergies'),
  conditions: text('conditions'),
  createdVia: text('created_via').notNull().default('web'),
  onboardedAt: ts('onboarded_at'),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    grantedBy: uuid('granted_by'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: ts('expires_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: id(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: ts('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: ts('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('otp_phone_created_idx').on(t.phone, t.createdAt)],
);

export const consents = pgTable(
  'consents',
  {
    id: id(),
    /** Monotonic order of consent changes — the latest row per purpose is the current state. */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    granted: boolean('granted').notNull(),
    version: text('version').notNull(),
    channel: text('channel').notNull(),
    scope: jsonb('scope').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('consents_user_purpose_idx').on(t.userId, t.purpose, t.seq)],
);

export const careLinks = pgTable(
  'care_links',
  {
    id: id(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    caretakerId: uuid('caretaker_id').references(() => users.id, { onDelete: 'cascade' }),
    invitedPhone: text('invited_phone').notNull(),
    status: text('status').notNull().default('pending'),
    categories: jsonb('categories').$type<string[]>().notNull().default([]),
    alertDetail: boolean('alert_detail').notNull().default(false),
    createdAt: createdAt(),
    respondedAt: ts('responded_at'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    index('care_links_patient_idx').on(t.patientId),
    index('care_links_caretaker_idx').on(t.caretakerId),
    index('care_links_phone_idx').on(t.invitedPhone),
  ],
);

export const pharmacies = pgTable(
  'pharmacies',
  {
    id: id(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    address: text('address').notNull(),
    area: text('area').notNull(),
    town: text('town').notNull(),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    timezone: text('timezone').notNull().default('Africa/Douala'),
    verificationStatus: text('verification_status').notNull().default('draft'),
    verifiedUntil: date('verified_until', { mode: 'string' }),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('pharmacies_status_idx').on(t.verificationStatus), index('pharmacies_area_idx').on(t.area)],
);

export const pharmacyHours = pgTable(
  'pharmacy_hours',
  {
    id: id(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(),
    opens: text('opens').notNull(),
    closes: text('closes').notNull(),
  },
  (t) => [index('pharmacy_hours_pharmacy_idx').on(t.pharmacyId)],
);

export const pharmacyStaff = pgTable(
  'pharmacy_staff',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.pharmacyId] })],
);

export const pharmacyVerifications = pgTable(
  'pharmacy_verifications',
  {
    id: id(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    actorId: uuid('actor_id'),
    licenceNumber: text('licence_number'),
    documentReference: text('document_reference'),
    notes: text('notes'),
    validUntil: date('valid_until', { mode: 'string' }),
    createdAt: createdAt(),
  },
  (t) => [index('pharmacy_verifications_pharmacy_idx').on(t.pharmacyId, t.createdAt)],
);

export const medicines = pgTable(
  'medicines',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    genericName: text('generic_name').notNull(),
    strength: text('strength').notNull().default(''),
    form: text('form').notNull().default(''),
    infoStatus: text('info_status').notNull().default('none'),
    indications: text('indications'),
    usageNotes: text('usage_notes'),
    warnings: text('warnings'),
    interactions: text('interactions'),
    storage: text('storage'),
    sideEffects: text('side_effects'),
    sourceAuthority: text('source_authority'),
    sourceUrl: text('source_url'),
    sourceVersionDate: date('source_version_date', { mode: 'string' }),
    submittedBy: uuid('submitted_by'),
    reviewedBy: uuid('reviewed_by'),
    verifiedAt: ts('verified_at'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('medicines_name_idx').on(t.name), index('medicines_generic_idx').on(t.genericName)],
);

export const medicineReviews = pgTable(
  'medicine_reviews',
  {
    id: id(),
    medicineId: uuid('medicine_id')
      .notNull()
      .references(() => medicines.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    actorId: uuid('actor_id'),
    notes: text('notes'),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('medicine_reviews_medicine_idx').on(t.medicineId, t.createdAt)],
);

export const pharmacyStock = pgTable(
  'pharmacy_stock',
  {
    id: id(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    medicineId: uuid('medicine_id')
      .notNull()
      .references(() => medicines.id, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 12, scale: 2 }),
    currency: text('currency').notNull().default('XAF'),
    stockState: text('stock_state').notNull().default('unknown'),
    quantity: integer('quantity'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
  },
  (t) => [
    uniqueIndex('pharmacy_stock_unique').on(t.pharmacyId, t.medicineId),
    index('pharmacy_stock_medicine_fresh_idx').on(t.medicineId, t.updatedAt),
  ],
);

export const stockEvents = pgTable(
  'stock_events',
  {
    id: id(),
    stockId: uuid('stock_id')
      .notNull()
      .references(() => pharmacyStock.id, { onDelete: 'cascade' }),
    pharmacyId: uuid('pharmacy_id').notNull(),
    medicineId: uuid('medicine_id').notNull(),
    price: numeric('price', { precision: 12, scale: 2 }),
    stockState: text('stock_state').notNull(),
    quantity: integer('quantity'),
    actorId: uuid('actor_id'),
    source: text('source').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('stock_events_pharmacy_idx').on(t.pharmacyId, t.createdAt)],
);

export const reports = pgTable(
  'reports',
  {
    id: id(),
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    stockId: uuid('stock_id').references(() => pharmacyStock.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    details: text('details').notNull().default(''),
    status: text('status').notNull().default('open'),
    resolvedBy: uuid('resolved_by'),
    resolutionNote: text('resolution_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('reports_status_idx').on(t.status, t.createdAt)],
);

export const inquiries = pgTable(
  'inquiries',
  {
    id: id(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    status: text('status').notNull().default('open'),
    channel: text('channel').notNull().default('web'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('inquiries_pharmacy_status_idx').on(t.pharmacyId, t.status), index('inquiries_patient_idx').on(t.patientId)],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    inquiryId: uuid('inquiry_id')
      .notNull()
      .references(() => inquiries.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
    senderRole: text('sender_role').notNull(),
    body: text('body').notNull(),
    channel: text('channel').notNull().default('web'),
    createdAt: createdAt(),
  },
  (t) => [index('messages_inquiry_idx').on(t.inquiryId, t.createdAt)],
);

export const medicationPlans = pgTable(
  'medication_plans',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    medicineName: text('medicine_name').notNull(),
    medicineId: uuid('medicine_id').references(() => medicines.id, { onDelete: 'set null' }),
    doseText: text('dose_text').notNull(),
    frequencyText: text('frequency_text').notNull(),
    times: jsonb('times').$type<string[]>().notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    refillDate: date('refill_date', { mode: 'string' }),
    notes: text('notes'),
    timezone: text('timezone').notNull(),
    smsReminders: boolean('sms_reminders').notNull().default(true),
    caretakerAlerts: boolean('caretaker_alerts').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('plans_user_idx').on(t.userId, t.active)],
);

export const checkups = pgTable(
  'checkups',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    dueAt: ts('due_at').notNull(),
    location: text('location'),
    notes: text('notes'),
    remindDayBefore: boolean('remind_day_before').notNull().default(true),
    status: text('status').notNull().default('upcoming'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('checkups_user_idx').on(t.userId, t.dueAt)],
);

export const reminderOccurrences = pgTable(
  'reminder_occurrences',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    planId: uuid('plan_id').references(() => medicationPlans.id, { onDelete: 'cascade' }),
    checkupId: uuid('checkup_id').references(() => checkups.id, { onDelete: 'cascade' }),
    refCode: text('ref_code').notNull(),
    /** Unique logical key — prevents duplicate reminders for the same plan/time. */
    dedupeKey: text('dedupe_key').notNull().unique(),
    scheduledFor: ts('scheduled_for').notNull(),
    status: text('status').notNull().default('scheduled'),
    sentAt: ts('sent_at'),
    followupSentAt: ts('followup_sent_at'),
    escalatedAt: ts('escalated_at'),
    confirmedAt: ts('confirmed_at'),
    confirmedChannel: text('confirmed_channel'),
    deliveryStatus: text('delivery_status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at'),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [
    index('occurrences_due_idx').on(t.status, t.scheduledFor),
    index('occurrences_user_idx').on(t.userId, t.scheduledFor),
  ],
);

export const reminderEvents = pgTable(
  'reminder_events',
  {
    id: id(),
    occurrenceId: uuid('occurrence_id')
      .notNull()
      .references(() => reminderOccurrences.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    channel: text('channel'),
    actorId: uuid('actor_id'),
    idempotencyKey: text('idempotency_key').unique(),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index('reminder_events_occurrence_idx').on(t.occurrenceId)],
);

export const vitalReadings = pgTable(
  'vital_readings',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    value: numeric('value', { precision: 8, scale: 2 }).notNull(),
    value2: numeric('value2', { precision: 8, scale: 2 }),
    unit: text('unit').notNull(),
    enteredValue: numeric('entered_value', { precision: 8, scale: 2 }),
    enteredUnit: text('entered_unit'),
    measuredAt: ts('measured_at').notNull(),
    source: text('source').notNull().default('web'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('vitals_user_type_idx').on(t.userId, t.type, t.measuredAt)],
);

export const stepLogs = pgTable(
  'step_logs',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    steps: integer('steps').notNull(),
    source: text('source').notNull().default('web'),
    createdAt: createdAt(),
  },
  (t) => [index('steps_user_date_idx').on(t.userId, t.localDate)],
);

export const waterLogs = pgTable(
  'water_logs',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    amountMl: integer('amount_ml').notNull(),
    loggedAt: ts('logged_at').notNull(),
    localDate: date('local_date', { mode: 'string' }).notNull(),
    source: text('source').notNull().default('web'),
    createdAt: createdAt(),
  },
  (t) => [index('water_user_date_idx').on(t.userId, t.localDate)],
);

export const reactionLogs = pgTable(
  'reaction_logs',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    symptoms: jsonb('symptoms').$type<string[]>().notNull().default([]),
    severity: text('severity').notNull(),
    occurredAt: ts('occurred_at').notNull(),
    medicineName: text('medicine_name'),
    showToClinician: boolean('show_to_clinician').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('reactions_user_idx').on(t.userId, t.occurredAt)],
);

export const healthTips = pgTable(
  'health_tips',
  {
    id: id(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    topic: text('topic').notNull(),
    language: text('language').notNull().default('en'),
    source: text('source').notNull(),
    status: text('status').notNull().default('draft'),
    authorId: uuid('author_id'),
    reviewerId: uuid('reviewer_id'),
    reviewedAt: ts('reviewed_at'),
    reviewNotes: text('review_notes'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tips_status_lang_idx').on(t.status, t.language)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    trialStartedAt: ts('trial_started_at').notNull(),
    trialEndsAt: ts('trial_ends_at').notNull(),
    premiumUntil: ts('premium_until'),
    updatedAt: updatedAt(),
  },
  (t) => [index('subscriptions_trial_end_idx').on(t.trialEndsAt)],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('XAF'),
    periodDays: integer('period_days').notNull(),
    status: text('status').notNull().default('created'),
    transId: text('trans_id').unique(),
    checkoutUrl: text('checkout_url'),
    providerStatus: text('provider_status'),
    lastCheckedAt: ts('last_checked_at'),
    fulfilledAt: ts('fulfilled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('payments_user_idx').on(t.userId, t.createdAt)],
);

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by'),
  updatedAt: updatedAt(),
});

export const smsLogs = pgTable(
  'sms_logs',
  {
    id: id(),
    direction: text('direction').notNull(),
    phone: text('phone').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Message body is kept only until body_expires_at, then purged (metadata stays). */
    body: text('body'),
    bodyExpiresAt: ts('body_expires_at'),
    command: text('command'),
    status: text('status').notNull(),
    provider: text('provider').notNull(),
    providerMessageId: text('provider_message_id'),
    segments: integer('segments').notNull().default(1),
    encoding: text('encoding').notNull().default('GSM-7'),
    createdAt: createdAt(),
  },
  (t) => [index('sms_logs_phone_idx').on(t.phone, t.createdAt)],
);

export const smsSessions = pgTable('sms_sessions', {
  phone: text('phone').primaryKey(),
  language: text('language').notNull().default('en'),
  pending: jsonb('pending').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
});

export const ussdSessions = pgTable(
  'ussd_sessions',
  {
    sessionId: text('session_id').primaryKey(),
    phone: text('phone').notNull(),
    state: jsonb('state').$type<Record<string, unknown>>().notNull(),
    lastActiveAt: ts('last_active_at').notNull(),
    ended: boolean('ended').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('ussd_sessions_phone_idx').on(t.phone, t.lastActiveAt)],
);

/** Browser push subscriptions (Web Push). One person can have several devices. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSentAt: ts('last_sent_at'),
  },
  (t) => [index('push_subs_user_idx').on(t.userId)],
);

/**
 * In-app notification inbox. Every push is also stored here, so nothing is lost when a device
 * is offline or notifications are blocked. `dedupe_key` makes nudges and welcomes send once.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    url: text('url'),
    dedupeKey: text('dedupe_key').unique(),
    occurrenceId: uuid('occurrence_id'),
    pushed: integer('pushed').notNull().default(0),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_target_idx').on(t.targetType, t.targetId), index('audit_created_idx').on(t.createdAt)],
);
