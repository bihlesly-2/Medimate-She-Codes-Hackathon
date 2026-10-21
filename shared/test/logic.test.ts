import { describe, expect, it } from 'vitest';
import { ageLabel, haversineKm, isStale, lowestPriceIds } from '../src/stock';
import { accessTier, hasFeature, trialEndsAt, daysLeft } from '../src/entitlements';
import { addDays, localDate, localDayBounds, localTime, zonedDateTimeToUtc } from '../src/time';
import { ageFromDob, bmi, fToC, lbToKg, mgdlToMmol, normalizeVital } from '../src/units';
import { parseCsv, validateStockCsv } from '../src/csv';
import { maskPhone, normalizePhone } from '../src/phone';
import { adherenceSummary, streakLength } from '../src/adherence';
import { isOpenAt } from '../src/hours';
import { msg } from '../src/i18n/messages';

const H = 3_600_000;

describe('stock freshness', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  it('is stale only when strictly older than 48 hours', () => {
    expect(isStale(new Date(now.getTime() - 48 * H), now)).toBe(false);
    expect(isStale(new Date(now.getTime() - 48 * H - 1), now)).toBe(true);
    expect(isStale(new Date(now.getTime() - 2 * H), now)).toBe(false);
  });
  it('labels age in plain words', () => {
    expect(ageLabel(new Date(now.getTime() - 30_000), now)).toBe('just now');
    expect(ageLabel(new Date(now.getTime() - 3 * H), now)).toBe('3 h ago');
    expect(ageLabel(new Date(now.getTime() - 72 * H), now)).toBe('3 days ago');
  });
});

describe('lowest price comparison', () => {
  const now = new Date('2026-10-21T12:00:00Z');
  const fresh = new Date(now.getTime() - H);
  const old = new Date(now.getTime() - 60 * H);
  it('only compares the same medicine record, fresh, priced and available', () => {
    const ids = lowestPriceIds(
      [
        { id: 'a', medicineId: 'para500', price: 500, stockState: 'in_stock', updatedAt: fresh },
        { id: 'b', medicineId: 'para500', price: 450, stockState: 'low', updatedAt: fresh },
        { id: 'c', medicineId: 'para500', price: 100, stockState: 'in_stock', updatedAt: old }, // stale
        { id: 'd', medicineId: 'para500', price: 50, stockState: 'out', updatedAt: fresh }, // out
        { id: 'e', medicineId: 'paraSyrup', price: 300, stockState: 'in_stock', updatedAt: fresh }, // different form
        { id: 'f', medicineId: 'para500', price: null, stockState: 'in_stock', updatedAt: fresh }, // no price
      ],
      now,
    );
    expect([...ids]).toEqual(['b']);
  });
  it('does not highlight a single offer as "lowest"', () => {
    const ids = lowestPriceIds([{ id: 'a', medicineId: 'x', price: 500, stockState: 'in_stock', updatedAt: fresh }], now);
    expect(ids.size).toBe(0);
  });
  it('computes distances', () => {
    expect(haversineKm({ lat: 4.1527, lng: 9.292 }, { lat: 4.1527, lng: 9.292 })).toBe(0);
    expect(haversineKm({ lat: 4.15, lng: 9.24 }, { lat: 4.16, lng: 9.24 })).toBeCloseTo(1.11, 1);
  });
});

