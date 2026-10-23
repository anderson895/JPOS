const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const palette = name =>
  Object.fromEntries(SHADES.map(shade => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]));

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        script: ['Allura', 'cursive'],
        body: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      // Palette ROLES (names never change in components):
      //   espresso = primary · caramel = accent · cream = surface · bark = muted text
      // The values are CSS variables (src/index.css → themes), so a color theme can
      // swap them at runtime via <html data-theme="…">. See docs/frontend/DESIGN-SYSTEM.md.
      colors: {
        espresso: palette('espresso'),
        caramel: palette('caramel'),
        cream: palette('cream'),
        bark: palette('bark'),
        // Fixed (not themed): the soft green of the landing's retail photo, for its round shapes
        sage: { 100: '#f0f2e4', 200: '#e2e7cf', 300: '#d4dcbc', 400: '#bccaa0', 500: '#9fb07f' },
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--espresso-800) / 0.04), 0 12px 32px -14px rgb(var(--espresso-800) / 0.22)',
        lift: '0 2px 4px rgb(var(--espresso-800) / 0.06), 0 22px 44px -18px rgb(var(--espresso-800) / 0.35)',
        glow: '0 0 0 1px rgb(var(--caramel-300) / 0.35), 0 8px 28px -6px rgb(var(--caramel-400) / 0.55)',
        inset: 'inset 0 1px 0 rgb(255 255 255 / 0.08)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
        'steam': 'steam 3.5s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(var(--r, 0deg))' },
          '50%': { transform: 'translateY(-10px) rotate(var(--r, 0deg))' },
        },
        steam: {
          '0%': { opacity: '0', transform: 'translateY(6px) scaleX(1)' },
          '40%': { opacity: '0.7' },
          '100%': { opacity: '0', transform: 'translateY(-14px) scaleX(1.15)' },
        },
      },
    },
  },
  plugins: [],
}
