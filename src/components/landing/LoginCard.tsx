import { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { useAuth } from '@/contexts/AuthContext';
import { getAuthErrorMessage, CANCELLED_SIGN_IN_CODES } from '@/lib/authErrors';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import CreamCard from '@/components/shared/CreamCard';
import GoogleIcon from '@/components/shared/GoogleIcon';
import ForgotPassword from '@/components/landing/ForgotPassword';
import { forgetSignInPage, rememberSignInPage } from '@/lib/terminal';
import type { StoreBrand } from '@/lib/storeProfile';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

/**
 * Sign-in card shown in the landing-page hero (email and password, or Google).
 * Auth logic is unchanged from the previous LoginPage — only the markup moved here.
 * `id="login"` and `id="login-email"` are scroll/focus targets for the landing CTAs.
 */
export default function LoginCard({ terminalSlug, brand }: {
  /** Set on a shop's terminal page (/s/:slug). */
  terminalSlug?: string;
  /** The shop's own name and logo, on its sign-in page. */
  brand?: StoreBrand;
} = {}) {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  // Signing out returns here: this shop's sign-in page, or the landing page
  const signInPage = terminalSlug ? `/s/${terminalSlug}` : '/login';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  // "Forgot password?": the card shows the reset steps instead of the sign-in form
  const [forgot, setForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    try {
      await login(email, password, terminalSlug);
      rememberSignInPage(signInPage);
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
      await loginWithGoogle(terminalSlug);
      rememberSignInPage(signInPage);
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
      <CreamCard>

        {/* Header: the JPOS logo already says "JPOS · Point of Sale"; a shop's page shows its own name */}
        <div className="relative text-center">
          {brand?.hasLogo
            ? <img src={brand.logoUrl} alt="" className="w-20 h-20 mx-auto rounded-2xl object-cover shadow-md ring-1 ring-cream-400/70" />
            : <img src="/logo.png" alt="JPOS, Point of Sale" className="w-24 h-24 mx-auto rounded-full mix-blend-multiply" />}
          {brand ? (
            <h2 className={cn('mt-2 font-display font-semibold text-espresso-900 tracking-wide break-words', brand.name.length > 18 ? 'text-2xl' : 'text-3xl')}>
              {brand.name}
            </h2>
          ) : (
            <h2 className="sr-only">Sign in to JPOS</h2>
          )}
        </div>

        <div className="relative mt-6">
          {forgot ? (
            <ForgotPassword
              initialEmail={email}
              terminalSlug={terminalSlug}
              signInPage={signInPage}
              onBack={address => { if (address) setEmail(address); setPassword(''); setForgot(false); }}
            />
          ) : (
            <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="label">Email</label>
                  <div className="relative">
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="input py-3"
                      required
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor="login-password" className="label">Password</label>
                    <button type="button" onClick={() => setForgot(true)} disabled={loading || googleLoading}
                      className="text-xs font-semibold text-caramel-700 hover:text-espresso-900 hover:underline underline-offset-2">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPass ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="input pr-12 py-3"
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
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
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
              {/* The public page: new shops sign up from here */}
              {!terminalSlug && (
                <p className="mt-5 text-center text-sm text-bark-600">
                  New to JPOS?{' '}
                  <Link to="/subscribe?plan=trial" className="font-semibold text-caramel-700 underline-offset-2 hover:text-espresso-900 hover:underline">Create account</Link>
                </p>
              )}
            </>
          )}
        </div>

        {/* A shop's page: "Powered by JPOS" goes to the JPOS main page, and the
            device stops coming back to this shop page (forgetSignInPage) */}
        {terminalSlug ? (
          <p className="relative text-center text-[11px] mt-6">
            <button
              type="button"
              onClick={() => { forgetSignInPage(); navigate('/login'); }}
              className="text-bark-500 underline-offset-2 hover:text-espresso-900 hover:underline"
              title="Go to the JPOS home page"
            >
              Powered by <span className="font-semibold text-espresso-700">JPOS</span>
            </button>
          </p>
        ) : null}
      </CreamCard>
    </div>
  );
}
