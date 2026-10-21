/**
 * Units and conversions. Readings are stored in one canonical unit per type, together with the
 * value and unit the person actually entered. Plausibility ranges below are INPUT VALIDATION ONLY
 * (to catch typos) — they are not clinical ranges and are never used to label a reading.
 */

export const VITAL_TYPES = ['weight', 'height', 'bp', 'glucose', 'heart_rate', 'temperature'] as const;
export type VitalType = (typeof VITAL_TYPES)[number];

export const CANONICAL_UNIT: Record<VitalType, string> = {
  weight: 'kg',
  height: 'cm',
  bp: 'mmHg',
  glucose: 'mmol/L',
  heart_rate: 'bpm',
  temperature: '°C',
};

export const ACCEPTED_UNITS: Record<VitalType, readonly string[]> = {
  weight: ['kg', 'lb'],
  height: ['cm', 'in'],
  bp: ['mmHg'],
  glucose: ['mmol/L', 'mg/dL'],
  heart_rate: ['bpm'],
  temperature: ['°C', '°F'],
};

export const VITAL_LABELS: Record<VitalType, string> = {
  weight: 'Weight',
  height: 'Height',
  bp: 'Blood pressure',
  glucose: 'Blood glucose',
  heart_rate: 'Heart rate',
  temperature: 'Temperature',
};

const PLAUSIBLE: Record<VitalType, [number, number]> = {
  weight: [1, 400],
  height: [30, 250],
  bp: [50, 260],
  glucose: [0.5, 60],
  heart_rate: [20, 250],
  temperature: [30, 45],
};
const DIASTOLIC_PLAUSIBLE: [number, number] = [30, 160];

/** 1 mmol/L of glucose = 18.016 mg/dL (molar mass 180.16 g/mol). */
export const GLUCOSE_MGDL_PER_MMOLL = 18.016;

export const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
export const lbToKg = (lb: number) => lb * 0.45359237;
export const kgToLb = (kg: number) => kg / 0.45359237;
export const inToCm = (inch: number) => inch * 2.54;
export const mgdlToMmol = (mgdl: number) => mgdl / GLUCOSE_MGDL_PER_MMOLL;
export const mmolToMgdl = (mmol: number) => mmol * GLUCOSE_MGDL_PER_MMOLL;
export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const cToF = (c: number) => (c * 9) / 5 + 32;

export interface VitalInput {
  type: VitalType;
  value: number;
  value2?: number | null;
  unit: string;
}
export interface NormalizedVital {
  type: VitalType;
  value: number;
  value2: number | null;
  unit: string;
}

export type VitalResult = { ok: true; vital: NormalizedVital } | { ok: false; error: string };

export function normalizeVital(input: VitalInput): VitalResult {
  const { type, unit } = input;
  if (!ACCEPTED_UNITS[type].includes(unit)) {
    return { ok: false, error: `Unit must be one of: ${ACCEPTED_UNITS[type].join(', ')}` };
  }
  if (!Number.isFinite(input.value)) return { ok: false, error: 'Enter a number.' };
  let value = input.value;
  if (type === 'weight' && unit === 'lb') value = lbToKg(value);
  if (type === 'height' && unit === 'in') value = inToCm(value);
  if (type === 'glucose' && unit === 'mg/dL') value = mgdlToMmol(value);
  if (type === 'temperature' && unit === '°F') value = fToC(value);
  value = round(value, type === 'glucose' ? 2 : 1);
  const [lo, hi] = PLAUSIBLE[type];
  if (value < lo || value > hi) {
    return { ok: false, error: 'That value looks like a typo. Please check it and try again.' };
  }
  let value2: number | null = null;
  if (type === 'bp') {
    if (input.value2 == null || !Number.isFinite(input.value2)) {
      return { ok: false, error: 'Enter both numbers, for example 120/80.' };
    }
    value2 = round(input.value2, 0);
    value = round(value, 0);
    if (value2 < DIASTOLIC_PLAUSIBLE[0] || value2 > DIASTOLIC_PLAUSIBLE[1] || value2 >= value) {
      return { ok: false, error: 'Please check the two numbers — the first is usually the larger one.' };
    }
  }
  if (type === 'heart_rate') value = round(value, 0);
  return { ok: true, vital: { type, value, value2, unit: CANONICAL_UNIT[type] } };
}

/**
 * Body-mass index from entered height and weight. A screening number, not a diagnosis.
 * Returns null for people under 18 or of unknown age, where adult BMI must not be applied.
 */
export function bmi(weightKg: number, heightCm: number, ageYears: number | null): number | null {
  if (ageYears === null || ageYears < 18) return null;
  if (heightCm <= 0 || weightKg <= 0) return null;
  return round(weightKg / (heightCm / 100) ** 2, 1);
}

export function ageFromDob(dob: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}
