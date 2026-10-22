// Unit tests for the email API. No network, no Gmail, no Firebase: the
// sign-in check, Firestore counters and the mailer are all faked.
// Run with: npm run test:api
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentNoticeHandler, verifyEmailHandler } from '../_lib/handlers.js';
import {
  BUDGET, checkQuota, hourKey, last24Hours, withinBudget, PAYMENT_LIMIT, VERIFY_IP_LIMIT, VERIFY_LIMIT,
  type Limit, type MailKind, type QuotaState,
} from '../_lib/quota.js';
import type { AuthUser, Deps } from '../_lib/deps.js';
import type { Message } from '../_lib/mail.js';
import type { PaymentRequestDoc, Reserve, Store } from '../_lib/store.js';

const APP = 'https://jpos.example.com';
const START = new Date('2026-10-23T02:00:00Z');

interface Sent extends Message { to: string[] }

interface World {
  users: Record<string, AuthUser>;
  requests: Record<string, PaymentRequestDoc>;
  log: Map<string, unknown>;
  sent: Sent[];
  now: Date;
  env: Record<string, string | undefined>;
  mailFails: boolean;
  links: number;
}

/** In-memory version of firestoreStore, using the same limits. */
function memoryStore(w: World): Store {
  const num = (id: string) => Number((w.log.get(id) as { count?: number } | undefined)?.count ?? 0);
  const hourId = (kind: MailKind, now: Date) => `hour_${kind}_${hourKey(now)}`;
  const reserve = (kind: MailKind, quotaId: string, limit: Limit, now: Date, ipId?: string | null, onceId?: string): Reserve => {
    if (onceId && w.log.has(onceId)) return { ok: false, reason: 'duplicate' };
    const check = checkQuota(w.log.get(quotaId) as QuotaState | undefined, now.getTime(), limit);
    if (!check.ok) return check;
    const ipCheck = ipId ? checkQuota(w.log.get(ipId) as QuotaState | undefined, now.getTime(), VERIFY_IP_LIMIT) : null;
    if (ipCheck && !ipCheck.ok) return { ok: false, reason: 'limit', retryAfterSec: ipCheck.retryAfterSec };
    const hours = last24Hours(now).map(h => num(`hour_${kind}_${h}`));
    if (!withinBudget(kind, hours)) return { ok: false, reason: 'busy' };
    w.log.set(quotaId, check.next);
    if (ipId && ipCheck?.ok) w.log.set(ipId, ipCheck.next);
    w.log.set(hourId(kind, now), { count: hours[0] + 1 });
    if (onceId) w.log.set(onceId, true);
    return { ok: true };
  };
  const release = (kind: MailKind, quotaId: string, now: Date, ipId?: string | null, onceId?: string) => {
    const q = w.log.get(quotaId) as QuotaState | undefined;
    if (q) w.log.set(quotaId, { ...q, count: Math.max(0, q.count - 1) });
    if (w.log.has(hourId(kind, now))) w.log.set(hourId(kind, now), { count: Math.max(0, num(hourId(kind, now)) - 1) });
    const ip = ipId ? (w.log.get(ipId) as QuotaState | undefined) : undefined;
    if (ipId && ip) w.log.set(ipId, { ...ip, count: Math.max(0, ip.count - 1) });
    if (onceId) w.log.delete(onceId);
  };
  return {
    reserveVerifyEmail: async (uid, ipId, now) => reserve('verify', `verify_${uid}`, VERIFY_LIMIT, now, ipId),
    releaseVerifyEmail: async (uid, ipId, now) => release('verify', `verify_${uid}`, now, ipId),
    reservePaymentNotice: async (id, uid, now) => reserve('payment', `pay_${uid}`, PAYMENT_LIMIT, now, null, `paid_${id}`),
    releasePaymentNotice: async (id, uid, now) => release('payment', `pay_${uid}`, now, null, `paid_${id}`),
    getPaymentRequest: async (id) => w.requests[id] ?? null,
  };
}

const REQ_ID = 'Req1234567890abc';

