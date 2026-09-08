/**
 * SINGLE SOURCE OF TRUTH for every enumerated value in the CRM.
 *
 * Zod schemas, Mongoose models and UI dropdowns all import from here, so the
 * database, the API contract and the interface can never drift apart.
 */

/* ------------------------------------------------------------------ *
 * Helper: build a typed option list once and reuse everywhere
 * ------------------------------------------------------------------ */
export type Option<T extends string = string> = {
  value: T;
  label: string;
  color?: string;
  description?: string;
};

const values = <T extends string>(opts: readonly Option<T>[]) =>
  opts.map((o) => o.value) as [T, ...T[]];

const labelMap = <T extends string>(opts: readonly Option<T>[]) =>
  Object.fromEntries(opts.map((o) => [o.value, o.label])) as Record<T, string>;

const colorMap = <T extends string>(opts: readonly Option<T>[]) =>
  Object.fromEntries(opts.map((o) => [o.value, o.color ?? '#64748B'])) as Record<T, string>;

/* ------------------------------------------------------------------ *
 * ROLES
 * ------------------------------------------------------------------ */
export const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN', label: 'Super Admin', description: 'Full platform access across all organisations' },
  { value: 'ADMIN', label: 'Admin', description: 'Full access within the organisation' },
  { value: 'MANAGER', label: 'Manager', description: 'Manages the team and all its leads' },
  { value: 'SALES', label: 'Sales', description: 'Works their own assigned leads' },
] as const;
export type Role = (typeof ROLE_OPTIONS)[number]['value'];
export const ROLES = values(ROLE_OPTIONS);
export const ROLE_LABELS = labelMap(ROLE_OPTIONS);

