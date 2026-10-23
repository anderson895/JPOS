import type { DiscountKind, DiscountPick, SeniorInfo, VatBreakdown } from '@/lib/pricing';

export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  /** The shop this login belongs to (tenants/{tenantId}). One shop per login. */
  tenantId: string;
  email: string;
  displayName: string;
  role: UserRole;
  rfidTag?: string;
  photoURL?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What a package unlocks. Snapshotted on the shop when a payment is approved. */
export interface Entitlements {
  plan: PlanId;
  /** Max user accounts (owner included); null = unlimited. */
  staffLimit: number | null;
  rfid: boolean;
  fullReports: boolean;
  pdfExport: boolean;
  trends: boolean;
  /**
   * Business and up (2026-10-23). Missing on shops and packages saved before
   * then: the package decides (Starter no, Business/Enterprise yes), the same
   * way firestore.rules read them (hasFeature in src/lib/entitlements.ts).
   */
  /** The shop's own logo and colors. */
  branding?: boolean;
  /** Saved discounts and discounts on one item. */
  discounts?: boolean;
  /** Voiding a sale. */
  voidSales?: boolean;
  /** Storage for pictures and sales data, in MB; null = no limit. Missing: the package decides (500 / 2048 / 10240). */
  storageMB?: number | null;
}

export type PlanId = 'starter' | 'business' | 'enterprise';

/** Where a shop is in its subscription. */
export type TenantStatus = 'setup' | 'trial' | 'active';

/**
 * A subscribing shop: tenants/{id}. Shop admins can only start the trial once and
 * open/cancel a payment request; status, period and entitlements are written by
 * the platform (sign-up, Super Admin approval). Firestore Timestamps are read as
 * `{ toDate(): Date }`.
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  ownerUid: string;
  plan: PlanId;
  desiredPlan?: PlanId;
  status: TenantStatus;
  suspended: boolean;
  createdAt: FirestoreTime;
  trialDays: number;
  trialUsed?: boolean;
  trialStartedAt?: FirestoreTime;
  currentPeriodEnd?: FirestoreTime;
  entitlements: Entitlements;
  staffCount: number;
  pendingRequestId?: string | null;
  /** What the shop sells (chosen at sign-up, changeable in Store Settings). Old shops have none. */
  businessType?: BusinessType;
  /** What the receipt shows under the shop name (Store Settings). */
  receipt?: ReceiptInfo;
}

/** The kinds of store JPOS is set up for (src/lib/storeProfile.ts has the labels). */
export type BusinessType = 'food' | 'grocery' | 'clothing' | 'hardware' | 'pharmacy' | 'gadgets' | 'services' | 'other';

/** The shop's details printed on every receipt. */
export interface ReceiptInfo {
  /** BIR VAT-registered: the receipt shows VATable sales and 12% VAT. */
  vatRegistered: boolean;
  tin: string;
  address: string;
  phone: string;
  /** A closing line, e.g. "Thank you, come again!" */
  footer: string;
}

/**
 * tenants/{T}/settings/branding: the shop's name, logo and colors. Anyone can
 * read it (the shop's sign-in page shows it before anyone signs in).
 */
export interface StoreBranding {
  name: string;
  /** '' = the JPOS logo. */
  logoUrl: string;
  theme: string;
  updatedAt?: FirestoreTime;
  updatedBy?: string;
}

/** A package as the Super Admin defines it (platform/settings.plans). */
export interface PlanDef {
  name: string;
  /** Pesos per month */
  price: number;
  entitlements: Entitlements;
}

/** A QR the Super Admin receives subscription payments on. */
export interface PaymentChannel {
  label: string;
  qrImageUrl: string;
  accountName: string;
  accountHint: string;
  enabled: boolean;
  order: number;
}

