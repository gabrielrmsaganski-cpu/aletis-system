/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /**
         * Paleta oficial ALETIS (Manual de Identidade Visual)
         *  - verde-dark   #17251b  primary brand
         *  - verde-medio  #465b4a  secondary brand
         *  - sage         #b2bda1  apoio neutro
         *  - cream        #ede9d9  papel da marca
         *  - gold         #cb9d52  acento estratégico
         *  - cinza        #d9d9d9  neutro de UI
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
            escuro: '#a8a8a8',
            grafite: '#3d3d3d',
          },
          // Aliases legados
          dourado: {
            DEFAULT: '#cb9d52',
            escuro: '#a87f3d',
            suave: '#e3bd80',
            claro: '#f0d9a8',
          },
          bege: 'var(--bg-app)',
          grafite: {
            escuro: '#17251b',
            medio: '#465b4a',
            claro: '#6b7d6f',
          },
          borda: 'rgb(var(--ui-border-rgb) / <alpha-value>)',
          bordaSutil: 'var(--border-default)',
        },
        // Status colors
        positivo: '#465b4a',
        alerta: '#a83232',
        atencao: '#cb9d52',
        ambar: {
          DEFAULT: '#cb9d52',
          dark: '#a87f3d',
          light: '#e3bd80',
        },
        // ── shadcn/ui design system colors ──
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        // ── Tipografia operacional unificada ──
        display: ['"Inter"', 'Verdana', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'Verdana', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // ── LEGADO (compatibilidade) ──
        display_legacy: ['"Chakra Petch"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body_legacy: ['Verdana', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '14px',
        '2xl': '14px',
        '3xl': '18px',
        '4xl': '24px',
      },
      letterSpacing: {
        wider2: '0',
        widest2: '0',
        widest3: '0',
      },
      backgroundImage: {
        'aletis-pattern': "url('/brand/pattern/repetidor.png')",
        'aletis-hero':
          'linear-gradient(135deg, #17251b 0%, #1d3024 45%, #243a2c 100%)',
        'aletis-cream':
          'linear-gradient(180deg, #f5f2e7 0%, #ede9d9 100%)',
        'glass-strong': 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.3) 100%)',
        'glass-dark': 'linear-gradient(135deg, rgba(13,22,17,0.8) 0%, rgba(23,37,27,0.6) 100%)',
        'gold-shimmer': 'linear-gradient(90deg, transparent 0%, rgba(203,157,82,0.15) 50%, transparent 100%)',
        'spotlight': 'radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(203,157,82,0.08), transparent 40%)',
      },
      boxShadow: {
        'brand-sm': '0 1px 2px 0 rgba(23,37,27,0.08)',
        'brand': '0 4px 14px -4px rgba(23,37,27,0.18)',
        'brand-lg': '0 12px 28px -8px rgba(23,37,27,0.28)',
        'brand-gold': '0 8px 24px -10px rgba(203,157,82,0.45)',
        'glass': '0 8px 32px -8px rgba(23,37,27,0.12)',
        'glass-lg': '0 16px 48px -12px rgba(23,37,27,0.18)',
        'glow-gold': '0 0 20px -4px rgba(203,157,82,0.4)',
        'glow-gold-sm': '0 0 12px -2px rgba(203,157,82,0.3)',
        'glow-green': '0 0 20px -4px rgba(70,91,74,0.4)',
        'glow-red': '0 0 20px -4px rgba(168,50,50,0.4)',
        // ── Premium elevation system (Linear/Vercel style) ──
        'soft': '0 1px 2px 0 rgba(13,22,17,0.04), 0 1px 3px 0 rgba(13,22,17,0.05)',
        'elevation-1': '0 1px 0 rgba(13,22,17,0.04), 0 1px 2px rgba(13,22,17,0.06)',
        'elevation-2': '0 4px 6px -2px rgba(13,22,17,0.05), 0 12px 24px -6px rgba(13,22,17,0.08)',
        'elevation-3': '0 12px 24px -6px rgba(13,22,17,0.08), 0 24px 48px -12px rgba(13,22,17,0.12)',
        'elevation-4': '0 24px 48px -12px rgba(13,22,17,0.14), 0 40px 80px -20px rgba(13,22,17,0.20)',
        'inner-ring': 'inset 0 0 0 1px rgba(13,22,17,0.06)',
        'inner-ring-gold': 'inset 0 0 0 1px rgba(203,157,82,0.25)',
        'inner-highlight': 'inset 0 1px 0 0 rgba(255,255,255,0.08)',
        'focus-gold': '0 0 0 4px rgba(203,157,82,0.18)',
        'focus-green': '0 0 0 4px rgba(70,91,74,0.18)',
      },
      animation: {
        ticker: 'ticker 60s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        gauge: 'gauge 1.5s ease-out',
        shimmer: 'shimmer 2.5s ease-in-out infinite',
        'shimmer-slow': 'shimmer 4s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        // ── Premium micro-interactions ──
        'scale-in': 'scaleIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pop': 'pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'bounce-soft': 'bounceSoft 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
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
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '60%': { opacity: '1', transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        bounceSoft: {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '60%': { transform: 'translateY(-2px)', opacity: '1' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '24px',
        '2xl': '40px',
      },
      transitionDuration: {
        '400': '400ms',
        '600': '600ms',
        '800': '800ms',
      },
      transitionTimingFunction: {
        'snappy': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'glide': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
