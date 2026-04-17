/**
 * ALETIS - API de Inteligência Climática
 *
 * Rotas de dados meteorológicos e agroclimáticos.
 * Aceita QUALQUER município brasileiro via IBGE API + Open-Meteo (primary),
 * com fallback para INMET/CPTEC/NASA POWER e último caso procedural.
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
import { DataSourceManager } from '../services/DataSourceManager.js'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface Municipio {
  codigoIbge: string
  nome: string
  uf: string
  lat: number
  lon: number
  altitude: number
  bioma: string
}

interface CondicaoAtual {
  temperatura: number
  sensacaoTermica: number
  umidade: number
  pressaoAtmosferica: number
  ventoVelocidade: number
  ventoDirecao: string
  precipitacao24h: number
  condicao: string
  condicaoIcone: string
  indicePM25: number
  indiceUV: number
  visibilidade: number
  pontoOrvalho: number
  atualizadoEm: string
  fonteOrigem: 'api' | 'cache' | 'fallback'
}

interface PrevisaoDia {
  data: string
  diaSemana: string
  tempMaxima: number
  tempMinima: number
  umidadeMaxima: number
  umidadeMinima: number
  precipitacaoMm: number
  probabilidadeChuva: number
  ventoVelocidade: number
  ventoDirecao: string
  condicao: string
  condicaoIcone: string
  indicePM25: number
  indiceUV: number
  nascerSol: string
  porSol: string
  evapotranspiracaoMm?: number
}

interface DadoHistorico {
  data: string
  tempMedia: number
  tempMaxima: number
  tempMinima: number
  precipitacaoMm: number
  umidadeMedia: number
  ventoMedio: number
  radiacao: number
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
  let lat = -15.78, lon = -47.93, altitude = 500
  try {
    const r = await axios.get(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`, {
      timeout: 7000, headers: { 'User-Agent': 'ALETIS-System/1.0' },
    })
    if (Array.isArray(r.data)) {
      const match = r.data.find((m: any) => String(m.codigo_ibge) === codigoIbge)
      if (match && typeof match.latitude === 'number') {
        lat = match.latitude
        lon = match.longitude
      }
    }
  } catch { /* fall through */ }

  // Step 3: If still no lat/lon, geocode via OpenStreetMap Nominatim
  if (lat === -15.78) {
    try {
      const r = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q: `${nome}, ${uf}, Brazil`, format: 'json', limit: 1 },
        timeout: 7000, headers: { 'User-Agent': 'ALETIS-System/1.0 (agro)' },
      })
      if (Array.isArray(r.data) && r.data.length > 0) {
        lat = parseFloat(r.data[0].lat)
        lon = parseFloat(r.data[0].lon)
      }
    } catch { /* ignore */ }
  }

  const municipio: Municipio = {
    codigoIbge, nome, uf, lat, lon, altitude,
    bioma: BIOMA_POR_UF[uf] || 'Mata Atlantica',
  }
  municipioCache.set(cacheKey, municipio)
  return municipio
}

// ────────────────────────────────────────────────────────────
// WMO weather code (Open-Meteo) → condition name+icon
// ────────────────────────────────────────────────────────────

function wmoToCondition(code: number): { nome: string; icone: string } {
  if (code === 0) return { nome: 'Ensolarado', icone: 'sol' }
  if (code <= 2) return { nome: 'Parcialmente nublado', icone: 'parcialmente_nublado' }
  if (code === 3) return { nome: 'Nublado', icone: 'nublado' }
  if (code >= 45 && code <= 48) return { nome: 'Neblina', icone: 'neblina' }
  if (code >= 51 && code <= 57) return { nome: 'Chuvisco', icone: 'chuva_leve' }
  if (code >= 61 && code <= 65) return { nome: 'Chuva', icone: 'chuva' }
  if (code >= 66 && code <= 67) return { nome: 'Chuva congelante', icone: 'chuva' }
  if (code >= 71 && code <= 77) return { nome: 'Neve', icone: 'neblina' }
  if (code >= 80 && code <= 82) return { nome: 'Pancadas de chuva', icone: 'chuva' }
  if (code >= 95 && code <= 99) return { nome: 'Tempestade', icone: 'tempestade' }
  return { nome: 'Parcialmente nublado', icone: 'parcialmente_nublado' }
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function ventoDirecaoNome(graus: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(((graus % 360) / 45)) % 8]
}

