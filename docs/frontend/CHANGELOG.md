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

## 24. Library icons instead of emoji (2026-10-23)
- Owner rule: **no emoji as icons** anywhere in the UI; use lucide-react.
- Toasts: "coming soon" → `Clock`, Messenger → `MessageCircle`, newsletter → `Mail`. `scroll.ts` builds them with `createElement`, since it's plain TS.
- Receipt payment note: "⚠" → `AlertTriangle`. Staff form RFID hint: "✓" → `Check`.

## 25. Phase 1 UI: shop terminal (branch `p1-multistore`)
- New **`/s/:slug` terminal page** (`src/pages/TerminalPage.tsx`):
  - checks the link (`slugs/{slug}`) and shows "Terminal link not found" for a bad one
  - otherwise shows the sign-in card **opened on the RFID tab**
  - the device remembers its terminal (`src/lib/terminal.ts`)
- `LoginCard` takes an optional `terminalSlug`. Without it (the public `/login`), there's **no RFID tab**, only a hint: "Signing in with an RFID card? Open your shop's terminal link (…/s/your-shop)".
- **Sign-out** goes back to the remembered terminal, or `/login` on other devices (`AdminLayout`, `StaffLayout`, `App.tsx` redirects use `signedOutHome()`).
- No emoji; lucide icons only (`AlertTriangle`, `Store`, `CreditCard`).
- Shop branding on the terminal (logo, background, theme) comes in Phase B.


## 26. Sign-up with a 6-digit code, and loading on every action (2026-10-23)

**Sign-up (`/subscribe`, rewritten):**
- The form is unchanged. "Create free account" now emails a **6-digit code** and shows "Check your email" with one big code box.
  - Typing the 6th digit submits it.
  - There's a "Send a new code" countdown and a hint to check Spam.
  - "Back" returns to the filled-in form. Pressing Create again within 10 minutes doesn't send another email.
- A right code shows one "please wait" screen: "Creating your account…" → "Setting up your shop…" → "Starting your free trial…". The owner then lands on the **dashboard, signed in, trial running**. A paid package opens Subscription with that package picked.
  - The "Set up your shop" page now only appears as a fallback: after a Google sign-up whose shop couldn't be made, or when the link was taken.
- **Google:** a new Google account makes the shop straight from the form, with the same wait screen.
- **Back always works:** when signed in without a shop, "Back" signs out and opens the sign-in page. Before, `/login` bounced straight back to `/subscribe`.
- `App.tsx` no longer swaps `/subscribe` for the full-screen loader while the new account signs in, so the page keeps its progress.
- Removed: `VerifyEmailPage` (`/verify-email`) and the Billing auto-trial (`AUTO_TRIAL_KEY`).

**Loading indicators added:**
- Sign-up: send code, send a new code, Google, Back (sign out), creating the shop.
- Super Admin: Suspend/Restore shop, Reject payment.
- Products: delete product, show/hide in POS, delete category.
- Manage Staff: delete, active/inactive.
- Subscription: "Take back this payment".

**Redesign:** sign-up and the email code look like the landing page ("About JPOS" style), with the POS pictures from `reference_UI/Illustration Asset Kit.png`. They follow the layouts of `registration.png` and `Verification.png`, in JPOS colors and fonts.
- **One sign-up page, `/subscribe`.** Every way in leads straight to its form:
  - **Get Started** opens it with the free trial picked.
  - The **package buttons** in Pricing open it with that package picked.
  - **Create account** on the landing sign-in card opens it.
- **`/subscribe`:**
  - The header is the JPOS mark plus the "GOOD SERVICE • GREAT BUSINESS" eyebrow.
  - The left side has a script "Join" + "JPOS" heading (like "About JPOS"), three highlights (fast setup, secure, support) and the counter picture: the POS terminal and receipt printer.
  - The form sits in the landing's cream card (`CreamCard`, now shared with the sign-in card).
