import type { MessageLang } from '../constants';
import { msg, type MessageKey } from '../i18n/messages';

/**
 * USSD state machine — independent of any UI or provider.
 *
 * - Every screen uses numbered choices and supports `0` (Back) and `00` (Home).
 * - Sessions time out; an expired session restarts at the top WITHOUT showing anything from the
 *   previous session (shared-phone privacy).
 * - All data access goes through the injected `UssdPort`, so the machine is unit-testable.
 * - Screens target ≤160 characters; 182 is the common hard USSD limit.
 */

export type UssdScreen =
  | 'LANG_PICK'
  | 'HOME'
  | 'FIND_QUERY'
  | 'FIND_PICK'
  | 'FIND_AREA'
  | 'FIND_RESULTS'
  | 'FIND_DETAIL'
  | 'REM_LIST'
  | 'REM_ACTION'
  | 'LOG_MENU'
  | 'LOG_BP_SYS'
  | 'LOG_BP_DIA'
  | 'LOG_WEIGHT'
  | 'LOG_WATER'
  | 'LOG_WATER_ML'
  | 'LOG_STEPS'
  | 'CONTACT_CODE'
  | 'CONTACT_MSG'
  | 'TIPS'
  | 'ACCOUNT'
  | 'ACCOUNT_LANG'
  | 'REGISTER';

export interface UssdOffer {
  code: string;
  name: string;
  priceLabel: string;
  stateLabel: string;
  stale: boolean;
}
export interface UssdReminder {
  id: string;
  ref: string;
  time: string;
}
export interface UssdAccount {
  language: MessageLang | null;
  tier: 'trial' | 'premium' | 'free';
  daysLeft: number;
  caretakers: number;
  healthConsent: boolean;
  entitled: { reminders: boolean; vitals: boolean; water: boolean; steps: boolean };
}

export interface UssdPort {
  /** null when the phone number has no MEDIMATE account. */
  getAccount(phone: string): Promise<UssdAccount | null>;
  register(phone: string, lang: MessageLang): Promise<{ trialDays: number }>;
  setLanguage(phone: string, lang: MessageLang): Promise<void>;
  searchMedicines(query: string): Promise<{ id: string; label: string }[]>;
  findOffers(medicineId: string, area: string | null): Promise<UssdOffer[]>;
  pharmacyByCode(code: string): Promise<{ code: string; name: string; area: string; phone: string } | null>;
  openReminders(phone: string): Promise<UssdReminder[]>;
  confirmReminder(
    phone: string,
    occurrenceId: string,
    action: 'taken' | 'skipped',
  ): Promise<{ result: 'recorded' | 'already' | 'not_found'; ref: string; status?: string }>;
  logBp(phone: string, systolic: number, diastolic: number): Promise<void>;
  logWeight(phone: string, kg: number): Promise<void>;
  logWater(phone: string, ml: number): Promise<{ total: number; target: number }>;
  logSteps(phone: string, count: number): Promise<{ total: number; goal: number }>;
  sendInquiry(phone: string, code: string, message: string): Promise<boolean>;
  tips(lang: MessageLang): Promise<{ title: string; body: string }[]>;
}

export interface UssdData {
  medicineId?: string;
  medicineLabel?: string;
  options?: { id: string; label: string }[];
  offers?: UssdOffer[];
  pharmacy?: { code: string; name: string; area: string; phone: string };
  reminders?: UssdReminder[];
  reminderId?: string;
  systolic?: number;
  tips?: { title: string; body: string }[];
  tipIndex?: number;
  notice?: string;
}

export interface UssdSession {
  sessionId: string;
  phone: string;
  lang: MessageLang;
  screen: UssdScreen;
  stack: UssdScreen[];
  data: UssdData;
  lastActiveAt: number;
}

export interface UssdContext {
  sessionId: string;
  phone: string;
  now: number;
  timeoutMs: number;
  port: UssdPort;
}

