/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /**
         * Paleta oficial ALETIS (Manual de Identidade Visual — Bulbo Agência)
         *  - verde-dark   #17251b  primary brand (fundos imersivos, sidebar, hero)
         *  - verde-medio  #465b4a  secondary brand (botões/active states)
         *  - sage         #b2bda1  apoio neutro (chips, divisórias, padrões)
         *  - cream        #ede9d9  papel da marca (backgrounds claros, cards)
         *  - gold         #cb9d52  acento estratégico (CTAs, destaques, KPIs hero)
         *  - cinza        #d9d9d9  neutro de UI (skeleton, divisor leve)
         */
        aletis: {
          verde: {
            DEFAULT: '#17251b',
            escuro: '#0d1611',
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
          },
          gold: {
            DEFAULT: '#cb9d52',
            escuro: '#a87f3d',
            claro: '#e3bd80',
          },
          cinza: {
            DEFAULT: '#d9d9d9',
            escuro: '#a8a8a8',
            grafite: '#3d3d3d',
          },
          // Aliases legados — apontados para a paleta nova para evitar regressão
          // em componentes ainda não migrados.
          dourado: {
            DEFAULT: '#cb9d52',
            escuro: '#a87f3d',
            suave: '#e3bd80',
            claro: '#f0d9a8',
          },
          bege: '#ede9d9',
          grafite: {
            escuro: '#17251b',
            medio: '#465b4a',
            claro: '#6b7d6f',
          },
          borda: '#d9d3bc',
        },
        // Status colors derivados da paleta, sem cores estranhas à marca
        positivo: '#465b4a',
        alerta: '#a83232',
        ambar: '#cb9d52',
      },
      fontFamily: {
        display: ['"Chakra Petch"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Verdana', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      backgroundImage: {
        'aletis-pattern': "url('/brand/pattern/repetidor.png')",
        'aletis-hero':
          'linear-gradient(135deg, #17251b 0%, #1d3024 45%, #243a2c 100%)',
        'aletis-cream':
          'linear-gradient(180deg, #f5f2e7 0%, #ede9d9 100%)',
      },
      boxShadow: {
        'brand-sm': '0 1px 2px 0 rgba(23,37,27,0.08)',
        'brand': '0 4px 14px -4px rgba(23,37,27,0.18)',
        'brand-lg': '0 12px 28px -8px rgba(23,37,27,0.28)',
        'brand-gold': '0 8px 24px -10px rgba(203,157,82,0.45)',
      },
      animation: {
        ticker: 'ticker 60s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        gauge: 'gauge 1.5s ease-out',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        gauge: {
          '0%': { strokeDashoffset: '283' },
        },
      },
    },
  },
  plugins: [],
}
