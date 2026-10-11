import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), sgsGet: vi.fn(), status: vi.fn(),
  manager: {} as Record<string, unknown>,
}))
vi.mock('axios', () => ({ default: { create: () => ({ get: fake.get, post: fake.post }), get: fake.sgsGet } }))
vi.mock('../../src/services/DataSourceManager.js', () => ({ DataSourceManager: { getInstance: () => fake.manager } }))
vi.mock('../../src/services/MarketBriefService.js', () => ({ MarketBriefService: class {}, collectMarketPrices: vi.fn() }))
vi.mock('../../src/services/SazonalidadeService.js', () => ({ SazonalidadeService: class {} }))

import { ExpectativasService } from '../../src/services/sources/ExpectativasService.js'
import { ANPService } from '../../src/services/sources/ANPService.js'
import { SicorService } from '../../src/services/sources/SicorService.js'
import { ComexStatService } from '../../src/services/sources/ComexStatService.js'
import mercadoRoutes from '../../src/routes/mercado.js'

const services: unknown[] = []
function service<T>(Ctor: new (manager: any) => T): T {
  const instance = new Ctor({ updateSourceStatus: fake.status })
  services.push(instance)
  return instance
}
function csvRow(date: string, product = 'DIESEL S10', state = 'MT', value = '7,00') {
  const cells = Array(17).fill('')
  cells[1] = state; cells[10] = product; cells[11] = date; cells[12] = value
  return cells.join(';')
}
const csv = (...rows: string[]) => ['Regiao;Estado;Municipio;Revenda;CNPJ;Rua;Numero;Complemento;Bairro;Cep;Produto;Data;Valor', ...rows].join('\n')
async function request(url: string) {
  const app = Fastify()
  await app.register(mercadoRoutes)
  try {
    const response = await app.inject(url)
    return { status: response.statusCode, body: response.json() }
  } finally { await app.close() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede real proibida') }))
  fake.get.mockReset().mockRejectedValue(new Error('offline simulado'))
  fake.post.mockReset().mockRejectedValue(new Error('offline simulado'))
  fake.sgsGet.mockReset().mockRejectedValue(new Error('offline simulado'))
  fake.manager = {
    expectativas: service(ExpectativasService), anp: service(ANPService), sicor: service(SicorService), comexStat: service(ComexStatService),
  }
})
afterEach(() => {
  services.splice(0).forEach(instance => (instance as { cache: { close(): void } }).cache.close())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Focus: cache respeita quantidade, horizonte e base', () => {
  function respondToQuery() {
    fake.get.mockImplementation(async (url: string) => {
      const query = new URL(url, 'https://example.invalid').searchParams
      const year = /DataReferencia eq '(\d+)'/.exec(query.get('$filter') || '')?.[1] || '2026'
      const base = /baseCalculo eq (\d)/.exec(query.get('$filter') || '')?.[1] || '0'
      return { data: { value: Array.from({ length: Number(query.get('$top')) }, (_, i) => ({
        Indicador: 'IPCA', Data: '2026-09-04', DataReferencia: year, Mediana: 4 + i, baseCalculo: Number(base),
      })) } }
    })
  }

  it.each([[1, 6], [6, 1]])('consulta %i seguida de %i não reutiliza uma lista com outro tamanho', async (first, second) => {
    respondToQuery()
    const focus = fake.manager.expectativas as ExpectativasService
    expect((await focus.getExpectativasAnuais('IPCA', first)).expectativas).toHaveLength(first)
    expect((await focus.getExpectativasAnuais('IPCA', second)).expectativas).toHaveLength(second)
    expect((await focus.getExpectativasAnuais('IPCA', second)).fonte).toBe('cache')
    expect(fake.get).toHaveBeenCalledTimes(2)
  })

  it('isola ano de referência e base de cálculo no provedor e no cache', async () => {
    respondToQuery()
    const focus = fake.manager.expectativas as ExpectativasService
    const current = await focus.getExpectativasAnuais('IPCA', 1, { anoReferencia: 2026, baseCalculo: 0 })
    const future = await focus.getExpectativasAnuais('IPCA', 1, { anoReferencia: 2027, baseCalculo: 0 })
    const alternative = await focus.getExpectativasAnuais('IPCA', 1, { anoReferencia: 2027, baseCalculo: 1 })
    expect(current.expectativas[0].dataReferencia).toBe('2026')
    expect(future.expectativas[0].dataReferencia).toBe('2027')
    expect(alternative.expectativas[0].baseCalculo).toBe(1)
    expect(fake.get).toHaveBeenCalledTimes(3)
  })

  it('referência fallback respeita filtros e quantidade sem substituir indicador desconhecido por Selic', async () => {
    const focus = fake.manager.expectativas as ExpectativasService
    expect((await focus.getExpectativasAnuais('IPCA', 1)).expectativas).toHaveLength(1)
    expect((await focus.getExpectativasAnuais('IPCA', 6, { anoReferencia: 2030 })).expectativas).toEqual([])
    expect((await focus.getExpectativasAnuais('desconhecido', 6)).expectativas).toEqual([])
  })

  it('endpoint aceita top/ano/base e rejeita parâmetros inválidos antes de consultar a fonte', async () => {
    respondToQuery()
    const response = await request('/api/mercado/expectativas/ipca?top=1&ano=2027&baseCalculo=1')
    expect(response.status).toBe(200)
    expect(response.body.data.expectativas).toHaveLength(1)
    expect(response.body.data.expectativas[0]).toMatchObject({ dataReferencia: '2027', baseCalculo: 1 })
    fake.get.mockClear()
    for (const query of ['top=0', 'top=101', 'top=1.5', 'ano=1900', 'baseCalculo=3']) {
      expect((await request(`/api/mercado/expectativas/ipca?${query}`)).status).toBe(400)
    }
    expect(fake.get).not.toHaveBeenCalled()
  })
})

