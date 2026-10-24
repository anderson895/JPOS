// Unit tests for the API (sign-up codes and emails). No network, no Gmail, no
// Firebase: the sign-in check, the logins, Firestore and the mailer are all faked.
// Run with: npm run test:api
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emailChangeCodeHandler, emailChangeFinishHandler, passwordCodeHandler, passwordResetHandler, paymentNoticeHandler,
  signupCodeHandler, signupFinishHandler, usageHandler, dailySummaryHandler, publicSettingsHandler,
  SETTINGS_CACHE_SEC, USAGE_CACHE_SEC,
} from '../_lib/handlers.js';
import { memoryCache, redisCache, redisUrlFrom, type Cache, type RedisLike } from '../_lib/cache.js';
import { phYesterday, summarize, wantsSummary, type OrderLite, type SummaryShop } from '../_lib/summary.js';
import { computeUsage, storageLimitBytes, BASE_DATA_BYTES, EST_ORDER_BYTES, EST_PICTURE_BYTES, EST_PRODUCT_BYTES, MB, type UsageCounts } from '../_lib/usage.js';
import { ApiError } from '../_lib/http.js';
import {
  BUDGET, checkQuota, hourKey, last24Hours, withinBudget, PAYMENT_LIMIT, VERIFY_IP_LIMIT, VERIFY_LIMIT,
  type Limit, type MailKind, type QuotaState,
} from '../_lib/quota.js';
import { checkCode, codeHash, emailId, newCode, CODE_TRIES, CODE_TTL_MS, type StoredCode } from '../_lib/signupCode.js';
import type { AuthUser, Deps } from '../_lib/deps.js';
import type { Message } from '../_lib/mail.js';
import type { PaymentRequestDoc, Reserve, Store } from '../_lib/store.js';

const APP = 'https://jpos.example.com';
const START = new Date('2026-10-23T02:00:00Z');

interface Sent extends Message { to: string[] }
interface Account extends AuthUser { password?: string; displayName?: string }

interface World {
  /** Logins by uid */
  accounts: Record<string, Account>;
  /** Logins with a JPOS profile, or the Super Admin */
  inUse: Set<string>;
  codes: Map<string, StoredCode>;
  codesMade: number;
  requests: Record<string, PaymentRequestDoc>;
  log: Map<string, unknown>;
  sent: Sent[];
  now: Date;
  env: Record<string, string | undefined>;
  mailFails: boolean;
  createFails: boolean;
  /** platformAdmins/{uid} */
  admins: Set<string>;
  /** users/{uid}.email */
  profileEmail: Map<string, string>;
  /** users/{uid}: shop and role */
  profiles: Map<string, { tenantId: string; role: string; isActive: boolean }>;
  /** What each shop stores */
  shops: Map<string, UsageCounts>;
  /** platform/settings as the public pages get it (null: never set up) */
  settings: Record<string, unknown> | null;
  /** How often Firestore was read for these (to see the cache work) */
  reads: { usage: number; settings: number };
  /** The cache (Redis in production), made on first use */
  cache?: Cache;
  /** Shops for the daily email, and their orders */
  summaryShops: SummaryShop[];
  orders: Map<string, (OrderLite & { createdAt: string })[]>;
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
    reserveVerifyEmail: async (id, ipId, now) => reserve('verify', `verify_${id}`, VERIFY_LIMIT, now, ipId),
    releaseVerifyEmail: async (id, ipId, now) => release('verify', `verify_${id}`, now, ipId),
    saveSignupCode: async (id, code) => { w.codes.set(id, { ...code }); },
    checkSignupCode: async (id, hash, now) => {
      const { result, next } = checkCode(w.codes.get(id), hash, now.getTime());
      if (next) w.codes.set(id, next); else w.codes.delete(id);
      return result;
    },
    accountInUse: async (uid) => w.inUse.has(uid) || w.admins.has(uid),
    isPlatformAdmin: async (uid) => w.admins.has(uid),
    setProfileEmail: async (uid, email) => { if (w.profileEmail.has(uid)) w.profileEmail.set(uid, email); },
    profile: async (uid) => w.profiles.get(uid) ?? null,
    summaryShops: async () => w.summaryShops,
    ordersBetween: async (tenantId, startIso, endIso) => (w.orders.get(tenantId) ?? []).filter(o => o.createdAt >= startIso && o.createdAt < endIso),
    reserveSummary: async (tenantId, date, now) => reserve('summary', `summary_${tenantId}`, { cooldownMs: 0, max: 1, windowMs: 20 * 3600_000 }, now, null, `sum_${tenantId}_${date}`),
    releaseSummary: async (tenantId, date, now) => release('summary', `summary_${tenantId}`, now, null, `sum_${tenantId}_${date}`),
    shopUsage: async (tenantId) => { w.reads.usage++; return w.shops.get(tenantId) ?? null; },
    publicSettings: async () => { w.reads.settings++; return { saved: !!w.settings, settings: w.settings }; },
    reservePaymentNotice: async (id, uid, now) => reserve('payment', `pay_${uid}`, PAYMENT_LIMIT, now, null, `paid_${id}`),
    releasePaymentNotice: async (id, uid, now) => release('payment', `pay_${uid}`, now, null, `paid_${id}`),
    getPaymentRequest: async (id) => w.requests[id] ?? null,
  };
}

const REQ_ID = 'Req1234567890abc';

