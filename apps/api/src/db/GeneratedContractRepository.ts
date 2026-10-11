import { desc, eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { cliente, generatedContract, proposta } from './schema.js'
import {
  GeneratedContractOriginError,
  generatedContractSchema,
  type GeneratedContractPersistence,
  type GeneratedContractRecord,
} from '../services/contratos/GeneratedContractCatalog.js'

function restore(row: typeof generatedContract.$inferSelect): GeneratedContractRecord {
  const payload = generatedContractSchema.parse(row.payload)
  return generatedContractSchema.parse({
    ...payload,
    id: row.id,
    tipo: row.tipo,
    titulo: row.titulo,
    dataGeracao: row.dataGeracao.toISOString(),
    valorTotal: row.valorTotal,
    clienteId: row.clienteId ?? undefined,
    propostaId: row.propostaId ?? undefined,
  })
}

/** Erros são propagados: nunca confirmar gravação nem substituir PG por um cache obsoleto. */
export const generatedContractPersistence: GeneratedContractPersistence = {
  enabled: isPgEnabled,

  async insert(input) {
    const record = generatedContractSchema.parse(input)
    return getDb().transaction(async (tx) => {
      if (record.propostaId) {
        const [origin] = await tx.select({ id: proposta.id, clienteId: proposta.clienteId })
          .from(proposta).where(eq(proposta.id, record.propostaId)).for('share')
        if (!origin) throw new GeneratedContractOriginError('Proposta de origem não encontrada.')
        if (record.clienteId && origin.clienteId && record.clienteId !== origin.clienteId) {
          throw new GeneratedContractOriginError('A proposta pertence a outro cliente.')
        }
        record.clienteId ??= origin.clienteId ?? undefined
      }
      if (record.clienteId) {
        const [origin] = await tx.select({ id: cliente.id }).from(cliente)
          .where(eq(cliente.id, record.clienteId)).for('key share')
        if (!origin) throw new GeneratedContractOriginError('Cliente de origem não encontrado.')
      }
      const [saved] = await tx.insert(generatedContract).values({
        id: record.id,
        tipo: record.tipo,
        titulo: record.titulo,
        dataGeracao: new Date(record.dataGeracao),
        clienteId: record.clienteId ?? null,
        propostaId: record.propostaId ?? null,
        valorTotal: record.valorTotal,
        payload: generatedContractSchema.parse(record),
      }).returning()
      return restore(saved)
    })
  },

  async list() {
    const rows = await getDb().select().from(generatedContract)
      .orderBy(desc(generatedContract.dataGeracao), generatedContract.id)
    return rows.map(restore)
  },

  async get(id) {
    const [row] = await getDb().select().from(generatedContract).where(eq(generatedContract.id, id))
    return row ? restore(row) : null
  },

  async delete(id) {
    const rows = await getDb().delete(generatedContract).where(eq(generatedContract.id, id)).returning({ id: generatedContract.id })
    return rows.length > 0
  },
}
