> **Status: APPROVED by the owner (2026-10-22).** The Tech Lead (`techlead`) dispatches work orders to `backend` and `frontend` and reviews every delivery.

# Plan: JPOS subscriptions: manual payment, package-based access, auto-expiry, and how subscribers use JPOS

## Context
The owner wants to sell JPOS as a SaaS to coffee shops.

**Owner requirements (2026-10-22):**
- A subscriber can access **only the package they availed**.
- Payment is **manual**:
  - They pay one of the owner's **payment QRs** and upload the receipt.
  - The **Super Admin is notified**. The subscriber can also message the admin on **Messenger** (facebook.com/joshuapadilla895) with the proof and any questions.
- When the Super Admin **approves**, the package opens, and it **expires automatically on the set date**.
- The Super Admin can **change the payment QRs** at any time.
- **No payment integration.** PayMongo is removed.

The owner left the remaining business logic to the Tech Lead.

**Problem today.** JPOS is **single-shop**:
- All data sits in global collections: `users`, `products`, `categories`, `orders`, `rfidCards`.
- The first admin is created by hand in the Firebase Console.
- "Get Started" only scrolls to the login form.
- A second client would see the first client's data.

**What this needs:**
1. A subscription flow: trial, manual payment, Super Admin approval, expiry.
2. Per-shop data isolation (multi-tenant).
3. Package entitlements.
4. Notifications.
5. An onboarding path so new shops can actually use JPOS.

**Design sources:**
- `docs/backend/SAAS_V1_CONTRACT.md`: the backend's data model, rules and migration. Reused, with the decisions below applied.
- `docs/techlead/SAAS-PLAN.md` §2.5.
- The approved store-QR e-wallet contract: customers pay the shop at the POS.

## Final owner decisions
| Topic | Decision |
|---|---|
| Model | One shared app, **multi-store**: each shop's data is isolated |
| Trial | **7-day free trial, self-serve**, created at signup after email verification. During the trial: **Starter features, 3 accounts** |
| Packages | Tiered, with **features + number of accounts** (table below). The Super Admin can edit prices, limits and features. A shop keeps the entitlements it paid for until its next approval |
| Payment | **Manual and monthly.** The subscriber pays a Super Admin payment QR, uploads a screenshot + the reference no., and the Super Admin approves |
| Payment QRs | The **Super Admin can add, replace, enable and disable** receiving QRs (GCash, Maya, others) at any time. Every change is audit-logged, and each payment request records which QR was used |
| Notifications | **In-app** for the Super Admin: a live bell count + a browser pop-up. **Messenger** button for subscribers (copies the payment details). Subscribers see the approval or rejection live, and get expiry reminders |
| Expiry | **Exact date and time, no grace.** At `currentPeriodEnd` the shop becomes **read-only** automatically: data and reports are visible, sales and edits are blocked. Renewing restores it instantly. Data is never deleted. The trial works the same way at day 7 |
| PayMongo | **Archived** on a local branch (not pushed), then removed |
| Accounts | One shop per login (v1), email + password signup. The owner's current shop is migrated to tenant #1 (Enterprise) |

**Packages** (defaults, editable in Super Admin settings). Features that don't exist (Inventory, Multi-Branch, Advanced Analytics) are removed from the pricing copy.

| | Starter ₱499/mo (also the trial) | Business ₱999/mo | Enterprise ₱1,999/mo |
|---|---|---|---|
| POS: Cash + the shop's own GCash/Maya QR, receipts with QR | ✅ | ✅ | ✅ |
| Menu / products, staff accounts | 3 accounts | 10 accounts | Unlimited |
| Reports: Today / This Week | ✅ | ✅ | ✅ |
| Reports: Month / Custom range + **PDF export** | — | ✅ | ✅ |
| Dashboard sales trends (7-day charts, top items) | — | ✅ | ✅ |
| **RFID card login** for staff | — | ✅ | ✅ |
| Support | Messenger | Messenger | Priority (Messenger) |

## 0. How the team runs (owner: "ikaw na rin ang mag-command sa Backend at Frontend")
- **Tech Lead (`techlead`) dispatches and reviews:**
  - It sends numbered **work orders** to `backend` and `frontend` (scope, exact files, acceptance criteria, dependencies).
  - It reviews every delivery: code read, `tsc --strict`, build, rules tests, and E2E through a QA agent on the emulators.
  - Nothing moves to the next work order until the review passes.
