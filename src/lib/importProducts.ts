import { DETAIL_MAX, UNITS, type Unit } from '@/lib/productDetails';
import { cellOf, normalizeName, parseNumber, textOf, roundMoney2, type Columns, type FieldDef, type Table } from '@/lib/importTable';
import type { Category, Product } from '@/types';

/**
 * Products → Import: a price list from a CSV or Excel file. New names become
 * new products; a product already in JPOS (same barcode, or same name) gets
 * the file's details. Categories that don't exist yet are made. Planning is
 * pure (tests/unit/importProducts.test.ts); importSave.ts writes it.
 */
export const PRODUCT_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Name', required: true, names: ['name', 'product', 'product name', 'item', 'item name', 'item description', 'product description', 'pangalan', 'produkto', 'title'] },
  { key: 'price', label: 'Price', required: true, names: ['price', 'selling price', 'unit price', 'srp', 'retail price', 'sale price', 'sell price', 'presyo'] },
  { key: 'cost', label: 'Cost', names: ['cost', 'cost price', 'unit cost', 'capital', 'puhunan', 'purchase price', 'buying price', 'supplier price'] },
  { key: 'category', label: 'Category', names: ['category', 'categories', 'type', 'group', 'department', 'kategorya', 'class'] },
  { key: 'stock', label: 'Stock', names: ['stock', 'stocks', 'qty', 'quantity', 'on hand', 'stock on hand', 'inventory', 'soh', 'dami'] },
  { key: 'sku', label: 'Barcode or code', names: ['barcode', 'bar code', 'sku', 'code', 'item code', 'product code', 'upc', 'ean'] },
  { key: 'unit', label: 'Unit', names: ['unit', 'uom', 'unit of measure', 'sold by'] },
  { key: 'brand', label: 'Brand', names: ['brand', 'make', 'manufacturer'] },
  { key: 'size', label: 'Size', names: ['size', 'variant', 'weight', 'volume', 'net weight'] },
  { key: 'color', label: 'Color', names: ['color', 'colour', 'kulay'] },
  { key: 'description', label: 'Description', names: ['description', 'details', 'notes', 'note'] },
];

export const PRODUCT_SAMPLE: (string | number)[][] = [
  ['Name', 'Price', 'Cost', 'Category', 'Stock', 'Barcode', 'Unit'],
  ['Coke 1.5L', 85, 70, 'Drinks', 24, '4801981118502', 'bottle'],
  ['Pandesal', 5, 3, 'Bread', 200, '', 'pc'],
  ['Rice (Dinorado)', 62, 55, 'Grocery', 50, '', 'kg'],
];

/** At most this many rows per file (bigger lists: split the file). */
export const PRODUCTS_MAX = 5000;
const NAME_MAX = 100;
const DESCRIPTION_MAX = 300;

// What people write for the units JPOS knows
const UNIT_WORDS: Record<string, Unit> = {
  pc: 'pc', pcs: 'pc', piece: 'pc', pieces: 'pc', each: 'pc', ea: 'pc', unit: 'pc', units: 'pc',
  pack: 'pack', pk: 'pack', pck: 'pack', packs: 'pack', box: 'box', bx: 'box', boxes: 'box', bag: 'bag', bags: 'bag',
  bottle: 'bottle', btl: 'bottle', bottles: 'bottle', can: 'can', cans: 'can', sachet: 'sachet', sachets: 'sachet',
  dozen: 'dozen', doz: 'dozen', dz: 'dozen', set: 'set', sets: 'set', pair: 'pair', pairs: 'pair', pr: 'pair',
  roll: 'roll', rolls: 'roll', sheet: 'sheet', sheets: 'sheet', tablet: 'tablet', tab: 'tablet', tablets: 'tablet',
  strip: 'strip', strips: 'strip', kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gm: 'g', gram: 'g', grams: 'g', l: 'L', liter: 'L', litre: 'L', liters: 'L', ml: 'mL', milliliter: 'mL',
  m: 'm', meter: 'm', metre: 'm', meters: 'm', ft: 'ft', foot: 'ft', feet: 'ft', hr: 'hr', hour: 'hr', hours: 'hr',
  session: 'session', sessions: 'session',
};

export interface ProductRow {
  line: number;
  name: string;
  price: number;
  cost?: number;
  category?: string;
  stock?: number;
  sku?: string;
  unit?: Unit | '';
  brand?: string;
  size?: string;
  color?: string;
  description?: string;
}

