import { and, desc, eq, gt, gte, isNull } from 'drizzle-orm';
import { isDemoNumber, msg, normalizePhone, type Role } from '@medimate/shared';
import { otpChallenges, sessions, users } from '../db/schema';
import { audit } from '../lib/audit';
import { AppError, badRequest, conflict } from '../lib/errors';
import { hmac, randomDigits, randomToken, safeEqual, sha256 } from '../lib/crypto';
import type { Deps } from '../types';
import { verifyFirebaseIdToken } from './firebase';
import { claimCareInvites, createUser, findOrCreateUser, findUserByPhone, getRoles, getUser } from './users';
import { sendSms } from './messaging';

export const SESSION_COOKIE = 'mm_session';
export const SESSION_TTL_MS = 7 * 24 * 3600_000;
const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_WINDOW = 3;
const OTP_WINDOW_MS = 15 * 60_000;

/** Same response whether or not the number has an account (anti-enumeration). */
const GENERIC_SENT = 'If this number can receive SMS, a 6-digit code is on its way. It expires in 5 minutes.';
const GENERIC_INVALID = 'That code is not valid or has expired. Request a new code and try again.';

/**
 * A code may be shown on screen only in development / the labelled public demo, and only when no
 * real SMS can carry it: the simulator is active, or the number is in the fictional demo range.
 * Real numbers with a live SMS provider always receive the code by SMS and never on screen.
 */
export function showCodeOnScreen(deps: Pick<Deps, 'config' | 'messaging'>, phone: string) {
  const devAllowed = deps.config.OTP_PROVIDER === 'dev' && (!deps.config.isProduction || deps.config.PUBLIC_DEMO);
  return devAllowed && (deps.messaging.name === 'simulator' || isDemoNumber(phone));
}

/** Which numbers may sign in on the public demo: demo numbers always; real numbers only with live SMS. */
export function phoneAllowed(deps: Pick<Deps, 'config' | 'messaging'>, phone: string) {
  if (!deps.config.PUBLIC_DEMO) return true;
  return isDemoNumber(phone) || deps.messaging.name !== 'simulator';
}

export async function requestOtp(deps: Deps, rawPhone: string): Promise<{ message: string; devCode?: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw badRequest('Enter a valid phone number, for example 6XX XX XX XX or +237 6XX XX XX XX.');
  if (!phoneAllowed(deps, phone)) {
    throw badRequest('This public demo only accepts fictional demo numbers: +237 600 xxx xxx (for example 600 000 001).');
  }
  const now = deps.clock.now();
  const recent = await deps.db
    .select({ id: otpChallenges.id })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), gte(otpChallenges.createdAt, new Date(now.getTime() - OTP_WINDOW_MS))));
  if (recent.length >= OTP_MAX_PER_WINDOW) {
    deps.logger.warn('otp.rate_limited', { phone });
    return { message: GENERIC_SENT };
  }
  const code = randomDigits(6);
  // Only the newest code is valid: earlier unused codes for this number are retired.
  await deps.db
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)));
  const [challenge] = await deps.db
    .insert(otpChallenges)
    .values({ phone, codeHash: 'pending', expiresAt: new Date(now.getTime() + OTP_TTL_MS), createdAt: now })
    .returning({ id: otpChallenges.id });
  await deps.db
    .update(otpChallenges)
    .set({ codeHash: hmac(deps.config.APP_SECRET, `${challenge!.id}:${code}`) })
    .where(eq(otpChallenges.id, challenge!.id));

  if (showCodeOnScreen(deps, phone)) {
    // Development / public demo with a fictional or simulated number: shown with a clear warning.
    return { message: GENERIC_SENT, devCode: code };
  }
  await sendSms(deps, { to: phone, body: msg('en', 'otp_sms', { code }), kind: 'otp', command: 'OTP' });
  return { message: GENERIC_SENT };
}

/** Check and consume a phone code. Throws the same generic error for every failure. */
export async function consumeOtp(deps: Pick<Deps, 'db' | 'clock' | 'config'>, rawPhone: string, code: string): Promise<string> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw badRequest(GENERIC_INVALID);
  const now = deps.clock.now();
  const [challenge] = await deps.db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt), gt(otpChallenges.expiresAt, now)))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw badRequest(GENERIC_INVALID);
  await deps.db
    .update(otpChallenges)
    .set({ attempts: challenge.attempts + 1 })
    .where(eq(otpChallenges.id, challenge.id));
  const expected = hmac(deps.config.APP_SECRET, `${challenge.id}:${code}`);
  if (!safeEqual(expected, challenge.codeHash)) throw badRequest(GENERIC_INVALID);
  const consumed = await deps.db
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id });
  if (!consumed.length) throw badRequest(GENERIC_INVALID);
  return phone;
}

export async function verifyOtp(deps: Deps, rawPhone: string, code: string) {
  const phone = await consumeOtp(deps, rawPhone, code);
  const { user, created } = await findOrCreateUser(deps, phone, 'web');
  const token = await createSession(deps, user.id);
  await audit(deps.db, { actorId: user.id, action: 'auth.signed_in', targetType: 'user', targetId: user.id, detail: { method: 'phone', created } });
  return { token, userId: user.id, created };
}

