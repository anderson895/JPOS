import { useEffect, useRef, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { getPaymentSettings, savePaymentSettings } from '@/lib/storeSettings';
import { paymentSettingsProblem, WALLET_LABEL, type WalletMethod } from '@/lib/eWallet';
import { uploadImage } from '@/lib/cloudinary';
import { STORAGE_FULL, useStorage } from '@/lib/usage';
import { cn, formatDateTime } from '@/lib/utils';
import PageHeader from '@/components/shared/PageHeader';
import Portal from '@/components/shared/Portal';
import Switch from '@/components/shared/Switch';
import type { PaymentSettings, WalletSettings } from '@/types';
import {
  QrCode, Upload, Trash2, Loader2, CreditCard, ShieldAlert, RefreshCw,
  X, Info, CheckCircle, Undo2,
} from 'lucide-react';
import toast from 'react-hot-toast';

const WALLETS: WalletMethod[] = ['gcash', 'maya'];
const MAX_QR_BYTES = 5 * 1024 * 1024;
// Same limits as paymentSettingsProblem() and firestore.rules
const MAX_NAME = 60;
const MAX_HINT = 30;

type Draft = Pick<PaymentSettings, 'gcash' | 'maya' | 'card'>;
const toDraft = (s: PaymentSettings): Draft => ({ gcash: { ...s.gcash }, maya: { ...s.maya }, card: { ...s.card } });
const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Admin → Payment Settings: the shop's OWN GCash/Maya QR codes (customers scan them
 * at checkout) and whether card payments are recorded.
 * Data: settings/payments via @/lib/storeSettings (backend). Admin-only route.
 */
