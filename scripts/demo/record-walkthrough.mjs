// Records the landing page's walkthrough video: a new shop owner signs up with the
// email code, adds products, sells at the POS and sees the sale on the dashboard.
//
//   1. npm run dev                      (local test mode: emulators, fake data)
//   2. node scripts/demo/record-walkthrough.mjs
//      (DEMO_BASE=http://localhost:5174 if the app runs on another port)
//
// It records the REAL app against the local emulators only: it refuses to run unless
// the page is in local test mode, so the live database is never touched.
// Needs: Microsoft Edge (or Chrome via BROWSER=...) and ffmpeg on PATH.
// Output: public/demo/jpos-walkthrough.mp4 + .jpg (shown on the landing page) and the
// chapter times, printed at the end, for <DemoSection steps>.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const BASE = (process.env.DEMO_BASE || 'http://localhost:5173').replace(/\/+$/, '');
const PUBLIC_HOST = process.env.DEMO_PUBLIC_HOST || 'jpos-mu.vercel.app'; // shown instead of localhost
const OUT = process.env.DEMO_OUT || join(tmpdir(), 'jpos-walkthrough');
const W = 1280, H = 720;
// Playback speed of the final video (the take itself runs at a natural pace)
const SPEED = Number(process.env.DEMO_SPEED || 1.25);
const BROWSER = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Safety: local test mode only ────────────────────────────────────────────
// /__dev/outbox exists only in local test mode (emulators); live mode answers 404 or the page.
try {
  const r = await fetch(`${BASE}/__dev/outbox`);
  if (!r.ok || !Array.isArray(await r.json())) throw new Error();
} catch {
  console.error(`\n${BASE} is not the local test app. Start it with "npm run dev" (fake data), then run this again.\n`);
  process.exit(1);
}

const SHOP = "Juan's Mini Mart";
const OWNER = 'Juan Dela Cruz';
const EMAIL = 'juan@email.example'; // .example never reaches Gmail
const PASSWORD = 'juan1234';

// Every take uses the same owner and shop name, so undo an earlier take first: its
// login, its shop link and its email counter. Local emulators only (127.0.0.1).
const EMULATOR_FIRESTORE = process.env.DEMO_FIRESTORE || '127.0.0.1:8085';
const EMULATOR_AUTH = process.env.DEMO_AUTH || '127.0.0.1:9099';
const emu = (url, body, method = 'POST') => fetch(url, {
  method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
}).then(r => r.json().catch(() => ({}))).catch(() => ({}));
const authApi = `http://${EMULATOR_AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-jpos`;
const docs = `http://${EMULATOR_FIRESTORE}/v1/projects/demo-jpos/databases/(default)/documents`;
for (const u of (await emu(`${authApi}/accounts:lookup`, { email: [EMAIL] })).users ?? []) {
  await emu(`${authApi}/accounts:delete`, { localId: u.localId });
}
for (const slug of ['juans-mini-mart', 'juan-s-mini-mart']) await emu(`${docs}/slugs/${slug}`, undefined, 'DELETE');
const emailId = `e_${createHash('sha256').update(EMAIL).digest('hex').slice(0, 40)}`; // as api/_lib/signupCode.ts
await emu(`${docs}/mailLog/verify_${emailId}`, undefined, 'DELETE');

const browserProfile = mkdtempSync(join(tmpdir(), 'jpos-walkthrough-browser-'));
let browser;
const cleanup = () => { try { browser?.kill(); } catch { /* gone */ } };
process.on('exit', cleanup);

