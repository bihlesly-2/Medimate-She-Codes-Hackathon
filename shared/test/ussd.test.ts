import { describe, expect, it, beforeEach } from 'vitest';
import {
  handleUssd,
  renderScreen,
  USSD_MAX_CHARS,
  type UssdAccount,
  type UssdPort,
  type UssdSession,
} from '../src/ussd/machine';

const PHONE = '+237600000001';

function makePort(overrides: Partial<UssdAccount> | null = {}) {
  const calls: string[] = [];
  let account: UssdAccount | null =
    overrides === null
      ? null
      : {
          language: 'en',
          tier: 'trial',
          daysLeft: 12,
          caretakers: 1,
          healthConsent: true,
          entitled: { reminders: true, vitals: true, water: true, steps: true },
          ...overrides,
        };
  const port: UssdPort = {
    async getAccount() {
      return account;
    },
    async register(_phone, lang) {
      calls.push(`register:${lang}`);
      account = {
        language: lang,
        tier: 'trial',
        daysLeft: 30,
        caretakers: 0,
        healthConsent: true,
        entitled: { reminders: true, vitals: true, water: true, steps: true },
      };
      return { trialDays: 30 };
    },
    async setLanguage(_p, lang) {
      calls.push(`lang:${lang}`);
      if (account) account.language = lang;
    },
    async searchMedicines(q) {
      if (/para/i.test(q)) {
        return [
          { id: 'm1', label: 'Paracetamol 500 mg tablet' },
          { id: 'm2', label: 'Paracetamol 120 mg/5 mL syrup' },
        ];
      }
      if (/ors/i.test(q)) return [{ id: 'm3', label: 'ORS sachet' }];
      return [];
    },
    async findOffers(id) {
      if (id === 'm3') return [];
      return [
        { code: 'MOL1', name: 'Demo Pharmacy Molyko', priceLabel: '500F', stateLabel: 'In stock', stale: false },
        { code: 'GSO1', name: 'Demo Pharmacy Great Soppo', priceLabel: '450F', stateLabel: 'Low', stale: true },
      ];
    },
    async pharmacyByCode(code) {
      return code === 'MOL1' ? { code, name: 'Demo Pharmacy Molyko', area: 'Molyko, Buea', phone: '+237600000100' } : null;
    },
    async openReminders() {
      return [{ id: 'o1', ref: 'R7K2', time: '08:00' }];
    },
    async confirmReminder(_p, id, action) {
      calls.push(`confirm:${id}:${action}`);
      return { result: 'recorded', ref: 'R7K2' };
    },
    async logBp(_p, s, d) {
      calls.push(`bp:${s}/${d}`);
    },
    async logWeight(_p, kg) {
      calls.push(`weight:${kg}`);
    },
    async logWater(_p, ml) {
      calls.push(`water:${ml}`);
      return { total: ml, target: 2000 };
    },
    async logSteps(_p, n) {
      calls.push(`steps:${n}`);
      return { total: n, goal: 6000 };
    },
    async sendInquiry(_p, code, m) {
      calls.push(`inquiry:${code}:${m}`);
      return true;
    },
    async tips() {
      return [
        { title: 'Tip one', body: 'Body one' },
        { title: 'Tip two', body: 'Body two' },
      ];
    },
  };
  return { port, calls };
}

let now = 1_000_000;
async function run(port: UssdPort, inputs: string[], sessionId = 'sess-1', start: UssdSession | null = null) {
  let session = start;
  let last = { text: '', end: false };
  for (const input of inputs) {
    now += 1000;
    const r = await handleUssd(session, input, { sessionId, phone: PHONE, now, timeoutMs: 120_000, port });
    session = r.session;
    last = r;
    expect(r.text.length).toBeLessThanOrEqual(USSD_MAX_CHARS);
  }
  return { session: session!, ...last };
}

beforeEach(() => {
  now = 1_000_000;
});

