/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0F1E2E',
        stone: '#57534E',
        sand: '#FDF6E7',
        mist: '#E7E5E4',
        laterite: {
          50: '#FEF2EE',
          500: '#D94F2B',
          600: '#C2512F',
          700: '#A33D1F',
        },
        brand: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#0D7C5C',
          600: '#0A6650',
          700: '#095240',
          800: '#0F3D2E',
          900: '#0F1E2E',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