- **Ownership stays:**
  - Backend owns contexts/lib/types/App/rules/scripts/tests.
  - Frontend owns pages/components/styles/public.
  - Logic needed in UI files is written by the backend and applied by the frontend.
- **Commits:** the Tech Lead makes a **checkpoint commit at the end of each phase**, after review (approving this plan = OK for those commits). No Claude co-author. Never pushed without the owner's OK.
- **Deploys:** the owner runs them (the agents are blocked from production deploys), always **app first, then rules**.
- **Phase 0 work order order:**
  - **WO-1** backend: archive + remove PayMongo. This unblocks the POS edits.
  - **WO-2** frontend: finish pulling the demo + the new pricing copy. Runs in parallel with WO-1.
  - **WO-3** backend: finish the store QR + QA lows, then send the POS/Reports diffs to the frontend.
    - Read-only review in plan mode: `saveOrder.ts` (`saveOrderAtomically` + `ReferenceUsedError` + the idempotent retry), `storeSettings.ts` (the single path helper) and the `firestore.rules` blocks (`eWalletOk`, `paymentRefs`, `settings/payments`) match the approved contract ✅.
    - Still needed: emulator rules tests (unit tests exist in `tests/unit/eWallet.test.ts`), type-checking `paymentRefs.createdAt` in the rules, and the docs.
  - **WO-4** frontend: apply the PayMongo UI removal + Payment Settings + POS QR checkout + Reports reconciliation.
  - **WO-5** QA agent: regression on the emulators + `docs/qa/QA-REPORT.md`.
  - **Gate:** Tech Lead review → checkpoint commit.
- **Phases 1–2:**
  1. The backend first writes **contract v2**, folding in the Tech Lead's security stress-test.
  2. The Tech Lead approves it.
  3. Then build, one work order at a time.

---

## 1. Subscriber journey
1. **Landing → Pricing → "Get Started"** on a package goes to `/subscribe?plan=…`. The demo video is **not public**, because it shows the admin side.
2. **`/subscribe`:** shop name, shop link (slug), owner name, email, password, desired package.
3. **Verify email**, then the **7-day trial store** is created instantly:
   - Starter entitlements, the owner as shop admin.
   - Banner: *"Trial: 7 days left · Business package selected · Pay now"*.
