# JPOS as SaaS: Technical Plan (draft for decision)

| | |
|---|---|
| **Author** | Tech Lead (`jpos-48`) · 2026-10-22 |
| **Question** | "What happens when a client wants to subscribe to my POS SaaS?" |
| **Status** | **Direction set (2026-10-22):** self-serve subscription with **manual QR payment + proof upload**, approved by the platform owner. This implies option **B** (multi-tenant), pending the user's confirmation. **PayMongo removed** |

---

## 1. Current state: JPOS is single-tenant

| Area | Today | Problem for SaaS |
|---|---|---|
| Data | Global collections `users`, `products`, `categories`, `orders`, `rfidCards` | Every shop would see every other shop's sales, menu and staff |
| Rules | "Admin" means admin of **everything** | An admin of shop A could edit shop B |
| Accounts | The first admin is created by hand in the Firebase Console. The rules block self-signup | A new client can't register on their own |
| "Get Started" / pricing | Only scrolls to the login card (`content.ts` → `PLANS[].action: 'login'`) | No signup, no checkout, no trial |
| Billing | None (PayMongo only for **POS order** payments, test mode) | No recurring subscription, no plan enforcement |
| Plan features | Pricing advertises **Inventory Management, Multi-Branch, Advanced Analytics** | **None of these exist** in the app. Selling them = misrepresentation |
| Firebase plan | Spark (free): 50k reads / 20k writes per day, **for the whole project** | Several shops in one project will hit the quota and the app stops for everyone for the rest of the day |

---

## 2. Target architecture (multi-tenant)

```
Visitor ──"Get Started"──▶ /signup ──▶ POST /api/signup (Vercel + Firebase Admin SDK)
                                         ├─ creates the Auth user (owner)
                                         ├─ creates tenants/{tenantId} { plan, status:'trial', trialEndsAt }
                                         └─ sets custom claims { tenantId, role:'owner' }
Owner ──"Subscribe"──▶ POST /api/billing/checkout ──▶ PayMongo checkout (plan price)
PayMongo ──webhook──▶ POST /api/billing/webhook (signature verified) ──▶ tenant.status='active', periodEnd += 1 month
Vercel Cron (daily) ──▶ trial/period expired ⇒ 'past_due' (grace) ⇒ 'suspended' (read-only)
```

### 2.1 Data model
- `tenants/{tenantId}` holds `{ name, slug, plan, status: trial|active|past_due|suspended, trialEndsAt, currentPeriodEnd, ownerUid, limits: { staff, branches } }`
- The shop's data moves under the tenant: `tenants/{t}/products`, `categories`, `orders`, `members/{uid}` (role, isActive, rfidTag) and `rfidCards/{tag}`
- Custom claims `{ tenantId, role }` go on each user. The rules read them for free, with no `get()` cost
- A platform owner (you) gets the claim `platformAdmin: true` for a super-admin dashboard: tenants, plans, payments, suspend/activate

