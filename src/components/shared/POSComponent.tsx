import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDocs, query, where } from 'firebase/firestore';
import { tenantCol } from '@/lib/tenant';
import { useAuth, useStoreBrand } from '@/contexts/AuthContext';
import { receiptInfo } from '@/lib/storeProfile';
import { findByCode, matchesSearch, productDetails } from '@/lib/productDetails';
import { useCart } from '@/contexts/CartContext';
import { formatCurrency, generateOrderNumber, roundMoney } from '@/lib/utils';
import Portal from '@/components/shared/Portal';
import type { Product, Category, Order, PaymentMethod, PaymentSettings, SavedDiscount } from '@/types';
import type { DocumentReference } from 'firebase/firestore';
import { buildOrder, type OrderSnapshot } from '@/lib/orders';
import { subscribePaymentSettings } from '@/lib/storeSettings';
import { DEFAULT_PAYMENT_SETTINGS, WALLET_LABEL, approvalCodeProblem, normalizeReference, referenceProblem, walletReady, type WalletMethod } from '@/lib/eWallet';
import { saveOrderAtomically, ReferenceUsedError } from '@/lib/saveOrder';
import { watchSavedDiscounts } from '@/lib/discounts';
import { SENIOR_LABEL, SENIOR_RATE, VAT_RATE } from '@/lib/pricing';
import DiscountSheet from '@/components/pos/DiscountSheet';
import Receipt from '@/components/pos/Receipt';
import {
  Search, ShoppingCart, Plus, Minus, Trash2, X, CreditCard, Banknote, Smartphone, CheckCircle, Printer, Tag, Loader2, Maximize2, Package, LayoutGrid,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Lock } from 'lucide-react';
import { hasAccess, shopState } from '@/lib/entitlements';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: any }[] = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'gcash', label: 'GCash', icon: Smartphone },
  { value: 'maya', label: 'Maya', icon: Smartphone },
];

