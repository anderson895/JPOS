import { useEffect, useState } from 'react';
import Switch from '@/components/shared/Switch';
import { COOKIE_EVENTS, cookieChoice, saveCookieChoice } from '@/lib/consent';

/**
 * "This website uses cookies": shown until the visitor chooses, and again from
 * "Cookie settings" in the footer. Only what JPOS really uses is listed
 * (src/lib/consent.ts): necessary, and preferences.
 */
export default function CookieNotice() {
  const [open, setOpen] = useState(() => cookieChoice() === null);
  const [preferences, setPreferences] = useState(() => cookieChoice()?.preferences ?? true);

  useEffect(() => {
    const reopen = () => { setPreferences(cookieChoice()?.preferences ?? true); setOpen(true); };
    window.addEventListener(COOKIE_EVENTS.OPEN, reopen);
    return () => window.removeEventListener(COOKIE_EVENTS.OPEN, reopen);
  }, []);

  if (!open) return null;
  const choose = (prefs: boolean) => { saveCookieChoice(prefs); setOpen(false); };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] p-3 sm:p-4">
      <section
        role="dialog" aria-labelledby="cookie-title" aria-describedby="cookie-text"
        className="mx-auto max-h-[85dvh] max-w-5xl overflow-y-auto rounded-3xl border border-cream-300 bg-cream-50/95 p-5 shadow-lift backdrop-blur-md sm:p-6"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <h2 id="cookie-title" className="font-display text-xl text-espresso-900">This website uses cookies</h2>
              <p id="cookie-text" className="mt-1.5 text-sm leading-relaxed text-espresso-800">
                We use cookies to keep you signed in and to remember your shop's sign-in page on this device.
                No ads and no tracking.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <label className="flex items-center gap-3 text-sm font-semibold text-espresso-900">
                <Switch checked onChange={() => {}} label="Necessary (always on)" disabled />
                Necessary
              </label>
              <label className="flex items-center gap-3 text-sm font-semibold text-espresso-900">
                <Switch checked={preferences} onChange={setPreferences} label="Preferences" />
                Preferences
              </label>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:w-56 lg:grid-cols-1">
            <button type="button" onClick={() => choose(true)} className="btn-primary w-full">Allow all</button>
            <button type="button" onClick={() => choose(preferences)} className="btn-secondary w-full">Allow selection</button>
            <button type="button" onClick={() => choose(false)} className="btn-ghost w-full border border-cream-400/80">Only necessary</button>
          </div>
        </div>
      </section>
    </div>
  );
}
