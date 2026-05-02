/**
 * Prospecção — visão Mapa.
 *
 * Mostra os leads em um mapa do Brasil com markers coloridos por score.
 * Quando o lead não tem lat/lng explícitas (a fonte PGFN só carrega UF),
 * usa o centróide aproximado da UF (fallback útil para distribuição visual).
 *
 * Quando o backend já tiver lat/lng (via GeoEnrichment), eles entram com
 * um pequeno jitter para evitar overlap exato.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl, ScaleControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ArrowLeft, Filter, MapPin, RefreshCw } from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

// Centróides aproximados das UFs (lat, lng) — IBGE.
const UF_CENTROIDS: Record<string, [number, number]> = {
  AC: [-9.0238, -70.812],
  AL: [-9.5713, -36.782],
  AP: [1.4148, -51.9],
  AM: [-3.4168, -65.8561],
  BA: [-12.5797, -41.7007],
  CE: [-5.4984, -39.3206],
  DF: [-15.7998, -47.8645],
  ES: [-19.1834, -40.3089],
  GO: [-15.827, -49.8362],
  MA: [-4.9609, -45.2744],
  MT: [-12.6819, -56.9211],
  MS: [-20.7722, -54.7852],
  MG: [-18.5122, -44.555],
  PA: [-3.4168, -52.0],
  PB: [-7.24, -36.782],
  PR: [-25.2521, -52.0215],
  PE: [-8.8137, -36.9541],
  PI: [-7.7183, -42.7289],
  RJ: [-22.9099, -43.2095],
  RN: [-5.7945, -36.3541],
  RS: [-30.0346, -51.2177],
  RO: [-11.5057, -63.5806],
  RR: [2.7376, -62.0751],
  SC: [-27.2423, -50.2189],
  SP: [-23.5505, -46.6333],
  SE: [-10.5741, -37.3857],
  TO: [-10.1753, -48.2982],
}

interface Lead {
  id?: string
  cpfCnpj?: string
  nome?: string
  uf?: string
  municipio?: string
  divida?: number
  hectares?: number
  scoreFinal?: number
  classificacao?: string
  tipoPessoa?: 'PF' | 'PJ'
  lat?: number
  lng?: number
}

const COLOR_BY_CLASS: Record<string, { fill: string; stroke: string }> = {
  quente: { fill: '#a83232', stroke: '#7a2424' },
  morno: { fill: '#cb9d52', stroke: '#a87f3d' },
  frio: { fill: '#465b4a', stroke: '#17251b' },
  default: { fill: '#465b4a', stroke: '#17251b' },
}

function colorFor(lead: Lead): { fill: string; stroke: string } {
  const c = (lead.classificacao || '').toLowerCase()
  if (c.includes('quente')) return COLOR_BY_CLASS.quente
  if (c.includes('morno') || c.includes('médio') || c.includes('medio')) return COLOR_BY_CLASS.morno
  if (c.includes('frio') || c.includes('baixo')) return COLOR_BY_CLASS.frio
  if (typeof lead.scoreFinal === 'number') {
    if (lead.scoreFinal >= 75) return COLOR_BY_CLASS.quente
    if (lead.scoreFinal >= 50) return COLOR_BY_CLASS.morno
    return COLOR_BY_CLASS.frio
  }
  return COLOR_BY_CLASS.default
}

function jitter(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return ((h % 1000) / 1000 - 0.5) * 0.6 // ±0.3°
}

function radiusFor(lead: Lead): number {
  const base = 6
  const score = lead.scoreFinal ?? 0
  return Math.min(18, base + score / 8)
}

function formatBRL(v: number | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default function ProspeccaoMapa() {
  const [params] = useSearchParams()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtroUf, setFiltroUf] = useState<string>(params.get('uf') ?? '')
  const [tipoPessoa, setTipoPessoa] = useState<'' | 'PF' | 'PJ'>(
    (params.get('tipoPessoa') as 'PF' | 'PJ') ?? '',
  )
  const [minDivida, setMinDivida] = useState<number>(Number(params.get('minDivida') ?? 100_000))

  const mapRef = useRef<L.Map | null>(null)

  const loadLeads = async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams()
      if (filtroUf) qs.set('uf', filtroUf)
      if (tipoPessoa) qs.set('tipoPessoa', tipoPessoa)
      if (minDivida > 0) qs.set('minDivida', String(minDivida))
      qs.set('limit', '500')
      const data = await apiFetch<{ leads?: Lead[]; items?: Lead[] }>(`/prospeccao/buscar?${qs.toString()}`)
      const arr = (data?.leads ?? data?.items ?? []) as Lead[]
      setLeads(arr)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'erro')
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const points = useMemo(() => {
    return leads
      .map((lead) => {
        let lat = lead.lat
        let lng = lead.lng
        if ((lat === undefined || lng === undefined) && lead.uf) {
          const c = UF_CENTROIDS[lead.uf]
          if (c) {
            lat = c[0] + jitter((lead.cpfCnpj || lead.id || '') + lead.uf)
            lng = c[1] + jitter((lead.cpfCnpj || lead.id || '') + lead.uf + 'lng')
          }
        }
        if (lat === undefined || lng === undefined) return null
        return { lead, lat, lng }
      })
      .filter((p): p is { lead: Lead; lat: number; lng: number } => p !== null)
  }, [leads])

  const total = leads.length
  const ufsRepresentadas = useMemo(() => {
    const set = new Set(leads.map((l) => l.uf).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [leads])

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/prospeccao"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-aletis-verde-medio/70 hover:text-aletis-verde"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Lista de leads
          </Link>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold text-aletis-verde">
            <MapPin className="h-6 w-6" /> Mapa de Prospecção
          </h1>
          <p className="text-sm text-aletis-verde-medio">
            {loading ? 'Carregando…' : `${total} leads · ${points.length} no mapa · ${ufsRepresentadas.length} UFs`}
          </p>
        </div>
        <button
          type="button"
          onClick={loadLeads}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-aletis-verde px-4 py-2 text-sm font-medium text-aletis-cream transition hover:bg-aletis-verde-escuro disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Recarregar
        </button>
      </header>

      <section className="flex flex-wrap gap-3 rounded-xl bg-white p-3 shadow-brand-sm ring-1 ring-aletis-cinza">
        <Filter className="h-4 w-4 self-center text-aletis-verde-medio" />
        <label className="flex items-center gap-2 text-xs">
          UF:
          <select
            value={filtroUf}
            onChange={(e) => setFiltroUf(e.target.value)}
            className="rounded border border-aletis-cinza bg-white px-2 py-1 text-sm"
          >
            <option value="">Todas</option>
            {Object.keys(UF_CENTROIDS).map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          Tipo:
          <select
            value={tipoPessoa}
            onChange={(e) => setTipoPessoa(e.target.value as '' | 'PF' | 'PJ')}
            className="rounded border border-aletis-cinza bg-white px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            <option value="PF">PF</option>
            <option value="PJ">PJ</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          Dívida mín:
          <input
            type="number"
            value={minDivida}
            step={50_000}
            onChange={(e) => setMinDivida(Number(e.target.value))}
            className="w-32 rounded border border-aletis-cinza bg-white px-2 py-1 text-sm font-mono"
          />
        </label>
        <button
          type="button"
          onClick={loadLeads}
          className="rounded bg-aletis-gold px-3 py-1 text-xs font-bold uppercase tracking-wider text-aletis-verde hover:bg-aletis-gold-escuro hover:text-aletis-cream"
        >
          Aplicar
        </button>
      </section>

      {error && (
        <div className="rounded-xl bg-alerta/10 p-3 text-sm text-alerta">
          Erro ao carregar leads: {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl shadow-brand ring-1 ring-aletis-cinza">
        <MapContainer
          center={[-14.5, -52]}
          zoom={4}
          minZoom={3}
          maxZoom={12}
          scrollWheelZoom
          ref={(m) => {
            if (m) mapRef.current = m
          }}
          style={{ height: '70vh', width: '100%' }}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Mapa">
              <TileLayer
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satélite">
              <TileLayer
                attribution='Tiles © Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          <ScaleControl position="bottomleft" />
          {points.map(({ lead, lat, lng }) => {
            const c = colorFor(lead)
            return (
              <CircleMarker
                key={lead.id || lead.cpfCnpj || `${lat}-${lng}`}
                center={[lat, lng]}
                radius={radiusFor(lead)}
                pathOptions={{ color: c.stroke, fillColor: c.fill, fillOpacity: 0.75, weight: 1 }}
              >
                <Popup>
                  <div className="space-y-1 text-xs">
                    <div className="font-bold text-aletis-verde">{lead.nome || lead.cpfCnpj || 'Lead'}</div>
                    <div>
                      {lead.tipoPessoa || ''} {lead.cpfCnpj && <code className="ml-1 font-mono">{lead.cpfCnpj}</code>}
                    </div>
                    <div>
                      {lead.municipio ? `${lead.municipio} / ` : ''}
                      <strong>{lead.uf}</strong>
                    </div>
                    <div>Dívida: <strong>{formatBRL(lead.divida)}</strong></div>
                    {lead.hectares && <div>Área: <strong>{lead.hectares.toLocaleString('pt-BR')} ha</strong></div>}
                    {lead.scoreFinal !== undefined && (
                      <div>
                        Score: <strong>{lead.scoreFinal.toFixed(0)}</strong>
                        {lead.classificacao && <span className="ml-1 italic">({lead.classificacao})</span>}
                      </div>
                    )}
                    {lead.cpfCnpj && (
                      <Link
                        to={`/prospeccao?cpf=${lead.cpfCnpj}`}
                        className="mt-1 inline-block rounded bg-aletis-verde px-2 py-1 text-[10px] uppercase tracking-wider text-aletis-cream hover:bg-aletis-verde-escuro"
                      >
                        Abrir lead →
                      </Link>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </section>

      <section className="flex items-center gap-4 rounded-xl bg-white p-3 text-xs text-aletis-verde-medio shadow-brand-sm ring-1 ring-aletis-cinza">
        <strong className="uppercase tracking-wider">Legenda:</strong>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLOR_BY_CLASS.quente.fill }} /> quente / score ≥ 75
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLOR_BY_CLASS.morno.fill }} /> morno / 50–74
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLOR_BY_CLASS.frio.fill }} /> frio / &lt; 50
        </span>
        <span className="ml-auto opacity-60">
          Quando o lead não tem lat/lng própria, o ponto é posicionado no centróide da UF.
        </span>
      </section>
    </div>
  )
}
