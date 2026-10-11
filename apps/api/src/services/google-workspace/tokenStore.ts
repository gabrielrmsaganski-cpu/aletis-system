import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { PoolClient } from 'pg'
import { getDb, getPool, isPgEnabled } from '../../db/client.js'
import {
  googleWorkspaceConnection,
  type GoogleWorkspaceConnection,
} from '../../db/schema.js'
import type { GoogleTokens, GoogleWorkspaceActor, GoogleWorkspaceConnectionPublic } from './schemas.js'
import { GOOGLE_SCOPES, hasScope } from './schemas.js'
import { GoogleConnectionError } from './connectionErrors.js'

export interface CorporateConnectionTokens {
  row: GoogleWorkspaceConnection
  tokens: GoogleTokens
}

const CORPORATE_COLUMNS = `id,user_id AS "userId",tenant_id AS "tenantId",google_email AS "googleEmail",google_account_id AS "googleAccountId",
  access_token_encrypted AS "accessTokenEncrypted",refresh_token_encrypted AS "refreshTokenEncrypted",token_expiry AS "tokenExpiry",
  scopes,status,created_at AS "createdAt",updated_at AS "updatedAt",revoked_at AS "revokedAt",metadata`

function corporateTokens(row: GoogleWorkspaceConnection): CorporateConnectionTokens {
  try {
    return { row, tokens: { accessToken: decryptToken(row.accessTokenEncrypted) || '', refreshToken: decryptToken(row.refreshTokenEncrypted) || undefined,
      tokenExpiry: row.tokenExpiry ? new Date(row.tokenExpiry) : null, scopes: row.scopes || [] } }
  } catch { throw new GoogleConnectionError('SERVER_CONFIGURATION', 'A chave de criptografia não permite ler a conexão corporativa persistida.') }
}

function corporateFailure(error: unknown): never {
  if (error instanceof GoogleConnectionError) throw error
  throw new GoogleConnectionError('TEMPORARILY_UNAVAILABLE', 'Não foi possível consultar ou persistir a conexão corporativa no PostgreSQL. A autorização anterior foi preservada.')
}

