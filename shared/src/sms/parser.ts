import { WATER_BOTTLE_ML, WATER_GLASS_ML } from '../constants';
import { lbToKg, mgdlToMmol, round } from '../units';

/**
 * Deterministic SMS command parser. Pure: no I/O, no clock.
 * - Case-insensitive, whitespace-tolerant, trailing punctuation ignored.
 * - Never guesses an ambiguous unit: SUGAR and WATER require a unit.
 * - Plausibility ranges are typo checks only, never clinical labels.
 */

export type SmsCommand =
  | { kind: 'JOIN' }
  | { kind: 'HELP' }
  | { kind: 'STOP' }
  | { kind: 'START' }
  | { kind: 'MORE' }
  | { kind: 'YES' }
  | { kind: 'NO' }
  | { kind: 'CHOOSE'; index: number }
  | { kind: 'FIND'; medicine: string; area: string | null }
  | { kind: 'PRICE'; medicine: string; area: string | null }
  | { kind: 'INFO'; medicine: string }
  | { kind: 'CONTACT'; code: string; message: string | null }
  | { kind: 'TAKEN'; ref: string | null }
  | { kind: 'SKIP'; ref: string | null }
  | { kind: 'BP'; systolic: number; diastolic: number }
  | { kind: 'SUGAR'; mmol: number; entered: number; unit: 'mmol/L' | 'mg/dL' }
  | { kind: 'WEIGHT'; kg: number; entered: number; unit: 'kg' | 'lb' }
  | { kind: 'WATER'; ml: number }
  | { kind: 'STEPS'; count: number }
  | { kind: 'LANG'; code: string }
  | { kind: 'NAME'; name: string };

export type SmsKeyword = SmsCommand['kind'];

export type SmsParseErrorCode =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'UNKNOWN_COMMAND'
  | 'MISSING_ARGUMENT'
  | 'INVALID_NUMBER'
  | 'OUT_OF_RANGE'
  | 'UNIT_REQUIRED'
  | 'INVALID_FORMAT';

export type SmsParseResult =
  | { ok: true; command: SmsCommand }
  | { ok: false; error: SmsParseErrorCode; keyword: SmsKeyword | null; hint: string };

export const MAX_SMS_INPUT = 480;

const ALIASES: Record<string, SmsKeyword> = {
  JOIN: 'JOIN',
  REGISTER: 'JOIN',
  HELP: 'HELP',
  MENU: 'HELP',
  '?': 'HELP',
  STOP: 'STOP',
  UNSUBSCRIBE: 'STOP',
  START: 'START',
  MORE: 'MORE',
  NEXT: 'MORE',
  YES: 'YES',
  Y: 'YES',
  OUI: 'YES',
  NO: 'NO',
  N: 'NO',
  NON: 'NO',
  FIND: 'FIND',
  PRICE: 'PRICE',
  PRICES: 'PRICE',
  INFO: 'INFO',
  CONTACT: 'CONTACT',
  TAKEN: 'TAKEN',
  TOOK: 'TAKEN',
  SKIP: 'SKIP',
  SKIPPED: 'SKIP',
  BP: 'BP',
  SUGAR: 'SUGAR',
  GLUCOSE: 'SUGAR',
  WEIGHT: 'WEIGHT',
  WATER: 'WATER',
  STEPS: 'STEPS',
  LANG: 'LANG',
  LANGUAGE: 'LANG',
  NAME: 'NAME',
};

export const SMS_USAGE: Record<SmsKeyword, string> = {
  JOIN: 'JOIN',
  HELP: 'HELP',
  STOP: 'STOP',
  START: 'START',
  MORE: 'MORE',
  YES: 'YES',
  NO: 'NO',
  CHOOSE: '1',
  FIND: 'FIND paracetamol, Molyko',
  PRICE: 'PRICE paracetamol, Molyko',
  INFO: 'INFO paracetamol',
  CONTACT: 'CONTACT MOL1 Do you have ORS?',
  TAKEN: 'TAKEN',
  SKIP: 'SKIP',
  BP: 'BP 120/80',
  SUGAR: 'SUGAR 5.6 MMOL or SUGAR 101 MGDL',
  WEIGHT: 'WEIGHT 70 (kg) or WEIGHT 154 LB',
  WATER: 'WATER 500ML, WATER 1L or WATER 2 GLASSES',
  STEPS: 'STEPS 4500',
  LANG: 'LANG EN or LANG FR',
  NAME: 'NAME Ama',
};

