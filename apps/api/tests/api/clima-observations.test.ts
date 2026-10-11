import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import type { DataSourceManager } from '../../src/services/DataSourceManager.js'

const fake = vi.hoisted(() => ({
  http: { get: vi.fn() },
  openMeteo: { getCurrent: vi.fn(), getForecast: vi.fn(), getHistorical: vi.fn() },
  clima: { getDadosNASA: vi.fn(), getAlertasRegiao: vi.fn() },
}))
vi.mock('axios', () => ({ default: { get: fake.http.get, create: () => fake.http } }))
vi.mock('../../src/services/DataSourceManager.js', () => ({ DataSourceManager: { getInstance: () => fake } }))
import climaRoutes from '../../src/routes/clima.js'
import { ClimaService } from '../../src/services/sources/ClimaService.js'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-06T12:00:00Z'))
  for (const mock of [fake.http.get, ...Object.values(fake.openMeteo), ...Object.values(fake.clima)]) mock.mockReset()
  fake.http.get.mockRejectedValue(new Error('offline'))
  fake.openMeteo.getCurrent.mockRejectedValue(new Error('offline'))
  fake.openMeteo.getForecast.mockRejectedValue(new Error('offline'))
  fake.openMeteo.getHistorical.mockRejectedValue(new Error('offline'))
  fake.clima.getDadosNASA.mockResolvedValue({ fonte: 'fallback', parametros: { T2M: {}, PRECTOTCORR: {}, RH2M: {} } })
  fake.clima.getAlertasRegiao.mockResolvedValue([])
})
afterEach(() => vi.useRealTimers())

async function request(path: string) {
  const app = Fastify()
  await app.register(climaRoutes)
  try {
    const response = await app.inject(path)
    return { status: response.statusCode, body: response.json() }
  } finally { await app.close() }
}

const current = { temperature: 27, humidity: 68, windSpeed: 12, windDirection: 90, precipitation: 0.5, weatherCode: 2, fonte: 'api', observadoEm: '2026-09-06T11:40:00Z' }
const forecast = { fonte: 'api', coletadoEm: '2026-09-06T11:40:00Z', validoAte: '2026-09-06', daily: {
  time: ['2026-09-06'], temperature_2m_max: [31], temperature_2m_min: [20], precipitation_sum: [8], windspeed_10m_max: [14], uv_index_max: [7], et0_fao_evapotranspiration: [4],
} }