describe('ANP: ausência, proveniência e ordenação cronológica', () => {
  it.each([
    ['31/07/2026', '01/08/2026', '2026-08-01'],
    ['31/12/2025', '01/01/2026', '2026-01-01'],
  ])('resumo nacional compara %s e %s como datas, não como texto brasileiro', async (oldDate, newDate, expected) => {
    fake.get.mockResolvedValue({ data: csv(csvRow(oldDate), csvRow(newDate, 'DIESEL S10', 'MT', '8,00')) })
    const result = await (fake.manager.anp as ANPService).getDieselNacional()
    expect(result.diesel.dataReferencia).toBe(expected)
    expect(result.diesel.numeroPesquisas).toBe(2)
    expect(result.gasolina).toBeNull()
    expect(result.estados.MT.gasolina).toBeNull()
    expect(result.indisponiveis).toEqual(['gasolina'])
    const cachedState = await (fake.manager.anp as ANPService).getPrecoDiesel('MT')
    expect(cachedState).toMatchObject({ fonte: 'cache', dataReferencia: expected })
  })

  it.each([['getPrecoDiesel', 'DIESEL S10'], ['getPrecoEtanol', 'ETANOL']])('%s usa ordenação cronológica também na consulta por UF', async (method, product) => {
    fake.get.mockResolvedValue({ data: csv(csvRow('31/07/2026', product), csvRow('01/08/2026', product)) })
    const result = await (fake.manager.anp as ANPService)[method as 'getPrecoDiesel' | 'getPrecoEtanol']('MT')
    expect(result).toMatchObject({ dataReferencia: '2026-08-01', numeroPesquisas: 2, fonte: 'api' })
  })

  it('descarta datas impossíveis/ausentes e não cria observação com data da consulta', async () => {
    fake.get.mockResolvedValue({ data: csv(csvRow('31/02/2026'), csvRow(''), csvRow('04/09/2026')) })
    const result = await (fake.manager.anp as ANPService).getDieselNacional()
    expect(result.diesel).toMatchObject({ dataReferencia: '2026-09-04', numeroPesquisas: 1 })
  })

  it('CSV sem observações válidas não vira diesel zero de origem api', async () => {
    fake.get.mockResolvedValue({ data: csv(csvRow('31/02/2026'), csvRow('')) })
    const result = await (fake.manager.anp as ANPService).getDieselNacional()
    expect(result.fonte).toBe('fallback')
    expect(result.diesel.fonte).toBe('fallback')
    expect(result.gasolina).toBeNull()
  })

  it.each(['getPrecoDiesel', 'getPrecoEtanol'])('%s conserva fallback ao servir referência do cache', async (method) => {
    const anp = fake.manager.anp as ANPService
    const first = await anp[method as 'getPrecoDiesel' | 'getPrecoEtanol']('MT')
    const calls = fake.get.mock.calls.length
    const second = await anp[method as 'getPrecoDiesel' | 'getPrecoEtanol']('MT')
    expect(first.fonte).toBe('fallback')
    expect(second.fonte).toBe('fallback')
    expect(fake.get).toHaveBeenCalledTimes(calls)
  })

  it('envelope HTTP mantém gasolina null e lista indisponibilidade por combustível', async () => {
    fake.get.mockResolvedValue({ data: csv(csvRow('04/09/2026')) })
    const result = await request('/api/mercado/combustiveis/diesel')
    expect(result.body).toMatchObject({ success: true, data: { gasolina: null, estados: { MT: { gasolina: null } } }, meta: { estado: 'parcial', indisponiveis: ['gasolina'] } })
  })
})