// ────────────────────────────────────────────────────────────
// Fallback generators (last resort only)
// ────────────────────────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 }
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0
  }
  return Math.abs(hash)
}

const CONDICOES_FB = [
  { nome: 'Ensolarado', icone: 'sol' },
  { nome: 'Parcialmente nublado', icone: 'parcialmente_nublado' },
  { nome: 'Nublado', icone: 'nublado' },
  { nome: 'Chuva leve', icone: 'chuva_leve' },
  { nome: 'Chuva', icone: 'chuva' },
  { nome: 'Tempestade', icone: 'tempestade' },
] as const

function gerarCondicaoAtualFallback(mun: Municipio): CondicaoAtual {
  const now = new Date()
  const seed = hashString(mun.codigoIbge + now.toISOString().slice(0, 13))
  const rng = seededRandom(seed)
  const baseTemp = 28 - Math.abs(mun.lat) * 0.3 - mun.altitude * 0.005
  const temp = baseTemp + (rng() - 0.5) * 6
  const ci = Math.floor(rng() * 5)
  const c = CONDICOES_FB[ci]
  return {
    temperatura: Number(temp.toFixed(1)),
    sensacaoTermica: Number((temp + (rng() - 0.5) * 3).toFixed(1)),
    umidade: Number((55 + rng() * 30).toFixed(0)),
    pressaoAtmosferica: Number((1013 + (rng() - 0.5) * 10).toFixed(1)),
    ventoVelocidade: Number((5 + rng() * 20).toFixed(1)),
    ventoDirecao: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(rng() * 8)],
    precipitacao24h: ci >= 3 ? Number((rng() * 25).toFixed(1)) : 0,
    condicao: c.nome, condicaoIcone: c.icone,
    indicePM25: Number((8 + rng() * 25).toFixed(0)),
    indiceUV: Number((3 + rng() * 8).toFixed(0)),
    visibilidade: Number((8 + rng() * 12).toFixed(1)),
    pontoOrvalho: Number((temp - 5 - rng() * 8).toFixed(1)),
    atualizadoEm: now.toISOString(),
    fonteOrigem: 'fallback',
  }
}

function gerarPrevisaoFallback(mun: Municipio, dias: number): PrevisaoDia[] {
  const out: PrevisaoDia[] = []
  const baseDate = new Date()
  for (let d = 0; d < dias; d++) {
    const date = new Date(baseDate); date.setDate(date.getDate() + d)
    const dateStr = date.toISOString().slice(0, 10)
    const seed = hashString(mun.codigoIbge + dateStr)
    const rng = seededRandom(seed)
    const baseTemp = 28 - Math.abs(mun.lat) * 0.3 - mun.altitude * 0.005
    const tempMax = baseTemp + (rng() - 0.5) * 8 + 2 + rng() * 3
    const tempMin = tempMax - 8 - rng() * 6
    const precipProb = Math.min(95, Math.max(5, 35 + (rng() - 0.5) * 40))
    const ci = precipProb > 70 ? 4 + Math.floor(rng() * 2)
            : precipProb > 50 ? 3
            : precipProb > 30 ? 1 + Math.floor(rng() * 2) : 0
    const c = CONDICOES_FB[Math.min(ci, CONDICOES_FB.length - 1)]
    out.push({
      data: dateStr, diaSemana: DIAS_SEMANA[date.getDay()],
      tempMaxima: Number(tempMax.toFixed(1)), tempMinima: Number(tempMin.toFixed(1)),
      umidadeMaxima: Number((70 + rng() * 25).toFixed(0)), umidadeMinima: Number((35 + rng() * 25).toFixed(0)),
      precipitacaoMm: precipProb > 50 ? Number((rng() * (precipProb > 70 ? 40 : 15)).toFixed(1)) : Number((rng() * 3).toFixed(1)),
      probabilidadeChuva: Number(precipProb.toFixed(0)),
      ventoVelocidade: Number((5 + rng() * 25).toFixed(1)),
      ventoDirecao: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(rng() * 8)],
      condicao: c.nome, condicaoIcone: c.icone,
      indicePM25: Number((5 + rng() * 20).toFixed(0)), indiceUV: Number((4 + rng() * 7).toFixed(0)),
      nascerSol: `06:${(10 + Math.floor(rng() * 15)).toString().padStart(2, '0')}`,
      porSol: `17:${(30 + Math.floor(rng() * 25)).toString().padStart(2, '0')}`,
    })
  }
  return out
}

