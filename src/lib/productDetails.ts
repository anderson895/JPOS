import type { BusinessType, Product } from '@/types';

/**
 * Product details beyond name and price: brand, size, color, how it's sold
 * (unit) and its barcode. Which ones the product form shows first depends on
 * what the store sells; the rest are under "More details".
 */
export type DetailField = 'brand' | 'size' | 'color' | 'unit' | 'sku';

export const DETAIL_FIELDS: DetailField[] = ['brand', 'size', 'color', 'unit', 'sku'];

export const DETAIL_LABEL: Record<DetailField, string> = {
  brand: 'Brand',
  size: 'Size',
  color: 'Color',
  unit: 'Sold by',
  sku: 'Barcode or code',
};

/** The details each kind of store fills in first. */
const MAIN_FIELDS: Record<BusinessType, DetailField[]> = {
  food: ['size'],
  grocery: ['brand', 'size', 'unit', 'sku'],
  clothing: ['brand', 'size', 'color', 'sku'],
  hardware: ['brand', 'size', 'unit', 'sku'],
  pharmacy: ['brand', 'size', 'unit', 'sku'],
  gadgets: ['brand', 'color', 'sku'],
  services: ['unit'],
  other: ['brand', 'size', 'unit', 'sku'],
};

export function mainDetailFields(type: BusinessType | null | undefined): DetailField[] {
  return type ? MAIN_FIELDS[type] : [];
}

/** An example for the Size box that fits the store. */
const SIZE_EXAMPLE: Record<BusinessType, string> = {
  food: 'e.g. 16 oz or Large',
  grocery: 'e.g. 500 mL',
  clothing: 'e.g. Medium or 9',
  hardware: 'e.g. 1/2 inch',
  pharmacy: 'e.g. 500 mg',
  gadgets: 'e.g. 128 GB',
  services: 'e.g. Short hair',
  other: 'e.g. Large',
};
export const sizeExample = (type: BusinessType | null | undefined) => (type ? SIZE_EXAMPLE[type] : 'e.g. Large');

/** How an item is sold: the receipt shows "×2 kg", "×3 pack". '' = by the piece, shown as nothing. */
export const UNITS = [
  'pc', 'pack', 'box', 'bag', 'bottle', 'can', 'sachet', 'dozen', 'set', 'pair', 'roll', 'sheet',
  'tablet', 'strip', 'kg', 'g', 'L', 'mL', 'm', 'ft', 'hr', 'session',
] as const;
export type Unit = (typeof UNITS)[number];

export const UNIT_LABEL: Record<Unit, string> = {
  pc: 'Piece', pack: 'Pack', box: 'Box', bag: 'Bag', bottle: 'Bottle', can: 'Can', sachet: 'Sachet',
  dozen: 'Dozen', set: 'Set', pair: 'Pair', roll: 'Roll', sheet: 'Sheet', tablet: 'Tablet', strip: 'Strip',
  kg: 'Kilo (kg)', g: 'Gram (g)', L: 'Liter (L)', mL: 'Milliliter (mL)', m: 'Meter (m)', ft: 'Foot (ft)',
  hr: 'Hour', session: 'Session',
};

export const DETAIL_MAX = { brand: 40, size: 30, color: 30, sku: 40 } as const;

/** "Nestlé · 300 g · Red": what tells this product apart, in one short line ('' if none). */
export function productDetails(p: Pick<Product, 'brand' | 'size' | 'color'>): string {
  return [p.brand, p.size, p.color].map(v => v?.trim()).filter(Boolean).join(' · ');
}

/** Barcode scanners type the code and press Enter: the one product with exactly that code. */
export function findByCode<T extends Pick<Product, 'sku'>>(products: T[], code: string): T | null {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  const hits = products.filter(p => p.sku?.trim().toLowerCase() === c);
  return hits.length === 1 ? hits[0] : null;
}

/** Search by name, brand, size, color or code. */
export function matchesSearch(p: Pick<Product, 'name' | 'brand' | 'size' | 'color' | 'sku'>, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.brand, p.size, p.color, p.sku].some(v => v?.toLowerCase().includes(q));
}
