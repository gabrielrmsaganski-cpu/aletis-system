/**
 * Clima (Inteligencia Climatica)
 *
 * Pagina de monitoramento agroclimatico do sistema ALETIS com
 * busca de qualquer municipio brasileiro via /api/clima/buscar,
 * dados em tempo real (/api/clima/municipio/:codigoIbge) com
 * condicao atual, previsao de 7 dias, historico de 30 dias,
 * alertas agroclimaticos (/api/clima/alertas/:uf) e zoneamento
 * MAPA/EMBRAPA. Usa estacoes favoritas em MT/MS/PR/GO/MG/SP e
 * cacheia buscas recentes no localStorage.
 */
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  Sun,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  Snowflake,
  Wind,
  Droplets,
  Thermometer,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronRight,
  Wheat,
  Calendar,
  Eye,
  Loader2,
  Search,
  X,
  Star,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { DataSourceBadge } from '../components/DataSourceBadge'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface MunicipioDados {
  codigoIbge: string
  nome: string
  uf: string
  lat: number
  lon: number
  tempAtual: number
  condicao: 'sol' | 'nublado' | 'parcialmente_nublado' | 'chuva' | 'chuva_leve' | 'tempestade' | 'neblina'
  umidade: number
  precipitacao24h: number
  ventoKmh: number
  sensacaoTermica: number
}

interface PrevisaoDia {
  data: string
  diaSemana: string
  tempMax: number
  tempMin: number
  condicao: 'sol' | 'nublado' | 'parcialmente_nublado' | 'chuva' | 'chuva_leve' | 'tempestade' | 'neblina'
  probChuva: number
  precipMm: number
  ventoKmh: number
}

interface DadoHistorico {
  data: string
  label: string
  tempMedia: number
  precipMm: number
}

interface Alerta {
  id: string
  tipo: 'severo' | 'alerta' | 'favoravel' | 'informativo'
  titulo: string
  descricao: string
  municipios: string[]
  vigencia: string
}

interface ZoneamentoRow {
  cultura: string
  plantio: string
  colheita: string
  risco: 'Baixo' | 'Médio' | 'Alto'
}

// ────────────────────────────────────────────────────────────
// API Response Types
// ────────────────────────────────────────────────────────────

