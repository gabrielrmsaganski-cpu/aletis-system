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
    navigator.serviceWorker.getRegistration(swPath).then(async (reg) => {
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
      // 2. Registra SW (idempotente)
      const reg = await navigator.serviceWorker.register(swPath)
      await navigator.serviceWorker.ready
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
      const reg = await navigator.serviceWorker.getRegistration(swPath)
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
