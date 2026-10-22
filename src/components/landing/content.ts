import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, Package, Coffee, FileText, ShieldCheck, CreditCard,
  CupSoda, Croissant, UtensilsCrossed, Store, ShoppingBag, Scissors, Shirt, Car,
} from 'lucide-react';

/*
 * All landing-page copy in one place so marketing text can change without
 * touching layout code. Text follows reference_UI/FullUI.png.
 *
 * ⚠ PLACEHOLDERS: the testimonials, prices and external links below come from
 * the design mockup. Replace them with real data before going live.
 * Copy is written for every small business (docs/techlead/SUBSCRIPTION-PLAN.md §9.4)
 * (see docs/frontend/CHANGELOG.md → "Open items").
 */

export const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'features', label: 'Features' },
  { id: 'contact', label: 'Contact' },
] as const;

/** "Built for" chips in the hero: the kinds of small businesses JPOS serves. */
export const BUILT_FOR: { icon: LucideIcon; label: string }[] = [
  { icon: Coffee,          label: 'Café' },
  { icon: CupSoda,         label: 'Milk tea' },
  { icon: Croissant,       label: 'Bakery' },
  { icon: UtensilsCrossed, label: 'Restaurant' },
  { icon: Store,           label: 'Sari-sari' },
  { icon: ShoppingBag,     label: 'Retail' },
  { icon: Scissors,        label: 'Salon' },
  { icon: Shirt,           label: 'Laundry' },
  { icon: Car,             label: 'Car wash' },
];

export const ABOUT_POINTS = [
  'Easy to Use Interface',
  'Real-time Reporting',
  'Secure and Reliable',
  'Built for Small Businesses',
];

export const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BarChart3,   title: 'Sales Tracking',        text: 'Monitor your daily, weekly, and monthly sales.' },
  { icon: Package,     title: 'Products & Services',   text: 'Add items or services with prices, photos and categories.' },
  { icon: Coffee,      title: 'Order Management',      text: 'Process orders quickly and efficiently.' },
  { icon: FileText,    title: 'Detailed Reports',      text: 'Get insights with comprehensive reports.' },
  { icon: ShieldCheck, title: 'Secure Access',         text: 'Keep your data safe with role-based access.' },
  { icon: CreditCard,  title: 'Cash, GCash & Maya',     text: "Take cash or your shop's own GCash/Maya QR." },
];

export const DASHBOARD_POINTS = ['Live Sales Overview', 'Top Selling Items', 'Sales Analytics'];

// PLACEHOLDERS: sample quotes for the design, shown with a "sample reviews" note.
// Replace them with real customer feedback (with permission) before launch.
export const TESTIMONIALS = [
  { quote: 'Orders move faster at the counter, and the daily report is easy to read.', name: 'Maria Santos', role: 'Milk tea shop owner' },
  { quote: 'Simple enough for our sari-sari store. Cash and GCash in one place.', name: 'Juan Dela Cruz', role: 'Sari-sari store owner' },
  { quote: 'Our staff learned it in a day. Sales and staff in one app.', name: 'Ana Reyes', role: 'Salon owner' },
]

/**
 * Where interested shops reach the owner until self-serve sign-up exists (Phase 2).
 * The pricing buttons open Messenger with a ready-made message.
 */
export const MESSENGER_URL = 'https://m.me/joshuapadilla895';

// Packages from the approved plan (docs/techlead/SUBSCRIPTION-PLAN.md → "Packages").
// Defaults only: the Super Admin will be able to edit prices, limits and features (Phase 2).
export const PLANS = [
  {
    id: 'starter' as const,
    name: 'Starter Plan', tagline: 'Also included in the 7-day free trial', price: '₱499',
    accounts: 'Up to 3 accounts',
    features: [
      "POS with Cash + your shop's own GCash/Maya QR",
      'Receipts with order QR code',
      'Menu & products',
      'Reports: Today / This Week',
      'Messenger support',
    ],
    cta: 'Get Started',
  },
  {
    id: 'business' as const,
    name: 'Business Plan', tagline: 'For growing businesses', price: '₱999',
    accounts: 'Up to 10 accounts',
    features: [
      'Everything in Starter',
      'Month & custom-range reports + PDF export',
      'Sales trends dashboard',
      'RFID card login for staff',
      'Messenger support',
    ],
    cta: 'Get Started', popular: true,
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise', tagline: 'For large teams', price: '₱1,999',
    accounts: 'Unlimited accounts',
    features: [
      'Everything in Business',
      'Priority support (Messenger)',
    ],
    cta: 'Get Started', outline: true,
  },
];

/**
 * External links. Leave a value empty ('') until the real URL exists —
 * empty links show a "coming soon" notice instead of going nowhere.
 */
export const EXTERNAL_LINKS = {
  facebook: '',
  youtube: '',
  email: '',          // e.g. 'mailto:hello@yourshop.com'
  faq: '',
  documentation: '',
  privacy: '',
  terms: '',
};
