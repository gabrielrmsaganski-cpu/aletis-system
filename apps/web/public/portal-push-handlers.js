// Handlers compartilhados pelo worker do portal e pelo PWA principal.
// O worker principal preserva inscrições antigas do registro raiz.
// Não há install, activate, skipWaiting ou cache neste arquivo.

self.addEventListener('push', (event) => {
  let payload = { title: 'ALETIS', body: 'Você tem uma nova atualização.', url: '/portal-cliente' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch (err) {
    try {
      const txt = event.data ? event.data.text() : ''
      if (txt) payload.body = txt
    } catch (_) { /* Mantém o aviso padrão quando o payload não é legível. */ }
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
      for (const client of all) {
        if (client.url.includes('/portal-cliente') && 'focus' in client) {
          client.navigate(target).catch(() => { /* O foco continua disponível se a navegação falhar. */ })
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