const memoryConnections = new Map<string, GoogleWorkspaceConnection>()
const JsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]))
const CorporateMetadataSchema = z.object({
  connectedVia: z.literal('oauth2'),
  corporateDriveSelected: z.literal(true),
  corporateDriveSelectedAt: z.string().datetime(),
  corporateDriveSelectedBy: z.string().min(1),
  oauthClientIdFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).catchall(JsonValueSchema)

function memoryKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`
}

function encryptionSecret(): string | null {
  return process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY || null
}

function encryptionKey(): Buffer {
  const secret = encryptionSecret()
  if (!secret) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY não configurada.')
  }
  return createHash('sha256').update(secret).digest()
}

export function isEncryptionConfigured(): boolean {
  return Boolean(encryptionSecret())
}

export function encryptToken(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

export function decryptToken(value?: string | null): string | null {
  if (!value) return null
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(':')
  if (version !== 'v1' || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error('Formato de token criptografado inválido.')
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function safeSecretEquals(a: string, b: string): boolean {
  const aa = Buffer.from(a)
  const bb = Buffer.from(b)
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}

function iso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function toPublic(row: GoogleWorkspaceConnection | null | undefined, missingEnv: string[]): GoogleWorkspaceConnectionPublic {
  const configured = missingEnv.length === 0
  if (!row) {
    return {
      status: configured ? 'disconnected' : 'unconfigured',
      enabled: process.env.GOOGLE_WORKSPACE_ENABLED === 'true',
      configured,
      scopes: [],
      missingEnv,
      features: {
        drive: 'Pendente',
        docs: 'Pendente',
        calendar: 'Pendente',
        gmail: 'Pendente',
      },
    }
  }
  const scopes = row.scopes || []
  return {
    id: row.id,
    status: row.status as GoogleWorkspaceConnectionPublic['status'],
    enabled: process.env.GOOGLE_WORKSPACE_ENABLED === 'true',
    configured,
    googleEmail: row.googleEmail,
    googleAccountId: row.googleAccountId,
    scopes,
    connectedAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    tokenExpiry: iso(row.tokenExpiry),
    revokedAt: iso(row.revokedAt),
    missingEnv,
    features: {
      drive: hasScope(scopes, GOOGLE_SCOPES.driveFile) ? 'Conectado' : 'Sem permissão',
      docs: hasScope(scopes, GOOGLE_SCOPES.docs) ? 'Conectado' : 'Sem permissão',
      calendar: hasScope(scopes, GOOGLE_SCOPES.calendarEvents) ? 'Conectado' : 'Sem permissão',
      gmail: hasScope(scopes, GOOGLE_SCOPES.gmailSend) ? 'Conectado' : 'Sem permissão',
    },
  }
}

export class GoogleTokenStore {
  private corporatePool() {
    if (!isPgEnabled()) throw new GoogleConnectionError('SERVER_CONFIGURATION', 'A autorização corporativa durável exige PostgreSQL habilitado.')
    return getPool()
  }

  /** Ausência de seleção e falha de persistência não podem ser confundidas. */
  async corporatePreflight(tenantId: string): Promise<CorporateConnectionTokens | null> {
    try {
      const result = await this.corporatePool().query(`SELECT ${CORPORATE_COLUMNS} FROM google_workspace_connection
        WHERE tenant_id=$1 AND metadata->'corporateDriveSelected'='true'::jsonb LIMIT 2`, [tenantId])
      if (result.rows.length > 1) throw new GoogleConnectionError('SERVER_CONFIGURATION', 'Há mais de uma conexão corporativa selecionada neste contexto.')
      return result.rows[0] ? corporateTokens(result.rows[0]) : null
    } catch (error) { return corporateFailure(error) }
  }

  /** O bloqueio por tenant serializa renovações entre API e trabalhadores e
   * impede que uma renovação antiga sobrescreva uma seleção mais recente. */
  async withCorporateConnection<T>(tenantId: string, use: (connection: CorporateConnectionTokens) => Promise<{ value: T; tokens?: GoogleTokens }>): Promise<T | null> {
    let client: PoolClient | undefined
    try {
      client = await this.corporatePool().connect()
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout='15s'")
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['corporate-drive:' + tenantId])
      const selected = await client.query(`SELECT ${CORPORATE_COLUMNS} FROM google_workspace_connection
        WHERE tenant_id=$1 AND metadata->'corporateDriveSelected'='true'::jsonb LIMIT 2 FOR UPDATE`, [tenantId])
      if (selected.rows.length > 1) throw new GoogleConnectionError('SERVER_CONFIGURATION', 'Há mais de uma conexão corporativa selecionada neste contexto.')
      if (!selected.rows.length) { await client.query('COMMIT'); return null }
      const connection = corporateTokens(selected.rows[0])
      const result = await use(connection)
      let committedRow = connection.row
      if (result.tokens) {
        const tokens = result.tokens
        const updated = await client.query(`UPDATE google_workspace_connection SET access_token_encrypted=$1,refresh_token_encrypted=$2,token_expiry=$3,scopes=$4,updated_at=now()
          WHERE id=$5 AND tenant_id=$6 AND status='connected' AND revoked_at IS NULL AND metadata->'corporateDriveSelected'='true'::jsonb RETURNING ${CORPORATE_COLUMNS}`,
          [encryptToken(tokens.accessToken), tokens.refreshToken ? encryptToken(tokens.refreshToken) : connection.row.refreshTokenEncrypted,
            tokens.tokenExpiry, tokens.scopes, connection.row.id, tenantId])
        if (updated.rowCount !== 1) throw new GoogleConnectionError('AUTH_REQUIRED', 'A seleção corporativa mudou durante a renovação. Nenhuma credencial foi substituída.')
        committedRow = updated.rows[0]
      }
      await client.query('COMMIT')
      memoryConnections.set(memoryKey(committedRow.tenantId, committedRow.userId), committedRow)
      return result.value
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => undefined)
      return corporateFailure(error)
    } finally { client?.release() }
  }

  /** O consentimento corporativo explícito seleciona uma conexão persistida.
   * A seleção anterior muda na mesma transação, sem janela de dupla seleção. */
  async saveCorporateConnected(input: {
    actor: GoogleWorkspaceActor; googleEmail?: string | null; googleAccountId?: string | null;
    accessToken: string; refreshToken?: string | null; tokenExpiry?: Date | null; scopes: string[]; metadata?: Record<string, unknown>;
  }): Promise<GoogleWorkspaceConnection> {
    const expected = process.env.GOOGLE_DRIVE_GCLOUD_ACCOUNT?.trim().toLowerCase()
    const tenant = process.env.ALETIS_TENANT_ID || 'default'
    if (this.missingEnv().length) throw new GoogleConnectionError('SERVER_CONFIGURATION', 'Complete a configuração OAuth do aplicativo antes de selecionar a conexão corporativa.')
    if (!expected || input.googleEmail?.trim().toLowerCase() !== expected || input.actor.tenantId !== tenant || !input.actor.userId) throw new GoogleConnectionError('ACCOUNT_MISMATCH', 'A conta ou o contexto do consentimento não corresponde à conexão corporativa.')
    if (!input.accessToken || !input.refreshToken || !input.googleAccountId) throw new GoogleConnectionError('AUTH_REQUIRED', 'O Google não forneceu autorização offline e identidade completas para a conexão corporativa.')
    if (!input.scopes.includes(GOOGLE_SCOPES.drive) || input.scopes.some(scope => ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/accounts.reauth'].includes(scope))) throw new GoogleConnectionError('PERMISSION_DENIED', 'O consentimento corporativo deve permitir o Drive completo sem escopos de sessão do Google Cloud.')
    let client: PoolClient | undefined
    try {
      client = await this.corporatePool().connect()
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout='15s'")
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['corporate-drive:' + tenant])
      const prior = await client.query(`SELECT ${CORPORATE_COLUMNS} FROM google_workspace_connection WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE`, [tenant, input.actor.userId])
      const existing = prior.rows[0] as GoogleWorkspaceConnection | undefined
      const id = existing?.id || `gwc_${randomUUID()}`
      const metadata = CorporateMetadataSchema.parse({ ...(existing?.metadata as Record<string, unknown> || {}), ...(input.metadata || {}), connectedVia: 'oauth2',
        corporateDriveSelected: true, corporateDriveSelectedAt: new Date().toISOString(), corporateDriveSelectedBy: input.actor.userId,
        oauthClientIdFingerprint: createHash('sha256').update(process.env.GOOGLE_CLIENT_ID!).digest('hex') })
      const deselected = await client.query(`UPDATE google_workspace_connection SET metadata=metadata-'corporateDriveSelected'-'corporateDriveSelectedAt',updated_at=now()
        WHERE tenant_id=$1 AND id<>$2 AND metadata->'corporateDriveSelected'='true'::jsonb RETURNING ${CORPORATE_COLUMNS}`, [tenant, id])
      const saved = await client.query(`INSERT INTO google_workspace_connection
        (id,user_id,tenant_id,google_email,google_account_id,access_token_encrypted,refresh_token_encrypted,token_expiry,scopes,status,revoked_at,metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'connected',NULL,$10::jsonb)
        ON CONFLICT(tenant_id,user_id) DO UPDATE SET google_email=EXCLUDED.google_email,google_account_id=EXCLUDED.google_account_id,
          access_token_encrypted=EXCLUDED.access_token_encrypted,refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,token_expiry=EXCLUDED.token_expiry,
          scopes=EXCLUDED.scopes,status='connected',revoked_at=NULL,metadata=EXCLUDED.metadata,updated_at=now()
        RETURNING ${CORPORATE_COLUMNS}`, [id, input.actor.userId, tenant, input.googleEmail, input.googleAccountId,
        encryptToken(input.accessToken), encryptToken(input.refreshToken), input.tokenExpiry || null, input.scopes, JSON.stringify(metadata)])
      if (saved.rowCount !== 1) throw new Error('A conexão corporativa não foi persistida')
      await client.query('COMMIT')
      for (const changed of [...deselected.rows, saved.rows[0]]) memoryConnections.set(memoryKey(changed.tenantId, changed.userId), changed)
      return saved.rows[0]
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => undefined)
      return corporateFailure(error)
    } finally { client?.release() }
  }

  missingEnv(): string[] {
    const missing: string[] = []
    if (process.env.GOOGLE_WORKSPACE_ENABLED !== 'true') missing.push('GOOGLE_WORKSPACE_ENABLED=true')
    if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID')
    if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET')
    if (!isEncryptionConfigured()) missing.push('GOOGLE_TOKEN_ENCRYPTION_KEY')
    return missing
  }

  async get(actor: GoogleWorkspaceActor): Promise<GoogleWorkspaceConnection | null> {
    if (isPgEnabled()) {
      try {
        const rows = await getDb()
          .select()
          .from(googleWorkspaceConnection)
          .where(and(eq(googleWorkspaceConnection.tenantId, actor.tenantId), eq(googleWorkspaceConnection.userId, actor.userId)))
          .orderBy(desc(googleWorkspaceConnection.updatedAt))
          .limit(1)
        return rows[0] || null
      } catch {
        // fallback em memória
      }
    }
    return memoryConnections.get(memoryKey(actor.tenantId, actor.userId)) || null
  }

  async publicStatus(actor: GoogleWorkspaceActor): Promise<GoogleWorkspaceConnectionPublic> {
    return toPublic(await this.get(actor), this.missingEnv())
  }

  async saveConnected(input: {
    actor: GoogleWorkspaceActor
    googleEmail?: string | null
    googleAccountId?: string | null
    accessToken: string
    refreshToken?: string | null
    tokenExpiry?: Date | null
    scopes: string[]
    metadata?: Record<string, unknown>
  }): Promise<GoogleWorkspaceConnection> {
    const now = new Date()
    const existing = await this.get(input.actor)
    if ((existing?.metadata as Record<string, unknown> | undefined)?.corporateDriveSelected === true || input.metadata?.corporateDriveSelected === true) {
      throw new GoogleConnectionError('SERVER_CONFIGURATION', 'Use o fluxo corporativo explícito para substituir a conexão selecionada. A autorização existente foi preservada.')
    }
    const row = {
      id: existing?.id || `gwc_${randomUUID()}`,
      userId: input.actor.userId,
      tenantId: input.actor.tenantId,
      googleEmail: input.googleEmail || existing?.googleEmail || null,
      googleAccountId: input.googleAccountId || existing?.googleAccountId || null,
      accessTokenEncrypted: encryptToken(input.accessToken),
      refreshTokenEncrypted: input.refreshToken ? encryptToken(input.refreshToken) : existing?.refreshTokenEncrypted || null,
      tokenExpiry: input.tokenExpiry || null,
      scopes: input.scopes,
      status: 'connected',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      revokedAt: null,
      metadata: {
        ...(existing?.metadata as Record<string, unknown> | undefined),
        ...(input.metadata || {}),
      },
    }

    if (isPgEnabled()) {
      try {
        const [saved] = await getDb()
          .insert(googleWorkspaceConnection)
          .values(row as any)
          .onConflictDoUpdate({
            target: [googleWorkspaceConnection.tenantId, googleWorkspaceConnection.userId],
            setWhere: sql`COALESCE(${googleWorkspaceConnection.metadata}->'corporateDriveSelected', 'false'::jsonb) <> 'true'::jsonb`,
            set: {
              googleEmail: row.googleEmail,
              googleAccountId: row.googleAccountId,
              accessTokenEncrypted: row.accessTokenEncrypted,
              refreshTokenEncrypted: row.refreshTokenEncrypted,
              tokenExpiry: row.tokenExpiry,
              scopes: row.scopes,
              status: 'connected',
              updatedAt: now,
              revokedAt: null,
              metadata: row.metadata,
            } as any,
          })
          .returning()
        if (!saved) throw new GoogleConnectionError('AUTH_REQUIRED', 'Uma seleção corporativa foi confirmada durante este consentimento. A conexão selecionada foi preservada.')
        memoryConnections.set(memoryKey(input.actor.tenantId, input.actor.userId), saved)
        return saved
      } catch (error) {
        // Com PG habilitado, uma gravação não confirmada não vira conexão em memória.
        return corporateFailure(error)
      }
    }

    memoryConnections.set(memoryKey(input.actor.tenantId, input.actor.userId), row as GoogleWorkspaceConnection)
    return row as GoogleWorkspaceConnection
  }

  async saveTokens(actor: GoogleWorkspaceActor, tokens: GoogleTokens): Promise<GoogleWorkspaceConnection | null> {
    const current = await this.get(actor)
    if (!current) return null
    return this.saveConnected({
      actor,
      googleEmail: current.googleEmail,
      googleAccountId: current.googleAccountId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || decryptToken(current.refreshTokenEncrypted || null),
      tokenExpiry: tokens.tokenExpiry || current.tokenExpiry,
      scopes: tokens.scopes.length ? tokens.scopes : current.scopes || [],
      metadata: current.metadata as Record<string, unknown>,
    })
  }

  async getDecryptedTokens(actor: GoogleWorkspaceActor): Promise<GoogleTokens | null> {
    const row = await this.get(actor)
    if (!row || row.status !== 'connected') return null
    const accessToken = decryptToken(row.accessTokenEncrypted)
    if (!accessToken) return null
    return {
      accessToken,
      refreshToken: decryptToken(row.refreshTokenEncrypted) || undefined,
      tokenExpiry: row.tokenExpiry || null,
      scopes: row.scopes || [],
    }
  }

  async disconnect(actor: GoogleWorkspaceActor): Promise<GoogleWorkspaceConnection | null> {
    const row = await this.get(actor)
    if (!row) return null
    const now = new Date()
    const patch = { status: 'revoked', revokedAt: now, updatedAt: now }
    if (isPgEnabled()) {
      try {
        const [updated] = await getDb()
          .update(googleWorkspaceConnection)
          .set(patch)
          .where(and(eq(googleWorkspaceConnection.tenantId, actor.tenantId), eq(googleWorkspaceConnection.userId, actor.userId)))
          .returning()
        return updated || null
      } catch {
        // fallback
      }
    }
    const next = { ...row, ...patch } as GoogleWorkspaceConnection
    memoryConnections.set(memoryKey(actor.tenantId, actor.userId), next)
    return next
  }
}

let singleton: GoogleTokenStore | null = null

export function getGoogleTokenStore(): GoogleTokenStore {
  if (!singleton) singleton = new GoogleTokenStore()
  return singleton
}