export interface UssdResult {
  session: UssdSession;
  text: string;
  end: boolean;
}

export const USSD_DEFAULT_TIMEOUT_MS = 120_000;
export const USSD_MAX_CHARS = 182;

const truncate = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + '.');

/** Render the current screen (pure). */
export function renderScreen(s: UssdSession): string {
  const t = (k: MessageKey, v?: Record<string, string | number>) => msg(s.lang, k, v);
  const nav = t('ussd_nav');
  const notice = s.data.notice ? `${s.data.notice}\n` : '';
  let body: string;
  switch (s.screen) {
    case 'LANG_PICK':
    case 'ACCOUNT_LANG':
      body = t('ussd_lang_pick');
      return notice + body + (s.screen === 'ACCOUNT_LANG' ? `\n${nav}` : '');
    case 'HOME':
      return notice + t('ussd_home');
    case 'FIND_QUERY':
      body = t('ussd_find_query');
      break;
    case 'FIND_PICK':
      body = [t('ussd_find_pick'), ...(s.data.options ?? []).map((o, i) => `${i + 1} ${truncate(o.label, 30)}`)].join('\n');
      break;
    case 'FIND_AREA':
      body = t('ussd_find_area');
      break;
    case 'FIND_RESULTS': {
      const offers = s.data.offers ?? [];
      body = offers.length
        ? [
            t('ussd_find_results'),
            ...offers.map(
              (o, i) =>
                `${i + 1} ${truncate(o.name, 22)} ${o.priceLabel} ${o.stateLabel}${o.stale ? ` ${msg(s.lang, 'stale_note')}` : ''}`,
            ),
          ].join('\n')
        : t('ussd_find_none');
      break;
    }
    case 'FIND_DETAIL': {
      const p = s.data.pharmacy;
      body = p ? t('ussd_detail', { name: truncate(p.name, 40), code: p.code, area: p.area, phone: p.phone }) : t('ussd_find_none');
      break;
    }
    case 'REM_LIST': {
      const rs = s.data.reminders ?? [];
      body = rs.length ? [t('ussd_rem_list'), ...rs.map((r, i) => `${i + 1} ${r.time} ${r.ref}`)].join('\n') : t('ussd_rem_none');
      break;
    }
    case 'REM_ACTION': {
      const r = (s.data.reminders ?? []).find((x) => x.id === s.data.reminderId);
      body = t('ussd_rem_action', { ref: r?.ref ?? '', time: r?.time ?? '' });
      break;
    }
    case 'LOG_MENU':
      body = t('ussd_log_menu');
      break;
    case 'LOG_BP_SYS':
      body = t('ussd_log_bp_sys');
      break;
    case 'LOG_BP_DIA':
      body = t('ussd_log_bp_dia');
      break;
    case 'LOG_WEIGHT':
      body = t('ussd_log_weight');
      break;
    case 'LOG_WATER':
      body = t('ussd_log_water');
      break;
    case 'LOG_WATER_ML':
      body = t('ussd_log_water_ml');
      break;
    case 'LOG_STEPS':
      body = t('ussd_log_steps');
      break;
    case 'CONTACT_CODE':
      body = t('ussd_contact_code');
      break;
    case 'CONTACT_MSG':
      body = t('ussd_contact_msg', { pharmacy: truncate(s.data.pharmacy?.name ?? '', 40) });
      break;
    case 'TIPS': {
      const tips = s.data.tips ?? [];
      const tip = tips[(s.data.tipIndex ?? 0) % Math.max(1, tips.length)];
      body = tip ? t('ussd_tip', { title: truncate(tip.title, 40), body: truncate(tip.body, 90) }) : t('ussd_tip_none');
      break;
    }
    case 'ACCOUNT':
      body = t('ussd_account');
      break;
    case 'REGISTER':
      return notice + t('ussd_register');
  }
  return `${notice}${body}\n${nav}`;
}

