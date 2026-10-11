import { afterEach, describe, expect, it } from 'vitest'
import { getRecalculoAcordoService } from '../../src/services/recalculo-acordo/RecalculoAcordoService.js'

const base = [
  { periodo: '2024-02', taxaMensal: '0', fatorAcumulado: '1' },
  { periodo: '2024-03', taxaMensal: '0.5', fatorAcumulado: '1.005' },
]

describe('Recálculo de acordo', () => {
  const service = getRecalculoAcordoService()
  afterEach(() => service.clearForTests())

  it('calcula, salva snapshot e restaura o mesmo resultado', async () => {
    service.setSeries('INPC', base)
    const record = await service.save({ titulo: 'Teste', indiceCode: 'INPC', corrigirAte: '2024-03-31', moraMensalPct: '1', parcelas: [{ id: 'p1', vencimento: '2024-01-15', valorOriginal: '100.00' }], organizationId: 'org-a' })
    expect(record.resultado.totalAtualizado).toBe('103.05')
    expect(record.snapshot.serie).toHaveLength(2)
    expect(service.get(record.id, 'org-a')?.resultado.totalAtualizado).toBe('103.05')
    expect(service.get(record.id, 'org-b')).toBeNull()
  })

  it('duplica sem alterar o original', async () => {
    service.setSeries('INPC', base)
    const original = await service.save({ titulo: 'Original', indiceCode: 'INPC', corrigirAte: '2024-03-31', moraMensalPct: '1', parcelas: [{ id: 'p1', vencimento: '2024-01-15', valorOriginal: '100.00' }] })
    const copy = await service.duplicate(original.id)
    expect(copy.id).not.toBe(original.id)
    expect(copy.titulo).toContain('cópia')
    expect(copy.resultado.totalAtualizado).toBe(original.resultado.totalAtualizado)
  })
})
