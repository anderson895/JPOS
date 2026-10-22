import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { AlertCircle, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { applyTheme } from '@/components/shared/theme';
import { Shell } from '@/pages/SubscribePage';

/**
 * Opened from the "Confirm my email" button in JPOS's sign-up email.
 * Confirms the email with Firebase, then sends the owner on to set up the shop.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const code = params.get('oobCode') ?? '';
  const { firebaseUser, checkEmailVerified } = useAuth();
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  // The code works once: don't send it twice (React runs effects twice in development)
  const started = useRef(false);

  useEffect(() => { applyTheme(null); }, []);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!code) { setState('failed'); return; }
    applyActionCode(auth, code)
      .then(async () => {
        await checkEmailVerified().catch(() => false);
        setState('done');
      })
      .catch(async () => {
        // Already used (e.g. tapped twice) but this account is confirmed: that's fine too
        const ok = await checkEmailVerified().catch(() => false);
        setState(ok ? 'done' : 'failed');
      });
  }, [code, checkEmailVerified]);

  return (
    <Shell>
      <div className="text-center">
        {state === 'working' && (
          <>
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-caramel-500" aria-hidden="true" />
            <h1 className="mt-3 font-display text-2xl text-espresso-900">Confirming your email…</h1>
          </>
        )}

        {state === 'done' && (
          <>
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" aria-hidden="true" />
            <h1 className="mt-3 font-display text-2xl text-espresso-900">Email confirmed!</h1>
            {firebaseUser ? (
              <>
                <p className="mt-2 text-sm text-bark-600">Next, tell us about your shop.</p>
                <Link to="/subscribe" className="btn-primary w-full py-3 mt-6">
                  Continue setting up your shop <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-bark-600">Sign in to finish setting up your shop.</p>
                <Link to="/login" className="btn-primary w-full py-3 mt-6">
                  Sign in <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </>
            )}
          </>
        )}

        {state === 'failed' && (
          <>
            <AlertCircle className="w-12 h-12 mx-auto text-caramel-600" aria-hidden="true" />
            <h1 className="mt-3 font-display text-2xl text-espresso-900">This link doesn't work anymore</h1>
            <p className="mt-2 text-sm text-bark-600">
              It may be old or already used. Go back to the sign-up page and press "Send the email again" to get a new one.
            </p>
            <Link to="/subscribe" className="btn-primary w-full py-3 mt-6">Back to sign-up</Link>
          </>
        )}
      </div>
    </Shell>
  );
}
