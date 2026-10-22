import type { CSSProperties } from 'react';

/** Recharts colours matching the espresso/caramel palette (tailwind.config.js). */
export const CHART = {
  line: '#6f4428',     // espresso-600
  accent: '#cc8745',   // caramel-500
  grid: '#efdfc9',
  tick: '#8c6f57',     // bark-500
  cursor: 'rgba(233, 187, 126, 0.15)',
};

/** Pie / multi-series palette, darkest to lightest. */
export const CHART_SERIES = ['#3f2616', '#8c552a', '#cc8745', '#e9bb7e', '#a88a70', '#f2d3a8'];

export const TOOLTIP_STYLE: CSSProperties = {
  borderRadius: 16,
  border: '1px solid #f1e0c8',
  background: '#fffcf7',
  boxShadow: '0 12px 28px -14px rgba(63, 38, 22, 0.35)',
  fontSize: 13,
  color: '#2c1a0f',
};
