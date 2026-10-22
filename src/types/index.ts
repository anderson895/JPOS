export type UserRole = 'admin' | 'staff';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  rfidTag?: string;
  photoURL?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

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