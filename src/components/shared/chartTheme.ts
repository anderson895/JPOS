import { useEffect, useState, type CSSProperties } from 'react';
import { themeColor } from './theme';

/**
 * Recharts colours from the current color theme. SVG attributes can't use CSS
 * variables reliably, so the values are read from the theme and re-read when
 * <html data-theme> changes.
 */
export interface ChartTheme {
  CHART: { line: string; accent: string; grid: string; tick: string; cursor: string };
  /** Pie / multi-series palette, darkest to lightest. */
  CHART_SERIES: string[];
  TOOLTIP_STYLE: CSSProperties;
  /** Card background, e.g. for pie slice separators. */
  surface: string;
}

export function getChartTheme(): ChartTheme {
  return {
    CHART: {
      line: themeColor('espresso-600'),
      accent: themeColor('caramel-500'),
      grid: themeColor('cream-300'),
      tick: themeColor('bark-500'),
      cursor: themeColor('caramel-300', 0.15),
    },
    CHART_SERIES: [
      themeColor('espresso-800'), themeColor('caramel-700'), themeColor('caramel-500'),
      themeColor('caramel-300'), themeColor('bark-400'), themeColor('caramel-200'),
    ],
    TOOLTIP_STYLE: {
      borderRadius: 16,
      border: `1px solid ${themeColor('cream-300')}`,
      background: themeColor('cream-50'),
      boxShadow: `0 12px 28px -14px ${themeColor('espresso-800', 0.35)}`,
      fontSize: 13,
      color: themeColor('espresso-900'),
    },
    surface: themeColor('cream-50'),
  };
}

/** Chart colours that follow the active theme. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState(getChartTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getChartTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
