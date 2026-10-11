import { parseMoneyPtBr } from '../../lib/parseMoneyPtBr.js'

/**
 * Adaptador da interface numérica legada dos modelos bancários.
 * Strings do PG usam ponto decimal; removê-lo multiplicava saldos por 100.
 * Ponto isolado tem precedência canônica (inclusive áreas com 3+ casas).
 * Vírgula ou R$ explicitam formato brasileiro. Não faz cálculos monetários.
 */
export function parseDossieNumericValue(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || !value.trim()) return undefined
  const input = value.trim()
  let canonical: string | undefined
  if (/^[+-]?\d+(?:\.\d+)?$/.test(input)) {
    canonical = input
  } else {
    const currency = /^R\$\s*([+-]?\d[\d.,]*)$/i.exec(input)
    const numeric = currency?.[1] ?? input
    const negative = numeric.startsWith('-')
    const unsigned = numeric.replace(/^[+-]/, '')
    // Não captura um número dentro de uma data, unidade ou frase.
    const brazilian = /^(?:\d{1,3}(?:\.\d{3})+|\d+),\d+$/.test(unsigned)
    const groupedInteger = /^\d{1,3}(?:\.\d{3}){2,}$/.test(unsigned)
    if (!currency && !brazilian && !groupedInteger) return undefined
    if (currency || (brazilian && unsigned.split(',')[1].length <= 2) || groupedInteger) {
      const parsed = parseMoneyPtBr(`${currency ? 'R$ ' : ''}${unsigned}`)
      if (parsed.amount === null || parsed.matchedText?.trim() !== `${currency ? 'R$ ' : ''}${unsigned}`) return undefined
      canonical = `${negative ? '-' : ''}${parsed.amount}`
    } else {
      // Quantidades, taxas e áreas podem precisar de mais de duas casas.
      canonical = `${negative ? '-' : ''}${unsigned.replace(/\./g, '').replace(',', '.')}`
    }
  }
  const parsed = Number(canonical)
  return Number.isFinite(parsed) ? parsed : undefined
}
