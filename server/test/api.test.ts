import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq, sql } from 'drizzle-orm';
import { auditLogs, reminderEvents, reminderOccurrences, users } from '../src/db/schema';
import { runReminderTick } from '../src/services/reminders';
import { PHONES, login, setup } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
}, 60_000);
afterAll(async () => {
  await ctx.database.close();
});

describe('health & public discovery', () => {
  it('reports readiness without secrets', async () => {
    const r = await request(ctx.app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', database: 'ok' });
    expect(JSON.stringify(r.body)).not.toMatch(/secret|password/i);
  });

  it('never returns pending, rejected or expired pharmacies', async () => {
    const r = await request(ctx.app).get('/api/pharmacies/search?q=paracetamol&includeStale=true');
    const codes = r.body.items.map((i: { pharmacy: { code: string } }) => i.pharmacy.code);
    expect(codes).not.toContain('BON1');
    expect(codes).not.toContain('MUE1');
    expect(codes).not.toContain('CHK1');
    const list = await request(ctx.app).get('/api/pharmacies');
    expect(list.body.items.map((p: { code: string }) => p.code).sort()).toEqual(['GSO1', 'M171', 'MOL1']);
  });

  it('hides stale (>48 h) reports by default and flags them when included', async () => {
    const fresh = await request(ctx.app).get('/api/pharmacies/search?q=ors');
    expect(fresh.body.items.every((i: { stale: boolean }) => !i.stale)).toBe(true);
    expect(fresh.body.staleHidden).toBe(1);
    const all = await request(ctx.app).get('/api/pharmacies/search?q=ors&includeStale=true');
    const gso = all.body.items.find((i: { pharmacy: { code: string } }) => i.pharmacy.code === 'GSO1');
    expect(gso.stale).toBe(true);
  });

  it('marks the lowest price only among comparable, fresh, available offers', async () => {
    const r = await request(ctx.app).get('/api/pharmacies/search?q=paracetamol 500&sort=price');
    const lowest = r.body.items.filter((i: { lowest: boolean }) => i.lowest);
    expect(lowest).toHaveLength(1);
    expect(lowest[0].pharmacy.code).toBe('GSO1');
    expect(r.body.items[0].price).toBe(450);
  });

  it('shows medicine content only when verified, with source and reviewer', async () => {
    const meds = await request(ctx.app).get('/api/medicines?q=paracetamol');
    const tab = meds.body.items.find((m: { form: string }) => m.form === 'tablet');
    const syr = meds.body.items.find((m: { form: string }) => m.form === 'syrup');
    const a = await request(ctx.app).get(`/api/medicines/${tab.id}`);
    expect(a.body.information.source.authority).toMatch(/DEMO SOURCE/);
    expect(a.body.information.reviewedBy).toBeTruthy();
    const b = await request(ctx.app).get(`/api/medicines/${syr.id}`);
    expect(b.body.information).toBeNull();
    expect(b.body.safetyNotice).toMatch(/Do not take medicine/);
  });
});

describe('authentication', () => {
  it('gives the same response for any valid number (no account enumeration)', async () => {
    const known = await request(ctx.app).post('/api/auth/otp/request').send({ phone: PHONES.ama });
    const unknown = await request(ctx.app).post('/api/auth/otp/request').send({ phone: '600000777' });
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('rejects wrong codes, limits attempts and makes codes single-use', async () => {
    const agent = request.agent(ctx.app);
    const r = await agent.post('/api/auth/otp/request').send({ phone: '600000555' });
    const wrong = r.body.devCode === '000000' ? '111111' : '000000';
    expect((await agent.post('/api/auth/otp/verify').send({ phone: '600000555', code: wrong })).status).toBe(400);
    const ok = await agent.post('/api/auth/otp/verify').send({ phone: '600000555', code: r.body.devCode });
    expect(ok.status).toBe(200);
    expect(ok.body.created).toBe(true);
    const again = await request(ctx.app).post('/api/auth/otp/verify').send({ phone: '600000555', code: r.body.devCode });
    expect(again.status).toBe(400);

    const r2 = await request(ctx.app).post('/api/auth/otp/request').send({ phone: '600000556' });
    for (let i = 0; i < 5; i++) await request(ctx.app).post('/api/auth/otp/verify').send({ phone: '600000556', code: wrong === r2.body.devCode ? '222222' : wrong });
    const blocked = await request(ctx.app).post('/api/auth/otp/verify').send({ phone: '600000556', code: r2.body.devCode });
    expect(blocked.status).toBe(400);
  });

  it('requires sign-in for personal data', async () => {
    expect((await request(ctx.app).get('/api/plans')).status).toBe(401);
  });

  it('blocks cross-site state-changing requests', async () => {
    const r = await request(ctx.app).post('/api/auth/otp/request').set('Origin', 'https://evil.example').send({ phone: PHONES.ama });
    expect(r.status).toBe(403);
  });
});

describe('authorization: ownership, roles and tenants', () => {
  it('does not let one patient read or change another patient’s records', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const ben = await login(ctx.app, PHONES.ben);
    const plans = await ama.get('/api/plans');
    const planId = plans.body.items[0].id;
    const rem = await ama.get('/api/reminders?range=history');
    const occId = rem.body.items[0].id;
    // Ben's trial ended, so give him premium for this check to isolate ownership from entitlements.
    await ctx.deps.db.execute(sql`update subscriptions set premium_until = now() + interval '30 days' where user_id = (select id from users where phone = '+237600000002')`);
    expect((await ben.get(`/api/plans/${planId}`)).status).toBe(404);
    expect((await ben.patch(`/api/plans/${planId}`).send({ doseText: 'hacked' })).status).toBe(404);
    expect((await ben.post(`/api/reminders/${occId}/confirm`).send({ action: 'taken' })).status).toBe(404);
    const inq = await ama.get('/api/inquiries');
    expect((await ben.get(`/api/inquiries/${inq.body.items[0].id}`)).status).toBe(404);
    await ctx.deps.db.execute(sql`update subscriptions set premium_until = null where user_id = (select id from users where phone = '+237600000002')`);
  });

  it('denies admin routes to patients and reviewer-only users the admin-only routes', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    expect((await ama.get('/api/admin/overview')).status).toBe(403);
    const femi = await login(ctx.app, PHONES.femi);
    expect((await femi.get('/api/admin/overview')).status).toBe(200);
    expect((await femi.get('/api/admin/users')).status).toBe(403);
  });

  it('isolates pharmacy tenants', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const gina = await login(ctx.app, PHONES.gina);
    const dan = await login(ctx.app, PHONES.dan);
    const inq = await ama.get('/api/inquiries'); // Ama's thread is with Molyko (Dan)
    const threadId = inq.body.items[0].id;
    expect((await dan.get(`/api/inquiries/${threadId}`)).status).toBe(200);
    expect((await gina.get(`/api/inquiries/${threadId}`)).status).toBe(404);
    const ginaStock = await gina.get('/api/pharmacy/stock');
    const danStock = await dan.get('/api/pharmacy/stock');
    const danIds = new Set(danStock.body.items.map((s: { id: string }) => s.id));
    expect(ginaStock.body.items.some((s: { id: string }) => danIds.has(s.id))).toBe(false);
    expect((await gina.delete(`/api/pharmacy/stock/${danStock.body.items[0].id}`)).status).toBe(404);
    // A patient without the pharmacy role cannot reach the portal.
    expect((await ama.get('/api/pharmacy/stock')).status).toBe(403);
  });

  it('shows a pharmacy the patient’s first name and masked phone, never health records', async () => {
    const dan = await login(ctx.app, PHONES.dan);
    const inbox = await dan.get('/api/pharmacy/inbox?status=answered');
    const t = await dan.get(`/api/inquiries/${inbox.body.items[0].id}`);
    expect(t.body.patient.phone).toMatch(/•/);
    expect(JSON.stringify(t.body)).not.toMatch(/Metformin|mmHg|dateOfBirth/);
  });
});

