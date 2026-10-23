import { createHash } from 'node:crypto';
import { ApiError, handle, json, readJsonBody, requireMethod } from './http.js';
import { defaultDeps, isLocalTest, notSetUp, type Deps, type Mailer } from './deps.js';
import { emailChangeCodeMessage, paymentNoticeMessage, signupCodeMessage, type Message } from './mail.js';
import { CODE_TTL_MS, codeHash, emailId, type CodeCheck } from './signupCode.js';
import type { Reserve } from './store.js';

type GetDeps = () => Deps;

const EMAIL = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

/** `Authorization: Bearer <Firebase ID token>` → the caller's uid. */
async function verifyCaller(request: Request, deps: Deps): Promise<string> {
  return (await verifyCallerSession(request, deps)).uid;
}

/** The caller, and when they last typed their password (seconds since 1970). */
async function verifyCallerSession(request: Request, deps: Deps): Promise<{ uid: string; authTime?: number }> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new ApiError(401, 'unauthenticated', 'Sign in again, then try once more.');
  try {
    return await deps.auth.verifyIdToken(match[1]);
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && code.startsWith('auth/') && code !== 'auth/internal-error') {
      throw new ApiError(401, 'unauthenticated', 'Your session has expired. Sign in again.');
    }
    throw new ApiError(503, 'auth_unavailable', "Couldn't check your sign-in right now. Try again in a moment.");
  }
}

/**
 * Where links in emails point. A fixed address (APP_URL, or Vercel's own
 * production address), never one taken from the request, so nobody can make
 * an email link to another site. Only the local dev server links back to itself.
 */
