/**
 * ALETIS - API de Inteligência Climática
 *
 * Rotas de dados meteorológicos e agroclimáticos.
 * Aceita QUALQUER município brasileiro via IBGE API + Open-Meteo (primary),
 * com fontes complementares identificadas e indisponibilidade explícita.
 *
 * GET /api/clima/municipio/:codigoIbge
 * GET /api/clima/local?lat=&lon=&nome=
 * GET /api/clima/previsao/:codigoCidade/:dias
 * GET /api/clima/historico?lat=&lon=&inicio=&fim=
 * GET /api/clima/alertas/:estado
 * GET /api/clima/municipios
 * GET /api/clima/buscar?q=
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import axios from 'axios'
import NodeCache from 'node-cache'
import { z } from 'zod'
import { DataSourceManager } from '../services/DataSourceManager.js'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface Municipio {
  codigoIbge: string
  nome: string
  uf: string
  lat: number | null
  lon: number | null
  altitude: number | null
  bioma: string
}

interface CondicaoAtual {
  temperatura: number | null
  sensacaoTermica: number | null
  umidade: number | null
  pressaoAtmosferica: number | null
  ventoVelocidade: number | null
  ventoDirecao: string
  precipitacao24h: number | null
  condicao: string
  condicaoIcone: string
  indicePM25: number | null
  indiceUV: number | null
  visibilidade: number | null
  pontoOrvalho: number | null
  atualizadoEm: string
  estado: string
  fonte: string
  fonteOrigem: 'api' | 'cache' | 'fallback'
}

interface PrevisaoDia {
  data: string
  diaSemana: string
  tempMaxima: number | null
  tempMinima: number | null
  umidadeMaxima: number | null
  umidadeMinima: number | null
  precipitacaoMm: number | null
  probabilidadeChuva: number | null
  ventoVelocidade: number | null
  ventoDirecao: string
  condicao: string
  condicaoIcone: string
  indicePM25: number | null
  indiceUV: number | null
  nascerSol: string
  porSol: string
  evapotranspiracaoMm?: number | null
  fonteOrigem: 'api' | 'cache' | 'fallback'
  estado: string
  coletadoEm: string | null
  validoAte: string | null
}

interface DadoHistorico {
  data: string
  tempMedia: number | null
  tempMaxima: number | null
  tempMinima: number | null
  precipitacaoMm: number | null
  umidadeMedia: number | null
  ventoMedio: number | null
  radiacao: number | null
}

interface AlertaClimatico {
  id: string
  tipo: 'severo' | 'alerta' | 'favoravel' | 'informativo'
  titulo: string
  descricao: string
  estado: string
  municipiosAfetados: string[]
  vigenciaInicio: string
  vigenciaFim: string
  fonte: string
  emitidoEm: string
}

// ────────────────────────────────────────────────────────────
// Bonus INMET station codes for known agro hubs
// (Used as supplementary sensor data when available)
// ────────────────────────────────────────────────────────────

const ESTACAO_INMET: Record<string, string> = {
  '4127700': 'A843',  // Toledo-PR
  '5003702': 'A721',  // Dourados-MS
  '5107875': 'A920',  // Sorriso-MT
  '5218805': 'A013',  // Rio Verde-GO
  '3170206': 'A507',  // Uberlandia-MG
  '3543402': 'A711',  // Ribeirao Preto-SP
  '4104808': 'A836',  // Cascavel-PR
  '5107602': 'A924',  // Rondonopolis-MT
  '4106902': 'A809',  // Londrina-PR
  '5002704': 'A702',  // Campo Grande-MS
}

const BIOMA_POR_UF: Record<string, string> = {
  AC: 'Amazonia', AM: 'Amazonia', AP: 'Amazonia', PA: 'Amazonia', RO: 'Amazonia', RR: 'Amazonia', TO: 'Cerrado/Amazonia',
  MT: 'Cerrado/Amazonia', GO: 'Cerrado', DF: 'Cerrado', MA: 'Cerrado', PI: 'Cerrado/Caatinga',
  BA: 'Caatinga/Cerrado', CE: 'Caatinga', PB: 'Caatinga', PE: 'Caatinga', RN: 'Caatinga', AL: 'Caatinga/Mata Atlantica', SE: 'Caatinga',
  MG: 'Cerrado/Mata Atlantica', ES: 'Mata Atlantica', RJ: 'Mata Atlantica', SP: 'Mata Atlantica/Cerrado',
  PR: 'Mata Atlantica', SC: 'Mata Atlantica', RS: 'Mata Atlantica/Pampa', MS: 'Cerrado/Pantanal',
}

// ────────────────────────────────────────────────────────────
// Municipio resolver: IBGE API (lookup by code) + local cache
// ────────────────────────────────────────────────────────────

const municipioCache = new NodeCache({ stdTTL: 86400 * 7, checkperiod: 3600 }) // 7d cache
let municipiosAllLoaded: Array<{ codigoIbge: string; nome: string; uf: string }> | null = null

/** Loads all 5570 BR municipalities once, from IBGE localities API */
async function loadAllMunicipios(): Promise<typeof municipiosAllLoaded> {
  if (municipiosAllLoaded) return municipiosAllLoaded
  const cached = municipioCache.get<typeof municipiosAllLoaded>('all_municipios')
  if (cached) { municipiosAllLoaded = cached; return cached }

  try {
    const r = await axios.get('https://servicodados.ibge.gov.br/api/v1/localidades/municipios', {
      timeout: 15000,
      headers: { 'User-Agent': 'ALETIS-System/1.0' },
    })
    if (Array.isArray(r.data)) {
      const mapped = r.data.map((m: any) => ({
        codigoIbge: String(m.id),
        nome: m.nome as string,
        uf: m.microrregiao?.mesorregiao?.UF?.sigla as string,
      }))
      municipiosAllLoaded = mapped
      municipioCache.set('all_municipios', mapped)
      return mapped
    }
  } catch (err) {
    console.warn('[Clima] Falha ao carregar lista IBGE de municípios:', (err as Error).message)
  }
  return null
}

