export const ROLES = ['patient', 'caretaker', 'pharmacy', 'admin', 'reviewer'] as const;
export type Role = (typeof ROLES)[number];

export const STOCK_STATES = ['in_stock', 'low', 'out', 'unknown'] as const;
export type StockState = (typeof STOCK_STATES)[number];
export const STOCK_STATE_LABELS: Record<StockState, string> = {
  in_stock: 'In stock',
  low: 'Low',
  out: 'Out',
  unknown: 'Unknown',
};

/** Stock/price reports older than this are flagged stale and never shown as current. */
export const STALE_AFTER_HOURS = 48;

export const VERIFICATION_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'expired', 'suspended'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const MEDICINE_INFO_STATUSES = ['none', 'in_review', 'verified', 'rejected'] as const;
export type MedicineInfoStatus = (typeof MEDICINE_INFO_STATUSES)[number];

export const TIP_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
export type TipStatus = (typeof TIP_STATUSES)[number];

export const CONSENT_PURPOSES = ['health_data', 'sms_messages', 'caretaker_sharing'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];
/** Bump when consent wording changes so stored consents can be re-requested. */
export const CONSENT_VERSION = '2026-10-v1';

export const CARE_CATEGORIES = ['reminders', 'checkups', 'vitals', 'activity', 'reactions'] as const;
export type CareCategory = (typeof CARE_CATEGORIES)[number];

export const OCCURRENCE_KINDS = ['medication', 'refill', 'checkup'] as const;
export type OccurrenceKind = (typeof OCCURRENCE_KINDS)[number];
export const OCCURRENCE_STATUSES = ['scheduled', 'sent', 'taken', 'skipped', 'missed'] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export const INQUIRY_STATUSES = ['open', 'answered', 'closed'] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const REPORT_REASONS = ['wrong_stock', 'wrong_price', 'closed', 'suspicious', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_STATUSES = ['open', 'investigating', 'resolved', 'dismissed'] as const;

export const CHANNELS = ['web', 'sms', 'ussd'] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Languages. English is fully authored. French SMS/USSD strings are an unreviewed draft;
 * Pidgin (pcm) is a placeholder slot only and falls back to English.
 */
export const LANGUAGES = [
  { code: 'en', label: 'English', status: 'reviewed' },
  { code: 'fr', label: 'Français', status: 'draft' },
  { code: 'pcm', label: 'Pidgin', status: 'placeholder' },
] as const;
export type Lang = (typeof LANGUAGES)[number]['code'];
/** Languages that SMS/USSD may switch to (have message catalogues). */
export const MESSAGE_LANGUAGES = ['en', 'fr'] as const satisfies readonly Lang[];
export type MessageLang = (typeof MESSAGE_LANGUAGES)[number];

export function isMessageLang(code: string): code is MessageLang {
  return (MESSAGE_LANGUAGES as readonly string[]).includes(code);
}

export const DEFAULT_TIMEZONE = 'Africa/Douala';
export const DEFAULT_CURRENCY = 'XAF';

/** A glass and a bottle for water quick-logging; documented in the UI. */
export const WATER_GLASS_ML = 250;
export const WATER_BOTTLE_ML = 500;
