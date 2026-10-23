import { useNavigate } from 'react-router-dom';
import { SageBubble, SectionTitle } from '@/components/shared/Decor';
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
      <SageBubble className="hidden md:block -left-28 top-20 h-80 w-80" />
      <SageBubble className="hidden md:block -right-20 top-1/3 h-64 w-64 bg-sage-200/60" />
      <SageBubble className="hidden lg:block right-[4%] bottom-10 h-36 w-36" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10">
        <SectionTitle title={`Try JPOS free for ${settings.trialDays} days`} subtitle="Then pick a package. Pay only when you’re ready." />

        <div className="mt-12 max-w-5xl mx-auto">
          {/* Straight to the sign-up page, with the package picked */}
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
