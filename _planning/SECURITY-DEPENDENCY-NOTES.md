# Dependency Security Decisions (Phase 4)

Recorded so these choices are auditable later and not silently re-broken.

## 1. Next.js — UPGRADED 15.5.4 -> 16.3.4
npm flagged CVE-2025-66478 in 15.5.4. Since this app holds customer PII, shipping a
known-vulnerable framework version was not acceptable. Upgraded to the patched 16.x line
and aligned `eslint-config-next` to the same major version.

## 2. Mongoose — UPGRADED 8.9.5 -> 9.9.5
A high-severity advisory affected the 8.x version originally pinned. Mongoose touches
every single query in this app, so it was patched to the current major.
NOTE: this is a major-version bump. All model/query code in this project is written
against the 9.x API. Verified working via the typecheck and build in Phase 9.

## 3. xlsx (SheetJS) — REMOVED, replaced with exceljs
`xlsx@0.18.5` from the public npm registry is abandoned and carries two HIGH severity
advisories with **no fix available**:
  - GHSA-4r6h-8v6p-xvw6  Prototype Pollution
  - GHSA-5pgg-2g8v-p4x9  ReDoS
This library was going to parse **user-uploaded files** — precisely the untrusted input
path those CVEs exploit. Keeping it would have been the single biggest security hole in
the product. Replaced with `exceljs@4.4.0`, which is maintained and has no direct
advisories.

## 4. eslint — PINNED to ^9 (currently 9.39.5)
eslint 10 breaks peer compatibility with the Next.js lint plugin set (eslint-plugin-
import / jsx-a11y / react all cap at 9). Pinned back to 9.x. The remaining low-severity
advisory is in a **dev-only linting tool** that never runs in production or touches user
input — accepted risk, deliberately.

## 5. exceljs -> uuid (moderate) — ACCEPTED, NOT REACHABLE
`npm audit` reports GHSA-w5hq-g745-h8pq against the `uuid` version exceljs depends on.
The advisory requires calling uuid `v3/v5/v6` **with a `buf` argument**.
Verified by inspecting the dependency source:
  node_modules/exceljs/lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js
  -> `const {v4: uuidv4} = require('uuid')` and calls `uuidv4()` with NO arguments.
So the vulnerable code path is not reachable from this application.
The suggested `npm audit fix --force` would DOWNGRADE exceljs to 3.4.0 (a breaking
change) to silence a non-exploitable warning — rejected as a worse trade.

## Net result
- HIGH severity issues: 0
- Remaining: 2 moderate, both verified non-reachable; 1 low, dev-only tooling.

Re-verify with `npm audit` after any dependency change.
