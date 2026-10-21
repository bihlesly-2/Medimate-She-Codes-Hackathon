import type { Auth, User } from 'firebase/auth';
import type { PublicConfig } from './types';

/**
 * Firebase Authentication (email/password + Google). Loaded only when someone opens sign-in, so the
 * rest of the app stays light. Firebase proves who the person is; MEDIMATE then issues its own
 * httpOnly session cookie and the Firebase browser session is closed.
 */
type FirebaseConfig = NonNullable<PublicConfig['firebase']>;
let authPromise: Promise<Auth> | null = null;

async function getAuthFor(cfg: FirebaseConfig): Promise<Auth> {
  authPromise ??= (async () => {
    const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const app = getApps()[0] ?? initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId, appId: cfg.appId ?? undefined });
    return getAuth(app);
  })();
  return authPromise;
}

async function tokenAndSignOut(auth: Auth, user: User) {
  const token = await user.getIdToken(true);
  const { signOut } = await import('firebase/auth');
  await signOut(auth).catch(() => undefined);
  return token;
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'That email and password do not match. Try again or reset your password.',
  'auth/wrong-password': 'That email and password do not match. Try again or reset your password.',
  'auth/user-not-found': 'No account uses this email yet. Create one below.',
  'auth/email-already-in-use': 'An account already uses this email. Sign in instead.',
  'auth/weak-password': 'Choose a password with at least 8 characters.',
  'auth/invalid-email': 'Check the email address.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/unauthorized-domain': 'Sign-in is not enabled for this web address yet.',
};
export function firebaseMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  return MESSAGES[code] ?? (e instanceof Error ? e.message : 'Sign-in failed. Please try again.');
}

export async function emailSignIn(cfg: FirebaseConfig, email: string, password: string) {
  const auth = await getAuthFor(cfg);
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return tokenAndSignOut(auth, cred.user);
}

export async function emailSignUp(cfg: FirebaseConfig, email: string, password: string) {
  const auth = await getAuthFor(cfg);
  const { createUserWithEmailAndPassword, sendEmailVerification } = await import('firebase/auth');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await sendEmailVerification(cred.user).catch(() => undefined);
  return tokenAndSignOut(auth, cred.user);
}

export async function resetPassword(cfg: FirebaseConfig, email: string) {
  const auth = await getAuthFor(cfg);
  const { sendPasswordResetEmail } = await import('firebase/auth');
  await sendPasswordResetEmail(auth, email);
}

export async function googleSignIn(cfg: FirebaseConfig) {
  const auth = await getAuthFor(cfg);
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  return tokenAndSignOut(auth, cred.user);
}
