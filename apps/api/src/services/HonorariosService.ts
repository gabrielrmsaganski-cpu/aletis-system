/**
 * HonorariosService — modelagem e projeção de honorários ALETIS.
 *
 * Espelho do que o ContratoGenerator descreve no PDF, mas vivo: cliente
 * vê quanto deve, quanto pagou, quando é a próxima parcela e qual o
 * êxito estimado em cima da economia atual. Não substitui faturamento
 * formal — só dá visibilidade ao cliente do que foi acordado.
 */
import { randomBytes } from 'node:crypto'

export type ModeloHonorarios =
  | 'fixo'
  | 'mensal'
  | 'exito'
  | 'hibrido_fixo_exito'
  | 'hibrido_mensal_exito'

export type BaseCalculoExito = 'economia_total' | 'reducao_saldo' | 'valor_renegociado'

export type StatusParcela = 'aberto' | 'pago' | 'atrasado' | 'cancelado'

export type TipoParcela = 'fixo' | 'mensalidade' | 'sucesso'

export interface HonorarioParcela {
  id: string
  tipo: TipoParcela
  valor: number
  vencimento: string
  status: StatusParcela
  pagoEm?: string
  meioPagamento?: string
  descricao?: string
  observacao?: string
  registradoPor?: string
}

export interface HonorariosCliente {
  modelo: ModeloHonorarios
  /** Texto curto descrevendo a regra acordada (gerado em runtime se vazio). */
  descricao?: string
  honorarioFixo?: number
  mensalidade?: number
  mesesRetainer?: number
  percentualExito?: number
  baseCalculoExito?: BaseCalculoExito
  pisoExito?: number
  tetoExito?: number
  /** Vigência da contratação (data de assinatura → previsão de término). */
  vigencia: {
    inicio: string
    fim?: string
  }
  /** Parcelas registradas (geradas no setup ou avulsas). */
  parcelas: HonorarioParcela[]
  /** Última atualização do registro (para auditoria). */
  atualizadoEm?: string
}

export interface SuccessFeeProjecao {
  pct: number
  baseCalculo: BaseCalculoExito
  baseValor: number
  estimado: number
  piso?: number
  teto?: number
  /** True quando o piso ou teto efetivamente alterou o cálculo bruto. */
  ajustado: boolean
}

export interface ProximaCobranca {
  parcelaId: string
  tipo: TipoParcela
  valor: number
  vencimento: string
  diasParaVencer: number
  atrasada: boolean
  descricao?: string
}

export interface HonorariosProjecao {
  modelo: ModeloHonorarios
  descricaoHumana: string
  vigencia: { inicio: string; fim?: string }
  valorTotal: number
  valorPago: number
  valorAberto: number
  pctPago: number
  proximaCobranca: ProximaCobranca | null
  successFee: SuccessFeeProjecao | null
  parcelas: HonorarioParcela[]
  alertas: string[]
}

export function novoIdParcela(): string {
  return `hp-${Date.now()}-${randomBytes(3).toString('hex')}`
}

export function descreverModelo(h: HonorariosCliente): string {
  if (h.descricao && h.descricao.trim()) return h.descricao.trim()
  const fmt = (v?: number) =>
    typeof v === 'number'
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
      : '—'
  switch (h.modelo) {
    case 'fixo':
      return `Honorário fixo de ${fmt(h.honorarioFixo)} pelo trabalho contratado.`
    case 'mensal':
      return `Mensalidade de ${fmt(h.mensalidade)} durante ${h.mesesRetainer ?? 12} meses.`
    case 'exito':
      return `Sem cobrança fixa — apenas ${h.percentualExito ?? 0}% sobre a economia obtida.`
    case 'hibrido_fixo_exito':
      return `Entrada de ${fmt(h.honorarioFixo)} + ${h.percentualExito ?? 0}% sobre a economia.`
    case 'hibrido_mensal_exito':
      return `Mensalidade de ${fmt(h.mensalidade)} por ${h.mesesRetainer ?? 12} meses + ${h.percentualExito ?? 0}% sobre a economia.`
    default:
      return 'Modelo de honorários personalizado.'
  }
}

/** Soma valores. Helper trivial para clareza nos cálculos. */
function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0)
}

function clamp(value: number, min?: number, max?: number): { value: number; ajustado: boolean } {
  let v = value
  let ajustado = false
  if (typeof min === 'number' && v < min) {
    v = min
    ajustado = true
  }
  if (typeof max === 'number' && v > max) {
    v = max
    ajustado = true
  }
  return { value: v, ajustado }
}

/**
 * Calcula o êxito estimado a partir da base atual.
 * - economia_total: Σ max(0, valorOriginal − valorAtualizado)
 * - reducao_saldo: economia (mesmo valor)  — alias mais legível
 * - valor_renegociado: valorTotalDivida (proxy do valor renegociado)
 *
 * Sempre clampa entre piso/teto.
 */
export function calcularSuccessFee(
  h: HonorariosCliente,
  contrato: { economia: number; saldoEmAberto: number; valorTotalDivida: number },
): SuccessFeeProjecao | null {
  if (!h.percentualExito || h.percentualExito <= 0) return null
  const base: BaseCalculoExito = h.baseCalculoExito ?? 'economia_total'
  const baseValor =
    base === 'valor_renegociado'
      ? contrato.valorTotalDivida
      : contrato.economia // economia_total === reducao_saldo na nossa modelagem
  const bruto = (baseValor * h.percentualExito) / 100
  const { value: estimado, ajustado } = clamp(bruto, h.pisoExito, h.tetoExito)
  return {
    pct: h.percentualExito,
    baseCalculo: base,
    baseValor,
    estimado,
    piso: h.pisoExito,
    teto: h.tetoExito,
    ajustado,
  }
}

