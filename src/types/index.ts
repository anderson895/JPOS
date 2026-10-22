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
  isAvailable: boolean;
  cost: number;
  variants?: ProductVariant[];
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
  subtotal: number;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed';
export type PaymentMethod = 'cash' | 'card' | 'gcash' | 'maya';

export interface Order {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  subtotal: number;
  /**
   * Peso amount actually deducted — already converted when `discountType` is
   * 'percent', and never more than `subtotal`. `total = subtotal - discount`.
   */
  discount: number;
  /** How the cashier entered the discount; `discount` is always in pesos. */
  discountType?: 'percent' | 'fixed';
  tax: number;
  total: number;
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
}