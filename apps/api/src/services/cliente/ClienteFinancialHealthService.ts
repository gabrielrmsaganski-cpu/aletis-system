import type { AnaliseCliente } from './types.js'

type MoneyInput = string | number | bigint | null | undefined

export interface FinancialHealthDebt {
  valorAtualizado?: MoneyInput
  valorAtual?: MoneyInput
  status?: string
  vencimento?: string
}

export interface FinancialHealthClient {
  valorTotalDivida?: MoneyInput
  areaTotalHa?: number | string | null
  dividas?: FinancialHealthDebt[]
}

export interface FinancialHealthComponent {
  id: 'capacidade_pagamento' | 'saldo_safra' | 'situacao_dividas' | 'divida_por_hectare' | 'margem_real'
  label: string
  score: number | null
  peso: number
  disponivel: boolean
  valor: string
  leitura: string
}

export interface ClienteFinancialHealth {
  score: number | null
  nivel: 'forte' | 'equilibrada' | 'atencao' | 'pressionada' | 'critica' | 'indisponivel'
  confianca: 'alta' | 'media' | 'baixa'
  coberturaPct: number
  metodologiaVersao: 'saude-financeira-v2'
  calculadoEm: string
  componentes: FinancialHealthComponent[]
  fatores: Array<{ tipo: 'positivo' | 'atencao' | 'critico'; titulo: string; detalhe: string }>
  metricas: {
    capacidadePagamentoPct: number | null
    saldoLivre: string | null
    margemBrutaProjetada: string | null
    margemRealPct: number | null
    dividaPorHa: string | null
    contratosConsiderados: number
    contratosVencidos: number
  }
}

function cents(value: MoneyInput): bigint {
  if (typeof value === 'bigint') return value
  const raw = String(value ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!raw) return 0n
  const negative = raw.startsWith('-')
  const normalized = negative ? raw.slice(1) : raw
  const comma = normalized.lastIndexOf(',')
  const dot = normalized.lastIndexOf('.')
  const separator = Math.max(comma, dot)
  const hasDecimal = separator >= 0 && normalized.length - separator - 1 <= 2
  const integer = (hasDecimal ? normalized.slice(0, separator) : normalized).replace(/\D/g, '') || '0'
  const fraction = `${hasDecimal ? normalized.slice(separator + 1).replace(/\D/g, '') : ''}00`.slice(0, 2)
  const result = BigInt(integer) * 100n + BigInt(fraction)
  return negative ? -result : result
}

