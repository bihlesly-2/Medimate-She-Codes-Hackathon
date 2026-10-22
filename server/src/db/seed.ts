import { count, sql } from 'drizzle-orm';
import { addDays, CONSENT_VERSION, localDate, trialEndsAt, zonedDateTimeToUtc } from '@medimate/shared';
import type { Deps } from '../types';
import { refCode } from '../lib/crypto';
import {
  careLinks,
  checkups,
  consents,
  healthTips,
  inquiries,
  medicationPlans,
  medicines,
  messages,
  pharmacies,
  pharmacyHours,
  pharmacyStaff,
  pharmacyStock,
  pharmacyVerifications,
  reactionLogs,
  reminderEvents,
  reminderOccurrences,
  reports,
  stepLogs,
  stockEvents,
  subscriptions,
  userRoles,
  users,
  vitalReadings,
  waterLogs,
} from './schema';

/**
 * FICTIONAL DEMO DATA. Every person, pharmacy, price and message below is invented for demonstration.
 * Phone numbers use +237 600 xxx xxx, a range not allocated to Cameroonian mobile operators.
 * Medicine "information" is placeholder text with a fictional source — not clinical content.
 */
export const DEMO_ACCOUNTS = [
  { key: 'ama', phone: '+237600000001', name: 'Ama (demo patient)', roles: ['patient'], note: 'Active trial, reminders, readings, caretaker link' },
  { key: 'ben', phone: '+237600000002', name: 'Ben (demo patient, trial ended)', roles: ['patient'], note: 'Trial expired, premium features locked' },
  { key: 'clara', phone: '+237600000003', name: 'Clara (demo caretaker)', roles: ['patient', 'caretaker'], note: 'Caretaker for Ama (reminders, checkups, activity)' },
  { key: 'dan', phone: '+237600000004', name: 'Dan (demo pharmacist, Molyko)', roles: ['patient', 'pharmacy'], note: 'Staff at Demo Pharmacy Molyko' },
  { key: 'eve', phone: '+237600000005', name: 'Eve (demo admin)', roles: ['patient', 'admin'], note: 'Admin: verification, catalogue, settings, audit' },
  { key: 'femi', phone: '+237600000006', name: 'Femi (demo clinical reviewer)', roles: ['patient', 'reviewer'], note: 'Reviews medicine content and tips' },
  { key: 'gina', phone: '+237600000007', name: 'Gina (demo pharmacist, Great Soppo)', roles: ['patient', 'pharmacy'], note: 'Staff at Demo Pharmacy Great Soppo' },
] as const;

const TABLES = [
  'audit_logs', 'payments', 'sms_logs', 'sms_sessions', 'ussd_sessions', 'reminder_events', 'reminder_occurrences',
  'medication_plans', 'checkups', 'vital_readings', 'step_logs', 'water_logs', 'reaction_logs', 'messages', 'inquiries',
  'reports', 'stock_events', 'pharmacy_stock', 'pharmacy_verifications', 'pharmacy_hours', 'pharmacy_staff', 'pharmacies',
  'medicine_reviews', 'medicines', 'health_tips', 'care_links', 'consents', 'sessions', 'otp_challenges', 'subscriptions',
  'user_roles', 'users', 'app_settings',
];

