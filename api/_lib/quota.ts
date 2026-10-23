const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How often one account (or one network) may make the server send an email of one kind. */
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

export type MailKind = 'verify' | 'payment' | 'summary';

/** "Send the email again": once a minute, 5 a day per account. */
export const VERIFY_LIMIT: Limit = { cooldownMs: 60_000, max: 5, windowMs: DAY };
/** Confirmation emails from one network (IP address): 10 a day, so throwaway accounts don't help. */
export const VERIFY_IP_LIMIT: Limit = { cooldownMs: 0, max: 10, windowMs: DAY };
/** New-payment emails to the Super Admin: 10 a day per account. */
export const PAYMENT_LIMIT: Limit = { cooldownMs: 0, max: 10, windowMs: DAY };
/** The daily sales email: one a day per shop. */
export const SUMMARY_LIMIT: Limit = { cooldownMs: 0, max: 1, windowMs: 20 * HOUR };

/**
 * Everything the server may send, per kind, over any 24 hours and in one hour.
 * Gmail allows about 500 a day; together these stay well under it. Each kind
 * has its own share, so a flood of sign-ups can never stop the payment emails.
 */
export const BUDGET: Record<MailKind, { perDay: number; perHour: number }> = {
  verify: { perDay: 300, perHour: 40 },
  payment: { perDay: 100, perHour: 30 },
  // All sent together in the morning, so the hour's share is the day's
  summary: { perDay: 80, perHour: 80 },
};

/** The UTC hour an email counts toward, e.g. "2026-10-23T08". */
export const hourKey = (now: Date) => now.toISOString().slice(0, 13);
/** This hour and the 23 before it: a rolling 24 hours, like Gmail counts. */
export const last24Hours = (now: Date) => Array.from({ length: 24 }, (_, i) => hourKey(new Date(now.getTime() - i * HOUR)));

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

/** Is there room in this kind's share? `hourCounts[0]` is the current hour. */
export function withinBudget(kind: MailKind, hourCounts: number[]): boolean {
  const { perDay, perHour } = BUDGET[kind];
  const day = hourCounts.reduce((sum, n) => sum + n, 0);
  return (hourCounts[0] ?? 0) < perHour && day < perDay;
}
