export const GOOGLE_SCOPES = {
  profile: 'openid',
  email: 'https://www.googleapis.com/auth/userinfo.email',
  drive: 'https://www.googleapis.com/auth/drive',
  driveFile: 'https://www.googleapis.com/auth/drive.file',
  docs: 'https://www.googleapis.com/auth/documents',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  gmailSend: 'https://www.googleapis.com/auth/gmail.send',
} as const

export const DEFAULT_GOOGLE_SCOPES = [
  GOOGLE_SCOPES.profile,
  GOOGLE_SCOPES.email,
  GOOGLE_SCOPES.driveFile,
]

export const DRIVE_SUBFOLDERS = [
  'Documentos',
  'Propostas',
  'Contratos',
  'Relatórios',
  'Anexos',
  'Comprovantes',
] as const

export type GoogleIntegrationStatus = 'unconfigured' | 'disconnected' | 'connected' | 'expired' | 'revoked' | 'error'

export interface GoogleWorkspaceActor {
  userId: string
  userName: string
  role: string
  tenantId: string
}

export interface GoogleWorkspaceConnectionPublic {
  id?: string
  status: GoogleIntegrationStatus
  enabled: boolean
  configured: boolean
  oauthConfigured?: boolean
  googleEmail?: string | null
  googleAccountId?: string | null
  connectionMode?: 'oauth' | 'gcloud_drive' | 'corporate_oauth' | 'unconfigured'
  scopes: string[]
  connectedAt?: string | null
  updatedAt?: string | null
  tokenExpiry?: string | null
  revokedAt?: string | null
  missingEnv: string[]
  features: {
    drive: string
    docs: string
    calendar: string
    gmail: string
  }
}

export interface GoogleTokens {
  accessToken: string
  refreshToken?: string
  tokenExpiry?: Date | null
  scopes: string[]
}

export interface GoogleApiErrorBody {
  error?: string | { message?: string; status?: string }
  error_description?: string
}

export function hasScope(scopes: string[] | null | undefined, scope: string): boolean {
  return Boolean(scopes?.includes(scope))
}

export function googleFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`
}

export function googleFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`
}

export function googleDocUrl(fileId: string): string {
  return `https://docs.google.com/document/d/${encodeURIComponent(fileId)}/edit`
}
