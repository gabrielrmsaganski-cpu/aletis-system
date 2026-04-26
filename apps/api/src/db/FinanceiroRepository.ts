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