### 2.2 Rules (sketch)
```
match /tenants/{t}/{coll}/{id} {
  allow read:  if request.auth.token.tenantId == t;
  allow write: if request.auth.token.tenantId == t && tenantActive(t) && <role checks as today>;
}
```
When `status` is `past_due` or `suspended`, the shop goes **read-only** (it can see its reports but can't record sales). This is enforced in the rules, not just the UI.

### 2.3 What a server unlocks, with no Blaze needed
**Firebase Admin SDK on Vercel Functions** only needs a service-account key in Vercel env vars, not Cloud Functions. That gives us:
- **Secure signup** (above)
- **RFID login without plaintext passwords:** `POST /api/rfid-login {shopSlug, tag}` → the server finds the card → `createCustomToken(uid)` → the client calls `signInWithCustomToken`. Cards then store **only the uid**. This is the proper fix for decision D1 in `REVIEW.md`
- **Billing webhooks** and the daily cron

### 2.4 Shop-specific URLs
POS terminals need to know which shop they belong to, e.g. `jpos.app/s/<shop-slug>` or a one-time "device setup code". RFID tags are unique **per shop**, not globally.

### 2.5 Billing: **manual QR + proof of payment** (user decision 2026-10-22, no PayMongo)
```
Visitor picks a plan ──▶ /subscribe: shop name, owner, email, password, plan
   └─ shows the PLATFORM's GCash/Maya QR + the plan price
   └─ uploads the payment screenshot + enters the reference no. ──▶ subscriptionRequests/{id} (status: pending)
Platform owner (super-admin) ──▶ Requests page: sees the proof, checks it against the GCash/Maya history
   ├─ Approve ──▶ creates tenants/{t} (plan, currentPeriodEnd = +1 month) + makes the requester the tenant's admin
   └─ Reject (with a reason) ──▶ the requester sees why and can re-upload
Renewal: the tenant admin uploads a new proof ──▶ pending ──▶ approve ──▶ currentPeriodEnd += 1 month
```
- **No server needed.** Every step is a client write guarded by Firestore rules:
  - A requester can only create their **own** request, with `status: 'pending'`.
  - Only a **platform admin** (a `platformAdmins/{uid}` doc created by hand in the Console) can approve, reject or create a tenant.
- **Expiry without a cron:** the rules compare `request.time` with `tenants/{t}.currentPeriodEnd` plus a grace period. After that, the shop is **read-only**.
- **Fraud controls:**
  - The reference no. is required and **unique** (an atomic `subscriptionRefs/{ref}` create).
  - The amount must equal the plan price.
  - The owner approves only after seeing the money in their own wallet history. Approvals are logged (`approvedBy`, `approvedAt`).
- **Proof images** go through the existing Cloudinary upload. They contain names and numbers, so keep the URLs out of anything public, and consider deleting them after approval. Privacy: RA 10173.
- The platform's own receiving QR is set by the platform owner in super-admin settings.
- The PayMongo test integration is **removed** from the app. It's archived on a local branch in case it's needed later.

### 2.6 Firebase plan
Several shops in one project **will** go past Spark quotas. **Blaze (pay-as-you-go)** is needed before onboarding paying clients. It's usage-based and small at first; set a **budget alert**. Price the plans to cover it.

---

## 3. Strategy options (choose one)

| | Option | How | Speed | Effort | Trade-offs |
|---|---|---|---|---|---|
| **A** | **One deployment per client** (manual) | Each client gets their own Firebase project + Vercel project + their env. Same code, no refactor | Fastest: days per client | Low code, **high manual ops** | Strong isolation. Every update has to be deployed N times, and billing is manual (invoices/payment links). Fine for 1–5 pilot clients |
| **B** | **True multi-tenant SaaS** | §2: tenants, rules, signup, billing, super-admin, migration of current data into tenant #1 | Slowest | **Large refactor**: every query, the rules, auth, RFID, new server endpoints, plus tests | Scales; self-serve signup and recurring billing; one deploy for everyone |
| **A→B** ⭐ | **Pilot first, then SaaS** | Now: turn "Get Started" into a **lead / trial-request form** + onboard first clients with A. In parallel: build B. Later: migrate the pilot shops into B | Can sell now | Medium | **Recommended.** It brings real client feedback before the big investment, and nothing promised is fake |

---

## 4. Must-fix before selling (any option)

1. **Pricing must match the product.** Either build Inventory / Multi-Branch / Advanced Analytics, or remove them from the plans and the landing copy (including the `index.html` meta description).
2. **Remove the placeholder testimonials** (fake reviews).
3. **Terms of Service + Privacy Policy** (the footer links are empty today). The app stores staff and customer data, so the **Data Privacy Act (RA 10173)** applies.
4. **BIR (to verify with an accountant/BIR):** a POS that issues sales receipts in the Philippines generally needs BIR registration/accreditation (e.g. a Permit to Use per terminal for the shop, and accreditation for the software provider). This affects how JPOS can be marketed ("official receipts" vs "order slips").
5. **Production readiness:** Blaze + budget alert, backups (Firestore export), monitoring, and support contact.

---

## 5. Proposed work breakdown (after the decision)

| Phase | Owner | Work |
|---|---|---|
| 0 (A→B, now) | Frontend + backend | "Get Started" → lead/trial-request form (`leads` collection, create-only rule with validation, spam guard), pricing/copy cleanup, Terms/Privacy pages |
| 1 | Backend | Firebase Admin on Vercel, tenant model, custom claims, new rules + emulator tests, server-side RFID custom tokens (drop the plaintext passwords), migration script for the current shop → tenant #1 |
| 1 | Frontend | Tenant-aware routing (`/s/:slug`), signup page, onboarding wizard (shop name, first products), plan/status banners (trial days left, read-only notice) |
| 2 | Backend | Billing: subscription requests + proof upload, approve/reject, renewals, `subscriptionRefs` uniqueness, expiry by `request.time`, plan limits (staff count, branches) |
| 2 | Frontend | Billing page (current plan, pay/renew, history), super-admin dashboard |
| 3 | Both | Advertised features that don't exist yet: inventory, multi-branch |
| Every phase | QA + Tech Lead | Rules emulator tests (**tenant isolation is the #1 test**), E2E, review |