export default function POSComponent() {
  const { currentUser, tenant } = useAuth();
  const brand = useStoreBrand();
  const shopInfo = receiptInfo(tenant);
  const {
    items: cartItems, addItem, removeItem, updateQuantity, clearCart, subtotal, total, itemCount,
    pricing, setItemDiscount, orderDiscount, setOrderDiscount, senior, setSenior,
  } = useCart();
  // The store's saved discounts (live; only the ones switched on)
  const [savedDiscounts, setSavedDiscounts] = useState<SavedDiscount[]>([]);
  useEffect(() => watchSavedDiscounts(list => setSavedDiscounts(list.filter(d => d.active)), err => console.warn('[POS] discounts', err)), []);
  // The discount window: for one cart line, or the whole order
  const [discountFor, setDiscountFor] = useState<null | 'order' | { productId: string; variantId?: string }>(null);
  const discountLine = discountFor && discountFor !== 'order'
    ? cartItems.find(i => i.productId === discountFor.productId && i.variantId === discountFor.variantId) ?? null
    : null;
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
  const [paySettings, setPaySettings] = useState<PaymentSettings>(DEFAULT_PAYMENT_SETTINGS);
  const [eRef, setERef] = useState('');           // GCash/Maya reference, or the card approval code (normalized)
  const [eReceived, setEReceived] = useState(false);
  const [qrFullscreen, setQrFullscreen] = useState(false);
  // Live: a new QR or a wallet switched off shows up at once
  useEffect(() => subscribePaymentSettings(setPaySettings, () => toast.error('Failed to load payment settings')), []);

  useEffect(() => { fetchMenuData(); }, []);

  async function fetchMenuData() {
    setLoading(true);
    try {
      const [prodSnap, catSnap] = await Promise.all([
        getDocs(query(tenantCol('products'), where('isAvailable', '==', true))),
        getDocs(tenantCol('categories')),
      ]);
      setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      setCategories(catSnap.docs.map(d => ({ id: d.id, ...d.data() } as Category)));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load menu');
    } finally {
      setLoading(false);
    }
  }

  // Only cash uses the typed amount; a value left over from before switching
  // to card/e-wallet must not end up on the order or the receipt.
  const isCash = paymentMethod === 'cash';
  const tendered = Number(amountTendered);
  const change = isCash && amountTendered ? roundMoney(Math.max(0, tendered - total)) : 0;
  const isAdmin = currentUser?.role === 'admin';
  const walletMethod: WalletMethod | null = paymentMethod === 'gcash' || paymentMethod === 'maya' ? paymentMethod : null;
  const wallet = walletMethod ? paySettings[walletMethod] : null;
  const methodAvailable = (m: PaymentMethod) =>
    m === 'cash' || (m === 'card' ? paySettings.card.enabled : walletReady(paySettings, m));
  const refIssue = walletMethod ? referenceProblem(eRef, walletMethod)
    : paymentMethod === 'card' ? approvalCodeProblem(eRef) : null;
  const canConfirm = !placing && !refIssue && (!walletMethod || eReceived) && methodAvailable(paymentMethod);
  // The admin switched the chosen method off mid-checkout → back to cash
  useEffect(() => { if (!methodAvailable(paymentMethod)) setPaymentMethod('cash'); }, [paySettings]); // eslint-disable-line
  // "I saw ₱X received" is about a specific amount; untick it if the total changes
  useEffect(() => { setEReceived(false); }, [total]);
  // Esc closes the full-screen QR
  useEffect(() => {
    if (!qrFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setQrFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qrFullscreen]);

  const filteredProducts = products.filter(p => {
    const matchSearch = matchesSearch(p, search);
    const matchCat = !activeCat || p.categoryId === activeCat;
    return matchSearch && matchCat;
  });

  function takeSnapshot(): OrderSnapshot {
    return {
      items: cartItems.map(i => ({ ...i })),
      pricing, orderDiscount, senior, paymentMethod,
      amountTendered: isCash && amountTendered ? roundMoney(tendered) : total,
      change,
      cashierId: currentUser?.id || '',
      cashierName: currentUser?.displayName || '',
      customerName, tableNumber, notes,
    };
  }

  async function saveOrder(orderRef: DocumentReference, order: Omit<Order, 'id'>) {
    await saveOrderAtomically(orderRef, order);   // claims the e-wallet reference in the same batch
    setReceipt({ id: orderRef.id, ...order });
    clearCart();
    setCheckoutOpen(false);
    setCartOpen(false);
    setAmountTendered(''); setCustomerName(''); setTableNumber(''); setNotes('');
    setPaymentMethod('cash'); setERef(''); setEReceived(false);
    toast.success(`Order ${order.orderNumber} placed!`);
  }

  async function placeOrder() {           // cash, or a manually recorded payment
    if (cartItems.length === 0) { toast.error('Cart is empty'); return; }
    if (isCash && amountTendered && !(tendered >= total)) { toast.error('Insufficient payment amount'); return; }
    if (!methodAvailable(paymentMethod)) { toast.error("That payment method isn't set up. Choose another."); return; }
    if (refIssue) { toast.error(refIssue); return; }
    if (walletMethod && !eReceived) { toast.error(`Confirm the payment arrived in the store's ${WALLET_LABEL[walletMethod]}.`); return; }
    setPlacing(true);
    try {
      const orderRef = doc(tenantCol('orders'));
      const payment = paymentMethod === 'cash' ? undefined
        : { verification: 'manual' as const, reference: eRef, verifiedBy: currentUser?.id || '' };
      await saveOrder(orderRef, buildOrder(takeSnapshot(), generateOrderNumber(orderRef.id), payment));
    } catch (err) {
      if (err instanceof ReferenceUsedError) toast.error(err.message, { duration: 8000 }); // "…already used for order ORD-…"
      else { console.error(err); toast.error('Failed to place order'); }
    } finally {
      setPlacing(false);
    }
  }

  // Item discounts, the order discount, and Senior/PWD (VAT off, then 20%)
  const MoneyLines = () => (
    <>
      {pricing.itemDiscounts > 0 && (
        <div className="flex justify-between text-sm text-emerald-700"><span>Item discounts</span><span>-{formatCurrency(pricing.itemDiscounts)}</span></div>
      )}
      {pricing.orderDiscount > 0 && orderDiscount && (
        <div className="flex justify-between gap-3 text-sm text-emerald-700"><span className="truncate">{orderDiscount.name}</span><span>-{formatCurrency(pricing.orderDiscount)}</span></div>
      )}
      {pricing.lessVat > 0 && (
        <div className="flex justify-between text-sm text-emerald-700"><span>Less VAT {VAT_RATE * 100}%</span><span>-{formatCurrency(pricing.lessVat)}</span></div>
      )}
      {pricing.seniorDiscount > 0 && senior && (
        <div className="flex justify-between text-sm text-emerald-700"><span>{SENIOR_LABEL[senior.type]} {SENIOR_RATE * 100}%</span><span>-{formatCurrency(pricing.seniorDiscount)}</span></div>
      )}
    </>
  );

  // No sales until the free trial starts or a payment is approved (the rules enforce it too)
  const locked = !!tenant && !hasAccess(tenant);

  function printReceipt() {
    window.print();
  }

  const cashierInitials = currentUser?.displayName
    ?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';


  if (locked && tenant) {
    const st = shopState(tenant);
    const isAdmin = currentUser?.role === 'admin';
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="card p-8 max-w-md text-center">
          <Lock className="w-10 h-10 mx-auto text-caramel-600" aria-hidden="true" />
          <h2 className="mt-3 font-display text-2xl text-espresso-900">Selling is locked</h2>
          <p className="mt-2 text-sm text-bark-600">
            {st === 'suspended' ? 'This shop is suspended. Please contact us.'
              : st === 'setup' ? 'Start the free trial or subscribe to start taking orders.'
              : 'Your free trial or subscription has ended. Renew to take orders again.'}
          </p>
          {isAdmin && st !== 'suspended'
            ? <Link to="/admin/billing" className="btn-primary mt-5 inline-flex">Go to Subscription</Link>
            : !isAdmin && <p className="mt-4 text-sm text-bark-500">Ask your shop owner.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full">
      {/* Left: Product Menu */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Search & Header */}
        <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow text-2xl sm:text-3xl -mb-1">New sale</p>
              <h1 className="font-display text-2xl sm:text-3xl text-espresso-900">Point of Sale</h1>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-cream-400/70 bg-cream-50 pl-1.5 pr-4 py-1.5 shadow-sm min-w-0">
              <span className="w-7 h-7 rounded-full bg-espresso-800 text-caramel-200 text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                {cashierInitials}
              </span>
              <span className="text-sm text-espresso-800 truncate max-w-[9rem]">{currentUser?.displayName}</span>
            </div>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-400" />
            <input
              className="input pl-11 py-3 bg-cream-50"
              placeholder="Search or scan a barcode..."
              aria-label="Search products or scan a barcode"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                // A barcode scanner types the code and presses Enter: add that product
                if (e.key !== 'Enter') return;
                const hit = findByCode(products.filter(p => p.isAvailable), search);
                if (!hit) return;
                e.preventDefault();
                addItem(hit);
                setSearch('');
                toast.success(`Added ${hit.name}`, { id: 'scan', duration: 1500 });
              }}
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex gap-2 px-4 sm:px-6 pb-4 overflow-x-auto scrollbar-none flex-shrink-0">
          <button
            onClick={() => setActiveCat('')}
            className={`pill ${!activeCat ? 'active' : ''}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> All
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`pill ${activeCat === c.id ? 'active' : ''}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-24 lg:pb-6">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="card p-3 animate-pulse">
                  <div className="w-full h-28 bg-cream-300/60 rounded-2xl mb-3" />
                  <div className="h-4 bg-cream-300/60 rounded-full w-3/4 mb-2" />
                  <div className="h-3 bg-cream-200 rounded-full w-1/2" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16 text-bark-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No products available</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {filteredProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => addItem(p)}
                  className="card p-2 text-left hover:shadow-lift hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98] group"
                >
                  <div className="h-28 sm:h-32 rounded-2xl overflow-hidden bg-gradient-to-br from-cream-200 to-cream-300 relative">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-9 h-9 text-caramel-500/60" />
                      </div>
                    )}
                    {p.imageUrl && <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-espresso-950/40 to-transparent" />}
                  </div>
                  <div className="px-1.5 pt-2.5 pb-1 flex items-end gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-espresso-900 text-sm truncate">{p.name}</p>
                      <p className="text-[11px] text-bark-400 truncate">{productDetails(p) || p.categoryName}</p>
                      <p className="font-display font-semibold text-lg text-espresso-800 leading-tight mt-0.5">{formatCurrency(p.price)}</p>
                    </div>
                    <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-espresso-900 shadow-glow bg-gradient-to-b from-caramel-200 to-caramel-400 group-hover:scale-110 transition-transform">
                      <Plus className="w-4 h-4" />
                    </span>
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
          ${cartOpen ? 'translate-x-0' : 'translate-x-full max-lg:invisible'} lg:translate-x-0
          transition-[transform,visibility] duration-300 flex flex-col bg-cream-50 border-l border-cream-300 lg:shadow-[-12px_0_30px_-18px_rgb(var(--espresso-800)/0.35)]
        `}
      >
        <div className="p-5 border-b border-cream-300/70">
          <h2 className="font-display text-xl text-espresso-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-caramel-600" />
            Current Order
            {itemCount > 0 && (
              <span className="badge-dark">{itemCount}</span>
            )}
            {/* Mobile: close the cart and go back to the menu */}
            <button
              onClick={() => setCartOpen(false)}
              className="lg:hidden ml-auto icon-btn"
              title="Back to menu"
            >
              <X className="w-5 h-5" />
            </button>
          </h2>
          {/* Table/Customer info */}
          <div className="flex gap-2 mt-4">
            <input
              className="input flex-1 py-2 text-sm"
              placeholder="Table #"
              value={tableNumber}
              onChange={e => setTableNumber(e.target.value)}
            />
            <input
              className="input flex-1 py-2 text-sm"
              placeholder="Customer"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
            />
          </div>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {cartItems.length === 0 ? (
            <div className="text-center py-16 text-bark-400">
              <span className="w-16 h-16 mx-auto mb-3 rounded-full bg-cream-200 flex items-center justify-center">
                <Package className="w-7 h-7 text-caramel-500/70" />
              </span>
              <p className="text-sm font-medium text-bark-500">Cart is empty</p>
              <p className="text-xs mt-1">Select items from the menu</p>
            </div>
          ) : cartItems.map((item, n) => (
            <div key={`${item.productId}-${item.variantId || ''}`} className="flex items-center gap-3 p-2.5 bg-cream-100 border border-cream-300/60 rounded-2xl">
              <div className="w-11 h-11 rounded-xl overflow-hidden bg-cream-200 flex-shrink-0 flex items-center justify-center">
                {item.imageUrl
                  ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                  : <Package className="w-4 h-4 text-caramel-500/70" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-espresso-800 truncate">{item.productName}</p>
                {(item.variantName || item.details) && <p className="text-xs text-bark-400 truncate">{[item.variantName, item.details].filter(Boolean).join(' · ')}</p>}
                {(pricing.lines[n]?.discount ?? 0) > 0 ? (
                  <p className="text-sm font-semibold">
                    <span className="text-caramel-700">{formatCurrency(pricing.lines[n].net)}</span>{' '}
                    <span className="text-xs font-normal text-bark-400 line-through">{formatCurrency(pricing.lines[n].gross)}</span>
                    <span className="block truncate text-[11px] font-medium text-emerald-700">{item.discount?.name}</span>
                  </p>
                ) : (
                  <p className="text-sm text-caramel-700 font-semibold">{formatCurrency(item.price * item.quantity)}</p>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <div className="flex items-center rounded-full bg-cream-50 border border-cream-400/70 p-0.5">
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity - 1, item.variantId)}
                    className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-cream-200 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-3 h-3 text-bark-600" />
                  </button>
                  <span className="w-7 text-center text-sm font-semibold text-espresso-800">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.productId, item.quantity + 1, item.variantId)}
                    className="w-6 h-6 rounded-full flex items-center justify-center bg-espresso-800 hover:bg-espresso-700 transition-colors"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-3 h-3 text-cream-50" />
                  </button>
                </div>
                <button
                  onClick={() => setDiscountFor({ productId: item.productId, variantId: item.variantId })}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${item.discount ? 'text-emerald-700 bg-emerald-50' : 'text-bark-300 hover:text-caramel-700 hover:bg-cream-200'}`}
                  aria-label={`Discount on ${item.productName}`}
                  title="Discount on this item"
                >
                  <Tag className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeItem(item.productId, item.variantId)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-bark-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  aria-label="Remove item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Discount */}
        {cartItems.length > 0 && (
          <div className="px-4 py-3 border-t border-cream-300/70">
            {/* A discount on the whole order, or Senior citizen / PWD */}
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-caramel-600 shrink-0" aria-hidden="true" />
              {senior || orderDiscount ? (
                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-emerald-700">
                  {senior ? `${SENIOR_LABEL[senior.type]} · ${senior.name}` : orderDiscount?.name}
                </span>
              ) : (
                <span className="text-sm text-bark-600 flex-1">Discount</span>
              )}
              <button onClick={() => setDiscountFor('order')} className="btn-secondary px-3.5 py-1.5 text-xs">
                {senior || orderDiscount ? 'Change' : 'Add discount'}
              </button>
              {(senior || orderDiscount) && (
                <button
                  onClick={() => { setSenior(null); setOrderDiscount(null); }}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-bark-400 hover:text-red-500 hover:bg-red-50"
                  aria-label="Remove the discount" title="Remove the discount"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Totals & Actions */}
        <div className="p-4 border-t border-cream-300/70 space-y-2 bg-cream-100/70">
          <div className="flex justify-between text-sm text-bark-600">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <MoneyLines />
          <div className="flex justify-between items-baseline font-display text-espresso-900 pt-2 border-t border-dashed border-cream-400">
            <span className="text-lg">Total</span>
            <span className="text-2xl font-semibold">{formatCurrency(total)}</span>
          </div>
          <button
            onClick={() => setCheckoutOpen(true)}
            disabled={cartItems.length === 0}
            className="w-full btn-primary py-3.5 text-base !mt-3"
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
          className="lg:hidden fixed bottom-[calc(var(--tabbar-h,0px)+0.75rem)] left-3 right-3 z-30 flex items-center gap-3 px-5 py-3.5 rounded-full espresso-surface text-cream-50 shadow-lift active:brightness-110"
        >
          <span className="relative">
            <ShoppingCart className="w-6 h-6 text-caramel-300" />
            <span className="absolute -top-2 -right-2 bg-caramel-300 text-espresso-900 text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{itemCount}</span>
          </span>
          <span className="font-medium">View Order</span>
          <span className="ml-auto font-display text-lg">{formatCurrency(total)}</span>
        </button>
      )}

      {/* Discount window: one item, or the whole order (with Senior / PWD) */}
      {discountFor && (discountFor === 'order' || discountLine) && (
        <DiscountSheet
          itemName={discountLine?.productName}
          saved={savedDiscounts}
          current={discountFor === 'order' ? orderDiscount : discountLine?.discount ?? null}
          senior={discountFor === 'order' ? senior : undefined}
          vatRegistered={shopInfo.vatRegistered}
          onApply={d => (discountLine ? setItemDiscount(discountLine.productId, discountLine.variantId, d) : setOrderDiscount(d))}
          onRemove={() => (discountLine ? setItemDiscount(discountLine.productId, discountLine.variantId, null) : setOrderDiscount(null))}
          onSenior={discountFor === 'order' ? setSenior : undefined}
          onClose={() => setDiscountFor(null)}
        />
      )}

      {/* Checkout Modal */}
      {checkoutOpen && (
        <Portal>
        <div className="modal-backdrop">
          <div className="modal-panel max-w-md max-h-[92vh] overflow-y-auto">
            <div className="modal-header">
              <div>
                <p className="eyebrow text-2xl -mb-1">Almost there</p>
                <h2 className="font-display text-2xl text-espresso-900">Checkout</h2>
              </div>
              <button onClick={() => setCheckoutOpen(false)} className="icon-btn" title="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Order Summary */}
              <div className="bg-cream-200/60 border border-cream-300 rounded-2xl p-4 space-y-1.5">
                {cartItems.map((i, n) => (
                  <div key={`${i.productId}-${i.variantId}`} className="flex justify-between text-sm">
                    <span className="text-bark-700">{i.productName} × {i.quantity}</span>
                    <span className="text-espresso-800">{formatCurrency(pricing.lines[n]?.net ?? i.price * i.quantity)}</span>
                  </div>
                ))}
                {(pricing.discount > 0 || pricing.lessVat > 0) && (
                  <div className="pt-1 border-t border-cream-400/70"><MoneyLines /></div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-cream-500">
                  <span className="font-semibold text-espresso-900">Total</span>
                  <span className="font-display text-2xl font-semibold text-espresso-900">{formatCurrency(total)}</span>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="label">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => {
                    const available = methodAvailable(value);
                    return (
                      <button
                        key={value}
                        disabled={!available}
                        title={available ? undefined : 'Not set up yet'}
                        onClick={() => { setPaymentMethod(value); setERef(''); setEReceived(false); }}
                        className={`flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                          paymentMethod === value
                            ? 'border-espresso-800 bg-espresso-800 text-cream-50 shadow-[0_8px_18px_-8px_rgb(var(--espresso-900)/0.8)]'
                            : 'border-cream-400/70 bg-cream-50 text-bark-500 hover:border-caramel-400 hover:text-espresso-800'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-semibold">{label}</span>
                      </button>
                    );
                  })}
                </div>
                {(!walletReady(paySettings, 'gcash') || !walletReady(paySettings, 'maya') || !paySettings.card.enabled) && (
                  <p className="mt-2 text-xs text-bark-500">
                    Some methods aren't set up.{' '}
                    {isAdmin
                      ? <Link to="/admin/payments" className="font-semibold text-caramel-700 hover:underline">Set up in Payment Settings</Link>
                      : 'Ask an admin to set them up in Payment Settings.'}
                  </p>
                )}
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
                    <div className="flex justify-between text-sm mt-2 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-full">
                      <span className="text-emerald-700">Change</span>
                      <span className="font-semibold text-emerald-700">{formatCurrency(change)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* E-wallet: the store's own GCash/Maya QR */}
              {walletMethod && wallet && walletReady(paySettings, walletMethod) && (
                <div className="rounded-3xl border border-cream-300 bg-cream-100 p-4 sm:p-5 space-y-4">
                  <div className="text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-bark-500">
                      Customer pays the store's {WALLET_LABEL[walletMethod]}
                    </p>
                    <p className="mt-1 font-display text-4xl font-semibold text-espresso-900">{formatCurrency(total)}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => setQrFullscreen(true)}
                      title="Tap to enlarge for the customer"
                      className="group relative rounded-2xl bg-white p-2 ring-1 ring-cream-300 shadow-card hover:ring-caramel-400 transition"
                    >
                      <img src={wallet.qrImageUrl} alt={`${WALLET_LABEL[walletMethod]} QR`} className="w-48 h-48 object-contain" />
                      <span className="absolute bottom-2 right-2 rounded-full bg-espresso-900/80 p-1.5 text-cream-50 group-hover:bg-espresso-900">
                        <Maximize2 className="w-3.5 h-3.5" />
                      </span>
                    </button>
                    <p className="mt-2 text-sm font-medium text-espresso-800 text-center">
                      {wallet.accountName}{wallet.accountHint && ` · ${wallet.accountHint}`}
                    </p>
                    <p className="text-[11px] text-bark-400">Tap the QR to show it full screen</p>
                  </div>
                  <div>
                    <label htmlFor="e-ref" className="label">{`${WALLET_LABEL[walletMethod]} reference no. *`}</label>
                    <input
                      id="e-ref"
                      className="input font-mono"
                      autoComplete="off"
                      maxLength={30}
                      value={eRef}
                      onChange={e => setERef(normalizeReference(e.target.value))}
                      placeholder={walletMethod === 'gcash' ? '13-digit reference' : 'Reference from the Maya receipt'}
                    />
                    {eRef && refIssue && <p className="text-xs text-amber-700 mt-1 px-1">{refIssue}</p>}
                  </div>
                  <label className="flex items-start gap-3 rounded-2xl border border-cream-300 bg-cream-50 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eReceived}
                      onChange={e => setEReceived(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-espresso-700 flex-shrink-0"
                    />
                    <span className="text-sm text-espresso-800">
                      I saw <strong>{formatCurrency(total)}</strong> received in the store's {WALLET_LABEL[walletMethod]}.
                    </span>
                  </label>
                </div>
              )}

              {/* Card: optional approval code */}
              {paymentMethod === 'card' && (
                <div>
                  <label htmlFor="card-code" className="label">Approval code <span className="font-normal text-bark-400">(optional)</span></label>
                  <input
                    id="card-code"
                    className="input font-mono"
                    autoComplete="off"
                    maxLength={30}
                    value={eRef}
                    onChange={e => setERef(normalizeReference(e.target.value))}
                    placeholder="From the card terminal slip"
                  />
                  {refIssue && <p className="text-xs text-amber-700 mt-1 px-1">{refIssue}</p>}
                </div>
              )}

              <div>
                <label className="label">Notes (optional)</label>
                <input className="input" placeholder="Special instructions..." value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setCheckoutOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={placeOrder} disabled={!canConfirm} className="btn-primary flex-1">
                {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {placing ? 'Processing...' : 'Confirm Order'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Full-screen store QR for the customer to scan (above the checkout modal) */}
      {qrFullscreen && wallet && (
        <Portal>
          <div
            className="fixed inset-0 z-[60] bg-white flex flex-col items-center justify-center p-6 text-espresso-900"
            onClick={() => setQrFullscreen(false)}
            role="dialog"
            aria-label="Payment QR"
          >
            <img src={wallet.qrImageUrl} alt="" className="w-[min(90vw,70vh)] h-[min(90vw,70vh)] object-contain [image-rendering:pixelated]" />
            <p className="mt-4 font-display text-4xl font-semibold">{formatCurrency(total)}</p>
            <p className="text-sm text-bark-600">{wallet.accountName} {wallet.accountHint}</p>
            <p className="mt-6 text-xs text-bark-500">Tap anywhere to close</p>
          </div>
        </Portal>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <Portal>
        <div className="modal-backdrop">
          <div className="modal-panel max-w-sm max-h-[92vh] overflow-y-auto">
            <div className="p-6 text-center border-b border-cream-300/70">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3 ring-8 ring-emerald-50">
                <CheckCircle className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="font-display text-2xl text-espresso-900">Order Placed!</h2>
              <p className="text-bark-500 text-sm mt-1 font-mono">{receipt.orderNumber}</p>
            </div>

            {/* The receipt (id="receipt" is what the @media print rules print) */}
            <Receipt ref={receiptRef} order={receipt} shopName={brand.name} info={shopInfo} />

            <div className="modal-footer">
              <button onClick={printReceipt} className="btn-secondary flex-1">
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