describe('trial and entitlements (server-side)', () => {
  it('locks premium APIs after the trial but keeps free features', async () => {
    const ben = await login(ctx.app, PHONES.ben);
    const plans = await ben.get('/api/plans');
    expect(plans.status).toBe(402);
    expect(plans.body.error.code).toBe('PREMIUM_REQUIRED');
    expect((await ben.get('/api/vitals')).status).toBe(402);
    expect((await ben.get('/api/pharmacies/search?q=amoxicillin')).status).toBe(200);
    const pharm = (await ben.get('/api/pharmacies')).body.items[0];
    expect((await ben.post('/api/inquiries').send({ pharmacyId: pharm.id, subject: 'Question', body: 'Do you have ORS?' })).status).toBe(201);
    const sub = await ben.get('/api/me/subscription');
    expect(sub.body.tier).toBe('free');
  });

  it('unlocks premium after a (demo) payment, exactly once', async () => {
    const ben = await login(ctx.app, PHONES.ben);
    const p = await ben.post('/api/me/checkout').send({});
    expect(p.body.provider).toBe('demo');
    await ben.post(`/api/me/payments/${p.body.id}/demo-confirm`);
    await ben.post(`/api/me/payments/${p.body.id}/demo-confirm`);
    const sub = await ben.get('/api/me/subscription');
    expect(sub.body.tier).toBe('premium');
    expect(sub.body.daysLeft).toBe(30);
    expect((await ben.get('/api/plans')).status).toBe(200);
    await ctx.deps.db.execute(sql`update subscriptions set premium_until = null where user_id = (select id from users where phone = '+237600000002')`);
  });
});

