import { useEffect, useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { DEFAULT_PLATFORM_SETTINGS, loadPublicSettings, subscribePlatformSettings } from '@/lib/platform';
import type { PlatformSettings } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Platform settings (prices, payment QRs, contact). Public, so it works signed out too.
 * Public pages get them through JPOS's server cache (Redis); `live` (Super Admin,
 * Subscription) follows Firebase as they change.
 * `saved` is false while loading and when they were never set up (then `settings` holds the defaults).
 */
export function usePlatformSettings({ live = false }: { live?: boolean } = {}) {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const show = (s: PlatformSettings, isSaved: boolean) => { setSettings(s); setSaved(isSaved); setLoaded(true); };
    if (live) return subscribePlatformSettings(show, () => setLoaded(true));
    let on = true;
    loadPublicSettings()
      .then(r => { if (on) show(r.settings, r.saved); })
      .catch(() => { if (on) setLoaded(true); });
    return () => { on = false; };
  }, [live]);
  return { settings, loaded, saved };
}

/** "0945 445 4744" for display; the tel: link keeps the digits. */
export const prettyPhone = (p: string) => p.replace(/\D/g, '').replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3') || p;

/**
 * The two ways to reach the JPOS team: Messenger (with a ready message, also
 * copied to the clipboard) or a phone call. The visitor chooses.
 */
export default function ContactOwner({ message, className, compact }: { message?: string; className?: string; compact?: boolean }) {
  const { settings } = usePlatformSettings();
  const openMessenger = () => {
    if (message) navigator.clipboard?.writeText(message).catch(() => { /* clipboard blocked */ });
    window.open(message ? `${settings.messengerUrl}?text=${encodeURIComponent(message)}` : settings.messengerUrl, '_blank', 'noopener,noreferrer');
    if (message) toast('Your message is copied. Paste it if the chat is empty.', { icon: <MessageCircle className="w-4 h-4 text-caramel-600" aria-hidden="true" /> });
  };
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <button type="button" onClick={openMessenger} className={cn('btn-secondary', compact && 'px-4 py-2 text-sm')}>
        <MessageCircle className="w-4 h-4" aria-hidden="true" /> Message us
      </button>
      {settings.contactPhone && (
        <a href={`tel:${settings.contactPhone.replace(/[^\d+]/g, '')}`} className={cn('btn-secondary', compact && 'px-4 py-2 text-sm')}>
          <Phone className="w-4 h-4" aria-hidden="true" /> Call {prettyPhone(settings.contactPhone)}
        </a>
      )}
    </div>
  );
}
