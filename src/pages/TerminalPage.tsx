import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { AlertTriangle, Loader2, Store } from 'lucide-react';
import { db } from '@/lib/firebase';
import { applyTheme } from '@/components/shared/theme';
import { rememberTerminal } from '@/lib/terminal';
import LoginCard from '@/components/landing/LoginCard';
import BrandMark from '@/components/shared/BrandMark';

/**
 * A shop's counter terminal: /s/:slug, bookmarked on the POS device.
 * Staff sign in here with their RFID card (or password). The device remembers
 * the terminal, so signing out comes back here instead of the public page.
 * Shop branding (logo, background, theme) arrives with Phase B.
 */
export default function TerminalPage() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<'checking' | 'ok' | 'invalid'>('checking');

  useEffect(() => { applyTheme(null); }, []);

  useEffect(() => {
    let cancelled = false;
    const clean = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,60}$/.test(clean)) { setState('invalid'); return; }
    // slugs/{slug} is a public lookup: is this a real shop's terminal?
    getDoc(doc(db, 'slugs', clean))
      .then(snap => {
        if (cancelled) return;
        if (snap.exists()) { rememberTerminal(clean); setState('ok'); }
        else setState('invalid');
      })
      .catch(() => { if (!cancelled) setState('invalid'); });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <div data-theme="espresso" className="min-h-dvh espresso-surface flex flex-col items-center justify-center gap-6 px-4 py-10">
      <BrandMark tone="dark" subtitle="Shop terminal" />

      {state === 'checking' && (
        <Loader2 className="w-8 h-8 animate-spin text-caramel-300" aria-label="Loading" />
      )}

      {state === 'invalid' && (
        <div className="max-w-sm rounded-3xl bg-cream-50 p-6 text-center text-espresso-900 shadow-lift">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-600" aria-hidden="true" />
          <h1 className="mt-3 font-display text-xl">Terminal link not found</h1>
          <p className="mt-2 text-sm text-bark-600">
            Check the shop's link. It looks like <span className="font-mono">…/s/your-shop</span>.
          </p>
          <a href="/login" className="btn-secondary mt-5 inline-flex">Go to sign in</a>
        </div>
      )}

      {state === 'ok' && (
        <>
          <p className="flex items-center gap-2 text-sm text-cream-200/80">
            <Store className="w-4 h-4" aria-hidden="true" />
            <span className="font-mono">{slug.toLowerCase()}</span>
          </p>
          <LoginCard terminalSlug={slug.toLowerCase()} />
        </>
      )}
    </div>
  );
}