describe('USSD state machine', () => {
  it('shows the language picker on first use, then the home menu', async () => {
    const { port, calls } = makePort({ language: null });
    const r1 = await run(port, ['']);
    expect(r1.text).toMatch(/Choose language/);
    const r2 = await run(port, ['2'], 'sess-1', r1.session);
    expect(r2.session.lang).toBe('fr');
    expect(r2.text).toMatch(/Bienvenue sur MEDIMATE/);
    expect(calls).toContain('lang:fr');
  });

  it('starts at the home menu for a registered user with a language', async () => {
    const { port } = makePort();
    const r = await run(port, ['']);
    expect(r.text.startsWith('Welcome to MEDIMATE')).toBe(true);
    expect(r.text).toMatch(/1 Find medicine/);
    expect(r.end).toBe(false);
  });

  it('finds a medicine, disambiguates, lists offers and shows details', async () => {
    const { port } = makePort();
    const r = await run(port, ['', '1', 'paracetamol']);
    expect(r.session.screen).toBe('FIND_PICK');
    expect(r.text).toMatch(/1 Paracetamol 500 mg tablet/);
    const r2 = await run(port, ['1', '1'], 'sess-1', r.session);
    expect(r2.session.screen).toBe('FIND_RESULTS');
    expect(r2.text).toMatch(/500F In stock/);
    expect(r2.text).toMatch(/OLD/);
    const r3 = await run(port, ['1'], 'sess-1', r2.session);
    expect(r3.text).toMatch(/Call \+237600000100/);
  });

  it('reports when no verified pharmacy reported the medicine', async () => {
    const { port } = makePort();
    const r = await run(port, ['', '1', 'ors', '1']);
    expect(r.text).toMatch(/No verified pharmacy/);
  });

  it('supports 0 Back and 00 Home', async () => {
    const { port } = makePort();
    const r = await run(port, ['', '1', 'paracetamol', '0']);
    expect(r.session.screen).toBe('FIND_QUERY');
    const r2 = await run(port, ['0'], 'sess-1', r.session);
    expect(r2.session.screen).toBe('HOME');
    const r3 = await run(port, ['1', 'paracetamol', '1', '00'], 'sess-1', r2.session);
    expect(r3.session.screen).toBe('HOME');
    expect(r3.session.stack).toEqual([]);
  });

  it('handles invalid input without changing screen', async () => {
    const { port } = makePort();
    const r = await run(port, ['', '9']);
    expect(r.session.screen).toBe('HOME');
    expect(r.text).toMatch(/^Invalid choice\./);
  });

  it('confirms a reminder as taken', async () => {
    const { port, calls } = makePort();
    const r = await run(port, ['', '2', '1', '1']);
    expect(r.end).toBe(true);
    expect(r.text).toMatch(/Recorded as taken \(R7K2\)/);
    expect(calls).toContain('confirm:o1:taken');
  });

  it('blocks premium features after the trial without blocking the finder', async () => {
    const { port } = makePort({ tier: 'free', entitled: { reminders: false, vitals: false, water: false, steps: false } });
    const r = await run(port, ['', '2']);
    expect(r.end).toBe(true);
    expect(r.text).toMatch(/Premium/);
    const r2 = await run(port, ['', '1'], 'sess-2');
    expect(r2.session.screen).toBe('FIND_QUERY');
  });

  it('logs blood pressure in two steps and never interprets it', async () => {
    const { port, calls } = makePort();
    const r = await run(port, ['', '3', '1', '120', '80']);
    expect(calls).toContain('bp:120/80');
    expect(r.text).toMatch(/does not interpret readings/);
    expect(r.text).not.toMatch(/normal|high|low/i);
  });

  it('rejects an implausible blood pressure value', async () => {
    const { port } = makePort();
    const r = await run(port, ['', '3', '1', '120', '130']);
    expect(r.session.screen).toBe('LOG_BP_DIA');
    expect(r.text).toMatch(/check the value/);
  });

  it('logs water by quick option and steps', async () => {
    const { port, calls } = makePort();
    await run(port, ['', '3', '3', '2']);
    expect(calls).toContain('water:500');
    await run(port, ['', '3', '4', '3200'], 'sess-3');
    expect(calls).toContain('steps:3200');
  });

  it('contacts a pharmacy by code', async () => {
    const { port, calls } = makePort();
    const r = await run(port, ['', '4', 'mol1', 'Do you have ORS']);
    expect(r.text).toMatch(/sent to Demo Pharmacy Molyko/);
    expect(calls).toContain('inquiry:MOL1:Do you have ORS');
    const bad = await run(port, ['', '4', 'zzz9'], 'sess-4');
    expect(bad.text).toMatch(/No verified pharmacy uses the code ZZZ9/);
  });

  it('asks unregistered users to register before reminders, and registers with consent', async () => {
    const { port, calls } = makePort(null);
    const r = await run(port, ['', '1']); // language pick → English
    expect(r.session.screen).toBe('HOME');
    const r2 = await run(port, ['2'], 'sess-1', r.session);
    expect(r2.text).toMatch(/register first/);
    const r3 = await run(port, ['6', '1'], 'sess-1', r2.session);
    expect(r3.end).toBe(true);
    expect(r3.text).toMatch(/30-day free trial/);
    expect(calls).toContain('register:en');
  });

  it('cycles health tips', async () => {
    const { port } = makePort();
    const r = await run(port, ['', '5']);
    expect(r.text).toMatch(/Tip one/);
    const r2 = await run(port, ['1'], 'sess-1', r.session);
    expect(r2.text).toMatch(/Tip two/);
  });

  it('shows plan status and changes language from My account', async () => {
    const { port, calls } = makePort();
    const r = await run(port, ['', '6', '2']);
    expect(r.text).toMatch(/Plan: trial\. Trial ends in 12 days/);
    const r2 = await run(port, ['', '6', '1', '2'], 'sess-9');
    expect(r2.end).toBe(true);
    expect(calls).toContain('lang:fr');
  });

  it('times out and restarts at the top without revealing the previous screen', async () => {
    const { port } = makePort();
    const r = await run(port, ['', '2', '1']);
    expect(r.session.screen).toBe('REM_ACTION');
    const expired = await handleUssd(r.session, '1', {
      sessionId: 'sess-1',
      phone: PHONE,
      now: r.session.lastActiveAt + 121_000,
      timeoutMs: 120_000,
      port,
    });
    expect(expired.session.screen).toBe('HOME');
    expect(expired.text).toMatch(/^Session expired/);
    expect(expired.text).not.toMatch(/R7K2/);
    expect(expired.session.data.reminders).toBeUndefined();
  });

  it('keeps every static screen within the USSD length limit', () => {
    const screens = ['HOME', 'LANG_PICK', 'LOG_MENU', 'ACCOUNT', 'REGISTER', 'FIND_AREA', 'LOG_WATER'] as const;
    for (const lang of ['en', 'fr'] as const) {
      for (const screen of screens) {
        const text = renderScreen({ sessionId: 's', phone: PHONE, lang, screen, stack: [], data: {}, lastActiveAt: 0 });
        expect(text.length, `${lang}/${screen}`).toBeLessThanOrEqual(160);
      }
    }
  });
});
