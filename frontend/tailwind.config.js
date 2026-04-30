/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fdf2f8',
          100: '#fce7f3',
          500: '#e91e8c',
          600: '#d4177a',
          700: '#b01265',
          900: '#6b0a3d',
        },
        navy: {
          800: '#0f1729',
          900: '#080d1a',
        }
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      }
    }
  },
  plugins: []
}
