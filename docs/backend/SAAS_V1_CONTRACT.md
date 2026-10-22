# SaaS v1: Backend Contract (proposal, no code yet)

| | |
|---|---|
| **Author** | Backend (`fix-jpos-bugs [1e1ba9]`) · 2026-10-22 |
| **For** | Tech Lead review (`fix-jpos-bugs [3e4810]`), then the owner's go-ahead |
| **Based on** | `docs/techlead/SAAS-PLAN.md` §2.5 (manual QR billing) and option **B** (multi-tenant) |
| **Status** | **CONTRACT ONLY.** Nothing in here is built. The owner still has to confirm multi-tenant |

## Contents
0. [Decisions needed from the owner](#0-decisions-needed-from-the-owner)
1. [Principles](#1-principles)
2. [Data model](#2-data-model)
3. [Identity, tenant resolution and routing](#3-identity-tenant-resolution-and-routing)
4. [Firestore rules contract](#4-firestore-rules-contract)
5. [Flows](#5-flows)
6. [Migration: the current shop becomes tenant #1](#6-migration-the-current-shop-becomes-tenant-1)
7. [Rules test plan](#7-rules-test-plan)
8. [What the frontend needs](#8-what-the-frontend-needs)
9. [Spark quota and when Blaze is needed](#9-spark-quota-and-when-blaze-is-needed)
10. [Phasing](#10-phasing)
11. [Impact on existing code](#11-impact-on-existing-code)
12. [Risks and open points](#12-risks-and-open-points)

---

## 0. Decisions needed from the owner

| # | Question | Backend recommendation |
|---|---|---|
| D1 | Go multi-tenant (option B) at all? | Yes, but in phases (§10). The store-QR e-wallet can ship first for the current shop |
| D2 | Can one login belong to **more than one** shop? | **No in v1** (one shop per account). Much simpler rules and UI; a later version can add it |
| D3 | Plans and prices (₱/month) and what each plan limits (e.g. number of staff) | Prices are stored in `platform/settings` so they can change without a deploy. Pricing must only list features that exist (SAAS-PLAN §4) |
| D4 | Grace period after the paid month ends | **3 days**, then the shop is read-only until a renewal is approved |
| D5 | Self-signup with Google, or email + password only? | **Email + password** on the subscribe page in v1. The login page keeps rejecting unknown Google accounts |
| D6 | RFID terminals | Each shop gets its own terminal address, `/s/<shop-slug>`. The tag lookup stays as today (one card per tag, password stored on the card) in v1; see §12 for the server option that removes stored passwords |
| D7 | Move to Firebase **Blaze** | Before the **2nd paying shop** at the latest (§9), with a budget alert |
| D8 | PayMongo | **Done:** archived on the local branch `archive/paymongo-test` (`b6d643c`, not pushed) and removed from the app (BACKEND_CHANGES §20) |

---

## 1. Principles

- **No server in v1.** Every write is a client write, and the **Firestore rules are the security boundary**. That matches the manual-billing decision: no gateway, no service account, no Blaze requirement for code.
- **Tenant isolation is the #1 property.** A shop can never read or write another shop's data, whatever the client sends.
- **One place knows the paths.** Tenant paths come from a single helper (`src/lib/tenant.ts`), the same way `paymentSettingsRef()` keeps the e-wallet settings path in one place today.
- **Authority lives in the rules, not in the UI.** Read-only after expiry, plan prices, and unique payment references are all enforced in the rules.
- **Money references are unique, atomically.** The same "reference document created in the same batch" pattern as store-QR `paymentRefs`, reused for subscription payments.

---

## 2. Data model

`T` = a tenant id (Firestore auto id). Timestamps the rules compare against (`currentPeriodEnd`, `createdAt` on requests) are stored as **Firestore Timestamps**, not ISO strings, so the rules can do date math with `request.time`.

| Path | Fields | Written by |
|---|---|---|
| `platformAdmins/{uid}` | `{ name, createdAt }` | **Firebase Console only** (the platform owner) |
| `platform/settings` | `{ plans: { basic: {name, price, staffLimit}, … }, gcash: Wallet, maya: Wallet, graceDays: 3, updatedAt, updatedBy }`, where `Wallet = {enabled, qrImageUrl, accountName, accountHint}` (the platform's own receiving QR) | Platform admins |
| `tenants/{T}` | `{ name, slug, plan, status: 'active'\|'suspended', currentPeriodEnd: Timestamp, graceDays, ownerUid, createdAt, updatedAt }` | Platform admins (create on approval, extend on renewal, suspend) |
| `slugs/{slug}` | `{ tenantId }` | Platform admins (created with the tenant; makes slugs unique) |
| `users/{uid}` | **Today's profile plus `tenantId`**: `{ tenantId, email, displayName, role: 'admin'\|'staff', isActive, rfidTag, photoURL, createdAt, updatedAt }` | Platform admins (a shop's first admin, on approval); that shop's admins (their staff) |
| `tenants/{T}/products`, `/categories`, `/orders`, `/rfidCards/{tag}` | Same shapes as today | That shop's users, with today's role rules |
| `tenants/{T}/paymentRefs/{method}_{REF}` | `{ orderId, orderNumber, cashierId, method, reference, createdAt }` | That shop's cashiers, in the same batch as the order |
| `tenants/{T}/settings/payments` | The store's GCash/Maya QR (store-QR contract) | That shop's admins |
| `subscriptionRequests/{id}` | `{ kind: 'new'\|'renewal', uid, email, shopName, desiredSlug, tenantId?, plan, months: 1, amount, method: 'gcash'\|'maya', reference, proofUrl, status: 'pending'\|'approved'\|'rejected', reason?, reviewedBy?, reviewedAt?, createdAt }` | The requester creates it (pending); platform admins review it |
| `subscriptionRefs/{method}_{REF}` | `{ requestId, uid, createdAt }` | The requester, in the same batch as the request |

Why **membership on `users/{uid}`** (a `tenantId` field) instead of `tenants/{T}/members/{uid}`:
- It's one `get()` in the rules, the same document the rules already read today for `isAdmin()`/`isActiveUser()`, so it adds no extra rule cost.
- It enforces "one shop per account" (D2) by construction.
- The current AuthContext, Staff page and rules functions keep their shape; they just gain a tenant check.
- If D2 later becomes "many shops per account", `users/{uid}` becomes the pointer to the active shop and `tenants/{T}/members/{uid}` holds the roles. That can be planned then.

---

## 3. Identity, tenant resolution and routing

### Who you are after signing in (AuthContext)
| State | Meaning | Where the app sends you |
|---|---|---|
| Signed out | — | Landing / login |
| **No shop** (signed in, no `users/{uid}`) | A subscriber waiting for approval, or a removed account | `/subscribe/status`: shows their pending or rejected requests. No shop data is readable (rules) |
| Member, shop **active** | `users.tenantId` set, shop active | `/admin` or `/staff`, as today |
| Member, shop **expired** (past `currentPeriodEnd` + grace) or **suspended** | — | Same pages, read-only, with a banner. Admins see "Renew" |
| Platform admin | `platformAdmins/{uid}` exists | `/platform` (requests, tenants, platform settings). Can also be a member of a shop |

- AuthContext exposes `{ currentUser, tenant: { id, name, slug, plan, status, currentPeriodEnd, readOnly }, isPlatformAdmin }`. `tenant` comes from a live `onSnapshot`, so an approval or renewal shows up without reloading.
- Today's guard stays: a deactivated user is signed out.
- **Change:** "no profile" no longer means "sign out". It means "no shop": the app shows the subscribe status page. This is safe because the rules give an account without a profile access to nothing but its own requests.

### Paths
`src/lib/tenant.ts`: `tenantCol(name)` / `tenantDoc(name, id)` build `tenants/{T}/…` for the signed-in user's shop. Every page uses them instead of `collection(db, 'orders')`.

### RFID terminals (D6)
- The address `/s/<slug>` resolves `slugs/{slug}` → `tenantId` (public `get`).
- The tag lookup becomes `tenants/{T}/rfidCards/{tag}` (public `get`, `list` denied, the same as today).
- Login then checks that `users/{uid}.tenantId == T`. A card from shop A can't open shop B's terminal.
- The plain `/login` page keeps password and Google login for everyone; the RFID tab appears only on `/s/<slug>`.

### Staff creation
Same as today: a shop admin creates the login on a secondary app and writes `users/{newUid}` with **their own** `tenantId`. The rules force the tenant id to match.

---

## 4. Firestore rules contract

Pseudo-rules that define the behavior; the real file follows after approval.

```
function signedIn()       { return request.auth != null; }
function me()             { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
function isPlatformAdmin(){ return signedIn() && exists(/databases/$(database)/documents/platformAdmins/$(request.auth.uid)); }
function tenant(t)        { return get(/databases/$(database)/documents/tenants/$(t)).data; }
function memberOf(t)      { return signedIn() && me().tenantId == t && me().isActive == true; }
function adminOf(t)       { return memberOf(t) && me().role == 'admin'; }
// Paid up: active, and still inside the paid month + grace days
function writable(t)      { return tenant(t).status == 'active'
                              && request.time < tenant(t).currentPeriodEnd + duration.value(tenant(t).graceDays, 'd'); }

match /tenants/{t} {
  allow read:   if memberOf(t) || isPlatformAdmin();
  allow create, update, delete: if isPlatformAdmin();

  match /{coll}/{id} {                       // products, categories, orders, settings, …
    allow read: if memberOf(t) || isPlatformAdmin();
  }
  match /products/{id}   { allow write: if adminOf(t) && writable(t); }
  match /categories/{id} { allow write: if adminOf(t) && writable(t); }
  match /orders/{id} {
    allow create: if memberOf(t) && writable(t)
                  && request.resource.data.cashierId == request.auth.uid
                  && ewalletRefOk(t, id, request.resource.data);   // store-QR contract, now under the tenant
    allow update, delete: if adminOf(t) && writable(t);
  }
  match /paymentRefs/{key} { /* store-QR contract: create-only + order pairing; update false; delete adminOf(t) */ }
  match /settings/payments { allow write: if adminOf(t) && validPaymentSettings(...); }
  match /rfidCards/{tag} {
    allow get: if true;  allow list: if false;              // terminal lookup before sign-in
    allow create, update: if adminOf(t) && writable(t)
      && getAfter(/databases/$(database)/documents/users/$(request.resource.data.userId)).data.tenantId == t
      && getAfter(/databases/$(database)/documents/users/$(request.resource.data.userId)).data.role != 'admin';
    allow delete: if adminOf(t);
  }
}

match /users/{uid} {
  allow read: if signedIn() && (request.auth.uid == uid || adminOf(resource.data.tenantId) || isPlatformAdmin());
  // a shop admin creates/edits only their own shop's people, and can't move anyone to another shop
  allow create: if (adminOf(request.resource.data.tenantId) && writable(request.resource.data.tenantId))
                || isPlatformAdmin();
  allow update: if (adminOf(resource.data.tenantId) && request.resource.data.tenantId == resource.data.tenantId)
                || isPlatformAdmin()
                || (request.auth.uid == uid && onlyChanges(['displayName','photoURL','updatedAt']));
  allow delete: if adminOf(resource.data.tenantId) || isPlatformAdmin();
}

match /slugs/{slug}          { allow get: if true; allow list: if false; allow write: if isPlatformAdmin(); }
match /platformAdmins/{uid}  { allow get: if signedIn() && request.auth.uid == uid; allow write: if false; }
match /platform/settings     { allow read: if signedIn(); allow write: if isPlatformAdmin(); }

match /subscriptionRequests/{id} {
  allow read:   if signedIn() && (resource.data.uid == request.auth.uid || isPlatformAdmin());
  allow create: if signedIn()
    && request.resource.data.uid == request.auth.uid
    && request.resource.data.status == 'pending'
    && request.resource.data.amount == get(/databases/$(database)/documents/platform/settings).data.plans[request.resource.data.plan].price
    && request.resource.data.reference.matches('^[A-Z0-9]{6,30}$')
    && request.resource.data.proofUrl.matches('^https://.*')
    && request.resource.data.createdAt == request.time
    && existsAfter(/databases/$(database)/documents/subscriptionRefs/$(request.resource.data.method + '_' + request.resource.data.reference))
    && (request.resource.data.kind == 'new'
        ? !exists(/databases/$(database)/documents/users/$(request.auth.uid))      // no shop yet
        : adminOf(request.resource.data.tenantId));                                  // renewal by that shop's admin
  allow update: if isPlatformAdmin();          // approve / reject (with reason)
  allow delete: if false;
}
match /subscriptionRefs/{key} {
  allow get: if signedIn();
  allow create: if signedIn() && request.resource.data.uid == request.auth.uid
    && getAfter(/databases/$(database)/documents/subscriptionRequests/$(request.resource.data.requestId)).data.uid == request.auth.uid
    && key == getAfter(…requestId).data.method + '_' + getAfter(…requestId).data.reference;
  allow update: if false;  allow delete: if isPlatformAdmin();
}
```

- **Read-only after expiry:** every tenant write needs `writable(t)`, so reads keep working (reports stay visible) but no sale can be recorded.
- **Cost:** `get()` calls in the rules count as reads (see §9). `me()` and `tenant(t)` are each billed once per request, however often they're used. A POS order costs about 2 rule reads plus the e-wallet pairing.
- **Limits:** batched writes allow 20 `get`/`exists` calls in total. The approval batch (request + tenant + slug + user) stays well under that.

---

## 5. Flows

### 5.1 Subscribe (new shop)
1. `/subscribe`: the visitor enters shop name, wanted slug, owner name, email, password and plan. They see the **platform's** GCash/Maya QR (`platform/settings`) and the plan price.
2. They pay with their phone, upload the screenshot (Cloudinary, as today) and type the reference number.
3. The app creates the Firebase login (email + password), then **one batch** writes `subscriptionRequests/{id}` (pending) + `subscriptionRefs/{method}_{REF}`. A reused reference → the batch is denied → "This reference was already used".
4. `/subscribe/status` shows "Pending review".

### 5.2 Approve / reject (platform admin, `/platform/requests`)
- **Approve (new):** the admin checks the proof against the platform's GCash/Maya history, then **one batch**:
  - create `tenants/{T}`: status active, `currentPeriodEnd = now + 1 month`, graceDays from settings
  - create `slugs/{slug}`
  - create `users/{requesterUid}`: `tenantId: T`, `role: 'admin'`
  - update the request: approved, `reviewedBy`, `reviewedAt`
  
  The requester's live AuthContext picks up the new profile and enters `/admin`.
- **Approve (renewal):** update `tenants/{T}.currentPeriodEnd` to `max(currentPeriodEnd, now) + 1 month` + the request status.
- **Reject:** status `rejected` + `reason`. The requester sees the reason and can submit a new request (with a new reference).

### 5.3 Renewal (shop admin)
A "Renew" page shows the platform QR + price → upload proof + reference → a `renewal` request → approval extends the period. The shop doesn't lose data while expired; it's read-only.

### 5.4 Store e-wallet QR checkout (per shop)
The store-QR contract applies unchanged, under `tenants/{T}/…`:
- the shop admin sets up `settings/payments`
- the POS shows the store QR + amount
- the reference and "received" checkbox are required
- an atomic `paymentRefs` doc is written with the order

### 5.5 Staff, products and reports
Unchanged behavior; only the paths are tenant-scoped (`tenantCol(...)`).

---

## 6. Migration: the current shop becomes tenant #1

A one-time Node script, `scripts/migrate-to-tenant.mjs`. It's run **by the owner on their own computer** with a **service-account key** downloaded from the Firebase Console and kept **outside the repo**: the path is given in `GOOGLE_APPLICATION_CREDENTIALS` and the key is never committed. This is the only place a service account is used, and it doesn't need Blaze.

1. **Dry run (default):**
   - reads every current collection (`users`, `products`, `categories`, `orders`, `rfidCards`)
   - **writes a full JSON backup** to `backups/<timestamp>.json` (gitignored)
   - prints what it would do and the counts
   - writes nothing to Firestore
2. **Apply (`--apply --tenant-name "…" --slug "…" --plan … --period-end YYYY-MM-DD`):**
   - creates `tenants/T1` + `slugs/{slug}`
   - **copies** products, categories, orders and rfidCards to `tenants/T1/...` with the **same document ids**, so order numbers and links keep working
   - adds `tenantId: T1` to every `users/{uid}`
   - uses batches of up to 500, and is resumable (it skips documents already copied)
3. **Verify:** compares counts and a checksum per collection, old vs new, and prints a report.
4. **Switch:** deploy the tenant-aware app, then the new rules.
5. **Rollback:** the old collections are **left untouched** by the copy. To roll back, redeploy the previous app + `firestore.rules` from git; no data restore is needed. A cleanup script deletes the old collections only after the owner confirms, a week or more later.
6. **Quota:** a copy costs 1 read + 1 write per document. Spark allows 20,000 writes/day; a shop with more orders than that is migrated over several days (resumable) or after switching to Blaze.

---

## 7. Rules test plan

Move the Tech Lead's emulator harness into a proper suite that ships with the repo:
- `tests/rules/*.test.mjs` (backend-owned; the Tech Lead reviews)
- dev dependencies `@firebase/rules-unit-testing` and `firebase-tools`
- `npm run test:rules` = `firebase emulators:exec --only firestore "node --test tests/rules"`

Cases, with **tenant isolation first**:

| Group | Cases |
|---|---|
| **Isolation** | A member of shop A cannot get, list, create, update or delete any document of shop B (products, orders, settings, paymentRefs, rfidCards, users). A shop A admin can't create a user with `tenantId` B, or move a user from A to B. The shop A terminal can't log in a shop B card (the app checks `tenantId`) |
| Roles | Staff can't write products or settings. Staff can't delete orders. A deactivated member reads nothing. Self-edit is limited to name and photo |
| Read-only | After `currentPeriodEnd` + grace (a time-shifted emulator doc), reads are allowed and order creates are denied. `suspended` → denied. Renewal → allowed again |
| Subscription | A requester creates only their own **pending** request. Wrong amount → denied. Reused reference → denied. Can't approve their own request. Can't read others' requests. A `new` request while already a member → denied. A renewal for another shop → denied |
| Platform | Only platform admins approve/reject, create tenants/slugs, and edit `platform/settings`. `platformAdmins` can't be written by anyone |
| Store QR | Everything from the store-QR contract, now under a tenant |
| Old app | The single-tenant app's queries (`collection('orders')`) are denied after the switch, which proves the deploy order matters |

---

## 8. What the frontend needs

| Page / piece | Who uses it |
|---|---|
| `/subscribe`: plan picker, account fields, platform QR + price, proof upload, reference | Visitors |
| `/subscribe/status`: pending / rejected (reason) / approved → enter | Requesters |
| Banners: "N days left", "Expired: read-only, renew", "Suspended" | Shop users |
| `/admin/billing`: current plan, period end, Renew (QR + proof + reference), history | Shop admins |
| `/admin/payments`: store GCash/Maya QR settings (from the store-QR contract) | Shop admins |
| POS e-wallet QR checkout (from the store-QR contract) | Cashiers |
| `/s/:slug`: shop terminal with the RFID tab | Shops |
| `/platform`: requests (proof viewer, approve/reject with a reason), tenants (status, extend, suspend), platform settings (plans, prices, receiving QR) | Platform owner |

Backend provides the data helpers for all of these: `src/lib/tenant.ts`, `src/lib/subscriptions.ts`, `src/lib/platform.ts`, `src/lib/storeSettings.ts`, `src/lib/orders.ts`. The UI calls them, the same way the POS uses `buildOrder` today.

---

## 9. Spark quota and when Blaze is needed

Spark gives the **whole project** 50,000 reads, 20,000 writes and 20,000 deletes per day, shared by **every shop**. Rule `get()`s count as reads.

Estimate for **one** busy shop per day (100 orders, 20% e-wallet):

| Activity | Reads | Writes |
|---|---|---|
| 100 orders (order + rule gets; +1 paymentRef for e-wallet) | ~300 | ~120 |
| Dashboard opened 15× (7-day range ≈ 700 orders each) | ~10,500 | — |
| Reports opened 5× (month ≈ 3,000 orders) | ~15,000 | — |
| Menu/product loads, logins, staff page | ~1,000 | ~20 |
| **Total** | **~27,000** | **~140** |

- **One busy shop already uses about half of Spark's daily reads.** The 2nd busy shop would hit the limit, and when it's hit, **every shop stops working** for the rest of the day.
- **→ Blaze before the 2nd paying shop (D7).** Firestore pay-as-you-go is cheap at this size (roughly a few dollars a month per shop at the volumes above). Set a **budget alert**, and price the plans to cover it.
- **Optimization (phase 3):** a `tenants/{T}/dailyStats/{yyyy-mm-dd}` doc updated with `increment()` in the same batch as each order. The dashboard then reads 7 small docs instead of ~700 orders, which cuts dashboard reads by about 99%.

---

## 10. Phasing

| Phase | Backend | Frontend | Gate |
|---|---|---|---|
| **0 (now)** | Store-QR e-wallet (single shop; path via `paymentSettingsRef()`), PayMongo removed (archived on `archive/paymongo-test`) | Payment Settings page, POS QR checkout, Reports reconciliation | Tech Lead review + rules tests, then the owner deploys the app, **then** the rules |
| **1: Tenancy** | `tenant.ts`, tenant rules + isolation tests, AuthContext tenant state, `/s/:slug` terminal lookup, migration script (dry-run → apply → verify) | Tenant-aware pages (paths via helpers), banners, terminal route | Migration rehearsed on the emulator with a copy of real data; owner sign-off |
| **2: Billing** | Subscription requests/refs, approve/reject/renew batches, platform settings, read-only expiry in the rules + tests | `/subscribe`, status, billing/renew, `/platform` | Rules tests + E2E on emulators |
| **3: Hardening** | Daily stats aggregates, backups, optional server RFID tokens (§12) | — | Blaze + budget alert live |

---

## 11. Impact on existing code

| File | Change | Owner |
|---|---|---|
| `firestore.rules` | Rewritten per §4 | Backend |
| `src/contexts/AuthContext.tsx` | "No shop" state instead of signing out; tenant snapshot; platform admin flag; RFID login takes a tenant | Backend |
| `src/lib/tenant.ts`, `subscriptions.ts`, `platform.ts` | New helpers | Backend |
| `src/lib/storeSettings.ts`, `orders.ts` | Tenant paths | Backend |
| `src/App.tsx` | New routes: `/subscribe*`, `/s/:slug`, `/admin/billing`, `/admin/payments`, `/platform/*` (lazy) | Backend |
| `src/pages/**`, `src/components/**` | Every `collection(db, 'x')` becomes `tenantCol('x')`, plus the new pages | Frontend (backend sends the exact list) |
| `scripts/migrate-to-tenant.mjs`, `tests/rules/*` | New | Backend |

---

## 12. Risks and open points

- **Stored RFID passwords (unchanged in v1).** Cards still hold a staff password, now per shop. The real fix needs a small server: a Vercel function with the Firebase Admin SDK that turns a tag into a custom sign-in token, so cards store only the uid. That brings back a server and a service-account secret (no Blaze needed). Recommended for phase 3, owner's call.
- **Proof screenshots are personal data (RA 10173).** Cloudinary URLs are unguessable but public if shared. Show them only to platform admins, and delete them after approval (manually in Cloudinary in v1).
- **Client-side approvals:** the platform admin's browser writes the tenant. The rules restrict this to `platformAdmins`, and every approval records who and when.
- **Clock:** expiry uses the server's `request.time`, so a wrong device clock can't extend a subscription.
- **Deploy order** (app first, rules second) matters for every rules change in this plan. The docs and checklist say so each time.
