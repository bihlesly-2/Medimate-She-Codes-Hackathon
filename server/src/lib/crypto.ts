import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export const hmac = (secret: string, text: string) => createHmac('sha256', secret).update(text).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String(randomInt(0, 10));
  return s;
}

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Short reminder reference like "R7K2" — unambiguous characters, easy to type on a keypad. */
export function refCode(): string {
  let s = 'R';
  for (let i = 0; i < 3; i++) s += REF_ALPHABET[randomInt(0, REF_ALPHABET.length)];
  return s;
}
