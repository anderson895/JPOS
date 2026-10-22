import { useState } from 'react';
import { Facebook, Youtube, Mail, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Wave } from '@/components/shared/Decor';
import { NAV_LINKS, EXTERNAL_LINKS } from './content';
import { openExternal, scrollToSection } from './scroll';

const SOCIALS = [
  { icon: Facebook, label: 'Facebook', url: EXTERNAL_LINKS.facebook },
  { icon: Youtube, label: 'YouTube', url: EXTERNAL_LINKS.youtube },
  { icon: Mail, label: 'Email', url: EXTERNAL_LINKS.email },
];

const SUPPORT = [
  { label: 'FAQ', url: EXTERNAL_LINKS.faq },
  { label: 'Documentation', url: EXTERNAL_LINKS.documentation },
  { label: 'Contact Us', url: EXTERNAL_LINKS.email },
];

export default function LandingFooter() {
  const [email, setEmail] = useState('');

  // No newsletter backend yet — be upfront about it instead of pretending to subscribe.
  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    toast('Thanks! Newsletter sign-ups open soon.', { icon: <Mail className="w-4 h-4 text-caramel-600" aria-hidden="true" /> });
    setEmail('');
  };

  return (
    <footer id="contact" className="relative espresso-surface text-cream-100 scroll-mt-16">
      <Wave fill="#f6e8d4" flip className="relative -mt-px" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.7fr_0.7fr_1.2fr]">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="JPOS" className="w-16 h-16 rounded-full ring-2 ring-caramel-400/60 shadow-lg" />
            <div>
              <p className="font-display text-3xl font-semibold text-cream-50 leading-none">JPOS</p>
              <p className="text-sm text-cream-200/75 mt-1">Point of Sale for Small Businesses</p>
            </div>
          </div>
          <p className="mt-5 font-display text-xl text-cream-50">Sell Smarter. Grow Bigger.</p>
          <div className="mt-5 flex gap-3">
            {SOCIALS.map(({ icon: Icon, label, url }) => (
              <button
                key={label}
                onClick={() => openExternal(url, label)}
                aria-label={label}
                className="w-10 h-10 rounded-full border border-cream-200/40 flex items-center justify-center text-cream-100 hover:bg-caramel-400 hover:text-espresso-900 hover:border-caramel-400 transition-colors"
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div>
          <p className="font-semibold text-cream-50">Quick Links</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {NAV_LINKS.map(({ id, label }) => (
              <li key={id}>
                <button onClick={() => scrollToSection(id)} className="text-cream-200/75 hover:text-caramel-200 transition-colors">{label}</button>
              </li>
            ))}
          </ul>
        </div>

        {/* Support */}
        <div>
          <p className="font-semibold text-cream-50">Support</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {SUPPORT.map(({ label, url }) => (
              <li key={label}>
                <button onClick={() => openExternal(url, label)} className="text-cream-200/75 hover:text-caramel-200 transition-colors">{label}</button>
              </li>
            ))}
          </ul>
        </div>

        {/* Newsletter */}
        <div>
          <p className="font-semibold text-cream-50">Stay Updated</p>
          <p className="mt-4 text-sm text-cream-200/75">Get the latest updates and features.</p>
          <form onSubmit={subscribe} className="mt-4 flex items-center gap-2 rounded-full border border-cream-200/25 bg-white/[0.06] p-1.5 pl-5 focus-within:border-caramel-400/70">
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email"
              aria-label="Email address"
              className="flex-1 min-w-0 bg-transparent text-sm text-cream-50 placeholder-cream-200/50 focus:outline-none"
            />
            <button type="submit" aria-label="Subscribe" className="w-10 h-10 rounded-full flex items-center justify-center btn-caramel !p-0">
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      <div className="border-t border-cream-100/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-cream-200/60">
          <p>© {new Date().getFullYear()} JPOS. All rights reserved.</p>
          <p className="flex items-center gap-3">
            <button onClick={() => openExternal(EXTERNAL_LINKS.privacy, 'Privacy Policy')} className="hover:text-caramel-200">Privacy Policy</button>
            <span className="h-3 w-px bg-cream-200/30" />
            <button onClick={() => openExternal(EXTERNAL_LINKS.terms, 'Terms of Service')} className="hover:text-caramel-200">Terms of Service</button>
          </p>
        </div>
      </div>
    </footer>
  );
}