4. **Onboarding checklist** (§3).
5. **Pay** any time, at `/admin/billing`:
   - Pick a package, see the price + the **enabled payment QRs** (Super Admin's).
   - Pay with the phone, upload the screenshot, type the reference no., then Submit.
   - Status: *"Pending verification"*.
   - A **"Message the admin on Messenger"** button copies *"JPOS payment · Shop · Package · ₱amount · Ref · Request ID"* to the clipboard and opens Messenger.
6. **Super Admin approves:**
   - The shop gets **the paid package's entitlements immediately**.
   - The period runs until **max(current end, now) + 1 month**, so unused trial or paid days aren't lost.
   - The subscriber sees *"Approved"* live.
   - If **rejected**, the subscriber sees the reason and can resubmit (new reference).
7. **Reminders:** banners at **5, 3 and 1 day(s)** before expiry and on the day itself.
8. **Expiry (exact):** the shop becomes read-only:
   - The POS shows *"Subscription expired: sales paused"*.
   - Admins can view reports and go to Billing to renew.
9. **Plan change:** submit a payment for a different package. On approval, the new entitlements apply immediately and the period is extended.
   - On a downgrade, accounts above the new limit keep working, but no new accounts can be added.
   - RFID stops working if the new package lacks it.

## 2. Access: granted and enforced by Firestore rules (no server)
- **Entitlement snapshot** on `tenants/{T}.entitlements = { plan, staffLimit, rfid, fullReports, pdfExport, trends }`:
  - At trial creation, written by the user's own batch: the rules require it to **equal** `platform/settings.plans.starter.entitlements`.
  - At approval, written by the Super Admin.
- **Trial creation**, one user batch:
  - `tenants/{T}`: `status 'trial'`, `currentPeriodEnd == request.time + 7d`, `ownerUid == me`, `staffCount 1`, Starter entitlements
  - `slugs/{slug}`
  - `users/{me}`: admin, `tenantId T`
  - `trials/{me}`: create-only, **one trial per account**

  It requires `email_verified`. A user can **never** write `status`, dates or entitlements afterwards.
- **writable(T)** = `status in ['trial','active'] && request.time < currentPeriodEnd`. It's required on every tenant write, so expiry is automatic and exact on the server clock.
- **Rules-enforced entitlements** (revenue-critical):
  - **staffCount ≤ staffLimit**: a ±1 counter, changed only in the same batch as a user create/delete and proven with `lastStaffChange` + `existsAfter`/`exists`.
  - **RFID:** `tenants/{T}/rfidCards` writes need `entitlements.rfid`. The public `get` also needs it, so cards stop working on a package without RFID.
- **UI-enforced entitlements:** report ranges, PDF export and trends. They only touch the shop's own data, so low risk. Gated through one `useEntitlements()` hook.
- **Payment request** = one batch of `subscriptionRequests/{id}` (pending) + `subscriptionRefs/{channel}_{REF}` (unique reference). The rules check:
  - the amount equals the price of the chosen package;
  - the requester is that shop's admin;
  - the channel exists and is enabled in `platform/settings`;
  - the snapshot fields (channel label, account hint) match the settings;
  - **one open request per shop** (a `pendingRequestId` on the tenant, which only the request batch and the Super Admin can set).
- **Approval / rejection / suspend:** **Super Admin only** (`platformAdmins/{uid}`, created in the Console).
  - The approval batch updates the tenant (`status 'active'`, period end, entitlements, clears `pendingRequestId`) and the request (`approved`, `reviewedBy`, `reviewedAt`).
  - `suspended` makes the shop read-only at once.
- **Payment-QR changes:**
  - `platform/settings` can be written by the Super Admin only.
  - **Each write must create a matching `platformAudit/{id}` entry in the same batch** (enforced with `existsAfter` + `at == request.time`).
  - Audit entries are create-only and can never be edited or deleted.
- **Isolation:** shop A can never read or write shop B. Rules test #1.

## 3. How shops use JPOS
**Onboarding checklist** (first login; each step ticks itself when done):
1. **Shop profile:** name, logo, address, contact. Stored in `tenants/{T}/settings/profile`, and shown on receipts instead of "JPOS".
2. **Menu:** categories and products.
3. **Staff accounts:** within the package limit. RFID cards for staff on Business and above (never for admins).
4. **Customer payments:** the shop uploads **its own** GCash/Maya QR in Payment Settings.
5. **Counter terminal:** open `…/s/<slug>` on the POS device and bookmark it. Staff sign in with a password, or with RFID if the package has it.
6. **Test sale:** one cash order + a printed receipt.

**Daily use:**
- The cashier signs in and uses the POS.
- **Cash:** change is computed.
- **GCash/Maya:** the shop's QR is shown full-screen to the customer. The cashier enters the reference no. and ticks "received ₱X". A reused reference is blocked.
- Receipt with the order QR.
- **Owner:** the dashboard and reports allowed by the package; per-method totals to reconcile with the wallet statements.

**Help (subscribers only, behind login):**
- `docs/USER-GUIDE.md`, linked in the app.
- At the **very end**, a tutorial video on an in-app Help page, served from protected storage and **never `public/`**.

**Super Admin (owner) console, `/platform`:**
- 🔔 **Bell:** a live count of pending payments, plus a **browser pop-up** while any JPOS tab is open (Notification API, no server).
- **Requests:** a proof image viewer, the QR/channel the subscriber paid to, the amount, the reference, the shop and the package. Actions: approve, or reject with a reason.
- **Shops:** status, package, expiry, account count. Actions: suspend/unsuspend, manual extend.
- **Settings:**
  - payment QRs: add, replace image, label, account name/hint, enable/disable, order
  - package prices, limits and features
  - Messenger link (default `https://m.me/joshuapadilla895`)
  - the audit log of every change

---

## 3a. Notifications (no server)
| To | How |
|---|---|
| Super Admin: new payment | `onSnapshot(subscriptionRequests where status=='pending')`, sorted on the client so no composite index is needed. Bell count + `Notification` pop-up + a sound, while a Super Admin tab is open |
| Super Admin: any time | The subscriber's **Messenger** message. The button copies the details and opens `platform/settings.messengerUrl` (verify `m.me/joshuapadilla895` opens a chat; otherwise fall back to the profile URL) |
| Subscriber: approved / rejected | A live `onSnapshot` on their own requests + tenant; toast + status page |
| Subscriber: expiring / expired | Banners computed from `currentPeriodEnd` (5/3/1 days, the day itself, expired) |

## 4. Data model (changes vs `SAAS_V1_CONTRACT.md` §2)
The contract's model is kept: `platformAdmins`, `platform/settings`, `tenants/{T}`, `slugs`, `users/{uid}.tenantId` (membership), `tenants/{T}/{products,categories,orders,rfidCards,paymentRefs,settings/payments}`, `subscriptionRequests`, `subscriptionRefs`. Paths live only in `src/lib/tenant.ts`.

**Additions and changes:**
- **`tenants/{T}`:**
  - `status: 'trial'|'active'|'suspended'`
  - `currentPeriodEnd` and `createdAt` as **Timestamps**
  - `entitlements {...}`
  - `staffCount`, `lastStaffChange`
  - `pendingRequestId`
  - `desiredPlan`
  - **no `graceDays`**
- **`trials/{uid}`:** `{ tenantId, createdAt }`, create-only.
- **`tenants/{T}/settings/profile`:** `{ name, logoUrl, address, contact }`.
- **`platform/settings`:**
  - `plans.{starter,business,enterprise} = { name, price, entitlements }`
  - `trialDays: 7`
  - `paymentChannels.{id} = { label, qrImageUrl, accountName, accountHint, enabled, order }`
  - `messengerUrl`
  - `lastAuditId`
- **`platformAudit/{id}`:** `{ action, by, at, details }`, create-only.
- **`subscriptionRequests/{id}`:** `{ tenantId, uid, plan, amount, months: 1, channelId, channelLabel, channelAccountHint, reference, proofUrl, status, reason?, reviewedBy?, reviewedAt?, createdAt }`.

## 5. Phases (owner sign-off between phases)
> **Current state (after the session restarts):**
> - Sessions: `techlead [e51fde]`, `backend [638a37]`, `frontend [b5dbcb]`.
> - **PayMongo is NOT archived or removed yet:** `api/` and `src/lib/paymongo.ts` still exist, and there's no archive branch.
> - Frontend was mid-way through pulling the demo: `public/demo/jpos-demo.jpg` is still in `public/`.
> - The backend has started the store QR (`src/lib/{eWallet,saveOrder,storeSettings}.ts`, `tests/`, rules). **Don't deploy those rules until the new app is live** (deploy order).
> - The QA processes are gone, but `docs/qa/QA-REPORT.md` was never written.

| Phase | Backend | Frontend |
|---|---|---|
| **0: Clean up + store QR** (single shop) | Archive and remove PayMongo (§6). Finish the store-QR e-wallet + rules + tests. QA lows: reset `paymentMethod` after each order (`POSComponent.tsx:38,105`); clamp the discount when switching ₱→% (`:366,:383`); toast when `restoreRfidPassword` fails (`AuthContext.tsx:74-76`) | Drop the PayMongo UI. Payment Settings page, POS QR checkout, Reports reconciliation. Pricing copy = the package table above. Finish pulling the demo (`public/demo/` empty, no landing section) |
| **1: Multi-store foundation** | `tenant.ts`, tenant paths, AuthContext "no shop" + tenant state, Staff list `where('tenantId','==',T)`, `/s/:slug` terminal lookup, rules + **isolation tests**, migration script (dry-run → backup → copy → verify; owner shop → tenant #1 Enterprise) | Pages use `tenantCol()`, the `/s/:slug` terminal page, demo mocks |
| **2: Subscriptions, packages, notifications** | `subscriptions.ts`/`platform.ts`/`entitlements.ts`: trial batch (email verified), payment-request batch, approve/reject/renew/suspend, `writable()`, staffCount + RFID entitlement rules, payment channels + audit-enforced settings writes. Rules tests for every abuse case | `/subscribe`, onboarding checklist, `/admin/billing` (channels, proof upload, Messenger button, history), expiry banners, entitlement gating (`useEntitlements`), `/platform` (bell + pop-up, requests, shops, settings incl. payment QRs + audit log), receipt header from the shop profile, `docs/USER-GUIDE.md` |
| **3: Before public launch** | **Blaze + budget alert**, `dailyStats` aggregates, App Check, proof-image cleanup | Polish |
| **Final: tutorial** | Protected video hosting | Re-record with `scripts/demo/` and add the in-app Help page |

**Owner tasks:**
- Create `platformAdmins/{yourUid}`.
- In `/platform/settings`: payment QRs, prices, Messenger link.
- Use a strong password + 2-step verification on the Super Admin login, because it controls where money goes.
- Blaze before launch.
- Terms + Privacy Policy (RA 10173).
- Ask an accountant about the BIR requirements.
- Delete the old admin RFID cards.
- Smoke-test RFID after a Google sign-in in production.

## 6. PayMongo removal (Phase 0)
- **Archive first:** `git worktree add <outside-repo>/JPOS-archive -b archive/paymongo-test HEAD`.
  1. Copy in every PayMongo file, plus the current `POSComponent.tsx`, `orders.ts`, `types/index.ts`, `vite.config.ts`, `vercel.json`, `package.json`, `.env.example` and the demo vite config.
  2. Commit with **no Claude co-author**.
  3. Run `git worktree remove`. Don't push.
  - **Never** run `git clean`, `checkout` or `stash` in the shared tree.
- **Remove:**
  - whole files: `api/**`, `scripts/test-api.mjs`, `src/lib/paymongo.ts`, `src/lib/usePayMongoCheckout.ts`, `public/pay/`, `scripts/demo/mocks/paymongo.ts` + its alias
  - `docs/backend/PAYMONGO.md`, after moving its receipt-QR spec into `BACKEND_CHANGES`
  - reset `vite.config.ts`, `vercel.json` and `.env.example` to HEAD
  - `npm uninstall jose`; drop `test:api`; **build = `tsc && vite build`**
  - `POSComponent.tsx` by hand: PayMongo imports/state/UI, `cartLocked`, `closeCheckout`
  - `orders.ts`: `OnlinePayment`
  - types: drop `paymentProvider`, `paymentSessionId` and `paymentStatus`; **keep `paymentReference` and `paymentNote`**
  - docs: `BACKEND_CHANGES` §20, `CHANGELOG` §14, the demo README, contract D8, `REVIEW.md` §7, `SAAS-PLAN.md`
- **Keep:** the receipt QR (`receiptQr.ts`, `qrcode.react`), `buildOrder`/`takeSnapshot`/`saveOrder`/`placeOrder`, `scripts/demo/`.
- **Owner:** delete `PAYMONGO_SECRET_KEY` from Vercel if it was added.

## 7. Critical files and reuse
- **Rules:** `firestore.rules`
- **Auth and routing:** `src/contexts/AuthContext.tsx`, `src/App.tsx`
- **New libs:** `src/lib/{tenant,subscriptions,platform,entitlements,storeSettings,orders}.ts`, `src/types/index.ts`
- **Pages:** `src/pages/admin/{Staff,Products,Reports,Dashboard}.tsx`, `src/pages/staff/Dashboard.tsx`, `src/components/shared/POSComponent.tsx`
- **Landing:** `src/components/landing/{content.ts,PricingSection.tsx,LoginCard.tsx}`
- **New pages:** `/subscribe`, `/admin/billing`, `/admin/payments`, `/s/:slug`, `/platform/*`
- **Scripts and tests:** `scripts/migrate-to-tenant.mjs`, `tests/rules/*`, `scripts/demo/mocks/firestore.ts`

**Reuse:**
- `createUserWithoutSignIn` (`src/lib/firebase.ts:54`) for staff
- `uploadImage` (`src/lib/cloudinary.ts`) for QR + proof uploads
- `buildOrder` (`src/lib/orders.ts`)
- `getAuthErrorMessage` (`src/lib/authErrors.ts`)
- `PageHeader`, `StatCard`, `Portal`; `AppShell` for `/platform`
- the Staff modal pattern (`Staff.tsx:288`) and the file-input reset (`Staff.tsx:322`)
- the store-QR atomic-reference pattern (`saveOrder.ts`) for `subscriptionRefs`

## 8. Verification
- **Rules suite** (emulator, `tests/rules/`, extends `docs/techlead/firestore-rules.test.mjs`):
  - **Isolation** A↔B
  - Roles
  - **Trial abuse:** status ≠ trial, a period ≠ 7d, non-Starter entitlements, a second trial, a foreign `ownerUid`, a taken slug, an unverified email
  - **Expiry:** writes denied at `currentPeriodEnd` (time-shifted), reads still allowed
  - **Entitlements:** a 4th account on Starter denied; an unpaired staffCount change denied; RFID card writes and `get` denied without RFID
  - **Requests:** wrong amount, disabled or unknown channel, reused reference, another shop's request, a second open request, self-approval
  - **Platform:** only the Super Admin approves or edits settings; a settings write without a matching audit entry is denied; audit entries can't be edited or deleted
  - Store-QR refs
  - The old single-shop app is denied after the switch
- **E2E (the QA agent, emulators):** subscribe → verify → trial → checklist → 3 accounts OK / 4th blocked → cash + e-wallet sale → pay Business with a QR + proof → bell + pop-up for the Super Admin → approve → RFID and PDF unlocked → time-shift past expiry → read-only → renew → restored. Also: the Super Admin swaps the payment QR, and a new request shows the new channel while old requests keep their snapshot.
- **Migration rehearsal** on the emulator with an export of the real data (counts + checksums), then owner sign-off before `--apply`.
- **Every phase:**
  - `tsc --strict`, `vite build` and a bundle secret scan pass.
  - **Deploy the app first, then the rules** (the owner runs `firebase deploy --only firestore:rules`).
  - Smoke-test the owner's shop.
- **Housekeeping at execution start:**
  - Re-establish roles with `backend [638a37]` / `frontend [b5dbcb]` and send them this plan (copy it to `docs/techlead/SUBSCRIPTION-PLAN.md`).
  - Re-run the QA suites and write `docs/qa/QA-REPORT.md`.
  - Checkpoint commit after Phase 0 (no Claude co-author; PayMongo must not enter main's history).

---

## 9. Multi-business POS + subscriber branding (owner decisions, 2026-10-22)
JPOS stops being coffee-only. The owner's choices:
- **Business types:** all four (Food & Drinks, Retail/Sari-sari, Services, Others/custom)
- **Product details:** all four (sizes/variants, add-ons, units + barcode/SKU, dine-in/take-out + table no.)
- **Branding:** full: logo, background, receipt, color theme
- **Landing:** keep the design, rewrite the copy for every small business

### 9.1 Business profile: `tenants/{T}/settings/profile` (single shop until Phase 1: `settings/profile` via a path helper)
`{ name, logoUrl, address, contact, businessType, businessSubtype, features, labels, updatedAt, updatedBy }`

| businessType → subtypes | Default `features` (editable later in Settings → Business) | `labels` |
|---|---|---|
| **food**: café, milk tea, bakery, restaurant/carinderia, fast food/stall | variants ✓, addOns ✓, orderType ✓, tableNumber ✓ (restaurant), units ✗, barcode ✗ | Menu / Item |
| **retail**: sari-sari, convenience, grocery, general merchandise | units ✓, barcode ✓, variants ✓ (size/color), addOns ✗, orderType ✗ | Items / Item |
| **services**: salon, barbershop, laundry (per kg → units ✓), car wash, repair | serviceStaff ✓, requireCustomer ✓, variants ✓ (packages), addOns ✓ (extras), barcode ✗ | Services / Service |
| **custom** | the subscriber ticks what they need | Products / Product |

- **Registration (Phase 2):** pick the type + subtype → the default features are pre-ticked (they can still change them) → optional **"Start with a sample menu"**, which seeds ≤ 20 template categories/products from a static `src/lib/businessTemplates.ts`.
- The UI labels follow `labels` (e.g. the Products page is titled "Menu" / "Items" / "Services").
- Changing the business type later never deletes data.

### 9.2 Product and order model (backend owns the types + pricing logic)
- **Variants:** `variants: { id, name, price }[]`, with an **absolute** price per size (simpler for owners than a modifier). Safe to switch, because no stored product has variants today. With variants, the tile shows "from ₱lowest".
- **Add-ons:** `tenants/{T}/addOnGroups/{id}` `{ name, min, max, options: { id, name, price ≥ 0 }[] }`. These are **shared across products**: edit "Milk tea add-ons" once. Products reference them with `addOnGroupIds`.
- **Units:** `unit` (`pc | pack | box | kg | g | L | mL | m | hr | session`) and `decimalQty` (kg, L, m). Quantity is rounded to 3 decimals. The receipt shows "1.250 kg × ₱80".
- **Barcode/SKU:** `sku`, `barcode`.
  - The POS search box detects scanner input (the same fast-typing detection as RFID, `SCANNER_MS_PER_CHAR`) → exact match → add 1.
  - The Products page warns on duplicate codes.
- **Services:** an optional `durationMin`. When `serviceStaff` is on, each cart line has `serviceStaffId`/`serviceStaffName` (picked from the shop's staff). With `requireCustomer`, a customer name is required at checkout.
- **Cart line identity:**
  - `lineKey = productId + variantId + sorted addOn ids`, which replaces today's `${productId}-${variantId}` keys in `CartContext`.
  - The line price is `variant/base price + Σ add-on prices`, then `roundMoney`.
- **Order snapshot:** each `OrderItem` stores `variantName`, `addOns[{name, price}]`, `unit`, `quantity`, the unit price and the line subtotal. Later edits to the menu never change history.
- **Order:** `orderType: 'dine-in' | 'take-out'` (when enabled); `tableNumber` (dine-in only); `customerName`.
- **Reports gain:**
  - sales by order type
  - sales by staff, for services
  - top items with their variant name

### 9.3 Branding: `tenants/{T}/settings/branding` (single shop until Phase 1: `settings/branding`)
`{ logoUrl, backgroundUrl, theme, receiptHeader ≤120, receiptFooter ≤200, showLogoOnReceipt, updatedAt, updatedBy }`

- **Where it shows** (tenant app only; the JPOS landing and the `/platform` console keep the JPOS brand):
  - sidebar and top bar: the shop logo + name, plus a small "Powered by JPOS"
  - the terminal `/s/:slug` sign-in: the background photo + logo
  - the loading screen
  - receipts: logo, name, address/contact, header/footer lines, plus the order QR
- **Color themes:** 6 presets, `espresso` (default), `matcha`, `berry`, `ocean`, `charcoal`, `sunset`.
  - **Implementation:** the Tailwind palettes keep their names (`espresso`/`caramel`/`cream`/`bark` = the primary/accent/surface/muted roles), but their values become CSS variables (`rgb(var(--espresso-900) / <alpha-value>)`).
  - Each theme redefines the variables under `[data-theme=…]`, so **no component class names change**.
  - `chartTheme.ts`, the toast colors (`main.tsx`), `Decor.tsx` and the few hex literals in `Products.tsx`/`Reports.tsx` must read the variables.
  - Every theme passes WCAG AA contrast.
  - The coffee decorations (beans/branch) are removed from the **tenant** app (they stay on the landing).
- **Assets:**
  - upload with the existing `uploadImage` (Cloudinary)
  - client checks: an image type, a logo ≤ 2 MB (square ≥ 256 px), a background ≤ 5 MB (≥ 1600 px wide)
  - a preview before saving
  - delivered resized through a Cloudinary URL transform helper (`q_auto,f_auto`, sized per slot)
- **Rules:**
  - `branding`: a public `get` (the terminal shows it before sign-in; it holds only public assets), `list` denied
  - writes need `adminOf(T) && writable(T)`, plus validated fields: `^https://` URLs ≤ 500, theme ∈ the presets, text lengths
  - `profile` and `addOnGroups`: read by members, written by admins, the same validation
- **Plans:** branding, themes and every business feature are available on **all packages, including the trial**. The package differences stay as in the packages table (accounts, full reports/PDF, trends, RFID).

### 9.4 Landing copy (platform marketing; design unchanged)
- The hero, features, about, meta title/description, the LoginCard subtitle ("Coffee Shop Point of Sale" → "Point of Sale") and testimonials placeholders are rewritten for **every small business**.
- Add a "Built for" strip of chips: Café · Milk tea · Bakery · Restaurant · Sari-sari · Retail · Salon · Laundry · Car wash.
- The script accent line becomes business-neutral.
- Photos stay for now.

### 9.5 Updated phase order
| Phase | Backend | Frontend |
|---|---|---|
| 0 (now) | WO-1 ✅ · **WO-3** store QR + QA lows | WO-2 ✅ · **WO-2b** landing copy (§9.4) · **WO-4a** Payment Settings page · WO-4b POS QR checkout + Reports (after WO-3) |
| 1: Multi-store | tenancy core (as in §5) | **WO-6** theme tokens → CSS variables + 6 themes + remove the coffee decor from the tenant app (no Firestore; can run alongside the backend's tenancy work) |
| **B: Multi-business POS + branding** | profile/branding/addOnGroups helpers + rules + tests; the product/order model; `CartContext` lineKey + pricing; `businessTemplates.ts` | Products editor (variants, add-on groups, unit, SKU/barcode, duration), POS pickers (variant/add-on sheet, decimal qty, barcode scan, order type/table, service staff), Settings → Business + Branding pages, branded shell/terminal/receipt |
| 2: Subscriptions | as in §5, plus the registration business-type step + sample-menu seeding | `/subscribe` with the business-type + features step, as in §5 |

---

## 10. Owner decisions, 2026-10-23 (these supersede earlier sections where they differ)
| Topic | Decision |
|---|---|
| **Setup mode + 7-day trial** (final) | Signup (`/subscribe`: shop name, link/slug, desired package, email + password, then email verification) creates the shop in **`status: 'setup'`**. In setup mode the shop can **prepare everything** (menu/products, staff, logo/branding, its own GCash/Maya QR) with **Starter limits**, but **the POS is locked**. On "Get Started" the shop chooses either **"Start 7-day free trial"** (once per shop: POS unlocked with Starter features for 7 days from the moment they press it) or **payment** (QR + receipt + reference → approval). When the trial ends without payment, the POS locks again and setup editing stays allowed. Paying during the trial keeps the unused trial days (the paid month starts after the trial end) |
| Access after payment | Only the package they paid for (entitlements snapshot), until the exact `currentPeriodEnd`; then **read-only** (no sales, no edits) until a renewal is approved |
| Payment flow | Account first → **"Get Started" / Billing**: pick a package → the Super Admin's QR(s) + price → pay → **attach the receipt screenshot + reference no.** → "Pending verification". Contact the owner on **Messenger** or by phone **09454454744** (`platform/settings.contactPhone`, editable, shown **behind login only**: Billing + pending pages, not the public landing) |
| Phase order | **P1 multi-store → P2 subscriptions → B multi-business + branding** |
| Interim (live on main) | Pricing buttons open Messenger with a ready-made message, until `/subscribe` exists |
| UI rule | **No emoji icons**; lucide-react only |

### 10.1 Rules impact (replaces the trial parts of contract v2 §3/§4)
- **Shop fields:** `status: 'setup' | 'trial' | 'active'`, `suspended`, `trialUsed` (bool), `trialStartedAt?` (Timestamp), `trialDays` (snapshot from platform settings), `currentPeriodEnd?`.
- **`canSell(t)`** = `!suspended && ((status == 'trial' && request.time < trialStartedAt + trialDays) || (status == 'active' && request.time < currentPeriodEnd))`. Required for orders and paymentRefs.
- **`canSetup(t)`** = `!suspended && (status in ['setup', 'trial'] || (status == 'active' && request.time < currentPeriodEnd))`. Required for products, categories, settings/*, addOnGroups, staff create/delete (+ counter) and rfidCards. So: setup and an ended trial can still edit, and an **expired paid shop is read-only**.
- **Shop creation batch** (self-serve, `email_verified`): `tenants/{T}` (`status 'setup'`, `trialUsed false`, `entitlements ==` platform `plans.starter.entitlements`, `staffCount 1`, `ownerUid == me`, `desiredPlan`), `slugs/{slug}`, `users/{me}` (admin). One shop per login is enforced by `!exists(users/{me})`.
- **Start trial** (the shop admin, once): tenant update where `changed().hasOnly(['status','trialUsed','trialStartedAt','updatedAt'])`, `status` goes `setup → trial`, `trialUsed` goes `false → true`, and `trialStartedAt == request.time`.
- **Approval:** status → `active`; `currentPeriodEnd = max(now, trial end if in trial, current end) + 1 month` (bounds-checked); entitlements = the paid package.
- Payment request / approval / reject / cancel / suspend / audit: unchanged from contract v2 (with C1–C9). Approval moves `setup → active` and sets `currentPeriodEnd = max(now, end) + 1 month` (bounds-checked).
- Housekeeping idea (later): the Super Admin can delete abandoned setup shops (no payment after N days).

