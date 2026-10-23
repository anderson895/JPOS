import type { Product } from '@/types';

/**
 * Inventory (Business and up): a product can keep count of its stock. Each
 * sale takes its quantity off, a voided sale puts it back, and the shop sees
 * what is running low. Pure helpers (tests/unit/inventory.test.ts).
 */

type Stocked = Pick<Product, 'trackStock' | 'stock' | 'lowStockAt'>;

/** The stock left, or null when this product doesn't keep count. */
export function stockLeft(p: Stocked): number | null {
  return p.trackStock ? Math.max(0, Math.floor(Number(p.stock) || 0)) : null;
}

export const isOut = (p: Stocked) => stockLeft(p) === 0;

/** At or under the product's alert number (default 5), but not out. */
export function isLow(p: Stocked): boolean {
  const left = stockLeft(p);
  if (left === null || left === 0) return false;
  return left <= lowStockAt(p);
}

export const DEFAULT_LOW_STOCK = 5;
export const lowStockAt = (p: Stocked) => (typeof p.lowStockAt === 'number' && p.lowStockAt >= 0 ? Math.floor(p.lowStockAt) : DEFAULT_LOW_STOCK);

/** "12 left", "Only 2 left", "Out of stock", or '' when it doesn't keep count. */
export function stockLabel(p: Stocked): string {
  const left = stockLeft(p);
  if (left === null) return '';
  if (left === 0) return 'Out of stock';
  return isLow(p) ? `Only ${left} left` : `${left} left`;
}

/** How many more of this product the cart may take (Infinity when it doesn't keep count). */
export function roomInStock(p: Stocked, inCart: number): number {
  const left = stockLeft(p);
  return left === null ? Infinity : Math.max(0, left - inCart);
}

/** Products running low or out, the emptiest first. */
export function runningLow<T extends Stocked & { name: string }>(products: T[]): T[] {
  return products
    .filter(p => p.trackStock && (isOut(p) || isLow(p)))
    .sort((a, b) => (stockLeft(a) ?? 0) - (stockLeft(b) ?? 0) || a.name.localeCompare(b.name));
}
