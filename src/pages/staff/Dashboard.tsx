import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Order } from '@/types';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ShoppingBag, TrendingUp, Coffee, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

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
      const today = new Date();
      const start = startOfDay(today).toISOString();
      const end = endOfDay(today).toISOString();

      const q = query(
        collection(db, 'orders'),
        where('cashierId', '==', currentUser.id),
        where('createdAt', '>=', start),
        where('createdAt', '<=', end),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setMyOrders(orders);

      const completed = orders.filter(o => o.status === 'completed');
      setTodayStats({
        sales: completed.reduce((s, o) => s + o.total, 0),
        orders: completed.length,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Greeting */}
      <div className="bg-gradient-to-r from-espresso-700 to-espresso-600 rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="absolute right-6 top-6 opacity-20">
          <Coffee className="w-24 h-24" />
        </div>
        <p className="text-espresso-200 text-sm font-body">{format(now, 'EEEE, MMMM d, yyyy')}</p>
        <h1 className="font-display text-3xl mt-1">{greeting}, {currentUser?.displayName?.split(' ')[0]}!</h1>
        <p className="text-espresso-200 mt-2 text-sm">Ready to serve some great coffee today?</p>
        <Link to="/staff/pos" className="mt-4 inline-flex items-center gap-2 bg-white text-espresso-700 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-cream-50 transition-colors">
          <ShoppingBag className="w-4 h-4" />
          Start Taking Orders
        </Link>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="w-10 h-10 bg-espresso-100 rounded-xl flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5 text-espresso-600" />
          </div>
          <p className="text-2xl font-display font-semibold text-espresso-900">
            {loading ? '—' : formatCurrency(todayStats.sales)}
          </p>
          <p className="text-sm text-bark-500 mt-0.5">My Sales Today</p>
        </div>
        <div className="card p-5">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center mb-3">
            <ShoppingBag className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-display font-semibold text-espresso-900">
            {loading ? '—' : todayStats.orders}
          </p>
          <p className="text-sm text-bark-500 mt-0.5">Orders Processed</p>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card p-6">
        <h2 className="font-display text-lg text-espresso-800 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" /> My Recent Orders
        </h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 bg-cream-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : myOrders.length === 0 ? (
          <div className="text-center py-12 text-bark-400">
            <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No orders yet today</p>
            <Link to="/staff/pos" className="text-espresso-600 hover:underline text-sm mt-1 inline-block">
              Start taking orders →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {myOrders.slice(0, 10).map(order => (
              <div key={order.id} className="flex items-center justify-between py-2.5 px-3 bg-cream-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-espresso-800">{order.orderNumber}</p>
                  <p className="text-xs text-bark-400">{formatDateTime(order.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-espresso-700">{formatCurrency(order.total)}</p>
                  <span className={`badge text-xs ${
                    order.status === 'completed' ? 'badge-success' :
                    order.status === 'cancelled' ? 'badge-danger' : 'badge-warning'
                  }`}>{order.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
