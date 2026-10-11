import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const http = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('axios', () => ({ default: { create: () => http } }))
vi.mock('../../src/services/captcha/CloudflareBypass.js', () => ({ bypassCloudflareAndFetch: vi.fn().mockRejectedValue(new Error('offline')) }))
import { ConabPrecosService, conabWeekEnd } from '../../src/services/sources/ConabPrecosService.js'
import { BancoCentralService } from '../../src/services/sources/BancoCentralService.js'
import { OpenMeteoService } from '../../src/services/sources/OpenMeteoService.js'
import { AwesomeApiService } from '../../src/services/sources/AwesomeApiService.js'
import { PrecosService } from '../../src/services/sources/PrecosService.js'
import { LastObservationStore } from '../../src/services/sources/LastObservationStore.js'
import { accumulated12Months, collectMarketPrices, MarketBriefService } from '../../src/services/MarketBriefService.js'
import type { DataSourceManager } from '../../src/services/DataSourceManager.js'

const manager = { updateSourceStatus: vi.fn() } as unknown as DataSourceManager
const row = (week: string, uf: string, value: string, unit = 'KG') => `SOJA;EM GRAOS;${unit};${uf};SUL;2026;9;${week};1;RECEBIDO;${value}`
const csv = (...rows: string[]) => Buffer.from(['PRODUTO;CLASSIFICACAO;UNIDADE;UF;REGIAO;ANO;MES;SEMANA;NUMERO;NIVEL;VALOR', ...rows].join('\n'), 'latin1')