export default function AdminPaymentSettings() {
  const [saved, setSaved] = useState<PaymentSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState<WalletMethod | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmQr, setConfirmQr] = useState<WalletMethod[] | null>(null);
  const storage = useStorage();

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const s = await getPaymentSettings();
      setSaved(s);
      setDraft(toDraft(s));
    } catch (err) {
      // Never let the defaults stand in for a doc we couldn't read: no editing until it loads.
      console.error('[PaymentSettings] load', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const problem = draft ? paymentSettingsProblem(draft) : null;
  const dirty = !!(draft && saved && !sameDraft(draft, toDraft(saved)));

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setWallet = (method: WalletMethod, patch: Partial<WalletSettings>) =>
    setDraft(d => (d ? { ...d, [method]: { ...d[method], ...patch } } : d));

  async function handleQrFile(method: WalletMethod, file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Choose an image file (PNG or JPG).'); return; }
    if (file.size > MAX_QR_BYTES) { toast.error('The QR image must be 5 MB or smaller.'); return; }
    if (storage.full) { toast.error(STORAGE_FULL, { duration: 6000 }); return; }
    setUploading(method);
    try {
      const url = await uploadImage(file, 'qr');
      setWallet(method, { qrImageUrl: url });
      toast.success(`${WALLET_LABEL[method]} QR uploaded. Check it, then save.`);
    } catch {
      toast.error('QR upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  }

  function requestSave() {
    if (!draft || !saved || problem || !dirty) return;
    // A new QR changes where customers' money goes: confirm it first
    const changedQr = WALLETS.filter(m => draft[m].qrImageUrl && draft[m].qrImageUrl !== saved[m].qrImageUrl);
    if (changedQr.length) setConfirmQr(changedQr);
    else doSave();
  }

  async function doSave() {
    if (!draft) return;
    setSaving(true);
    try {
      await savePaymentSettings(draft);
    } catch (err) {
      console.error('[PaymentSettings] save', err);
      const denied = err instanceof FirebaseError && err.code === 'permission-denied';
      const signedOut = err instanceof Error && err.message.startsWith('Sign in');
      toast.error(denied ? 'Only admins can change payment settings.' : signedOut ? err.message : 'Failed to save payment settings.');
      setSaving(false);
      return;
    }
    toast.success('Payment settings saved');
    setConfirmQr(null);
    try {
      const fresh = await getPaymentSettings();
      setSaved(fresh);
      setDraft(toDraft(fresh));
    } catch {
      // Saved fine; just couldn't re-read. Treat the draft as the saved state.
      setSaved(s => (s ? { ...s, ...draft, updatedAt: new Date().toISOString() } : s));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <PageHeader
      eyebrow="Get paid"
      title="Payment Settings"
      subtitle="Choose how customers can pay. E-wallet payments go straight to your shop's own GCash or Maya account."
      actions={saved?.updatedAt ? (
        <span className="badge-info normal-case px-3 py-1">Last saved {formatDateTime(saved.updatedAt)}</span>
      ) : undefined}
    />
  );

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto animate-pulse">
        {header}
        <div className="h-20 rounded-3xl bg-cream-300/50" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-80 rounded-3xl bg-cream-300/50" />
          <div className="h-80 rounded-3xl bg-cream-300/50" />
        </div>
      </div>
    );
  }

  if (loadError || !draft || !saved) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
        {header}
        <div className="card p-8 text-center max-w-lg mx-auto">
          <span className="w-14 h-14 mx-auto rounded-full bg-red-50 text-red-500 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7" />
          </span>
          <h2 className="mt-4 font-display text-xl text-espresso-900">Couldn't load payment settings</h2>
          <p className="mt-1 text-sm text-bark-500">Check the connection and try again. Nothing was changed.</p>
          <button onClick={load} className="btn-primary mt-5"><RefreshCw className="w-4 h-4" /> Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto animate-fade-in">
      {header}

      <div className="flex items-start gap-3 rounded-3xl border border-caramel-300/60 bg-caramel-50 px-5 py-4 text-sm text-espresso-800">
        <Info className="w-5 h-5 text-caramel-600 flex-shrink-0 mt-0.5" />
        <p>
          At checkout the cashier shows your QR to the customer. After the customer pays, the cashier types the
          <strong> reference number</strong> from the customer's receipt and confirms the amount was received.
        </p>
      </div>

      {/* E-wallets */}
      <div className="grid gap-6 lg:grid-cols-2">
        {WALLETS.map(method => (
          <WalletCard
            key={method}
            method={method}
            wallet={draft[method]}
            uploading={uploading === method}
            busy={saving || uploading !== null}
            onChange={patch => setWallet(method, patch)}
            onFile={file => handleQrFile(method, file)}
          />
        ))}
      </div>

      {/* Card */}
      <section className="card p-5 sm:p-6 flex items-start gap-4">
        <span className="w-11 h-11 rounded-2xl bg-espresso-800 text-caramel-200 flex items-center justify-center flex-shrink-0">
          <CreditCard className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl text-espresso-900">Card</h2>
          <p className="text-sm text-bark-500">
            For payments on your own card terminal. The cashier records the sale and can note the approval code.
          </p>
        </div>
        <Switch
          checked={draft.card.enabled}
          onChange={enabled => setDraft(d => (d ? { ...d, card: { enabled } } : d))}
          label="Accept card payments"
          disabled={saving}
        />
      </section>

      {/* Save bar */}
      <div className="sticky bottom-3 z-20">
        <div className={cn(
          'card px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-shadow',
          dirty && 'shadow-lift ring-1 ring-caramel-300/60',
        )}>
          <p className={cn('flex-1 text-sm', problem ? 'text-red-600' : dirty ? 'text-espresso-800' : 'text-bark-500')}>
            {problem ?? (dirty ? 'You have unsaved changes.' : 'All changes saved.')}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setDraft(toDraft(saved))}
              disabled={!dirty || saving}
              className="btn-secondary flex-1 sm:flex-none"
            >
              <Undo2 className="w-4 h-4" /> Discard
            </button>
            <button
              onClick={requestSave}
              disabled={!dirty || !!problem || saving || uploading !== null}
              className="btn-primary flex-1 sm:flex-none"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirm a new QR */}
      {confirmQr && (
        <Portal>
          <div className="modal-backdrop">
            <div className="modal-panel max-w-md max-h-[90vh] overflow-y-auto" role="alertdialog" aria-labelledby="qr-confirm-title">
              <div className="modal-header">
                <div>
                  <p className="eyebrow text-2xl -mb-1">Please double-check</p>
                  <h2 id="qr-confirm-title" className="font-display text-2xl text-espresso-900">New payment QR</h2>
                </div>
                <button onClick={() => setConfirmQr(null)} disabled={saving} className="icon-btn" title="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <p className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong>Customer payments will go to this account.</strong> Make sure it's your shop's own{' '}
                    {confirmQr.map(m => WALLET_LABEL[m]).join(' and ')} account.
                  </span>
                </p>
                {confirmQr.map(m => (
                  <div key={m} className="flex items-center gap-4 rounded-2xl border border-cream-300 bg-cream-100 p-3">
                    <img src={draft[m].qrImageUrl} alt={`New ${WALLET_LABEL[m]} QR`} className="w-24 h-24 rounded-xl bg-white object-contain p-1 ring-1 ring-cream-300" />
                    <div className="min-w-0">
                      <p className="font-semibold text-espresso-900">{WALLET_LABEL[m]}</p>
                      <p className="text-sm text-espresso-800 truncate">{draft[m].accountName.trim() || 'No account name'}</p>
                      <p className="text-xs text-bark-500">{draft[m].accountHint.trim() || 'No number hint'}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button onClick={() => setConfirmQr(null)} disabled={saving} className="btn-secondary flex-1">Cancel</button>
                <button onClick={doSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {saving ? 'Saving…' : 'Yes, use this QR'}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

function WalletCard({ method, wallet, uploading, busy, onChange, onFile }: {
  method: WalletMethod;
  wallet: WalletSettings;
  uploading: boolean;
  busy: boolean;
  onChange: (patch: Partial<WalletSettings>) => void;
  onFile: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const label = WALLET_LABEL[method];
  const hasQr = wallet.qrImageUrl !== '';
  const id = (field: string) => `${method}-${field}`;

  return (
    <section className={cn('card p-5 sm:p-6 transition-opacity', !wallet.enabled && 'opacity-90')}>
      <header className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-espresso-800 text-caramel-200 flex items-center justify-center flex-shrink-0">
          <QrCode className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl text-espresso-900">{label}</h2>
          <p className={cn('text-xs', wallet.enabled ? 'text-emerald-700' : 'text-bark-500')}>
            {wallet.enabled ? 'On: offered at checkout' : 'Off: not offered at checkout'}
          </p>
        </div>
        <Switch checked={wallet.enabled} onChange={enabled => onChange({ enabled })} label={`Accept ${label}`} disabled={busy} />
      </header>

      <div className="mt-5 grid gap-5 sm:grid-cols-[176px_1fr]">
        {/* QR */}
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className={cn(
              'group relative w-44 aspect-square rounded-3xl overflow-hidden flex items-center justify-center transition-colors disabled:cursor-not-allowed',
              hasQr ? 'bg-white ring-1 ring-cream-400 shadow-sm' : 'bg-cream-100 border-2 border-dashed border-caramel-300 hover:border-caramel-500 hover:bg-cream-200',
            )}
            aria-label={hasQr ? `Replace the ${label} QR image` : `Upload the ${label} QR image`}
          >
            {uploading ? (
              <Loader2 className="w-8 h-8 text-caramel-600 animate-spin" />
            ) : hasQr ? (
              <>
                <img src={wallet.qrImageUrl} alt={`${label} QR code`} className="w-full h-full object-contain p-2" />
                <span className="absolute inset-x-0 bottom-0 py-1.5 text-[11px] font-semibold text-cream-50 bg-espresso-900/75 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                  Replace QR
                </span>
              </>
            ) : (
              <span className="flex flex-col items-center gap-1.5 text-bark-500 px-3 text-center">
                <Upload className="w-6 h-6 text-caramel-600" />
                <span className="text-xs font-medium">Upload {label} QR</span>
                <span className="text-[10px] text-bark-400">PNG or JPG, up to 5 MB</span>
              </span>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              e.target.value = ''; // picking the same file again still fires
              if (file) onFile(file);
            }}
          />
          {hasQr && (
            <button
              type="button"
              onClick={() => onChange({ qrImageUrl: '', ...(wallet.enabled ? { enabled: false } : {}) })}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-bark-500 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove QR
            </button>
          )}
        </div>

        {/* Details */}
        <div className="space-y-4 min-w-0">
          <div>
            <label htmlFor={id('name')} className="label">Account name</label>
            <input
              id={id('name')}
              className="input"
              placeholder="e.g. Juan Dela Cruz"
              maxLength={MAX_NAME}
              value={wallet.accountName}
              onChange={e => onChange({ accountName: e.target.value })}
              disabled={busy}
            />
            <p className="mt-1 px-1 text-[11px] text-bark-400 flex justify-between gap-2">
              <span>Shown to the customer so they can check who they're paying.</span>
              <span className="font-mono">{wallet.accountName.trim().length}/{MAX_NAME}</span>
            </p>
          </div>
          <div>
            <label htmlFor={id('hint')} className="label">Number hint <span className="font-normal text-bark-400">(optional)</span></label>
            <input
              id={id('hint')}
              className="input"
              placeholder="e.g. 0917•••1234"
              maxLength={MAX_HINT}
              value={wallet.accountHint}
              onChange={e => onChange({ accountHint: e.target.value })}
              disabled={busy}
            />
            <p className="mt-1 px-1 text-[11px] text-bark-400 flex justify-between gap-2">
              <span>Hide most digits. Never type the full number here.</span>
              <span className="font-mono">{wallet.accountHint.trim().length}/{MAX_HINT}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