function newWorld(): World {
  const login = (uid: string, email: string, more: Partial<Account> = {}): Account =>
    ({ uid, email, emailVerified: false, disabled: false, providers: ['password'], ...more });
  return {
    accounts: {
      // An owner with a shop (verified)
      juan: login('juan', 'juan@shop.test', { emailVerified: true }),
      maria: login('maria', 'maria@shop.test', { emailVerified: true }),
      // Staff accounts are never verified, but they belong to a shop
      cashier: login('cashier', 'cashier@shop.test'),
      // Signed up with Google, no shop yet
      gina: login('gina', 'gina@gmail.test', { emailVerified: true, providers: ['google.com'] }),
      // Left behind by the old sign-up: never confirmed, no shop
      old: login('old', 'old@shop.test', { password: 'old-password' }),
      // Turned off by the Super Admin
      off: login('off', 'off@shop.test', { disabled: true }),
      // The JPOS owner (Super Admin), and a second one who signs in with Google only
      boss: login('boss', 'admin@shop.test', { emailVerified: true, password: 'boss-password' }),
      gboss: login('gboss', 'gboss@gmail.test', { emailVerified: true, providers: ['google.com'] }),
    },
    inUse: new Set(['juan', 'maria', 'cashier']),
    codes: new Map(),
    codesMade: 0,
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
    createFails: false,
    admins: new Set(['boss', 'gboss']),
    profileEmail: new Map([['boss', 'admin@shop.test'], ['juan', 'juan@shop.test']]),
    profiles: new Map([
      ['juan', { tenantId: 't1', role: 'admin', isActive: true }],
      ['cashier', { tenantId: 't1', role: 'staff', isActive: true }],
      ['maria', { tenantId: 't2', role: 'admin', isActive: true }],
    ]),
    summaryShops: [],
    orders: new Map(),
    shops: new Map([
      ['t1', { plan: 'starter', products: 40, orders: 1000, productPictures: 30, measuredPictures: 20, measuredBytes: 4 * MB, otherPictures: 2 }],
      ['t2', { plan: 'business', storageMB: null, products: 0, orders: 0, productPictures: 0, measuredPictures: 0, measuredBytes: 0, otherPictures: 0 }],
    ]),
    settings: { trialDays: 7, messengerUrl: 'https://m.me/jpos', contactPhone: '09454454744', plans: { starter: { name: 'Starter', price: 499 } }, paymentChannels: {} },
    reads: { usage: 0, settings: 0 },
  };
}

/** The n-th code the fake server made: "000001", "000002"… */
const nth = (n: number) => String(n).padStart(6, '0');

