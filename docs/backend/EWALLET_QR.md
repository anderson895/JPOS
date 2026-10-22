# Store-QR e-wallet (GCash / Maya) + reconciliation

> ## ⚠️ Deploy in two stages
> **Status (2026-10-23):** Stage A was deployed on 2026-10-22. The new app is live on https://jpos-mu.vercel.app (verified: its POS chunk sends `verifiedBy` + the reference). **`firestore.rules` in the repo is now Stage B** (the marked line is removed; rules suite 105/105 in stage B). It goes live when the owner runs `firebase deploy --only firestore:rules`.
>
> **Stage A** (deployed 2026-10-22):
> - It adds `settings/payments` and `paymentRefs`.
> - A GCash/Maya order **with** a reference must be valid and unique.
> - An order **without** one is still allowed, so the app that's live today keeps taking GCash/Maya.
> - It also fixes "Missing or insufficient permissions" on Payment Settings: until the rules are deployed, production has no rule for `settings/payments`.
> - Deploy with `firebase deploy --only firestore:rules`.
>
> **Stage B, only after the new app is live on Vercel:**
> - Delete the one line marked `// STAGE A only` in `firestore.rules`, which makes the reference **required**.
> - Re-run the rules test suite; it detects the stage itself and expects "deny" for orders with no reference.
> - Deploy again.
> - If you deploy stage B before the new app, every GCash/Maya sale in the old app fails.
>
> Agents can't deploy; the owner runs every deploy.

| | |
|---|---|
| **What** | Customers pay the **store's own** GCash/Maya QR code from their phone. There's no gateway. The cashier enters the e-wallet **reference number** and confirms the money arrived. Each reference can be used **once**. Reports show per-method totals and references for matching against the GCash/Maya statements |
| **Status** | **Done and verified (WO-3 + WO-4a/4b).** Rules: 105/105 on the emulator in both stages. Unit: 17/17. The frontend applied the POS checkout, Payment Settings page and Reports changes; backend checked their logic. `tsc --strict` and `npm run build` pass on the whole tree. **Rules not deployed yet** (stage A first) |
| **Contract** | Approved by the Tech Lead (store-QR contract v1, without the PayMongo parts) |
| **Owner** | Backend: `firestore.rules`, `src/lib/{eWallet,storeSettings,saveOrder,orders,reports}.ts`, `src/types`, `src/App.tsx` (route), tests |

