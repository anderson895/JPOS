import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { BadgeCheck, Check, Sparkles, Eye, EyeOff, Loader2, Mail, Store, User as UserIcon, Lock, ArrowLeft, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { applyTheme } from '@/components/shared/theme';
import BrandMark from '@/components/shared/BrandMark';
import ContactOwner, { usePlatformSettings } from '@/components/shared/ContactOwner';
import { getAuthErrorMessage, CANCELLED_SIGN_IN_CODES } from '@/lib/authErrors';
import { createShop, isSlugAvailable, slugify, slugProblem, SlugTakenError } from '@/lib/subscriptions';
import { PLAN_LABEL } from '@/lib/entitlements';
import PlanCards, { isPlanChoice, type PlanChoice } from '@/components/shared/PlanCards';
import { USE_EMULATORS } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import type { PlanId } from '@/types';

const DRAFT_KEY = 'jpos-signup-draft';
interface Draft { shopName: string; slug: string; ownerName: string; plan: PlanChoice | null }

function loadDraft(): Partial<Draft> {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}'); } catch { return {}; }
}
function saveDraft(d: Draft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ }
}

/**
 * Sign-up for a new shop: create the account (email or Google), verify the
 * email, then the shop is created and the owner goes to Billing to start the
 * free trial or pay. Anyone signed in with a shop goes straight to the app.
 */
