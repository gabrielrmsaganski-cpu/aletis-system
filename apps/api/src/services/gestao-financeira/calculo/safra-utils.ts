// ============================================================
// safra-utils — funções puras para manipular strings de safra
// ============================================================
// Replica a lógica Excel:
//   nextSafra("23/24") = "24/25"
//   = TEXT(MOD(VALUE(LEFT(s,2))+1,100),"00") & "/" & TEXT(MOD(VALUE(RIGHT(s,2))+1,100),"00")
// ============================================================

const SAFRA_RE = /^(\d{2})\/(\d{2})$/

export function isValidSafra(s: string): boolean {
  return SAFRA_RE.test(s.trim())
}

export function pad2(n: number): string {
  return String(((n % 100) + 100) % 100).padStart(2, '0')
}

export function nextSafra(s: string): string {
  const m = s.trim().match(SAFRA_RE)
  if (!m) throw new Error(`safra inválida: ${s}`)
  const a = parseInt(m[1], 10)
  const b = parseInt(m[2], 10)
  return `${pad2(a + 1)}/${pad2(b + 1)}`
}

export function prevSafra(s: string): string {
  const m = s.trim().match(SAFRA_RE)
  if (!m) throw new Error(`safra inválida: ${s}`)
  const a = parseInt(m[1], 10)
  const b = parseInt(m[2], 10)
  return `${pad2(a - 1)}/${pad2(b - 1)}`
}

/** Gera array de N safras consecutivas a partir de uma inicial. */
export function safraSequence(start: string, count: number): string[] {
  const out: string[] = [start]
  let cur = start
  for (let i = 1; i < count; i++) {
    cur = nextSafra(cur)
    out.push(cur)
  }
  return out
}

/** Converte safra "23/24" → ano civil de início (2023, 2024). */
export function safraToYears(s: string): { yearStart: number; yearEnd: number } {
  const m = s.trim().match(SAFRA_RE)
  if (!m) throw new Error(`safra inválida: ${s}`)
  const yearStart = 2000 + parseInt(m[1], 10)
  const yearEnd = 2000 + parseInt(m[2], 10)
  return { yearStart, yearEnd }
}

/** Distribui um valor anual de safra entre 2 anos calendário com proporção mensal.
 *  monthsInYear1 = quantos meses da safra caem no ano civil de início (default 6).
 */
export function distribuirSafraAnoCivil(
  safra: string,
  valorAnual: number,
  monthsInYear1 = 6,
  monthsInYear2 = 6,
): { yearStart: number; valorYear1: number; yearEnd: number; valorYear2: number } {
  const { yearStart, yearEnd } = safraToYears(safra)
  const total = monthsInYear1 + monthsInYear2 || 12
  return {
    yearStart,
    valorYear1: (valorAnual * monthsInYear1) / total,
    yearEnd,
    valorYear2: (valorAnual * monthsInYear2) / total,
  }
}
