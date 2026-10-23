/**
 * The visitor's cookie choice. JPOS only stores what it needs:
 * - necessary (always): staying signed in, the offline page;
 * - preferences (only when allowed): remembering this device's shop sign-in
 *   page, and a sign-up form that isn't finished yet.
 * No statistics, ads or tracking. The choice itself is kept on this device.
 */
const KEY = 'jpos-cookie-choice';
const CHANGED = 'jpos-cookie-choice-changed';
const OPEN = 'jpos-cookie-settings';

export interface CookieChoice { preferences: boolean; at: string }

export function cookieChoice(): CookieChoice | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.preferences === 'boolean' ? v : null;
  } catch {
    return null;
  }
}

/** Preferences may be stored only after the visitor allowed them. */
export const preferencesAllowed = () => cookieChoice()?.preferences === true;

/** The keys preferences use (src/lib/terminal.ts, the sign-up draft): cleared when not allowed. */
const PREFERENCE_KEYS = ['jpos-terminal-slug', 'jpos-signed-in-from', 'jpos-signup-draft'];

export function saveCookieChoice(preferences: boolean) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ preferences, at: new Date().toISOString() }));
    if (!preferences) for (const k of PREFERENCE_KEYS) localStorage.removeItem(k);
  } catch { /* storage blocked: nothing is kept anyway */ }
  window.dispatchEvent(new Event(CHANGED));
}

/** "Cookie settings" (footer): shows the notice again. */
export const openCookieSettings = () => window.dispatchEvent(new Event(OPEN));

export const COOKIE_EVENTS = { CHANGED, OPEN };
