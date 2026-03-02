import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { Order } from '@/types';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Download, Calendar, TrendingUp, ShoppingBag, CreditCard, FileText, Printer } from 'lucide-react';

type Range = 'today' | 'week' | 'month' | 'custom';

const COLORS = ['#c46820', '#e09d4d', '#f5c07a', '#a73c12', '#6a3714', '#3c1209'];

export default function AdminReports() {
  const [range, setRange] = useState<Range>('week');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => { fetchOrders(); }, [range, customStart, customEnd]);

  function getDateRange() {
    const now = new Date();
    switch (range) {
      case 'today': return { start: startOfDay(now), end: endOfDay(now) };
      case 'week': return { start: startOfWeek(now), end: endOfWeek(now) };
      case 'month': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'custom': return {
        start: startOfDay(new Date(customStart)),
        end: endOfDay(new Date(customEnd)),
      };
    }
  }

  async function fetchOrders() {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const q = query(
        collection(db, 'orders'),
        where('createdAt', '>=', start.toISOString()),
        where('createdAt', '<=', end.toISOString()),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const completedOrders = orders.filter(o => o.status === 'completed');
  const totalSales = completedOrders.reduce((s, o) => s + o.total, 0);
  const totalOrders = completedOrders.length;
  const avgOrder = totalOrders ? totalSales / totalOrders : 0;
  const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;

  // Daily breakdown
  const dailyMap: Record<string, { sales: number; orders: number }> = {};
  completedOrders.forEach(o => {
    const day = format(new Date(o.createdAt), 'MM/dd');
    if (!dailyMap[day]) dailyMap[day] = { sales: 0, orders: 0 };
    dailyMap[day].sales += o.total;
    dailyMap[day].orders += 1;
  });
  const dailyData = Object.entries(dailyMap).map(([date, d]) => ({ date, ...d })).sort((a, b) => a.date.localeCompare(b.date));

  // Payment method breakdown
  const paymentMap: Record<string, number> = {};
  completedOrders.forEach(o => {
    paymentMap[o.paymentMethod] = (paymentMap[o.paymentMethod] || 0) + o.total;
  });
  const paymentData = Object.entries(paymentMap).map(([name, value]) => ({ name: name.toUpperCase(), value }));

  // Top products
  const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  completedOrders.forEach(o => {
    o.items.forEach(item => {
      if (!productMap[item.productId]) {
        productMap[item.productId] = { name: item.productName, qty: 0, revenue: 0 };
      }
      productMap[item.productId].qty += item.quantity;
      productMap[item.productId].revenue += item.subtotal;
    });
  });
  const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  function printReport() {
    window.print();
  }

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-espresso-900">Reports</h1>
          <p className="text-bark-500 text-sm mt-0.5">Sales analytics & insights</p>
        </div>
        <button onClick={printReport} className="btn-secondary flex items-center gap-2">
          <Printer className="w-4 h-4" /> Print Report
        </button>
      </div>

      {/* Date Range Selector */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <Calendar className="w-4 h-4 text-bark-500" />
        <div className="flex gap-1 bg-cream-100 p-1 rounded-xl">
          {(['today', 'week', 'month', 'custom'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${range === r ? 'bg-white text-espresso-800 shadow-sm' : 'text-bark-500 hover:text-bark-700'}`}>
              {r}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="input py-1.5 text-sm" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <span className="text-bark-400">→</span>
            <input type="date" className="input py-1.5 text-sm" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: formatCurrency(totalSales), icon: TrendingUp, color: 'bg-espresso-600' },
          { label: 'Total Orders', value: totalOrders.toString(), icon: ShoppingBag, color: 'bg-amber-500' },
          { label: 'Average Order', value: formatCurrency(avgOrder), icon: CreditCard, color: 'bg-bark-600' },
          { label: 'Cancelled', value: cancelledOrders.toString(), icon: FileText, color: 'bg-red-500' },
        ].map(s => (
          <div key={s.label} className="card p-5">
            <div className={`${s.color} w-10 h-10 rounded-xl flex items-center justify-center mb-3`}>
              <s.icon className="w-5 h-5 text-white" />
            </div>
            <p className="text-2xl font-display font-semibold text-espresso-900">{loading ? '—' : s.value}</p>
            <p className="text-sm text-bark-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Sales Chart */}
        <div className="lg:col-span-2 card p-6">
          <h2 className="font-display text-lg text-espresso-800 mb-6">Sales Over Time</h2>
          {dailyData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-bark-400 text-sm">No data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="reportGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c46820" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#c46820" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3d9be" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8f5e4b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8f5e4b' }} tickFormatter={v => `₱${v}`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v)]} contentStyle={{ borderRadius: 12, border: '1px solid #f3d9be' }} />
                <Area type="monotone" dataKey="sales" stroke="#c46820" strokeWidth={2.5} fill="url(#reportGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Payment Methods Pie */}
        <div className="card p-6">
          <h2 className="font-display text-lg text-espresso-800 mb-6">Payment Methods</h2>
          {paymentData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-bark-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={paymentData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {paymentData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, border: '1px solid #f3d9be' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Products */}
      <div className="card p-6">
        <h2 className="font-display text-lg text-espresso-800 mb-4">Top Products</h2>
        {topProducts.length === 0 ? (
          <p className="text-center py-8 text-bark-400 text-sm">No product data available</p>
        ) : (
          <table className="w-full">
            <thead><tr>
              <th className="table-header">#</th>
              <th className="table-header">Product</th>
              <th className="table-header">Qty Sold</th>
              <th className="table-header">Revenue</th>
              <th className="table-header">Share</th>
            </tr></thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={i} className="table-row">
                  <td className="table-cell text-bark-400">{i + 1}</td>
                  <td className="table-cell font-medium text-espresso-800">{p.name}</td>
                  <td className="table-cell font-mono">{p.qty}</td>
                  <td className="table-cell font-semibold text-espresso-700">{formatCurrency(p.revenue)}</td>
                  <td className="table-cell w-40">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-cream-200 rounded-full">
                        <div className="h-2 bg-espresso-500 rounded-full" style={{ width: `${(p.revenue / totalSales) * 100}%` }} />
                      </div>
                      <span className="text-xs text-bark-400 w-10">{((p.revenue / totalSales) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Orders Table */}
      <div className="card p-6">
        <h2 className="font-display text-lg text-espresso-800 mb-4">Order Details</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr>
              <th className="table-header">Order #</th>
              <th className="table-header">Date</th>
              <th className="table-header">Cashier</th>
              <th className="table-header">Items</th>
              <th className="table-header">Total</th>
              <th className="table-header">Payment</th>
              <th className="table-header">Status</th>
            </tr></thead>
            <tbody>
              {orders.slice(0, 50).map(o => (
                <tr key={o.id} className="table-row">
                  <td className="table-cell font-mono text-xs text-bark-600">{o.orderNumber}</td>
                  <td className="table-cell text-xs text-bark-500">{formatDateTime(o.createdAt)}</td>
                  <td className="table-cell">{o.cashierName}</td>
                  <td className="table-cell">{o.items.reduce((s, i) => s + i.quantity, 0)} items</td>
                  <td className="table-cell font-semibold">{formatCurrency(o.total)}</td>
                  <td className="table-cell uppercase text-xs">{o.paymentMethod}</td>
                  <td className="table-cell">
                    <span className={`badge ${o.status === 'completed' ? 'badge-success' : o.status === 'cancelled' ? 'badge-danger' : 'badge-warning'}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-bark-400 text-sm">No orders in selected period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