function newWorld(): World {
  return {
    users: {
      juan: { email: 'juan@shop.test', emailVerified: false, displayName: 'Juan <b>Dela Cruz</b>', disabled: false },
      maria: { email: 'maria@shop.test', emailVerified: false, displayName: 'Maria', disabled: false },
      done: { email: 'done@shop.test', emailVerified: true, displayName: 'Done', disabled: false },
      off: { email: 'off@shop.test', emailVerified: false, displayName: 'Off', disabled: true },
    },
    requests: {
      [REQ_ID]: {
        tenantId: 't1', tenantName: 'Kape <script>alert(1)</script>\nBcc: x@evil.test', uid: 'juan', requesterName: 'Juan',
        plan: 'business', amount: 999, channelLabel: 'GCash', reference: '1234567890123',
        proofUrl: 'https://res.cloudinary.com/demo/image/upload/v1/proof.png', status: 'pending',
      },
    },
    log: new Map(),
    sent: [],
    now: START,
    env: { APP_URL: APP, GMAIL_USER: 'jpos.owner@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', VITE_CLOUDINARY_CLOUD_NAME: 'demo' },
    mailFails: false,
    links: 0,
  };
}

function depsFor(w: World): () => Deps {
  return () => ({
    env: w.env,
    now: () => w.now,
    store: memoryStore(w),
    auth: {
      // A "token" is "ok:<uid>"; anything else is refused the way the Admin SDK does
      verifyIdToken: async (token) => {
        if (token === 'down') throw Object.assign(new Error('no certs'), { code: 'app/network-error' });
        if (!token.startsWith('ok:')) throw Object.assign(new Error('bad'), { code: 'auth/argument-error' });
        return { uid: token.slice(3) };
      },
      getUser: async (uid) => {
        const u = w.users[uid];
        if (!u) throw Object.assign(new Error('none'), { code: 'auth/user-not-found' });
        return u;
      },
      generateEmailVerificationLink: async (email) => {
        w.links += 1;
        return `https://demo.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=CODE-${w.links}-${encodeURIComponent(email)}&apiKey=k`;
      },
    },
    mailer: () => {
      if (!w.env.GMAIL_USER || !w.env.GMAIL_APP_PASSWORD) {
        throw Object.assign(new Error('not set up'), { status: 503, code: 'not_configured' });
      }
      return {
        send: async (to, message) => {
          if (w.mailFails) throw new Error('535 Username and Password not accepted');
          w.sent.push({ ...message, to });
        },
      };
    },
  });
}

