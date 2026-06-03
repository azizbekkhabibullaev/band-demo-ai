/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        widget:      '0 24px 80px -12px rgba(0,0,0,0.22), 0 4px 12px -4px rgba(0,0,0,0.08)',
        'widget-sm': '0 8px 30px -4px rgba(0,0,0,0.14)',
        fab:         '0 8px 32px rgba(37,99,235,0.42)',
        'fab-hover': '0 12px 44px rgba(37,99,235,0.54)',
        'card-gold': '0 0 0 2px rgba(251,191,36,0.45), 0 2px 8px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