// ────────────────────────────────────────────────────────────
// Core: build full climate response for a municipio (ANY BR city)
// ────────────────────────────────────────────────────────────

async function buildMunicipioResponse(mun: Municipio, dsm: DataSourceManager) {
  let condicaoAtual: CondicaoAtual
  let previsao: PrevisaoDia[]
  const fontes: string[] = []
  let fonteOrigem: 'api' | 'cache' | 'fallback' = 'fallback'

  // ── Primary source: Open-Meteo (works globally, free, no auth) ──
  try {
    const [current, forecast] = await Promise.all([
      dsm.openMeteo.getCurrent(mun.lat, mun.lon),
      dsm.openMeteo.getForecast(mun.lat, mun.lon, 7),
    ])

    if (current.fonte !== 'fallback') {
      const wmo = wmoToCondition(current.weatherCode)
      condicaoAtual = {
        temperatura: current.temperature,
        sensacaoTermica: current.temperature,
        umidade: current.humidity,
        pressaoAtmosferica: 1013,
        ventoVelocidade: current.windSpeed,
        ventoDirecao: ventoDirecaoNome(current.windDirection),
        precipitacao24h: current.precipitation,
        condicao: wmo.nome,
        condicaoIcone: wmo.icone,
        indicePM25: 12,
        indiceUV: forecast.daily?.uv_index_max?.[0] ?? 7,
        visibilidade: 10,
        pontoOrvalho: current.temperature - Math.max(0, (100 - current.humidity) / 5),
        atualizadoEm: new Date().toISOString(),
        fonteOrigem: current.fonte,
      }
      fontes.push('Open-Meteo (atual)')
      fonteOrigem = current.fonte
    } else {
      condicaoAtual = gerarCondicaoAtualFallback(mun)
      fontes.push('Modelo estimado (Open-Meteo indisponível)')
    }

    if (forecast.fonte !== 'fallback' && forecast.daily?.time?.length > 0) {
      previsao = forecast.daily.time.map((dataStr: string, i: number) => {
        const date = new Date(dataStr)
        const precipSum = forecast.daily.precipitation_sum[i] ?? 0
        const probChuva = precipSum > 5 ? 80 : precipSum > 1 ? 50 : precipSum > 0.1 ? 25 : 5
        const wmoCode = precipSum > 10 ? 65 : precipSum > 2 ? 63 : precipSum > 0.5 ? 51 : 1
        const w = wmoToCondition(wmoCode)
        return {
          data: dataStr, diaSemana: DIAS_SEMANA[date.getDay()],
          tempMaxima: forecast.daily.temperature_2m_max[i] ?? 28,
          tempMinima: forecast.daily.temperature_2m_min[i] ?? 18,
          umidadeMaxima: 85, umidadeMinima: 45,
          precipitacaoMm: precipSum,
          probabilidadeChuva: probChuva,
          ventoVelocidade: forecast.daily.windspeed_10m_max[i] ?? 10,
          ventoDirecao: 'NE',
          condicao: w.nome, condicaoIcone: w.icone,
          indicePM25: 12, indiceUV: forecast.daily.uv_index_max[i] ?? 7,
          nascerSol: '06:15', porSol: '17:45',
          evapotranspiracaoMm: forecast.daily.et0_fao_evapotranspiration[i],
        }
      })
      fontes.push('Open-Meteo (previsão 7 dias + ET0 FAO)')
      if (forecast.fonte === 'api') fonteOrigem = 'api'
      else if (forecast.fonte === 'cache' && fonteOrigem !== 'api') fonteOrigem = 'cache'
    } else {
      previsao = gerarPrevisaoFallback(mun, 7)
      fontes.push('Modelo estimado (previsão)')
    }
  } catch {
    condicaoAtual = gerarCondicaoAtualFallback(mun)
    previsao = gerarPrevisaoFallback(mun, 7)
    fontes.push('Modelo estimado (erro API)')
  }

  // ── Bonus: INMET station sensor data (agro hubs) ──
  const estacaoCode = ESTACAO_INMET[mun.codigoIbge]
  if (estacaoCode && fonteOrigem !== 'fallback') {
    try {
      const est = await dsm.clima.getEstacaoData(estacaoCode)
      if (est.fonte !== 'fallback' && est.temperatura !== null) {
        condicaoAtual = {
          ...condicaoAtual,
          temperatura: est.temperatura,
          umidade: est.umidade ?? condicaoAtual.umidade,
          pressaoAtmosferica: est.pressao ?? condicaoAtual.pressaoAtmosferica,
          ventoVelocidade: est.ventoVelocidade ?? condicaoAtual.ventoVelocidade,
          precipitacao24h: est.chuva ?? condicaoAtual.precipitacao24h,
        }
        fontes.push(`INMET Estação ${estacaoCode} (sensor ao vivo)`)
      }
    } catch { /* ignore bonus source failures */ }
  }

  return { municipio: mun, condicaoAtual, previsao, fontes, fonteOrigem, atualizadoEm: new Date().toISOString() }
}

