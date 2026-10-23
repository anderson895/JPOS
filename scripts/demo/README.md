# Demo videos

## Landing page walkthrough (current)

`record-walkthrough.mjs` records the **walkthrough on the landing page**: a new owner gets started, signs up with the email code, adds two products, sells them at the POS, gets the receipt and sees the sale on the dashboard. About 45 seconds.

```bash
npm run dev                                   # local test mode (emulators, fake data)
node scripts/demo/record-walkthrough.mjs      # DEMO_BASE=http://localhost:5174 if the app is on another port
```

- **What it records:** the real app against the **local emulators only**.
  - It refuses to run unless the page is in local test mode, so the live database is never touched.
  - Before each take it resets the demo owner (`juan@email.example`) and the shop link in the emulators.
- **What it changes on screen:**
  - The local-test-only bits (`data-dev-only`) are hidden.
  - `localhost` is shown as `jpos-mu.vercel.app`.
  - Backdrop blur is off, because it's heavy for a headless browser.
- **Output:**
  - `public/demo/jpos-walkthrough.mp4` (H.264, 1280×720, 30 fps, no audio, ~1 MB) and `.jpg` (the poster: the POS with a filled cart).
  - It plays at 1.25× (`DEMO_SPEED`).
  - The chapter times are printed at the end. Copy them into `WALKTHROUGH` in `src/components/landing/content.ts`.
- **It's public:** the owner decided on 2026-10-23 to show the walkthrough on the landing page. It only shows sample data.
- **Needs:** Microsoft Edge (or `BROWSER=` a Chrome/Edge path) and `ffmpeg` on PATH.

## Admin tour (old, needs an update before use)

`record.mjs` was the first tutorial (admin side, with `mocks/*` instead of a database). Its mocks predate the multi-store data (`tenants/{T}/…`) and the new sign-up, so it doesn't run against today's app. Prefer the walkthrough recorder above.

```bash
node scripts/demo/record.mjs
```

**Requirements:**
- Microsoft Edge (or set `BROWSER=` to a Chrome/Edge executable)
- `ffmpeg` on PATH
- No npm installs: everything comes from the repo's `node_modules`

## How it works

| File | Role |
|---|---|
| `vite.demo.config.mjs` | A separate Vite dev server (port 5399) that swaps real services for `mocks/*`. The app's own `vite.config.ts` is not used or changed |
| `mocks/AuthContext.ts` | Fake sign-in. Any email/password logs in as the demo admin `Alex Rivera`. `?as=admin` / `?as=staff` start signed in |
| `mocks/firebase.ts` | Empty stand-in for `src/lib/firebase` |
| `mocks/firestore.ts` | In-memory `firebase/firestore`: 7 days of sample orders, products, staff. Supports `where`/`orderBy`/`limit`; `setDoc` saves new orders, so they show up on the dashboard |
| `mocks/cloudinary.ts` | Fake `uploadImage`: no upload; returns an `https://demo.jpos.test/…` URL |
| `assets/sample-qr.png` | A QR-*looking* sample image (random modules, **not** a real payment QR). Tools answer requests to `demo.jpos.test` with it. The mock `settings/payments` has GCash set up with it |
| `record.mjs` | Starts the server and headless Edge, then follows the storyboard. It draws a visible cursor and click ripples, screencasts the frames, then ffmpeg builds the MP4 and poster |

## Output

- The MP4 is H.264 High, `yuv420p`, 1280×720, 30 fps, no audio, `+faststart`. Keep it ≤ 60 s and ≤ 3 MB (`DEMO_CRF`, default 28).
- The poster is the POS with a filled cart.
- The chapter times (seconds) are printed at the end. Pass them as `steps` to `<DemoSection>` (`src/components/landing/DemoSection.tsx`) wherever the tutorial is shown.
- Raw frames go to `%TEMP%/jpos-demo` (or `DEMO_OUT`) and are not part of the repo.

## Editing the storyboard

The steps are at the bottom of `record.mjs`. Each `mark(id, label)` starts a chapter.
- `click(finder)` moves the cursor and clicks.
- `clickUntil(finder, condition)` retries until the click has an effect.
- `type(text)` types into the focused field.
- `wheel(dy)` scrolls.

Page errors are printed to the terminal. A blank video usually means the app crashed.