describe('caretaker consent', () => {
  it('limits a caretaker to shared categories and revocation takes effect immediately', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const clara = await login(ctx.app, PHONES.clara);
    const patients = await clara.get('/api/caretaker/patients');
    const amaId = patients.body.items[0].patientId;
    const ov = await clara.get(`/api/caretaker/patients/${amaId}`);
    expect(ov.status).toBe(200);
    expect(ov.body.reminders).toBeDefined();
    expect(ov.body.vitals).toBeUndefined();
    expect(ov.body.reactions).toBeUndefined();
    expect(JSON.stringify(ov.body.reminders.today)).not.toMatch(/Metformin/); // detail not allowed

    const links = await ama.get('/api/care/links');
    await ama.post(`/api/care/links/${links.body.items[0].id}/revoke`);
    const after = await clara.get(`/api/caretaker/patients/${amaId}`);
    expect(after.status).toBe(403);
  });
});

describe('reminders: exactly-once confirmation and escalation', () => {
  it('records TAKEN once even when sent twice at the same time', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const plans = await ama.get('/api/plans');
    const t = await ama.post(`/api/plans/${plans.body.items[0].id}/test-reminder`);
    const [a, b] = await Promise.all([
      ama.post(`/api/reminders/${t.body.id}/confirm`).send({ action: 'taken' }),
      ama.post(`/api/reminders/${t.body.id}/confirm`).send({ action: 'taken' }),
    ]);
    expect([a.body.result, b.body.result].sort()).toEqual(['already', 'recorded']);
    const events = await ctx.deps.db
      .select()
      .from(reminderEvents)
      .where(and(eq(reminderEvents.occurrenceId, t.body.id), eq(reminderEvents.action, 'taken')));
    expect(events).toHaveLength(1);
  });

  it('follows up, then alerts only a consenting caretaker who shares reminders', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const clara = await login(ctx.app, PHONES.clara);
    // Re-link Clara with reminder sharing (the earlier test revoked access).
    const invite = await ama.post('/api/care/links').send({ phone: PHONES.clara, categories: ['reminders'] });
    expect(invite.status).toBe(201);
    const inv = await clara.get('/api/caretaker/invites');
    await clara.post(`/api/caretaker/invites/${inv.body.items[0].id}/accept`);

    const plans = await ama.get('/api/plans');
    const metformin = plans.body.items.find((p: { caretakerAlerts: boolean }) => p.caretakerAlerts);
    const t = await ama.post(`/api/plans/${metformin.id}/test-reminder`);
    ctx.clock.advance(31 * 60_000);
    let report = await runReminderTick(ctx.deps);
    expect(report.followups).toBeGreaterThanOrEqual(1);
    ctx.clock.advance(30 * 60_000);
    report = await runReminderTick(ctx.deps);
    const [esc] = await ctx.deps.db.select().from(reminderEvents).where(and(eq(reminderEvents.occurrenceId, t.body.id), eq(reminderEvents.action, 'escalated')));
    expect(esc).toBeDefined();
    expect((esc!.detail as { smsSent: number }).smsSent).toBe(1);
    // A second tick must not alert again.
    await runReminderTick(ctx.deps);
    const all = await ctx.deps.db.select().from(reminderEvents).where(and(eq(reminderEvents.occurrenceId, t.body.id), eq(reminderEvents.action, 'escalated')));
    expect(all).toHaveLength(1);
    ctx.clock.advance(3 * 3600_000);
    await runReminderTick(ctx.deps);
    const [occ] = await ctx.deps.db.select().from(reminderOccurrences).where(eq(reminderOccurrences.id, t.body.id));
    expect(occ!.status).toBe('missed');
  });

  it('does not escalate when the plan has caretaker alerts off', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const plans = await ama.get('/api/plans');
    const vitD = plans.body.items.find((p: { caretakerAlerts: boolean }) => !p.caretakerAlerts);
    const t = await ama.post(`/api/plans/${vitD.id}/test-reminder`);
    ctx.clock.advance(65 * 60_000);
    await runReminderTick(ctx.deps);
    const esc = await ctx.deps.db.select().from(reminderEvents).where(and(eq(reminderEvents.occurrenceId, t.body.id), eq(reminderEvents.action, 'escalated')));
    expect(esc).toHaveLength(0);
  });

  it('never stores or changes a dose: the dose text is kept exactly as entered', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    const dose = '½ tablet morning, 1 tablet night — as written by Dr. Demo';
    const r = await ama.post('/api/plans').send({ medicineName: 'Demo medicine', doseText: dose, frequencyText: 'Twice daily', times: ['07:00', '19:00'], startDate: '2026-10-21' });
    expect(r.status).toBe(201);
    expect(r.body.doseText).toBe(dose);
  });
});

