/** Fronteira do gerador legado: converte a saída para centavos decimais sem contas em ponto flutuante. */
export function normalizeContractMoney(value: string | number): string {
  const raw = String(value)
  const match = raw.length <= 128 ? raw.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i) : null
  if (!match) throw new Error('Valor contratual inválido.')
  const exponent = match[3] ? parseInt(match[3], 10) : 0
  if (exponent < -324 || exponent > 308) throw new Error('Valor contratual fora do limite.')
  const fraction = match[2] ?? ''
  const coefficient = BigInt(match[1] + fraction)
  const shift = 2 - fraction.length + exponent
  const cents = shift >= 0
    ? coefficient * 10n ** BigInt(shift)
    : (coefficient + (10n ** BigInt(-shift)) / 2n) / (10n ** BigInt(-shift))
  if (cents > 999999999999999999n) throw new Error('Valor contratual fora do limite.')
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}

/** Formatação do PDF preserva todos os dígitos do numeric(18,2). */
export function formatContractMoney(value: string | number): string {
  const [integer, fraction] = normalizeContractMoney(value).split('.')
  return `R$\u00a0${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`
}
