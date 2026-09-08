# PHASE 3B — FEATURE SPEC, SCREEN MAP, DESIGN SYSTEM

---

## 3B.1 FEATURE LIST (final, prioritised)

### MUST-HAVE (v1 ships with all of these)

**Auth & Access**
- Email/password login, httpOnly JWT cookie
- 4 roles with server-enforced permissions
- Multi-tenant org isolation
- Change password; admin can reset a user's password
- Account lockout after 5 failed attempts (15 min)
- Audit log of sensitive actions

**Lead Capture**
- Quick Add (mobile-optimised): name + phone + source = 3 taps and done
- Full Add form with every qualification field
- CSV / Excel import with column mapping + duplicate detection
- Duplicate warning while typing a phone number that already exists
- Auto lead code (RYL-000001)

**Lead Management**
- List view: search, filter (stage, source, assignee, priority, city, product,
  date range, follow-up status), sort, paginate
- Pipeline / Kanban board with drag-to-change-stage (desktop) and tap-to-move (mobile)
- Lead detail: full profile, timeline, quotations, follow-up panel
- Inline stage change with mandatory next-action or close-reason
- Bulk actions: assign, change stage, add tag, delete, export selection
- Soft delete + restore

**Communication (zero API cost)**
- One-tap call (`tel:`) which auto-opens the call-log modal on return
- One-tap WhatsApp (`wa.me`) with template placeholder substitution
- Save contact to phone (.vcf download)
- Copy phone / copy address
- Open Google Maps directions from the address

**Follow-up Engine (the core discipline)**
- Every call log requires next follow-up OR a close reason
- Quick presets: +2h, Tomorrow 10am, +3 days, +1 week, +1 month, custom
- Dashboard buckets: OVERDUE (red), TODAY (amber), TOMORROW, THIS WEEK, UPCOMING
- Snooze / reschedule with a reason
- In-app notification bell

**Dashboard & Analytics**
- KPI cards: total leads, new today/week/month, contacted, in pipeline, won, lost,
  conversion %, total pipeline value, won value
- Overdue + today's follow-ups panel (the first thing you see)
- Uncontacted leads (SLA breach) alert
- Today's site visits
- Charts: leads over time, by source, by stage (funnel), by city/area, by product,
  by material, won vs lost, per-user performance
- Date range filter across the whole dashboard
- Source ROI table: leads -> contacted -> qualified -> won, conversion % per source

**Data & Backup**
- Export leads to CSV / Excel with the current filters applied
- Full backup: complete JSON of every collection, one click
- Per-collection CSV backup bundle
- Import history with per-row error reporting

**Settings**
- Org profile, business hours, SLA minutes
- Masters management (products, materials, glass, sources, lost reasons, tags, areas)
- WhatsApp message templates
- Team management: invite, edit role, deactivate, reset password

**Mobile / PWA**
- Fully responsive down to 360px
- Installable PWA (manifest + service worker + icons)
- Bottom tab navigation on mobile
- Offline shell + cached today's follow-up list
- Large touch targets, sticky action bar on lead detail

### NICE-TO-HAVE (built if time permits in P9)
- Lead scoring (auto 0-100)
- Site-visit calendar view
- Global keyboard shortcuts (desktop power users)
- Dark mode
- Saved filter views

### EXPLICITLY DEFERRED (schema-ready, not built in v1)
- Quotation line-item builder + PDF
- Payment / EMI tracking
- Auto-assignment rules
- Meta/Google API sync
- Email sending

---

## 3B.2 LEAD SCORING (auto, transparent, no ML)

Score 0-100, recomputed on save. Shown as a HOT/WARM/COLD chip with a tooltip breakdown.

| signal | points |
|---|---|
| Timeline IMMEDIATE / WITHIN_1_MONTH | +25 / +18 |
| Construction stage FINISHING / PLASTERING / READY | +20 / +15 / +12 |
| Budget provided and >= 1.5L | +12 |
| Area >= 500 sqft or units >= 10 | +12 |
| Decision maker is SELF | +8 |
| Source REFERRAL / ARCHITECT / BUILDER / WALK_IN | +15 |
| Answered at least one call (outcome CONNECTED) | +10 |
| Site visit completed | +20 |
| Quotation sent | +15 |
| No contact after 3 attempts | -15 |
| Has competitor quote | -5 |
| Timeline 6_PLUS_MONTHS | -10 |

Clamp 0-100. HOT >= 65, WARM 35-64, COLD < 35. Manual override allowed (sticky).

---

## 3B.3 SCREEN MAP

