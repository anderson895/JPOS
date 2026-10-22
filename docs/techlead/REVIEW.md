# Tech Lead Review — 2026-10-22

| | |
|---|---|
| **Role** | Software Development Lead / Tech Lead (code review, technical direction, coordination) |
| **Session** | `jpos-48` |
| **Team** | `fix-jpos-bugs` = backend · `jpos-54` = frontend (UI redesign) |
| **Scope of this round** | Backend bug fixes + Google sign-in (`docs/BACKEND_CHANGES.md`) |
| **Status** | Backend: **approved — all 4 fixes verified**. Frontend: **review on hold** until `jpos-54` finishes the redesign |

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
| D1 | **RFID cards hold the real login password in plaintext** (`rfidCards/{tag}`, public `get`) | Anyone who learns a tag number (often printed on the card) gets the email and password. They can then log in from **any** device, not just the terminal. If an admin has an RFID card, that means full admin access. A password the staff member also uses elsewhere (e.g. Gmail) is exposed too | (a) Don't put RFID on admin accounts (no code change) · (b) give RFID accounts a random password generated by the admin (small change) · (c) Cloud Function with a custom token (proper fix, needs the Blaze plan) |
| D2 | **`dist/` is committed to git** and holds an old build | A deploy from `dist/` won't include any of today's fixes | If Vercel/Docker builds from source (that's how `Dockerfile` works), remove `dist/` from git and add it to `.gitignore` |
| D3 | **Two sessions are editing the same files on `main`, and nothing is committed** | One accidental `git checkout`/reset loses both the backend and frontend work | After the frontend is done and reviewed: one checkpoint commit (or a branch) before deploying |
| D4 | **Bundle size of 1.7 MB.** The login route is now a public landing page | Slow first load on mobile and on POS terminals | Lazy-load the admin/staff routes (`React.lazy` in `App.tsx`) and load `jspdf` only when exporting the PDF |
| D5 | **Cloudinary unsigned upload preset** (in the bundle; `.env` was also in the git history at commit `2fa4c73`) | Anyone can upload to the Cloudinary account (storage/bandwidth abuse). The Firebase `VITE_*` values are public by design, so no rotation is needed | In Cloudinary: limit the preset (formats, max size, folder) |

---

## 5. Pending: frontend review (when `jpos-54` is done)

Checklist taken from the contract in `BACKEND_CHANGES.md` §13 plus the redesign:

- [ ] `LoginCard.tsx`: `loadingRef` true/false around the RFID scan; `firstCharAt` / `SCANNER_MS_PER_CHAR`; the 300 ms focus loop runs **only** in RFID mode, and it must not steal focus from the landing page's other inputs and links
- [ ] `LoginCard.tsx`: `loginWithGoogle()` is called directly in the click handler (nothing awaited before it); `CANCELLED_SIGN_IN_CODES` are ignored; the official multicolor "G" is kept
- [ ] POS: `id="receipt"` and the `@media print` rules in `index.css`; modals inside `<Portal>`
- [ ] Staff: `isSelf` protection; Products: `[@media(hover:hover)]` and Save disabled while uploading
- [ ] Logic in the restyled files is **unchanged** compared with the backend version (check with `git diff`)
- [ ] Unused imports removed (§2)
- [ ] Responsive at 360 px / 768 px / 1280 px; text contrast on the dark espresso surfaces
- [ ] Image weight: `public/coffeelogo.png` (1.1 MB) still used? `reference_UI/` (7.8 MB): commit it, or keep it out of git?
- [ ] Re-run `tsc`, `tsc --strict` and `vite build`

---

## 6. Log

| Time | Event |
|---|---|
| 2026-10-22 | Tech Lead role set up. Ownership agreed with `fix-jpos-bugs` and `jpos-54` |
| 2026-10-22 | Backend review done; B1–B4 sent to `fix-jpos-bugs`. Frontend review on hold, at `jpos-54`'s request (redesign in progress) |
| 2026-10-22 | B1–B4 re-checked and **verified** in the source. B1 → `Dashboard.tsx:66-71`, `:104/111/118`, `:166`. B2 → `Reports.tsx:67-74`. B3 → `Dashboard.tsx:88`. B4 → `AuthContext.tsx` `fetchUserProfile` + README §4. `tsc` and `tsc --strict` pass |
