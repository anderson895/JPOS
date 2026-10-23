import { useEffect } from 'react';
import LandingNav from '@/components/landing/LandingNav';
import { applyTheme } from '@/components/shared/theme';
import Hero from '@/components/landing/Hero';
import InstallSection from '@/components/landing/InstallSection';
import AboutSection from '@/components/landing/AboutSection';
import DemoSection from '@/components/landing/DemoSection';
import { WALKTHROUGH } from '@/components/landing/content';
import FeaturesSection from '@/components/landing/FeaturesSection';
import DashboardSection from '@/components/landing/DashboardSection';
import TestimonialsSection from '@/components/landing/TestimonialsSection';
import PricingSection from '@/components/landing/PricingSection';
import LandingFooter from '@/components/landing/LandingFooter';

/**
 * Public landing page at /login (reference_UI/FullUI.png).
 * The sign-in form lives in the hero — see components/landing/LoginCard.tsx,
 * which holds all of the auth logic (password, RFID, Google).
 */
export default function LoginPage() {
  // The public landing always uses the default JPOS colors, never a shop's theme
  useEffect(() => { applyTheme(null); }, []);

  return (
    <div data-theme="espresso" className="min-h-screen bg-cream-100 text-espresso-900 overflow-x-hidden">
      <LandingNav />
      <main>
        <Hero />
        {/* Install JPOS as an app, right from the landing page */}
        <InstallSection />
        <AboutSection />
        {/* The walkthrough: sign up, add products, make a sale (sample data) */}
        <DemoSection src={WALKTHROUGH.src} poster={WALKTHROUGH.poster} steps={WALKTHROUGH.steps} />
        <FeaturesSection />
        <DashboardSection />
        <TestimonialsSection />
        <PricingSection />
      </main>
      <LandingFooter />
    </div>
  );
}
