import type { CrmDocumentDebt, DocumentFinancialReview, DocumentEvidence } from '@aletis/shared-types'
import { moneyToCents, parseMoneyPtBr } from '../../../lib/parseMoneyPtBr.js'

const MAX_CENTS = 999999999999999999n
const MONEY_TOKEN = /(?:R\$\s*)?[+-]?\d(?:[\d.,]*\d)?(?:\s*(?:bilh[oõ]es|bilh[aã]o|milh[oõ]es|milh[aã]o|mil|mi|bi)\b)?/gi

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function centsAsMoney(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}

/** Números legados entram apenas como texto; cálculos e saídas usam centavos exatos. */
export function documentMoney(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 90_071_992_547_409)) return undefined
  const text = String(value).trim()
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) return undefined
  const cents = moneyToCents(text)
  return cents === null || cents > MAX_CENTS ? undefined : centsAsMoney(cents)
}

/** Exige igualdade em centavos. Medidas, taxas e números de contrato não são dinheiro. */
export function documentMoneyMatches(snippet: unknown, value: unknown, nature?: 'current' | 'principal' | 'global_current'): boolean {
  const expected = documentMoney(value)
  if (expected === undefined) return false
  const text = String(snippet ?? '')
  for (const match of text.matchAll(MONEY_TOKEN)) {
    const after = text.slice(match.index! + match[0].length)
    if (/^\s*(?:%|ha\b|hectares?\b|sacas?\b|parcelas?\b|dias?\b|meses?\b|anos?\b)/i.test(after)) continue
    const parsed = parseMoneyPtBr(match[0]).amount
    if (parsed !== expected) continue
    const before = normalized(text.slice(Math.max(0, match.index! - 100), match.index!))
    const labels = [...before.matchAll(/saldo(?:\s+(?:devedor|atualizado|atual|total|global|consolidado))?|divida\s+(?:total|atualizada|consolidada)|debito\s+(?:total|atualizado|consolidado)|endividamento\s+(?:total|global|consolidado)|valor\s+(?:atualizado|original|liberado|contratado)|principal|capital\s+inicial/g)]
    const nearest = labels.at(-1)
    const label = nearest?.[0]
    if (nature && nearest && /\d/.test(before.slice(nearest.index! + nearest[0].length))) continue
    const balancePhrase = nearest ? before.slice(nearest.index!) : ''
    if ((nature === 'current' || nature === 'global_current') && (!label || /original|liberado|contratado|principal|inicial/.test(balancePhrase))) continue
    if (nature === 'principal' && (!label || !/original|liberado|contratado|principal|inicial/.test(label))) continue
    if (nature === 'global_current') {
      // O nome de um campo sugerido pela IA não comprova o alcance do saldo.
      // O próprio trecho precisa dizer total/global/consolidado e não limitar o valor a uma operação.
      if (!/\b(?:total|global|consolidad[oa])\b/.test(balancePhrase)) continue
      const scope = normalized(text)
      const operationScope = /\b(?:contratos?|operac(?:ao|oes)|parcelas?|cedulas?|ccb|ccr)\b/.test(scope)
      const directIndividual = /\b(?:do|da|deste|desta|de um|de uma)\s+(?:contrato|operacao|parcela|cedula)\b/.test(scope)
      const allOperations = /\b(?:contratos|operacoes|parcelas|cedulas)\b/.test(scope)
        && /\b(?:todos|todas|global|consolidad[oa])\b/.test(scope)
        && /\b(?:do|da)\s+(?:cliente|titular|devedor|mutuario)\b/.test(scope)
      if (directIndividual || (operationScope && !allOperations)) continue
    }
    if (!nature && !/R\$/i.test(match[0]) && !label && !/^\s*(?:de\s+)?reais\b/i.test(after)) continue
    return true
  }
  return false
}

