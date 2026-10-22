import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Order } from '@/types';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ShoppingBag, TrendingUp, Clock, ArrowRight, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import StatCard from '@/components/shared/StatCard';

export default function StaffDashboard() {
  const { currentUser } = useAuth();
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [todayStats, setTodayStats] = useState({ sales: 0, orders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMyData(); }, []);

  async function fetchMyData() {
    if (!currentUser) return;
    setLoading(true);
    try {
      // Today's orders by LOCAL day. (createdAt is a UTC ISO string, so matching
      // it against today's local date string missed everything before 8 AM in PH.)
      // Cashier is filtered in JS to avoid a composite index requirement.
      const now = new Date();
      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', startOfDay(now).toISOString()),
        where('createdAt', '<=', endOfDay(now).toISOString()),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Order))
        .filter(o => o.cashierId === currentUser.id);

      setMyOrders(sorted);

      const completed = sorted.filter(o => o.status === 'completed');
      setTodayStats({
        sales: completed.reduce((s, o) => s + o.total, 0),
        orders: completed.length,
      });
    } catch (err) {
      console.error('[Dashboard] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in max-w-[1400px] mx-auto">
      {/* Greeting banner — theme colours only (no coffee photo/decor in the shop app;
          a shop's own background photo comes with branding, Phase B) */}
      <div className="relative overflow-hidden rounded-4xl espresso-surface text-cream-50 p-6 sm:p-8 lg:p-10 shadow-lift isolate">
        <div className="absolute -right-16 -top-24 -z-10 w-80 h-80 rounded-full bg-caramel-400/15 blur-2xl" aria-hidden="true" />
        <div className="absolute right-24 -bottom-28 -z-10 w-72 h-72 rounded-full border border-caramel-300/20" aria-hidden="true" />
        <div className="absolute right-8 -bottom-16 -z-10 w-48 h-48 rounded-full border border-caramel-300/15" aria-hidden="true" />

        <p className="text-caramel-200/90 text-sm">{format(now, 'EEEE, MMMM d, yyyy')}</p>
        <p className="font-script text-4xl sm:text-5xl text-caramel-300 mt-2 leading-none">{greeting},</p>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold mt-1">{currentUser?.displayName?.split(' ')[0]}!</h1>
        <p className="text-cream-100/80 mt-3 text-sm sm:text-base max-w-md">Ready for a great day of sales?</p>
        <Link to="/staff/pos" className="btn-caramel mt-6 px-6 py-3">
          <ShoppingBag className="w-4 h-4" />
          Start Taking Orders
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard icon={TrendingUp} label="My Sales Today" value={formatCurrency(todayStats.sales)} loading={loading} tone="espresso" />
        <StatCard icon={ShoppingBag} label="Orders Processed" value={String(todayStats.orders)} loading={loading} tone="caramel" />
      </div>

      {/* Recent Orders */}
      <div className="card p-6">
        <h2 className="font-display text-xl text-espresso-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-caramel-600" /> My Recent Orders
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-cream-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : myOrders.length === 0 ? (
          <div className="text-center py-12 text-bark-400">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No orders yet today</p>
            <Link to="/staff/pos" className="text-caramel-700 font-semibold hover:underline text-sm mt-1 inline-block">
              Start taking orders →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {myOrders.slice(0, 10).map(order => (
              <div key={order.id} className="flex items-center gap-3 py-2.5 px-3 bg-cream-100 border border-cream-300/60 rounded-2xl">
                <span className="w-9 h-9 rounded-2xl bg-cream-200 text-caramel-700 flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-espresso-800 truncate">{order.orderNumber}</p>
                  <p className="text-xs text-bark-400">{formatDateTime(order.createdAt)}</p>
                </div>
                <p className="text-sm font-semibold text-espresso-800">{formatCurrency(order.total)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