try {
  // ── Browser + DevTools protocol ──────────────────────────────────────────
  const cdpPort = 9400 + Math.floor(Math.random() * 400);
  browser = spawn(BROWSER, ['--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--force-color-profile=srgb',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${browserProfile}`, 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* not yet */ }
    if (!wsUrl) await sleep(250);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let msgId = 0; const pending = new Map(); const listeners = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method && listeners.has(m.method)) listeners.get(m.method)(m.params);
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, m => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
  const waitFor = async (expr, ms = 20000) => {
    for (let t = 0; t < ms; t += 100) { if (await evaluate(`!!(${expr})`)) return; await sleep(100); }
    // Keep a picture of the page for whoever looks into it
    try {
      mkdirSync(OUT, { recursive: true });
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, 'failed.png'), Buffer.from(shot.data, 'base64'));
    } catch { /* no picture */ }
    throw new Error(`timeout waiting for ${expr}`);
  };

  // A crash shows up as a blank video otherwise
  listeners.set('Runtime.exceptionThrown', p => console.error('[page exception]', p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  try { await send('Page.setDownloadBehavior', { behavior: 'deny' }); } catch { /* older browsers */ }

  // On every page: hide the local-test-only bits, show the public address instead of
  // localhost, and draw a cursor with a click ripple (headless browsers draw no pointer)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '[data-dev-only]{display:none!important} *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
      document.head.appendChild(style);

      const host = location.host, shown = ${JSON.stringify(PUBLIC_HOST)};
      const fix = node => {
        if (node.nodeType === 3) { if (node.nodeValue.includes(host)) node.nodeValue = node.nodeValue.split(host).join(shown); return; }
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.nodeValue.includes(host)) t.nodeValue = t.nodeValue.split(host).join(shown);
      };
      fix(document.body);
      new MutationObserver(list => list.forEach(m => { m.addedNodes.forEach(fix); if (m.type === 'characterData') fix(m.target); }))
        .observe(document.body, { childList: true, subtree: true, characterData: true });

      const c = document.createElement('div');
      c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 2.5l14 10.2-6.4 1.3-3.6 6.5z" fill="#fff" stroke="#2c1a0f" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      Object.assign(c.style, { position: 'fixed', left: 0, top: 0, zIndex: 2147483647, pointerEvents: 'none',
        transform: 'translate(-300px,-300px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' });
      document.body.appendChild(c);
      addEventListener('mousemove', e => { c.style.transform = 'translate(' + (e.clientX - 5) + 'px,' + (e.clientY - 3) + 'px)'; }, true);
      addEventListener('mousedown', e => {
        const r = document.createElement('div');
        Object.assign(r.style, { position: 'fixed', left: (e.clientX - 18) + 'px', top: (e.clientY - 18) + 'px', width: '36px', height: '36px',
          borderRadius: '50%', border: '3px solid rgba(221,161,94,.95)', zIndex: 2147483646, pointerEvents: 'none',
          transition: 'transform .45s ease-out, opacity .45s ease-out', transform: 'scale(.4)', opacity: '1' });
        document.body.appendChild(r);
        requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
        setTimeout(() => r.remove(), 500);
      }, true);
    });` });

  // ── Input helpers ─────────────────────────────────────────────────────────
  let mouse = { x: W + 30, y: H * 0.6 };
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  // Input events are paced by the wall clock instead of awaiting each reply (smoother while encoding)
  const fire = (method, params) => { send(method, params).catch(() => {}); };
  const flush = () => send('Runtime.evaluate', { expression: '0' });
  async function moveTo(x, y, ms = 600) {
    const sx = mouse.x, sy = mouse.y, t0 = Date.now();
    for (;;) {
      const k = Math.min(1, (Date.now() - t0) / ms), e = ease(k);
      fire('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx + (x - sx) * e, y: sy + (y - sy) * e });
      if (k >= 1) break;
      await sleep(25);
    }
    mouse = { x, y };
    await flush();
  }
  async function rectOf(finder) {
    const r = await evaluate(`(() => { const el = (${finder}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
    if (!r) throw new Error(`element not found: ${finder}`);
    return r;
  }
  async function click(finder, { after = 300, move = 480 } = {}) {
    const r = await rectOf(finder);
    await moveTo(r.x + r.w / 2, r.y + r.h / 2, move);
    await sleep(120);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouse.x, y: mouse.y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse.x, y: mouse.y, button: 'left', clickCount: 1 });
    await sleep(after);
  }
  async function clickToType(finder, opts) {
    await click(finder, opts);
    await evaluate(`(${finder})?.focus()`);
  }
  async function type(text, perChar = 70) {
    for (const ch of text) { fire('Input.insertText', { text: ch }); await sleep(perChar + Math.random() * 35); }
    await flush();
  }
  const byText = (tag, text, scope = 'document') =>
    `[...${scope}.querySelectorAll('${tag}')].find(e => e.textContent.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())})`;
  const navLink = label => byText('aside a', label);
  const modal = `document.querySelector('.modal-panel')`;
  const product = name => `[...document.querySelectorAll('main button.card')].find(b => b.querySelector('p')?.textContent.trim() === ${JSON.stringify(name)})`;
  const codeFromInbox = async () => {
    for (let i = 0; i < 50; i++) {
      const box = await (await fetch(`${BASE}/__dev/outbox`)).json();
      const code = [...box].reverse().find(m => m.to.includes(EMAIL))?.subject.match(/\d{6}/)?.[0];
      if (code) return code;
      await sleep(200);
    }
    throw new Error('no code email in the local inbox');
  };
  async function addProduct(name, price) {
    await click(byText('main button', 'Add Product'), { after: 600 });
    await waitFor(modal);
    await sleep(600); // let the form finish sliding in before clicking into it
    await clickToType(`${modal}.querySelector('input:not([type])')`, { after: 150 });
    await type(name, 45);
    await clickToType(`${modal}.querySelector('input[type=number]')`, { after: 150, move: 400 });
    await type(price, 90);
    await sleep(350);
    await click(byText('button', 'Save Product'), { after: 300 });
    await waitFor(`!document.querySelector('.modal-panel') && document.querySelector('main').innerText.includes(${JSON.stringify(name)})`);
    await sleep(500);
  }

  // ── Warm up (first load compiles modules) ─────────────────────────────────
  // The sign-up server code (a bad email: no side effects) and the pages the owner opens
  for (const route of ['signup/code', 'signup/finish']) {
    await fetch(`${BASE}/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"nope"}' }).catch(() => {});
  }
  for (const mod of ['components/admin/AdminLayout.tsx', 'pages/admin/Dashboard.tsx', 'pages/admin/Products.tsx', 'pages/admin/POS.tsx', 'components/shared/POSComponent.tsx']) {
    await fetch(`${BASE}/src/${mod}`).catch(() => {});
  }
  await send('Page.navigate', { url: `${BASE}/subscribe?plan=trial` });
  await waitFor(`document.querySelector('#shop-name')`, 60000);
  await send('Page.navigate', { url: `${BASE}/login` });
  await waitFor(`document.querySelector('#login-email')`, 60000);
  await evaluate(`document.fonts.ready.then(() => true)`);
  await evaluate(`Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))`);
  await sleep(1500);

  // ── Record ────────────────────────────────────────────────────────────────
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'frames'), { recursive: true });
  const frames = []; const writes = [];
  listeners.set('Page.screencastFrame', p => {
    const file = join(OUT, 'frames', `f${String(frames.length).padStart(5, '0')}.jpg`);
    frames.push({ file, t: p.metadata.timestamp });
    writes.push(Promise.resolve().then(() => writeFileSync(file, Buffer.from(p.data, 'base64'))));
    send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
  });
  const marks = [];
  const mark = (id, label) => { marks.push({ id, label, t: Date.now() / 1000 }); console.log('·', label); };

  await send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await sleep(300);

  mark('start', 'Get started');
  await sleep(1100);
  await moveTo(W * 0.3, H * 0.62, 800);
  await sleep(200);
  await click(byText('a', 'Get Started'), { after: 600 });
  await waitFor(`document.querySelector('#shop-name')`);
  await sleep(700);

  mark('signup', 'Create your account');
  await clickToType(`document.querySelector('#shop-name')`, { after: 150 });
  await type(SHOP, 45);
  await clickToType(`document.querySelector('#owner-name')`, { after: 150, move: 450 });
  await type(OWNER, 42);
  await clickToType(`document.querySelector('#signup-email')`, { after: 150, move: 450 });
  await type(EMAIL, 35);
  await clickToType(`document.querySelector('#signup-password')`, { after: 150, move: 450 });
  await type(PASSWORD, 50);
  await sleep(700);
  await click(byText('button', 'Create free account'), { after: 300 });
  await waitFor(`[...document.querySelectorAll('h2')].some(h => h.textContent.includes('Check your email'))`);

  mark('code', 'Confirm with the email code');
  await sleep(1300);
  const code = await codeFromInbox();
  await clickToType(`document.querySelector('#signup-code')`, { after: 250 });
  await type(code, 170);
  await waitFor(`location.pathname === '/admin' && document.querySelector('main h1')?.textContent.includes('Dashboard')`, 40000);

  mark('dashboard', 'Your shop is ready');
  await sleep(2200);

  mark('products', 'Add your products');
  await click(navLink('Products'), { after: 900 });
  await waitFor(byText('main button', 'Add Product'));
  await addProduct('Bottled Water', '20');
  await addProduct('Instant Noodles', '18');
  await sleep(800);

  mark('sell', 'Sell at the counter');
  await click(navLink('Point of Sale'), { after: 900 });
  await waitFor(product('Instant Noodles'));
  await sleep(400);
  await click(product('Bottled Water'), { after: 350 });
  await click(product('Bottled Water'), { after: 350, move: 200 });
  await click(product('Instant Noodles'), { after: 700 });
  const posterAt = Date.now() / 1000;
  await sleep(600);
  await click(byText('main button', 'Checkout'), { after: 700 });
  await waitFor(modal);
  await sleep(600);
  await clickToType(`${modal}.querySelector('input[type=number]')`, { after: 200 });
  await type('100', 160);
  await sleep(800);
  await click(byText('button', 'Confirm Order'), { after: 300 });
  await waitFor(`document.querySelector('#receipt')`);

  mark('receipt', 'Receipt with QR');
  await sleep(2500);
  await click(byText('button', 'Done'), { after: 500 });

  mark('live', 'See it on the dashboard');
  await click(navLink('Dashboard'), { after: 1200 });
  await moveTo(W * 0.62, H * 0.45, 700);
  await sleep(2600);

  mark('end', 'End');
  await sleep(400);
  await send('Page.stopScreencast');
  await sleep(300);
  await Promise.all(writes);

  // ── Encode ────────────────────────────────────────────────────────────────
  if (frames.length < 10) throw new Error(`only ${frames.length} frames captured`);
  const t0 = frames[0].t;
  const end = marks.at(-1).t + 0.4;
  let list = '';
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(end, f.t + 0.5);
    // Each frame stays on screen 1/SPEED as long as it did in the take
    list += `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, (next - f.t) / SPEED).toFixed(4)}\n`;
  });
  list += `file '${frames.at(-1).file.replace(/\\/g, '/')}'\n`;
  writeFileSync(join(OUT, 'frames.txt'), list);

  const outDir = join(root, 'public', 'demo');
  mkdirSync(outDir, { recursive: true });
  const mp4 = join(outDir, 'jpos-walkthrough.mp4');
  const crf = process.env.DEMO_CRF || '28';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(OUT, 'frames.txt'),
    // JPEG frames are full-range; limited-range yuv420p so every player (Safari/iOS too) shows true colours
    '-vf', `scale=${W}:${H}:flags=lanczos:out_range=tv,format=yuv420p`, '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-fps_mode', 'cfr', '-r', '30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-tune', 'animation', '-profile:v', 'high',
    '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });

  // Poster: the POS with items in the cart
  const posterFrame = frames.reduce((best, f) => (Math.abs(f.t - posterAt) < Math.abs(best.t - posterAt) ? f : best));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', posterFrame.file, '-vf', `scale=${W}:${H}:flags=lanczos`, '-q:v', '4',
    join(outDir, 'jpos-walkthrough.jpg')], { stdio: 'inherit' });

  const chapters = marks.filter(m => m.id !== 'end').map(m => ({ id: m.id, label: m.label, at: Math.max(0, +((m.t - t0) / SPEED).toFixed(1)) }));
  console.log(`\nframes: ${frames.length}, duration: ${((end - t0) / SPEED).toFixed(1)}s at ${SPEED}x`);
  console.log(`mp4: ${(statSync(mp4).size / 1024).toFixed(0)} KB → ${mp4}`);
  console.log('chapters:', JSON.stringify(chapters));
  ws.close();
} catch (err) {
  console.error(err);
  console.error(`(see ${join(OUT, 'failed.png')} for the page at the moment it failed)`);
  process.exitCode = 1;
} finally {
  cleanup();
  await sleep(300);
  try { rmSync(browserProfile, { recursive: true, force: true }); } catch { /* in use */ }
}
process.exit(0);
