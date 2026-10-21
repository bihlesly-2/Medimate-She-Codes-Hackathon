/**
 * SMS length accounting and pagination.
 * GSM-7: 160 units in one segment, 153 per segment when concatenated; extension characters cost 2.
 * Anything outside GSM-7 forces UCS-2: 70 characters single, 67 per concatenated segment.
 */

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€\f';

export const SMS_SIGNATURE = '-MEDIMATE';

export type SmsEncoding = 'GSM-7' | 'UCS-2';

export function smsEncoding(text: string): SmsEncoding {
  for (const ch of text) {
    if (!GSM_BASIC.includes(ch) && !GSM_EXTENDED.includes(ch)) return 'UCS-2';
  }
  return 'GSM-7';
}

/** Length in encoding units (septets for GSM-7, UTF-16 code units for UCS-2). */
export function smsUnits(text: string): number {
  if (smsEncoding(text) === 'UCS-2') return text.length;
  let n = 0;
  for (const ch of text) n += GSM_EXTENDED.includes(ch) ? 2 : 1;
  return n;
}

export function segmentCount(text: string): number {
  const enc = smsEncoding(text);
  const units = smsUnits(text);
  const [single, multi] = enc === 'GSM-7' ? [160, 153] : [70, 67];
  if (units <= single) return 1;
  return Math.ceil(units / multi);
}

function singleLimit(text: string): number {
  return smsEncoding(text) === 'GSM-7' ? 160 : 70;
}

/**
 * Replace common typographic characters that are not in GSM-7 (and would force UCS-2, cutting each
 * segment from 160 to 70 characters) with plain equivalents.
 */
export function toGsmFriendly(text: string): string {
  return text
    .replace(/[\u2014\u2013\u2212]/g, '-')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u00b7]/g, '*')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\u00f7/g, '/');
}

/** Append the MEDIMATE signature. */
export function signed(body: string): string {
  return `${toGsmFriendly(body).trim()} ${SMS_SIGNATURE}`;
}

/**
 * Split a reply into pages that each fit in ONE segment, each signed.
 * Multi-page replies are numbered and end with a "MORE" prompt except the last page.
 */
export function paginateSms(rawBody: string, morePrompt = 'Reply MORE'): string[] {
  const body = toGsmFriendly(rawBody);
  const whole = signed(body);
  const limit = singleLimit(whole + morePrompt);
  if (smsUnits(whole) <= limit) return [whole];

  // Reserve room for " (99/99) Reply MORE -MEDIMATE".
  const reserve = smsUnits(` (99/99) ${morePrompt} ${SMS_SIGNATURE}`);
  const maxBody = limit - reserve;
  const words = body.trim().split(/(\s+)/);
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    if (smsUnits(cur + w) > maxBody) {
      if (cur.trim()) chunks.push(cur.trim());
      cur = w.trim() ? w : '';
      // A single word longer than a page is hard-split.
      while (smsUnits(cur) > maxBody) {
        chunks.push(cur.slice(0, maxBody));
        cur = cur.slice(maxBody);
      }
    } else {
      cur += w;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  const total = chunks.length;
  return chunks.map((c, i) =>
    i < total - 1 ? `${c} (${i + 1}/${total}) ${morePrompt} ${SMS_SIGNATURE}` : `${c} (${i + 1}/${total}) ${SMS_SIGNATURE}`,
  );
}
