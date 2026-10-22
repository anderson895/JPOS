import { useState, useEffect, useRef } from 'react';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthErrorMessage, CANCELLED_SIGN_IN_CODES } from '@/lib/authErrors';
import { CreditCard, KeyRound, Eye, EyeOff, Loader2, Wifi, Mail, Lock, LogIn } from 'lucide-react';
import { CoffeeBranch } from '@/components/shared/Decor';
import toast from 'react-hot-toast';

// RFID readers "type" a tag at roughly 10–30 ms per character; people are far slower.
const SCANNER_MS_PER_CHAR = 50;

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Sign-in card shown in the landing-page hero (Password / RFID / Google).
 * Auth logic is unchanged from the previous LoginPage — only the markup moved here.
 * `id="login"` and `id="login-email"` are scroll/focus targets for the landing CTAs.
 */
export default function LoginCard() {
  const { login, loginWithRFID, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<'password' | 'rfid'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [rfidInput, setRfidInput] = useState('');
  const rfidRef = useRef<HTMLInputElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstCharAt = useRef(0);
  const loadingRef = useRef(false);

  // Keep loadingRef in sync so the focus loop / handlers can read it without re-binding
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  // Keep the RFID capture input focused the whole time we're in RFID mode.
  // An RFID reader behaves like a keyboard: it types the tag into whatever is
  // focused, then presses Enter. By owning focus we reliably capture the scan.
  useEffect(() => {
    if (mode !== 'rfid') return;
    const focusInput = () => {
      const el = rfidRef.current;
      const active = document.activeElement as HTMLElement | null;
      // Leave other text fields alone (e.g. the newsletter box)
      const typingElsewhere = !!active && active !== el &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable);
      if (!loadingRef.current && el && active !== el && !typingElsewhere) {
        el.focus({ preventScroll: true }); // never yank the page back to the card
      }
    };
    focusInput();
    const interval = setInterval(focusInput, 300);
    return () => {
      clearInterval(interval);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [mode]);

  const handleRFIDScan = async (raw: string) => {
    const tag = raw.trim();
    if (!tag || loadingRef.current) return;
    loadingRef.current = true; // block a second scan before the next render syncs it
    if (idleTimer.current) { clearTimeout(idleTimer.current); idleTimer.current = null; }
    setRfidInput(tag);
    setLoading(true);
    try {
      await loginWithRFID(tag);
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(getAuthErrorMessage(err, 'RFID card not recognized'));
      setRfidInput('');
      if (rfidRef.current) rfidRef.current.value = '';
      rfidRef.current?.focus();
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  // Fires while the reader is typing. Most readers append Enter (handled in
  // onKeyDown); this idle-timer is a fallback for readers that don't.
  // It only kicks in for scanner-speed input — otherwise a person typing a
  // tag by hand would get submitted half-way through after a short pause.
  const handleRFIDInput = (value: string) => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    const length = value.trim().length;
    if (length <= 1) firstCharAt.current = Date.now();
    const msPerChar = (Date.now() - firstCharAt.current) / Math.max(length - 1, 1);
    if (length >= 4 && msPerChar < SCANNER_MS_PER_CHAR) {
      idleTimer.current = setTimeout(() => handleRFIDScan(value), 350);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
    } catch (err) {
      toast.error(getAuthErrorMessage(err, 'Invalid email or password'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      toast.success('Welcome back!');
    } catch (err) {
      // Closing the Google window is a choice, not an error
      if (err instanceof FirebaseError && CANCELLED_SIGN_IN_CODES.includes(err.code)) return;
      toast.error(getAuthErrorMessage(err, 'Google sign-in failed. Please try again.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div id="login" className="relative w-full max-w-[420px] mx-auto scroll-mt-28">
      <div
        className="relative overflow-hidden rounded-4xl border border-white/70 px-6 py-7 sm:px-8 sm:py-8 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]"
        style={{ background: 'linear-gradient(165deg, #fffaf2 0%, #faf0e2 55%, #f3e3cc 100%)' }}
      >
        {/* Leaf decoration, top-right corner */}
        <CoffeeBranch className="absolute -top-10 -right-24 w-64 opacity-40 rotate-[-38deg]" />

        {/* Header */}
        <div className="relative text-center">
          <img src="/logo.png" alt="JPOS logo" className="w-20 h-20 mx-auto rounded-full mix-blend-multiply" />
          <h2 className="mt-1 font-display text-3xl font-semibold text-espresso-900 tracking-wide">JPOS</h2>
          <div className="mt-1 flex items-center justify-center gap-2 text-[13px] font-medium text-espresso-800">
            <span className="h-px w-8 sm:w-12 bg-gradient-to-r from-transparent to-caramel-500" />
            <span className="w-1 h-1 rotate-45 bg-caramel-500" />
            Coffee Shop Point of Sale
            <span className="w-1 h-1 rotate-45 bg-caramel-500" />
            <span className="h-px w-8 sm:w-12 bg-gradient-to-l from-transparent to-caramel-500" />
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="segmented relative mt-6" role="tablist" aria-label="Sign-in method">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'password'}
            onClick={() => setMode('password')}
            className={`segmented-item ${mode === 'password' ? 'active' : ''}`}
          >
            <KeyRound className="w-4 h-4" />
            Password
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'rfid'}
            onClick={() => setMode('rfid')}
            className={`segmented-item ${mode === 'rfid' ? 'active' : ''}`}
          >
            <CreditCard className="w-4 h-4" />
            RFID Card
          </button>
        </div>

        <div className="relative mt-6">
          {mode === 'password' ? (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="label">Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-500 pointer-events-none" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input pl-11 py-3"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="login-password" className="label">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-bark-500 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="input pl-11 pr-12 py-3"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-bark-500 hover:text-espresso-800 transition-colors"
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="btn-primary w-full py-3 text-[15px] !mt-6"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-cream-400/80" />
                <span className="text-xs text-bark-500">or continue with</span>
                <div className="h-px flex-1 bg-cream-400/80" />
              </div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading || googleLoading}
                className="btn w-full py-3 bg-white text-espresso-900 border border-cream-400/80 shadow-sm hover:bg-cream-50 hover:shadow-md"
              >
                {googleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon className="w-5 h-5" />}
                {googleLoading ? 'Waiting for Google...' : 'Sign in with Google'}
              </button>
            </>
          ) : (
            <div className="text-center py-2">
              {/* Clicking the card area re-focuses the capture input */}
              <button
                type="button"
                onClick={() => rfidRef.current?.focus()}
                className={`w-32 h-32 mx-auto mb-5 rounded-4xl bg-cream-200/70 border-2 border-dashed flex flex-col items-center justify-center transition-all ${
                  loading ? 'border-caramel-500 rfid-pulse' : 'border-caramel-400/70 hover:border-caramel-500 hover:bg-cream-200'
                }`}
              >
                {loading ? (
                  <Loader2 className="w-12 h-12 text-caramel-600 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-12 h-12 text-espresso-700 mb-2" />
                    <Wifi className="w-5 h-5 text-caramel-600" />
                  </>
                )}
              </button>
              <h3 className="font-display text-xl text-espresso-900 mb-1">
                {loading ? 'Authenticating...' : 'Tap Your RFID Card'}
              </h3>
              <p className="text-bark-500 text-sm">
                {loading ? `Reading: ${rfidInput}` : 'Hold your card near the reader'}
              </p>

              {/* Capture input — always focused while in RFID mode so the reader
                  types straight into it. Also usable for manual entry/testing. */}
              <div className="mt-6 pt-5 border-t border-cream-400/70">
                <p className="text-bark-500 text-xs mb-3">Tap a card, or type the tag and press Enter</p>
                <div className="flex gap-2">
                  <input
                    ref={rfidRef}
                    type="text"
                    autoFocus
                    disabled={loading}
                    placeholder="Waiting for card..."
                    onChange={e => handleRFIDInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && rfidRef.current?.value) {
                        e.preventDefault();
                        const val = rfidRef.current.value;
                        rfidRef.current.value = '';
                        handleRFIDScan(val);
                      }
                    }}
                    className="input flex-1 font-mono"
                  />
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      if (rfidRef.current?.value) {
                        const val = rfidRef.current.value;
                        rfidRef.current.value = '';
                        handleRFIDScan(val);
                      }
                    }}
                    className="btn-primary px-5"
                  >
                    Scan
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="relative text-center text-bark-500 text-[11px] mt-6">
          JPOS v1.0 · <span className="text-espresso-700">Coffee Shop Management System</span>
        </p>
      </div>
    </div>
  );
}
