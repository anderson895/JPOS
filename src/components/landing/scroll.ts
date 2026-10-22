import toast from 'react-hot-toast';

/** Smooth-scroll to a landing section by id (sections carry scroll-mt for the fixed navbar). */
export function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Bring the hero sign-in card into view and focus the email field.
 * In RFID mode there is no email field — the card's own focus loop takes over.
 */
export function focusLogin() {
  document.getElementById('login')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => document.getElementById('login-email')?.focus({ preventScroll: true }), 450);
}

/** Open an external link, or say it's coming soon when the URL isn't configured yet. */
export function openExternal(url: string, label: string) {
  if (url) window.open(url, url.startsWith('mailto:') ? '_self' : '_blank', 'noopener,noreferrer');
  else toast(`${label} is coming soon.`, { icon: '☕' });
}
