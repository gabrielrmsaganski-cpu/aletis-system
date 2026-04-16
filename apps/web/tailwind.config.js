/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        aletis: {
          verde: {
            DEFAULT: '#0F4C35',
            escuro: '#0A3526',
            medio: '#1B6B4A',
            claro: '#2A8F64',
          },
          dourado: {
            DEFAULT: '#C9A84C',
            escuro: '#A68A3A',
            suave: '#E8C97A',
            claro: '#F5E6B8',
          },
          bege: '#F8F5EF',
          grafite: {
            escuro: '#1C1C1E',
            medio: '#4A4A4A',
            claro: '#6B6B6B',
          },
          borda: '#E2DDD5',
        },
        alerta: '#C0392B',
        positivo: '#27AE60',
        ambar: '#E67E22',
      },
      fontFamily: {
        display: ['Playfair Display', 'serif'],
        body: ['Inter', 'sans-serif'],
      },
      animation: {
        'ticker': 'ticker 60s linear infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'gauge': 'gauge 1.5s ease-out',
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
