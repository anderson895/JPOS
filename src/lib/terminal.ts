/**
 * A shop's counter terminal is a bookmarked page, /s/<slug>. The device remembers
 * it, so signing out (or an expired session) returns to the shop's terminal
 * instead of the public landing page. Storage can be blocked: everything falls
 * back to /login.
 */
const KEY = 'jpos-terminal-slug';

export function rememberTerminal(slug: string) {
  try { localStorage.setItem(KEY, slug.trim().toLowerCase()); } catch { /* storage blocked */ }
}

export function forgetTerminal() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

export function rememberedTerminal(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

/** Where a signed-out user goes on this device. */
export function signedOutHome(): string {
  const slug = rememberedTerminal();
  return slug ? `/s/${slug}` : '/login';
}
