/**
 * DossieRepositoryPg — dual-write best-effort para Postgres.
 *
 * O repositório de DISCO (`apps/api/src/services/cliente/DossieRepository.ts`)
 * continua sendo a fonte de verdade em runtime (zero risco para callers
 * existentes). Este módulo só espelha cada `save()` em INSERT no PG (PK
 * é (clienteId, versao), então cada versão histórica vira uma linha nova).
 *
 * Padrão idêntico ao ClienteRepository.
 */
import { eq, and, desc } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { dossie as dossieTable } from './schema.js'

interface DossieLike {
  clienteId: string
  versao: number
  dataBase?: string
  [key: string]: unknown
}

/**
 * Insere/atualiza uma versão de dossie no PG. Best-effort.
 * PK = (clienteId, versao). Se a mesma versão for re-salva (raro),
 * `onConflictDoUpdate` mantém o payload mais recente.
 */
export async function upsertDossie(d: DossieLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const row = {
      clienteId: d.clienteId,
      versao: d.versao,
      dataBase: d.dataBase ?? new Date().toISOString().slice(0, 10),
      payload: d as unknown as Record<string, unknown>,
    }
    await db.insert(dossieTable).values(row).onConflictDoUpdate({
      target: [dossieTable.clienteId, dossieTable.versao],
      set: { payload: row.payload, dataBase: row.dataBase },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[DossiePgRepo.upsert] best-effort fail:', (err as Error).message)
  }
}

/**
 * Retorna a versão MAIS RECENTE do dossie de um cliente do PG.
 * Útil para hidratação no boot (recuperar trabalho perdido em
 * disco corrompido). Retorna null se PG off ou cliente sem dossie.
 */
export async function getLatestDossie(clienteId: string): Promise<DossieLike | null> {
  if (!isPgEnabled()) return null
  try {
    const db = getDb()
    const rows = await db
      .select()
      .from(dossieTable)
      .where(eq(dossieTable.clienteId, clienteId))
      .orderBy(desc(dossieTable.versao))
      .limit(1)
    if (rows.length === 0) return null
    return rows[0].payload as DossieLike
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[DossiePgRepo.getLatest] fail:', (err as Error).message)
    return null
  }
}

/** Remove TODAS as versões do dossie de um cliente (usado por DELETE explícito). */
export async function deleteDossie(clienteId: string): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    await db.delete(dossieTable).where(eq(dossieTable.clienteId, clienteId))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[DossiePgRepo.delete] fail:', (err as Error).message)
  }
}

/** Lista clienteIds que têm dossie persistido no PG. */
export async function listClienteIdsComDossie(): Promise<string[]> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const rows = await db
      .selectDistinct({ id: dossieTable.clienteId })
      .from(dossieTable)
    return rows.map((r) => r.id)
  } catch {
    return []
  }
}

/** Verifica se a versão específica existe no PG (idempotência). */
export async function dossieExists(clienteId: string, versao: number): Promise<boolean> {
  if (!isPgEnabled()) return false
  try {
    const db = getDb()
    const rows = await db
      .select({ versao: dossieTable.versao })
      .from(dossieTable)
      .where(and(eq(dossieTable.clienteId, clienteId), eq(dossieTable.versao, versao)))
      .limit(1)
    return rows.length > 0
  } catch {
    return false
  }
}
