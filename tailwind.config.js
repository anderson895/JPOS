/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        espresso: {
          50: '#fdf6ee',
          100: '#f9e8d0',
          200: '#f3ce9d',
          300: '#ecad65',
          400: '#e58a33',
          500: '#df6e18',
          600: '#c95413',
          700: '#a73c12',
          800: '#873016',
          900: '#6e2915',
          950: '#3c1209',
        },
        cream: {
          50: '#fefdf9',
          100: '#fdf8ed',
          200: '#faf0d4',
          300: '#f5e3b0',
          400: '#eece81',
          500: '#e7b752',
          600: '#d99c31',
          700: '#b57d26',
          800: '#926226',
          900: '#775124',
          950: '#422b10',
        },
        bark: {
          50: '#f7f4f1',
          100: '#ede6df',
          200: '#dbccbf',
          300: '#c5aa97',
          400: '#ae8771',
          500: '#9d7059',
          600: '#8f5e4b',
          700: '#774d3f',
          800: '#634139',
          900: '#533832',
          950: '#2c1d19',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
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
      },
    },
  },
  plugins: [],
}
