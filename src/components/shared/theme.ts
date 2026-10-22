/**
 * Color themes (docs/frontend/DESIGN-SYSTEM.md → Themes).
 * The palettes are CSS variables in src/index.css; a theme is chosen with
 * <html data-theme="…">. No attribute = the default "espresso" theme.
 */
export const THEMES = ['espresso', 'matcha', 'berry', 'ocean', 'charcoal', 'sunset'] as const;
export type ThemeName = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeName = 'espresso';

export const THEME_LABEL: Record<ThemeName, string> = {
  espresso: 'Espresso', matcha: 'Matcha', berry: 'Berry',
  ocean: 'Ocean', charcoal: 'Charcoal', sunset: 'Sunset',
};

export const isThemeName = (v: unknown): v is ThemeName => THEMES.includes(v as ThemeName);

/** Applies a theme to the whole document (toasts and portals included). Undefined → default. */
export function applyTheme(name?: ThemeName | null) {
  const root = document.documentElement;
  if (!name || name === DEFAULT_THEME) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', name);
}

/**
 * A palette color as a plain `rgb(r, g, b)` / `rgba(…)` string, read from the
 * current theme. For places that can't use CSS variables directly (SVG chart
 * attributes, jsPDF). Comma syntax because SVG presentation attributes need it.
 */
export function themeColor(token: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  const [r, g, b] = (raw || '0 0 0').split(/\s+/).map(Number);
  return alpha === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** A palette color as [r, g, b] numbers (jsPDF). */
export function themeRgb(token: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim();
  const [r, g, b] = (raw || '0 0 0').split(/\s+/).map(Number);
  return [r, g, b];
}