describe('trial and entitlements', () => {
  const created = new Date('2026-10-01T10:00:00Z');
  const ends = trialEndsAt(created, 30);
  const sub = { trialEndsAt: ends, premiumUntil: null };
  it('trial ends exactly 30 days after creation', () => {
    expect(ends.toISOString()).toBe('2026-10-31T10:00:00.000Z');
  });
  it('is in trial one millisecond before expiry and free at the exact instant', () => {
    expect(accessTier(sub, new Date(ends.getTime() - 1))).toBe('trial');
    expect(accessTier(sub, ends)).toBe('free');
  });
  it('locks premium features after expiry but keeps free features', () => {
    expect(hasFeature('reminders', sub, ends)).toBe(false);
    expect(hasFeature('pharmacy_finder', sub, ends)).toBe(true);
    expect(hasFeature('medicine_info', sub, ends)).toBe(true);
    expect(hasFeature('reminders', sub, new Date(ends.getTime() - 1))).toBe(true);
  });
  it('premium overrides an expired trial until its own end', () => {
    const until = new Date(ends.getTime() + 10 * 86_400_000);
    const p = { trialEndsAt: ends, premiumUntil: until };
    expect(accessTier(p, new Date(ends.getTime() + 1))).toBe('premium');
    expect(accessTier(p, until)).toBe('free');
  });
  it('respects a configured premium feature list', () => {
    expect(hasFeature('steps', sub, ends, ['reminders'])).toBe(true);
  });
  it('counts days left by rounding up', () => {
    expect(daysLeft(ends, new Date(ends.getTime() - 1))).toBe(1);
    expect(daysLeft(ends, ends)).toBe(0);
  });
});

