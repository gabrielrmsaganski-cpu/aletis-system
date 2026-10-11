/**
 * PortalRepository — persistência PG das tabelas do Portal do Cliente.
 *
 * Estratégia dual-write:
 *  - PortalTokenService e PortalStore continuam usando Map<> em memória
 *    como source-of-truth em runtime.
 *  - A cada mutação em memória, este repository escreve no PG via
 *    fire-and-forget. Falhas de PG são logadas com console.warn mas
 *    não bloqueiam a operação.
 *  - No boot, hydrateAll() popula os Maps a partir do PG, restaurando
 *    magic-links válidos, pendências, uploads e eventos.
 *
 * Toda função é no-op silenciosa quando ALETIS_PG_ENABLED != 1, evitando
 * dependência rígida de PG em dev.
 */
import { eq, and } from 'drizzle-orm'
import { getDb } from './client.js'
import {
  portalToken,
  portalDocumentoPendente,
  portalUpload,
  portalEvento,
} from './schema.js'

const ENABLED = () => process.env.ALETIS_PG_ENABLED === '1'

/* ────────────────────────────────────────────────────────────
 * portal_token
 * ──────────────────────────────────────────────────────────── */

export interface TokenRow {
  id: string
  clienteId: string
  tipo: 'magic' | 'reset' | 'refresh'
  tokenHash: string
  expiraEm: Date
  consumidoEm?: Date
  criadoEm: Date
  canal?: 'email' | 'whatsapp' | 'sms' | null
  metadata?: Record<string, unknown> | null
}

export async function dbInsertToken(row: TokenRow): Promise<void> {
  if (!ENABLED()) return
  try {
    const db = getDb()
    await db.insert(portalToken).values({
      id: row.id,
      clienteId: row.clienteId,
      tipo: row.tipo,
      tokenHash: row.tokenHash,
      expiraEm: row.expiraEm,
      consumidoEm: row.consumidoEm,
      canal: row.canal ?? null,
      metadata: row.metadata as any,
      criadoEm: row.criadoEm,
    }).onConflictDoNothing()
  } catch (err) {
    console.warn('[PortalRepo.dbInsertToken]', (err as Error).message)
  }
}

export async function dbConsumeToken(id: string): Promise<void> {
  if (!ENABLED()) return
  try {
    const db = getDb()
    await db.update(portalToken)
      .set({ consumidoEm: new Date() })
      .where(eq(portalToken.id, id))
  } catch (err) {
    console.warn('[PortalRepo.dbConsumeToken]', (err as Error).message)
  }
}

export async function dbRevokeTokensByCliente(clienteId: string, tipo: string): Promise<void> {
  if (!ENABLED()) return
  try {
    const db = getDb()
    await db.update(portalToken)
      .set({ consumidoEm: new Date() })
      .where(and(eq(portalToken.clienteId, clienteId), eq(portalToken.tipo, tipo)))
  } catch (err) {
    console.warn('[PortalRepo.dbRevokeTokensByCliente]', (err as Error).message)
  }
}

export async function dbLoadActiveTokens(): Promise<TokenRow[]> {
  if (!ENABLED()) return []
  try {
    const db = getDb()
    const rows = await db.select().from(portalToken)
    const now = Date.now()
    return rows
      .filter((r) => !r.consumidoEm && r.expiraEm.getTime() > now)
      .map((r) => ({
        id: r.id,
        clienteId: r.clienteId,
        tipo: r.tipo as 'magic' | 'reset' | 'refresh',
        tokenHash: r.tokenHash,
        expiraEm: r.expiraEm,
        consumidoEm: r.consumidoEm ?? undefined,
        criadoEm: r.criadoEm,
        canal: (r.canal as 'email' | 'whatsapp' | 'sms' | null) ?? null,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      }))
  } catch (err) {
    console.warn('[PortalRepo.dbLoadActiveTokens]', (err as Error).message)
    return []
  }
}

/* ────────────────────────────────────────────────────────────
 * portal_documento_pendente
 * ──────────────────────────────────────────────────────────── */

export interface PendenciaRow {
  id: string
  clienteId: string
  titulo: string
  descricao?: string | null
  categoria?: string | null
  obrigatorio: boolean
  status: 'pendente' | 'enviado' | 'aprovado' | 'rejeitado' | 'cancelado'
  uploadId?: string | null
  solicitadoPor?: string | null
  solicitadoEm: Date
  enviadoEm?: Date | null
  revisadoEm?: Date | null
  observacao?: string | null
  prioridade?: 'normal' | 'alta' | 'urgente'
  prazo?: string | null
  tipoDocumento?: string | null
  updatedAt?: Date
  metadata?: Record<string, unknown> | null
}