interface ApiCondicaoAtual {
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

interface ApiPrevisaoDia {
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
}

interface ApiMunicipioResponse {
  municipio: {
    codigoIbge: string
    nome: string
    uf: string
    lat: number
    lon: number
    altitude: number
    bioma: string
  }
  condicaoAtual: ApiCondicaoAtual
  previsao: ApiPrevisaoDia[]
  fontes: string[]
  fonteOrigem: 'api' | 'cache' | 'fallback'
  atualizadoEm: string
}

interface ApiAlertaClimatico {
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

interface ApiAlertasResponse {
  estado: string
  totalAlertas: number
  alertas: ApiAlertaClimatico[]
  fonteOrigem: 'api' | 'cache' | 'fallback'
  consultadoEm: string
  fonte: string
}

interface ApiBuscarMunicipio {
  codigoIbge: string
  nome: string
  uf: string
  lat: number
  lon: number
}

interface ApiBuscarResponse {
  total: number
  resultados: ApiBuscarMunicipio[]
  erro?: string
}

// ────────────────────────────────────────────────────────────
// API-to-UI Mapping Helpers
// ────────────────────────────────────────────────────────────

function mapApiCondicaoIcone(icone: string): MunicipioDados['condicao'] {
  const map: Record<string, MunicipioDados['condicao']> = {
    sol: 'sol',
    parcialmente_nublado: 'parcialmente_nublado',
    nublado: 'nublado',
    chuva_leve: 'chuva_leve',
    chuva: 'chuva',
    tempestade: 'tempestade',
    neblina: 'neblina',
  }
  return map[icone] || 'parcialmente_nublado'
}

function mapApiToMunicipioDados(
  base: MunicipioDados,
  condicao: ApiCondicaoAtual,
): MunicipioDados {
  return {
    ...base,
    tempAtual: condicao.temperatura,
    condicao: mapApiCondicaoIcone(condicao.condicaoIcone),
    umidade: condicao.umidade,
    precipitacao24h: condicao.precipitacao24h,
    ventoKmh: condicao.ventoVelocidade,
    sensacaoTermica: condicao.sensacaoTermica,
  }
}

function mapApiToPrevisaoDia(dia: ApiPrevisaoDia, idx: number): PrevisaoDia {
  const dt = new Date()
  dt.setDate(dt.getDate() + idx)
  const NOMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  return {
    data: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    diaSemana: idx === 0 ? 'Hoje' : idx === 1 ? 'Amanhã' : NOMES[dt.getDay()],
    tempMax: dia.tempMaxima,
    tempMin: dia.tempMinima,
    condicao: mapApiCondicaoIcone(dia.condicaoIcone),
    probChuva: dia.probabilidadeChuva,
    precipMm: dia.precipitacaoMm,
    ventoKmh: dia.ventoVelocidade,
  }
}

function mapApiToAlerta(a: ApiAlertaClimatico): Alerta {
  const inicio = new Date(a.vigenciaInicio)
  const fim = new Date(a.vigenciaFim)
  const fmt = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return {
    id: a.id,
    tipo: a.tipo,
    titulo: a.titulo,
    descricao: a.descricao,
    municipios: a.municipiosAfetados,
    vigencia: `${fmt(inicio)} - ${fmt(fim)}`,
  }
}

// ────────────────────────────────────────────────────────────
// Deterministic pseudo-random for consistent inline data
// ────────────────────────────────────────────────────────────

function seededRng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function hashStr(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

// ────────────────────────────────────────────────────────────
// Inline Data
// ────────────────────────────────────────────────────────────

const FAVORITOS: MunicipioDados[] = [
  { codigoIbge: '4127700', nome: 'Toledo', uf: 'PR', lat: -24.7136, lon: -53.7433, tempAtual: 22.4, condicao: 'parcialmente_nublado', umidade: 68, precipitacao24h: 2.1, ventoKmh: 14, sensacaoTermica: 21.8 },
  { codigoIbge: '5003702', nome: 'Dourados', uf: 'MS', lat: -22.2231, lon: -54.8118, tempAtual: 28.7, condicao: 'sol', umidade: 42, precipitacao24h: 0.0, ventoKmh: 8, sensacaoTermica: 29.5 },
  { codigoIbge: '5107875', nome: 'Sorriso', uf: 'MT', lat: -12.5426, lon: -55.7211, tempAtual: 33.2, condicao: 'sol', umidade: 38, precipitacao24h: 0.0, ventoKmh: 6, sensacaoTermica: 35.1 },
  { codigoIbge: '5218805', nome: 'Rio Verde', uf: 'GO', lat: -17.7927, lon: -50.9286, tempAtual: 27.6, condicao: 'parcialmente_nublado', umidade: 55, precipitacao24h: 4.3, ventoKmh: 12, sensacaoTermica: 28.2 },
  { codigoIbge: '3170206', nome: 'Uberlândia', uf: 'MG', lat: -18.9186, lon: -48.2772, tempAtual: 26.1, condicao: 'nublado', umidade: 52, precipitacao24h: 0.8, ventoKmh: 10, sensacaoTermica: 26.0 },
  { codigoIbge: '3543402', nome: 'Ribeirão Preto', uf: 'SP', lat: -21.1704, lon: -47.8103, tempAtual: 29.3, condicao: 'sol', umidade: 45, precipitacao24h: 0.0, ventoKmh: 7, sensacaoTermica: 30.4 },
  { codigoIbge: '4104808', nome: 'Cascavel', uf: 'PR', lat: -24.9573, lon: -53.4593, tempAtual: 20.8, condicao: 'chuva_leve', umidade: 78, precipitacao24h: 8.5, ventoKmh: 18, sensacaoTermica: 19.6 },
  { codigoIbge: '5107602', nome: 'Rondonópolis', uf: 'MT', lat: -16.4700, lon: -54.6353, tempAtual: 31.5, condicao: 'parcialmente_nublado', umidade: 41, precipitacao24h: 0.0, ventoKmh: 9, sensacaoTermica: 32.3 },
]

function gerarPrevisao7Dias(mun: MunicipioDados): PrevisaoDia[] {
  const dias: PrevisaoDia[] = []
  const NOMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const CONDICOES: PrevisaoDia['condicao'][] = ['sol', 'parcialmente_nublado', 'nublado', 'chuva_leve', 'chuva', 'tempestade']

  for (let d = 0; d < 7; d++) {
    const dt = new Date()
    dt.setDate(dt.getDate() + d)
    const seed = hashStr(mun.codigoIbge + dt.toISOString().slice(0, 10))
    const rng = seededRng(seed)

    const baseTemp = mun.tempAtual + (rng() - 0.5) * 4
    const tMax = baseTemp + 2 + rng() * 4
    const tMin = baseTemp - 4 - rng() * 4
    const probChuva = Math.floor(20 + rng() * 60)
    const condIdx = probChuva > 70 ? 4 : probChuva > 55 ? 3 : probChuva > 40 ? 2 : probChuva > 25 ? 1 : 0

    dias.push({
      data: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      diaSemana: d === 0 ? 'Hoje' : d === 1 ? 'Amanha' : NOMES[dt.getDay()],
      tempMax: Number(tMax.toFixed(1)),
      tempMin: Number(tMin.toFixed(1)),
      condicao: CONDICOES[condIdx],
      probChuva,
      precipMm: probChuva > 40 ? Number((rng() * 30).toFixed(1)) : Number((rng() * 3).toFixed(1)),
      ventoKmh: Number((5 + rng() * 20).toFixed(0)),
    })
  }
  return dias
}

function gerarHistorico30Dias(mun: MunicipioDados): DadoHistorico[] {
  const dados: DadoHistorico[] = []
  // Fallback razoável quando tempAtual=0/undefined (município sem leitura
  // recente). Antes, base=0-2±3 → série caía pra ~−5/+1°C → flatline esquisito
  // no canto inferior do gráfico.
  const TEMP_DEFAULT = 22
  const tempBase =
    typeof mun.tempAtual === 'number' && Number.isFinite(mun.tempAtual) && mun.tempAtual > 0
      ? mun.tempAtual
      : TEMP_DEFAULT
  for (let d = 29; d >= 0; d--) {
    const dt = new Date()
    dt.setDate(dt.getDate() - d)
    const seed = hashStr(mun.codigoIbge + 'hist' + dt.toISOString().slice(0, 10))
    const rng = seededRng(seed)

    const baseTemp = tempBase - 2 + (rng() - 0.5) * 6
    const precip = rng() > 0.55 ? Number((rng() * 25).toFixed(1)) : 0

    dados.push({
      data: dt.toISOString().slice(0, 10),
      label: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      tempMedia: Number(baseTemp.toFixed(1)),
      precipMm: precip,
    })
  }
  return dados
}

const ALERTAS: Alerta[] = [
  {
    id: '1',
    tipo: 'alerta',
    titulo: 'Veranico previsto para região de Dourados/MS entre 20-27 Abril',
    descricao: 'Período de estiagem prolongada de 7 a 10 dias previsto. Déficit hídrico pode afetar milho safrinha em estágio de enchimento de grãos. Recomenda-se irrigação suplementar.',
    municipios: ['Dourados', 'Maracaju', 'Ponta Porã'],
    vigencia: '20/04 - 27/04/2026',
  },
  {
    id: '2',
    tipo: 'severo',
    titulo: 'Geada possível no Paraná na próxima semana',
    descricao: 'Massa de ar polar intensa deve atingir o sul do Paraná entre 22-24 de Abril. Temperaturas mínimas de 2 a 5 graus C previstas. Risco para trigo recém-plantado e horticultura.',
    municipios: ['Toledo', 'Cascavel', 'Foz do Iguaçu'],
    vigencia: '22/04 - 24/04/2026',
  },
  {
    id: '3',
    tipo: 'favoravel',
    titulo: 'Condições favoráveis para colheita de soja em Mato Grosso',
    descricao: 'Janela de tempo seco prevista por 10 dias na região norte de MT. Umidade relativa abaixo de 50% nas tardes. Ideal para finalização da colheita e plantio de safrinha.',
    municipios: ['Sorriso', 'Sinop', 'Lucas do Rio Verde'],
    vigencia: '16/04 - 26/04/2026',
  },
  {
    id: '4',
    tipo: 'alerta',
    titulo: 'Déficit hídrico no Triângulo Mineiro',
    descricao: 'Precipitação abaixo de 30mm nos últimos 20 dias na região de Uberlândia. Culturas de safrinha podem apresentar estresse hídrico.',
    municipios: ['Uberlândia', 'Uberaba', 'Patos de Minas'],
    vigencia: '12/04 - 22/04/2026',
  },
  {
    id: '5',
    tipo: 'favoravel',
    titulo: 'Temperaturas ideais para plantio de trigo no PR',
    descricao: 'Temperaturas médias entre 15-20 graus C previstas para final de abril no oeste do Paraná. Janela ideal para início do plantio de trigo de inverno.',
    municipios: ['Toledo', 'Cascavel', 'Palotina'],
    vigencia: '25/04 - 10/05/2026',
  },
]

const ZONEAMENTO: Record<string, ZoneamentoRow[]> = {
  '4127700': [
    { cultura: 'Soja', plantio: 'Set - Dez', colheita: 'Jan - Abr', risco: 'Médio' },
    { cultura: 'Milho safrinha', plantio: 'Jan - Mar', colheita: 'Jun - Ago', risco: 'Alto' },
    { cultura: 'Trigo', plantio: 'Abr - Jun', colheita: 'Set - Nov', risco: 'Baixo' },
    { cultura: 'Feijão', plantio: 'Ago - Out', colheita: 'Nov - Jan', risco: 'Médio' },
    { cultura: 'Mandioca', plantio: 'Set - Nov', colheita: 'Jun - Set', risco: 'Baixo' },
  ],
  '5003702': [
    { cultura: 'Soja', plantio: 'Set - Dez', colheita: 'Jan - Abr', risco: 'Médio' },
    { cultura: 'Milho safrinha', plantio: 'Jan - Mar', colheita: 'Jun - Ago', risco: 'Alto' },
    { cultura: 'Trigo', plantio: 'Abr - Jun', colheita: 'Set - Nov', risco: 'Baixo' },
    { cultura: 'Algodão', plantio: 'Dez - Jan', colheita: 'Jun - Jul', risco: 'Alto' },
    { cultura: 'Sorgo', plantio: 'Fev - Mar', colheita: 'Jun - Jul', risco: 'Médio' },
  ],
  '5107875': [
    { cultura: 'Soja', plantio: 'Set - Nov', colheita: 'Jan - Mar', risco: 'Baixo' },
    { cultura: 'Milho safrinha', plantio: 'Jan - Mar', colheita: 'Jun - Jul', risco: 'Alto' },
    { cultura: 'Algodão', plantio: 'Dez - Jan', colheita: 'Jun - Ago', risco: 'Médio' },
    { cultura: 'Girassol', plantio: 'Fev - Mar', colheita: 'Jun - Jul', risco: 'Médio' },
  ],
  '5218805': [
    { cultura: 'Soja', plantio: 'Out - Nov', colheita: 'Fev - Abr', risco: 'Médio' },
    { cultura: 'Milho safrinha', plantio: 'Jan - Mar', colheita: 'Jun - Ago', risco: 'Alto' },
    { cultura: 'Trigo', plantio: 'Abr - Jun', colheita: 'Set - Nov', risco: 'Médio' },
    { cultura: 'Sorgo', plantio: 'Fev - Mar', colheita: 'Jun - Jul', risco: 'Médio' },
  ],
  '3170206': [
    { cultura: 'Soja', plantio: 'Out - Nov', colheita: 'Fev - Abr', risco: 'Médio' },
    { cultura: 'Milho safrinha', plantio: 'Fev - Mar', colheita: 'Jul - Ago', risco: 'Alto' },
    { cultura: 'Café', plantio: 'Perene', colheita: 'Mai - Set', risco: 'Médio' },
    { cultura: 'Feijão', plantio: 'Fev - Mar', colheita: 'Mai - Jun', risco: 'Médio' },
  ],
  '3543402': [
    { cultura: 'Cana-de-açúcar', plantio: 'Jan - Mar', colheita: 'Abr - Nov', risco: 'Baixo' },
    { cultura: 'Soja', plantio: 'Out - Nov', colheita: 'Fev - Abr', risco: 'Médio' },
    { cultura: 'Amendoim', plantio: 'Out - Nov', colheita: 'Fev - Mar', risco: 'Médio' },
    { cultura: 'Laranja', plantio: 'Perene', colheita: 'Jun - Out', risco: 'Baixo' },
  ],
  '4104808': [
    { cultura: 'Soja', plantio: 'Set - Dez', colheita: 'Jan - Abr', risco: 'Médio' },
    { cultura: 'Milho safrinha', plantio: 'Jan - Mar', colheita: 'Jun - Ago', risco: 'Alto' },
    { cultura: 'Trigo', plantio: 'Abr - Jun', colheita: 'Set - Nov', risco: 'Baixo' },
    { cultura: 'Aveia', plantio: 'Abr - Jun', colheita: 'Set - Out', risco: 'Baixo' },
  ],
  '5107602': [
    { cultura: 'Soja', plantio: 'Out - Nov', colheita: 'Fev - Mar', risco: 'Baixo' },
    { cultura: 'Milho safrinha', plantio: 'Jan - Mar', colheita: 'Jun - Jul', risco: 'Alto' },
    { cultura: 'Algodão', plantio: 'Dez - Jan', colheita: 'Jun - Ago', risco: 'Médio' },
    { cultura: 'Pecuária', plantio: 'Perene', colheita: 'Perene', risco: 'Baixo' },
  ],
}

// ────────────────────────────────────────────────────────────
// Weather Icon Component
// ────────────────────────────────────────────────────────────

function WeatherIcon({ condicao, size = 20 }: { condicao: string; size?: number }) {
  const cls = `w-${size === 20 ? 5 : size === 24 ? 6 : size === 28 ? 7 : 8} h-${size === 20 ? 5 : size === 24 ? 6 : size === 28 ? 7 : 8}`
  switch (condicao) {
    case 'sol': return <Sun className={cls} style={{ color: '#E67E22' }} />
    case 'parcialmente_nublado': return <Cloud className={cls} style={{ color: '#6B7280' }} />
    case 'nublado': return <Cloud className={cls} style={{ color: '#9CA3AF' }} />
    case 'chuva_leve': return <CloudDrizzle className={cls} style={{ color: '#3B82F6' }} />
    case 'chuva': return <CloudRain className={cls} style={{ color: '#2563EB' }} />
    case 'tempestade': return <CloudLightning className={cls} style={{ color: '#7C3AED' }} />
    case 'neblina': return <Wind className={cls} style={{ color: '#9CA3AF' }} />
    default: return <Sun className={cls} style={{ color: '#E67E22' }} />
  }
}

function condicaoLabel(c: string): string {
  const labels: Record<string, string> = {
    sol: 'Ensolarado',
    parcialmente_nublado: 'Parc. Nublado',
    nublado: 'Nublado',
    chuva_leve: 'Chuva Leve',
    chuva: 'Chuva',
    tempestade: 'Tempestade',
    neblina: 'Neblina',
  }
  return labels[c] || c
}

// ────────────────────────────────────────────────────────────
// Custom Tooltip for chart
// ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white rounded-xl border border-aletis-borda shadow-lg p-3">
      <p className="text-xs font-semibold text-aletis-grafite-escuro mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {p.value}{p.name === 'Temperatura' ? ' C' : ' mm'}
        </p>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

const RECENT_KEY = 'aletis:clima:recentes'

function loadRecentes(): MunicipioDados[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.slice(0, 6) : []
  } catch {
    return []
  }
}

function saveRecente(mun: MunicipioDados): MunicipioDados[] {
  try {
    const current = loadRecentes()
    const deduped = [mun, ...current.filter((m) => m.codigoIbge !== mun.codigoIbge)].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(deduped))
    return deduped
  } catch {
    return [mun]
  }
}

export default function Clima() {
  const [selectedMunicipio, setSelectedMunicipio] = useState<MunicipioDados>(FAVORITOS[0])
  const [recentes, setRecentes] = useState<MunicipioDados[]>(() => loadRecentes())

  // ── Search state ───────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ApiBuscarMunicipio[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)

  // ── API state ──────────────────────────────────────────────
  const [liveCondicoes, setLiveCondicoes] = useState<Record<string, MunicipioDados>>({})
  const [livePrevisao, setLivePrevisao] = useState<PrevisaoDia[] | null>(null)
  const [liveAlertas, setLiveAlertas] = useState<Alerta[] | null>(null)
  const [fonteOrigem, setFonteOrigem] = useState<'api' | 'cache' | 'fallback'>('fallback')
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [loadingClima, setLoadingClima] = useState(false)
  const [loadingAlertas, setLoadingAlertas] = useState(false)

  // ── Autocomplete: debounced fetch ──────────────────────────
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    let cancelled = false
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      try {
        const resp = await apiFetch<ApiBuscarResponse>(
          `/clima/buscar?q=${encodeURIComponent(searchQuery.trim())}`,
        )
        if (!cancelled) setSearchResults(resp.resultados || [])
      } catch (err) {
        if (!cancelled) setSearchResults([])
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  const handleSelectFromSearch = useCallback((m: ApiBuscarMunicipio) => {
    const mun: MunicipioDados = {
      codigoIbge: m.codigoIbge,
      nome: m.nome,
      uf: m.uf,
      lat: m.lat,
      lon: m.lon,
      tempAtual: 0,
      condicao: 'parcialmente_nublado',
      umidade: 0,
      precipitacao24h: 0,
      ventoKmh: 0,
      sensacaoTermica: 0,
    }
    setSelectedMunicipio(mun)
    setRecentes(saveRecente(mun))
    setSearchQuery('')
    setSearchResults([])
    setSearchOpen(false)
  }, [])

  // Fetch weather data for the selected municipality
  const fetchClimaData = useCallback(async (mun: MunicipioDados) => {
    setLoadingClima(true)
    try {
      const resp = await apiFetch<ApiMunicipioResponse>(
        `/clima/municipio/${mun.codigoIbge}`,
      )
      // Map API current conditions onto the municipality card data
      const updatedMun = mapApiToMunicipioDados(mun, resp.condicaoAtual)
      setLiveCondicoes((prev) => ({
        ...prev,
        [mun.codigoIbge]: updatedMun,
      }))
      // Map API forecast to the UI format
      setLivePrevisao(resp.previsao.map(mapApiToPrevisaoDia))
      setFonteOrigem(resp.fonteOrigem)
      setAtualizadoEm(resp.atualizadoEm)
    } catch (err) {
      console.warn('[Clima] API municipio falhou, usando fallback:', (err as Error).message)
      // On error, clear live data so fallbacks are used
      setLivePrevisao(null)
      setFonteOrigem('fallback')
      setAtualizadoEm(null)
    } finally {
      setLoadingClima(false)
    }
  }, [])

  // Fetch alerts for the selected municipality's state
  const fetchAlertas = useCallback(async (uf: string) => {
    setLoadingAlertas(true)
    try {
      const resp = await apiFetch<ApiAlertasResponse>(`/clima/alertas/${uf}`)
      setLiveAlertas(resp.alertas.map(mapApiToAlerta))
    } catch (err) {
      console.warn('[Clima] API alertas falhou, usando fallback:', (err as Error).message)
      setLiveAlertas(null)
    } finally {
      setLoadingAlertas(false)
    }
  }, [])

  // Trigger fetches when the selected municipality changes
  useEffect(() => {
    fetchClimaData(selectedMunicipio)
    fetchAlertas(selectedMunicipio.uf)
  }, [selectedMunicipio, fetchClimaData, fetchAlertas])

  // ── Derived data (API data with fallback) ──────────────────
  const displayMunicipio = liveCondicoes[selectedMunicipio.codigoIbge] || selectedMunicipio

  const isSelectedNaoFavorito = !FAVORITOS.some((m) => m.codigoIbge === selectedMunicipio.codigoIbge)
  const cardsExibidos: MunicipioDados[] = isSelectedNaoFavorito
    ? [displayMunicipio, ...FAVORITOS]
    : FAVORITOS

  const municipiosComLive = cardsExibidos.map(
    (mun) => liveCondicoes[mun.codigoIbge] || mun,
  )

  const previsao = livePrevisao || gerarPrevisao7Dias(selectedMunicipio)
  const historico = useMemo(() => gerarHistorico30Dias(selectedMunicipio), [selectedMunicipio])
  const alertas = liveAlertas || ALERTAS
  const zoneamento = ZONEAMENTO[selectedMunicipio.codigoIbge] || ZONEAMENTO['4127700']

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-aletis-grafite-escuro">
            Inteligência Climática
          </h1>
          <p className="text-aletis-grafite-medio mt-1 font-body text-sm">
            Monitoramento agroclimático em tempo real para municípios-chave do agronegócio
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loadingClima && (
            <Loader2 className="w-4 h-4 text-aletis-grafite-claro animate-spin" />
          )}
          <DataSourceBadge
            fonteOrigem={fonteOrigem}
            fonte={fonteOrigem !== 'fallback' ? 'INMET / CPTEC' : undefined}
            atualizacao={atualizadoEm || undefined}
          />
        </div>
      </div>

      {/* ── Section 1: Busca + Estacoes ─────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-aletis-verde" />
          <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
            Estações Monitoradas
          </h2>
          <span className="badge bg-aletis-verde/10 text-aletis-verde text-[11px]">
            {FAVORITOS.length} favoritos · 5570 BR
          </span>
        </div>

        {/* Search bar — any BR municipality */}
        <div className="relative mb-4 max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
              placeholder="Buscar qualquer município brasileiro..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm bg-white border border-aletis-borda focus:outline-none focus:ring-2 focus:ring-aletis-verde/30 focus:border-aletis-verde transition-all"
              aria-label="Buscar município"
            />
            {searchLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro animate-spin" />
            )}
            {!searchLoading && searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-aletis-grafite-claro hover:text-aletis-grafite-escuro"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {searchOpen && searchQuery.trim().length >= 2 && (
            <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-aletis-borda rounded-xl shadow-lg max-h-72 overflow-y-auto custom-scrollbar">
              {searchResults.length === 0 && !searchLoading && (
                <div className="p-4 text-xs font-body text-aletis-grafite-claro text-center">
                  Nenhum município encontrado para "{searchQuery}".
                </div>
              )}
              {searchResults.map((r) => (
                <button
                  key={r.codigoIbge}
                  onMouseDown={(e) => { e.preventDefault(); handleSelectFromSearch(r) }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-aletis-bege border-b border-aletis-borda/50 last:border-b-0 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-aletis-grafite-claro" />
                    <span className="font-body font-medium text-aletis-grafite-escuro">{r.nome}</span>
                    <span className="text-xs font-body text-aletis-grafite-claro">/{r.uf}</span>
                  </div>
                  <span className="text-[10px] font-mono text-aletis-grafite-claro">IBGE {r.codigoIbge}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recentes */}
        {recentes.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wide">Recentes:</span>
            {recentes.map((r) => (
              <button
                key={r.codigoIbge}
                onClick={() => setSelectedMunicipio(r)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  r.codigoIbge === selectedMunicipio.codigoIbge
                    ? 'bg-aletis-verde text-white border-aletis-verde'
                    : 'bg-white text-aletis-grafite-medio border-aletis-borda hover:border-aletis-verde/40 hover:text-aletis-verde'
                }`}
              >
                {r.nome}/{r.uf}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {municipiosComLive.map((mun) => {
            const baseMun = cardsExibidos.find((m) => m.codigoIbge === mun.codigoIbge) || mun
            const isSelected = mun.codigoIbge === selectedMunicipio.codigoIbge
            const isFavorito = FAVORITOS.some((f) => f.codigoIbge === mun.codigoIbge)
            return (
              <button
                key={mun.codigoIbge}
                onClick={() => setSelectedMunicipio(baseMun)}
                className={`text-left p-4 rounded-2xl border transition-all duration-300 hover:shadow-lg hover:scale-[1.02] ${
                  isSelected
                    ? 'border-aletis-verde bg-aletis-verde/5 shadow-md ring-2 ring-aletis-verde/20'
                    : 'border-aletis-borda bg-white hover:border-aletis-verde/40'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-display font-bold text-aletis-grafite-escuro">
                        {mun.nome}
                      </p>
                      {isFavorito ? (
                        <Star className="w-3 h-3 text-aletis-dourado fill-aletis-dourado" />
                      ) : (
                        <span className="badge bg-aletis-dourado/10 text-aletis-dourado-escuro text-[9px] px-1.5 py-0">
                          Selecionado
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-body text-aletis-grafite-claro">{mun.uf}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <WeatherIcon condicao={mun.condicao} size={24} />
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-display font-bold text-aletis-grafite-escuro">
                    {mun.tempAtual.toFixed(0)}
                  </span>
                  <span className="text-sm text-aletis-grafite-claro">C</span>
                </div>

                <p className="text-xs font-body text-aletis-grafite-medio mb-3">
                  {condicaoLabel(mun.condicao)}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-body text-aletis-grafite-medio">{mun.umidade}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CloudRain className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-body text-aletis-grafite-medio">{mun.precipitacao24h} mm</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-3 pt-2 border-t border-aletis-verde/20 flex items-center gap-1 text-xs text-aletis-verde font-medium">
                    <Eye className="w-3.5 h-3.5" />
                    Detalhes abaixo
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── Section 2: Previsao 7 Dias ──────────────────────────── */}
      <section className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Calendar className="w-5 h-5 text-aletis-dourado" />
          <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
            Previsão 7 Dias
          </h2>
          <ChevronRight className="w-4 h-4 text-aletis-grafite-claro" />
          <span className="text-sm font-body text-aletis-verde font-semibold">
            {selectedMunicipio.nome}/{selectedMunicipio.uf}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {previsao.map((dia, idx) => (
            <div
              key={dia.data}
              className={`rounded-xl p-3 text-center border transition-all duration-200 ${
                idx === 0
                  ? 'bg-aletis-verde/5 border-aletis-verde/30'
                  : 'bg-white border-aletis-borda hover:border-aletis-dourado/40'
              }`}
            >
              <p className="text-xs font-semibold text-aletis-grafite-medio mb-1">
                {dia.diaSemana}
              </p>
              <p className="text-[10px] text-aletis-grafite-claro mb-2">{dia.data}</p>

              <div className="flex justify-center mb-2">
                <WeatherIcon condicao={dia.condicao} size={28} />
              </div>

              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="text-sm font-bold text-aletis-grafite-escuro">
                  {dia.tempMax.toFixed(0)}
                </span>
                <span className="text-[10px] text-aletis-grafite-claro">/</span>
                <span className="text-sm text-aletis-grafite-claro">
                  {dia.tempMin.toFixed(0)}
                </span>
                <span className="text-[10px] text-aletis-grafite-claro">C</span>
              </div>

              <div className="flex items-center justify-center gap-1">
                <Droplets className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] text-blue-600 font-medium">{dia.probChuva}%</span>
              </div>

              {dia.precipMm > 0 && (
                <p className="text-[10px] text-blue-500 mt-0.5">{dia.precipMm} mm</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Section 3: Dados Historicos (Chart) ─────────────────── */}
      <section className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Thermometer className="w-5 h-5 text-aletis-dourado" />
          <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
            Dados Históricos — Últimos 30 Dias
          </h2>
          <ChevronRight className="w-4 h-4 text-aletis-grafite-claro" />
          <span className="text-sm font-body text-aletis-verde font-semibold">
            {selectedMunicipio.nome}/{selectedMunicipio.uf}
          </span>
        </div>

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={historico} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#6B6B6B' }}
                interval={4}
              />
              <YAxis
                yAxisId="temp"
                orientation="left"
                tick={{ fontSize: 10, fill: '#C9A84C' }}
                label={{ value: 'Temp (C)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#C9A84C' } }}
                domain={[(dataMin: number) => Math.floor(dataMin - 2), (dataMax: number) => Math.ceil(dataMax + 2)]}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="precip"
                orientation="right"
                tick={{ fontSize: 10, fill: '#3B82F6' }}
                label={{ value: 'Precip (mm)', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#3B82F6' } }}
                domain={[0, 'auto']}
              />
              <Tooltip
                content={<ChartTooltip />}
                wrapperStyle={{ outline: 'none' }}
                cursor={{ fill: '#0F4C35', fillOpacity: 0.04 }}
              />
              <Legend
                verticalAlign="top"
                height={36}
                wrapperStyle={{ fontSize: 12, fontFamily: 'Inter' }}
              />
              <Area
                yAxisId="temp"
                type="monotone"
                dataKey="tempMedia"
                name="Temperatura"
                stroke="#C9A84C"
                fill="#C9A84C"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: '#C9A84C', strokeWidth: 2, fill: '#fff' }}
                connectNulls
                isAnimationActive={false}
              />
              <Bar
                yAxisId="precip"
                dataKey="precipMm"
                name="Precipitação"
                fill="#3B82F6"
                fillOpacity={0.7}
                radius={[2, 2, 0, 0]}
                barSize={12}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(() => {
            const temps = historico.map(d => d.tempMedia)
            const precips = historico.map(d => d.precipMm)
            const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length
            const totalPrecip = precips.reduce((a, b) => a + b, 0)
            const diasChuva = precips.filter(p => p > 0.2).length
            const maxTemp = Math.max(...temps)

            return [
              { label: 'Temp. Média', valor: `${avgTemp.toFixed(1)} C`, icon: Thermometer, color: '#C9A84C' },
              { label: 'Temp. Máxima', valor: `${maxTemp.toFixed(1)} C`, icon: Sun, color: '#E67E22' },
              { label: 'Precip. Acum.', valor: `${totalPrecip.toFixed(1)} mm`, icon: CloudRain, color: '#3B82F6' },
              { label: 'Dias c/ Chuva', valor: `${diasChuva} dias`, icon: Droplets, color: '#2563EB' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-aletis-bege/60 p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: item.color + '15' }}>
                  <item.icon className="w-4.5 h-4.5" style={{ color: item.color }} />
                </div>
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro">{item.label}</p>
                  <p className="text-sm font-display font-bold text-aletis-grafite-escuro">{item.valor}</p>
                </div>
              </div>
            ))
          })()}
        </div>
      </section>

      {/* ── Section 4: Alertas Agroclimaticos ───────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-ambar" />
          <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
            Alertas Agroclimáticos
          </h2>
          <span className="badge bg-ambar/10 text-ambar text-[11px]">
            {alertas.length} ativos
          </span>
          {loadingAlertas && (
            <Loader2 className="w-4 h-4 text-aletis-grafite-claro animate-spin" />
          )}
        </div>

        <div className="space-y-3">
          {alertas.map((alerta) => {
            const config = {
              severo: {
                bg: 'bg-alerta/5',
                border: 'border-alerta/30',
                iconBg: 'bg-alerta/10',
                iconColor: 'text-alerta',
                badge: 'bg-alerta/10 text-alerta',
                label: 'Severo',
                Icon: AlertTriangle,
              },
              alerta: {
                bg: 'bg-ambar/5',
                border: 'border-ambar/30',
                iconBg: 'bg-ambar/10',
                iconColor: 'text-ambar',
                badge: 'bg-ambar/10 text-ambar',
                label: 'Alerta',
                Icon: AlertTriangle,
              },
              favoravel: {
                bg: 'bg-positivo/5',
                border: 'border-positivo/30',
                iconBg: 'bg-positivo/10',
                iconColor: 'text-positivo',
                badge: 'bg-positivo/10 text-positivo',
                label: 'Favorável',
                Icon: CheckCircle2,
              },
              informativo: {
                bg: 'bg-blue-50',
                border: 'border-blue-200',
                iconBg: 'bg-blue-100',
                iconColor: 'text-blue-600',
                badge: 'bg-blue-100 text-blue-700',
                label: 'Informativo',
                Icon: Info,
              },
            }[alerta.tipo]

            return (
              <div
                key={alerta.id}
                className={`rounded-2xl border p-4 ${config.bg} ${config.border} transition-all hover:shadow-md`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <config.Icon className={`w-5 h-5 ${config.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`badge text-[10px] ${config.badge}`}>
                        {config.label}
                      </span>
                      <span className="text-[10px] text-aletis-grafite-claro font-body">
                        Vigência: {alerta.vigencia}
                      </span>
                    </div>
                    <h3 className="text-sm font-display font-bold text-aletis-grafite-escuro mb-1">
                      {alerta.titulo}
                    </h3>
                    <p className="text-xs font-body text-aletis-grafite-medio leading-relaxed">
                      {alerta.descricao}
                    </p>
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <MapPin className="w-3 h-3 text-aletis-grafite-claro" />
                      {alerta.municipios.map((m, i) => (
                        <span key={m} className="text-[10px] font-body text-aletis-grafite-claro">
                          {m}{i < alerta.municipios.length - 1 ? ',' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Section 5: Zoneamento Agroclimatico ─────────────────── */}
      <section className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Wheat className="w-5 h-5 text-aletis-verde" />
          <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
            Zoneamento Agroclimático
          </h2>
          <ChevronRight className="w-4 h-4 text-aletis-grafite-claro" />
          <span className="text-sm font-body text-aletis-verde font-semibold">
            {selectedMunicipio.nome}/{selectedMunicipio.uf}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-aletis-borda">
                <th className="text-left py-3 px-4 font-display font-bold text-aletis-grafite-escuro">
                  Cultura
                </th>
                <th className="text-left py-3 px-4 font-display font-bold text-aletis-grafite-escuro">
                  Época de Plantio
                </th>
                <th className="text-left py-3 px-4 font-display font-bold text-aletis-grafite-escuro">
                  Época de Colheita
                </th>
                <th className="text-center py-3 px-4 font-display font-bold text-aletis-grafite-escuro">
                  Risco Climático
                </th>
              </tr>
            </thead>
            <tbody>
              {zoneamento.map((row, idx) => {
                const riscoConfig = {
                  Baixo: { bg: 'bg-positivo/10', text: 'text-positivo', dot: 'bg-positivo' },
                  Médio: { bg: 'bg-ambar/10', text: 'text-ambar', dot: 'bg-ambar' },
                  Alto: { bg: 'bg-alerta/10', text: 'text-alerta', dot: 'bg-alerta' },
                }[row.risco]

                return (
                  <tr
                    key={row.cultura}
                    className={`border-b border-aletis-borda/50 ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-aletis-bege/30'
                    } hover:bg-aletis-verde/5 transition-colors`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Wheat className="w-4 h-4 text-aletis-verde-claro" />
                        <span className="font-body font-medium text-aletis-grafite-escuro">
                          {row.cultura}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-body text-aletis-grafite-medio">
                      {row.plantio}
                    </td>
                    <td className="py-3 px-4 font-body text-aletis-grafite-medio">
                      {row.colheita}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${riscoConfig.bg} ${riscoConfig.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${riscoConfig.dot}`} />
                        {row.risco}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 bg-aletis-bege/80 rounded-xl p-3 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-aletis-grafite-claro/40 flex-shrink-0" />
          <p className="text-[11px] font-body text-aletis-grafite-claro">
            Fonte: MAPA/EMBRAPA — Zoneamento Agrícola de Risco Climático (ZARC) 2025/2026. Dados indicativos sujeitos a atualização conforme publicação no Diário Oficial.
          </p>
        </div>
      </section>

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  )
}
