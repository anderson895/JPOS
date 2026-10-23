/**
 * The daily sales email (Business and up): yesterday in the Philippines, in
 * numbers. Pure, so it's unit-tested (api/_tests/email.test.ts).
 */

const HOUR = 60 * 60 * 1000;
/** Philippine time is UTC+8 all year (no daylight saving). */
const PH_OFFSET = 8 * HOUR;

/** Yesterday in the Philippines: its date and its start and end as UTC ISO strings. */
export function phYesterday(now: Date): { date: string; startIso: string; endIso: string } {
  const ph = new Date(now.getTime() + PH_OFFSET);
  const todayStartUtc = Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), ph.getUTCDate()) - PH_OFFSET;
  const start = new Date(todayStartUtc - 24 * HOUR);
  const end = new Date(todayStartUtc);
  return { date: new Date(start.getTime() + PH_OFFSET).toISOString().slice(0, 10), startIso: start.toISOString(), endIso: end.toISOString() };
}

export interface OrderLite {
  status: string;
  total: number;
  items?: { productName?: string; quantity?: number }[];
}

export interface DaySummary {
  sales: number;
  orders: number;
  average: number;
  voided: number;
  /** The best sellers by quantity (up to 3). */
  top: { name: string; qty: number }[];
}

const money = (n: number) => Math.round(n * 100) / 100;

export function summarize(orders: OrderLite[]): DaySummary {
  const done = orders.filter(o => o.status === 'completed');
  const sales = money(done.reduce((s, o) => s + (Number(o.total) || 0), 0));
  const qty = new Map<string, number>();
  for (const o of done) for (const i of o.items ?? []) {
    const name = String(i.productName ?? '').trim();
    if (name) qty.set(name, (qty.get(name) ?? 0) + (Number(i.quantity) || 0));
  }
  const top = [...qty.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([name, q]) => ({ name, qty: q }));
  return {
    sales,
    orders: done.length,
    average: done.length ? money(sales / done.length) : 0,
    voided: orders.filter(o => o.status === 'voided').length,
    top,
  };
}

/** A shop the morning email may go to (store.summaryShops). */
export interface SummaryShop {
  tenantId: string;
  name: string;
  plan: string;
  status: string;
  suspended: boolean;
  /** ms; null when not set */
  trialEndsAt: number | null;
  periodEndsAt: number | null;
  /** The package flag; missing on packages saved before it: Business and up. */
  emailSummary?: boolean;
  /** The shop's own switch (Store Settings); missing = on. */
  dailySummary?: boolean;
  ownerEmail: string;
}

/** Business and up, switched on, and the shop can sell today. */
export function wantsSummary(s: SummaryShop, now: Date): boolean {
  if (s.suspended || s.dailySummary === false) return false;
  const has = typeof s.emailSummary === 'boolean' ? s.emailSummary : s.plan !== 'starter';
  if (!has || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.ownerEmail)) return false;
  const t = now.getTime();
  if (s.status === 'trial') return s.trialEndsAt != null && t < s.trialEndsAt;
  if (s.status === 'active') return s.periodEndsAt != null && t < s.periodEndsAt;
  return false;
}
