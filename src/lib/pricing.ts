import { roundMoney } from '@/lib/utils';

/**
 * The money of a sale: item discounts, a discount on the whole order, the
 * Senior citizen / PWD discount, and the VAT on the receipt. Pure, so it's unit
 * tested (tests/unit/pricing.test.ts).
 *
 * Prices are what the customer pays, VAT included (VAT-registered stores).
 *
 * Senior citizen / PWD (RA 9994, RA 10754): the sale is VAT-exempt, so the 12%
 * VAT comes off first, then 20% off that. It replaces every other discount
 * (no double discounts). In a store that isn't VAT-registered there's no VAT
 * to take off, so it's 20% off the price.
 */

export const VAT_RATE = 0.12;
export const SENIOR_RATE = 0.2;

export type DiscountKind = 'percent' | 'fixed';

/** A discount picked at the POS: one of the store's saved ones, or typed in. */
export interface DiscountPick {
  /** On the receipt: "Employee 10%", "Promo ₱50", "Discount". */
  name: string;
  kind: DiscountKind;
  /** Percent (0–100) or pesos. */
  value: number;
  /** Set when it's one of the store's saved discounts. */
  savedId?: string;
}

export type SeniorType = 'senior' | 'pwd';
export interface SeniorInfo {
  type: SeniorType;
  /** OSCA / PWD ID number, printed on the receipt. */
  idNumber: string;
  name: string;
}
export const SENIOR_LABEL: Record<SeniorType, string> = { senior: 'Senior citizen', pwd: 'PWD' };

export interface PriceLine {
  price: number;
  quantity: number;
  discount?: DiscountPick | null;
}

export interface PriceInput {
  lines: PriceLine[];
  orderDiscount?: DiscountPick | null;
  senior?: SeniorInfo | null;
  vatRegistered: boolean;
}

export interface LineResult {
  /** price × quantity */
  gross: number;
  /** Pesos off this line (0 with Senior/PWD: it replaces item discounts). */
  discount: number;
  net: number;
}

export interface VatBreakdown {
  /** Sales the 12% VAT is in, without the VAT. */
  vatable: number;
  vat: number;
  /** VAT-exempt sales (Senior/PWD). */
  exempt: number;
}

export interface PriceResult {
  lines: LineResult[];
  /** Σ gross */
  subtotal: number;
  itemDiscounts: number;
  orderDiscount: number;
  seniorDiscount: number;
  /** The VAT taken off for a Senior/PWD sale (VAT-registered stores). */
  lessVat: number;
  /** Every peso given away as a discount (items + order + Senior/PWD), not the VAT taken off. */
  discount: number;
  /** subtotal − discount − lessVat */
  total: number;
  /** VAT-registered stores only. */
  vat: VatBreakdown | null;
}

/** Pesos off `base`: a percent of it, or a peso amount; never negative, never more than `base`. */
export function amountOff(d: Pick<DiscountPick, 'kind' | 'value'> | null | undefined, base: number): number {
  if (!d || !(base > 0)) return 0;
  const value = Number(d.value) || 0;
  const raw = d.kind === 'percent' ? (base * Math.min(Math.max(value, 0), 100)) / 100 : value;
  return roundMoney(Math.min(Math.max(raw, 0), base));
}

/** A discount's short name: "10%" or "₱50". */
export function discountValueLabel(d: Pick<DiscountPick, 'kind' | 'value'>): string {
  return d.kind === 'percent' ? `${Number(d.value)}%` : `₱${Number(d.value).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

export function price(input: PriceInput): PriceResult {
  const gross = input.lines.map(l => roundMoney((Number(l.price) || 0) * (Number(l.quantity) || 0)));
  const subtotal = roundMoney(gross.reduce((s, g) => s + g, 0));

  if (input.senior) {
    // VAT off first (VAT-registered stores), then 20% of what's left
    const exempt = input.vatRegistered ? roundMoney(subtotal / (1 + VAT_RATE)) : subtotal;
    const lessVat = roundMoney(subtotal - exempt);
    const seniorDiscount = roundMoney(exempt * SENIOR_RATE);
    const total = roundMoney(exempt - seniorDiscount);
    return {
      lines: gross.map(g => ({ gross: g, discount: 0, net: g })),
      subtotal, itemDiscounts: 0, orderDiscount: 0, seniorDiscount, lessVat,
      discount: seniorDiscount, total,
      vat: input.vatRegistered ? { vatable: 0, vat: 0, exempt } : null,
    };
  }

  const lines = input.lines.map((l, i) => {
    const discount = amountOff(l.discount, gross[i]);
    return { gross: gross[i], discount, net: roundMoney(gross[i] - discount) };
  });
  const itemDiscounts = roundMoney(lines.reduce((s, l) => s + l.discount, 0));
  const afterItems = roundMoney(subtotal - itemDiscounts);
  const orderDiscount = amountOff(input.orderDiscount, afterItems);
  const total = roundMoney(afterItems - orderDiscount);
  let vat: VatBreakdown | null = null;
  if (input.vatRegistered) {
    const vatable = roundMoney(total / (1 + VAT_RATE));
    vat = { vatable, vat: roundMoney(total - vatable), exempt: 0 };
  }
  return {
    lines, subtotal, itemDiscounts, orderDiscount, seniorDiscount: 0, lessVat: 0,
    discount: roundMoney(itemDiscounts + orderDiscount), total, vat,
  };
}

// ── The store's saved discounts (tenants/{T}/discounts) ────────────────────
export const DISCOUNT_NAME_MAX = 40;
export const FIXED_MAX = 100_000;

/** Why this saved discount can't be saved (plain words), or null. Same limits as firestore.rules. */
export function savedDiscountProblem(d: { name: string; kind: DiscountKind; value: number }): string | null {
  const name = d.name.trim();
  if (!name) return 'Give the discount a name.';
  if (name.length > DISCOUNT_NAME_MAX) return `Keep the name to ${DISCOUNT_NAME_MAX} letters or fewer.`;
  const v = Number(d.value);
  if (!(v > 0)) return 'Enter an amount above 0.';
  if (d.kind === 'percent' && v > 100) return "A percent discount can't be more than 100%.";
  if (d.kind === 'fixed' && v > FIXED_MAX) return 'That amount is too big.';
  return null;
}

/** Why the Senior/PWD details aren't complete (plain words), or null. */
export function seniorProblem(s: Pick<SeniorInfo, 'idNumber' | 'name'>): string | null {
  if (!s.idNumber.trim()) return 'Enter the ID number.';
  if (s.idNumber.trim().length > 30) return 'The ID number is too long.';
  if (!s.name.trim()) return 'Enter the name on the ID.';
  if (s.name.trim().length > 60) return 'The name is too long.';
  return null;
}
