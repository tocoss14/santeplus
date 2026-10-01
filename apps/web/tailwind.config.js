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
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.92) translateY(10px)' },
          '60%': { opacity: '1', transform: 'scale(1.03) translateY(0)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-9deg)' },
          '75%': { transform: 'rotate(9deg)' },
        },
        confetti: {
          '0%': { opacity: '1', transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'translate3d(var(--confetti-drift, 0px), 55vh, 0) rotate(var(--confetti-rotate, 360deg))' },
        },
        'wax-slide': {
          to: { backgroundPositionX: '48px' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(10px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'pop-in': 'pop-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        float: 'float 7s ease-in-out infinite',
        'float-delayed': 'float 9s ease-in-out 1.4s infinite',
        wiggle: 'wiggle 0.5s ease-in-out',
        confetti: 'confetti 2.6s cubic-bezier(0.15, 0.6, 0.4, 1) both',
        'wax-slide': 'wax-slide 4.5s linear infinite',
        'toast-in': 'toast-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
