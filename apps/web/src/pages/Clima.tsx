import { SectionNav } from '../components/ui/SectionNav'
import PageHeader from '../components/ui/PageHeader'
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
import React, {
  lazy,
  Suspense,
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from 'react'
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

const HistoricoClimaChart = lazy(() => import('./clima/ClimaCharts'))

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface MunicipioDados {
  codigoIbge: string
  nome: string
  uf: string
  lat: number | null
  lon: number | null
  tempAtual: number | null
  condicao:
    | 'sol'
    | 'nublado'
    | 'parcialmente_nublado'
    | 'chuva'
    | 'chuva_leve'
    | 'tempestade'
    | 'neblina'
    | 'indisponivel'
  umidade: number | null
  precipitacao24h: number | null
  ventoKmh: number | null
  sensacaoTermica: number | null
  estado?: string
  referencia?: string
  fonte?: string
}

interface PrevisaoDia {
  data: string
  diaSemana: string
  tempMax: number | null
  tempMin: number | null
  condicao:
    | 'sol'
    | 'nublado'
    | 'parcialmente_nublado'
    | 'chuva'
    | 'chuva_leve'
    | 'tempestade'
    | 'neblina'
    | 'indisponivel'
  probChuva: number | null
  precipMm: number | null
  ventoKmh: number | null
}

interface DadoHistorico {
  data: string
  label: string
  tempMedia: number | null
  precipMm: number | null
}

interface Alerta {
  id: string
  tipo: 'severo' | 'alerta' | 'favoravel' | 'informativo'
  titulo: string
  descricao: string
  municipios: string[]
  vigencia: string
}


// ────────────────────────────────────────────────────────────
// API Response Types
// ────────────────────────────────────────────────────────────

interface ApiCondicaoAtual {
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
  fonteOrigem: 'api' | 'cache' | 'fallback'
  estado?: string
  referencia?: string
  fonte?: string
}

interface ApiPrevisaoDia {
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
  estado?: string
  referencia?: string
  fonte?: string
}

interface ApiMunicipioResponse {
  municipio: {
    codigoIbge: string
    nome: string
    uf: string
    lat: number | null
    lon: number | null
    altitude: number | null
    bioma: string
  }
  condicaoAtual: ApiCondicaoAtual | null
  previsao: ApiPrevisaoDia[]
  fontes: string[]
  fonteOrigem: 'api' | 'cache' | 'fallback'
  atualizadoEm: string | null
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
  estadoDados?: string
  fonte: string
}

interface ApiBuscarMunicipio {
  codigoIbge: string
  nome: string
  uf: string
  lat?: number | null
  lon?: number | null
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
  return map[icone] || 'indisponivel'
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
    estado: condicao.estado, referencia: condicao.atualizadoEm, fonte: condicao.fonte,
  }
}