/**
 * Atualiza status das parcelas em runtime baseado na data atual.
 * Não muta o array original — devolve cópia.
 */
function reconciliarStatusParcelas(parcelas: HonorarioParcela[]): HonorarioParcela[] {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return parcelas.map((p) => {
    if (p.status === 'pago' || p.status === 'cancelado') return p
    const venc = new Date(p.vencimento)
    venc.setHours(0, 0, 0, 0)
    if (venc < hoje && p.status === 'aberto') {
      return { ...p, status: 'atrasado' as StatusParcela }
    }
    return p
  })
}

function ordenarVencimento(parcelas: HonorarioParcela[]): HonorarioParcela[] {
  return [...parcelas].sort((a, b) => a.vencimento.localeCompare(b.vencimento))
}

function diasEntre(deISO: string, ateISO: string): number {
  const a = new Date(deISO).getTime()
  const b = new Date(ateISO).getTime()
  return Math.round((b - a) / (24 * 60 * 60 * 1000))
}

/**
 * Projeta a visão de honorários para o cliente. Inclui successFee
 * estimado mesmo quando ainda não há parcela registrada (transparência).
 */
export function projetarHonorarios(
  h: HonorariosCliente,
  contrato: { economia: number; saldoEmAberto: number; valorTotalDivida: number; valorTotalPago: number },
): HonorariosProjecao {
  const reconciliadas = reconciliarStatusParcelas(h.parcelas ?? [])
  const ordenadas = ordenarVencimento(reconciliadas)
  const successFee = calcularSuccessFee(h, contrato)

  const valorPago = sum(ordenadas.filter((p) => p.status === 'pago').map((p) => p.valor))

  // Valor total previsto: soma das parcelas conhecidas (já pagas + abertas)
  // + estimativa de êxito se ainda não houver parcela tipo='sucesso'.
  const totalParcelasConhecidas = sum(ordenadas.filter((p) => p.status !== 'cancelado').map((p) => p.valor))
  const jaTemParcelaSucesso = ordenadas.some((p) => p.tipo === 'sucesso' && p.status !== 'cancelado')
  const valorTotal = jaTemParcelaSucesso
    ? totalParcelasConhecidas
    : totalParcelasConhecidas + (successFee?.estimado ?? 0)
  const valorAberto = Math.max(0, valorTotal - valorPago)
  const pctPago = valorTotal > 0 ? Math.min(100, (valorPago / valorTotal) * 100) : 0

  // Próxima cobrança = primeira parcela aberta/atrasada por vencimento.
  const candidata = ordenadas.find((p) => p.status === 'aberto' || p.status === 'atrasado')
  const hoje = new Date().toISOString().slice(0, 10)
  const proximaCobranca: ProximaCobranca | null = candidata
    ? {
        parcelaId: candidata.id,
        tipo: candidata.tipo,
        valor: candidata.valor,
        vencimento: candidata.vencimento,
        diasParaVencer: diasEntre(hoje, candidata.vencimento),
        atrasada: candidata.status === 'atrasado',
        descricao: candidata.descricao,
      }
    : null

  const alertas: string[] = []
  const atrasadas = ordenadas.filter((p) => p.status === 'atrasado')
  if (atrasadas.length > 0) {
    alertas.push(
      atrasadas.length === 1
        ? '1 parcela está em atraso. Entre em contato para regularizar.'
        : `${atrasadas.length} parcelas estão em atraso. Entre em contato para regularizar.`,
    )
  }
  if (successFee?.ajustado) {
    alertas.push(
      successFee.estimado === successFee.piso
        ? `Êxito atingiu o piso contratado (${formatBRL(successFee.piso ?? 0)}).`
        : `Êxito atingiu o teto contratado (${formatBRL(successFee.teto ?? 0)}).`,
    )
  }

  return {
    modelo: h.modelo,
    descricaoHumana: descreverModelo(h),
    vigencia: h.vigencia,
    valorTotal,
    valorPago,
    valorAberto,
    pctPago,
    proximaCobranca,
    successFee,
    parcelas: ordenadas,
    alertas,
  }
}

function formatBRL(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

/**
 * Helper para gerar parcelas iniciais a partir do modelo. Útil quando o
 * consultor define o modelo pela primeira vez — preencher mensalidades.
 */
export function gerarParcelasIniciais(
  h: Omit<HonorariosCliente, 'parcelas'>,
): HonorarioParcela[] {
  const out: HonorarioParcela[] = []
  const inicio = new Date(h.vigencia.inicio)

  // Honorário fixo: 1 parcela na assinatura
  if ((h.modelo === 'fixo' || h.modelo === 'hibrido_fixo_exito') && h.honorarioFixo) {
    out.push({
      id: novoIdParcela(),
      tipo: 'fixo',
      valor: h.honorarioFixo,
      vencimento: inicio.toISOString().slice(0, 10),
      status: 'aberto',
      descricao: 'Honorário fixo (entrada).',
    })
  }

  // Mensalidades
  if ((h.modelo === 'mensal' || h.modelo === 'hibrido_mensal_exito') && h.mensalidade && h.mesesRetainer) {
    for (let i = 0; i < h.mesesRetainer; i++) {
      const venc = new Date(inicio)
      venc.setMonth(venc.getMonth() + i)
      out.push({
        id: novoIdParcela(),
        tipo: 'mensalidade',
        valor: h.mensalidade,
        vencimento: venc.toISOString().slice(0, 10),
        status: 'aberto',
        descricao: `Mensalidade ${i + 1}/${h.mesesRetainer}`,
      })
    }
  }

  return out
}
