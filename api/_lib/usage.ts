/**
 * How much storage a shop uses, in plain numbers, and its package's limit.
 * Pictures are measured when they're uploaded (products keep `imageBytes`);
 * pictures from before that, and the sales data, are estimated. Kept apart
 * from the handlers so the math is unit-tested.
 */

/** What the server counts for one shop (store.shopUsage). */
export interface UsageCounts {
  plan: string;
  /** The shop's package limit in MB, when its package says one (null = unlimited). */
  storageMB?: number | null;
  products: number;
  orders: number;
  /** Products with a picture, and those whose size was measured at upload. */
  productPictures: number;
  measuredPictures: number;
  measuredBytes: number;
  /** Other pictures: the shop's logo, its GCash/Maya QRs and staff photos. */
  otherPictures: number;
}

export interface Usage {
  usedBytes: number;
  /** null = no limit */
  limitBytes: number | null;
  photosBytes: number;
  dataBytes: number;
  pictures: number;
  products: number;
  orders: number;
}

export const MB = 1024 * 1024;
/** Package limits when the shop's package doesn't say (Starter / Business / Enterprise). */
export const DEFAULT_STORAGE_MB: Record<string, number> = { starter: 500, business: 2048, enterprise: 10240 };
/** A picture uploaded before sizes were measured (the app now makes them about this size). */
export const EST_PICTURE_BYTES = 250 * 1024;
/** One sale or one product as stored data, with room for its indexes. */
export const EST_ORDER_BYTES = 1536;
export const EST_PRODUCT_BYTES = 1024;
/** Settings, categories, staff and the rest. */
export const BASE_DATA_BYTES = 64 * 1024;

export function storageLimitBytes(plan: string, storageMB?: number | null): number | null {
  if (storageMB === null) return null;
  const mb = typeof storageMB === 'number' && storageMB > 0 ? storageMB : DEFAULT_STORAGE_MB[plan] ?? DEFAULT_STORAGE_MB.starter;
  return Math.round(mb * MB);
}

export function computeUsage(c: UsageCounts): Usage {
  const unmeasured = Math.max(0, c.productPictures - c.measuredPictures);
  const photosBytes = Math.round(c.measuredBytes + (unmeasured + c.otherPictures) * EST_PICTURE_BYTES);
  const dataBytes = Math.round(c.orders * EST_ORDER_BYTES + c.products * EST_PRODUCT_BYTES + BASE_DATA_BYTES);
  return {
    usedBytes: photosBytes + dataBytes,
    limitBytes: storageLimitBytes(c.plan, c.storageMB),
    photosBytes,
    dataBytes,
    pictures: c.productPictures + c.otherPictures,
    products: c.products,
    orders: c.orders,
  };
}
