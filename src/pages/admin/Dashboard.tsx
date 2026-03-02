import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { TrendingUp, ShoppingBag, Users, Package, AlertTriangle, ArrowUpRight, Coffee } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import type { Order, InventoryItem } from '@/types';

const COLORS = ['#c46820', '#e58a33', '#f5c07a', '#a73c12', '#6a3714'];

export default function AdminDashboard() {
  const [todayStats, setTodayStats] = useState({ sales: 0, orders: 0, avgOrder: 0 });
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      const today = new Date();
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);

      // Today's orders
      const todayQ = query(
        collection(db, 'orders'),
        where('createdAt', '>=', todayStart.toISOString()),
        where('createdAt', '<=', todayEnd.toISOString()),
        where('status', '==', 'completed')
      );
      const todaySnap = await getDocs(todayQ);
      const todayOrders = todaySnap.docs.map(d => d.data() as Order);
      const todaySales = todayOrders.reduce((s, o) => s + o.total, 0);
      setTodayStats({
        sales: todaySales,
        orders: todayOrders.length,
        avgOrder: todayOrders.length ? todaySales / todayOrders.length : 0,
      });

      // Weekly data
      const weekData = [];
      for (let i = 6; i >= 0; i--) {
        const day = subDays(today, i);
        const dayStart = startOfDay(day).toISOString();
        const dayEnd = endOfDay(day).toISOString();
        const q = query(
          collection(db, 'orders'),
          where('createdAt', '>=', dayStart),
          where('createdAt', '<=', dayEnd),
          where('status', '==', 'completed')
        );
        const snap = await getDocs(q);
        const dayOrders = snap.docs.map(d => d.data() as Order);
        weekData.push({
          date: format(day, 'EEE'),
          sales: dayOrders.reduce((s, o) => s + o.total, 0),
          orders: dayOrders.length,
        });
      }
      setWeeklyData(weekData);

      // Recent orders
      const recentQ = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5));
      const recentSnap = await getDocs(recentQ);
      setRecentOrders(recentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));

      // Low stock
      const stockSnap = await getDocs(collection(db, 'inventory'));
      const items = stockSnap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem));
      setLowStockItems(items.filter(i => i.quantity <= i.minStock));

    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      label: "Today's Sales",
      value: formatCurrency(todayStats.sales),
      icon: TrendingUp,
      color: 'bg-espresso-600',
      change: '+12%',
    },
    {
      label: "Today's Orders",
      value: todayStats.orders.toString(),
      icon: ShoppingBag,
      color: 'bg-amber-500',
      change: '+5%',
    },
    {
      label: 'Average Order',
      value: formatCurrency(todayStats.avgOrder),
      icon: Coffee,
      color: 'bg-bark-600',
      change: '+8%',
    },
    // {
    //   label: 'Low Stock Alerts',
    //   value: lowStockItems.length.toString(),
    //   icon: AlertTriangle,
    //   color: lowStockItems.length > 0 ? 'bg-red-500' : 'bg-emerald-500',
    //   change: lowStockItems.length > 0 ? 'Needs attention' : 'All good',
    // },
  ];

  if (loading) {
    return (
      <div className="p-8 animate-pulse space-y-6">
        <div className="h-8 bg-cream-200 rounded-xl w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-cream-200 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl text-espresso-900">Dashboard</h1>
        <p className="text-bark-500 text-sm mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className={`${stat.color} w-10 h-10 rounded-xl flex items-center justify-center`}>
                <stat.icon className="w-5 h-5 text-white" />
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <ArrowUpRight className="w-3 h-3" />
                {stat.change}
              </span>
            </div>
            <p className="text-2xl font-display font-semibold text-espresso-900">{stat.value}</p>
            <p className="text-sm text-bark-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Sales */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-display text-lg text-espresso-800 mb-6">Weekly Sales</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#c46820" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#c46820" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3d9be" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#8f5e4b' }} />
              <YAxis tick={{ fontSize: 12, fill: '#8f5e4b' }} tickFormatter={v => `₱${v}`} />
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), 'Sales']}
                contentStyle={{ borderRadius: 12, border: '1px solid #f3d9be', fontSize: 13 }}
              />
              <Area type="monotone" dataKey="sales" stroke="#c46820" strokeWidth={2.5} fill="url(#salesGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Orders Bar */}
        <div className="card p-6">
          <h2 className="font-display text-lg text-espresso-800 mb-6">Daily Orders</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3d9be" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8f5e4b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8f5e4b' }} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f3d9be', fontSize: 13 }} />
              <Bar dataKey="orders" fill="#e09d4d" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="card p-6">
          <h2 className="font-display text-lg text-espresso-800 mb-4">Recent Orders</h2>
          {recentOrders.length === 0 ? (
            <div className="text-center py-8 text-bark-400">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No orders yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-cream-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-espresso-800">{order.orderNumber}</p>
                    <p className="text-xs text-bark-400">{formatDateTime(order.createdAt)} · {order.cashierName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-espresso-700">{formatCurrency(order.total)}</p>
                    <span className={`badge text-xs ${
                      order.status === 'completed' ? 'badge-success' :
                      order.status === 'cancelled' ? 'badge-danger' : 'badge-warning'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Low Stock */}
        <div className="card p-6">
          <h2 className="font-display text-lg text-espresso-800 mb-4 flex items-center gap-2">
            Low Stock Alerts
            {lowStockItems.length > 0 && (
              <span className="badge badge-danger">{lowStockItems.length}</span>
            )}
          </h2>
          {lowStockItems.length === 0 ? (
            <div className="text-center py-8 text-bark-400">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">All stock levels are adequate</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lowStockItems.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-cream-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-espresso-800">{item.name}</p>
                    <p className="text-xs text-bark-400">Min: {item.minStock} {item.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${item.quantity === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {item.quantity} {item.unit}
                    </p>
                    <span className={`badge text-xs ${item.quantity === 0 ? 'badge-danger' : 'badge-warning'}`}>
                      {item.quantity === 0 ? 'Out of stock' : 'Low'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