```
PUBLIC
  /login
  /forgot-password (admin-reset flow message)

APP (authenticated shell: sidebar desktop / bottom-nav mobile)
  /dashboard              KPIs, follow-up buckets, alerts, charts
  /leads                  list + filters + bulk actions
  /leads/new              full add form
  /leads/[id]             detail + timeline + activity composer
  /pipeline               kanban board
  /follow-ups             dedicated follow-up workspace (overdue/today/week)
  /site-visits            scheduled visits list + calendar
  /quotations             quotation list (light)
  /reports                analytics, source ROI, team performance
  /import                 CSV/Excel upload + mapping + result report
  /backup                 export & full backup (ADMIN)
  /settings               org, masters, templates (ADMIN)
  /settings/team          user management (ADMIN)
  /settings/audit         audit log (ADMIN)
  /profile                own profile + change password

SUPER ADMIN
  /admin/organizations    tenant management
```

MOBILE BOTTOM NAV (5 items, thumb-optimised):
`Dashboard | Leads | [+ Quick Add FAB] | Follow-ups | More`

---

## 3B.4 DESIGN SYSTEM

**Positioning:** premium B2B SaaS, not a template. It must feel calm and fast in
daylight on a phone, and dense and powerful on a laptop.

**Colour rationale.** The client is UPVC/aluminium/glass — an architectural, precise,
metallic industry. Loud consumer colours would look cheap and would also make the
urgency signals (red overdue) lose meaning. So: a deep architectural blue as the brand
anchor (trust, engineering, professional), a warm amber accent (energy, action, matches
"today"), and a strictly reserved semantic palette where red ONLY ever means "overdue /
lost / danger". Neutrals are slightly cool-grey to read like brushed aluminium.

```
BRAND
  primary        #1E3A8A  deep architectural blue   (nav, primary buttons, links)
  primary-600    #1D4ED8  hover
  primary-50     #EFF6FF  tinted backgrounds
  accent         #F59E0B  amber                     (FAB, "today", highlights)

SEMANTIC (reserved meanings — never decorative)
  danger         #DC2626  overdue, lost, delete
  warning        #F59E0B  due today, needs attention
  success        #059669  won, connected, completed
  info           #0EA5E9  scheduled, informational

STAGE COLOURS (the pipeline must be readable at a glance)
  NEW                    #64748B slate
  CONTACTED              #0EA5E9 sky
  QUALIFIED              #6366F1 indigo
  SITE_VISIT_SCHEDULED   #8B5CF6 violet
  SITE_VISIT_DONE        #A855F7 purple
  QUOTED                 #F59E0B amber
  NEGOTIATION            #F97316 orange
  WON                    #059669 emerald
  LOST                   #DC2626 red
  ON_HOLD                #94A3B8 grey

PRIORITY
  HOT #DC2626 · WARM #F59E0B · COLD #64748B

NEUTRALS (cool grey — "brushed aluminium")
  bg #F8FAFC · surface #FFFFFF · border #E2E8F0
  text-primary #0F172A · text-secondary #475569 · text-muted #94A3B8
```

**Typography:** Inter (variable, self-hosted via next/font — no external request, works
offline in the PWA). Scale: 12/14/16/18/20/24/30/36. Tabular numerals for all metrics.

**Spacing:** 4px base scale. Radius: 8px controls, 12px cards, 999px chips.
**Shadows:** subtle only — sm for cards, md for dropdowns, lg for modals.
**Motion:** 150-200ms ease-out. Respect `prefers-reduced-motion`.

**Accessibility:** all text >= 4.5:1 contrast; state is never conveyed by colour alone
(overdue also shows a "!" icon and the word "Overdue"); focus rings on every control;
min 44x44px touch targets.

**Component inventory to build:** Button, IconButton, Input, Textarea, Select,
MultiSelect, DatePicker, DateTimePicker, Checkbox, Radio, Switch, Chip/Badge, Avatar,
Card, StatCard, Table (responsive -> card list on mobile), Modal/Drawer (bottom sheet on
mobile), Tabs, Dropdown, Toast, EmptyState, Skeleton, Pagination, SearchInput,
FilterBar, Timeline, StageBadge, PriorityBadge, ConfirmDialog, FAB, BottomNav, Sidebar,
Topbar, PageHeader, Spinner.

---

## 3B.5 THE 5 UX DECISIONS THAT MAKE OR BREAK THIS

1. **Dashboard opens on ACTION, not vanity metrics.** Overdue + today's follow-ups are
   the top of the screen. KPI cards come second. The user must know what to do in the
   first 2 seconds.
2. **No dead-end leads.** Closing a call modal without setting a next action or a close
   reason is not possible. This is the whole reason the CRM exists.
3. **Quick Add is 3 fields.** Name, phone, source. Everything else optional and
   collapsed. A salesperson adds a lead while standing at a site in 10 seconds.
4. **Call button is always visible** on the lead card and pinned on the detail screen.
   Returning from a call auto-prompts "How did it go?" so logging is one tap.
5. **Every list is filterable and every filter is shareable via URL** — so the owner can
   send "look at this view" to his sales head.