/** Resolves a municipality by IBGE code, hitting IBGE then BrasilAPI */
async function resolveMunicipioPorCodigo(codigoIbge: string): Promise<Municipio | null> {
  const cacheKey = `mun_${codigoIbge}`
  const cached = municipioCache.get<Municipio>(cacheKey)
  if (cached) return cached

  // Step 1: IBGE localidades (has nome and uf, no lat/lon)
  let nome = ''
  let uf = ''
  try {
    const r = await axios.get(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigoIbge}`, {
      timeout: 7000, headers: { 'User-Agent': 'ALETIS-System/1.0' },
    })
    if (r.data?.nome) {
      nome = r.data.nome as string
      uf = r.data.microrregiao?.mesorregiao?.UF?.sigla as string
    }
  } catch { /* fall through */ }

  if (!nome) return null

  // Step 2: BrasilAPI IBGE → lat/lon
  let lat: number | null = null, lon: number | null = null
  try {
    const r = await axios.get(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`, {
      timeout: 7000, headers: { 'User-Agent': 'ALETIS-System/1.0' },
    })
    if (Array.isArray(r.data)) {
      const match = r.data.find((m: any) => String(m.codigo_ibge) === codigoIbge)
      if (match && validCoordinates(match.latitude, match.longitude)) {
        lat = match.latitude
        lon = match.longitude
      }
    }
  } catch { /* fall through */ }

  // Step 3: If still no lat/lon, geocode via OpenStreetMap Nominatim
  if (lat === null || lon === null) {
    try {
      const r = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: `${nome}, ${uf}, Brazil`, format: 'json', limit: 1 },
        timeout: 7000, headers: { 'User-Agent': 'ALETIS-System/1.0 (agro)' },
      })
      if (Array.isArray(r.data) && r.data.length > 0) {
        const resolvedLat = Number(r.data[0].lat)
        const resolvedLon = Number(r.data[0].lon)
        if (validCoordinates(resolvedLat, resolvedLon)) {
          lat = resolvedLat
          lon = resolvedLon
        }
      }
    } catch { /* ignore */ }
  }

  const municipio: Municipio = {
    codigoIbge, nome, uf, lat, lon, altitude: null,
    bioma: BIOMA_POR_UF[uf] || 'Não informado',
  }
  // Uma falha de geocodificação deve poder ser tentada novamente.
  if (lat !== null && lon !== null) municipioCache.set(cacheKey, municipio)
  return municipio
}

