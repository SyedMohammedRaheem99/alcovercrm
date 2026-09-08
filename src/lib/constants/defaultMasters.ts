import {
  PRODUCT_TYPE_OPTIONS,
  MATERIAL_OPTIONS,
  GLASS_TYPE_OPTIONS,
  SOURCE_OPTIONS,
  LOST_REASON_OPTIONS,
  type MasterType,
} from './enums';

/**
 * Rows created for every new organisation.
 *
 * These are marked `isSystem` so they can be hidden but never deleted — reports
 * and historical leads reference these keys, and deleting one would orphan data.
 */

export interface DefaultMasterSeed {
  type: MasterType;
  key: string;
  label: string;
  value?: string;
  color?: string;
  sortOrder: number;
  isSystem: boolean;
}

/** WhatsApp templates — placeholders are substituted client-side before opening wa.me. */
export const DEFAULT_WHATSAPP_TEMPLATES: Array<{ key: string; label: string; value: string }> = [
  {
    key: 'intro',
    label: 'First contact',
    value:
      'Hello {{name}}, thank you for your enquiry with {{company}}. I am {{user}} from our sales team. May I know more about your requirement for doors and windows?',
  },
  {
    key: 'missed_call',
    label: 'Missed call follow-up',
    value:
      'Hello {{name}}, I tried reaching you regarding your enquiry with {{company}}. Please let me know a convenient time to call you back.',
  },
  {
    key: 'site_visit',
    label: 'Site visit confirmation',
    value:
      'Hello {{name}}, confirming our site visit for measurement on {{date}}. Our team will reach your location. Please share the address if it has changed. — {{company}}',
  },
  {
    key: 'quotation',
    label: 'Quotation sent',
    value:
      'Hello {{name}}, as discussed, please find our quotation for your {{product}} requirement. The quote is valid for {{validity}} days. Do let me know if you have any questions. — {{company}}',
  },
  {
    key: 'follow_up',
    label: 'Gentle follow-up',
    value:
      'Hello {{name}}, following up on the quotation we shared for your doors and windows requirement. Please let me know your thoughts so we can proceed. — {{company}}',
  },
  {
    key: 'festive',
    label: 'Festive / seasonal offer',
    value:
      'Hello {{name}}, greetings from {{company}}! We have a special offer running on UPVC and aluminium doors and windows this season. Would you like me to share the details?',
  },
  {
    key: 'thank_you',
    label: 'Thank you after order',
    value:
      'Thank you {{name}} for choosing {{company}}. Your order is confirmed and we will keep you updated on the production and installation schedule.',
  },
];

export function buildDefaultMasters(): DefaultMasterSeed[] {
  const rows: DefaultMasterSeed[] = [];

  MATERIAL_OPTIONS.forEach((o, i) =>
    rows.push({ type: 'MATERIAL', key: o.value, label: o.label, sortOrder: i, isSystem: true }),
  );

  PRODUCT_TYPE_OPTIONS.forEach((o, i) =>
    rows.push({ type: 'PRODUCT_TYPE', key: o.value, label: o.label, sortOrder: i, isSystem: true }),
  );

  GLASS_TYPE_OPTIONS.forEach((o, i) =>
    rows.push({ type: 'GLASS_TYPE', key: o.value, label: o.label, sortOrder: i, isSystem: true }),
  );

  SOURCE_OPTIONS.forEach((o, i) =>
    rows.push({
      type: 'SOURCE',
      key: o.value,
      label: o.label,
      color: o.color,
      sortOrder: i,
      isSystem: true,
    }),
  );

  LOST_REASON_OPTIONS.forEach((o, i) =>
    rows.push({ type: 'LOST_REASON', key: o.value, label: o.label, sortOrder: i, isSystem: true }),
  );

  DEFAULT_WHATSAPP_TEMPLATES.forEach((t, i) =>
    rows.push({
      type: 'WHATSAPP_TEMPLATE',
      key: t.key,
      label: t.label,
      value: t.value,
      sortOrder: i,
      isSystem: true,
    }),
  );

  // A few starter tags — not system, so the client can delete them.
  ['Urgent', 'Big Ticket', 'Architect Lead', 'Repeat Customer', 'Price Sensitive'].forEach((t, i) =>
    rows.push({
      type: 'TAG',
      key: t.toLowerCase().replace(/\s+/g, '-'),
      label: t,
      sortOrder: i,
      isSystem: false,
    }),
  );

  return rows;
}
