/** A variação só existe quando a API fornece observações comparáveis. */
export function commodityTickerChange(quote: { variacao24h?: unknown; variacao7d?: unknown }) {
  const daily = typeof quote.variacao24h === 'number' && Number.isFinite(quote.variacao24h) ? quote.variacao24h : null
  const weekly = typeof quote.variacao7d === 'number' && Number.isFinite(quote.variacao7d) ? quote.variacao7d : null
  const value = daily ?? weekly
  return {
    change: value == null ? '' : `${value > 0 ? '+' : ''}${value.toFixed(1).replace('.', ',')}% · ${daily != null ? '24h' : '7d'}`,
    positive: value != null && value >= 0,
    changeUnavailable: value == null,
  }
}