describe('SICOR/ComexStat: falha nunca devolve série ou agregado artificial', () => {
  it.each([
    ['sicor', 'getAgregado'], ['sicor', 'getSerieMensal'],
    ['comexStat', 'getExportacoesAgro'], ['comexStat', 'getSerieMensalProduto'],
  ])('%s.%s rejeita sem produzir números operacionais em falha de fonte', async (source, method) => {
    const target = fake.manager[source] as Record<string, (...args: any[]) => Promise<unknown>>
    await expect(target[method](method === 'getSerieMensalProduto' ? 'soja' : 12)).rejects.toThrow(/indisponível/)
    expect(fake.status).toHaveBeenCalledWith(expect.any(String), 'degraded', expect.any(Number), expect.any(String))
  })

  it.each([
    '/api/mercado/sicor/agregado?meses=12', '/api/mercado/sicor/serie-mensal?meses=24',
    '/api/mercado/exportacao/agro?meses=12', '/api/mercado/exportacao/produto/soja?meses=24',
  ])('%s retorna indisponibilidade e data null', async (url) => {
    const result = await request(url)
    expect(result.body).toMatchObject({ success: false, data: null, meta: { estado: 'indisponivel', atualizacao: null } })
    expect(result.body.error).toMatch(/indisponív/)
  })

  it('respostas vazias dos provedores também não ativam fallback', async () => {
    fake.get.mockResolvedValue({ data: { value: [] } })
    fake.post.mockResolvedValue({ data: { data: { list: [] } } })
    fake.sgsGet.mockResolvedValue({ data: [] })
    await expect((fake.manager.sicor as SicorService).getAgregado()).rejects.toThrow(/indisponível/)
    await expect((fake.manager.sicor as SicorService).getSerieMensal()).rejects.toThrow(/indisponível/)
    await expect((fake.manager.comexStat as ComexStatService).getExportacoesAgro()).rejects.toThrow(/indisponível/)
    await expect((fake.manager.comexStat as ComexStatService).getSerieMensalProduto('soja')).rejects.toThrow(/indisponível/)
  })

  it('mantém observação real SICOR e a mesma informação em cache', async () => {
    fake.get.mockResolvedValue({ data: { value: [{ VlCusteio: '1200', VlInvestimento: '0', AreaFinanciada: '10', cdUF: 'MT', cdProduto: 'Soja', cdFinalidade: 'Custeio' }] } })
    const sicor = fake.manager.sicor as SicorService
    const result = await sicor.getAgregado(12)
    expect(result).toMatchObject({ valorTotal: 1200, totalContratos: 1, fonte: 'api' })
    expect(await sicor.getAgregado(12)).toMatchObject({ valorTotal: 1200, fonte: 'cache' })
    expect(fake.get).toHaveBeenCalledTimes(1)
  })

  it('mantém observações ComexStat e séries reais em cache', async () => {
    fake.post.mockResolvedValue({ data: { data: { list: [{ coAno: '2026', coMes: '08', coNcm: '12010000', noPais: 'País sintético', metricFOB: '2000', metricKG: '1000' }] } } })
    const comex = fake.manager.comexStat as ComexStatService
    const result = await comex.getExportacoesAgro(12)
    expect(result).toMatchObject({ totalUSD: 2000, fonte: 'api', serieMensal: [{ mes: '2026-08', valorUSD: 2000, toneladas: 1 }] })
    const series = await comex.getSerieMensalProduto('soja', 12)
    expect(series).toMatchObject({ fonte: 'api', serie: [{ mes: '2026-08', valorUSD: 2000, toneladas: 1 }] })
    expect((await comex.getSerieMensalProduto('soja', 12)).fonte).toBe('cache')
    expect(fake.post).toHaveBeenCalledTimes(2)
  })
})
