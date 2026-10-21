import { eq } from 'drizzle-orm';
import {
  isMessageLang,
  localDate,
  msg,
  normalizePhone,
  paginateSms,
  parseSms,
  STOCK_STATE_LABELS,
  type MessageKey,
  type MessageLang,
  type SmsCommand,
} from '@medimate/shared';
import { smsSessions, users } from '../db/schema';
import type { Deps } from '../types';
import { createInquiry } from './inquiries';
import { logInboundSms, sendSms } from './messaging';
import { medicineLabel, pharmacyByCode, resolveMedicines, searchOffers } from './pharmacy';
import { confirmOccurrence, openOccurrences } from './reminders';
import { getSettings } from './settings';
import { addSteps, addVital, addWater } from './tracking';
import { findOrCreateUser, findUserByPhone, hasConsent, setConsent, userHasFeature, type UserRow } from './users';
import { medicines } from '../db/schema';

interface Pending {
  pages?: string[];
  confirm?: 'join' | 'start';
  choice?: { kind: 'FIND' | 'PRICE' | 'INFO'; options: { id: string; label: string }[]; area: string | null };
}

interface Ctx {
  deps: Deps;
  phone: string;
  user: UserRow | null;
  lang: MessageLang;
  pending: Pending;
}

const t = (c: Ctx, key: MessageKey, vars?: Record<string, string | number>) => msg(c.lang, key, vars);

/**
 * Handle one inbound SMS (from the provider webhook or the browser simulator) and send the reply.
 * Replies to a person's own command are always sent; routine messages respect STOP elsewhere.
 */
export async function handleInboundSms(deps: Deps, rawPhone: string, text: string, provider: string): Promise<{ replies: string[] }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { replies: [] };
  const user = await findUserByPhone(deps.db, phone);
  const [session] = await deps.db.select().from(smsSessions).where(eq(smsSessions.phone, phone));
  const lang: MessageLang = isMessageLang(session?.language ?? '') ? (session!.language as MessageLang) : isMessageLang(user?.language ?? '') ? (user!.language as MessageLang) : 'en';
  const ctx: Ctx = { deps, phone, user, lang, pending: (session?.pending as Pending) ?? {} };

  const parsed = parseSms(text);
  await logInboundSms(deps, { from: phone, body: text, userId: user?.id ?? null, command: parsed.ok ? parsed.command.kind : 'UNKNOWN', provider });

  let body: string | null;
  if (!parsed.ok) {
    body = parsed.error === 'EMPTY' ? t(ctx, 'help') : t(ctx, 'unknown', { hint: parsed.hint });
  } else if (parsed.command.kind === 'MORE') {
    const next = ctx.pending.pages?.shift();
    const replies = next ? [next] : paginateSms(t(ctx, 'more_none'));
    await persist(ctx);
    for (const r of replies) await sendSms(deps, { to: phone, body: r, kind: 'reply', userId: user?.id, command: 'MORE' });
    return { replies };
  } else {
    const cmd = parsed.command;
    if (cmd.kind !== 'CHOOSE') delete ctx.pending.choice;
    if (cmd.kind !== 'YES' && cmd.kind !== 'NO') delete ctx.pending.confirm;
    body = await dispatch(ctx, cmd);
  }

  const pages = paginateSms(body ?? t(ctx, 'help'), ctx.lang === 'fr' ? 'Envoyez MORE' : 'Reply MORE');
  ctx.pending.pages = pages.slice(1);
  await persist(ctx);
  await sendSms(deps, { to: phone, body: pages[0]!, kind: 'reply', userId: ctx.user?.id, command: parsed.ok ? parsed.command.kind : 'UNKNOWN' });
  return { replies: [pages[0]!] };
}

async function persist(c: Ctx) {
  await c.deps.db
    .insert(smsSessions)
    .values({ phone: c.phone, language: c.lang, pending: c.pending as Record<string, unknown>, updatedAt: c.deps.clock.now() })
    .onConflictDoUpdate({ target: smsSessions.phone, set: { language: c.lang, pending: c.pending as Record<string, unknown>, updatedAt: c.deps.clock.now() } });
}

