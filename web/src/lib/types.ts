import type { CareCategory, OccurrenceStatus, Role, StockState } from '@medimate/shared';

export interface ConsentState {
  granted: boolean;
  at: string;
  version: string;
  channel: string;
}

export interface Me {
  id: string;
  phone: string | null;
  email: string | null;
  emailVerified: boolean;
  hasEmailLogin: boolean;
  displayName: string | null;
  dateOfBirth: string | null;
  language: string;
  area: string | null;
  timezone: string;
  stepGoal: number;
  waterTargetMl: number;
  allergies: string | null;
  conditions: string | null;
  onboarded: boolean;
  isDemo: boolean;
  createdAt: string;
  roles: Role[];
  consents: Record<'health_data' | 'sms_messages' | 'caretaker_sharing', ConsentState | null>;
}

export interface PublicConfig {
  demoMode: boolean;
  publicDemo: boolean;
  otpProvider: 'dev' | 'sms';
  messagingProvider: string;
  messagingLive: boolean;
  paymentsProvider: 'demo' | 'fapshi';
  paymentsEnvironment: string;
  smsShortCode: string;
  ussdCode: string;
  healthDisclaimer: string;
  medicineSafetyNotice: string;
  trialDays: number;
  firebase: { apiKey: string; authDomain: string; projectId: string; appId?: string | null } | null;
}

export interface PharmacyPublic {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  area: string;
  town: string;
  lat: number | null;
  lng: number | null;
  isDemo: boolean;
  verificationStatus: string;
  verifiedUntil: string | null;
  openNow: boolean | null;
  hours: { weekday: number; opens: string; closes: string }[];
  distanceKm?: number | null;
}

export interface Offer {
  stockId: string;
  pharmacy: PharmacyPublic;
  medicine: { id: string; label: string; name: string; strength: string; form: string };
  price: number | null;
  currency: string;
  stockState: StockState;
  quantity: number | null;
  updatedAt: string;
  ageLabel: string;
  stale: boolean;
  lowest: boolean;
}

export interface SearchResult {
  items: Offer[];
  total: number;
  staleHidden: number;
  medicines: { id: string; label: string }[];
  unknownMedicine: boolean;
}

export interface Occurrence {
  id: string;
  kind: 'medication' | 'refill' | 'checkup';
  ref: string;
  scheduledFor: string;
  localTime: string;
  localDate: string;
  status: OccurrenceStatus;
  deliveryStatus: string;
  confirmedAt: string | null;
  confirmedChannel: string | null;
  canConfirm: boolean;
  plan: { id: string; medicineName: string; doseText: string } | null;
  checkup: { id: string; title: string; dueAt: string } | null;
}

export interface Plan {
  id: string;
  medicineName: string;
  medicineId: string | null;
  doseText: string;
  frequencyText: string;
  times: string[];
  startDate: string;
  endDate: string | null;
  refillDate: string | null;
  notes: string | null;
  timezone: string;
  smsReminders: boolean;
  caretakerAlerts: boolean;
  active: boolean;
  createdAt: string;
}

export interface Vital {
  id: string;
  type: string;
  value: number;
  value2: number | null;
  unit: string;
  enteredValue: number | null;
  enteredUnit: string | null;
  measuredAt: string;
  source: string;
  note: string | null;
}

export interface CareLink {
  id: string;
  patientId?: string;
  status: string;
  categories: CareCategory[];
  alertDetail: boolean;
  invitedPhone: string;
  createdAt: string;
  respondedAt: string | null;
  revokedAt: string | null;
  person: { displayName: string; phone: string } | null;
}

export interface Thread {
  id: string;
  subject: string;
  status: 'open' | 'answered' | 'closed';
  channel: string;
  viewerRole: 'patient' | 'pharmacy';
  pharmacy: { id: string; name: string; phone: string };
  patient: { displayName: string; phone: string };
  messages: { id: string; senderRole: string; body: string; channel: string; createdAt: string }[];
}

export interface Subscription {
  tier: 'trial' | 'premium' | 'free';
  trialEndsAt: string;
  premiumUntil: string | null;
  daysLeft: number;
  premiumFeatures: string[];
  price: { amount: number; currency: string; periodDays: number };
  provider: 'demo' | 'fapshi';
  providerEnvironment: string;
  payments: Payment[];
}

export interface Payment {
  id: string;
  provider: string;
  amount: number;
  currency: string;
  periodDays: number;
  status: 'created' | 'pending' | 'successful' | 'failed' | 'expired';
  checkoutUrl: string | null;
  createdAt: string;
  fulfilledAt: string | null;
}
