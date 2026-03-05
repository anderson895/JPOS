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
  discount: number;
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
  createdAt: string;
  updatedAt: string;
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