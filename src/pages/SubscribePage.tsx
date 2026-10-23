import { useEffect } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Headphones, Loader2, ShieldCheck, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { applyTheme } from '@/components/shared/theme';
import BrandMark from '@/components/shared/BrandMark';
import CreamCard from '@/components/shared/CreamCard';
import ContactOwner from '@/components/shared/ContactOwner';
import { SageBubble } from '@/components/shared/Decor';
import PlanCards, { isPlanChoice } from '@/components/shared/PlanCards';
import { useSignUp } from '@/components/signup/useSignUp';
import { CodeStep, SignInLine, SignUpForm, Working } from '@/components/signup/SignUpParts';
import { cn } from '@/lib/utils';

/** Three reasons to sign up (icons from reference_UI/Illustration Asset Kit.png). */
const HIGHLIGHTS = [
  { icon: Zap, line1: 'Fast & Easy', line2: 'Setup' },
  { icon: ShieldCheck, line1: 'Secure &', line2: 'Reliable' },
  { icon: Headphones, line1: 'Dedicated', line2: 'Support' },
];

const backLinkClass = 'inline-flex items-center gap-1.5 text-sm font-medium text-bark-500 hover:text-espresso-800 transition-colors';

/**
 * Sign-up for a new shop ("Get Started", the package buttons and "Create
 * account" on the landing page all lead here): fill in the shop and account,
 * type the 6-digit code from the email, and the account and shop are made
 * together, then the owner lands in the app. Looks like the landing page
 * (About-style heading, the cream sign-in card) with the POS pictures.
 */
export default function SubscribePage() {
  const { currentUser, loading } = useAuth();
  const [params] = useSearchParams();
  const fromLink = params.get('plan');
  const s = useSignUp(isPlanChoice(fromLink) ? fromLink : null);

  useEffect(() => { applyTheme(null); }, []);

  // Already has a shop (and not in the middle of making one here): straight in
  if (currentUser && !s.working && !s.target) {
    const home = currentUser.role !== 'admin' ? '/staff'
      : s.choice && s.choice !== 'trial' ? `/admin/billing?plan=${s.choice}` : '/admin';
    return <Navigate to={home} replace />;
  }
  if (s.waitText) return <PageFrame variant="split" short><CreamCard><Working text={s.waitText} /></CreamCard></PageFrame>;
  if (loading) return <PageFrame variant="split" short><CreamCard><Working text="Loading…" /></CreamCard></PageFrame>;

  const backButton = s.signedIn ? (
    <button type="button" onClick={s.leave} disabled={!!s.busy} className={backLinkClass}>
      {s.busy === 'leave' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowLeft className="h-4 w-4" aria-hidden="true" />} Back
    </button>
  ) : (
    <Link to="/login" className={backLinkClass}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
    </Link>
  );

  // ── Pick the free trial or a package (skipped when the link already says) ───
  if (!s.choice) {
    return (
      <PageFrame variant="wide">
        {backButton}
        <h1 className="mt-2 text-center font-display text-3xl font-semibold text-espresso-900 sm:text-4xl">Try JPOS free for {s.settings.trialDays} days</h1>
        <p className="mb-8 mt-2 text-center text-sm text-bark-600">Free to sign up. Pay only when you're ready.</p>
        <PlanCards onChoose={s.setChoice} />
        {!s.signedIn && <div className="mt-6"><SignInLine /></div>}
      </PageFrame>
    );
  }

  // ── Step 2: type the code from the email (same page, the card changes) ────
  if (!s.signedIn && s.codeSentTo) {
    return <PageFrame variant="split" short><CreamCard><CodeStep s={s} /></CreamCard></PageFrame>;
  }

  // ── Step 1 (signed out) and finishing a shop for a signed-in account ───────
  return (
    <PageFrame variant="split">
      <CreamCard>
        {backButton}
        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-espresso-900 sm:text-4xl">
          {s.signedIn ? 'Set up your shop' : 'Create your JPOS account'}
        </h1>
        <p className="mb-6 mt-1.5 text-bark-600">
          {s.signedIn ? 'Almost done! Tell us about your shop.' : 'It only takes a few minutes.'}
        </p>
        <SignUpForm s={s} onChangePlan={() => s.setChoice(null)} />
        {!s.signedIn && <div className="mt-4"><SignInLine /></div>}
        <div className="mt-6 border-t border-cream-400/70 pt-5">
          <p className="mb-3 text-sm text-bark-600">Questions before you sign up? Talk to us:</p>
          <ContactOwner message="Hi! I have a question about JPOS." />
        </div>
      </CreamCard>
    </PageFrame>
  );
}

