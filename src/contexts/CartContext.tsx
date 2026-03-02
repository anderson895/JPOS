import React, { createContext, useContext, useState, useCallback } from 'react';
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
}

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');

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

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = discountType === 'percent' ? (subtotal * discount) / 100 : discount;
  const total = Math.max(0, subtotal - discountAmount);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart,
      total, subtotal, itemCount, discount, setDiscount,
      discountType, setDiscountType
    }}>
      {children}
    </CartContext.Provider>
  );
}
