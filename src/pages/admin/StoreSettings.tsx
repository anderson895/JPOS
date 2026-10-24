import { useEffect, useMemo, useRef, useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { Link } from 'react-router-dom';
import { Check, CheckCircle, Copy, Database, Download, Image as ImageIcon, Link2, Loader2, Lock, Mail, Palette, Receipt, Store, Trash2, Undo2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth, useStoreBrand } from '@/contexts/AuthContext';
import { uploadImage } from '@/lib/cloudinary';
import { formatBytes, STORAGE_FULL, usedPercent, useStorage } from '@/lib/usage';
import {
  JPOS_LOGO, LOGO_MAX_BYTES, NAME_MAX, RECEIPT_MAX, receiptInfo, saveStore, storeProblem,
} from '@/lib/storeProfile';
import { applyTheme, THEME_LABEL, THEMES, type ThemeName } from '@/components/shared/theme';
import BusinessTypePicker from '@/components/shared/BusinessTypePicker';
import PageHeader from '@/components/shared/PageHeader';
import Switch from '@/components/shared/Switch';
import { cn } from '@/lib/utils';
import { BUSINESS_UP, hasFeature } from '@/lib/entitlements';
import { changes, logActivity } from '@/lib/activity';
import { buildBackup, saveBackupFile } from '@/lib/backup';
import type { BusinessType, ReceiptInfo } from '@/types';

interface Draft {
  name: string;
  businessType: BusinessType | null;
  logoUrl: string;
  theme: ThemeName;
  receipt: ReceiptInfo;
  dailySummary: boolean;
}
const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Admin → Store Settings: the store's name, what it sells, its logo and colors
 * (shown in the app and on its sign-in page), and what its receipts say.
 */
export default function StoreSettings() {
  const { tenant, brandingReady, isSuperAdmin } = useAuth();
  // Its own logo and colors: Business and up (the rules check it too)
  const canBrand = hasFeature(tenant, 'branding');
  const canEmail = hasFeature(tenant, 'emailSummary');
  const canBackup = hasFeature(tenant, 'backup');
  // Backup: what's being read right now (null = not running)
  const [backingUp, setBackingUp] = useState<string | null>(null);
  async function downloadBackup() {
    if (!tenant || backingUp) return;
    setBackingUp('Starting…');
    try {
      const data = await buildBackup(tenant, setBackingUp);
      saveBackupFile(data, tenant.name);
      const counts = data.counts as { products: number; orders: number };
      toast.success(`Backup saved: ${counts.products} products, ${counts.orders} sales.`);
    } catch (err) {
      console.error('[Backup]', err);
      toast.error("Couldn't make the backup. Please try again.");
    } finally {
      setBackingUp(null);
    }
  }
  const storage = useStorage();
  const brand = useStoreBrand();

  // What's saved now (live), in the form's shape
  const saved = useMemo<Draft | null>(() => (tenant ? {
    name: brand.name,
    businessType: tenant.businessType ?? null,
    logoUrl: brand.hasLogo ? brand.logoUrl : '',
    theme: brand.theme,
    receipt: receiptInfo(tenant),
    dailySummary: tenant.dailySummary !== false,
  } : null), [tenant, brand]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fill the form once the shop and its look have loaded
  useEffect(() => { if (!draft && saved && brandingReady) setDraft(saved); }, [draft, saved, brandingReady]);

  // The chosen colors show across the app right away; leaving without saving puts the saved ones back
  const savedTheme = useRef(brand.theme);
  savedTheme.current = brand.theme;
  useEffect(() => { if (draft) applyTheme(draft.theme); }, [draft?.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => applyTheme(savedTheme.current), []);

  const dirty = !!(draft && saved && !same(draft, saved));
  const problem = draft
    ? (!draft.businessType ? 'Pick what your store sells.' : storeProblem(draft))
    : null;

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d));
  const setReceipt = (patch: Partial<ReceiptInfo>) => setDraft(d => (d ? { ...d, receipt: { ...d.receipt, ...patch } } : d));

  const link = tenant ? `${window.location.origin}/s/${tenant.slug}` : '';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied.');
    } catch {
      toast.error("Couldn't copy. Select the link and copy it.");
    }
  };

  async function onLogoFile(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Choose a picture (PNG or JPG).'); return; }
    if (file.size > LOGO_MAX_BYTES) { toast.error('The logo must be 2 MB or smaller.'); return; }
    if (storage.full) { toast.error(STORAGE_FULL, { duration: 6000 }); return; }
    setUploading(true);
    try {
      const url = await uploadImage(file, 'logo');
      set({ logoUrl: url });
      toast.success('Logo added. Save to use it.');
    } catch {
      toast.error("The logo didn't upload. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!draft || !tenant || !draft.businessType || problem || !dirty) return;
    setSaving(true);
    try {
      await saveStore({
        tenantId: tenant.id, name: draft.name, businessType: draft.businessType,
        receipt: draft.receipt, logoUrl: canBrand ? draft.logoUrl : '', theme: canBrand ? draft.theme : 'espresso', dailySummary: draft.dailySummary,
      });
      // The saved values come back live; the form keeps what was typed (trimmed)
      setDraft(d => (d ? {
        ...d, name: d.name.trim(),
        receipt: { ...d.receipt, tin: d.receipt.tin.trim(), address: d.receipt.address.trim(), phone: d.receipt.phone.trim(), footer: d.receipt.footer.trim() },
      } : d));
      toast.success('Store settings saved.');
      logActivity('store.settings', '', changes([
        ['Name', saved?.name, draft.name.trim()],
        ['Kind', saved?.businessType, draft.businessType],
        ['Logo', saved?.logoUrl ? 'yes' : 'none', draft.logoUrl ? 'yes' : 'none'],
        ['Colors', saved?.theme, draft.theme],
        ['TIN', saved?.receipt.tin, draft.receipt.tin.trim()],
      ]));
    } catch (err) {
      console.error('[StoreSettings] save', err);
      const denied = err instanceof FirebaseError && err.code === 'permission-denied';
      toast.error(denied ? "Couldn't save. Only the store's admins can change this." : err instanceof Error && !(err instanceof FirebaseError) ? err.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <PageHeader eyebrow="Your store" title="Store Settings" subtitle="Your store's name, logo, colors and receipt." />
  );

  if (!draft || !saved) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1100px] mx-auto animate-pulse">
        {header}
        <div className="h-72 rounded-3xl bg-cream-300/50" />
        <div className="h-60 rounded-3xl bg-cream-300/50" />
      </div>
    );
  }

  const busy = saving || uploading;
  const r = draft.receipt;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1100px] mx-auto animate-fade-in">
      {header}

      {/* The store */}
      <section className="card p-5 sm:p-6 space-y-5">
        <SectionTitle icon={Store} title="Your store" />
        <div>
          <label htmlFor="store-name" className="label">Store name</label>
          <input id="store-name" className="input" value={draft.name} maxLength={NAME_MAX} onChange={e => set({ name: e.target.value })} disabled={busy} placeholder="e.g. Aling Nena's Store" />
          <p className="mt-1 px-1 text-[11px] text-bark-400">Shown in the app, on your sign-in page and on receipts.</p>
        </div>
        <div>
          <p id="store-type-label" className="label">What do you sell?</p>
          <BusinessTypePicker labelId="store-type-label" value={draft.businessType} onChange={businessType => set({ businessType })} disabled={busy} />
          <p className="mt-1.5 px-1 text-[11px] text-bark-400">This picks the product details you fill in, like brand, size or unit.</p>
        </div>
        <div>
          <label htmlFor="store-link" className="label">Your sign-in page</label>
          <div className="flex items-center rounded-full border border-cream-400/80 bg-white/80 pl-4 pr-1.5 text-sm">
            <Link2 className="mr-3 h-4 w-4 shrink-0 text-bark-500" aria-hidden="true" />
            <input id="store-link" readOnly value={link} onFocus={e => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent py-2.5 pr-2 font-medium text-espresso-900 focus:outline-none" />
            <button type="button" onClick={copyLink} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-bark-500 transition-colors hover:bg-cream-200 hover:text-espresso-800" aria-label="Copy the link" title="Copy the link">
              {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          <p className="mt-1 px-1 text-[11px] text-bark-400">Open it on your POS devices. Only your store's accounts can sign in there.</p>
        </div>
      </section>

      {/* Logo and colors */}
      <section className="card p-5 sm:p-6 space-y-5">
        <SectionTitle icon={Palette} title="Logo and colors" />
        {!canBrand && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-caramel-200 bg-caramel-50 px-4 py-3 text-sm text-espresso-800">
            <Lock className="h-4 w-4 shrink-0 text-caramel-600" aria-hidden="true" />
            <span className="flex-1 min-w-[12rem]">Your own logo and colors: {BUSINESS_UP.charAt(0).toLowerCase() + BUSINESS_UP.slice(1)}</span>
            {!isSuperAdmin && <Link to="/admin/billing" className="btn-secondary px-4 py-1.5 text-xs">See packages</Link>}
          </div>
        )}
        <fieldset disabled={!canBrand} className={cn('space-y-5', !canBrand && 'opacity-60')}>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl bg-cream-100 ring-1 ring-cream-400 shadow-sm disabled:cursor-not-allowed"
            aria-label={draft.logoUrl ? 'Change the logo' : 'Upload a logo'}
          >
            {uploading
              ? <Loader2 className="m-auto h-7 w-7 animate-spin text-caramel-600" aria-hidden="true" />
              : <img src={draft.logoUrl || JPOS_LOGO} alt="" className="h-full w-full object-cover" />}
          </button>
          <div className="min-w-0 space-y-2">
            <p className="text-sm text-espresso-800">{draft.logoUrl ? 'Your logo' : 'Using the JPOS logo'}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-secondary py-2 text-sm">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : draft.logoUrl ? <ImageIcon className="h-4 w-4" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                {uploading ? 'Uploading…' : draft.logoUrl ? 'Change logo' : 'Upload logo'}
              </button>
              {draft.logoUrl && (
                <button type="button" onClick={() => set({ logoUrl: '' })} disabled={busy} className="btn-ghost py-2 text-sm text-bark-600 hover:text-red-600">
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Use JPOS logo
                </button>
              )}
            </div>
            <p className="text-[11px] text-bark-400">A square picture works best. PNG or JPG, up to 2 MB.</p>
          </div>
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onLogoFile(f); }}
          />
        </div>

        <div>
          <p id="store-theme-label" className="label">Colors</p>
          <div role="radiogroup" aria-labelledby="store-theme-label" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {THEMES.map(t => {
              const on = draft.theme === t;
              return (
                <button
                  key={t} type="button" role="radio" aria-checked={on} disabled={busy}
                  onClick={() => set({ theme: t })}
                  data-theme={t}
                  className={cn(
                    'flex items-center gap-2.5 rounded-2xl border bg-cream-50 px-3 py-2.5 text-left text-sm font-semibold text-espresso-900 transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel-300 disabled:opacity-60',
                    on ? 'border-caramel-500 ring-1 ring-caramel-400' : 'border-cream-400/80 hover:border-caramel-300',
                  )}
                >
                  <span className="flex -space-x-1.5" aria-hidden="true">
                    <span className="h-6 w-6 rounded-full bg-espresso-800 ring-2 ring-cream-50" />
                    <span className="h-6 w-6 rounded-full bg-caramel-400 ring-2 ring-cream-50" />
                    <span className="h-6 w-6 rounded-full bg-cream-200 ring-2 ring-cream-50" />
                  </span>
                  <span className="flex-1 truncate">{THEME_LABEL[t]}</span>
                  {on && <Check className="h-4 w-4 shrink-0 text-caramel-700" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-bark-400">Tap one to see it. It stays only when you save.</p>
        </div>
        </fieldset>
      </section>

      {/* Receipt */}
      <section className="card p-5 sm:p-6">
        <SectionTitle icon={Receipt} title="Receipt" />
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4 min-w-0">
            <div>
              <label htmlFor="store-address" className="label">Address <Optional /></label>
              <input id="store-address" className="input" value={r.address} maxLength={RECEIPT_MAX.address} onChange={e => setReceipt({ address: e.target.value })} disabled={busy} placeholder="e.g. 12 Rizal St., Quezon City" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="store-phone" className="label">Phone <Optional /></label>
                <input id="store-phone" className="input" inputMode="tel" value={r.phone} maxLength={RECEIPT_MAX.phone} onChange={e => setReceipt({ phone: e.target.value })} disabled={busy} placeholder="e.g. 0917 123 4567" />
              </div>
              <div>
                <label htmlFor="store-tin" className="label">TIN <Optional /></label>
                <input id="store-tin" className="input" inputMode="numeric" value={r.tin} maxLength={RECEIPT_MAX.tin} onChange={e => setReceipt({ tin: e.target.value })} disabled={busy} placeholder="e.g. 123-456-789-000" />
              </div>
            </div>
            <div>
              <label htmlFor="store-footer" className="label">Thank-you line <Optional /></label>
              <input id="store-footer" className="input" value={r.footer} maxLength={RECEIPT_MAX.footer} onChange={e => setReceipt({ footer: e.target.value })} disabled={busy} placeholder="e.g. Thank you, come again!" />
            </div>
          </div>

          {/* How the top and bottom of the receipt will look */}
          <div aria-hidden="true" className="self-start rounded-2xl bg-white px-5 py-4 font-mono text-[11px] leading-relaxed text-espresso-900 shadow-sm ring-1 ring-cream-300">
            <p className="text-center text-sm font-bold uppercase break-words">{draft.name.trim() || 'Your store'}</p>
            {r.address.trim() && <p className="text-center break-words">{r.address.trim()}</p>}
            {r.phone.trim() && <p className="text-center">{r.phone.trim()}</p>}
            {r.tin.trim() && <p className="text-center">TIN {r.tin.trim()}</p>}
            <p className="text-center font-bold">UNOFFICIAL RECEIPT</p>
            <p className="my-2 border-t border-dashed border-espresso-900/40" />
            <p className="flex justify-between"><span>2 × Item</span><span>₱100.00</span></p>
            <p className="my-2 border-t border-dashed border-espresso-900/40" />
            <p className="flex justify-between font-bold"><span>TOTAL</span><span>₱100.00</span></p>
            <p className="mt-2 text-center break-words">{r.footer.trim() || 'Thank you!'}</p>
            <p className="text-center font-semibold">This is not an official receipt.</p>
          </div>
        </div>
      </section>

      {/* The daily sales email (Business and up) */}
      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-espresso-800 text-caramel-200">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl text-espresso-900">Daily sales email</h2>
            <p className="text-sm text-bark-500">
              {canEmail
                ? 'Every morning, yesterday\'s sales go to the owner\'s email.'
                : `${BUSINESS_UP}`}
            </p>
          </div>
          {canEmail
            ? <Switch checked={draft.dailySummary} onChange={on => set({ dailySummary: on })} label="Daily sales email" disabled={busy} />
            : <Lock className="h-5 w-5 shrink-0 text-caramel-600" aria-label="Business and Enterprise packages" />}
        </div>
      </section>

      {/* Backup (Business and up): one file with everything */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-espresso-800 text-caramel-200">
            <Download className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-[12rem] flex-1">
            <h2 className="font-display text-xl text-espresso-900">Backup</h2>
            <p className="text-sm text-bark-500">
              {canBackup ? 'Save a copy of your products, sales, people and settings on this device.' : BUSINESS_UP}
            </p>
          </div>
          {canBackup ? (
            <button type="button" onClick={downloadBackup} disabled={!!backingUp} className="btn-secondary">
              {backingUp ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              {backingUp ?? 'Download backup'}
            </button>
          ) : <Lock className="h-5 w-5 shrink-0 text-caramel-600" aria-label="Business and Enterprise packages" />}
        </div>
      </section>

      {/* Storage: pictures and sales data, against the package's limit */}
      <section className="card p-5 sm:p-6 space-y-4">
        <SectionTitle icon={Database} title="Storage" />
        {!storage.usage ? (
          storage.failed
            ? <p className="text-sm text-bark-500">Couldn't check your storage right now.</p>
            : <div className="h-14 animate-pulse rounded-2xl bg-cream-200/70" />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-espresso-900">
              <span className="font-display text-2xl font-semibold">{formatBytes(storage.usage.usedBytes)}</span>
              {storage.usage.limitBytes != null && <span className="text-bark-500"> of {formatBytes(storage.usage.limitBytes)} used</span>}
            </p>
            {storage.usage.limitBytes != null && (
              <div className="h-3 overflow-hidden rounded-full bg-cream-200" role="progressbar" aria-label="Storage used"
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPercent(storage.usage)}>
                <div className={cn('h-full rounded-full transition-all', usedPercent(storage.usage) >= 90 ? 'bg-red-500' : usedPercent(storage.usage) >= 75 ? 'bg-amber-500' : 'bg-espresso-800')}
                  style={{ width: `${Math.max(2, usedPercent(storage.usage))}%` }} />
              </div>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-bark-600">
              <span>Photos: {formatBytes(storage.usage.photosBytes)} ({storage.usage.pictures})</span>
              <span>Sales and products: {formatBytes(storage.usage.dataBytes)}</span>
            </div>
            {storage.full
              ? <p className="text-sm font-medium text-red-700">{STORAGE_FULL} You can still sell.</p>
              : usedPercent(storage.usage) >= 80 && <p className="text-sm text-amber-800">Your storage is almost full.</p>}
            {usedPercent(storage.usage) >= 80 && !isSuperAdmin && <Link to="/admin/billing" className="btn-secondary px-4 py-1.5 text-xs">See packages</Link>}
          </div>
        )}
      </section>

      {/* Save bar: it follows the screen only while there's something to save */}
      <div className={cn(dirty && 'sticky bottom-3 z-20')}>
        <div className={cn('card px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-shadow', dirty && 'shadow-lift ring-1 ring-caramel-300/60')}>
          <p className={cn('flex-1 text-sm', dirty && problem ? 'text-red-600' : dirty ? 'text-espresso-800' : 'text-bark-500')}>
            {dirty ? problem ?? 'You have unsaved changes.' : problem ?? 'All changes saved.'}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setDraft(saved)} disabled={!dirty || busy} className="btn-secondary flex-1 sm:flex-none">
              <Undo2 className="w-4 h-4" aria-hidden="true" /> Discard
            </button>
            <button onClick={save} disabled={!dirty || !!problem || busy} className="btn-primary flex-1 sm:flex-none">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CheckCircle className="w-4 h-4" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Store; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-espresso-800 text-caramel-200">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="font-display text-xl text-espresso-900">{title}</h2>
    </div>
  );
}

const Optional = () => <span className="font-normal text-bark-400">(optional)</span>;
