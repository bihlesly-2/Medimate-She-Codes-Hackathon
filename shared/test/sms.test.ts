import { describe, expect, it } from 'vitest';
import { parseSms } from '../src/sms/parser';
import { paginateSms, segmentCount, smsEncoding, smsUnits, SMS_SIGNATURE } from '../src/sms/format';

const cmd = (text: string) => {
  const r = parseSms(text);
  if (!r.ok) throw new Error(`expected ok for "${text}", got ${r.error}`);
  return r.command;
};
const err = (text: string) => {
  const r = parseSms(text);
  if (r.ok) throw new Error(`expected error for "${text}"`);
  return r;
};

describe('SMS parser — keywords', () => {
  it('is case-insensitive and whitespace tolerant', () => {
    expect(cmd('  join ')).toEqual({ kind: 'JOIN' });
    expect(cmd('Help')).toEqual({ kind: 'HELP' });
    expect(cmd('HELP?')).toEqual({ kind: 'HELP' });
    expect(cmd('?')).toEqual({ kind: 'HELP' });
    expect(cmd('stop')).toEqual({ kind: 'STOP' });
    expect(cmd('START.')).toEqual({ kind: 'START' });
    expect(cmd('more')).toEqual({ kind: 'MORE' });
    expect(cmd('y')).toEqual({ kind: 'YES' });
    expect(cmd('Oui')).toEqual({ kind: 'YES' });
    expect(cmd('non')).toEqual({ kind: 'NO' });
  });

  it('treats a bare number as a numbered choice', () => {
    expect(cmd('2')).toEqual({ kind: 'CHOOSE', index: 2 });
  });

  it('rejects unknown commands with a help hint', () => {
    const r = err('hello there');
    expect(r.error).toBe('UNKNOWN_COMMAND');
    expect(r.hint).toMatch(/HELP/);
    expect(err('').error).toBe('EMPTY');
    expect(err('x'.repeat(500)).error).toBe('TOO_LONG');
  });
});

describe('SMS parser — FIND / PRICE / INFO / CONTACT', () => {
  it('splits medicine and area on the first comma', () => {
    expect(cmd('FIND paracetamol, Molyko')).toEqual({ kind: 'FIND', medicine: 'paracetamol', area: 'Molyko' });
    expect(cmd('find   Paracetamol 500mg ,  Great Soppo ')).toEqual({ kind: 'FIND', medicine: 'Paracetamol 500mg', area: 'Great Soppo' });
    expect(cmd('PRICE amoxicillin')).toEqual({ kind: 'PRICE', medicine: 'amoxicillin', area: null });
    expect(cmd('prices ORS, Buea')).toEqual({ kind: 'PRICE', medicine: 'ORS', area: 'Buea' });
  });
  it('requires a medicine name', () => {
    expect(err('FIND').error).toBe('MISSING_ARGUMENT');
    expect(err('FIND a').error).toBe('INVALID_FORMAT');
  });
  it('parses INFO', () => {
    expect(cmd('info paracetamol?')).toEqual({ kind: 'INFO', medicine: 'paracetamol' });
    expect(err('INFO').error).toBe('MISSING_ARGUMENT');
  });
  it('parses CONTACT with an optional message', () => {
    expect(cmd('contact mol1 Do you have ORS?')).toEqual({ kind: 'CONTACT', code: 'MOL1', message: 'Do you have ORS' });
    expect(cmd('CONTACT MOL1')).toEqual({ kind: 'CONTACT', code: 'MOL1', message: null });
    expect(err('CONTACT').error).toBe('MISSING_ARGUMENT');
    expect(err('CONTACT @@').error).toBe('INVALID_FORMAT');
    expect(err('CONTACT !!').error).toBe('MISSING_ARGUMENT');
  });
});

describe('SMS parser — reminders', () => {
  it('accepts TAKEN/SKIP with and without a reference', () => {
    expect(cmd('taken')).toEqual({ kind: 'TAKEN', ref: null });
    expect(cmd('TAKEN r7k2')).toEqual({ kind: 'TAKEN', ref: 'R7K2' });
    expect(cmd('skipped')).toEqual({ kind: 'SKIP', ref: null });
    expect(err('TAKEN @@').error).toBe('INVALID_FORMAT');
  });
});

