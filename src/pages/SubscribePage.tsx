import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import { Check, Eye, EyeOff, Loader2, Mail, Store, User as UserIcon, Lock, ArrowLeft, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { applyTheme } from '@/components/shared/theme';
import BrandMark from '@/components/shared/BrandMark';
import ContactOwner, { usePlatformSettings } from '@/components/shared/ContactOwner';
import { getAuthErrorMessage, CANCELLED_SIGN_IN_CODES } from '@/lib/authErrors';
import { createShop, isSlugAvailable, slugify, slugProblem, SlugTakenError } from '@/lib/subscriptions';
import { PLAN_IDS, PLAN_LABEL } from '@/lib/entitlements';
import { USE_EMULATORS } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import type { PlanId } from '@/types';

const DRAFT_KEY = 'jpos-signup-draft';
interface Draft { shopName: string; slug: string; ownerName: string; plan: PlanId }

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
  const initialPlan = (PLAN_IDS.includes(params.get('plan') as PlanId) ? params.get('plan') : 'business') as PlanId;
  const draft = useMemo(loadDraft, []);

  const [plan, setPlan] = useState<PlanId>(draft.plan ?? initialPlan);
  const [shopName, setShopName] = useState(draft.shopName ?? '');
  const [slug, setSlug] = useState(draft.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!draft.slug);
  const [slugFree, setSlugFree] = useState<boolean | null>(null);
  const [ownerName, setOwnerName] = useState(draft.ownerName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);

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
  // Already has a shop: go pay / start the trial
  if (currentUser) return <Navigate to={currentUser.role === 'admin' ? `/admin/billing?plan=${plan}` : '/staff'} replace />;

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
    saveDraft({ shopName, slug, ownerName, plan });
    setBusy(true);
    try {
      await signUp(email, password, ownerName);
      toast.success('Account created. Check your email to verify it.');
    } catch (err) {
      toast.error(getAuthErrorMessage(err, 'Could not create the account.'));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (shopProblem) { toast.error(shopProblem); return; }
    saveDraft({ shopName, slug, ownerName, plan });
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
            We sent a link to <strong>{firebaseUser?.email}</strong>. Open it to confirm your email, then come back here.
          </p>
        </div>
        <div className="mt-6 space-y-3">
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
          <button className="btn-secondary w-full" onClick={() => resendVerification().then(() => toast.success('Email sent again.')).catch(e => toast.error(getAuthErrorMessage(e)))}>
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Send the email again
          </button>
          {USE_EMULATORS && <LocalVerifyHelper email={firebaseUser?.email ?? ''} />}
          <button className="btn-ghost w-full text-sm" onClick={() => logout()}>Use a different account</button>
        </div>
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
        {signedIn ? 'Almost done! Tell us about your shop.' : `Start with a free ${settings.trialDays}-day trial, or subscribe right away. No payment needed to sign up.`}
      </p>

      {/* Package */}
      <p className="label mt-6">Package</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {PLAN_IDS.map(id => {
          const p = settings.plans[id];
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPlan(id)}
              className={cn('rounded-3xl border p-4 text-left transition-all', plan === id ? 'border-espresso-800 bg-cream-50 ring-2 ring-espresso-800/70' : 'border-cream-300 bg-white/60 hover:border-caramel-400')}
            >
              <span className="block font-semibold text-espresso-900">{p?.name ?? PLAN_LABEL[id]}</span>
              <span className="block font-display text-2xl text-espresso-900">₱{(p?.price ?? 0).toLocaleString('en-PH')}<span className="text-xs font-body text-bark-500">/month</span></span>
              <span className="block text-xs text-bark-500 mt-1">
                {p?.entitlements.staffLimit == null ? 'Unlimited accounts' : `Up to ${p.entitlements.staffLimit} accounts`}
              </span>
            </button>
          );
        })}
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
            {signedIn ? 'Create my shop' : 'Create account'}
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

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div data-theme="espresso" className="min-h-dvh bg-cream-100 px-4 py-8 sm:py-12">
      <div className={cn('mx-auto', wide ? 'max-w-2xl' : 'max-w-md')}>
        <div className="mb-6 flex justify-center"><BrandMark /></div>
        <div className="card-glass p-6 sm:p-8">{children}</div>
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

/** Local test mode only: the emulator doesn't send emails, so open the link from here. */
function LocalVerifyHelper({ email }: { email: string }) {
  const open = async () => {
    const base = 'http://127.0.0.1:9099';
    const r = await fetch(`${base}/emulator/v1/projects/demo-jpos/oobCodes`).catch(() => null);
    const { oobCodes = [] } = r ? await r.json() : {};
    const code = [...oobCodes].reverse().find((c: { email: string; requestType: string }) => c.email === email && c.requestType === 'VERIFY_EMAIL');
    if (!code) { toast.error('No verification email found yet.'); return; }
    // Same as clicking the link in the email
    const ok = await fetch(`${base}/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oobCode: code.oobCode }),
    }).then(res => res.ok).catch(() => false);
    if (!ok) { toast.error('Could not confirm the email. Is the local test running?'); return; }
    toast.success('Email confirmed (local test). Now press "I\'ve confirmed my email".');
  };
  return (
    <button className="btn-outline w-full text-sm" onClick={open}>
      Local test: confirm the email for me
    </button>
  );
}
