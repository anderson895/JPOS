import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  Bell, BellRing, Check, X, Loader2, Store, Settings2, Receipt, ImagePlus, Ban, RotateCcw, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import PageHeader from '@/components/shared/PageHeader';
import Portal from '@/components/shared/Portal';
import Switch from '@/components/shared/Switch';
import ChangeEmailCard from '@/components/admin/ChangeEmail';
import { usePlatformSettings, prettyPhone } from '@/components/shared/ContactOwner';
import {
  approveRequest, rejectRequest, savePlatformSettings, setSuspended, watchPendingRequests, watchShops,
} from '@/lib/platform';
import { daysLeft, periodEnd, PLAN_IDS, PLAN_LABEL, shopState } from '@/lib/entitlements';
import { uploadImage } from '@/lib/cloudinary';
import { formatBytes, getStorageUsage, usedPercent, type StorageUsage } from '@/lib/usage';
import { cn } from '@/lib/utils';
import type { PaymentChannel, PlatformSettings, SubscriptionRequest, Tenant } from '@/types';

type Tab = 'payments' | 'shops' | 'settings';

/** The platform owner's console: review payments, see every shop, set prices and payment QRs. */
export default function SuperAdmin() {
  const [tab, setTab] = useState<Tab>('payments');
  const [pending, setPending] = useState<SubscriptionRequest[]>([]);
  const { settings } = usePlatformSettings();
  useEffect(() => watchPendingRequests(setPending, () => toast.error('Could not load payments.')), []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto animate-fade-in">
      <PageHeader eyebrow="JPOS" title="Super Admin" subtitle="Payments from shops, every shop, and your prices and payment QR codes." actions={<NotifyToggle />} />
      <div className="segmented max-w-md">
        <button className={cn('segmented-item', tab === 'payments' && 'active')} onClick={() => setTab('payments')}>
          <Receipt className="w-4 h-4" aria-hidden="true" /> Payments {pending.length > 0 && <span className="ml-1 rounded-full bg-red-600 px-2 text-xs text-white">{pending.length}</span>}
        </button>
        <button className={cn('segmented-item', tab === 'shops' && 'active')} onClick={() => setTab('shops')}><Store className="w-4 h-4" aria-hidden="true" /> Shops</button>
        <button className={cn('segmented-item', tab === 'settings' && 'active')} onClick={() => setTab('settings')}><Settings2 className="w-4 h-4" aria-hidden="true" /> Settings</button>
      </div>
      {tab === 'payments' && <Payments pending={pending} settings={settings} />}
      {tab === 'shops' && <Shops />}
      {tab === 'settings' && <SettingsForm settings={settings} />}
    </div>
  );
}

/** Turn on browser pop-ups for new payments (while a JPOS tab is open). */
function NotifyToggle() {
  const supported = typeof Notification !== 'undefined';
  const [perm, setPerm] = useState(supported ? Notification.permission : 'denied');
  if (!supported) return null;
  if (perm === 'granted') return <span className="badge-success normal-case px-3 py-1 flex items-center gap-1"><BellRing className="w-3.5 h-3.5" aria-hidden="true" /> Pop-ups on</span>;
  return (
    <button className="btn-secondary" onClick={() => Notification.requestPermission().then(setPerm)}>
      <Bell className="w-4 h-4" aria-hidden="true" /> Turn on payment pop-ups
    </button>
  );
}