export async function seedDemo(deps: Pick<Deps, 'db' | 'clock'>, opts: { reset: boolean; onlyIfEmpty?: boolean }) {
  const { db } = deps;
  if (opts.onlyIfEmpty) {
    const [row] = await db.select({ n: count() }).from(users);
    if (Number(row?.n ?? 0) > 0) return { seeded: false, reason: 'database already has users' };
  }
  if (opts.reset) await db.execute(sql.raw(`TRUNCATE ${TABLES.join(', ')} CASCADE`));

  const now = deps.clock.now();
  const tz = 'Africa/Douala';
  const H = 3_600_000;
  const ago = (h: number) => new Date(now.getTime() - h * H);
  const today = localDate(now, tz);

  // ---------------------------------------------------------------- people
  const ids: Record<string, string> = {};
  for (const a of DEMO_ACCOUNTS) {
    const created = a.key === 'ben' ? ago(24 * 40) : ago(24 * 12);
    const [u] = await db
      .insert(users)
      .values({
        phone: a.phone,
        displayName: a.name.split(' (')[0],
        language: 'en',
        area: a.key === 'gina' ? 'Great Soppo' : 'Molyko',
        timezone: tz,
        dateOfBirth: a.key === 'ama' ? '1990-05-14' : null,
        onboardedAt: created,
        isDemo: true,
        createdVia: 'web',
        createdAt: created,
        updatedAt: created,
      })
      .returning();
    ids[a.key] = u!.id;
    for (const role of a.roles) await db.insert(userRoles).values({ userId: u!.id, role });
    await db.insert(subscriptions).values({ userId: u!.id, trialStartedAt: created, trialEndsAt: trialEndsAt(created, 30) });
    for (const purpose of ['health_data', 'sms_messages'] as const) {
      await db.insert(consents).values({ userId: u!.id, purpose, granted: true, version: CONSENT_VERSION, channel: 'web', createdAt: created });
    }
  }
  const ama = ids.ama!;
  const ben = ids.ben!;
  const clara = ids.clara!;
  const dan = ids.dan!;
  const eve = ids.eve!;
  const femi = ids.femi!;
  const gina = ids.gina!;

  // ---------------------------------------------------------------- pharmacies
  const validUntil = addDays(today, 365);
  const pharmacySeed = [
    { code: 'MOL1', name: 'Demo Pharmacy Molyko', area: 'Molyko', address: 'Fictional address near Molyko junction, Buea', lat: 4.1488, lng: 9.2875, status: 'approved', until: validUntil, phone: '+237600000101', staff: dan },
    { code: 'GSO1', name: 'Demo Pharmacy Great Soppo', area: 'Great Soppo', address: 'Fictional address, Great Soppo, Buea', lat: 4.156, lng: 9.249, status: 'approved', until: validUntil, phone: '+237600000102', staff: gina },
    { code: 'M171', name: 'Demo Pharmacy Mile 17', area: 'Mile 17', address: 'Fictional address by the Mile 17 park, Buea', lat: 4.142, lng: 9.299, status: 'approved', until: validUntil, phone: '+237600000103', staff: null },
    { code: 'BON1', name: 'Demo Pharmacy Bonduma (pending review)', area: 'Bonduma', address: 'Fictional address, Bonduma, Buea', lat: 4.162, lng: 9.274, status: 'pending', until: null, phone: '+237600000104', staff: null },
    { code: 'MUE1', name: 'Demo Pharmacy Muea (rejected)', area: 'Muea', address: 'Fictional address, Muea, Buea', lat: 4.18, lng: 9.31, status: 'rejected', until: null, phone: '+237600000105', staff: null },
    { code: 'CHK1', name: 'Demo Pharmacy Check Point (verification expired)', area: 'Check Point', address: 'Fictional address, Check Point, Buea', lat: 4.153, lng: 9.262, status: 'approved', until: addDays(today, -1), phone: '+237600000106', staff: null },
  ] as const;
  const ph: Record<string, string> = {};
  for (const p of pharmacySeed) {
    const [row] = await db
      .insert(pharmacies)
      .values({ code: p.code, name: p.name, phone: p.phone, address: p.address, area: p.area, town: 'Buea', lat: p.lat, lng: p.lng, timezone: tz, verificationStatus: p.status, verifiedUntil: p.until, isDemo: true, createdAt: ago(24 * 60), updatedAt: ago(24 * 2) })
      .returning();
    ph[p.code] = row!.id;
    if (p.staff) await db.insert(pharmacyStaff).values({ userId: p.staff, pharmacyId: row!.id });
    const hours = p.code === 'M171'
      ? [0, 1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, opens: '07:00', closes: '22:00' }))
      : [...[1, 2, 3, 4, 5, 6].map((d) => ({ weekday: d, opens: '08:00', closes: '20:00' })), { weekday: 0, opens: '10:00', closes: '14:00' }];
    await db.insert(pharmacyHours).values(hours.map((h) => ({ ...h, pharmacyId: row!.id })));
    await db.insert(pharmacyVerifications).values({ pharmacyId: row!.id, status: 'submitted', actorId: p.staff, licenceNumber: `DEMO-LIC-${p.code}`, documentReference: 'Demo document reference (fictional)', createdAt: ago(24 * 30) });
    if (p.status !== 'pending') {
      await db.insert(pharmacyVerifications).values({ pharmacyId: row!.id, status: p.status, actorId: eve, notes: 'Demo decision on fictional evidence', validUntil: p.until, createdAt: ago(24 * 29) });
    }
  }

  // ---------------------------------------------------------------- medicines
  const medSeed = [
    { key: 'para500', name: 'Paracetamol', generic: 'Paracetamol', strength: '500 mg', form: 'tablet', verified: true },
    { key: 'paraSyr', name: 'Paracetamol', generic: 'Paracetamol', strength: '120 mg/5 mL', form: 'syrup', verified: false },
    { key: 'amox', name: 'Amoxicillin', generic: 'Amoxicillin', strength: '500 mg', form: 'capsule', verified: false },
    { key: 'ors', name: 'Oral rehydration salts (ORS)', generic: 'Oral rehydration salts', strength: '', form: 'sachet', verified: false },
    { key: 'metf', name: 'Metformin', generic: 'Metformin', strength: '500 mg', form: 'tablet', verified: false, review: true },
    { key: 'ibu', name: 'Ibuprofen', generic: 'Ibuprofen', strength: '400 mg', form: 'tablet', verified: false },
    { key: 'al', name: 'Artemether/Lumefantrine', generic: 'Artemether + Lumefantrine', strength: '20/120 mg', form: 'tablet', verified: false },
  ];
  const PLACEHOLDER = 'DEMO PLACEHOLDER. MEDIMATE has not written clinical content. Replace with the approved text from your national medicines authority or a reviewed formulary.';
  const md: Record<string, string> = {};
  for (const m of medSeed) {
    const content = m.verified || m.review;
    const [row] = await db
      .insert(medicines)
      .values({
        slug: `${m.name}-${m.strength}-${m.form}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name: m.name,
        genericName: m.generic,
        strength: m.strength,
        form: m.form,
        infoStatus: m.verified ? 'verified' : m.review ? 'in_review' : 'none',
        indications: content ? PLACEHOLDER : null,
        usageNotes: content ? PLACEHOLDER : null,
        warnings: content ? PLACEHOLDER : null,
        storage: content ? PLACEHOLDER : null,
        sourceAuthority: content ? 'DEMO SOURCE (fictional, replace before production)' : null,
        sourceUrl: content ? 'https://example.org/demo-formulary' : null,
        sourceVersionDate: content ? '2026-01-01' : null,
        submittedBy: content ? eve : null,
        reviewedBy: m.verified ? femi : null,
        verifiedAt: m.verified ? ago(24 * 20) : null,
        isDemo: true,
        createdAt: ago(24 * 60),
        updatedAt: ago(24 * 20),
      })
      .returning();
    md[m.key] = row!.id;
  }

  // ---------------------------------------------------------------- stock (hours since last report)
  const stockSeed: [string, string, number | null, string, number][] = [
    ['MOL1', 'para500', 500, 'in_stock', 2],
    ['MOL1', 'amox', 1500, 'in_stock', 5],
    ['MOL1', 'ors', 300, 'low', 1],
    ['MOL1', 'metf', 2500, 'in_stock', 3],
    ['MOL1', 'paraSyr', null, 'unknown', 70],
    ['GSO1', 'para500', 450, 'low', 20],
    ['GSO1', 'amox', 1400, 'out', 4],
    ['GSO1', 'ors', 250, 'in_stock', 60],
    ['GSO1', 'ibu', 800, 'in_stock', 6],
    ['GSO1', 'al', 2000, 'in_stock', 10],
    ['M171', 'para500', 550, 'in_stock', 0.5],
    ['M171', 'paraSyr', 1200, 'in_stock', 2],
    ['M171', 'metf', 2300, 'low', 52],
    ['M171', 'al', 2100, 'low', 1],
    ['BON1', 'para500', 100, 'in_stock', 1],
    ['CHK1', 'para500', 200, 'in_stock', 1],
  ];
  for (const [code, key, price, state, hours] of stockSeed) {
    const [s] = await db
      .insert(pharmacyStock)
      .values({ pharmacyId: ph[code]!, medicineId: md[key]!, price: price === null ? null : price.toFixed(2), stockState: state, updatedAt: ago(hours), updatedBy: code === 'MOL1' ? dan : code === 'GSO1' ? gina : null })
      .returning();
    await db.insert(stockEvents).values({ stockId: s!.id, pharmacyId: ph[code]!, medicineId: md[key]!, price: s!.price, stockState: state, source: 'seed', createdAt: ago(hours) });
  }

  // ---------------------------------------------------------------- Ama's plans, reminders and logs
  const [metPlan] = await db
    .insert(medicationPlans)
    .values({
      userId: ama,
      medicineName: 'Metformin 500 mg',
      medicineId: md.metf,
      doseText: '1 tablet with breakfast and 1 with dinner (as written on my prescription)',
      frequencyText: 'Twice a day',
      times: ['08:00', '20:00'],
      startDate: addDays(today, -10),
      refillDate: addDays(today, 5),
      notes: 'Demo plan, fictional prescription',
      timezone: tz,
      smsReminders: true,
      caretakerAlerts: true,
      createdAt: ago(24 * 10),
      updatedAt: ago(24 * 10),
    })
    .returning();
  await db.insert(medicationPlans).values({
    userId: ama,
    medicineName: 'Vitamin D',
    doseText: '1 capsule daily (as advised by my health worker)',
    frequencyText: 'Once a day',
    times: ['13:00'],
    startDate: addDays(today, -3),
    timezone: tz,
    smsReminders: false,
    caretakerAlerts: false,
    createdAt: ago(24 * 3),
    updatedAt: ago(24 * 3),
  });
  // Seven days of answered history for the Metformin plan.
  const pattern = ['taken', 'taken', 'taken', 'skipped', 'taken', 'missed', 'taken', 'taken', 'taken', 'taken', 'taken', 'taken', 'taken', 'taken'];
  let i = 0;
  for (let d = 7; d >= 0; d--) {
    const day = addDays(today, -d);
    for (const time of ['08:00', '20:00']) {
      const at = zonedDateTimeToUtc(day, time, tz);
      // Today: only reminders already well in the past get an answer; later ones are left to the engine.
      if (d === 0 && at.getTime() > now.getTime() - 3 * H) continue;
      const status = d === 0 ? 'taken' : pattern[i++ % pattern.length]!;
      const [o] = await db
        .insert(reminderOccurrences)
        .values({
          userId: ama,
          kind: 'medication',
          planId: metPlan!.id,
          refCode: refCode(),
          dedupeKey: `med:${metPlan!.id}:${at.toISOString()}`,
          scheduledFor: at,
          status,
          sentAt: at,
          confirmedAt: status === 'missed' ? null : new Date(at.getTime() + 20 * 60_000),
          confirmedChannel: status === 'missed' ? null : i % 3 === 0 ? 'sms' : 'web',
          deliveryStatus: 'simulated',
          attempts: 1,
          createdAt: at,
        })
        .returning();
      await db.insert(reminderEvents).values({ occurrenceId: o!.id, userId: ama, action: status, channel: status === 'missed' ? null : 'web', createdAt: at });
    }
  }
  const bp = [
    [124, 82],
    [128, 84],
    [121, 79],
    [126, 81],
    [130, 85],
    [122, 80],
  ];
  for (let d = 0; d < bp.length; d++) {
    const at = ago(24 * (bp.length - d) + 3);
    await db.insert(vitalReadings).values({ userId: ama, type: 'bp', value: String(bp[d]![0]), value2: String(bp[d]![1]), unit: 'mmHg', enteredValue: String(bp[d]![0]), enteredUnit: 'mmHg', measuredAt: at, source: d % 2 ? 'sms' : 'web', createdAt: at });
  }
  await db.insert(vitalReadings).values([
    { userId: ama, type: 'weight', value: '68.5', unit: 'kg', enteredValue: '68.5', enteredUnit: 'kg', measuredAt: ago(30), source: 'web' },
    { userId: ama, type: 'height', value: '165', unit: 'cm', enteredValue: '165', enteredUnit: 'cm', measuredAt: ago(24 * 10), source: 'web' },
    { userId: ama, type: 'glucose', value: '5.80', unit: 'mmol/L', enteredValue: '5.8', enteredUnit: 'mmol/L', measuredAt: ago(26), source: 'web' },
  ]);
  const steps = [4200, 6100, 5300, 7200, 6400, 3900, 6800, 6050, 5100];
  for (let d = 0; d < steps.length; d++) {
    await db.insert(stepLogs).values({ userId: ama, localDate: addDays(today, -(steps.length - d)), steps: steps[d]!, source: d % 3 ? 'web' : 'sms' });
  }
  for (let d = 1; d <= 6; d++) {
    for (let k = 0; k < (d % 2 ? 7 : 9); k++) {
      const at = new Date(zonedDateTimeToUtc(addDays(today, -d), '08:00', tz).getTime() + k * 90 * 60_000);
      await db.insert(waterLogs).values({ userId: ama, amountMl: 250, loggedAt: at, localDate: addDays(today, -d), source: 'web' });
    }
  }
  const [ck] = await db
    .insert(checkups)
    .values({ userId: ama, title: 'Blood pressure check (demo)', dueAt: zonedDateTimeToUtc(addDays(today, 3), '10:00', tz), location: 'Fictional health centre, Molyko', remindDayBefore: true, createdBy: ama })
    .returning();
  void ck;
  await db.insert(reactionLogs).values({ userId: ama, description: 'Felt a little sick in the stomach after the evening dose (demo entry).', symptoms: ['nausea'], severity: 'mild', occurredAt: ago(24 * 4), medicineName: 'Metformin 500 mg', showToClinician: true });

  // Caretaker link: Clara sees reminders, checkups and activity — not readings or reactions.
  await db.insert(careLinks).values({ patientId: ama, caretakerId: clara, invitedPhone: '+237600000003', status: 'active', categories: ['reminders', 'checkups', 'activity'], alertDetail: false, createdAt: ago(24 * 9), respondedAt: ago(24 * 9) });
  await db.insert(consents).values({ userId: ama, purpose: 'caretaker_sharing', granted: true, version: CONSENT_VERSION, channel: 'web', scope: { categories: ['reminders', 'checkups', 'activity'] }, createdAt: ago(24 * 9) });

  // Inquiry thread
  const [inq] = await db.insert(inquiries).values({ patientId: ama, pharmacyId: ph.MOL1!, subject: 'ORS sachets for my child', status: 'answered', createdAt: ago(28), updatedAt: ago(26) }).returning();
  await db.insert(messages).values([
    { inquiryId: inq!.id, senderId: ama, senderRole: 'patient', body: 'Hello, do you have ORS sachets today? (demo message)', createdAt: ago(28) },
    { inquiryId: inq!.id, senderId: dan, senderRole: 'pharmacy', body: 'Yes, we have a few left. We open until 20:00. (demo reply)', createdAt: ago(26) },
  ]);
  await db.insert(inquiries).values({ patientId: ben, pharmacyId: ph.MOL1!, subject: 'Do you sell blood pressure monitors?', status: 'open', createdAt: ago(3), updatedAt: ago(3) }).returning().then(async ([b]) => {
    await db.insert(messages).values({ inquiryId: b!.id, senderId: ben, senderRole: 'patient', body: 'Do you sell home blood pressure monitors? (demo message)', createdAt: ago(3) });
  });

  // Ben: trial ended yesterday (premium features locked, free features still work).
  await db.update(subscriptions).set({ trialEndsAt: ago(24) }).where(sql`${subscriptions.userId} = ${ben}`);

  // ---------------------------------------------------------------- tips & reports
  const tipSeed = [
    { title: 'Keep an up-to-date medicine list', body: 'Write down every medicine you take, with the dose written on your prescription, and show the list to your pharmacist or health worker at each visit.', topic: 'medicines', status: 'published' },
    { title: 'Ask how to store your medicine', body: 'Some medicines need to be kept cool, dry or away from sunlight. Ask your pharmacist how to store each one.', topic: 'medicines', status: 'published' },
    { title: 'Bring your questions to checkups', body: 'Note any questions or changes you noticed since your last visit so you remember to ask them.', topic: 'checkups', status: 'published' },
    { title: 'Drinking water through the day', body: 'Hydration needs vary from person to person. If you have a health condition, ask a health worker what amount is right for you.', topic: 'water', status: 'in_review' },
  ];
  for (const t of tipSeed) {
    await db.insert(healthTips).values({
      ...t,
      language: 'en',
      source: 'DEMO content, pending review by a qualified professional',
      authorId: eve,
      reviewerId: t.status === 'published' ? femi : null,
      reviewedAt: t.status === 'published' ? ago(24 * 15) : null,
      isDemo: true,
    });
  }
  await db.insert(reports).values({ reporterId: ama, pharmacyId: ph.GSO1!, reason: 'wrong_price', details: 'Price on the shelf was different from MEDIMATE (demo report).', createdAt: ago(10), updatedAt: ago(10) });

  return { seeded: true, reason: 'ok', accounts: DEMO_ACCOUNTS.length };
}
