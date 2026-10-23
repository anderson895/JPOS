import { useSyncExternalStore } from 'react';

/**
 * Installing JPOS as an app (a PWA). Chrome, Edge and Samsung Internet offer
 * their own install window, which our "Install app" buttons open as soon as the
 * browser has it ready (Chrome waits for a click and about 30 seconds on the
 * page). Until then, and in browsers without one (Safari, Firefox), the buttons
 * show the steps for that browser instead. So "Install app" is always there.
 */

/** Chrome's install prompt (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Which steps to show when the browser has no install window (ready). */
export type InstallSteps =
  | 'ios' | 'ios-in-app' | 'mac-safari'
  | 'android' | 'android-in-app' | 'samsung' | 'firefox-android'
  | 'chrome' | 'edge' | 'firefox' | 'other';

/**
 * What "Install app" does on this device: open the browser's install window,
 * show the steps, say it was just installed, or null when this already is the
 * installed app (nothing to show).
 */
export type InstallWay = 'prompt' | InstallSteps | 'installed' | null;

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const touchMac = typeof navigator !== 'undefined' && /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;

/** This device and browser's way to add JPOS by hand. */
export const deviceSteps: InstallSteps = (() => {
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\//i.test(ua);
  if (/iPhone|iPad|iPod/i.test(ua) || touchMac) return inApp ? 'ios-in-app' : 'ios';
  if (/Android/i.test(ua)) {
    if (inApp) return 'android-in-app';
    if (/SamsungBrowser/i.test(ua)) return 'samsung';
    if (/Firefox/i.test(ua)) return 'firefox-android';
    return 'android'; // Chrome, Edge and others have it in their menu
  }
  if (/Firefox/i.test(ua)) return 'firefox';
  if (/OPR\//i.test(ua)) return 'other';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/Chrome|Chromium/i.test(ua)) return 'chrome';
  if (/Macintosh/i.test(ua) && /Safari/i.test(ua)) return 'mac-safari';
  return 'other';
})();

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

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
  if (standalone()) return null;
  if (installed) return 'installed';
  if (deferred) return 'prompt';
  return deviceSteps;
}

/** What "Install app" does on this device (null = this is the installed app). */
export function useInstallWay(): InstallWay {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    currentWay,
    () => null,
  );
}

/** Opens the browser's install window. A browser lets each one be used only once. */
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