export function appUrl(deps: Deps, request: Request): string {
  const { env } = deps;
  const fixed = env.APP_URL?.trim() || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL.trim()}` : '');
  if (fixed) {
    if (!/^https?:\/\/[^\s/]+/.test(fixed)) throw notSetUp(`APP_URL is not a web address: ${fixed.slice(0, 60)}`);
    return fixed.replace(/\/+$/, '');
  }
  if (env.JPOS_DEV_API === '1' || isLocalTest(env)) return new URL(request.url).origin;
  throw notSetUp('the app address is unknown: set APP_URL (e.g. https://jpos-mu.vercel.app)');
}

/** Who gets the new-payment emails: NOTIFY_EMAIL (comma-separated), else the Gmail account itself. */
export function recipients(deps: Deps): string[] {
  const list = deps.env.NOTIFY_EMAIL?.trim() || deps.env.GMAIL_USER?.trim() || '';
  return list.split(',').map(s => s.trim()).filter(s => EMAIL.test(s));
}

/**
 * The caller's network (Vercel sets these headers itself), hashed so no IP
 * address is stored. Null on this computer, where there's no such header.
 */
function networkId(request: Request): string | null {
  const ip = request.headers.get('x-real-ip')?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return ip ? `vip_${createHash('sha256').update(ip).digest('hex').slice(0, 32)}` : null;
}

function limitError(r: Exclude<Reserve, { ok: true }>): ApiError {
  if (r.reason === 'cooldown') return new ApiError(429, 'too_soon', 'Please wait a minute before sending another email.');
  if (r.reason === 'limit') return new ApiError(429, 'too_many', "That's a lot of emails for today. Try again tomorrow, or contact us.");
  return new ApiError(503, 'email_busy', 'Email is busy right now. Please try again later, or contact us.');
}

async function send(mailer: Mailer, to: string[], message: Message): Promise<void> {
  try {
    await mailer.send(to, message);
  } catch (err) {
    // Gmail's own error text (never the password) helps when checking the server logs
    console.error('[api] email not sent:', err instanceof Error ? err.message : err);
    throw new ApiError(502, 'email_failed', "We couldn't send the email right now. Try again in a minute, or contact us.");
  }
}

/** The email from a request, trimmed and lowercased; a 400 when it isn't one. */
function readEmail(body: Record<string, unknown>): string {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) throw new ApiError(400, 'invalid_email', 'Enter a valid email address.', 'email');
  return email;
}

/**
 * Can a new owner sign up with this email? Returns the uid of a login to
 * replace, if any: one an older sign-up left behind (never confirmed, password
 * only, no shop). Any other login with this email means it's taken.
 */
async function freeEmail(deps: Deps, email: string): Promise<string | null> {
  const existing = await deps.auth.getUserByEmail(email);
  if (!existing) return null;
  const leftover = !existing.emailVerified && !existing.disabled
    && existing.providers.every(p => p === 'password')
    && !(await deps.store.accountInUse(existing.uid));
  if (!leftover) throw new ApiError(409, 'email_taken', 'This email already has an account. Sign in instead.', 'email');
  return existing.uid;
}

const CODE_ERRORS: Record<Exclude<CodeCheck, { ok: true }>['reason'], [number, string, string]> = {
  missing: [400, 'code_missing', "This code doesn't work anymore. Send a new code."],
  expired: [400, 'code_expired', 'This code has expired. Send a new code.'],
  locked: [429, 'code_locked', 'Too many wrong tries. Send a new code.'],
  wrong: [400, 'code_wrong', "That code isn't right."],
};

function codeError(check: Exclude<CodeCheck, { ok: true }>): ApiError {
  const [status, code, message] = CODE_ERRORS[check.reason];
  const left = check.reason === 'wrong' ? ` ${check.triesLeft} ${check.triesLeft === 1 ? 'try' : 'tries'} left.` : '';
  return new ApiError(status, code, message + left, 'code');
}

/**
 * POST /api/signup/code { email }: emails a new shop owner a 6-digit code.
 * No account is made yet: that waits until the code comes back (signup/finish).
 * Limited per address, per network and per day, so it can't be used for spam.
 */
export function signupCodeHandler(getDeps: GetDeps = defaultDeps) {
  return handle(async (request) => {
    requireMethod(request, 'POST');
    const deps = getDeps();
    const email = readEmail(await readJsonBody(request));
    await freeEmail(deps, email);

    const mailer = deps.mailer(); // fails before anything is counted if Gmail isn't set up
    const id = emailId(email);
    const ipId = networkId(request);
    const reservedAt = deps.now();
    const quota = await deps.store.reserveVerifyEmail(id, ipId, reservedAt);
    if (!quota.ok) throw limitError(quota);

    try {
      const code = deps.newCode();
      await deps.store.saveSignupCode(id, { hash: codeHash(id, code), expiresAt: reservedAt.getTime() + CODE_TTL_MS, tries: 0 });
      await send(mailer, [email], signupCodeMessage({ code }));
    } catch (err) {
      // Nothing went out: don't count it against the owner
      await deps.store.releaseVerifyEmail(id, ipId, reservedAt).catch(() => { /* best effort */ });
      throw err;
    }
    return json({ sent: true });
  });
}

/**
 * POST /api/signup/finish { email, code, password, name }: a right code makes
 * the owner's login, with the email already confirmed. The app then signs in
 * with the same password and creates the shop.
 */
export function signupFinishHandler(getDeps: GetDeps = defaultDeps) {
  return handle(async (request) => {
    requireMethod(request, 'POST');
    const deps = getDeps();
    const body = await readJsonBody(request);
    const email = readEmail(body);
    const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '';
    if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'invalid_code', 'Enter the 6-digit code from the email.', 'code');
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < 6 || password.length > 100) {
      throw new ApiError(400, 'weak_password', 'Use a password with at least 6 characters.', 'password');
    }
    const name = typeof body.name === 'string' ? body.name.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60) : '';

    // Checked before the code, so a taken email doesn't use up a try
    const leftover = await freeEmail(deps, email);
    const id = emailId(email);
    const check = await deps.store.checkSignupCode(id, codeHash(id, code), deps.now());
    if (!check.ok) throw codeError(check);

    try {
      if (leftover) await deps.auth.deleteUser(leftover);
      await deps.auth.createUser({ email, password, displayName: name });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error('[api] account not created:', err instanceof Error ? err.message : err);
      throw new ApiError(503, 'signup_failed', "We couldn't create your account right now. Send a new code and try again.");
    }
    return json({ created: true });
  });
}

/** Changing the sign-in email needs the password typed again within the last few minutes. */
export const RECENT_SIGN_IN_MS = 5 * 60 * 1000;

/** The code for an email change is kept per account, and only works for that one new address. */
const changeId = (uid: string) => `chg_${uid}`;
const changeKey = (uid: string, email: string) => `chg_${uid}_${emailId(email)}`;

/** Only the Super Admin can change their sign-in email here (shop staff emails belong to their shop). */
async function requireSuperAdmin(deps: Deps, uid: string) {
  if (!(await deps.store.isPlatformAdmin(uid))) {
    throw new ApiError(403, 'forbidden', 'Only the JPOS owner can change the sign-in email here.');
  }
}

/** The new address must differ and be free (a never-confirmed leftover login may be replaced). */
async function checkNewEmail(deps: Deps, uid: string, email: string): Promise<string | null> {
  const me = await deps.auth.getUser(uid).catch(() => {
    throw new ApiError(401, 'unauthenticated', 'Sign in again, then try once more.');
  });
  if (me.disabled) throw new ApiError(403, 'forbidden', 'This account is turned off.');
  if (!me.providers.includes('password')) {
    throw new ApiError(400, 'no_password', 'This account signs in with Google only, so its email follows the Google account.');
  }
  if ((me.email ?? '').toLowerCase() === email) throw new ApiError(400, 'same_email', "That's already your sign-in email.", 'email');
  const other = await deps.auth.getUserByEmail(email);
  if (other && other.uid === uid) throw new ApiError(400, 'same_email', "That's already your sign-in email.", 'email');
  try {
    return await freeEmail(deps, email);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'email_taken') {
      throw new ApiError(409, 'email_taken', 'This email already has an account. Use another one.', 'email');
    }
    throw err;
  }
}

/**
 * POST /api/account/email-code { email }: the Super Admin wants a new sign-in
 * email. Needs a password typed within the last 5 minutes; emails a 6-digit
 * code to the NEW address (proof it's theirs). Nothing changes yet.
 */
export function emailChangeCodeHandler(getDeps: GetDeps = defaultDeps) {
  return handle(async (request) => {
    requireMethod(request, 'POST');
    const deps = getDeps();
    const { uid, authTime } = await verifyCallerSession(request, deps);
    await requireSuperAdmin(deps, uid);
    if (!authTime || deps.now().getTime() - authTime * 1000 > RECENT_SIGN_IN_MS) {
      throw new ApiError(401, 'reauth_needed', 'Type your password again, then try once more.');
    }
    const email = readEmail(await readJsonBody(request));
    await checkNewEmail(deps, uid, email);

    const mailer = deps.mailer(); // fails before anything is counted if Gmail isn't set up
    const ipId = networkId(request);
    const reservedAt = deps.now();
    const quota = await deps.store.reserveVerifyEmail(emailId(email), ipId, reservedAt);
    if (!quota.ok) throw limitError(quota);

    try {
      const code = deps.newCode();
      await deps.store.saveSignupCode(changeId(uid), { hash: codeHash(changeKey(uid, email), code), expiresAt: reservedAt.getTime() + CODE_TTL_MS, tries: 0 });
      await send(mailer, [email], emailChangeCodeMessage({ code }));
    } catch (err) {
      await deps.store.releaseVerifyEmail(emailId(email), ipId, reservedAt).catch(() => { /* best effort */ });
      throw err;
    }
    return json({ sent: true });
  });
}

/**
 * POST /api/account/email-finish { email, code }: a right code (sent to that
 * new address, for this account) changes the sign-in email, confirmed, and the
 * email in the JPOS profile. The app then signs in again with the new email.
 */
export function emailChangeFinishHandler(getDeps: GetDeps = defaultDeps) {
  return handle(async (request) => {
    requireMethod(request, 'POST');
    const deps = getDeps();
    const uid = await verifyCaller(request, deps);
    await requireSuperAdmin(deps, uid);
    const body = await readJsonBody(request);
    const email = readEmail(body);
    const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '';
    if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'invalid_code', 'Enter the 6-digit code from the email.', 'code');

    // Checked before the code, so a taken email doesn't use up a try
    const leftover = await checkNewEmail(deps, uid, email);
    const check = await deps.store.checkSignupCode(changeId(uid), codeHash(changeKey(uid, email), code), deps.now());
    if (!check.ok) throw codeError(check);

    try {
      if (leftover) await deps.auth.deleteUser(leftover);
      await deps.auth.updateEmail(uid, email);
      await deps.store.setProfileEmail(uid, email);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      console.error('[api] email not changed:', err instanceof Error ? err.message : err);
      throw new ApiError(503, 'change_failed', "We couldn't change your email right now. Send a new code and try again.");
    }
    return json({ changed: true });
  });
}

/**
 * POST /api/email/payment { requestId }: emails the Super Admin about a
 * payment the caller just sent. Only the shop owner who sent it can ask, only
 * while it waits for review, and only once per payment.
 */
export function paymentNoticeHandler(getDeps: GetDeps = defaultDeps) {
  return handle(async (request) => {
    requireMethod(request, 'POST');
    const deps = getDeps();
    const uid = await verifyCaller(request, deps);
    const body = await readJsonBody(request);
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    if (!/^[A-Za-z0-9]{10,40}$/.test(requestId)) {
      throw new ApiError(400, 'invalid_request', 'Which payment? The request id is missing.', 'requestId');
    }

    const payment = await deps.store.getPaymentRequest(requestId);
    if (!payment) throw new ApiError(404, 'not_found', "We couldn't find that payment.");
    if (payment.uid !== uid) throw new ApiError(403, 'forbidden', 'This payment was sent by another account.');
    if (payment.status !== 'pending') return json({ sent: false, reason: 'not_pending' });

    const to = recipients(deps);
    if (!to.length) throw notSetUp('no one to email: set NOTIFY_EMAIL or GMAIL_USER');
    const base = appUrl(deps, request);
    const mailer = deps.mailer();
    const reservedAt = deps.now();
    const quota = await deps.store.reservePaymentNotice(requestId, uid, reservedAt);
    if (!quota.ok) {
      if (quota.reason === 'duplicate') return json({ sent: false, duplicate: true });
      throw limitError(quota);
    }

    try {
      const cloudName = deps.env.CLOUDINARY_CLOUD_NAME || deps.env.VITE_CLOUDINARY_CLOUD_NAME;
      await send(mailer, to, paymentNoticeMessage(payment, `${base}/admin/platform`, cloudName));
    } catch (err) {
      // Not sent: let a later try send it
      await deps.store.releasePaymentNotice(requestId, uid, reservedAt).catch(() => { /* best effort */ });
      throw err;
    }
    return json({ sent: true });
  });
}