## Contents
1. [How it works](#1-how-it-works)
2. [Data](#2-data)
3. [Rules](#3-rules)
4. [Helpers (what the UI calls)](#4-helpers-what-the-ui-calls)
5. [Reconciliation in Reports](#5-reconciliation-in-reports)
6. [Tests](#6-tests)
7. [Limitations](#7-limitations)
8. [Moving to multi-tenant later](#8-moving-to-multi-tenant-later)

---

## 1. How it works

```
Admin → Payment Settings: uploads the store's GCash / Maya QR (Cloudinary), account name, number hint, and switches them on
Cashier → Checkout → GCash
   POS shows: the AMOUNT to pay, the store's QR (tap = full screen for the customer), and the account name + hint
   Customer scans with their phone and pays
   Cashier types the reference number from the customer's (or the store's) GCash receipt
     (normalized: uppercase, spaces and dashes removed)
   Cashier ticks "I saw ₱X received in the store's GCash"
   Confirm → ONE batch: the order + paymentRefs/gcash_<REF>
     reused reference → "This reference was already used for order ORD-…"
```

- **Cash:** unchanged.
- **Card:** a manual record with an optional approval code (not unique). The admin can switch card off.
- **GCash/Maya buttons:** disabled until the admin has switched that wallet on **and** uploaded its QR. Admins see a "Set up in Payment Settings" link.
- **Live settings:** the POS listens to the settings, so a new QR or a wallet switched off shows up at once. If the chosen method is switched off mid-checkout, the POS falls back to Cash.
- **The checkbox:** it confirms a specific amount, so it's unticked if the total changes.

---

## 2. Data

| Path | Fields | Written by |
|---|---|---|
| `settings/payments` | `{ gcash: Wallet, maya: Wallet, card: { enabled }, updatedAt, updatedBy }`, where `Wallet = { enabled, qrImageUrl, accountName, accountHint }` | Admins |
| `paymentRefs/{method}_{REF}` | `{ orderId, orderNumber, cashierId, method, reference, createdAt }` | The cashier, in the same batch as the order |
| `orders/{id}` (GCash/Maya) | adds `paymentReference` (REF), `paymentVerification: 'manual'`, `verifiedBy` (the cashier's uid) | The cashier |
| `orders/{id}` (card) | optional `paymentReference` (the approval code) | The cashier |

- **No settings doc yet** means GCash/Maya are off and Card is on, the same as before this feature.
- The REF format is `^[A-Z0-9]{6,30}$`. A GCash reference is usually 13 digits.
- `paymentRefs` keys include the method, so the same number under GCash and under Maya counts as two different references.

---

## 3. Rules

`firestore.rules`. Each side checks the other, so skipping a step in a modified client doesn't work.

| Collection | Rule |
|---|---|
| `orders` create | GCash/Maya (stage B; in stage A only when a reference is sent) **must** have a `paymentReference` matching the format, `paymentVerification == 'manual'`, `verifiedBy ==` the signed-in user, **and** a `paymentRefs/{method}_{REF}` that (after the batch) points to **this** order. Card: the optional code is ≤ 30 characters. Cash: unchanged |
| `paymentRefs` | **create only**:<br>• exact fields<br>• `cashierId ==` the signed-in user<br>• method is GCash/Maya<br>• key `== method_reference`<br>• reference format<br>• `orderNumber` ≤ 64<br>• `createdAt` is an ISO string ≤ 30<br>• the order (after the batch) has the same cashier, method and reference<br>**Update:** never. **Delete:** admins (to correct a mistake). **Get:** active users (so the POS can name the order that used a reference). **List:** admins |
| `settings/payments` | **Read:** active users. **Create/update:** active **admins** only:<br>• exact fields<br>• each wallet typed and size-capped<br>• `qrImageUrl` is `''` or `https://…` (≤ 500)<br>• **a wallet can't be on without a QR**<br>• `updatedBy ==` the signed-in user<br>**Delete:** never. A staff member who could swap in their own QR would receive the shop's payments |

**Why a reused reference fails:** the second `paymentRefs/gcash_REF` write lands on an existing document. That makes it an *update*, which is never allowed, so the **whole batch, order included, is rejected**.

---

## 4. Helpers (what the UI calls)

| Module | Function | Use |
|---|---|---|
| `@/lib/eWallet` | `normalizeReference(text)` | On every keystroke of the reference field |
| | `referenceProblem(ref, method)` | Inline hint; Confirm stays disabled while it returns a message |
| | `approvalCodeProblem(code)` | Card code ≤ 30 |
| | `walletReady(settings, method)` | Enable or disable the GCash/Maya buttons |
| | `paymentSettingsProblem(settings)` | Payment Settings validation (same limits as the rules) |
| | `withPaymentDefaults(data)`, `DEFAULT_PAYMENT_SETTINGS`, `WALLET_LABEL`, `paymentRefKey(order)` | Defaults, labels, claim key |
| `@/lib/storeSettings` | `paymentSettingsRef()` | The **only** place that knows the settings path |
| | `getPaymentSettings()`, `subscribePaymentSettings(cb)`, `savePaymentSettings(s)` | Load, live, save (sets `updatedBy`/`updatedAt` and trims) |
| `@/lib/orders` | `buildOrder(snapshot, orderNumber, { verification: 'manual', reference, verifiedBy })` | Adds the payment fields the rules expect |
| `@/lib/saveOrder` | `saveOrderAtomically(orderRef, order)` | Order + reference claim in one batch. Throws `ReferenceUsedError(orderNumber)` if reused, and resolves (instead of failing) if the same order had already been saved |
| `@/lib/reports` | `paymentBreakdown(orders)`, `paymentRefLabel(order, empty?)` | Section 5 |

---

## 5. Reconciliation in Reports

- **Per-method table** (Cash, GCash, Maya, Card; zeros shown): completed **order count** and **total**, from `paymentBreakdown()`.
  - The owner matches GCash/Maya against the wallet's own history, and Cash against the drawer.
  - An unexpected method from old data gets its own row, so money never disappears from the report.
- **Order Details:** a **Ref** column, on screen and in the PDF. In the PDF, an empty Ref prints as `-`, because the built-in PDF fonts lack some characters.
- **PDF "Payment Method Breakdown":** Method, Orders, Revenue, Share.

---

## 6. Tests

| Suite | Result | Command |
|---|---|---|
| Firestore rules (emulator) | **105/105** in stage A **and** in stage B: 62 existing + 43 store-QR. The suite detects the stage from `firestore.rules` | `docs/techlead/firestore-rules.test.mjs`; see REVIEW.md §6. It honours `FIRESTORE_EMULATOR_HOST`, and backend runs it on port 8095 |
| Unit (pure helpers) | **17/17** | `npm run test:unit` (`tests/unit/*.test.ts`) |

Store-QR rule cases:
- **Settings:**
  - staff read allowed; anonymous read denied
  - staff write denied (QR swap); inactive admin denied
  - admin write allowed
  - wallet on without a QR, non-https URL, wrong `updatedBy`, extra field, delete: all denied
- **Orders and reference claims:**
  - GCash and Maya order + claim allowed
  - **reused reference denied**, also for admins
  - the same number under the other wallet allowed
  - GCash without a reference, or without a claim, denied
  - lowercase or short reference denied
  - `verifiedBy`/verification mismatch denied
  - a claim for another cashier, another order or a cash order: denied
  - claim with an extra field, a bad `createdAt` (not a string, not ISO, too long) or a long `orderNumber`: denied
  - claim update denied; staff delete denied; admin delete allowed
  - staff `get` allowed; anonymous `get` denied
  - list: staff denied, admin allowed
- **Other methods and deploy order:**
  - cash without a reference allowed
  - card with or without a code allowed; a 31-character code denied
  - **old-app GCash order without a reference: denied** (this is why the deploy order matters)

Unit cases:
- reference normalization and validation
- the card code limit and claim keys
- settings defaults, `walletReady`, and validation that mirrors the rules
- `buildOrder` for GCash, card with and without a code, and cash
- `paymentBreakdown` (fixed order, completed only, centavo rounding, unknown method) and `paymentRefLabel`

---

## 7. Limitations

- **The cashier is trusted to check the money.** There's no gateway, so nothing proves the payment arrived except the cashier's tick (`verifiedBy` records who). Reconcile Reports against the wallet's own history regularly.
- **A reference can be wrong without being reused.** A typo or a made-up number is only caught at reconciliation. The uniqueness rule stops the same screenshot or reference from being used for two orders.
- **Fixing a wrong reference:** an admin deletes `paymentRefs/{method}_{REF}` (allowed) and corrects the order, which needs admin rights.
- **QR images are public URLs on Cloudinary.** A QR code is meant to be shown to payers, so that's acceptable.

---

## 8. Moving to multi-tenant later

`paymentSettingsRef()` is the only place that knows the settings path. In the SaaS contract it becomes `tenants/{t}/settings/payments`, and `paymentRefs` moves under `tenants/{t}/`, so references are unique **per store**. The rules move with them, with `memberOf(t)` and `adminOf(t)` in place of `isActiveUser()` and `isAdmin()`.
