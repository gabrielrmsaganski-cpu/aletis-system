import { expect, it } from 'vitest'
import { buildSimuladorOperacaoTools } from '../../src/services/alix/tools/simulador-operacao.js'
import { syntheticDraft } from '../fixtures/simulation-draft.js'

const registry = buildSimuladorOperacaoTools().registry
const execute = (name: string, payload: any) => registry[name].handler(payload, {} as any) as Promise<any>

it('pedido vazio ou parcial não calcula dados retirados do exemplo v16', async () => {
  for (const input of [{}, { valorOperacao: 100000 }]) {
    const result = await execute('simular_operacao_v16', input)
    expect(result.ok).toBe(false); expect(result.camposPendentes).toContain('dataCredito')
    expect(result.resumo).toBeUndefined()
  }
})

it('1 percentual significa 1%, nunca 100%; unidade ausente interrompe cálculo', async () => {
  const input = syntheticDraft().input; input.taxaPreAnual = 1
  const result = await execute('simular_operacao_v16', { input, unidadeTaxas: 'percentual', incluirLinhas: true, limiteLinhas: 2 })
  expect(result.ok).toBe(true); expect(result.inputNormalizado.taxaPreAnual).toBe(0.01)
  expect(typeof result.resumo.sistemas[0].totalJuros).toBe('string')
  expect(result.cobertura.sistemas.PRICE.retornadas).toBe(2)
  expect(result.cobertura.sistemas.PRICE.proximoOffset).toBe(2)
  expect((await execute('simular_operacao_v16', { input })).camposPendentes).toContain('unidadeTaxas')
})

it('dados inválidos geram diagnóstico, não resultado zero', async () => {
  const input = syntheticDraft().input; input.dataCredito = '2026-02-30'
  const result = await execute('simular_operacao_v16', { input, unidadeTaxas: 'decimal' })
  expect(result.ok).toBe(false); expect(result.validacao.erros).not.toHaveLength(0)
  expect(result.resumo).toBeUndefined()
})

it('exemplo exige modo explícito e rejeita mistura com cliente', async () => {
  const result = await execute('simular_operacao_v16', { modo: 'demonstracao' })
  expect(result.ok).toBe(true); expect(result.demonstracao).toBe(true)
  expect((await execute('simular_operacao_v16', { modo: 'demonstracao', input: syntheticDraft().input })).ok).toBe(false)
})

it('IOF/seguro ativos exigem configuração antes de comparar propostas', async () => {
  const input: any = syntheticDraft().input; input.iofAtivo = true; delete input.iofDiarioAtivo
  expect((await execute('simular_operacao_v16', { input, unidadeTaxas: 'decimal' })).camposPendentes).toContain('iofDiarioAtivo')
})

it('recálculo e ficha também respeitam unidade explícita e diagnóstico do motor', async () => {
  const draft = syntheticDraft()
  const result = await execute('recalcular_operacao_v16', { ...draft.recalculo, taxaMensal: 1, unidadeTaxas: 'percentual' })
  expect(result.ok).toBe(true); expect(result.inputNormalizado.taxaMensal).toBe(0.01)
  expect(typeof result.resultado.valorPresenteParcelas).toBe('string')
  expect(typeof result.resultado.creditoCompativelTaxaInformada).toBe('string')
  expect(typeof result.resultado.custosAcessoriosCompativeisTaxaInformada).toBe('string')
  const invalid = await execute('ficha_bancaria_v16', { ...draft.ficha, unidadeTaxas: 'decimal', eventos: [{ id: 'a', data: '2025-01-01', evento: 'Inválido', amortizacao: 100 }] })
  expect(invalid.ok).toBe(false)
})

it('indexador sem projeção ou taxa nula não vira operação pré-fixada silenciosa', async () => {
  const input: any = syntheticDraft().input; input.indexador = 'CDI'; delete input.taxaPosAnual
  expect((await execute('simular_operacao_v16', { input, unidadeTaxas: 'decimal' })).camposPendentes).toContain('taxaPosAnual')
  input.taxaPosAnual = null
  expect((await execute('simular_operacao_v16', { input, unidadeTaxas: 'decimal' })).ok).toBe(false)
})
