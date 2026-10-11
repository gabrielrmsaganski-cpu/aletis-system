import { describe, expect, it, vi } from 'vitest'
vi.mock('../../../web/src/hooks/useApi', () => ({ apiFetch: vi.fn(), apiFetchFull: vi.fn() }))
import { buildRelatoriosData } from '../../../web/src/hooks/useRelatoriosData'

const time = '2026-09-05T12:00:00Z'
describe('snapshot de relatórios por seção', () => {
  it('encerramento não é inadimplência e inclui prospecção/qualificação nos ativos', () => {
    const result = buildRelatoriosData([{ nome: 'Quitado', estagio: 'encerrado' }, { nome: 'Contato', estagio: 'prospeccao' }, { nome: 'Em qualificação', estagio: 'qualificacao' }], [], null, null, null, time)
    expect(result.portfolioKpis).toContainEqual({ label: 'Ativos', valor: 2 })
    expect(result.portfolioKpis).toContainEqual({ label: 'Encerrados / arquivados', valor: 1 })
    expect(result.portfolioKpis.some(k => k.label === 'Inadimplentes')).toBe(false)
    expect(result.sections).toMatchObject({ portfolio: 'disponivel', financeiro: 'indisponivel', mercado: 'indisponivel' })
    expect(result.source).toBe('partial')
    expect(result.rentabilidadeMensal).toEqual([])
    expect(result.fluxoMensal).toEqual([])
  })
  it('reproduz o contrato financeiro recebido, inclusive resultado líquido após deduções', () => {
    const result = buildRelatoriosData([], [], { fluxoCaixa12m: [{ mes: '2026-08', receita: '150.00', despesa: '20.00', resultado: '115.00' }] }, null, null, time)
    expect(result.rentabilidadeMensal).toEqual([{ mes: '2026-08', receita: 150, custo: 20, lucro: 115 }])
    expect(result.fluxoMensal[0].saldo).toBe(115)
    expect(result.sections.financeiro).toBe('disponivel')
  })
  it('ausência ou resposta inválida não produz meses de zeros', () => {
    for (const financeiro of [undefined, {}, { serieMensal: [] }, { fluxoCaixa12m: [] }, { fluxoCaixa12m: [{ mes: '2026-08', receita: null, despesa: 0, resultado: 0 }] }]) {
      const result = buildRelatoriosData([], [], financeiro, null, null, time)
      expect(result.fluxoMensal).toEqual([])
      expect(result.sections.financeiro).toBe('indisponivel')
    }
  })
  it('mercado conserva fonte, unidade e data no snapshot e rejeita referências', () => {
    const price = { cultura: 'Soja', precoAtual: 132, unidade: 'R$/saca 60kg', praca: 'Média das UFs: PR', atualizacao: '2026-09-04', fonte: 'CONAB', fonteOrigem: 'cache', estado: 'atrasado' }
    const result = buildRelatoriosData([], [], undefined, { success: true, data: [price, { ...price, cultura: 'Exemplo', fonteOrigem: 'fallback' }], meta: { estado: 'parcial' } }, undefined, time)
    expect(result.mercado).toEqual([{ nome: 'Soja', valor: 132, unidade: price.unidade, praca: price.praca, data: '2026-09-04', fonte: 'CONAB', estado: 'atrasado' }])
    expect(result.sections.mercado).toBe('parcial')
    expect(result.snapshotEm).toBe(time)
  })
})
