import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Lock, Sparkles, AlertTriangle, Hourglass, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { daysLeft, periodEnd, shopState } from '@/lib/entitlements';
import { startTrial } from '@/lib/subscriptions';
import ContactOwner from '@/components/shared/ContactOwner';
import { cn } from '@/lib/utils';

/**
 * The shop's subscription status, shown above every page: not started yet,
 * free trial, ending soon, ended (view-only), suspended, or a payment waiting
 * for review. Admins get the buttons; staff are told to ask their admin.
 */
export default function SubscriptionBanner() {
  const { tenant, currentUser } = useAuth();
  const [starting, setStarting] = useState(false);
  if (!tenant || !currentUser) return null;

  const isAdmin = currentUser.role === 'admin';
  const state = shopState(tenant);
  const left = daysLeft(tenant);
  const end = periodEnd(tenant);
  const pending = !!tenant.pendingRequestId;

  const doStartTrial = async () => {
    if (!confirm(`Start your ${tenant.trialDays}-day free trial now? You can use it only once.`)) return;
    setStarting(true);
    try {
      await startTrial(tenant);
      toast.success(`Your free trial has started. Enjoy JPOS for ${tenant.trialDays} days!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the trial.');
    } finally {
      setStarting(false);
    }
  };

  let tone: 'info' | 'warn' | 'danger' = 'info';
  let Icon = Sparkles;
  let text = '';
  if (state === 'setup') {
    Icon = Lock;
    text = isAdmin
      ? 'Your shop is not active yet. Start your free trial or subscribe to start selling.'
      : 'This shop is not active yet. Ask your shop owner to activate it.';
  } else if (state === 'trial') {
    Icon = Clock;
    text = `Free trial: ${left === 0 ? 'last day' : `${left} day${left === 1 ? '' : 's'} left`}.`;
    if ((left ?? 99) <= 2) tone = 'warn';
  } else if (state === 'trial-ended') {
    Icon = Lock; tone = 'warn';
    text = isAdmin ? 'Your free trial has ended. Subscribe to keep using JPOS.' : 'The free trial has ended. Ask your shop owner to subscribe.';
  } else if (state === 'active') {
    if ((left ?? 99) > 5) return pending ? <PendingNote /> : null;
    Icon = Clock; tone = 'warn';
    text = `Your subscription ends on ${end ? format(end, 'MMM d') : ''} (${left === 0 ? 'today' : `${left} day${left === 1 ? '' : 's'} left`}).`;
  } else if (state === 'expired') {
    Icon = AlertTriangle; tone = 'danger';
    text = isAdmin ? 'Your subscription has ended. The shop is view-only until you renew.' : 'The subscription has ended. Ask your shop owner to renew.';
  } else {
    Icon = AlertTriangle; tone = 'danger';
    text = 'This shop is suspended. Please contact us.';
  }

  return (
    <div className={cn(
      'border-b px-4 sm:px-6 lg:px-8 py-2.5',
      tone === 'info' && 'bg-caramel-50 border-caramel-200 text-espresso-900',
      tone === 'warn' && 'bg-amber-50 border-amber-200 text-amber-900',
      tone === 'danger' && 'bg-red-50 border-red-200 text-red-900',
    )}>
      <div className="max-w-[1400px] mx-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> {text}
        </p>
        {pending && <span className="text-xs font-semibold flex items-center gap-1"><Hourglass className="w-3.5 h-3.5" aria-hidden="true" /> Payment sent, waiting for confirmation</span>}
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {isAdmin && state === 'setup' && !tenant.trialUsed && (
            <button onClick={doStartTrial} disabled={starting} className="btn-caramel px-4 py-1.5 text-sm">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
              Start {tenant.trialDays}-day free trial
            </button>
          )}
          {isAdmin && state !== 'suspended' && (
            <Link to="/admin/billing" className="btn-primary px-4 py-1.5 text-sm">
              {state === 'active' || state === 'expired' ? 'Renew' : 'Subscribe'}
            </Link>
          )}
          {state === 'suspended' && <ContactOwner compact />}
        </div>
      </div>
    </div>
  );
}

function PendingNote() {
  return (
    <div className="border-b px-4 sm:px-6 lg:px-8 py-2 bg-caramel-50 border-caramel-200 text-espresso-900">
      <p className="max-w-[1400px] mx-auto flex items-center gap-2 text-sm font-medium">
        <Hourglass className="w-4 h-4" aria-hidden="true" /> Payment sent, waiting for confirmation.
      </p>
    </div>
  );
}
