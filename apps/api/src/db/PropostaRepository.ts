/**
 * PropostaRepositoryPg — gravação estrita e wrapper legado best-effort.
 *
 * O PATCH confirma `upsertPropostaStrict()` antes de publicar no cache.
 * Callers legados mantêm o wrapper `upsertProposta()` que absorve falhas.
 *
 * Cobre tanto `Proposta` (legacy, /api/propostas) quanto
 * `PropostaInteligente` (15 seções, /api/propostas/inteligentes/*).
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, isPgEnabled } from './client.js'
import { proposta as propostaTable } from './schema.js'

interface PropostaLike {
  id: string
  clienteId?: string
  demandaId?: string
  clienteNome?: string
  titulo?: string
  tipo?: string
  status?: string
  valorProposta?: number | string | null
  valorDivida?: number | string | null
  pdfUrl?: string | null
  dataCriacao?: string
  ultimaAtualizacao?: string
}

export async function upsertPropostaStrict(p: PropostaLike): Promise<void> {
  z.object({ id: z.string().min(1) }).passthrough().parse(p)
  if (!isPgEnabled()) return
  const db = getDb()
  const valor = p.valorProposta ?? (p as { valor?: number }).valor ?? null
  const row = {
    id: p.id,
    clienteId: p.clienteId ?? null,
    demandaId: p.demandaId ?? null,
    tipo: p.tipo ?? null,
    status: p.status ?? null,
    valorProposto: valor != null ? String(valor) : null,
    titulo: p.titulo ?? null,
    payload: p as unknown as Record<string, unknown>,
    pdfPath: p.pdfUrl ?? null,
    atualizadoEm: new Date(),
  }
  const saved = await db.insert(propostaTable).values(row).onConflictDoUpdate({
    target: propostaTable.id,
    set: {
      clienteId: row.clienteId,
      demandaId: row.demandaId,
      tipo: row.tipo,
      status: row.status,
      valorProposto: row.valorProposto,
      titulo: row.titulo,
      payload: row.payload,
      pdfPath: row.pdfPath,
      atualizadoEm: row.atualizadoEm,
    },
    // Propostas já coordenadas transacionalmente não aceitam snapshots legados.
    setWhere: eq(propostaTable.revision, 0),
  }).returning({ id: propostaTable.id })
  if (!saved.length) {
    throw Object.assign(new Error('A proposta possui revisão persistida. Atualize pelo fluxo transacional.'), {
      statusCode: 409, code: 'PROPOSAL_WORKFLOW_REQUIRED',
    })
  }
}

export async function upsertProposta(p: PropostaLike): Promise<void> {
  try {
    await upsertPropostaStrict(p)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[PropostaPgRepo.upsert] best-effort fail:', (err as Error).message)
  }
}

export async function listPropostas(): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
  const db = getDb()
  const rows = await db.select().from(propostaTable).orderBy(propostaTable.id)
  return rows.map((r) => {
    const payload = (r.payload ?? {}) as Record<string, unknown>
    return { ...payload, id: r.id, revision: r.revision,
      ...(r.clienteId !== null ? { clienteId: r.clienteId } : {}),
      ...(r.demandaId !== null ? { demandaId: r.demandaId } : {}),
      ...(r.status !== null ? { status: r.status } : {}),
    }
  })
}

/** Leitura estrita para detalhe/PDF e recuperação de conflitos entre instâncias. */
export async function getProposta(id: string): Promise<Record<string, unknown> | null> {
  if (!isPgEnabled()) return null
  const [row] = await getDb().select().from(propostaTable).where(eq(propostaTable.id, id)).limit(1)
  if (!row) return null
  return { ...((row.payload ?? {}) as Record<string, unknown>), id: row.id, revision: row.revision,
    ...(row.clienteId !== null ? { clienteId: row.clienteId } : {}),
    ...(row.demandaId !== null ? { demandaId: row.demandaId } : {}),
    ...(row.status !== null ? { status: row.status } : {}),
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