function mapApiToPrevisaoDia(dia: ApiPrevisaoDia, idx: number): PrevisaoDia {
  const dt = new Date(dia.data + 'T12:00:00Z')
  const NOMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  return {
    data: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    diaSemana: NOMES[dt.getUTCDay()],
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
    d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
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
// Atalhos de localização; observações são carregadas pela API.
// ────────────────────────────────────────────────────────────

const FAVORITOS: MunicipioDados[] = [
  {
    codigoIbge: '4127700',
    nome: 'Toledo',
    uf: 'PR',
    lat: -24.7136,
    lon: -53.7433,
    tempAtual: null,
    condicao: 'indisponivel',
    umidade: null,
    precipitacao24h: null,
    ventoKmh: null,
    sensacaoTermica: null,
  },
  {
    codigoIbge: '5003702',
    nome: 'Dourados',
    uf: 'MS',
    lat: -22.2231,
    lon: -54.8118,
    tempAtual: null,
    condicao: 'indisponivel',
    umidade: null,
    precipitacao24h: null,
    ventoKmh: null,
    sensacaoTermica: null,
  },
  {
    codigoIbge: '5107875',
    nome: 'Sorriso',
    uf: 'MT',
    lat: -12.5426,
    lon: -55.7211,
    tempAtual: null,
    condicao: 'indisponivel',
    umidade: null,
    precipitacao24h: null,
    ventoKmh: null,
    sensacaoTermica: null,
  },
  {
    codigoIbge: '5218805',
    nome: 'Rio Verde',
    uf: 'GO',
    lat: -17.7927,
    lon: -50.9286,
    tempAtual: null,
    condicao: 'indisponivel',
    umidade: null,
    precipitacao24h: null,
    ventoKmh: null,
    sensacaoTermica: null,
  },
  {
    codigoIbge: '3170206',
    nome: 'Uberlândia',
    uf: 'MG',
    lat: -18.9186,
    lon: -48.2772,
    tempAtual: null,
    condicao: 'indisponivel',
    umidade: null,
    precipitacao24h: null,
    ventoKmh: null,
    sensacaoTermica: null,
  },
  {
    codigoIbge: '3543402',
    nome: 'Ribeirão Preto',
    uf: 'SP',
    lat: -21.1704,
    lon: -47.8103,
    tempAtual: null,
    condicao: 'indisponivel',
    umidade: null,
    precipitacao24h: null,
    ventoKmh: null,
    sensacaoTermica: null,
  },
  {
    codigoIbge: '4104808',
    nome: 'Cascavel',
    uf: 'PR',
    lat: -24.9573,
    lon: -53.4593,
    tempAtual: null,
    condicao: 'indisponivel',
    umidade: null,
    precipitacao24h: null,
    ventoKmh: null,
    sensacaoTermica: null,
  },
  {
    codigoIbge: '5107602',
    nome: 'Rondonópolis',
    uf: 'MT',
    lat: -16.47,
    lon: -54.6353,
    tempAtual: null,
    condicao: 'indisponivel',
    umidade: null,
    precipitacao24h: null,
    ventoKmh: null,
    sensacaoTermica: null,
  },
]


// ────────────────────────────────────────────────────────────
// Weather Icon Component
// ────────────────────────────────────────────────────────────

function WeatherIcon({
  condicao,
  size = 20,
}: {
  condicao: string
  size?: number
}) {
  const cls = `w-${size === 20 ? 5 : size === 24 ? 6 : size === 28 ? 7 : 8} h-${size === 20 ? 5 : size === 24 ? 6 : size === 28 ? 7 : 8}`
  switch (condicao) {
    case 'sol':
      return <Sun className={cls} style={{ color: '#E67E22' }} />
    case 'parcialmente_nublado':
      return <Cloud className={cls} style={{ color: '#6B7280' }} />
    case 'nublado':
      return <Cloud className={cls} style={{ color: '#9CA3AF' }} />
    case 'chuva_leve':
      return <CloudDrizzle className={cls} style={{ color: '#3B82F6' }} />
    case 'chuva':
      return <CloudRain className={cls} style={{ color: '#2563EB' }} />
    case 'tempestade':
      return <CloudLightning className={cls} style={{ color: '#7C3AED' }} />
    case 'neblina':
      return <Wind className={cls} style={{ color: '#9CA3AF' }} />
    default:
      return <Info className={cls} style={{ color: '#9CA3AF' }} />
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
    indisponivel: 'Dados indisponíveis',
  }
  return labels[c] || c
}

function ChartSkeleton() {
  return (
    <div className="h-full min-h-[320px] animate-pulse rounded-xl border border-aletis-verde/10 bg-muted" />
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
    const deduped = [
      mun,
      ...current.filter((m) => m.codigoIbge !== mun.codigoIbge),
    ].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(deduped))
    return deduped
  } catch {
    return [mun]
  }
}

export default function Clima() {
  const [climateView, setClimateView] = useState<'previsao' | 'historico'>('previsao')
  const [selectedMunicipio, setSelectedMunicipio] = useState<MunicipioDados>(
    FAVORITOS[0],
  )
  const [recentes, setRecentes] = useState<MunicipioDados[]>(() =>
    loadRecentes(),
  )

  // ── Search state ───────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ApiBuscarMunicipio[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)

  // ── API state ──────────────────────────────────────────────
  const [liveCondicoes, setLiveCondicoes] = useState<
    Record<string, MunicipioDados>
  >({})
  const [livePrevisao, setLivePrevisao] = useState<PrevisaoDia[] | null>(null)
  const [liveAlertas, setLiveAlertas] = useState<Alerta[] | null>(null)
  const [fonteOrigem, setFonteOrigem] = useState<'api' | 'cache' | 'fallback'>(
    'fallback',
  )
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [loadingClima, setLoadingClima] = useState(false)
  const climaRequest = useRef(0)
  const alertasRequest = useRef(0)
  const [historico, setHistorico] = useState<DadoHistorico[]>([])
  const [historicoResumo, setHistoricoResumo] = useState<Record<string, number | null> | null>(null)
  const [climaEstado, setClimaEstado] = useState('indisponivel')
  const [fontes, setFontes] = useState<string[]>([])
  const [alertasEstado, setAlertasEstado] = useState('indisponivel')
  const [loadingAlertas, setLoadingAlertas] = useState(false)

  // ── Autocomplete: debounced fetch ──────────────────────────
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setSearchLoading(false)
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
      lat: m.lat ?? null,
      lon: m.lon ?? null,
      tempAtual: null,
      condicao: 'indisponivel',
      umidade: null,
      precipitacao24h: null,
      ventoKmh: null,
      sensacaoTermica: null,
    }
    setSelectedMunicipio(mun)
    setRecentes(saveRecente(mun))
    setSearchQuery('')
    setSearchResults([])
    setSearchOpen(false)
  }, [])

  const fetchClimaData = useCallback(async (mun: MunicipioDados, signal: AbortSignal) => {
    const request = ++climaRequest.current
    setLoadingClima(true); setLivePrevisao([]); setHistorico([]); setHistoricoResumo(null)
    setClimaEstado('carregando'); setAtualizadoEm(null); setFontes([])
    const end = new Date(); end.setUTCDate(end.getUTCDate() - 1)
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29)
    const climatePromise = apiFetch<ApiMunicipioResponse & { estado?: string }>(`/clima/municipio/${mun.codigoIbge}`, { signal })
    const historyPromise = async () => {
      // A busca IBGE não contém coordenadas. Aguarda a resolução do município
      // antes de consultar seu histórico, sem substituir a localização.
      let { lat, lon } = mun
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        const resolved = await climatePromise
        lat = resolved.municipio.lat
        lon = resolved.municipio.lon
      }
      if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
      return apiFetch<{ dados?: { data: string; tempMedia: number | null; precipitacaoMm: number | null }[]; resumo?: Record<string, number | null>; fonteOrigem?: string }>(`/clima/historico?lat=${lat}&lon=${lon}&inicio=${start.toISOString().slice(0, 10)}&fim=${end.toISOString().slice(0, 10)}`, { signal })
    }
    const [climate, history] = await Promise.allSettled([climatePromise, historyPromise()])
    if (signal.aborted || request !== climaRequest.current) return
    const resp = climate.status === 'fulfilled' ? climate.value : null
    setLiveCondicoes(prev => {
      const next = { ...prev }
      if (resp?.condicaoAtual && resp.condicaoAtual.fonteOrigem !== 'fallback') next[mun.codigoIbge] = mapApiToMunicipioDados({ ...mun, lat: resp.municipio.lat, lon: resp.municipio.lon }, resp.condicaoAtual)
      else delete next[mun.codigoIbge]
      return next
    })
    setLivePrevisao(resp?.previsao?.map(mapApiToPrevisaoDia) || [])
    setFonteOrigem(resp?.fonteOrigem || 'fallback'); setAtualizadoEm(resp?.atualizadoEm || null)
    setClimaEstado(resp?.estado || 'indisponivel'); setFontes(resp?.fontes || [])
    if (history.status === 'fulfilled' && history.value && history.value.fonteOrigem !== 'fallback') {
      setHistorico((history.value.dados || []).map(d => ({ data: d.data, label: d.data, tempMedia: d.tempMedia, precipMm: d.precipitacaoMm })))
      setHistoricoResumo(history.value.resumo || null)
    }
    setLoadingClima(false)
  }, [])

  const fetchAlertas = useCallback(async (uf: string, signal: AbortSignal) => {
    const request = ++alertasRequest.current
    setLoadingAlertas(true); setLiveAlertas([]); setAlertasEstado('carregando')
    try {
      const resp = await apiFetch<ApiAlertasResponse>(`/clima/alertas/${uf}`, { signal })
      if (signal.aborted || request !== alertasRequest.current) return
      setLiveAlertas(resp.fonteOrigem === 'fallback' ? [] : resp.alertas.map(mapApiToAlerta))
      setAlertasEstado(resp.estadoDados || (resp.fonteOrigem === 'fallback' ? 'indisponivel' : 'disponivel'))
    } catch {
      if (signal.aborted || request !== alertasRequest.current) return
      setLiveAlertas([]); setAlertasEstado('indisponivel')
    } finally { if (!signal.aborted && request === alertasRequest.current) setLoadingAlertas(false) }
  }, [])

  // Trigger fetches when the selected municipality changes
  useEffect(() => {
    const controller = new AbortController()
    fetchClimaData(selectedMunicipio, controller.signal)
    fetchAlertas(selectedMunicipio.uf, controller.signal)
    return () => controller.abort()
  }, [selectedMunicipio, fetchClimaData, fetchAlertas])

  // ── Derived data (API data with fallback) ──────────────────
  const displayMunicipio =
    liveCondicoes[selectedMunicipio.codigoIbge] || { ...selectedMunicipio, tempAtual: null, umidade: null, precipitacao24h: null, ventoKmh: null, sensacaoTermica: null, condicao: 'indisponivel' as const }

  const isSelectedNaoFavorito = !FAVORITOS.some(
    (m) => m.codigoIbge === selectedMunicipio.codigoIbge,
  )
  const cardsExibidos: MunicipioDados[] = isSelectedNaoFavorito
    ? [displayMunicipio, ...FAVORITOS]
    : FAVORITOS

  const municipiosComLive = cardsExibidos.map(
    (mun) => liveCondicoes[mun.codigoIbge] || { ...mun, tempAtual: null, umidade: null, precipitacao24h: null, condicao: 'indisponivel' as const, estado: mun.codigoIbge === selectedMunicipio.codigoIbge ? 'indisponivel' : 'nao_consultado' },
  )

  const previsao = livePrevisao || []
  const alertas = liveAlertas || []

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <PageHeader title={<>Inteligência Climática</>} description={<> <p className="text-[var(--text-soft)] mt-1 font-body text-sm">
            Observações e previsões datadas para municípios do agronegócio
          </p> </>} actions={<> <div className="flex items-center gap-3">
          {loadingClima && (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          )}
          <DataSourceBadge
            fonteOrigem={fonteOrigem}
            fonte={fontes.join(', ') || 'indisponível'}
            atualizacao={atualizadoEm || undefined}
          />
        </div> </>} />

      <p className="text-xs text-[var(--text-soft)]">{({ disponivel: 'Dados disponíveis.', parcial: 'Dados parcialmente disponíveis.', carregando: 'Consultando fontes…', indisponivel: 'Dados indisponíveis nesta consulta.' } as Record<string, string>)[climaEstado]} Campos sem medição permanecem em branco.</p>

      {/* ── Section 1: Busca + Estacoes ─────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-foreground" />
          <h2 className="text-lg font-display font-semibold text-foreground">
            Estações Monitoradas
          </h2>
          <span className="badge bg-aletis-verde/10 text-foreground text-[11px]">
            {FAVORITOS.length} favoritos · 5570 BR
          </span>
        </div>

        {/* Search bar — any BR municipality */}
        <div className="relative mb-4 max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
              placeholder="Buscar qualquer município brasileiro..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm bg-card border border-aletis-borda focus:outline-none focus:ring-2 focus:ring-aletis-verde/30 focus:border-aletis-verde transition-all"
              aria-label="Buscar município"
            />
            {searchLoading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground animate-spin" />
            )}
            {!searchLoading && searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSearchResults([])
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-aletis-grafite-escuro"
                aria-label="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {searchOpen && searchQuery.trim().length >= 2 && (
            <div className="absolute z-20 left-0 right-0 mt-2 bg-card border border-aletis-borda rounded-xl shadow-lg max-h-72 overflow-y-auto custom-scrollbar">
              {searchResults.length === 0 && !searchLoading && (
                <div className="p-4 text-xs font-body text-muted-foreground text-center">
                  Nenhum município encontrado para "{searchQuery}".
                </div>
              )}
              {searchResults.map((r) => (
                <button
                  key={r.codigoIbge}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    handleSelectFromSearch(r)
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-aletis-bege border-b border-aletis-borda/50 last:border-b-0 flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-body font-medium text-foreground">
                      {r.nome}
                    </span>
                    <span className="text-xs font-body text-muted-foreground">
                      /{r.uf}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    IBGE {r.codigoIbge}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recentes */}
        {recentes.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
              Recentes:
            </span>
            {recentes.map((r) => (
              <button
                key={r.codigoIbge}
                onClick={() => setSelectedMunicipio(r)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  r.codigoIbge === selectedMunicipio.codigoIbge
                    ? 'bg-aletis-verde text-white border-aletis-verde'
                    : 'bg-card text-[var(--text-soft)] border-aletis-borda hover:border-aletis-verde/40 hover:text-aletis-verde'
                }`}
              >
                {r.nome}/{r.uf}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {municipiosComLive.map((mun) => {
            const baseMun =
              cardsExibidos.find((m) => m.codigoIbge === mun.codigoIbge) || mun
            const isSelected = mun.codigoIbge === selectedMunicipio.codigoIbge
            const isFavorito = FAVORITOS.some(
              (f) => f.codigoIbge === mun.codigoIbge,
            )
            return (
              <button
                key={mun.codigoIbge}
                onClick={() => setSelectedMunicipio(baseMun)}
                className={`text-left p-4 rounded-lg border transition-all duration-300   ${
                  isSelected
                    ? 'border-aletis-verde bg-aletis-verde/5 shadow-md ring-2 ring-aletis-verde/20'
                    : 'border-aletis-borda bg-card hover:border-aletis-verde/40'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-display font-semibold text-foreground">
                        {mun.nome}
                      </p>
                      {isFavorito ? (
                        <Star className="w-3 h-3 text-aletis-dourado fill-aletis-dourado" />
                      ) : (
                        <span className="badge bg-aletis-dourado/10 text-aletis-dourado-escuro text-[11px] px-1.5 py-0">
                          Selecionado
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-body text-muted-foreground">
                      {mun.uf}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <WeatherIcon condicao={mun.condicao} size={24} />
                  </div>
                </div>

                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-display font-semibold text-foreground">
                    {mun.tempAtual?.toFixed(0) ?? '—'}
                  </span>
                  <span className="text-sm text-muted-foreground">C</span>
                </div>

                <p className="text-xs font-body text-[var(--text-soft)] mb-3">
                  {mun.estado === 'nao_consultado' ? 'Selecione para consultar' : condicaoLabel(mun.condicao)}
                  {mun.referencia ? ` · ${new Date(mun.referencia).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${mun.estado === 'atrasado' ? ' · última observação conhecida' : ''}` : ''}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-xs font-body text-[var(--text-soft)]">
                      {mun.umidade == null ? '—' : `${mun.umidade}%`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CloudRain className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-body text-[var(--text-soft)]">
                      {mun.precipitacao24h == null ? '24h: —' : `${mun.precipitacao24h} mm/24h`}
                    </span>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-3 pt-2 border-t border-aletis-verde/20 flex items-center gap-1 text-xs text-foreground font-medium">
                    <Eye className="w-3.5 h-3.5" />
                    Detalhes abaixo
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </section>

      <SectionNav label="Análises do clima" active={climateView} onChange={setClimateView} items={[{id:'previsao',label:'Previsão de 7 dias',icon:Calendar},{id:'historico',label:'Histórico de 30 dias',icon:Thermometer}]} />
      {/* ── Section 2: Previsao 7 Dias ──────────────────────────── */}
      {climateView === 'previsao' && (
      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Calendar className="w-5 h-5 text-aletis-dourado" />
          <h2 className="text-lg font-display font-semibold text-foreground">
            Previsão 7 Dias
          </h2>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-body text-foreground font-semibold">
            {selectedMunicipio.nome}/{selectedMunicipio.uf}
          </span>
        </div>

        {!previsao.length && <p className="text-sm">Previsão indisponível para este município.</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {previsao.map((dia, idx) => (
            <div
              key={dia.data}
              className={`rounded-xl p-3 text-center border transition-all duration-200 ${
                idx === 0
                  ? 'bg-aletis-verde/5 border-aletis-verde/30'
                  : 'bg-card border-aletis-borda hover:border-aletis-dourado/40'
              }`}
            >
              <p className="text-xs font-semibold text-[var(--text-soft)] mb-1">
                {dia.diaSemana}
              </p>
              <p className="text-[11px] text-muted-foreground mb-2">
                {dia.data}
              </p>

              <div className="flex justify-center mb-2">
                <WeatherIcon condicao={dia.condicao} size={28} />
              </div>

              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="text-sm font-bold text-foreground">
                  {dia.tempMax?.toFixed(0) ?? '—'}
                </span>
                <span className="text-[11px] text-muted-foreground">/</span>
                <span className="text-sm text-muted-foreground">
                  {dia.tempMin?.toFixed(0) ?? '—'}
                </span>
                <span className="text-[11px] text-muted-foreground">C</span>
              </div>

              <div className="flex items-center justify-center gap-1">
                <Droplets className="w-3 h-3 text-blue-400" />
                <span className="text-[11px] text-blue-600 font-medium">
                  {dia.probChuva == null ? 'Probabilidade: —' : `${dia.probChuva}%`}
                </span>
              </div>

              {dia.precipMm != null && (
                <p className="text-[11px] text-blue-500 mt-0.5">
                  {dia.precipMm} mm
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      )}
      {/* ── Section 3: Dados Historicos (Chart) ─────────────────── */}
      {climateView === 'historico' && (
      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Thermometer className="w-5 h-5 text-aletis-dourado" />
          <h2 className="text-lg font-display font-semibold text-foreground">
            Dados Históricos — Últimos 30 Dias
          </h2>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-body text-foreground font-semibold">
            {selectedMunicipio.nome}/{selectedMunicipio.uf}
          </span>
        </div>

        <div className="h-[320px]">
          <Suspense fallback={<ChartSkeleton />}>
            {historico.length >= 2 ? <HistoricoClimaChart data={historico} /> : <p className="text-sm">Histórico indisponível ou insuficiente.</p>}
          </Suspense>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(() => {
            const avgTemp = historicoResumo?.temperaturaMedia
            const totalPrecip = historicoResumo?.precipitacaoAcumulada
            const diasChuva = historicoResumo?.diasComChuva
            const maxTemp = historicoResumo?.temperaturaMaxima

            return [
              {
                label: 'Temp. Média',
                valor: avgTemp == null ? '—' : `${avgTemp.toFixed(1)} C`,
                icon: Thermometer,
                color: '#cb9d52',
              },
              {
                label: 'Temp. Máxima',
                valor: maxTemp == null ? '—' : `${maxTemp.toFixed(1)} C`,
                icon: Sun,
                color: '#E67E22',
              },
              {
                label: 'Precip. Acum.',
                valor: totalPrecip == null ? '—' : `${totalPrecip.toFixed(1)} mm`,
                icon: CloudRain,
                color: '#3B82F6',
              },
              {
                label: 'Dias c/ Chuva',
                valor: diasChuva == null ? '—' : `${diasChuva} dias`,
                icon: Droplets,
                color: '#2563EB',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl bg-aletis-bege/60 p-3 flex items-center gap-3"
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: item.color + '15' }}
                >
                  <item.icon
                    className="w-4.5 h-4.5"
                    style={{ color: item.color }}
                  />
                </div>
                <div>
                  <p className="text-[11px] font-body text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="text-sm font-display font-semibold text-foreground">
                    {item.valor}
                  </p>
                </div>
              </div>
            ))
          })()}
        </div>
      </section>

      )}
      {/* ── Section 4: Alertas Agroclimaticos ───────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-ambar" />
          <h2 className="text-lg font-display font-semibold text-foreground">
            Alertas Agroclimáticos
          </h2>
          <span className="badge bg-ambar/10 text-ambar text-[11px]">
            {alertasEstado === 'disponivel' ? `${alertas.length} publicados` : alertasEstado}
          </span>
          {loadingAlertas && (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
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
                className={`rounded-lg border p-4 ${config.bg} ${config.border} transition-all hover:shadow-md`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl ${config.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}
                  >
                    <config.Icon className={`w-5 h-5 ${config.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`badge text-[11px] ${config.badge}`}>
                        {config.label}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-body">
                        Vigência: {alerta.vigencia}
                      </span>
                    </div>
                    <h3 className="text-sm font-display font-semibold text-foreground mb-1">
                      {alerta.titulo}
                    </h3>
                    <p className="text-xs font-body text-[var(--text-soft)] leading-relaxed">
                      {alerta.descricao}
                    </p>
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      {alerta.municipios.map((m, i) => (
                        <span
                          key={m}
                          className="text-[11px] font-body text-muted-foreground"
                        >
                          {m}
                          {i < alerta.municipios.length - 1 ? ',' : ''}
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

      <section className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <Wheat className="w-5 h-5 text-foreground" />
          <h2 className="text-lg font-display font-semibold text-foreground">Zoneamento agrícola</h2>
        </div>
        <p className="text-sm text-[var(--text-soft)]">
          Zoneamento indisponível para {selectedMunicipio.nome}/{selectedMunicipio.uf} nesta consulta.
          Períodos de plantio e risco dependem da safra, cultura, solo e cultivar publicados no ZARC.
        </p>
      </section>

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  )
}
