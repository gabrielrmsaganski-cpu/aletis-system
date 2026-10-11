export interface ParsedMoneyPtBr {
  /** Valor decimal canônico em reais, sem perda de precisão binária. */
  amount: string | null
  issue?: 'missing' | 'invalid' | 'ambiguous'
  matchedText?: string
}

const MAX_CENTS = 999999999999999999n
const SCALES: Record<string, bigint> = {
  mil: 1000n,
  milhao: 1000000n,
  milhoes: 1000000n,
  mi: 1000000n,
  bilhao: 1000000000n,
  bilhoes: 1000000000n,
  bi: 1000000000n,
}

export function moneyToCents(amount: string): bigint | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return null
  const [integer, decimal = ''] = amount.split('.')
  return BigInt(integer) * 100n + BigInt(decimal.padEnd(2, '0'))
}

/** Aceita um valor informado; nunca escolhe silenciosamente um extremo de faixa. */
export function parseMoneyPtBr(text: string): ParsedMoneyPtBr {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const tokens = [...normalized.matchAll(/(?:r\$\s*)?[-+]?\d(?:[\d.,]*\d)?(?:\s*(?:bilhoes|bilhao|milhoes|milhao|mil|mi|bi)\b)?(?:\s*(?:de\s+)?reais\b)?/g)]
  if (!tokens.length) return { amount: null, issue: 'missing' }
  if (tokens.length !== 1 || /\b(entre|ate|acima|abaixo|mais de|menos de)\b|[<>]/.test(normalized)) {
    return { amount: null, issue: 'ambiguous' }
  }
  const match = tokens[0]
  const remainder = normalized.slice(match.index! + match[0].length)
  if (/^\s*(?:%|hectares?\b|ha\b|anos?\b|meses?\b|parcelas?\b|sacas?\b)/.test(remainder)) {
    return { amount: null, issue: 'invalid' }
  }
  const matchedText = text.slice(match.index!, match.index! + match[0].length)
  const token = match[0].replace(/^r\$\s*/, '').trim()
  if (token.startsWith('-')) return { amount: null, issue: 'invalid', matchedText }
  const parts = token.match(/^\+?(\d[\d.,]*)(?:\s*(bilhoes|bilhao|milhoes|milhao|mil|mi|bi))?(?:\s*(?:de\s+)?reais)?$/)
  if (!parts) return { amount: null, issue: 'invalid', matchedText }
  let numeral = parts[1]
  const scale = SCALES[parts[2]] || 1n
  // Ponto com grupos de três é milhar; vírgula é sempre o decimal brasileiro.
  if (numeral.includes(',')) {
    if (!/^\d+(?:\.\d{3})*(?:,\d+)?$/.test(numeral)) return { amount: null, issue: 'invalid', matchedText }
    numeral = numeral.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(numeral)) {
    numeral = numeral.replace(/\./g, '')
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(numeral)) {
    return { amount: null, issue: 'invalid', matchedText }
  }
  const [integer, decimal = ''] = numeral.split('.')
  if (integer.length > 18 || decimal.length > 9) return { amount: null, issue: 'invalid', matchedText }
  const divisor = 10n ** BigInt(decimal.length)
  const scaled = BigInt(integer + decimal) * scale * 100n
  // Frações de centavo não são arredondadas sem uma regra de negócio explícita.
  if (scaled % divisor !== 0n) return { amount: null, issue: 'ambiguous', matchedText }
  const cents = scaled / divisor
  if (cents > MAX_CENTS) return { amount: null, issue: 'invalid', matchedText }
  return { amount: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`, matchedText }
}