function requireFirebase(deps: Pick<Deps, 'config'>) {
  const projectId = deps.config.FIREBASE_PROJECT_ID;
  if (!projectId) throw new AppError(404, 'NOT_CONFIGURED', 'Email sign-in is not set up on this server yet.');
  return projectId;
}

/**
 * Sign in with a Firebase ID token (email/password or Google). An existing account is matched by
 * Firebase uid, or by email only when Firebase says the email is verified (prevents takeover).
 */
export async function signInWithFirebase(deps: Deps, idToken: string) {
  const id = await verifyFirebaseIdToken(idToken, requireFirebase(deps), deps.clock.now());
  let [user] = await deps.db.select().from(users).where(eq(users.firebaseUid, id.uid)).limit(1);
  let created = false;
  if (!user && id.email) {
    const [byEmail] = await deps.db.select().from(users).where(eq(users.email, id.email)).limit(1);
    if (byEmail) {
      if (!id.emailVerified) throw conflict('An account already uses this email. Verify your email address first, then sign in again.');
      [user] = await deps.db.update(users).set({ firebaseUid: id.uid, emailVerified: true, updatedAt: deps.clock.now() }).where(eq(users.id, byEmail.id)).returning();
    }
  }
  if (!user) {
    user = await createUser(deps, { email: id.email, firebaseUid: id.uid, emailVerified: id.emailVerified }, 'web', { displayName: id.name });
    created = true;
  } else if (user.emailVerified !== id.emailVerified || (id.email && user.email !== id.email)) {
    [user] = await deps.db.update(users).set({ emailVerified: id.emailVerified, email: id.email ?? user.email, updatedAt: deps.clock.now() }).where(eq(users.id, user.id)).returning();
  }
  const token = await createSession(deps, user!.id);
  await audit(deps.db, { actorId: user!.id, action: 'auth.signed_in', targetType: 'user', targetId: user!.id, detail: { method: id.provider ?? 'firebase', created } });
  return { token, userId: user!.id, created };
}

/** Add email/Google sign-in to the signed-in account. */
export async function linkFirebase(deps: Deps, userId: string, idToken: string, requestId?: string) {
  const id = await verifyFirebaseIdToken(idToken, requireFirebase(deps), deps.clock.now());
  const [byUid] = await deps.db.select({ id: users.id }).from(users).where(eq(users.firebaseUid, id.uid));
  if (byUid && byUid.id !== userId) throw conflict('This sign-in is already linked to another MEDIMATE account.');
  if (id.email) {
    const [byEmail] = await deps.db.select({ id: users.id }).from(users).where(eq(users.email, id.email));
    if (byEmail && byEmail.id !== userId) throw conflict('This email is already used by another MEDIMATE account.');
  }
  await deps.db.update(users).set({ firebaseUid: id.uid, email: id.email, emailVerified: id.emailVerified, updatedAt: deps.clock.now() }).where(eq(users.id, userId));
  await audit(deps.db, { actorId: userId, action: 'auth.email_linked', targetType: 'user', targetId: userId, requestId });
  return getUser(deps.db, userId);
}

/** Add a verified phone number to the signed-in account (enables SMS reminders and SMS/USSD access). */
export async function linkPhone(deps: Deps, userId: string, rawPhone: string, code: string, requestId?: string) {
  const phone = await consumeOtp(deps, rawPhone, code);
  const owner = await findUserByPhone(deps.db, phone);
  if (owner && owner.id !== userId) {
    throw conflict('This number already has a MEDIMATE account (perhaps from SMS). Sign in with the phone code instead, then add your email in Settings.');
  }
  await deps.db.update(users).set({ phone, updatedAt: deps.clock.now() }).where(eq(users.id, userId));
  await claimCareInvites(deps.db, userId, phone);
  await audit(deps.db, { actorId: userId, action: 'auth.phone_linked', targetType: 'user', targetId: userId, requestId });
  return getUser(deps.db, userId);
}

export async function createSession(deps: Pick<Deps, 'db' | 'clock'>, userId: string): Promise<string> {
  const token = randomToken(32);
  const now = deps.clock.now();
  await deps.db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    createdAt: now,
    lastSeenAt: now,
  });
  return token;
}

export async function loadSession(deps: Pick<Deps, 'db' | 'clock'>, token: string) {
  const now = deps.clock.now();
  const [row] = await deps.db
    .select({ sessionId: sessions.id, userId: sessions.userId, lastSeenAt: sessions.lastSeenAt, phone: users.phone })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  if (now.getTime() - row.lastSeenAt.getTime() > 5 * 60_000) {
    await deps.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, row.sessionId));
  }
  const roles: Role[] = await getRoles(deps.db, row.userId);
  return { sessionId: row.sessionId, userId: row.userId, phone: row.phone, roles };
}

export async function destroySession(deps: Pick<Deps, 'db'>, sessionId: string) {
  await deps.db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function destroyAllSessions(deps: Pick<Deps, 'db'>, userId: string) {
  await deps.db.delete(sessions).where(eq(sessions.userId, userId));
}