- **Email code page:** one centered cream card with a mail tile, a script "Almost there" line, **six code boxes** (one invisible input on top, so typing, pasting and autofill work), Confirm, a "Local test" button, the resend countdown and "Check Spam". The terminal and printer sit in the corners. The "please wait" screens use the same card with "Just a moment".
- **Shop link field:** a real input with a **Copy** button that copies the full link. Pasting a whole link keeps only the shop's part.
- **No shop without platform settings:** if `platform/settings` is missing, `createShop` now says "New shops can't be created yet…" instead of "Missing or insufficient permissions" (the rules refuse every shop without it). The console names the fix: `node scripts/setup-platform.mjs`.
- **Shared code:**
  - `src/components/signup/useSignUp.ts`: the whole flow.
  - `SignUpParts.tsx`: the form, code step and wait screen.
  - `GoogleIcon` and `CreamCard` in `components/shared`.
- **Assets:** `public/images/signup/pos-terminal.webp` (31 kB) and `receipt-printer.webp` (12 kB), cut from the transparent asset kit. The screen's green logo and Checkout button were recolored espresso. No plant and no coffee pictures, as asked.
- **Landing nav:** the background, blur and shadow fade in gradually over the first 140 px of scrolling, and the white line under the bar is gone (no `border-b`).
- **Phones:** single-column form grid, so nothing pushes past the screen edge. The shop-link prefix shortens to "/s/" on narrow screens.

## 27. Point of sale, not coffee: landing retheme (2026-10-23)

The owner: "Point of sales naman kasi ang inooffer ko hindi coffee". The landing and sign-up now show a shop counter instead of a café.
- **Hero:**
  - The background is the light retail photo `reference_UI/Sage Green Retail Login Background.png`, mirrored so the shop sits on the right and the text side stays calm. It's saved as `public/images/hero-retail.jpg` (72 kB).
  - Text is espresso on cream. "Simplified" uses the new `.text-gradient-caramel-deep` (readable on light).
  - Get Started is the espresso button with a store icon. The highlights use bolt, chart and shield icons.
  - The floating coffee beans are gone. The copy now starts with "store".
- **Nav:** dark text on the light hero. When scrolled it fades into frosted cream with a soft shadow (still gradual, no line). The active link is an espresso pill.
- **About:** the latte photo is replaced by the POS terminal and receipt printer on a cream-to-sage backdrop in the same blob frame. No circles, as asked.
- **Features, Pricing, sign-up page:** soft sage circles (`SageBubble`, fixed `sage-*` colors in tailwind.config.js) replace the coffee branches and beans.
  - The Dashboard section has no decoration. A printer was tried there but covered the mock's numbers.
- **Content:** "Order Management" uses a cart icon. The dashboard mock's top items are now Bottled Water, Instant Noodles, Bread and Soft Drinks (not coffee drinks).
- **Cards:** `CreamCard` (the sign-in card and every sign-up card) has sage circles in its corner instead of the coffee branch, and a soft shadow that suits the light hero.
- **Loader:** "Brewing your workspace…" → "Getting your workspace ready…".
- **Removed:**
  - `CoffeeBean`, `CoffeeBranch` and `public/images/coffee-branch.png`.
  - `hero-bg.jpg` and `about.jpg` stay, because the demo recorder's mock products use them.
  - The POS pictures moved to `public/images/pos/`.

**Sign-up fixes in the same round:**
- **One layout for every step:** the email code and "please wait" screens use the registration page's two columns ("Join JPOS" + the POS picture on the left, the card on the right). The pictures cut off at the screen corners are gone.
- **When sign-up can't work yet** (no `platform/settings` in the database):
  - The form says so before anything is typed: "Sign-up isn't open yet…".
  - The buttons are disabled, so no code is sent and no account is made.
  - On this computer only (`import.meta.env.DEV`) it also names the fix: `node scripts/setup-platform.mjs`.
- **Other fixes:**
  - The same error no longer stacks up in several toasts (toast id = message).
  - "Your name" fills in from the Google account.
  - The shop and name fields have autofill hints (`organization`, `name`), so the browser stops putting the email there.
- **"Local test / LIVE" label (this computer only):** a small label at the bottom of every page says which data the dev server uses: green "Local test · fake data" (`npm run dev`) or red "LIVE database · real accounts" (`npm run dev:live`). It came up after the owner tried the local test account on the live database and Firebase locked them out with "Too many attempts". It's never in the live build, and it's hidden in the demo recorder (whose `lib/firebase` mock now also exports `USE_EMULATORS`, which it was missing).

## 28. Phones, the walkthrough video, and POS-neutral icons (2026-10-23)

