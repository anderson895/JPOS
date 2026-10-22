import {
  LayoutDashboard, ShoppingCart, Package, FileText, Settings, LogOut,
  Wallet, ShoppingBag, Coffee, ArrowUpRight, ChevronDown,
} from 'lucide-react';
import BrandMark from '@/components/shared/BrandMark';

// Illustration only — sample numbers, not live data.
const STATS = [
  { icon: Wallet, label: 'Total Sales', value: '₱12,450.00', change: '12%' },
  { icon: ShoppingBag, label: 'Total Orders', value: '128', change: '8%' },
  { icon: Coffee, label: 'Total Items Sold', value: '42', change: '15%' },
];
const TOP_ITEMS = [
  { name: 'Americano', pct: 35 },
  { name: 'Latte', pct: 28 },
  { name: 'Cappuccino', pct: 20 },
  { name: 'Mocha', pct: 17 },
];
const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: ShoppingCart, label: 'Sales' },
  { icon: Package, label: 'Products' },
  { icon: FileText, label: 'Reports' },
  { icon: Settings, label: 'Settings' },
  { icon: LogOut, label: 'Logout' },
];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const POINTS = [22, 34, 27, 46, 38, 60, 82];

function chartPaths(w: number, h: number) {
  const step = w / (POINTS.length - 1);
  const pts = POINTS.map((v, i) => [i * step, h - (v / 100) * h] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
}

/** Static dashboard preview for the landing page ("Powerful Dashboard"). */
export default function DashboardMock() {
  const { line, area } = chartPaths(300, 110);
  return (
    <div
      role="img"
      aria-label="Preview of the JPOS admin dashboard showing sales, orders and top-selling items"
      className="relative flex overflow-hidden rounded-3xl ring-1 ring-white/20 bg-cream-100 text-espresso-900 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.85)]"
    >
      {/* Mini sidebar */}
      <aside className="hidden sm:flex w-36 flex-shrink-0 flex-col gap-1 espresso-surface p-3">
        <BrandMark tone="dark" size="sm" className="mb-3 px-1" />
        {NAV.map(({ icon: Icon, label, active }) => (
          <span key={label} className={`sidebar-link !px-3 !py-2 text-xs ${active ? 'active' : ''}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </span>
        ))}
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 p-4 sm:p-5 app-bg">
        <div className="flex items-center justify-between">
          <p className="font-display text-xl font-semibold">Dashboard</p>
          <span className="inline-flex items-center gap-1 rounded-full border border-cream-400 bg-cream-50 px-3 py-1 text-[11px] text-bark-600">
            Today <ChevronDown className="w-3 h-3" />
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          {STATS.map(({ icon: Icon, label, value, change }) => (
            <div key={label} className="rounded-2xl bg-cream-50 border border-cream-300 p-2.5 sm:p-3 shadow-sm">
              <p className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-bark-600">
                <Icon className="w-3.5 h-3.5 text-caramel-600" /> {label}
              </p>
              <p className="mt-1 font-display font-semibold text-sm sm:text-lg truncate">{value}</p>
              <p className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                <ArrowUpRight className="w-3 h-3" /> {change}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1.35fr_1fr]">
          <div className="rounded-2xl bg-cream-50 border border-cream-300 p-3 shadow-sm">
            <p className="text-xs font-semibold">Sales Overview</p>
            <svg viewBox="0 0 300 130" className="mt-2 w-full h-auto" aria-hidden="true">
              <defs>
                <linearGradient id="mock-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#cc8745" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#cc8745" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map(i => (
                <line key={i} x1="0" x2="300" y1={i * 36 + 2} y2={i * 36 + 2} stroke="#efdfc9" strokeDasharray="3 4" />
              ))}
              <path d={area} fill="url(#mock-area)" />
              <path d={line} fill="none" stroke="#6f4428" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              {DAYS.map((d, i) => (
                <text key={d} x={(i * 300) / 6} y="127" fontSize="9" fill="#8c6f57" textAnchor={i === 0 ? 'start' : i === 6 ? 'end' : 'middle'}>
                  {d}
                </text>
              ))}
            </svg>
          </div>

          <div className="rounded-2xl bg-cream-50 border border-cream-300 p-3 shadow-sm">
            <p className="text-xs font-semibold">Top Selling Items</p>
            <ul className="mt-2 space-y-2.5">
              {TOP_ITEMS.map(({ name, pct }) => (
                <li key={name}>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="w-5 h-5 rounded-full bg-espresso-800 text-caramel-200 flex items-center justify-center">
                      <Coffee className="w-3 h-3" />
                    </span>
                    <span className="flex-1">{name}</span>
                    <span className="text-bark-500">{pct}%</span>
                  </div>
                  <div className="meter mt-1"><span style={{ width: `${pct * 2.2}%` }} /></div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
