import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FirebaseError } from 'firebase/app';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformSettings } from '@/components/shared/ContactOwner';
import { isPlanChoice, type PlanChoice } from '@/components/shared/PlanCards';
import { getAuthErrorMessage, CANCELLED_SIGN_IN_CODES } from '@/lib/authErrors';
import { createShop, isSlugAvailable, slugify, slugProblem, startTrial, SIGNUP_CLOSED_MESSAGE, SlugTakenError } from '@/lib/subscriptions';
import { rememberSignInPage } from '@/lib/terminal';
import { isBusinessType } from '@/lib/storeProfile';
import type { BusinessType, PlanId } from '@/types';

const DRAFT_KEY = 'jpos-signup-draft';
/** "Send a new code" waits a minute between emails (the server's limit too). */
const RESEND_WAIT_MS = 60_000;
/** A code works for 10 minutes: within that, the same email skips sending another one. */
const CODE_LIFE_MS = 10 * 60_000;
interface Draft { shopName: string; slug: string; ownerName: string; businessType: BusinessType | null; plan: PlanChoice | null; email?: string }

/**
 * Kept in this browser, so a reload (or a phone closing the tab while the
 * owner reads the email) doesn't lose what was typed. Never the password.
 */
function loadDraft(): Partial<Draft> {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}'); } catch { return {}; }
}
function saveDraft(d: Draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ }
}
export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ }
}

/** One toast per message: pressing again shows the same toast again, not a pile of copies. */
export const showError = (err: unknown, fallback: string) => {
  const message = getAuthErrorMessage(err, fallback);
  toast.error(message, { id: message, duration: 6000 });
};

export type SignUp = ReturnType<typeof useSignUp>;

/**
 * The whole sign-up behind the /subscribe page: fill in the shop and account,
 * type the 6-digit code from the email, and the account and shop are made
 * together (the free trial starts too, if picked). Then the owner lands in the
 * app, signed in. No account exists until the code is right.
 */
