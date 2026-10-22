import { useState, useEffect } from 'react';
import { query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { tenantCol } from '@/lib/tenant';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { TrendingUp, ShoppingBag, Coffee, Receipt, CalendarDays, Award, Lock } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';
import { useChartTheme } from '@/components/shared/chartTheme';
import type { Order } from '@/types';
import toast from 'react-hot-toast';

type DayStats = { date: string; sales: number; orders: number };
type TopItem = { name: string; qty: number };

/** % change vs. the previous value, or null when there's nothing to compare against. */
function pctChange(current: number, previous: number): number | null {
  return previous ? ((current - previous) / previous) * 100 : null;
}

function TrendsLocked({ height }: { height: number }) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-3xl bg-cream-100 border border-dashed border-cream-400 px-6" style={{ height }}>
      <Lock className="w-6 h-6 text-caramel-600" aria-hidden="true" />
      <p className="mt-2 text-sm text-bark-600">Sales trends are included in the Business and Enterprise packages.</p>
    </div>
  );
}

export default function AdminDashboard() {
  // 7-day trend charts are a package feature (Business and up)
  const trends = !!useAuth().tenant?.entitlements?.trends;
  const { CHART, TOOLTIP_STYLE } = useChartTheme();
  const [weeklyData, setWeeklyData] = useState<DayStats[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [yesterdaySoFar, setYesterdaySoFar] = useState({ sales: 0, orders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      const today = new Date();

      // One query for the last 7 days (today included), bucketed per day below.
      // Status is filtered in JS to avoid a composite index requirement.
      const weekQ = query(
        tenantCol('orders'),
        where('createdAt', '>=', startOfDay(subDays(today, 6)).toISOString()),
        where('createdAt', '<=', endOfDay(today).toISOString()),
      );
      const weekSnap = await getDocs(weekQ);
      const weekOrders = weekSnap.docs
        .map(d => d.data() as Order)
        .filter(o => o.status === 'completed');

      const weekData: DayStats[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = subDays(today, i);
        const dayStart = startOfDay(day).toISOString();
        const dayEnd = endOfDay(day).toISOString();
        const dayOrders = weekOrders.filter(o => o.createdAt >= dayStart && o.createdAt <= dayEnd);
        weekData.push({
          date: format(day, 'EEE'),
          sales: dayOrders.reduce((s, o) => s + o.total, 0),
          orders: dayOrders.length,
        });
      }
      setWeeklyData(weekData);

      // Yesterday up to this same time of day. Comparing today-so-far with ALL of
      // yesterday made every morning look like a big drop.
      const yStart = startOfDay(subDays(today, 1)).toISOString();
      const yNow = subDays(today, 1).toISOString();
      const ySoFar = weekOrders.filter(o => o.createdAt >= yStart && o.createdAt <= yNow);
      setYesterdaySoFar({ sales: ySoFar.reduce((s, o) => s + o.total, 0), orders: ySoFar.length });

      // Top sellers of the week — ranked by quantity, since item subtotals are pre-discount.
      const qtyByProduct: Record<string, TopItem> = {};
      weekOrders.forEach(o => o.items.forEach(item => {
        if (!qtyByProduct[item.productId]) qtyByProduct[item.productId] = { name: item.productName, qty: 0 };
        qtyByProduct[item.productId].qty += item.quantity;
      }));
      setTopItems(Object.values(qtyByProduct).sort((a, b) => b.qty - a.qty).slice(0, 5));

      // Recent orders
      const recentQ = query(tenantCol('orders'), orderBy('createdAt', 'desc'), limit(5));
      const recentSnap = await getDocs(recentQ);
      setRecentOrders(recentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Order)));

    } catch (err) {
      console.error('Dashboard error:', err);
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  // Today is the last day of the weekly data; it's compared with yesterday up to the same time
  const todayData = weeklyData[6] ?? { sales: 0, orders: 0 };
  const avgOrder = (d: { sales: number; orders: number }) => (d.orders ? d.sales / d.orders : 0);

  const statCards = [
    {
      label: "Today's Sales",
      value: formatCurrency(todayData.sales),
      icon: TrendingUp,
      tone: 'espresso' as const,
      change: pctChange(todayData.sales, yesterdaySoFar.sales),
    },
    {
      label: "Today's Orders",
      value: todayData.orders.toString(),
      icon: ShoppingBag,
      tone: 'caramel' as const,
      change: pctChange(todayData.orders, yesterdaySoFar.orders),
    },
    {
      label: 'Average Order',
      value: formatCurrency(avgOrder(todayData)),
      icon: Coffee,
      tone: 'cream' as const,
      change: pctChange(avgOrder(todayData), avgOrder(yesterdaySoFar)),
    },
  ];

  const topQty = topItems[0]?.qty || 1;

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 animate-pulse space-y-6 max-w-[1400px] mx-auto">
        <div className="h-10 bg-cream-300/60 rounded-full w-56" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 bg-cream-300/50 rounded-3xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 bg-cream-300/50 rounded-3xl" />
          <div className="h-80 bg-cream-300/50 rounded-3xl" />
        </div>
        <div className="h-64 bg-cream-300/50 rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Here's how your business is doing."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-cream-400/70 bg-cream-50 px-4 py-2 text-sm text-espresso-800 shadow-sm">
            <CalendarDays className="w-4 h-4 text-caramel-600" />
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </span>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <StatCard
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            tone={stat.tone}
            change={stat.change}
            changeHint="vs same time yesterday"
          />
        ))}
      </div>

      {/* Sales overview + top sellers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl text-espresso-900">Sales Overview</h2>
            <span className="badge-info">Last 7 days</span>
          </div>
          {trends ? <ResponsiveContainer width="100%" height={290}>
            <AreaChart data={weeklyData}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART.accent} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={CHART.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 4" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: CHART.tick }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: CHART.tick }} tickFormatter={v => `₱${v}`} axisLine={false} tickLine={false} width={60} />
              <Tooltip
                formatter={(v: number) => [formatCurrency(v), 'Sales']}
                contentStyle={TOOLTIP_STYLE}
              />
              <Area type="monotone" dataKey="sales" stroke={CHART.line} strokeWidth={2.5} fill="url(#salesGrad)" />
            </AreaChart>
          </ResponsiveContainer> : <TrendsLocked height={290} />}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display text-xl text-espresso-900">Top Selling Items</h2>
            <Award className="w-5 h-5 text-caramel-500" />
          </div>
          {topItems.length === 0 ? (
            <div className="text-center py-10 text-bark-400">
              <Coffee className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No sales this week yet</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {topItems.map((item, i) => (
                <li key={item.name}>
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-espresso-800 text-caramel-200 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-espresso-800 truncate">{item.name}</span>
                    <span className="text-xs font-medium text-bark-500">{item.qty} sold</span>
                  </div>
                  <div className="meter mt-2 ml-11 w-auto"><span style={{ width: `${(item.qty / topQty) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Daily orders + recent orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6">
          <h2 className="font-display text-xl text-espresso-900 mb-6">Daily Orders</h2>
          {trends ? <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 4" stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.tick }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: CHART.tick }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: CHART.cursor }} />
              <Bar dataKey="orders" fill={CHART.accent} radius={[8, 8, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer> : <TrendsLocked height={220} />}
        </div>

        <div className="lg:col-span-2 card p-6">
          <h2 className="font-display text-xl text-espresso-900 mb-4">Recent Orders</h2>
          {recentOrders.length === 0 ? (
            <div className="text-center py-8 text-bark-400">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No orders yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.map(order => (
                <div key={order.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-cream-200/50 transition-colors">
                  <span className="w-10 h-10 rounded-2xl bg-cream-200 text-caramel-700 flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-espresso-800 truncate">{order.orderNumber}</p>
                    <p className="text-xs text-bark-400 truncate">{formatDateTime(order.createdAt)} · {order.cashierName}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-espresso-800">{formatCurrency(order.total)}</p>
                    <span className="badge-info uppercase text-[10px]">{order.paymentMethod}</span>
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
