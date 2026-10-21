import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from '../lib/errors';

/**
 * Firebase Authentication ID-token verification without a service-account secret.
 * Tokens are RS256 JWTs signed by Google; we check signature, issuer, audience, expiry and auth time
 * as documented at https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export interface FirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  provider: string | null;
}

export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string,
  now = new Date(),
  keys: Parameters<typeof jwtVerify>[1] = JWKS,
): Promise<FirebaseIdentity> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(idToken, keys as typeof JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
      currentDate: now,
    }));
  } catch {
    throw new AppError(401, 'BAD_ID_TOKEN', 'Your sign-in could not be verified. Please try again.');
  }
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const authTime = typeof payload.auth_time === 'number' ? payload.auth_time : 0;
  if (!sub || sub.length > 128 || authTime * 1000 > now.getTime() + 60_000) {
    throw new AppError(401, 'BAD_ID_TOKEN', 'Your sign-in could not be verified. Please try again.');
  }
  const firebase = (payload.firebase ?? {}) as { sign_in_provider?: string };
  return {
    uid: sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name.slice(0, 60) : null,
    provider: firebase.sign_in_provider ?? null,
  };
}
