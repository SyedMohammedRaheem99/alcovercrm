import { toDialable, buildWhatsAppUrl, normalizePhone } from './phone';

/**
 * Device-integration helpers.
 *
 * All of this works with zero paid APIs: `tel:` and `wa.me` are handled by the
 * phone's own dialler and WhatsApp app, and contacts are saved by generating a
 * vCard file the OS knows how to open.
 */

/** Fill {{placeholders}} in a WhatsApp template. */
export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? '');
}

export function callHref(phone: string, countryCode = '91'): string {
  return `tel:${toDialable(phone, countryCode)}`;
}

export function whatsappHref(phone: string, message?: string, countryCode = '91'): string {
  return buildWhatsAppUrl(phone, message, countryCode);
}

export function smsHref(phone: string, message?: string, countryCode = '91'): string {
  const num = toDialable(phone, countryCode);
  return message ? `sms:${num}?body=${encodeURIComponent(message)}` : `sms:${num}`;
}

export function mapsHref(params: {
  googleMapsLink?: string;
  line1?: string;
  area?: string;
  city?: string;
  pincode?: string;
}): string | null {
  // A pasted Maps link is always more accurate than a text address.
  if (params.googleMapsLink) return params.googleMapsLink;

  const parts = [params.line1, params.area, params.city, params.pincode].filter(Boolean);
  if (parts.length === 0) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}

/**
 * Build a vCard 3.0 payload.
 *
 * 3.0 rather than 4.0 because Android and older iOS handle it more reliably,
 * and CRLF line endings are required by the spec — some Android builds refuse
 * to import a vCard that uses bare LF.
 */
export function buildVCard(lead: {
  name: string;
  phone: string;
  altPhone?: string;
  email?: string;
  leadCode?: string;
  address?: { line1?: string; area?: string; city?: string; state?: string; pincode?: string };
  requirementNotes?: string;
  orgName?: string;
}): string {
  const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(lead.name)};;;;`,
    `FN:${esc(lead.name)}`,
    `TEL;TYPE=CELL:${toDialable(lead.phone)}`,
  ];

  if (lead.altPhone) lines.push(`TEL;TYPE=HOME:${toDialable(lead.altPhone)}`);
  if (lead.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(lead.email)}`);
  if (lead.orgName) lines.push(`ORG:${esc(lead.orgName)}`);

  const a = lead.address;
  if (a && (a.line1 || a.area || a.city)) {
    // ADR fields: PO box; extended; street; locality; region; postcode; country
    lines.push(
      `ADR;TYPE=HOME:;;${esc(a.line1 ?? '')};${esc(a.area ?? a.city ?? '')};${esc(a.state ?? '')};${esc(a.pincode ?? '')};India`,
    );
  }

  const noteParts = [lead.leadCode ? `Lead ${lead.leadCode}` : null, lead.requirementNotes].filter(Boolean);
  if (noteParts.length) lines.push(`NOTE:${esc(noteParts.join(' — '))}`);

  lines.push(`REV:${new Date().toISOString()}`, 'END:VCARD');

  return lines.join('\r\n');
}

/** Trigger a vCard download so the OS offers "Add to contacts". */
export function downloadVCard(lead: Parameters<typeof buildVCard>[0]): void {
  const vcard = buildVCard(lead);
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${lead.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.vcf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy text, falling back to execCommand on browsers without the async API. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch {
    return false;
  }
}

/** Native share sheet where available (Android/iOS), for sending lead details. */
export async function shareLead(lead: { name: string; phone: string; leadCode?: string }): Promise<boolean> {
  const text = `${lead.name}\n${normalizePhone(lead.phone)}${lead.leadCode ? `\nLead: ${lead.leadCode}` : ''}`;

  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await navigator.share({ title: lead.name, text });
      return true;
    } catch {
      return false; // user dismissed the sheet
    }
  }

  return copyToClipboard(text);
}
