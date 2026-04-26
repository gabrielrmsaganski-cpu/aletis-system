/**
 * FinanceiroRepository — dual-write best-effort para Postgres.
 *
 * Cobre 4 entidades do domínio financeiro: receita, despesa, imposto,
 * lancamento bancário. Em runtime, o `FinanceiroService` continua sendo
 * a fonte de verdade (Maps + db.json em disco). Este módulo só espelha
 * cada `save()` em PG quando ALETIS_PG_ENABLED=1.
 *
 * O método `dumpAll()` é chamado por `FinanceiroService.save()` —
 * recebe os 4 Maps inteiros e faz upsert em batch (idempotente).
 */
import { eq, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from './client.js'
import {
  financeiroReceita as receitaTable,
  financeiroDespesa as despesaTable,
  financeiroImposto as impostoTable,
  financeiroLancamento as lancamentoTable,
} from './schema.js'

interface ReceitaLike {
  id: string
  competencia: string
  descricao?: string
  cliente?: { nome?: string; cpfCnpj?: string }
  valorBruto?: number
  valorLiquido?: number
  status: string
  dataEmissao?: string
  dataRecebimento?: string
  propostaId?: string
  [k: string]: unknown
}

interface DespesaLike {
  id: string
  competencia: string
  descricao?: string
  fornecedor?: { nome?: string; cpfCnpj?: string }
  clienteVinculo?: { cpfCnpj?: string }
  categoria: string
  valor?: number
  status: string
  dataVencimento?: string
  dataPagamento?: string
  [k: string]: unknown
}

interface ImpostoLike {
  id: string
  competencia: string
  tipo: string
  descricao?: string
  valor?: number
  status: string
  dataVencimento?: string
  dataPagamento?: string
  [k: string]: unknown
}

interface LancamentoLike {
  id: string
  competencia?: string
  contaBancaria?: string
  data?: string
  descricao?: string
  valor?: number
  tipo?: string
  vinculadoTipo?: string
  vinculadoId?: string
  [k: string]: unknown
}

function toDate(s?: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function num(v?: number): string | null {
  return v != null && Number.isFinite(v) ? String(v) : null
}

/* ── Receita ─────────────────────────────────────────────── */
export async function upsertReceita(r: ReceitaLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const row = {
      id: r.id,
      competencia: r.competencia,
      descricao: r.descricao ?? null,
      clienteNome: r.cliente?.nome ?? null,
      clienteCpfCnpj: r.cliente?.cpfCnpj ?? null,
      valorBruto: num(r.valorBruto),
      valorLiquido: num(r.valorLiquido),
      status: r.status,
      dataEmissao: toDate(r.dataEmissao),
      dataRecebimento: toDate(r.dataRecebimento),
      propostaId: r.propostaId ?? null,
      payload: r as unknown as Record<string, unknown>,
      atualizadoEm: new Date(),
    }
    await db.insert(receitaTable).values(row).onConflictDoUpdate({
      target: receitaTable.id,
      set: {
        competencia: row.competencia,
        descricao: row.descricao,
        clienteNome: row.clienteNome,
        clienteCpfCnpj: row.clienteCpfCnpj,
        valorBruto: row.valorBruto,
        valorLiquido: row.valorLiquido,
        status: row.status,
        dataEmissao: row.dataEmissao,
        dataRecebimento: row.dataRecebimento,
        propostaId: row.propostaId,
        payload: row.payload,
        atualizadoEm: row.atualizadoEm,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[FinanceiroRepo.receita] best-effort fail:', (err as Error).message)
  }
}

/* ── Despesa ─────────────────────────────────────────────── */
export async function upsertDespesa(d: DespesaLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const row = {
      id: d.id,
      competencia: d.competencia,
      descricao: d.descricao ?? null,
      fornecedorNome: d.fornecedor?.nome ?? null,
      fornecedorCpfCnpj: d.fornecedor?.cpfCnpj ?? null,
      clienteVinculoCpfCnpj: d.clienteVinculo?.cpfCnpj ?? null,
      categoria: d.categoria,
      valor: num(d.valor),
      status: d.status,
      dataVencimento: toDate(d.dataVencimento),
      dataPagamento: toDate(d.dataPagamento),
      payload: d as unknown as Record<string, unknown>,
      atualizadoEm: new Date(),
    }
    await db.insert(despesaTable).values(row).onConflictDoUpdate({
      target: despesaTable.id,
      set: {
        competencia: row.competencia,
        descricao: row.descricao,
        fornecedorNome: row.fornecedorNome,
        fornecedorCpfCnpj: row.fornecedorCpfCnpj,
        clienteVinculoCpfCnpj: row.clienteVinculoCpfCnpj,
        categoria: row.categoria,
        valor: row.valor,
        status: row.status,
        dataVencimento: row.dataVencimento,
        dataPagamento: row.dataPagamento,
        payload: row.payload,
        atualizadoEm: row.atualizadoEm,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[FinanceiroRepo.despesa] fail:', (err as Error).message)
  }
}

/* ── Imposto ─────────────────────────────────────────────── */
export async function upsertImposto(i: ImpostoLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const row = {
      id: i.id,
      competencia: i.competencia,
      tipo: i.tipo,
      descricao: i.descricao ?? null,
      valor: num(i.valor),
      status: i.status,
      dataVencimento: toDate(i.dataVencimento),
      dataPagamento: toDate(i.dataPagamento),
      payload: i as unknown as Record<string, unknown>,
      atualizadoEm: new Date(),
    }
    await db.insert(impostoTable).values(row).onConflictDoUpdate({
      target: impostoTable.id,
      set: {
        competencia: row.competencia,
        tipo: row.tipo,
        descricao: row.descricao,
        valor: row.valor,
        status: row.status,
        dataVencimento: row.dataVencimento,
        dataPagamento: row.dataPagamento,
        payload: row.payload,
        atualizadoEm: row.atualizadoEm,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[FinanceiroRepo.imposto] fail:', (err as Error).message)
  }
}

/* ── Lançamento bancário ─────────────────────────────────── */
export async function upsertLancamento(l: LancamentoLike): Promise<void> {
  if (!isPgEnabled()) return
  try {
    const db = getDb()
    const competencia = l.competencia
      ?? (l.data ? l.data.slice(0, 7) : new Date().toISOString().slice(0, 7))
    const row = {
      id: l.id,
      competencia,
      contaBancaria: l.contaBancaria ?? null,
      data: toDate(l.data),
      descricao: l.descricao ?? null,
      valor: num(l.valor),
      tipo: l.tipo ?? null,
      vinculadoTipo: l.vinculadoTipo ?? null,
      vinculadoId: l.vinculadoId ?? null,
      payload: l as unknown as Record<string, unknown>,
    }
    await db.insert(lancamentoTable).values(row).onConflictDoUpdate({
      target: lancamentoTable.id,
      set: {
        competencia: row.competencia,
        contaBancaria: row.contaBancaria,
        data: row.data,
        descricao: row.descricao,
        valor: row.valor,
        tipo: row.tipo,
        vinculadoTipo: row.vinculadoTipo,
        vinculadoId: row.vinculadoId,
        payload: row.payload,
      },
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[FinanceiroRepo.lancamento] fail:', (err as Error).message)
  }
}

/**
 * Dump completo dos 4 Maps em PG. Chamado pelo `FinanceiroService.save()`
 * após cada mutação. Best-effort: não bloqueia hot-path; serializa a si
 * mesmo via Promise interna pra evitar concorrência destrutiva (debounce
 * fica a cargo do caller).
 */
export async function dumpAll(data: {
  receitas: Iterable<ReceitaLike>
  despesas: Iterable<DespesaLike>
  impostos: Iterable<ImpostoLike>
  lancamentos: Iterable<LancamentoLike>
}): Promise<{ written: number }> {
  if (!isPgEnabled()) return { written: 0 }
  let n = 0
  for (const r of data.receitas) {
    await upsertReceita(r); n++
  }
  for (const d of data.despesas) {
    await upsertDespesa(d); n++
  }
  for (const i of data.impostos) {
    await upsertImposto(i); n++
  }
  for (const l of data.lancamentos) {
    await upsertLancamento(l); n++
  }
  return { written: n }
}

/* ── Counts (smoke) ──────────────────────────────────────── */
export async function financeiroCounts(): Promise<{
  receitas: number; despesas: number; impostos: number; lancamentos: number
}> {
  const out = { receitas: 0, despesas: 0, impostos: 0, lancamentos: 0 }
  if (!isPgEnabled()) return out
  try {
    const db = getDb()
    const tables = [
      [receitaTable, 'receitas'],
      [despesaTable, 'despesas'],
      [impostoTable, 'impostos'],
      [lancamentoTable, 'lancamentos'],
    ] as const
    for (const [tbl, key] of tables) {
      const rows = await db.select({ n: sql<number>`count(*)::int` }).from(tbl)
      out[key] = rows[0]?.n ?? 0
    }
  } catch {
    /* ignore */
  }
  return out
}

/* ── Queries analíticas (SQL agregadas) ──────────────────── */

/**
 * Margem por cliente (SQL): soma receitas vinculadas a cliente
 * (proposta_id OU cliente_cpf_cnpj) menos despesas com clienteVinculo
 * no mesmo CPF/CNPJ. Filtros opcionais por ano (sobre competencia).
 */
export async function margemPorClienteSql(opts: {
  ano?: number
  limit?: number
}): Promise<Array<{ clienteCpfCnpj: string; clienteNome: string | null; receitas: number; despesas: number; margem: number }>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const limit = Math.min(Math.max(1, opts.limit ?? 20), 200)
    const yearFilter = opts.ano ? sql`AND substring(competencia, 1, 4) = ${String(opts.ano)}` : sql``
    const result = await db.execute<{ cpfcnpj: string; nome: string | null; receitas: string; despesas: string }>(
      sql`
        WITH r AS (
          SELECT cliente_cpf_cnpj AS cpfcnpj,
                 MAX(cliente_nome) AS nome,
                 COALESCE(SUM(valor_liquido), 0)::text AS total
          FROM financeiro_receita
          WHERE cliente_cpf_cnpj IS NOT NULL ${yearFilter}
          GROUP BY cliente_cpf_cnpj
        ),
        d AS (
          SELECT cliente_vinculo_cpf_cnpj AS cpfcnpj,
                 COALESCE(SUM(valor), 0)::text AS total
          FROM financeiro_despesa
          WHERE cliente_vinculo_cpf_cnpj IS NOT NULL ${yearFilter}
          GROUP BY cliente_vinculo_cpf_cnpj
        )
        SELECT
          COALESCE(r.cpfcnpj, d.cpfcnpj) AS cpfcnpj,
          r.nome,
          COALESCE(r.total, '0') AS receitas,
          COALESCE(d.total, '0') AS despesas
        FROM r
        FULL OUTER JOIN d ON r.cpfcnpj = d.cpfcnpj
        ORDER BY (COALESCE(r.total::numeric, 0) - COALESCE(d.total::numeric, 0)) DESC
        LIMIT ${limit}
      `,
    )
    const rows = (result as unknown as { rows?: Array<{ cpfcnpj: string; nome: string | null; receitas: string; despesas: string }> }).rows
      ?? (result as unknown as Array<{ cpfcnpj: string; nome: string | null; receitas: string; despesas: string }>)
    return (rows ?? []).map((r) => ({
      clienteCpfCnpj: r.cpfcnpj,
      clienteNome: r.nome,
      receitas: Number(r.receitas) || 0,
      despesas: Number(r.despesas) || 0,
      margem: (Number(r.receitas) || 0) - (Number(r.despesas) || 0),
    }))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[FinanceiroRepo.margemPorClienteSql] fail:', (err as Error).message)
    return []
  }
}

/**
 * Fluxo por competência (SQL): agrega receitas/despesas/impostos por
 * YYYY-MM no intervalo informado.
 */
export async function fluxoCompetenciaSql(opts: {
  desde?: string
  ate?: string
}): Promise<Array<{ competencia: string; receitas: number; despesas: number; impostos: number; saldo: number }>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const desde = opts.desde ?? '2024-01'
    const ate = opts.ate ?? new Date().toISOString().slice(0, 7)
    const result = await db.execute<{ competencia: string; receitas: string; despesas: string; impostos: string }>(
      sql`
        WITH meses AS (
          SELECT competencia FROM financeiro_receita
          WHERE competencia BETWEEN ${desde} AND ${ate}
          UNION SELECT competencia FROM financeiro_despesa
          WHERE competencia BETWEEN ${desde} AND ${ate}
          UNION SELECT competencia FROM financeiro_imposto
          WHERE competencia BETWEEN ${desde} AND ${ate}
        )
        SELECT
          m.competencia,
          COALESCE((SELECT SUM(valor_liquido) FROM financeiro_receita WHERE competencia = m.competencia), 0)::text AS receitas,
          COALESCE((SELECT SUM(valor) FROM financeiro_despesa WHERE competencia = m.competencia), 0)::text AS despesas,
          COALESCE((SELECT SUM(valor) FROM financeiro_imposto WHERE competencia = m.competencia), 0)::text AS impostos
        FROM meses m
        ORDER BY m.competencia ASC
      `,
    )
    const rows = (result as unknown as { rows?: Array<{ competencia: string; receitas: string; despesas: string; impostos: string }> }).rows
      ?? (result as unknown as Array<{ competencia: string; receitas: string; despesas: string; impostos: string }>)
    return (rows ?? []).map((r) => {
      const rec = Number(r.receitas) || 0
      const des = Number(r.despesas) || 0
      const imp = Number(r.impostos) || 0
      return {
        competencia: r.competencia,
        receitas: rec,
        despesas: des,
        impostos: imp,
        saldo: rec - des - imp,
      }
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[FinanceiroRepo.fluxoCompetenciaSql] fail:', (err as Error).message)
    return []
  }
}

/** Top categorias de despesa por soma de valor (no mês ou geral). */
export async function topCategoriasSql(opts: {
  competencia?: string
  limit?: number
}): Promise<Array<{ categoria: string; total: number; n: number }>> {
  if (!isPgEnabled()) return []
  try {
    const db = getDb()
    const limit = Math.min(Math.max(1, opts.limit ?? 10), 50)
    const compFilter = opts.competencia ? sql`WHERE competencia = ${opts.competencia}` : sql``
    const result = await db.execute<{ categoria: string; total: string; n: string }>(
      sql`
        SELECT categoria,
               COALESCE(SUM(valor), 0)::text AS total,
               COUNT(*)::text AS n
        FROM financeiro_despesa
        ${compFilter}
        GROUP BY categoria
        ORDER BY SUM(valor) DESC NULLS LAST
        LIMIT ${limit}
      `,
    )
    const rows = (result as unknown as { rows?: Array<{ categoria: string; total: string; n: string }> }).rows
      ?? (result as unknown as Array<{ categoria: string; total: string; n: string }>)
    return (rows ?? []).map((r) => ({
      categoria: r.categoria,
      total: Number(r.total) || 0,
      n: Number(r.n) || 0,
    }))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[FinanceiroRepo.topCategoriasSql] fail:', (err as Error).message)
    return []
  }
}

/* ── Delete (cascata best-effort no caller) ──────────────── */
export async function deleteReceita(id: string): Promise<void> {
  if (!isPgEnabled()) return
  try { await getDb().delete(receitaTable).where(eq(receitaTable.id, id)) } catch { /* ignore */ }
}
export async function deleteDespesa(id: string): Promise<void> {
  if (!isPgEnabled()) return
  try { await getDb().delete(despesaTable).where(eq(despesaTable.id, id)) } catch { /* ignore */ }
}
export async function deleteImposto(id: string): Promise<void> {
  if (!isPgEnabled()) return
  try { await getDb().delete(impostoTable).where(eq(impostoTable.id, id)) } catch { /* ignore */ }
}
export async function deleteLancamento(id: string): Promise<void> {
  if (!isPgEnabled()) return
  try { await getDb().delete(lancamentoTable).where(eq(lancamentoTable.id, id)) } catch { /* ignore */ }
}
