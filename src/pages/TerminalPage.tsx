import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { AlertTriangle, ArrowLeft, Loader2, Store } from 'lucide-react';
import { db } from '@/lib/firebase';
import { applyTheme } from '@/components/shared/theme';
import { forgetSignInPage, rememberTerminal } from '@/lib/terminal';
import { getPublicBranding, storeBrand, type StoreBrand } from '@/lib/storeProfile';
import LoginCard from '@/components/landing/LoginCard';
import BrandMark from '@/components/shared/BrandMark';
import InstallAppButton from '@/components/shared/InstallApp';

/**
 * A shop's counter terminal: /s/:slug, bookmarked on the POS device.
 * Staff sign in here with their RFID card (or password). The device remembers
 * the terminal, so signing out comes back here instead of the public page.
 * It wears the shop's own name, logo and colors (Store Settings).
 * "JPOS home" leaves it for good: the device stops coming back here.
 */
export default function TerminalPage() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<'checking' | 'ok' | 'invalid'>('checking');
  const [brand, setBrand] = useState<StoreBrand | null>(null);
  const navigate = useNavigate();
  // To the JPOS main page; the main address stops bringing this device back here
  const goHome = () => { forgetSignInPage(); navigate('/login'); };

  useEffect(() => {
    let cancelled = false;
    const clean = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,60}$/.test(clean)) { setState('invalid'); return; }
    // slugs/{slug} is a public lookup: is this a real shop's terminal?
    getDoc(doc(db, 'slugs', clean))
      .then(async snap => {
        if (cancelled) return;
        if (!snap.exists()) { setState('invalid'); return; }
        rememberTerminal(clean);
        // The shop's look is public too; without one the page keeps the JPOS look
        const branding = await getPublicBranding(snap.data().tenantId).catch(() => null);
        if (cancelled) return;
        if (branding) setBrand(storeBrand(branding));
        setState('ok');
      })
      .catch(() => { if (!cancelled) setState('invalid'); });
    return () => { cancelled = true; };
  }, [slug]);

  // The shop's colors here (toasts included); the JPOS ones when leaving
  useEffect(() => { applyTheme(brand?.theme ?? null); }, [brand?.theme]);
  useEffect(() => () => applyTheme(null), []);
  // The browser tab (and a saved bookmark) shows the shop's name
  useEffect(() => {
    if (!brand) return;
    const before = document.title;
    document.title = `${brand.name} · Sign in`;
    return () => { document.title = before; };
  }, [brand]);

  return (
    <div data-theme={brand?.theme ?? 'espresso'} className="relative min-h-dvh espresso-surface flex flex-col items-center justify-center gap-6 px-4 pt-20 pb-10">
      <button
        type="button"
        onClick={goHome}
        className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-cream-100/25 px-4 py-2 text-sm font-medium text-cream-50 transition-colors hover:bg-white/10"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> JPOS home
      </button>

      {/* The shop's own card shows its name; the JPOS mark only while there's no shop to show */}
      {!brand && <BrandMark tone="dark" subtitle="Staff sign-in" />}

      {state === 'checking' && (
        <Loader2 className="w-8 h-8 animate-spin text-caramel-300" aria-label="Loading" />
      )}

      {state === 'invalid' && (
        <div className="max-w-sm rounded-3xl bg-cream-50 p-6 text-center text-espresso-900 shadow-lift">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-600" aria-hidden="true" />
          <h1 className="mt-3 font-display text-xl">Shop not found</h1>
          <p className="mt-2 text-sm text-bark-600">
            This sign-in page doesn't belong to any shop. Ask the shop owner for the right link.
          </p>
          <button type="button" onClick={goHome} className="btn-secondary mt-5 inline-flex">Go to JPOS home</button>
        </div>
      )}

      {state === 'ok' && (
        <>
          <p className="flex items-center gap-2 text-sm text-cream-200/80">
            <Store className="w-4 h-4" aria-hidden="true" />
            Sign in to start your shift
          </p>
          <LoginCard terminalSlug={slug.toLowerCase()} brand={brand ?? undefined} />
          {/* A counter device can open this page like an app */}
          <InstallAppButton variant="terminal" />
        </>
      )}
    </div>
  );
}
