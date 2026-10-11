/** Engine de recálculo de proposta de acordo.
 * Aritmética monetária em centavos e fatores em escala 1e18 para evitar
 * deriva de ponto flutuante. Datas são calendários civis (UTC internamente).
 */
const FACTOR_SCALE = 1_000_000_000_000_000_000n
// 12 casas nos intermediários; somente a saída é arredondada para centavos.
const MONEY_SCALE = 1_000_000_000_000n

export interface RecalculoIndiceMensal {
  periodo: string // YYYY-MM
  taxaMensal: string
  fatorMensal?: string
  fatorAcumulado: string
  fonte?: string
  sourceUrl?: string
  fetchedAt?: string
}

export interface RecalculoAcordoParcelaInput { id: string; vencimento: string; valorOriginal: string }
export interface RecalculoAcordoInput {
  indiceCode: string
  corrigirAte: string
  moraMensalPct: string
  parcelas: RecalculoAcordoParcelaInput[]
  serie: RecalculoIndiceMensal[]
  compatibilidadePlanilha?: boolean
}

export interface RecalculoAcordoLinha {
  id: string; vencimento: string; valorOriginal: string; prazoDias: number
  periodoBase: string; fatorBase: string; fatorFinal: string; fatorCorrecao: string
  percentualCorrecao: string; valorCorrecao: string; capitalCorrigido: string
  percentualMora: string; valorMora: string; correcaoMaisMora: string; totalAtualizado: string
}
export interface RecalculoAcordoResultado {
  principalOriginal: string; correcaoMonetaria: string; mora: string
  acrescimoTotal: string; totalAtualizado: string; linhas: RecalculoAcordoLinha[]
  metodologia: { inicioCorrecao: 'mes_subsequente'; mora: 'simples_prorata_30'; fatorFinal: string }
}

function decimalToScaled(value: string | number, scale: bigint): bigint {
  const raw = String(value).trim().replace(/\s/g, '')
  if (!raw || !/^-?\d+(?:[.,]\d+)?$/.test(raw)) throw new Error('Número decimal inválido.')
  const negative = raw.startsWith('-')
  const unsigned = negative ? raw.slice(1) : raw
  const [integer, fraction = ''] = unsigned.replace(',', '.').split('.')
  const scaleDigits = String(scale).length - 1
  const padded = (fraction || '').padEnd(scaleDigits, '0')
  const kept = padded.slice(0, scaleDigits)
  const next = padded[scaleDigits]
  let fractionValue = BigInt(kept || '0')
  if (next && Number(next) >= 5) fractionValue += 1n
  const result = BigInt(integer) * scale + fractionValue
  return negative ? -result : result
}

function scaledToDecimal(value: bigint, scale: bigint, decimals: number): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const integer = abs / scale
  const fraction = ((abs % scale) * 10n ** BigInt(decimals)) / scale
  return `${negative ? '-' : ''}${integer}.${fraction.toString().padStart(decimals, '0')}`
}

function moneyCents(value: string): bigint { return decimalToScaled(value, MONEY_SCALE) }
function money(cents: bigint): string {
  const rounded = (cents + MONEY_SCALE / 200n) / (MONEY_SCALE / 100n)
  return scaledToDecimal(rounded, 100n, 2)
}
function factor(value: string): bigint { return decimalToScaled(value, FACTOR_SCALE) }
function factorText(value: bigint): string { return scaledToDecimal(value, FACTOR_SCALE, 12) }
function pct(value: bigint): string { return scaledToDecimal(value, FACTOR_SCALE, 8) }