describe('time zones', () => {
  it('converts Africa/Douala (UTC+1, no DST)', () => {
    expect(zonedDateTimeToUtc('2026-10-21', '08:00', 'Africa/Douala').toISOString()).toBe('2026-10-21T07:00:00.000Z');
    expect(localDate(new Date('2026-10-21T23:30:00Z'), 'Africa/Douala')).toBe('2026-10-22');
    expect(localTime(new Date('2026-10-21T07:00:00Z'), 'Africa/Douala')).toBe('08:00');
  });
  it('handles a DST spring-forward gap by moving forward', () => {
    // 01:30 does not exist in London on 2026-03-29.
    const d = zonedDateTimeToUtc('2026-03-29', '01:30', 'Europe/London');
    expect(localTime(d, 'Europe/London')).toBe('02:30');
  });
  it('resolves a repeated fall-back time to the later instant', () => {
    const d = zonedDateTimeToUtc('2026-10-25', '01:30', 'Europe/London');
    expect(d.toISOString()).toBe('2026-10-25T01:30:00.000Z');
  });
  it('gives the UTC bounds of a local day and adds days across months', () => {
    const b = localDayBounds('2026-10-21', 'Africa/Douala');
    expect(b.start.toISOString()).toBe('2026-10-20T23:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-10-21T23:00:00.000Z');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('units and vitals', () => {
  it('converts units', () => {
    expect(lbToKg(100)).toBeCloseTo(45.359, 3);
    expect(mgdlToMmol(180.16)).toBeCloseTo(10, 2);
    expect(fToC(98.6)).toBeCloseTo(37, 5);
  });
  it('normalises entered vitals to canonical units', () => {
    expect(normalizeVital({ type: 'weight', value: 154, unit: 'lb' })).toEqual({ ok: true, vital: { type: 'weight', value: 69.9, value2: null, unit: 'kg' } });
    expect(normalizeVital({ type: 'glucose', value: 101, unit: 'mg/dL' })).toMatchObject({ ok: true, vital: { value: 5.61, unit: 'mmol/L' } });
    expect(normalizeVital({ type: 'temperature', value: 98.6, unit: '°F' })).toMatchObject({ ok: true, vital: { value: 37, unit: '°C' } });
    expect(normalizeVital({ type: 'bp', value: 120, value2: 80, unit: 'mmHg' })).toMatchObject({ ok: true, vital: { value: 120, value2: 80 } });
  });
  it('rejects wrong units and typos', () => {
    expect(normalizeVital({ type: 'weight', value: 70, unit: 'stone' }).ok).toBe(false);
    expect(normalizeVital({ type: 'weight', value: 7000, unit: 'kg' }).ok).toBe(false);
    expect(normalizeVital({ type: 'bp', value: 120, unit: 'mmHg' }).ok).toBe(false);
    expect(normalizeVital({ type: 'bp', value: 80, value2: 120, unit: 'mmHg' }).ok).toBe(false);
  });
  it('computes BMI only for adults', () => {
    expect(bmi(70, 175, 30)).toBe(22.9);
    expect(bmi(40, 150, 14)).toBeNull();
    expect(bmi(70, 175, null)).toBeNull();
    expect(ageFromDob('2000-10-22', new Date('2026-10-21T00:00:00Z'))).toBe(25);
    expect(ageFromDob('2000-10-21', new Date('2026-10-21T00:00:00Z'))).toBe(26);
  });
});

describe('CSV import', () => {
  it('parses quoted fields and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });
  it('validates stock rows and reports issues by line', () => {
    const csv = [
      'medicine,strength,form,price_xaf,stock_state,quantity',
      'Paracetamol,500 mg,tablet,500,in stock,120',
      ',500 mg,tablet,500,in_stock,',
      'Amoxicillin,500 mg,capsule,abc,maybe,1.5',
      'ORS,,sachet,,unknown,',
    ].join('\n');
    const r = validateStockCsv(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ medicine: 'Paracetamol', price: 500, stockState: 'in_stock', quantity: 120 });
    expect(r.rows[1]).toMatchObject({ medicine: 'ORS', price: null, stockState: 'unknown' });
    expect(r.issues.map((i) => i.line)).toEqual([3, 4]);
    expect(r.issues[1]!.message).toMatch(/price_xaf/);
    expect(r.issues[1]!.message).toMatch(/stock_state/);
  });
  it('rejects a file with missing columns', () => {
    const r = validateStockCsv('medicine,price\nx,1');
    expect(r.rows).toHaveLength(0);
    expect(r.issues[0]!.message).toMatch(/Missing column/);
  });
});

describe('phone numbers', () => {
  it('normalises Cameroon numbers to E.164', () => {
    expect(normalizePhone('670 00 00 01')).toBe('+237670000001');
    expect(normalizePhone('+237 6 70 00 00 01')).toBe('+237670000001');
    expect(normalizePhone('00237670000001')).toBe('+237670000001');
    expect(normalizePhone('237670000001')).toBe('+237670000001');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+2371234')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });
  it('masks numbers', () => {
    expect(maskPhone('+237670000001')).toBe('+237••••••001');
  });
});

describe('adherence and streaks', () => {
  it('separates taken, skipped, missed and pending', () => {
    const s = adherenceSummary(['taken', 'taken', 'skipped', 'missed', 'sent', 'scheduled']);
    expect(s).toEqual({ taken: 2, skipped: 1, missed: 1, pending: 2, total: 6, rate: 0.5 });
    expect(adherenceSummary(['scheduled']).rate).toBeNull();
  });
  it('counts streaks without letting not-applicable days break them', () => {
    expect(
      streakLength([
        { date: '1', met: false },
        { date: '2', met: true },
        { date: '3', met: null },
        { date: '4', met: true },
        { date: '5', met: null },
      ]),
    ).toBe(2);
    expect(streakLength([{ date: '1', met: false }])).toBe(0);
  });
});

describe('opening hours', () => {
  const hours = [
    { weekday: 3, opens: '08:00', closes: '20:00' },
    { weekday: 5, opens: '20:00', closes: '02:00' },
  ];
  it('checks hours in the pharmacy time zone', () => {
    // Wed 2026-10-21 08:30 Douala = 07:30Z
    expect(isOpenAt(hours, 'Africa/Douala', new Date('2026-10-21T07:30:00Z'))).toBe(true);
    expect(isOpenAt(hours, 'Africa/Douala', new Date('2026-10-21T19:30:00Z'))).toBe(false);
    // Sat 01:00 Douala, open from Friday 20:00 overnight
    expect(isOpenAt(hours, 'Africa/Douala', new Date('2026-10-24T00:00:00Z'))).toBe(true);
    expect(isOpenAt([], 'Africa/Douala', new Date())).toBeNull();
  });
});

describe('message catalogue', () => {
  it('interpolates and falls back to English', () => {
    expect(msg('en', 'reminder_taken', { ref: 'R1' })).toBe('Recorded as taken (R1). Thank you.');
    expect(msg('fr', 'contact_unknown', { code: 'X1' })).toBe('No verified pharmacy uses the code X1.');
    expect(msg('pcm', 'need_join')).toBe('Please register first: send JOIN.');
  });
});
