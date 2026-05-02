// ============================================================
// WorkspaceShell — chrome do cliente: hero compact + nav 6 áreas
// + barra de comandos rápidos. Substitui o ClienteDetalhes legado.
// ============================================================
import { useState, useMemo, lazy, Suspense } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  MapPin,
  Sparkles,
  FileText,
  Briefcase,
  Activity,
  Target,
  Database,
  Handshake,
  Workflow,
} from 'lucide-react'
import { useClienteData, type Cliente } from './useClienteData'
import { fmtBRLCompact, healthColor } from './utils'
import HealthGauge from './HealthGauge'
import StageBadge from './StageBadge'
import QuickActionsBar from './QuickActionsBar'

// Lazy load das 6 áreas — cada uma é seu próprio bundle
const PulseSection = lazy(() => import('./PulseSection'))
const IdentidadeSection = lazy(() => import('./IdentidadeSection'))
const DiagnosticoSection = lazy(() => import('./DiagnosticoSection'))
const OperacaoSection = lazy(() => import('./OperacaoSection'))
const NegociacaoSection = lazy(() => import('./NegociacaoSection'))
const WorkflowSection = lazy(() => import('./WorkflowSection'))

export type WorkspaceArea = 'pulse' | 'identidade' | 'diagnostico' | 'operacao' | 'negociacao' | 'workflow'

interface AreaDef {
  key: WorkspaceArea
  label: string
  short: string
  icon: typeof Briefcase
  accent: string
  description: string
}

const AREAS: AreaDef[] = [
  { key: 'pulse', label: 'Pulse', short: 'Pulse', icon: Activity, accent: 'from-aletis-verde to-aletis-dourado', description: 'Visão de comando do cliente' },
  { key: 'identidade', label: 'Identidade', short: 'Identidade', icon: Briefcase, accent: 'from-blue-500 to-blue-700', description: 'Pessoa, terra, patrimônio' },
  { key: 'diagnostico', label: 'Diagnóstico', short: 'Diagnóstico', icon: Target, accent: 'from-purple-500 to-purple-700', description: 'Saúde financeira & risco' },
  { key: 'operacao', label: 'Operação', short: 'Operação', icon: Database, accent: 'from-amber-500 to-amber-700', description: 'Dados estruturados (R.OP.001)' },
  { key: 'negociacao', label: 'Negociação', short: 'Deal', icon: Handshake, accent: 'from-emerald-500 to-emerald-700', description: 'Propostas, simulações, contratos' },
  { key: 'workflow', label: 'Workflow', short: 'Workflow', icon: Workflow, accent: 'from-aletis-grafite-escuro to-aletis-grafite-medio', description: 'Processo, docs, comms' },
]

interface Props {
  urlId: string
}

export default function WorkspaceShell({ urlId }: Props) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const data = useClienteData(urlId)

  const initialArea = (searchParams.get('area') as WorkspaceArea) || 'pulse'
  const [activeArea, setActiveArea] = useState<WorkspaceArea>(
    AREAS.some((a) => a.key === initialArea) ? initialArea : 'pulse',
  )

  function changeArea(area: WorkspaceArea) {
    setActiveArea(area)
    const next = new URLSearchParams(searchParams)
    next.set('area', area)
    setSearchParams(next, { replace: true })
  }

  if (data.loading && !data.cliente) {
    return <ShellSkeleton />
  }
  if (data.error || !data.cliente) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-sm text-red-700 font-semibold">Erro ao carregar cliente</p>
        <p className="text-xs text-aletis-grafite-claro mt-1">{data.error ?? 'Cliente não encontrado'}</p>
        <Link to="/crm" className="inline-flex items-center gap-1.5 mt-4 text-sm text-aletis-verde hover:underline">
          <ArrowLeft className="w-4 h-4" /> Voltar ao CRM
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-aletis-bege/30 animate-fade-in">
      {/* Breadcrumb minimal */}
      <div className="mb-3 flex items-center justify-between">
        <Link to="/crm" className="inline-flex items-center gap-1.5 text-xs font-body text-aletis-grafite-claro hover:text-aletis-verde transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          CRM
        </Link>
        <Link
          to={`/clientes/${urlId}/legacy`}
          className="text-[10px] font-mono text-aletis-grafite-claro/50 hover:text-aletis-grafite-claro transition-colors"
          title="Versão antiga (14 abas)"
        >
          versão clássica →
        </Link>
      </div>

      {/* HERO compacto — densidade alta */}
      <Hero cliente={data.cliente} analises={data.analises} srai={data.srai} onNavigate={navigate} />

      {/* Barra de comandos rápidos — sticky */}
      <QuickActionsBar urlId={urlId} cliente={data.cliente} apiId={data.apiId} onReload={data.reload} />

      {/* Nav de áreas — 6 pills, com badges */}
      <nav className="mt-4 mb-4 flex flex-wrap gap-1.5 sticky top-2 z-20 bg-aletis-bege/50 backdrop-blur-sm rounded-xl p-1 border border-aletis-borda" role="tablist">
        {AREAS.map((a) => {
          const Icon = a.icon
          const active = activeArea === a.key
          return (
            <button
              key={a.key}
              role="tab"
              aria-selected={active}
              onClick={() => changeArea(a.key)}
              className={`flex-1 min-w-[110px] px-3 py-2 rounded-lg text-xs font-body font-semibold inline-flex items-center justify-center gap-1.5 transition-all ${
                active
                  ? `bg-gradient-to-r ${a.accent} text-white shadow-md scale-[1.02]`
                  : 'text-aletis-grafite-medio hover:bg-white hover:shadow-sm'
              }`}
              title={a.description}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{a.label}</span>
              <span className="sm:hidden">{a.short}</span>
            </button>
          )
        })}
      </nav>

      {/* Área ativa */}
      <Suspense fallback={<AreaSkeleton />}>
        {activeArea === 'pulse' && <PulseSection data={data} onNavigate={changeArea} />}
        {activeArea === 'identidade' && <IdentidadeSection data={data} />}
        {activeArea === 'diagnostico' && <DiagnosticoSection data={data} />}
        {activeArea === 'operacao' && <OperacaoSection data={data} />}
        {activeArea === 'negociacao' && <NegociacaoSection data={data} />}
        {activeArea === 'workflow' && <WorkflowSection data={data} />}
      </Suspense>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Hero compacto — toda informação crítica em uma linha grande
