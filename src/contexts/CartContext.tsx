import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { productDetails } from '@/lib/productDetails';
import { price, type DiscountPick, type PriceResult, type SeniorInfo } from '@/lib/pricing';
import type { CartItem, Product } from '@/types';

interface CartContextType {
  items: CartItem[];
  /** `trackStock`: take this sale's quantity off the product's stock (inventory). */
  addItem: (product: Product, variantId?: string, variantName?: string, notes?: string, trackStock?: boolean) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, quantity: number, variantId?: string) => void;
  /** A discount on one line (null removes it). */
  setItemDiscount: (productId: string, variantId: string | undefined, discount: DiscountPick | null) => void;
  /** A discount on the whole order (null removes it). */
  orderDiscount: DiscountPick | null;
  setOrderDiscount: (discount: DiscountPick | null) => void;
  /** Senior citizen / PWD: replaces every other discount, so setting it clears them. */
  senior: SeniorInfo | null;
  setSenior: (senior: SeniorInfo | null) => void;
  clearCart: () => void;
  /** The money of the sale (src/lib/pricing.ts). */
  pricing: PriceResult;
  total: number;
  subtotal: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

const lineKey = (productId: string, variantId?: string) => `${productId}-${variantId || 'default'}`;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<DiscountPick | null>(null);
  const [senior, setSeniorState] = useState<SeniorInfo | null>(null);

  // The cart belongs to whoever is signed in. Without this, the next cashier
  // on a shared terminal would inherit the previous cashier's items/discount.
  const userId = currentUser?.id;
  useEffect(() => {
    setItems([]);
    setOrderDiscount(null);
    setSeniorState(null);
  }, [userId]);

  const addItem = useCallback((product: Product, variantId?: string, variantName?: string, notes?: string, trackStock?: boolean) => {
    const variant = product.variants?.find(v => v.id === variantId);
    const unitPrice = product.price + (variant?.priceModifier || 0);

    setItems(prev => {
      const key = lineKey(product.id, variantId);
      const existing = prev.find(i => lineKey(i.productId, i.variantId) === key);
      if (existing) {
        return prev.map(i => (lineKey(i.productId, i.variantId) === key ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        price: unitPrice,
        quantity: 1,
        variantId,
        variantName,
        notes,
        imageUrl: product.imageUrl,
        details: productDetails(product),
        unit: product.unit || '',
        ...(trackStock ? { trackStock: true } : {}),
      }];
    });
  }, []);

  const removeItem = useCallback((productId: string, variantId?: string) => {
    const key = lineKey(productId, variantId);
    setItems(prev => prev.filter(i => lineKey(i.productId, i.variantId) !== key));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number, variantId?: string) => {
    const key = lineKey(productId, variantId);
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => lineKey(i.productId, i.variantId) !== key));
    } else {
      setItems(prev => prev.map(i => (lineKey(i.productId, i.variantId) === key ? { ...i, quantity } : i)));
    }
  }, []);

  const setItemDiscount = useCallback((productId: string, variantId: string | undefined, discount: DiscountPick | null) => {
    const key = lineKey(productId, variantId);
    setItems(prev => prev.map(i => (lineKey(i.productId, i.variantId) === key ? { ...i, discount } : i)));
    if (discount) setSeniorState(null);
  }, []);

  const setOrder = useCallback((discount: DiscountPick | null) => {
    setOrderDiscount(discount);
    if (discount) setSeniorState(null);
  }, []);

  // No double discounts: Senior/PWD takes the place of every other one
  const setSenior = useCallback((s: SeniorInfo | null) => {
    setSeniorState(s);
    if (s) {
      setOrderDiscount(null);
      setItems(prev => prev.map(i => (i.discount ? { ...i, discount: null } : i)));
    }
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setOrderDiscount(null);
    setSeniorState(null);
  }, []);

  // JPOS receipts are unofficial (not BIR-registered), so no sale has VAT
  const pricing = useMemo(
    () => price({ lines: items, orderDiscount, senior, vatRegistered: false }),
    [items, orderDiscount, senior],
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, setItemDiscount,
      orderDiscount, setOrderDiscount: setOrder, senior, setSenior, clearCart,
      pricing, total: pricing.total, subtotal: pricing.subtotal, itemCount,
    }}>
      {children}
    </CartContext.Provider>
  );
}
