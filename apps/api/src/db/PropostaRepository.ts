/**
 * PropostaRepositoryPg — dual-write best-effort para Postgres.
 *
 * Mesmo padrão de ClienteRepository.ts e DossieRepository.ts: o Map em
 * runtime continua sendo source of truth; cada `propostas.set(id, p)`
 * é espelhado como UPSERT no PG via `upsertProposta()`.
 *
 * Cobre tanto `Proposta` (legacy, /api/propostas) quanto
 * `PropostaInteligente` (15 seções, /api/propostas/inteligentes/*).
 */
import { eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { proposta as propostaTable } from './schema.js'

interface PropostaLike {
  id: string
  clienteId?: string
  clienteNome?: string
  titulo?: string
  tipo?: string
  status?: string
  valorProposta?: number
  valorDivida?: number
  pdfUrl?: string | null
  dataCriacao?: string
  ultimaAtualizacao?: string
  [key: string]: unknown
}

export async function upsertProposta(p: PropostaLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const valor = p.valorProposta ?? (p as { valor?: number }).valor ?? null
    const row = {
      id: p.id,
      clienteId: p.clienteId ?? null,
      tipo: p.tipo ?? null,
      status: p.status ?? null,
      valorProposto: valor != null ? String(valor) : null,
      titulo: p.titulo ?? null,
      payload: p as unknown as Record<string, unknown>,
      pdfPath: p.pdfUrl ?? null,
      atualizadoEm: new Date(),
    }
    await db.insert(propostaTable).values(row).onConflictDoUpdate({
      target: propostaTable.id,
      set: {
        clienteId: row.clienteId,
        tipo: row.tipo,
        status: row.status,
        valorProposto: row.valorProposto,
        titulo: row.titulo,
        payload: row.payload,
        pdfPath: row.pdfPath,
        atualizadoEm: row.atualizadoEm,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[PropostaPgRepo.upsert] best-effort fail:', (err as Error).message)
  }
}

export async function listPropostas(): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const rows = await db.select().from(propostaTable).orderBy(propostaTable.id)
    return rows.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>
      return { ...payload, id: r.id }
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[PropostaPgRepo.list] fail:', (err as Error).message)
    return []
  }
}

export async function deleteProposta(id: string): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    await db.delete(propostaTable).where(eq(propostaTable.id, id))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[PropostaPgRepo.delete] fail:', (err as Error).message)
  }
}
