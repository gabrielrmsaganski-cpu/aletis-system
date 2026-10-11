import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Ativa a versão nova pelo aviso da interface, preservando formulários em edição.
      registerType: 'prompt',
      // Em dev, manter SW desligado (HMR + PWA brigam). Habilitar
      // só em build de prod e durante preview local.
      devOptions: { enabled: false },
      manifest: {
        name: 'ALETIS — Finanças Estratégicas',
        short_name: 'ALETIS',
        description:
          'ALETIS Consultoria Agro-Financeira — CRM, propostas, dossiês e inteligência de mercado para consultores rurais.',
        theme_color: '#17251b',
        background_color: '#ede9d9',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/dashboard',
        scope: '/',
        lang: 'pt-BR',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Mantém recebimento das inscrições antigas que usavam o registro raiz.
        // O arquivo compartilhado não altera o ciclo de atualização do aplicativo.
        importScripts: ['/portal-push-handlers.js'],
        // Pre-cache: HTML/CSS/JS/fontes do shell.
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff}'],
        // Chunks pesados e acionados sob demanda ficam fora do precache
        // inicial. Eles seguem disponíveis online quando o usuário abre
        // gráficos, mapas, ZIP, planilhas ou exportação PDF.
        globIgnores: [
          '**/charts-vendor-*.js',
          '**/leaflet-vendor-*.js',
          '**/pdf-vendor-*.js',
          '**/spreadsheet-vendor-*.js',
          '**/zip-vendor-*.js',
          '**/html2canvas*.js',
        ],
        // Dados autenticados da API nunca entram no cache do Service Worker:
        // isso evita que informações de uma sessão apareçam para o próximo
        // usuário do mesmo navegador. Somente assets públicos são cacheados.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.googleapis.com' ||
              url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'aletis-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'aletis-images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        // Não cachear /metrics nem rotas POST/PUT/DELETE (sempre online).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/metrics/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3011',
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom', 'react-router-dom'],
          'leaflet-vendor': ['leaflet', 'react-leaflet'],
          'icons-vendor': ['lucide-react'],
          'charts-vendor': ['recharts'],
          'pdf-vendor': ['jspdf', 'jspdf-autotable'],
          'spreadsheet-vendor': ['xlsx'],
          'zip-vendor': ['jszip'],
        },
      },
    },
  },
})
