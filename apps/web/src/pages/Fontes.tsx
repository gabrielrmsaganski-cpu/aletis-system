import { SectionNav } from '../components/ui/SectionNav'
import SearchField from '../components/ui/SearchField'
import FilterBar from '../components/ui/FilterBar'
import ViewSwitch from '../components/ui/ViewSwitch'
import MetricCard from '../components/ui/MetricCard'
import PageHeader from '../components/ui/PageHeader'
/**
 * Fontes — painel de SLA das 36 fontes externas (BCB, CEPEA, CONAB,
 * INMET, IBGE, ANP, NASA, etc.).
 *
 * Consome três endpoints (todos Wave-PG-11):
 *   GET /api/fontes/status     — snapshot atual com latência/erro
 *   GET /api/fontes/uptime     — uptime % por fonte (24h/7d/30d)
 *   GET /api/fontes/historico  — timeline de transitions (audit_log)
 *
 * Layout:
 *   1. KPI hero — total / online / offline / degraded / média uptime
 *   2. Grid de fontes — cards com status, latência, uptime, último erro
 *   3. Timeline — últimos eventos (online↔offline) com ato, fonte, hora
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  TrendingUp,
  XCircle,
} from 'lucide-react'
import { apiFetchFull } from '../hooks/useApi'

interface FonteStatus {
  nome: string
  descricao?: string
  categoria?: string
  status: 'online' | 'offline' | 'degraded' | string
  ultimaAtualizacao?: string
  latenciaMs?: number
  ultimoErro?: string | null
  erros24h?: number
}

interface UptimeFonte {
  nome: string
  statusAtual: string
  transitions: number
  uptimePct: number
}

interface UptimeResp {
  janelaHoras: number
  desde?: string
  media: number
  fontes: UptimeFonte[]
  aviso?: string
}

interface HistoricoEvento {
  id: number
  criadoEm: string
  fonte: string
  de: string | null
  para: string | null
  latenciaMs: number | null
  ultimoErro: string | null
}

interface HistoricoResp {
  total: number
  desde?: string
  eventos: HistoricoEvento[]
  aviso?: string
}

interface StatusResp {
  fontes: FonteStatus[]
}

const STATUS_TONE: Record<string, { dot: string; pill: string; icon: typeof CheckCircle2 }> = {
  online: { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  offline: { dot: 'bg-red-500', pill: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
  degraded: { dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
}

function formatDuration(ms?: number): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function fmtRel(iso: string): string {
  const dt = new Date(iso)
  const diffSec = Math.max(0, Math.round((Date.now() - dt.getTime()) / 1000))
  if (diffSec < 60) return `${diffSec}s atrás`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}min atrás`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h atrás`
  return `${Math.floor(diffSec / 86400)}d atrás`
}

export default function Fontes() {
  const [area, setArea] = useState<'status' | 'historico'>('status')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [status, setStatus] = useState<FonteStatus[]>([])
  const [uptime, setUptime] = useState<UptimeResp | null>(null)
  const [historico, setHistorico] = useState<HistoricoResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [horas, setHoras] = useState<24 | 168>(24)

  const carregar = async () => {
    setLoading(true)
    setError(null)
    try {
      // apiFetchFull mantém envelope { success, dados } intacto
      // (rotas /fontes ainda usam shape custom em vez de .data padrão)
      const [r1, r2, r3] = await Promise.all([
        apiFetchFull<{ success: boolean; dados?: StatusResp }>('/fontes/status'),
        apiFetchFull<UptimeResp>(`/fontes/uptime?horas=${horas}`),
        apiFetchFull<HistoricoResp>('/fontes/historico?limit=50'),
      ])
      const sd = r1?.dados?.fontes ?? []
      setStatus(sd)
      setUptime(r2)
      setHistorico(r3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar fontes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    const id = setInterval(carregar, 60_000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horas])

  const counts = useMemo(() => {
    const out = { online: 0, offline: 0, degraded: 0, total: status.length }
    for (const f of status) {
      if (f.status === 'online') out.online++
      else if (f.status === 'offline') out.offline++
      else if (f.status === 'degraded') out.degraded++
    }
    return out
  }, [status])

  const uptimeMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of uptime?.fontes ?? []) m.set(f.nome, f.uptimePct)
    return m
  }, [uptime])

  const visibleSources = status.filter(source => (statusFilter === 'todos' || source.status === statusFilter) && [source.nome,source.descricao,source.categoria].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))

  return (
    <div>
      <PageHeader eyebrow="Inteligência" title={<>Fontes de dados</>} description={<> <p className="text-muted-foreground font-body mt-1 text-sm">
            Disponibilidade, desempenho e histórico das fontes integradas ao Aletis.
          </p> </>} actions={<> <div className="flex items-center gap-2">
          <ViewSwitch label="Período de disponibilidade" value={String(horas)} onChange={value=>setHoras(value === '24' ? 24 : 168)} options={[{value:'24',label:'24 horas'},{value:'168',label:'7 dias'}]} />
          <button
            onClick={carregar}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-aletis-borda bg-card px-3 py-1.5 text-xs text-foreground hover:bg-aletis-bege disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div> </>} />

      {error && (
        <div className="card-premium p-4 mb-4 border-red-200 bg-red-50/50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <section aria-label="Resumo das fontes" className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <MetricCard label="Fontes registradas" value={counts.total} icon={Database} loading={loading && !status.length} />
        <MetricCard label="Disponíveis" value={counts.online} detail={counts.total > 0 ? ((counts.online/counts.total)*100).toFixed(0)+'% do total' : 'Sem fontes registradas'} icon={CheckCircle2} tone="success" loading={loading && !status.length} />
        <MetricCard label="Instáveis" value={counts.degraded} detail="Lentidão ou erro do servidor" icon={AlertTriangle} tone="warning" loading={loading && !status.length} />
        <MetricCard label="Indisponíveis" value={counts.offline} detail="Falha de conexão ou tempo limite" icon={XCircle} tone="danger" loading={loading && !status.length} />
        <MetricCard label={'Disponibilidade · '+(horas === 24 ? '24 horas' : '7 dias')} value={uptime ? uptime.media.toFixed(1)+'%' : '—'} detail={(uptime?.fontes.length ?? 0)+' fontes monitoradas'} icon={TrendingUp} />
      </section>
      <SectionNav label="Áreas de fontes de dados" active={area} onChange={setArea} items={[{id:'status',label:'Situação atual',icon:Database},{id:'historico',label:'Histórico de alterações',icon:Activity}]} />
      {area === 'status' && <>
        <FilterBar className="mb-4" activeCount={Number(Boolean(search.trim())) + Number(statusFilter !== 'todos')} onClear={()=>{setSearch('');setStatusFilter('todos')}}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <SearchField label="Buscar fontes" value={search} onChange={setSearch} placeholder="Nome, descrição ou categoria" />
            <label className="text-xs font-medium text-muted-foreground">Disponibilidade<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="input-field mt-1.5 block w-full sm:w-56"><option value="todos">Todas</option><option value="online">Disponíveis</option><option value="degraded">Instáveis</option><option value="offline">Indisponíveis</option></select></label>
          </div>
        </FilterBar>
      {/* Grid de fontes */}
      <section className="card-premium p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-display font-semibold text-foreground flex items-center gap-2">
            <Database className="w-4 h-4 text-foreground" />
            Fontes · {visibleSources.length} de {status.length}
          </h2>
          <p className="text-xs text-muted-foreground">Atualiza a cada 60s</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {visibleSources.map((f) => {
            const tone = STATUS_TONE[f.status] ?? STATUS_TONE.offline
            const upPct = uptimeMap.get(f.nome)
            return (
              <div
                key={f.nome}
                className="rounded-lg border border-aletis-borda bg-card p-3 hover:border-aletis-verde/40 transition-colors"
                title={f.descricao}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
                    <p className="text-sm font-mono text-foreground truncate">{f.nome}</p>
                  </div>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase border ${tone.pill}`}
                  >
                    {{online:'Disponível',offline:'Indisponível',degraded:'Instável'}[f.status] ?? f.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Latência</p>
                    <p className="text-foreground tabular-nums font-medium">
                      {formatDuration(f.latenciaMs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">Uptime</p>
                    <p className="text-foreground tabular-nums font-medium">
                      {upPct != null ? `${upPct.toFixed(0)}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground uppercase tracking-wider">24h err</p>
                    <p className="text-foreground tabular-nums font-medium">{f.erros24h ?? 0}</p>
                  </div>
                </div>
                {f.ultimoErro && (
                  <p className="mt-2 text-[11px] text-red-600 truncate" title={f.ultimoErro}>
                    {f.ultimoErro}
                  </p>
                )}
              </div>
            )
          })}
          {visibleSources.length === 0 && (
            <p className="col-span-full text-center text-sm text-muted-foreground py-6">
              {status.length ? 'Nenhuma fonte corresponde aos filtros. Tente outra busca ou limpe os filtros.' : loading ? 'Carregando fontes…' : 'Nenhuma fonte registrada — aguardando primeira sondagem.'}
            </p>
          )}
        </div>
      </section>

      </>}
      {/* Timeline */}
      {area === 'historico' && (
      <section className="card-premium p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-display font-semibold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-foreground" />
            Histórico de alterações
          </h2>
          <p className="text-xs text-muted-foreground">
            {historico?.total ?? 0} eventos recentes
          </p>
        </div>
        {historico?.aviso && (
          <p className="text-xs text-amber-700 mb-3 italic">{historico.aviso}</p>
        )}
        <ul className="divide-y divide-aletis-borda/50">
          {(historico?.eventos ?? []).map((e) => {
            const fromTone = STATUS_TONE[e.de ?? ''] ?? STATUS_TONE.offline
            const toTone = STATUS_TONE[e.para ?? ''] ?? STATUS_TONE.offline
            return (
              <li key={e.id} className="py-2.5 flex items-center gap-3">
                <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 w-20">
                  {fmtRel(e.criadoEm)}
                </span>
                <span className="font-mono text-xs text-foreground flex-1 truncate">
                  {e.fonte}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase border ${fromTone.pill}`}>
                  {e.de ?? 'unknown'}
                </span>
                <TrendingUp className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase border ${toTone.pill}`}>
                  {e.para ?? 'unknown'}
                </span>
                {e.latenciaMs != null && (
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {formatDuration(e.latenciaMs)}
                  </span>
                )}
              </li>
            )
          })}
          {(!historico?.eventos || historico.eventos.length === 0) && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma transição registrada ainda.
            </li>
          )}
        </ul>
      </section>
      )}
    </div>
  )
}
