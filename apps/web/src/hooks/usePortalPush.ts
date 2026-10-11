// ============================================================
// usePortalPush — opt-in de Web Push para o Portal do Cliente.
// ============================================================
// Estado:
//  - 'unsupported': browser sem suporte (iOS Safari < 16.4, etc.)
//  - 'denied': usuário bloqueou notificações
//  - 'idle': suportado mas ainda não inscrito
//  - 'subscribed': inscrição ativa
//  - 'pending': transitando (subscribe/unsubscribe em andamento)
//
// Fluxo: getVapidKey → register sw → permission → subscribe → POST backend.
// ============================================================
import { useCallback, useEffect, useState } from 'react'

export type PushState =
  | 'unsupported'
  | 'denied'
  | 'idle'
  | 'subscribed'
  | 'pending'
  | 'error'

interface UsePortalPushOpts {
  /** JWT no formato Bearer — backend também aceita cookie HttpOnly. */
  token: string | null
  /** Path do service worker. */
  swPath?: string
}

export const PORTAL_PUSH_SCOPE = '/portal-cliente'

function scopeUrl(): string {
  return new URL(PORTAL_PUSH_SCOPE, window.location.origin).href
}

/** getRegistration devolve o registro raiz quando ainda não há um registro específico do portal. */
async function findPortalRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  const registration = await navigator.serviceWorker.getRegistration(PORTAL_PUSH_SCOPE)
  return registration?.scope === scopeUrl() ? registration : undefined
}

/** Espera o worker deste registro; ready pode resolver com o aplicativo principal. */
export function waitForPortalWorker(registration: ServiceWorkerRegistration, swPath: string): Promise<void> {
  if (registration.scope !== scopeUrl()) return Promise.reject(new Error('O registro de notificações não pertence ao portal.'))
  const scriptUrl = new URL(swPath, window.location.origin).href
  return new Promise((resolve, reject) => {
    const workers = new Set<ServiceWorker>()
    let finished = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (error?: Error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      registration.removeEventListener('updatefound', check)
      for (const worker of workers) worker.removeEventListener('statechange', check)
      if (error) reject(error)
      else resolve()
    }
    const check = () => {
      if (finished) return
      const active = registration.active
      if (active?.state === 'activated' && active.scriptURL === scriptUrl) return finish()
      for (const worker of [registration.installing, registration.waiting, active]) {
        if (!worker || worker.scriptURL !== scriptUrl || workers.has(worker)) continue
        workers.add(worker)
        worker.addEventListener('statechange', check)
      }
      if (workers.size && [...workers].every(worker => worker.state === 'redundant')) {
        finish(new Error('Não foi possível ativar as notificações do portal. Tente novamente.'))
      }
    }
    timer = setTimeout(() => finish(new Error('A ativação das notificações demorou. Tente novamente.')), 30000)
    registration.addEventListener('updatefound', check)
    check()
  })
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function usePortalPush({ token, swPath = '/sw-portal.js' }: UsePortalPushOpts) {
  const [state, setState] = useState<PushState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Detecta suporte + estado inicial.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }
    let mounted = true
    findPortalRegistration().then(async (reg) => {
      if (!mounted || !reg) return
      const sub = await reg.pushManager.getSubscription()
      if (mounted) setState(sub ? 'subscribed' : 'idle')
    }).catch(() => { /* ignora */ })
    return () => { mounted = false }
  }, [swPath])

  const subscribe = useCallback(async () => {
    if (!token) return
    setState('pending')
    setErrorMsg(null)
    try {
      // 1. Permissão
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'idle')
        return
      }
      // 2. Registro próprio do portal. Inscrições antigas de outros escopos permanecem intactas.
      const reg = await navigator.serviceWorker.register(swPath, { scope: PORTAL_PUSH_SCOPE })
      await waitForPortalWorker(reg, swPath)
      // 3. Busca chave VAPID
      const vapidResp = await fetch('/api/portal/push/vapid-public-key', {
        credentials: 'same-origin',
      })
      const vapidJson = (await vapidResp.json()) as { data?: { publicKey?: string } }
      const publicKey = vapidJson.data?.publicKey
      if (!publicKey) throw new Error('VAPID key indisponível')
      // 4. Subscribe
      const existing = await reg.pushManager.getSubscription()
      const subscription = existing ?? (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast — Uint8Array satisfaz BufferSource em runtime, mas o
        // lib.dom mais novo amarra a um ArrayBuffer concreto.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }))
      // 5. Envia ao backend
      const json = subscription.toJSON()
      const resp = await fetch('/api/portal/push/subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      })
      if (!resp.ok) throw new Error(`Subscribe falhou: ${resp.status}`)
      setState('subscribed')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao ativar notificações')
      setState('error')
    }
  }, [token, swPath])

  const unsubscribe = useCallback(async () => {
    if (!token) return
    setState('pending')
    setErrorMsg(null)
    try {
      const reg = await findPortalRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/portal/push/unsubscribe', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => { /* ignora — local unsub é o que importa */ })
        await sub.unsubscribe()
      }
      setState('idle')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha ao desativar')
      setState('error')
    }
  }, [token, swPath])

  return { state, errorMsg, subscribe, unsubscribe }
}
