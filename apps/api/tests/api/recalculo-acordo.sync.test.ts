import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sincronizarIndice } from '../../src/services/recalculo-acordo/IndexSyncService.js'
import { getRecalculoAcordoService } from '../../src/services/recalculo-acordo/RecalculoAcordoService.js'

describe('sincronização de índices', () => {
  beforeEach(() => { process.env.ALETIS_PG_ENABLED = '0' })
  afterEach(() => { vi.unstubAllGlobals(); getRecalculoAcordoService().clearForTests(); process.env.ALETIS_PG_ENABLED = '0' })
  it('interpreta série SIDRA e calcula composição mensal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ header: true },
      { D2C: '202401', D3C: '44', V: '0.50' },
      { D2C: '202402', D3C: '44', V: '-0.20' },
      { D2C: '202401', D3C: '68', V: '0.50' },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })))
    const result = await sincronizarIndice('INPC')
    expect(result.count).toBe(2)
    expect(getRecalculoAcordoService().getSeries('INPC')[1].fatorAcumulado).toBe('1.002990000000000000')
  })
  it('não converte erro da fonte em série vazia silenciosa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('erro', { status: 500 })))
    await expect(sincronizarIndice('INPC')).rejects.toThrow('HTTP 500')
  })
})
