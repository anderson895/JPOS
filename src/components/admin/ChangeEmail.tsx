import { useEffect, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Lock, Mail, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth, USE_EMULATORS } from '@/lib/firebase';
import { getAuthErrorMessage } from '@/lib/authErrors';
import { finishEmailChange, sendEmailChangeCode } from '@/lib/account';
import { CodeBoxes, LocalCodeHelper } from '@/components/signup/SignUpParts';
import { cn } from '@/lib/utils';

/** "Send a new code" waits a minute between emails (the server's limit too). */
const RESEND_WAIT_MS = 60_000;

const showError = (err: unknown, fallback: string) => {
  const code = err instanceof FirebaseError ? err.code : '';
  const message = ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(code)
    ? "That password isn't right."
    : getAuthErrorMessage(err, fallback);
  toast.error(message, { id: message, duration: 6000 });
};

/**
 * The Super Admin's sign-in email, with "Change": type the new email and the
 * password, then the 6-digit code sent to the new email. Only the JPOS owner
 * sees this (the server allows only them too).
 */
export default function ChangeEmailCard({ className }: { className?: string }) {
  const [current, setCurrent] = useState(auth.currentUser?.email ?? '');
  const [step, setStep] = useState<'view' | 'form' | 'code'>('view');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'send' | 'confirm' | 'resend'>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const waitSec = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (waitSec <= 0) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [waitSec > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const googleOnly = !!auth.currentUser && !auth.currentUser.providerData.some(p => p.providerId === 'password');

  const reset = () => { setStep('view'); setEmail(''); setPassword(''); setCode(''); setShowPass(false); };

  const send = async (resend = false) => {
    const address = email.trim().toLowerCase();
    if (!/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(address)) { toast.error('Enter a valid email address.', { id: 'email' }); return; }
    if (!password) { toast.error('Type your password.', { id: 'password' }); return; }
    setBusy(resend ? 'resend' : 'send');
    try {
      await sendEmailChangeCode(address, password);
      setEmail(address);
      setCode('');
      setStep('code');
      setResendAt(Date.now() + RESEND_WAIT_MS);
      setNow(Date.now());
      if (resend) toast.success('We sent you a new code.');
    } catch (err) {
      showError(err, 'Could not send the code. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (value: string) => {
    if (busy || !/^\d{6}$/.test(value)) return;
    setBusy('confirm');
    try {
      await finishEmailChange(email, value, password);
      toast.dismiss();
      toast.success(`Your sign-in email is now ${email}.`, { duration: 6000 });
      setCurrent(email);
      reset();
    } catch (err) {
      setCode('');
      showError(err, 'Could not change your email. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Now */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="label !mb-0.5">Sign-in email</p>
          <p className="truncate font-semibold text-espresso-900">{current || '-'}</p>
        </div>
        {step === 'view' && !googleOnly && (
          <button type="button" onClick={() => setStep('form')} className="btn-secondary px-4 py-2 text-sm">
            <Mail className="h-4 w-4" aria-hidden="true" /> Change email
          </button>
        )}
      </div>
      {googleOnly && <p className="text-xs text-bark-500">You sign in with Google, so this email follows your Google account.</p>}

      {/* 1. New email + password */}
      {step === 'form' && (
        <form onSubmit={e => { e.preventDefault(); send(); }} className="space-y-3 rounded-3xl border border-cream-300 bg-white/60 p-4">
          <div>
            <label className="label" htmlFor="new-signin-email">New email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bark-500" aria-hidden="true" />
              <input id="new-signin-email" className="input pl-11" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmail.com" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="change-email-password">Your password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-bark-500" aria-hidden="true" />
              <input id="change-email-password" className="input pl-11 pr-11" type={showPass ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="To make sure it's you" required />
              <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-500 hover:text-espresso-800" aria-label={showPass ? 'Hide password' : 'Show password'}>
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-xs text-bark-500">We'll send a 6-digit code to the new email.</p>
          <div className="flex gap-2">
            <button type="button" onClick={reset} disabled={!!busy} className="btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={!!busy} className="btn-primary flex-1">
              {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
              {busy === 'send' ? 'Sending…' : 'Send code'}
            </button>
          </div>
        </form>
      )}

      {/* 2. The code from the new email */}
      {step === 'code' && (
        <form onSubmit={e => { e.preventDefault(); confirm(code); }} className="space-y-3 rounded-3xl border border-cream-300 bg-white/60 p-4">
          <button type="button" onClick={() => setStep('form')} disabled={!!busy} className="inline-flex items-center gap-1.5 text-sm font-medium text-bark-500 hover:text-espresso-800">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
          </button>
          <p className="text-sm text-bark-600">We sent a 6-digit code to <strong className="text-espresso-900 [overflow-wrap:anywhere]">{email}</strong>.</p>
          <CodeBoxes id="change-email-code" value={code} onChange={digits => { setCode(digits); if (digits.length === 6) confirm(digits); }} />
          <button type="submit" disabled={code.length !== 6 || !!busy} className="btn-primary w-full">
            {busy === 'confirm' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {busy === 'confirm' ? 'Changing…' : 'Confirm new email'}
          </button>
          {USE_EMULATORS && <LocalCodeHelper email={email} onCode={c => { setCode(c); confirm(c); }} />}
          <button type="button" onClick={() => send(true)} disabled={waitSec > 0 || !!busy} className="btn-secondary w-full">
            {busy === 'resend' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            {busy === 'resend' ? 'Sending…' : waitSec > 0 ? `Send a new code in ${waitSec}s` : 'Send a new code'}
          </button>
          <p className="text-center text-xs text-bark-500">Not in your inbox? Check Spam.</p>
        </form>
      )}
    </div>
  );
}
