// Verificação determinística complementar: cobre valores tipados e confirmações
// explícitas. Não substitui a verificação semântica de todas as afirmações.
import { moneyToCents, parseMoneyPtBr } from '../../../lib/parseMoneyPtBr.js'

const CPF_RX = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g
const CNPJ_RX = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g
const MONEY_RX = /R\$\s*[+-]?\d(?:[\d.,]*\d)?(?:\s*(?:bilh[oõ]es|bilh[aã]o|milh[oõ]es|milh[aã]o|mil|mi|bi)\b)?|[+-]?\b\d(?:[\d.,]*\d)?(?:\s*(?:bilh[oõ]es|bilh[aã]o|milh[oõ]es|milh[aã]o|mil|mi|bi)\b)?\s+(?:de\s+)?reais\b/gi
const PCT_RX = /[+-]?\b\d+(?:[.,]\d+)?\s?%/g
const URL_RX = /https?:\/\/[^\s)\]}>,]+/gi
const APPROVAL_RX = /\b(?:o[ \t]+banco(?:[ \t]+[\p{L}\p{N}'’-]+){0,6}[ \t]+aprovou|(?:a[ \t]+(?:proposta|opera[cç][aã]o|renegocia[cç][aã]o)|o[ \t]+(?:cr[eé]dito|financiamento|contrato))[ \t]+(?:foi|est[aá])[ \t]+aprovad[oa])\b/giu
const NON_MONEY_FIELD_RX = /hectare|area|quantidade|qtd|qtde|count|score|prazo|numero|data|dias|meses|anos|percent|pct/
const APPROVAL_CONTEXT_RX = /proposta|credito|financiamento|banco|contrato|operacao|renegociacao/
const SIMULATION_CONTEXT_RX = /simulacao|simulad[oa]|preview|rascunho/
type GroundingKind = 'cpf' | 'cnpj' | 'valor' | 'percentual' | 'url' | 'confirmacao'

export interface GroundingFlag {
  kind: GroundingKind
  sample: string
}

export interface GroundingReport {
  ok: boolean
  flags: GroundingFlag[]
  warning?: string
}

export interface GroundingContext {
  userText?: string
  toolResults?: unknown[]
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function digits(value: string): string {
  return value.replace(/\D/g, '')
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function currencyCents(value: string, canonical = false): bigint | null {
  // Campos financeiros precisam conter um valor, não um número dentro de uma descrição.
  if (canonical && !/^\s*(?:R\$\s*)?[+-]?\d(?:[\d.,]*\d)?(?:\s*(?:bilh[oõ]es|bilh[aã]o|milh[oõ]es|milh[aã]o|mil|mi|bi)\b)?(?:\s+(?:de\s+)?reais)?\s*$/i.test(value)) return null
  const negative = /^\s*(?:R\$\s*)?-/i.test(value)
  const unsigned = value.replace(/^(\s*(?:R\$\s*)?)-/i, '$1')
  const amount = canonical && /^\d+(?:\.\d{1,2})?$/.test(unsigned)
    ? unsigned
    : parseMoneyPtBr(unsigned).amount
  const cents = amount === null ? null : moneyToCents(amount)
  return cents === null ? null : negative ? -cents : cents
}

function percentage(value: string): string | null {
  const match = value.trim().match(/^([+-]?\d+)(?:[.,](\d+))?\s*%?$/)
  if (!match) return null
  const fraction = (match[2] || '').replace(/0+$/, '')
  const integer = BigInt(match[1].replace(/^[+-]/, '')).toString()
  const sign = match[1].startsWith('-') && (integer !== '0' || fraction) ? '-' : ''
  return `${sign}${integer}${fraction ? `.${fraction}` : ''}`
}

function approvalClaims(value: string): string[] {
  const claims: string[] = []
  for (const match of value.matchAll(APPROVAL_RX)) {
    const index = match.index!
    // Pontos de milhar e decimais não encerram uma pergunta sobre um valor.
    const tail = value.slice(index + match[0].length).match(/^(?:[^.!?\n]|\.(?=\d))*/)?.[0] || ''
    const sample = match[0] + tail
    const before = normalized(value.slice(0, index).split(/[!?;\n]|\.(?!\d)/).at(-1) || '')
      .split(/\b(?:mas|porem|contudo|entretanto)\b/).at(-1) || ''
    if (value[index + sample.length] === '?') continue
    if (/\b(?:nao|nunca|jamais|tampouco|nenhum[ao]?|talvez)\b/.test(normalized(match[0]))) continue
    if (/\b(?:se|caso|quando|talvez|supondo|hipoteticamente|possivel|improvavel|nao|nunca|jamais|fals[oa]|mentira|duvida|duvido)\b/.test(before)) continue
    if (/\bsem\s+(?:confirmacao|certeza|evidencia|saber)\b|\b(?:pode|poderia)\s+(?:ser|ter)\b/.test(before)) continue
    if (/\b(?:se|caso|quando)\b/.test(normalized(tail))) continue
    claims.push(sample)
  }
  return claims
}

function collectEvidence(context: GroundingContext) {
  const money = new Set<bigint>()
  const percentages = new Set<string>()
  const text: string[] = []
  let hasApproval = false
  const visited = new WeakSet<object>()
  const addText = (value: string, returned: boolean) => {
    text.push(value)
    if (returned && approvalClaims(value).length) hasApproval = true
    for (const sample of value.match(MONEY_RX) || []) {
      const cents = currencyCents(sample)
      if (cents !== null) money.add(cents)
    }
    for (const sample of value.match(PCT_RX) || []) {
      const pct = percentage(sample)
      if (pct !== null) percentages.add(pct)
    }
  }
  const walk = (value: unknown, field = '', path = '', unit = '', currency = '') => {
    if (value == null) return
    if (typeof value === 'object') {
      if (visited.has(value)) return
      visited.add(value)
      if (Array.isArray(value)) value.forEach(item => walk(item, field, path, unit, currency))
      else {
        const fields = Object.entries(value)
        const unitValue = fields.find(([name]) => /^(?:unidade|unit)$/i.test(name))?.[1]
        const currencyValue = fields.find(([name]) => /^(?:moeda|currency)$/i.test(name))?.[1]
        const sourceUnit = typeof unitValue === 'string' ? normalized(unitValue).trim() : unit
        const sourceCurrency = typeof currencyValue === 'string' ? normalized(currencyValue).trim() : currency
        for (const [name, item] of fields) {
          // Argumentos propostos pelo modelo não comprovam o resultado de uma ação.
          if (/^(?:input|params|parameters|arguments|args|tool_?(?:arguments|input|args))$/i.test(name)) continue
          walk(item, name, `${path}.${name}`, sourceUnit, sourceCurrency)
        }
      }
      return
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return
    const raw = String(value)
    const sourcePath = normalized(path)
    const isSimulation = SIMULATION_CONTEXT_RX.test(sourcePath)
    addText(raw, !isSimulation)
    const name = normalized(field)
    const isPercentage = /percent|pct|taxa|variacao|jurosaa|jurosam/.test(name)
    const isGenericValue = /^(?:valor|value|amount|total)$/.test(name)
    const isNonMoney = NON_MONEY_FIELD_RX.test(name)
      || (isGenericValue && NON_MONEY_FIELD_RX.test(sourcePath))
    const isBrl = !currency || /^(?:brl|r\$|real|reais)$/.test(currency)
    const isMoneyUnit = !unit || /^(?:brl|r\$|real|reais)$/.test(unit)
    const isPercentageUnit = /^(?:%|percent|percentage|percentual|porcentagem)$/.test(unit)
    const isMoney = !isPercentage && !isNonMoney && isBrl && isMoneyUnit
      && (/valor|saldo|divida|receita|despesa|custo|preco|montante|capital|principal|faturamento|limitecredito/.test(name)
        || (isGenericValue && !!unit))
    if (isMoney) {
      const cents = currencyCents(raw, true)
      if (cents !== null) money.add(cents)
    }
    if ((!unit && isPercentage) || (isPercentageUnit && (isPercentage || isGenericValue))) {
      const pct = percentage(raw)
      if (pct !== null) percentages.add(pct)
    }
    // Apenas estados exatos, em contexto bancário/contratual, comprovam aprovação.
    if (!isSimulation && /^(?:status|situacao)$/.test(name) && APPROVAL_CONTEXT_RX.test(sourcePath)
      && /^(?:aprovad[ao]|approved)$/.test(normalized(raw).trim())) hasApproval = true
  }
  if (context.userText) addText(context.userText, false)
  for (const result of context.toolResults || []) walk(result)
  return { money, percentages, text: text.join('\n'), hasApproval }
}

export function groundingGuardrail(reply: string, context: GroundingContext = {}): GroundingReport {
  const evidence = collectEvidence(context)
  const source = evidence.text
  const sourceIdentifiers = new Set([
    ...(source.match(CPF_RX) || []), ...(source.match(CNPJ_RX) || []),
  ].map(digits))
  const sourceUrls = new Set((source.match(URL_RX) || []).map((url) => url.toLowerCase()))
  const flags: GroundingFlag[] = []

  for (const sample of unique(reply.match(CPF_RX) || [])) {
    if (!sourceIdentifiers.has(digits(sample))) flags.push({ kind: 'cpf', sample })
  }
  for (const sample of unique(reply.match(CNPJ_RX) || [])) {
    if (!sourceIdentifiers.has(digits(sample))) flags.push({ kind: 'cnpj', sample })
  }
  for (const sample of unique(reply.match(MONEY_RX) || [])) {
    const cents = currencyCents(sample)
    if (cents === null || !evidence.money.has(cents)) flags.push({ kind: 'valor', sample })
  }
  for (const sample of unique(reply.match(PCT_RX) || [])) {
    const pct = percentage(sample)
    if (pct === null || !evidence.percentages.has(pct)) flags.push({ kind: 'percentual', sample })
  }
  for (const sample of unique(reply.match(URL_RX) || [])) {
    if (!sourceUrls.has(sample.toLowerCase())) flags.push({ kind: 'url', sample })
  }

  // Escopo deliberadamente restrito a declarações afirmativas de aprovação.
  // Uma simulação, solicitação ou estado "em análise" não comprova aprovação.
  for (const sample of unique(approvalClaims(reply))) {
    if (!evidence.hasApproval) flags.push({ kind: 'confirmacao', sample })
  }

  if (!flags.length) return { ok: true, flags: [] }
  return {
    ok: false,
    flags,
    warning: `A validação da ALIX removeu ${flags.length} dado(s) objetivo(s) sem evidência recuperada nesta execução.`,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function enforceGrounding(reply: string, report: GroundingReport): string {
  if (report.ok) return reply
  let safeReply = reply
  for (const flag of [...report.flags].sort((a, b) => b.sample.length - a.sample.length)) {
    safeReply = safeReply.replace(new RegExp(escapeRegExp(flag.sample), 'g'), '[dado não validado]')
  }
  return `${safeReply.trim()}\n\n> **Validação de evidências:** ${report.warning}`
}