function depsFor(w: World): () => Deps {
  return () => ({
    env: w.env,
    now: () => w.now,
    store: memoryStore(w),
    cache: (w.cache ??= memoryCache(() => w.now.getTime())),
    newCode: () => nth(++w.codesMade),
    auth: {
      // A "token" is "ok:<uid>" (password typed just now) or "old:<uid>" (an hour ago);
      // anything else is refused the way the Admin SDK does
      verifyIdToken: async (token) => {
        if (token === 'down') throw Object.assign(new Error('no certs'), { code: 'app/network-error' });
        const nowSec = Math.floor(w.now.getTime() / 1000);
        if (token.startsWith('ok:')) return { uid: token.slice(3), authTime: nowSec };
        if (token.startsWith('old:')) return { uid: token.slice(4), authTime: nowSec - 3600 };
        throw Object.assign(new Error('bad'), { code: 'auth/argument-error' });
      },
      getUser: async (uid) => {
        const a = w.accounts[uid];
        if (!a) throw Object.assign(new Error('none'), { code: 'auth/user-not-found' });
        return { uid: a.uid, email: a.email, emailVerified: a.emailVerified, disabled: a.disabled, providers: a.providers };
      },
      updateEmail: async (uid, email) => {
        if (Object.values(w.accounts).some(x => x.email === email && x.uid !== uid)) {
          throw new ApiError(409, 'email_taken', 'This email already has an account.', 'email');
        }
        w.accounts[uid] = { ...w.accounts[uid], email, emailVerified: true };
      },
      getUserByEmail: async (email) => {
        const a = Object.values(w.accounts).find(x => x.email === email);
        return a ? { uid: a.uid, email: a.email, emailVerified: a.emailVerified, disabled: a.disabled, providers: a.providers } : null;
      },
      createUser: async ({ email, password, displayName }) => {
        if (w.createFails) throw new Error('auth/internal-error');
        if (Object.values(w.accounts).some(x => x.email === email)) {
          throw new ApiError(409, 'email_taken', 'This email already has an account. Sign in instead.', 'email');
        }
        const uid = `new${Object.keys(w.accounts).length}`;
        w.accounts[uid] = { uid, email, emailVerified: true, disabled: false, providers: ['password'], password, displayName };
        return uid;
      },
      deleteUser: async (uid) => { delete w.accounts[uid]; },
      updatePassword: async (uid, password) => {
        w.accounts[uid] = { ...w.accounts[uid], password, providers: [...new Set([...w.accounts[uid].providers, 'password'])] };
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

const askCode = (w: World, email: string, ip?: string, extra: Record<string, unknown> = {}) =>
  call(signupCodeHandler(depsFor(w)), post('signup/code', undefined, { email, ...extra }, ip));
const finish = (w: World, body: Record<string, unknown>) =>
  call(signupFinishHandler(depsFor(w)), post('signup/finish', undefined, { password: 'secret123', name: 'Juan', ...body }));
const byEmail = (w: World, email: string) => Object.values(w.accounts).find(a => a.email === email);

describe('POST /api/signup/code', () => {
  test('only POST', async () => {
    const w = newWorld();
    const res = await signupCodeHandler(depsFor(w))(new Request('https://x.test/api/signup/code'));
    assert.equal(res.status, 405);
  });

  test('needs a real email address', async () => {
    const w = newWorld();
    for (const email of ['', 'nope', 'a@b', 'two@a.test,three@b.test', `${'x'.repeat(250)}@a.test`, 42]) {
      const r = await askCode(w, email as string);
      assert.equal(r.status, 400, String(email));
      assert.equal(r.body.error.code, 'invalid_email');
    }
    assert.equal(w.sent.length, 0);
  });

  test('emails a 6-digit code; no account is made yet', async () => {
    const w = newWorld();
    const r = await askCode(w, '  New.Owner@Gmail.test ');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { sent: true });
    assert.equal(w.sent.length, 1);
    assert.deepEqual(w.sent[0].to, ['new.owner@gmail.test']);
    assert.equal(w.sent[0].subject, 'Your JPOS code: 000001');
    assert.ok(w.sent[0].text.includes('000001'));
    assert.ok(w.sent[0].html.includes('000001'));
    assert.equal(byEmail(w, 'new.owner@gmail.test'), undefined, 'the login waits for the code');
  });

  test('the code email has no links (links to a free web address look like spam)', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    const { html, text } = w.sent[0];
    assert.ok(!/href=|https?:\/\/|www\./i.test(html + text), 'no links in the code email');
    assert.ok(html.startsWith('<!doctype html><html lang="en"><head><meta charset="utf-8">'));
  });

  test('only a hash of the code is kept', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    const stored = w.codes.get(emailId('new@shop.test'));
    assert.ok(stored);
    assert.ok(!JSON.stringify(stored).includes('000001'));
    assert.equal(stored.hash, codeHash(emailId('new@shop.test'), '000001'));
    assert.equal(stored.expiresAt, START.getTime() + CODE_TTL_MS);
  });

  test("carries no text from the request (it could be a stranger's message)", async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test', undefined, { name: 'Visit evil.test now', shopName: '<b>Win a prize</b>' });
    assert.ok(!w.sent[0].html.includes('evil.test') && !w.sent[0].text.includes('evil.test'));
    assert.ok(!w.sent[0].html.includes('prize') && !w.sent[0].text.includes('prize'));
  });

  test('an email that already has an account gets no code', async () => {
    const w = newWorld();
    for (const email of ['juan@shop.test', 'cashier@shop.test', 'gina@gmail.test', 'off@shop.test']) {
      const r = await askCode(w, email);
      assert.equal(r.status, 409, email);
      assert.equal(r.body.error.code, 'email_taken');
    }
    assert.equal(w.sent.length, 0);
  });

  test('a never-confirmed login without a shop (old sign-up) can sign up again', async () => {
    const w = newWorld();
    assert.equal((await askCode(w, 'old@shop.test')).status, 200);
    // ...unless it runs JPOS or belongs to a shop
    w.inUse.add('old');
    assert.equal((await askCode(w, 'old@shop.test')).status, 409);
  });

  test('once a minute, five a day per address', async () => {
    const w = newWorld();
    assert.equal((await askCode(w, 'new@shop.test')).status, 200);
    const again = await askCode(w, 'NEW@shop.test');
    assert.equal(again.status, 429);
    assert.equal(again.body.error.code, 'too_soon');
    // Another address isn't held up
    assert.equal((await askCode(w, 'other@shop.test')).status, 200);
    for (let i = 1; i < 5; i++) {
      w.now = new Date(START.getTime() + i * 61_000);
      assert.equal((await askCode(w, 'new@shop.test')).status, 200, `email ${i + 1}`);
    }
    w.now = new Date(START.getTime() + 10 * 61_000);
    const sixth = await askCode(w, 'new@shop.test');
    assert.equal(sixth.status, 429);
    assert.equal(sixth.body.error.code, 'too_many');
    // A day later it works again
    w.now = new Date(START.getTime() + 25 * 60 * 60 * 1000);
    assert.equal((await askCode(w, 'new@shop.test')).status, 200);
    assert.equal(w.sent.filter(s => s.to[0] === 'new@shop.test').length, 6);
  });

  test('a new code replaces the old one', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    w.now = new Date(START.getTime() + 61_000);
    await askCode(w, 'new@shop.test');
    assert.equal((await finish(w, { email: 'new@shop.test', code: nth(1) })).status, 400);
    assert.equal((await finish(w, { email: 'new@shop.test', code: nth(2) })).status, 200);
  });

  test('stops when the hourly or 24-hour share is used up', async () => {
    const w = newWorld();
    w.log.set(`hour_verify_${hourKey(START)}`, { count: BUDGET.verify.perHour });
    const r = await askCode(w, 'new@shop.test');
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'email_busy');
    // Spread over the past day (not this hour) still counts
    const w2 = newWorld();
    const hours = last24Hours(START);
    for (let i = 1; i < hours.length; i++) w2.log.set(`hour_verify_${hours[i]}`, { count: Math.ceil(BUDGET.verify.perDay / 23) });
    assert.equal((await askCode(w2, 'new@shop.test')).status, 503);
    assert.equal(w.sent.length + w2.sent.length, 0);
  });

  test('a flood of sign-up emails never blocks the payment emails', async () => {
    const w = newWorld();
    w.log.set(`hour_verify_${hourKey(START)}`, { count: BUDGET.verify.perHour });
    const r = await call(paymentNoticeHandler(depsFor(w)), post('email/payment', 'ok:juan', { requestId: REQ_ID }));
    assert.deepEqual(r.body, { sent: true });
  });

  test('ten addresses a day from one network', async () => {
    const w = newWorld();
    for (let i = 0; i < 11; i++) {
      const r = await askCode(w, `victim${i}@example.com`, '203.0.113.7');
      assert.equal(r.status, i < 10 ? 200 : 429, `address ${i + 1}`);
    }
    // Someone on another network is not held up
    assert.equal((await askCode(w, 'new@shop.test', '198.51.100.2')).status, 200);
    assert.equal(w.sent.length, 11);
  });

  test("a failed send doesn't use up the day's emails", async () => {
    const w = newWorld();
    w.mailFails = true;
    assert.equal((await askCode(w, 'new@shop.test', '203.0.113.7')).status, 502);
    w.mailFails = false;
    for (let i = 1; i <= 5; i++) {
      w.now = new Date(START.getTime() + i * 61_000);
      assert.equal((await askCode(w, 'new@shop.test', '203.0.113.7')).status, 200, `email ${i}`);
    }
  });

  test('Gmail not set up: nothing is counted', async () => {
    const w = newWorld();
    w.env = { APP_URL: APP };
    const r = await askCode(w, 'new@shop.test');
    assert.equal(r.status, 500); // the fake mailer throws a plain error...
    w.env = { APP_URL: APP, GMAIL_USER: 'a@gmail.com', GMAIL_APP_PASSWORD: 'x' };
    // ...and no quota was used, so the next try right away still works
    assert.equal((await askCode(w, 'new@shop.test')).status, 200);
  });

  test('Gmail refuses: a friendly error, no secret in it', async () => {
    const w = newWorld();
    w.mailFails = true;
    const r = await askCode(w, 'new@shop.test');
    assert.equal(r.status, 502);
    assert.equal(r.body.error.code, 'email_failed');
    assert.ok(!JSON.stringify(r.body).includes('abcd'));
  });
});

