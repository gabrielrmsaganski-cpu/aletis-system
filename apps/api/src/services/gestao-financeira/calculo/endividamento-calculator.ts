// ============================================================
// EndividamentoCalculator — gera cronograma de amortização
// (PRICE / SAC / BULLET) por contrato e agrega por ano civil.
// Replica a lógica de "10 - Endividamento" (4558 fórmulas).
// ============================================================
import type { GfContratoDivida } from '../../../db/schema.js'

export interface InstallmentRow {
  k: number
  dataPlaneada: Date
  ano: number
  capital: number
  juro: number
  parcela: number
  saldoAposPagamento: number
}

export interface YearScheduleRow {
  ano: number
  capitalPago: number
  juroPago: number
  parcelaPaga: number
  saldoFinalAno: number
}

export interface ContratoSchedule {
  contratoId: string
  credor: string
  valorFinanciado: number
  metodoCalculo: 'PRICE' | 'SAC' | 'BULLET' | 'OUTROS'
  taxaPeriodo: number
  periodosPorAno: number
  prazoParcelas: number
  parcelasPagas: number
  saldoAtual: number
  installments: InstallmentRow[]
  porAno: YearScheduleRow[]
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : 0
}

function periodosPorAnoFromPeriodicidade(p: string | null | undefined): number {
  switch ((p || '').toLowerCase().trim()) {
    case 'mensal':
      return 12
    case 'trimestral':
      return 4
    case 'semestral':
      return 2
    case 'anual':
      return 1
    case 'final':
    case 'liquidado':
      return 1
    default:
      return 12
  }
}

function addMonthsClone(d: Date, months: number): Date {
  const x = new Date(d.getTime())
  x.setMonth(x.getMonth() + months)
  return x
}

function periodosToMonths(periodosPorAno: number): number {
  // mensal=1mês, trimestral=3, semestral=6, anual=12
  return Math.max(1, Math.round(12 / periodosPorAno))
}

/**
 * Gera cronograma completo do contrato.
 * Suporta PRICE (parcela fixa), SAC (capital fixo), BULLET (juros mensais + capital ao final).
 */
export function gerarCronograma(c: GfContratoDivida): ContratoSchedule {
  const valorFinanciado = n(c.valorFinanciado)
  const taxaAa = n(c.taxaNominalAa) / 100 // % → decimal
  const periodosPorAno = periodosPorAnoFromPeriodicidade(c.periodicidade)
  const taxaPeriodo = periodosPorAno > 0 ? Math.pow(1 + taxaAa, 1 / periodosPorAno) - 1 : 0
  const N = c.prazoParcelas ?? 0
  const startDate = c.primeiraParcela
    ? new Date(c.primeiraParcela as string)
    : c.dataContratacao
      ? new Date(c.dataContratacao as string)
      : new Date()
  const monthsStep = periodosToMonths(periodosPorAno)
  const metodo = (c.metodoCalculo || 'PRICE') as ContratoSchedule['metodoCalculo']

  const installments: InstallmentRow[] = []
  let saldo = valorFinanciado

  if (N <= 0 || valorFinanciado <= 0) {
    return {
      contratoId: c.id,
      credor: c.credor,
      valorFinanciado,
      metodoCalculo: metodo,
      taxaPeriodo,
      periodosPorAno,
      prazoParcelas: N,
      parcelasPagas: c.parcelasPagas ?? 0,
      saldoAtual: valorFinanciado,
      installments: [],
      porAno: [],
    }
  }

  if (metodo === 'PRICE' && taxaPeriodo > 0) {
    const i = taxaPeriodo
    const PMT = (valorFinanciado * (i * Math.pow(1 + i, N))) / (Math.pow(1 + i, N) - 1)
    for (let k = 1; k <= N; k++) {
      const juro = saldo * i
      const capital = PMT - juro
      saldo = Math.max(0, saldo - capital)
      const data = addMonthsClone(startDate, (k - 1) * monthsStep)
      installments.push({
        k,
        dataPlaneada: data,
        ano: data.getFullYear(),
        capital,
        juro,
        parcela: PMT,
        saldoAposPagamento: saldo,
      })
    }
  } else if (metodo === 'SAC') {
    const capital = valorFinanciado / N
    for (let k = 1; k <= N; k++) {
      const juro = saldo * taxaPeriodo
      saldo = Math.max(0, saldo - capital)
      const data = addMonthsClone(startDate, (k - 1) * monthsStep)
      installments.push({
        k,
        dataPlaneada: data,
        ano: data.getFullYear(),
        capital,
        juro,
        parcela: capital + juro,
        saldoAposPagamento: saldo,
      })
    }
  } else if (metodo === 'BULLET') {
    // Juros periódicos, capital ao final
    for (let k = 1; k <= N; k++) {
      const juro = saldo * taxaPeriodo
      const isLast = k === N
      const capital = isLast ? saldo : 0
      saldo = Math.max(0, saldo - capital)
      const data = addMonthsClone(startDate, (k - 1) * monthsStep)
      installments.push({
        k,
        dataPlaneada: data,
        ano: data.getFullYear(),
        capital,
        juro,
        parcela: juro + capital,
        saldoAposPagamento: saldo,
      })
    }
  } else {
    // OUTROS — divisão linear simples
    const capital = valorFinanciado / N
    for (let k = 1; k <= N; k++) {
      const juro = 0
      saldo = Math.max(0, saldo - capital)
      const data = addMonthsClone(startDate, (k - 1) * monthsStep)
      installments.push({
        k,
        dataPlaneada: data,
        ano: data.getFullYear(),
        capital,
        juro,
        parcela: capital,
        saldoAposPagamento: saldo,
      })
    }
  }

  // saldo atual = saldo após N=parcelasPagas
  const pagas = c.parcelasPagas ?? 0
  const saldoAtual =
    pagas <= 0
      ? valorFinanciado
      : pagas >= N
        ? 0
        : (installments[pagas - 1]?.saldoAposPagamento ?? 0)

  // agregação por ano
  const porAnoMap = new Map<number, YearScheduleRow>()
  for (const inst of installments) {
    const cur =
      porAnoMap.get(inst.ano) ??
      ({
        ano: inst.ano,
        capitalPago: 0,
        juroPago: 0,
        parcelaPaga: 0,
        saldoFinalAno: 0,
      } as YearScheduleRow)
    cur.capitalPago += inst.capital
    cur.juroPago += inst.juro
    cur.parcelaPaga += inst.parcela
    cur.saldoFinalAno = inst.saldoAposPagamento // último valor do ano
    porAnoMap.set(inst.ano, cur)
  }

  return {
    contratoId: c.id,
    credor: c.credor,
    valorFinanciado,
    metodoCalculo: metodo,
    taxaPeriodo,
    periodosPorAno,
    prazoParcelas: N,
    parcelasPagas: pagas,
    saldoAtual,
    installments,
    porAno: Array.from(porAnoMap.values()).sort((a, b) => a.ano - b.ano),
  }
}

