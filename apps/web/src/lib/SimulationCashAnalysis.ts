import type { ResultadoSimuladorOperacao, SistemaSimulador } from '@aletis/financial-calc'

const systems: SistemaSimulador[] = ['PRICE', 'SAC', 'SACRE']

/** Agrupa desembolsos reais do cronograma; eventos no mesmo mês somam a pressão de caixa. */
export function simulationCashAnalysis(result: ResultadoSimuladorOperacao) {
  return systems.map(system => {
    const byMonth = new Map<string, number>()
    const byYear = new Map<string, number>()
    const scheduled = result.sistemas[system].linhas.filter(row => row.n > 0 && row.prestacao > 0)
    for (const row of scheduled) {
      const month = row.data.slice(0, 7)
      const year = row.data.slice(0, 4)
      byMonth.set(month, (byMonth.get(month) || 0) + row.prestacao)
      byYear.set(year, (byYear.get(year) || 0) + row.prestacao)
    }
    const peakMonth = [...byMonth].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    const peakYear = [...byYear].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    return {
      system,
      firstPaymentDate: scheduled[0]?.data || null,
      lastPaymentDate: scheduled[scheduled.length - 1]?.data || null,
      peakMonth: peakMonth ? { period: peakMonth[0], amount: peakMonth[1] } : null,
      peakYear: peakYear ? { period: peakYear[0], amount: peakYear[1] } : null,
    }
  })
}

/** Compara a mesma data entre sistemas, inclusive após quitação antecipada de um deles. */
export function simulationBalanceComparison(result: ResultadoSimuladorOperacao) {
  const dates = [...new Set(systems.flatMap(system => result.sistemas[system].linhas.map(row => row.data)))].sort()
  const balances = Object.fromEntries(systems.map(system => [system, new Map(result.sistemas[system].linhas.map(row => [row.data, row.saldoDevedor]))])) as Record<SistemaSimulador, Map<string, number>>
  const current: Record<SistemaSimulador, number> = { PRICE: 0, SAC: 0, SACRE: 0 }
  return dates.map(data => {
    for (const system of systems) if (balances[system].has(data)) current[system] = balances[system].get(data)!
    return { data, ...current }
  })
}
