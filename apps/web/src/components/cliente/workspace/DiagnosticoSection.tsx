// ============================================================
// DiagnosticoSection — hub completo de diagnóstico financeiro.
// Sub-tabs: Visão Geral | Raio X 360° | Operação | Registro Mensal | Relatórios
// Integra SRAI, AB+S, Dashboard360, GestaoFinanceiraTab, RegistroMensal.
// v2.0 — com Guia do Consultor, progresso por área e onboarding inteligente.
// ============================================================
import { useEffect, useState, lazy, Suspense, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../../hooks/useApi'
import {
  Target,
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  Activity,
  FileSpreadsheet,
  BarChart3,
  CalendarDays,
  Presentation,
  FileText,
  Download,
  Save,
  Bot,
  BookOpen,
  CheckCircle2,
  Circle,
  ChevronRight,
  Info,
  ArrowRight,
  UploadCloud,
  Users,
  Wheat,
  Sprout,
  CreditCard,
  Building2,
  Calculator,
  ShieldCheck,
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import type { WorkspaceArea } from './WorkspaceShell'
import { fmtBRL, fmtPct } from './utils'

const Dashboard360 = lazy(() => import('../../gestao-financeira/Dashboard360'))
const GestaoFinanceiraTab = lazy(() => import('../../gestao-financeira/GestaoFinanceiraTab'))
const RegistroMensalSection = lazy(() => import('../../gestao-financeira/RegistroMensalSection'))
const CustosClienteSection = lazy(() => import('../../gestao-financeira/CustosClienteSection'))
const QuadroProducaoSection = lazy(() => import('../../gestao-financeira/QuadroProducaoSection'))

interface Props {
  data: UseClienteDataReturn
  onNavigateArea?: (area: WorkspaceArea) => void
}

type DiagTab = 'guia' | 'visao' | 'raiox' | 'custos' | 'producao' | 'registro-mensal'

const DIAG_TABS: { key: DiagTab; label: string; icon: typeof Activity; desc: string }[] = [
  { key: 'guia', label: 'Guia do Consultor', icon: BookOpen, desc: 'Passo a passo do diagnóstico' },
  { key: 'visao', label: 'Visão Geral', icon: Activity, desc: 'SRAI, AB+S, alertas' },
  { key: 'raiox', label: 'Raio X 360°', icon: BarChart3, desc: 'KPIs, charts e cenários' },
  { key: 'custos', label: 'Custos (R.OP.010)', icon: Calculator, desc: 'Insumos e custos por cultura' },
  { key: 'producao', label: 'Produção (R.OP.011)', icon: Sprout, desc: 'Quadro safra e margens' },
  { key: 'registro-mensal', label: 'Registro Mensal', icon: CalendarDays, desc: 'Receitas e despesas mensais' },
]

export default function DiagnosticoSection({ data, onNavigateArea }: Props) {
  const { cliente, srai, abs, analises, recalcularAnalises, recalculando, apiId } = data
  const [searchParams, setSearchParams] = useSearchParams()
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [grupoStats, setGrupoStats] = useState<GrupoStats | null>(null)

  // Aba ativa controlada pela URL (?diagTab=xxx), com fallback para evitar telas antigas.
  const requestedTab = searchParams.get('diagTab') as DiagTab | null
  const activeTab: DiagTab = requestedTab && DIAG_TABS.some((t) => t.key === requestedTab) ? requestedTab : 'guia'
  function setActiveTab(tab: DiagTab) {
    const next = new URLSearchParams(searchParams)
    if (tab === 'guia') next.delete('diagTab')
    else next.set('diagTab', tab)
    setSearchParams(next, { replace: true })
  }

  const fetchGrupo = useCallback(async () => {
    if (!apiId) return
    try {
      const r = await apiFetch<{ grupos: Array<{ id: string }> }>(`/gestao-financeira/grupos?clienteId=${apiId}`)
      if (r.grupos?.[0]) {
        setGrupoId(r.grupos[0].id)
        // Buscar estatísticas do grupo. O endpoint dashboard-360 retorna
        // arrays completos + um objeto `contadores` com counts. Como o
        // GrupoStats local espera números, normalizamos aqui de forma
        // defensiva (qualquer array vira length; número vira número).
        const raw = await apiFetch<any>(`/gestao-financeira/grupos/${r.grupos[0].id}/dashboard-360?persistir=0`)
        const c = (raw && typeof raw === 'object' ? raw.contadores : null) ?? {}
        const toCount = (v: any): number => {
          if (Array.isArray(v)) return v.length
          if (typeof v === 'number' && Number.isFinite(v)) return v
          return 0
        }
        setGrupoStats({
          culturas: toCount(c.culturas ?? raw?.culturas),
          contratos: toCount(c.contratos ?? raw?.contratos),
          fazendas: toCount(c.fazendas ?? raw?.fazendas ?? raw?.ativos?.fazendas),
          garantias: toCount(c.garantias ?? raw?.garantias),
          premissas: toCount(c.premissas ?? raw?.premissas),
          custos: toCount(c.custos ?? raw?.custos),
          demandas: toCount(c.demandas ?? raw?.demandas),
          passivos: toCount(c.passivosOutros ?? raw?.passivosOutros ?? raw?.passivos),
        })
      }
    } catch { /* ignora — grupo pode não existir */ }
  }, [apiId])

  useEffect(() => { fetchGrupo() }, [fetchGrupo])

  if (!cliente) return null

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header com título e recalcular */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-mono text-foreground uppercase font-semibold tracking-wider">
            diagnóstico do cliente
          </p>
          <h2 className="text-lg font-display font-semibold text-foreground">
            Radiografia financeira
          </h2>
          {analises?.geradoEm && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              calculada em {new Date(analises.geradoEm).toLocaleString('pt-BR')} · {analises.duracaoMs}ms
            </p>
          )}
        </div>
        <button
          onClick={recalcularAnalises}
          disabled={recalculando}
          className="h-10 shrink-0 rounded-xl bg-aletis-verde px-4 text-xs font-semibold text-white inline-flex items-center justify-center gap-2 shadow-sm hover:bg-aletis-verde-escuro transition-colors disabled:opacity-50 sm:min-w-[168px]"
        >
          {recalculando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {recalculando ? 'Recalculando…' : 'Recalcular análise'}
        </button>
      </header>

      {/* Nav sub-tabs com descrição em tooltip */}
      <nav className="sticky top-2 z-20 flex gap-1 overflow-x-auto rounded-lg border border-aletis-borda bg-white/90 p-1 shadow-none backdrop-blur-sm" role="tablist">
        {DIAG_TABS.map((t) => {
          const Icon = t.icon
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t.key)}
              title={t.desc}
              className={`h-11 min-w-[132px] flex-none rounded-xl px-3 text-xs font-body font-semibold inline-flex items-center justify-center gap-1.5 transition-colors sm:flex-1 ${
                active
                  ? 'bg-aletis-verde text-white shadow-sm'
                  : 'text-[var(--text-soft)] hover:bg-aletis-bege/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Conteúdo da aba ativa */}
      {activeTab === 'guia' && (
        <GuiaConsultorTab
          data={data}
          grupoId={grupoId}
          grupoStats={grupoStats}
          onReload={fetchGrupo}
          onNavigate={(tab) => {
            const next = new URLSearchParams(searchParams)
            if (tab === 'guia') next.delete('diagTab')
            else next.set('diagTab', tab)
            next.delete('opTab')
            setSearchParams(next, { replace: true })
          }}
          onNavigateArea={onNavigateArea}
        />
      )}
      {activeTab === 'visao' && (
        <VisaoGeralTab data={data} grupoId={grupoId} />
      )}
      {activeTab === 'raiox' && (
        <RaioXTab grupoId={grupoId} />
      )}
      {activeTab === 'custos' && (
        <CustosTab grupoId={grupoId} />
      )}
      {activeTab === 'producao' && (
        <ProducaoTab grupoId={grupoId} />
      )}
      {activeTab === 'registro-mensal' && (
        <RegistroMensalTab grupoId={grupoId} />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// GUIA DO CONSULTOR — onboarding e progresso do diagnóstico
// ═════════════════════════════════════════════════════════════

interface GrupoStats {
  culturas?: number
  contratos?: number
  fazendas?: number
  garantias?: number
  premissas?: number
  custos?: number
  demandas?: number
  passivos?: number
}

interface EtapaDiagnostico {
  id: string
  titulo: string
  descricao: string
  icon: typeof Users
  navegarPara?: DiagTab
  area?: WorkspaceArea
  minimo: number
  atual: number
  opcional?: boolean
}

function GuiaConsultorTab({
  data,
  grupoId,
  grupoStats,
  onReload,
  onNavigate,
  onNavigateArea,
}: {
  data: UseClienteDataReturn
  grupoId: string | null
  grupoStats: GrupoStats | null
  onReload: () => void
  onNavigate: (tab: DiagTab) => void
  onNavigateArea?: (area: WorkspaceArea) => void
}) {
  const { apiId } = data
  const [showChecklist, setShowChecklist] = useState(true)

  const etapas: EtapaDiagnostico[] = [
    {
      id: 'cadastro',
      titulo: 'Cadastro do Grupo',
      descricao: 'Nome do grupo, data base, histórico e membros do grupo familiar (CPF, parentesco, quem atua na atividade).',
      icon: Users,
      area: 'gestao',
      minimo: 1,
      atual: grupoStats ? 1 : 0,
    },
    {
      id: 'safras',
      titulo: 'Safras e Culturas',
      descricao: 'Área própria/arrendada, rendimento (sc/ha), preço médio, custo unitário de insumos e arrendamento base.',
      icon: Wheat,
      area: 'gestao',
      minimo: 1,
      atual: grupoStats?.culturas ?? 0,
    },
    {
      id: 'custos',
      titulo: 'Custos do Cliente',
      descricao: 'Insumos por cultura, custos operacionais, fixos, frete, colheita e arrendamento. Mensal + anual.',
      icon: Calculator,
      navegarPara: 'custos',
      minimo: 1,
      atual: grupoStats?.custos ?? 0,
    },
    {
      id: 'endividamento',
      titulo: 'Endividamento Bancário',
      descricao: 'Contratos bancários: credor, valor financiado, taxa, prazo, método (PRICE/SAC), enquadramento, parcelas.',
      icon: CreditCard,
      area: 'gestao',
      minimo: 1,
      atual: grupoStats?.contratos ?? 0,
    },
    {
      id: 'fazendas',
      titulo: 'Propriedades / Fazendas',
      descricao: 'Matrículas, áreas (total, plantio, irrigada, pastagem, reserva), valores R$/ha de mercado e venda forçada, CAR.',
      icon: Building2,
      area: 'gestao',
      minimo: 1,
      atual: grupoStats?.fazendas ?? 0,
    },
    {
      id: 'passivos',
      titulo: 'Passivos Não-Bancários',
      descricao: 'Fornecedores, dívidas fiscais (PGFN/RFB), trabalhistas, arrendamentos, investimentos pendentes.',
      icon: AlertTriangle,
      area: 'gestao',
      minimo: 0,
      opcional: true,
      atual: grupoStats?.passivos ?? 0,
    },
    {
      id: 'garantias',
      titulo: 'Garantias',
      descricao: 'Imóveis, safras, avais, penhores, cauções. Matrícula, área, valor de mercado/forçado, contratos vinculados.',
      icon: ShieldCheck,
      area: 'gestao',
      minimo: 0,
      opcional: true,
      atual: grupoStats?.garantias ?? 0,
    },
    {
      id: 'premissas',
      titulo: 'Premissas',
      descricao: 'Taxa de custo financeiro, taxa poupança, IPCA, Selic, dólar projetado, preço de hedge.',
      icon: TrendingUp,
      area: 'gestao',
      minimo: 1,
      atual: grupoStats?.premissas ?? 0,
    },
    {
      id: 'registro-mensal',
      titulo: 'Registro Mensal',
      descricao: 'Receitas e despesas mensais por competência. Permite acompanhar evolução do fluxo de caixa.',
      icon: CalendarDays,
      navegarPara: 'registro-mensal',
      minimo: 0,
      opcional: true,
      atual: 0, // não temos count fácil
    },
  ]

  const etapaConcluida = (etapa: EtapaDiagnostico) => (etapa.opcional ? etapa.atual > 0 : etapa.atual >= etapa.minimo)
  const concluidas = etapas.filter(etapaConcluida).length
  const obrigatorias = etapas.filter((e) => !e.opcional).length
  const obrigatoriasConcluidas = etapas.filter((e) => !e.opcional && e.atual >= e.minimo).length
  const pct = Math.round((obrigatoriasConcluidas / obrigatorias) * 100)

  return (
    <div className="space-y-5">
      {/* Card de boas-vindas / status */}
      <div className="rounded-lg border border-aletis-borda bg-card p-5 shadow-none">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-aletis-borda bg-aletis-bege/45 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-soft)]">
              <Activity className="h-3 w-3 text-foreground" />
              Status do diagnóstico
            </div>
            <h3 className="text-base font-display font-semibold text-foreground">
              {pct >= 100
                ? 'Diagnóstico pronto para análise'
                : pct >= 60
                ? 'Diagnóstico em andamento'
                : 'Inicie o diagnóstico do cliente'}
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-soft)]">
              {pct >= 100
                ? 'As informações obrigatórias estão preenchidas. Gere as saídas no módulo Financeiro quando precisar.'
                : 'Siga as etapas abaixo para estruturar o diagnóstico completo. Cada informação cadastrada alimenta automaticamente os cálculos do Raio X, DRE/FCL e simulações.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 rounded-lg border border-aletis-borda bg-aletis-bege/25 p-3 text-left md:min-w-[220px]">
            <div className="relative h-16 w-16">
              <svg className="h-16 w-16 transform -rotate-90" viewBox="0 0 36 36">
                <path className="text-aletis-bege" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                <path
                  className={pct >= 100 ? 'text-emerald-500' : pct >= 60 ? 'text-amber-500' : 'text-foreground'}
                  strokeDasharray={`${pct}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{pct}%</span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Obrigatórias</p>
              <p className="text-sm font-bold text-foreground">{obrigatoriasConcluidas}/{obrigatorias} concluídas</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{concluidas}/{etapas.length} etapas no total</p>
            </div>
          </div>
        </div>

        {!grupoId && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Nenhum grupo de gestão financeira criado</p>
                <p className="text-xs text-amber-700 mt-1">
                  O diagnóstico completo exige um grupo financeiro do cliente. Você pode criá-lo automaticamente a partir dos dados do CRM ou manualmente na aba Financeiro.
                </p>
                <NoGrupoCtaInline apiId={apiId} onChanged={onReload} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Checklist de etapas */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-display font-semibold text-foreground">
              Checklist do Diagnóstico
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Etapas essenciais para montar a radiografia financeira do cliente.
            </p>
          </div>
          <button
            onClick={() => setShowChecklist((v) => !v)}
            className="h-8 self-start rounded-lg border border-aletis-borda bg-card px-3 text-[11px] font-semibold text-[var(--text-soft)] hover:bg-aletis-bege/50 sm:self-auto"
          >
            {showChecklist ? 'Recolher' : 'Expandir'}
          </button>
        </div>

        {showChecklist && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {etapas.map((etapa) => {
              const Icon = etapa.icon
              const concluida = etapaConcluida(etapa)
              const precisaGrupo = !grupoId && (etapa.area === 'gestao' || etapa.navegarPara !== 'guia')
              const destinoLabel = etapa.area === 'gestao' ? 'Financeiro' : labelAba(etapa.navegarPara ?? 'guia')
              return (
                <div
                  key={etapa.id}
                  className={`group flex h-full flex-col gap-3 rounded-lg border p-3 transition ${
                    concluida
                      ? 'border-emerald-200/70 bg-card shadow-sm'
                      : 'cursor-pointer border-aletis-borda bg-card hover:border-aletis-dourado/50 '
                  }`}
                  onClick={() => {
                    if (precisaGrupo) return
                    if (etapa.area) onNavigateArea?.(etapa.area)
                    else onNavigate(etapa.navegarPara ?? 'guia')
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                      concluida
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-aletis-borda bg-aletis-bege/35 text-[var(--text-soft)]'
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight text-foreground">{etapa.titulo}</p>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            concluida
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : etapa.opcional
                              ? 'border-slate-200 bg-slate-50 text-slate-500'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {concluida ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                          {concluida ? 'Concluído' : etapa.opcional ? 'Opcional' : 'Pendente'}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] leading-snug text-[var(--text-soft)]">{etapa.descricao}</p>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-aletis-borda/60 pt-3">
                    {etapa.minimo > 0 ? (
                      <span className="rounded-lg bg-aletis-bege/40 px-2 py-1 text-[11px] font-mono text-[var(--text-soft)]">
                        {etapa.atual} / {etapa.minimo} {etapa.atual === 1 ? 'item' : 'itens'}
                      </span>
                    ) : (
                      <span className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-mono text-slate-500">
                        apoio opcional
                      </span>
                    )}
                    {precisaGrupo ? (
                      <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                        Crie o grupo primeiro
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (etapa.area) onNavigateArea?.(etapa.area)
                          else onNavigate(etapa.navegarPara ?? 'guia')
                        }}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-aletis-verde/10 px-2.5 text-[11px] font-semibold text-foreground transition hover:bg-aletis-verde/20 hover:text-aletis-verde-escuro"
                      >
                        Ir para {destinoLabel}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Dicas rápidas */}
      <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <h4 className="mb-3 flex items-center gap-1.5 text-xs font-display font-semibold text-foreground">
          <Info className="w-3.5 h-3.5 text-aletis-dourado" />
          Dicas para acelerar o diagnóstico
        </h4>
        <ul className="space-y-1.5 text-[12px] text-[var(--text-soft)]">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aletis-verde" />
            <span>Cadastre primeiro safras, custos e endividamento; esses dados alimentam todos os indicadores.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aletis-verde" />
            <span>Quando houver arquivo histórico, use a importação no módulo Financeiro apenas como apoio de carregamento.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aletis-verde" />
            <span>As <strong>premissas</strong> definem os cenários de projeção; revise-as antes de gerar material para banco ou cliente.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aletis-verde" />
            <span>O <strong>Registro Mensal</strong> é opcional para o diagnóstico base, mas essencial para acompanhamento contínuo (BPO).</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

function NoGrupoCtaInline({ apiId, onChanged }: { apiId?: string; onChanged: () => void }) {
  const [creating, setCreating] = useState(false)
  async function autoImport() {
    if (!apiId) return
    setCreating(true)
    try {
      await apiFetch('/gestao-financeira/auto-import-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: apiId }),
      })
      await onChanged()
    } catch {
      setCreating(false)
    }
  }
  return (
    <div className="flex items-center gap-2 mt-3">
      <button
        onClick={autoImport}
        disabled={creating}
        className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-amber-700 disabled:opacity-50"
      >
        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {creating ? 'Criando…' : 'Auto-import do CRM'}
      </button>
      <span className="text-[11px] text-amber-700">Cria grupo pré-populado em 1 clique</span>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// Aba Visão Geral
// ═════════════════════════════════════════════════════════════
function VisaoGeralTab({ data, grupoId }: { data: UseClienteDataReturn; grupoId: string | null }) {
  const { cliente, srai, abs, analises } = data
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <SraiCard srai={srai} />
        <AbsCard abs={abs} />
      </div>

      {analises && ((analises.alertasTop?.length ?? 0) > 0 || (analises.recomendacoes?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AlertasFullCard alertas={analises.alertasTop ?? []} />
          <RecomendacoesFullCard recs={analises.recomendacoes ?? []} />
        </div>
      )}

      <ExposicaoCard exposicao={cliente?.exposicaoCommodity ?? []} apiId={data.apiId} onChanged={data.reload} />

      {!grupoId && (
        <NoGrupoCta apiId={data.apiId} onChanged={data.reload} />
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// Aba Raio X
// ═════════════════════════════════════════════════════════════
function RaioXTab({ grupoId }: { grupoId: string | null }) {
  if (!grupoId) {
    return (
      <EmptyStateGrupo
        titulo="Raio X 360°"
        desc="Para visualizar KPIs detalhados, projeções de fluxo de caixa e cenários de stress test, é necessário criar um grupo de gestão financeira."
      />
    )
  }
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard360 grupoId={grupoId} />
    </Suspense>
  )
}

// ═════════════════════════════════════════════════════════════
// Aba Operação
// ═════════════════════════════════════════════════════════════
function OperacaoTab({ clienteId, clienteNome }: { clienteId?: string; clienteNome?: string }) {
  const [sp] = useSearchParams()
  const opTab = sp.get('opTab') ?? 'cadastro'
  if (!clienteId) {
    return (
      <div className="rounded-lg border border-aletis-borda bg-card p-8 text-center shadow-none">
        <p className="text-xs text-muted-foreground">Cliente não identificado.</p>
      </div>
    )
  }
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <GestaoFinanceiraTab
        clienteId={clienteId}
        clienteNome={clienteNome}
        compact
        initialSubTab={opTab as any}
        hideSubTabs={['dashboard', 'workflow', 'benchmark', 'comentarios', 'changelog', 'insights']}
      />
    </Suspense>
  )
}

// ═════════════════════════════════════════════════════════════
// Aba Registro Mensal
// ═════════════════════════════════════════════════════════════
function CustosTab({ grupoId }: { grupoId: string | null }) {
  if (!grupoId) {
    return (
      <EmptyStateGrupo
        titulo="Custos do Cliente (R.OP.010)"
        desc="Cadastre insumos, custos operacionais, fixos, frete e colheita por cultura. Crie um grupo de gestão financeira primeiro."
      />
    )
  }
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <CustosClienteSection grupoId={grupoId} />
    </Suspense>
  )
}

function ProducaoTab({ grupoId }: { grupoId: string | null }) {
  if (!grupoId) {
    return (
      <EmptyStateGrupo
        titulo="Quadro de Produção (R.OP.011)"
        desc="Registre áreas, rendimentos, preços e calcule a margem bruta por cultura/safra. Crie um grupo de gestão financeira primeiro."
      />
    )
  }
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <QuadroProducaoSection grupoId={grupoId} />
    </Suspense>
  )
}

function RegistroMensalTab({ grupoId }: { grupoId: string | null }) {
  if (!grupoId) {
    return (
      <EmptyStateGrupo
        titulo="Registro Mensal (R.OP.007 / R.OP.008)"
        desc="Lançe receitas e despesas mensais para acompanhar o fluxo de caixa do cliente ao longo do tempo. Crie um grupo de gestão financeira primeiro."
      />
    )
  }
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <RegistroMensalSection grupoId={grupoId} />
    </Suspense>
  )
}

// ═════════════════════════════════════════════════════════════
// Aba Relatórios
// ═════════════════════════════════════════════════════════════
function RelatoriosTab({
  grupoId,
  clienteNome,
  exporting,
  setExporting,
}: {
  grupoId: string | null
  clienteNome?: string
  exporting: string | null
  setExporting: (v: string | null) => void
}) {
  async function exportKitBanco() {
    if (!grupoId) return
    setExporting('pdf')
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/kit-banco-pdf`
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      downloadBlob(blob, resp.headers.get('Content-Disposition'), `KitBanco_${clienteNome}.pdf`)
    } finally { setExporting(null) }
  }

  async function exportPptx() {
    if (!grupoId) return
    setExporting('pptx')
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/diagnostico-pptx`
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      downloadBlob(blob, resp.headers.get('Content-Disposition'), `Diagnostico_${clienteNome}.pptx`)
    } finally { setExporting(null) }
  }

  async function exportXlsm() {
    if (!grupoId) return
    setExporting('xlsm')
    try {
      const url = `/api/gestao-financeira/grupos/${encodeURIComponent(grupoId)}/export-xlsm`
      const resp = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versao: 'v2' }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      downloadBlob(blob, resp.headers.get('Content-Disposition'), `R.OP.001_${clienteNome}.xlsm`)
    } finally { setExporting(null) }
  }

  return (
    <div className="space-y-4">
      {!grupoId && (
        <EmptyStateGrupo
          titulo="Relatórios de Diagnóstico"
          desc="Gere Kit Banco PDF, PPT de diagnóstico, planilha XLSM preenchida ou narrativa ALIX. É necessário um grupo de gestão financeira com dados preenchidos."
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <RelatorioCard
          label="Kit Banco PDF"
          desc="PDF profissional (13 seções) para apresentar à instituição financeira"
          icon={FileText}
          onClick={exportKitBanco}
          disabled={!grupoId || !!exporting}
          loading={exporting === 'pdf'}
          tone="primary"
        />
        <RelatorioCard
          label="PPT Diagnóstico"
          desc="Apresentação .pptx com 13 slides e gráficos nativos"
          icon={Presentation}
          onClick={exportPptx}
          disabled={!grupoId || !!exporting}
          loading={exporting === 'pptx'}
          tone="secondary"
        />
        <RelatorioCard
          label="Exportar .xlsm"
          desc="Exportação Excel com os dados financeiros do cliente"
          icon={Download}
          onClick={exportXlsm}
          disabled={!grupoId || !!exporting}
          loading={exporting === 'xlsm'}
          tone="default"
        />
        <RelatorioCard
          label="Narrativa ALIX"
          desc="Análise textual gerada por IA baseada nos dados"
          icon={Bot}
          onClick={() => alert('Use a QuickActionsBar para gerar narrativa ALIX')}
          disabled={!grupoId}
          tone="ai"
        />
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════
// Componentes utilitários
// ═════════════════════════════════════════════════════════════

function labelAba(tab: DiagTab) {
  const map: Record<string, string> = {
    guia: 'Guia do Consultor',
    visao: 'Visão Geral',
    raiox: 'Raio X 360°',
    custos: 'Custos',
    producao: 'Produção',
    operacao: 'Operação',
    'registro-mensal': 'Registro Mensal',
    relatorios: 'Relatórios',
  }
  return map[tab] ?? tab
}

function labelSubTab(opTab: string) {
  const map: Record<string, string> = {
    cadastro: 'Cadastro',
    safras: 'Safras',
    custos: 'Custos',
    endividamento: 'Endividamento',
    fazendas: 'Propriedades',
    passivos: 'Passivos',
    garantias: 'Garantias',
    premissas: 'Premissas',
    demandas: 'Demandas',
    dashboard: 'Dashboard',
    workflow: 'Pipeline',
    benchmark: 'Benchmark',
    comentarios: 'Pareceres',
    changelog: 'Auditoria',
    insights: 'Alertas',
  }
  return map[opTab] ?? opTab
}

function EmptyStateGrupo({ titulo, desc }: { titulo: string; desc: string }) {
  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-8 text-center shadow-none">
      <UploadCloud className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
      <h3 className="text-base font-display font-semibold text-foreground">{titulo}</h3>
      <p className="text-xs text-[var(--text-soft)] mt-1 max-w-md mx-auto">{desc}</p>
      <p className="text-[11px] text-muted-foreground mt-3">
        Vá para a aba <strong>Guia do Consultor</strong> para criar o grupo automaticamente.
      </p>
    </div>
  )
}

function RelatorioCard({
  label, desc, icon: Icon, onClick, disabled, loading, tone,
}: {
  label: string; desc: string; icon: typeof FileText; onClick: () => void; disabled?: boolean; loading?: boolean; tone: 'primary' | 'secondary' | 'default' | 'ai'
}) {
  const btnCls =
    tone === 'primary'
      ? 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro'
    : tone === 'secondary'
      ? 'bg-aletis-dourado text-[#080d09] hover:bg-[#f0d9a8]'
    : tone === 'ai'
      ? 'bg-aletis-grafite-escuro text-white hover:bg-aletis-grafite-medio'
      : 'bg-card border border-aletis-borda text-foreground hover:bg-aletis-bege/40'
  return (
    <div className="flex h-full flex-col rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-start gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl border border-aletis-borda bg-aletis-bege/50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-[var(--text-soft)]" />
        </div>
        <div>
          <h3 className="text-sm font-display font-semibold text-foreground">{label}</h3>
          <p className="text-[11px] text-muted-foreground leading-snug">{desc}</p>
        </div>
      </div>
      <div className="mt-auto pt-3">
        <button
          onClick={onClick}
          disabled={disabled}
          className={`w-full px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition disabled:opacity-50 ${btnCls}`}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {loading ? 'Gerando…' : 'Gerar'}
        </button>
      </div>
    </div>
  )
}

function downloadBlob(blob: Blob, contentDisposition: string | null, fallback: string) {
  const dl = document.createElement('a')
  dl.href = URL.createObjectURL(blob)
  const m = (contentDisposition ?? '').match(/filename="?([^"]+)"?/)
  dl.download = m?.[1] ?? fallback
  dl.click()
  setTimeout(() => URL.revokeObjectURL(dl.href), 30_000)
}

// ═════════════════════════════════════════════════════════════
// Componentes legados (mantidos intactos)
// ═════════════════════════════════════════════════════════════
function SraiCard({ srai }: { srai: UseClienteDataReturn['srai'] }) {
  if (!srai) {
    return (
      <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-display font-semibold text-foreground">SRAI — Score de Risco Agro Integral</h3>
        </div>
        <p className="text-xs text-muted-foreground italic">Aguardando cálculo…</p>
      </div>
    )
  }
  const toneCls = {
    critico: { border: 'border-l-red-500', icon: 'text-red-600', pill: 'bg-red-100 text-red-800' },
    alto: { border: 'border-l-amber-500', icon: 'text-amber-600', pill: 'bg-amber-100 text-amber-800' },
    moderado: { border: 'border-l-blue-500', icon: 'text-blue-600', pill: 'bg-blue-100 text-blue-800' },
    baixo: { border: 'border-l-emerald-500', icon: 'text-emerald-600', pill: 'bg-emerald-100 text-emerald-800' },
  }[srai.classificacao] ?? { border: 'border-l-emerald-500', icon: 'text-emerald-600', pill: 'bg-emerald-100 text-emerald-800' }
  return (
    <div className={`rounded-lg border border-aletis-borda bg-card p-4 shadow-none border-l-4 ${toneCls.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <Target className={`w-4 h-4 ${toneCls.icon}`} />
        <h3 className="text-sm font-display font-semibold text-foreground">SRAI</h3>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${toneCls.pill}`}>
          {srai.classificacao}
        </span>
      </div>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-3xl font-display font-semibold tabular-nums">{srai.scoreTotal}</span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Componente label="Financeiro" value={srai.componentes.financeiro} />
        <Componente label="Operacional" value={srai.componentes.operacional} />
        <Componente label="Climático" value={srai.componentes.climatico} />
        <Componente label="Relacionamento" value={srai.componentes.relacionamento} />
      </div>
      {srai.alertas && srai.alertas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--text-soft)]">{srai.alertas.length} alerta(s)</summary>
          <ul className="mt-2 space-y-1 text-[var(--text-soft)]">
            {srai.alertas.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aletis-grafite-claro/40" />
                <span className="leading-snug">{a}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Componente({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="font-bold tabular-nums">{value}</span>
      </div>
      <div className="h-1 bg-aletis-grafite-claro/15 rounded-full overflow-hidden mt-0.5">
        <div className="h-full bg-aletis-verde transition-all" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  )
}

function AbsCard({ abs }: { abs: UseClienteDataReturn['abs'] }) {
  if (!abs) {
    return (
      <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-display font-semibold text-foreground">AB+S — Agricultura Sustentável</h3>
        </div>
        <p className="text-xs text-muted-foreground italic">Aguardando avaliação de elegibilidade…</p>
      </div>
    )
  }
  const toneCls = {
    inelegivel: { border: 'border-l-red-500', icon: 'text-red-600', pill: 'bg-red-100 text-red-800' },
    integral: { border: 'border-l-emerald-500', icon: 'text-emerald-600', pill: 'bg-emerald-100 text-emerald-800' },
    parcial: { border: 'border-l-amber-500', icon: 'text-amber-600', pill: 'bg-amber-100 text-amber-800' },
    condicional: { border: 'border-l-blue-500', icon: 'text-blue-600', pill: 'bg-blue-100 text-blue-800' },
  }[abs.nivelElegibilidade] ?? { border: 'border-l-blue-500', icon: 'text-blue-600', pill: 'bg-blue-100 text-blue-800' }
  return (
    <div className={`rounded-lg border border-aletis-borda bg-card p-4 shadow-none border-l-4 ${toneCls.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className={`w-4 h-4 ${toneCls.icon}`} />
        <h3 className="text-sm font-display font-semibold text-foreground">AB+S elegibilidade</h3>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${toneCls.pill}`}>
          {abs.nivelElegibilidade}
        </span>
      </div>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-3xl font-display font-semibold tabular-nums">{abs.scorePercentual}%</span>
        <span className="text-xs text-muted-foreground">de aderência</span>
      </div>
      <div className="rounded-lg bg-aletis-bege/30 px-2 py-1.5 mb-2">
        <p className="text-[11px] uppercase font-mono text-muted-foreground">Taxa estimada</p>
        <p className="text-xs font-bold tabular-nums">{abs.taxasEstimadasPct.min}% – {abs.taxasEstimadasPct.max}% a.a.</p>
      </div>
      {abs.acoesRecomendadas && abs.acoesRecomendadas.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--text-soft)]">{abs.acoesRecomendadas.length} ação(ões) recomendada(s)</summary>
          <ul className="mt-2 space-y-1 text-[var(--text-soft)]">
            {abs.acoesRecomendadas.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aletis-grafite-claro/40" />
                <span className="leading-snug">{a}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function AlertasFullCard({ alertas }: { alertas: NonNullable<UseClienteDataReturn['analises']>['alertasTop'] }) {
  if (!alertas || alertas.length === 0) return null
  const grouped = alertas.reduce<Record<string, typeof alertas>>((acc, a) => {
    (acc[a.nivel] ??= [] as any).push(a)
    return acc
  }, {})
  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <h3 className="text-sm font-display font-semibold text-foreground">Alertas detalhados</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">{alertas.length} alerta(s)</span>
      </div>
      <div className="space-y-2">
        {(['critico', 'alto', 'moderado', 'info'] as const).map((nivel) => {
          const list = grouped[nivel]
          if (!list?.length) return null
          const cls =
            nivel === 'critico' ? 'bg-red-50/50 border-red-200 text-red-900' :
            nivel === 'alto' ? 'bg-amber-50/50 border-amber-200 text-amber-900' :
            nivel === 'moderado' ? 'bg-blue-50/50 border-blue-200 text-blue-900' :
            'bg-aletis-bege/40 border-aletis-borda text-[var(--text-soft)]'
          return (
            <div key={nivel} className={`rounded-lg border ${cls} p-2`}>
              <p className="text-[11px] font-mono uppercase tracking-wider font-bold mb-1">{nivel} ({list.length})</p>
              <ul className="space-y-1 text-xs">
                {list.map((a, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="text-[11px] font-mono opacity-70 flex-shrink-0">[{a.origem}]</span>
                    <span className="leading-snug">{a.mensagem}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RecomendacoesFullCard({ recs }: { recs: NonNullable<UseClienteDataReturn['analises']>['recomendacoes'] }) {
  if (!recs || recs.length === 0) return null
  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-aletis-dourado" />
        <h3 className="text-sm font-display font-semibold text-foreground">Recomendações priorizadas</h3>
        <span className="text-[11px] text-muted-foreground ml-auto">{recs.length} ações</span>
      </div>
      <ul className="space-y-2">
        {recs.map((r) => (
          <li key={r.id} className="rounded-lg bg-aletis-bege/30 p-2">
            <div className="flex items-baseline gap-2">
              <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider flex-shrink-0 ${
                r.prioridade === 'p1' ? 'bg-red-100 text-red-700' :
                r.prioridade === 'p2' ? 'bg-amber-100 text-amber-800' :
                'bg-blue-100 text-blue-800'
              }`}>{r.prioridade}</span>
              <p className="text-xs font-body font-semibold flex-1">{r.titulo}</p>
              <span className="text-[11px] text-aletis-grafite-claro/60 uppercase font-mono flex-shrink-0">{r.categoria}</span>
            </div>
            <p className="text-[11px] text-[var(--text-soft)] mt-1 leading-snug">{r.acao}</p>
            {r.impactoEstimado && <p className="text-[11px] text-foreground mt-0.5 font-mono">→ {r.impactoEstimado}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ExposicaoCard({ exposicao, apiId, onChanged }: { exposicao: any[]; apiId?: string; onChanged: () => Promise<void> }) {
  const [list, setList] = useState(exposicao)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setList(exposicao) }, [exposicao])

  function patch(idx: number, key: string, value: any) {
    setList((l) => l.map((it, i) => (i === idx ? { ...it, [key]: value } : it)))
  }

  async function salvar() {
    if (!apiId) return
    setSaving(true)
    try {
      await apiFetch(`/clientes/${apiId}/exposicao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exposicao: list }),
      })
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  function adicionar() {
    setList((l) => [...l, {
      commodity: 'Soja', areaHa: 0, produtividade: 0, unidadeProdutividade: 'sc/ha',
      precoReferencia: 0, unidadePreco: 'R$/sc', pctReceita: 0,
    }])
  }

  function remover(idx: number) {
    setList((l) => l.filter((_, i) => i !== idx))
  }

  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TrendingUp className="w-4 h-4 text-aletis-dourado" />
        <h3 className="text-sm font-display font-semibold text-foreground">Exposição por commodity</h3>
        <button onClick={adicionar} className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg bg-aletis-verde/10 px-2.5 text-[11px] font-semibold text-foreground hover:bg-aletis-verde/20">
          <Plus className="w-3 h-3" /> linha
        </button>
        <button onClick={salvar} disabled={saving} className="inline-flex h-7 items-center gap-1 rounded-lg bg-aletis-verde px-2.5 text-[11px] font-semibold text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          salvar
        </button>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground italic text-center py-4">Sem exposição cadastrada. Clique em "+ linha".</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="ui-table w-full text-xs">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-aletis-borda">
                <th className="text-left py-1.5">Commodity</th>
                <th className="text-right py-1.5">Área (ha)</th>
                <th className="text-right py-1.5">Produtiv.</th>
                <th className="text-right py-1.5">Preço ref.</th>
                <th className="text-right py-1.5">% receita</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((it, i) => (
                <tr key={i} className="border-b border-aletis-borda/50">
                  <td><input value={it.commodity} onChange={(e) => patch(i, 'commodity', e.target.value)} className="w-32 px-1 py-0.5 text-xs rounded border border-aletis-borda" /></td>
                  <td className="text-right"><input type="number" value={it.areaHa} onChange={(e) => patch(i, 'areaHa', Number(e.target.value))} className="w-20 px-1 py-0.5 text-xs rounded border border-aletis-borda text-right" /></td>
                  <td className="text-right"><input type="number" value={it.produtividade} onChange={(e) => patch(i, 'produtividade', Number(e.target.value))} className="w-20 px-1 py-0.5 text-xs rounded border border-aletis-borda text-right" /></td>
                  <td className="text-right"><input type="number" value={it.precoReferencia} onChange={(e) => patch(i, 'precoReferencia', Number(e.target.value))} className="w-24 px-1 py-0.5 text-xs rounded border border-aletis-borda text-right" /></td>
                  <td className="text-right"><input type="number" step="0.01" value={it.pctReceita ?? 0} onChange={(e) => patch(i, 'pctReceita', Number(e.target.value))} className="w-16 px-1 py-0.5 text-xs rounded border border-aletis-borda text-right" /></td>
                  <td><button onClick={() => remover(i)} className="text-muted-foreground hover:text-red-600"><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NoGrupoCta({ apiId, onChanged }: { apiId?: string; onChanged: () => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  async function autoImport() {
    if (!apiId) return
    setCreating(true)
    try {
      await apiFetch('/gestao-financeira/auto-import-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: apiId }),
      })
      await onChanged()
      window.location.reload()
    } catch {
      setCreating(false)
    }
  }
  return (
    <div className="rounded-lg border border-aletis-borda bg-card p-8 text-center shadow-none">
      <Sparkles className="w-8 h-8 text-foreground mx-auto mb-3" />
      <h3 className="text-base font-display font-semibold text-foreground">
        Dashboard 360° aguarda dados
      </h3>
      <p className="text-xs text-[var(--text-soft)] mt-1 max-w-md mx-auto">
        Para ver KPIs detalhados, charts de safra/endividamento, projeção 10 anos e DRE multi-cenário,
        crie um grupo de gestão financeira pré-populado a partir do CRM.
      </p>
      <button
        onClick={autoImport}
        disabled={creating}
        className="mt-4 px-4 py-2 rounded-lg bg-aletis-verde text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-aletis-verde-escuro disabled:opacity-50"
      >
        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Auto-import (1 clique)
      </button>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    </div>
  )
}
