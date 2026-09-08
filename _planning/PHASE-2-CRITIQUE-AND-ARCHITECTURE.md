# PHASE 2 — SELF-CRITIQUE OF PHASE 1 + ARCHITECTURE LOCK

## 2.1 What did I get WRONG or MISS in Phase 1? (brutal self-review)

**MISS #1: I treated "Lead" and "Customer" as one entity without justifying it.**
In fenestration, once a lead converts the relationship CONTINUES for years (service,
warranty, referrals, second property). But splitting them into two collections creates
sync hell and doubles the UI.
DECISION: ONE `Lead` collection with a lifecycle `stage`. A "customer" is just a lead
with stage=WON, plus a `customerSince` date. Keeps the UI single and keeps full history
intact. This is what Pipedrive-style CRMs get right and Salesforce gets wrong for SMBs.

**MISS #2: I forgot QUOTATIONS are the actual heartbeat of this business.**
The client will ask for this within 2 weeks of using the CRM. But a full quotation
builder (line items, sq.ft calc, GST, PDF) is a 3-phase project by itself.
DECISION: Build a LIGHT quotation record in v1 — amount, validity, status, revision
number, notes, optional file link. The schema carries an `items[]` array from day 1, so
the full builder is additive later, not a rewrite.

**MISS #3: I ignored DUPLICATE LEADS. This is the #1 data-quality killer.**
Same person fills a Meta ad twice, or calls after filling the form. Two records = two
salespeople calling the same guy = customer thinks you are disorganised.
DECISION: Phone number is the natural key. Unique compound index on
(organizationId, phoneNormalized). Import must detect duplicates and offer
merge/skip/update. Normalize phone aggressively: strip +91, leading 0, spaces, dashes,
parentheses -> store the last 10 digits.

**MISS #4: I said "follow-ups" but never defined the mechanism precisely.**
A follow-up is not a field, it is a first-class concept, and the dashboard is basically
a query over it. Also: a lead should NEVER sit in a state with no next action. That is
exactly how leads die.
DECISION: `nextFollowUpAt` DENORMALIZED onto the Lead document (indexed) so the
dashboard is ONE fast query, not a join. Plus an `Activity` collection for full history.
Enforce in the UI: logging a call REQUIRES either "set next follow-up" or "close the
lead with a reason". No silent dead ends. This single rule IS the product.

**MISS #5: I did not think about WHO gets the lead (assignment).**
With 1 owner + 2 telecallers manual assignment is fine, but "unassigned leads" must be
screamingly visible or they rot.
DECISION: `assignedTo` field + an "Unassigned" filter pinned on the dashboard.
Auto-assign / round-robin is future, but the field exists now.

**MISS #6: Speed-to-lead measurement — the biggest ROI lever in this industry.**
Calling a Meta lead within 5 minutes converts roughly 8x better than at 60 minutes.
DECISION: Track `firstContactedAt`. Report average response time, and flag leads
uncontacted for more than 30 minutes as CRITICAL on the dashboard. The client will feel
this immediately, and no local competitor has it.

**MISS #7: Lost reasons. Without them ad spend cannot be optimised.**
DECISION: Mandatory structured `lostReason` enum when closing: Price too high / Chose
competitor / Project postponed / Just enquiring / Wrong number / Not reachable / Out of
service area / Budget mismatch / Material we do not supply / Duplicate. Plus free text.

**MISS #8: I planned a "notes" field but real usage needs a TIMELINE.**
Every call, WhatsApp, site visit, quote, stage change and note must be an immutable
timeline entry with who and when. This doubles as the audit trail.

**MISS #9: Site visits are a distinct, schedulable, assignable event with an address.**
Not just "an activity". They need a calendar view and a "today's site visits" widget.
DECISION: Activity with type=SITE_VISIT carrying scheduledAt + address + assignedTo, so
it reuses the Activity model but surfaces in its own view.

**MISS #10: WhatsApp templates.** The salesperson types the same message 40x a day.
DECISION: Configurable templates with {{name}}, {{product}} placeholders, one tap to
open WhatsApp pre-filled. Zero API cost, huge daily time saver.

**MISS #11: The backup requirement needs to be REAL, not a CSV of one table.**
DECISION: Full-database JSON export plus per-collection CSV export, downloadable by
Admin, covering every collection — not just leads.

