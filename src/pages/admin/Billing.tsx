import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Check, Clock, ImagePlus, Loader2, Sparkles, X, Hourglass, Ban, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import ContactOwner, { usePlatformSettings } from '@/components/shared/ContactOwner';
import { enabledChannels } from '@/lib/platform';
import { daysLeft, periodEnd, PLAN_IDS, PLAN_LABEL, shopState } from '@/lib/entitlements';
import { cancelPaymentRequest, paymentMessage, startTrial, submitPaymentRequest, watchShopRequests } from '@/lib/subscriptions';
import { normalizeReference } from '@/lib/eWallet';
import { cn } from '@/lib/utils';
import type { PlanId, SubscriptionRequest } from '@/types';

const STATE_TEXT = {
  setup: 'Not started yet',
  trial: 'Free trial',
  'trial-ended': 'Free trial ended',
  active: 'Active',
  expired: 'Ended (view-only)',
  suspended: 'Suspended',
} as const;

/** The shop owner's subscription: status, free trial, pay by QR + receipt, history. */
export default function Billing() {
  const { tenant, currentUser, isSuperAdmin } = useAuth();
  const { settings, loaded } = usePlatformSettings();
  const [params] = useSearchParams();
  const [plan, setPlan] = useState<PlanId>((PLAN_IDS.includes(params.get('plan') as PlanId) ? params.get('plan') : tenant?.desiredPlan ?? 'business') as PlanId);
  const channels = enabledChannels(settings);
  const [channelId, setChannelId] = useState('');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState('');
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!channelId && channels[0]) setChannelId(channels[0].id); }, [channels, channelId]);
  // Picked "Start free trial" at sign-up: start it right away, then open the shop
  const navigate = useNavigate();
  const autoTrial = useRef(false);
  useEffect(() => {
    if (autoTrial.current || params.get('start') !== 'trial' || !tenant || isSuperAdmin) return;
    if (tenant.status !== 'setup' || tenant.trialUsed) return;
    autoTrial.current = true;
    startTrial(tenant)
      .then(() => {
        toast.success(`Your free trial has started. Enjoy JPOS for ${tenant.trialDays} days!`);
        navigate('/admin', { replace: true });
      })
      .catch(err => toast.error(err instanceof Error ? err.message : 'Could not start the trial.'));
  }, [params, tenant, isSuperAdmin, navigate]);
  useEffect(() => (tenant ? watchShopRequests(tenant.id, setRequests, () => { /* rules */ }) : undefined), [tenant?.id]);
  useEffect(() => () => { if (proofPreview) URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  if (!tenant || !currentUser) return null;

  // The JPOS owner's own shop never pays for itself
  if (isSuperAdmin) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1100px] mx-auto animate-fade-in">
        <PageHeader eyebrow="Your plan" title="Subscription" subtitle="Your own shop, as the owner of JPOS." />
        <div className="card p-6 flex flex-wrap items-center gap-4">
          <ShieldCheck className="w-8 h-8 text-caramel-600" aria-hidden="true" />
          <div className="flex-1 min-w-[220px]">
            <p className="font-semibold text-espresso-900">No subscription needed</p>
            <p className="text-sm text-bark-600">You run JPOS, so your shop has every feature for free. Payments from other shops are in Super Admin.</p>
          </div>
          <Link to="/admin/platform" className="btn-primary">Open Super Admin</Link>
        </div>
      </div>
    );
  }

  const state = shopState(tenant);
  const end = periodEnd(tenant);
  const left = daysLeft(tenant);
  const pending = requests.find(r => r.status === 'pending');
  const channel = channels.find(c => c.id === channelId);
  const price = settings.plans[plan]?.price ?? 0;

  const pickProof = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Choose a screenshot or photo of your receipt.'); return; }
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    setProof(f);
    setProofPreview(URL.createObjectURL(f));
  };

  const send = async () => {
    if (!channel) { toast.error('Choose where you paid.'); return; }
    if (!proof) { toast.error('Attach the screenshot of your receipt.'); return; }
    setSending(true);
    try {
      await submitPaymentRequest({ tenant, plan, channelId: channel.id, reference, proofFile: proof, requesterName: currentUser.displayName });
      toast.success('Payment sent! We will confirm it shortly.');
      setReference(''); setProof(null); setProofPreview('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the payment.');
    } finally {
      setSending(false);
    }
  };

  const doStartTrial = async () => {
    if (!confirm(`Start your ${tenant.trialDays}-day free trial now? You can use it only once.`)) return;
    setStarting(true);
    try { await startTrial(tenant); toast.success('Your free trial has started!'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not start the trial.'); }
    finally { setStarting(false); }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1100px] mx-auto animate-fade-in">
      <PageHeader eyebrow="Your plan" title="Subscription" subtitle="Choose a package, pay with the QR code, and send us your receipt." />

      {/* Current status */}
      <div className="card p-5 flex flex-wrap items-center gap-4">
        <ShieldCheck className="w-8 h-8 text-caramel-600" aria-hidden="true" />
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm text-bark-500">Status</p>
          <p className="font-semibold text-espresso-900">
            {STATE_TEXT[state]}{state === 'active' || state === 'trial' ? ` · ${PLAN_LABEL[tenant.plan]} package` : ''}
          </p>
          {end && (state === 'active' || state === 'trial') && (
            <p className="text-sm text-bark-600">Until {format(end, 'MMMM d, yyyy h:mm a')} · {left === 0 ? 'last day' : `${left} day${left === 1 ? '' : 's'} left`}</p>
          )}
        </div>
        {state === 'setup' && !tenant.trialUsed && (
          <button onClick={doStartTrial} disabled={starting} className="btn-caramel">
            {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
            Start {tenant.trialDays}-day free trial
          </button>
        )}
      </div>

      {pending ? (
        <div className="card p-6">
          <h2 className="flex items-center gap-2 font-display text-xl text-espresso-900">
            <Hourglass className="w-5 h-5 text-caramel-600" aria-hidden="true" /> Waiting for confirmation
          </h2>
          <p className="mt-1 text-sm text-bark-600">
            We received your payment of <strong>₱{pending.amount.toLocaleString('en-PH')}</strong> for the <strong>{PLAN_LABEL[pending.plan]}</strong> package
            ({pending.channelLabel}, reference <strong>{pending.reference}</strong>). We'll check it and open your package shortly.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ContactOwner message={paymentMessage(pending)} />
            <button
              className="btn-ghost text-sm"
              onClick={async () => {
                if (!confirm('Take back this payment? Use this if you sent the wrong receipt. The same reference number can\'t be used again.')) return;
                try { await cancelPaymentRequest(tenant, pending); toast.success('Payment taken back.'); }
                catch { toast.error('Could not take it back. Please contact us.'); }
              }}
            >
              <X className="w-4 h-4" aria-hidden="true" /> Take back this payment
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* 1. Package */}
          <section className="card p-6">
            <h2 className="font-display text-xl text-espresso-900">1. Choose your package</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {PLAN_IDS.map(id => {
                const p = settings.plans[id];
                const e = p?.entitlements;
                return (
                  <button key={id} type="button" onClick={() => setPlan(id)}
                    className={cn('rounded-3xl border p-4 text-left transition-all', plan === id ? 'border-espresso-800 bg-cream-50 ring-2 ring-espresso-800/70' : 'border-cream-300 bg-white/60 hover:border-caramel-400')}>
                    <span className="block font-semibold text-espresso-900">{p?.name ?? PLAN_LABEL[id]}</span>
                    <span className="block font-display text-2xl text-espresso-900">₱{(p?.price ?? 0).toLocaleString('en-PH')}<span className="text-xs font-body text-bark-500">/month</span></span>
                    <ul className="mt-2 space-y-1 text-xs text-bark-600">
                      <li>{e?.staffLimit == null ? 'Unlimited accounts' : `Up to ${e.staffLimit} accounts`}</li>
                      {e?.fullReports && <li>Monthly reports + PDF</li>}
                      {e?.trends && <li>Sales trends</li>}
                      {e?.rfid && <li>RFID card login</li>}
                    </ul>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Pay */}
          <section className="card p-6">
            <h2 className="font-display text-xl text-espresso-900">2. Scan and pay ₱{price.toLocaleString('en-PH')}</h2>
            {!loaded ? (
              <Loader2 className="mt-4 w-6 h-6 animate-spin text-caramel-500" />
            ) : channels.length === 0 ? (
              <div className="mt-3">
                <p className="text-sm text-bark-600">Online payment isn't set up yet. Please contact us to subscribe:</p>
                <ContactOwner className="mt-3" message={`Hi! I'd like to subscribe "${tenant.name}" to the ${PLAN_LABEL[plan]} package.`} />
              </div>
            ) : (
              <>
                {channels.length > 1 && (
                  <div className="segmented mt-4 max-w-sm">
                    {channels.map(c => (
                      <button key={c.id} type="button" onClick={() => setChannelId(c.id)} className={cn('segmented-item', channelId === c.id && 'active')}>{c.label}</button>
                    ))}
                  </div>
                )}
                {channel && (
                  <div className="mt-4 flex flex-col sm:flex-row gap-6 items-center sm:items-start">
                    <img src={channel.qrImageUrl} alt={`${channel.label} QR code`} className="w-60 h-60 object-contain rounded-2xl border border-cream-300 bg-white p-2" />
                    <div className="text-sm text-espresso-900 space-y-1">
                      <p className="text-bark-500">Pay with {channel.label} to</p>
                      <p className="font-semibold text-lg">{channel.accountName}</p>
                      {channel.accountHint && <p className="text-bark-600">{channel.accountHint}</p>}
                      <p className="pt-2">Amount: <strong className="text-lg">₱{price.toLocaleString('en-PH')}</strong></p>
                      <p className="pt-2 text-bark-600">Open your {channel.label} app, scan this QR code, and pay the exact amount. Keep the receipt.</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* 3. Send the receipt */}
          {channels.length > 0 && (
            <section className="card p-6">
              <h2 className="font-display text-xl text-espresso-900">3. Send us your receipt</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Receipt screenshot</label>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => pickProof(e.target.files?.[0])} />
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-3xl border-2 border-dashed border-cream-400 bg-white/60 p-4 text-sm text-bark-600 hover:border-caramel-400">
                    {proofPreview ? <img src={proofPreview} alt="Your receipt" className="mx-auto max-h-48 rounded-xl" /> : (
                      <span className="flex flex-col items-center gap-1"><ImagePlus className="w-6 h-6" aria-hidden="true" /> Tap to attach the screenshot</span>
                    )}
                  </button>
                </div>
                <div>
                  <label className="label" htmlFor="ref">Reference number</label>
                  <input id="ref" className="input font-mono" value={reference} onChange={e => setReference(normalizeReference(e.target.value))} placeholder="e.g. 1234567890123" maxLength={30} />
                  <p className="text-xs text-bark-500 mt-1 px-1">You can find it on your {channel?.label ?? 'payment'} receipt.</p>
                  <button onClick={send} disabled={sending || !proof || reference.length < 6} className="btn-primary w-full mt-5 py-3">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                    Send payment
                  </button>
                </div>
              </div>
              <div className="mt-6 border-t border-cream-300 pt-4">
                <p className="text-sm text-bark-600 mb-3">Need help? You can also send your receipt or questions here:</p>
                <ContactOwner message={`Hi! I'm paying for "${tenant.name}" (${PLAN_LABEL[plan]} package, ₱${price.toLocaleString('en-PH')}).`} />
              </div>
            </section>
          )}
        </>
      )}

      {/* History */}
      {requests.filter(r => r.status !== 'pending').length > 0 && (
        <section className="card p-6">
          <h2 className="font-display text-xl text-espresso-900">Payment history</h2>
          <ul className="mt-3 divide-y divide-cream-300">
            {requests.filter(r => r.status !== 'pending').map(r => (
              <li key={r.id} className="py-3 flex flex-wrap items-center gap-3 text-sm">
                {r.status === 'approved' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  : r.status === 'rejected' ? <XCircle className="w-4 h-4 text-red-600" aria-hidden="true" />
                  : <Ban className="w-4 h-4 text-bark-400" aria-hidden="true" />}
                <span className="font-medium">{PLAN_LABEL[r.plan]} · ₱{r.amount.toLocaleString('en-PH')}</span>
                <span className="text-bark-500">{r.channelLabel} · Ref {r.reference}</span>
                <span className="text-bark-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" />{r.createdAt ? format(r.createdAt.toDate(), 'MMM d, yyyy') : ''}</span>
                <span className={cn('ml-auto font-semibold', r.status === 'approved' ? 'text-emerald-700' : r.status === 'rejected' ? 'text-red-700' : 'text-bark-500')}>
                  {r.status === 'approved' ? 'Confirmed' : r.status === 'rejected' ? 'Not accepted' : 'Taken back'}
                </span>
                {r.status === 'rejected' && r.reason && <p className="w-full text-red-700">Reason: {r.reason}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
