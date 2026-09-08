# Alcove CRM

A lead-management CRM built for UPVC / aluminium / WPC doors-and-windows businesses.

Its single most important job: **never let a follow-up fall through.**

---

## Quick start (5 minutes)

```bash
# 1. Install
npm install

# 2. Configure
#    Create .env.local in the project root — see "Environment variables" below
#    for the exact contents. It is gitignored and never committed.

# 3. Create the first login + default dropdown lists
npm run seed

#    ...or seed with 60 sample leads so you can look around first:
npm run seed -- --demo

# 4. Run
npm run dev
```

Open http://localhost:3000 and sign in with the email/password you set in
`.env.local`.

---

## Environment variables

Create a `.env.local` file in the project root with these keys. This file is
gitignored — real credentials never belong in the repository.

```bash
MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/alcove_crm?retryWrites=true&w=majority"
JWT_SECRET="a-long-random-string-at-least-32-characters"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Only needed when running `npm run seed`
SEED_ORG_NAME="Your Business Name"
SEED_ADMIN_NAME="Admin"
SEED_ADMIN_EMAIL="admin@yourbusiness.com"
SEED_ADMIN_PASSWORD="ChooseAStrongPassword1"
```

On Vercel, only the first three are required — set them under
*Settings → Environment Variables*.

| Variable | Required | What it is |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB Atlas connection string |
| `JWT_SECRET` | yes | Random string, 32+ characters, used to sign login sessions |
| `NEXT_PUBLIC_APP_URL` | yes | The app's public URL |
| `SEED_ADMIN_EMAIL` | seed only | The first admin login |
| `SEED_ADMIN_PASSWORD` | seed only | That admin's password (8+ chars, letter + number) |
| `SEED_ORG_NAME` | seed only | Your business name |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm run seed` | Create the org, admin and default lists |
| `npm run seed -- --demo` | Also add 60 realistic sample leads |
| `npm run seed -- --reset` | Wipe this org's data and start fresh |
| `npm test` | Run all test suites |
| `npm run test:e2e` | Boot a real server + DB and drive it over HTTP |
| `npm run typecheck` | TypeScript check only |

---

## What the CRM does

**Lead capture**
- Quick Add — name, phone, source, done in about 10 seconds on a phone
- Full form with fenestration-specific qualification (construction stage,
  timeline, materials, glass, area, budget)
- CSV / Excel import with automatic column matching
- Duplicate detection while you type, matched on phone number regardless of
  formatting (`+91 98765 43210` and `09876543210` are the same person)

**The follow-up engine — the core of the product**
- Logging a call *requires* either a next follow-up or an explicit reason for
  closing the lead. There is no way to leave a lead with no next step.
- Dashboard opens on overdue and today's follow-ups, not on vanity metrics
- Quick presets: +2 hours, tomorrow 10am, +3 days, next week, next month

**Speed-to-lead**
- Tracks the time from lead arrival to first successful contact
- Flags new leads not called within your target (default 30 minutes)

**Communication — no paid APIs**
- One-tap call (`tel:`)
- One-tap WhatsApp with pre-filled templates (`wa.me`)
- Save to phone contacts (`.vcf` download)
- Directions to a site from the address or a pasted Maps link

**Pipeline & reporting**
- Kanban board across the ten pipeline stages
- Source ROI table: leads → contacted → qualified → won, per channel
- Team performance, product demand, lost-reason analysis, location breakdown

**Data safety**
- One-click full backup (Excel or JSON), Admin only
- Filtered exports that match exactly what is on screen
- Soft deletes everywhere — nothing is ever really destroyed
- Import rollback if a bad file gets uploaded

**Mobile**
- Installable as an app from Chrome ("Add to Home Screen") — no app store
- Bottom navigation with a centre Quick Add button
- Works one-handed; 44px minimum touch targets

---

## Roles

| | Super Admin | Admin | Manager | Sales |
|---|---|---|---|---|
| See all leads | ✔ | ✔ | ✔ | own only\* |
| Create / edit leads | ✔ | ✔ | ✔ | ✔ |
| Delete / reassign | ✔ | ✔ | ✔ | ✘ |
| Import | ✔ | ✔ | ✔ | ✘ |
| Export / backup | ✔ | ✔ | ✘ | ✘ |
| Manage team | ✔ | ✔ | ✘ | ✘ |
| Settings | ✔ | ✔ | ✘ | ✘ |
| Reports | ✔ | ✔ | ✔ | own only |

\* Configurable — Settings has a "Sales staff can see all leads" toggle for
small teams.

Permissions are enforced on the server. Hiding a button is a usability choice,
never the security control.

---

## Architecture

```
src/
  app/
    (app)/           authenticated screens (dashboard, leads, reports, settings…)
    api/             route handlers
    login/           sign-in
  components/
    ui/              design system (Button, Input, Modal, Card, Badge, Toast…)
    layout/          app shell, page header
    leads/           lead card, form, timeline, activity modal
  lib/
    models/          Mongoose schemas + indexes
    services/        business logic (leads, analytics, import, export, audit)
    auth/            JWT, permissions, session
    validation/      Zod schemas — every API boundary
    db/              connection + tenant-scoping repository
    utils/           phone, dates, sanitising, contact links
    constants/       enums — the single source of truth
```

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript (strict) ·
MongoDB + Mongoose 9 · Tailwind CSS · Zod · Recharts

**Key decisions and why**

- **Multi-tenant from day one.** Every document carries `organizationId`, and
  every query goes through a `scoped()` helper that injects it from the session
  — never from the request. Retrofitting this later would be a rewrite.
- **Custom JWT auth rather than NextAuth.** We need email/password with roles
  and org scoping; that is ~200 lines with full control and no version churn.
- **Phone number is the natural key.** Normalised to the last 10 digits and
  enforced by a unique compound index, so duplicates are impossible rather than
  merely discouraged.
- **Denormalised `nextFollowUpAt`** on the lead document, indexed — the
  dashboard's main query is a single indexed lookup, not a join.
- **Aggregations run in MongoDB**, not in JavaScript. On a free-tier cluster,
  shipping thousands of documents to a serverless function is the difference
  between a fast dashboard and a timeout.

---

## Testing

```bash
npm test        # models, auth, tenancy, analytics, import/export
npm run test:e2e   # real server + real DB, driven over HTTP
```

The e2e suite is the meaningful one — it boots the production build against a
seeded database and checks that pages render, auth actually blocks, duplicates
are caught, and the follow-up rule fires.

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step MongoDB Atlas + Vercel
setup.

---

## Not built (deliberately)

These were considered and left out — see `_planning/PHASE-2-CRITIQUE-AND-ARCHITECTURE.md`:

- Email campaigns (needs a paid service; this market runs on WhatsApp)
- Meta / Google API sync (CSV import covers it without API approval delays)
- Call recording / IVR (needs paid telephony)
- Invoicing / GST accounting (the client has Tally)
- Full quotation line-item builder — **the database schema is ready for it**, so
  adding the UI later is additive, not a rewrite
