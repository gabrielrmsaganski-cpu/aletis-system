import React from 'react'
import { AlertTriangle, MapPin } from 'lucide-react'

export interface FireRiskResponse {
  success: boolean
  data?: {
    porEstado: Record<string, number>
    fonte?: string
    atualizadoEm?: string
    maioresIncendios?: { data: string }[]
  }
}

export interface FireObservation {
  porEstado: Record<string, number>
  dataObservacao: string
  coletadoEm: string
}

/** Só detecções com origem e data verificáveis podem compor este painel. */
export function getFireObservation(response?: FireRiskResponse, now = Date.now()): FireObservation | null {
  const data = response?.data
  if (!response?.success || !data || !['api', 'cache'].includes(data.fonte || '')) return null
  const collected = Date.parse(data.atualizadoEm || '')
  const dates = (data.maioresIncendios || []).map(item => item.data).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort()
  const latest = dates[dates.length - 1]
  const observed = Date.parse(`${latest}T00:00:00Z`)
  if (!Number.isFinite(collected) || !Number.isFinite(observed) || now - collected > 86400000 || now - observed > 2 * 86400000 || observed > now || collected > now + 60000) return null
  if (new Date(observed).toISOString().slice(0, 10) !== latest) return null
  const porEstado = Object.fromEntries(Object.entries(data.porEstado || {}).filter(([uf, value]) => /^[A-Z]{2}$/.test(uf) && Number.isInteger(value) && value > 0))
  if (!Object.keys(porEstado).length) return null
  return { porEstado, dataObservacao: latest, coletadoEm: data.atualizadoEm! }
}

export function MarketUnavailable({ title, loading = false }: { title: string; loading?: boolean }) {
  return <section className="card-premium p-5 mb-8" role="status">
    <h2 className="text-lg font-display font-semibold text-foreground">{title}</h2>
    <p className="text-sm font-body text-muted-foreground mt-2">
      {loading ? 'Consultando a fonte de dados…' : 'Dados indisponíveis para esta consulta. Não há observações verificadas para apresentar valores ou gráficos.'}
    </p>
  </section>
}

export function MarketRiskFactors({ observation }: { observation: FireObservation | null }) {
  const first = observation && Object.entries(observation.porEstado).sort((a, b) => b[1] - a[1])[0]
  const factors = [
    { name: 'Condição de estiagem', detail: 'Sem boletim de precipitação validado para avaliar estiagem.', region: 'Região não avaliada', source: 'Fonte e data-base pendentes', observation: false },
    { name: 'El Niño / La Niña', detail: 'Sem boletim ENSO vigente nesta consulta. A fase do fenômeno não foi determinada.', region: 'Abrangência não avaliada', source: 'Fonte e data-base pendentes', observation: false },
    { name: 'Focos de calor', detail: first ? 'Detecções de satélite disponíveis. O risco por imóvel exige localização e avaliação adicional.' : 'Sem detecções recentes com fonte e data verificáveis para avaliar o risco.', region: first ? `${first[0]}: ${first[1]} detecções` : 'Região não avaliada', source: observation ? `NASA FIRMS · observações de ${observation.dataObservacao} · coleta ${observation.coletadoEm}` : 'Fonte e data-base pendentes', observation: Boolean(first) },
    { name: 'Volatilidade cambial', detail: 'Sem cálculo de volatilidade e janela de referência validados nesta consulta.', region: 'Exposição por cliente não avaliada', source: 'Fonte e data-base pendentes', observation: false },
  ]
  return <section className="mb-8">
    <div className="flex items-center gap-2.5 mb-5">
      <div className="w-9 h-9 rounded-lg bg-orange-500/10 flex items-center justify-center"><AlertTriangle className="w-4.5 h-4.5 text-orange-600" /></div>
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground">Fatores de Risco Agroclimáticos</h2>
        <p className="text-xs font-body text-muted-foreground">Disponibilidade das evidências; níveis de risco dependem de avaliação por região e imóvel.</p>
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {factors.map(factor => <div key={factor.name} className="card-premium p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-display font-semibold text-foreground">{factor.name}</p>
          <span className="text-[11px] font-body font-bold px-2 py-0.5 rounded-full border text-muted-foreground bg-aletis-bege">{factor.observation ? 'DETECÇÕES DISPONÍVEIS' : 'NÃO AVALIADO'}</span>
        </div>
        <p className="text-xs font-body text-[var(--text-soft)] mb-1.5">{factor.detail}</p>
        <p className="text-[11px] font-body text-muted-foreground"><MapPin className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />{factor.region}</p>
        <p className="text-[11px] font-body text-muted-foreground mt-2">{factor.source}</p>
      </div>)}
    </div>
  </section>
}
