/**
 * PushService — Web Push notifications para o Portal do Cliente.
 *
 * Usa VAPID (RFC 8292) com chaves carregadas de env ou geradas em dev. As
 * subscriptions ficam em cliente.portalAcesso.pushSubscriptions, junto às
 * credenciais (mesma vida útil que o login). Falhas 410/404 expiram a
 * subscription automaticamente — endpoint GCM/Mozilla evolui.
 */
import webpush from 'web-push'

export interface PushSubscriptionRecord {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
  ua?: string
  criadoEm: string
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

let configured = false
let publicKey = ''
let privateKey = ''

function ensureConfigured() {
  if (configured) return
  publicKey = process.env.VAPID_PUBLIC_KEY || ''
  privateKey = process.env.VAPID_PRIVATE_KEY || ''
  if (!publicKey || !privateKey) {
    // Gera par efêmero em dev — atenção: muda a cada restart, então
    // subscriptions antigas viram inválidas. Aceitável só em dev.
    const keys = webpush.generateVAPIDKeys()
    publicKey = keys.publicKey
    privateKey = keys.privateKey
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn(
        '[PushService] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes — gerando par efêmero. ' +
          'Defina no .env em produção.\n' +
          `  VAPID_PUBLIC_KEY=${publicKey}\n  VAPID_PRIVATE_KEY=${privateKey}`,
      )
    }
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contato@aletis.com.br',
    publicKey,
    privateKey,
  )
  configured = true
}

export function getVapidPublicKey(): string {
  ensureConfigured()
  return publicKey
}

/** Envia push para todas as subscriptions, removendo as expiradas (410/404). */
export async function enviarPush(
  subs: PushSubscriptionRecord[],
  payload: PushPayload,
): Promise<{ enviadas: number; expiradas: string[] }> {
  ensureConfigured()
  const expiradas: string[] = []
  let enviadas = 0
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }, // 24h
        )
        enviadas++
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          expiradas.push(sub.endpoint)
        } else if (process.env.NODE_ENV !== 'test') {
          // eslint-disable-next-line no-console
          console.warn('[PushService] Falha ao enviar push:', status, (err as Error).message)
        }
      }
    }),
  )
  return { enviadas, expiradas }
}
