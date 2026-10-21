import { eq } from 'drizzle-orm';
import {
  accessTier,
  daysLeft,
  handleUssd,
  isMessageLang,
  localDate,
  localTime,
  normalizePhone,
  STOCK_STATE_LABELS,
  USSD_DEFAULT_TIMEOUT_MS,
  type UssdPort,
  type UssdSession,
} from '@medimate/shared';
import { careLinks, users, ussdSessions } from '../db/schema';
import type { Deps } from '../types';
import { listPublishedTips } from './admin';
import { createInquiry } from './inquiries';
import { medicineLabel, pharmacyByCode, resolveMedicines, searchOffers } from './pharmacy';
import { confirmOccurrence, openOccurrences } from './reminders';
import { getSettings } from './settings';
import { addSteps, addVital, addWater } from './tracking';
import { findOrCreateUser, findUserByPhone, getSubscriptionState, hasConsent, setConsent, userHasFeature } from './users';

/** Database-backed implementation of the USSD port used by the pure state machine in @medimate/shared. */
export function ussdPort(deps: Deps): UssdPort {
  const userOf = async (phone: string) => {
    const u = await findUserByPhone(deps.db, phone);
    if (!u) throw new Error('USSD action requires a registered user');
    return u;
  };
  return {
    async getAccount(phone) {
      const u = await findUserByPhone(deps.db, phone);
      if (!u) return null;
      const now = deps.clock.now();
      const sub = await getSubscriptionState(deps.db, u.id);
      const tier = accessTier(sub, now);
      const links = await deps.db.select({ id: careLinks.id, status: careLinks.status }).from(careLinks).where(eq(careLinks.patientId, u.id));
      return {
        language: isMessageLang(u.language) ? u.language : null,
        tier,
        daysLeft: tier === 'trial' ? daysLeft(sub.trialEndsAt, now) : tier === 'premium' && sub.premiumUntil ? daysLeft(sub.premiumUntil, now) : 0,
        caretakers: links.filter((l) => l.status === 'active').length,
        healthConsent: await hasConsent(deps.db, u.id, 'health_data'),
        entitled: {
          reminders: await userHasFeature(deps, u.id, 'reminders'),
          vitals: await userHasFeature(deps, u.id, 'vitals'),
          water: await userHasFeature(deps, u.id, 'water'),
          steps: await userHasFeature(deps, u.id, 'steps'),
        },
      };
    },
    async register(phone, lang) {
      const { user } = await findOrCreateUser(deps, phone, 'ussd', { language: lang });
      await setConsent(deps, user.id, 'health_data', true, 'ussd');
      await setConsent(deps, user.id, 'sms_messages', true, 'ussd');
      return { trialDays: (await getSettings(deps.db)).trialDays };
    },
    async setLanguage(phone, lang) {
      await deps.db.update(users).set({ language: lang, updatedAt: deps.clock.now() }).where(eq(users.phone, phone));
    },
    async searchMedicines(query) {
      return (await resolveMedicines(deps.db, query, 5)).map((m) => ({ id: m.id, label: medicineLabel(m) }));
    },
    async findOffers(medicineId, area) {
      const res = await searchOffers(deps, { area: area ?? undefined, sort: 'freshness', limit: 3, offset: 0 }, { medicineIds: [medicineId] });
      return res.items.map((o) => ({
        code: o.pharmacy.code,
        name: o.pharmacy.name,
        priceLabel: o.price !== null ? `${o.price}F` : '-',
        stateLabel: STOCK_STATE_LABELS[o.stockState],
        stale: o.stale,
      }));
    },
    async pharmacyByCode(code) {
      const p = await pharmacyByCode(deps, code);
      return p ? { code: p.code, name: p.name, area: `${p.area}, ${p.town}`, phone: p.phone } : null;
    },
    async openReminders(phone) {
      const u = await userOf(phone);
      return (await openOccurrences(deps, u.id)).map((o) => ({ id: o.id, ref: o.refCode, time: localTime(o.scheduledFor, u.timezone) }));
    },
    async confirmReminder(phone, id, action) {
      const u = await userOf(phone);
      try {
        const r = await confirmOccurrence(deps, u.id, id, action, 'ussd');
        return { result: r.result, ref: r.ref, status: r.status };
      } catch {
        return { result: 'not_found', ref: '' };
      }
    },
    async logBp(phone, systolic, diastolic) {
      const u = await userOf(phone);
      await addVital(deps, u.id, { type: 'bp', value: systolic, value2: diastolic, unit: 'mmHg' }, 'ussd');
    },
    async logWeight(phone, kg) {
      const u = await userOf(phone);
      await addVital(deps, u.id, { type: 'weight', value: kg, unit: 'kg' }, 'ussd');
    },
    async logWater(phone, ml) {
      const u = await userOf(phone);
      const r = await addWater(deps, u.id, ml, undefined, 'ussd');
      return { total: r.total, target: r.target };
    },
    async logSteps(phone, count) {
      const u = await userOf(phone);
      const r = await addSteps(deps, u.id, localDate(deps.clock.now(), u.timezone), count, 'ussd');
      return { total: r.total, goal: r.goal };
    },
    async sendInquiry(phone, code, message) {
      const u = await userOf(phone);
      const p = await pharmacyByCode(deps, code);
      if (!p) return false;
      await createInquiry(deps, u.id, { pharmacyId: p.id, subject: 'USSD question', body: message }, 'ussd');
      return true;
    },
    async tips(lang) {
      return (await listPublishedTips(deps.db, lang)).map((tip) => ({ title: tip.title, body: tip.body }));
    },
  };
}

/** Process one USSD step and persist the session (server-side; nothing is stored on the handset). */
export async function processUssd(deps: Deps, sessionId: string, rawPhone: string, input: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { text: 'Invalid phone number.', end: true };
  const [row] = await deps.db.select().from(ussdSessions).where(eq(ussdSessions.sessionId, sessionId));
  const prev = row && !row.ended && row.phone === phone ? (row.state as unknown as UssdSession) : null;
  const now = deps.clock.now();
  const result = await handleUssd(prev, input, { sessionId, phone, now: now.getTime(), timeoutMs: USSD_DEFAULT_TIMEOUT_MS, port: ussdPort(deps) });
  const state = result.session as unknown as Record<string, unknown>;
  await deps.db
    .insert(ussdSessions)
    .values({ sessionId, phone, state, lastActiveAt: now, ended: result.end, createdAt: now })
    .onConflictDoUpdate({ target: ussdSessions.sessionId, set: { phone, state, lastActiveAt: now, ended: result.end } });
  return { text: result.text, end: result.end, screen: result.session.screen };
}
