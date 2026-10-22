const DAY = 24 * 60 * 60 * 1000;

/** How often one account may make the server send an email of one kind. */
export interface Limit {
  /** Minimum wait between two emails (0 = none). */
  cooldownMs: number;
  /** Most emails per window. */
  max: number;
  windowMs: number;
}

export interface QuotaState {
  windowStart: number;
  count: number;
  lastSentAt: number;
}

export type QuotaCheck =
  | { ok: true; next: QuotaState }
  | { ok: false; reason: 'cooldown' | 'limit'; retryAfterSec: number };

/** "Send the email again": once a minute, 5 a day per account. */
export const VERIFY_LIMIT: Limit = { cooldownMs: 60_000, max: 5, windowMs: DAY };
/** New-payment emails to the Super Admin: 10 a day per account. */
export const PAYMENT_LIMIT: Limit = { cooldownMs: 0, max: 10, windowMs: DAY };
/** Every email the server sends in a day. Gmail allows about 500; stay well under it. */
export const DAILY_TOTAL = 400;

/** The UTC day an email counts toward, e.g. "2026-10-23". */
export const dayKey = (now: Date) => now.toISOString().slice(0, 10);

export function checkQuota(prev: Partial<QuotaState> | undefined, now: number, limit: Limit): QuotaCheck {
  const start = typeof prev?.windowStart === 'number' ? prev.windowStart : null;
  // A new window after it runs out (or if the stored time is in the future)
  const fresh = start === null || now - start >= limit.windowMs || now < start;
  const windowStart = fresh ? now : start;
  const count = fresh ? 0 : Number(prev?.count ?? 0);
  const last = typeof prev?.lastSentAt === 'number' ? prev.lastSentAt : 0;

  if (limit.cooldownMs > 0 && now >= last && now - last < limit.cooldownMs) {
    return { ok: false, reason: 'cooldown', retryAfterSec: Math.ceil((limit.cooldownMs - (now - last)) / 1000) };
  }
  if (count >= limit.max) {
    return { ok: false, reason: 'limit', retryAfterSec: Math.ceil((windowStart + limit.windowMs - now) / 1000) };
  }
  return { ok: true, next: { windowStart, count: count + 1, lastSentAt: now } };
}