// ────────────────────────────────────────────────────────────
// WMO weather code (Open-Meteo) → condition name+icon
// ────────────────────────────────────────────────────────────

function wmoToCondition(code: number): { nome: string; icone: string } {
  if (code === 0) return { nome: 'Ensolarado', icone: 'sol' }
  if (code === 1 || code === 2) return { nome: 'Parcialmente nublado', icone: 'parcialmente_nublado' }
  if (code === 3) return { nome: 'Nublado', icone: 'nublado' }
  if (code >= 45 && code <= 48) return { nome: 'Neblina', icone: 'neblina' }
  if (code >= 51 && code <= 57) return { nome: 'Chuvisco', icone: 'chuva_leve' }
  if (code >= 61 && code <= 65) return { nome: 'Chuva', icone: 'chuva' }
  if (code >= 66 && code <= 67) return { nome: 'Chuva congelante', icone: 'chuva' }
  if (code >= 71 && code <= 77) return { nome: 'Neve', icone: 'neblina' }
  if (code >= 80 && code <= 82) return { nome: 'Pancadas de chuva', icone: 'chuva' }
  if (code >= 95 && code <= 99) return { nome: 'Tempestade', icone: 'tempestade' }
  return { nome: 'Condição não informada', icone: 'indisponivel' }
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function ventoDirecaoNome(graus: number): string {
  if (!Number.isFinite(graus)) return ''
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(((graus % 360) / 45)) % 8]
}

// Somente campos publicados; ausência de dado não recebe valor estimado.
const measured = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > -900 ? value : null
const validCoordinates = (lat: unknown, lon: unknown): boolean => typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lon === 'number' && Number.isFinite(lon) && Math.abs(lon) <= 180
const coordinatesSchema = z.object({
  lat: z.string().trim().min(1).transform(Number).pipe(z.number().finite().min(-90).max(90)),
  lon: z.string().trim().min(1).transform(Number).pipe(z.number().finite().min(-180).max(180)),
})

