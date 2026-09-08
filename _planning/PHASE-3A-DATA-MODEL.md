# PHASE 3A — DATA MODEL & INDEX DESIGN

Third analysis pass. Every collection, every field, every index — designed against the
actual queries the app will run. No gaps.

---

## COLLECTION 1: `organizations`

Multi-tenant root. One document per client factory.

| field | type | notes |
|---|---|---|
| _id | ObjectId | |
| name | String | "Royal UPVC Doors & Windows" |
| slug | String | unique, url-safe |
| logoUrl | String? | data-URI or external URL |
| phone | String? | |
| email | String? | |
| address | Object? | line1, line2, city, state, pincode |
| gstin | String? | |
| currency | String | default "INR" |
| timezone | String | default "Asia/Kolkata" |
| plan | Enum | FREE / PRO — future-proofing, unused in v1 |
| isActive | Boolean | super-admin can suspend a tenant |
| settings | Object | see below |
| createdAt/updatedAt | Date | |

`settings` sub-document (all tenant-configurable, no code change needed):
- `businessHours`: { start: "09:30", end: "19:00", workingDays: [1..6] }
- `leadResponseSlaMinutes`: Number, default 30 — powers the speed-to-lead alert
- `followUpOverdueGraceHours`: Number, default 0
- `autoAssignEnabled`: Boolean, default false (future)
- `requireNextActionOnCall`: Boolean, default true — THE core discipline rule
- `defaultLeadStage`: String, default "NEW"
- `whatsappCountryCode`: String, default "91"
- `quotationValidityDays`: Number, default 15
- `financialYearStartMonth`: Number, default 4 (April — India)

INDEXES: `{ slug: 1 }` unique

---

## COLLECTION 2: `users`

| field | type | notes |
|---|---|---|
| _id | ObjectId | |
| organizationId | ObjectId | indexed, REQUIRED (null only for SUPER_ADMIN) |
| name | String | |
| email | String | lowercased, trimmed |
| phone | String? | |
| passwordHash | String | `select: false` — never leaves the server |
| role | Enum | SUPER_ADMIN / ADMIN / MANAGER / SALES |
| avatarColor | String | auto-assigned, for avatar initials |
| isActive | Boolean | deactivate instead of delete |
| lastLoginAt | Date? | |
| failedLoginAttempts | Number | default 0 |
| lockedUntil | Date? | account lockout |
| passwordChangedAt | Date? | invalidates older JWTs |
| targets | Object? | monthlyLeadTarget, monthlyRevenueTarget |
| isDeleted / deletedAt / deletedBy | soft delete | |
| createdBy / updatedBy | ObjectId? | |
| createdAt/updatedAt | Date | |

INDEXES:
- `{ email: 1 }` unique  — global unique login
- `{ organizationId: 1, isDeleted: 1, isActive: 1 }` — team list
- `{ organizationId: 1, role: 1 }` — role filters

ROLE MATRIX (enforced server-side):

| capability | SUPER_ADMIN | ADMIN | MANAGER | SALES |
|---|---|---|---|---|
| view all leads in org | ✔ | ✔ | ✔ | own only* |
| create / edit lead | ✔ | ✔ | ✔ | ✔ (own) |
| delete lead (soft) | ✔ | ✔ | ✔ | ✘ |
| reassign lead | ✔ | ✔ | ✔ | ✘ |
| import CSV | ✔ | ✔ | ✔ | ✘ |
| export / backup | ✔ | ✔ | ✘ | ✘ |
| manage users | ✔ | ✔ | ✘ | ✘ |
| org settings & masters | ✔ | ✔ | ✘ | ✘ |
| view org-wide analytics | ✔ | ✔ | ✔ | own only |
| manage organizations | ✔ | ✘ | ✘ | ✘ |
| view audit log | ✔ | ✔ | ✘ | ✘ |

*SALES visibility is controlled by an org setting `salesSeeAllLeads` (default false).

---

