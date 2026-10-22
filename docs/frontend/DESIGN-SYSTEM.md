# JPOS Design System

How to build screens that match `reference_UI/`. Read this first when adding a page or component, and **reuse these tokens and classes** instead of hard-coding new styles.

- Tokens: `tailwind.config.js`
- Component classes: `src/index.css` (`@layer components`)
- React building blocks: `src/components/shared/*`

---

## 1. Colors

| Palette | Role | Key shades |
|---|---|---|
| `espresso` | Primary: dark surfaces, primary buttons, headings | `800` `#3f2616` · `900` `#2c1a0f` (headings) · `950` `#1c1009` (darkest) |
| `caramel` | Accent: highlights, CTA gradients, icons on dark | `300` `#e9bb7e` · `500` `#cc8745` · `700` `#8c552a` |
| `cream` | Surfaces: page background, cards, borders | `50` `#fffcf7` (cards) · `100` `#fdf7ee` (page) · `300` `#f1e0c8` (borders) |
| `bark` | Muted text and icons | `400` `#a88a70` (hints) · `500` `#8c6f57` (secondary text) · `600` `#725843` |

Rules:
- Text on cream: `text-espresso-900` for headings, `text-espresso-800` for body, `text-bark-500` for secondary text.
- Text on espresso: `text-cream-50` for primary, `text-cream-200/70` for secondary, `text-caramel-300` for accents.
- Status colors stay standard Tailwind: `emerald-*` = up/success, `red-*` = down/danger, `amber-*` = warning.

## 2. Typography

| Font | Class | Use |
|---|---|---|
| Playfair Display | `font-display` (default for `h1–h3`) | Titles, big numbers, prices. Lining figures are enabled globally |
| Allura | `font-script` / `.eyebrow` | Short accent lines only ("Good Coffee", "Our Menu"). Use 24 px or larger, and never for body text |
| DM Sans | `font-body` (default) | Everything else |
| JetBrains Mono | `font-mono` | Order numbers, RFID tags, the receipt |

## 3. Shape, depth, motion

- **Radius:** cards `rounded-3xl`; modals `rounded-4xl`; buttons, inputs, pills and badges `rounded-full`; textareas `rounded-2xl`.
- **Shadows:** `shadow-card` (resting card), `shadow-lift` (hover/featured), `shadow-glow` (caramel CTA).
- **Motion:** `animate-fade-in` (page), `animate-slide-up` (modals, hero), `animate-float` / `animate-float-slow` (decorative beans; set `--r` for rotation). `prefers-reduced-motion` turns these off.

## 4. Component classes (`src/index.css`)

| Class | What it is |
|---|---|
| `.card` | Cream card with border + `shadow-card` |
| `.card-glass` | Translucent cream card for the landing page |
| `.app-bg` | Cream app background with soft caramel light (set by `AppShell`) |
| `.espresso-surface` | Dark roasted panel (sidebar, dark bands, footer, banners) |
| `.btn-primary` | Dark espresso gradient pill: main action |
| `.btn-caramel` | Caramel gradient pill: hero/marketing CTA, or primary action on dark backgrounds |
| `.btn-secondary` | Cream pill: Cancel / secondary |
| `.btn-outline` | Outlined espresso pill |
| `.btn-ghost` | Text button with hover fill |
| `.btn-danger` | Red pill |
| `.btn` | Base used by all of the above (size, gap, disabled state) |
| `.icon-btn` | Round 36 px icon button (modal close, etc.) |
| `.input` | Pill input; `textarea.input` gets `rounded-2xl`; `select.input` gets a chevron |
| `.label` | Form label |
| `.segmented` + `.segmented-item` (+ `.active`) | Segmented control (Password/RFID, date ranges, role) |
| `.pill` (+ `.active`) | Category or filter chip |
| `.badge`, `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`, `.badge-dark` | Status chips |
| `.modal-backdrop` → `.modal-panel` → `.modal-header` / body / `.modal-footer` | Modal structure; always render it inside `<Portal>`. Give the panel `max-h-[90vh] overflow-y-auto` when it can be tall: the header and footer are **sticky**, so the action buttons stay visible on short screens |
| `.drawer-backdrop` | Backdrop for the mobile sidebar |
| `.sidebar-link` (+ `.active`) | Nav link on the dark sidebar |
| `.table-header`, `.table-row`, `.table-cell` | Data tables (the header row is a cream pill) |
| `.meter` > `span` | Thin caramel progress bar (shares, top sellers) |
| `.eyebrow` | Script accent line above a title |
| `.text-gradient-caramel` | Caramel gradient text ("*Simplified*") |
| `.scrollbar-none` | Hide the scrollbar (horizontal chip rows) |

## 5. React building blocks (`src/components/shared/`)

| Component | Props | Use |
|---|---|---|
| `AppShell` | `navItems`, `panelLabel`, `user`, `roleLabel`, `fallbackInitial`, `onLogout`, `onOpenSettings?`, `collapsible?`, `children?` | The frame for a role layout. Renders `<Outlet />` |
| `PageHeader` | `eyebrow?`, `title`, `subtitle?`, `actions?` | Top of every page |
| `StatCard` | `icon`, `label`, `value`, `change?`, `changeHint?`, `loading?`, `tone?` (`espresso`, `caramel`, `cream`) | KPI tiles |
| `BrandMark` | `tone?` (`light`, `dark`), `subtitle?`, `size?`, `iconOnly?` | Logo tile + "JPOS" wordmark |
| `Decor` | `CoffeeBean`, `Swash`, `Wave` (`fill` = color of the section below), `SectionTitle`, `CoffeeBranch` | Decoration |
| `chartTheme` | `CHART`, `CHART_SERIES`, `TOOLTIP_STYLE` | Recharts colors. Use `CHART.line` for strokes and `CHART.accent` for fills/bars |
| `Portal` | children | Required wrapper for any `position: fixed` overlay |

## 6. Page recipe

```tsx
import PageHeader from '@/components/shared/PageHeader';

export default function MyPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Our Menu"
        title="Products"
        subtitle="10 items in menu"
        actions={<button className="btn-primary">Add</button>}
      />
      <div className="card p-6">…</div>
    </div>
  );
}
```

Modal recipe:

```tsx
<Portal>
  <div className="modal-backdrop">
    <div className="modal-panel max-w-md max-h-[90vh] overflow-y-auto">
      <div className="modal-header">
        <h2 className="font-display text-2xl">Title</h2>
        <button className="icon-btn"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6 space-y-4">…</div>
      <div className="modal-footer">
        <button className="btn-secondary flex-1">Cancel</button>
        <button className="btn-primary flex-1">Save</button>
      </div>
    </div>
  </div>
</Portal>
```

## 7. Responsive rules

- Test at **360, 390, 768, 1024 and 1440 px**. Nothing may scroll sideways.
- The sidebar becomes a drawer below `lg`. The POS cart becomes a slide-over plus a floating bar below `lg`.
- Grids: KPIs use `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; product grids start at 2 columns.
- Hover-only controls must stay visible on touch screens: use `[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100`.
- Shadows on off-canvas panels apply only when the panel is visible (`lg:shadow-…`, or conditional on open), so a hidden drawer doesn't darken the screen edge.

## 8. Don'ts

- Don't add raw hex colors in components. Use the palette, or add a token.
- Don't use `font-script` for anything users must read quickly (buttons, labels, data).
- Don't put fixed overlays outside `<Portal>`. A transformed ancestor would clip them.
- Don't remove `id="receipt"` or the `@media print` block. Receipt printing depends on them.
- Don't randomize decoration during render. Use fixed positions.