const post = (path: string, token?: string, body: unknown = {}, ip?: string) =>
  new Request(`https://anything.test/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ip ? { 'x-real-ip': ip } : {}),
    },
    body: JSON.stringify(body),
  });

async function call(handler: (r: Request) => Promise<Response>, request: Request) {
  const res = await handler(request);
  return { status: res.status, body: await res.json() as Record<string, any> };
}

describe('POST /api/email/verify', () => {
  test('only POST', async () => {
    const w = newWorld();
    const res = await verifyEmailHandler(depsFor(w))(new Request('https://x.test/api/email/verify'));
    assert.equal(res.status, 405);
  });

  test('needs a sign-in', async () => {
    const w = newWorld();
    const h = verifyEmailHandler(depsFor(w));
    assert.equal((await call(h, post('email/verify'))).status, 401);
    assert.equal((await call(h, post('email/verify', 'forged'))).status, 401);
    assert.equal((await call(h, post('email/verify', 'ok:nobody'))).status, 401);
    assert.equal((await call(h, post('email/verify', 'down'))).status, 503);
    assert.equal(w.sent.length, 0);
  });

  test("sends one email to the account's own address, whatever the request says", async () => {
    const w = newWorld();
    const r = await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan', { email: 'victim@other.test', to: 'victim@other.test' }));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { sent: true });
    assert.equal(w.sent.length, 1);
    assert.deepEqual(w.sent[0].to, ['juan@shop.test']);
    assert.equal(w.sent[0].subject, 'Confirm your email for JPOS');
  });

  test('the link opens JPOS (fixed address) with the one-time code', async () => {
    const w = newWorld();
    await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan'));
    const link = `${APP}/verify-email?oobCode=${encodeURIComponent('CODE-1-juan@shop.test')}`;
    assert.ok(w.sent[0].text.includes(link), w.sent[0].text);
    assert.ok(!w.sent[0].text.includes('anything.test'), 'must not link to the host the request came from');
    assert.ok(!w.sent[0].text.includes('firebaseapp.com'));
  });

  test("carries no text from the sign-up form (it could be a stranger's message)", async () => {
    const w = newWorld();
    await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan'));
    assert.ok(!w.sent[0].html.includes('Dela Cruz'));
    assert.ok(!w.sent[0].text.includes('Dela Cruz'));
  });

  test('already confirmed: nothing is sent', async () => {
    const w = newWorld();
    const r = await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:done'));
    assert.deepEqual(r.body, { sent: false, alreadyVerified: true });
    assert.equal(w.sent.length, 0);
    assert.equal(w.links, 0);
  });

  test('a turned-off account gets nothing', async () => {
    const w = newWorld();
    assert.equal((await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:off'))).status, 403);
    assert.equal(w.sent.length, 0);
  });

  test('once a minute, five a day per account', async () => {
    const w = newWorld();
    const h = verifyEmailHandler(depsFor(w));
    assert.equal((await call(h, post('email/verify', 'ok:juan'))).status, 200);
    const again = await call(h, post('email/verify', 'ok:juan'));
    assert.equal(again.status, 429);
    assert.equal(again.body.error.code, 'too_soon');
    // Another account isn't held up
    assert.equal((await call(h, post('email/verify', 'ok:maria'))).status, 200);
    for (let i = 1; i < 5; i++) {
      w.now = new Date(START.getTime() + i * 61_000);
      assert.equal((await call(h, post('email/verify', 'ok:juan'))).status, 200, `email ${i + 1}`);
    }
    w.now = new Date(START.getTime() + 10 * 61_000);
    const sixth = await call(h, post('email/verify', 'ok:juan'));
    assert.equal(sixth.status, 429);
    assert.equal(sixth.body.error.code, 'too_many');
    // A day later it works again
    w.now = new Date(START.getTime() + 25 * 60 * 60 * 1000);
    assert.equal((await call(h, post('email/verify', 'ok:juan'))).status, 200);
    assert.equal(w.sent.filter(s => s.to[0] === 'juan@shop.test').length, 6);
  });

  test('stops when the hourly or 24-hour share is used up', async () => {
    const w = newWorld();
    w.log.set(`hour_verify_${hourKey(START)}`, { count: BUDGET.verify.perHour });
    const r = await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan'));
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'email_busy');
    // Spread over the past day (not this hour) still counts
    const w2 = newWorld();
    const hours = last24Hours(START);
    for (let i = 1; i < hours.length; i++) w2.log.set(`hour_verify_${hours[i]}`, { count: Math.ceil(BUDGET.verify.perDay / 23) });
    assert.equal((await call(verifyEmailHandler(depsFor(w2)), post('email/verify', 'ok:juan'))).status, 503);
    assert.equal(w.sent.length + w2.sent.length, 0);
  });

  test('a flood of sign-up emails never blocks the payment emails', async () => {
    const w = newWorld();
    w.log.set(`hour_verify_${hourKey(START)}`, { count: BUDGET.verify.perHour });
    const r = await call(paymentNoticeHandler(depsFor(w)), post('email/payment', 'ok:juan', { requestId: REQ_ID }));
    assert.deepEqual(r.body, { sent: true });
  });

  test('ten accounts a day from one network, however many accounts they make', async () => {
    const w = newWorld();
    const h = verifyEmailHandler(depsFor(w));
    for (let i = 0; i < 11; i++) w.users[`throwaway${i}`] = { email: `victim${i}@example.com`, emailVerified: false, disabled: false };
    for (let i = 0; i < 11; i++) {
      const r = await call(h, post('email/verify', `ok:throwaway${i}`, {}, '203.0.113.7'));
      assert.equal(r.status, i < 10 ? 200 : 429, `account ${i + 1}`);
    }
    // Someone on another network is not held up
    assert.equal((await call(h, post('email/verify', 'ok:juan', {}, '198.51.100.2'))).status, 200);
    assert.equal(w.sent.length, 11);
  });

  test("a failed send doesn't use up the day's emails", async () => {
    const w = newWorld();
    const h = verifyEmailHandler(depsFor(w));
    w.mailFails = true;
    assert.equal((await call(h, post('email/verify', 'ok:juan', {}, '203.0.113.7'))).status, 502);
    w.mailFails = false;
    for (let i = 1; i <= 5; i++) {
      w.now = new Date(START.getTime() + i * 61_000);
      assert.equal((await call(h, post('email/verify', 'ok:juan', {}, '203.0.113.7'))).status, 200, `email ${i}`);
    }
  });

  test('Gmail not set up: a clear message, and nothing is counted', async () => {
    const w = newWorld();
    w.env = { APP_URL: APP };
    const r = await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan'));
    assert.equal(r.status, 500); // the fake mailer throws a plain error...
    w.env = { APP_URL: APP, GMAIL_USER: 'a@gmail.com', GMAIL_APP_PASSWORD: 'x' };
    // ...and no quota was used, so the next try right away still works
    assert.equal((await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan'))).status, 200);
  });

  test('Gmail refuses: a friendly error, no secret in it', async () => {
    const w = newWorld();
    w.mailFails = true;
    const r = await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan'));
    assert.equal(r.status, 502);
    assert.equal(r.body.error.code, 'email_failed');
    assert.ok(!JSON.stringify(r.body).includes('abcd'));
  });

  test('without APP_URL: uses the Vercel production address, never the request host', async () => {
    const w = newWorld();
    w.env = { ...w.env, APP_URL: undefined, VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'jpos.vercel.app' };
    await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan'));
    assert.ok(w.sent[0].text.includes('https://jpos.vercel.app/verify-email?oobCode='));
  });

  test('no address configured at all: refuses instead of guessing', async () => {
    const w = newWorld();
    w.env = { ...w.env, APP_URL: undefined, VERCEL: '1' };
    const r = await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan'));
    assert.equal(r.status, 503);
    assert.equal(w.sent.length, 0);
  });

  test('a local-test setting is ignored on Vercel', async () => {
    const w = newWorld();
    w.env = { ...w.env, APP_URL: undefined, VERCEL: '1', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_PROJECT_ID: 'demo-jpos' };
    const r = await call(verifyEmailHandler(depsFor(w)), post('email/verify', 'ok:juan'));
    assert.equal(r.status, 503, 'must not fall back to the request host on Vercel');
  });
});

describe('POST /api/email/payment', () => {
  const pay = (token?: string, requestId: unknown = REQ_ID) => post('email/payment', token, { requestId });

  test('needs a sign-in and a payment id', async () => {
    const w = newWorld();
    const h = paymentNoticeHandler(depsFor(w));
    assert.equal((await call(h, pay())).status, 401);
    assert.equal((await call(h, pay('ok:juan', ''))).status, 400);
    assert.equal((await call(h, pay('ok:juan', '../users/x'))).status, 400);
    assert.equal((await call(h, pay('ok:juan', 'Nope1234567890'))).status, 404);
    assert.equal(w.sent.length, 0);
  });

  test("only the owner who sent the payment can ask", async () => {
    const w = newWorld();
    const r = await call(paymentNoticeHandler(depsFor(w)), pay('ok:maria'));
    assert.equal(r.status, 403);
    assert.equal(w.sent.length, 0);
  });

  test('emails the Gmail account (no NOTIFY_EMAIL) with the details', async () => {
    const w = newWorld();
    const r = await call(paymentNoticeHandler(depsFor(w)), pay('ok:juan'));
    assert.deepEqual(r.body, { sent: true });
    assert.equal(w.sent.length, 1);
    const m = w.sent[0];
    assert.deepEqual(m.to, ['jpos.owner@gmail.com']);
    assert.ok(m.text.includes('Amount: ₱999'));
    assert.ok(m.text.includes('Reference no.: 1234567890123'));
    assert.ok(m.text.includes(`Open Super Admin: ${APP}/admin/platform`));
    assert.ok(m.html.includes('https://res.cloudinary.com/demo/image/upload/v1/proof.png'));
  });

  test('NOTIFY_EMAIL picks the recipients (bad entries dropped)', async () => {
    const w = newWorld();
    w.env.NOTIFY_EMAIL = 'boss@jpos.test, not-an-email ,second@jpos.test';
    await call(paymentNoticeHandler(depsFor(w)), pay('ok:juan'));
    assert.deepEqual(w.sent[0].to, ['boss@jpos.test', 'second@jpos.test']);
  });

  test('a shop name with HTML or line breaks stays plain text', async () => {
    const w = newWorld();
    await call(paymentNoticeHandler(depsFor(w)), pay('ok:juan'));
    const m = w.sent[0];
    assert.ok(!/[\r\n]/.test(m.subject), m.subject);
    assert.ok(!m.html.includes('<script>'));
    assert.ok(m.html.includes('&lt;script&gt;'));
  });

  test("only JPOS's own Cloudinary pictures become a receipt link", async () => {
    const bad = [
      'javascript:alert(1)',
      'https://jpos-login.example/google-signin',
      'https://res.cloudinary.com/someone-else/image/upload/x.png',
      'https://res.cloudinary.com.evil.test/demo/image/upload/x.png',
    ];
    for (const url of bad) {
      const w = newWorld();
      w.requests[REQ_ID].proofUrl = url;
      await call(paymentNoticeHandler(depsFor(w)), pay('ok:juan'));
      assert.ok(!w.sent[0].html.includes(url) && !w.sent[0].text.includes(url), url);
      assert.ok(w.sent[0].text.includes('The receipt picture is in Super Admin.'));
    }
  });

  test('one email per payment', async () => {
    const w = newWorld();
    const h = paymentNoticeHandler(depsFor(w));
    await call(h, pay('ok:juan'));
    const again = await call(h, pay('ok:juan'));
    assert.deepEqual(again.body, { sent: false, duplicate: true });
    assert.equal(w.sent.length, 1);
  });

  test('a payment already reviewed sends nothing', async () => {
    const w = newWorld();
    w.requests[REQ_ID].status = 'approved';
    const r = await call(paymentNoticeHandler(depsFor(w)), pay('ok:juan'));
    assert.deepEqual(r.body, { sent: false, reason: 'not_pending' });
    assert.equal(w.sent.length, 0);
  });

  test('if Gmail fails, a later try can still send it', async () => {
    const w = newWorld();
    const h = paymentNoticeHandler(depsFor(w));
    w.mailFails = true;
    assert.equal((await call(h, pay('ok:juan'))).status, 502);
    w.mailFails = false;
    assert.deepEqual((await call(h, pay('ok:juan'))).body, { sent: true });
    assert.equal(w.sent.length, 1);
  });

  test('ten payment emails a day per account', async () => {
    const w = newWorld();
    const h = paymentNoticeHandler(depsFor(w));
    for (let i = 0; i < 11; i++) {
      const id = `Req${String(i).padStart(10, '0')}`;
      w.requests[id] = { ...w.requests[REQ_ID], status: 'pending' };
      const r = await call(h, pay('ok:juan', id));
      assert.equal(r.status, i < 10 ? 200 : 429, `payment ${i + 1}`);
    }
    assert.equal(w.sent.length, 10);
  });
});

describe('withinBudget', () => {
  test('per hour and per rolling 24 hours, per kind', () => {
    assert.ok(withinBudget('verify', [0]));
    assert.ok(!withinBudget('verify', [BUDGET.verify.perHour]));
    assert.ok(!withinBudget('payment', [0, ...Array(23).fill(Math.ceil(BUDGET.payment.perDay / 23))]));
    assert.ok(BUDGET.verify.perDay + BUDGET.payment.perDay < 500, "stays under Gmail's daily limit");
  });
});

describe('checkQuota', () => {
  const limit: Limit = { cooldownMs: 60_000, max: 2, windowMs: 1000 * 60 * 60 };
  test('counts, cools down, and resets after the window', () => {
    const t = START.getTime();
    const a = checkQuota(undefined, t, limit);
    assert.ok(a.ok);
    const b = checkQuota(a.ok ? a.next : undefined, t + 30_000, limit);
    assert.deepEqual(b.ok ? null : b.reason, 'cooldown');
    const c = checkQuota(a.ok ? a.next : undefined, t + 61_000, limit);
    assert.ok(c.ok && c.next.count === 2);
    const d = checkQuota(c.ok ? c.next : undefined, t + 200_000, limit);
    assert.deepEqual(d.ok ? null : d.reason, 'limit');
    const e = checkQuota(c.ok ? c.next : undefined, t + limit.windowMs + 1, limit);
    assert.ok(e.ok && e.next.count === 1);
  });

  test('a stored time in the future starts a new window', () => {
    const t = START.getTime();
    const r = checkQuota({ windowStart: t + 999_999, count: 99, lastSentAt: t + 999_999 }, t, limit);
    assert.ok(r.ok);
  });
});
