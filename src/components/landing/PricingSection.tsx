import type { CSSProperties } from 'react';
import { CoffeeBean, CoffeeBranch, SectionTitle } from '@/components/shared/Decor';
import { useNavigate } from 'react-router-dom';
import PlanCards from '@/components/shared/PlanCards';
import ContactOwner, { usePlatformSettings } from '@/components/shared/ContactOwner';

export default function PricingSection() {
  const navigate = useNavigate();
  // Trial days and prices come from the Super Admin's settings
  const { settings } = usePlatformSettings();
  return (
    <section
      id="pricing"
      className="relative overflow-hidden py-16 lg:py-20"
      style={{ background: 'linear-gradient(180deg, #fdf7ee 0%, #f6e8d4 100%)' }}
    >
      <CoffeeBranch className="hidden md:block absolute -left-24 top-24 w-72 opacity-50 rotate-[70deg]" />
      <CoffeeBean className="hidden lg:block absolute right-[6%] top-[22%] w-9 animate-float" style={{ '--r': '25deg' } as CSSProperties} />
      <CoffeeBean className="hidden lg:block absolute right-[9%] top-[30%] w-6 animate-float-slow" style={{ '--r': '-40deg' } as CSSProperties} />
      <CoffeeBean className="hidden lg:block absolute left-[5%] bottom-[14%] w-8 animate-float" style={{ '--r': '60deg' } as CSSProperties} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <SectionTitle title={`Try JPOS free for ${settings.trialDays} days`} subtitle="Then pick a package. Pay only when you’re ready." />

        <div className="mt-12 max-w-5xl mx-auto">
          <PlanCards onChoose={choice => navigate(`/subscribe?plan=${choice}`)} />
        </div>

        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-bark-600">Questions before you start? Talk to us:</p>
          <ContactOwner message="Hi! I'd like to know more about JPOS." />
        </div>
      </div>
    </section>
  );
}