function newSession(ctx: UssdContext, lang: MessageLang, screen: UssdScreen): UssdSession {
  return { sessionId: ctx.sessionId, phone: ctx.phone, lang, screen, stack: [], data: {}, lastActiveAt: ctx.now };
}

function go(s: UssdSession, next: UssdScreen) {
  s.stack.push(s.screen);
  s.screen = next;
}

const con = (session: UssdSession): UssdResult => ({ session, text: renderScreen(session), end: false });
const end = (session: UssdSession, text: string): UssdResult => ({ session, text, end: true });

function invalid(s: UssdSession, key: MessageKey = 'ussd_invalid'): UssdResult {
  s.data.notice = msg(s.lang, key);
  return con(s);
}

const isInt = (s: string) => /^\d{1,6}$/.test(s);

export async function handleUssd(prev: UssdSession | null, rawInput: string, ctx: UssdContext): Promise<UssdResult> {
  const input = rawInput.trim();
  const expired = prev !== null && ctx.now - prev.lastActiveAt > ctx.timeoutMs;

  if (!prev || expired || prev.sessionId !== ctx.sessionId || prev.phone !== ctx.phone) {
    const account = await ctx.port.getAccount(ctx.phone);
    const lang = account?.language ?? 'en';
    const s = newSession(ctx, lang, account?.language ? 'HOME' : 'LANG_PICK');
    if (expired) s.data.notice = msg(lang, 'ussd_expired');
    return con(s);
  }

  const s: UssdSession = structuredClone(prev);
  s.lastActiveAt = ctx.now;
  delete s.data.notice;

  if (input === '00') {
    s.screen = 'HOME';
    s.stack = [];
    s.data = {};
    return con(s);
  }
  if (input === '0' && s.screen !== 'HOME' && s.screen !== 'LANG_PICK' && s.screen !== 'REGISTER') {
    s.screen = s.stack.pop() ?? 'HOME';
    return con(s);
  }
  return step(s, input, ctx);
}

