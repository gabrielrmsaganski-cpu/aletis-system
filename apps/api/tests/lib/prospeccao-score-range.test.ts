import { afterEach, expect, it, vi } from 'vitest'
import { ScoringEngine, classifyLeadScore } from '../../src/services/prospeccao/ScoringEngine.js'

afterEach(() => vi.useRealTimers())
const lead = {
  nome: 'AGROPECUARIA TESTE', totalDivida: 1_000_000, temAjuizada: true,
  debts: [{ ajuizado: true }], primeiraInscricao: '01/08/2026', ultimaInscricao: '01/09/2026',
  qtdInscricoes: 12, agroSignals: ['AGRO', 'DOU:recuperação judicial'], uf: 'PR',
  sources: [{ fonte: 'PGFN' }, { fonte: 'DOU' }, { fonte: 'SOCIO_AGRO' }],
}
it('convergência de fontes não ultrapassa a escala de 100 pontos', () => {
  vi.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'))
  const result = new ScoringEngine().score(lead as any, { hectaresEstimados: 6000 } as any)
  expect(result.total).toBe(100)
  expect(result.classificacao).toBe('quente')
})
it('a mesma fonte repetida não gera bônus de múltiplas fontes', () => {
  const result = new ScoringEngine().score({ ...lead, sources: [{ fonte: 'PGFN' }, { fonte: 'pgfn' }, { fonte: ' PGFN ' }] } as any, { hectaresEstimados: 0 } as any)
  expect(result.breakdown.multiSource).toBe(0)
})
it.each([[44, 'reativo'], [45, 'frio'], [64, 'frio'], [65, 'morno'], [84, 'morno'], [85, 'quente']])('aplica a mesma classificação no score e após feedback: %s', (score, category) => {
  expect(classifyLeadScore(Number(score))).toBe(category)
})
