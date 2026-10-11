import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
const fake = vi.hoisted(() => ({ conabPrecos: { getAllPrecos: vi.fn() }, precos: { getAllCotacoes: vi.fn(), getHistoricoCommodity: vi.fn() }, bancoCentral: { getAllIndicators: vi.fn() } }))
vi.mock('../../src/services/DataSourceManager.js', () => ({ DataSourceManager: { getInstance: () => fake } }))
import mercadoRoutes from '../../src/routes/mercado.js'

const date = '2026-09-04'
const commodity = { produto: 'Soja', unidade: 'R$/saca 60kg', precoMedio: 132, precoMinimo: 120, precoMaximo: 150, semana: '31-08-2026 - 04-09-2026', estados: [{ uf: 'PR', preco: 132 }], fonte: 'api', atualizadoEm: date, estado: 'disponivel', historico: [{ data: '2026-08-28', valor: '120.00', fonte: 'CONAB', praca: 'Média das UFs: PR', unidade: 'R$/saca 60kg' }, { data: date, valor: '132.00', fonte: 'CONAB', praca: 'Média das UFs: PR', unidade: 'R$/saca 60kg' }] }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T12:00:00Z')); vi.clearAllMocks()
  fake.conabPrecos.getAllPrecos.mockResolvedValue({ soja: commodity, fonte: 'api', atualizadoEm: date })
  fake.precos.getAllCotacoes.mockResolvedValue({})
  fake.precos.getHistoricoCommodity.mockResolvedValue({ dados: [], fonte: 'fallback' })
})
afterEach(() => vi.useRealTimers())

async function request(path: string) {
  const app = Fastify()
  await app.register(mercadoRoutes)
  try { const response = await app.inject(path); return { status: response.statusCode, body: response.json() } } finally { await app.close() }
}
describe('rotas de mercado sem dados sintéticos', () => {
  it('consultas repetidas têm a mesma série, origem e variação', async () => {
    const first = await request('/api/mercado/precos?culturas=soja&periodo=30d')
    const second = await request('/api/mercado/precos?culturas=soja&periodo=30d')
    expect(first.status).toBe(200)
    expect(second.body.data).toEqual(first.body.data)
    expect(first.body.data[0]).toMatchObject({ variacao24h: null, variacao7d: 10, variacao30d: null, minimo30d: null, maximo30d: null, praca: 'Média das UFs: PR', atualizacao: date })
  })
  it('rota de histórico usa exatamente a série de preços e não fabrica estatísticas', async () => {
    const prices = await request('/api/mercado/precos?culturas=soja&periodo=30d')
    const history = await request('/api/mercado/commodities/soja/historico?dias=30')
    expect(history.body.data.historico).toEqual(prices.body.data[0].historico)
    expect(history.body.data.estatisticas).toBeNull()
  })
  it('indisponibilidade resulta em lacunas explícitas, inclusive insumos', async () => {
    fake.conabPrecos.getAllPrecos.mockRejectedValue(new Error('offline'))
    fake.precos.getAllCotacoes.mockResolvedValue({ soja: { preco: 138.5, fonte: 'fallback' } })
    expect((await request('/api/mercado/precos?culturas=soja')).body).toMatchObject({ data: [], meta: { estado: 'indisponivel', indisponiveis: ['soja'], atualizacao: null } })
    expect((await request('/api/mercado/commodities/soja/historico')).body).toMatchObject({ data: { historico: [], estatisticas: null }, meta: { estado: 'indisponivel' } })
    expect((await request('/api/mercado/insumos')).body).toMatchObject({ data: [], meta: { estado: 'indisponivel', atualizacao: null } })
  })
  it('valida janela antes de consultar fontes', async () => {
    expect((await request('/api/mercado/precos?periodo=-1d')).status).toBe(400)
    expect((await request('/api/mercado/commodities/soja/historico?dias=9999')).status).toBe(400)
    expect((await request('/api/mercado/cambio/historico?dias=-1')).status).toBe(400)
    expect((await request('/api/mercado/cambio/historico?dias=9999')).status).toBe(400)
    expect((await request('/api/mercado/cambio/historico?dias=30abc')).status).toBe(400)
    expect((await request('/api/mercado/cambio/historico?par=USD')).status).toBe(400)
    expect(fake.conabPrecos.getAllPrecos).not.toHaveBeenCalled()
  })
})