async function buildMunicipioResponse(mun: Municipio, dsm: DataSourceManager, dias = 7) {
  if (mun.lat === null || mun.lon === null || !validCoordinates(mun.lat, mun.lon)) {
    return { municipio: mun, condicaoAtual: null, previsao: [] as PrevisaoDia[], fontes: [] as string[],
      fonteOrigem: 'fallback', estado: 'indisponivel', atualizadoEm: null, consultadoEm: new Date().toISOString(),
      aviso: 'Coordenadas do município indisponíveis. Nenhum dado meteorológico foi atribuído a outra localização.' }
  }
  let condicaoAtual: CondicaoAtual | null = null
  let previsao: PrevisaoDia[] = []
  const fontes: string[] = []
  const [currentResult, forecastResult] = await Promise.allSettled([
    dsm.openMeteo.getCurrent(mun.lat, mun.lon),
    dsm.openMeteo.getForecast(mun.lat, mun.lon, dias),
  ])
  const current = currentResult.status === 'fulfilled' ? currentResult.value : null
  const forecast = forecastResult.status === 'fulfilled' ? forecastResult.value : null
  if (current && current.fonte !== 'fallback' && current.observadoEm && Number.isFinite(Date.parse(current.observadoEm))) {
    const wmo = wmoToCondition(current.weatherCode)
    condicaoAtual = {
      temperatura: measured(current.temperature), sensacaoTermica: null,
      umidade: measured(current.humidity), pressaoAtmosferica: null,
      ventoVelocidade: measured(current.windSpeed), ventoDirecao: ventoDirecaoNome(current.windDirection),
      precipitacao24h: null, condicao: wmo.nome, condicaoIcone: wmo.icone,
      indicePM25: null, indiceUV: null, visibilidade: null, pontoOrvalho: null,
      atualizadoEm: current.observadoEm, fonteOrigem: current.fonte, fonte: 'Open-Meteo',
      estado: current.estado === 'atrasado' || Date.now() - Date.parse(current.observadoEm) > 3600000 ? 'atrasado' : 'disponivel',
    }
    fontes.push('Open-Meteo (condição atual)')
  }
  if (forecast && forecast.fonte !== 'fallback' && forecast.daily?.time?.length) {
    previsao = forecast.daily.time.map((data, i) => ({
      data, diaSemana: DIAS_SEMANA[new Date(data + 'T12:00:00Z').getUTCDay()],
      tempMaxima: measured(forecast.daily.temperature_2m_max[i]), tempMinima: measured(forecast.daily.temperature_2m_min[i]),
      umidadeMaxima: null, umidadeMinima: null, precipitacaoMm: measured(forecast.daily.precipitation_sum[i]),
      probabilidadeChuva: null, ventoVelocidade: measured(forecast.daily.windspeed_10m_max[i]), ventoDirecao: '',
      condicao: 'Condição não informada', condicaoIcone: 'indisponivel', indicePM25: null,
      indiceUV: measured(forecast.daily.uv_index_max[i]), nascerSol: '', porSol: '',
      evapotranspiracaoMm: measured(forecast.daily.et0_fao_evapotranspiration[i]),
      fonteOrigem: forecast.fonte, estado: forecast.estado === 'atrasado' || (forecast.validoAte || data) < new Date().toISOString().slice(0, 10) ? 'atrasado' : 'disponivel',
      coletadoEm: forecast.coletadoEm || null, validoAte: forecast.validoAte || null,
    }))
    fontes.push('Open-Meteo (previsão)')
  }
  const origins = [condicaoAtual?.fonteOrigem, previsao.length ? forecast?.fonte : null].filter(Boolean)
  const fonteOrigem = origins.includes('api') ? 'api' : origins.includes('cache') ? 'cache' : 'fallback'
  const estado = !condicaoAtual && !previsao.length ? 'indisponivel' : !condicaoAtual || !previsao.length || condicaoAtual.estado === 'atrasado' || previsao.some(p => p.estado === 'atrasado') ? 'parcial' : 'disponivel'
  return { municipio: mun, condicaoAtual, previsao, fontes, fonteOrigem, estado,
    atualizadoEm: condicaoAtual?.atualizadoEm || null, consultadoEm: new Date().toISOString(),
    aviso: 'Campos sem medição permanecem indisponíveis. Precipitação instantânea não é acumulado de 24h; probabilidade de chuva não é inferida do volume.' }
}

function summarizeHistory(dados: DadoHistorico[]) {
  const complete = (key: keyof DadoHistorico) => dados.length && dados.every(d => measured(d[key]) != null) ? dados.map(d => d[key] as number) : null
  const temps = complete('tempMedia'), highs = complete('tempMaxima'), lows = complete('tempMinima'), rain = complete('precipitacaoMm')
  return {
    temperaturaMedia: temps ? Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)) : null,
    temperaturaMaxima: highs ? Math.max(...highs) : null, temperaturaMinima: lows ? Math.min(...lows) : null,
    precipitacaoAcumulada: rain ? Number(rain.reduce((a, b) => a + b, 0).toFixed(1)) : null,
    diasComChuva: rain ? rain.filter(p => p > 0.2).length : null, totalDias: dados.length,
  }
}

// ────────────────────────────────────────────────────────────
// Quick-access agro hub municipios (preloaded)
// ────────────────────────────────────────────────────────────