async function dispatch(c: Ctx, cmd: SmsCommand): Promise<string> {
  const { deps } = c;
  switch (cmd.kind) {
    case 'HELP':
      return t(c, 'help');

    case 'JOIN':
      if (c.user) return t(c, 'join_already');
      c.pending.confirm = 'join';
      return t(c, 'join_prompt', { privacyUrl: 'medimate/privacy' });

    case 'YES':
    case 'NO': {
      const confirm = c.pending.confirm;
      delete c.pending.confirm;
      if (confirm === 'join') {
        if (cmd.kind === 'NO') return t(c, 'join_cancelled');
        const { user } = await findOrCreateUser(deps, c.phone, 'sms', { language: c.lang });
        c.user = user;
        await setConsent(deps, user.id, 'health_data', true, 'sms');
        await setConsent(deps, user.id, 'sms_messages', true, 'sms');
        return t(c, 'join_done', { days: (await getSettings(deps.db)).trialDays });
      }
      if (confirm === 'start' && c.user) {
        if (cmd.kind === 'NO') return t(c, 'start_kept_off');
        await setConsent(deps, c.user.id, 'sms_messages', true, 'sms');
        return t(c, 'start_done');
      }
      return t(c, 'nothing_pending');
    }

    case 'STOP':
      // Consent withdrawal is recorded; routine reminders and alerts stop immediately.
      if (c.user) await setConsent(deps, c.user.id, 'sms_messages', false, 'sms');
      return t(c, 'stop_done');

    case 'START':
      if (!c.user) return t(c, 'need_join');
      // START never silently re-enables messages: an explicit YES is required (re-consent).
      c.pending.confirm = 'start';
      return t(c, 'start_prompt');

    case 'LANG': {
      if (!isMessageLang(cmd.code)) return t(c, 'lang_unsupported', { available: 'EN, FR (draft)' });
      c.lang = cmd.code;
      if (c.user) await deps.db.update(users).set({ language: cmd.code, updatedAt: deps.clock.now() }).where(eq(users.id, c.user.id));
      return t(c, 'lang_set', { lang: cmd.code === 'en' ? 'English' : 'Francais' });
    }

    case 'NAME':
      if (!c.user) return t(c, 'need_join');
      await deps.db.update(users).set({ displayName: cmd.name, updatedAt: deps.clock.now() }).where(eq(users.id, c.user.id));
      return t(c, 'name_set', { name: cmd.name });

    case 'CHOOSE': {
      const choice = c.pending.choice;
      if (!choice) return t(c, 'nothing_pending');
      const opt = choice.options[cmd.index - 1];
      if (!opt) return t(c, 'choose_invalid');
      delete c.pending.choice;
      return choice.kind === 'INFO' ? infoFor(c, opt.id) : offersFor(c, choice.kind, opt.id, opt.label, choice.area);
    }

    case 'FIND':
    case 'PRICE':
    case 'INFO': {
      const meds = await resolveMedicines(deps.db, cmd.medicine, 6);
      if (!meds.length) return t(c, 'med_unknown', { query: cmd.medicine });
      const area = cmd.kind === 'INFO' ? null : cmd.area;
      if (meds.length > 1) {
        const options = meds.map((m) => ({ id: m.id, label: medicineLabel(m) }));
        c.pending.choice = { kind: cmd.kind, options, area };
        return t(c, 'med_ambiguous', { options: options.map((o, i) => `${i + 1} ${o.label}`).join(', ') });
      }
      const m = meds[0]!;
      return cmd.kind === 'INFO' ? infoFor(c, m.id) : offersFor(c, cmd.kind, m.id, medicineLabel(m), area);
    }

    case 'CONTACT': {
      if (!c.user) return t(c, 'need_join');
      const p = await pharmacyByCode(deps, cmd.code);
      if (!p) return t(c, 'contact_unknown', { code: cmd.code });
      if (!cmd.message) return t(c, 'contact_need_message', { code: cmd.code });
      await createInquiry(deps, c.user.id, { pharmacyId: p.id, subject: 'SMS question', body: cmd.message }, 'sms');
      return t(c, 'contact_sent', { pharmacy: p.name, phone: p.phone });
    }

    case 'TAKEN':
    case 'SKIP': {
      if (!c.user) return t(c, 'need_join');
      if (!(await userHasFeature(deps, c.user.id, 'reminders'))) return t(c, 'premium_required');
      const open = await openOccurrences(deps, c.user.id);
      let target = open[0];
      if (cmd.ref) {
        target = open.find((o) => o.refCode === cmd.ref);
        if (!target) return t(c, 'reminder_unknown_ref', { ref: cmd.ref });
      } else if (open.length === 0) {
        return t(c, 'reminder_none');
      } else if (open.length > 1) {
        const tz = c.user.timezone;
        const list = open.map((o) => `${o.refCode} ${new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(o.scheduledFor)}`).join(', ');
        return t(c, 'reminder_ambiguous', { count: open.length, list, example: open[0]!.refCode });
      }
      const r = await confirmOccurrence(deps, c.user.id, target!.id, cmd.kind === 'TAKEN' ? 'taken' : 'skipped', 'sms');
      if (r.result === 'already') return t(c, 'reminder_already', { ref: r.ref, status: r.status });
      return t(c, cmd.kind === 'TAKEN' ? 'reminder_taken' : 'reminder_skipped', { ref: r.ref });
    }

    case 'BP':
    case 'SUGAR':
    case 'WEIGHT':
    case 'WATER':
    case 'STEPS': {
      if (!c.user) return t(c, 'need_join');
      if (!(await hasConsent(deps.db, c.user.id, 'health_data'))) return t(c, 'need_health_consent');
      const feature = cmd.kind === 'WATER' ? 'water' : cmd.kind === 'STEPS' ? 'steps' : 'vitals';
      if (!(await userHasFeature(deps, c.user.id, feature))) return t(c, 'premium_required');
      const note = t(c, 'vital_saved_note');
      if (cmd.kind === 'BP') {
        await addVital(deps, c.user.id, { type: 'bp', value: cmd.systolic, value2: cmd.diastolic, unit: 'mmHg' }, 'sms');
        return `${t(c, 'bp_saved', { systolic: cmd.systolic, diastolic: cmd.diastolic })} ${note}`;
      }
      if (cmd.kind === 'SUGAR') {
        await addVital(deps, c.user.id, { type: 'glucose', value: cmd.entered, unit: cmd.unit }, 'sms');
        return `${t(c, 'sugar_saved', { value: cmd.entered, unit: cmd.unit })} ${note}`;
      }
      if (cmd.kind === 'WEIGHT') {
        await addVital(deps, c.user.id, { type: 'weight', value: cmd.entered, unit: cmd.unit }, 'sms');
        return `${t(c, 'weight_saved', { kg: cmd.kg })} ${note}`;
      }
      if (cmd.kind === 'WATER') {
        const r = await addWater(deps, c.user.id, cmd.ml, undefined, 'sms');
        return t(c, 'water_saved', { ml: cmd.ml, total: r.total, target: r.target });
      }
      const r = await addSteps(deps, c.user.id, localDate(deps.clock.now(), c.user.timezone), cmd.count, 'sms');
      return t(c, 'steps_saved', { count: cmd.count, total: r.total, goal: r.goal });
    }

    default:
      return t(c, 'help');
  }
}

