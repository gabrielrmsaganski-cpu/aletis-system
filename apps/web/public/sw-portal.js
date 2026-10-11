// ============================================================
// Portal do Cliente — Service Worker para Web Push
// ============================================================
// Único responsável: receber `push` events e mostrar notificação.
// Não faz cache offline (escopo /portal-cliente apenas), não intercepta
// fetch — vida curta, atualiza junto com o deploy.
// ============================================================

self.addEventListener('install', (event) => {
  // Ativa imediatamente sem precisar de reload.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

importScripts('/portal-push-handlers.js')
