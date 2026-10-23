import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { roundMoney } from '@/lib/utils';
import { productDetails } from '@/lib/productDetails';
import type { CartItem, Product } from '@/types';

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, variantId?: string, variantName?: string, notes?: string) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string) => void;
  clearCart: () => void;
  total: number;
  subtotal: number;
  itemCount: number;
  discount: number;
  setDiscount: (d: number) => void;
  discountType: 'percent' | 'fixed';
  setDiscountType: (t: 'percent' | 'fixed') => void;
  /** Peso amount actually taken off: never negative, never more than the subtotal. */
  discountAmount: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');

  // The cart belongs to whoever is signed in. Without this, the next cashier
  // on a shared terminal would inherit the previous cashier's items/discount.
  const userId = currentUser?.id;
  useEffect(() => {
    setItems([]);
    setDiscount(0);
    setDiscountType('percent');
  }, [userId]);

  const addItem = useCallback((product: Product, variantId?: string, variantName?: string, notes?: string) => {
    const variant = product.variants?.find(v => v.id === variantId);
    const price = product.price + (variant?.priceModifier || 0);

    setItems(prev => {
      const key = `${product.id}-${variantId || 'default'}`;
      const existing = prev.find(i => `${i.productId}-${i.variantId || 'default'}` === key);
      if (existing) {
        return prev.map(i =>
          `${i.productId}-${i.variantId || 'default'}` === key
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        price,
        quantity: 1,
        variantId,
        variantName,
        notes,
        imageUrl: product.imageUrl,
        details: productDetails(product),
        unit: product.unit || '',
      }];
    });
  }, []);

  const removeItem = useCallback((productId: string, variantId?: string) => {
    const key = `${productId}-${variantId || 'default'}`;
    setItems(prev => prev.filter(i => `${i.productId}-${i.variantId || 'default'}` !== key));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number, variantId?: string) => {
    const key = `${productId}-${variantId || 'default'}`;
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => `${i.productId}-${i.variantId || 'default'}` !== key));
    } else {
      setItems(prev => prev.map(i =>
        `${i.productId}-${i.variantId || 'default'}` === key ? { ...i, quantity } : i
      ));
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setDiscount(0);
  }, []);

  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const rawDiscount = (discountType === 'percent' ? (subtotal * discount) / 100 : discount) || 0;
  const discountAmount = roundMoney(Math.min(Math.max(rawDiscount, 0), subtotal));
  const total = roundMoney(subtotal - discountAmount);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart,
      total, subtotal, itemCount, discount, setDiscount,
      discountType, setDiscountType, discountAmount
    }}>
      {children}
    </CartContext.Provider>
  );
}
