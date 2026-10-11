import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Paleta oficial ALETIS — Manual de Identidade Visual (Bulbo Agência).
         * verde-dark   #17251b  primary brand (fundos imersivos, hero, header)
         * verde-medio  #465b4a  secondary brand (botões, active)
         * sage         #b2bda1  apoio neutro (chips, divisórias, padrões)
         * cream        #ede9d9  papel da marca (backgrounds claros, cards)
         * gold         #cb9d52  acento estratégico (CTAs, destaques)
         * cinza        #d9d9d9  neutro de UI
         */
        aletis: {
          verde: {
            DEFAULT: '#17251b',
            escuro: '#0d1611',
            profundo: '#080d09',
            medio: '#465b4a',
            claro: '#6b7d6f',
          },
          sage: {
            DEFAULT: '#b2bda1',
            escuro: '#8e9a7d',
            claro: '#cdd5c0',
          },
          cream: {
            DEFAULT: '#ede9d9',
            escuro: '#d9d3bc',
            papel: '#f5f2e7',
            marfim: '#fbf9f0',
          },
          gold: {
            DEFAULT: '#cb9d52',
            escuro: '#a87f3d',
            claro: '#e3bd80',
            brilho: '#f0d9a8',
          },
          cinza: {
            DEFAULT: '#d9d9d9',
            grafite: '#3d3d3d',
          },
          // Aliases legados — apontados para a paleta nova para evitar
          // regressão em componentes ainda não migrados.
          dourado: {
            DEFAULT: '#cb9d52',
            escuro: '#a87f3d',
            suave: '#e3bd80',
            claro: '#f0d9a8',
            brilho: '#f0d9a8',
          },
          marfim: '#fbf9f0',
          bege: '#ede9d9',
          grafite: {
            escuro: '#17251b',
            medio: '#465b4a',
            claro: '#6b7d6f',
          },
          borda: '#d9d3bc',
          bordaSutil: '#e9e3d2',
        },
        positivo: '#465b4a',
        alerta: '#a83232',
        atencao: '#cb9d52',
      },
      fontFamily: {
        display: ['var(--font-display)', '"Chakra Petch"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'Verdana', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        wider2: '0',
        widest2: '0',
        widest3: '0',
      },
      boxShadow: {
        premium: '0 22px 64px -28px rgba(13, 22, 17, 0.45)',
        'premium-sm': '0 8px 24px -12px rgba(13, 22, 17, 0.30)',
        gold: '0 12px 38px -16px rgba(203, 157, 82, 0.55)',
        'gold-lg': '0 18px 56px -20px rgba(203, 157, 82, 0.7)',
        'inner-hair': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
        'brand-sm': '0 1px 2px 0 rgba(23,37,27,0.08)',
        brand: '0 4px 14px -4px rgba(23,37,27,0.18)',
        'brand-lg': '0 12px 28px -8px rgba(23,37,27,0.28)',
      },
      backgroundImage: {
        grain:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        'hero-radial':
          'linear-gradient(115deg, rgba(203, 157, 82, 0.16) 0%, transparent 42%), linear-gradient(180deg, rgba(237, 233, 217, 0.08) 0%, transparent 54%)',
        'gold-sheen':
          'linear-gradient(135deg, rgba(203, 157, 82, 0) 0%, rgba(203, 157, 82, 0.28) 48%, rgba(203, 157, 82, 0) 100%)',
        'aletis-pattern': "url('/brand/pattern/repetidor.png')",
        'aletis-cream':
          'linear-gradient(180deg, #fbf9f0 0%, #ede9d9 100%)',
      },
      animation: {
        'fade-up': 'fadeUp 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fadeIn 0.8s ease-out both',
        'gold-shimmer': 'goldShimmer 8s ease-in-out infinite',
        ticker: 'ticker 60s linear infinite',
        'pulse-soft': 'pulseSoft 3.2s ease-in-out infinite',
        'float-slow': 'floatSlow 7s ease-in-out infinite',
        'rotate-slow': 'rotateSlow 60s linear infinite',
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
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        rotateSlow: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