// ────────────────────────────────────────────────────────────
function Hero({ cliente, analises, srai, onNavigate }: {
  cliente: Cliente
  analises: ReturnType<typeof useClienteData>['analises']
  srai: ReturnType<typeof useClienteData>['srai']
  onNavigate: (path: string) => void
}) {
  const initials = useMemo(
    () => cliente.nome.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
    [cliente.nome],
  )
  const saudeColor = healthColor(cliente.saudeFinanceira)
  const margemPct = analises?.margemCliente?.margemPct
  const saldoLivre = analises?.fluxoCaixaSafra?.saldoLivre
  const sraiClass = srai?.classificacao

  return (
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-white to-aletis-bege/30 border border-aletis-borda shadow-sm">
      {/* Accent bar */}
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${saudeColor}, transparent)` }} />

      <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Avatar + nome + meta */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-display font-bold flex-shrink-0 shadow-md"
            style={{ background: `linear-gradient(135deg, ${saudeColor}, ${saudeColor}dd)` }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h1 className="text-xl lg:text-2xl font-display font-bold text-aletis-grafite-escuro tracking-tight truncate">
                {cliente.nome}
              </h1>
              <StageBadge estagio={cliente.estagio} />
              {sraiClass && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-body font-bold uppercase tracking-wider ${
                  sraiClass === 'critico' ? 'bg-red-100 text-red-800' :
                  sraiClass === 'alto' ? 'bg-amber-100 text-amber-800' :
                  sraiClass === 'moderado' ? 'bg-blue-100 text-blue-800' :
                  'bg-emerald-100 text-emerald-800'
                }`}>
                  SRAI {srai?.scoreTotal ?? '?'} · {sraiClass}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs font-body text-aletis-grafite-medio flex-wrap">
              <span className="font-mono text-aletis-grafite-claro">{cliente.cpfCnpj}</span>
              <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {cliente.cidade}/{cliente.uf}</span>
              {cliente.telefone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {cliente.telefone}</span>}
              <span className="text-aletis-grafite-claro">consultor: <strong className="text-aletis-grafite-medio">{cliente.consultor}</strong></span>
            </div>
          </div>
        </div>

        {/* KPIs rápidos */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:flex-shrink-0">
          <Kpi label="Dívida atual" value={fmtBRLCompact(cliente.resumoFinanceiro.totalDivida)} tone="bad" />
          <Kpi
            label="Saldo livre"
            value={saldoLivre != null ? fmtBRLCompact(saldoLivre) : '—'}
            tone={(saldoLivre ?? 0) >= 0 ? 'good' : 'bad'}
            sub="safra atual"
          />
          <Kpi
            label="Margem cliente"
            value={margemPct != null ? `${(margemPct * 100).toFixed(1)}%` : '—'}
            tone={(margemPct ?? 0) > 0.15 ? 'good' : (margemPct ?? 0) > 0 ? 'warn' : 'bad'}
            sub={analises?.margemCliente?.classificacao}
          />
          <Kpi
            label="Saúde"
            value={`${cliente.saudeFinanceira}/100`}
            tone={cliente.saudeFinanceira >= 70 ? 'good' : cliente.saudeFinanceira >= 40 ? 'warn' : 'bad'}
            sub="score interno"
          />
        </div>

        {/* Health gauge + ações inline */}
        <div className="flex items-center gap-3 lg:flex-shrink-0">
          <HealthGauge value={cliente.saudeFinanceira} size={64} />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => onNavigate('/propostas')}
              className="px-3 py-1.5 rounded-lg bg-aletis-dourado text-white text-[11px] font-semibold inline-flex items-center gap-1.5 hover:bg-aletis-dourado-escuro transition-colors"
            >
              <FileText className="w-3 h-3" /> Proposta
            </button>
            <Link
              to={`/clientes/${cliente.id}/dossie`}
              className="px-3 py-1.5 rounded-lg border border-aletis-verde/40 text-aletis-verde text-[11px] font-semibold inline-flex items-center gap-1.5 hover:bg-aletis-verde/10 transition-colors"
            >
              <Sparkles className="w-3 h-3" /> Dossiê
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const cls =
    tone === 'good' ? 'border-l-emerald-500' :
    tone === 'warn' ? 'border-l-amber-500' :
    tone === 'bad' ? 'border-l-red-500' :
    'border-l-aletis-grafite-claro/30'
  return (
    <div className={`bg-white/80 rounded-lg px-2.5 py-1.5 border-l-4 ${cls} min-w-[100px]`}>
      <p className="text-[9px] font-body uppercase tracking-wider text-aletis-grafite-claro">{label}</p>
      <p className="text-sm font-display font-bold text-aletis-grafite-escuro tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[9px] text-aletis-grafite-claro truncate">{sub}</p>}
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-aletis-bege/30 space-y-3">
      <div className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
      <div className="h-12 rounded-xl bg-gray-100 animate-pulse" />
      <div className="h-12 rounded-xl bg-gray-100 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    </div>
  )
}

function AreaSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 rounded-xl bg-gray-100 animate-pulse" />)}
      </div>
    </div>
  )
}
