import { afterEach, describe, expect, it } from 'vitest'
import { getRecalculoAcordoService } from '../../src/services/recalculo-acordo/RecalculoAcordoService.js'
import { gerarRecalculoAcordoPdf } from '../../src/services/recalculo-acordo/RecalculoAcordoPdf.js'

describe('PDF do recálculo', () => {
  afterEach(() => { process.env.ALETIS_PG_ENABLED = '0'; getRecalculoAcordoService().clearForTests() })
  it('gera documento não vazio a partir do snapshot salvo', async () => {
    process.env.ALETIS_PG_ENABLED = '0'
    const service = getRecalculoAcordoService()
    service.setSeries('INPC', [{ periodo: '2024-02', taxaMensal: '0', fatorAcumulado: '1' }, { periodo: '2024-03', taxaMensal: '0.5', fatorAcumulado: '1.005' }])
    const record = await service.save({ titulo: 'PDF teste', indiceCode: 'INPC', corrigirAte: '2024-03-31', moraMensalPct: '1', parcelas: [{ id: '1', vencimento: '2024-01-15', valorOriginal: '100' }] })
    const pdf = await gerarRecalculoAcordoPdf(record)
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
    expect(pdf.length).toBeGreaterThan(1000)
  }, 30_000)
})