## COLLECTION 3: `leads`  ← THE CORE

| field | type | notes |
|---|---|---|
| _id | ObjectId | |
| organizationId | ObjectId | indexed, required |
| leadCode | String | human ref e.g. "RYL-000142", unique per org |
| **Identity** | | |
| name | String | required |
| phone | String | required, as entered |
| phoneNormalized | String | last 10 digits — the dedupe key |
| altPhone / altPhoneNormalized | String? | |
| email | String? | |
| whatsappSameAsPhone | Boolean | default true |
| whatsappPhone | String? | |
| **Location** | | |
| address | Object | line1, area, city, state, pincode, landmark |
| googleMapsLink | String? | pasted link, no API needed |
| **Requirement** | | |
| materials | [Enum] | UPVC / ALUMINIUM / WPC / PVC / GLASS / OTHER (multi) |
| productTypes | [Enum] | sliding window, casement, ventilator, etc. (multi) |
| glassTypes | [Enum] | plain, toughened, DGU, frosted... (multi) |
| approxAreaSqft | Number? | |
| unitCount | Number? | number of windows/doors |
| requirementNotes | String? | |
| **Qualification** | | |
| propertyType | Enum? | INDEPENDENT_HOUSE / VILLA / APARTMENT / COMMERCIAL / OFFICE / BUILDER_PROJECT / RENOVATION / OTHER |
| constructionStage | Enum? | PLANNING / FOUNDATION / SLAB / BRICKWORK / PLASTERING / FINISHING / READY / NA |
| timeline | Enum? | IMMEDIATE / WITHIN_1_MONTH / 1_3_MONTHS / 3_6_MONTHS / 6_PLUS_MONTHS / UNKNOWN |
| budgetMin / budgetMax | Number? | |
| decisionMaker | Enum? | SELF / SPOUSE / ARCHITECT / CONTRACTOR / BUILDER / OTHER |
| hasCompetitorQuote | Boolean? | |
| competitorNames | [String] | |
| **Pipeline** | | |
| stage | Enum | NEW / CONTACTED / QUALIFIED / SITE_VISIT_SCHEDULED / SITE_VISIT_DONE / QUOTED / NEGOTIATION / WON / LOST / ON_HOLD |
| priority | Enum | HOT / WARM / COLD — default WARM |
| score | Number | 0-100, auto-computed (see 3B) |
| **Source** | | |
| source | Enum | META_ADS / GOOGLE_ADS / GMB / JUSTDIAL / INDIAMART / SULEKHA / WEBSITE / WHATSAPP / WALK_IN / REFERRAL / ARCHITECT / BUILDER / HOARDING / EXHIBITION / COLD_CALL / REPEAT / OTHER |
| sourceDetail | String? | campaign name / ad name / referrer name |
| referredByLeadId | ObjectId? | links to the referring customer |
| campaignName | String? | from CSV import |
| **Assignment & timing** | | |
| assignedTo | ObjectId? | indexed |
| assignedToName | String? | DENORMALIZED for fast list render |
| assignedAt | Date? | |
| firstContactedAt | Date? | powers speed-to-lead |
| lastContactedAt | Date? | |
| nextFollowUpAt | Date? | INDEXED — the dashboard heartbeat |
| nextFollowUpNote | String? | shown on the dashboard card |
| contactAttempts | Number | default 0 |
| **Outcome** | | |
| wonAt / lostAt | Date? | |
| dealValue | Number? | final order value |
| lostReason | Enum? | see Phase 2 list |
| lostReasonDetail | String? | |
| customerSince | Date? | set when stage -> WON |
| **Meta** | | |
| tags | [String] | free-form labels |
| notes | String? | quick scratch note (timeline holds real history) |
| importBatchId | ObjectId? | traceability for CSV imports |
| isDuplicateOf | ObjectId? | soft-merge pointer |
| activityCount | Number | denormalized counter |
| quotationCount | Number | denormalized counter |
| isDeleted / deletedAt / deletedBy | | soft delete |
| createdBy / updatedBy | ObjectId? | |
| createdAt / updatedAt | Date | |