describe('SMS consent (STOP / START)', () => {
  it('STOP withdraws SMS consent so routine reminders go to the app only; START needs YES', async () => {
    const ama = await login(ctx.app, PHONES.ama);
    await request(ctx.app).post('/api/sim/sms').send({ phone: PHONES.ama, text: 'STOP' });
    const plans = await ama.get('/api/plans');
    const t = await ama.post(`/api/plans/${plans.body.items.find((p: { smsReminders: boolean }) => p.smsReminders).id}/test-reminder`);
    expect(t.body.deliveryStatus).toBe('web_only');
    const start = await request(ctx.app).post('/api/sim/sms').send({ phone: PHONES.ama, text: 'START' });
    expect(start.body.replies[0]).toMatch(/reply YES/);
    const me1 = await ama.get('/api/me/consents');
    expect(me1.body.sms_messages.granted).toBe(false);
    await request(ctx.app).post('/api/sim/sms').send({ phone: PHONES.ama, text: 'YES' });
    const me2 = await ama.get('/api/me/consents');
    expect(me2.body.sms_messages.granted).toBe(true);
  });

  it('registers a new person by SMS with explicit consent and the same account works on the web', async () => {
    const phone = '600000321';
    await request(ctx.app).post('/api/sim/sms').send({ phone, text: 'JOIN' });
    const yes = await request(ctx.app).post('/api/sim/sms').send({ phone, text: 'YES' });
    expect(yes.body.replies[0]).toMatch(/registered/);
    await request(ctx.app).post('/api/sim/sms').send({ phone, text: 'WATER 2 GLASSES' });
    const web = await login(ctx.app, phone);
    const water = await web.get('/api/water');
    expect(water.body.todayTotal).toBe(500);
  });
});