const fail = (error: SmsParseErrorCode, keyword: SmsKeyword | null, hint?: string): SmsParseResult => ({
  ok: false,
  error,
  keyword,
  hint: hint ?? (keyword ? `Try: ${SMS_USAGE[keyword]}` : 'Send HELP for the list of commands.'),
});
const ok = (command: SmsCommand): SmsParseResult => ({ ok: true, command });

/** Parse a decimal that may use a comma as the decimal separator ("5,6"). */
function parseDecimal(s: string): number | null {
  if (!/^\d{1,5}([.,]\d{1,2})?$/.test(s)) return null;
  return Number(s.replace(',', '.'));
}

function parseRef(arg: string): string | null | undefined {
  if (!arg) return null;
  const ref = arg.toUpperCase();
  return /^[A-Z0-9]{3,8}$/.test(ref) ? ref : undefined;
}

export function parseSms(raw: string): SmsParseResult {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return fail('EMPTY', null);
  if (text.length > MAX_SMS_INPUT) return fail('TOO_LONG', null, 'Your message is too long. Send HELP for commands.');

  // A bare number answers a numbered choice ("Reply 1 or 2").
  if (/^\d{1,2}$/.test(text)) return ok({ kind: 'CHOOSE', index: Number(text) });

  // Keyword may be glued to digits, e.g. "BP120/80".
  const m = /^([A-Za-z?]+)(.*)$/.exec(text);
  if (!m) return fail('UNKNOWN_COMMAND', null);
  const rawWord = (m[1] ?? '').toUpperCase();
  const word = rawWord === '?' ? rawWord : rawWord.replace(/[.!?]+$/, '');
  const rest = (m[2] ?? '').trim().replace(/[.!?]+$/, '').trim();
  const keyword = ALIASES[word];
  if (!keyword) return fail('UNKNOWN_COMMAND', null);

  switch (keyword) {
    case 'JOIN':
    case 'HELP':
    case 'STOP':
    case 'START':
    case 'MORE':
    case 'YES':
    case 'NO':
      return ok({ kind: keyword });

    case 'FIND':
    case 'PRICE': {
      if (!rest) return fail('MISSING_ARGUMENT', keyword);
      const [medRaw, ...areaParts] = rest.split(',');
      const medicine = (medRaw ?? '').trim();
      const area = areaParts.join(',').trim() || null;
      if (medicine.length < 2 || medicine.length > 60) return fail('INVALID_FORMAT', keyword);
      if (area && area.length > 60) return fail('INVALID_FORMAT', keyword);
      return ok({ kind: keyword, medicine, area });
    }

    case 'INFO': {
      if (!rest) return fail('MISSING_ARGUMENT', keyword);
      if (rest.length < 2 || rest.length > 60) return fail('INVALID_FORMAT', keyword);
      return ok({ kind: 'INFO', medicine: rest });
    }

    case 'CONTACT': {
      const cm = /^([A-Za-z0-9]{3,10})(?:\s+(.+))?$/.exec(rest);
      if (!cm) return fail(rest ? 'INVALID_FORMAT' : 'MISSING_ARGUMENT', keyword);
      const message = cm[2]?.trim() || null;
      if (message && message.length > 300) return fail('TOO_LONG', keyword, 'Keep your message under 300 characters.');
      return ok({ kind: 'CONTACT', code: (cm[1] ?? '').toUpperCase(), message });
    }

    case 'TAKEN':
    case 'SKIP': {
      const ref = parseRef(rest);
      if (ref === undefined) return fail('INVALID_FORMAT', keyword, `Reply ${keyword} or ${keyword} followed by the reminder code.`);
      return ok({ kind: keyword, ref });
    }

    case 'BP': {
      const bm = /^(\d{2,3})\s*(?:\/|\s)\s*(\d{2,3})(?:\s*MMHG)?$/i.exec(rest);
      if (!rest) return fail('MISSING_ARGUMENT', keyword);
      if (!bm) return fail('INVALID_NUMBER', keyword);
      const systolic = Number(bm[1]);
      const diastolic = Number(bm[2]);
      if (systolic < 50 || systolic > 260 || diastolic < 30 || diastolic > 160 || diastolic >= systolic) {
        return fail('OUT_OF_RANGE', keyword, 'Please check the numbers and send again, e.g. BP 120/80.');
      }
      return ok({ kind: 'BP', systolic, diastolic });
    }

    case 'SUGAR': {
      if (!rest) return fail('MISSING_ARGUMENT', keyword);
      const sm = /^(\d{1,4}(?:[.,]\d{1,2})?)\s*(MMOL\/L|MMOL|MG\/DL|MGDL|MG)?$/i.exec(rest);
      if (!sm) return fail('INVALID_NUMBER', keyword);
      const entered = parseDecimal(sm[1] ?? '');
      if (entered === null) return fail('INVALID_NUMBER', keyword);
      if (!sm[2]) return fail('UNIT_REQUIRED', keyword, 'Please add the unit: SUGAR 5.6 MMOL or SUGAR 101 MGDL.');
      const unit = sm[2].toUpperCase().startsWith('MMOL') ? 'mmol/L' : 'mg/dL';
      const mmol = unit === 'mmol/L' ? entered : round(mgdlToMmol(entered), 2);
      if (mmol < 0.5 || mmol > 60) return fail('OUT_OF_RANGE', keyword, 'Please check the number and send again.');
      return ok({ kind: 'SUGAR', mmol, entered, unit });
    }

    case 'WEIGHT': {
      if (!rest) return fail('MISSING_ARGUMENT', keyword);
      const wm = /^(\d{1,3}(?:[.,]\d{1,2})?)\s*(KG|KGS|LB|LBS)?$/i.exec(rest);
      if (!wm) return fail('INVALID_NUMBER', keyword);
      const entered = parseDecimal(wm[1] ?? '');
      if (entered === null) return fail('INVALID_NUMBER', keyword);
      const unit = wm[2]?.toUpperCase().startsWith('LB') ? 'lb' : 'kg';
      const kg = unit === 'lb' ? round(lbToKg(entered), 1) : entered;
      if (kg < 1 || kg > 400) return fail('OUT_OF_RANGE', keyword, 'Please check the number and send again.');
      return ok({ kind: 'WEIGHT', kg, entered, unit });
    }

    case 'WATER': {
      if (!rest) return fail('MISSING_ARGUMENT', keyword);
      const wm = /^(\d{1,4}(?:[.,]\d{1,2})?)\s*(ML|L|LITRES?|LITERS?|GLASS(?:ES)?|BOTTLES?|CUPS?)?$/i.exec(rest);
      if (!wm) return fail('INVALID_NUMBER', keyword);
      const n = parseDecimal(wm[1] ?? '');
      if (n === null) return fail('INVALID_NUMBER', keyword);
      const unit = wm[2]?.toUpperCase();
      if (!unit) return fail('UNIT_REQUIRED', keyword, 'Please add a unit: WATER 500ML, WATER 1L or WATER 2 GLASSES.');
      let ml: number;
      if (unit === 'ML') ml = n;
      else if (unit === 'L' || unit.startsWith('LIT')) ml = n * 1000;
      else if (unit.startsWith('GLASS') || unit.startsWith('CUP')) ml = n * WATER_GLASS_ML;
      else ml = n * WATER_BOTTLE_ML;
      ml = Math.round(ml);
      if (ml < 10 || ml > 5000) return fail('OUT_OF_RANGE', keyword, 'Please check the amount and send again.');
      return ok({ kind: 'WATER', ml });
    }

    case 'STEPS': {
      if (!rest) return fail('MISSING_ARGUMENT', keyword);
      if (!/^\d{1,6}$/.test(rest) && !/^\d{1,3}(,\d{3})+$/.test(rest)) return fail('INVALID_NUMBER', keyword);
      const count = Number(rest.replace(/,/g, ''));
      if (count > 100_000) return fail('OUT_OF_RANGE', keyword, 'Please check the number and send again.');
      return ok({ kind: 'STEPS', count });
    }

    case 'LANG': {
      if (!/^[A-Za-z]{2,3}$/.test(rest)) return fail(rest ? 'INVALID_FORMAT' : 'MISSING_ARGUMENT', keyword);
      return ok({ kind: 'LANG', code: rest.toLowerCase() });
    }

    case 'NAME': {
      if (!rest) return fail('MISSING_ARGUMENT', keyword);
      if (rest.length > 40 || !/^[\p{L}][\p{L}' -]*$/u.test(rest)) return fail('INVALID_FORMAT', keyword);
      return ok({ kind: 'NAME', name: rest });
    }

    default:
      return fail('UNKNOWN_COMMAND', null);
  }
}