export interface ProductPlan {
  add: ProductRow[];
  update: { id: string; row: ProductRow }[];
  skipped: { line: number; reason: string }[];
  /** Categories to make, as written in the file. */
  newCategories: string[];
  /** Units JPOS doesn't have, left as "by the piece", and how many rows had each. */
  otherUnits: Record<string, number>;
  /** Which optional columns the file has (only those change a product already in JPOS). */
  has: Record<string, boolean>;
}

const clip = (s: string, max: number) => s.slice(0, max).trim();

export function planProducts(
  table: Table, cols: Columns,
  existing: Pick<Product, 'id' | 'name' | 'sku'>[], categories: Pick<Category, 'id' | 'name'>[],
): ProductPlan {
  const has = Object.fromEntries(PRODUCT_FIELDS.map(f => [f.key, cols[f.key] >= 0]));
  const plan: ProductPlan = { add: [], update: [], skipped: [], newCategories: [], otherUnits: {}, has };
  if (table.rows.length > PRODUCTS_MAX) throw new Error(`This file has more than ${PRODUCTS_MAX.toLocaleString()} rows. Split it into smaller files.`);
  const bySku = new Map(existing.filter(p => p.sku?.trim()).map(p => [p.sku!.trim().toLowerCase(), p.id]));
  const byName = new Map(existing.map(p => [normalizeName(p.name), p.id]));
  const knownCategories = new Set(categories.map(c => normalizeName(c.name)));
  const seen = new Set<string>();
  const updating = new Set<string>();

  table.rows.forEach((r, i) => {
    const line = table.lines[i];
    const name = clip(textOf(cellOf(r, cols, 'name')), NAME_MAX);
    if (!name) return plan.skipped.push({ line, reason: 'no name' });
    const price = parseNumber(cellOf(r, cols, 'price'));
    if (price == null) return plan.skipped.push({ line, reason: 'no price' });
    if (!(price > 0)) return plan.skipped.push({ line, reason: 'price must be above ₱0' });
    const costCell = cellOf(r, cols, 'cost');
    const cost = textOf(costCell) ? parseNumber(costCell) : undefined;
    if (cost === null || (cost !== undefined && cost < 0)) return plan.skipped.push({ line, reason: 'cost is not a number of ₱0 or more' });
    const stockCell = cellOf(r, cols, 'stock');
    const stock = textOf(stockCell) ? parseNumber(stockCell) : undefined;
    if (stock === null) return plan.skipped.push({ line, reason: 'stock is not a number' });

    const sku = clip(textOf(cellOf(r, cols, 'sku')), DETAIL_MAX.sku);
    const key = sku ? `sku:${sku.toLowerCase()}` : `name:${normalizeName(name)}`;
    if (seen.has(key)) return plan.skipped.push({ line, reason: 'listed twice in the file' });
    seen.add(key);

    const unitText = textOf(cellOf(r, cols, 'unit'));
    const unit = unitText ? (UNITS as readonly string[]).includes(unitText) ? unitText as Unit : UNIT_WORDS[unitText.toLowerCase().replace(/\.$/, '')] ?? '' : undefined;
    if (unitText && !unit) plan.otherUnits[unitText] = (plan.otherUnits[unitText] ?? 0) + 1;
    const category = clip(textOf(cellOf(r, cols, 'category')), 40);
    if (category && !knownCategories.has(normalizeName(category))) {
      knownCategories.add(normalizeName(category));
      plan.newCategories.push(category);
    }

    const row: ProductRow = {
      line, name, price: roundMoney2(price),
      ...(cost !== undefined ? { cost: roundMoney2(cost) } : {}),
      ...(category ? { category } : {}),
      ...(stock !== undefined ? { stock: Math.max(0, Math.floor(stock)) } : {}),
      ...(sku ? { sku } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...optional('brand', clip(textOf(cellOf(r, cols, 'brand')), DETAIL_MAX.brand)),
      ...optional('size', clip(textOf(cellOf(r, cols, 'size')), DETAIL_MAX.size)),
      ...optional('color', clip(textOf(cellOf(r, cols, 'color')), DETAIL_MAX.color)),
      ...optional('description', clip(textOf(cellOf(r, cols, 'description')), DESCRIPTION_MAX)),
    };
    // Same barcode, else same name; a product already being updated by another row stays as it is (this one is new)
    const id = (sku && bySku.get(sku.toLowerCase())) || byName.get(normalizeName(name));
    if (id && !updating.has(id)) {
      updating.add(id);
      plan.update.push({ id, row });
    } else plan.add.push(row);
  });
  return plan;
}

const optional = (key: string, value: string) => (value ? { [key]: value } : {});