function dateParts(value: string): [number, number, number] {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value.slice(0, 10))
  if (!match) throw new Error(`Data inválida: ${value}`)
  const [year, month, day] = match.slice(1).map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) throw new Error(`Data inválida: ${value}`)
  return [year, month, day]
}
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = dateParts(a); const [by, bm, bd] = dateParts(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}
function monthAfter(date: string): string {
  const [year, month] = dateParts(date)
  const next = new Date(Date.UTC(year, month, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}
function ratio(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error('Fator-base inválido.')
  return (a * FACTOR_SCALE) / b
}
function moneyTimesFactor(cents: bigint, f: bigint): bigint { return (cents * f) / FACTOR_SCALE }

export function calcularRecalculoAcordo(input: RecalculoAcordoInput): RecalculoAcordoResultado {
  if (!input.indiceCode || !input.corrigirAte || input.serie.length === 0) throw new Error('Índice e série histórica são obrigatórios.')
  if (input.parcelas.length === 0) throw new Error('Informe ao menos uma parcela.')
  const ids = new Set<string>()
  for (const parcela of input.parcelas) {
    if (!parcela.id || ids.has(parcela.id)) throw new Error('As parcelas devem possuir identificadores únicos.')
    ids.add(parcela.id)
  }
  const finalPeriod = input.corrigirAte.slice(0, 7)
  const finalPoint = input.serie.find((point) => point.periodo === finalPeriod)
  if (!finalPoint) throw new Error(`Não há índice oficial disponível para ${finalPeriod}.`)
  const finalFactor = factor(finalPoint.fatorAcumulado)
  const moraMonthly = decimalToScaled(input.moraMensalPct, FACTOR_SCALE) / 100n
  const dailyMora = moraMonthly / 30n
  let principalRaw = 0n
  let correctionRaw = 0n
  let lateRaw = 0n
  let totalRaw = 0n
  const linhas = input.parcelas.map((parcela) => {
    const principal = moneyCents(parcela.valorOriginal)
    if (principal <= 0n) throw new Error('Valor original deve ser maior que zero.')
    const prazoDias = daysBetween(parcela.vencimento, input.corrigirAte)
    if (prazoDias < 0) throw new Error('Data final não pode ser anterior ao vencimento.')
    const periodoBase = monthAfter(parcela.vencimento)
    const base = input.serie.find((point) => point.periodo === periodoBase)
    if (!base) throw new Error(`Índice-base ausente para ${periodoBase}.`)
    const baseFactor = factor(base.fatorAcumulado)
    const correctionFactor = ratio(finalFactor, baseFactor)
    const correctionPct = correctionFactor - FACTOR_SCALE
    const correctedCapital = moneyTimesFactor(principal, correctionFactor)
    const correction = correctedCapital - principal
    const moraPct = dailyMora * BigInt(prazoDias)
    const moraValue = moneyTimesFactor(correctedCapital, moraPct)
    principalRaw += principal
    correctionRaw += correction
    lateRaw += moraValue
    totalRaw += correctedCapital + moraValue
    return {
      id: parcela.id, vencimento: parcela.vencimento, valorOriginal: money(principal), prazoDias,
      periodoBase, fatorBase: factorText(baseFactor), fatorFinal: factorText(finalFactor), fatorCorrecao: factorText(correctionFactor),
      percentualCorrecao: pct(correctionPct), valorCorrecao: money(correction), capitalCorrigido: money(correctedCapital),
      percentualMora: pct(moraPct), valorMora: money(moraValue), correcaoMaisMora: money(correction + moraValue), totalAtualizado: money(correctedCapital + moraValue),
    }
  })
  return { principalOriginal: money(principalRaw), correcaoMonetaria: money(correctionRaw), mora: money(lateRaw), acrescimoTotal: money(correctionRaw + lateRaw), totalAtualizado: money(totalRaw), linhas, metodologia: { inicioCorrecao: 'mes_subsequente', mora: 'simples_prorata_30', fatorFinal: factorText(finalFactor) } }
}

export const RECALCULO_INDICES_REGISTRY = [
  { code: 'INPC', name: 'INPC', provider: 'IBGE', providerSeriesId: 'SIDRA:7063:44', frequency: 'MONTHLY', unit: 'PERCENT', sourceUrl: 'https://sidra.ibge.gov.br/tabela/7063' },
  { code: 'IPCA', name: 'IPCA', provider: 'IBGE', providerSeriesId: 'SIDRA:7060:63', frequency: 'MONTHLY', unit: 'PERCENT', sourceUrl: 'https://sidra.ibge.gov.br/tabela/7060' },
  { code: 'IPCA-E', name: 'IPCA-E', provider: 'IBGE', providerSeriesId: 'IBGE:IPCA-E', frequency: 'MONTHLY', unit: 'PERCENT', sourceUrl: 'https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9262-indice-nacional-de-precos-ao-consumidor-amplo-especial.html' },
  { code: 'SELIC', name: 'SELIC', provider: 'BCB_SGS', providerSeriesId: 'BCB:1178', frequency: 'DAILY', unit: 'PERCENT', sourceUrl: 'https://www.bcb.gov.br/estabilidadefinanceira/sgs' },
  { code: 'TR', name: 'TR', provider: 'BCB_SGS', providerSeriesId: 'BCB:226', frequency: 'DAILY', unit: 'PERCENT', sourceUrl: 'https://www.bcb.gov.br/estabilidadefinanceira/sgs' },
  { code: 'CDI', name: 'CDI', provider: 'BCB_SGS', providerSeriesId: 'BCB:4389', frequency: 'DAILY', unit: 'PERCENT', sourceUrl: 'https://www.bcb.gov.br/estabilidadefinanceira/sgs' },
  { code: 'IGP-M', name: 'IGP-M', provider: 'FGV_IBRE', providerSeriesId: 'FGV:11126', frequency: 'MONTHLY', unit: 'PERCENT', sourceUrl: 'https://portalibre.fgv.br/' },
] as const
