import { useSyncExternalStore } from 'react';

/**
 * Installing JPOS as an app (a PWA). Chrome, Edge and Samsung Internet (Android,
 * Windows, Mac) offer their own install prompt, which our "Install app" buttons
 * open. Safari has no prompt: there the buttons show the steps instead.
 */

/** Chrome's install prompt (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * How this device installs JPOS: the browser's prompt, Safari's steps on an
 * iPhone/iPad (or "open it in Safari first" inside Facebook/Messenger), Safari
 * on a Mac, or null (already installed, or this browser can't install apps).
 */
export type InstallWay = 'prompt' | 'ios' | 'ios-in-app' | 'mac-safari' | null;

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const inAppBrowser = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\//i.test(ua);
const isMacSafari = !isIOS && /Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/i.test(ua);

/** Running as the installed app right now. */
function standalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // our "Install app" buttons open it instead of the browser's small bar
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

function currentWay(): InstallWay {
  if (installed || standalone()) return null;
  if (deferred) return 'prompt';
  if (isIOS) return inAppBrowser ? 'ios-in-app' : 'ios';
  if (isMacSafari) return 'mac-safari';
  return null;
}

/** How this device can install JPOS (null = hide the install buttons). */
export function useInstallWay(): InstallWay {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    currentWay,
    () => null,
  );
}

/** Opens the browser's install prompt. A prompt can be used only once. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null;
  notify();
  await e.prompt();
  return (await e.userChoice).outcome;
}

/**
 * The service worker makes JPOS installable and shows a friendly page offline.
 * Only in the real app: never on this computer's dev server, where it would get
 * in the way of reloading.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker not registered:', err));
  });
}
