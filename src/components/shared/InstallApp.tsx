import { useEffect, useState, type ReactNode } from 'react';
import { Download, Loader2, Menu, MonitorDown, MoreHorizontal, MoreVertical, PlusSquare, Share, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Portal from '@/components/shared/Portal';
import { deviceSteps, promptInstall, useInstallWay, type InstallSteps } from '@/lib/pwa';
import { cn } from '@/lib/utils';

/**
 * Everything an "Install app" button needs: open the browser's install window
 * when it's ready, otherwise the steps for this browser. Render `steps`.
 */
export function useInstallAction() {
  const way = useInstallWay();
  const [open, setOpen] = useState<InstallSteps | null>(null);
  const [busy, setBusy] = useState(false);

  const install = async () => {
    if (way === 'prompt') {
      setBusy(true);
      try {
        const outcome = await promptInstall();
        if (outcome === 'accepted') toast.success('JPOS is installed. Open it from your home screen or desktop.', { duration: 6000 });
      } catch {
        setOpen(deviceSteps); // the window didn't open: show the steps instead
      } finally {
        setBusy(false);
      }
      return;
    }
    if (way && way !== 'installed') setOpen(way);
  };

  const steps = open ? <InstallStepsDialog kind={open} onClose={() => setOpen(null)} /> : null;
  return { way, busy, install, steps };
}

type Variant = 'nav' | 'sidebar' | 'terminal';

const STYLE: Record<Variant, string> = {
  // Landing nav (light): an icon on tablets, with its label on wide screens
  nav: 'btn border border-espresso-800/30 bg-white/60 text-espresso-900 hover:bg-white px-3 lg:px-4',
  // The app's dark sidebar
  sidebar: 'sidebar-link w-full',
  // The staff sign-in page (dark), under the card
  terminal: 'btn border border-cream-100/30 text-cream-50 hover:bg-white/10 px-5',
};

/** "Install app" (hidden in the installed app itself, and right after installing). */
export default function InstallAppButton({ variant, iconOnly, className }: {
  variant: Variant;
  /** The collapsed sidebar: icon only */
  iconOnly?: boolean;
  className?: string;
}) {
  const { way, busy, install, steps } = useInstallAction();
  if (!way || way === 'installed') return null;

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
      {steps}
    </>
  );
}

// Small inline icons for the steps (lucide, never emoji)
const icon = (I: typeof Share, label: string) => <I className="inline w-4 h-4 -mt-0.5 mx-0.5 text-caramel-700" aria-label={label} />;
const OPEN_IN_SAFARI = <>This page is open inside another app. Open it in <strong>Safari</strong> first, from that app's menu.</>;
const OPEN_IN_CHROME = <>This page is open inside another app. Open it in <strong>Chrome</strong> first, from that app's menu.</>;
const IOS: ReactNode[] = [
  <>Tap the <strong>Share</strong> button {icon(Share, '(Share icon)')}.</>,
  <>Tap <strong>Add to Home Screen</strong> {icon(PlusSquare, '(Add icon)')}, then <strong>Add</strong>.</>,
];
const ANDROID: ReactNode[] = [
  <>Tap your browser's menu {icon(MoreVertical, '(menu icon)')} at the top.</>,
  <>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</>,
  <>Tap <strong>Install</strong>.</>,
];

const HOME = 'JPOS then opens from your home screen like an app.';
const WINDOW = 'JPOS then opens in its own window, from your desktop or Start menu.';

/** The steps for each browser, and what happens after. */
const STEPS: Record<InstallSteps, { steps: ReactNode[]; after?: string }> = {
  ios: { steps: IOS, after: HOME },
  'ios-in-app': { steps: [OPEN_IN_SAFARI, ...IOS], after: HOME },
  'mac-safari': {
    steps: [<>In Safari's menu bar, click <strong>File</strong>.</>, <>Click <strong>Add to Dock</strong>, then <strong>Add</strong>.</>],
    after: 'JPOS then opens from your Dock like an app.',
  },
  android: { steps: ANDROID, after: HOME },
  'android-in-app': { steps: [OPEN_IN_CHROME, ...ANDROID], after: HOME },
  samsung: {
    steps: [<>Tap the menu {icon(Menu, '(menu icon)')} at the bottom.</>, <>Tap <strong>Add page to</strong>, then <strong>Home screen</strong>.</>],
    after: HOME,
  },
  'firefox-android': {
    steps: [<>Tap the menu {icon(MoreVertical, '(menu icon)')}.</>, <>Tap <strong>Install</strong> or <strong>Add to Home screen</strong>.</>],
    after: HOME,
  },
  chrome: {
    steps: [
      <>Click the <strong>Install</strong> icon {icon(MonitorDown, '(install icon)')} at the right end of the address bar.</>,
      <>No icon? Open Chrome's menu {icon(MoreVertical, '(menu icon)')} and look for <strong>Install</strong>.</>,
    ],
    after: WINDOW,
  },
  edge: {
    steps: [
      <>Click the <strong>App available</strong> icon at the right end of the address bar, then <strong>Install</strong>.</>,
      <>Or open Edge's menu {icon(MoreHorizontal, '(menu icon)')}, then <strong>Apps</strong>, then <strong>Install this site as an app</strong>.</>,
    ],
    after: WINDOW,
  },
  firefox: {
    steps: [<>Firefox can't install apps.</>, <>Open this page in <strong>Chrome</strong> or <strong>Edge</strong>, then click <strong>Install app</strong>.</>],
  },
  other: {
    steps: [<>Open your browser's menu.</>, <>Look for <strong>Install app</strong> or <strong>Add to Home screen</strong>.</>],
    after: HOME,
  },
};

/** How to add JPOS when the browser has no install window (ready). */
function InstallStepsDialog({ kind, onClose }: { kind: InstallSteps; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { steps, after } = STEPS[kind];
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
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-espresso-800">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-espresso-800 text-xs font-semibold text-cream-50">{i + 1}</span>
                  <span className="pt-1">{step}</span>
                </li>
              ))}
            </ol>
            {after && <p className="mt-5 rounded-2xl bg-cream-200/70 px-4 py-3 text-sm text-bark-600">{after}</p>}
            {kind !== 'firefox' && (
              <p className="mt-3 text-xs text-bark-500">Already installed? Open JPOS from your home screen or desktop.</p>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-primary flex-1">Got it</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