export default function SubscribePage() {
  const { currentUser, firebaseUser, noShop, loading, signUp, loginWithGoogle, checkEmailVerified, resendVerification, logout } = useAuth();
  const { settings } = usePlatformSettings();
  const [params] = useSearchParams();
  const fromLink = params.get('plan');
  const draft = useMemo(loadDraft, []);

  // The free trial or a package; null = show the cards first
  const [choice, setChoice] = useState<PlanChoice | null>(isPlanChoice(fromLink) ? fromLink : isPlanChoice(draft.plan) ? draft.plan : null);
  const plan: PlanId = !choice || choice === 'trial' ? 'starter' : choice;
  const [shopName, setShopName] = useState(draft.shopName ?? '');
  const [slug, setSlug] = useState(draft.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!draft.slug);
  const [slugFree, setSlugFree] = useState<boolean | null>(null);
  const [ownerName, setOwnerName] = useState(draft.ownerName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  // "Send the email again" waits a minute between emails (the server's limit too)
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= resendAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const waitSec = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const startResendWait = () => { setNow(Date.now()); setResendAt(Date.now() + 60_000); };

  useEffect(() => { applyTheme(null); }, []);
  // The shop link follows the shop name until the owner edits it
  useEffect(() => { if (!slugTouched) setSlug(slugify(shopName)); }, [shopName, slugTouched]);
  // Is the link free? (checked shortly after typing stops)
  useEffect(() => {
    setSlugFree(null);
    if (slugProblem(slug)) return;
    const timer = setTimeout(() => { isSlugAvailable(slug).then(setSlugFree).catch(() => setSlugFree(null)); }, 400);
    return () => clearTimeout(timer);
  }, [slug]);

  if (loading) return <Shell><Loader2 className="w-8 h-8 animate-spin mx-auto text-caramel-500" /></Shell>;
  // Already has a shop: start the free trial they picked, or go pay
  if (currentUser) {
    const billing = choice === 'trial' ? '/admin/billing?start=trial' : choice ? `/admin/billing?plan=${choice}` : '/admin/billing';
    return <Navigate to={currentUser.role === 'admin' ? billing : '/staff'} replace />;
  }

  const signedIn = !!firebaseUser && noShop;
  const verified = !!firebaseUser?.emailVerified;
  const shopProblem = !shopName.trim() || shopName.trim().length < 2 ? 'Enter your shop name.'
    : slugProblem(slug) ?? (slugFree === false ? 'That shop link is taken. Try another one.' : null)
    ?? (!ownerName.trim() ? 'Enter your name.' : null);

  const finishShop = async () => {
    if (shopProblem) { toast.error(shopProblem); return; }
    setBusy(true);
    try {
      await createShop({ shopName, slug, ownerName, desiredPlan: plan });
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success('Your shop is ready! Choose how to start.');
      // AuthContext picks up the new profile and the redirect above takes over
    } catch (err) {
      toast.error(err instanceof SlugTakenError ? err.message : getAuthErrorMessage(err, 'Could not create your shop. Please try again.'));
      if (err instanceof SlugTakenError) setSlugFree(false);
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shopProblem) { toast.error(shopProblem); return; }
    if (password.length < 6) { toast.error('Use a password with at least 6 characters.'); return; }
    saveDraft({ shopName, slug, ownerName, plan: choice });
    setBusy(true);
    try {
      const { emailSent, problem } = await signUp(email, password, ownerName);
      if (emailSent) { toast.success('Account created. Check your email to confirm it.'); startResendWait(); }
      else toast.error(`Account created, but ${problem ?? 'the email was not sent.'} Press "Send the email again".`, { duration: 8000 });
    } catch (err) {
      toast.error(getAuthErrorMessage(err, 'Could not create the account.'));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (shopProblem) { toast.error(shopProblem); return; }
    saveDraft({ shopName, slug, ownerName, plan: choice });
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      if (!(err instanceof FirebaseError && CANCELLED_SIGN_IN_CODES.includes(err.code))) toast.error(getAuthErrorMessage(err, 'Google sign-in failed.'));
    } finally {
      setBusy(false);
    }
  };

  // ── Step 2: verify the email ────────────────────────────────────────────
  if (signedIn && !verified) {
    return (
      <Shell>
        <div className="text-center">
          <Mail className="w-12 h-12 mx-auto text-caramel-600" aria-hidden="true" />
          <h1 className="mt-3 font-display text-2xl text-espresso-900">Check your email</h1>
          <p className="mt-2 text-sm text-bark-600">
            {USE_EMULATORS
              ? <>Local test: no real email is sent to <strong>{firebaseUser?.email}</strong>. Open it with the button below.</>
              : <>We sent a link to <strong>{firebaseUser?.email}</strong>. Open it to confirm your email, then come back here.</>}
          </p>
        </div>
        <div className="mt-6 space-y-3">
          {USE_EMULATORS && <LocalVerifyHelper email={firebaseUser?.email ?? ''} />}
          <button
            className="btn-primary w-full py-3"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const ok = await checkEmailVerified().catch(() => false);
              setBusy(false);
              if (!ok) toast.error("We can't see the confirmation yet. Open the link in your email first.");
            }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} I've confirmed my email
          </button>
          <button
            className="btn-secondary w-full"
            disabled={waitSec > 0}
            onClick={() => resendVerification()
              .then(() => { toast.success('Email sent again.'); startResendWait(); })
              .catch(e => toast.error(getAuthErrorMessage(e)))}
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> {waitSec > 0 ? `Send again in ${waitSec}s` : 'Send the email again'}
          </button>
          <button className="btn-ghost w-full text-sm" onClick={() => logout()}>Use a different account</button>
        </div>
      </Shell>
    );
  }

  // ── Pick the free trial or a package (skipped when the link already says) ───
  if (!choice) {
    return (
      <Shell wide="xl">
        <Link to="/login" className="inline-flex items-center gap-1 text-sm text-bark-500 hover:text-espresso-800">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
        </Link>
        <h1 className="mt-2 text-center font-display text-3xl sm:text-4xl text-espresso-900">Try JPOS free for {settings.trialDays} days</h1>
        <p className="mt-2 mb-8 text-center text-sm text-bark-600">Free to sign up. Pay only when you're ready.</p>
        <PlanCards onChoose={setChoice} />
        {!signedIn && (
          <p className="mt-6 text-center text-sm text-bark-500">
            Already have an account? <Link to="/login" className="font-semibold text-espresso-800 underline">Sign in</Link>
          </p>
        )}
      </Shell>
    );
  }

  // ── Step 1 (signed out) and step 3 (verified, create the shop) ─────────────
  return (
    <Shell wide>
      <Link to="/login" className="inline-flex items-center gap-1 text-sm text-bark-500 hover:text-espresso-800">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
      </Link>
      <h1 className="mt-3 font-display text-3xl text-espresso-900">{signedIn ? 'Set up your shop' : 'Create your JPOS account'}</h1>
      <p className="mt-1 text-sm text-bark-600">
        {signedIn ? 'Almost done! Tell us about your shop.' : 'It only takes a few minutes.'}
      </p>

      {/* Signing up is free: make that impossible to miss */}
      <div className="mt-5 flex items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <BadgeCheck className="w-6 h-6 shrink-0 text-emerald-700" aria-hidden="true" />
        <p className="font-semibold text-emerald-900">Free to sign up. You won't pay anything today.</p>
      </div>

      {/* What they picked, with a way back to the cards */}
      <div className="mt-4 flex items-center justify-between gap-3 rounded-full border border-cream-300 bg-white/70 py-2 pl-4 pr-2 text-sm">
        <span className="flex items-center gap-2 font-semibold text-espresso-900">
          {choice === 'trial'
            ? <><Sparkles className="w-4 h-4 text-caramel-600" aria-hidden="true" /> Free trial · {settings.trialDays} days</>
            : <>{settings.plans[plan]?.name ?? PLAN_LABEL[plan]} · ₱{(settings.plans[plan]?.price ?? 0).toLocaleString('en-PH')}/month <span className="font-normal text-bark-500">(pay later)</span></>}
        </span>
        <button type="button" onClick={() => setChoice(null)} className="btn-ghost px-3 py-1.5 text-sm">Change</button>
      </div>

      <form onSubmit={signedIn ? (e) => { e.preventDefault(); finishShop(); } : createAccount} className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field icon={Store} label="Shop name">
          <input className="input pl-11" value={shopName} onChange={e => setShopName(e.target.value)} placeholder="e.g. Kape ni Juan" maxLength={60} required />
        </Field>
        <Field icon={UserIcon} label="Your name">
          <input className="input pl-11" value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="e.g. Juan Dela Cruz" maxLength={60} required />
        </Field>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="shop-link">Your shop's sign-in page</label>
          <div className="flex items-center rounded-full border border-cream-400 bg-white/80 pl-4 text-sm focus-within:ring-2 focus-within:ring-caramel-300">
            <span className="text-bark-400 whitespace-nowrap">{window.location.host}/s/</span>
            <input
              id="shop-link"
              className="flex-1 min-w-0 bg-transparent py-2.5 pr-4 focus:outline-none"
              value={slug}
              onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
              maxLength={40}
            />
          </div>
          <p className={cn('text-xs mt-1 px-1', slugFree === false || (slug && slugProblem(slug)) ? 'text-red-600' : 'text-bark-500')}>
            {slug && slugProblem(slug) ? slugProblem(slug)
              : slugFree === false ? 'That link is taken. Try another one.'
              : slugFree ? 'Available. Your staff will open this page on your POS devices.'
              : 'Your staff will open this page on your POS devices.'}
          </p>
        </div>

        {!signedIn && (
          <>
            <Field icon={Mail} label="Email">
              <input className="input pl-11" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </Field>
            <Field icon={Lock} label="Password">
              <input className="input pl-11 pr-11" type={showPass ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required />
              <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-500" aria-label={showPass ? 'Hide password' : 'Show password'}>
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </Field>
          </>
        )}

        <div className="sm:col-span-2 flex flex-col gap-3">
          <button type="submit" disabled={busy || !!shopProblem} className="btn-primary w-full py-3">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {signedIn ? 'Create my shop for free' : 'Create free account'}
          </button>
          {!signedIn && (
            <button type="button" onClick={google} disabled={busy || !!shopProblem} className="btn w-full py-3 bg-white text-espresso-900 border border-cream-400/80">
              Continue with Google
            </button>
          )}
          {signedIn && <button type="button" className="btn-ghost text-sm" onClick={() => logout()}>Use a different account</button>}
          {!signedIn && (
            <p className="text-center text-sm text-bark-500">
              Already have an account? <Link to="/login" className="font-semibold text-espresso-800 underline">Sign in</Link>
            </p>
          )}
        </div>
      </form>

      <div className="mt-8 border-t border-cream-300 pt-5">
        <p className="text-sm text-bark-600 mb-3">Questions before you sign up? Talk to us:</p>
        <ContactOwner message="Hi! I have a question about JPOS." />
      </div>
    </Shell>
  );
}

export function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean | 'xl' }) {
  return (
    <div data-theme="espresso" className="min-h-dvh bg-cream-100 px-4 py-8 sm:py-12">
      <div className={cn('mx-auto', wide === 'xl' ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-6 flex justify-center"><BrandMark /></div>
        {/* The package cards are cards themselves: no box around them */}
        {wide === 'xl' ? children : <div className="card-glass p-6 sm:p-8">{children}</div>}
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <Icon className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-500 pointer-events-none" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/**
 * Local test mode only: emails aren't really sent. This opens the newest email
 * the local server "sent" to this address, shown the way it looks in an inbox,
 * so the owner taps "Confirm my email" just like in Gmail.
 */
function LocalVerifyHelper({ email }: { email: string }) {
  return (
    <button className="btn-caramel w-full" onClick={() => window.location.assign(`/__dev/mail?to=${encodeURIComponent(email)}`)}>
      <Mail className="w-4 h-4" aria-hidden="true" /> Local test: open the email
    </button>
  );
}