describe('POST /api/signup/finish', () => {
  test('the right code makes the login, with the email already confirmed', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    const r = await finish(w, { email: 'New@Shop.test', code: nth(1), password: 'secret123', name: '  Juan\nDela Cruz ' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { created: true });
    const a = byEmail(w, 'new@shop.test');
    assert.ok(a);
    assert.equal(a.emailVerified, true);
    assert.equal(a.password, 'secret123');
    assert.equal(a.displayName, 'Juan Dela Cruz');
  });

  test('a code works once', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    assert.equal((await finish(w, { email: 'new@shop.test', code: nth(1) })).status, 200);
    delete w.accounts[byEmail(w, 'new@shop.test')!.uid];
    const again = await finish(w, { email: 'new@shop.test', code: nth(1) });
    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, 'code_missing');
  });

  test("a code only works for the address it was sent to", async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    const r = await finish(w, { email: 'other@shop.test', code: nth(1) });
    assert.equal(r.status, 400);
    assert.equal(byEmail(w, 'other@shop.test'), undefined);
  });

  test('wrong codes count down, then the code stops working', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    for (let i = 1; i < CODE_TRIES; i++) {
      const r = await finish(w, { email: 'new@shop.test', code: '999999' });
      assert.equal(r.status, 400);
      assert.equal(r.body.error.code, 'code_wrong');
      assert.ok(r.body.error.message.includes(`${CODE_TRIES - i} ${CODE_TRIES - i === 1 ? 'try' : 'tries'} left`), r.body.error.message);
    }
    const last = await finish(w, { email: 'new@shop.test', code: '999999' });
    assert.equal(last.status, 429);
    assert.equal(last.body.error.code, 'code_locked');
    // Even the right code is refused now: send a new one
    assert.equal((await finish(w, { email: 'new@shop.test', code: nth(1) })).status, 400);
    assert.equal(byEmail(w, 'new@shop.test'), undefined);
  });

  test('an old code has expired', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    w.now = new Date(START.getTime() + CODE_TTL_MS);
    const r = await finish(w, { email: 'new@shop.test', code: nth(1) });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'code_expired');
  });

  test('bad input is refused before the code is tried', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    assert.equal((await finish(w, { email: 'new@shop.test', code: '12345' })).body.error.code, 'invalid_code');
    assert.equal((await finish(w, { email: 'new@shop.test', code: 'abcdef' })).body.error.code, 'invalid_code');
    assert.equal((await finish(w, { email: 'new@shop.test', code: nth(1), password: '12345' })).body.error.code, 'weak_password');
    assert.equal((await finish(w, { email: 'new@shop.test', code: nth(1), password: 42 })).body.error.code, 'weak_password');
    assert.equal((await finish(w, { email: 'nope', code: nth(1) })).body.error.code, 'invalid_email');
    // None of those used up a try
    assert.equal(w.codes.get(emailId('new@shop.test'))?.tries, 0);
    assert.equal((await finish(w, { email: 'new@shop.test', code: ' 000 001 ' })).status, 200);
  });

  test('an email taken in the meantime is refused, and the code is kept', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    w.accounts.sneaky = { uid: 'sneaky', email: 'new@shop.test', emailVerified: true, disabled: false, providers: ['google.com'] };
    const r = await finish(w, { email: 'new@shop.test', code: nth(1) });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'email_taken');
    assert.ok(w.codes.has(emailId('new@shop.test')));
  });

  test("replaces the old sign-up's leftover login", async () => {
    const w = newWorld();
    await askCode(w, 'old@shop.test');
    assert.equal((await finish(w, { email: 'old@shop.test', code: nth(1), password: 'new-password' })).status, 200);
    assert.equal(w.accounts.old, undefined);
    const a = byEmail(w, 'old@shop.test');
    assert.equal(a?.password, 'new-password');
    assert.equal(a?.emailVerified, true);
  });

  test('never replaces a login that belongs to a shop', async () => {
    const w = newWorld();
    await askCode(w, 'old@shop.test');
    w.inUse.add('old'); // e.g. it became a staff account in the meantime
    assert.equal((await finish(w, { email: 'old@shop.test', code: nth(1) })).status, 409);
    assert.equal(w.accounts.old.password, 'old-password');
  });

  test('if the login cannot be made: a clear message, nothing half-done', async () => {
    const w = newWorld();
    await askCode(w, 'new@shop.test');
    w.createFails = true;
    const r = await finish(w, { email: 'new@shop.test', code: nth(1) });
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'signup_failed');
    assert.equal(byEmail(w, 'new@shop.test'), undefined);
  });
});

