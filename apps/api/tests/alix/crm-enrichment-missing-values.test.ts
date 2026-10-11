import { describe, expect, it } from 'vitest'
import type { DocumentExtractionResult } from '@aletis/shared-types'
import { buildCrmEnrichment } from '../../src/services/alix/extraction/CrmEnrichmentEngine.js'

function extraction(): DocumentExtractionResult {
  return { documentoId: 'fixture', sessionId: 'fixture', tipoDocumento: 'contrato_credito_rural', confianca: 0.9, entidades: [], clienteData: { nome: 'Cliente Sintético', cpfCnpj: '12345678909' }, dividas: [{ contrato: 'F-1', credor: 'Banco Sintético' }], propriedades: [{ car: 'CAR-FIXTURE', areaHa: 120 }], riscos: [], lacunas: [], acoesSugeridas: [], evidencias: [] }
}
describe('enriquecimento preserva dados desconhecidos', () => {
  it.each(['create', 'update'])('não inventa vencimento, status, responsável ou área útil em %s', async operation => {
    const result = await buildCrmEnrichment(extraction(), () => operation === 'update' ? { id: 'cliente-fixture', nome: 'Existente', dividas: [], propriedades: [] } : null)
    expect(result?.operation).toBe(operation)
    expect(result?.cliente.consultor).toBeUndefined()
    const debt = result?.cliente.dividas?.[0] as Record<string, unknown>
    const farm = result?.cliente.propriedades?.[0] as Record<string, unknown>
    expect(debt).not.toHaveProperty('vencimento')
    expect(debt).not.toHaveProperty('status')
    expect(farm).toHaveProperty('areaTotal', 120)
    expect(farm).not.toHaveProperty('areaAgricultavel')
    expect(farm).not.toHaveProperty('condicao')
  })
  it('preserva vencimento e condição explicitamente extraídos', async () => {
    const data = extraction()
    data.dividas[0].vencimento = '2028-07-10'
    data.dividas[0].status = 'renegociada'
    data.propriedades[0].condicao = 'arrendatario'
    const result = await buildCrmEnrichment(data, () => null)
    expect(result?.cliente.dividas?.[0]).toMatchObject({ vencimento: '2028-07-10', status: 'renegociada' })
    expect(result?.cliente.propriedades?.[0]).toMatchObject({ condicao: 'arrendatario' })
  })
  it('não transforma área desconhecida em zero ao atualizar', async () => {
    const data = extraction()
    delete data.propriedades[0].areaHa
    const result = await buildCrmEnrichment(data, () => ({ id: 'fixture', propriedades: [] }))
    expect(result?.cliente.propriedades?.[0]).not.toHaveProperty('areaTotal')
  })
})
