/**
 * ClienteRepository — dual-write Postgres.
 *
 * Estratégia de transição segura:
 *  - O `Map<string, Cliente>` em apps/api/src/routes/clientes.ts continua
 *    sendo a fonte de verdade em runtime (zero risco para callers existentes).
 *  - Quando ALETIS_PG_ENABLED=1, cada `clientes.set(id, cli)` é espelhado
 *    como UPSERT no Postgres (best-effort: erro de DB loga e segue).
 *  - No boot, se PG estiver habilitado e tiver dados, o Map é hidratado
 *    a partir do banco; senão, o seed/JSON em memória prevalece.
 *  - Nada quebra se ALETIS_PG_ENABLED=0 ou se o banco estiver fora.
 */
import { eq, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import { cliente as clienteTable } from './schema.js'

interface ClienteLike {
  id: string
  nome: string
  cpfCnpj: string
  cidade?: string
  uf?: string
  telefone?: string
  email?: string
  estagio: string
  consultor?: string
  credor?: string
  valorTotalDivida?: number
  valorTotalPago?: number
  areaTotalHa?: number
  culturas?: string[]
  dataCadastro?: string
  ultimaAtualizacao?: string
  [key: string]: unknown
}

/**
 * Faz upsert de um Cliente no Postgres. Best-effort: se a flag estiver
 * desligada ou o banco estiver fora, NUNCA propaga erro pro caller —
 * só loga uma vez no console.
 */
export async function upsertCliente(cli: ClienteLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const row = {
      id: cli.id,
      nome: cli.nome,
      cpfCnpj: cli.cpfCnpj,
      cidade: cli.cidade ?? null,
      uf: cli.uf ?? null,
      telefone: cli.telefone ?? null,
      email: cli.email ?? null,
      estagio: cli.estagio,
      consultor: cli.consultor ?? null,
      credor: cli.credor ?? null,
      valorTotalDivida: cli.valorTotalDivida != null ? String(cli.valorTotalDivida) : null,
      valorTotalPago: cli.valorTotalPago != null ? String(cli.valorTotalPago) : null,
      areaTotalHa: cli.areaTotalHa != null ? String(cli.areaTotalHa) : null,
      culturas: cli.culturas ?? null,
      dataCadastro: cli.dataCadastro ? new Date(cli.dataCadastro) : null,
      ultimaAtualizacao: cli.ultimaAtualizacao ? new Date(cli.ultimaAtualizacao) : null,
      payload: cli as unknown as Record<string, unknown>,
      atualizadoEm: new Date(),
    }
    await db.insert(clienteTable).values(row).onConflictDoUpdate({
      target: clienteTable.id,
      set: {
        nome: row.nome,
        cpfCnpj: row.cpfCnpj,
        cidade: row.cidade,
        uf: row.uf,
        telefone: row.telefone,
        email: row.email,
        estagio: row.estagio,
        consultor: row.consultor,
        credor: row.credor,
        valorTotalDivida: row.valorTotalDivida,
        valorTotalPago: row.valorTotalPago,
        areaTotalHa: row.areaTotalHa,
        culturas: row.culturas,
        dataCadastro: row.dataCadastro,
        ultimaAtualizacao: row.ultimaAtualizacao,
        payload: row.payload,
        atualizadoEm: row.atualizadoEm,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ClienteRepo.upsert] best-effort fail:', (err as Error).message)
  }
}

/** Lê todos os clientes do Postgres. Retorna array vazio se PG off. */
export async function listClientes(): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const rows = await db.select().from(clienteTable).orderBy(clienteTable.id)
    // O `payload` JSONB carrega todos os campos do Cliente original; preferimos
    // ele para compatibilidade total com o tipo em memória.
    return rows.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>
      return { ...payload, id: r.id }
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ClienteRepo.list] fail:', (err as Error).message)
    return []
  }
}

/** Conta clientes — usado para decidir se hidrata do banco no boot. */
export async function countClientes(): Promise<number> {
  if (!isPgEnabled()) return 0
  try {
    const db = getDb()
    const r = await db.select({ n: sql<number>`count(*)::int` }).from(clienteTable)
    return r[0]?.n ?? 0
  } catch {
    return 0
  }
}

/** Remove cliente. Best-effort. */
export async function deleteCliente(id: string): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    await db.delete(clienteTable).where(eq(clienteTable.id, id))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ClienteRepo.delete] fail:', (err as Error).message)
  }
}