describe('Super Admin: change the sign-in email', () => {
  const askChange = (w: World, token: string | undefined, email: unknown, ip?: string) =>
    call(emailChangeCodeHandler(depsFor(w)), post('account/email-code', token, { email }, ip));
  const finishChange = (w: World, token: string | undefined, email: unknown, code: unknown) =>
    call(emailChangeFinishHandler(depsFor(w)), post('account/email-finish', token, { email, code }));

  test('needs a sign-in, and only the Super Admin', async () => {
    const w = newWorld();
    assert.equal((await askChange(w, undefined, 'new@shop.test')).status, 401);
    assert.equal((await askChange(w, 'forged', 'new@shop.test')).status, 401);
    assert.equal((await askChange(w, 'ok:juan', 'new@shop.test')).status, 403, 'a shop owner is not the Super Admin');
    assert.equal((await finishChange(w, 'ok:juan', 'new@shop.test', nth(1))).status, 403);
    assert.equal(w.sent.length, 0);
  });

  test('the password must have been typed in the last few minutes', async () => {
    const w = newWorld();
    const r = await askChange(w, 'old:boss', 'new@shop.test');
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'reauth_needed');
    assert.equal(w.sent.length, 0);
  });

  test('sends a code to the NEW address only; nothing changes yet', async () => {
    const w = newWorld();
    const r = await askChange(w, 'ok:boss', '  Boss.New@Gmail.test ');
    assert.equal(r.status, 200);
    assert.equal(w.sent.length, 1);
    assert.deepEqual(w.sent[0].to, ['boss.new@gmail.test']);
    assert.equal(w.sent[0].subject, 'Your JPOS code: 000001');
    assert.ok(!/href=|https?:\/\/|www\./i.test(w.sent[0].html + w.sent[0].text), 'no links');
    assert.equal(w.accounts.boss.email, 'admin@shop.test');
  });

  test('bad, same or taken addresses are refused', async () => {
    const w = newWorld();
    assert.equal((await askChange(w, 'ok:boss', 'nope')).body.error.code, 'invalid_email');
    assert.equal((await askChange(w, 'ok:boss', 'ADMIN@shop.test')).body.error.code, 'same_email');
    for (const taken of ['juan@shop.test', 'cashier@shop.test', 'gina@gmail.test', 'off@shop.test']) {
      const r = await askChange(w, 'ok:boss', taken);
      assert.equal(r.status, 409, taken);
      assert.equal(r.body.error.code, 'email_taken');
    }
    assert.equal(w.sent.length, 0);
  });

  test('a Google-only login has no password to confirm with', async () => {
    const w = newWorld();
    const r = await askChange(w, 'ok:gboss', 'new@shop.test');
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'no_password');
  });

  test('the right code changes the email (confirmed) and the profile', async () => {
    const w = newWorld();
    await askChange(w, 'ok:boss', 'boss.new@gmail.test');
    const r = await finishChange(w, 'ok:boss', 'Boss.New@gmail.test', nth(1));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { changed: true });
    assert.equal(w.accounts.boss.email, 'boss.new@gmail.test');
    assert.equal(w.accounts.boss.emailVerified, true);
    assert.equal(w.accounts.boss.password, 'boss-password', 'the password stays');
    assert.equal(w.profileEmail.get('boss'), 'boss.new@gmail.test');
  });

  test('the finish step works with any sign-in (the code is the proof)', async () => {
    const w = newWorld();
    await askChange(w, 'ok:boss', 'boss.new@gmail.test');
    assert.equal((await finishChange(w, 'old:boss', 'boss.new@gmail.test', nth(1))).status, 200);
  });

  test('a code only works for the address it was sent to', async () => {
    const w = newWorld();
    await askChange(w, 'ok:boss', 'boss.new@gmail.test');
    const r = await finishChange(w, 'ok:boss', 'other@gmail.test', nth(1));
    assert.equal(r.status, 400);
    assert.equal(w.accounts.boss.email, 'admin@shop.test');
  });

  test('a sign-up code for the same address does not change the email', async () => {
    const w = newWorld();
    await call(signupCodeHandler(depsFor(w)), post('signup/code', undefined, { email: 'boss.new@gmail.test' }));
    const r = await finishChange(w, 'ok:boss', 'boss.new@gmail.test', nth(1));
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'code_missing');
    assert.equal(w.accounts.boss.email, 'admin@shop.test');
  });

  test('wrong codes count down, then it stops working', async () => {
    const w = newWorld();
    await askChange(w, 'ok:boss', 'boss.new@gmail.test');
    for (let i = 1; i < CODE_TRIES; i++) {
      const r = await finishChange(w, 'ok:boss', 'boss.new@gmail.test', '999999');
      assert.equal(r.body.error.code, 'code_wrong');
    }
    assert.equal((await finishChange(w, 'ok:boss', 'boss.new@gmail.test', '999999')).body.error.code, 'code_locked');
    assert.equal((await finishChange(w, 'ok:boss', 'boss.new@gmail.test', nth(1))).status, 400);
    assert.equal(w.accounts.boss.email, 'admin@shop.test');
  });

  test('an old code has expired; a new code replaces the old one', async () => {
    const w = newWorld();
    await askChange(w, 'ok:boss', 'boss.new@gmail.test');
    w.now = new Date(START.getTime() + 61_000);
    await askChange(w, 'ok:boss', 'boss.new@gmail.test');
    assert.equal((await finishChange(w, 'ok:boss', 'boss.new@gmail.test', nth(1))).status, 400, 'the first code is replaced');
    w.now = new Date(START.getTime() + 61_000 + CODE_TTL_MS);
    assert.equal((await finishChange(w, 'ok:boss', 'boss.new@gmail.test', nth(2))).body.error.code, 'code_expired');
  });

  test('a never-confirmed leftover login with that email is replaced', async () => {
    const w = newWorld();
    await askChange(w, 'ok:boss', 'old@shop.test');
    assert.equal((await finishChange(w, 'ok:boss', 'old@shop.test', nth(1))).status, 200);
    assert.equal(w.accounts.old, undefined, 'the leftover login is gone');
    assert.equal(w.accounts.boss.email, 'old@shop.test');
  });

  test('same limits as other code emails (one a minute per address)', async () => {
    const w = newWorld();
    assert.equal((await askChange(w, 'ok:boss', 'boss.new@gmail.test')).status, 200);
    const again = await askChange(w, 'ok:boss', 'boss.new@gmail.test');
    assert.equal(again.status, 429);
    assert.equal(again.body.error.code, 'too_soon');
  });
});