**Mobile:**
- **Audit:** every page (landing, plans, sign-up, staff sign-in, every admin and staff page) was checked at 360 and 390 px. None scrolls sideways.
- **Hero on phones** (the owner: "sabog sabog"):
  - The copy is centered, and the three highlights are three even columns (icon above the words).
  - Get Started is one full-width button with Learn More under it, and the "Built for" chips are centered.
  - The background shows the photo's calm cream-and-sage side.
  - Wide screens are unchanged.
- **About:** the POS and printer stand on their own. The round frame is gone, as asked.
- **Spacing:** less empty space between sections on phones (Features, Dashboard, Testimonials, Pricing, the video).
- **Reports:** "No orders in selected period" was cut off inside the wide, scrolling table on phones. It's now a plain message.

**Walkthrough video on the landing page** (the owner asked for it; this reverses §16's "confidential" rule):
- **Placement:** "See JPOS in action", right after About.
- **The video** (45 s, sample data, `public/demo/jpos-walkthrough.mp4` ~0.9 MB + poster):
  - Get started → sign up → email code → shop ready → add 2 products → sell at the POS → receipt → the dashboard shows the sale.
- **Player:**
  - Eight clickable chapters (`WALKTHROUGH` in `content.ts`).
  - It plays (muted) when in view and pauses out of view. A click pauses it, and a play button shows when paused.
  - With reduced motion it waits for a click.
- **Recorder:** `scripts/demo/record-walkthrough.mjs` (see `scripts/demo/README.md`). It records the real app against the local emulators and refuses to run otherwise.

**POS, not coffee, inside the app too:**
- **Icons:** Products in the sidebar, product placeholders (POS and Products) and the dashboard's empty states use a package icon. The POS "All" chip uses a grid icon.
- **Receipts and the PDF report** print **the shop's own name** instead of "JPOS COFFEE SHOP". Every shop has its own.
- **Product form:** the name placeholder is "e.g., Bottled Water".
- **Shop link:** an apostrophe joins the word ("Aling Nena's Store" → `aling-nenas-store`) instead of becoming a dash.

## 29. New logo, and JPOS installs as an app (2026-10-23)

**Logo:** the owner's "Warm Brown POS Badge Logo" (a POS terminal in a gold ring, "JPOS · Point of Sale") replaces the coffee-cup logo everywhere.
- **Fill:** the badge's inside was see-through, so "JPOS" vanished on dark backgrounds (footer, loading screen). The inside is now filled with cream. It's trimmed and square.
- **Files:**
  - `public/logo.png` (320 px): nav, sign-in card, sidebar, footer, loading screen.
  - `favicon.png` (64 px).
  - `apple-touch-icon.png` (180 px, on cream).
  - `icons/icon-192/512.png` and `icons/maskable-192/512.png` (for the installed app).
- **Cleanup:** the extra CSS ring around the logo in the footer and loading screen is gone (the badge has its own), and the unused `public/coffeelogo.png` is deleted.

**Install as an app (PWA):**
- **Manifest:** `public/manifest.webmanifest` ("JPOS Point of Sale", standalone, cream splash, espresso title bar).
  - It opens at `/`, so a counter device goes straight back to its shop's sign-in page, and a signed-in owner to the dashboard.
- **Service worker:** `public/sw.js`, registered only in the real app (`registerServiceWorker` in `src/lib/pwa.ts`), never on the dev server.
  - **It never caches the app**, so every deploy shows up right away.
  - It only shows `public/offline.html` ("You're offline", Try again) when a page can't load. Bump `CACHE` when that page changes.
- **"Install app" buttons** (`src/components/shared/InstallApp.tsx`):
  - **Where:** landing nav (an icon on tablets, a label on wide screens), the landing phone menu, the app sidebar ("Install app") and the staff sign-in page ("Install on this device").
  - **Chrome/Edge/Samsung (Android, Windows, Mac):** the browser's own install window.
  - **iPhone/iPad Safari:** the steps (Share → Add to Home Screen). Inside Facebook/Messenger on iPhone it first says to open the page in Safari.
  - **Mac Safari:** File → Add to Dock.
  - Hidden once installed, and where the browser can't install apps (e.g. Firefox).
- **Tablet nav:** the nav links are a bit tighter on tablets (`px-3`), so the install icon fits next to Login at 768 px.
- **Verified** on a local-test production build (`vite build --mode emulator` + `vite preview`):
  - Chrome reports it installable (normal profile).
  - The manifest is error-free, and the service worker controls the page.
  - The offline page shows, and Try again recovers.
  - The buttons and the iPhone and Messenger steps work.
  - No sideways scroll and no overlapping buttons from 360 to 1280 px.
- **Video:** the walkthrough was re-recorded with the new logo. The chapter times in `content.ts` are updated.

## 30. Install right from the landing page, and the phone account menu (2026-10-23)

**"Install app" is always there.**
- **Before:** the buttons only showed once the browser offered its install window. Chrome waits for a click and about 30 seconds on the page, so first-time visitors saw nothing (the owner: "sa landing pages palang meron ng installation ng app").
- **Now:** the buttons show right away.
  - They open the browser's window when it's ready.
  - Until then, they show the steps for that browser. The browser is detected in `deviceSteps` (`src/lib/pwa.ts`), with steps for Chrome, Edge, Android, Samsung Internet, Firefox (Android, and desktop: "open it in Chrome or Edge"), iPhone/iPad, Mac Safari, and Messenger/Facebook in-app ("open it in Safari/Chrome first").
  - Hidden only inside the installed app. After installing in a tab, they hide too.
- **New "Get the JPOS app" section, right under the hero** (`src/components/landing/InstallSection.tsx`):
  - The app icon as on a home screen, "Install it on your phone, tablet or computer. Free, and no app store needed."
  - Android / iPhone & iPad / Windows / Mac chips, and a big **Install app** button.
  - After installing it says "Installed on this device".
- **Shared code:** `useInstallAction()` in `InstallApp.tsx` (used by the section and every button).

**Phones: the avatar opens the account menu.**
- In the app's top bar on phones, tapping the avatar opens a small menu with the name and role, **Account Settings** (admins) and **Logout** (with a spinner while logging out).
- It closes on a tap outside, Escape, or another page. Desktop is unchanged (the sidebar has them).

**Verified** on a local-test production build and the emulators:
- **Install steps** per browser (Chrome, Edge, Firefox, Android, Samsung, iPhone, Messenger, Mac Safari) and Chrome's own window when ready.
- **Installed state:** "Installed on this device" after installing, and nothing to install inside the installed app.
- **Account menu:** Account Settings opens, Logout returns to sign-in, and staff see Logout only.
- **Phones:** no sideways scroll on any page at 360/390 px.
- **Tests:** api 45/45, unit 17/17, build, sign-up E2E, landing links.

## 31. Each store's own look, product details, discounts, VAT and void (2026-10-23, branch `store-features`)

The owner's list (note.txt): logos and colors per shop, the shop's name on its sign-in link, a kind of store chosen at sign-up, product details (unit, brand, size…), discounts, void, VAT receipts, a phone menu, and no signing in to another shop's link.

**Store Settings** (admin menu, `/admin/store`, `src/pages/admin/StoreSettings.tsx`):
- Store name, **What do you sell?** (Food & drinks, Sari-sari & grocery, Clothes & shoes, Hardware, Pharmacy, Gadgets, Services, Something else), and the shop's sign-in link to copy.
- **Logo** (upload; "Use JPOS logo" goes back to the default) and **Colors** (the 6 themes). Tapping a color shows it at once; leaving without saving puts the saved one back.
- **Receipt:** address, phone, TIN, a **VAT registered** switch, and a thank-you line, with a live receipt preview.
- The save bar follows the screen only while there's something to save (on phones it no longer covers the page).

**The shop's own look everywhere:**
- The sidebar and phone top bar show the shop's logo and name (`BrandMark` takes `name`/`logoUrl`; long names get a smaller font). The app uses the shop's colors (`AppShell` applies them; the landing keeps the JPOS colors).
- The shop's sign-in page (`/s/:slug`) shows its logo, name and colors, "Powered by JPOS", and the browser tab says "<shop> · Sign in".
- Receipts print the shop's name, address, phone, `VAT REG TIN` / `NON-VAT REG TIN` and its thank-you line.

**Sign-up:** "What do you sell?" (`BusinessTypePicker`) is required; a line above the button says what's still missing.

**Product details** (`src/lib/productDetails.ts`): brand, size, color, sold by (unit) and barcode/code.
- The product form shows first the details the store's kind uses; the rest are under **More details** (opens by itself when one is filled in).
- Two products can't share a code. Search (Products and POS) looks at name, brand, size, color and code.
- POS: a scanned barcode (code + Enter) adds the product. Tiles, the cart and receipts show the details: "Evaporated milk (Alaska · 370 mL) ×2 can".

**Discounts** (`src/lib/pricing.ts`, `src/components/pos/DiscountSheet.tsx`):
- **Products → Discounts** (`DiscountsModal`): the admin adds named discounts (% or ₱), switches them on/off, edits or deletes them.
- POS: the tag button on a cart line gives that item a discount; **Add discount** under the cart gives the whole order one (a saved one or another amount).
- **Senior / PWD** tab: Senior citizen or PWD, ID number and name. VAT comes off first, then 20% (20% of the price when the store isn't VAT-registered). It replaces other discounts. The receipt shows the ID, the name and a signature line.

**VAT receipt:** VAT-registered stores print VATable sales, VAT 12% and VAT-exempt sales. The receipt is one component (`src/components/pos/Receipt.tsx`) used by the POS and Reports.

**Void** (Reports → Order Details):
- Each sale has a receipt button and, for admins, **Void** (`VoidOrderModal`): pick or type a reason. The sale stays, marked **VOID** with the reason, and leaves every total. Its receipt shows VOID.
- Dashboards show voided sales crossed out with a VOID badge.

**Also on this branch:**
- **Phones and tablets:** a tab bar at the bottom (Home, POS, Products, Reports, More); "More" opens the full menu. The POS "View Order" bar sits above it.
- **The landing page on phones** has the same kind of tab bar (Home, About, Features, Contact, Install) instead of the menu button; Login stays at the top, and the page leaves room so the footer isn't covered.
- **A shop's sign-in page only lets in that shop's accounts**; logging out returns to the page you signed in on (the shop's page or the landing page).
- **Super Admin can change their sign-in email** (Account Settings and the Super Admin Settings tab): a 6-digit code goes to the new email.

**Verified** on the local test app: Store Settings 33/33, product details 9/9, discounts/Senior/VAT/void 22/22, shop lock 10/10, tab bar 9/9, change email 15/15; phone screenshots at 390 px.

## 32. Forgot password, and a way home from a shop's sign-in page (2026-10-23)

- **Forgot password?** (next to Password on every sign-in card, landing and shop pages, `src/components/landing/ForgotPassword.tsx`): email → a 6-digit code → a new password → signed in right away. On a shop's page only that shop's accounts get in, as usual. "Back" keeps the typed email. An email with no account gets the same screen (nobody can find out who has an account).
- **"Powered by JPOS"** on a shop's sign-in card (`/s/:slug`; first a "JPOS home" button, which the owner asked to drop): goes to the main page and the device stops returning to the shop page (before, once a device had signed in on a shop page, the main address always went back there with no way out). Logging out still returns to where you signed in.
- **Code boxes** fit any space (Account Settings on phones overflowed).
- **Verified** on the local test app: forgot password 20/20 (owner, unknown email, cashier with an RFID card), JPOS home 7/7, code boxes at 320–1280 px.

## 33. Packages: basic, standard, advanced (2026-10-23)

- **The owner split the features (choice A):** Starter = basic (Cash + GCash/Maya QR, VAT receipts, Senior/PWD, barcode + product details, today & weekly reports, install), Business = standard (+ own logo and colors, saved + per-item discounts, void, all reports + PDF, trends, RFID), Enterprise = advanced (+ unlimited accounts, priority support). Senior/PWD and VAT stay in every package because the law needs them; the shop name stays everywhere (it's on the receipt).
- **Announced, not built yet** (a "Soon" tag on the cards): Business: inventory and low-stock alerts. Enterprise: AI assistant, many branches in one account, sales forecasts, customer rewards.
- **Locked in the app with a note** ("included in the Business and Enterprise packages"): Store Settings logo and colors, Products → Discounts, the discount button on a cart line, Reports → Void. A whole-order discount and Senior/PWD stay in every package. A shop that moves down to Starter goes back to the JPOS look (its sign-in page too).
- The Subscription page lists what Business adds.
- **Verified** on the local test app: 12/12 (a new Starter shop vs the Enterprise test shop, landing cards).