export interface EndividamentoConsolidado {
  totalContratos: number
  saldoTotalAtual: number
  saldoTotalOriginal: number
  porCredor: Array<{
    credor: string
    saldo: number
    pctTotal: number
    contratos: number
  }>
  evolucaoAnual: Array<{ ano: number; saldoFimAno: number; capitalAno: number; juroAno: number; parcelaAno: number }>
  contratos: ContratoSchedule[]
}

export function consolidarEndividamento(
  contratos: GfContratoDivida[],
): EndividamentoConsolidado {
  const schedules = contratos.map(gerarCronograma)
  const saldoTotalAtual = schedules.reduce((a, s) => a + s.saldoAtual, 0)
  const saldoTotalOriginal = schedules.reduce((a, s) => a + s.valorFinanciado, 0)

  // agrupa por credor
  const credorMap = new Map<string, { saldo: number; contratos: number }>()
  for (const s of schedules) {
    const cur = credorMap.get(s.credor) ?? { saldo: 0, contratos: 0 }
    cur.saldo += s.saldoAtual
    cur.contratos += 1
    credorMap.set(s.credor, cur)
  }
  const porCredor = Array.from(credorMap.entries())
    .map(([credor, v]) => ({
      credor,
      saldo: v.saldo,
      pctTotal: saldoTotalAtual > 0 ? v.saldo / saldoTotalAtual : 0,
      contratos: v.contratos,
    }))
    .sort((a, b) => b.saldo - a.saldo)

  // evolução anual
  const anoMap = new Map<
    number,
    { saldoFimAno: number; capitalAno: number; juroAno: number; parcelaAno: number }
  >()
  for (const s of schedules) {
    for (const y of s.porAno) {
      const cur =
        anoMap.get(y.ano) ?? { saldoFimAno: 0, capitalAno: 0, juroAno: 0, parcelaAno: 0 }
      cur.capitalAno += y.capitalPago
      cur.juroAno += y.juroPago
      cur.parcelaAno += y.parcelaPaga
      cur.saldoFimAno += y.saldoFinalAno
      anoMap.set(y.ano, cur)
    }
  }
  const evolucaoAnual = Array.from(anoMap.entries())
    .map(([ano, v]) => ({ ano, ...v }))
    .sort((a, b) => a.ano - b.ano)

  return {
    totalContratos: contratos.length,
    saldoTotalAtual,
    saldoTotalOriginal,
    porCredor,
    evolucaoAnual,
    contratos: schedules,
  }
}
