/**
 * Phone numbers are stored in E.164 (+<country code><number>), so that
 * "0803 123 4567", "2348031234567" and "+234 803 123 4567" are the same login.
 *
 * Numbers starting with 0 are treated as national numbers of the given
 * country calling code (default 234, Nigeria).
 */

/** Calling codes for countries we expect to serve. Extend as needed. */
export const CALLING_CODES: Record<string, string> = {
  NG: '234',
  GH: '233',
  KE: '254',
  ZA: '27',
  UG: '256',
  TZ: '255',
  RW: '250',
  CM: '237',
  CI: '225',
  SN: '221',
  BJ: '229',
  TG: '228',
  ZM: '260',
  ET: '251',
  EG: '20',
};

export function normalizePhone(input: string, countryCode = 'NG'): string | undefined {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return undefined;
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!hasPlus) {
    const cc = CALLING_CODES[countryCode.toUpperCase()];
    if (digits.startsWith('0')) {
      if (!cc) return undefined;
      digits = cc + digits.slice(1);
    } else if (cc && !digits.startsWith(cc) && digits.length <= 10) {
      // e.g. "8031234567" typed without the leading 0
      digits = cc + digits;
    }
  }
  // E.164 allows at most 15 digits; reject obvious junk.
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return undefined;
  return `+${digits}`;
}

export function normalizeEmail(input: string): string | undefined {
  const email = input.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}
