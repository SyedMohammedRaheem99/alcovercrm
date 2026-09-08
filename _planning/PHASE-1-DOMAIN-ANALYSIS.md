# PHASE 1 — DOMAIN ANALYSIS: UPVC / Aluminium / WPC Fenestration Business

## 1.1 Who is the client?
"Royal UPVC Doors & Windows" — a FACTORY (manufacturer + fabricator), not a reseller.
This is critical. A factory-based fenestration business has a fundamentally different
sales cycle than a retail/e-commerce business.

## 1.2 The REAL sales cycle (this drives the entire CRM design)

Digital Ad (Meta/Google)
  -> Lead form fill (name, phone, city, maybe product interest)
  -> CALL within minutes (speed-to-lead is EVERYTHING in fenestration)
  -> Qualify: Is it a new house? Renovation? Builder? How many windows? Timeline? Budget?
  -> SITE VISIT / MEASUREMENT  <-- THE critical conversion gate
  -> Quotation (per sq.ft pricing x area, by product+series+glass)
  -> Negotiation / revised quotes (2-4 rounds is normal)
  -> Advance payment (usually 50-70%)
  -> Production at factory
  -> Installation
  -> Final payment + handover
  -> Warranty period / service calls
  -> Referral (HUGE in this industry - neighbours see the windows)

KEY INSIGHT: The gap between "lead" and "sale" is 2 weeks to 8 MONTHS.
Under-construction houses: someone enquires at slab stage, buys at finishing stage.
This means LONG-TERM NURTURE is not optional. Most leads are NOT lost - they are EARLY.
A CRM that only tracks "hot leads this week" will throw away 60% of the pipeline value.

## 1.3 Why leads are being lost right now (the actual problem to solve)
1. Lead comes on WhatsApp/Excel/phone -> no single place -> forgotten
2. Called once, "will call back later" -> nobody sets a reminder -> dead
3. Site visit promised -> not scheduled -> customer goes to competitor
4. Quotation sent -> no follow-up cadence -> customer forgets
5. "Call after Diwali" / "after slab work" -> 3-month gap -> zero system to resurface it
6. No visibility into WHICH ad/source produces real revenue -> ad spend wasted

=> THE CRM'S #1 JOB: NEVER LET A FOLLOW-UP FALL THROUGH. Everything else is secondary.

## 1.4 Product taxonomy (must be modelled properly, not a free-text field)

MATERIAL (top level):
  - UPVC
  - Aluminium
  - WPC
  - PVC
  - uPVC-Aluminium composite (rare, but exists)

PRODUCT TYPE:
  Windows:
    - Sliding (2 track / 3 track / 4 track)
    - Casement (openable)
    - Tilt & Turn
    - Fixed / Picture
    - Top Hung / Awning
    - Bay window
    - Combination / Louvered
    - Villa window / Arched
  Doors:
    - Sliding door
    - Casement door
    - French door
    - Lift & Slide / Slide & Fold (Bi-fold)
    - Main door (WPC / PVC)
    - Bathroom door (PVC / WPC) - high volume, low ticket
    - Flush door
  Other:
    - Ventilators (louvered / fixed / exhaust cut-out)
    - Fixed louvers
    - Partitions / Office glazing
    - Mosquito mesh / Insect screen (openable, sliding, pleated, retractable)
    - Grills / Safety grills (integrated)
    - Balcony railings (aluminium/glass)
    - Shower cubicles (glass)
    - ACP cladding / Facade (aluminium fabricators often do this)
    - Skylights / Pergola / Roofing

GLASS (a real, separate spec that changes price a LOT):
  - Plain / Clear (4mm, 5mm, 6mm, 8mm, 10mm, 12mm)
  - Frosted / Etched
  - Tinted (bronze, blue, green, grey)
  - Reflective
  - Toughened / Tempered
  - Laminated
  - DGU / Double Glazed (insulated) - premium
  - Georgian / Grill-in-glass
  - Sandblast design

HARDWARE / SERIES: brand-dependent (Fenesta-style series naming). Keep as free text +
a configurable master list, because every factory has its own series names.

## 1.5 Lead qualification fields THAT ACTUALLY MATTER in this industry
- Property type: Independent House / Villa / Apartment / Commercial / Office / Builder Project / Renovation
- Construction stage: Planning / Foundation / Slab / Brickwork / Plastering / Finishing / Ready (this predicts timeline better than anything)
- Approx. area (sq.ft) or number of windows/doors -> ticket size proxy
- Budget range
- Timeline: Immediate (<15d) / 1 month / 2-3 months / 3-6 months / 6+ months
- Decision maker: Owner / Spouse / Architect / Contractor / Builder
- Site location (area/locality) -> drives site-visit routing AND ad geo-targeting insight
- Competitor quotes received? (yes/no + who)

## 1.6 Lead sources (must be tracked with UTM-level granularity WITHOUT paid API)
- Meta Ads (Facebook / Instagram) - manual CSV export from Meta Lead Center
- Google Ads / Google Search
- Google My Business (GMB) - massive for local fenestration
- JustDial / IndiaMART / Sulekha (India lead marketplaces - very common here)
- Website form
- WhatsApp enquiry
- Walk-in / Showroom
- Referral (existing customer) -> MUST link to the referring customer
- Architect / Interior designer / Contractor channel partner
- Builder / Developer
- Hoarding / Banner / Pamphlet
- Exhibition / Trade show
- Cold call / Field marketing
- Repeat customer

## 1.7 Roles needed (keeping it simple as requested, but future-proof)
- SUPER ADMIN (you/agency) - sees everything, manages orgs/settings
- ADMIN (factory owner) - sees everything in his org, reports, ad spend ROI
- MANAGER (sales head) - sees team's leads, reassigns, approves discounts
- SALES / TELECALLER - sees own assigned leads only (or all, configurable)
- (future) INSTALLER / SITE - only sees jobs assigned to them

Simple now, but RBAC must be in the schema from day 1 or retrofitting is hell.

## 1.8 Multi-tenancy decision
User said: "if later another client asks me... it should be scalable"
=> Build with an `organizationId` on EVERY document from day one.
   Cost now: ~2 hours. Cost of retrofitting later: ~2 weeks + data migration risk.
   DECISION: Multi-tenant from day 1. Single deployment, org-scoped data.

## 1.9 Mobile-first realities (the salesperson is on a bike, one-handed, in sunlight)
- Tap-to-call MUST be one tap from the lead list (tel:)
- WhatsApp MUST be one tap with a PRE-FILLED message (wa.me/91XXXXXXXXXX?text=)
- "Save to phone contacts" -> generate a .vcf download (works on Android+iOS, no API)
- Big touch targets (min 44px), thumb-reachable bottom nav
- Must work on a bad 3G connection -> optimistic UI, minimal payloads
- PWA installable (manifest + service worker) - "Add to Home Screen"
- Offline read of today's follow-up list would be ideal (service worker cache)

## 1.10 Non-negotiable constraints from the user
- NO paid third-party integrations, NO Meta/Google API (for now)
- CSV/Excel import + export must be first-class
- Vercel hosting (free tier) + MongoDB Atlas (free tier)
- Must be genuinely secure
- Backup/export of all client data (weekly/monthly downloadable)
- Zero questions until Phase 10
