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

self.addEventListener('push', (event) => {
  let payload = { title: 'ALETIS', body: 'Você tem uma nova atualização.', url: '/portal-cliente' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch (err) {
    // Se vier texto plano em vez de JSON, mostra como body.
    try {
      const txt = event.data ? event.data.text() : ''
      if (txt) payload.body = txt
    } catch (_) { /* swallow */ }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/brand/logos/aletis-principal-cream.png',
      badge: '/favicon.svg',
      tag: payload.tag || 'aletis-portal',
      data: { url: payload.url || '/portal-cliente' },
      requireInteraction: false,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/portal-cliente'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      // Reusa janela já aberta do portal se houver.
      for (const c of all) {
        if (c.url.includes('/portal-cliente') && 'focus' in c) {
          c.navigate(target).catch(() => { /* ignore */ })
          return c.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
