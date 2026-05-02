// ============================================================
// NegociacaoSection — deal flow integrado.
// Propostas, Negociações (DealRoom embed), Demandas de crédito,
// Contratos oficiais. CTAs principais (Simulador/Stress/Marketplace)
// estão na QuickActionsBar global — aqui ficam as listas.
// ============================================================
import { useEffect, useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../hooks/useApi'
import {
  Handshake,
  FileText,
  Send,
  Building2,
  ExternalLink,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import { fmtBRL, fmtBRLCompact, fmtData } from './utils'

const ClientePropostasTab = lazy(() => import('../ClientePropostasTab'))
const ContratosOficiaisTab = lazy(() => import('../../contratos/ContratosOficiaisTab'))

type DealTab = 'propostas' | 'negociacoes' | 'demandas' | 'contratos'

interface Props {
  data: UseClienteDataReturn
}

interface Negociacao {
  id: string
  status: string
  credor?: string
  valor?: number
  taxa?: number
  prazo?: number
  proximaAcao?: string
  criadoEm?: string
}

interface Demanda {
  id: string
  numero?: number
  credor?: string
  finalidade?: string
  modalidade?: string
  valor?: string | number
  status?: string
}

const TABS: { key: DealTab; label: string; emoji: string; icon: typeof Send }[] = [
  { key: 'propostas', label: 'Propostas', emoji: '📨', icon: Send },
  { key: 'negociacoes', label: 'Negociações', emoji: '🤝', icon: Handshake },
  { key: 'demandas', label: 'Demandas de crédito', emoji: '💰', icon: TrendingUp },
  { key: 'contratos', label: 'Contratos', emoji: '📋', icon: FileText },
]

export default function NegociacaoSection({ data }: Props) {
  const { cliente, apiId } = data
  const [active, setActive] = useState<DealTab>('propostas')
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([])
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [loadingDeal, setLoadingDeal] = useState(false)
  const [propostasCount, setPropostasCount] = useState<number | null>(null)

  useEffect(() => {
    if (!apiId) return
    apiFetch<{ grupos: Array<{ id: string }> }>(`/gestao-financeira/grupos?clienteId=${apiId}`)
      .then((r) => { if (r.grupos?.[0]) setGrupoId(r.grupos[0].id) })
      .catch(() => {})
    // negociações (Deal Room) — endpoint /deal-room/cliente/:id
    setLoadingDeal(true)
    apiFetch<any>(`/deal-room/cliente/${apiId}`)
      .then((r) => {
        // resposta pode ser array direto ou { negociacoes: [...] }
        if (Array.isArray(r)) setNegociacoes(r)
        else if (Array.isArray(r?.negociacoes)) setNegociacoes(r.negociacoes)
        else if (Array.isArray(r?.data)) setNegociacoes(r.data)
        else setNegociacoes([])
      })
      .catch(() => {})
      .finally(() => setLoadingDeal(false))
    // propostas count
    apiFetch<any[]>(`/propostas?clienteId=${apiId}`)
      .then((r) => setPropostasCount(Array.isArray(r) ? r.length : 0))
      .catch(() => setPropostasCount(0))
  }, [apiId])

  useEffect(() => {
    if (!grupoId) return
    apiFetch<{ demandas: Demanda[] }>(`/gestao-financeira/grupos/${grupoId}/demandas`)
      .then((r) => setDemandas(r.demandas ?? []))
      .catch(() => {})
  }, [grupoId])

  if (!cliente || !apiId) return null

  const negAtivas = negociacoes.filter((n) => n.status !== 'concluido' && n.status !== 'cancelado').length
  const demAtivas = demandas.filter((d) => d.status === 'em_analise' || d.status === 'aprovada').length

  return (
    <div className="space-y-3 animate-fade-in">
      <header className="card-premium p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center flex-shrink-0">
          <Handshake className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-mono text-emerald-700 uppercase font-semibold tracking-wider">
            🎯 deal flow integrado
          </p>
          <h2 className="text-base font-display font-bold text-aletis-grafite-escuro">
            Negociação
          </h2>
          <p className="text-xs font-body text-aletis-grafite-medio mt-0.5">
            Propostas, negociações com credores, demandas de crédito e contratos oficiais.
            Use a barra de comandos acima para <strong>Simular renegociação</strong>, <strong>Stress test</strong>, <strong>Marketplace</strong> e <strong>Narrativa ALIX</strong>.
          </p>
        </div>
      </header>

      {/* Mini-KPIs do funil */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <DealKpi label="Propostas" count={propostasCount ?? '—'} accent="dourado" />
        <DealKpi label="Negociações ativas" count={negAtivas} accent="emerald" />
        <DealKpi label="Demandas no funil" count={demAtivas} accent="blue" />
        <DealKpi
          label="Dívida total"
          count={fmtBRLCompact(cliente.resumoFinanceiro.totalDivida)}
          accent="red"
        />
      </div>

      {/* Sub-tabs */}
      <nav className="card-premium px-2 py-1.5 flex gap-1 overflow-x-auto" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-body font-semibold inline-flex items-center gap-1.5 transition-colors ${
                isActive ? 'bg-emerald-600 text-white' : 'text-aletis-grafite-escuro hover:bg-emerald-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
        <Link
          to={`/clientes/${cliente.id}/deal-room`}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold border border-aletis-borda text-aletis-grafite-escuro hover:bg-aletis-bege/40 inline-flex items-center gap-1.5"
        >
          <Building2 className="w-3.5 h-3.5" /> Deal Room completo
          <ExternalLink className="w-3 h-3" />
        </Link>
      </nav>

      {/* Conteúdo */}
      {active === 'propostas' && (
        <Suspense fallback={<Sk />}>
          <ClientePropostasTab clienteId={apiId} />
        </Suspense>
      )}
      {active === 'negociacoes' && (
        <NegociacoesEmbed list={negociacoes} loading={loadingDeal} clienteId={cliente.id} />
      )}
      {active === 'demandas' && (
        <DemandasEmbed list={demandas} grupoId={grupoId} hasGrupo={!!grupoId} />
      )}
      {active === 'contratos' && (
        <Suspense fallback={<Sk />}>
          <ContratosOficiaisTab clienteId={apiId} />
        </Suspense>
      )}
    </div>
  )
}

function DealKpi({ label, count, accent }: { label: string; count: number | string; accent: 'red' | 'emerald' | 'blue' | 'dourado' }) {
  const cls = {
    red: 'border-l-red-500',
    emerald: 'border-l-emerald-500',
    blue: 'border-l-blue-500',
    dourado: 'border-l-aletis-dourado',
  }[accent]
  return (
    <div className={`card-premium px-3 py-2 border-l-4 ${cls}`}>
      <p className="text-[9px] uppercase tracking-wider text-aletis-grafite-claro font-body">{label}</p>
      <p className="text-base font-display font-bold tabular-nums">{count}</p>
    </div>
  )
}

function NegociacoesEmbed({ list, loading, clienteId }: { list: Negociacao[]; loading: boolean; clienteId: string }) {
  if (loading) return <Sk />
  if (list.length === 0) {
    return (
      <div className="card-premium p-8 text-center">
        <Handshake className="w-6 h-6 text-aletis-grafite-claro/40 mx-auto mb-2" />
        <p className="text-xs text-aletis-grafite-claro">Nenhuma negociação ativa.</p>
        <Link
          to={`/clientes/${clienteId}/deal-room`}
          className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
        >
          <Building2 className="w-3.5 h-3.5" /> Abrir Deal Room
        </Link>
      </div>
    )
  }
  return (
    <div className="card-premium p-4">
      <h3 className="text-sm font-display font-semibold mb-3">{list.length} negociação(ões)</h3>
      <ul className="space-y-1.5">
        {list.map((n) => (
          <li key={n.id} className="flex items-baseline gap-2 px-2 py-1.5 rounded hover:bg-aletis-bege/30 text-xs">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0 ${
              n.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' :
              n.status === 'cancelado' ? 'bg-red-100 text-red-700' :
              n.status === 'em_andamento' ? 'bg-blue-100 text-blue-700' :
              'bg-amber-100 text-amber-800'
            }`}>{n.status}</span>
            <span className="font-semibold">{n.credor ?? '—'}</span>
            {n.valor != null && <span className="text-aletis-grafite-medio tabular-nums">{fmtBRL(n.valor)}</span>}
            {n.taxa != null && <span className="text-aletis-grafite-claro">{n.taxa}% a.a.</span>}
            {n.prazo != null && <span className="text-aletis-grafite-claro">{n.prazo}m</span>}
            {n.proximaAcao && <span className="text-aletis-grafite-claro flex-1 truncate">— {n.proximaAcao}</span>}
            {n.criadoEm && <span className="text-[10px] text-aletis-grafite-claro flex-shrink-0">{fmtData(n.criadoEm)}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DemandasEmbed({ list, grupoId, hasGrupo }: { list: Demanda[]; grupoId: string | null; hasGrupo: boolean }) {
  if (!hasGrupo) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-xs text-aletis-grafite-claro italic">Crie o grupo de gestão financeira para gerenciar demandas de crédito.</p>
      </div>
    )
  }
  if (list.length === 0) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-xs text-aletis-grafite-claro">Nenhuma demanda cadastrada. Edite na <strong>Operação → Demandas</strong>.</p>
      </div>
    )
  }
  return (
    <div className="card-premium p-4">
      <h3 className="text-sm font-display font-semibold mb-3">{list.length} demanda(s) no funil</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase text-aletis-grafite-claro border-b border-aletis-borda">
              <th className="text-left py-1.5">Nº</th>
              <th className="text-left py-1.5">Credor</th>
              <th className="text-left py-1.5">Finalidade</th>
              <th className="text-left py-1.5">Modalidade</th>
              <th className="text-right py-1.5">Valor</th>
              <th className="text-center py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.id} className="border-b border-aletis-borda/50">
                <td className="py-1.5 font-mono">{d.numero ?? '—'}</td>
                <td className="py-1.5">{d.credor ?? '—'}</td>
                <td className="py-1.5">{d.finalidade ?? '—'}</td>
                <td className="py-1.5">{d.modalidade ?? '—'}</td>
                <td className="py-1.5 text-right tabular-nums">{d.valor != null ? fmtBRL(Number(d.valor)) : '—'}</td>
                <td className="py-1.5 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                    d.status === 'aprovada' ? 'bg-emerald-100 text-emerald-700' :
                    d.status === 'recusada' ? 'bg-red-100 text-red-700' :
                    d.status === 'desembolsada' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-800'
                  }`}>{d.status ?? 'em_analise'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Sk() {
  return (
    <div className="space-y-2">
      <div className="h-12 rounded-xl bg-gray-100 animate-pulse" />
      <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
    </div>
  )
}