describe('Forgot password', () => {
  const askCode = (w: World, email: string, ip?: string) => call(passwordCodeHandler(depsFor(w)), post('password/code', undefined, { email }, ip));
  const reset = (w: World, email: string, code: string, password = 'new-secret') =>
    call(passwordResetHandler(depsFor(w)), post('password/reset', undefined, { email, code, password }));

  test('a JPOS login gets a code; no links in it', async () => {
    const w = newWorld();
    const r = await askCode(w, ' Juan@Shop.test ');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { sent: true });
    assert.equal(w.sent.length, 1);
    assert.deepEqual(w.sent[0].to, ['juan@shop.test']);
    assert.ok(w.sent[0].subject.includes('000001') && w.sent[0].html.includes('Reset your password'));
    assert.ok(!/href=|https?:\/\/|www\./i.test(w.sent[0].html + w.sent[0].text), 'no links');
  });

  test("an email with no account: the same answer, and nothing is sent", async () => {
    const w = newWorld();
    const r = await askCode(w, 'nobody@shop.test');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { sent: true });
    assert.equal(w.sent.length, 0);
  });

  test('a turned-off account gets nothing', async () => {
    const w = newWorld();
    assert.deepEqual((await askCode(w, 'off@shop.test')).body, { sent: true });
    assert.equal(w.sent.length, 0);
  });

  test('the right code sets the new password; the code works once', async () => {
    const w = newWorld();
    await askCode(w, 'juan@shop.test');
    const r = await reset(w, 'juan@shop.test', '000001');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { reset: true });
    assert.equal(w.accounts.juan.password, 'new-secret');
    assert.equal((await reset(w, 'juan@shop.test', '000001', 'again-123')).status, 400);
  });

  test('a wrong code counts down, and a code for another email never works', async () => {
    const w = newWorld();
    await askCode(w, 'juan@shop.test');
    const wrong = await reset(w, 'juan@shop.test', '999999');
    assert.equal(wrong.status, 400);
    assert.match(String((wrong.body as { error: { message: string } }).error.message), /isn't right.*tries left/);
    assert.equal((await reset(w, 'maria@shop.test', '000001')).status, 400);
    assert.equal(w.accounts.maria.password, undefined);
  });

  test('a sign-up code is not a password code', async () => {
    const w = newWorld();
    await call(signupCodeHandler(depsFor(w)), post('signup/code', undefined, { email: 'new@shop.test' }));
    w.accounts.late = { uid: 'late', email: 'new@shop.test', emailVerified: true, disabled: false, providers: ['password'] };
    assert.equal((await reset(w, 'new@shop.test', '000001')).status, 400);
  });

  test('a short password is refused before the code is used', async () => {
    const w = newWorld();
    await askCode(w, 'juan@shop.test');
    assert.equal((await reset(w, 'juan@shop.test', '000001', '123')).status, 400);
    assert.equal((await reset(w, 'juan@shop.test', '000001')).status, 200);
  });

  test('one email a minute per address, like the sign-up code', async () => {
    const w = newWorld();
    await askCode(w, 'juan@shop.test');
    const again = await askCode(w, 'juan@shop.test');
    assert.equal(again.status, 429);
    assert.equal(w.sent.length, 1);
  });

  test("Gmail down: an error, and it doesn't count against the day", async () => {
    const w = newWorld();
    w.mailFails = true;
    assert.equal((await askCode(w, 'juan@shop.test')).status, 502);
    w.mailFails = false;
    w.now = new Date(START.getTime() + 61_000);   // the one-a-minute wait still applies
    assert.equal((await askCode(w, 'juan@shop.test')).status, 200);
  });
});

describe('Storage (POST /api/usage)', () => {
  const ask = (w: World, token: string | undefined, body: unknown = {}) => call(usageHandler(depsFor(w)), post('usage', token, body));

  test("a shop's admin sees its storage and package limit", async () => {
    const w = newWorld();
    const r = await ask(w, 'ok:juan');
    assert.equal(r.status, 200);
    const u = r.body as { usedBytes: number; limitBytes: number; photosBytes: number; dataBytes: number; pictures: number };
    // 20 measured (4 MB) + 10 older ones and 2 other pictures, estimated
    assert.equal(u.photosBytes, 4 * MB + 12 * EST_PICTURE_BYTES);
    assert.equal(u.dataBytes, 1000 * EST_ORDER_BYTES + 40 * EST_PRODUCT_BYTES + BASE_DATA_BYTES);
    assert.equal(u.usedBytes, u.photosBytes + u.dataBytes);
    assert.equal(u.limitBytes, 500 * MB);
    assert.equal(u.pictures, 32);
  });

  test('a cashier, another shop, or no sign-in: refused', async () => {
    const w = newWorld();
    assert.equal((await ask(w, 'ok:cashier')).status, 403);
    assert.equal((await ask(w, 'ok:maria', { tenantId: 't1' })).status, 403);
    assert.equal((await ask(w, undefined)).status, 401);
  });

  test('the Super Admin sees any shop', async () => {
    const w = newWorld();
    const r = await ask(w, 'ok:boss', { tenantId: 't2' });
    assert.equal(r.status, 200);
    assert.equal((r.body as { limitBytes: number | null }).limitBytes, null);
    assert.equal((await ask(w, 'ok:boss', { tenantId: 'nope' })).status, 404);
    assert.equal((await ask(w, 'ok:boss', { tenantId: '../x' })).status, 400);
  });

  test('package limits: Starter 500 MB, Business 2 GB, Enterprise 10 GB; a set limit wins', () => {
    assert.equal(storageLimitBytes('starter'), 500 * MB);
    assert.equal(storageLimitBytes('business'), 2048 * MB);
    assert.equal(storageLimitBytes('enterprise'), 10240 * MB);
    assert.equal(storageLimitBytes('starter', 1000), 1000 * MB);
    assert.equal(storageLimitBytes('business', null), null);
    assert.equal(storageLimitBytes('unknown'), 500 * MB);
  });

  test('more measured pictures than pictures (old data): never negative', () => {
    const u = computeUsage({ plan: 'starter', products: 1, orders: 0, productPictures: 1, measuredPictures: 3, measuredBytes: 900, otherPictures: 0 });
    assert.equal(u.photosBytes, 900);
  });
});