export function useSignUp(initialChoice: PlanChoice | null) {
  const { currentUser, firebaseUser, noShop, loginWithGoogle, sendSignUpCode, finishSignUp, logout } = useAuth();
  const { settings, loaded: settingsLoaded, saved: settingsSaved } = usePlatformSettings();
  // No prices and trial saved yet: no shop can be made, so don't make accounts either
  const closed = settingsLoaded && !settingsSaved;
  const navigate = useNavigate();
  // Only this account's draft (a different sign-up on this computer starts fresh)
  const draft = useMemo(() => {
    const d = loadDraft();
    const mine = firebaseUser?.email?.toLowerCase();
    return !d.email || !mine || d.email.toLowerCase() === mine ? d : {};
  }, [firebaseUser?.email]);

  // The free trial or a package; null = show the package cards first
  const [choice, setChoice] = useState<PlanChoice | null>(initialChoice ?? (isPlanChoice(draft.plan) ? draft.plan : null));
  const plan: PlanId = !choice || choice === 'trial' ? 'starter' : choice;
  const [shopName, setShopName] = useState(draft.shopName ?? '');
  const [slug, setSlugValue] = useState(draft.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(!!draft.slug);
  const [slugFree, setSlugFree] = useState<boolean | null>(null);
  const [ownerName, setOwnerName] = useState(draft.ownerName ?? '');
  // What the shop sells: it picks the product details the shop fills in
  const [businessType, setBusinessType] = useState<BusinessType | null>(isBusinessType(draft.businessType) ? draft.businessType : null);
  const [email, setEmail] = useState(draft.email ?? '');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  // Which button is busy (it shows a spinner)
  const [busy, setBusy] = useState<null | 'code' | 'resend' | 'google' | 'leave'>(null);
  // The "please wait" text while the account and shop are being made
  const [working, setWorking] = useState<string | null>(null);
  // Where to go once the shop this form made shows up
  const [target, setTarget] = useState<string | null>(null);
  // Step 2: the email the code went to (null = still filling in the form)
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<{ to: string; at: number } | null>(null);
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const waitSec = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const counting = waitSec > 0;
  useEffect(() => {
    if (!counting) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [counting]);

  // The shop link follows the shop name until the owner edits it
  useEffect(() => { if (!slugTouched) setSlugValue(slugify(shopName)); }, [shopName, slugTouched]);
  // Is the link free? (checked shortly after typing stops)
  useEffect(() => {
    setSlugFree(null);
    if (slugProblem(slug)) return;
    const timer = setTimeout(() => { isSlugAvailable(slug).then(setSlugFree).catch(() => setSlugFree(null)); }, 400);
    return () => clearTimeout(timer);
  }, [slug]);
  // Done: into the app as soon as the new shop shows up
  useEffect(() => {
    if (!target || !currentUser) return;
    navigate(currentUser.role === 'admin' ? target : '/staff', { replace: true });
  }, [target, currentUser, navigate]);
  // Safety net: if the new shop never shows up, don't keep the owner waiting forever
  useEffect(() => {
    if (!target || currentUser) return;
    const timer = setTimeout(() => setWorking(null), 15_000);
    return () => clearTimeout(timer);
  }, [target, currentUser]);

  const signedIn = !!firebaseUser && noShop;
  // Signed in with Google: their Google name fills "Your name" (unless they typed one)
  useEffect(() => {
    const googleName = firebaseUser?.displayName?.trim();
    if (signedIn && googleName && (!ownerName.trim() || ownerName.includes('@'))) setOwnerName(googleName.slice(0, 60));
    // Only when the account changes, so clearing the field by hand isn't undone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, firebaseUser?.displayName]);
  const shopProblem = !shopName.trim() || shopName.trim().length < 2 ? 'Enter your shop name.'
    : slugProblem(slug) ?? (slugFree === false ? 'That shop link is taken. Try another one.' : null)
    ?? (!ownerName.trim() ? 'Enter your name.' : null)
    ?? (!businessType ? 'Pick what your store sells.' : null);

  const setSlug = (value: string) => {
    setSlugTouched(true);
    // A whole pasted link (…/s/kape-ni-juan) keeps just the shop's part
    const part = value.includes('/s/') ? value.slice(value.lastIndexOf('/s/') + 3) : value;
    setSlugValue(part.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40));
  };

  /** Makes the shop for the signed-in owner, starts the free trial if picked, then opens the app. */
  const createTheShop = async () => {
    if (closed) { setWorking(null); showError(new Error(SIGNUP_CLOSED_MESSAGE), SIGNUP_CLOSED_MESSAGE); return; }
    if (shopProblem) { setWorking(null); toast.error(shopProblem, { id: shopProblem }); return; }
    setWorking('Setting up your shop…');
    try {
      const shopId = await createShop({ shopName, slug, ownerName, businessType: businessType ?? 'other', desiredPlan: plan });
      clearDraft();
      if (choice === 'trial') {
        setWorking('Starting your free trial…');
        try {
          await startTrial({ id: shopId, status: 'setup', trialUsed: false });
          toast.success(`Welcome to JPOS! Your ${settings.trialDays}-day free trial has started.`);
          setTarget('/admin');
        } catch {
          toast.error("Your shop is ready, but the free trial didn't start. Press \"Start free trial\".", { duration: 6000 });
          setTarget('/admin/billing');
        }
      } else {
        toast.success('Welcome to JPOS! Your shop is ready.');
        setTarget(choice ? `/admin/billing?plan=${choice}` : '/admin');
      }
      setWorking('Opening your shop…');
    } catch (err) {
      setWorking(null);
      if (err instanceof SlugTakenError) setSlugFree(false);
      showError(err, 'Could not create your shop. Please try again.');
    }
  };

  const startResendWait = () => {
    setResendAt(Date.now() + RESEND_WAIT_MS);
    setNow(Date.now());
  };

  // Step 1: check the form, then email the code
  const sendCode = async () => {
    // Checked first: no code, so no account that could never get a shop
    if (closed) { showError(new Error(SIGNUP_CLOSED_MESSAGE), SIGNUP_CLOSED_MESSAGE); return; }
    if (shopProblem) { toast.error(shopProblem, { id: shopProblem }); return; }
    if (password.length < 6) { toast.error('Use a password with at least 6 characters.', { id: 'password' }); return; }
    const address = email.trim().toLowerCase();
    saveDraft({ shopName, slug, ownerName, businessType, plan: choice, email: address });
    // Came back to fix something: the code already sent to this email still works
    if (lastSent?.to === address && Date.now() - lastSent.at < CODE_LIFE_MS) {
      setCodeSentTo(address);
      return;
    }
    setBusy('code');
    try {
      await sendSignUpCode(address);
      setLastSent({ to: address, at: Date.now() });
      setCode('');
      setCodeSentTo(address);
      startResendWait();
    } catch (err) {
      showError(err, 'Could not send the code. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  // Step 2: a right code makes the account (signed in), then the shop
  const confirmCode = async (value: string) => {
    if (!codeSentTo || working) return;
    if (!/^\d{6}$/.test(value)) { toast.error('Enter the 6-digit code from the email.'); return; }
    setWorking('Creating your account…');
    try {
      await finishSignUp({ email: codeSentTo, code: value, password, name: ownerName });
      rememberSignInPage('/login');
    } catch (err) {
      setWorking(null);
      setCode('');
      showError(err, 'Could not create your account. Please try again.');
      return;
    }
    toast.dismiss(); // e.g. an earlier "That code isn't right"
    setLastSent(null);
    await createTheShop();
  };

  const resend = async () => {
    if (!codeSentTo || waitSec > 0) return;
    setBusy('resend');
    try {
      await sendSignUpCode(codeSentTo);
      setLastSent({ to: codeSentTo, at: Date.now() });
      setCode('');
      startResendWait();
      toast.success('We sent you a new code.');
    } catch (err) {
      showError(err, 'Could not send the code. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    if (closed) { showError(new Error(SIGNUP_CLOSED_MESSAGE), SIGNUP_CLOSED_MESSAGE); return; }
    if (shopProblem) { toast.error(shopProblem, { id: shopProblem }); return; }
    saveDraft({ shopName, slug, ownerName, businessType, plan: choice });
    setBusy('google');
    let isNew = false;
    try {
      ({ isNew } = await loginWithGoogle());
      rememberSignInPage('/login');
    } catch (err) {
      if (!(err instanceof FirebaseError && CANCELLED_SIGN_IN_CODES.includes(err.code))) showError(err, 'Google sign-in failed.');
      return;
    } finally {
      setBusy(null);
    }
    // A new Google account (Google already confirmed the email): make the shop from this form.
    // An existing one simply goes in.
    if (isNew) await createTheShop();
  };

  /** Signed in without a shop: sign out, back to the sign-in page. */
  const leave = async () => {
    setBusy('leave');
    try { await logout(); } finally { setBusy(null); }
    navigate('/login', { replace: true });
  };

  const useDifferentAccount = () => { clearDraft(); logout(); };

  return {
    settings, signedIn, shopProblem,
    /** Sign-up isn't open: JPOS's prices and trial were never set up. */
    closed,
    choice, setChoice, plan,
    shopName, setShopName, slug, setSlug, slugFree, ownerName, setOwnerName, businessType, setBusinessType,
    email, setEmail, password, setPassword, showPass, setShowPass,
    busy, working, target, waitSec,
    /** What the "please wait" screen says, or null. */
    waitText: working ?? (busy === 'google' && firebaseUser ? 'Signing you in…' : null),
    codeSentTo, code, setCode,
    backToForm: () => setCodeSentTo(null),
    sendCode, confirmCode, resend, google, createTheShop, leave, useDifferentAccount,
  };
}