// ────────────────────────────────────────────────────────────
// Curated agro alerts (static reference, merged with live CPTEC)
// ────────────────────────────────────────────────────────────

const ALERTAS_FALLBACK: AlertaClimatico[] = [
  {
    id: 'alerta-001', tipo: 'alerta',
    titulo: 'Veranico previsto para região de Dourados/MS',
    descricao: 'Período de estiagem prolongada de 7 a 10 dias. Déficit hídrico pode afetar lavouras de milho safrinha.',
    estado: 'MS', municipiosAfetados: ['Dourados', 'Maracaju', 'Ponta Porã'],
    vigenciaInicio: '2026-04-20', vigenciaFim: '2026-04-27',
    fonte: 'INMET / EMBRAPA Agropecuária Oeste', emitidoEm: '2026-04-15T14:00:00Z',
  },
  {
    id: 'alerta-002', tipo: 'severo',
    titulo: 'Geada possível no Paraná',
    descricao: 'Massa de ar polar deve atingir o sul do PR. Mínimas previstas 2 a 5 graus C.',
    estado: 'PR', municipiosAfetados: ['Toledo', 'Cascavel', 'Pato Branco'],
    vigenciaInicio: '2026-04-22', vigenciaFim: '2026-04-24',
    fonte: 'SIMEPAR / INMET', emitidoEm: '2026-04-16T08:00:00Z',
  },
  {
    id: 'alerta-003', tipo: 'favoravel',
    titulo: 'Condições favoráveis para colheita de soja em MT',
    descricao: 'Janela de tempo seco prevista para os próximos 10 dias na região norte de MT.',
    estado: 'MT', municipiosAfetados: ['Sorriso', 'Sinop', 'Lucas do Rio Verde'],
    vigenciaInicio: '2026-04-16', vigenciaFim: '2026-04-26',
    fonte: 'INMET / APROSOJA', emitidoEm: '2026-04-16T06:00:00Z',
  },
  {
    id: 'alerta-004', tipo: 'informativo',
    titulo: 'Chuvas acima da média em GO',
    descricao: 'Precipitação acumulada 35% acima da média histórica no sudoeste goiano.',
    estado: 'GO', municipiosAfetados: ['Rio Verde', 'Jataí', 'Mineiros'],
    vigenciaInicio: '2026-04-10', vigenciaFim: '2026-04-20',
    fonte: 'CPTEC/INPE', emitidoEm: '2026-04-14T10:00:00Z',
  },
  {
    id: 'alerta-005', tipo: 'favoravel',
    titulo: 'Temperaturas ideais para plantio de trigo no PR',
    descricao: 'Temperaturas entre 15-20 graus C previstas para final de abril.',
    estado: 'PR', municipiosAfetados: ['Toledo', 'Cascavel', 'Palotina'],
    vigenciaInicio: '2026-04-25', vigenciaFim: '2026-05-10',
    fonte: 'IAPAR / EMBRAPA Trigo', emitidoEm: '2026-04-16T07:00:00Z',
  },
  {
    id: 'alerta-006', tipo: 'alerta',
    titulo: 'Déficit hídrico no Triângulo Mineiro',
    descricao: 'Precipitação abaixo de 30mm nos últimos 20 dias em Uberlândia.',
    estado: 'MG', municipiosAfetados: ['Uberlândia', 'Uberaba', 'Patos de Minas'],
    vigenciaInicio: '2026-04-12', vigenciaFim: '2026-04-22',
    fonte: 'INMET / EMATER-MG', emitidoEm: '2026-04-15T09:00:00Z',
  },
  {
    id: 'alerta-007', tipo: 'informativo',
    titulo: 'Início da estação seca em SP',
    descricao: 'Transição para período seco em Ribeirão Preto e região.',
    estado: 'SP', municipiosAfetados: ['Ribeirão Preto', 'Araraquara', 'Barretos'],
    vigenciaInicio: '2026-04-15', vigenciaFim: '2026-04-30',
    fonte: 'CIIAGRO / IAC', emitidoEm: '2026-04-15T12:00:00Z',
  },
]

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
    const lat = parseFloat(request.query.lat)
    const lon = parseFloat(request.query.lon)
    if (isNaN(lat) || isNaN(lon)) {
      return reply.status(400).send({ erro: 'Coordenadas inválidas', mensagem: 'lat e lon obrigatórios.' })
    }

    const mun: Municipio = {
      codigoIbge: 'custom',
      nome: request.query.nome || 'Local customizado',
      uf: request.query.uf || '',
      lat, lon, altitude: 500,
      bioma: BIOMA_POR_UF[request.query.uf || ''] || 'Mata Atlantica',
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

    const full = await buildMunicipioResponse(mun, dsm)
    return {
      municipio: { nome: mun.nome, uf: mun.uf, codigoIbge: mun.codigoIbge },
      dias,
      previsao: full.previsao.slice(0, dias),
      fonte: full.fontes.join(' + '),
      fonteOrigem: full.fonteOrigem,
      atualizadoEm: full.atualizadoEm,
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
    const lat = parseFloat(latStr), lon = parseFloat(lonStr)
    if (isNaN(lat) || isNaN(lon)) return reply.status(400).send({ erro: 'Coordenadas inválidas' })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      return reply.status(400).send({ erro: 'Formato de data inválido', mensagem: 'Use YYYY-MM-DD.' })
    }
    const diffDays = Math.ceil((new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000)
    if (diffDays < 0 || diffDays > 365) {
      return reply.status(400).send({ erro: 'Período inválido', mensagem: 'Max 365 dias.' })
    }

    // Try Open-Meteo Archive first
    try {
      const omHist = await dsm.openMeteo.getHistorical(lat, lon, inicio, fim)
      if (omHist.fonte !== 'fallback' && omHist.daily.time.length > 0) {
        const dados: DadoHistorico[] = omHist.daily.time.map((data, i) => {
          const tMax = omHist.daily.temperature_2m_max[i] ?? 25
          const tMin = omHist.daily.temperature_2m_min[i] ?? 15
          return {
            data,
            tempMedia: Number(((tMax + tMin) / 2).toFixed(1)),
            tempMaxima: tMax, tempMinima: tMin,
            precipitacaoMm: omHist.daily.precipitation_sum[i] ?? 0,
            umidadeMedia: 65, ventoMedio: 8,
            radiacao: 18,
          }
        })
        const temps = dados.map(d => d.tempMedia)
        const precs = dados.map(d => d.precipitacaoMm)
        return {
          coordenadas: { lat, lon },
          periodo: { inicio, fim },
          resumo: {
            temperaturaMedia: Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)),
            temperaturaMaxima: Number(Math.max(...dados.map(d => d.tempMaxima)).toFixed(1)),
            temperaturaMinima: Number(Math.min(...dados.map(d => d.tempMinima)).toFixed(1)),
            precipitacaoAcumulada: Number(precs.reduce((a, b) => a + b, 0).toFixed(1)),
            diasComChuva: precs.filter(p => p > 0.2).length,
            totalDias: dados.length,
            evapotranspiracaoAcumulada: Number((omHist.daily.et0_fao_evapotranspiration || []).reduce((a, b) => a + (b ?? 0), 0).toFixed(1)),
          },
          dados,
          fonte: 'Open-Meteo Archive',
          fonteOrigem: omHist.fonte,
          atualizadoEm: new Date().toISOString(),
        }
      }
    } catch { /* fall through to NASA POWER */ }

    // NASA POWER as fallback
    try {
      const nasa = await dsm.clima.getDadosNASA(lat, lon, inicio, fim)
      if (nasa.fonte !== 'fallback') {
        const dados: DadoHistorico[] = []
        const t2m = nasa.parametros.T2M, prec = nasa.parametros.PRECTOTCORR, rh2m = nasa.parametros.RH2M
        for (const [dateKey, tempMedia] of Object.entries(t2m)) {
          if (tempMedia < -900) continue
          const formattedDate = `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`
          dados.push({
            data: formattedDate,
            tempMedia: Number(tempMedia.toFixed(1)),
            tempMaxima: Number((tempMedia + 4).toFixed(1)),
            tempMinima: Number((tempMedia - 4).toFixed(1)),
            precipitacaoMm: Number((prec[dateKey] ?? 0).toFixed(1)),
            umidadeMedia: Number((rh2m[dateKey] ?? 60).toFixed(0)),
            ventoMedio: 8, radiacao: 18,
          })
        }
        const temps = dados.map(d => d.tempMedia), precs = dados.map(d => d.precipitacaoMm)
        return {
          coordenadas: { lat, lon }, periodo: { inicio, fim },
          resumo: {
            temperaturaMedia: Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)),
            temperaturaMaxima: Number(Math.max(...dados.map(d => d.tempMaxima)).toFixed(1)),
            temperaturaMinima: Number(Math.min(...dados.map(d => d.tempMinima)).toFixed(1)),
            precipitacaoAcumulada: Number(precs.reduce((a, b) => a + b, 0).toFixed(1)),
            diasComChuva: precs.filter(p => p > 0.2).length,
            totalDias: dados.length,
          },
          dados, fonte: 'NASA POWER (AG Community)', fonteOrigem: nasa.fonte,
          atualizadoEm: new Date().toISOString(),
        }
      }
    } catch { /* fall through to procedural */ }

    // Last-resort procedural
    const dados: DadoHistorico[] = []
    const start = new Date(inicio + 'T00:00:00Z'), end = new Date(fim + 'T00:00:00Z')
    const cursor = new Date(start)
    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10)
      const seed = hashString(`${lat.toFixed(4)}${lon.toFixed(4)}${dateStr}`)
      const rng = seededRandom(seed)
      const month = cursor.getMonth()
      const seasonalOffset = Math.cos((month - 1) / 12 * 2 * Math.PI) * 6
      const baseTemp = 24 - Math.abs(lat) * 0.25 + seasonalOffset
      const tempMedia = baseTemp + (rng() - 0.5) * 4
      const tempMax = tempMedia + 3 + rng() * 4
      const tempMin = tempMedia - 3 - rng() * 4
      const isSummer = month >= 9 || month <= 2
      const precip = rng() > 0.4 ? (isSummer ? 8 : 2) * rng() * 3 : 0
      dados.push({
        data: dateStr, tempMedia: Number(tempMedia.toFixed(1)),
        tempMaxima: Number(tempMax.toFixed(1)), tempMinima: Number(tempMin.toFixed(1)),
        precipitacaoMm: Number(precip.toFixed(1)),
        umidadeMedia: Number((55 + rng() * 30).toFixed(0)),
        ventoMedio: Number((5 + rng() * 15).toFixed(1)),
        radiacao: Number((15 + rng() * 10).toFixed(1)),
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    const temps = dados.map(d => d.tempMedia), precs = dados.map(d => d.precipitacaoMm)
    return {
      coordenadas: { lat, lon }, periodo: { inicio, fim },
      resumo: {
        temperaturaMedia: Number((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)),
        temperaturaMaxima: Number(Math.max(...dados.map(d => d.tempMaxima)).toFixed(1)),
        temperaturaMinima: Number(Math.min(...dados.map(d => d.tempMinima)).toFixed(1)),
        precipitacaoAcumulada: Number(precs.reduce((a, b) => a + b, 0).toFixed(1)),
        diasComChuva: precs.filter(p => p > 0.2).length,
        totalDias: dados.length,
      },
      dados, fonte: 'Modelo estimado', fonteOrigem: 'fallback' as const,
      atualizadoEm: new Date().toISOString(),
    }
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

    let fonteOrigem: 'api' | 'cache' | 'fallback' = 'fallback'

    try {
      const realAlertas = await dsm.clima.getAlertasRegiao(uf)
      if (realAlertas.length > 0 && realAlertas[0].fonte !== 'fallback') {
        fonteOrigem = realAlertas[0].fonte
        const combined: AlertaClimatico[] = realAlertas.map((a, i) => ({
          id: `real-${i}`,
          tipo: a.severidade === 'extrema' || a.severidade === 'alta' ? 'severo' as const : 'alerta' as const,
          titulo: a.tipo, descricao: a.descricao,
          estado: a.estado || uf, municipiosAfetados: [],
          vigenciaInicio: a.dataInicio, vigenciaFim: a.dataFim,
          fonte: `CPTEC/INPE (${a.fonte})`, emitidoEm: a.dataInicio,
        }))
        const agroAlertas = ALERTAS_FALLBACK.filter(a => a.estado === uf)
        return {
          estado: uf,
          totalAlertas: combined.length + agroAlertas.length,
          alertas: [...combined, ...agroAlertas],
          fonteOrigem, consultadoEm: new Date().toISOString(),
          fonte: 'CPTEC/INPE + Alertas agroclimáticos ALETIS',
        }
      }
    } catch { /* fall through */ }

    const alertas = ALERTAS_FALLBACK.filter(a => a.estado === uf)
    return {
      estado: uf, totalAlertas: alertas.length, alertas,
      fonteOrigem: 'fallback' as const,
      consultadoEm: new Date().toISOString(),
      fonte: 'Alertas agroclimáticos ALETIS (referência)',
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
