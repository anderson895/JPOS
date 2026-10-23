import {
  BarChart3, Package, FileText, ShieldCheck, CreditCard, ShoppingCart,
  Coffee, CupSoda, Croissant, UtensilsCrossed, Store, ShoppingBag, Scissors, Shirt, Car,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
  { icon: ShoppingCart, title: 'Order Management',      text: 'Process orders quickly and efficiently.' },
  { icon: FileText,    title: 'Detailed Reports',      text: 'Get insights with comprehensive reports.' },
  { icon: ShieldCheck, title: 'Secure Access',         text: 'Keep your data safe with role-based access.' },
  { icon: CreditCard,  title: 'Cash, GCash & Maya',     text: "Take cash or your shop's own GCash/Maya QR." },
];

export const DASHBOARD_POINTS = ['Live Sales Overview', 'Top Selling Items', 'Sales Analytics'];

/**
 * Chapters of the walkthrough video (public/demo/jpos-walkthrough.mp4). The `at`
 * times come from `node scripts/demo/record-walkthrough.mjs`: copy them again after
 * re-recording.
 */
export const WALKTHROUGH = {
  src: '/demo/jpos-walkthrough.mp4',
  poster: '/demo/jpos-walkthrough.jpg',
  steps: [
    { at: 0,    title: 'Get started',            text: 'Pick the free trial on the JPOS website.' },
    { at: 3.7,  title: 'Create your account',    text: 'Your shop name, your name, email and a password.' },
    { at: 11.1, title: 'Confirm your email',     text: 'Type the 6-digit code we send you.' },
    { at: 15,   title: 'Your shop is ready',     text: 'Your dashboard opens, with the 7-day free trial running.' },
    { at: 16.8, title: 'Add your products',      text: 'A name and a price is all it takes.' },
    { at: 29.4, title: 'Sell at the counter',    text: 'Tap the items, check out and take the cash.' },
    { at: 38.8, title: 'Receipt with QR',        text: 'Every sale gets a receipt you can print.' },
    { at: 41.8, title: 'See it on the dashboard', text: "Today's sales and top items update right away." },
  ],
};

// PLACEHOLDERS: sample quotes for the design, shown with a "sample reviews" note.
// Replace them with real customer feedback (with permission) before launch.
export const TESTIMONIALS = [
  { quote: 'Orders move faster at the counter, and the daily report is easy to read.', name: 'Maria Santos', role: 'Milk tea shop owner' },
  { quote: 'Simple enough for our sari-sari store. Cash and GCash in one place.', name: 'Juan Dela Cruz', role: 'Sari-sari store owner' },
  { quote: 'Our staff learned it in a day. Sales and staff in one app.', name: 'Ana Reyes', role: 'Salon owner' },
]

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
