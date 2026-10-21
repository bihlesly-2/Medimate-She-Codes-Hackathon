/**
 * Normalise a phone number to E.164. Cameroon (+237) is the default country:
 * local numbers are 9 digits starting with 2 or 6.
 * Returns null when the input cannot be normalised confidently.
 */
export function normalizePhone(raw: string, defaultCountryCode = '237'): string | null {
  let s = raw.trim().replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+')) {
    const digits = s.slice(1);
    if (!/^\d{8,15}$/.test(digits)) return null;
    if (digits.startsWith('237') && !/^237[26]\d{8}$/.test(digits)) return null;
    return '+' + digits;
  }
  if (!/^\d+$/.test(s)) return null;
  if (defaultCountryCode === '237') {
    if (/^[26]\d{8}$/.test(s)) return '+237' + s;
    if (/^237[26]\d{8}$/.test(s)) return '+' + s;
    return null;
  }
  if (s.startsWith('0')) s = s.slice(1);
  const full = defaultCountryCode + s;
  return /^\d{8,15}$/.test(full) ? '+' + full : null;
}

/**
 * Fictional demo range: +237 600 xxx xxx is not allocated to Cameroonian mobile operators.
 * Messages to these numbers are always simulated, even when a live SMS provider is configured.
 */
export function isDemoNumber(e164: string): boolean {
  return /^\+237600\d{6}$/.test(e164);
}

/** Mask a phone number for logs and UI lists: +237•••••001 */
export function maskPhone(e164: string): string {
  if (e164.length <= 7) return '•••';
  return e164.slice(0, 4) + '•'.repeat(Math.max(3, e164.length - 7)) + e164.slice(-3);
}
