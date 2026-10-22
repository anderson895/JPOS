# Frontend Changes — 2026-10-22

| | |
|---|---|
| **Role** | Frontend developer (UI, styling, pages, components, `public/` assets) |
| **Scope** | Full UI redesign of JPOS to follow `reference_UI/` (landing page + login, app shell, every admin/staff screen) |
| **Status** | All frontend work through §13 is committed: the redesign in checkpoint `c179cd9`, and the polish and review fixes (§9, §13) in the follow-up frontend commit. Nothing is pushed. |
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
| 2 | **Pricing is placeholder** (₱499 / ₱999 / ₱1,999) | `content.ts` → `PLANS` | Confirm the real plans, or remove `<PricingSection />` |
| 3 | **External links are empty** (Facebook, YouTube, email, FAQ, Docs, Privacy, Terms) | `content.ts` → `EXTERNAL_LINKS` | Until filled in, clicking one shows "… is coming soon." Fill in a URL and that link starts working, with no other code change |
| 4 | **The newsletter form has no backend** | `LandingFooter.tsx` → `subscribe` | It says "Newsletter sign-ups open soon" and doesn't store anything. It needs a backend task if it should be real |
| 5 | **"Inventory Management" is advertised** (features, pricing, hero copy), but the app has no stock screen | `content.ts` | The copy comes from the mockup. Either build a stock page (backend + frontend) or reword it |
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