/**
 * The page around every sign-up step, in the landing page's style.
 * - split: the welcome side ("Join JPOS", highlights, the POS pictures) + the
 *   card. The form, the email code and "please wait" all use it, so only the
 *   card changes between steps. `short` cards sit level with the welcome side.
 * - wide: the package cards
 */
function PageFrame({ variant, short, children }: { variant: 'split' | 'wide'; short?: boolean; children: React.ReactNode }) {
  return (
    <div data-theme="espresso" className="relative isolate min-h-dvh overflow-hidden bg-cream-100">
      {/* Soft sage circles, like the landing's retail photo */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <SageBubble className="-right-40 -top-48 h-[520px] w-[520px]" />
        <SageBubble className="-right-6 -top-24 h-72 w-72 bg-sage-200/60" />
        <SageBubble className="-bottom-56 -left-40 h-[520px] w-[520px] bg-sage-200/60" />
        <SageBubble className="-bottom-24 left-[22%] hidden h-64 w-64 bg-sage-200/50 lg:block" />
      </div>

      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 pt-6 sm:px-6 lg:px-10">
        <Link to="/login" aria-label="JPOS home"><BrandMark subtitle="Point of Sale" /></Link>
        <p className="hidden items-center gap-3 text-[11px] font-semibold tracking-[0.2em] text-caramel-600 sm:flex">
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-caramel-500/70" />
          GOOD SERVICE <span className="text-caramel-400">•</span> GREAT BUSINESS
        </p>
      </header>

      {variant === 'split' && (
        <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 pb-14 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] lg:gap-14 lg:px-10 lg:pt-12">
          <Welcome />
          <main className={cn('mx-auto w-full min-w-0', short ? 'max-w-[560px] lg:max-w-none lg:self-center' : 'max-w-[600px] lg:max-w-none')}>{children}</main>
        </div>
      )}
      {variant === 'wide' && (
        <main className="mx-auto max-w-5xl px-4 pb-14 pt-8 sm:px-6">{children}</main>
      )}
    </div>
  );
}

/** The welcome side: like the landing's "About JPOS", with the POS pictures. */
function Welcome() {
  return (
    <aside className="hidden min-w-0 lg:block">
      <h2 className="flex items-end gap-3">
        <span className="font-script text-7xl leading-none text-caramel-500">Join</span>
        <span className="pb-1 font-display text-6xl font-semibold leading-none text-espresso-900">JPOS</span>
      </h2>
      <p className="mt-4 text-lg font-semibold text-espresso-800">A smart start for your small business</p>
      <p className="mt-3 max-w-md leading-relaxed text-bark-600">
        Set up your shop, add your staff and start selling in minutes. Free to sign up: you pay only when you're ready.
      </p>
      <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-4">
        {HIGHLIGHTS.map(({ icon: Icon, line1, line2 }) => (
          <li key={line1} className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-caramel-400/60 bg-cream-50 text-caramel-600 shadow-[inset_0_0_12px_rgba(221,161,94,0.2)]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium leading-tight text-espresso-800">{line1}<br />{line2}</span>
          </li>
        ))}
      </ul>

      {/* The counter: POS terminal in front, receipt printer beside it */}
      <div className="relative mt-12 h-[330px] max-w-[560px]" aria-hidden="true">
        <div className="absolute left-[10%] top-[18%] h-[240px] w-[440px] rounded-full bg-caramel-300/30 blur-3xl" />
        <div className="absolute inset-x-[4%] bottom-3 h-6 rounded-[50%] bg-espresso-900/15 blur-xl" />
        <img src="/images/pos/receipt-printer.webp" alt="" width={308} height={308} className="absolute bottom-6 right-[4%] w-[36%] drop-shadow-[0_20px_26px_rgba(40,30,20,0.28)]" />
        <img src="/images/pos/terminal.webp" alt="" width={512} height={453} className="absolute bottom-3 left-0 w-[64%] drop-shadow-[0_26px_32px_rgba(40,30,20,0.3)]" />
      </div>
    </aside>
  );
}

