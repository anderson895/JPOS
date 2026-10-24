import { doc, documentId, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { tenantCol, tenantDoc } from '@/lib/tenant';
import { DEFAULT_LOW_STOCK } from '@/lib/inventory';
import { normalizeName } from '@/lib/importTable';
import type { ProductPlan, ProductRow } from '@/lib/importProducts';
import type { SalesPlan } from '@/lib/importSales';
import type { Category } from '@/types';

/** Saving an import (products, past sales). The plans come from importProducts.ts / importSales.ts. */
const BATCH = 400;

/**
 * Writes the plan: new categories first, then products, 400 per batch
 * (`onProgress` after each). A product already in JPOS only gets the columns
 * the file has. Stock is kept only by packages with inventory.
 */
export async function applyProducts(
  plan: ProductPlan, categories: Pick<Category, 'id' | 'name'>[],
  opts: { canInventory: boolean; onProgress?: (done: number, total: number) => void },
): Promise<{ added: number; updated: number; newCategories: number }> {
  const now = new Date().toISOString();
  const catId = new Map(categories.map(c => [normalizeName(c.name), { id: c.id, name: c.name }]));
  if (plan.newCategories.length) {
    const batch = writeBatch(db);
    for (const name of plan.newCategories) {
      const ref = doc(tenantCol('categories'));
      batch.set(ref, { name, color: '#c46820', icon: 'coffee', createdAt: now });
      catId.set(normalizeName(name), { id: ref.id, name });
    }
    await batch.commit();
  }
  const category = (name?: string) => (name ? catId.get(normalizeName(name)) : undefined);
  const stockFields = (row: ProductRow, isNew: boolean) => (opts.canInventory
    ? {
      ...(row.stock !== undefined ? { trackStock: true, stock: row.stock } : {}),
      ...(row.lowStockAt !== undefined ? { lowStockAt: row.lowStockAt } : isNew && row.stock !== undefined ? { lowStockAt: DEFAULT_LOW_STOCK } : {}),
    }
    : {});

  const writes: ((b: ReturnType<typeof writeBatch>) => void)[] = [
    ...plan.add.map(row => (b: ReturnType<typeof writeBatch>) => {
      const cat = category(row.category);
      b.set(doc(tenantCol('products')), {
        name: row.name, description: row.description ?? '', price: row.price, cost: row.cost ?? 0,
        categoryId: cat?.id ?? '', categoryName: cat?.name ?? '',
        imageUrl: '', imageBytes: 0, isAvailable: row.available ?? true, variants: [],
        brand: row.brand ?? '', size: row.size ?? '', color: row.color ?? '', unit: row.unit ?? '', sku: row.sku ?? '',
        ...stockFields(row, true),
        createdAt: now, updatedAt: now,
      });
    }),
    ...plan.update.map(({ id, row }) => (b: ReturnType<typeof writeBatch>) => {
      const cat = category(row.category);
      b.update(tenantDoc('products', id), {
        name: row.name, price: row.price,
        ...(row.cost !== undefined ? { cost: row.cost } : {}),
        ...(cat ? { categoryId: cat.id, categoryName: cat.name } : {}),
        ...(row.sku ? { sku: row.sku } : {}),
        ...(row.unit !== undefined ? { unit: row.unit } : {}),
        ...(row.brand ? { brand: row.brand } : {}),
        ...(row.size ? { size: row.size } : {}),
        ...(row.color ? { color: row.color } : {}),
        ...(row.description ? { description: row.description } : {}),
        ...(row.available !== undefined ? { isAvailable: row.available } : {}),
        ...stockFields(row, false),
        updatedAt: now,
      });
    }),
  ];
  for (let i = 0; i < writes.length; i += BATCH) {
    const batch = writeBatch(db);
    writes.slice(i, i + BATCH).forEach(w => w(batch));
    await batch.commit();
    opts.onProgress?.(Math.min(i + BATCH, writes.length), writes.length);
  }
  return { added: plan.add.length, updated: plan.update.length, newCategories: plan.newCategories.length };
}

const IN_LIMIT = 30;

/**
 * Saves the sales that aren't in JPOS yet (a file imported twice adds nothing
 * the second time), 400 per batch. They're recorded under the person
 * importing (the rules ask for it), with the file's cashier name.
 */
export async function applySales(
  plan: SalesPlan,
  opts: { uid: string; onProgress?: (done: number, total: number) => void },
): Promise<{ added: number; alreadyThere: number }> {
  const ids = plan.sales.map(s => s.id);
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += IN_LIMIT) {
    const snap = await getDocs(query(tenantCol('orders'), where(documentId(), 'in', ids.slice(i, i + IN_LIMIT))));
    snap.docs.forEach(d => existing.add(d.id));
  }
  const todo = plan.sales.filter(s => !existing.has(s.id));
  const now = new Date().toISOString();
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = writeBatch(db);
    for (const s of todo.slice(i, i + BATCH)) {
      batch.set(tenantDoc('orders', s.id), {
        orderNumber: s.orderNumber,
        items: s.items,
        subtotal: s.subtotal,
        discount: s.discount,
        discountType: 'fixed',
        tax: 0,
        total: s.total,
        paymentMethod: s.paymentMethod,
        amountTendered: s.total,
        change: 0,
        status: 'completed',
        cashierId: opts.uid,
        cashierName: s.cashierName,
        imported: true,
        createdAt: s.createdAt,
        updatedAt: now,
      });
    }
    await batch.commit();
    opts.onProgress?.(Math.min(i + BATCH, todo.length), todo.length);
  }
  return { added: todo.length, alreadyThere: existing.size };
}