**MISS #12: Security was vague in Phase 1.** Concrete spec now in 2.4.

## 2.2 What should I NOT build? (scope discipline)

- Email campaigns / SMTP — needs a paid service, and this market does not run on email
- Meta / Google API integration — explicitly excluded; CSV import covers it
- IVR / call recording — requires paid telephony
- Invoicing / GST accounting — the client has Tally; do not compete with it
- Inventory / production planning — a different product entirely
- Visual workflow-automation builder — over-engineering for a 5-person team
- Native mobile app — PWA covers it, explicitly agreed
- Real-time chat / collaboration — not needed at this scale
- (deferred, schema-ready) Full quotation line-item builder
- (deferred, schema-ready) Payment / EMI tracking

## 2.3 ARCHITECTURE LOCK

Stack — all free-tier, all Vercel-native:

- Next.js 15 (App Router) + React 19 + TypeScript (strict)
- MongoDB Atlas (free M0) via Mongoose 8
- Auth: custom JWT in an httpOnly cookie + bcrypt.
  Why not NextAuth: it adds config weight and version churn, while we need simple
  email/password with roles and org scoping. Roughly 200 lines of well-tested code,
  zero dependency risk, full control of the session payload.
- Tailwind CSS v4 (zero-config; no PostCSS chain to break on Vercel)
- Zod validation on every API boundary
- Recharts for dashboard charts (lightweight, React-native, free)
- papaparse for CSV, SheetJS (xlsx) for real Excel files
- Hand-rolled service worker for PWA (fewer breakages on Next 15 than next-pwa)

Why Next.js Route Handlers instead of a separate Express backend: one deployment, one
repo, one env config on Vercel, zero CORS. Server Components render data-heavy views
without client waterfalls. A separate backend means two hosts, two deploys and CORS pain
for zero benefit at this scale.

Data-layer principles (the "no gaps" requirement):

1. EVERY document carries `organizationId` (indexed), enforced at a repository layer so
   it cannot be forgotten in a query.
2. Soft deletes (`isDeleted`, `deletedAt`, `deletedBy`) — never lose customer data.
3. `createdBy` / `updatedBy` on everything.
4. Timestamps on everything.
5. Compound indexes designed against the ACTUAL dashboard queries, not guessed.
6. Denormalize the few fields the list view needs (assignedToName, stage,
   nextFollowUpAt) to avoid N+1 population on the hot path.
7. Zod schema is the single source of truth; the Mongoose schema mirrors it exactly.

## 2.4 SECURITY SPEC (concrete)

- bcrypt cost 12; password field `select: false` so it is never returned
- JWT (HS256) in an httpOnly + Secure + SameSite=Lax cookie, 7-day expiry
- Middleware guards every app and API route; unauthenticated -> redirect or 401
- Org scoping enforced server-side on EVERY query — never trust a client-sent orgId
- Role checks server-side on every mutating endpoint, not just hidden UI buttons
- Zod validation on every request body and query string; reject unknown keys
- Rate limiting on the login endpoint plus account lockout after N failed attempts
- No secrets in client bundles; strict public/private env var separation
- Mongoose strict mode and explicit field whitelisting on update (no mass assignment)
- NoSQL injection: never pass raw user input into query operators; strip `$` keys
- Audit log for sensitive actions (delete, export, role change, login)
- CSRF: SameSite=Lax + same-origin API + a custom header check on mutations

## 2.5 THE 10 PHASES (locked)

- P1 — Domain analysis (done)
- P2 — Critique and architecture lock (this document)
- P3 — Feature spec, data model, index design, screen map, brand and design system
- P4 — Project scaffold, DB layer, all Mongoose models, seed script
- P5 — Auth, RBAC, multi-tenancy, middleware, audit log
- P6 — Leads core: CRUD, list with filters/search/pagination, detail, timeline
- P7 — Follow-up engine, dashboard, analytics and reports
- P8 — CSV/Excel import and export, backup system, settings/masters, team management
- P9 — PWA, mobile polish, call/WhatsApp/vCard, QA hardening, documentation
- P10 — HANDOVER: what I need from you (Mongo URI, brand name, colour confirm, deploy)