beforeEach(() => { vi.clearAllMocks(); http.get.mockReset(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-05T12:00:00Z')) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe('observações CONAB', () => {
  it('conserva semana, unidade e média das UFs, sem misturar coberturas', async () => {
    http.get.mockResolvedValue({ data: csv(
      row('24-08-2026 - 28-08-2026', 'PR', '2,00'),
      row('24-08-2026 - 28-08-2026', 'MT', '1,00'),
      row('31-08-2026 - 04-09-2026', 'PR', '2,20'),
      row('31-08-2026 - 04-09-2026', 'MT', '1,10'),
      row('17-08-2026 - 21-08-2026', 'PR', '2,00'),
    ) })
    const service = new ConabPrecosService(manager)
    const first = await service.getAllPrecos()
    expect(first.soja).toMatchObject({ precoMedio: 99, atualizadoEm: '2026-09-04', semana: '31-08-2026 - 04-09-2026', unidade: 'R$/saca 60kg' })
    expect(first.soja.historico).toEqual([
      { data: '2026-08-28', valor: '90.00', fonte: 'CONAB', praca: 'Média das UFs: MT, PR', unidade: 'R$/saca 60kg' },
      { data: '2026-09-04', valor: '99.00', fonte: 'CONAB', praca: 'Média das UFs: MT, PR', unidade: 'R$/saca 60kg' },
    ])
    const second = await service.getAllPrecos()
    expect(second.soja.historico).toEqual(first.soja.historico)
    expect(second.soja.atualizadoEm).toBe('2026-09-04')
    expect(second.milho.fonte).toBe('fallback')
    expect(second.soja.fonte).toBe('cache')
  })
  it('preserva último dado real após expirar TTL e falhar a atualização', async () => {
    http.get.mockResolvedValueOnce({ data: csv(row('31-08-2026 - 04-09-2026', 'PR', '2,20')) }).mockRejectedValue(new Error('offline'))
    const service = new ConabPrecosService(manager)
    const first = await service.getAllPrecos()
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    const stale = await service.getAllPrecos()
    expect(stale.soja).toMatchObject({ precoMedio: first.soja.precoMedio, atualizadoEm: first.soja.atualizadoEm, estado: 'atrasado', fonte: 'cache' })
  })
  it('não assume unidade desconhecida nem aceita HTML como cotação', async () => {
    http.get.mockResolvedValue({ data: csv(row('31-08-2026 - 04-09-2026', 'PR', '220,00', 'SACA')) })
    await expect(new ConabPrecosService(manager).getAllPrecos()).rejects.toThrow('indisponíveis')
    http.get.mockResolvedValue({ data: Buffer.from('<html>bloqueado</html>') })
    await expect(new ConabPrecosService(manager).getAllPrecos()).rejects.toThrow('indisponíveis')
    expect(conabWeekEnd('28/12/2026 - 01/01/2027')).toBe('2027-01-01')
  })
  it('mantém observações serializadas disponíveis depois de recriar o serviço', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aletis-market-test-'))
    vi.stubEnv('ALETIS_MARKET_CACHE_DIR', dir)
    try {
      new LastObservationStore('test').set('soja', { valor: '123.45', data: '2026-09-04', fonte: 'CONAB' })
      expect(new LastObservationStore('test').get('soja')).toEqual({ valor: '123.45', data: '2026-09-04', fonte: 'CONAB' })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('períodos, variações e referências', () => {
  const history = Array.from({ length: 12 }, (_, month) => ({ data: `2026-${String(month + 1).padStart(2, '0')}-01`, valor: 1 }))
  it('acumula 12 meses compostos e rejeita lacunas e referências fallback', () => {
    expect(accumulated12Months({ fonte: 'api', historico: history })).toBeCloseTo(12.6825, 4)
    expect(accumulated12Months({ fonte: 'api', historico: history.slice(1) })).toBeNull()
    expect(accumulated12Months({ fonte: 'cache', historico: [...history.slice(1), { data: '2027-02-01', valor: 1 }] })).toBeNull()
    expect(accumulated12Months({ fonte: 'fallback', historico: history })).toBeNull()
  })
  it('preços e briefing usam a mesma variação semanal real, sem mínimo transversal rotulado 30d', async () => {
    http.get.mockResolvedValue({ data: csv(row('24-08-2026 - 28-08-2026', 'PR', '2,00'), row('31-08-2026 - 04-09-2026', 'PR', '2,20')) })
    const fake = { ...manager, conabPrecos: new ConabPrecosService(manager), precos: { getAllCotacoes: async () => ({}), getHistoricoCommodity: async () => ({ dados: [] }) }, bancoCentral: { getAllIndicators: async () => ({ selic: { valor: 15, fonte: 'fallback' }, ipca: { valor: 1, fonte: 'api', historico: history }, igpm: { fonte: 'fallback' }, cdi: { fonte: 'fallback' }, ptax: { fonte: 'fallback' } }) }, awesomeApi: { getCotacoesAtuais: async () => [] }, expectativas: { getExpectativasAnuais: async () => ({ fonte: 'fallback', expectativas: [] }) }, nasaFirms: { getIncendiosBrasil: async () => [] } } as unknown as DataSourceManager
    const [price] = await collectMarketPrices(fake, ['soja'])
    expect(price).toMatchObject({ precoAtual: 132, variacao24h: null, variacao7d: 10, variacao30d: null, minimo30d: null, maximo30d: null, praca: 'Média das UFs: PR', frequencia: 'semanal' })
    const brief = await new MarketBriefService(fake).generateBrief()
    expect(brief.commodities[0].variacao7d).toBe(price.variacao7d)
    expect(brief.commodities[0].preco).toBe(price.precoAtual)
    expect(brief.macro.ipca12m).toBeCloseTo(12.6825, 4)
    expect(brief.macro.selic).toBeNull()
    expect(brief.fonteOrigem).toBe('mixed')
  })
  it('cache de fallback BCB continua referência e falha não redata observação real', async () => {
    http.get.mockRejectedValue(new Error('offline'))
    const service = new BancoCentralService(manager)
    expect((await service.fetchIPCA()).fonte).toBe('fallback')
    expect((await service.fetchIPCA()).fonte).toBe('fallback')
    vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
    http.get.mockResolvedValueOnce({ data: [{ data: '01/08/2026', valor: '0.25' }] })
    expect((await service.fetchIPCA()).valor).toBe(0.25)
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    expect(await service.fetchIPCA()).toMatchObject({ valor: 0.25, data: '2026-08-01', fonte: 'cache', estado: 'atrasado' })
  })
  it('republicação sem indicador e unidade explícitos não é uma cotação CEPEA', async () => {
    const service = new PrecosService(manager) as any
    http.get.mockResolvedValue({ data: '<table class="cot-fisicas"><tbody><tr><td>04/09/2026</td><td>132,00</td><td>1,00</td></tr></tbody></table>' })
    expect(await service.scrapeNoticiasAgricolas('soja')).toBeNull()
    http.get.mockResolvedValue({ data: '<h2>Soja CEPEA Paraná — R$/saca 60kg</h2><table class="cot-fisicas"><tbody><tr><td>04/09/2026</td><td>132,00</td><td>1,00</td></tr></tbody></table>' })
    expect(await service.scrapeNoticiasAgricolas('soja')).toMatchObject({ preco: 132, data: '04/09/2026', indicador: { unidade: 'R$/saca 60kg' } })
  })
  it('histórico CEPEA não é sintetizado de cotação única', async () => {
    expect((await new PrecosService(manager).getHistoricoCommodity('soja', 30)).dados).toEqual([])
    expect(http.get).not.toHaveBeenCalled()
  })
})

describe('clima e câmbio indisponíveis', () => {
  it('normaliza hora local do provedor para UTC e preserva o instante ao recuperar cache', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aletis-current-weather-test-'))
    vi.stubEnv('ALETIS_MARKET_CACHE_DIR', dir)
    try {
      http.get.mockResolvedValueOnce({ data: { utc_offset_seconds: -10800, current: {
        time: '2026-09-05T09:00', temperature_2m: 25, relative_humidity_2m: 60,
        precipitation: 0, rain: 0, weather_code: 0, wind_speed_10m: 12, wind_direction_10m: 90,
      } } }).mockRejectedValue(new Error('offline'))
      const service = new OpenMeteoService(manager)
      expect(await service.getCurrent(-24, -53)).toMatchObject({ observadoEm: '2026-09-05T12:00:00.000Z', fonte: 'api' })
      vi.setSystemTime(new Date('2026-09-05T13:00:00Z'))
      expect(await service.getCurrent(-24, -53)).toMatchObject({ observadoEm: '2026-09-05T12:00:00.000Z', fonte: 'cache', estado: 'atrasado' })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('falha meteorológica não gera chuva/vento e conserva previsão real anterior com validade', async () => {
    http.get.mockRejectedValue(new Error('offline'))
    const service = new OpenMeteoService(manager)
    await expect(service.getForecast(-24, -53)).rejects.toThrow('indisponível')
    const daily: Record<string, unknown> = { time: ['2026-09-05', '2026-09-06'] }
    for (const key of ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'rain_sum', 'et0_fao_evapotranspiration', 'windspeed_10m_max', 'uv_index_max']) daily[key] = [1, 2]
    http.get.mockResolvedValueOnce({ data: { latitude: -24, longitude: -53, timezone: 'America/Sao_Paulo', daily } })
    const first = await service.getForecast(-24, -53)
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    const stale = await service.getForecast(-24, -53)
    expect(stale.daily).toEqual(first.daily)
    expect(stale.atualizadoEm).toBe(first.atualizadoEm)
    expect(stale).toMatchObject({ estado: 'atrasado', validoAte: '2026-09-06' })
  })
  it('não inventa histórico cambial ou cotação corrente quando todos provedores falham', async () => {
    http.get.mockRejectedValue(new Error('offline'))
    const service = new AwesomeApiService(manager)
    expect(await service.getCotacoesAtuais()).toEqual([])
    expect(await service.getHistoricoDiario('USD-BRL', 30)).toMatchObject({ cotacoes: [], fonte: 'fallback', atualizadoEm: '' })
  })
  it('taxa ECB não vira spread de compra/venda ou máxima e mínima diárias', async () => {
    http.get.mockImplementation(async (url: string) => {
      if (url.startsWith('latest?')) return { data: { date: '2026-09-04', rates: { BRL: 6 } } }
      throw new Error('sem anterior')
    })
    const [quote] = await new AwesomeApiService(manager).getCotacoesAtuais(['EUR-BRL'])
    expect(quote).toMatchObject({ bid: 6, ask: null, high: null, low: null, pctChange: null, varBid: null, createDate: '2026-09-04 00:00:00' })
  })
  it('histórico cambial recorta dias corridos e não fabrica máxima/mínima de taxa ECB', async () => {
    http.get.mockResolvedValue({ data: { rates: {
      '2026-07-30': { BRL: 100 },
      '2026-08-06': { BRL: 5 },
      '2026-09-04': { BRL: 6 },
      '2026-09-06': { BRL: 200 },
    } } })
    const history = await new AwesomeApiService(manager).getHistoricoDiario('USD-BRL', 30)
    expect(history.cotacoes).toEqual([
      { data: '2026-08-06', valor: 5, alta: null, baixa: null },
      { data: '2026-09-04', valor: 6, alta: null, baixa: null },
    ])
  })
  it('fallback diário e observação persistida respeitam a janela solicitada', async () => {
    http.get.mockImplementation(async (url: string) => {
      if (!url.startsWith('json/daily/')) throw new Error('ECB indisponível')
      return { data: [
        { create_date: '2026-07-30 12:00:00', bid: '100', high: '110', low: '90' },
        { create_date: '2026-08-06 12:00:00', bid: '5', high: '5.1', low: '4.9' },
        { create_date: '2026-09-04 12:00:00', bid: '6', high: '6.1', low: '5.9' },
      ] }
    })
    const service = new AwesomeApiService(manager)
    expect((await service.getHistoricoDiario('USD-BRL', 30)).cotacoes.map(p => p.data)).toEqual(['2026-08-06', '2026-09-04'])
    http.get.mockRejectedValue(new Error('offline'))
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    const stale = await service.getHistoricoDiario('USD-BRL', 30)
    expect(stale).toMatchObject({ fonte: 'cache', estado: 'atrasado', atualizadoEm: '2026-09-04' })
    expect(stale.cotacoes.map(p => p.data)).toEqual(['2026-09-04'])
    vi.setSystemTime(new Date('2026-11-07T12:00:00Z'))
    expect((await service.getHistoricoDiario('USD-BRL', 30)).cotacoes).toEqual([])
  })
})
