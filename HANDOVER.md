# Phase 10 — What I need from you

Everything on my side is built and tested. These are the decisions and details
only you can supply.

---

## 1. The CRM name — SETTLED: **Alcove CRM**

An earlier working name (Fenestra) was dropped because it clashes with
**Fenesta**, India's largest UPVC windows brand (DCM Shriram Group), and with
**Fenestra Building Solutions** — both in this exact industry.

**Alcove** was checked against the Indian CRM market and the windows/doors
trade and is clear in both. It is architectural without being window-specific,
so it also travels to aluminium, glass and facade clients later.

Still worth doing before you print anything or invoice:

- **Trademark:** [ipindiaonline.gov.in](https://ipindiaonline.gov.in) → Public
  Search → **Class 42** (software) *and* **Class 19 / 6** (building materials —
  where the UPVC brands sit)
- **MCA:** [mca.gov.in](https://www.mca.gov.in) — no registered company on it
- **Domain:** whichever you plan to use as your canonical URL

**Note:** this is the name of the *CRM product*, not your client's business.
Royal UPVC's own name goes in Settings after login, and it is what appears in
WhatsApp templates and on exported files.

---

## 2. Colours — confirm or change

I chose these as an expert call, and here is the reasoning:

| Role | Colour | Why |
|---|---|---|
| Brand | Deep architectural blue `#1E3A8A` | Trust and engineering. Reads as precise and professional, which matches an aluminium-and-glass business. Loud consumer colours would look cheap here. |
| Accent | Amber `#F59E0B` | Used for the Add button and "due today". Warm and energetic without competing with red. |
| Danger | Red `#DC2626` | **Reserved.** Only ever means overdue, lost, or delete — so when a salesperson sees red, it always means the same thing. |
| Success | Emerald `#059669` | Won, connected, completed. |
| Neutrals | Cool grey | Reads like brushed aluminium rather than warm beige. |

Two things worth knowing:

- The **chart colours are not a free choice**. My first palette failed an
  accessibility check — two of the colours were nearly identical to a colourblind
  viewer (and hard to tell apart even with normal vision). I replaced it with a
  validated set and added number labels on every bar, so the charts are readable
  regardless.
- Red is deliberately *not* used for decoration anywhere. That is what keeps the
  overdue warnings meaningful.

If your client has brand colours they want used, send them and I will re-check
the contrast and swap them in.

---

## 3. MongoDB Atlas connection string

Follow **Step 1 in `DEPLOYMENT.md`** — it walks through creating the free
cluster. You will end up with a string like:

```
mongodb+srv://alcove_app:PASSWORD@cluster.xxxxx.mongodb.net/alcove_crm?retryWrites=true&w=majority
```

Choose the **Mumbai (ap-south-1)** region — closest to your client, so the app
feels faster.

---

## 4. The first admin login

Tell me, or set them yourself in `.env.local` before running the seed:

- **Business name** — e.g. `Royal UPVC Doors & Windows`
- **Admin name** — whoever will own the account
- **Admin email** — this is the login
- **Admin password** — 8+ characters with a letter and a number

---

## 5. Lead code prefix

Lead numbers look like `RYL-000123`. Pick a 2–4 letter prefix — `RYL` for Royal
would be the obvious choice. Changeable later in Settings.

---

## 6. Optional — things you may want to confirm

| Setting | My default | Change it if… |
|---|---|---|
| Response time target | 30 minutes | You want a stricter or looser target for calling new leads |
| Sales staff see all leads | **Off** — each rep sees only their own | You want a small team where everyone works everything |
| Require a next step after every call | **On** | …honestly, leave this on. It is the single feature that stops leads being forgotten. Turning it off removes most of the value. |
| WhatsApp country code | 91 (India) | Not India |
| Quotation validity | 15 days | Your client quotes differently |

---

## What happens next

Once you send me the name, the Mongo URI and the admin details:

1. I update the branding
2. You (or I) run `npm run seed` against the live database
3. Deploy to Vercel — `DEPLOYMENT.md` has every step
4. Install on the team's phones from Chrome

---

## Two things to flag before you hand it to the client

**Change the demo data.** If you seeded with `--demo` to look around, run
`npm run seed -- --reset` before going live — it clears the 60 sample leads.

**Backups are manual.** There is a one-click backup in the app, but nobody will
remember to click it. Tell the client: once a month, download the Excel backup
and save it to Google Drive. It takes ten seconds and it is the difference
between a bad day and a disaster.

---

## What is deliberately not built

I left these out on purpose — reasoning is in
`_planning/PHASE-2-CRITIQUE-AND-ARCHITECTURE.md`:

- **Meta / Google API sync** — you asked to skip it. CSV import covers it, and
  it works today rather than after Meta's app-review process.
- **Email campaigns** — needs a paid service, and this market runs on WhatsApp.
- **Call recording / IVR** — needs paid telephony.
- **Invoicing / GST** — the client has Tally; competing with it would be worse
  than integrating later.
- **Full quotation builder with line items and PDF** — this one is worth
  knowing about: the **database is already built for it**. Adding the screen
  later is additive work, not a rewrite. Expect the client to ask for it within
  a month of using the CRM.

---

## Where things stand

| | |
|---|---|
| Screens | 15 |
| API endpoints | 21 |
| Automated tests | 262 assertions, all passing |
| Security | Multi-tenant isolation, RBAC, injection-hardened, audit logged |
| Mobile | Installable PWA, tap-to-call, WhatsApp, save-to-contacts |
| Hosting cost | ₹0 — Vercel + MongoDB Atlas free tiers |