/** Higher number = more authority. Used for "can this user act on that user" checks. */
export const ROLE_RANK: Record<Role, number> = {
  SALES: 1,
  MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

/* ------------------------------------------------------------------ *
 * LEAD STAGE (the pipeline)
 * ------------------------------------------------------------------ */
export const STAGE_OPTIONS = [
  { value: 'NEW', label: 'New', color: '#64748B' },
  { value: 'CONTACTED', label: 'Contacted', color: '#0EA5E9' },
  { value: 'QUALIFIED', label: 'Qualified', color: '#6366F1' },
  { value: 'SITE_VISIT_SCHEDULED', label: 'Site Visit Scheduled', color: '#8B5CF6' },
  { value: 'SITE_VISIT_DONE', label: 'Site Visit Done', color: '#A855F7' },
  { value: 'QUOTED', label: 'Quoted', color: '#F59E0B' },
  { value: 'NEGOTIATION', label: 'Negotiation', color: '#F97316' },
  { value: 'WON', label: 'Won', color: '#059669' },
  { value: 'LOST', label: 'Lost', color: '#DC2626' },
  { value: 'ON_HOLD', label: 'On Hold', color: '#94A3B8' },
] as const;
export type LeadStage = (typeof STAGE_OPTIONS)[number]['value'];
export const LEAD_STAGES = values(STAGE_OPTIONS);
export const STAGE_LABELS = labelMap(STAGE_OPTIONS);
export const STAGE_COLORS = colorMap(STAGE_OPTIONS);

/** Stages shown as columns on the Kanban board, in order. */
export const PIPELINE_STAGES: LeadStage[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_DONE',
  'QUOTED',
  'NEGOTIATION',
  'WON',
];

/** Stages that mean the lead is finished — no follow-up required. */
export const CLOSED_STAGES: LeadStage[] = ['WON', 'LOST'];
/** Stages that count as "actively in the pipeline" for KPIs. */
export const OPEN_STAGES: LeadStage[] = LEAD_STAGES.filter(
  (s) => !CLOSED_STAGES.includes(s) && s !== 'ON_HOLD',
);

/* ------------------------------------------------------------------ *
 * PRIORITY
 * ------------------------------------------------------------------ */
export const PRIORITY_OPTIONS = [
  { value: 'HOT', label: 'Hot', color: '#DC2626' },
  { value: 'WARM', label: 'Warm', color: '#F59E0B' },
  { value: 'COLD', label: 'Cold', color: '#64748B' },
] as const;
export type Priority = (typeof PRIORITY_OPTIONS)[number]['value'];
export const PRIORITIES = values(PRIORITY_OPTIONS);
export const PRIORITY_LABELS = labelMap(PRIORITY_OPTIONS);
export const PRIORITY_COLORS = colorMap(PRIORITY_OPTIONS);

/* ------------------------------------------------------------------ *
 * MATERIALS
 * ------------------------------------------------------------------ */
export const MATERIAL_OPTIONS = [
  { value: 'UPVC', label: 'UPVC' },
  { value: 'ALUMINIUM', label: 'Aluminium' },
  { value: 'WPC', label: 'WPC' },
  { value: 'PVC', label: 'PVC' },
  { value: 'GLASS', label: 'Glass' },
  { value: 'OTHER', label: 'Other' },
] as const;
export type Material = (typeof MATERIAL_OPTIONS)[number]['value'];
export const MATERIALS = values(MATERIAL_OPTIONS);
export const MATERIAL_LABELS = labelMap(MATERIAL_OPTIONS);

/* ------------------------------------------------------------------ *
 * PRODUCT TYPES  (fenestration catalogue)
 * ------------------------------------------------------------------ */
export const PRODUCT_TYPE_OPTIONS = [
  // Windows
  { value: 'SLIDING_WINDOW', label: 'Sliding Window' },
  { value: 'CASEMENT_WINDOW', label: 'Casement Window' },
  { value: 'TILT_TURN_WINDOW', label: 'Tilt & Turn Window' },
  { value: 'FIXED_WINDOW', label: 'Fixed / Picture Window' },
  { value: 'TOP_HUNG_WINDOW', label: 'Top Hung / Awning Window' },
  { value: 'BAY_WINDOW', label: 'Bay Window' },
  { value: 'VILLA_WINDOW', label: 'Villa / Arched Window' },
  { value: 'COMBINATION_WINDOW', label: 'Combination Window' },
  // Doors
  { value: 'SLIDING_DOOR', label: 'Sliding Door' },
  { value: 'CASEMENT_DOOR', label: 'Casement Door' },
  { value: 'FRENCH_DOOR', label: 'French Door' },
  { value: 'LIFT_SLIDE_DOOR', label: 'Lift & Slide Door' },
  { value: 'BIFOLD_DOOR', label: 'Slide & Fold (Bi-fold) Door' },
  { value: 'MAIN_DOOR', label: 'Main Door' },
  { value: 'BATHROOM_DOOR', label: 'Bathroom Door' },
  { value: 'FLUSH_DOOR', label: 'Flush Door' },
  // Other
  { value: 'VENTILATOR', label: 'Ventilator' },
  { value: 'LOUVER', label: 'Fixed Louver' },
  { value: 'PARTITION', label: 'Partition / Office Glazing' },
  { value: 'MOSQUITO_MESH', label: 'Mosquito Mesh / Insect Screen' },
  { value: 'SAFETY_GRILL', label: 'Safety Grill' },
  { value: 'RAILING', label: 'Balcony Railing' },
  { value: 'SHOWER_CUBICLE', label: 'Shower Cubicle' },
  { value: 'ACP_CLADDING', label: 'ACP Cladding / Facade' },
  { value: 'SKYLIGHT', label: 'Skylight / Pergola' },
  { value: 'OTHER_PRODUCT', label: 'Other' },
] as const;
export type ProductType = (typeof PRODUCT_TYPE_OPTIONS)[number]['value'];
export const PRODUCT_TYPES = values(PRODUCT_TYPE_OPTIONS);
export const PRODUCT_TYPE_LABELS = labelMap(PRODUCT_TYPE_OPTIONS);

/* ------------------------------------------------------------------ *
 * GLASS TYPES
 * ------------------------------------------------------------------ */
export const GLASS_TYPE_OPTIONS = [
  { value: 'PLAIN', label: 'Plain / Clear' },
  { value: 'FROSTED', label: 'Frosted / Etched' },
  { value: 'TINTED', label: 'Tinted' },
  { value: 'REFLECTIVE', label: 'Reflective' },
  { value: 'TOUGHENED', label: 'Toughened / Tempered' },
  { value: 'LAMINATED', label: 'Laminated' },
  { value: 'DGU', label: 'DGU (Double Glazed)' },
  { value: 'GEORGIAN', label: 'Georgian / Grill-in-glass' },
  { value: 'SANDBLAST', label: 'Sandblast Design' },
  { value: 'OTHER_GLASS', label: 'Other' },
] as const;
export type GlassType = (typeof GLASS_TYPE_OPTIONS)[number]['value'];
export const GLASS_TYPES = values(GLASS_TYPE_OPTIONS);
export const GLASS_TYPE_LABELS = labelMap(GLASS_TYPE_OPTIONS);

/* ------------------------------------------------------------------ *
 * LEAD SOURCE
 * ------------------------------------------------------------------ */
export const SOURCE_OPTIONS = [
  // Ordered by how often this client actually uses them — the top three are
  // one tap away when adding a lead on a phone.
  { value: 'WEBSITE', label: 'Website', color: '#0EA5E9' },
  { value: 'WHATSAPP', label: 'WhatsApp', color: '#25D366' },
  { value: 'ONLINE_NEW', label: 'Online - New', color: '#6366F1' },
  { value: 'ONLINE_20KM', label: 'Online - 20km', color: '#8B5CF6' },
  { value: 'ONLINE_10KM', label: 'Online - 10km', color: '#A855F7' },
  { value: 'WALK_IN', label: 'Walk-in / Showroom', color: '#059669' },
  { value: 'REFERRAL', label: 'Referral', color: '#F97316' },
  { value: 'GMB', label: 'Google My Business', color: '#34A853' },
  { value: 'JUSTDIAL', label: 'JustDial', color: '#F58220' },
  { value: 'INDIAMART', label: 'IndiaMART', color: '#2E3192' },
  { value: 'SULEKHA', label: 'Sulekha', color: '#E4002B' },
  { value: 'ARCHITECT', label: 'Architect / Interior Designer', color: '#4a3aa7' },
  { value: 'BUILDER', label: 'Builder / Developer', color: '#eb6834' },
  { value: 'HOARDING', label: 'Hoarding / Pamphlet', color: '#F59E0B' },
  { value: 'EXHIBITION', label: 'Exhibition / Trade Show', color: '#eda100' },
  { value: 'COLD_CALL', label: 'Cold Call / Field Marketing', color: '#64748B' },
  { value: 'REPEAT', label: 'Repeat Customer', color: '#047857' },
  // Ad channels keep their existing keys so historical leads and reports stay
  // intact; only the display label is shortened.
  { value: 'META_ADS', label: 'MA', color: '#1877F2' },
  { value: 'GOOGLE_ADS', label: 'GA', color: '#4285F4' },
  { value: 'OTHER', label: 'Other', color: '#94A3B8' },
] as const;
export type LeadSource = (typeof SOURCE_OPTIONS)[number]['value'];
export const LEAD_SOURCES = values(SOURCE_OPTIONS);
export const SOURCE_LABELS = labelMap(SOURCE_OPTIONS);
export const SOURCE_COLORS = colorMap(SOURCE_OPTIONS);

/* ------------------------------------------------------------------ *
 * QUALIFICATION
 * ------------------------------------------------------------------ */
export const PROPERTY_TYPE_OPTIONS = [
  { value: 'INDEPENDENT_HOUSE', label: 'Independent House' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'APARTMENT', label: 'Apartment / Flat' },
  { value: 'COMMERCIAL', label: 'Commercial / Shop' },
  { value: 'OFFICE', label: 'Office' },
  { value: 'BUILDER_PROJECT', label: 'Builder Project' },
  { value: 'RENOVATION', label: 'Renovation' },
  { value: 'OTHER_PROPERTY', label: 'Other' },
] as const;
export type PropertyType = (typeof PROPERTY_TYPE_OPTIONS)[number]['value'];
export const PROPERTY_TYPES = values(PROPERTY_TYPE_OPTIONS);
export const PROPERTY_TYPE_LABELS = labelMap(PROPERTY_TYPE_OPTIONS);

export const CONSTRUCTION_STAGE_OPTIONS = [
  { value: 'PLANNING', label: 'Planning / Design' },
  { value: 'FOUNDATION', label: 'Foundation' },
  { value: 'SLAB', label: 'Slab' },
  { value: 'BRICKWORK', label: 'Brickwork' },
  { value: 'PLASTERING', label: 'Plastering' },
  { value: 'FINISHING', label: 'Finishing' },
  { value: 'READY', label: 'Ready / Occupied' },
  { value: 'NA', label: 'Not Applicable' },
] as const;
export type ConstructionStage = (typeof CONSTRUCTION_STAGE_OPTIONS)[number]['value'];
export const CONSTRUCTION_STAGES = values(CONSTRUCTION_STAGE_OPTIONS);
export const CONSTRUCTION_STAGE_LABELS = labelMap(CONSTRUCTION_STAGE_OPTIONS);

export const TIMELINE_OPTIONS = [
  { value: 'IMMEDIATE', label: 'Immediate (within 15 days)' },
  { value: 'WITHIN_1_MONTH', label: 'Within 1 month' },
  { value: 'ONE_TO_THREE_MONTHS', label: '1 - 3 months' },
  { value: 'THREE_TO_SIX_MONTHS', label: '3 - 6 months' },
  { value: 'SIX_PLUS_MONTHS', label: '6+ months' },
  { value: 'UNKNOWN', label: 'Not sure' },
] as const;
export type Timeline = (typeof TIMELINE_OPTIONS)[number]['value'];
export const TIMELINES = values(TIMELINE_OPTIONS);
export const TIMELINE_LABELS = labelMap(TIMELINE_OPTIONS);

export const DECISION_MAKER_OPTIONS = [
  { value: 'SELF', label: 'Self / Owner' },
  { value: 'SPOUSE', label: 'Spouse / Family' },
  { value: 'ARCHITECT', label: 'Architect' },
  { value: 'CONTRACTOR', label: 'Contractor' },
  { value: 'BUILDER', label: 'Builder' },
  { value: 'OTHER_DM', label: 'Other' },
] as const;
export type DecisionMaker = (typeof DECISION_MAKER_OPTIONS)[number]['value'];
export const DECISION_MAKERS = values(DECISION_MAKER_OPTIONS);
export const DECISION_MAKER_LABELS = labelMap(DECISION_MAKER_OPTIONS);

/* ------------------------------------------------------------------ *
 * LOST REASONS
 * ------------------------------------------------------------------ */
export const LOST_REASON_OPTIONS = [
  { value: 'PRICE_TOO_HIGH', label: 'Price too high' },
  { value: 'CHOSE_COMPETITOR', label: 'Chose a competitor' },
  { value: 'PROJECT_POSTPONED', label: 'Project postponed' },
  { value: 'JUST_ENQUIRING', label: 'Was just enquiring' },
  { value: 'WRONG_NUMBER', label: 'Wrong number' },
  { value: 'NOT_REACHABLE', label: 'Not reachable' },
  { value: 'OUT_OF_SERVICE_AREA', label: 'Out of service area' },
  { value: 'BUDGET_MISMATCH', label: 'Budget mismatch' },
  { value: 'MATERIAL_NOT_SUPPLIED', label: 'Wanted material we do not supply' },
  { value: 'DUPLICATE', label: 'Duplicate lead' },
  { value: 'NO_RESPONSE', label: 'No response after follow-ups' },
  { value: 'OTHER_LOST', label: 'Other' },
] as const;
export type LostReason = (typeof LOST_REASON_OPTIONS)[number]['value'];
export const LOST_REASONS = values(LOST_REASON_OPTIONS);
export const LOST_REASON_LABELS = labelMap(LOST_REASON_OPTIONS);

/* ------------------------------------------------------------------ *
 * ACTIVITY
 * ------------------------------------------------------------------ */
export const ACTIVITY_TYPE_OPTIONS = [
  { value: 'CALL', label: 'Call', color: '#0EA5E9' },
  { value: 'WHATSAPP', label: 'WhatsApp', color: '#25D366' },
  { value: 'SMS', label: 'SMS', color: '#64748B' },
  { value: 'EMAIL', label: 'Email', color: '#6366F1' },
  { value: 'MEETING', label: 'Meeting', color: '#8B5CF6' },
  { value: 'SITE_VISIT', label: 'Site Visit', color: '#A855F7' },
  { value: 'QUOTATION_SENT', label: 'Quotation Sent', color: '#F59E0B' },
  { value: 'NOTE', label: 'Note', color: '#94A3B8' },
  { value: 'STAGE_CHANGE', label: 'Stage Changed', color: '#475569' },
  { value: 'ASSIGNMENT', label: 'Assignment', color: '#475569' },
  { value: 'FOLLOW_UP_SET', label: 'Follow-up Set', color: '#F59E0B' },
  { value: 'FOLLOW_UP_DONE', label: 'Follow-up Completed', color: '#059669' },
  { value: 'PAYMENT', label: 'Payment', color: '#047857' },
  { value: 'SYSTEM', label: 'System', color: '#94A3B8' },
] as const;
export type ActivityType = (typeof ACTIVITY_TYPE_OPTIONS)[number]['value'];
export const ACTIVITY_TYPES = values(ACTIVITY_TYPE_OPTIONS);
export const ACTIVITY_TYPE_LABELS = labelMap(ACTIVITY_TYPE_OPTIONS);
export const ACTIVITY_TYPE_COLORS = colorMap(ACTIVITY_TYPE_OPTIONS);

/** Activity types a user can create by hand (the rest are system-generated). */
export const MANUAL_ACTIVITY_TYPES: ActivityType[] = [
  'CALL',
  'WHATSAPP',
  'SMS',
  'EMAIL',
  'MEETING',
  'SITE_VISIT',
  'QUOTATION_SENT',
  'NOTE',
  'PAYMENT',
];

export const CALL_OUTCOME_OPTIONS = [
  { value: 'CONNECTED', label: 'Connected', color: '#059669' },
  { value: 'INTERESTED', label: 'Interested', color: '#059669' },
  { value: 'CALL_BACK_LATER', label: 'Asked to call back later', color: '#F59E0B' },
  { value: 'NOT_ANSWERED', label: 'Not answered', color: '#F97316' },
  { value: 'BUSY', label: 'Busy', color: '#F97316' },
  { value: 'SWITCHED_OFF', label: 'Switched off', color: '#94A3B8' },
  { value: 'NOT_INTERESTED', label: 'Not interested', color: '#DC2626' },
  { value: 'WRONG_NUMBER', label: 'Wrong number', color: '#DC2626' },
  { value: 'INVALID', label: 'Invalid number', color: '#DC2626' },
] as const;
export type CallOutcome = (typeof CALL_OUTCOME_OPTIONS)[number]['value'];
export const CALL_OUTCOMES = values(CALL_OUTCOME_OPTIONS);
export const CALL_OUTCOME_LABELS = labelMap(CALL_OUTCOME_OPTIONS);
export const CALL_OUTCOME_COLORS = colorMap(CALL_OUTCOME_OPTIONS);

/** Outcomes that prove we actually spoke to the person. */
export const CONNECTED_OUTCOMES: CallOutcome[] = ['CONNECTED', 'INTERESTED', 'CALL_BACK_LATER'];

export const ACTIVITY_DIRECTIONS = ['OUTGOING', 'INCOMING'] as const;
export type ActivityDirection = (typeof ACTIVITY_DIRECTIONS)[number];

export const ACTIVITY_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending', color: '#F59E0B' },
  { value: 'COMPLETED', label: 'Completed', color: '#059669' },
  { value: 'CANCELLED', label: 'Cancelled', color: '#94A3B8' },
  { value: 'NO_SHOW', label: 'No Show', color: '#DC2626' },
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUS_OPTIONS)[number]['value'];
export const ACTIVITY_STATUSES = values(ACTIVITY_STATUS_OPTIONS);
export const ACTIVITY_STATUS_LABELS = labelMap(ACTIVITY_STATUS_OPTIONS);