async function offersFor(c: Ctx, kind: 'FIND' | 'PRICE', medicineId: string, label: string, area: string | null): Promise<string> {
  const res = await searchOffers(
    c.deps,
    { area: area ?? undefined, sort: kind === 'PRICE' ? 'price' : 'freshness', limit: 5, offset: 0 },
    { medicineIds: [medicineId] },
  );
  if (!res.items.length) return t(c, 'find_none', { medicine: label, area: area ? ` in ${area}` : '' });
  const lines = res.items.map((o, i) => {
    const price = o.price !== null ? ` ${o.price} ${o.currency}` : '';
    const lowest = kind === 'PRICE' && o.lowest ? ' (lowest listed)' : '';
    return `${i + 1}) ${o.pharmacy.name} [${o.pharmacy.code}] ${STOCK_STATE_LABELS[o.stockState]}${price}${lowest}, ${o.ageLabel}`;
  });
  const header = t(c, kind === 'PRICE' ? 'price_header' : 'find_header', { medicine: label });
  return `${header} ${lines.join('; ')}. CONTACT <code> to ask.`;
}

async function infoFor(c: Ctx, medicineId: string): Promise<string> {
  const [m] = await c.deps.db.select().from(medicines).where(eq(medicines.id, medicineId));
  if (!m) return t(c, 'med_unknown', { query: '' });
  if (m.infoStatus !== 'verified') return t(c, 'info_none', { medicine: medicineLabel(m) });
  const text = (m.usageNotes || m.indications || '').replace(/\s+/g, ' ').trim();
  const excerpt = text.length > 110 ? `${text.slice(0, 107)}...` : text;
  return t(c, 'info', {
    medicine: medicineLabel(m),
    excerpt,
    source: m.sourceAuthority ?? 'source on file',
    date: m.verifiedAt ? m.verifiedAt.toISOString().slice(0, 10) : '',
  });
}
