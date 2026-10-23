/**
 * A shop's counter terminal is a bookmarked page, /s/<slug>. The device remembers
 * it, so signing out (or an expired session) returns to the shop's terminal
 * instead of the public landing page. Storage can be blocked: everything falls
 * back to /login.
 */
import { preferencesAllowed } from '@/lib/consent';

const KEY = 'jpos-terminal-slug';

export function rememberTerminal(slug: string) {
  if (!preferencesAllowed()) return; // the cookie choice said no
  try { localStorage.setItem(KEY, slug.trim().toLowerCase()); } catch { /* storage blocked */ }
}

export function forgetTerminal() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

export function rememberedTerminal(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

const FROM_KEY = 'jpos-signed-in-from';

/** Where this device's last sign-in happened (the landing page or a shop's page). */
export function rememberSignInPage(path: string) {
  if (!preferencesAllowed()) return; // the cookie choice said no
  try { localStorage.setItem(FROM_KEY, path); } catch { /* storage blocked */ }
}

/**
 * Where a signed-out user goes on this device: back to the page they signed in
 * on (the landing page or their shop's sign-in page). Without one, the shop
 * page this device remembers, else the landing page.
 */
export function signedOutHome(): string {
  let from: string | null = null;
  try { from = localStorage.getItem(FROM_KEY); } catch { /* storage blocked */ }
  if (from === '/login' || /^\/s\/[a-z0-9-]{1,60}$/.test(from ?? '')) return from as string;
  const slug = rememberedTerminal();
  return slug ? `/s/${slug}` : '/login';
}

/**
 * "JPOS home" on a shop's sign-in page: this device stops going back to that
 * page, so the main address opens the JPOS landing page again.
 */
export function forgetSignInPage() {
  try { localStorage.removeItem(FROM_KEY); } catch { /* storage blocked */ }
  forgetTerminal();
}