export async function dbUpsertPendencia(row: PendenciaRow): Promise<void> {
  if (!ENABLED()) return
  try {
    const db = getDb()
    await db.insert(portalDocumentoPendente).values({
      id: row.id,
      clienteId: row.clienteId,
      titulo: row.titulo,
      descricao: row.descricao ?? null,
      categoria: row.categoria ?? null,
      obrigatorio: row.obrigatorio,
      status: row.status,
      uploadId: row.uploadId ?? null,
      solicitadoPor: row.solicitadoPor ?? null,
      solicitadoEm: row.solicitadoEm,
      enviadoEm: row.enviadoEm ?? null,
      revisadoEm: row.revisadoEm ?? null,
      observacao: row.observacao ?? null,
    }).onConflictDoUpdate({
      target: portalDocumentoPendente.id,
      set: {
        status: row.status,
        uploadId: row.uploadId ?? null,
        enviadoEm: row.enviadoEm ?? null,
        revisadoEm: row.revisadoEm ?? null,
        observacao: row.observacao ?? null,
      },
    })
  } catch (err) {
    console.warn('[PortalRepo.dbUpsertPendencia]', (err as Error).message)
  }
}

export async function dbDeletePendencia(id: string): Promise<void> {
  if (!ENABLED()) return
  try {
    const db = getDb()
    await db.delete(portalDocumentoPendente).where(eq(portalDocumentoPendente.id, id))
  } catch (err) {
    console.warn('[PortalRepo.dbDeletePendencia]', (err as Error).message)
  }
}

export async function dbLoadAllPendencias(): Promise<PendenciaRow[]> {
  if (!ENABLED()) return []
  try {
    const db = getDb()
    const rows = await db.select().from(portalDocumentoPendente)
    return rows.map((r) => ({
      id: r.id,
      clienteId: r.clienteId,
      titulo: r.titulo,
      descricao: r.descricao,
      categoria: r.categoria,
      obrigatorio: r.obrigatorio,
      status: r.status as PendenciaRow['status'],
      uploadId: r.uploadId,
      solicitadoPor: r.solicitadoPor,
      solicitadoEm: r.solicitadoEm,
      enviadoEm: r.enviadoEm,
      revisadoEm: r.revisadoEm,
      observacao: r.observacao,
      prioridade: r.prioridade as PendenciaRow['prioridade'],
      prazo: r.prazo,
      tipoDocumento: r.tipoDocumento,
      updatedAt: r.updatedAt,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    }))
  } catch (err) {
    console.warn('[PortalRepo.dbLoadAllPendencias]', (err as Error).message)
    return []
  }
}

/* ────────────────────────────────────────────────────────────
 * portal_upload
 * ──────────────────────────────────────────────────────────── */

export interface UploadRow {
  id: string
  clienteId: string
  pendenciaId?: string | null
  nomeOriginal: string
  nomeStorage: string
  mime: string
  tamanho: number
  sha256?: string | null
  categoria?: string | null
  enviadoPor: 'cliente' | 'consultor'
  enviadoEm: Date
  metadata?: Record<string, unknown> | null
}

export async function dbInsertUpload(row: UploadRow): Promise<void> {
  if (!ENABLED()) return
  try {
    const db = getDb()
    await db.insert(portalUpload).values({
      id: row.id,
      clienteId: row.clienteId,
      pendenciaId: row.pendenciaId ?? null,
      nomeOriginal: row.nomeOriginal,
      nomeStorage: row.nomeStorage,
      mime: row.mime,
      tamanho: row.tamanho,
      sha256: row.sha256 ?? null,
      categoria: row.categoria ?? null,
      enviadoPor: row.enviadoPor,
      enviadoEm: row.enviadoEm,
      metadata: row.metadata as any,
    }).onConflictDoNothing()
  } catch (err) {
    console.warn('[PortalRepo.dbInsertUpload]', (err as Error).message)
  }
}

export async function dbLoadAllUploads(): Promise<UploadRow[]> {
  if (!ENABLED()) return []
  try {
    const db = getDb()
    const rows = await db.select().from(portalUpload)
    return rows.map((r) => ({
      id: r.id,
      clienteId: r.clienteId,
      pendenciaId: r.pendenciaId,
      nomeOriginal: r.nomeOriginal,
      nomeStorage: r.nomeStorage,
      mime: r.mime,
      tamanho: r.tamanho,
      sha256: r.sha256,
      categoria: r.categoria,
      enviadoPor: r.enviadoPor as 'cliente' | 'consultor',
      enviadoEm: r.enviadoEm,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    }))
  } catch (err) {
    console.warn('[PortalRepo.dbLoadAllUploads]', (err as Error).message)
    return []
  }
}

/* ────────────────────────────────────────────────────────────
 * portal_evento (auditoria — append-only)
 * ──────────────────────────────────────────────────────────── */

export async function dbInsertEvento(e: {
  clienteId: string
  tipo: string
  canal?: string | null
  ip?: string | null
  userAgent?: string | null
  detalhes?: Record<string, unknown> | null
  criadoEm: Date
}): Promise<void> {
  if (!ENABLED()) return
  try {
    const db = getDb()
    await db.insert(portalEvento).values({
      clienteId: e.clienteId,
      tipo: e.tipo,
      canal: e.canal ?? null,
      ip: e.ip ?? null,
      userAgent: e.userAgent ?? null,
      detalhes: e.detalhes as any,
      criadoEm: e.criadoEm,
    })
  } catch (err) {
    console.warn('[PortalRepo.dbInsertEvento]', (err as Error).message)
  }
}