describe('Cache (Redis): fewer Firestore reads, same answers', () => {
  const usage = (w: World, token: string | undefined, body: unknown = {}) => call(usageHandler(depsFor(w)), post('usage', token, body));
  const settings = (w: World, method = 'GET') => publicSettingsHandler(depsFor(w))(new Request(`${APP}/api/public/settings`, { method }));

  test('storage: asked again within 5 minutes, the cache answers', async () => {
    const w = newWorld();
    const first = await usage(w, 'ok:juan');
    const again = await usage(w, 'ok:juan');
    assert.deepEqual(again.body, first.body);
    assert.equal(w.reads.usage, 1);
    w.now = new Date(START.getTime() + USAGE_CACHE_SEC * 1000 + 1000);
    await usage(w, 'ok:juan');
    assert.equal(w.reads.usage, 2);
  });

  test('storage: fresh (right after an upload) counts again and refreshes the cache', async () => {
    const w = newWorld();
    await usage(w, 'ok:juan');
    w.shops.set('t1', { ...w.shops.get('t1')!, orders: 2000 });
    const fresh = await usage(w, 'ok:juan', { fresh: true });
    assert.equal(w.reads.usage, 2);
    const cached = await usage(w, 'ok:juan');
    assert.equal(w.reads.usage, 2);
    assert.deepEqual(cached.body, fresh.body);
  });

  test('storage: the cache never skips the check of who is asking', async () => {
    const w = newWorld();
    await usage(w, 'ok:juan');   // t1 is now cached
    assert.equal((await usage(w, 'ok:maria', { tenantId: 't1' })).status, 403);
    assert.equal((await usage(w, 'ok:cashier')).status, 403);
    assert.equal((await usage(w, undefined)).status, 401);
  });

  test('public settings: everyone gets them, read from Firestore once a minute at most', async () => {
    const w = newWorld();
    const r = await settings(w);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('cache-control') ?? '', new RegExp(`s-maxage=${SETTINGS_CACHE_SEC}`));
    assert.deepEqual(await r.json(), { saved: true, settings: w.settings });
    await settings(w);
    await settings(w);
    assert.equal(w.reads.settings, 1);
    w.now = new Date(START.getTime() + SETTINGS_CACHE_SEC * 1000 + 1000);
    await settings(w);
    assert.equal(w.reads.settings, 2);
  });

  test('public settings: never set up, and only GET', async () => {
    const w = newWorld();
    w.settings = null;
    assert.deepEqual(await (await settings(w)).json(), { saved: false, settings: null });
    assert.equal((await settings(w, 'POST')).status, 405);
  });

  test('Redis: values keep their shape, keys get the project prefix, and always expire', async () => {
    const kept = new Map<string, { value: string; ex: number }>();
    const client: RedisLike = {
      get: async k => kept.get(k)?.value ?? null,
      set: async (k, value, { EX }) => { kept.set(k, { value, ex: EX }); return 'OK'; },
      del: async k => { kept.delete(k); return 1; },
    };
    const cache = redisCache(async () => client, 'jpos:test-project');
    await cache.set('usage:t1', { orders: 3, plan: 'starter' }, 300);
    assert.deepEqual([...kept.keys()], ['jpos:test-project:usage:t1']);
    assert.equal(kept.get('jpos:test-project:usage:t1')!.ex, 300);
    assert.deepEqual(await cache.get('usage:t1'), { orders: 3, plan: 'starter' });
    await cache.del('usage:t1');
    assert.equal(await cache.get('usage:t1'), null);
  });

  test('REDIS_URL: the address alone, or the whole command copied from Redis Cloud', () => {
    const address = 'redis://default:pw@redis-1.example.com:15864';
    assert.equal(redisUrlFrom(address), address);
    assert.equal(redisUrlFrom(`redis-cli -u ${address}`), address);
    assert.equal(redisUrlFrom(`  ${address}
`), address);
    assert.equal(redisUrlFrom('rediss://default:pw@x:1'), 'rediss://default:pw@x:1');
    assert.equal(redisUrlFrom('default:pw@x:1'), null);
    assert.equal(redisUrlFrom(''), null);
    assert.equal(redisUrlFrom(undefined), null);
  });

  test('Redis down, slow or holding a broken value: no error, just no cache', async () => {
    const down = redisCache(async () => { throw new Error('ECONNREFUSED'); }, 'p');
    assert.equal(await down.get('k'), null);
    await down.set('k', 1, 60);
    await down.del('k');
    const slow = redisCache(async () => ({ get: () => new Promise<string | null>(() => {}), set: () => new Promise(() => {}), del: () => new Promise(() => {}) }), 'p', 20);
    const started = Date.now();
    assert.equal(await slow.get('k'), null);
    await slow.set('k', 1, 60);
    assert.ok(Date.now() - started < 1000);
    const broken = redisCache(async () => ({ get: async () => '{not json', set: async () => 'OK', del: async () => 1 }), 'p');
    assert.equal(await broken.get('k'), null);
  });
});

