/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdcff',
          300: '#8ec6ff',
          400: '#59a6ff',
          500: '#2f83f7',
          600: '#1a64e6',
          700: '#1550c4',
          800: '#1843a0',
          900: '#1a3c80',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
        },
        violet: {
          400: '#a78bfa',
          500: '#8b5cf6',
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        soft: '0 10px 30px -12px rgba(31, 99, 230, 0.25)',
        glow: '0 0 0 1px rgba(47,131,247,0.4), 0 8px 24px -6px rgba(34,211,238,0.35)',
      },
      backgroundImage: {
        'grid-light':
          'linear-gradient(rgba(47,131,247,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(47,131,247,0.06) 1px, transparent 1px)',
        'brand-gradient':
          'linear-gradient(135deg, #2f83f7 0%, #06b6d4 50%, #8b5cf6 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(34,211,238,0.5)' },
          '70%': { boxShadow: '0 0 0 10px rgba(34,211,238,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34,211,238,0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        float: 'float 4s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};
