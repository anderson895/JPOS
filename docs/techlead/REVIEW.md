# Tech Lead Review — 2026-10-22

| | |
|---|---|
| **Role** | Software Development Lead / Tech Lead (code review, technical direction, coordination) |
| **Session** | `jpos-48` |
| **Team** | `fix-jpos-bugs` = backend · `jpos-54` = frontend (UI redesign) |
| **Scope of this round** | Backend bug fixes + Google sign-in (`docs/BACKEND_CHANGES.md`) |
| **Status** | Backend: **approved** (B1–B4 verified; admin-no-RFID approved). Frontend: **approved, F1–F3 verified**. Rules: **62/62 tested and LIVE**. PayMongo: **being designed** |

The Tech Lead does not edit `src/`. Findings go to the owner of each file, with `file:line` and a suggested fix. The owner applies the fix, and the Tech Lead checks it again.

---

## 1. File ownership (agreed with both sessions)

| Owner | Files |
|---|---|
| **Backend** (`fix-jpos-bugs`) | `src/contexts/*`, `src/lib/*`, `src/types/*`, `src/App.tsx`, `README.md` (including the Firestore rules), `docs/BACKEND_CHANGES.md` |
| **Frontend** (`jpos-54`) | `tailwind.config.js`, `src/index.css`, `index.html`, `src/main.tsx`, `src/pages/**`, `src/components/**` (including the new `landing/*` and `shared/*`), `public/*`, `docs/frontend/*` |
| **Tech Lead** (`jpos-48`) | `docs/techlead/*` only |

**Shared files:** some UI files also contain logic from the backend, for example order placement in `POSComponent`, RFID handling in `Staff`, report queries and the PDF in `Reports`, and the dashboard queries.
- Logic findings in these files go to the **backend**. The backend writes the fix and sends the exact change to the frontend, who applies it.
- Purely visual findings go straight to the **frontend**.

---

## 2. Automated checks

| Check | Result |
|---|---|
| `tsc --noEmit` (project settings) | ✅ 0 errors |
| `tsc --noEmit --strict --noUnusedLocals --noUnusedParameters` | ✅ strict passes. Only 3 unused imports, in frontend files that are still being edited: `POSComponent.tsx:8` `CartItem`, `POSComponent.tsx:11` `Percent`, `Staff.tsx:12` `Upload` |
| `vite build` (output to a temp folder, so `dist/` is untouched) | ✅ passes. ⚠️ the main chunk is **1.70 MB** (475 KB gzipped) |
| Unit tests / lint | ❌ the project has neither |

---

## 3. Backend review: verdict and findings

**Verdict: approved.** Every fix in `BACKEND_CHANGES.md` §2 was checked against the source and is correct.
- **Auth:** the `authVersion` guard, `resetSession`, and the Google flow with `isNewUser` cleanup.
- **RFID:** the RFID write batch, checked against all 7 tag cases.
- **Staff:** the rollback in `createUserWithoutSignIn`.
- **Cart:** the clamp and the reset when the user changes.
- **Orders:** order numbers from the document ID (36⁶ possible values).
- **Reports:** the range query with a guard against stale responses.
- **Firestore rules:** every app flow was checked against the new rules.

| # | Severity | Location | Finding | Suggested fix | Owner → applier | Status |
|---|---|---|---|---|---|---|
| B1 | **Medium** | `src/pages/admin/Dashboard.tsx:84-110`, label at `:157` | The "vs yesterday" badge compares a **partial** today with **all** of yesterday. Every morning it shows a big red drop (e.g. −80% at 9 AM) even when sales are normal | Compare with yesterday **up to the same time of day** (`createdAt` from `startOfDay(yesterday)` to `now − 1 day`). Leave the weekly chart as it is. Change the label to "vs same time yesterday" | backend → frontend | ✅ Verified |
| B2 | Low | `src/pages/admin/Reports.tsx:63-66` | When the query fails, the report silently shows ₱0 / empty, which an admin can misread as "no sales" | `toast.error('Failed to load report')` in the `catch` | backend → frontend | ✅ Verified |
| B3 | Low | `src/pages/admin/Dashboard.tsx:77-78` | When loading fails, the page shows ₱0 with no message | `toast.error('Failed to load dashboard')` | backend → frontend | ✅ Verified |
| B4 | Low (cleanup) | `src/contexts/AuthContext.tsx:56-93` | The first-admin bootstrap (`setDoc` with `role: 'admin'`) can no longer run under the new rules. It's dead code that grants admin, which is risky if the rules are ever loosened | Remove the bootstrap and simply `return null` when there's no profile, or at least add a comment pointing to README §4 | backend | ✅ Verified |

