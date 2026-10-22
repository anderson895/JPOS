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
      colors: {
        // Roasted browns — primary surfaces, dark sections, primary buttons
        espresso: {
          50:  '#faf4ec',
          100: '#f3e6d4',
          200: '#e6cdb0',
          300: '#d3ac85',
          400: '#b9875c',
          500: '#946140',
          600: '#6f4428',
          700: '#55331d',
          800: '#3f2616',
          900: '#2c1a0f',
          950: '#1c1009',
        },
        // Warm caramel — accents, highlights, call-to-action gradients
        caramel: {
          50:  '#fdf7ee',
          100: '#f9e9d2',
          200: '#f2d3a8',
          300: '#e9bb7e',
          400: '#dda15e',
          500: '#cc8745',
          600: '#b06e34',
          700: '#8c552a',
          800: '#6e4324',
          900: '#58371f',
        },
        // Steamed milk — page backgrounds, cards, borders
        cream: {
          50:  '#fffcf7',
          100: '#fdf7ee',
          200: '#f8eddd',
          300: '#f1e0c8',
          400: '#e7cfae',
          500: '#d9b98f',
          600: '#c49d6e',
          700: '#a37d52',
          800: '#7f603f',
          900: '#634a32',
          950: '#3d2d1e',
        },
        // Muted browns — secondary text, icons
        bark: {
          50:  '#f8f4f0',
          100: '#eee5dc',
          200: '#dccbbb',
          300: '#c4a991',
          400: '#a88a70',
          500: '#8c6f57',
          600: '#725843',
          700: '#5b4535',
          800: '#47372b',
          900: '#3a2d24',
          950: '#211913',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgb(63 38 22 / 0.04), 0 12px 32px -14px rgb(63 38 22 / 0.22)',
        lift: '0 2px 4px rgb(63 38 22 / 0.06), 0 22px 44px -18px rgb(63 38 22 / 0.35)',
        glow: '0 0 0 1px rgb(233 187 126 / 0.35), 0 8px 28px -6px rgb(221 161 94 / 0.55)',
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