function decimal(value: bigint): string {
  const negative = value < 0n
  const absolute = negative ? -value : value
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

function finite(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function scoreCapacidadePagamento(value: number): number {
  if (value <= 35) return 95
  if (value <= 50) return 85
  if (value <= 70) return 70
  if (value <= 90) return 55
  if (value <= 110) return 40
  if (value <= 140) return 25
  return 10
}

function scoreSaldoSafra(saldo: bigint, margemBruta: bigint): number {
  if (margemBruta <= 0n) return saldo >= 0n ? 65 : 20
  const ratioPct = Number(saldo * 10000n / margemBruta) / 100
  if (ratioPct >= 30) return 95
  if (ratioPct >= 10) return 82
  if (ratioPct >= 0) return 68
  if (ratioPct >= -20) return 48
  if (ratioPct >= -50) return 28
  return 10
}

function scoreMargem(value: number): number {
  if (value >= 50) return 95
  if (value >= 30) return 82
  if (value >= 15) return 68
  if (value >= 5) return 50
  if (value >= 0) return 35
  return 15
}

function scoreDividaPorHa(divida: bigint, areaHa: number): { score: number; valor: bigint } | null {
  if (divida <= 0n || !Number.isFinite(areaHa) || areaHa <= 0) return null
  const areaCentHa = BigInt(Math.max(1, Math.round(areaHa * 100)))
  const centsPorHa = divida * 100n / areaCentHa
  const reaisPorHa = centsPorHa / 100n
  const score = reaisPorHa <= 2500n ? 95
    : reaisPorHa <= 5000n ? 82
    : reaisPorHa <= 10000n ? 68
    : reaisPorHa <= 15000n ? 52
    : reaisPorHa <= 25000n ? 35
    : 18
  return { score, valor: centsPorHa }
}

function scoreDebtStatus(
  debts: FinancialHealthDebt[],
  now: Date,
): { score: number; vencidos: number; considerados: number } | null {
  if (debts.length === 0) return null
  const currentDebts = debts.filter((debt) => {
    const status = String(debt.status || '').toLowerCase()
    return !['paga', 'pago', 'quitada', 'quitado', 'liquidada', 'liquidado', 'encerrada', 'encerrado'].includes(status)
  })
  if (currentDebts.length === 0) return { score: 100, vencidos: 0, considerados: 0 }
  let weighted = 0n
  let totalWeight = 0n
  let fallbackScore = 0
  let vencidos = 0
  const today = now.toISOString().slice(0, 10)

  for (const debt of currentDebts) {
    const status = String(debt.status || '').toLowerCase()
    const vencida = Boolean(debt.vencimento && debt.vencimento < today)
    if (vencida) vencidos += 1
    const itemScore = ['renegociada', 'em_acordo'].includes(status) ? 55
      : vencida ? 20
      : status === 'ativa' || status === 'em_dia' ? 80
      : 60
    const amount = cents(debt.valorAtualizado ?? debt.valorAtual)
    const weight = amount > 0n ? amount : 1n
    weighted += BigInt(itemScore) * weight
    totalWeight += weight
    fallbackScore += itemScore
  }

  return {
    score: totalWeight > 0n ? Number(weighted / totalWeight) : Math.round(fallbackScore / currentDebts.length),
    vencidos,
    considerados: currentDebts.length,
  }
}

function component(
  id: FinancialHealthComponent['id'],
  label: string,
  peso: number,
  score: number | null,
  valor: string,
  leitura: string,
): FinancialHealthComponent {
  return { id, label, peso, score, disponivel: score !== null, valor, leitura }
}

function level(score: number | null): ClienteFinancialHealth['nivel'] {
  if (score === null) return 'indisponivel'
  if (score >= 80) return 'forte'
  if (score >= 65) return 'equilibrada'
  if (score >= 45) return 'atencao'
  if (score >= 30) return 'pressionada'
  return 'critica'
}

function componentReading(score: number | null): string {
  if (score === null) return 'Dados ainda não disponíveis.'
  if (score >= 80) return 'Condição favorável neste indicador.'
  if (score >= 60) return 'Indicador administrável, com acompanhamento.'
  if (score >= 40) return 'Indicador exige atenção do consultor.'
  return 'Pressão relevante sobre a capacidade financeira.'
}

export function calcularSaudeFinanceiraCliente(
  cliente: FinancialHealthClient,
  analise?: AnaliseCliente | null,
  now = new Date(),
): ClienteFinancialHealth {
  const fluxo = analise?.fluxoCaixaSafra
  const capacidadePagamento = finite(fluxo?.capacidadePagamento)
  const saldoLivre = fluxo ? cents(fluxo.saldoLivre) : null
  const margemBruta = fluxo ? cents(fluxo.margemBruta) : null
  const margemReal = finite(analise?.margemCliente?.margemPct)
  const dividaTotal = cents(cliente.valorTotalDivida)
  const area = finite(cliente.areaTotalHa) ?? 0
  const debts = Array.isArray(cliente.dividas) ? cliente.dividas : []
  const debtStatus = scoreDebtStatus(debts, now)
  const density = scoreDividaPorHa(dividaTotal, area)
  const saldoScore = saldoLivre !== null && margemBruta !== null ? scoreSaldoSafra(saldoLivre, margemBruta) : null

  const componentes = [
    component(
      'capacidade_pagamento',
      'Comprometimento da margem',
      25,
      capacidadePagamento === null ? null : scoreCapacidadePagamento(capacidadePagamento),
      capacidadePagamento === null ? 'não calculado' : `${capacidadePagamento.toFixed(1).replace('.', ',')}%`,
      capacidadePagamento === null ? 'Projeção de safra indisponível.' : componentReading(scoreCapacidadePagamento(capacidadePagamento)),
    ),
    component(
      'saldo_safra',
      'Saldo projetado da safra',
      20,
      saldoScore,
      saldoLivre === null ? 'não calculado' : decimal(saldoLivre),
      componentReading(saldoScore),
    ),
    component(
      'situacao_dividas',
      'Situação das dívidas',
      20,
      debtStatus?.score ?? null,
      debts.length ? `${debtStatus?.considerados ?? 0} atual(is) de ${debts.length} contrato(s)` : 'sem contratos',
      debtStatus
        ? `${debtStatus.vencidos} contrato(s) atual(is) com vencimento passado; contratos quitados ficam fora da exposição.`
        : 'Dívidas detalhadas não cadastradas.',
    ),
    component(
      'divida_por_hectare',
      'Dívida por hectare',
      15,
      density?.score ?? null,
      density ? decimal(density.valor) : 'não calculado',
      componentReading(density?.score ?? null),
    ),
    component(
      'margem_real',
      'Margem real do relacionamento',
      20,
      margemReal === null ? null : scoreMargem(margemReal),
      margemReal === null ? 'sem lançamentos' : `${margemReal.toFixed(1).replace('.', ',')}%`,
      margemReal === null ? 'Cadastre receitas e despesas vinculadas ao cliente para elevar a precisão.' : componentReading(scoreMargem(margemReal)),
    ),
  ]

  const available = componentes.filter((item) => item.disponivel && item.score !== null)
  const weight = available.reduce((sum, item) => sum + item.peso, 0)
  const score = weight > 0
    ? Math.round(available.reduce((sum, item) => sum + (item.score ?? 0) * item.peso, 0) / weight)
    : null
  const coberturaPct = Math.min(100, weight)
  const fatores = available
    .map((item) => ({
      tipo: item.score! >= 70 ? 'positivo' as const : item.score! >= 40 ? 'atencao' as const : 'critico' as const,
      titulo: item.label,
      detalhe: `${item.valor}. ${item.leitura}`,
      score: item.score!,
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map(({ score: _score, ...item }) => item)

  return {
    score,
    nivel: level(score),
    confianca: coberturaPct >= 90 ? 'alta' : coberturaPct >= 60 ? 'media' : 'baixa',
    coberturaPct,
    metodologiaVersao: 'saude-financeira-v2',
    calculadoEm: analise?.geradoEm ?? now.toISOString(),
    componentes,
    fatores,
    metricas: {
      capacidadePagamentoPct: capacidadePagamento,
      saldoLivre: saldoLivre === null ? null : decimal(saldoLivre),
      margemBrutaProjetada: margemBruta === null ? null : decimal(margemBruta),
      margemRealPct: margemReal,
      dividaPorHa: density ? decimal(density.valor) : null,
      contratosConsiderados: debtStatus?.considerados ?? 0,
      contratosVencidos: debtStatus?.vencidos ?? 0,
    },
  }
}