**Notes (no code change needed right now)**
- ~~`Order.discount` JSDoc~~ ✅ added in `src/types/index.ts`.
- `tsconfig.json` has `"strict": false`, but the code already passes `--strict`. Recommendation: turn it on after the redesign so regressions get caught.

---

## 4. Decisions for the product owner (the user)

| # | Topic | Risk | Options |
|---|---|---|---|
| D1 ✅ **Decided: (a), no RFID on admin accounts.** Assigned to the backend | **RFID cards hold the real login password in plaintext** (`rfidCards/{tag}`, public `get`) | Anyone who learns a tag number (often printed on the card) gets the email and password. They can then log in from **any** device, not just the terminal. If an admin has an RFID card, that means full admin access. A password the staff member also uses elsewhere (e.g. Gmail) is exposed too | (a) Don't put RFID on admin accounts (no code change) · (b) give RFID accounts a random password generated by the admin (small change) · (c) Cloud Function with a custom token (proper fix, needs the Blaze plan) |
| D2 ✅ **Done:** removed from git, `/dist/` added to `.gitignore` | **`dist/` is committed to git** and holds an old build | A deploy from `dist/` won't include any of today's fixes | If Vercel/Docker builds from source (that's how `Dockerfile` works), remove `dist/` from git and add it to `.gitignore` |
| D3 ✅ **Done:** checkpoint commit `c179cd9` (not pushed) | **Two sessions are editing the same files on `main`, and nothing is committed** | One accidental `git checkout`/reset loses both the backend and frontend work | After the frontend is done and reviewed: one checkpoint commit (or a branch) before deploying |
| D4 ⏳ **Assigned to the backend** (low priority, after PayMongo) | **Bundle size of 1.7 MB.** The login route is now a public landing page | Slow first load on mobile and on POS terminals | Lazy-load the admin/staff routes (`React.lazy` in `App.tsx`) and load `jspdf` only when exporting the PDF |
| D5 | **Cloudinary unsigned upload preset** (in the bundle; `.env` was also in the git history at commit `2fa4c73`) | Anyone can upload to the Cloudinary account (storage/bandwidth abuse). The Firebase `VITE_*` values are public by design, so no rotation is needed | In Cloudinary: limit the preset (formats, max size, folder) |

---

## 5. Frontend review (`jpos-54`, redesign): verdict and findings

**Verdict: approved, with 1 medium and 2 low findings.** `tsc --strict --noUnusedLocals --noUnusedParameters` passes and `vite build` passes. Docs: `docs/frontend/CHANGELOG.md` and `DESIGN-SYSTEM.md`.

| Check | Result |
|---|---|
| `LoginCard.tsx`: RFID `loadingRef`, `firstCharAt` / `SCANNER_MS_PER_CHAR`, the focus loop runs only in RFID mode | ✅ kept (but see F1) |
| `LoginCard.tsx`: `loginWithGoogle()` called directly in the handler, `CANCELLED_SIGN_IN_CODES`, multicolor "G" | ✅ |
| POS: `id="receipt"` plus `@media print`; modals inside `<Portal>` | ✅ (printing still needs a hardware smoke test) |
| Staff `isSelf`; Products `[@media(hover:hover)]`, Save disabled while uploading | ✅ |
| Logic unchanged in the restyled files; post-commit diffs (shadows, gradient, chart height) | ✅ visual only |
| Admin-no-RFID (Staff UI + AuthContext) | ✅ |
| Unused imports | ✅ removed |
| Scroll listeners cleaned up; external links use `noopener,noreferrer` | ✅ |

| # | Severity | Location | Finding | Suggested fix | Status |
|---|---|---|---|---|---|
| F1 | **Medium** | `src/components/landing/LoginCard.tsx:50-53` | In RFID mode the focus loop steals focus every 300 ms from **everything** on the landing page. `focus()` without `preventScroll` also scrolls the page back to the card. Clicking the navbar or typing in the newsletter box (`LandingFooter.tsx:89`) breaks | Leave other text fields alone (`INPUT`/`TEXTAREA`/`SELECT`/contentEditable) and use `focus({ preventScroll: true })`. The loop still runs only in RFID mode | ✅ Verified |
| F2 | Low | `src/components/shared/AppShell.tsx:65` | `h-screen` (100vh) is taller than the visible area on mobile browsers, so the POS "View Order" bar or Logout can end up under the browser toolbar | `h-dvh` | ✅ Verified |
| F3 | Low (a11y) | `AppShell.tsx:75-84` | The closed mobile drawer is only translated off-screen, so Tab still reaches its links | `max-lg:invisible` when closed (also applied to the mobile POS cart) | ✅ Verified |

**For the user (product content, not code):** the placeholder testimonials (fake reviews must not go live), the placeholder pricing, "Inventory Management" being advertised although there's no stock page (this includes the meta description in `index.html`), and the empty external links. See `docs/frontend/CHANGELOG.md` §2.

---

## 6. Firestore rules: test and deploy

| | |
|---|---|
| **File** | `firestore.rules` (repo root), plus `firebase.json` and `.firebaserc` (project `jpos-f801b`). Moved from README §3 by the backend at the Tech Lead's suggestion |
| **Test** | [`firestore-rules.test.mjs`](firestore-rules.test.mjs): **62/62 PASS** in the Firestore emulator, on `firestore.rules` sha256 `9b6945cc…` |
| **Coverage** | Not signed in · stranger with no profile · active, inactive and spoofing staff · admin · inactive admin · every batch: create staff + card, move card X→Y, demote + card, promote + delete card, promote + keep card (denied), admin card (denied), legacy admin card delete (allowed) · the old production code's sequential writes |
| **Old production code** (`origin/main` `3d947f7`) | Compatible: admin-only writes, own `cashierId`, single-card `get`. Expected new denials: an RFID card for an admin |
| **Deploy** | ✅ **Live** on `jpos-f801b`, deployed by the user (`firebase deploy --only firestore:rules`; the deployed file has the same sha as the tested one). Anonymous production probe: `list` on `rfidCards`, `users`, `orders` and `products` → **DENIED** |

To run the test again (Java 21 and firebase-tools needed): copy `firestore.rules` and the test into a folder, run `npm i @firebase/rules-unit-testing@3 firebase@10`, add a `firebase.json` with the Firestore emulator port `8085`, then `firebase emulators:exec --only firestore --project demo-jpos "node firestore-rules.test.mjs"`. **Recommendation:** move it to `tests/` with an npm script (backend).

---

## 7. New feature: PayMongo (TEST mode) for GCash / Maya / Card

| | |
|---|---|
| **Request** | The user wants a payment-integration demo using PayMongo **test** keys. No real charges |
| **Assigned** | Backend designs the API contract, then the frontend builds the POS UI. Tech Lead reviews |
| **Architecture** | Vercel Serverless Functions `/api/paymongo/checkout` and `/status` → PayMongo Checkout Sessions. Firebase ID token checked with `jose` + Google JWKS (no service account). Client `src/lib/paymongo.ts`. Polling, not webhooks. The order is saved only once the payment is `paid`, with a `paymentReference` |
| **Credentials** | The secret key is **server-side only**: `PAYMONGO_SECRET_KEY` with **no** `VITE_` prefix, in `.env` (gitignored) and Vercel env vars. The server refuses any key that isn't `sk_test_`. **The user puts the key in place themselves.** The Tech Lead was blocked from reading `C:\xampp\secure_config`, so no agent copies it |
| **Known limitation** | The amount comes from the client, which is OK for a demo but not for production |

---

## 8. Log

| Time | Event |
|---|---|
| 2026-10-22 | Tech Lead role set up. Ownership agreed with `fix-jpos-bugs` and `jpos-54` |
| 2026-10-22 | Backend review done; B1–B4 sent to `fix-jpos-bugs`. Frontend review on hold, at `jpos-54`'s request (redesign in progress) |
| 2026-10-22 | B1–B4 re-checked and **verified** in the source. B1 → `Dashboard.tsx:66-71`, `:104/111/118`, `:166`. B2 → `Reports.tsx:67-74`. B3 → `Dashboard.tsx:88`. B4 → `AuthContext.tsx` `fetchUserProfile` + README §4. `tsc` and `tsc --strict` pass |
| 2026-10-22 | User decisions: **no RFID on admin accounts** (task given to `fix-jpos-bugs`; the frontend applies the Staff.tsx UI part), **remove `dist/`**, **commit**. |
| 2026-10-22 | `dist/` removed from git. `/dist/` and `.claude/` added to `.gitignore`. Checkpoint commit **`c179cd9`** by JARP after `tsc`, `tsc --strict` and `vite build` passed. Not pushed. **Rule: no Claude co-author/contributor in commits.** `reference_UI/` and `software_development_startup_roles.md` were left out of the commit (untracked) |
| 2026-10-22 | The user logged in to the Firebase CLI. Admin-no-RFID approved. Rules moved to `firestore.rules` and tested in the emulator: **62/62 PASS**. Production deploy **blocked by auto-mode** → the user deploys |
| 2026-10-22 | New request: **PayMongo test-mode** demo (GCash/Maya/Card). Assigned to the backend with the architecture and credential rules. Reading the key file was blocked → the user puts `PAYMONGO_SECRET_KEY` in `.env` themselves |
| 2026-10-22 | Frontend review done: **approved with F1 (medium) and F2–F3 (low)**, sent to `jpos-54`. Bundle splitting (D4) assigned to the backend |
| 2026-10-22 | F1–F3 re-checked and **verified** (LoginCard.tsx:50-59 focus guard + preventScroll; AppShell `h-dvh` + `max-lg:invisible`; the POS cart has the same a11y fix). `tsc --strict --noUnused` passes |
| 2026-10-22 | The user **deployed the rules** and set up the authorized domain. Verified: the deployed file sha `9b6945cc…` = tested; anonymous list on rfidCards/users/orders/products → DENIED in production |
| 2026-10-22 | **PayMongo contract v1 approved** with A1–A7: ownership check on `/cancel`, cart snapshot + lock + amount check, placing the order only once, centavo rounding, ₱20 minimum, server-side return URL origin, dev plugin `apply:'serve'` + `tsc -p api` in the build, and tests. The receipt QR (user request) is approved. One `npm install` (jose + qrcode.react), run by the backend |
| 2026-10-22 | `jpos-54` committed **`dc11ecf`** (frontend only, no Claude line). New task for `jpos-54`: a **landing page demo video** (MP4 ≤3 MB with a poster, mock data only, lazy-loaded and played when in view, reduced-motion fallback, captions as text). v1 now; v2 after PayMongo |
| 2026-10-22 | **Google sign-in enabled** by the user and confirmed working in production. A **QA agent** started (E2E with Playwright against the Firebase **emulators**, project `demo-jpos`, fake API key, no repo edits). Report: `docs/qa/QA-REPORT.md` |
| 2026-10-22 | **PayMongo review: approved**, with **P1 (bug, reported by the user):** `/api/paymongo/config` returns 503 in local dev. `vite.config.ts:8` `SERVER_ENV` doesn't copy `VITE_FIREBASE_PROJECT_ID` into `process.env`. User workaround: `FIREBASE_PROJECT_ID=jpos-f801b` in `.env` + a dev-server restart. **P2:** "Retry saving" after `save_failed` (avoids a double charge). 33/33 api tests and the bundle secret scan pass |
| 2026-10-22 | **New direction from the user:** GCash/Maya through **each store's own QR** (scanned manually). Business rules: admin-only `settings/payments`, a required reference number + a "received" checkbox, atomic `paymentRefs` uniqueness, a rules check that e-wallet orders carry a ref, and reconciliation in Reports. PayMongo stays dormant. Sent to `fix-jpos-bugs` (contract first) and `jpos-54`. SaaS plan written: `docs/techlead/SAAS-PLAN.md` (waiting for the strategy decision) |
| 2026-10-22 | **Session restart.** New names: Tech Lead = `fix-jpos-bugs [3e4810]`, backend = `fix-jpos-bugs [1e1ba9]`, frontend = `jpos-83`, plus `jpos-26` (role check for renaming). The QA agent was resumed (its emulators were still running). P1 **verified** (temp server :5190, garbage token → 401, not 503). Code splitting done: main chunk 1,729 → 742 kB |
| 2026-10-22 | **User decision: remove PayMongo** entirely, and SaaS subscriptions are paid via **manual QR + proof upload**, approved by the platform owner (`SAAS-PLAN.md` §2.5). Removal on hold pending the user's archive answer. **E-wallet store-QR contract v1 approved** without the PayMongo parts (deploy order: new app first, then rules). Backend is writing the **SaaS v1 multi-tenant contract** (design only) |
| 2026-10-22 | **The owner approved the subscription plan** (`docs/techlead/SUBSCRIPTION-PLAN.md`): 7-day trial (Starter), tiered packages (features + accounts), manual QR payment + proof upload, Super Admin approval, notifications (in-app + Messenger), **exact expiry → read-only**, payment QRs editable by the Super Admin with an audit log. The owner put the Tech Lead **in command of backend/frontend**. The demo video is confidential (pulled from the public site; the final tutorial goes behind login at the very end) |
| 2026-10-22 | Sessions renamed `techlead [e51fde]` / `backend [638a37]` / `frontend [b5dbcb]`. **WO-1** (backend: archive + remove PayMongo) and **WO-2** (frontend: pull the demo off `public/`, new pricing copy) dispatched. A security stress-test of the trial/entitlement/subscription rules is running (it feeds contract v2). The orphan rules-test emulator (pid 5016) was stopped |
| 2026-10-22 | **WO-1 ✅ verified:** archive `b6d643c` (no Claude lines, unpushed, 27 files); PayMongo is gone from src/config; api/ is removed; build = `tsc && vite build`. **WO-2 ✅ verified:** public/demo absent (output gitignored), no unsupported features, the package pricing is in the copy; tsc --strict --noUnused + the build pass (main chunk 743 kB). **New owner direction:** multi-business POS (food/retail/services/custom; variants, add-ons, units + barcode, order type/table, service staff) + subscriber branding (logo, background, receipt, 6 color themes); the landing copy goes generic. Plan §9 written |
| 2026-10-22 | **Phase 0 reviewed and committed as `7c57485`** (JARP, 0 Claude lines, unpushed, 69 files; the confidential demo video is excluded). Verified: rules **105/105 Stage A and 105/105 Stage B** (my harness), tsc --strict --noUnused, 17/17 unit tests, build, bundle secret scan, no PayMongo. **Stage A rules approved for the user to deploy**; Stage B only after the new app is live. Next: backend contract v2 (subscriptions + §9), frontend WO-6 (theme tokens). The stress-test agent hit an API limit, so its checklist was handed to the backend for v2 |
| 2026-10-22 | **User deployed Stage A rules and pushed `main` to GitHub** (`3d947f7..2ddf0af`; the user's own commit `2ddf0af` adds reference_UI/ + the roles doc). Verified: archive/paymongo-test NOT on the remote, no mp4/.env in the pushed tree, no Co-authored-by trailers (the only 'claude' text is the .claude/ folder name in the c179cd9 message). Waiting for the Vercel deploy to be confirmed live → then Stage B |
| 2026-10-22 | **Contract v2 (`docs/backend/SAAS_V2_CONTRACT.md`) approved with C1–C9.** D-a (a separate `suspended` flag) and D-b (trial end = server createdAt + trialDays) approved. **C1 critical:** the P1 cutover order is fixed, because deploying the app before the migration would put every existing user in "no shop". The order is now: migrate → deploy app → delta sync → reload terminals → rules + indexes → smoke test (`docs/backend/CUTOVER.md`). C2: approval can't change `suspended`. C3: self-create field whitelist + no RFID. C4: public pricing source for the landing. C5: the shop can cancel its own pending request. C6: `tenant.adjust` audit action. C7: request pre-flight diagnosis. C8: deploy indexes too. C9: Stage B separately, once Vercel is live. Next: P1-a backend; frontend WO-6 → P1-b |
| 2026-10-23 | **Full-stack mode:** the owner closed the backend/frontend sessions; techlead now implements everything. Reviewed the owner-committed WO-6 (`7712792`, themes as CSS variables): the dev switcher was tree-shaken from prod, the landing forces the default theme, tsc + build pass. **Owner: no theme switcher in the app; themes go in each store's Branding settings (Phase B)**, so DevThemeSwitcher was removed. **Stage B applied in the repo** (the reference is required); rules suite 105/105; live app verified on jpos-mu.vercel.app → owner deploys |
| 2026-10-23 | Stage B rules **deployed by the owner**; anonymous probe on production: rfidCards/users/orders/products/paymentRefs/settings all DENIED. **Owner decisions:** phase order is now **P1 → P2 (subscriptions) → B (multi-business + branding)**; interim pricing CTAs go to **Messenger** (shipped on main). P1 started in worktree `D:/Downloads/JPOS-p1` (branch `p1-multistore`, no .env, emulator-only testing) |