describe('clima com localização e observações verificadas', () => {
  it('falha de fontes mantém condição e previsão ausentes', async () => {
    const result = await request('/api/clima/municipio/4127700')
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ condicaoAtual: null, previsao: [], estado: 'indisponivel', fontes: [], atualizadoEm: null })
  })

  it('preserva previsão quando somente condição atual falha, sem inferir probabilidade', async () => {
    fake.openMeteo.getForecast.mockResolvedValue(forecast)
    const { body } = await request('/api/clima/municipio/4127700')
    expect(body).toMatchObject({ estado: 'parcial', condicaoAtual: null, previsao: [{ tempMaxima: 31, tempMinima: 20, precipitacaoMm: 8, probabilidadeChuva: null, umidadeMaxima: null }] })
  })

  it('preserva condição atual sem transformar chuva instantânea em acumulado de 24 horas', async () => {
    fake.openMeteo.getCurrent.mockResolvedValue(current)
    const { body } = await request('/api/clima/municipio/4127700')
    expect(body).toMatchObject({ estado: 'parcial', previsao: [], condicaoAtual: { temperatura: 27, precipitacao24h: null, sensacaoTermica: null, atualizadoEm: current.observadoEm } })
  })

  it('código meteorológico desconhecido não recebe condição presumida', async () => {
    fake.openMeteo.getCurrent.mockResolvedValue({ ...current, weatherCode: -1 })
    expect((await request('/api/clima/municipio/4127700')).body.condicaoAtual.condicaoIcone).toBe('indisponivel')
  })

  it('histórico indisponível continua vazio em consultas repetidas', async () => {
    for (let i = 0; i < 2; i++) {
      expect((await request('/api/clima/historico?lat=-24&lon=-53&inicio=2026-09-01&fim=2026-09-05')).body).toMatchObject({ dados: [], estado: 'indisponivel', resumo: { temperaturaMedia: null, precipitacaoAcumulada: null, totalDias: 0 } })
    }
  })

  it('histórico NASA preserva sentinela como lacuna, sem completar máximas e mínimas', async () => {
    fake.clima.getDadosNASA.mockResolvedValue({ fonte: 'api', parametros: { T2M: { '20260901': 25, '20260902': 26 }, PRECTOTCORR: { '20260901': 5, '20260902': -999 }, RH2M: {} } })
    const { body } = await request('/api/clima/historico?lat=-24&lon=-53&inicio=2026-09-01&fim=2026-09-05')
    expect(body).toMatchObject({ fonte: 'NASA POWER', estado: 'parcial', resumo: { temperaturaMedia: 25.5, precipitacaoAcumulada: null, temperaturaMaxima: null, totalDias: 2 } })
    expect(body.dados[1].precipitacaoMm).toBeNull()
  })

  it('rejeita coordenadas ausentes ou fora do intervalo antes das fontes', async () => {
    expect((await request('/api/clima/local?lat=91&lon=10')).status).toBe(400)
    expect((await request('/api/clima/local?lat=&lon=10')).status).toBe(400)
    expect((await request('/api/clima/historico?lat=undefined&lon=undefined&inicio=2026-09-01&fim=2026-09-05')).status).toBe(400)
    expect(fake.openMeteo.getCurrent).not.toHaveBeenCalled()
    expect(fake.openMeteo.getHistorical).not.toHaveBeenCalled()
  })

  it('geocodificação indisponível não usa Brasília como localização do município', async () => {
    fake.http.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/municipios/1234567')) return { data: { nome: 'Cidade sem coordenadas', microrregiao: { mesorregiao: { UF: { sigla: 'MT' } } } } }
      throw new Error('offline')
    })
    const { body } = await request('/api/clima/municipio/1234567')
    expect(body).toMatchObject({ municipio: { lat: null, lon: null, altitude: null }, estado: 'indisponivel', previsao: [], condicaoAtual: null })
    expect(fake.openMeteo.getCurrent).not.toHaveBeenCalled()
  })

  it('município resolvido consulta a localização publicada pelo geocodificador', async () => {
    fake.http.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/municipios/7654321')) return { data: { nome: 'Cidade resolvida', microrregiao: { mesorregiao: { UF: { sigla: 'MT' } } } } }
      if (url.includes('nominatim')) return { data: [{ lat: '-13.5', lon: '-52.4' }] }
      throw new Error('offline')
    })
    await request('/api/clima/municipio/7654321')
    expect(fake.openMeteo.getCurrent).toHaveBeenCalledWith(-13.5, -52.4)
  })

  it('não apresenta ausência de provedor de alertas como confirmação de tempo favorável', async () => {
    expect((await request('/api/clima/alertas/MT')).body).toMatchObject({ alertas: [], estadoDados: 'indisponivel', fonteOrigem: 'fallback' })
  })
})

describe('contingência de fontes climáticas', () => {
  it('repetição de falha não converte dados sintéticos em cache real', async () => {
    const service = new ClimaService({ updateSourceStatus: vi.fn() } as unknown as DataSourceManager)
    for (let i = 0; i < 2; i++) {
      expect(await service.getDadosNASA(-24, -53, '2026-09-01', '2026-09-05')).toMatchObject({ fonte: 'fallback', parametros: { T2M: {}, PRECTOTCORR: {}, RH2M: {} }, resumo: { tempMedia: null, precipAcumulada: null, umidadeMedia: null } })
      expect(await service.getPrevisao('1234')).toMatchObject({ fonte: 'fallback', clima: [], atualizadoEm: '' })
      expect(await service.getEstacaoData('A123')).toMatchObject({ fonte: 'fallback', temperatura: null, chuva: null, data: '' })
    }
  })

  it('não consulta ondas do litoral como provedor de avisos meteorológicos', async () => {
    const service = new ClimaService({ updateSourceStatus: vi.fn() } as unknown as DataSourceManager)
    expect(await service.getAlertasRegiao('MT')).toEqual([])
    expect(fake.http.get).not.toHaveBeenCalled()
  })
})
