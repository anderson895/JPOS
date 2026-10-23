import { useEffect, useState } from 'react';
import { Download, Loader2, PlusSquare, Share, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Portal from '@/components/shared/Portal';
import { promptInstall, useInstallWay, type InstallWay } from '@/lib/pwa';
import { cn } from '@/lib/utils';

type Variant = 'nav' | 'menu' | 'sidebar' | 'terminal';

const STYLE: Record<Variant, string> = {
  // Landing nav (light): an icon on tablets, with its label on wide screens
  nav: 'btn border border-espresso-800/30 bg-white/60 text-espresso-900 hover:bg-white px-3 lg:px-4',
  // Landing mobile menu: a full-width tile under the links
  menu: 'col-span-2 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold border border-espresso-800/20 bg-white/80 text-espresso-900',
  // The app's dark sidebar
  sidebar: 'sidebar-link w-full',
  // The staff sign-in page (dark), under the card
  terminal: 'btn border border-cream-100/30 text-cream-50 hover:bg-white/10 px-5',
};

/**
 * "Install app": opens the browser's install prompt, or shows Safari's steps.
 * Hidden when JPOS is already installed or the browser can't install apps.
 */
export default function InstallAppButton({ variant, iconOnly, className }: {
  variant: Variant;
  /** The collapsed sidebar: icon only */
  iconOnly?: boolean;
  className?: string;
}) {
  const way = useInstallWay();
  const [steps, setSteps] = useState<Exclude<InstallWay, 'prompt' | null> | null>(null);
  const [busy, setBusy] = useState(false);
  if (!way) return null;

  const install = async () => {
    if (way !== 'prompt') { setSteps(way); return; }
    setBusy(true);
    try {
      if ((await promptInstall()) === 'accepted') {
        toast.success('JPOS is installed. Open it from your home screen or desktop.', { duration: 6000 });
      }
    } catch {
      toast.error("Couldn't open the install window. Use your browser's menu: Install app.");
    } finally {
      setBusy(false);
    }
  };

  const label = variant === 'terminal' ? 'Install on this device' : 'Install app';
  return (
    <>
      <button
        type="button"
        onClick={install}
        disabled={busy}
        title={iconOnly || variant === 'nav' ? label : undefined}
        className={cn(STYLE[variant], iconOnly && 'lg:justify-center lg:px-0 lg:w-12 lg:h-11 lg:mx-auto', className)}
      >
        {busy ? <Loader2 className="w-[18px] h-[18px] flex-shrink-0 animate-spin" aria-hidden="true" /> : <Download className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />}
        {variant === 'nav' ? <span className="hidden lg:inline">{label}</span> : !iconOnly && <span>{label}</span>}
      </button>
      {steps && <InstallSteps way={steps} onClose={() => setSteps(null)} />}
    </>
  );
}

/** Safari can't open an install window: these are the steps to add JPOS by hand. */
function InstallSteps({ way, onClose }: { way: Exclude<InstallWay, 'prompt' | null>; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = way === 'mac-safari'
    ? [<>In Safari's menu bar, click <strong>File</strong>.</>, <>Click <strong>Add to Dock</strong>, then <strong>Add</strong>.</>]
    : [
        ...(way === 'ios-in-app' ? [<>This page is open inside another app. Open it in <strong>Safari</strong> first, from that app's menu.</>] : []),
        <>Tap the <strong>Share</strong> button <Share className="inline w-4 h-4 -mt-1 text-caramel-700" aria-label="(Share icon)" /> in Safari.</>,
        <>Tap <strong>Add to Home Screen</strong> <PlusSquare className="inline w-4 h-4 -mt-1 text-caramel-700" aria-label="(Add icon)" />, then <strong>Add</strong>.</>,
      ];

  return (
    <Portal>
      <div className="modal-backdrop" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-steps-title"
          className="modal-panel max-w-sm text-left"
          onClick={e => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="install-steps-title" className="font-display text-2xl text-espresso-900">Install JPOS</h2>
            <button type="button" onClick={onClose} className="icon-btn" title="Close"><X className="w-5 h-5" /></button>
          </div>
          <div className="px-6 py-5">
            <ol className="space-y-3">
              {list.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-espresso-800">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-espresso-800 text-xs font-semibold text-cream-50">{i + 1}</span>
                  <span className="pt-1">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 rounded-2xl bg-cream-200/70 px-4 py-3 text-sm text-bark-600">
              {way === 'mac-safari' ? 'JPOS then opens from your Dock like an app.' : 'JPOS then opens from your home screen like an app.'}
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-primary flex-1">Got it</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