describe('SMS parser — health logs', () => {
  it('parses blood pressure in several common formats', () => {
    expect(cmd('BP 120/80')).toEqual({ kind: 'BP', systolic: 120, diastolic: 80 });
    expect(cmd('bp 120 80')).toEqual({ kind: 'BP', systolic: 120, diastolic: 80 });
    expect(cmd('BP120/80')).toEqual({ kind: 'BP', systolic: 120, diastolic: 80 });
    expect(cmd('BP 135 / 85 mmHg')).toEqual({ kind: 'BP', systolic: 135, diastolic: 85 });
  });
  it('rejects malformed or implausible blood pressure', () => {
    expect(err('BP').error).toBe('MISSING_ARGUMENT');
    expect(err('BP 120').error).toBe('INVALID_NUMBER');
    expect(err('BP 80/120').error).toBe('OUT_OF_RANGE');
    expect(err('BP 400/80').error).toBe('OUT_OF_RANGE');
  });
  it('never guesses the glucose unit', () => {
    expect(err('SUGAR 5.6').error).toBe('UNIT_REQUIRED');
    expect(cmd('SUGAR 5.6 mmol')).toEqual({ kind: 'SUGAR', mmol: 5.6, entered: 5.6, unit: 'mmol/L' });
    expect(cmd('sugar 5,6 MMOL/L')).toMatchObject({ mmol: 5.6, unit: 'mmol/L' });
    expect(cmd('GLUCOSE 101 mgdl')).toEqual({ kind: 'SUGAR', mmol: 5.61, entered: 101, unit: 'mg/dL' });
    expect(err('SUGAR abc').error).toBe('INVALID_NUMBER');
    expect(err('SUGAR 900 MMOL').error).toBe('OUT_OF_RANGE');
  });
  it('parses weight in kg by default and converts pounds', () => {
    expect(cmd('WEIGHT 70')).toEqual({ kind: 'WEIGHT', kg: 70, entered: 70, unit: 'kg' });
    expect(cmd('weight 70.5kg')).toMatchObject({ kg: 70.5 });
    expect(cmd('WEIGHT 154 lb')).toMatchObject({ kg: 69.9, unit: 'lb' });
    expect(err('WEIGHT 0').error).toBe('OUT_OF_RANGE');
  });
  it('requires a water unit and converts glasses/bottles/litres', () => {
    expect(err('WATER 2').error).toBe('UNIT_REQUIRED');
    expect(cmd('WATER 500ML')).toEqual({ kind: 'WATER', ml: 500 });
    expect(cmd('water 1.5 L')).toEqual({ kind: 'WATER', ml: 1500 });
    expect(cmd('WATER 2 glasses')).toEqual({ kind: 'WATER', ml: 500 });
    expect(cmd('WATER 1 bottle')).toEqual({ kind: 'WATER', ml: 500 });
    expect(err('WATER 9 L').error).toBe('OUT_OF_RANGE');
  });
  it('parses steps including thousands separators', () => {
    expect(cmd('STEPS 4500')).toEqual({ kind: 'STEPS', count: 4500 });
    expect(cmd('steps 12,000')).toEqual({ kind: 'STEPS', count: 12000 });
    expect(err('STEPS 4.5').error).toBe('INVALID_NUMBER');
    expect(err('STEPS 999999').error).toBe('OUT_OF_RANGE');
  });
});

describe('SMS parser — account', () => {
  it('parses LANG and NAME', () => {
    expect(cmd('lang FR')).toEqual({ kind: 'LANG', code: 'fr' });
    expect(err('LANG').error).toBe('MISSING_ARGUMENT');
    expect(err('LANG french1').error).toBe('INVALID_FORMAT');
    expect(cmd('NAME Ama')).toEqual({ kind: 'NAME', name: 'Ama' });
    expect(err('NAME 1234').error).toBe('INVALID_FORMAT');
  });
});

describe('SMS formatting', () => {
  it('detects GSM-7 vs UCS-2', () => {
    expect(smsEncoding('Hello Molyko 500 XAF')).toBe('GSM-7');
    expect(smsEncoding('Français')).toBe('UCS-2');
    expect(smsUnits('a€')).toBe(3);
  });
  it('counts segments for GSM-7 and UCS-2', () => {
    expect(segmentCount('a'.repeat(160))).toBe(1);
    expect(segmentCount('a'.repeat(161))).toBe(2);
    expect(segmentCount('ç'.repeat(70))).toBe(1);
    expect(segmentCount('ç'.repeat(71))).toBe(2);
  });
  it('keeps replies in GSM-7 by replacing typographic characters', () => {
    const pages = paginateSms('Paracetamol: DEMO PLACEHOLDER — “reviewed” text… 2 × daily');
    expect(pages).toHaveLength(1);
    expect(smsEncoding(pages[0]!)).toBe('UCS-2'); // × is outside GSM-7 and is kept, honestly counted
    const plain = paginateSms('Reply — “YES” … ok');
    expect(smsEncoding(plain[0]!)).toBe('GSM-7');
    expect(plain[0]).toBe('Reply - "YES" ... ok -MEDIMATE');
  });

  it('fits the HELP and JOIN replies in one SMS each', async () => {
    const { msg } = await import('../src/i18n/messages');
    expect(paginateSms(msg('en', 'help'))).toHaveLength(1);
    expect(paginateSms(msg('en', 'join_prompt', { privacyUrl: 'medimate/privacy' }))).toHaveLength(1);
  });

  it('signs short replies with one page', () => {
    const pages = paginateSms('Recorded as taken.');
    expect(pages).toEqual([`Recorded as taken. ${SMS_SIGNATURE}`]);
  });
  it('paginates long replies so each page fits one segment', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const pages = paginateSms(long);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      expect(segmentCount(p)).toBe(1);
      expect(p.endsWith(SMS_SIGNATURE)).toBe(true);
    }
    expect(pages[0]).toMatch(/\(1\/\d\) Reply MORE/);
    expect(pages.at(-1)).not.toMatch(/Reply MORE/);
    // No content is lost.
    const joined = pages.map((p) => p.replace(/ \(\d+\/\d+\).*$/, '')).join(' ');
    expect(joined).toBe(long);
  });
});
