# Frontend Changes — 2026-10-22

| | |
|---|---|
| **Role** | Frontend developer (UI, styling, pages, components, `public/` assets) |
| **Scope** | Full UI redesign of JPOS to follow `reference_UI/` (landing page + login, app shell, every admin/staff screen) |
| **Status** | §1–§13 are committed: the redesign in checkpoint `c179cd9`, then the polish and review fixes in the follow-up frontend commit. §14–§16 are **not committed yet** (waiting for the Tech Lead's review). Nothing is pushed. |
| **Reference** | `reference_UI/FullUI.png` (full page), `reference_UI/JPOS Coffee Shop POS Landing Page.png` (hero + login card), plus the photo and asset PNGs |
| **Companion docs** | [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md): tokens, classes and components for building new screens · [`../BACKEND_CHANGES.md`](../BACKEND_CHANGES.md): logic changes |

## Contents
1. [Summary](#1-summary)
2. [Open items: please decide](#2-open-items-please-decide)
3. [Landing page (`/login`)](#3-landing-page-login)
4. [Login card: logic kept exactly as before](#4-login-card-logic-kept-exactly-as-before)
5. [App shell (admin + staff)](#5-app-shell-admin--staff)
6. [Screens](#6-screens)
7. [Logic changes applied for the backend](#7-logic-changes-applied-for-the-backend)
8. [Assets](#8-assets)
9. [Changes after checkpoint `c179cd9`](#9-changes-after-checkpoint-c179cd9)
10. [Verification](#10-verification)
11. [Changes by file](#11-changes-by-file)
12. [Coordination rules followed](#12-coordination-rules-followed)
13. [Tech Lead review follow-ups](#13-tech-lead-review-follow-ups)
14. [POS: PayMongo (TEST) checkout + order QR on every receipt](#14-pos-paymongo-test-checkout--order-qr-on-every-receipt)
15. [Small fixes: scroll reset, sticky modal header/footer, lazy PDF](#15-small-fixes-scroll-reset-sticky-modal-headerfooter-lazy-pdf)
16. [Tutorial video: confidential, not on the landing page](#16-tutorial-video-confidential-not-on-the-landing-page)
17. [WO-2: approved packages on the pricing section](#17-wo-2-approved-packages-on-the-pricing-section)
18. [WO-2b: landing copy for every small business](#18-wo-2b-landing-copy-for-every-small-business)
19. [WO-4a: admin Payment Settings page](#19-wo-4a-admin-payment-settings-page)
20. [WO-4b: POS store-QR e-wallet checkout + Reports reconciliation](#20-wo-4b-pos-store-qr-e-wallet-checkout--reports-reconciliation)
21. [WO-6: color themes (CSS variables) + business-neutral shop app](#21-wo-6-color-themes-css-variables--business-neutral-shop-app)

---

## 1. Summary

- **New look everywhere:** espresso browns, caramel accents, cream surfaces; *Playfair Display* headings, an *Allura* script accent and *DM Sans* body text. Every button, input and filter is pill-shaped, as in the mockup.
- **`/login` is now a full landing page.** It has a hero with the sign-in card, About, Key Features, Powerful Dashboard, Testimonials, Pricing and Footer. The sign-in form moved into `src/components/landing/LoginCard.tsx` **with its logic unchanged**.
- **One shared app frame** (`AppShell`) for Admin and Staff: a dark espresso sidebar, a cream content area and a mobile drawer.
- **Shared UI building blocks** (`PageHeader`, `StatCard`, `BrandMark`, `Decor`, `chartTheme`), so all pages look the same and new pages are quick to build.
- **No behavior changes** except the ones the backend asked for (§7) and one addition: a *Top Selling Items* card on the admin dashboard (§6.1).
- **Routing unchanged:** `App.tsx` is owned by the backend and wasn't touched. `/login` still renders `LoginPage`.

## 2. Open items: please decide

| # | Item | Where | Why it matters |
|---|---|---|---|
| 1 | **Testimonials are placeholders** (names and quotes come from the mockup) | `src/components/landing/content.ts` → `TESTIMONIALS` | Fake reviews must not go live. Replace them with real quotes, or remove `<TestimonialsSection />` from `LoginPage.tsx` |
| 2 | ~~Pricing is placeholder~~ ✅ **Resolved:** the pricing now shows the approved packages (§17) | `content.ts` → `PLANS` | Prices and features become editable by the Super Admin in Phase 2 |
| 3 | **External links are empty** (Facebook, YouTube, email, FAQ, Docs, Privacy, Terms) | `content.ts` → `EXTERNAL_LINKS` | Until filled in, clicking one shows "… is coming soon." Fill in a URL and that link starts working, with no other code change |
| 4 | **The newsletter form has no backend** | `LandingFooter.tsx` → `subscribe` | It says "Newsletter sign-ups open soon" and doesn't store anything. It needs a backend task if it should be real |
| 5 | ~~"Inventory Management" is advertised~~ ✅ **Resolved:** Inventory, Multi-Branch and Advanced Analytics were removed from all copy (§17) | — | — |
| 6 | **Main JS bundle is ~1.7 MB** (Vite warns about it; it was this size before the redesign) | `App.tsx` routes | Lazy-loading pages with `React.lazy` would cut it. `App.tsx` is the backend's file, so this needs their OK |
| 7 | **`public/coffeelogo.png` (1.1 MB) is no longer referenced**; the app uses `logo.png` (256 px) and `favicon.png` | `public/` | Kept as the high-res source for the logo. Safe to delete if not needed |

## 3. Landing page (`/login`)

`src/pages/LoginPage.tsx` now only composes the sections. Each section is its own file in `src/components/landing/`:

| Section | File | Notes |
|---|---|---|
| Navbar | `LandingNav.tsx` | Transparent over the hero, solid espresso once scrolled. The active link follows the scroll position. **Login** scrolls to the card and focuses the email field. Mobile has a menu button |
| Hero | `Hero.tsx` | Café photo background, the *Good Coffee • Better Days* script line, the *Your Coffee Shop, Simplified* headline, 3 highlights. **Get Started** focuses the sign-in card; **Learn More** scrolls to About. Floating beans sit at fixed positions (no randomness) |
| Sign-in card | `LoginCard.tsx` | See §4 |
| About | `AboutSection.tsx` | Photo in an organic blob frame, checklist, a line-art coffee branch |
| Key Features | `FeaturesSection.tsx` | 6 glass cards: 2 columns on phones, 3 on desktop |
| Powerful Dashboard | `DashboardSection.tsx` + `DashboardMock.tsx` | Dark band with a **static illustration** of the dashboard (sample numbers, marked `role="img"`) |
| Testimonials | `TestimonialsSection.tsx` | Grid on desktop; swipeable row with **working** dots on phones |
| Pricing | `PricingSection.tsx` | The middle plan is highlighted. **Get Started** focuses the sign-in card; **Contact Us** scrolls to the footer |
| Footer (`#contact`) | `LandingFooter.tsx` | Quick links scroll; support, social and legal links use `EXTERNAL_LINKS` |

Helpers: `content.ts` holds **all landing copy**, and `scroll.ts` holds `scrollToSection`, `focusLogin` and `openExternal`.

## 4. Login card: logic kept exactly as before

The function body of `LoginCard` was checked with `diff` against the old `LoginPage`. It's **byte-identical**: the only difference is one trailing blank line. Kept as-is:

- **RFID**
  - `loadingRef.current = true` at the start of `handleRFIDScan`, and `= false` in `finally`.
  - The scanner-speed check (`firstCharAt`, `SCANNER_MS_PER_CHAR = 50`, the 350 ms idle submit).
  - The 300 ms focus loop runs **only while `mode === 'rfid'`**.
  - `autoFocus` on the capture input, Enter submits, and the **Scan** button still works.
- **Google:** `loginWithGoogle()` is called straight from the click handler (nothing awaited before it, so the popup isn't blocked). `CANCELLED_SIGN_IN_CODES` are ignored, and the official multicolor **G** is kept.
- **Password:** same `handleLogin`, same error messages through `getAuthErrorMessage`.
- The old random `BEANS` background was removed with the old design. The new beans use fixed positions, so the "nothing jumps on re-render" behavior still holds.

Visual only: a cream card with a leaf corner, a segmented Password/RFID toggle, pill inputs with icons, a dark **Sign In** pill and a white **Sign in with Google** pill. New `id`s: `#login` (card) and `#login-email`, used by the landing CTAs. Inputs gained `autoComplete` and `aria-label`s.

## 5. App shell (admin + staff)

`src/components/shared/AppShell.tsx` replaces the duplicated sidebar markup in `AdminLayout` and `StaffLayout`. Both layouts now pass only their nav items, labels and handlers.

- Dark espresso sidebar: logo tile, a **MENU** label, pill nav links (active link has a caramel gradient), and a user card with Settings (admin only) and Logout.
- **Desktop collapse** to an icon rail (admin only, `collapsible`).
- **Mobile:** a top bar with the menu button and a slide-in drawer. The drawer **always opens expanded**: `setCollapsed(false)` on open is kept from the backend fix.
- Unchanged: `handleLogout` in each layout (same toasts and redirect), and `AccountSettingsModal` still opens from the admin sidebar.

## 6. Screens

### 6.1 Admin Dashboard: `src/pages/admin/Dashboard.tsx`
- `PageHeader` (date chip), three `StatCard`s with green/red change pills, the **Sales Overview** area chart, **Daily Orders** bars and **Recent Orders** rows with a payment badge.
- **New: Top Selling Items** (top 5 this week). It is computed from the same 7-day query already loaded, **ranked by quantity**, because item subtotals are before discounts (per the backend's note). There is no extra Firestore read.

### 6.2 Staff Dashboard: `src/pages/staff/Dashboard.tsx`
- A greeting banner in the hero style (photo, script greeting, caramel **Start Taking Orders** button), two `StatCard`s and a recent-orders list. The data fetch is unchanged.

### 6.3 Point of Sale: `src/components/shared/POSComponent.tsx`
- Pill search and category pills. Product tiles with a caramel **+** button; the dark photo gradient is shown only when the product has an image.
- **Current Order** panel: thumbnails, pill quantity steppers, a segmented %/₱ discount control and a large total.
- On mobile, the cart is a floating espresso **View Order** bar.
- Checkout and receipt modals were restyled.
- **Kept:** `id="receipt"` and the `@media print` rules in `index.css` (receipt-only area now has `print:` resets). Both modals stay inside `<Portal>`. The order is still saved with a doc ref + `setDoc`; `discountAmount` still comes from `useCart`; tendered amount and change are still cash-only; the discount input still clamps.

### 6.4 Products: `src/pages/admin/Products.tsx`
- Header actions, a filter bar, product cards with an availability toggle, and restyled product and category modals.
- **Kept:** the `[@media(hover:hover)]:opacity-0 …` classes (edit/delete buttons stay visible on touch screens), Save disabled while an image uploads, and the file input reset.

### 6.5 Reports: `src/pages/admin/Reports.tsx`
- Segmented range control with a range label, `StatCard`s, the area chart, and a **donut** for payment methods with a legend list (replacing the slice labels).
- Ranked badges in Top Products, and a payment badge in Order Details.
- **`downloadPDF` was not touched**; the PDF keeps its own colors.

### 6.6 Staff Management: `src/pages/admin/Staff.tsx`
- Section headers with icons, cards with avatar rings, a role badge, a **"You"** badge on your own card and an Active/Inactive toggle label.
- The modal has a segmented Role control and a restyled RFID box.
- **Kept:** `isSelf` (no delete or deactivate for yourself), role and active fields locked for yourself, and all RFID/password logic. Admin-no-RFID UI is covered in §7.

### 6.7 Account Settings: `src/components/admin/AccountSettingsModal.tsx`
- A segmented Profile/Password control, an avatar ring and pill inputs. The profile and password logic is unchanged (RFID sync removed per §7).

### 6.8 Loading screen: `src/components/shared/LoadingScreen.tsx`
- Espresso background, the logo inside a caramel spinner, "Brewing your workspace…" in script.

### 6.9 Global
- `index.html`: loads the Allura font and the variable weights of Playfair and DM Sans; `theme-color`, meta description, a small favicon and an apple-touch icon.
- `main.tsx`: the toast style changed to an espresso pill with a caramel success icon.

## 7. Logic changes applied for the backend

The backend (`fix-jpos-bugs`) owns logic. These changes were **written by the backend** and applied by the frontend exactly as sent:

| ID | File | Change | Requested by |
|---|---|---|---|
| B1 | `admin/Dashboard.tsx` | "vs yesterday" now compares with **yesterday up to the same time** (`yesterdaySoFar`); the label reads "vs same time yesterday" | Tech Lead review → backend |
| B2 | `admin/Reports.tsx` | `toast.error('Failed to load report')` when loading fails | Tech Lead review → backend |
| B3 | `admin/Dashboard.tsx` | `toast.error('Failed to load dashboard')` when loading fails | Tech Lead review → backend |
| §19 | `admin/Staff.tsx` | **Admins can't use RFID:** `isAdminRole` forces `newTag = ''` (saving an admin removes the card), with a 3-way success toast. UI: when Role = Admin, the RFID fields are replaced by a note, plus "Saving will remove this account's RFID card." when the account still has one. The note reacts to the role toggle, and a typed tag stays in state | User decision → backend |
| §19 | `admin/AccountSettingsModal.tsx` | RFID password-sync block removed; the `getDoc` import was dropped | User decision → backend |
| — | `POSComponent.tsx`, `Staff.tsx` | Unused imports removed (`CartItem`, `Percent`, `Upload`) | Tech Lead |

## 8. Assets

Generated from `reference_UI/` with Pillow (script not kept in the repo):

| File | Size | Source / use |
|---|---|---|
| `public/images/hero-bg.jpg` | ~149 KB | *Warm Café Coffee Still Life.png* → hero background |
| `public/images/about.jpg` | ~103 KB | Right-hand crop of the same photo → About blob, staff greeting banner |
| `public/images/coffee-branch.png` | ~44 KB | Line-art branch cut out of *Coffee-Themed Transparent Asset Collection.png*: transparent background, recolored caramel, edges faded |
| `public/logo.png` | ~65 KB | `coffeelogo.png` resized to 256 px → navbar, sidebar, cards |
| `public/favicon.png` | ~5 KB | `coffeelogo.png` at 64 px → browser tab |

Coffee beans, swashes and waves are inline SVG (`src/components/shared/Decor.tsx`), so they stay sharp at any size.

## 9. Changes after checkpoint `c179cd9`

Committed in the follow-up frontend commit:

- §7 admin-no-RFID (`Staff.tsx`, `AccountSettingsModal.tsx`).
- Sidebar and POS cart shadows are now applied **only when the panel is visible**. Before this, the hidden mobile drawer/cart cast a dark strip on the screen edge.
- POS: the photo gradient is shown only when a product has an image (no more gray wash on placeholders).
- Dashboard: the Sales Overview chart is taller (290 px), and the "sold" counts use the regular font.
- Reports: the Sales Over Time chart is taller (320 px).
- Tech Lead review fixes F1–F3 (§13).
- **Landing navbar: the vertical bars between the tabs were removed** at the user's request. The tabs are now spaced with a gap (`LandingNav.tsx`).

## 10. Verification

| Check | Result |
|---|---|
| `tsc --noEmit --noUnusedLocals --noUnusedParameters` | ✅ clean |
| `vite build` | ✅ builds. The >500 kB chunk warning was already there (§2 #6) |
| Logic preserved | ✅ The logic part of each restyled file (everything above `return (`) was diffed against the backend's version: identical, apart from the imports and the `COLORS` palette constant in Reports. Every JSX handler and prop (`onClick`, `onChange`, `disabled`, `value`, …) was compared by script: none missing |
| Landing page | ✅ Screenshots at 1440 px and 390 px (real app; the landing page needs no login) |
| Admin/Staff screens | ✅ Screenshots of Dashboard, POS (cart + checkout), Products, Reports, Staff (+ modal), Staff dashboard and the mobile drawer. These used a **throwaway preview** in the session scratchpad that swaps Firebase for sample data; it isn't in the repo |
| Not tested | Real Firebase sign-in, RFID reader, Google popup and receipt printing on hardware. The logic is unchanged, but please smoke-test them once |

## 11. Changes by file

| File | Type | Change |
|---|---|---|
| `tailwind.config.js` | M | New palettes (`espresso`, `caramel`, `cream`, `bark`), `script` font, shadows, `rounded-4xl`, float/steam animations |
| `src/index.css` | M | Design-system component classes (see DESIGN-SYSTEM.md); print rules kept; reduced-motion support |
| `index.html` | M | Fonts, meta, favicon |
| `src/main.tsx` | M | Toast styling only |
| `src/pages/LoginPage.tsx` | M | Now the landing page composition |
| `src/components/landing/*` | A | 10 section components, plus `content.ts` and `scroll.ts` |
| `src/components/shared/AppShell.tsx` | A | Shared sidebar/drawer frame |
| `src/components/shared/{BrandMark,PageHeader,StatCard,Decor}.tsx` | A | UI building blocks |
| `src/components/shared/chartTheme.ts` | A | Recharts colors and tooltip style |
| `src/components/admin/AdminLayout.tsx`, `staff/StaffLayout.tsx` | M | Thin wrappers around `AppShell` |
| `src/components/shared/LoadingScreen.tsx` | M | Restyle |
| `src/components/shared/POSComponent.tsx` | M | Restyle (render only) |
| `src/pages/admin/{Dashboard,Products,Reports,Staff}.tsx` | M | Restyle + §6.1 + §7 |
| `src/pages/staff/Dashboard.tsx` | M | Restyle (render only) |
| `src/components/admin/AccountSettingsModal.tsx` | M | Restyle + §7 |
| `public/images/*`, `public/logo.png`, `public/favicon.png` | A | §8 |

## 12. Coordination rules followed

- File ownership was agreed with the backend before editing. Frontend files: styling, pages, components, `public/`. Backend files: `src/contexts`, `src/lib`, `src/types`, `App.tsx`, `README.md`. The frontend didn't edit any backend file.
- Logic fixes inside UI files were written by the backend and applied here word for word (§7).
- The checkpoint commit `c179cd9` was made by the Tech Lead session. The follow-up frontend commit was made by the frontend at the user's request, and contains **only frontend-owned files** (the backend's and Tech Lead's uncommitted files were left for their owners). Per the user's rule in `note.md`, it has no Claude co-author line.

## 13. Tech Lead review follow-ups

Review by `jpos-48`: **approved** with 1 Medium and 2 Low findings. All are fixed, committed, and **re-checked ✅ by the Tech Lead. The frontend review is closed.**

| ID | Severity | File | Problem | Fix |
|---|---|---|---|---|
| F1 | Medium | `landing/LoginCard.tsx` (RFID focus loop) | On the scrollable landing page, RFID mode grabbed focus every 300 ms. It pulled the page back to the card (`focus()` scrolls) and stole typing from other fields, such as the newsletter box | The loop skips its turn while another text field (`INPUT`/`TEXTAREA`/`SELECT`/contenteditable) has focus, and uses `focus({ preventScroll: true })`. It still runs only in RFID mode. Scans still work after clicking buttons or links, because focus returns without scrolling. The backend was informed, since it's their RFID contract |
| F2 | Low | `shared/AppShell.tsx` | `h-screen` (100vh) is taller than the visible area on mobile browsers, so the toolbar could cover the bottom of the app | `h-dvh` |
| F3 | Low (a11y) | `shared/AppShell.tsx` | The closed mobile drawer was only moved off-screen, so Tab still reached its links | `max-lg:invisible` when closed. `transition-all` keeps it visible while it slides out |
| F3b | Low (a11y) | `shared/POSComponent.tsx` | Same issue for the closed mobile cart (found while fixing F3) | `max-lg:invisible` when closed, with `transition-[transform,visibility]` |

**F1 check (real app, headless Edge):**
1. In RFID mode, the capture box got focus.
2. Focused the newsletter input and waited 1.2 s: it kept focus, and `scrollY` stayed at 3667 (no jump).
3. Clicked the footer link "Features": the page stayed on Features, and focus went back to the RFID box without scrolling.

`tsc --noUnusedLocals --noUnusedParameters` and `vite build` pass.

## 14. POS: PayMongo (TEST) checkout + order QR on every receipt

The contract came from the backend and was approved by the Tech Lead. The backend wrote the logic; the frontend applied it to `src/components/shared/POSComponent.tsx` word for word, and the backend then verified it.

> ✅ **PayMongo REMOVED (user decision: manual payments only, WO-1).** PayMongo is archived by the backend on the local branch `archive/paymongo-test`. The frontend applied the backend's exact removal diff to `POSComponent.tsx`:
> - removed: the PayMongo imports and state, `payWithPayMongo`, `closeCheckout`, the cart lock, the waiting panel, the TEST MODE note and the ₱20 hint;
> - the footer is back to Cancel + Confirm Order;
> - also deleted: `scripts/demo/mocks/paymongo.ts` and its alias.
>
> **Kept:** `takeSnapshot` / `saveOrder` / `placeOrder` (via the backend's `buildOrder`), the receipt `Ref` / note lines, the **order QR on every receipt**, and the scrollable receipt modal.
> Checks: `grep -ri paymongo src/` finds nothing; `tsc --strict --noUnusedLocals --noUnusedParameters` and `npm run build` pass.
> The store-QR GCash/Maya checkout comes next (WO-3).
>
> *The text below describes the removed PayMongo UI, kept as history.*

**Logic (backend's, copied verbatim):** `takeSnapshot`, `saveOrder`, `placeOrder`, `payWithPayMongo`. The order is frozen when Pay is pressed, and `usePayMongoCheckout` guarantees it is placed **exactly once**. Frontend addition: `closeCheckout()`. While a checkout runs, the X and Cancel buttons cancel it instead of closing the modal.

**UI (frontend):**
- **Cart lock** (`cartLocked`): disabled on product add, qty −/+, remove, the %/₱ toggles, the discount input, Clear Cart, the Table/Customer inputs, the payment methods, Notes and Checkout.
- **Non-cash checkout** with PayMongo enabled: the primary button is **"Pay with PayMongo (TEST)"**. A **TEST MODE** badge and a "Record without PayMongo" link sit under the methods.
- **Below ₱20** (`payMongoAmountProblem`): an amber hint, and only the manual **Confirm Order** button.
- **Waiting panel:**
  - Creating checkout… → a large QR of the checkout URL plus a real "Open checkout page" link → Waiting for payment…, with a hint for each method. An amber note appears if the last attempt failed. → Cancelling…
  - A **TEST MODE** badge is always shown.
- **Receipt:**
  - A `Ref` line and a payment note for online payments.
  - **An order QR on every receipt** (`receiptQrPayload`, 128 px, about 34 mm printed), inside `#receipt` so it prints.

**Verified** in the demo preview (fake PayMongo; the real hook runs on top):
- The cart locks while waiting.
- An auto-paid checkout produces exactly one receipt, with the `pay_…` reference and the QR.
- "Cancel payment" and X cancel the checkout and keep the modal open, with no order created.
- A ₱6 total shows the hint and only Confirm.
- In print emulation at 80 mm, the receipt and QR are complete.

Not checked: machine-decoding the QR (no decoder on this PC; please scan once with a phone), and real PayMongo.

## 15. Small fixes: scroll reset, sticky modal header/footer, lazy PDF

| File | Change | Why |
|---|---|---|
| `shared/AppShell.tsx` | `<main>` scrolls to the top on every route change | `<main>` is shared by all pages, so Reports opened half-way down after you'd scrolled the Dashboard (the demo recorder found this) |
| `src/index.css` | `.modal-header` / `.modal-footer` are `sticky` with solid backgrounds | On screens about 720 px tall, Confirm/Pay/Save sat below the fold inside a scrolling modal. Laptops at 1366×768 hit this |
| `POSComponent.tsx` | Receipt modal: `max-h-[92vh] overflow-y-auto` | With the QR it can be taller than short screens. Printing is unaffected: `#receipt`'s containing block is the fixed backdrop, which print emulation confirmed |
| `admin/Reports.tsx` | `jspdf` + `jspdf-autotable` are loaded with `import()` when "Download PDF" is clicked; the error text was updated | The backend's code-splitting change, applied as written. It keeps ~400 kB off the Reports page |

## 16. Tutorial video: confidential, not on the landing page

**Decision (user, through the Tech Lead):** the video shows the admin side (dashboard, reports, staff), so it's **confidential and for subscribers only**. The final tutorial will be recorded **at the very end** and shown on an in-app Help page behind login, served from protected storage.

**What changed:**
- **Removed from the landing page:** `<DemoSection>` in `LoginPage.tsx`, the **Demo** navbar link, the hero **Watch demo** button, and `DEMO_VIDEO`/`DEMO_STEPS` in `content.ts`.
- **Video files moved out of `public/`.** Anything in `public/` is deployed and reachable by URL, even when unlinked. `jpos-demo.mp4` + `.jpg` now live in `scripts/demo/output/`, which `scripts/demo/.gitignore` ignores, and the recorder writes there. `public/demo/` no longer exists. **Never commit the video.**
- **No player controls** (user request). No Download, playback speed or picture-in-picture menu, and no play/pause: `controls` was removed, `controlsList="nodownload …"`, `disablePictureInPicture`, `disableRemotePlayback`, and right-click is blocked. This only hides the UI; anyone with the URL can still fetch the file, which is why it must stay behind login.
- `DemoSection.tsx` is **kept for reuse but not used**. It now takes props (`src`, `poster`, `steps`, `title`, …), so the Help page can pass a protected URL. Behavior: it plays while visible and pauses off-screen; with reduced motion it doesn't autoplay (clicking a chapter starts it); the chapter list is real text and clickable.
- `scripts/demo/` (recorder + mocks) is **kept** for the final tutorial. The PayMongo mock is deleted.

**About the v1 recording:** H.264 `yuv420p`, 1280×720, 54.5 s, 1.17 MB, fake data only (see `scripts/demo/README.md`). It's not deployed anywhere. It will be re-recorded once all features are final.

## 17. WO-2: approved packages on the pricing section

Source: `docs/techlead/SUBSCRIPTION-PLAN.md`, "Packages". These are defaults; the Super Admin will be able to edit them in Phase 2.

| Plan | Price | Accounts | Features shown |
|---|---|---|---|
| Starter Plan (*"Also included in the 7-day free trial"*) | ₱499/month | Up to 3 | POS with Cash + the shop's own GCash/Maya QR · receipts with an order QR code · menu & products · Reports: Today / This Week · Messenger support |
| Business Plan (**Most Popular**) | ₱999/month | Up to 10 | Everything in Starter · Month & custom-range reports + PDF export · sales trends dashboard · RFID card login for staff · Messenger support |
| Enterprise | ₱1,999/month | Unlimited | Everything in Business · priority support (Messenger) |

- **Pricing cards** (`PricingSection.tsx`): the account limit is shown as a highlighted pill, followed by a "What's included" list. Check icons are top-aligned so wrapped lines look right. The CTAs are unchanged until `/subscribe` exists (Phase 2): **Get Started** focuses the sign-in card; **Contact Us** scrolls to the footer.
- **Features that don't exist were removed everywhere:**
  - `FEATURES`: "Inventory Management" → **Menu Management**; "Multi-Payment Support" → **Cash, GCash & Maya**.
  - Hero: "Track sales, inventory, and orders" → "sales, orders, and staff".
  - About copy: "sales and inventory" → "sales and orders".
  - Dashboard mock sidebar: "Inventory" → "Products".
  - `index.html` meta description: inventory → staff.
  - `grep -ri "inventory|multi-branch|advanced analytics" src index.html` finds nothing.

Screenshots: [`img/wo2-pricing-1440.jpg`](img/wo2-pricing-1440.jpg) · [`img/wo2-pricing-390.jpg`](img/wo2-pricing-390.jpg)

Checks: `tsc --strict --noUnusedLocals --noUnusedParameters` and `npm run build` pass (after the PayMongo removal in §14).

## 18. WO-2b: landing copy for every small business

The owner's direction (`SUBSCRIPTION-PLAN.md` §9.4): JPOS becomes a POS for every small business. **Only the copy changed.** The design, the photos and the coffee decorations on the landing page stay.

| Where | Before → After |
|---|---|
| Hero script line | "Good Coffee • Better Days" → **"Good Business • Better Days"** (`whitespace-nowrap`, 30 px on phones so it fits at 360 px) |
| Hero headline / subtitle | "Your Coffee Shop, *Simplified*" → **"Your Business, *Simplified*"**. "Manage your coffee shop…" → "Run your café, store or service shop with JPOS. Track sales, orders, and staff — all in one place." |
| Hero divider | "Brewing Business Success" → a **"Built for" chip strip** (`BUILT_FOR` in `content.ts`): Café · Milk tea · Bakery · Restaurant · Sari-sari · Retail · Salon · Laundry · Car wash, each with an icon. Shown on phones too |
| About | "A Smart Solution for Your Small Business"; the paragraph names cafés, milk tea shops, sari-sari stores, salons; the label is "GOOD SERVICE • GREAT BUSINESS"; the point is "Built for Small Businesses" |
| Features | Subtitle "…run your business smoothly"; "Menu Management" → **Products & Services** |
| Testimonials | Mixed placeholders (milk tea shop, sari-sari store, salon), each quote naming only features that exist. The subtitle is neutral, and a visible **"Sample reviews for illustration."** note is added. Replace them with real, permitted quotes before launch |
| Pricing | Unchanged from WO-2, except the Business tagline: "For growing coffee shops" → "For growing businesses" |
| Navbar / LoginCard / footer | Subtitle "Coffee Shop Point of Sale" → **"Point of Sale"**. LoginCard footer → "Business Management System". Footer: "Point of Sale for Small Businesses", and "Brew Smarter" → "Sell Smarter. Grow Bigger." |
| `index.html` | Title **"JPOS — POS for Small Businesses"**; the meta description lists cafés, milk tea shops, sari-sari stores, salons |

Not changed yet (tenant side; comes with branding, WO-6 / Phase B): the receipt header "JPOS COFFEE SHOP", the PDF title "JPOS Coffee Shop", and the loading screen's "Brewing your workspace…".

Screenshots: [`img/wo2b-hero-1440.jpg`](img/wo2b-hero-1440.jpg) · [`img/wo2b-hero-390-360.jpg`](img/wo2b-hero-390-360.jpg)

## 19. WO-4a: admin Payment Settings page

`/admin/payments` (`src/pages/admin/PaymentSettings.tsx`). The lazy route was added by the backend in `App.tsx`, and the **Payment Settings** nav item (Wallet icon) is in `AdminLayout`. The page is admin-only through the route. It uses the backend's `storeSettings.ts` / `eWallet.ts` helpers, whose signatures the backend confirmed won't change.

- **GCash and Maya cards:**
  - an on/off **switch** (new shared `Switch.tsx`, `role="switch"`)
  - **QR upload** with preview (`uploadImage`; image type and ≤ 5 MB checked first), Replace on hover, and **Remove QR** (which also turns the wallet off)
  - **Account name** (≤ 60) and **number hint** (≤ 30, "hide most digits"), each with a counter
- **Card:** a switch, for payments on the shop's own terminal.
- **Validation:** `paymentSettingsProblem()` runs live and shows in the save bar; Save stays disabled while there's a problem. The backend confirmed that when this returns null, the rules accept the save.
- **Confirm dialog:** shown when a wallet's QR changes to a new image: "**Customer payments will go to this account.** Make sure it's your shop's own … account." It previews the new QR, name and hint, then asks **"Yes, use this QR"**.
- **Saving:**
  - `savePaymentSettings(fullDraft)`, then it re-reads.
  - `permission-denied` → "Only admins can change payment settings."
  - A sticky save bar shows unsaved / saved / problem, with **Discard** and **Save changes**.
  - The browser warns before closing the tab with unsaved changes.
- **Loading:** a skeleton while it loads. **If loading fails: an error + Retry and NO editing**, so the defaults can never overwrite a doc that couldn't be read.
- **Last saved** chip from `updatedAt`.

**Verified** on the demo server (fake data; `mocks/cloudinary.ts` fakes the upload):
- Turning Maya on without a QR shows "Upload the Maya QR code before turning Maya on." and Save is disabled.
- After uploading a QR, Save is enabled and the confirm dialog shows.
- "Yes, use this QR" closes it; the bar says "All changes saved." and Maya reads "On: offered at checkout".
- Layout checked at 1440 and 390.
- `tsc --strict --noUnusedLocals --noUnusedParameters` is clean.

Screenshots: [`img/wo4a-payments-1440.jpg`](img/wo4a-payments-1440.jpg) · [`img/wo4a-qr-confirm.jpg`](img/wo4a-qr-confirm.jpg) · [`img/wo4a-payments-390.jpg`](img/wo4a-payments-390.jpg)

## 20. WO-4b: POS store-QR e-wallet checkout + Reports reconciliation

The backend wrote the logic (its WO-3: `storeSettings`, `eWallet`, `saveOrder`, `reports`, firestore.rules), and the frontend applied its exact diffs. The styling is the frontend's.

**POS (`POSComponent.tsx`):**
- **Live payment settings** (`subscribePaymentSettings`). A method that isn't set up is disabled ("Not set up yet"), with a hint: admins get a **"Set up in Payment Settings"** link, and staff are told to ask an admin. If the admin switches off the selected method mid-checkout, the POS falls back to Cash.
- **GCash/Maya panel:**
  - "Customer pays the store's GCash" and the **amount, large**
  - the store's **QR** (tap → **full screen** on a white page, sized `min(90vw, 70vh)` with crisp scaling; tap or Esc closes)
  - the recipient name + hint
  - a **required reference no.** (normalized to A–Z/0–9 while typing, validated by `referenceProblem`)
  - a **required "I saw ₱X received"** checkbox, which unticks when the total changes
- **Confirm Order** stays disabled until `canConfirm` passes; the same guards run again in `placeOrder`.
- **Card:** an optional **approval code**; the receipt labels it "Approval".
- **Saving** goes through `saveOrderAtomically`, which claims the reference in the same batch. A reused reference shows "This reference was already used for order ORD-…" (8 s), and no order is saved.
- **QA lows:**
  - after each order the method resets to Cash
  - switching the discount from ₱ to % clamps it to ≤ 100
- Receipt: unchanged, apart from the Approval/Ref label. The order QR, `#receipt` and printing are as before.

**Reports (`Reports.tsx`):**
- Pie data now comes from `paymentBreakdown(orders)`.
- New **reconciliation table** (Method · Orders · Total): every method, zeros included, with the note "Match these with the cash drawer and the GCash/Maya statements".
- **Ref** column in Order Details (`paymentRefLabel`).
- PDF: the payment table gains an Orders column; the order details gain a Ref column ('-' when empty), and "Items" becomes "Qty", using the backend's column widths.

**Also:**
- `main.tsx`: `BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` (backend request; silences the React Router v7 warnings).
- Demo mocks:
  - `onSnapshot` now delivers live doc updates;
  - a batch claiming an existing `paymentRefs` doc is denied, like the rules.

**Verified** (demo server, fake data):
- Maya is disabled, with the setup link.
- The GCash QR shows; "1234 5678-90123" is normalized to `1234567890123`; Confirm stays disabled until both the reference and the tick are set.
- The order saves, and the receipt shows the Ref.
- The same reference again shows the "already used" toast, with no second order.
- Full-screen QR: 560 px wide at 1280×800.
- Card: an empty code is OK; "ab-12 34" becomes `AB1234`, and the receipt shows "Approval".
- The Reports reconciliation table renders.
- `tsc --strict --noUnusedLocals --noUnusedParameters` and `npm run build` pass.

Screenshots: [`img/wo4b-pos-gcash.jpg`](img/wo4b-pos-gcash.jpg) · [`img/wo4b-qr-fullscreen.jpg`](img/wo4b-qr-fullscreen.jpg) · [`img/wo4b-reports-reconciliation.jpg`](img/wo4b-reports-reconciliation.jpg)

## 21. WO-6: color themes (CSS variables) + business-neutral shop app

Spec: `SUBSCRIPTION-PLAN.md` §9.3 (Tech Lead WO-6). Phase 0 was committed first (checkpoint `7c57485`). How-to: DESIGN-SYSTEM.md §1.1.

**Tokens → CSS variables:**
- `tailwind.config.js`: `espresso`/`caramel`/`cream`/`bark` (shades 50–950) are now `rgb(var(--name-shade) / <alpha-value>)`. The `card`/`lift`/`glow` shadows use variables too. **No component class names changed.**
- `src/index.css`:
  - `:root` / `[data-theme="espresso"]` hold the default values.
  - Five new blocks: `matcha`, `berry`, `ocean`, `charcoal`, `sunset`.
  - Every hard-coded color in the component classes now reads variables. Covered: buttons, segmented/pill gradients, sidebar active state, app/espresso surfaces, backdrops, meter, scrollbar, the RFID pulse, selection.
- `chartTheme.ts` → **`useChartTheme()`**, which re-reads on `data-theme` changes. Used by the Dashboard and Reports charts, the tooltip, and the pie slice stroke.
- Reports **PDF colors** come from the active theme (`themeRgb`) at download time.
- `main.tsx`: toast colors use `rgb(var(--…))`.
- `Decor.tsx`: the Wave stroke uses a variable. (The bean SVG keeps its natural brown; it's landing-only.)
- `AppShell` / `POSComponent`: their arbitrary-value shadows use variables.
- `src/components/shared/theme.ts`: `THEMES`, `applyTheme()`, `themeColor()`, `themeRgb()`.

**Applying a theme:**
- `AppShell` applies the shop theme and resets to the default when it unmounts (sign-out → landing).
- **The landing page forces the default** (`applyTheme(null)` + `data-theme="espresso"` on its root). Verified: from a themed app, signing out leaves `<html>` with no theme, and the landing button keeps the default caramel gradient.
- **Dev-only switcher** (`DevThemeSwitcher.tsx`): a "Theme (dev)" pill at the bottom right. It's remembered per browser, and hidden when the URL has `?theme=…` (used for screenshots). It renders only under `import.meta.env.DEV`: grepping the production `dist/` finds nothing.
- Phase B: the theme will come from `settings/branding.theme`.

**Default palette tweak (accessibility):** `bark-500` `#8c6f57` → `#876b54`. At 4.4:1, secondary text on the page background just missed AA; it's now 4.6:1. Visually the same.

**Business-neutral shop app** (the landing page keeps its coffee look):
- **Removed coffee decor from the tenant app:**
  - the line-art branch in the sidebar (`AppShell`)
  - the staff dashboard banner's café photo, branch and bean, replaced with theme-colored circles
- Copy:
  - Dashboard: "Good Coffee" → "Overview", and "…your coffee shop…" → "…your business…"
  - POS: "Fresh Brews" → "New sale"
  - Staff greeting: "…great day of sales?"
  - Staff email placeholder: `staff@yourshop.com`
- Left for Phase B branding, documented: the receipt header "JPOS COFFEE SHOP", the PDF title, and the loader text.
- The `Coffee` icons (Products nav, placeholders) will follow the business-type labels in Phase B.

**Contrast (WCAG 2.x, AA needs ≥ 4.5:1 for normal text)**, from `docs/frontend/tools/generate-themes.py`:

| Pair | espresso | matcha | berry | ocean | charcoal | sunset |
|---|---|---|---|---|---|---|
| Body text (espresso-900 on cream-100) | 15.6 ✅ | 15.0 ✅ | 17.4 ✅ | 15.8 ✅ | 15.6 ✅ | 16.1 ✅ |
| Card text (espresso-800 on cream-50) | 13.7 ✅ | 12.7 ✅ | 14.6 ✅ | 14.4 ✅ | 13.9 ✅ | 14.7 ✅ |
| Secondary text (bark-500 on cream-50) | 4.8 ✅ | 4.8 ✅ | 5.2 ✅ | 5.0 ✅ | 5.1 ✅ | 5.2 ✅ |
| Secondary text (bark-500 on cream-100) | 4.6 ✅ | 4.6 ✅ | 4.9 ✅ | 4.8 ✅ | 4.9 ✅ | 4.9 ✅ |
| Link/accent text (caramel-700 on cream-50) | 6.0 ✅ | 4.8 ✅ | 7.9 ✅ | 4.9 ✅ | 4.8 ✅ | 6.3 ✅ |
| Primary button (cream-50 on espresso-700) | 10.9 ✅ | 9.7 ✅ | 12.3 ✅ | 11.8 ✅ | 11.4 ✅ | 12.2 ✅ |
| Active pill (cream-50 on espresso-800) | 13.7 ✅ | 12.7 ✅ | 14.6 ✅ | 14.4 ✅ | 13.9 ✅ | 14.7 ✅ |
| Accent button (espresso-900 on caramel-500) | 5.6 ✅ | 7.1 ✅ | 4.5 ✅ | 6.8 ✅ | 6.8 ✅ | 5.2 ✅ |
| Badge info (espresso-700 on cream-300) | 8.6 ✅ | 7.8 ✅ | 8.9 ✅ | 9.0 ✅ | 8.8 ✅ | 9.3 ✅ |
| Dark badge (caramel-200 on espresso-800) | 9.8 ✅ | 9.8 ✅ | 8.3 ✅ | 10.6 ✅ | 10.4 ✅ | 9.5 ✅ |
| Sidebar link (cream-200 @70% on espresso-900) | 7.7 ✅ | 7.5 ✅ | 7.9 ✅ | 7.6 ✅ | 7.5 ✅ | 7.6 ✅ |

Gradient buttons are measured at their weakest stop: the lightest stop for the primary button, the darkest for the accent button. The sidebar text is measured after blending its 70% opacity.

Screenshots (dashboard + POS in all six themes): [`img/wo6-themes-dashboard.jpg`](img/wo6-themes-dashboard.jpg) · [`img/wo6-themes-pos.jpg`](img/wo6-themes-pos.jpg) · [`img/wo6-dev-switcher.jpg`](img/wo6-dev-switcher.jpg)

**Also (not frontend work):** at the owner's request, the backend removed the faded caramel glow on the left of the landing hero (`Hero.tsx`). It stays removed in every theme.

Checks: `tsc --strict --noUnusedLocals --noUnusedParameters` and `npm run build` pass.

## 22. Dev theme switcher removed (2026-10-23)
- The owner doesn't want a theme picker floating in the app: **each store will choose its theme in its own Branding settings** (Phase B, `settings/branding.theme`).
- Removed `src/components/shared/DevThemeSwitcher.tsx` and the dev-theme state, `?theme=` handling and `localStorage` key in `AppShell.tsx`.
- Kept: the 6 themes as CSS variables (`index.css`), `theme.ts` (`applyTheme`, `themeColor`) and the theme-aware charts/PDF. The Branding page will call `applyTheme(branding.theme)`.
- Until Phase B every shop uses the default (Espresso) theme. The landing page still forces the default.
- Checks: `tsc --strict --noUnusedLocals --noUnusedParameters` passes.

## 23. Pricing buttons open Messenger (interim, 2026-10-23)
- Owner decision: until self-serve sign-up exists (Phase 2), interested shops contact the owner on Messenger.
- All pricing buttons ("Get Started" ×2, "Contact Us") call `openMessenger()` (`landing/scroll.ts`). It opens `MESSENGER_URL` (`https://m.me/joshuapadilla895`, in `landing/content.ts`) with a ready-made message, e.g. "Hi! Interested ako sa JPOS Business Plan (₱999/month). Paano mag-subscribe?". It also copies that message to the clipboard, because m.me doesn't always prefill it.
- `PLANS[].action` was replaced by an `outline` flag (Enterprise keeps the outline style).
- Phase 2 replaces this with `/subscribe` (trial sign-up).