describe('Daily sales email (GET /api/cron/daily-summary)', () => {
  // 2026-10-23 08:00 in the Philippines = 00:00 UTC
  const MORNING = new Date('2026-10-23T00:00:00Z');
  const LATER = MORNING.getTime() + 10 * 86_400_000;
  const shop = (id: string, more: Partial<SummaryShop> = {}): SummaryShop => ({
    tenantId: id, name: `Shop ${id}`, plan: 'business', status: 'active', suspended: false,
    trialEndsAt: null, periodEndsAt: LATER, ownerEmail: `${id}@shop.test`, ...more,
  });
  const order = (total: number, at: string, status = 'completed', items = [{ productName: 'Latte', quantity: 2 }]) => ({ status, total, createdAt: at, items });
  const yesterday = '2026-10-22T05:00:00.000Z';   // 1 PM on Oct 22 in the Philippines
  const run = (w: World, secret?: string) => call(dailySummaryHandler(depsFor(w)), new Request('https://jpos.example.com/api/cron/daily-summary', {
    method: 'GET', headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  }));
  const world = () => {
    const w = newWorld();
    w.now = MORNING;
    w.env.CRON_SECRET = 'cron-secret';
    w.summaryShops = [
      shop('biz'),
      shop('starter', { plan: 'starter' }),
      shop('off', { dailySummary: false }),
      shop('quiet'),
      shop('expired', { periodEndsAt: MORNING.getTime() - 1000 }),
      shop('trial', { status: 'trial', plan: 'business', trialEndsAt: LATER, periodEndsAt: null }),
    ];
    for (const id of ['biz', 'starter', 'off', 'expired', 'trial']) {
      w.orders.set(id, [order(240, yesterday), order(120, yesterday, 'voided'), order(999, '2026-10-23T01:00:00.000Z')]);
    }
    w.orders.set('quiet', [order(50, '2026-10-20T05:00:00.000Z')]);
    return w;
  };

  test("yesterday in the Philippines, in UTC", () => {
    assert.deepEqual(phYesterday(MORNING), { date: '2026-10-22', startIso: '2026-10-21T16:00:00.000Z', endIso: '2026-10-22T16:00:00.000Z' });
    // Late at night PH time (still Oct 23 there): yesterday is still Oct 22
    assert.equal(phYesterday(new Date('2026-10-23T15:59:00Z')).date, '2026-10-22');
  });

  test('summary: completed sales only, voided counted apart, best sellers', () => {
    const s = summarize([order(100, yesterday), order(60.5, yesterday, 'completed', [{ productName: 'Water', quantity: 5 }]), order(80, yesterday, 'voided')]);
    assert.deepEqual(s, { sales: 160.5, orders: 2, average: 80.25, voided: 1, top: [{ name: 'Water', qty: 5 }, { name: 'Latte', qty: 2 }] });
  });

  test('only Vercel\'s scheduler can start it', async () => {
    const w = world();
    assert.equal((await run(w)).status, 401);
    assert.equal((await run(w, 'wrong')).status, 401);
    assert.equal(w.sent.length, 0);
  });

  test('without CRON_SECRET it still runs, and still only once a day per shop', async () => {
    const w = world();
    delete w.env.CRON_SECRET;
    assert.equal((await run(w)).status, 200);
    await run(w);
    assert.equal(w.sent.length, 2);
  });

  test('Business shops with sales get one email; Starter, switched off, quiet or expired shops none', async () => {
    const w = world();
    const r = await run(w, 'cron-secret');
    assert.equal(r.status, 200);
    assert.deepEqual(w.sent.map(m => m.to[0]).sort(), ['biz@shop.test', 'trial@shop.test']);
    const m = w.sent.find(x => x.to[0] === 'biz@shop.test')!;
    assert.ok(m.subject.includes('₱240.00 from 1 sale'), m.subject);
    assert.ok(m.text.includes('Voided: 1') && m.text.includes('Latte (2)'));
    assert.ok(m.html.includes('https://jpos.example.com/admin/reports'));
    assert.deepEqual(r.body, { date: '2026-10-22', sent: 2, skipped: 4, failed: 0 });
  });

  test('a second run the same morning sends nothing more', async () => {
    const w = world();
    await run(w, 'cron-secret');
    const again = await run(w, 'cron-secret');
    assert.equal(w.sent.length, 2);
    assert.equal((again.body as { sent: number }).sent, 0);
  });

  test('Gmail down: counted as failed, and a later run can still send it', async () => {
    const w = world();
    w.mailFails = true;
    assert.equal(((await run(w, 'cron-secret')).body as { failed: number }).failed, 2);
    w.mailFails = false;
    assert.equal(((await run(w, 'cron-secret')).body as { sent: number }).sent, 2);
  });

  test('who wants it', () => {
    assert.ok(wantsSummary(shop('a'), MORNING));
    assert.ok(!wantsSummary(shop('a', { emailSummary: false }), MORNING));
    assert.ok(wantsSummary(shop('a', { plan: 'starter', emailSummary: true }), MORNING));
    assert.ok(!wantsSummary(shop('a', { suspended: true }), MORNING));
    assert.ok(!wantsSummary(shop('a', { ownerEmail: 'not an email' }), MORNING));
    assert.ok(!wantsSummary(shop('a', { status: 'setup' }), MORNING));
  });
});

describe('checkCode', () => {
  const id = emailId('a@shop.test');
  const stored = (more: Partial<StoredCode> = {}): StoredCode => ({ hash: codeHash(id, '123456'), expiresAt: START.getTime() + 1000, tries: 0, ...more });
  const t = START.getTime();

  test('right, wrong, expired, out of tries, missing', () => {
    assert.deepEqual(checkCode(stored(), codeHash(id, '123456'), t), { result: { ok: true }, next: null });
    assert.deepEqual(checkCode(stored(), codeHash(id, '000000'), t).result, { ok: false, reason: 'wrong', triesLeft: CODE_TRIES - 1 });
    assert.equal(checkCode(stored(), codeHash(id, '000000'), t).next?.tries, 1);
    assert.deepEqual(checkCode(stored(), codeHash(id, '123456'), t + 1000).result, { ok: false, reason: 'expired' });
    assert.deepEqual(checkCode(stored({ tries: CODE_TRIES }), codeHash(id, '123456'), t).result, { ok: false, reason: 'locked' });
    assert.deepEqual(checkCode(undefined, codeHash(id, '123456'), t).result, { ok: false, reason: 'missing' });
  });

  test('a code is tied to its address', () => {
    assert.notEqual(codeHash(emailId('a@shop.test'), '123456'), codeHash(emailId('b@shop.test'), '123456'));
    assert.equal(emailId('A@Shop.test '), emailId('a@shop.test'));
  });

  test('codes are six digits', () => {
    for (let i = 0; i < 200; i++) assert.match(newCode(), /^\d{6}$/);
  });
});

describe('email links (appUrl)', () => {
  const pay = (w: World) => call(paymentNoticeHandler(depsFor(w)), post('email/payment', 'ok:juan', { requestId: REQ_ID }));

  test('without APP_URL: uses the Vercel production address, never the request host', async () => {
    const w = newWorld();
    w.env = { ...w.env, APP_URL: undefined, VERCEL: '1', VERCEL_PROJECT_PRODUCTION_URL: 'jpos.vercel.app' };
    await pay(w);
    assert.ok(w.sent[0].text.includes('https://jpos.vercel.app/admin/platform'));
    assert.ok(!w.sent[0].text.includes('anything.test'));
  });

  test('no address configured at all: refuses instead of guessing', async () => {
    const w = newWorld();
    w.env = { ...w.env, APP_URL: undefined, VERCEL: '1' };
    assert.equal((await pay(w)).status, 503);
    assert.equal(w.sent.length, 0);
  });

  test('a local-test setting is ignored on Vercel', async () => {
    const w = newWorld();
    w.env = { ...w.env, APP_URL: undefined, VERCEL: '1', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_PROJECT_ID: 'demo-jpos' };
    assert.equal((await pay(w)).status, 503, 'must not fall back to the request host on Vercel');
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
    assert.ok(BUDGET.verify.perDay + BUDGET.payment.perDay + BUDGET.summary.perDay < 500, "stays under Gmail's daily limit");
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
