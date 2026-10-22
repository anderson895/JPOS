# Contract v2: Multi-store subscriptions + multi-business POS + branding (proposal, no code)

| | |
|---|---|
| **Author** | Backend (`backend`) · 2026-10-22 |
| **For** | Tech Lead approval, before any Phase 1 / B / 2 code |
| **Implements** | `docs/techlead/SUBSCRIPTION-PLAN.md` (approved): §2 access, §4 data, §5 phases, §9 multi-business + branding |
| **Builds on** | `docs/backend/SAAS_V1_CONTRACT.md` (v1 data model) and `docs/backend/EWALLET_QR.md` (store QR, done) |
| **Scope of the security review** | The Tech Lead's stress-test checklist (§10), answered as a **loophole → fix** table (§11) with a **rules-test checklist** (§12) |

## Contents
1. [Decisions and two small deviations](#1-decisions-and-two-small-deviations)
2. [Data model](#2-data-model)
3. [Rule building blocks](#3-rule-building-blocks)
4. [Trial (self-serve)](#4-trial-self-serve)
5. [Accounts: staff counter and entitlements](#5-accounts-staff-counter-and-entitlements)
6. [Payment requests, approval, suspension](#6-payment-requests-approval-suspension)
7. [Platform settings + audit](#7-platform-settings--audit)
8. [Multi-business POS + branding (§9)](#8-multi-business-pos--branding-9)
9. [Client libraries (what the UI calls)](#9-client-libraries-what-the-ui-calls)
10. [The stress-test checklist, answered](#10-the-stress-test-checklist-answered)
11. [Loophole → fix table](#11-loophole--fix-table)
12. [Rules-test checklist](#12-rules-test-checklist)
13. [Batch sizes vs the 20-call limit](#13-batch-sizes-vs-the-20-call-limit)
14. [Quota and abuse](#14-quota-and-abuse)
15. [Work order breakdown and deploy order](#15-work-order-breakdown-and-deploy-order)

---

## 1. Decisions and two small deviations

Everything follows SUBSCRIPTION-PLAN.md. There are two deviations, both proposed for exactness and approval only:

| # | Plan says | Contract proposes | Why |
|---|---|---|---|
| D-a | `status: 'trial' \| 'active' \| 'suspended'` | `status: 'trial' \| 'active'` plus a separate **`suspended: boolean`** | Unsuspending restores exactly what the shop had. A single `status` field loses whether it was on a trial or a paid period, and the rules would need extra state to remember it |
| D-b | Trial: `currentPeriodEnd == request.time + 7d` | A trial **has no stored end**. The rules compute it as **`createdAt + trialDays`**, where `createdAt` is `serverTimestamp()` (it equals `request.time`) and `trialDays` is snapshotted on the tenant | A client can't know `request.time`. Any end date the client writes would need a tolerance window, so the trial could run a few minutes long. Computing it from the server timestamp is **exact to the millisecond** |

Paid periods still store `currentPeriodEnd`, written by the Super Admin and checked against bounds (§6.3).

---

## 2. Data model

`T` = tenant id. Every Timestamp the rules compare against is a Firestore **Timestamp**. Every path is built only in `src/lib/tenant.ts` and the per-feature path helpers.

| Path | Fields | Written by |
|---|---|---|
| `platformAdmins/{uid}` | `{ name, createdAt }` | **Console only** |
| `platform/settings` | `{ plans: { starter, business, enterprise }: { name, price, entitlements }, trialDays: 7, paymentChannels: { [id]: { label, qrImageUrl, accountName, accountHint, enabled, order } }, messengerUrl, lastAuditId, updatedAt, updatedBy }` | Super Admin, always **paired with an audit entry** |
| `platformAudit/{id}` | `{ action, by, at, details }` | Super Admin; create-only |
| `tenants/{T}` | `{ name, slug, ownerUid, plan, status: 'trial'\|'active', suspended, createdAt, trialDays, currentPeriodEnd?, entitlements: { plan, staffLimit (number\|null = unlimited), rfid, fullReports, pdfExport, trends }, staffCount, lastStaffChange, pendingRequestId (string\|null), desiredPlan, updatedAt }` | Trial batch (owner); then only the paired counter / request fields by the shop admin; everything else by the Super Admin |
| `slugs/{slug}` | `{ tenantId }` | Trial batch; create-only |
| `trials/{uid}` | `{ tenantId, createdAt }` | Trial batch; create-only, **one per account** |
| `users/{uid}` | today's profile **+ `tenantId`** (one shop per login) | Trial batch (the owner); shop admins (staff, paired with the counter) |
| `tenants/{T}/products`, `categories`, `orders`, `paymentRefs`, `rfidCards`, `addOnGroups` | As today, plus the §8 fields | Members/admins per collection; **all writes need `writable(T)`** |
| `tenants/{T}/settings/payments` | Store QR (done) | Shop admin |
| `tenants/{T}/settings/profile` | §8.1 | Shop admin |
| `tenants/{T}/settings/branding` | §8.3 (public `get`) | Shop admin |
| `subscriptionRequests/{id}` | `{ tenantId, uid, plan, amount, months: 1, channelId, channelLabel, channelAccountHint, reference, proofUrl, status: 'pending'\|'approved'\|'rejected', reason?, reviewedBy?, reviewedAt?, createdAt }` | Shop admin (pending only); Super Admin reviews |
| `subscriptionRefs/{channelId}_{REF}` | `{ requestId, uid, createdAt }` | Shop admin, in the request batch; create-only |

**Until Phase 1 (single shop):** `settings/profile`, `settings/branding` and `addOnGroups` live at the root, through the same path helpers. Phase 1's migration moves them under the tenant.

---

## 3. Rule building blocks

```
function signedIn()        { return request.auth != null; }
function me()              { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
function isSuperAdmin()    { return signedIn() && exists(/databases/$(database)/documents/platformAdmins/$(request.auth.uid)); }
function tenant(t)         { return get(/databases/$(database)/documents/tenants/$(t)).data; }
function memberOf(t)       { return signedIn() && me().tenantId == t && me().isActive == true; }
function adminOf(t)        { return memberOf(t) && me().role == 'admin'; }

// The end of the paid/trial time, from the SERVER's point of view
function periodEnd(td)     { return td.status == 'trial'
                                ? td.createdAt + duration.value(td.trialDays, 'd')
                                : td.currentPeriodEnd; }
// writable(): exact. The trial ends at createdAt + trialDays, a paid period at currentPeriodEnd.
// At the boundary instant, writes are already denied (strict <).
function writable(t)       { return tenant(t).suspended == false
                                && tenant(t).status in ['trial', 'active']
                                && request.time < periodEnd(tenant(t)); }
```

- **Reads never need `writable()`.** An expired or suspended shop can still see its data and reports, which is the read-only behavior the owner asked for.
- **Every tenant write needs `writable(t)`.** That covers products, categories, orders, paymentRefs, rfidCards, addOnGroups, settings/*, and staff create/delete. The **only exception** is the payment-request path, so **an expired shop can renew** (§6.1).
- `me()` and `tenant(t)` are cached per request: each costs one access, however often a rule uses it.

---

## 4. Trial (self-serve)

### 4.1 Client order (exact)
1. `createUserWithEmailAndPassword` (on `/subscribe`).
2. `sendEmailVerification(user)` → "Check your inbox". The page offers **"I've verified"**.
3. On click:
   - `await user.reload()` (refreshes `emailVerified` on the client)
   - `await user.getIdToken(true)` (**forces a new ID token**, so the rules see `email_verified == true`; without it, the old token still says `false` and the batch is denied)
4. **One batch** (`createTrialStore()` in `src/lib/subscriptions.ts`):
   - `tenants/{T}` (new auto id)
   - `slugs/{slug}`
   - `users/{me}`
   - `trials/{me}`
5. AuthContext's live profile listener picks up `users/{me}`, and the app enters `/admin` with the onboarding checklist.

**Google sign-up:** today `loginWithGoogle` deletes a Google account that has no profile, because only registered accounts may sign in. From Phase 2:
- Such an account is kept and lands in the **"no shop"** state (→ `/subscribe`).
- Google already marks the email as verified, so steps 2–3 are skipped.
- The "registered accounts only" message stays on the staff terminal (`/s/:slug`).

### 4.2 Rules (all in the one batch)
**`tenants/{T}` create:**
```
allow create: if signedIn()
  && request.auth.token.email_verified == true
  && !exists(/…/users/$(request.auth.uid))                       // not a member anywhere yet
  && existsAfter(/…/trials/$(request.auth.uid))                  // the one-trial marker is in this batch
  && request.resource.data.keys().hasOnly([...exact list...])
  && request.resource.data.ownerUid == request.auth.uid
  && request.resource.data.status == 'trial'
  && request.resource.data.suspended == false
  && request.resource.data.createdAt == request.time             // serverTimestamp()
  && request.resource.data.trialDays == get(/…/platform/settings).data.trialDays
  && request.resource.data.plan == 'starter'
  && request.resource.data.entitlements == get(/…/platform/settings).data.plans.starter.entitlements
  && request.resource.data.staffCount == 1
  && request.resource.data.lastStaffChange == request.auth.uid
  && request.resource.data.pendingRequestId == null
  && request.resource.data.desiredPlan in ['starter', 'business', 'enterprise']
  && validSlug(request.resource.data.slug)
  && getAfter(/…/slugs/$(request.resource.data.slug)).data.tenantId == T
  && validName(request.resource.data.name);
```
- **`slugs/{slug}` create:** `validSlug(slug)` and `getAfter(tenants/{tenantId}).ownerUid == request.auth.uid`, with `getAfter(...).slug == slug`. Create-only: update `false`, delete Super Admin.
  - `validSlug`: `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`, and not in the reserved list `admin, platform, login, s, api, staff, subscribe, billing, help, www, app, jpos`.
- **`trials/{uid}` create:**
  - `uid == request.auth.uid`, `createdAt == request.time`
  - `getAfter(tenants/{tenantId}).ownerUid == uid`
  - `!exists(tenants/{tenantId})` (the tenant must be **new in this batch**)
  - Create-only (update/delete `false`), so the **second trial** is denied because its create would be an update.
- **`users/{me}` self-create** (the only self-create path):
  - `request.auth.uid == uid`
  - `role == 'admin'`, `isActive == true`, `email == request.auth.token.email`
  - `getAfter(tenants/{tenantId}).ownerUid == uid`
  - `!exists(tenants/{tenantId})`: **joining an existing shop is impossible**
  - `existsAfter(trials/{uid})`

---

## 5. Accounts: staff counter and entitlements

### 5.1 The counter (revenue-critical: Starter 3, Business 10, Enterprise unlimited)
`tenants/{T}.staffCount` counts **user docs** of the shop, owner included; deactivated ones still count. It changes only **paired** with a user create/delete, in the same batch, with `lastStaffChange = <that uid>` as proof.

**Staff create batch** (`createUserWithoutSignIn` + `onCreated`, as today) writes three things:
- `users/{new}`
- `tenants/{T}`: `staffCount: increment(1)`, `lastStaffChange: new`
- the optional RFID card (§5.2)

The client always uses **`increment(±1)`**, never a number it computed itself. The rules see the value **after** the increment, compared with the committed count at commit time. So a stale client copy can't skip or double-count anything.

**Tenant update by a shop admin** has exactly three allowed shapes. Anything else is Super Admin only:
```
allow update: if adminOf(T) && (counterUp() || counterDown() || openRequest());   // + isSuperAdmin() branch (§6.3)

function changed()    { return request.resource.data.diff(resource.data).affectedKeys(); }
function counterUp()  { return writable(T)
  && changed().hasOnly(['staffCount', 'lastStaffChange', 'updatedAt'])
  && request.resource.data.staffCount == resource.data.staffCount + 1
  && (resource.data.entitlements.staffLimit == null
      || request.resource.data.staffCount <= resource.data.entitlements.staffLimit)
  && !exists(/…/users/$(request.resource.data.lastStaffChange))           // new in this batch…
  && getAfter(/…/users/$(request.resource.data.lastStaffChange)).data.tenantId == T; }  // …in this shop
function counterDown(){ return writable(T)
  && changed().hasOnly(['staffCount', 'lastStaffChange', 'updatedAt'])
  && request.resource.data.staffCount == resource.data.staffCount - 1
  && get(/…/users/$(request.resource.data.lastStaffChange)).data.tenantId == T
  && !existsAfter(/…/users/$(request.resource.data.lastStaffChange))     // deleted in this batch
  && request.resource.data.lastStaffChange != resource.data.ownerUid; }  // the owner can't be removed
```

The **user side** is paired too:
- `users/{uid}` create by a shop admin requires `getAfter(tenants/T).staffCount == tenant(T).staffCount + 1 && getAfter(tenants/T).lastStaffChange == uid`.
- Delete requires the mirror image (`- 1`).

So neither half works without the other.

- **Race:** two admins add staff at once, both with `increment(1)`.
  - Each batch is checked against the count committed before it.
  - Both succeed while there's room. The one that would go past `staffLimit` is denied.
  - No retry is needed. The UI shows the limit message from the denied batch.
- **Downgrade:** existing accounts keep working. `counterUp` fails while `staffCount >= staffLimit`. The UI shows "Your package allows X accounts".
- **The owner** can never be deleted or demoted by another admin. Existing self-protection plus a rule: `ownerUid` immutable, owner doc not deletable.

### 5.2 RFID entitlement
- `tenants/{T}/rfidCards/{tag}`:
  - **`get` needs `tenant(T).entitlements.rfid == true`**, so existing cards stop working on a package without RFID. `get` works signed-out: the rules read the tenant doc themselves.
  - `list` is denied.
  - create/update: `adminOf(T) && writable(T) && entitlements.rfid`, plus the existing rules (not for admin accounts, owner in the same shop).
  - delete: `adminOf(T)`, always allowed, for cleanup.
- Client: `loginWithRFID(slug, tag)`.
  - A denied `get` is shown as "RFID login isn't included in this shop's package".
  - It also checks `users.tenantId == T`, so a card from shop A can't open shop B's terminal.

### 5.3 UI-only entitlements
- **Gated in the UI:** report ranges, PDF export and trends, through one `useEntitlements()` hook.
- **Low risk:** they read only the shop's own data, and the rules already restrict reads to members.

---

## 6. Payment requests, approval, suspension

### 6.1 Request batch (shop admin; **allowed while expired or suspended**, so the shop can pay to reopen)
One batch:
- `subscriptionRequests/{id}`
- `subscriptionRefs/{channelId}_{REF}`
- `tenants/{T}`: `pendingRequestId = id`

```
subscriptionRequests create:
  adminOf(d.tenantId)                                   // the requester runs that shop; no writable() here
  && d.uid == request.auth.uid
  && d.keys().hasOnly([...]) && d.status == 'pending' && d.createdAt == request.time && d.months == 1
  && d.plan in ['starter','business','enterprise']
  && d.amount == S.plans[d.plan].price                  // S = get(platform/settings).data
  && S.paymentChannels[d.channelId].enabled == true
  && d.channelLabel == S.paymentChannels[d.channelId].label
  && d.channelAccountHint == S.paymentChannels[d.channelId].accountHint
  && d.reference.matches('^[A-Z0-9]{6,30}$')
  && d.proofUrl.matches('^https://.+') && d.proofUrl.size() <= 500
  && getAfter(/…/subscriptionRefs/$(d.channelId + '_' + d.reference)).data.requestId == id
  && getAfter(/…/tenants/$(d.tenantId)).data.pendingRequestId == id
```

- **`openRequest()` branch on the tenant:**
  - `changed().hasOnly(['pendingRequestId'])` and `resource.data.pendingRequestId == null`
  - `existsAfter(subscriptionRequests/{new})`, whose `tenantId == T` and `status == 'pending'`
  - **Not** `writable()`.
  - This gives **one open request per shop**: a second request can't set a non-null slot.
- **`subscriptionRefs` create:**
  - `uid == me`
  - `getAfter(request).uid == me`
  - `key == request.channelId + '_' + request.reference`
  - Create-only, so a **reused reference fails the whole batch**.

### 6.2 Reject (Super Admin)
One batch: the request becomes `rejected`, with `reason` (1..300), `reviewedBy == me` and `reviewedAt == request.time`, and the tenant's `pendingRequestId` goes back to `null`. The shop can submit again with a **new** reference.

### 6.3 Approve (Super Admin): the period is validated with bounds
The client computes `newEnd = addMonths(max(now, periodEnd(tenant)), 1)` (date-fns). The rules can't compute calendar months, and the client can't know `request.time`, so the rules check **bounds**:
```
let base = periodEnd(old) > request.time ? periodEnd(old) : request.time;
newEnd >= base + duration.value(28, 'd') - duration.value(10, 'm')
&& newEnd <= base + duration.value(31, 'd') + duration.value(10, 'm')
```
One batch:
- request: `approved`, `reviewedBy == me`, `reviewedAt == request.time`; it must have been `pending` and match `pendingRequestId`
- tenant:
  - `status: 'active'`, `plan: request.plan`
  - `entitlements == S.plans[request.plan].entitlements`
  - `currentPeriodEnd: newEnd`
  - `pendingRequestId: null`
- **Plan change:** the new entitlements apply at once. On a downgrade, staff above the limit keep working (§5.1).

### 6.4 Suspend / unsuspend / manual extend
Super Admin only. A Super Admin tenant update must be paired with **one** of two records:
- **an approve/reject of the shop's `pendingRequestId`** in the same batch (§6.2–6.3); the request doc is the record
- **a new `platformAudit` entry** in the same batch (§7), for `tenant.suspend`, `tenant.unsuspend` or `tenant.extend`, with a `reason` in `details`

`suspended` toggles (D-a). A manual extend uses the same bounds as §6.3 unless the audit entry carries a reason (a goodwill extension, for example).

### 6.5 Reads and queries
| Data | Who reads | Query the client runs (needs an index) |
|---|---|---|
| `tenants/{T}` | members `get` their own; Super Admin `get`/`list` | `/platform`: `orderBy('createdAt', 'desc')` |
| `subscriptionRequests` | `isSuperAdmin() \|\| adminOf(resource.data.tenantId)` | Super Admin pending listener: `where('status', '==', 'pending'), orderBy('createdAt')`; the shop's history: `where('tenantId', '==', T), orderBy('createdAt', 'desc')` (both composite, in `firestore.indexes.json`) |
| `subscriptionRefs` | Super Admin only | none (a duplicate shows up as a failed batch) |
| `slugs/{slug}` | public `get`, no `list` | `checkSlugAvailable()`: one `get` |
| `trials/{uid}` | own `get` | none |

A list query is only allowed when its `where` pins `tenantId` to the reader's own shop, or when the reader is a Super Admin. An unconstrained list by a shop admin is denied (rules test in §12).

---

## 7. Platform settings + audit

**`platform/settings` update** (Super Admin):
- `changed()` must include `lastAuditId`, and the new `lastAuditId` must be a **new** audit doc in this batch: `!exists(platformAudit/X)`, `existsAfter(platformAudit/X)`.
- That audit doc must have `by == me` and `at == request.time`.

**`platformAudit/{id}` create:**
- `by == me`, `at == request.time`, `keys().hasOnly(['action','by','at','details'])`
- `action` from a fixed list (`settings.update`, `channel.add`, `channel.update`, `channel.toggle`, `plans.update`, `tenant.extend`, `tenant.suspend`, `tenant.unsuspend`)
- `details` a map of size ≤ 20
- update/delete: `false`; read: Super Admin

**Validation:**
- `paymentChannels` is checked by shape: a map of ≤ 10 channels.
- Rules can't loop over map values, so per-channel field validation is client-side (`platform.ts`), and the audit records every change.
- `messengerUrl` must be `^https://(m\.me|www\.facebook\.com)/.+`.

**Reads:**
- `platform/settings`: signed-in users (the billing page shows the channels and prices).
- `platformAudit`: Super Admin.

---

## 8. Multi-business POS + branding (§9)

### 8.1 Business profile, `settings/profile`
`{ name 1..60, logoUrl ('' | https ≤500), address ≤200, contact ≤60, businessType ∈ food|retail|services|custom, businessSubtype ≤40, features: { variants, addOns, orderType, tableNumber, units, barcode, serviceStaff, requireCustomer } (all bools, hasOnly), labels: { plural ≤20, singular ≤20 }, updatedAt, updatedBy == me }`
- Read: members.
- Write: `adminOf && writable` + this validation.
- Defaults per type and subtype come from `src/lib/businessTemplates.ts` (static), together with the optional **sample menu** (≤ 20 categories/products, written in batches of 8; see §13).

### 8.2 Product and order model (backend: types + pricing)
- **`Product` adds:**
  - `variants?: { id, name ≤40, price ≥0 }[]` (≤ 20), with **absolute prices**, replacing `priceModifier`; no stored product has variants today
  - `addOnGroupIds?: string[]` (≤ 10)
  - `unit` ∈ `pc|pack|box|kg|g|L|mL|m|hr|session` (default `pc`)
  - `decimalQty: bool`
  - `sku ≤40`, `barcode ≤40`
  - `durationMin` int 0..1440
- **`addOnGroups/{id}`:**
  - fields: `{ name ≤40, min 0..20, max 0..20, min ≤ max, options: { id, name ≤40, price ≥0 }[] (≤ 30) }`
  - the rules check list sizes, not each option, because rules can't loop; per-option checks are in `catalog.ts`
  - read: members; write: admins + `writable`
- **Pricing** (`src/lib/catalog.ts`, pure and unit-tested):
  - `unitPrice(product, variantId?, addOns[]) = roundMoney((variant?.price ?? product.price) + Σ addOn.price)`
  - `lineKey(productId, variantId?, addOnIds[]) = productId + '|' + (variantId ?? '') + '|' + sorted(addOnIds).join(',')`
  - `roundQty(q) = Math.round(q * 1000) / 1000` (3 decimals)
  - `lineSubtotal = roundMoney(unitPrice × qty)`
  - `validateAddOns(group, chosen)` checks min/max
- **`CartItem`:**
  - adds `lineKey`, `addOns: { id, name, price }[]`, `unit`, `serviceStaffId/Name`
  - quantity becomes a number (decimals for `decimalQty`)
  - **`CartContext` API change:**
    - `addItem(product, { variantId?, addOns?, quantity?, serviceStaff? })`
    - `updateQuantity(lineKey, q)`, `removeItem(lineKey)`
    - Lines merge only when `lineKey` matches **and** the service staff matches.
  - The frontend's POS changes come with the exact diff in WO-B2.
- **`OrderItem` snapshot:** adds `variantName`, `addOns[{ name, price }]`, `unit`, the unit price, the line subtotal and `serviceStaffName`, so later menu edits never change history.
- **`Order`:**
  - adds `orderType?: 'dine-in' | 'take-out'` (when enabled)
  - `tableNumber` for dine-in only
  - `customerName` (required when `requireCustomer`)
- **Barcode:** `src/lib/scanner.ts` holds a `createScannerDetector({ msPerChar: 50, minLength: 4 })` shared with the RFID login; it reuses today's speed rule. Exact `barcode`/`sku` match → add 1.
- **Reports:** `src/lib/reports.ts` adds `salesByOrderType`, `salesByStaff` (services) and `topItems` with variant names, beside `paymentBreakdown`.
- **Old data:** orders without the new fields render as before (every new field is optional). Products with no `variants` behave exactly as today.

### 8.3 Branding, `settings/branding`
`{ logoUrl, backgroundUrl ('' | https ≤500), theme ∈ espresso|matcha|berry|ocean|charcoal|sunset, receiptHeader ≤120, receiptFooter ≤200, showLogoOnReceipt bool, updatedAt, updatedBy == me }`
- **`get` is public:**
  - the `/s/:slug` terminal shows it before sign-in
  - it holds only public assets
  - `list` is denied
- Write: `adminOf && writable` + validation.
- `src/lib/branding.ts`: `getBranding`, `subscribeBranding`, `saveBranding`, `cloudinaryUrl(url, { w, h })` (adds `q_auto,f_auto,c_limit,w_…` to Cloudinary URLs), `THEMES` (ids + labels). The CSS variables per theme are the frontend's (WO-6).
- **All packages, the trial included**, get every branding and business feature (§9.3).

---

## 9. Client libraries (what the UI calls)

| Module | Exports |
|---|---|
| `src/lib/tenant.ts` | `tenantCol(name)`, `tenantDoc(name, id)`, `currentTenantId()`. The **only** place that builds `tenants/{T}/…` paths |
| `src/lib/entitlements.ts` | `periodEnd(tenant)`, `isWritable(tenant, now)`, `daysLeft()`, `reminderLevel()` (5/3/1/0/expired); `useEntitlements()` (a hook over AuthContext's live tenant) |
| `src/lib/subscriptions.ts` | `checkSlugAvailable(slug)` (a `get` on `slugs/`); `createTrialStore({ shopName, slug, desiredPlan })` (the §4 order; verified-email preflight); `submitPaymentRequest({ plan, channelId, reference, proofFile })` (upload, then the atomic batch; `ReferenceUsedError`, `OpenRequestExistsError`); `watchMyRequests()` |
| `src/lib/platform.ts` | Super Admin: `watchPendingRequests()`, `approveRequest(req)` (computes `newEnd` with date-fns), `rejectRequest(req, reason)`, `setSuspended(T, on, reason)`, `extendPeriod(T, …)`, `savePlatformSettings(patch, action)` (always audit-paired), `validateChannel(c)` |
| `src/lib/staff.ts` | `createStaff(...)` and `deleteStaff(...)` with the counter pairing (`increment(±1)`). Logic moves out of `Staff.tsx`, so the page only calls these |
| `src/lib/profile.ts`, `branding.ts`, `catalog.ts`, `scanner.ts`, `businessTemplates.ts` | §8 |
| `src/contexts/AuthContext.tsx` | states: signed-out / **no shop** (→ `/subscribe`) / member (with the live `tenant`) / Super Admin; `loginWithRFID(slug, tag)` |
| `src/contexts/CartContext.tsx` | the `lineKey`-based API (§8.2) |

---

## 10. The stress-test checklist, answered

| Tech Lead checklist item | Where |
|---|---|
| Trial self-serve validation: status, period, entitlements, `ownerUid`, slug, one trial, `email_verified` | §4.2 |
| `writable()` exactness | §3 (`periodEnd`, strict `<`, D-b) |
| staffCount ±1 with `lastStaffChange` proof | §5.1 (both sides paired) |
| RFID entitlement on `get` + write | §5.2 |
| Request batch: amount = plan price, enabled channel + snapshot match, one open request, unique ref, renewal while expired | §6.1 |
| Super Admin approval, `max(now, end) + 1 month` validated by bounds | §6.3 |
| Audit-paired `platform/settings` writes | §7 |
| List queries the rules allow: Super Admin pending listener, the requester's own | §6.5 (+ indexes), §12 group "Queries" |
| The 20-call batch limit, counted per batch | §13 |
| Quota abuse mitigations | §14 |
| Client order: `sendEmailVerification → reload → getIdToken(true) → trial batch` | §4.1 |

---

## 11. Loophole → fix table

| # | Attempt | Fix (rule) |
|---|---|---|
| 1 | Create my tenant as `active`, or with a long period | Create requires `status == 'trial'` and `trialDays ==` the platform value; the end is computed from the server `createdAt` (§4.2, D-b) |
| 2 | Trial with Business/Enterprise entitlements | `entitlements ==` the platform's `plans.starter.entitlements` |
| 3 | A second trial (new tenant, same login) | `trials/{uid}` is create-only, and `users/{uid}` must not exist |
| 4 | A trial without verifying the email | `request.auth.token.email_verified == true` |
| 5 | A trial "owned" by someone else, or a profile for someone else | `ownerUid == me`; the self-create path is `users/{me}` only |
| 6 | Join an existing shop by self-creating `users/{me}` with its `tenantId` | Self-create needs `!exists(tenants/T)`, i.e. a tenant **new in this batch** and owned by me |
| 7 | Take a reserved or someone else's slug | `slugs/{slug}` is create-only, plus the regex, the reserved list, and pairing with the tenant |
| 8 | A shop admin raises their own status, period, entitlements or plan | The admin's tenant updates may only change the counter fields or open a request (`changed().hasOnly`) |
| 9 | Add a 4th account on Starter by skipping the counter | A user create needs the paired `+1`, and `+1` needs `≤ staffLimit` |
| 10 | Lower the counter without deleting anyone | `-1` needs the named user to be **gone after the batch** and from this shop; it can't be the owner |
| 11 | Two admins add staff at once and slip past the limit | `increment(1)` is checked against the count committed before each batch, so the batch that would pass `staffLimit` is denied |
| 11b | A modified client writes a made-up count instead of `increment` | The rule requires exactly `committed ± 1`; any other value is denied |
| 12 | Use RFID on a package without it (old cards, new cards) | `get` and create/update need `entitlements.rfid` |
| 13 | Keep selling after expiry or suspension | `writable()` on every tenant write; reads stay open |
| 14 | Pay less for a bigger plan | `amount == plans[plan].price` |
| 15 | Pay to a disabled or invented channel, or fake the channel shown to the Super Admin | `channelId` must be enabled; the snapshot label/hint must equal the settings |
| 16 | Reuse a payment reference | `subscriptionRefs/{channel}_{REF}` is create-only (the whole batch fails) |
| 17 | Spam requests | One open request per shop (`pendingRequestId` slot) |
| 18 | A request for another shop | `adminOf(request.tenantId)` |
| 19 | Approve my own request | Only `platformAdmins` (Console-created) can update requests or tenant status; no rule writes `platformAdmins` |
| 20 | Approve with an absurd period (typo, or a malicious admin tab) | Bounds `[base + 28d − 10m, base + 31d + 10m]`, where `base = max(request.time, current end)` |
| 21 | Change the payment QRs without a trace | The settings update needs a **new** audit doc in the same batch (`existsAfter`, `at == request.time`) |
| 22 | Edit or delete the audit log | `platformAudit` is create-only; update and delete are `false` |
| 23 | Read another shop's data | `memberOf(t)` on every tenant read; isolation tests first |
| 24 | List all users, requests or cards | Lists are allowed only when constrained by `tenantId == mine` / `uid == me`; all-request lists are Super Admin only; `rfidCards`, `slugs` and branding are get-only |
| 25 | Script the trial signup to burn the quota | One trial per **verified** email; App Check (Phase 3); Blaze budget alert; the Super Admin can suspend |
| 26 | Offline POS keeps "selling" after expiry | Writes are rejected when they sync. The app has no persistent cache, so a batch only resolves on the server's acknowledgement, and the POS shows the expiry banner |
| 27 | Steal a shop by changing `ownerUid` | `ownerUid` is immutable for everyone except the Super Admin |

---

## 12. Rules-test checklist

The suite moves to `tests/rules/` (backend-owned, run with `npm run test:rules` on the emulator) and keeps today's 105 cases.

| Group | Cases |
|---|---|
| **Isolation (#1)** | A↔B get/list/create/update/delete on every tenant collection; users of B; moving a user to B; A's card at B's terminal |
| **Trial** | Valid trial batch allowed. Denied when any of these is off: unverified email, status ≠ trial, wrong `trialDays`, non-Starter entitlements, a foreign `ownerUid`, `staffCount ≠ 1`, an existing `users/{me}`, a second trial, a taken or reserved slug, a bad slug regex, a missing `trials`/`slugs` doc, an extra field |
| **Expiry** | Trial created 8 days ago (seeded): reads allowed, writes denied. Active with `currentPeriodEnd` in the past: denied. Exactly now: denied. `suspended`: denied. **A request while expired: allowed** |
| **Counter** | Staff #2/#3 on Starter allowed; #4 denied; unlimited Enterprise allowed. An unpaired `+1` or `-1`, or a user create without `+1`: denied. `-1` naming a user who still exists, or the owner: denied. A stale absolute count (written as a number, not `increment`): denied. Two `increment(1)` batches with one slot left: the first allowed, the second denied |
| **RFID** | `get` and write denied without `entitlements.rfid`, allowed with it; delete always allowed for admins |
| **Requests** | Valid allowed. Denied: wrong amount, unknown or disabled channel, a mismatched snapshot label/hint, a reused ref, a second open request, another shop's request, staff (not admin), wrong status, a bad proof URL |
| **Approval** | Super Admin approve, with the period inside the bounds, allowed. Denied: outside the bounds, from a non-Super Admin, self-approval, a request not matching `pendingRequestId`, entitlements not equal to the plan's |
| **Platform** | A settings update with a paired audit doc allowed; without it, or reusing an old audit id: denied. Audit update/delete denied. `platformAdmins` write denied for everyone |
| **Queries** | Super Admin `where(status=='pending')` allowed. Requester `where(uid==me)` allowed. Unconstrained request list by a user denied. Admin `users where(tenantId==mine)` allowed, `==other` denied |
| **§9** | Profile, branding, addOnGroups and product field validation (types, sizes, enums, https URLs). Branding public `get` allowed, `list` denied. Writes after expiry denied |
| **Store QR** | The existing 43 cases, moved under the tenant |
| **Old app** | The single-shop collections are denied after the switch (deploy-order proof) |

---

## 13. Batch sizes vs the 20-call limit

Firestore's limits are **10 access calls per write** and **20 per batch, summed over its writes**. The documentation doesn't promise that a repeated `get` of the same document is free across writes. So the counts below are the **worst case**: every write pays for its own calls, and nothing is cached.

| Batch | Calls per write (worst case) | Batch total |
|---|---|---|
| Trial | tenant 4 (`users/me`, `trials/me` after, `platform/settings`, `slugs/s` after) · slug 1 · trial 2 · user 3 | **10** |
| Staff create | user 3 (`users/me`, `tenants/T` before + after) · tenant 4 (`users/me`, `tenants/T`, `users/new` before + after) · card 3 | **10** |
| Staff delete | user 3 · tenant 4 · card delete 1 | **8** |
| Payment request | request 4 (`users/me`, `platform/settings`, ref after, tenant after) · ref 1 · tenant 2 (`users/me`, request after) | **7** |
| Approve | request 3 · tenant 3 (`platformAdmins/me`, `platform/settings`, request after) | **6** |
| Settings + audit | settings 3 · audit 1 | **4** |
| Order + ref (store QR, in a tenant) | order 3 (`users/me`, `tenants/T`, ref after) · ref 3 | **6** |
| Sample menu | 2 per document (`users/me`, `tenants/T`) | **chunks of ≤ 8 documents → ≤ 16** |

- Every batch stays at or under 20, and every write at or under 10, even with no caching.
- **Sample menu:** `businessTemplates.ts` writes it in batches of **8**. If the emulator shows that repeated calls are cached across writes, the chunk size can grow; the rules suite has a full-size case that settles it.
- The rules suite runs **every batch above at full size** (the trial with the longest slug, staff create with a card, the request with a proof). A batch that grows later fails a test before it reaches production.

---

## 14. Quota and abuse

- **Reads:** a rule's `get()` counts as a read. A tenant write costs about 2–4 rule reads (`me()` + `tenant()` + pairing). Dashboards dominate, as calculated in `SAAS_V1_CONTRACT.md` §9 (one busy shop is about 27k reads/day).
  - **Blaze + budget alert before the 2nd paying shop**, then `dailyStats` aggregates (Phase 3).
- **Signup abuse:** one trial per verified email and one shop per login.
  - A determined spammer can still create emails.
  - Mitigations: App Check (reCAPTCHA Enterprise / v3) in Phase 3, the Super Admin's suspend, and a daily budget alert.
  - Without a server there is no IP rate limit; App Check is the realistic control.
- **Public `get`s** (slugs, branding, rfidCards): one read each. A tag can't be listed, only guessed; App Check limits scripted guessing.
- **Cloudinary:** the unsigned upload preset accepts anything.
  - Restrict the preset in the Cloudinary console: image formats only, ≤ 5 MB, a dedicated folder.
  - Proof images are personal data (RA 10173). Delete them after review (Phase 3).

---

## 15. Work order breakdown and deploy order

| WO | Owner | Content | Depends on |
|---|---|---|---|
| **P1-a** | backend | `tenant.ts`, AuthContext states + live tenant, rules (isolation/roles/writable without subscriptions yet), `tests/rules/` move + isolation suite, migration script (dry-run, backup, copy, verify; the **owner** runs it with their own service-account credentials, and agents never read the key) | v2 approval |
| **P1-b** | frontend | Pages switch to `tenantCol()` (exact list from backend), `/s/:slug` terminal | P1-a helpers |
| **P1-c** | owner + techlead | Migration rehearsal on the emulator with an export; then deploy app → rules → `--apply` | P1-a, P1-b |
| **B1** | backend | `profile.ts`, `branding.ts`, `catalog.ts`, `scanner.ts`, `businessTemplates.ts`, types, CartContext `lineKey` API, rules + tests (§8) | P1 (or root paths via helpers if B runs first) |
| **B2** | frontend | Products editor, POS pickers, Settings → Business / Branding, branded shell/terminal/receipt (exact logic diffs from backend) | B1 |
| **WO-6** | frontend | Theme tokens → CSS variables + 6 themes (no Firestore) | — |
| **P2-a** | backend | `subscriptions.ts`, `platform.ts`, `entitlements.ts`, `staff.ts`, subscription rules + the full §12 suite | P1 |
| **P2-b** | frontend | `/subscribe`, onboarding checklist, `/admin/billing`, banners, `useEntitlements` gating, `/platform` | P2-a |

**Deploy order for every phase:** app first, then rules. Where a rule would break the live app, use the **expand → contract** pattern already used for the store QR: stage A accepts both the old and new shapes; stage B goes in after the new app is live.