export function normalizeDocumentDebt(input: Record<string, unknown>): CrmDocumentDebt {
  const { valorOriginal: original, valorAtualizado: current, ...rest } = input
  const valorOriginal = documentMoney(original)
  const valorAtualizado = documentMoney(current)
  return {
    ...rest,
    ...(valorOriginal !== undefined ? { valorOriginal } : {}),
    ...(valorAtualizado !== undefined ? { valorAtualizado } : {}),
  } as CrmDocumentDebt
}

/** Um subtotal de contratos nunca comprova, por si, todo o endividamento do cliente. */
export function buildDocumentFinancialReview(
  debts: ReadonlyArray<Record<string, unknown>>,
  evidence: ReadonlyArray<Pick<DocumentEvidence, 'field' | 'value' | 'trecho' | 'fonte' | 'confianca'>> = [],
): DocumentFinancialReview {
  const pendencias: DocumentFinancialReview['pendencias'] = []
  let principal = 0n
  let saldo = 0n
  let contratosComPrincipal = 0
  let contratosComSaldo = 0
  debts.forEach((debt, index) => {
    for (const field of ['valorOriginal', 'valorAtualizado'] as const) {
      const money = documentMoney(debt[field])
      if (money === undefined) {
        const invalid = debt[field] !== undefined && debt[field] !== null && debt[field] !== ''
        pendencias.push({ campo: `dividas[${index}].${field}`, motivo: invalid ? 'valor_invalido' : 'nao_informado',
          orientacao: field === 'valorAtualizado'
            ? 'Conferir extrato com saldo devedor e data de referência deste contrato.'
            : 'Conferir o valor original no contrato; não copiar o saldo atual para este campo.' })
      } else if (field === 'valorOriginal') {
        principal += moneyToCents(money)!
        contratosComPrincipal++
      } else {
        saldo += moneyToCents(money)!
        contratosComSaldo++
      }
    }
  })
  const totalEvidence = evidence.filter(ev => /^(?:dividaTotal|valorTotalDivida|saldoDevedorTotal|saldoAtualTotal)$/i.test(ev.field)
    && Number.isFinite(ev.confianca) && ev.confianca >= 0.65)
  const totals = new Map<string, typeof totalEvidence[number]>()
  for (const ev of totalEvidence) {
    const fromValue = documentMoney(ev.value)
    const candidates = fromValue === undefined
      ? [...String(ev.trecho ?? '').matchAll(MONEY_TOKEN)].map(match => parseMoneyPtBr(match[0]).amount).filter((v): v is string => v !== null)
      : [fromValue]
    for (const amount of candidates) if (documentMoneyMatches(ev.trecho, amount, 'global_current')) totals.set(amount, ev)
  }
  const saldoAtualTotalComprovado = totals.size === 1 ? totals.keys().next().value as string : undefined
  if (saldoAtualTotalComprovado === undefined) pendencias.push({ campo: 'dividaTotal', motivo: totals.size > 1 ? 'conflito' : 'nao_comprovado',
    orientacao: totals.size > 1
      ? 'Revisar os saldos totais divergentes e suas datas de referência antes de consolidar o cadastro.'
      : 'Obter evidência do saldo devedor total e de sua data de referência; os subtotais abaixo abrangem apenas os contratos extraídos.' })
  return {
    contratosAnalisados: debts.length,
    contratosComPrincipal,
    contratosComSaldo,
    ...(contratosComPrincipal ? { principalDocumentado: centsAsMoney(principal) } : {}),
    ...(contratosComSaldo ? { saldoAtualDocumentado: centsAsMoney(saldo) } : {}),
    ...(saldoAtualTotalComprovado !== undefined ? { saldoAtualTotalComprovado } : {}),
    coberturaSaldos: !contratosComSaldo ? 'ausente' : contratosComSaldo === debts.length ? 'completa_nos_contratos_extraidos' : 'parcial',
    pendencias,
    exigeRevisao: true,
    observacao: 'Valores documentais preparados para revisão. Principal e saldo atual têm naturezas diferentes; os subtotais não representam automaticamente toda a dívida do cliente.',
  }
}