### INDEXES (designed from real queries — this is where performance lives)

1. `{ organizationId: 1, phoneNormalized: 1 }` **UNIQUE** (partial: isDeleted=false)
   -> duplicate prevention, and instant "search by phone"
2. `{ organizationId: 1, isDeleted: 1, nextFollowUpAt: 1 }`
   -> **the #1 query**: today's / overdue follow-ups
3. `{ organizationId: 1, isDeleted: 1, stage: 1, updatedAt: -1 }`
   -> pipeline board and stage-filtered lists
4. `{ organizationId: 1, isDeleted: 1, assignedTo: 1, nextFollowUpAt: 1 }`
   -> a salesperson's own follow-up queue
5. `{ organizationId: 1, isDeleted: 1, createdAt: -1 }`
   -> default list sort, "new leads today"
6. `{ organizationId: 1, isDeleted: 1, source: 1, createdAt: -1 }`
   -> source analytics
7. `{ organizationId: 1, isDeleted: 1, firstContactedAt: 1 }`
   -> uncontacted / SLA-breach detection
8. `{ organizationId: 1, leadCode: 1 }` unique
9. TEXT index on `{ name, phone, email, address.area, address.city, requirementNotes }`
   -> global search box
10. `{ organizationId: 1, isDeleted: 1, "address.city": 1 }` and `... "address.area": 1`
   -> location analytics

---

## COLLECTION 4: `activities` (the timeline — immutable history)

| field | type | notes |
|---|---|---|
| _id | ObjectId | |
| organizationId | ObjectId | indexed |
| leadId | ObjectId | indexed |
| type | Enum | CALL / WHATSAPP / SMS / EMAIL / MEETING / SITE_VISIT / QUOTATION_SENT / NOTE / STAGE_CHANGE / ASSIGNMENT / FOLLOW_UP_SET / FOLLOW_UP_DONE / PAYMENT / SYSTEM |
| direction | Enum? | OUTGOING / INCOMING |
| outcome | Enum? | CONNECTED / NOT_ANSWERED / BUSY / SWITCHED_OFF / WRONG_NUMBER / INVALID / CALL_BACK_LATER / NOT_INTERESTED / INTERESTED |
| durationSeconds | Number? | manual entry |
| subject | String? | |
| body | String? | what was discussed |
| scheduledAt | Date? | for SITE_VISIT / MEETING |
| completedAt | Date? | |
| status | Enum | PENDING / COMPLETED / CANCELLED / NO_SHOW |
| location | Object? | address for site visits |
| assignedTo | ObjectId? | who does the site visit |
| metadata | Mixed? | e.g. { from: "NEW", to: "CONTACTED" } for STAGE_CHANGE |
| performedBy | ObjectId | who did it |
| performedByName | String | denormalized |
| isDeleted etc. | | |
| createdAt / updatedAt | Date | |

INDEXES:
- `{ organizationId: 1, leadId: 1, createdAt: -1 }` -> lead timeline (hot path)
- `{ organizationId: 1, type: 1, scheduledAt: 1, status: 1 }` -> upcoming site visits
- `{ organizationId: 1, performedBy: 1, createdAt: -1 }` -> per-user activity report
- `{ organizationId: 1, createdAt: -1 }` -> org activity feed

---

## COLLECTION 5: `quotations` (light in v1, schema-ready for full builder)

