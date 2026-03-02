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

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minStock: number;
  maxStock: number;
  cost: number;
  supplierId?: string;
  supplierName?: string;
  categoryId?: string;
  lastRestocked?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  performedBy: string;
  performedByName: string;
  createdAt: string;
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

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
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
