import { describe, expect, it } from 'vitest'
import { calcularSaudeFinanceiraCliente } from '../../src/services/cliente/ClienteFinancialHealthService.js'
import type { AnaliseCliente } from '../../src/services/cliente/types.js'

function analysis(capacidadePagamento: number, saldoLivre: number, margemBruta: number, margemPct?: number): AnaliseCliente {
  return {
    inputHash: 'test', geradoEm: '2026-08-02T12:00:00.000Z', versao: 'test', duracaoMs: 1,
    srai: null, abs: null, saldoRecalculado: null, projecao5Safras: null,
    fluxoCaixaSafra: { capacidadePagamento, saldoLivre, margemBruta } as AnaliseCliente['fluxoCaixaSafra'],
    margemCliente: margemPct === undefined ? null : { margemPct } as AnaliseCliente['margemCliente'],
    alertasTop: [], recomendacoes: [], erros: {},
  }
}

describe('saúde financeira do cliente', () => {
  it('reflete caixa pressionado sem cair em fallback fixo', () => {
    const result = calcularSaudeFinanceiraCliente({
      valorTotalDivida: '1437880.28', areaTotalHa: 320,
      dividas: [
        { valorAtualizado: '964000.00', status: 'em_acordo', vencimento: '2028-04-30' },
        { valorAtualizado: '196500.28', status: 'em_acordo', vencimento: '2026-08-31' },
      ],
    }, analysis(172.82, -605880.28, 832000), new Date('2026-08-02T00:00:00Z'))

    expect(result.score).toBeLessThan(45)
    expect(result.score).not.toBe(50)
    expect(result.nivel).toBe('pressionada')
    expect(result.coberturaPct).toBe(80)
    expect(result.metricas.saldoLivre).toBe('-605880.28')
  })

  it('reconhece capacidade forte quando projeção e densidade são favoráveis', () => {
    const result = calcularSaudeFinanceiraCliente({
      valorTotalDivida: '1510331.37', areaTotalHa: 1281.56,
      dividas: [
        { valorAtualizado: '951000.00', status: 'ativa', vencimento: '2027-05-31' },
        { valorAtualizado: '559331.37', status: 'renegociada', vencimento: '2027-05-14' },
      ],
    }, analysis(45.33, 1821724.63, 3332056), new Date('2026-08-02T00:00:00Z'))

    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.nivel).toBe('forte')
    expect(result.metricas.dividaPorHa).toMatch(/^11\d\d\./)
  })

  it('retorna indisponível quando não há base, em vez de inventar 50', () => {
    const result = calcularSaudeFinanceiraCliente({}, null, new Date('2026-08-02T00:00:00Z'))
    expect(result.score).toBeNull()
    expect(result.nivel).toBe('indisponivel')
    expect(result.confianca).toBe('baixa')
  })
})
