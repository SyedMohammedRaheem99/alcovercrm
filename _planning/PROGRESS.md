# BUILD PROGRESS — COMPLETE

All ten phases delivered. See HANDOVER.md for what is needed from the client.

## Phases 1-3 — Analysis
Three deep passes: domain analysis of the fenestration sales cycle, a written
self-critique that changed twelve decisions, then the full data model with
index design, feature spec, screen map and design system.
Files: PHASE-1-DOMAIN-ANALYSIS.md, PHASE-2-CRITIQUE-AND-ARCHITECTURE.md,
PHASE-3A-DATA-MODEL.md, PHASE-3B-FEATURES-AND-DESIGN.md

## Phase 4 — Foundation
Next.js 16 + React 19 + TypeScript strict + Tailwind. Ten Mongoose models with
every index designed against a real query. Shared enum module as the single
source of truth. Phone normalisation, timezone-correct dates, lead scoring.
Idempotent seed script. Dependency security pass (SECURITY-DEPENDENCY-NOTES.md).

## Phase 5 — Auth and multi-tenancy
JWT in an httpOnly cookie (jose, Edge-compatible), bcrypt cost 12, four roles
with a server-enforced permission matrix, rate limiting plus account lockout,
audit logging with redaction, and a repository layer that makes a cross-tenant
query structurally impossible.

## Phase 6 — Leads core
Design system, app shell (sidebar on desktop, bottom nav on mobile), login,
leads list with URL-synced filters, detail page with timeline, add/edit forms
with live duplicate detection, the call-log modal that enforces the discipline
rule, bulk actions, and contact utilities (tel:, wa.me, vCard, maps).

## Phase 7 — Dashboard and reporting
MongoDB aggregations for every metric. Dashboard that opens on overdue
follow-ups rather than vanity numbers. Follow-up workspace, pipeline board,
site visits, and the source ROI report. Charts use an accessibility-validated
palette with direct labels.

## Phase 8 — Data in and out
CSV/Excel import with automatic column detection, messy-data coercion, per-row
error reporting and rollback. Filtered exports. Full tenant backup in JSON and
Excel. Settings and team management with privilege-escalation guards.

## Phase 9 — PWA and documentation
Installable PWA: manifest, real PNG icons, a conservative service worker that
never caches API responses, and an offline page. Profile page. README and
DEPLOYMENT guide.

## Phase 10 — Handover
HANDOVER.md — the short list of what only the client can decide.

## Verification
- `npx tsc --noEmit` clean
- `npx next build` clean, 37 routes
- `npm test` — 217 assertions across 5 suites
- `npm run test:e2e` — 45+ assertions against a real server and database

## Known follow-on work (schema already supports it)
- Quotation line-item builder and PDF
- Payment / EMI tracking
- Auto-assignment rules
- WhatsApp template editing UI
