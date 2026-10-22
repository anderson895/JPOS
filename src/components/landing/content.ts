import type { LucideIcon } from 'lucide-react';
import {
  BarChart3, Package, Coffee, FileText, ShieldCheck, CreditCard,
} from 'lucide-react';

/*
 * All landing-page copy in one place so marketing text can change without
 * touching layout code. Text follows reference_UI/FullUI.png.
 *
 * ⚠ PLACEHOLDERS: the testimonials, prices and external links below come from
 * the design mockup. Replace them with real data before going live
 * (see docs/frontend/CHANGELOG.md → "Open items").
 */

export const NAV_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'features', label: 'Features' },
  { id: 'contact', label: 'Contact' },
] as const;

export const ABOUT_POINTS = [
  'Easy to Use Interface',
  'Real-time Reporting',
  'Secure and Reliable',
  'Built for Coffee Shops',
];

export const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: BarChart3,   title: 'Sales Tracking',        text: 'Monitor your daily, weekly, and monthly sales.' },
  { icon: Package,     title: 'Inventory Management',  text: 'Keep track of your coffee beans and supplies.' },
  { icon: Coffee,      title: 'Order Management',      text: 'Process orders quickly and efficiently.' },
  { icon: FileText,    title: 'Detailed Reports',      text: 'Get insights with comprehensive reports.' },
  { icon: ShieldCheck, title: 'Secure Access',         text: 'Keep your data safe with role-based access.' },
  { icon: CreditCard,  title: 'Multi-Payment Support', text: 'Accept various payment methods.' },
];

export const DASHBOARD_POINTS = ['Live Sales Overview', 'Top Selling Items', 'Sales Analytics'];

// Placeholder quotes from the mockup — replace with real customer feedback.
export const TESTIMONIALS = [
  { quote: 'JPOS has made our daily operations so much easier. Highly recommended!', name: 'Maria Santos', role: 'Coffee Shop Owner' },
  { quote: 'Simple, powerful, and reliable. Perfect for our café business.', name: 'Juan Dela Cruz', role: 'Café Manager' },
  { quote: 'Great support and amazing features. Our sales are up!', name: 'Ana Reyes', role: 'Business Owner' },
];

// Placeholder pricing from the mockup.
export const PLANS = [
  {
    name: 'Starter Plan', tagline: 'Perfect for small coffee shops', price: '₱499',
    features: ['Basic POS Features', 'Sales Reports', 'Email Support'],
    cta: 'Get Started', action: 'login' as const,
  },
  {
    name: 'Business Plan', tagline: 'For growing businesses', price: '₱999',
    features: ['Advanced Reports', 'Inventory Management', 'Priority Support'],
    cta: 'Get Started', action: 'login' as const, popular: true,
  },
  {
    name: 'Enterprise', tagline: 'For large coffee chains', price: '₱1,999',
    features: ['Multi-Branch Support', 'Advanced Analytics', 'Dedicated Support'],
    cta: 'Contact Us', action: 'contact' as const,
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