/* ------------------------------------------------------------------ *
 * QUOTATION
 * ------------------------------------------------------------------ */
export const QUOTATION_STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft', color: '#94A3B8' },
  { value: 'SENT', label: 'Sent', color: '#0EA5E9' },
  { value: 'VIEWED', label: 'Viewed', color: '#6366F1' },
  { value: 'ACCEPTED', label: 'Accepted', color: '#059669' },
  { value: 'REJECTED', label: 'Rejected', color: '#DC2626' },
  { value: 'EXPIRED', label: 'Expired', color: '#F97316' },
  { value: 'REVISED', label: 'Revised', color: '#8B5CF6' },
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUS_OPTIONS)[number]['value'];
export const QUOTATION_STATUSES = values(QUOTATION_STATUS_OPTIONS);
export const QUOTATION_STATUS_LABELS = labelMap(QUOTATION_STATUS_OPTIONS);
export const QUOTATION_STATUS_COLORS = colorMap(QUOTATION_STATUS_OPTIONS);

export const DISCOUNT_TYPES = ['FLAT', 'PERCENT'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/* ------------------------------------------------------------------ *
 * MASTERS (tenant-configurable dropdown lists)
 * ------------------------------------------------------------------ */
export const MASTER_TYPE_OPTIONS = [
  { value: 'PRODUCT_TYPE', label: 'Product Types' },
  { value: 'MATERIAL', label: 'Materials' },
  { value: 'GLASS_TYPE', label: 'Glass Types' },
  { value: 'SOURCE', label: 'Lead Sources' },
  { value: 'LOST_REASON', label: 'Lost Reasons' },
  { value: 'TAG', label: 'Tags' },
  { value: 'SERIES', label: 'Product Series' },
  { value: 'AREA', label: 'Areas / Localities' },
  { value: 'WHATSAPP_TEMPLATE', label: 'WhatsApp Templates' },
] as const;
export type MasterType = (typeof MASTER_TYPE_OPTIONS)[number]['value'];
export const MASTER_TYPES = values(MASTER_TYPE_OPTIONS);
export const MASTER_TYPE_LABELS = labelMap(MASTER_TYPE_OPTIONS);

/* ------------------------------------------------------------------ *
 * AUDIT LOG
 * ------------------------------------------------------------------ */
export const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'CREATE',
  'UPDATE',
  'DELETE',
  'RESTORE',
  'EXPORT',
  'IMPORT',
  'BACKUP',
  'ROLE_CHANGE',
  'PASSWORD_CHANGE',
  'PASSWORD_RESET',
  'SETTINGS_CHANGE',
  'BULK_UPDATE',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/* ------------------------------------------------------------------ *
 * NOTIFICATIONS
 * ------------------------------------------------------------------ */
export const NOTIFICATION_TYPES = [
  'FOLLOW_UP_DUE',
  'FOLLOW_UP_OVERDUE',
  'LEAD_ASSIGNED',
  'SLA_BREACH',
  'SITE_VISIT_TODAY',
  'QUOTE_EXPIRING',
  'MENTION',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/* ------------------------------------------------------------------ *
 * IMPORT
 * ------------------------------------------------------------------ */
export const IMPORT_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const DUPLICATE_STRATEGIES = ['SKIP', 'UPDATE', 'CREATE_ANYWAY'] as const;
export type DuplicateStrategy = (typeof DUPLICATE_STRATEGIES)[number];

/* ------------------------------------------------------------------ *
 * ORGANISATION
 * ------------------------------------------------------------------ */
export const ORG_PLANS = ['FREE', 'PRO'] as const;
export type OrgPlan = (typeof ORG_PLANS)[number];

/* ------------------------------------------------------------------ *
 * FOLLOW-UP BUCKETS (dashboard grouping)
 * ------------------------------------------------------------------ */
export const FOLLOW_UP_BUCKETS = [
  'OVERDUE',
  'TODAY',
  'TOMORROW',
  'THIS_WEEK',
  'LATER',
  'NONE',
] as const;
export type FollowUpBucket = (typeof FOLLOW_UP_BUCKETS)[number];

export const FOLLOW_UP_BUCKET_LABELS: Record<FollowUpBucket, string> = {
  OVERDUE: 'Overdue',
  TODAY: 'Due Today',
  TOMORROW: 'Tomorrow',
  THIS_WEEK: 'This Week',
  LATER: 'Later',
  NONE: 'No Follow-up Set',
};

export const FOLLOW_UP_BUCKET_COLORS: Record<FollowUpBucket, string> = {
  OVERDUE: '#DC2626',
  TODAY: '#F59E0B',
  TOMORROW: '#0EA5E9',
  THIS_WEEK: '#6366F1',
  LATER: '#94A3B8',
  NONE: '#94A3B8',
};