const MUNICIPIOS_AGRO: Record<string, Municipio> = {
  '4127700': { codigoIbge: '4127700', nome: 'Toledo', uf: 'PR', lat: -24.7136, lon: -53.7433, altitude: 560, bioma: 'Mata Atlantica' },
  '5003702': { codigoIbge: '5003702', nome: 'Dourados', uf: 'MS', lat: -22.2231, lon: -54.8118, altitude: 430, bioma: 'Cerrado/Mata Atlantica' },
  '5107875': { codigoIbge: '5107875', nome: 'Sorriso', uf: 'MT', lat: -12.5426, lon: -55.7211, altitude: 380, bioma: 'Cerrado/Amazonia' },
  '5218805': { codigoIbge: '5218805', nome: 'Rio Verde', uf: 'GO', lat: -17.7927, lon: -50.9286, altitude: 748, bioma: 'Cerrado' },
  '3170206': { codigoIbge: '3170206', nome: 'Uberlandia', uf: 'MG', lat: -18.9186, lon: -48.2772, altitude: 863, bioma: 'Cerrado' },
  '3543402': { codigoIbge: '3543402', nome: 'Ribeirao Preto', uf: 'SP', lat: -21.1704, lon: -47.8103, altitude: 546, bioma: 'Cerrado/Mata Atlantica' },
  '4104808': { codigoIbge: '4104808', nome: 'Cascavel', uf: 'PR', lat: -24.9573, lon: -53.4593, altitude: 781, bioma: 'Mata Atlantica' },
  '5107602': { codigoIbge: '5107602', nome: 'Rondonopolis', uf: 'MT', lat: -16.4700, lon: -54.6353, altitude: 227, bioma: 'Cerrado' },
  '4106902': { codigoIbge: '4106902', nome: 'Londrina', uf: 'PR', lat: -23.3103, lon: -51.1628, altitude: 610, bioma: 'Mata Atlantica' },
  '5002704': { codigoIbge: '5002704', nome: 'Campo Grande', uf: 'MS', lat: -20.4697, lon: -54.6201, altitude: 592, bioma: 'Cerrado' },
}

// ────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────