/** platform/settings: prices, packages, the Super Admin's payment QRs and contact. */
export interface PlatformSettings {
  plans: Record<PlanId, PlanDef>;
  trialDays: number;
  paymentChannels: Record<string, PaymentChannel>;
  messengerUrl: string;
  contactPhone: string;
  lastAuditId: string;
  updatedAt?: FirestoreTime;
  updatedBy?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** subscriptionRequests/{id}: a shop's manual payment (QR + receipt) for a package. */
export interface SubscriptionRequest {
  id: string;
  tenantId: string;
  tenantName: string;
  uid: string;
  requesterName: string;
  plan: PlanId;
  amount: number;
  months: number;
  channelId: string;
  channelLabel: string;
  channelAccountHint: string;
  reference: string;
  proofUrl: string;
  status: RequestStatus;
  reason?: string;
  reviewedBy?: string;
  reviewedAt?: FirestoreTime;
  createdAt: FirestoreTime;
}

/** A Firestore Timestamp as the client SDK returns it. */
export interface FirestoreTime { toDate(): Date; toMillis(): number }

export interface Category {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  categoryName: string;
  imageUrl?: string;
  /** The picture's size in storage, measured when it was uploaded. */
  imageBytes?: number;
  isAvailable: boolean;
  cost: number;
  variants?: ProductVariant[];
  /** Details that tell products apart (src/lib/productDetails.ts). Old products have none. */
  brand?: string;
  size?: string;
  color?: string;
  /** How it's sold: 'kg', 'pack'… ('' or missing = by the piece). */
  unit?: string;
  /** Barcode or the shop's own code: a scanner adds the product in the POS. */
  sku?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  priceModifier: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  variantId?: string;
  variantName?: string;
  notes?: string;
  /** "Nestlé · 300 g", frozen at the sale (later product edits don't change it). */
  details?: string;
  unit?: string;
  /** price × quantity, before any discount. */
  subtotal: number;
  /** Pesos off this line (an item discount) and the discount's name. */
  discount?: number;
  discountName?: string;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'voided';
export type PaymentMethod = 'cash' | 'card' | 'gcash' | 'maya';

export interface Order {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  subtotal: number;
  /**
   * Every peso given away as a discount: item discounts, the order discount and
   * the Senior/PWD 20% (src/lib/pricing.ts). `total = subtotal - discount - (lessVat ?? 0)`.
   */
  discount: number;
  /** How the order discount was entered; `discount` is always in pesos. */
  discountType?: 'percent' | 'fixed';
  /** The VAT inside the total (VAT-registered stores; 0 otherwise). */
  tax: number;
  total: number;
  /** VAT-registered stores: VATable sales, VAT and VAT-exempt sales, for the receipt. */
  vat?: VatBreakdown;
  /** Senior/PWD in a VAT-registered store: the VAT taken off before the 20%. */
  lessVat?: number;
  /** Order-level discounts for the receipt: "Senior citizen 20%", "Employee 10%". */
  discounts?: { name: string; amount: number }[];
  /** Senior citizen / PWD sale: the ID number and name printed on the receipt. */
  senior?: SeniorInfo;
  /** Voided by an admin (with a reason): kept for the record, left out of every sales total. */
  voidedBy?: string;
  voidedByName?: string;
  voidedAt?: string;
  voidReason?: string;
  paymentMethod: PaymentMethod;
  amountTendered?: number;
  change?: number;
  status: OrderStatus;
  cashierId: string;
  cashierName: string;
  tableNumber?: string;
  customerName?: string;
  notes?: string;
  /**
   * GCash/Maya: the e-wallet reference number (normalized, unique per wallet).
   * Card: an optional approval code. Shown on the receipt and in its QR.
   */
  paymentReference?: string;
  /** Store-QR e-wallet (GCash/Maya): the cashier confirmed the money arrived. */
  paymentVerification?: 'manual';
  /** Uid of the cashier who confirmed the e-wallet payment. */
  verifiedBy?: string;
  /** Something about the payment needs a human look. */
  paymentNote?: string;
  createdAt: string;
  updatedAt: string;
}

/** One of the store's own e-wallet QR codes (Payment Settings). */
export interface WalletSettings {
  enabled: boolean;
  /** Cloudinary https URL of the store's GCash/Maya QR image. */
  qrImageUrl: string;
  /** Shown to the customer so they can check who they're paying. */
  accountName: string;
  /** e.g. "0917•••1234". */
  accountHint: string;
}

/** settings/payments: how this store takes payments. Admins edit it; everyone signed in reads it. */
export interface PaymentSettings {
  gcash: WalletSettings;
  maya: WalletSettings;
  card: { enabled: boolean };
  updatedAt?: string;
  updatedBy?: string;
}

export interface DailySales {
  date: string;
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
}

export interface Staff {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  rfidTag?: string;
  photoURL?: string;
  isActive: boolean;
  pin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  variantId?: string;
  variantName?: string;
  notes?: string;
  imageUrl?: string;
  details?: string;
  unit?: string;
  /** A discount on this line only. */
  discount?: DiscountPick | null;
}

/** tenants/{T}/discounts/{id}: a discount the store set up to pick at the POS. */
export interface SavedDiscount {
  id: string;
  name: string;
  kind: DiscountKind;
  value: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}