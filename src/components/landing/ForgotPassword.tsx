import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { resetPassword, sendPasswordResetCode } from '@/lib/account';
import { getAuthErrorMessage } from '@/lib/authErrors';
import { rememberSignInPage } from '@/lib/terminal';
import { USE_EMULATORS } from '@/lib/firebase';
import { CodeBoxes, LocalCodeHelper } from '@/components/signup/SignUpParts';

/** "Send a new code" waits a minute between emails (the server's limit too). */
const RESEND_WAIT_MS = 60_000;

/**
 * "Forgot password?" inside the sign-in card: the email gets a 6-digit code,
 * the code and a new password change it, then they're signed in. On a shop's
 * sign-in page the usual rule holds: only that shop's accounts get in.
 */
export default function ForgotPassword({ initialEmail, terminalSlug, signInPage, onBack }: {
  initialEmail: string;
  terminalSlug?: string;
  /** Where logging out returns to (this page). */
  signInPage: string;
  /** Back to signing in, with the email filled in. */
  onBack: (email: string) => void;
}) {
  const { login } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState<null | 'send' | 'resend' | 'save'>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const passwordRef = useRef<HTMLInputElement>(null);
  const waitSec = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (waitSec <= 0) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [waitSec > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const error = (err: unknown, fallback: string) => toast.error(err instanceof Error && err.message ? err.message : fallback, { id: 'forgot' });

  async function send(again = false) {
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { toast.error('Enter your email.', { id: 'forgot' }); return; }
    setBusy(again ? 'resend' : 'send');
    try {
      await sendPasswordResetCode(address);
      setCode('');
      setStep('code');
      setResendAt(Date.now() + RESEND_WAIT_MS);
      setNow(Date.now());
      if (again) toast.success('We sent you a new code.');
    } catch (err) {
      error(err, "We couldn't send the code. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!/^\d{6}$/.test(code)) { toast.error('Enter the 6-digit code from the email.', { id: 'forgot' }); return; }
    if (password.length < 6) { toast.error('Use a password with at least 6 characters.', { id: 'forgot' }); return; }
    setBusy('save');
    try {
      await resetPassword(email, code, password);
    } catch (err) {
      setBusy(null);
      setCode('');
      error(err, "We couldn't change your password. Please try again.");
      return;
    }
    // Changed: sign in with it right away
    try {
      await login(email.trim(), password, terminalSlug);
      rememberSignInPage(signInPage);
      toast.success('Password changed. Welcome back!', { id: 'forgot' });
    } catch (err) {
      setBusy(null);
      toast.success('Password changed.');
      toast.error(getAuthErrorMessage(err, 'Sign in with your new password.'), { id: 'forgot' });
      onBack(email.trim());
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => (step === 'code' ? setStep('email') : onBack(email.trim()))} disabled={!!busy}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-bark-500 hover:text-espresso-800">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {step === 'code' ? 'Back' : 'Back to sign in'}
      </button>
      <div>
        <h3 className="flex items-center gap-2 font-display text-xl text-espresso-900">
          <KeyRound className="w-5 h-5 text-caramel-600" aria-hidden="true" /> Reset your password
        </h3>
        <p className="mt-1 text-sm text-bark-600">
          {step === 'email'
            ? "We'll email you a 6-digit code."
            : <>If <strong className="text-espresso-900 [overflow-wrap:anywhere]">{email.trim()}</strong> has a JPOS account, we sent it a code.</>}
        </p>
      </div>

      {step === 'email' ? (
        <form onSubmit={e => { e.preventDefault(); send(); }} className="space-y-4">
          <div>
            <label htmlFor="reset-email" className="label">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-500 pointer-events-none" />
              <input id="reset-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" className="input pl-11 py-3" required autoFocus />
            </div>
          </div>
          <button type="submit" disabled={!!busy} className="btn-primary w-full py-3 text-[15px]">
            {busy === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {busy === 'send' ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={e => { e.preventDefault(); save(); }} className="space-y-4">
          <CodeBoxes id="reset-code" value={code} onChange={digits => { setCode(digits); if (digits.length === 6) passwordRef.current?.focus(); }} />
          {USE_EMULATORS && <LocalCodeHelper email={email.trim().toLowerCase()} onCode={c => { setCode(c); passwordRef.current?.focus(); }} />}
          <div>
            <label htmlFor="reset-password" className="label">New password</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-500 pointer-events-none" />
              <input id="reset-password" ref={passwordRef} type={showPass ? 'text' : 'password'} autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" className="input pl-11 pr-12 py-3" />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-500 hover:text-espresso-800" aria-label={showPass ? 'Hide password' : 'Show password'}>
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={!!busy || code.length !== 6 || password.length < 6} className="btn-primary w-full py-3 text-[15px]">
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {busy === 'save' ? 'Saving…' : 'Save new password'}
          </button>
          <button type="button" onClick={() => send(true)} disabled={waitSec > 0 || !!busy} className="btn-secondary w-full">
            {busy === 'resend' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {waitSec > 0 ? `Send a new code in ${waitSec}s` : 'Send a new code'}
          </button>
          <p className="text-center text-xs text-bark-500">Not in your inbox? Check Spam.</p>
        </form>
      )}
    </div>
  );
}
