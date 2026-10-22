# Demo video recorder

Records the JPOS tutorial video (`scripts/demo/output/jpos-demo.mp4` + `jpos-demo.jpg`) against **fake sample data**. It never touches Firebase or any payment service.

> 🔒 **Confidential:** the video shows the admin side (dashboard, reports, staff), so it's for subscribers only.
> `output/` is git-ignored. **Never** copy the video into `public/`: anything there is deployed and reachable by URL.
> The final tutorial will be recorded at the very end and served from protected storage on an in-app Help page (behind login).

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
