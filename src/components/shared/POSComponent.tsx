import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { formatCurrency, generateOrderNumber } from '@/lib/utils';
import Portal from '@/components/shared/Portal';
import type { Product, Category, Order, PaymentMethod, CartItem } from '@/types';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, X, CreditCard,
  Banknote, Smartphone, CheckCircle, Printer, Coffee, Tag, Percent, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: any }[] = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'gcash', label: 'GCash', icon: Smartphone },
  { value: 'maya', label: 'Maya', icon: Smartphone },
];

export default function POSComponent() {
  const { currentUser } = useAuth();
  const { items: cartItems, addItem, removeItem, updateQuantity, clearCart, subtotal, total, discount, setDiscount, discountType, setDiscountType, itemCount } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [receipt, setReceipt] = useState<Order | null>(null);
  const [cartOpen, setCartOpen] = useState(false); // mobile cart slide-over
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchMenuData(); }, []);

  async function fetchMenuData() {
    setLoading(true);
    try {
      const [prodSnap, catSnap] = await Promise.all([
        getDocs(query(collection(db, 'products'), where('isAvailable', '==', true))),
        getDocs(collection(db, 'categories')),
      ]);
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    } finally {
      setLoading(false);
    }
  }

  const discountAmount = discountType === 'percent' ? (subtotal * discount) / 100 : discount;
  const change = paymentMethod === 'cash' && amountTendered ? Math.max(0, Number(amountTendered) - total) : 0;

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !activeCat || p.categoryId === activeCat;
    return matchSearch && matchCat;
  });

  async function placeOrder() {
    if (cartItems.length === 0) { toast.error('Cart is empty'); return; }
    if (paymentMethod === 'cash' && amountTendered && Number(amountTendered) < total) {
      toast.error('Insufficient payment amount');
      return;
    }

    setPlacing(true);
    try {
      // Firestore rejects undefined — strip every optional field
      const order: Omit<Order, 'id'> = {
        orderNumber: generateOrderNumber(),
        items: cartItems.map(i => ({
          productId: i.productId,
          productName: i.productName,
          price: i.price,
          quantity: i.quantity,
          subtotal: i.price * i.quantity,
          ...(i.variantId   ? { variantId: i.variantId }     : {}),
          ...(i.variantName ? { variantName: i.variantName } : {}),
          ...(i.notes       ? { notes: i.notes }             : {}),
        })),
        subtotal,
        discount: discountAmount,
        discountType,
        tax: 0,
        total,
        paymentMethod,
        amountTendered: Number(amountTendered) || total,
        change: change || 0,
        status: 'completed',
        cashierId: currentUser?.id || '',
        cashierName: currentUser?.displayName || '',
        ...(customerName ? { customerName } : {}),
        ...(tableNumber  ? { tableNumber }  : {}),
        ...(notes        ? { notes }        : {}),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'orders'), order);
      const savedOrder = { id: docRef.id, ...order };
      setReceipt(savedOrder);
      clearCart();
      setCheckoutOpen(false);
      setCartOpen(false);
      setAmountTendered('');
      setCustomerName('');
      setTableNumber('');
      setNotes('');
      toast.success(`Order ${order.orderNumber} placed!`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to place order');
    } finally {
      setPlacing(false);
    }
  }

  function printReceipt() {
    window.print();
  }

  return (
    <div className="relative flex h-full bg-espresso-50">
      {/* Left: Product Menu */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search & Header */}
        <div className="p-4 sm:p-6 sm:pb-4 border-b border-cream-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display text-xl sm:text-2xl text-espresso-900">Point of Sale</h1>
            <div className="text-sm text-bark-500 truncate ml-3">{currentUser?.displayName}</div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-bark-400" />
            <input
              className="input pl-9"
              placeholder="Search menu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 px-4 sm:px-6 py-3 overflow-x-auto border-b border-cream-100 bg-white flex-shrink-0">
          <button
            onClick={() => setActiveCat('')}
            className={`flex-shrink-0 px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${!activeCat ? 'bg-espresso-600 text-white' : 'bg-cream-100 text-bark-600 hover:bg-cream-200'}`}
          >
            All
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-xl text-sm font-medium transition-all ${activeCat === c.id ? 'bg-espresso-600 text-white' : 'bg-cream-100 text-bark-600 hover:bg-cream-200'}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="card p-4 animate-pulse">
                  <div className="w-full h-28 bg-cream-200 rounded-xl mb-3" />
                  <div className="h-4 bg-cream-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-cream-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16 text-bark-400">
              <Coffee className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No products available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {filteredProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => addItem(p)}
                  className="card overflow-hidden text-left hover:shadow-md hover:scale-[1.02] transition-all duration-150 active:scale-[0.98] group"
                >
                  <div className="h-28 bg-cream-100 relative">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Coffee className="w-8 h-8 text-cream-400" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-espresso-900/0 group-hover:bg-espresso-900/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-md">
                        <Plus className="w-4 h-4 text-espresso-700" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-espresso-800 text-sm truncate">{p.name}</p>
                    <p className="text-xs text-bark-400 mb-1">{p.categoryName}</p>
                    <p className="font-semibold text-espresso-700">{formatCurrency(p.price)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart — static panel on desktop, slide-over on mobile */}
      <div
        className={`
          fixed inset-y-0 right-0 z-40 w-full lg:static lg:z-auto lg:w-80 xl:w-96
          ${cartOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0
          transition-transform duration-300 flex flex-col bg-white border-l border-cream-200 shadow-sm
        `}
      >
        <div className="p-5 border-b border-cream-100">
          <h2 className="font-display text-lg text-espresso-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Order
            {itemCount > 0 && (
              <span className="bg-espresso-600 text-white text-xs font-medium px-2 py-0.5 rounded-full">{itemCount}</span>
            )}
            {/* Mobile: close the cart and go back to the menu */}
            <button
              onClick={() => setCartOpen(false)}
              className="lg:hidden ml-auto text-bark-400 hover:text-espresso-600 transition-colors"
              title="Back to menu"
            >
              <X className="w-5 h-5" />
            </button>
          </h2>
          {/* Table/Customer info */}
          <div className="flex gap-2 mt-3">
            <input
              className="input flex-1 py-1.5 text-sm"
              placeholder="Table #"
              value={tableNumber}
              onChange={e => setTableNumber(e.target.value)}
            />
            <input
              className="input flex-1 py-1.5 text-sm"
              placeholder="Customer"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
            />
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cartItems.length === 0 ? (
            <div className="text-center py-16 text-bark-400">
              <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Select items from the menu</p>
            </div>
          ) : cartItems.map(item => (
            <div key={`${item.productId}-${item.variantId || ''}`} className="flex items-start gap-3 p-3 bg-cream-50 rounded-xl">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-espresso-800 truncate">{item.productName}</p>
                {item.variantName && <p className="text-xs text-bark-400">{item.variantName}</p>}
                <p className="text-sm text-espresso-600 font-semibold mt-0.5">{formatCurrency(item.price * item.quantity)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => updateQuantity(item.productId, item.quantity - 1, item.variantId)}
                  className="w-6 h-6 bg-white border border-cream-200 rounded-lg flex items-center justify-center hover:bg-cream-100 transition-colors"
                >
                  <Minus className="w-3 h-3 text-bark-600" />
                </button>
                <span className="w-7 text-center text-sm font-medium text-espresso-800">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.productId, item.quantity + 1, item.variantId)}
                  className="w-6 h-6 bg-espresso-600 rounded-lg flex items-center justify-center hover:bg-espresso-700 transition-colors"
                >
                  <Plus className="w-3 h-3 text-white" />
                </button>
                <button
                  onClick={() => removeItem(item.productId, item.variantId)}
                  className="w-6 h-6 ml-1 text-bark-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Discount */}
        {cartItems.length > 0 && (
          <div className="px-4 py-3 border-t border-cream-100">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-bark-400" />
              <span className="text-sm text-bark-500 flex-1">Discount</span>
              <div className="flex items-center gap-1 bg-cream-100 rounded-lg p-0.5">
                <button onClick={() => setDiscountType('percent')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${discountType === 'percent' ? 'bg-white text-espresso-800 shadow-sm' : 'text-bark-500'}`}>
                  %
                </button>
                <button onClick={() => setDiscountType('fixed')}
                  className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${discountType === 'fixed' ? 'bg-white text-espresso-800 shadow-sm' : 'text-bark-500'}`}>
                  ₱
                </button>
              </div>
              <input
                type="number"
                min="0"
                className="w-20 px-2 py-1 text-sm text-right border border-cream-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-espresso-400"
                value={discount || ''}
                onChange={e => setDiscount(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* Totals & Actions */}
        <div className="p-4 border-t border-cream-100 space-y-2">
          <div className="flex justify-between text-sm text-bark-500">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600">
              <span>Discount</span>
              <span>-{formatCurrency(discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-display text-lg text-espresso-900 pt-1 border-t border-cream-100">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <button
            onClick={() => setCheckoutOpen(true)}
            disabled={cartItems.length === 0}
            className="w-full btn-primary py-3 text-base flex items-center justify-center gap-2 mt-2"
          >
            <CreditCard className="w-4 h-4" />
            Checkout
          </button>
          {cartItems.length > 0 && (
            <button onClick={clearCart} className="w-full btn-ghost py-2 text-sm text-bark-500 hover:text-red-500">
              Clear Cart
            </button>
          )}
        </div>
      </div>

      {/* Mobile bottom bar — opens the cart slide-over */}
      {itemCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center gap-3 px-4 py-3 bg-espresso-600 text-white shadow-lg active:bg-espresso-700"
        >
          <span className="relative">
            <ShoppingCart className="w-6 h-6" />
            <span className="absolute -top-2 -right-2 bg-white text-espresso-700 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{itemCount}</span>
          </span>
          <span className="font-medium">View Order</span>
          <span className="ml-auto font-display text-lg">{formatCurrency(total)}</span>
        </button>
      )}

      {/* Checkout Modal */}
      {checkoutOpen && (
        <Portal>
        <div className="modal-backdrop">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-cream-100">
              <h2 className="font-display text-xl text-espresso-900">Checkout</h2>
              <button onClick={() => setCheckoutOpen(false)}><X className="w-5 h-5 text-bark-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Order Summary */}
              <div className="bg-cream-50 rounded-xl p-4 space-y-1.5">
                {cartItems.map(i => (
                  <div key={`${i.productId}-${i.variantId}`} className="flex justify-between text-sm">
                    <span className="text-bark-700">{i.productName} × {i.quantity}</span>
                    <span className="text-espresso-800">{formatCurrency(i.price * i.quantity)}</span>
                  </div>
                ))}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 pt-1 border-t border-cream-200">
                    <span>Discount</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-base pt-1.5 border-t border-cream-200">
                  <span>Total</span>
                  <span className="text-espresso-900">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="label">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setPaymentMethod(value)}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                        paymentMethod === value
                          ? 'border-espresso-600 bg-espresso-50 text-espresso-700'
                          : 'border-cream-200 text-bark-400 hover:border-bark-300'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash tender */}
              {paymentMethod === 'cash' && (
                <div>
                  <label className="label">Amount Tendered (₱)</label>
                  <input
                    className="input font-mono text-lg"
                    type="number"
                    min={total}
                    placeholder={total.toString()}
                    value={amountTendered}
                    onChange={e => setAmountTendered(e.target.value)}
                  />
                  {amountTendered && Number(amountTendered) >= total && (
                    <div className="flex justify-between text-sm mt-2 p-3 bg-emerald-50 rounded-xl">
                      <span className="text-emerald-700">Change</span>
                      <span className="font-semibold text-emerald-700">{formatCurrency(change)}</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="label">Notes (optional)</label>
                <input className="input" placeholder="Special instructions..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-cream-100">
              <button onClick={() => setCheckoutOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={placeOrder} disabled={placing} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {placing ? 'Processing...' : 'Confirm Order'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <Portal>
        <div className="modal-backdrop">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center border-b border-cream-100">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="font-display text-xl text-espresso-900">Order Placed!</h2>
              <p className="text-bark-500 text-sm mt-1">{receipt.orderNumber}</p>
            </div>

            {/* Receipt Content */}
            <div ref={receiptRef} id="receipt" className="p-6 font-mono text-xs space-y-1">
              <p className="text-center font-bold text-base font-body mb-2">JPOS COFFEE SHOP</p>
              <p className="text-center text-bark-500 mb-3">{new Date(receipt.createdAt).toLocaleString()}</p>
              <div className="border-t border-dashed border-bark-300 pt-2 space-y-1">
                {receipt.items.map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{item.productName} ×{item.quantity}</span>
                    <span>{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-bark-300 pt-2 space-y-1">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(receipt.subtotal)}</span></div>
                {receipt.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(receipt.discount)}</span></div>}
                <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>{formatCurrency(receipt.total)}</span></div>
                <div className="flex justify-between"><span>{receipt.paymentMethod.toUpperCase()}</span><span>{formatCurrency(receipt.amountTendered || receipt.total)}</span></div>
                {(receipt.change || 0) > 0 && <div className="flex justify-between"><span>Change</span><span>{formatCurrency(receipt.change || 0)}</span></div>}
              </div>
              <p className="text-center text-bark-500 mt-2">Thank you for your order!</p>
              <p className="text-center text-bark-400">Cashier: {receipt.cashierName}</p>
            </div>

            <div className="flex gap-3 p-6 border-t border-cream-100">
              <button onClick={printReceipt} className="btn-secondary flex-1 flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={() => setReceipt(null)} className="btn-primary flex-1">Done</button>
            </div>
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}