// ── Payments ──────────────────────────────────────────────────────────────
function Payments({ pending, settings }: { pending: SubscriptionRequest[]; settings: PlatformSettings }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<SubscriptionRequest | null>(null);
  const [reason, setReason] = useState('');
  const [zoom, setZoom] = useState('');

  const approve = async (r: SubscriptionRequest) => {
    if (!confirm(`Approve ₱${r.amount.toLocaleString('en-PH')} from "${r.tenantName}" for the ${PLAN_LABEL[r.plan]} package?\n\nCheck first that the money is in your ${r.channelLabel} (reference ${r.reference}).`)) return;
    setBusy(r.id);
    try {
      const end = await approveRequest(r, settings);
      toast.success(`Approved. ${r.tenantName} is active until ${format(end, 'MMM d, yyyy')}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve.');
    } finally { setBusy(null); }
  };
  const reject = async () => {
    if (!rejecting) return;
    setBusy(rejecting.id);
    try {
      await rejectRequest(rejecting, reason);
      toast.success('Rejected. The shop will see your reason.');
      setRejecting(null); setReason('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reject.');
    } finally { setBusy(null); }
  };

  if (pending.length === 0) return <div className="card p-10 text-center text-bark-500">No payments waiting. New ones appear here right away.</div>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {pending.map(r => (
        <div key={r.id} className="card p-5 flex gap-4">
          <button onClick={() => setZoom(r.proofUrl)} className="flex-shrink-0" title="See the receipt">
            <img src={r.proofUrl} alt="Receipt" className="w-28 h-36 object-cover rounded-xl border border-cream-300" />
          </button>
          <div className="flex-1 min-w-0 text-sm space-y-1">
            <p className="font-semibold text-espresso-900 truncate">{r.tenantName}</p>
            <p>{PLAN_LABEL[r.plan]} package · <strong>₱{r.amount.toLocaleString('en-PH')}</strong></p>
            <p className="text-bark-600">{r.channelLabel} · Ref <span className="font-mono">{r.reference}</span></p>
            <p className="text-bark-500">By {r.requesterName} · {r.createdAt ? format(r.createdAt.toDate(), 'MMM d, h:mm a') : 'just now'}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button disabled={busy === r.id} onClick={() => approve(r)} className="btn-primary px-4 py-1.5 text-sm">
                {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden="true" />} Approve
              </button>
              <button disabled={busy === r.id} onClick={() => setRejecting(r)} className="btn-secondary px-4 py-1.5 text-sm">
                <X className="w-4 h-4" aria-hidden="true" /> Reject
              </button>
            </div>
          </div>
        </div>
      ))}

      {zoom && (
        <Portal>
          <div className="modal-backdrop" onClick={() => setZoom('')}>
            <img src={zoom} alt="Receipt" className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-lift" />
          </div>
        </Portal>
      )}
      {rejecting && (
        <Portal>
          <div className="modal-backdrop">
            <div className="modal-panel max-w-md">
              <div className="modal-header"><h2 className="font-display text-2xl text-espresso-900">Reject payment</h2></div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-bark-600">Tell {rejecting.tenantName} why, so they can send it again.</p>
                <textarea className="input min-h-24 rounded-3xl" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="e.g. We didn't receive this amount. Please check the reference number." />
              </div>
              <div className="modal-footer">
                <button className="btn-secondary flex-1" onClick={() => { setRejecting(null); setReason(''); }}>Cancel</button>
                <button className="btn-danger flex-1" disabled={!reason.trim() || busy === rejecting.id} onClick={reject}>
                  {busy === rejecting.id && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Reject
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

// ── Shops ─────────────────────────────────────────────────────────────────
const STATE_BADGE = {
  setup: ['badge-info', 'Not started'], trial: ['badge-warning', 'Free trial'], 'trial-ended': ['badge-danger', 'Trial ended'],
  active: ['badge-success', 'Active'], expired: ['badge-danger', 'Ended'], suspended: ['badge-dark', 'Suspended'],
} as const;

function Shops() {
  const [shops, setShops] = useState<Tenant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => watchShops(setShops, () => toast.error('Could not load shops.')), []);
  const toggle = async (t: Tenant) => {
    const reason = prompt(t.suspended ? `Restore "${t.name}"? Write a short note:` : `Suspend "${t.name}"? It will become view-only. Write the reason:`);
    if (reason === null) return;
    setBusy(t.id);
    try { await setSuspended(t.id, !t.suspended, reason || '-'); toast.success(t.suspended ? 'Shop restored.' : 'Shop suspended.'); }
    catch { toast.error('Could not update the shop.'); }
    finally { setBusy(null); }
  };
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="table-header">
          <th className="table-cell text-left">Shop</th><th className="table-cell text-left">Status</th><th className="table-cell text-left">Package</th>
          <th className="table-cell text-left">Ends</th><th className="table-cell text-left">Accounts</th><th className="table-cell text-left">Storage</th><th className="table-cell" />
        </tr></thead>
        <tbody>
          {shops.map(t => {
            const st = shopState(t);
            const [badge, label] = STATE_BADGE[st];
            const end = periodEnd(t);
            return (
              <tr key={t.id} className="table-row">
                <td className="table-cell">
                  <p className="font-semibold text-espresso-900">{t.name}</p>
                  <a className="text-xs text-bark-500 inline-flex items-center gap-1 hover:underline" href={`/s/${t.slug}`} target="_blank" rel="noreferrer">/s/{t.slug} <ExternalLink className="w-3 h-3" aria-hidden="true" /></a>
                </td>
                <td className="table-cell"><span className={cn(badge, 'normal-case')}>{label}</span>{t.pendingRequestId && <span className="badge-warning normal-case ml-1">Payment waiting</span>}</td>
                <td className="table-cell">{PLAN_LABEL[t.plan]}</td>
                <td className="table-cell">{end ? `${format(end, 'MMM d, yyyy')} (${daysLeft(t)}d)` : '-'}</td>
                <td className="table-cell">{t.staffCount}{t.entitlements?.staffLimit != null ? ` / ${t.entitlements.staffLimit}` : ''}</td>
                <td className="table-cell"><ShopStorage tenantId={t.id} /></td>
                <td className="table-cell text-right">
                  <button className="btn-ghost text-sm" disabled={busy === t.id} onClick={() => toggle(t)}>
                    {busy === t.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      : t.suspended ? <RotateCcw className="w-4 h-4" aria-hidden="true" /> : <Ban className="w-4 h-4" aria-hidden="true" />}
                    {t.suspended ? 'Restore' : 'Suspend'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One shop's storage (asked from the server when the row shows). */
function ShopStorage({ tenantId }: { tenantId: string }) {
  const [u, setU] = useState<StorageUsage | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    getStorageUsage(tenantId).then(r => { if (live) setU(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [tenantId]);
  if (failed) return <span className="text-xs text-bark-400">-</span>;
  if (!u) return <Loader2 className="w-4 h-4 animate-spin text-caramel-500" aria-label="Checking storage" />;
  const pct = usedPercent(u);
  return (
    <div className="min-w-[7rem]">
      <p className="text-xs text-espresso-900 whitespace-nowrap">{formatBytes(u.usedBytes)}{u.limitBytes != null ? ` / ${formatBytes(u.limitBytes)}` : ''}</p>
      {u.limitBytes != null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cream-200">
          <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-espresso-700')} style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
      )}
    </div>
  );
}

// ── Settings: prices + payment QRs + contact ─────────────────────────────────
const CHANNEL_IDS: { id: string; label: string }[] = [{ id: 'gcash', label: 'GCash' }, { id: 'maya', label: 'Maya' }];
const emptyChannel = (label: string, order: number): PaymentChannel => ({ label, qrImageUrl: '', accountName: '', accountHint: '', enabled: false, order });

function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const [draft, setDraft] = useState<PlatformSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  useEffect(() => { setDraft(settings); }, [settings]);

  const channel = (id: string, label: string, order: number) => draft.paymentChannels?.[id] ?? emptyChannel(label, order);
  const setChannel = (id: string, label: string, order: number, patch: Partial<PaymentChannel>) =>
    setDraft(d => ({ ...d, paymentChannels: { ...(d.paymentChannels ?? {}), [id]: { ...channel(id, label, order), ...patch } } }));

  const upload = async (id: string, label: string, order: number, f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Choose a picture of your QR code.'); return; }
    setUploading(id);
    try { setChannel(id, label, order, { qrImageUrl: await uploadImage(f, 'qr') }); toast.success('QR uploaded. Review it, then save.'); }
    catch { toast.error('Upload failed. Please try again.'); }
    finally { setUploading(''); if (fileRefs.current[id]) fileRefs.current[id]!.value = ''; }
  };

  const problem = (() => {
    for (const { id, label } of CHANNEL_IDS) {
      const c = draft.paymentChannels?.[id];
      if (c?.enabled && !c.qrImageUrl) return `Upload the ${label} QR before turning it on.`;
      if (c?.enabled && !c.accountName.trim()) return `Write the ${label} account name.`;
    }
    for (const id of PLAN_IDS) if (!(draft.plans[id]?.price > 0)) return `Set a price for ${PLAN_LABEL[id]}.`;
    if (!/^https:\/\/(m\.me|www\.facebook\.com)\/.+/.test(draft.messengerUrl)) return 'The Messenger link should start with https://m.me/';
    return null;
  })();

  const save = async () => {
    if (problem) { toast.error(problem); return; }
    if (!confirm('Save these settings? Shops will pay to the QR codes shown here.')) return;
    setSaving(true);
    try {
      const { plans, trialDays, paymentChannels, messengerUrl, contactPhone } = draft;
      await savePlatformSettings({ plans, trialDays: Number(trialDays), paymentChannels, messengerUrl: messengerUrl.trim(), contactPhone: contactPhone.trim() }, 'settings.update',
        { channels: Object.entries(paymentChannels ?? {}).map(([k, c]) => `${k}:${c.enabled ? 'on' : 'off'}`).join(','), prices: PLAN_IDS.map(p => `${p}=${plans[p].price}`).join(','),
          accounts: PLAN_IDS.map(p => `${p}=${plans[p].entitlements?.staffLimit ?? 'no limit'}`).join(',') });
      toast.success('Settings saved.');
    } catch (err) {
      console.error(err);
      toast.error('Could not save the settings.');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      {/* The JPOS owner's own sign-in email */}
      <section className="card p-6">
        <h2 className="font-display text-xl text-espresso-900">Your sign-in</h2>
        <p className="text-sm text-bark-600 mt-1">The email you use to sign in to JPOS. A code goes to the new email to confirm it.</p>
        <ChangeEmailCard className="mt-4 max-w-xl" />
      </section>

      <section className="card p-6">
        <h2 className="font-display text-xl text-espresso-900">Your payment QR codes</h2>
        <p className="text-sm text-bark-600 mt-1">Shops scan these to pay their subscription. You can change them anytime.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {CHANNEL_IDS.map(({ id, label }, i) => {
            const c = channel(id, label, i + 1);
            return (
              <div key={id} className="rounded-3xl border border-cream-300 bg-white/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-espresso-900">{label}</p>
                  <Switch checked={c.enabled} onChange={v => setChannel(id, label, i + 1, { enabled: v })} label={`Show ${label} to shops`} />
                </div>
                <input ref={el => { fileRefs.current[id] = el; }} type="file" accept="image/*" className="hidden" onChange={e => upload(id, label, i + 1, e.target.files?.[0])} />
                <button type="button" onClick={() => fileRefs.current[id]?.click()} className="w-full rounded-2xl border-2 border-dashed border-cream-400 p-3 text-sm text-bark-600 hover:border-caramel-400">
                  {uploading === id ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : c.qrImageUrl
                    ? <img src={c.qrImageUrl} alt={`${label} QR`} className="mx-auto h-40 object-contain" />
                    : <span className="flex flex-col items-center gap-1"><ImagePlus className="w-5 h-5" aria-hidden="true" /> Upload {label} QR</span>}
                </button>
                <input className="input" placeholder="Account name" value={c.accountName} maxLength={60} onChange={e => setChannel(id, label, i + 1, { accountName: e.target.value })} />
                <input className="input" placeholder="Number hint, e.g. 0945•••4744" value={c.accountHint} maxLength={30} onChange={e => setChannel(id, label, i + 1, { accountHint: e.target.value })} />
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-xl text-espresso-900">Prices</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          {PLAN_IDS.map(id => (
            <div key={id}>
              <label className="label">{PLAN_LABEL[id]} (₱/month)</label>
              <input className="input" type="number" min={1} value={draft.plans[id]?.price ?? 0}
                onChange={e => setDraft(d => ({ ...d, plans: { ...d.plans, [id]: { ...d.plans[id], price: Math.max(0, Math.round(Number(e.target.value))) } } }))} />
            </div>
          ))}
          <div>
            <label className="label">Free trial (days)</label>
            <input className="input" type="number" min={1} max={30} value={draft.trialDays}
              onChange={e => setDraft(d => ({ ...d, trialDays: Math.min(30, Math.max(1, Math.round(Number(e.target.value)))) }))} />
          </div>
        </div>
      </section>

      {/* Accounts per shop: a package change applies to shops when their next payment is approved */}
      <section className="card p-6">
        <h2 className="font-display text-xl text-espresso-900">Accounts per shop</h2>
        <p className="mt-1 text-sm text-bark-500">Owner included. Leave empty for no limit. Shops get a new number with their next approved payment.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PLAN_IDS.map(id => (
            <div key={id}>
              <label className="label" htmlFor={`accounts-${id}`}>{PLAN_LABEL[id]}</label>
              <input id={`accounts-${id}`} className="input" type="number" min={1} max={10000} placeholder="No limit"
                value={draft.plans[id]?.entitlements?.staffLimit ?? ''}
                onChange={e => {
                  const raw = e.target.value.trim();
                  const staffLimit = raw === '' ? null : Math.min(10000, Math.max(1, Math.round(Number(raw)) || 1));
                  setDraft(d => ({ ...d, plans: { ...d.plans, [id]: { ...d.plans[id], entitlements: { ...d.plans[id].entitlements, staffLimit } } } }));
                }} />
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-xl text-espresso-900">How shops contact you</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label className="label">Messenger link</label><input className="input" value={draft.messengerUrl} onChange={e => setDraft(d => ({ ...d, messengerUrl: e.target.value }))} /></div>
          <div><label className="label">Phone</label><input className="input" value={draft.contactPhone} maxLength={30} onChange={e => setDraft(d => ({ ...d, contactPhone: e.target.value }))} />
            {draft.contactPhone && <p className="text-xs text-bark-500 mt-1 px-1">Shown as {prettyPhone(draft.contactPhone)}</p>}</div>
        </div>
      </section>

      <div className="sticky bottom-3 card p-4 flex items-center gap-3 shadow-lift">
        <p className={cn('flex-1 text-sm', problem ? 'text-red-600' : 'text-bark-500')}>{problem ?? 'Changes apply to new payments right away.'}</p>
        <button className="btn-primary" disabled={saving || !!problem} onClick={save}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" aria-hidden="true" />} Save</button>
      </div>
    </div>
  );
}
