/**
 * Phone normalisation.
 *
 * The normalised value is the deduplication key for leads, so this logic must be
 * deterministic and is applied in a Mongoose pre-validate hook — never left to
 * the caller, where it could be skipped.
 *
 * Strategy for Indian numbers: strip everything non-numeric, then drop the
 * country code / trunk prefix so that all of these collapse to 9876543210:
 *   +91 98765 43210 · 091-9876543210 · 09876543210 · (98765) 43210
 */

const DEFAULT_COUNTRY_CODE = '91';

export function normalizePhone(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string {
  if (!raw) return '';

  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  // Strip a leading 00 international prefix (e.g. 0091...)
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Strip the country code when the remainder is still a full 10-digit number.
  if (digits.length > 10 && digits.startsWith(countryCode)) {
    const withoutCC = digits.slice(countryCode.length);
    if (withoutCC.length >= 10) digits = withoutCC;
  }

  // Strip a leading 0 trunk prefix (e.g. 09876543210)
  while (digits.length > 10 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Keep the last 10 digits — the subscriber number.
  if (digits.length > 10) digits = digits.slice(-10);

  return digits;
}

/** True when the value looks like a valid Indian mobile number (starts 6-9, 10 digits). */
export function isValidIndianMobile(raw: string | null | undefined): boolean {
  const n = normalizePhone(raw);
  return /^[6-9]\d{9}$/.test(n);
}

/** Loose validity check — accepts any 8-15 digit number, for non-Indian entries. */
export function isPlausiblePhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

/** Pretty display format: 98765 43210 */
export function formatPhoneDisplay(raw: string | null | undefined): string {
  const n = normalizePhone(raw);
  if (n.length === 10) return `${n.slice(0, 5)} ${n.slice(5)}`;
  return raw ? String(raw) : '';
}

/** E.164-ish value for tel: links, e.g. +919876543210 */
export function toDialable(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string {
  const n = normalizePhone(raw, countryCode);
  if (!n) return '';
  return `+${countryCode}${n}`;
}

/** Digits-only value for wa.me links, e.g. 919876543210 */
export function toWhatsAppNumber(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string {
  const n = normalizePhone(raw, countryCode);
  if (!n) return '';
  return `${countryCode}${n}`;
}

/** Build a click-to-chat URL with an optional pre-filled message. */
export function buildWhatsAppUrl(
  raw: string | null | undefined,
  message?: string,
  countryCode = DEFAULT_COUNTRY_CODE,
): string {
  const num = toWhatsAppNumber(raw, countryCode);
  if (!num) return '';
  const base = `https://wa.me/${num}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
