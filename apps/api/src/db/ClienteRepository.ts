/**
 * ClienteRepository — dual-write Postgres.
 *
 * Estratégia de transição segura:
 *  - Quando ALETIS_PG_ENABLED=1, o Postgres é consultado antes de criar
 *    clientes e recebe INSERT estrito na criação manual/importação PGFN.
 *  - O `Map<string, Cliente>` em apps/api/src/routes/clientes.ts permanece
 *    como cache runtime para compatibilidade com callers existentes.
 *  - No boot, se PG estiver habilitado e tiver dados, o Map é hidratado
 *    a partir do banco; senão, o seed/JSON em memória prevalece.
 *  - Caminhos legados ainda podem usar upsert best-effort para não derrubar
 *    rotinas antigas quando ALETIS_PG_ENABLED=0.
 */
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, getPool, isPgEnabled } from './client.js'
import { cliente as clienteTable } from './schema.js'
import { clientMergedError, mergedClientIdentity } from '../services/core/ClientIdentity.js'

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
  escritorio?: string
  credor?: string
  valorTotalDivida?: number | string
  valorTotalPago?: number | string
  areaTotalHa?: number
  culturas?: string[]
  dataCadastro?: string
  ultimaAtualizacao?: string
  [key: string]: unknown
}

export function normalizeCpfCnpj(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function isValidCpfCnpj(value: unknown): boolean {
  const clean = normalizeCpfCnpj(value)
  return clean.length === 11 || clean.length === 14
}

/** Resolve links antigos sem ressuscitar o cadastro arquivado. Falhas de PG são explícitas. */
export async function resolveClienteId(id: string): Promise<string> {
  if (!isPgEnabled()) return id
  const visited = new Set<string>()
  let organization: string | undefined
  for (let depth = 0; depth < 10; depth++) {
    if (visited.has(id)) throw new Error('Ciclo de consolidação cadastral inválido.')
    visited.add(id)
    const { rows } = await getPool().query('select organization_id, payload from cliente where id=$1', [id])
    if (!rows[0]) {
      if (visited.size > 1) throw new Error('Cadastro canônico ausente.')
      return id
    }
    if (organization && organization !== rows[0].organization_id) throw new Error('Consolidação entre organizações não permitida.')
    organization = rows[0].organization_id
    const alias = mergedClientIdentity(rows[0].payload)
    if (!alias) return id
    id = alias.canonicalId
  }
  throw new Error('Cadeia de consolidação cadastral excedida.')
}

export async function listClienteAliases(): Promise<Array<{ id: string; canonicalId: string }>> {
  if (!isPgEnabled()) return []
  const { rows } = await getPool().query("select id, payload->'identityMerge'->>'canonicalId' as canonical_id from cliente where payload->'identityMerge'->>'status'='merged'")
  return rows.map(row => ({ id: row.id, canonicalId: row.canonical_id }))
}

export async function findClienteByCpfCnpj(cpfCnpj: unknown): Promise<Record<string, unknown> | null> {
  if (!isPgEnabled()) return null
  const clean = normalizeCpfCnpj(cpfCnpj)
  if (!isValidCpfCnpj(clean)) return null
  try {
    const res = await getPool().query(
      `
        select id, nome, cpf_cnpj, payload
        from cliente
        where regexp_replace(cpf_cnpj, '\\D', '', 'g') = $1
          and (payload->'identityMerge'->>'status') is distinct from 'merged'
        limit 1
      `,
      [clean],
    )
    const row = res.rows[0]
    if (!row) return null
    const payload = (row.payload ?? {}) as Record<string, unknown>
    return {
      ...payload,
      id: row.id,
      nome: row.nome ?? payload.nome,
      cpfCnpj: row.cpf_cnpj ?? payload.cpfCnpj,
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ClienteRepo.findByCpfCnpj] fail:', (err as Error).message)
    return null
  }
}

function toClienteRow(cli: ClienteLike) {
  // Valida o envelope JSONB sem remover campos de módulos legados.
  z.object({ id: z.string().min(1), nome: z.string().min(1), cpfCnpj: z.string(), estagio: z.string().min(1) }).passthrough().parse(cli)
  return {
    id: cli.id,
    nome: cli.nome,
    cpfCnpj: cli.cpfCnpj,
    cidade: cli.cidade ?? null,
    uf: cli.uf ?? null,
    telefone: cli.telefone ?? null,
    email: cli.email ?? null,
    estagio: cli.estagio,
    consultor: cli.consultor ?? null,
    escritorio: cli.escritorio ?? null,
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
}

/** Criação deve falhar em conflito; nunca transforma colisão em atualização. */
export async function insertClienteStrict(cli: ClienteLike): Promise<void> {
  const row = toClienteRow(cli)
  if (!isPgEnabled()) return
  const canonicalId = await resolveClienteId(cli.id)
  if (canonicalId !== cli.id) throw clientMergedError(canonicalId)
  await getDb().insert(clienteTable).values(row)
}

export async function upsertClienteStrict(cli: ClienteLike): Promise<void> {
  if (!isPgEnabled()) return
  const canonicalId = await resolveClienteId(cli.id)
  if (canonicalId !== cli.id) throw clientMergedError(canonicalId)
  const db = getDb()
  const row = toClienteRow(cli)
  const updated = await db.insert(clienteTable).values(row).onConflictDoUpdate({
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
      escritorio: row.escritorio,
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
    setWhere: sql`(${clienteTable.payload}->'identityMerge'->>'status') is distinct from 'merged'`,
  }).returning({ id: clienteTable.id })
  if (updated.length !== 1) throw clientMergedError(await resolveClienteId(cli.id))
}

/**
 * Faz upsert de um Cliente no Postgres. Best-effort: se a flag estiver
 * desligada ou o banco estiver fora, NUNCA propaga erro pro caller —
 * só loga uma vez no console.
 */
export async function upsertCliente(cli: ClienteLike): Promise<void> {
  try {
    await upsertClienteStrict(cli)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ClienteRepo.upsert] best-effort fail:', (err as Error).message)
  }
}

/** Lê todos os clientes do Postgres. Retorna array vazio se PG off. */
export async function listClientes(): Promise<Array<Record<string, unknown>>> {
  if (!isPgEnabled()) return []
    const db = getDb()
    const rows = await db.select().from(clienteTable).where(sql`(${clienteTable.payload}->'identityMerge'->>'status') is distinct from 'merged'`).orderBy(clienteTable.id)
    // O `payload` JSONB carrega todos os campos do Cliente original; preferimos
    // ele para compatibilidade total com o tipo em memória.
    return rows.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>
      return { ...payload, id: r.id }
    })
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
  const canonicalId = await resolveClienteId(id)
  if (canonicalId !== id) throw clientMergedError(canonicalId)
  try {
    const db = getDb()
    await db.delete(clienteTable).where(eq(clienteTable.id, id))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ClienteRepo.delete] fail:', (err as Error).message)
  }
}