| field | type | notes |
|---|---|---|
| _id, organizationId, leadId | | indexed |
| quotationNumber | String | "QT-2026-0042", unique per org |
| revision | Number | default 1 |
| parentQuotationId | ObjectId? | revision chain |
| status | Enum | DRAFT / SENT / VIEWED / ACCEPTED / REJECTED / EXPIRED / REVISED |
| items | [Object] | **schema-ready, UI deferred**: description, material, productType, glassType, widthMm, heightMm, quantity, areaSqft, ratePerSqft, amount |
| subtotal / discount / discountType / taxPercent / taxAmount / grandTotal | Number | |
| validUntil | Date? | |
| sentAt / respondedAt | Date? | |
| notes / termsAndConditions | String? | |
| attachmentUrl | String? | link to an externally-stored PDF |
| createdBy / updatedBy, soft-delete, timestamps | | |

INDEXES:
- `{ organizationId: 1, leadId: 1, createdAt: -1 }`
- `{ organizationId: 1, quotationNumber: 1 }` unique
- `{ organizationId: 1, status: 1, validUntil: 1 }` -> expiring quotes alert

---

## COLLECTION 6: `masters` (tenant-configurable dropdowns — no redeploy to add a value)

Single flexible collection instead of 8 tiny ones.

| field | type | notes |
|---|---|---|
| organizationId | ObjectId | indexed |
| type | Enum | PRODUCT_TYPE / MATERIAL / GLASS_TYPE / SOURCE / LOST_REASON / TAG / SERIES / AREA / WHATSAPP_TEMPLATE |
| key | String | stable code |
| label | String | display text |
| value | Mixed? | for templates: the message body |
| color | String? | chip colour |
| sortOrder | Number | |
| isActive | Boolean | |
| isSystem | Boolean | system rows cannot be deleted, only hidden |

INDEXES: `{ organizationId: 1, type: 1, isActive: 1, sortOrder: 1 }`,
`{ organizationId: 1, type: 1, key: 1 }` unique

---

## COLLECTION 7: `importBatches` (traceability + rollback)

organizationId, fileName, fileType, totalRows, inserted, updated, skipped, failed,
errors[] ({row, reason}), mapping (column->field), status
(PENDING/PROCESSING/COMPLETED/FAILED), importedBy, createdAt.

Why: if someone imports a bad file, we can find and undo exactly those leads via
`leads.importBatchId`. Without this, a bad import is unrecoverable.

INDEXES: `{ organizationId: 1, createdAt: -1 }`

---

## COLLECTION 8: `auditLogs` (security + compliance)

organizationId, userId, userName, action (LOGIN/LOGIN_FAILED/LOGOUT/CREATE/UPDATE/
DELETE/EXPORT/IMPORT/ROLE_CHANGE/PASSWORD_CHANGE/SETTINGS_CHANGE), entityType,
entityId, changes (before/after diff), ipAddress, userAgent, createdAt.

INDEXES:
- `{ organizationId: 1, createdAt: -1 }`
- `{ organizationId: 1, userId: 1, createdAt: -1 }`
- `{ createdAt: 1 }` TTL 365 days — auto-prune, keeps the free tier from filling up

---

## COLLECTION 9: `notifications` (in-app, no push service needed)

organizationId, userId, type (FOLLOW_UP_DUE / LEAD_ASSIGNED / SLA_BREACH /
SITE_VISIT_TODAY / QUOTE_EXPIRING / MENTION), title, body, link, isRead, readAt,
createdAt. TTL 90 days.

INDEXES: `{ organizationId: 1, userId: 1, isRead: 1, createdAt: -1 }`

---

## CROSS-CUTTING SCHEMA RULES

1. Every query goes through a repository helper that injects `organizationId` — it is
   structurally impossible to leak another tenant's data.
2. Every collection has `isDeleted` and a default query filter excluding deleted rows.
3. All enums live in ONE shared `constants/enums.ts` used by Zod, Mongoose and the UI —
   they can never drift apart.
4. Denormalized fields (`assignedToName`, `performedByName`, counters) are updated inside
   the same service function that changes the source of truth.
5. Phone normalization runs in a Mongoose pre-validate hook, so it can never be skipped.
6. `leadCode` and `quotationNumber` are generated with an atomic counter (findOneAndUpdate
   with $inc) — no race conditions on concurrent creates.