describe('pharmacy portal CSV import', () => {
  it('previews, refuses to commit while rows have issues, then imports', async () => {
    const dan = await login(ctx.app, PHONES.dan);
    const bad = 'medicine,strength,form,price_xaf,stock_state,quantity\nParacetamol,500 mg,tablet,abc,in stock,\nUnknownium,1 mg,tablet,100,low,';
    const preview = await dan.post('/api/pharmacy/stock/import').send({ csv: bad, commit: false });
    expect(preview.body.issues.map((i: { line: number }) => i.line)).toEqual([2, 3]);
    const refused = await dan.post('/api/pharmacy/stock/import').send({ csv: bad, commit: true });
    expect(refused.status).toBe(400);
    const good = 'medicine,strength,form,price_xaf,stock_state,quantity\nParacetamol,500 mg,tablet,520,in stock,90\nIbuprofen,400 mg,tablet,700,low,';
    const ok = await dan.post('/api/pharmacy/stock/import').send({ csv: good, commit: true });
    expect(ok.body.committed).toBe(true);
    expect(ok.body.valid).toHaveLength(2);
  });
});

describe('content review rules', () => {
  it('requires a different reviewer and a source before a medicine is verified', async () => {
    const eve = await login(ctx.app, PHONES.eve);
    const femi = await login(ctx.app, PHONES.femi);
    const created = await eve.post('/api/admin/medicines').send({ name: 'Democillin', genericName: 'Democillin', strength: '250 mg', form: 'tablet', usageNotes: 'Placeholder from source X' });
    expect(created.body.infoStatus).toBe('in_review');
    expect((await eve.post(`/api/admin/medicines/${created.body.id}/review`).send({ decision: 'approve', notes: 'self approve' })).status).toBe(403);
    expect((await femi.post(`/api/admin/medicines/${created.body.id}/review`).send({ decision: 'approve', notes: 'no source yet' })).status).toBe(400);
    await eve.put(`/api/admin/medicines/${created.body.id}`).send({
      name: 'Democillin',
      genericName: 'Democillin',
      strength: '250 mg',
      form: 'tablet',
      usageNotes: 'Placeholder from source X',
      sourceAuthority: 'Demo authority',
      sourceUrl: 'https://example.org/x',
      sourceVersionDate: '2026-01-01',
    });
    const ok = await femi.post(`/api/admin/medicines/${created.body.id}/review`).send({ decision: 'approve', notes: 'checked against source' });
    expect(ok.body.infoStatus).toBe('verified');
  });
});

describe('account rights and audit', () => {
  it('exports only the signed-in person’s data and deletes the account', async () => {
    const phone = '600000444';
    const agent = await login(ctx.app, phone);
    await agent.patch('/api/me/profile').send({ displayName: 'Temp', completeOnboarding: true });
    const exp = await agent.get('/api/me/export');
    expect(exp.body.profile.phone).toBe('+237600000444');
    expect(JSON.stringify(exp.body)).not.toMatch(/\+237600000001/);
    expect((await agent.delete('/api/me').send({ confirm: 'DELETE' })).status).toBe(200);
    const [u] = await ctx.deps.db.select().from(users).where(eq(users.phone, '+237600000444'));
    expect(u).toBeUndefined();
  });

  it('keeps the audit log append-only at the database level', async () => {
    const [row] = await ctx.deps.db.select().from(auditLogs).limit(1);
    await expect(ctx.deps.db.execute(sql`update audit_logs set action = 'tampered' where id = ${row!.id}`)).rejects.toThrow();
    await expect(ctx.deps.db.execute(sql`delete from audit_logs where id = ${row!.id}`)).rejects.toThrow();
  });
});
