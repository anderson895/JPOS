// DEMO ONLY — records the landing-page demo video against FAKE data (scripts/demo/mocks).
// Never point this at the live Firebase app.
//
//   node scripts/demo/record.mjs
//
// Needs: Microsoft Edge (or Chrome via BROWSER=...), ffmpeg on PATH. No npm installs.
// Output: scripts/demo/output/jpos-demo.mp4 + jpos-demo.jpg (git-ignored) and chapter
// times printed at the end. The video is CONFIDENTIAL (admin side): never put it in public/.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const OUT = process.env.DEMO_OUT || join(tmpdir(), 'jpos-demo');
const PORT = Number(process.env.DEMO_PORT || 5399);
const BASE = `http://localhost:${PORT}`;
const W = 1280, H = 720, DSF = 1; // 1x keeps the browser fast while it screencasts
const BROWSER = process.env.BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Start the demo dev server (mock data) ───────────────────────────────────
const vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--config', join(here, 'vite.demo.config.mjs')],
  { cwd: root, stdio: 'ignore', env: { ...process.env, DEMO_PORT: String(PORT) } });
const browserProfile = mkdtempSync(join(tmpdir(), 'jpos-demo-browser-'));
let browser;
const cleanup = () => { try { vite.kill(); } catch {} try { browser?.kill(); } catch {} };
process.on('exit', cleanup);

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/login`)).ok) break; } catch {}
    if (i > 120) throw new Error('demo server did not start');
    await sleep(250);
  }

  // ── Browser + DevTools protocol ──────────────────────────────────────────
  const cdpPort = 9400 + Math.floor(Math.random() * 400);
  browser = spawn(BROWSER, ['--headless=new', '--hide-scrollbars', '--mute-audio', '--no-first-run', '--force-color-profile=srgb',
    `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${browserProfile}`, 'about:blank'], { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
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
  const waitFor = async (expr, ms = 15000) => {
    for (let t = 0; t < ms; t += 100) { if (await evaluate(`!!(${expr})`)) return; await sleep(100); }
    throw new Error(`timeout waiting for ${expr}`);
  };

  // Surface page errors in the terminal (a crash shows up as a blank video otherwise)
  listeners.set('Runtime.exceptionThrown', p => console.error('[page exception]', p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
  listeners.set('Runtime.consoleAPICalled', p => {
    if (p.type === 'error') console.error('[console.error]', p.args.map(a => a.value ?? a.description).join(' ').slice(0, 400));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
  try { await send('Page.setDownloadBehavior', { behavior: 'deny' }); } catch {}

  // Visible cursor + click ripple (headless Chrome draws no pointer)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    addEventListener('DOMContentLoaded', () => {
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
  let mouse = { x: W + 30, y: H * 0.62 };
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  // Input events are fired without awaiting each reply and paced by the wall clock.
  // Awaiting every event made each move ~4x slower while the browser was encoding frames.
  const fire = (method, params) => { send(method, params).catch(() => {}); };
  const flush = () => send('Runtime.evaluate', { expression: '0' }); // returns once queued input is processed
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
    const r = await evaluate(`(() => { const el = (${finder}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
    if (!r) throw new Error(`element not found: ${finder}`);
    return r;
  }
  async function click(finder, { after = 350, move = 500 } = {}) {
    const r = await rectOf(finder);
    await moveTo(r.x + r.w / 2, r.y + r.h / 2, move);
    await sleep(140);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouse.x, y: mouse.y, button: 'left', clickCount: 1 });
    await sleep(70);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse.x, y: mouse.y, button: 'left', clickCount: 1 });
    await sleep(after);
  }
  async function clickUntil(finder, condition, opts = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await click(finder, { ...opts, move: attempt ? 200 : opts.move });
      for (let t = 0; t < 1500; t += 100) { if (await evaluate(`!!(${condition})`)) return; await sleep(100); }
    }
    throw new Error(`click had no effect: ${finder}`);
  }
  const pillActive = label => `${byText('main button', label)}?.classList.contains('active')`;
  async function type(text, perChar = 75) {
    for (const ch of text) { fire('Input.insertText', { text: ch }); await sleep(perChar + Math.random() * 40); }
    await flush();
  }
  async function wheel(dy, ms = 800) {
    const t0 = Date.now(); let done = 0;
    while (done < dy) {
      const target = Math.min(dy, Math.round(dy * ease(Math.min(1, (Date.now() - t0) / ms))));
      if (target > done) { fire('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mouse.x, y: mouse.y, deltaX: 0, deltaY: target - done }); done = target; }
      await sleep(25);
    }
    await flush();
  }
  const byText = (tag, text, scope = 'document') =>
    `[...${scope}.querySelectorAll('${tag}')].find(e => e.textContent.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())})`;
  const product = name => `[...document.querySelectorAll('main button.card')].find(b => b.querySelector('p')?.textContent.trim() === ${JSON.stringify(name)})`;
  const navLink = label => byText('aside a', label);
  const modal = `document.querySelector('.modal-panel')`;

  // ── Warm up (first load compiles modules) ─────────────────────────────────
  await send('Page.navigate', { url: `${BASE}/admin?as=admin` });
  await waitFor(`document.querySelector('main h1')`, 60000);
  await send('Page.navigate', { url: `${BASE}/login` });
  await waitFor(`document.querySelector('#login-email')`, 60000);
  await evaluate(`document.fonts.ready.then(() => true)`);
  await evaluate(`Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })))`);
  await sleep(1200);

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

  await send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W * DSF, maxHeight: H * DSF, everyNthFrame: 1 });
  await sleep(300);

  mark('intro', 'Landing page');
  await sleep(1500);
  await moveTo(W * 0.62, H * 0.55, 900);
  await wheel(170, 700);
  await sleep(500);

  mark('signin', 'Sign in');
  await click(`document.querySelector('#login-email')`);
  await type('admin@jpos.demo', 45);
  await click(`document.querySelector('#login-password')`, { after: 250 });
  await type('demo1234', 55);
  await sleep(250);
  await click(byText('button', 'Sign In'), { after: 300 });
  await waitFor(`document.querySelector('main h1')?.textContent === 'Dashboard'`);

  mark('dashboard', 'Dashboard at a glance');
  await sleep(2200);

  mark('order', 'Take an order');
  await click(navLink('Point of Sale'), { after: 700 });
  await waitFor(product('Cafe Latte'));
  await clickUntil(byText('main button', 'Hot Coffee'), pillActive('Hot Coffee'), { after: 300 });
  await click(product('Cafe Latte'), { after: 350 });
  await click(product('Cappuccino'), { after: 250, move: 450 });
  await click(product('Cappuccino'), { after: 450, move: 150 });
  await clickUntil(byText('main button', 'Non-Coffee'), pillActive('Non-Coffee'), { after: 300 });
  await click(product('Matcha Latte'), { after: 600 });

  mark('discount', 'Apply a discount');
  await click(`document.querySelector('input[type=number][max]')`, { after: 200 });
  await type('10', 110);
  await sleep(800);
  const posterAt = Date.now() / 1000;

  mark('checkout', 'Cash checkout');
  await clickUntil(byText('button', 'Checkout'), modal, { after: 500 });
  await click(`${modal}.querySelector('input[type=number]')`, { after: 200 });
  await type('1000', 100);
  await sleep(1000);
  await click(byText('button', 'Confirm Order'), { after: 300 });
  await waitFor(`document.querySelector('#receipt')`);

  mark('receipt', 'Receipt with order QR');
  await sleep(2600);
  await click(byText('button', 'Done'), { after: 500 });

  mark('live', 'Live dashboard');
  await click(navLink('Dashboard'), { after: 1500 });
  await moveTo(W * 0.6, H * 0.6, 400);
  await wheel(330, 800);
  await sleep(1200);

  mark('reports', 'Reports & PDF');
  await click(navLink('Reports'), { after: 1200 });
  await clickUntil(byText('main button', 'month'), `${byText('main button', 'month')}?.classList.contains('active')`, { after: 800 });
  await click(`[...document.querySelectorAll('main button')].find(b => b.textContent.includes('Download PDF'))`, { after: 1000 });

  mark('staff', 'Staff & roles');
  await click(navLink('Manage Staff'), { after: 1000 });
  await click(`[...document.querySelectorAll('main button')].filter(b => b.textContent.trim() === 'Edit')[1]`, { after: 2000 });
  await click(byText('button', 'staff', modal), { after: 1400 }); // Role → Staff: RFID fields appear
  await click(byText('button', 'Cancel'), { after: 600 });

  mark('end', 'End');
  await sleep(600);
  await send('Page.stopScreencast');
  await sleep(300);
  await Promise.all(writes);

  // ── Encode ────────────────────────────────────────────────────────────────
  if (frames.length < 10) throw new Error(`only ${frames.length} frames captured`);
  const t0 = frames[0].t;
  const end = marks.at(-1).t + 0.6;
  let list = '';
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : Math.max(end, f.t + 0.5);
    list += `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
  });
  list += `file '${frames.at(-1).file.replace(/\\/g, '/')}'\n`;
  writeFileSync(join(OUT, 'frames.txt'), list);

  const demoDir = join(here, 'output'); // git-ignored; never public/
  mkdirSync(demoDir, { recursive: true });
  const mp4 = join(demoDir, 'jpos-demo.mp4');
  const crf = process.env.DEMO_CRF || '28';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(OUT, 'frames.txt'),
    // JPEG frames are full-range; convert to limited-range yuv420p so every player (Safari/iOS too) shows true colours
    '-vf', `scale=${W}:${H}:flags=lanczos:out_range=tv,format=yuv420p`, '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-fps_mode', 'cfr', '-r', '30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-tune', 'animation', '-profile:v', 'high',
    '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });

  // Poster: the POS with a filled cart, just before checkout
  const posterFrame = frames.reduce((best, f) => (Math.abs(f.t - posterAt) < Math.abs(best.t - posterAt) ? f : best));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', posterFrame.file, '-vf', `scale=${W}:${H}:flags=lanczos`, '-q:v', '3',
    join(demoDir, 'jpos-demo.jpg')], { stdio: 'inherit' });

  const chapters = marks.filter(m => m.id !== 'end').map(m => ({ id: m.id, label: m.label, at: Math.max(0, +(m.t - t0).toFixed(1)) }));
  writeFileSync(join(OUT, 'chapters.json'), JSON.stringify(chapters, null, 2));
  console.log(`\nframes: ${frames.length}, duration: ${(end - t0).toFixed(1)}s`);
  console.log(`mp4: ${(statSync(mp4).size / 1024).toFixed(0)} KB → ${mp4}`);
  console.log('chapters:', JSON.stringify(chapters));
  ws.close();
} finally {
  cleanup();
  await sleep(300);
  try { rmSync(browserProfile, { recursive: true, force: true }); } catch {}
}
process.exit(0);
