import { createHash } from 'node:crypto';
import { ApiError, handle, json, readJsonBody, requireMethod } from './http.js';
import { defaultDeps, isLocalTest, notSetUp, type Deps, type Mailer } from './deps.js';
import { paymentNoticeMessage, verifyEmailMessage, type Message } from './mail.js';
import type { Reserve } from './store.js';

type GetDeps = () => Deps;

const EMAIL = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;

/** `Authorization: Bearer <Firebase ID token>` → the caller's uid. */
async function verifyCaller(request: Request, deps: Deps): Promise<string> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) throw new ApiError(401, 'unauthenticated', 'Sign in again, then try once more.');
  try {
    return (await deps.auth.verifyIdToken(match[1])).uid;
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
    if (!/^https?:\/\/[^\s/]+/.test(fixed)) throw notSetUp();
    return fixed.replace(/\/+$/, '');
  }
  if (env.JPOS_DEV_API === '1' || isLocalTest(env)) return new URL(request.url).origin;
  throw notSetUp();
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

/**
 * POST /api/email/verify: emails the signed-in owner a link to confirm their
 * email. Always to the account's own address (never one from the request),
 * and limited per account and per day so it can't be used to send spam.
 */
export function verifyEmailHandler(getDeps: GetDeps = defaultDeps) {
  return handle(async (request) => {
    requireMethod(request, 'POST');
    const deps = getDeps();
    const uid = await verifyCaller(request, deps);
    const user = await deps.auth.getUser(uid).catch(() => {
      throw new ApiError(401, 'unauthenticated', 'Sign in again, then try once more.');
    });
    if (user.disabled) throw new ApiError(403, 'forbidden', 'This account is turned off.');
    if (!user.email) throw new ApiError(400, 'no_email', 'This account has no email address.');
    if (user.emailVerified) return json({ sent: false, alreadyVerified: true });

    const base = appUrl(deps, request);
    const mailer = deps.mailer(); // fails before anything is counted if Gmail isn't set up
    const ipId = networkId(request);
    const reservedAt = deps.now();
    const quota = await deps.store.reserveVerifyEmail(uid, ipId, reservedAt);
    if (!quota.ok) throw limitError(quota);

    try {
      // Firebase makes the one-time code; the link opens JPOS's own confirm page
      const firebaseLink = await deps.auth.generateEmailVerificationLink(user.email);
      const oobCode = new URL(firebaseLink).searchParams.get('oobCode');
      if (!oobCode) throw new Error('The verification link has no code');
      const link = `${base}/verify-email?oobCode=${encodeURIComponent(oobCode)}`;
      await send(mailer, [user.email], verifyEmailMessage({ link }));
    } catch (err) {
      // Nothing went out: don't count it against the owner
      await deps.store.releaseVerifyEmail(uid, ipId, reservedAt).catch(() => { /* best effort */ });
      throw err;
    }
    return json({ sent: true });
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
    if (!to.length) throw notSetUp();
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