async function step(s: UssdSession, input: string, ctx: UssdContext): Promise<UssdResult> {
  const { port } = ctx;
  const t = (k: MessageKey, v?: Record<string, string | number>) => msg(s.lang, k, v);
  const choice = isInt(input) ? Number(input) : NaN;

  switch (s.screen) {
    case 'LANG_PICK':
    case 'ACCOUNT_LANG': {
      if (choice !== 1 && choice !== 2) return invalid(s);
      s.lang = choice === 1 ? 'en' : 'fr';
      const account = await port.getAccount(ctx.phone);
      if (account) await port.setLanguage(ctx.phone, s.lang);
      if (s.screen === 'ACCOUNT_LANG') return end(s, t('lang_set', { lang: s.lang === 'en' ? 'English' : 'Francais' }));
      s.screen = 'HOME';
      s.stack = [];
      return con(s);
    }

    case 'HOME': {
      if (choice === 1) {
        go(s, 'FIND_QUERY');
        return con(s);
      }
      if (choice === 5) {
        s.data.tips = await port.tips(s.lang);
        s.data.tipIndex = 0;
        go(s, 'TIPS');
        return con(s);
      }
      if (choice === 6) {
        const account = await port.getAccount(ctx.phone);
        go(s, account ? 'ACCOUNT' : 'REGISTER');
        return con(s);
      }
      if (choice === 2 || choice === 3 || choice === 4) {
        const account = await port.getAccount(ctx.phone);
        if (!account) return invalid(s, 'ussd_need_register');
        if (choice === 4) {
          go(s, 'CONTACT_CODE');
          return con(s);
        }
        if (!account.healthConsent) return end(s, t('need_health_consent'));
        if (choice === 2) {
          if (!account.entitled.reminders) return end(s, t('premium_required'));
          s.data.reminders = (await port.openReminders(ctx.phone)).slice(0, 5);
          go(s, 'REM_LIST');
          return con(s);
        }
        if (!account.entitled.vitals && !account.entitled.water && !account.entitled.steps) return end(s, t('premium_required'));
        go(s, 'LOG_MENU');
        return con(s);
      }
      return invalid(s);
    }

    case 'FIND_QUERY': {
      if (input.length < 2 || input.length > 60) return invalid(s);
      const options = await port.searchMedicines(input);
      if (options.length === 0) {
        s.data.notice = t('med_unknown', { query: truncate(input, 30) });
        return con(s);
      }
      if (options.length === 1) {
        s.data.medicineId = options[0]!.id;
        s.data.medicineLabel = options[0]!.label;
        go(s, 'FIND_AREA');
        return con(s);
      }
      s.data.options = options.slice(0, 5);
      go(s, 'FIND_PICK');
      return con(s);
    }

    case 'FIND_PICK': {
      const opt = s.data.options?.[choice - 1];
      if (!opt) return invalid(s);
      s.data.medicineId = opt.id;
      s.data.medicineLabel = opt.label;
      go(s, 'FIND_AREA');
      return con(s);
    }

    case 'FIND_AREA': {
      let area: string | null;
      if (input === '1') area = null;
      else if (input.length >= 2 && input.length <= 60) area = input;
      else return invalid(s);
      s.data.offers = (await port.findOffers(s.data.medicineId ?? '', area)).slice(0, 3);
      go(s, 'FIND_RESULTS');
      return con(s);
    }

    case 'FIND_RESULTS': {
      const offer = s.data.offers?.[choice - 1];
      if (!offer) return invalid(s);
      const p = await port.pharmacyByCode(offer.code);
      if (!p) return invalid(s);
      s.data.pharmacy = p;
      go(s, 'FIND_DETAIL');
      return con(s);
    }

    case 'FIND_DETAIL': {
      if (choice !== 1) return invalid(s);
      if (!(await port.getAccount(ctx.phone))) return invalid(s, 'ussd_need_register');
      go(s, 'CONTACT_MSG');
      return con(s);
    }

    case 'REM_LIST': {
      const r = s.data.reminders?.[choice - 1];
      if (!r) return invalid(s);
      s.data.reminderId = r.id;
      go(s, 'REM_ACTION');
      return con(s);
    }

    case 'REM_ACTION': {
      if (choice !== 1 && choice !== 2) return invalid(s);
      const res = await port.confirmReminder(ctx.phone, s.data.reminderId ?? '', choice === 1 ? 'taken' : 'skipped');
      if (res.result === 'not_found') return end(s, t('reminder_unknown_ref', { ref: res.ref }));
      if (res.result === 'already') return end(s, t('reminder_already', { ref: res.ref, status: res.status ?? '' }));
      return end(s, t(choice === 1 ? 'reminder_taken' : 'reminder_skipped', { ref: res.ref }));
    }

    case 'LOG_MENU': {
      const account = await port.getAccount(ctx.phone);
      if (!account) return invalid(s, 'ussd_need_register');
      const map: Record<number, [UssdScreen, boolean]> = {
        1: ['LOG_BP_SYS', account.entitled.vitals],
        2: ['LOG_WEIGHT', account.entitled.vitals],
        3: ['LOG_WATER', account.entitled.water],
        4: ['LOG_STEPS', account.entitled.steps],
      };
      const target = map[choice];
      if (!target) return invalid(s);
      if (!target[1]) return end(s, t('premium_required'));
      go(s, target[0]);
      return con(s);
    }

    case 'LOG_BP_SYS': {
      if (!isInt(input) || choice < 50 || choice > 260) return invalid(s, 'ussd_bad_value');
      s.data.systolic = choice;
      go(s, 'LOG_BP_DIA');
      return con(s);
    }

    case 'LOG_BP_DIA': {
      const sys = s.data.systolic ?? 0;
      if (!isInt(input) || choice < 30 || choice > 160 || choice >= sys) return invalid(s, 'ussd_bad_value');
      await port.logBp(ctx.phone, sys, choice);
      return end(s, `${t('bp_saved', { systolic: sys, diastolic: choice })} ${t('vital_saved_note')}`);
    }

    case 'LOG_WEIGHT': {
      if (!/^\d{1,3}([.,]\d)?$/.test(input)) return invalid(s, 'ussd_bad_value');
      const kg = Number(input.replace(',', '.'));
      if (kg < 1 || kg > 400) return invalid(s, 'ussd_bad_value');
      await port.logWeight(ctx.phone, kg);
      return end(s, `${t('weight_saved', { kg })} ${t('vital_saved_note')}`);
    }

    case 'LOG_WATER': {
      if (choice === 3) {
        go(s, 'LOG_WATER_ML');
        return con(s);
      }
      if (choice !== 1 && choice !== 2) return invalid(s);
      const ml = choice === 1 ? 250 : 500;
      const r = await port.logWater(ctx.phone, ml);
      return end(s, t('water_saved', { ml, total: r.total, target: r.target }));
    }

    case 'LOG_WATER_ML': {
      if (!isInt(input) || choice < 10 || choice > 5000) return invalid(s, 'ussd_bad_value');
      const r = await port.logWater(ctx.phone, choice);
      return end(s, t('water_saved', { ml: choice, total: r.total, target: r.target }));
    }

    case 'LOG_STEPS': {
      if (!isInt(input) || choice > 100_000) return invalid(s, 'ussd_bad_value');
      const r = await port.logSteps(ctx.phone, choice);
      return end(s, t('steps_saved', { count: choice, total: r.total, goal: r.goal }));
    }

    case 'CONTACT_CODE': {
      if (!/^[A-Za-z0-9]{3,10}$/.test(input)) return invalid(s);
      const p = await port.pharmacyByCode(input.toUpperCase());
      if (!p) {
        s.data.notice = t('contact_unknown', { code: input.toUpperCase() });
        return con(s);
      }
      s.data.pharmacy = p;
      go(s, 'CONTACT_MSG');
      return con(s);
    }

    case 'CONTACT_MSG': {
      const p = s.data.pharmacy;
      if (!p || input.length < 2 || input.length > 160) return invalid(s);
      const sent = await port.sendInquiry(ctx.phone, p.code, input);
      if (!sent) return end(s, t('contact_unknown', { code: p.code }));
      return end(s, t('contact_sent', { pharmacy: p.name, phone: p.phone }));
    }

    case 'TIPS': {
      if (choice !== 1 || !(s.data.tips ?? []).length) return invalid(s);
      s.data.tipIndex = ((s.data.tipIndex ?? 0) + 1) % (s.data.tips ?? []).length;
      return con(s);
    }

    case 'ACCOUNT': {
      const account = await port.getAccount(ctx.phone);
      if (!account) return invalid(s, 'ussd_need_register');
      if (choice === 1) {
        go(s, 'ACCOUNT_LANG');
        return con(s);
      }
      if (choice === 2) {
        const detail =
          account.tier === 'trial'
            ? t('ussd_plan_trial', { days: account.daysLeft })
            : account.tier === 'premium'
              ? t('ussd_plan_premium', { days: account.daysLeft })
              : t('ussd_plan_free');
        return end(s, t('ussd_plan', { tier: account.tier, detail }));
      }
      if (choice === 3) return end(s, t('ussd_care', { count: account.caretakers }));
      return invalid(s);
    }

    case 'REGISTER': {
      if (choice === 2) return end(s, t('ussd_goodbye'));
      if (choice !== 1) return invalid(s);
      const r = await port.register(ctx.phone, s.lang);
      return end(s, t('ussd_registered', { days: r.trialDays }));
    }
  }
}
