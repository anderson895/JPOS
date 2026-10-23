import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BadgeCheck, Check, Copy, Eye, EyeOff, Link2, Loader2, Lock, Mail, RefreshCw, Sparkles, Store, Tag, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import GoogleIcon from '@/components/shared/GoogleIcon';
import { PLAN_LABEL } from '@/lib/entitlements';
import { slugProblem } from '@/lib/subscriptions';
import { USE_EMULATORS } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import type { SignUp } from './useSignUp';

/** Local test only: real addresses also get a real email (VITE_LOCAL_REAL_EMAIL=true in .env) */
const LOCAL_REAL_EMAIL = import.meta.env.VITE_LOCAL_REAL_EMAIL === 'true';

/**
 * The sign-up form: shop, owner and account, then "Create free account".
 * Signed in without a shop, it only asks about the shop.
 */
export function SignUpForm({ s, onChangePlan }: { s: SignUp; onChangePlan: () => void }) {
  const [copied, setCopied] = useState(false);
  const linkProblem = s.slug ? slugProblem(s.slug) ?? (s.slugFree === false ? 'That link is taken. Try another one.' : null) : null;
  const copyLink = async () => {
    if (!s.slug) { toast.error('Type your shop name first.'); return; }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/${s.slug}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied.');
    } catch {
      toast.error("Couldn't copy. Select the link and copy it.");
    }
  };

  return (
    <form
      onSubmit={e => { e.preventDefault(); if (s.signedIn) s.createTheShop(); else s.sendCode(); }}
      className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2"
    >
      {/* Sign-up can't work yet: say so before anyone fills in the form */}
      {s.closed && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <p><span className="font-semibold">Sign-up isn't open yet.</span> Please message us and we'll help you get started.</p>
            {/* For the JPOS owner while testing (npm run dev / dev:live); never in the live app */}
            {import.meta.env.DEV && (
              <p className="mt-1.5 text-xs text-amber-800/90">
                Only on this computer: the packages and prices aren't saved in this database yet.
                Run <code className="rounded bg-amber-100 px-1 font-mono">node scripts/setup-platform.mjs</code> once.
              </p>
            )}
          </div>
        </div>
      )}

      {/* What they picked, with a way to change it */}
      <div className="flex items-center justify-between gap-3 rounded-full border border-caramel-200 bg-caramel-50/80 py-2.5 pl-4 pr-5 text-sm sm:col-span-2">
        <span className="flex min-w-0 items-center gap-2.5 font-semibold text-espresso-900">
          {s.choice === 'trial' || !s.choice
            ? <><Tag className="h-4 w-4 shrink-0 text-caramel-600" aria-hidden="true" /> Free trial · {s.settings.trialDays} days</>
            : <><Sparkles className="h-4 w-4 shrink-0 text-caramel-600" aria-hidden="true" /> <span className="truncate">{s.settings.plans[s.plan]?.name ?? PLAN_LABEL[s.plan]} · ₱{(s.settings.plans[s.plan]?.price ?? 0).toLocaleString('en-PH')}/month <span className="font-normal text-bark-500">(pay later)</span></span></>}
        </span>
        <button type="button" onClick={onChangePlan} className="shrink-0 font-semibold text-caramel-700 underline-offset-2 hover:text-espresso-900 hover:underline">Change</button>
      </div>

      <Field icon={Store} label="Shop name" htmlFor="shop-name">
        <input id="shop-name" className="input pl-11 py-3" autoComplete="organization" value={s.shopName} onChange={e => s.setShopName(e.target.value)} placeholder="e.g. Kape ni Juan" maxLength={60} required />
      </Field>
      <Field icon={UserIcon} label="Your name" htmlFor="owner-name">
        <input id="owner-name" className="input pl-11 py-3" autoComplete="name" value={s.ownerName} onChange={e => s.setOwnerName(e.target.value)} placeholder="e.g. Juan Dela Cruz" maxLength={60} required />
      </Field>

      {/* The shop's sign-in page for the POS devices: type or paste it, and copy it */}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="shop-link">Your shop's sign-in page</label>
        <div className="flex items-center rounded-full border border-cream-400/80 bg-white/80 pl-4 pr-1.5 text-sm transition-all focus-within:border-caramel-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-caramel-300">
          <Link2 className="mr-3 h-4 w-4 shrink-0 text-bark-500" aria-hidden="true" />
          <span className="whitespace-nowrap text-bark-400">
            <span className="hidden min-[420px]:inline">{window.location.host}</span>/s/
          </span>
          <input
            id="shop-link"
            className="min-w-0 flex-1 bg-transparent py-3 pr-2 font-semibold text-espresso-900 focus:outline-none"
            value={s.slug}
            onChange={e => s.setSlug(e.target.value)}
            placeholder="your-shop"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={copyLink}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-bark-500 transition-colors hover:bg-cream-200 hover:text-espresso-800"
            aria-label="Copy the link"
            title="Copy the link"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
        <p className={cn('mt-1.5 px-1 text-xs', linkProblem ? 'text-red-600' : 'text-bark-500')}>
          {linkProblem ?? (s.slugFree ? 'Available. Your staff will open this page on your POS devices.' : 'Your staff will open this page on your POS devices.')}
        </p>
      </div>

      {!s.signedIn && (
        <>
          <Field icon={Mail} label="Email" htmlFor="signup-email">
            <input id="signup-email" className="input pl-11 py-3" type="email" autoComplete="email" value={s.email} onChange={e => s.setEmail(e.target.value)} placeholder="you@example.com" required />
          </Field>
          <Field icon={Lock} label="Password" htmlFor="signup-password">
            <input id="signup-password" className="input pl-11 pr-11 py-3" type={s.showPass ? 'text' : 'password'} autoComplete="new-password" value={s.password} onChange={e => s.setPassword(e.target.value)} placeholder="At least 6 characters" required />
            <button type="button" onClick={() => s.setShowPass(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-500 hover:text-espresso-800" aria-label={s.showPass ? 'Hide password' : 'Show password'}>
              {s.showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </Field>
        </>
      )}

      <div className="flex flex-col gap-3 pt-1 sm:col-span-2">
        <button type="submit" disabled={!!s.busy || !!s.shopProblem || s.closed} className="btn-primary w-full py-3 text-[15px]">
          {s.busy === 'code' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          {s.signedIn ? 'Create my shop for free' : s.busy === 'code' ? 'Sending your code…' : 'Create free account'}
        </button>
        {!s.signedIn && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-cream-400/80" />
              <span className="text-xs text-bark-500">or continue with</span>
              <div className="h-px flex-1 bg-cream-400/80" />
            </div>
            <button type="button" onClick={s.google} disabled={!!s.busy || !!s.shopProblem || s.closed} className="btn w-full py-3 bg-white text-espresso-900 border border-cream-400/80 shadow-sm hover:bg-cream-50 hover:shadow-md">
              {s.busy === 'google' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GoogleIcon className="h-5 w-5" />}
              {s.busy === 'google' ? 'Waiting for Google…' : 'Continue with Google'}
            </button>
          </>
        )}
        {s.signedIn && (
          <button type="button" className="btn-ghost text-sm" disabled={!!s.busy} onClick={s.useDifferentAccount}>Use a different account</button>
        )}
        <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-800">
          <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Free to sign up. You won't pay anything today.
        </p>
      </div>
    </form>
  );
}

/** Step 2: type the 6-digit code from the email (reference_UI/Verification.png, in JPOS style). */
export function CodeStep({ s }: { s: SignUp }) {
  if (!s.codeSentTo) return null;
  const to = s.codeSentTo;
  return (
    <div>
      <button type="button" onClick={s.backToForm} className="inline-flex items-center gap-1.5 text-sm font-medium text-bark-500 transition-colors hover:text-espresso-800">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cream-300 bg-cream-50 text-caramel-700 shadow-card">
          <Mail className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-3 font-script text-3xl leading-none text-caramel-500">Almost there</p>
        <h2 className="mt-1 font-display text-[32px] font-semibold leading-tight text-espresso-900 sm:text-4xl">Check your email</h2>
        <p className="mt-2 text-sm text-bark-600">
          {USE_EMULATORS && !LOCAL_REAL_EMAIL
            ? <>Local test: no real email is sent to <strong className="text-espresso-900 [overflow-wrap:anywhere]">{to}</strong>. Use the button below.</>
            : <>We sent a 6-digit code to <strong className="text-espresso-900 [overflow-wrap:anywhere]">{to}</strong>.</>}
        </p>
      </div>
      <form onSubmit={e => { e.preventDefault(); s.confirmCode(s.code); }} className="mt-6 space-y-3">
        <CodeBoxes
          value={s.code}
          onChange={digits => {
            s.setCode(digits);
            if (digits.length === 6) s.confirmCode(digits);
          }}
        />
        <div className="space-y-3 pt-2">
          <button type="submit" disabled={s.code.length !== 6} className="btn-primary w-full py-3 text-[15px]">
            <Check className="h-4 w-4" aria-hidden="true" /> Confirm and create my shop
          </button>
          {USE_EMULATORS && <LocalCodeHelper email={to} onCode={c => { s.setCode(c); s.confirmCode(c); }} />}
          <button type="button" className="btn-secondary w-full py-3" disabled={s.waitSec > 0 || !!s.busy} onClick={s.resend}>
            {s.busy === 'resend' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            {s.busy === 'resend' ? 'Sending…' : s.waitSec > 0 ? `Send a new code in ${s.waitSec}s` : 'Send a new code'}
          </button>
        </div>
        <p className="pt-1 text-center text-sm text-bark-500">
          Not in your inbox? <span className="font-medium text-caramel-700 underline underline-offset-2">Check Spam.</span>
        </p>
      </form>
    </div>
  );
}

/** The big spinner while something takes a few seconds (making the account, the shop…). */
export function Working({ text }: { text: string }) {
  return (
    <div className="py-8 text-center" role="status" aria-live="polite">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-caramel-100 ring-1 ring-caramel-200">
        <Loader2 className="h-8 w-8 animate-spin text-caramel-600" aria-hidden="true" />
      </span>
      <p className="mt-4 font-script text-3xl leading-none text-caramel-500">Just a moment</p>
      <h2 className="mt-1 font-display text-[28px] font-semibold leading-tight text-espresso-900">{text}</h2>
      <p className="mt-2 text-sm text-bark-600">This only takes a few seconds.</p>
    </div>
  );
}

/** "Already have an account? Sign in" */
export function SignInLine() {
  return (
    <p className="text-center text-sm text-bark-500">
      Already have an account? <Link to="/login" className="font-semibold text-espresso-800 underline underline-offset-2">Sign in</Link>
    </p>
  );
}

function Field({ icon: Icon, label, htmlFor, children }: { icon: typeof Mail; label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bark-500" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

/**
 * Six boxes for the code. One real (invisible) input lies on top, so typing,
 * pasting and the phone's "fill in code from email" all work as usual.
 */
export function CodeBoxes({ value, onChange, id = 'signup-code' }: { value: string; onChange: (digits: string) => void; id?: string }) {
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, 5);
  return (
    <div className="relative mx-auto w-fit rounded-[26px] border border-cream-300 bg-white/70 p-1.5 transition-all focus-within:border-caramel-400 focus-within:ring-2 focus-within:ring-caramel-300 sm:p-2">
      <div className="flex gap-1.5 sm:gap-2.5" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => {
          const digit = value[i];
          const here = focused && i === active && value.length < 6;
          return (
            <span
              key={i}
              className={cn(
                'flex h-12 w-10 items-center justify-center rounded-2xl bg-white font-body text-2xl font-semibold text-espresso-900 shadow-card ring-1 ring-cream-300 transition-shadow sm:h-16 sm:w-14',
                here && 'ring-2 ring-caramel-400',
              )}
            >
              {digit ?? (here ? <span className="h-7 w-0.5 animate-pulse rounded-full bg-espresso-800" /> : <span className="text-bark-300">0</span>)}
            </span>
          );
        })}
      </div>
      <input
        id={id}
        aria-label="6-digit code"
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        className="absolute inset-0 h-full w-full cursor-text rounded-[26px] text-base opacity-0"
      />
    </div>
  );
}

/**
 * Local test mode only: test addresses (like @shop.test) get no real email.
 * This reads the newest code the local server "sent" to this address and fills it in.
 */
export function LocalCodeHelper({ email, onCode }: { email: string; onCode: (code: string) => void }) {
  const [looking, setLooking] = useState(false);
  const fill = async () => {
    setLooking(true);
    try {
      const box = (await (await fetch('/__dev/outbox')).json()) as { to: string[]; subject: string }[];
      const code = [...box].reverse().find(m => m.to.includes(email))?.subject.match(/\d{6}/)?.[0];
      if (code) onCode(code);
      else toast.error('No code in the local inbox yet. Press "Send a new code".');
    } catch {
      toast.error('Could not read the local inbox.');
    } finally {
      setLooking(false);
    }
  };
  return (
    <button type="button" data-dev-only className="btn w-full py-3 border border-caramel-300 bg-caramel-50 text-caramel-800 hover:bg-caramel-100" onClick={fill} disabled={looking}>
      {looking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />} Local test: fill in the code
    </button>
  );
}
