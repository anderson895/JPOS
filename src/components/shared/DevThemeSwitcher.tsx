import { Palette } from 'lucide-react';
import { THEMES, THEME_LABEL, type ThemeName } from './theme';

/**
 * DEV ONLY: preview the color themes until per-shop branding exists (Phase B).
 * Rendered only when import.meta.env.DEV, so production builds don't include it.
 * Hidden when the URL sets ?theme=… (screenshots / demo recordings).
 */
export default function DevThemeSwitcher({ value, onChange }: { value: ThemeName; onChange: (t: ThemeName) => void }) {
  return (
    <div className="fixed bottom-20 lg:bottom-3 right-3 z-[70] flex items-center gap-2 rounded-full border border-cream-400 bg-cream-50/95 px-3 py-1.5 text-xs text-espresso-800 shadow-lift backdrop-blur">
      <Palette className="w-3.5 h-3.5 text-caramel-600" aria-hidden="true" />
      <label htmlFor="dev-theme" className="font-semibold">Theme <span className="font-normal text-bark-500">(dev)</span></label>
      <select
        id="dev-theme"
        value={value}
        onChange={e => onChange(e.target.value as ThemeName)}
        className="cursor-pointer bg-transparent font-medium focus:outline-none"
      >
        {THEMES.map(t => <option key={t} value={t}>{THEME_LABEL[t]}</option>)}
      </select>
    </div>
  );
}
