# Backend Changes — 2026-10-22

| | |
|---|---|
| **Role** | Backend developer (logic, data, Firebase, security) |
| **Scope** | Bug fixes from a full code review, a new **Google sign-in**, **no RFID for admin accounts** (§19), a **receipt QR** (§20; the PayMongo demo was removed), code splitting (§21) and the **store-QR e-wallet** (§22) |
| **Status** | §1–§18 were committed in the checkpoint `c179cd9` (not pushed). §19 is implemented but **not committed yet**; it goes in the next commit. |
| **Note** | A UI redesign happened in the same working tree, so some files listed here also have visual changes from the frontend developer. The login form now lives in `src/components/landing/LoginCard.tsx` (it used to be in `src/pages/LoginPage.tsx`). |

## Contents
1. [Action items (outside the code)](#1-action-items-outside-the-code)
2. [Summary of all changes](#2-summary-of-all-changes)
3. [Security: Firestore rules](#3-security-firestore-rules)
4. [Authentication](#4-authentication)
5. [Google sign-in (new feature)](#5-google-sign-in-new-feature)
6. [Cart and money](#6-cart-and-money)
7. [Orders (POS)](#7-orders-pos)
8. [Staff management and RFID cards](#8-staff-management-and-rfid-cards)
9. [Account settings](#9-account-settings)
10. [Reports and PDF](#10-reports-and-pdf)
11. [Dashboards](#11-dashboards)
12. [Smaller fixes inside UI files](#12-smaller-fixes-inside-ui-files)
13. [Frontend contract: APIs and behavior to keep](#13-frontend-contract-apis-and-behavior-to-keep)
14. [Data notes](#14-data-notes)
15. [Verification and test checklist](#15-verification-and-test-checklist)
16. [Known limitations (not fixed)](#16-known-limitations-not-fixed)
17. [Changes by file](#17-changes-by-file)
18. [Tech Lead review follow-ups](#18-tech-lead-review-follow-ups)
19. [Admin accounts can't use RFID](#19-admin-accounts-cant-use-rfid)
20. [Receipt QR (PayMongo removed)](#20-receipt-qr-paymongo-removed)
21. [Code splitting](#21-code-splitting)
22. [Store-QR e-wallet (GCash/Maya) + reconciliation](#22-store-qr-e-wallet-gcashmaya--reconciliation)

---

## 1. Action items (outside the code)

These steps can't be done from the code. Several fixes only take effect after them.

| # | Where | What to do | Why |
|---|---|---|---|
| 1 | Terminal (Firebase CLI) or Firebase Console → Firestore Database → **Rules** | ✅ **Done 2026-10-22.** The owner deployed `firestore.rules` to `jpos-f801b`: the exact file that passed the Tech Lead's emulator suite (62/62). An anonymous probe of production confirmed that listing `rfidCards`, `users`, `orders` and `products` is denied. **Any future rules change must pass `docs/techlead/firestore-rules.test.mjs` before it's deployed.** | The security holes in §3 stay open until the new rules are live. This includes the rule that blocks RFID cards for admins (§19) |
| 2 | Firebase Console → Authentication → **Sign-in method** | ✅ **Done 2026-10-22.** The owner enabled **Google** and confirmed it works in production | Needed for "Continue with Google" |
| 3 | Firebase Console → Authentication → Settings → **Authorized domains** | ✅ **Done 2026-10-22** (set up by the owner) | Firebase refuses the Google popup on domains not in this list (`localhost` is allowed by default) |
| 4 | Terminal / hosting | Build before deploying: `npm run build`, or let Vercel or Docker build | `dist/` is no longer tracked in git (it was a stale build) |
| 5 | Browser | Run the manual checklist in [§15](#15-verification-and-test-checklist) | Live Firebase flows (login, Google, RFID, staff edits) couldn't be tested without real accounts |
| 6 | JPOS → Manage Staff (or Firebase Console → `rfidCards`) | **Remove every admin's RFID card.** Easiest: open each admin and click Save, which clears the tag and deletes the card. Or delete the `rfidCards` documents whose `userId` is an admin | Each old admin card still holds that admin's password in plain text (§19) |
| 7 | JPOS → Account Settings → Password | **Change the password of every admin who had an RFID card** | Anyone who knew the tag could read the password. If the old rules were ever published, consider every saved card password exposed (§19) |

---

## 2. Summary of all changes

Severity: **Critical** = security hole · **High** = wrong money/data, or an outage risk · **Medium** = a broken feature · **Low** = edge case, polish or performance.

| # | Problem | Severity | Fixed in |
|---|---|---|---|
| 1 | Anyone, even without logging in, could list every RFID card with its **plaintext email and password** | Critical | Firestore rules |
| 2 | Any signed-in user could make themselves **admin** | Critical | Firestore rules |
| 3 | Any staff could overwrite any RFID card | High | Firestore rules |
| 4 | Changing or clearing a staff's RFID tag left the **old card still working** | High | `Staff.tsx` |
| 5 | Assigning a tag that another staff already had silently took over their card | High | `Staff.tsx` |
| 6 | The cart (and its discount) **carried over to the next cashier** after logout/login | High | `CartContext.tsx` |
| 7 | A negative discount **raised** the total; discounts over 100% or above the subtotal were saved as-is | High | `CartContext.tsx`, `POSComponent.tsx` |
| 8 | **Duplicate order numbers**: about a 42% chance of a duplicate on a 100-order day | High | `utils.ts`, `POSComponent.tsx` |
| 9 | PDF report printed `±` garbage instead of `₱` in every amount | High | `Reports.tsx` |
| 10 | Reports read the **entire `orders` collection** on every visit, which can exhaust the daily Firestore read quota | High | `Reports.tsx` |
| 11 | PDF order times were in UTC (8 hours behind PH time, sometimes the wrong date) | Medium | `Reports.tsx` |
| 12 | Staff dashboard missed every order placed between 12:00 AM and 7:59 AM | Medium | `staff/Dashboard.tsx` |
| 13 | Admin dashboard showed **fake** hard-coded "+12% / +5% / +8%" badges | Medium | `admin/Dashboard.tsx` |
| 14 | "Ghost login": a rejected user could appear logged in later without signing in | Medium | `AuthContext.tsx` |
| 15 | After a profile-load error, retrying the same login showed "Welcome back!" but never got past the login page | Medium | `AuthContext.tsx` |
| 16 | An admin could delete, deactivate or demote **their own** account (risk of no admin left) | Medium | `Staff.tsx` |
| 17 | An admin changing their password broke their RFID card login | Medium | `AccountSettingsModal.tsx` |
| 18 | If saving a new staff profile failed, the login was left behind and the email was blocked as "already in use" forever | Medium | `firebase.ts`, `Staff.tsx` |
| 19 | Switching report ranges quickly could show data for the wrong range | Medium | `Reports.tsx` |
| 20 | "Top Products" share could exceed 100% or show `NaN` | Low | `Reports.tsx` |
| 21 | The daily sales chart was out of order for ranges that cross New Year | Low | `Reports.tsx` |
| 22 | Custom report dates were parsed as UTC; clearing a date field caused an error | Low | `Reports.tsx` |
| 23 | Card/GCash/Maya orders stored a leftover cash amount and showed it on the receipt | Low | `POSComponent.tsx` |
| 24 | Floating-point noise in money (e.g. `144.375` saved to the database) | Low | `utils.ts`, `CartContext.tsx`, `POSComponent.tsx` |
| 25 | Account settings said "Failed to change password" instead of "Current password is incorrect" | Low | `AccountSettingsModal.tsx` |
| 26 | An automatic "first admin" bootstrap read every user document and could grant admin to any login (dead code under the new rules, but dangerous if they're ever loosened) | Low | `AuthContext.tsx` |
| 27 | An RFID tag containing `/` broke the card lookup | Low | `AuthContext.tsx`, `Staff.tsx` |
| 28 | Admin dashboard ran 8 queries one after another | Low | `admin/Dashboard.tsx` |
| 29 | PDF "Order #" column cut the number off; column widths and header line were off | Low | `Reports.tsx` |
| 30 | Login background "beans" jumped around on every keystroke | Low | `LoginPage.tsx` |
| 31 | The RFID auto-submit cut people off mid-way when they typed a tag by hand | Low | `LoginPage.tsx` |
| 32 | A collapsed desktop sidebar left the mobile drawer with no labels and no logout button | Low | `AdminLayout.tsx` |
| 33 | Products accepted negative prices; saving during an image upload lost the image; edit/delete buttons were invisible on touch screens | Low | `Products.tsx` |
| 34 | The same image couldn't be picked again after a failed upload | Low | `Products.tsx`, `Staff.tsx`, `AccountSettingsModal.tsx` |
| 35 | Menu, product and staff lists failed to load without telling anyone | Low | `POSComponent.tsx`, `Products.tsx`, `Staff.tsx` |
| **New** | **Sign in with Google** (registered accounts only) | Feature | `AuthContext.tsx`, `LoginPage.tsx`, `authErrors.ts`, `AccountSettingsModal.tsx`, `README.md` |

---

## 3. Security: Firestore rules

**File:** `firestore.rules` at the repo root, with `firebase.json` + `.firebaserc` (project `jpos-f801b`). The rules used to live only inside `README.md` §3, which now points to the file. **They must be deployed** (action item 1).

### Problems in the old rules
- `rfidCards: allow read: if true` let anyone **list** every card. Each card stores the email and **plaintext password** used for RFID login, including the admins'. The Firebase config is public in the JS bundle, so no login was needed to do this.
- `users: allow create/update: if request.auth.uid == userId` let a staff member set their own `role: 'admin'`. A stranger could also sign up through the Firebase Auth REST API and create an admin profile.
- `rfidCards: allow write: if request.auth != null` let any staff point any card at different credentials. The comment said this was needed because creating staff switched the session. That stopped being true once staff accounts were created on a secondary app (`createUserWithoutSignIn`).
- `users: allow read: if true` made the whole staff list public, including every `rfidTag`. Those tags are also the card document IDs.

### New rules (summary)
| Collection | Read | Write |
|---|---|---|
| `users/{uid}` | Own profile, or admin | Create/delete: admin only. Update: admin, or the user themselves but only `displayName`, `photoURL`, `updatedAt` |
| `products`, `categories` | Active users | Admin |
| `orders` | Active users | Create: active user, and `cashierId` must equal their own uid. Update/delete: admin |
| `rfidCards/{tag}` | `get` (one card by tag): public, since RFID login looks a card up before signing in. `list`: **blocked** | Create/update: admin, and **never for an admin account** (§19). Delete: admin |

### Effect on the app
- Every existing flow was checked against the new rules: password login, RFID login, Google login, POS ordering, both dashboards, reports, staff CRUD and account settings. All of them still work.
- Profiles are only ever created by an admin, so **the first admin must be created in the console**. The app's old automatic "first admin" bootstrap was removed (§4.3), and `README.md` §4 says so.

---

## 4. Authentication

**File:** `src/contexts/AuthContext.tsx`

### 4.1 Ghost login (stale profile listener)
- **Problem:** The `onAuthStateChanged` handler awaited `fetchUserProfile()` and then attached an `onSnapshot` listener. If the user was signed out during that wait, the listener was still attached for the old user. Example: a deactivated staff taps their card and is rejected. Hours later the admin re-activates them, the stale listener fires, and the terminal shows them logged in without anyone signing in.
- **Fix:** An `authVersion` counter is bumped on every auth change and on unmount. Work started for an older auth state stops after each `await` and inside every snapshot callback.

### 4.2 Stuck on the login page after an error
- **Problem:** When loading the profile failed (or the snapshot errored), the app cleared `currentUser` but Firebase stayed signed in. Firebase only notifies listeners when the **uid changes**, so retrying the same account never loaded the profile. Users saw "Welcome back!" and stayed on the login page.
- **Fix:** A new `resetSession()` clears the state **and** signs out. It's used on every deny or error path: no profile, deactivated, deleted, snapshot error and load error.

### 4.3 Automatic "first admin" bootstrap removed
- **Problem:** When a signed-in account had no profile, the app read the **whole** `users` collection. If it was empty, it created an **admin** profile for whoever had just logged in. Under the new rules this can't happen anymore, which made it dead code that grants admin. If the rules were ever loosened again, any login (including a stranger's Google account) on an empty project would become admin.
- **Fix:** `fetchUserProfile()` now only reads the user's own profile and returns `null` when there is none, so access is denied. The first admin is created by hand in the Firebase Console (`README.md` §4).
- *History:* the first version of this fix only added `limit(1)` to the check. It was removed entirely after the Tech Lead review (§18).

### 4.4 RFID tags containing `/`
- **Problem:** `doc(db, 'rfidCards', tag)` treats `/` as a path separator, so the lookup threw a raw Firestore error.
- **Fix:** `loginWithRFID` rejects such tags early with "RFID card not registered". Staff management also refuses to save them (§8.7).

---

## 5. Google sign-in (new feature)

**Files:** `src/contexts/AuthContext.tsx` (`loginWithGoogle`, `restoreRfidPassword`), `src/pages/LoginPage.tsx` ("Continue with Google" button, moving to `LoginCard.tsx`), `src/lib/authErrors.ts`, `src/components/admin/AccountSettingsModal.tsx`, `README.md` §1.

### Policy
Only **emails already registered in JPOS** can sign in with Google: staff added in Manage Staff, or the first admin. Unknown Google accounts are turned away. This keeps the existing rule that only an admin can give someone access.

### Flow
1. The user clicks **Continue with Google** and the Google popup opens with the account picker (`prompt: 'select_account'`, since terminals are shared).
2. Firebase signs the user in. For a Gmail address that matches an existing JPOS account, Firebase signs in to **that same account (same uid)**, so the existing `users/{uid}` profile and role apply.
3. `fetchUserProfile` looks up the profile.
   - **No profile:** the account is rejected. If Firebase had just created a brand-new login for it (`isNewUser`), that login is **deleted again** so strangers don't pile up in the Authentication list. The user sees "This Google account isn't registered in JPOS…".
   - **Deactivated:** signed out with the usual message.
   - **OK:** signed in normally through the existing profile listener.
4. `restoreRfidPassword` runs (see below).

### Important Firebase behavior: Gmail accounts lose their password
Staff accounts are created with email + password and their emails are never verified. When such a user signs in with Google for the first time using the same **Gmail** address, Firebase keeps the account (same uid) but **removes its password**. From then on, password login and RFID login (which signs in with the password saved on the card) would fail. The admin couldn't fix it from the app either, because saving a card requires verifying the password.

- **Mitigation:** `restoreRfidPassword()`. After a Google sign-in, if the account no longer has a password and the user has an RFID card that belongs to them, the card's saved password is linked back (`linkWithCredential`). Password and RFID login keep working. This applies to **staff only**; admins never use RFID (§19).
- Users **without** an RFID card keep using Google sign-in from then on.
- **Non-Gmail** emails that already have a password can't use Google. Firebase answers with `account-exists-with-different-credential`, and the app tells them to use email and password.

### Error messages (`src/lib/authErrors.ts`)
| Firebase code | Message shown |
|---|---|
| `auth/popup-blocked` | The Google sign-in window was blocked. Allow pop-ups… |
| `auth/account-exists-with-different-credential` | This email already signs in with a password… |
| `auth/unauthorized-domain` | Google sign-in is not allowed on this website yet. Add the domain… |
| `auth/operation-not-supported-in-this-environment` | Google sign-in is not supported in this browser… |
| `auth/operation-not-allowed` | This sign-in method is not enabled in Firebase… (now generic, since it covers both Google and email/password) |
| `auth/popup-closed-by-user`, `auth/cancelled-popup-request`, `auth/user-cancelled` | Nothing; the user just closed the popup (`CANCELLED_SIGN_IN_CODES`) |

### Account settings for Google-only accounts
"Change Password" now says *"This account signs in with Google, so it has no password to change here."* Before, it reported a misleading "Current password is incorrect".

---

## 6. Cart and money

**Files:** `src/contexts/CartContext.tsx`, `src/lib/utils.ts`

### 6.1 Cart carried over to the next cashier
- **Problem:** `CartProvider` sits above the routes, so its state survived logout. On a shared terminal, cashier B inherited cashier A's items and discount.
- **Fix:** The cart (items, discount, discount type) resets whenever the signed-in user changes (`currentUser?.id`).

### 6.2 Discount validation
- **Problem:** A discount of `-50` **increased** the total. A discount over 100%, or more than the subtotal, was saved as-is (e.g. subtotal 100, discount 150, total 0).
- **Fix:** The context computes `discountAmount = clamp(raw, 0, subtotal)`, rounded, and exposes it through `useCart()`. POS no longer recomputes it. The POS discount input also clamps as you type: never below 0, and at most 100 in % mode.

### 6.3 Money rounding
- **New helper:** `roundMoney(n)` rounds to whole centavos.
- **Used for:** subtotal, discount, total, change, tendered amount and each item's subtotal, so values like `144.375` never reach the database.

---

## 7. Orders (POS)

**Files:** `src/components/shared/POSComponent.tsx`, `src/lib/utils.ts`

### 7.1 Duplicate order numbers
- **Problem:** The format was `ORD-YYYYMMDD-NNNN` with a **random** 4-digit suffix, so only 9,000 numbers per day. On a 100-order day there was about a **42%** chance that two orders shared a number.
- **Fix:** The order's Firestore document reference is created first. Its random ID provides the suffix:
  - `generateOrderNumber(ref.id)` gives `ORD-YYYYMMDD-XXXXXX`, using the first 6 characters of the ID in uppercase (about 2.2 billion combinations).
  - The order is then written with `setDoc(ref, order)` instead of `addDoc`.
  - No new collection, rules or network round-trip is needed.
- **Format change:** e.g. `ORD-20261022-K3F9QA`. Old orders keep their old numbers; no migration is needed.

### 7.2 Leftover cash amount on non-cash orders
- **Problem:** If the cashier typed a cash amount and then switched to Card/GCash/Maya, that amount was saved as `amountTendered` and printed on the receipt.
- **Fix:** Only cash uses the typed amount. Other methods save `amountTendered = total` and `change = 0`. The "insufficient payment" check now also catches invalid input (NaN).

### 7.3 Menu load errors
If loading products or categories fails, the POS now shows "Failed to load menu" instead of silently showing "No products available".

---

## 8. Staff management and RFID cards

**Files:** `src/pages/admin/Staff.tsx`, `src/lib/firebase.ts`

### 8.1 Changing or clearing a tag now revokes the old card
- **Problem:** Each card is a document `rfidCards/{tag}`. Editing a staff member's tag changed only their profile, so the **old card kept logging them in**. Changing the tag without re-entering the password also left the new tag without a card, even though the form said "leave blank to keep existing credentials".
- **Fix:** All writes happen in **one atomic `writeBatch`**: profile update, new card, old card deletion.

| Old tag | New tag | Password typed | Result |
|---|---|---|---|
| X | X | no | Profile saved; card unchanged |
| X | X | yes | Password verified → card X updated |
| X | Y | no | Card X's saved credentials are **moved** to Y; card X deleted |
| X | Y | yes | Password verified → card Y saved; card X deleted |
| X | *(empty)* | — | Card X deleted (RFID login removed) |
| *(none)* | Y | no | Error: "Enter the staff's login password to set up this RFID card" |
| *(none)* | Y | yes | Password verified → card Y saved |

An old card is only reused or deleted if its `userId` is this staff member. A card left over from an old duplicate is never touched.

### 8.2 Duplicate tags
- **Problem:** Saving a tag that another staff member already had overwrote their card, so that tag logged in as the new person.
- **Fix:** Rejected with "This RFID tag is already assigned to *Name*". The check only runs when the tag is new for this staff member, so pre-existing duplicates don't block other edits.

### 8.3 Admins can't lock themselves out
- **Own card:** the delete button is hidden and the active toggle is disabled (`isSelf` prop on `StaffCard`).
- **Edit form for yourself:** the role buttons and the "Active account" checkbox are disabled.
- **Handlers:** they also refuse these actions, as a second safety net.

### 8.4 No orphan logins when creating staff
- **Problem:** The login was created first and the Firestore profile second. If the profile write failed, the login remained and the email was rejected as "already in use" from then on.
- **Fix:** `createUserWithoutSignIn(email, password, onCreated?)` takes a callback. The profile and the card are written in one batch inside it. If the callback throws, the new login is **deleted (rolled back)**.

### 8.5 Secondary auth sessions stay in memory
`createUserWithoutSignIn` and `verifyCredentials` use a throwaway Firebase app. They now use `initializeAuth(..., { persistence: inMemoryPersistence })`, so nothing is written to IndexedDB and no session is left behind if a tab closes mid-way.

### 8.6 Deleting staff
The profile and the card are deleted in one batch. The card is deleted only if it belongs to that staff member.

### 8.7 Tag hygiene
Tags are stored trimmed in the profile, and tags containing `/` are rejected.

---

## 9. Account settings

**File:** `src/components/admin/AccountSettingsModal.tsx`

| Change | Details |
|---|---|
| **RFID password sync** | ~~After an admin changes their password, the password saved on their RFID card is updated too.~~ **Removed in §19:** admins can't have RFID cards anymore (and the rules now refuse card writes for admins), so the sync could only show a misleading error. |
| **Wrong-password message** | Newer Firebase projects report a wrong password as `auth/invalid-credential` (not `auth/wrong-password`). All three codes now show "Current password is incorrect". Other errors use the shared friendly messages. |
| **Google-only accounts** | Clear message instead of a misleading error (see §5) |
| **Photo picker** | The same file can be picked again after a failed upload |

---

## 10. Reports and PDF

**File:** `src/pages/admin/Reports.tsx`

| # | Problem | Fix |
|---|---|---|
| 10.1 | The PDF's built-in fonts have no `₱` glyph. jsPDF encoded it so that every amount printed as `±` plus garbage (confirmed by inspecting the generated PDF) | PDF amounts are written as `PHP 1,234.00`, always with 2 decimals |
| 10.2 | PDF order times were taken from the UTC ISO string, e.g. an order at 7:30 AM showed as `2026-10-21 23:30` | Formatted in local time: `yyyy-MM-dd HH:mm` |
| 10.3 | "Order #" column was 22 mm and cut the number off. Every column had a fixed width, wasting 40 mm. A width was set for a column that doesn't exist. The amber header line covered only half the table | Order # is 40 mm (fits the longest possible number), Cashier takes the remaining width, Items is 14 mm, the dead column setting is removed, and the header line spans the full table, drawn after the last header cell |
| 10.4 | Every visit read **all** orders and filtered them in the browser. At about 36k orders per year, two report views exceed the free quota of 50k reads/day, and the app's reads then fail for the rest of the day | Query only the selected range: `where('createdAt','>=',start)`, `where('createdAt','<=',end)`, `orderBy('createdAt','desc')`. This is the same pattern the dashboard already uses, and needs only the automatic single-field index |
| 10.5 | Switching ranges quickly could let an older, slower response replace a newer one | Responses for a range the user already left are ignored (`cancelled` flag in the effect cleanup) |
| 10.6 | "Share" divided **gross** item revenue by **net** (after-discount) sales, so it could pass 100% or divide by zero | `sharePct()` divides by total item revenue, with a guard for zero. Used in the table, the bar and the PDF |
| 10.7 | Daily chart keys were `MM/dd`, so `01/02` sorted before `12/30` | Keys are `yyyy-MM-dd`; the label is still `MM/dd` |
| 10.8 | Custom dates used `new Date('yyyy-MM-dd')` (UTC). Clearing a date field threw an error and left stale data on screen | `parseISO` (local midnight). An empty or invalid date shows an empty report instead of an error |

---

## 11. Dashboards

### 11.1 Admin dashboard: real comparisons (`src/pages/admin/Dashboard.tsx`)
- **Problem:** The stat cards always showed green "+12%", "+5%" and "+8%". They were hard-coded.
- **Fix:** Real change (`pctChange`) for sales, orders and average order. Increases show a green up arrow; decreases show a red down arrow. There's no badge when there is nothing to compare against.
- **After the review:** the comparison is with **yesterday up to the same time of day**, not all of yesterday. Comparing a partial today with a full day showed a big drop every morning (§18, item 1).

### 11.2 Admin dashboard: one query instead of eight
Today plus each of the last 7 days used to be 8 separate queries run one after another. Now **one** 7-day range query is bucketed per day in the browser, and today's stats are taken from the same data.

### 11.3 Staff dashboard: early-morning orders (`src/pages/staff/Dashboard.tsx`)
- **Problem:** Orders store `createdAt` as a UTC ISO string, but the dashboard compared it with *today's local date*. In the Philippines (UTC+8) that skipped every order placed before 8:00 AM. It also read every order the cashier had ever made.
- **Fix:** A query for today's local-day range (`startOfDay` / `endOfDay`), newest first, filtered to the cashier in the browser. This avoids needing a composite index.

---

## 12. Smaller fixes inside UI files

| File | Fix |
|---|---|
| `src/pages/LoginPage.tsx` (→ `LoginCard.tsx`) | The background "beans" are placed once (`BEANS` constant) instead of re-randomizing on every keystroke |
| same | RFID auto-submit (the idle-timer fallback for readers that don't send Enter) now fires only for scanner-speed input (< 50 ms per character, `SCANNER_MS_PER_CHAR`). People typing a tag by hand press Enter |
| same | `loadingRef` is set to `true` at the start of a scan and reset in `finally`, which blocks double scans and can't get stuck |
| `src/components/admin/AdminLayout.tsx` | Opening the mobile drawer also expands the sidebar (`setCollapsed(false)`), so labels, Settings and Logout are always visible on mobile |
| `src/pages/admin/Products.tsx` | Validation: trimmed name required, price must be above ₱0, cost can't be negative |
| same | "Save Product" is disabled while an image is still uploading (saving early lost the image) |
| same | Edit/delete buttons on product cards and category rows only hide-until-hover on devices that **can** hover. On touch screens they're always visible (`[@media(hover:hover)]:opacity-0 …`) |
| `Products.tsx`, `Staff.tsx`, `AccountSettingsModal.tsx` | File inputs are reset after each pick, so the same file can be chosen again after a failed upload |
| `POSComponent.tsx`, `Products.tsx`, `Staff.tsx` | Load failures show a toast instead of failing silently |

---

## 13. Frontend contract: APIs and behavior to keep

### Changed or new APIs
| Module | API | Change | How to use |
|---|---|---|---|
| `@/contexts/AuthContext` | `useAuth().loginWithGoogle()` | **New** | Call it **directly** in the click handler with nothing awaited before it; otherwise browsers block the popup. It throws on failure. Ignore errors whose code is in `CANCELLED_SIGN_IN_CODES` |
| `@/contexts/CartContext` | `useCart().discountAmount` | **New** | Use it for display and orders. It's already clamped and rounded; don't recompute it |
| `@/lib/utils` | `roundMoney(n)` | **New** | Round any peso amount to centavos |
| `@/lib/utils` | `generateOrderNumber(uniqueId)` | **Signature changed** | Pass the new order's document ID (`doc(collection(db,'orders')).id`) |
| `@/lib/authErrors` | `CANCELLED_SIGN_IN_CODES` | **New** | Error codes for a sign-in the user backed out of |
| `@/lib/authErrors` | `getAuthErrorMessage()` | More codes mapped | Unchanged usage |
| `@/lib/firebase` | `createUserWithoutSignIn(email, password, onCreated?)` | **New optional callback** | Write the profile inside `onCreated`; if it throws, the login is rolled back |
| `@/lib/orders` | `buildOrder(snapshot, orderNumber, payment?)` | **New** (§20) | One order shape for cash and online payments |
| `@/lib/receiptQr` | `receiptQrPayload(order)` | **New** (§20) | Text for the QR on every receipt |

### Behavior to keep during the UI redesign
- **RFID login:** keep `loadingRef.current = true` at the start of `handleRFIDScan` and `= false` in its `finally`. Also keep the scanner-speed check (`firstCharAt`, `SCANNER_MS_PER_CHAR`) and the 300 ms focus loop that runs only in RFID mode.
- **Google button:** keep the official multicolor "G" logo; don't recolor it.
- **Receipt printing:** keep `id="receipt"` on the receipt block and the `@media print` rules in `src/index.css`.
- **Modals:** keep them inside `<Portal>` so they cover the full screen.
- **Staff cards:** keep the `isSelf` prop behavior (no delete or deactivate for yourself).
- **Staff form:** when the role is **admin**, hide the RFID tag and password fields. `handleSave` also forces the tag to empty for admins (§19).
- **Products:** keep the `[@media(hover:hover)]` classes, and keep "Save" disabled while uploading.
- **Item revenue:** `order.items[].subtotal` is **before** the order-level discount. Rank "top selling" by quantity, or label revenue as gross.

---

## 14. Data notes

- **`orders.orderNumber`:** new orders use `ORD-YYYYMMDD-XXXXXX`, where `XXXXXX` is the start of the order's document ID. Existing orders are unchanged.
- **Order documents:** created with `setDoc` on a pre-generated reference (still a random Firestore ID).
- **`orders.amountTendered` / `orders.change`:** for non-cash orders, `amountTendered = total` and `change = 0`.
- **Money fields:** `subtotal`, `discount`, `total`, `amountTendered`, `change` and `items[].subtotal` are rounded to 2 decimals.
- **`orders.paymentReference`** (§22): the GCash/Maya reference (normalized, unique per wallet via `paymentRefs`) or a card approval code. E-wallet orders also carry `paymentVerification: "manual"` + `verifiedBy`; `paymentNote` flags anything for review.
- **`users.rfidTag`:** stored trimmed.
- **`rfidCards/{tag}`:** shape unchanged: `{ email, password, userId, staffName, createdAt | updatedAt }`. `userId` is now used to check who owns a card before reusing or deleting it.
- **Queries:**
  - They rely on `createdAt` being an ISO string, which is how the app always writes it.
  - Only automatic single-field indexes are used.
  - **No new composite index is needed.**

---

## 15. Verification and test checklist

### Done
| Check | Result |
|---|---|
| `tsc --noEmit` (project settings) | Pass, 0 errors |
| `tsc --noEmit --strict` | Pass, 0 errors |
| `vite build` (production) | Pass |
| Logic checks against the real source (21 checks) | All pass |

The 21 logic checks covered:
- **Money:** rounding; negative, 150% and ₱999-on-₱100 discounts; `NaN` discount.
- **Order number:** format.
- **Dates:** a 7:30 AM order now falls inside "today" (the old check missed it); PDF times in local time; `parseISO` as local midnight; daily keys across New Year.
- **RFID:** a 15 ms/char reader auto-submits; a 400 ms/char person waits for Enter.
- **PDF:** amounts are plain `PHP` text with no `±`; the longest possible order number prints in full; the order table fills the 182 mm page width.

### Still to test in the browser (needs real Firebase accounts)
1. **Rules:** publish the new rules. Then log in as staff and confirm the POS, staff dashboard and RFID login still work.
2. **Cart:** log in as cashier A, add items, log out, log in as B. B's cart must be empty.
3. **Discounts** on a ₱100 cart: `-50` gives total ₱100; `150%` gives ₱0; ₱999 fixed gives ₱0.
4. **Payment:** type a cash amount, switch to GCash, confirm. The receipt shows the order total and no change.
5. **Order numbers:** new orders show `ORD-YYYYMMDD-XXXXXX`.
6. **RFID tag change:** change a staff member's tag without a password, then save. The new card logs in and the old card is refused.
7. **Duplicate tag:** assigning a tag that someone else has is refused.
8. **Your own staff card:** no delete button, and the toggle is disabled.
9. **Admin password change:** change it, then tap the admin's RFID card. It still logs in.
10. **Reports:** switch ranges quickly. The numbers match the selected range.
11. **Reports PDF:** amounts show `PHP`, times are local, Order # is complete.
12. **Staff dashboard:** an order placed before 8:00 AM appears in today's stats.
13. **Admin dashboard:** the badges match today vs. yesterday.
14. **Google (registered account):** a registered Gmail account logs in with its usual role. For a staff member with an RFID card, the card still works after the Google login.
15. **Google (unknown account):** an unregistered Google account is refused, and no new user is left in Firebase → Authentication.
16. **Google (cancel):** closing the Google popup shows no error.
17. **Admin RFID login:** tap an old admin card. It's refused with "RFID login is not available for admin accounts…", and the admin dashboard never flashes open.
18. **Admin with a card:** open the admin in Manage Staff and click Save. The toast says the RFID card was removed, and the card no longer exists in Firebase.
19. **Promote with a card:** promote a staff member who has a card to admin. The card is deleted in the same save.
20. **Demote with a card:** demote an admin to staff and give them a tag in the same save. It saves; this checks the `getAfter()` rule.
21. **Create staff with a card:** with the new rules published, create a staff member with an RFID tag. It saves; this checks `getAfter()` on the new profile.

---

## 16. Known limitations (not fixed)

- **Plaintext passwords on RFID cards.** This is how RFID login was designed: the card document holds the password used to sign in. The new rules stop anyone from listing the cards, but someone who knows a tag can still read that one card. Since §19 this only applies to **staff** cards, because admins can't have one. The proper fix is a Cloud Function that turns a scanned tag into a sign-in token, which requires Firebase's paid Blaze plan.
- **Deleted staff keep their Firebase login.** The browser can't delete another user's login, so a deleted staff member's email can't be reused for a new account. Delete the login in the Firebase Console first.
- **Google sign-in works only with Gmail for existing password accounts** (see §5).
- **Google-only staff can't get RFID set up from Manage Staff.** Setting up a card requires verifying their password, which they no longer have.
- **README is partly outdated.** It still mentions inventory and stock-management features that don't exist in the app.
- **Bundle size.** The production bundle is about 1.6 MB, which triggers Vite's size warning. `coffeelogo.png` is about 1 MB.

---

## 17. Changes by file

To review any file, run `git diff -- <path>`.

| File | Changes |
|---|---|
| `README.md` | §3 now points to `firestore.rules` and says what the rules enforce; Google sign-in setup and behavior; first-admin note; RFID setup note (no admin cards); feature list |
| `docs/BACKEND_CHANGES.md` | This document |
| `tsconfig.json`, `tests/tsconfig.json` | Dropped the deprecated `baseUrl`. VS Code flagged it: TypeScript 7 stops supporting it. `paths` (`@/*` → `./src/*`) now resolves relative to the tsconfig file; tests inherit it. Same behavior; `tsc`, `--strict` and the build pass |
| `firestore.rules` | **New.** The Firestore rules as a real file (single source of truth), including no RFID cards for admins |
| `firebase.json`, `.firebaserc` | **New.** Firebase CLI config, so `firebase deploy --only firestore:rules` deploys `firestore.rules` to project `jpos-f801b` |
| `.gitignore` | Ignore Firebase CLI and emulator logs and cache (`firebase-debug.log`, `firestore-debug.log`, `ui-debug.log`, `.firebase/`) |
| `src/contexts/AuthContext.tsx` | `authVersion` guard, `resetSession()`, first-admin bootstrap removed, `/` tag check, `loginWithGoogle()`, `restoreRfidPassword()` (staff only); RFID login refused for admins, including the `rfidSignIn` listener gate (§19) |
| `src/types/index.ts` | JSDoc on `Order.discount` / `discountType` (discount is always pesos) |
| `src/contexts/CartContext.tsx` | Per-user reset, clamped and rounded `discountAmount`, rounded totals |
| `src/lib/utils.ts` | `roundMoney()`, `generateOrderNumber(uniqueId)` |
| `src/lib/firebase.ts` | In-memory secondary auth, `onCreated` + rollback in `createUserWithoutSignIn` |
| `src/lib/authErrors.ts` | Google error messages, generic `operation-not-allowed`, `CANCELLED_SIGN_IN_CODES` |
| `src/components/shared/POSComponent.tsx` | Unique order numbers via `setDoc`, cash-only tendered/change, discount input clamp, rounding, menu load error |
| `src/pages/admin/Staff.tsx` | RFID tag change/clear/move logic in one batch, duplicate-tag check, self-protection (`isSelf`), staff creation with rollback, delete in a batch, tag checks, load error, file reset; admins get no RFID tag and their card is removed on save (§19) |
| `src/components/admin/AccountSettingsModal.tsx` | Wrong-password codes, Google-only message, file reset (the RFID password sync was added, then removed in §19) |
| `src/pages/admin/Reports.tsx` | Range query + race guard, load-error toast, `sharePct()`, daily keys, `parseISO`, PDF currency/time/columns/header line |
| `src/pages/admin/Dashboard.tsx` | One 7-day query, real badges vs the same time yesterday, load-error toast |
| `src/pages/staff/Dashboard.tsx` | Local-day range query, newest first |
| `src/pages/LoginPage.tsx` | Google button + handler, `BEANS` constant, scanner-speed detection, `loadingRef` handling |
| `src/components/admin/AdminLayout.tsx` | Expand the sidebar when opening the mobile drawer |
| `src/pages/admin/Products.tsx` | Validation, Save disabled while uploading, touch-friendly buttons, file reset, load error |

---

## 18. Tech Lead review follow-ups

**Reviewer:** Tech Lead (session `jpos-48`).
**Verdict:** **Approved**, with 4 fixes (1 medium, 3 low).
**Status:** **Closed.** The Tech Lead re-checked all 4 fixes and verified them; `tsc` and `tsc --strict` pass on the current tree.

The reviewer checked:
- the `authVersion` guard and `resetSession`;
- all 7 cases of the RFID batch table;
- the `createUserWithoutSignIn` rollback;
- the cart clamp/reset;
- order numbers from the doc ID;
- the Reports range query with its cancel guard;
- every flow against the new rules.

They also ran `tsc`, `tsc --strict` and `vite build`; all passed.

**Who applies a fix:** the agreed file split during the UI redesign.
- Fixes in UI files are written by backend and applied by the frontend developer (`jpos-54`).
- Fixes in backend files are applied by backend.

| # | Severity | File | Finding | Fix | Applied by | Status |
|---|---|---|---|---|---|---|
| 1 | Medium | `src/pages/admin/Dashboard.tsx` | "vs yesterday" compared today **so far** with **all** of yesterday, so mornings always showed a big red drop | Compare with yesterday up to the same time (`yesterdaySoFar`), and change the label to "vs same time yesterday". The weekly chart is unchanged | `jpos-54` | **Done** (verified) |
| 2 | Low | `src/pages/admin/Reports.tsx` | A failed load showed an empty ₱0 report that reads as "no sales" | `toast.error('Failed to load report')` in the query's `catch` | `jpos-54` | **Done** (verified) |
| 3 | Low | `src/pages/admin/Dashboard.tsx` | A failed load showed ₱0 badges with no message | `toast.error('Failed to load dashboard')` in the `catch` | `jpos-54` | **Done** (verified) |
| 4 | Low | `src/contexts/AuthContext.tsx` | The first-admin bootstrap (creates a `role: 'admin'` profile) was unreachable under the new rules, which made it dead code that grants admin | Removed; `fetchUserProfile()` returns `null` when there's no profile. The docstring and `README.md` §4 were updated (see §4.3) | Backend | **Done** |

**Notes from the review:**
- **`Order.discount`:** JSDoc added in `src/types/index.ts`. `discount` is always the **peso amount** deducted, even when `discountType` is `'percent'`. **Done.**
- **RFID card security** (§16): raised with the owner as a design decision. Decided: **admin accounts can't use RFID** (§19).
- **`tsconfig.json`:** it has `"strict": false`, yet the whole tree already passes `--strict`. The Tech Lead recommends enabling strict mode once the UI redesign is finished.

---

## 19. Admin accounts can't use RFID

**Decision:** made by the owner and passed on by the Tech Lead (`jpos-48`).
**Status:**
- Backend files: done.
- UI files: applied by `jpos-54` and verified.
- `tsc`, `tsc --strict` and `vite build` pass.
- Not committed yet; this goes in the next commit.

### Why
An RFID card document (`rfidCards/{tag}`) stores its owner's **login email and plaintext password**, because RFID login signs in with them. Card reads must stay public so the login screen can look a card up before anyone is signed in. So **anyone who knows an admin's tag could read the admin's password** and take over the whole system.

Blocking cards for admins removes that risk. Staff cards stay, since their worst case is POS access only.

### What changed
| Where | Change | Applied by |
|---|---|---|
| `src/contexts/AuthContext.tsx`: `loginWithRFID` | After loading the profile: if the account is an admin, sign out and throw *"RFID login is not available for admin accounts. Use your email and password."* Existing admin cards stop working right away | Backend |
| `src/contexts/AuthContext.tsx`: auth listener | New `rfidSignIn` ref, set while `loginWithRFID` runs. The listener refuses an admin profile while it's set. Without this, the listener could open the admin dashboard for a split second, and start loading its data, before `loginWithRFID` signed out | Backend |
| `src/contexts/AuthContext.tsx`: `restoreRfidPassword` | Skips admins, so an old admin card is never used to re-link a password after a Google sign-in | Backend |
| `firestore.rules`: `rfidCards` | `allow create, update: if isAdmin() && getAfter(users/{userId}).data.role != 'admin'`, plus `allow delete: if isAdmin()` (see below) | Backend |
| `README.md`: RFID Setup | Note that admins can't use RFID, and that saving an admin removes their card | Backend |
| `src/pages/admin/Staff.tsx`: `handleSave` | For the admin role, the tag is forced to empty. The existing batch then deletes the admin's old card in the same atomic write; this also covers promoting a staff member who has a card. The toast says *"RFID card removed (admins can't use RFID)"* | `jpos-54` |
| `src/pages/admin/Staff.tsx`: staff form | When the role is admin, the RFID fields are hidden and a note explains why. They come back when switching the role to Staff | `jpos-54` |
| `src/components/admin/AccountSettingsModal.tsx` | The RFID password sync after a password change was removed. Only admins use this modal, and they no longer have cards | `jpos-54` |

### Why the rule uses `getAfter()`, not `get()`
The rule must look at the **owner's role**. In a batched write, `get()` sees the data **before** the batch, and `getAfter()` sees it **after**. Two app flows write the profile and the card in the same batch:

| Flow (one batch) | With `get()` | With `getAfter()` |
|---|---|---|
| **Create staff with a card**: new `users/{uid}` + new card | The profile doesn't exist yet, so `get()` fails and **staff creation with RFID breaks** | Sees the new profile (role staff), so it's allowed ✓ |
| **Demote an admin and give them a card** in one save | Sees the old role (admin), so it's refused | Sees the new role (staff), so it's allowed ✓ |
| **Promote staff with a card to admin**: update `users` + delete the card | The delete rule only needs `isAdmin()` ✓ | Same ✓ |
| Single card write (no profile change) | Current profile | Same as `get()` ✓ |

### What the owner must do (also in §1)
1. **Deploy the updated rules** (`firestore.rules`).
2. **Remove existing admin cards:** in JPOS, open each admin in Manage Staff and click **Save**. Or delete the `rfidCards` documents whose `userId` is an admin in the Firebase Console.
3. **Change the password of every admin who had a card** (Account Settings → Password), since anyone who knew the tag could read it.
   - If the *old* rules (public card listing) were ever published, treat every saved card password as exposed.
   - Staff passwords can be reset from Firebase Console → Authentication. Then re-enter the new password on the staff member's card in Manage Staff.

### Tests
Checklist items 17–21 in [§15](#15-verification-and-test-checklist).

---

## 20. Receipt QR (PayMongo removed)

**Status:** the PayMongo TEST-mode integration was built, reviewed and then **removed by owner decision**: JPOS takes manual payments only (cash, the store's own GCash/Maya QR, card). The **receipt QR stays**.

### PayMongo: archived, then removed
- **Archive:** local branch `archive/paymongo-test`, commit `b6d643c`. It's **not pushed** and not part of `main`.
  - It holds the `api/` functions (config/checkout/status/cancel), the `sk_test_`-only latch, Firebase ID-token checks, 36 unit tests, the client and POS hook, and `docs/backend/PAYMONGO.md`, with the POS and configs as they were.
  - To look at it: `git log archive/paymongo-test`. To restore it, merge or cherry-pick into a branch.
- **Removed from the working tree:**
  - `api/`, `scripts/test-api.mjs`, `src/lib/paymongo.ts`, `src/lib/usePayMongoCheckout.ts`, `public/pay/`, `docs/backend/PAYMONGO.md`
  - the `jose` dependency and the `test:api` script
  - the `Order.paymentProvider`, `paymentSessionId` and `paymentStatus` fields
- **Restored to the last commit:**
  - `vite.config.ts`: no dev `/api` plugin
  - `vercel.json`: plain SPA rewrite
  - `.env.example`: no PayMongo key
  - `build` is back to `tsc && vite build`
- **Kept:**
  - `qrcode.react` and `src/lib/receiptQr.ts` (the receipt QR)
  - `src/lib/orders.ts`: `OrderSnapshot` and `buildOrder`, now with the store-QR `ManualPayment`
  - `Order.paymentReference` and `paymentNote`, which the store-QR e-wallet uses
- **Moot after the removal:**
  - the review follow-up P2 (retry after `save_failed`)
  - the proposed API response-shape change
  - the P1 fix (dev `/api` 503), which went away with the plugin
- **Frontend:** `frontend` removes the PayMongo UI in `POSComponent.tsx` and the demo mock, using the exact diff sent by backend.
- **Owner:** if `PAYMONGO_SECRET_KEY` was ever added in Vercel → Environment Variables, delete it.

### Receipt QR (the spec that stays)
Every receipt, cash included, has a QR code built by `receiptQrPayload(order)` in `src/lib/receiptQr.ts`. It holds plain text:

```
JPOS ORDER ORD-20261022-K3F9QA
2026-10-22 07:30
TOTAL PHP 280.00
PAID GCASH
REF 1234567890123    ← GCash/Maya reference, or a card approval code, when there is one
```

- Staff scan it to find an order, e.g. for a refund. It is **not a link** and **not proof of payment**: anyone could print one, so check the order in Reports.
- It uses `PHP` instead of `₱` so every scanner reads it.
- It's rendered with `qrcode.react` (`<QRCodeSVG size={128} level="M" marginSize={2}>`) inside `#receipt`, so it prints.
- Worst case measured (115 characters): QR version 7, about 34 mm printed, 0.69 mm per module (about 5.5 dots at 203 dpi). It scans fine on 80 mm thermal paper.

---

## 21. Code splitting

**Requested by:** the Tech Lead (low priority, after PayMongo). **Status:** done and measured. Not committed yet.

The public landing page used to download the whole app in one 1.7 MB file: every admin page, recharts, jspdf and the POS.

| Change | File | Owner |
|---|---|---|
| `React.lazy` for both layouts and all admin/staff pages. `<Suspense>` shows `LoadingScreen` while a layout loads, and a small spinner inside the content area while a page loads, so the sidebar stays put | `src/App.tsx` | Backend |
| `jspdf` and `jspdf-autotable` are imported inside `downloadPDF()`, so they load only when a PDF is downloaded. The "Generating…" spinner now actually shows | `src/pages/admin/Reports.tsx` | Applied by the frontend (`jpos-83`) |

### Before / after (`vite build`)
| Chunk | Before | After |
|---|---|---|
| Main: landing, login, auth, Firebase | **1,729 kB** (gzip 486 kB) | **742 kB** (gzip 196 kB): −57% raw, −60% gzip |
| Reports page | inside main | 45 kB |
| Dashboard pages (recharts, shared) | inside main | 386 kB, loaded only with Dashboard/Reports |
| POS (with QR code) | inside main | 48 kB |
| jspdf + autotable (+ html2canvas, purify) | inside main / lazy | 390 + 31 kB (+ 224 kB), loaded only on "Download PDF" |

`tsc --strict` and the build pass. The landing page no longer downloads recharts, jspdf or any admin code.

---

## 22. Store-QR e-wallet (GCash/Maya) + reconciliation

> ⚠️ **Deploy the rules in TWO STAGES.**
> - **Stage A** (the current `firestore.rules`) is safe now. It adds Payment Settings and reference uniqueness, and still accepts the live app's GCash/Maya orders, which have no reference.
> - **Stage B** is for after the new app is live: delete the `// STAGE A only` line so the reference becomes required.
> - Details: [EWALLET_QR.md](backend/EWALLET_QR.md).

**Requested by:** the owner (manual payments only); contract approved by the Tech Lead (WO-3).
**Status:** done and verified (WO-3, WO-4a, WO-4b). Not committed yet. **Rules not deployed**; deploy stage A as described above.
**Full documentation:** [`docs/backend/EWALLET_QR.md`](backend/EWALLET_QR.md)

### Summary
- **Flow:**
  - Customers pay the store's own GCash/Maya QR.
  - The cashier enters the **reference number** and ticks "I saw ₱X received".
  - The order and a `paymentRefs/{method}_{REF}` claim are saved **in one batch**, so a reference can't be used twice.
- **Rules (`firestore.rules`):**
  - GCash/Maya orders need a well-formed reference, `paymentVerification: 'manual'`, `verifiedBy` = the cashier, and the matching claim in the same batch.
  - Claims are create-only, with exact and typed fields.
  - `settings/payments` is admin-only: a staff member who could swap the QR would receive the shop's payments, and a wallet can't be on without a QR.
  - Card takes an optional approval code; cash is unchanged.
- **Helpers:**
  - `src/lib/eWallet.ts`: normalization, validation, defaults, claim key
  - `src/lib/storeSettings.ts`: the single path helper; load, live and save
  - `src/lib/saveOrder.ts`: atomic save + `ReferenceUsedError`; idempotent if the save had already landed
  - `src/lib/orders.ts`: `ManualPayment`
  - `src/lib/reports.ts`: per-method count + total, and the Ref label
- **Route:** `/admin/payments` (lazy) in `src/App.tsx`, for the frontend's Payment Settings page.

### QA lows (WO-3)
| # | Fix | Where |
|---|---|---|
| a | The payment method resets to **Cash** after every saved order | POS `saveOrder` (frontend applies) |
| b | Switching the discount from ₱ to % clamps it to ≤ 100 | POS discount toggle (frontend applies) |
| c | If re-linking the RFID password fails after a Google sign-in, a toast says so: "ask your admin to re-enter the card password in Manage Staff". It used to be a silent `console.warn` | `src/contexts/AuthContext.tsx` (backend) |

### Verification
| Check | Result |
|---|---|
| Firestore rules on the emulator (`docs/techlead/firestore-rules.test.mjs`) | **105/105** in stage A **and** stage B (62 existing + 43 store-QR; the suite detects the stage) |
| `npm run test:unit` | **17/17** |
| `tsc --strict`, `tsc -p tests`, `npm run build` | Pass on the **whole tree** after the frontend applied WO-4a (Payment Settings) and WO-4b (POS + Reports + router flags) |
| Frontend logic check (backend) | POS: atomic save, ReferenceUsedError, Confirm guarded by reference + "received", back to Cash after each order and when a method is switched off, ₱→% clamp. Reports: `paymentBreakdown`, Ref column on screen and in the PDF |

### Changes by file
| File | Change |
|---|---|
| `firestore.rules` | `eWalletOk`/`cardOk` on order create; `paymentRefs` (create-only, typed fields, getAfter pairing); `settings/payments` (admin-only, validated) |
| `src/lib/eWallet.ts`, `storeSettings.ts`, `saveOrder.ts`, `reports.ts` | **New** |
| `src/lib/orders.ts` | `ManualPayment` in `buildOrder` |
| `src/types/index.ts` | `WalletSettings`, `PaymentSettings`; `Order.paymentVerification`, `verifiedBy` |
| `src/App.tsx` | `/admin/payments` route |
| `src/contexts/AuthContext.tsx` | RFID re-link failure toast |
| `tests/unit/*`, `tests/tsconfig.json`, `scripts/test-unit.mjs`, `package.json` (`test:unit`) | **New** unit tests and runner |
| `docs/techlead/firestore-rules.test.mjs` | Emulator host from `FIRESTORE_EMULATOR_HOST`; 41 store-QR cases (edited with the Tech Lead's permission) |

---

## 23. Phase 1: multi-store foundation (branch `p1-multistore`, not live until the cutover)

- **Data:** everything per shop lives under `tenants/{T}/…`. `users/{uid}.tenantId` is the membership (one shop per login), and `slugs/{slug}` gives the terminal lookup.
- **Code:** `src/lib/tenant.ts` (path helpers) and a tenant-aware `AuthContext`. Every page and lib uses `tenantCol`/`tenantDoc` (POS, Products, Reports, both dashboards, Staff, store QR, saveOrder).
- **RFID:** only on `/s/:slug`, and a card from another shop is refused.
- **Rules:** `firestore.rules` (multi-store) and `firestore.transition.rules` (old + new, for the switch only). See `SAAS_V2_CONTRACT.md` §16.
- **Tests:**
  - `npm run test:rules`: 84/84
  - `npm run test:rules:transition`: 105/105
  - E2E on the emulators: 17/17 (final + transition rules)
- **Migration:**
  - `npm run migrate -- …` (dry run → `--apply` → `--verify`, resumable, delta-safe)
  - `scripts/load-backup-into-emulator.mjs`
  - runbook in `docs/backend/CUTOVER.md`
- **New dev dependencies:** `firebase-admin` (migration) and `@firebase/rules-unit-testing` (rules suites).
- **Known follow-up:** the demo recorder mocks (`scripts/demo/mocks/firestore.ts`) still use root collections. Update them before the final tutorial is recorded.
- **Windows note:** `firebase emulators:exec` can leave the Java emulator running after the tests. If a port stays busy, end the `java.exe` whose command line contains `cloud-firestore-emulator`.


## 24. Sign-up with an email code (2026-10-23)

**Owner request:** no account may exist in Firebase Authentication until its email is confirmed. Bugs this fixes:
- After confirming in Gmail, owners stayed stuck on "Set up your shop" instead of landing in the app.
- "Back" couldn't reach the sign-in page.
- A `localhost` link in local testing didn't open on a phone.

**New flow:**
1. **`POST /api/signup/code { email }`** (public). It emails a 6-digit code and creates **no account**.
   - Refused (409 `email_taken`) when the email already has a login. The one exception: a login the old flow left behind (never confirmed, password only, not disabled, no `users/{uid}` profile, not in `platformAdmins`).
   - Same limits as before, now per address: one email a minute and 5 a day per address, 10 a day per network, and the `verify` share of the daily Gmail budget. A failed send isn't counted.
2. **`POST /api/signup/finish { email, code, password, name }`** (public). It checks the code, then creates the login with `emailVerified: true` (Admin SDK). A leftover login from the old flow is deleted first.
   - Codes last 10 minutes and allow 5 tries. A new code replaces the old one.
   - Errors: `code_wrong` ("N tries left"), `code_expired`, `code_locked`, `code_missing`.
   - Bad input (`invalid_code`, `weak_password`, `invalid_email`) and `email_taken` don't use up a try.
3. The app signs in with the same password, creates the shop (`createShop`) and, when the trial was picked, starts it (`startTrial`). It then opens `/admin`. A paid package opens `/admin/billing?plan=…`.

**Storage:**
- Codes live in the server-only collection `signupCodes/{emailId}`. Only a SHA-256 hash of the code is kept, plus `expiresAt` and `tries`.
- `emailId` is a hash of the address.
- No Firestore rule matches the collection, so the app can never read it.

**Removed:**
- `/api/email/verify`, `verifyEmailHandler` and `generateEmailVerificationLink`
- the `/verify-email` page
- `signUp`, `resendVerification` and `checkEmailVerified` in AuthContext
- the Billing `?start=trial` auto-start

**AuthContext:**
- `sendSignUpCode` and `finishSignUp` replace the old sign-up calls. `loginWithGoogle` now returns `{ isNew }`.
- A never-confirmed password login without a profile (old flow) is signed out. Signing in with one says to sign up again.

**Email deliverability:** the code email has **no links**. The old "Confirm my email" button pointed to a `vercel.app` address, a common spam signal. Emails are now full HTML pages (charset, `lang`, title) with a plain-text part.

**Local testing:**
- `npm run dev`: test addresses (`@shop.test`) get "Local test: fill in the code". Real addresses also get the real email when `VITE_LOCAL_REAL_EMAIL=true` and Gmail is in `.env`.
- `npm run dev:live`: needs `FIREBASE_SERVICE_ACCOUNT` in `.env`. When it's missing, the page and the terminal now say so, instead of "Please contact us".

**Tests:**
- `npm run test:api`: 45/45 (sign-up codes, limits, leftovers, payment emails, `checkCode`).
- Playwright E2E on the emulators: 21/21. It covers no account before the code, a wrong code, Back, the right code → dashboard with the trial running, a reused code refused, "no shop" → Back → sign-in, and the old leftover login.

## 25. Store features: Store Settings, product details, discounts, VAT and void (2026-10-23, branch `store-features`)

**Data (all new fields optional; old shops, products and orders work as before):**
- `tenants/{T}`: `businessType` (`food|grocery|clothing|hardware|pharmacy|gadgets|services|other`) and `receipt { vatRegistered, tin, address, phone, footer }`.
- `tenants/{T}/settings/branding` **(public get, no list)**: `{ name, logoUrl ('' = JPOS logo), theme, updatedAt, updatedBy }`. Written with the shop at sign-up; shops made before get it the first time an admin opens the app (`addMissingBranding`).
- `tenants/{T}/discounts/{id}`: `{ name ≤40, kind percent|fixed, value (>0; ≤100 or ≤100000), active, createdAt, updatedAt }`.
- `Product`: `brand`, `size`, `color`, `unit`, `sku`. `OrderItem`: `details`, `unit`, `discount`, `discountName`.
- `Order`: `discount` = every peso given away (items + order + Senior/PWD 20%); `tax` = the VAT inside the total; `vat { vatable, vat, exempt }` (VAT-registered stores), `lessVat` (Senior/PWD in VAT stores), `discounts [{ name, amount }]`, `senior { type, idNumber, name }`; `total = subtotal − discount − lessVat`. Void: `status: 'voided'`, `voidedBy`, `voidedByName`, `voidedAt`, `voidReason`.

**Money** (`src/lib/pricing.ts`, pure, `tests/unit/pricing.test.ts`): item discounts → order discount on the rest → total; VAT stores split the total into VATable sales and VAT (÷ 1.12). Senior/PWD: exempt = subtotal ÷ 1.12 (VAT stores), 20% of that off, no other discounts. Every step rounds to the centavo.

**Rules (`firestore.rules`):**
- Tenant create allows an optional valid `businessType`. New tenant update `editStore()`: admins (shop not suspended) change only `name`, `businessType`, `receipt`, `updatedAt`, validated; a new name must match the branding doc in the same batch.
- `settings/branding`: public `get`; written by the shop's admins (not suspended) or the new owner in the sign-up batch; keys, https logo ≤ 500, theme and name (= the shop's) validated.
- `discounts`: members read; admins with access write (validated); admins delete.
- **Orders:** the only update is **void** (admin with access, `completed → voided`, own uid, a 3–200 character reason, nothing else changed). **Delete is no longer allowed** (it was admin-allowed before; nothing in the app deleted orders).
- Tests: `tests/rules/store.rules.test.mjs` (57); the full suite is 212/212. Rule tests can now run beside the local test app: `RULES_PROJECT=demo-rules FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node tests/rules/<file>`.

**Deploy order:** **rules first, then the app.** The new rules accept the current live app (no `businessType`, no branding doc); the new app's sign-up needs the new rules.

**Also on this branch:** a shop's sign-in page refuses other shops' accounts and logout returns to where you signed in (`AuthContext`, `src/lib/terminal.ts`); Super Admin email change (`api/account/email-code.ts`, `email-finish.ts`, api tests 58/58).

**Emails (owner: "lagyan ng design at logo"):** every email (sign-up code, email-change code, new payment) uses one design: an espresso header with the JPOS logo, a caramel line, a cream card, the code in a big boxed block, and an inbox preview line. Tables + inline styles for Gmail/Outlook/phones. The logo (`api/_lib/emailLogo.ts`, 112 px PNG made from `public/logo.png`) is sent inside the email (`cid:`), so nothing loads from the web and the code emails still have no links; the local inbox preview (`/__dev/mail`) shows it as a picture.

**Forgot password (2026-10-23):** `POST /api/password/code { email }` emails a 6-digit code (`passwordResetCodeMessage`, no links) when a login with that email exists and isn't turned off; the answer is always `{ sent: true }` and the per-address/per-network limits count every ask. `POST /api/password/reset { email, code, password }` checks the code (kept as `signupCodes/rst_<emailId>`, 10 min, 5 tries; a sign-up code never works here), sets the password (`auth.updatePassword`) and, when the person has an RFID card, writes the new password into `tenants/{T}/rfidCards/{tag}` too (`store.setCardPassword`, only their own card), so tapping keeps working. API tests 68/68.

**Package features (2026-10-23):** `Entitlements` gains `branding`, `discounts`, `voidSales` (Starter false, Business/Enterprise true in `DEFAULT_ENTITLEMENTS`, `setup-platform.mjs`, `seed-local.mjs`). Shops and packages saved before have no flag: `hasFeature()` (client) and `shopCan()` (rules) both fall back to the package (`plan != starter`), so nothing has to be migrated. Rules: `settings/branding` accepts its own logo/colors only with `branding` (the JPOS look is always allowed), `discounts` create/update need `discounts` (delete stays open), and void needs `voidSales`. Tests: store rules 67/67 (Starter, Business without flags, Business with them off, Starter given its own look), suite 222/222. **Deploy: rules first, then the app.**

**Storage (2026-10-23):** `POST /api/usage { tenantId? }` (`api/usage.ts`): the shop's admins (own shop) or the Super Admin (any) get numbers only: used/limit bytes, photos, data, counts. Counted with Admin SDK aggregations (products, orders, products with a picture, `sum(imageBytes)` of measured ones, staff photos, logo, QRs); older pictures are estimated at 250 KB, sales data at 1.5 KB per order and 1 KB per product (`api/_lib/usage.ts`, unit-tested). `Entitlements.storageMB` (500 / 2048 / 10240, null = unlimited; missing → the package's). Products keep `imageBytes` (no rule change). The limit is checked in the app before uploads (Cloudinary uploads go straight from the browser, so it can't be a server rule). API tests 73/73.

**Inventory (2026-10-23):** `Product.trackStock/stock/lowStockAt`, `OrderItem.stockTracked`, `Entitlements.inventory` (Business+, same fallback). Rules: products `create, delete` admin; `update` admin, or any member of a shop with `inventory` taking stock **off** a counted product (`changed() == {stock}`, lower than before). `saveOrderAtomically` adds `increment(-qty)` per counted product to the order batch and retries without it if refused. `voidOrder` adds the stock back (existing, counted products only). Rules tests +9 (store 76/76).

**Audit trail (2026-10-23):** `tenants/{T}/activity/{id}` `{ action, by, byName, at, target, note }`; `Entitlements.auditTrail` (Business+, same fallback). Rules: admins read; any member of a shop with `auditTrail` creates, only as themselves (`by == uid`) at the server's time, with size limits; nobody updates or deletes. Entries are written by the app after each action and never block it. Rules tests +10 (store 86/86, suite 241/241).

**Void in every package (owner, 2026-10-23):** Starter's `voidSales` default is now true; the void rule reads `entitlements.get('voidSales', true)` and `hasFeature()` falls back to each feature's package default. The Starter card lists Void sales; the Enterprise card no longer lists Customer rewards.

**Daily sales email (2026-10-23):** `GET /api/cron/daily-summary` (`api/cron/daily-summary.ts`), run by **Vercel Cron** at `0 0 * * *` (00:00 UTC = 8:00 PH, `vercel.json`). With the `CRON_SECRET` env var on Vercel (Vercel sends it as `Authorization: Bearer …`) only the scheduler gets in; without it the run is still harmless (one email per shop per day, the same numbers, inside the budget). It lists shops on a trial or a paid package (`summaryShops`), keeps those whose package has `emailSummary` (Business+) and haven't switched it off (`tenant.dailySummary`, editable by `editStore`), sums yesterday's orders in Philippine time (`api/_lib/summary.ts`), and sends one email per shop per day (`mailLog` once-key `sum_<shop>_<date>`, its own budget: 80/day, so verify 300 + payment 100 + summary 80 stays under Gmail's 500). API tests 80/80.
