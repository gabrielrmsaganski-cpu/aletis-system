import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        aletis: {
          verde: {
            DEFAULT: '#0F4C35',
            escuro: '#0A3526',
            profundo: '#062019',
            medio: '#1B6B4A',
            claro: '#2A8F64',
          },
          dourado: {
            DEFAULT: '#C9A84C',
            escuro: '#A68A3A',
            suave: '#E8C97A',
            claro: '#F5E6B8',
            brilho: '#F2D98A',
          },
          marfim: '#FDFBF6',
          bege: '#F8F5EF',
          grafite: {
            escuro: '#1C1C1E',
            medio: '#4A4A4A',
            claro: '#6B6B6B',
          },
          borda: '#E2DDD5',
          bordaSutil: '#EDE8DF',
        },
        positivo: '#1B8F5A',
        alerta: '#C0392B',
        atencao: '#C9A84C',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Playfair Display', 'serif'],
        body: ['var(--font-body)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        wider2: '0.12em',
        widest2: '0.22em',
      },
      boxShadow: {
        premium: '0 20px 60px -25px rgba(10, 53, 38, 0.35)',
        'premium-sm': '0 8px 24px -12px rgba(10, 53, 38, 0.25)',
        gold: '0 10px 40px -18px rgba(201, 168, 76, 0.55)',
        'inner-hair': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
      },
      backgroundImage: {
        'grain':
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        'hero-radial':
          'radial-gradient(circle at 18% 18%, rgba(201, 168, 76, 0.18) 0%, transparent 38%), radial-gradient(circle at 82% 70%, rgba(42, 143, 100, 0.14) 0%, transparent 45%)',
        'gold-sheen':
          'linear-gradient(135deg, rgba(201, 168, 76, 0.0) 0%, rgba(201, 168, 76, 0.25) 48%, rgba(201, 168, 76, 0) 100%)',
      },
      animation: {
        'fade-up': 'fadeUp 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fadeIn 0.8s ease-out both',
        'gold-shimmer': 'goldShimmer 8s ease-in-out infinite',
        'ticker': 'ticker 60s linear infinite',
        'pulse-soft': 'pulseSoft 3.2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        goldShimmer: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        ticker: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.03)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
