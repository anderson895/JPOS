import { CheckCircle2, Download, Laptop, Loader2, Monitor, Smartphone, TabletSmartphone } from 'lucide-react';
import { SageBubble } from '@/components/shared/Decor';
import { useInstallAction } from '@/components/shared/InstallApp';

const DEVICES = [
  { icon: Smartphone, label: 'Android' },
  { icon: TabletSmartphone, label: 'iPhone & iPad' },
  { icon: Monitor, label: 'Windows' },
  { icon: Laptop, label: 'Mac' },
];

/**
 * "Get the JPOS app", right under the hero: install JPOS from the landing page
 * on any phone, tablet or computer. Hidden inside the installed app itself.
 */
export default function InstallSection() {
  const { way, busy, install, steps } = useInstallAction();
  if (!way) return null;

  return (
    <section id="get-app" className="relative bg-cream-100 pt-8 sm:pt-10 scroll-mt-16" aria-labelledby="get-app-title">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="card relative overflow-hidden p-6 sm:p-8 flex flex-col md:flex-row items-center gap-6 md:gap-8 text-center md:text-left">
          <SageBubble className="-right-16 -top-20 h-48 w-48" />
          <SageBubble className="-bottom-24 -left-16 h-44 w-44 bg-sage-200/60" />

          {/* The app's icon, as it sits on a home screen */}
          <div className="relative flex flex-shrink-0 flex-col items-center gap-2">
            <img
              src="/apple-touch-icon.png"
              alt=""
              width={180}
              height={180}
              className="h-20 w-20 rounded-[22%] shadow-lift ring-1 ring-cream-300 sm:h-24 sm:w-24"
            />
            <span className="text-xs font-semibold text-espresso-800">JPOS</span>
          </div>

          <div className="relative min-w-0 flex-1">
            <p className="font-script text-3xl leading-none text-caramel-500">Use it like an app</p>
            <h2 id="get-app-title" className="mt-1 font-display text-3xl font-semibold text-espresso-900 sm:text-4xl">Get the JPOS app</h2>
            <p className="mt-2 text-bark-600">Install it on your phone, tablet or computer. Free, and no app store needed.</p>
            <ul className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start" aria-label="Works on">
              {DEVICES.map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-cream-400/70 bg-white/70 px-3 py-1.5 text-[13px] text-espresso-800">
                  <Icon className="h-3.5 w-3.5 text-caramel-600" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative w-full flex-shrink-0 md:w-auto">
            {way === 'installed' ? (
              <p className="flex items-center justify-center gap-2 font-semibold text-emerald-800 md:justify-start" role="status">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                Installed on this device
              </p>
            ) : (
              <button type="button" onClick={install} disabled={busy} className="btn-primary w-full px-7 py-3.5 text-base md:w-auto">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Download className="h-5 w-5" aria-hidden="true" />}
                Install app
              </button>
            )}
          </div>
        </div>
      </div>
      {steps}
    </section>
  );
}
