import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { GoogleWorkspaceActor } from './schemas.js'
import { getGoogleTokenStore } from './tokenStore.js'
import { getGoogleWorkspaceClient } from './client.js'
import { getGoogleDriveService } from './drive.js'
import { getGoogleDocsService } from './docs.js'
import { getGoogleWorkspaceCalendarService } from './calendar.js'
import { getGoogleGmailService } from './gmail.js'
import { getCorporateDriveCredentials } from './CorporateDriveCredentials.js'
import { GoogleConnectionError } from './connectionErrors.js'

const DRIVE_PROBE_TIMEOUT_MS = 5_000
const DRIVE_PROBE_SUCCESS_TTL_MS = 30_000
const DRIVE_PROBE_FAILURE_TTL_MS = 5_000
const DriveAboutSchema = z.object({ user: z.object({ emailAddress: z.string().email() }) })

interface DriveAccessCheck {
  expiresAt: number
  result: Promise<void>
}

export class GoogleWorkspaceService {
  private readonly driveAccessChecks = new Map<string, DriveAccessCheck>()

  private async verifyDriveAccess(account: string, accessToken: string): Promise<void> {
    const now = Date.now()
    const key = createHash('sha256').update(`${account.trim().toLowerCase()}\0${accessToken}`).digest('hex')
    for (const [cachedKey, entry] of this.driveAccessChecks) {
      if (entry.expiresAt <= now) this.driveAccessChecks.delete(cachedKey)
    }
    const cached = this.driveAccessChecks.get(key)
    if (cached) return cached.result

    // A promessa também compartilha a consulta em andamento. Falhas expiram cedo para permitir nova tentativa.
    const entry: DriveAccessCheck = { expiresAt: Number.POSITIVE_INFINITY, result: Promise.resolve() }
    entry.result = this.probeDriveAccess(account, accessToken).then(
      () => { entry.expiresAt = Date.now() + DRIVE_PROBE_SUCCESS_TTL_MS },
      error => {
        entry.expiresAt = Date.now() + DRIVE_PROBE_FAILURE_TTL_MS
        throw error
      },
    )
    if (this.driveAccessChecks.size >= 16) this.driveAccessChecks.delete(this.driveAccessChecks.keys().next().value!)
    this.driveAccessChecks.set(key, entry)
    return entry.result
  }

  private async probeDriveAccess(account: string, accessToken: string): Promise<void> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DRIVE_PROBE_TIMEOUT_MS)
    try {
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
      if (response.status === 401) {
        getCorporateDriveCredentials().invalidate(accessToken)
        throw Object.assign(new GoogleConnectionError('AUTH_REQUIRED', 'O Google recusou o token atual da conta corporativa.'), { accessTokenRejected: true })
      }
      if (response.status === 403) throw new GoogleConnectionError('PERMISSION_DENIED', 'A conta não tem permissão para acessar o Drive. Revise as permissões concedidas no Google.')
      if (!response.ok) throw new GoogleConnectionError('TEMPORARILY_UNAVAILABLE', 'O Google Drive está temporariamente indisponível. Tente novamente em instantes.')
      const about = DriveAboutSchema.parse(await response.json())
      if (about.user.emailAddress.trim().toLowerCase() !== account.trim().toLowerCase()) {
        throw new GoogleConnectionError('ACCOUNT_MISMATCH', 'A conta autorizada no Drive não corresponde à conta corporativa configurada.')
      }
    } finally {
      clearTimeout(timer)
    }
  }

  async status(actor: GoogleWorkspaceActor) {
    const oauthConfigured = getGoogleTokenStore().missingEnv().length === 0
    const credentials = getCorporateDriveCredentials()
    const preflight = await credentials.statusPreflight()
    const corporateAccount = credentials.account()
    if (corporateAccount || preflight.selected || preflight.diagnostic) {
      try {
        if (actor.tenantId !== (process.env.ALETIS_TENANT_ID || 'default')) throw new GoogleConnectionError('ACCOUNT_MISMATCH', 'A conexão corporativa não pertence a este contexto.')
        if (!preflight.ready || !corporateAccount) throw new GoogleConnectionError((preflight.diagnostic?.code || 'SERVER_CONFIGURATION') as any, preflight.diagnostic?.message || 'Complete a configuração da conexão corporativa selecionada.')
        let accessToken = await credentials.getAccessToken()
        try { await this.verifyDriveAccess(corporateAccount, accessToken) } catch (error) {
          if (!(error as any)?.accessTokenRejected) throw error
          accessToken = await credentials.refreshAccessToken(accessToken)
          await this.verifyDriveAccess(corporateAccount, accessToken)
        }
        return {
          status: 'connected' as const,
          enabled: true,
          configured: true,
          oauthConfigured,
          connectionMode: preflight.connectionMode,
          googleEmail: corporateAccount,
          scopes: preflight.scopes,
          missingEnv: [],
          features: {
            drive: 'Conectado',
            docs: 'Conectado via Drive',
            calendar: 'Não configurado',
            gmail: 'Não configurado',
          },
        }
      } catch (error) {
        const code = error instanceof GoogleConnectionError ? error.code
          : ['AbortError', 'TimeoutError', 'TypeError'].includes((error as Error).name) ? 'TEMPORARILY_UNAVAILABLE' : 'AUTH_REQUIRED'
        return {
          status: 'error' as const,
          enabled: true,
          configured: true,
          oauthConfigured,
          connectionMode: preflight.connectionMode,
          googleEmail: corporateAccount,
          scopes: [],
          missingEnv: [],
          diagnostic: {
            code,
            message: error instanceof GoogleConnectionError ? error.message : code === 'TEMPORARILY_UNAVAILABLE'
              ? 'Não foi possível consultar o Google Drive. Tente novamente em instantes.'
              : 'A autorização corporativa do Google Drive precisa ser reconectada.',
          },
          features: {
            drive: 'Autorização necessária',
            docs: 'Autorização necessária',
            calendar: 'Não configurado',
            gmail: 'Não configurado',
          },
        }
      }
    }
    return { ...await getGoogleTokenStore().publicStatus(actor), oauthConfigured }
  }

  async disconnect(actor: GoogleWorkspaceActor) {
    if (getCorporateDriveCredentials().account()) {
      throw new Error('A conexão corporativa do Drive é gerenciada pelo servidor. Revogue a autorização apenas pela administração do ALETIS.')
    }
    await getGoogleWorkspaceClient().revoke(actor)
    return getGoogleTokenStore().disconnect(actor)
  }

  async clientBundle(actor: GoogleWorkspaceActor, clientId: string) {
    const [folder, documents, events, emails] = await Promise.all([
      getGoogleDriveService().getClientFolder(actor, clientId),
      getGoogleDocsService().listClientDocuments(actor, clientId),
      getGoogleWorkspaceCalendarService().listClientEvents(actor, clientId),
      getGoogleGmailService().listClientEmails(actor, clientId),
    ])
    return {
      folder,
      documents,
      events,
      emails,
    }
  }
}

let singleton: GoogleWorkspaceService | null = null

export function getGoogleWorkspaceService(): GoogleWorkspaceService {
  if (!singleton) singleton = new GoogleWorkspaceService()
  return singleton
}