export default async function climaRoutes(app: FastifyInstance) {
  const dsm = DataSourceManager.getInstance()

  // Pre-warm the municipio list on first call
  loadAllMunicipios().catch(() => {})

  /**
   * GET /api/clima/municipio/:codigoIbge
   * Works for ANY Brazilian municipality IBGE code.
   */
  app.get('/api/clima/municipio/:codigoIbge', async (
    request: FastifyRequest<{ Params: { codigoIbge: string } }>,
    reply: FastifyReply,
  ) => {
    const { codigoIbge } = request.params

    // Try curated first (preloaded), then IBGE resolver
    let mun: Municipio | null = MUNICIPIOS_AGRO[codigoIbge] || null
    if (!mun) mun = await resolveMunicipioPorCodigo(codigoIbge)
    if (!mun) {
      return reply.status(404).send({
        erro: 'Município não encontrado',
        mensagem: `Código IBGE ${codigoIbge} não foi localizado no IBGE.`,
      })
    }

    return buildMunicipioResponse(mun, dsm)
  })

  /**
   * GET /api/clima/local?lat=&lon=&nome=&uf=
   * Arbitrary coordinates (useful for any place, including non-municipality points)
   */
  app.get('/api/clima/local', async (
    request: FastifyRequest<{ Querystring: { lat: string; lon: string; nome?: string; uf?: string } }>,
    reply: FastifyReply,
  ) => {
    const coords = coordinatesSchema.safeParse(request.query)
    if (!coords.success) {
      return reply.status(400).send({ erro: 'Coordenadas inválidas', mensagem: 'lat e lon obrigatórios.' })
    }
    const { lat, lon } = coords.data

    const mun: Municipio = {
      codigoIbge: 'custom',
      nome: request.query.nome || 'Local customizado',
      uf: request.query.uf || '',
      lat, lon, altitude: null,
      bioma: BIOMA_POR_UF[request.query.uf || ''] || 'Não informado',
    }

    return buildMunicipioResponse(mun, dsm)
  })

  /**
   * GET /api/clima/buscar?q=
   * Search any BR municipality by name (full-text). Returns top 15 matches.
   */
  app.get('/api/clima/buscar', async (
    request: FastifyRequest<{ Querystring: { q: string; uf?: string } }>,
    reply: FastifyReply,
  ) => {
    const q = (request.query.q || '').trim().toLowerCase()
    const uf = (request.query.uf || '').toUpperCase()
    if (q.length < 2) {
      return reply.status(400).send({ erro: 'Query muito curta', mensagem: 'Mínimo de 2 caracteres.' })
    }

    const all = await loadAllMunicipios()
    if (!all) {
      return { total: 0, resultados: [], erro: 'Lista IBGE indisponível' }
    }

    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const qn = norm(q)
    const matches = all.filter(m =>
      (!uf || m.uf === uf) && norm(m.nome).includes(qn)
    ).slice(0, 15)

    return {
      total: matches.length,
      resultados: matches,
    }
  })

  /**
   * GET /api/clima/previsao/:codigoCidade/:dias
   * Uses same ANY-city resolver.
   */
  app.get('/api/clima/previsao/:codigoCidade/:dias', async (
    request: FastifyRequest<{ Params: { codigoCidade: string; dias: string } }>,
    reply: FastifyReply,
  ) => {
    const { codigoCidade, dias: diasStr } = request.params
    const dias = parseInt(diasStr, 10)
    if (isNaN(dias) || dias < 1 || dias > 15) {
      return reply.status(400).send({ erro: 'Parâmetro inválido', mensagem: 'dias entre 1 e 15.' })
    }

    let mun: Municipio | null = MUNICIPIOS_AGRO[codigoCidade] || null
    if (!mun) mun = await resolveMunicipioPorCodigo(codigoCidade)
    if (!mun) return reply.status(404).send({ erro: 'Município não encontrado' })

    const full = await buildMunicipioResponse(mun, dsm, dias)
    return {
      municipio: { nome: mun.nome, uf: mun.uf, codigoIbge: mun.codigoIbge },
      dias,
      previsao: full.previsao.slice(0, dias),
      fonte: full.fontes.join(' + '),
      fonteOrigem: full.previsao[0]?.fonteOrigem || 'fallback',
      estado: full.previsao.length ? full.previsao.some(p => p.estado === 'atrasado') ? 'atrasado' : 'disponivel' : 'indisponivel',
      atualizadoEm: full.previsao[0]?.coletadoEm || null,
    }
  })

  /**
   * GET /api/clima/historico?lat=&lon=&inicio=&fim=
   * Open-Meteo archive (primary) + NASA POWER (fallback) — works globally.
   */
  app.get('/api/clima/historico', async (
    request: FastifyRequest<{ Querystring: { lat: string; lon: string; inicio: string; fim: string } }>,
    reply: FastifyReply,
  ) => {
    const { lat: latStr, lon: lonStr, inicio, fim } = request.query
    const coords = coordinatesSchema.safeParse({ lat: latStr, lon: lonStr })
    if (!coords.success) return reply.status(400).send({ erro: 'Coordenadas inválidas' })
    const { lat, lon } = coords.data
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      return reply.status(400).send({ erro: 'Formato de data inválido', mensagem: 'Use YYYY-MM-DD.' })
    }
    const diffDays = Math.ceil((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000)
    if (!Number.isFinite(diffDays) || diffDays < 0 || diffDays > 365) {
      return reply.status(400).send({ erro: 'Período inválido', mensagem: 'Max 365 dias.' })
    }

    const respond = (dados: DadoHistorico[], fonte: string, fonteOrigem: string, estado: string) => ({
      coordenadas: { lat, lon }, periodo: { inicio, fim }, resumo: summarizeHistory(dados), dados,
      fonte, fonteOrigem, estado, atualizadoEm: dados.at(-1)?.data || null,
      consultadoEm: new Date().toISOString(), aviso: 'Resumo calculado sobre os dias recebidos; campos e dias ausentes não são preenchidos.' })
    try {
      const history = await dsm.openMeteo.getHistorical(lat, lon, inicio, fim)
      if (history.fonte !== 'fallback' && history.daily.time.length) {
        const dados: DadoHistorico[] = history.daily.time.map((data, i) => ({ data,
          tempMedia: null, tempMaxima: measured(history.daily.temperature_2m_max[i]), tempMinima: measured(history.daily.temperature_2m_min[i]),
          precipitacaoMm: measured(history.daily.precipitation_sum[i]), umidadeMedia: null, ventoMedio: null, radiacao: null,
        })).filter(d => d.data >= inicio && d.data <= fim)
        if (dados.length) return respond(dados, 'Open-Meteo Archive', history.fonte, history.estado === 'atrasado' ? 'atrasado' : 'parcial')
      }
    } catch { /* A fonte complementar pode ter observações válidas. */ }
    try {
      const nasa = await dsm.clima.getDadosNASA(lat, lon, inicio, fim)
      if (nasa.fonte !== 'fallback') {
        const dados: DadoHistorico[] = Object.entries(nasa.parametros.T2M).map(([key, value]) => ({
          data: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`, tempMedia: measured(value),
          tempMaxima: null, tempMinima: null, precipitacaoMm: measured(nasa.parametros.PRECTOTCORR[key]),
          umidadeMedia: measured(nasa.parametros.RH2M[key]), ventoMedio: null, radiacao: null,
        })).filter(d => d.tempMedia != null && d.data >= inicio && d.data <= fim).sort((a, b) => a.data.localeCompare(b.data))
        if (dados.length) return respond(dados, 'NASA POWER', nasa.fonte, 'parcial')
      }
    } catch { /* Sem observação real, a série permanece vazia. */ }
    return respond([], 'indisponível', 'fallback', 'indisponivel')
  })

  /**
   * GET /api/clima/alertas/:estado
   */
  app.get('/api/clima/alertas/:estado', async (
    request: FastifyRequest<{ Params: { estado: string } }>,
    reply: FastifyReply,
  ) => {
    const uf = request.params.estado.toUpperCase()
    const ESTADOS_VALIDOS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO']
    if (uf.length !== 2 || !ESTADOS_VALIDOS.includes(uf)) {
      return reply.status(400).send({ erro: 'UF inválida', mensagem: `"${request.params.estado}" não é UF válida.` })
    }

    // Saneamento: descarta alerta com vigência expirada e troca início/fim
    // se vierem invertidos da fonte.
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const sanitize = (a: AlertaClimatico): AlertaClimatico | null => {
      const ini = new Date(a.vigenciaInicio); ini.setHours(0, 0, 0, 0)
      const fim = new Date(a.vigenciaFim); fim.setHours(0, 0, 0, 0)
      if (isNaN(ini.getTime()) || isNaN(fim.getTime())) return null
      const [start, end] = ini.getTime() <= fim.getTime() ? [ini, fim] : [fim, ini]
      if (end.getTime() < hoje.getTime()) return null  // expirado
      return {
        ...a,
        vigenciaInicio: start.toISOString().slice(0, 10),
        vigenciaFim: end.toISOString().slice(0, 10),
      }
    }
    const drop = (xs: (AlertaClimatico | null)[]): AlertaClimatico[] =>
      xs.filter((a): a is AlertaClimatico => !!a)

    let fonteOrigem: 'api' | 'cache' | 'fallback' = 'fallback'

    try {
      const realAlertas = await dsm.clima.getAlertasRegiao(uf)
      if (realAlertas.length > 0 && realAlertas[0].fonte !== 'fallback') {
        fonteOrigem = realAlertas[0].fonte
        const combined: AlertaClimatico[] = realAlertas.filter(a => a.fonte !== 'fallback').map((a, i) => ({
          id: `real-${i}`,
          tipo: a.severidade === 'extrema' || a.severidade === 'alta' ? 'severo' as const : 'alerta' as const,
          titulo: a.tipo, descricao: a.descricao,
          estado: a.estado || uf, municipiosAfetados: [],
          vigenciaInicio: a.dataInicio, vigenciaFim: a.dataFim,
          fonte: `CPTEC/INPE (${a.fonte})`, emitidoEm: a.dataInicio,
        }))
        const allSanitized = drop(combined.map(sanitize))
        return {
          estado: uf,
          totalAlertas: allSanitized.length,
          alertas: allSanitized,
          fonteOrigem, consultadoEm: new Date().toISOString(),
          fonte: 'CPTEC/INPE', estadoDados: 'disponivel',
        }
      }
    } catch { /* fall through */ }

    const alertas: AlertaClimatico[] = []
    return {
      estado: uf, totalAlertas: alertas.length, alertas,
      fonteOrigem: 'fallback' as const,
      consultadoEm: new Date().toISOString(),
      fonte: 'indisponível', estadoDados: 'indisponivel',
    }
  })

  /**
   * GET /api/clima/municipios
   * Agro hub shortcuts (for quick-pick panel).
   */
  app.get('/api/clima/municipios', async () => {
    return {
      total: Object.keys(MUNICIPIOS_AGRO).length,
      municipios: Object.values(MUNICIPIOS_AGRO).map(m => ({
        codigoIbge: m.codigoIbge, nome: m.nome, uf: m.uf, lat: m.lat, lon: m.lon,
      })),
    }
  })
}
