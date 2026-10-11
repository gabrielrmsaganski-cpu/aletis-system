import { SectionNav } from '../components/ui/SectionNav'
/**
 * Dashboard ALETIS - central operacional baseada apenas em dados da API.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Database,
  FileCheck2,
  FileText,
  Handshake,
  Landmark,
  LineChart,
  Loader2,
  RefreshCw,
  UserPlus,
  Users,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../hooks/useApi'

type ClienteApi = {
  id: string
  nome: string
  cidade?: string
  uf?: string
  estagio?: string
  credor?: string
  valorTotalDivida?: number
  valorDivida?: number
  valorReestruturado?: number
  economiaEstimada?: number
  saudeFinanceira?: number
  proximaAcao?: { data?: string; descricao?: string }
  ultimaAtualizacao?: string
  scoreOperacional?: number
  prioridade?: 'critica' | 'alta' | 'media' | 'normal'
  motivosPrioridade?: string[]
  resumoFinanceiro?: ResumoFinanceiro
}

type ResumoFinanceiro = {
  classificacao: 'divida_documentada' | 'demanda_capital' | 'estrategia_financeira' | 'status_contratual' | 'em_levantamento'
  rotulo: string
  contexto: string
  descricao?: string
  valorFaixa?: string
}

type ClienteView = {
  id: string
  nome: string
  cidade: string
  uf: string
  estagio: string
  credor: string
  divida: number
  saude: number | null
  proximaAcao?: { data?: string; descricao?: string }
  ultimaAtualizacao?: string
  scoreOperacional: number | null
  prioridade: ClienteApi['prioridade']
  motivosPrioridade: string[]
  resumoFinanceiro: ResumoFinanceiro
}

type PropostaResumo = {
  id: string
  clienteId?: string
  clienteNome?: string
  titulo?: string
  credor?: string
  status?: string
  valorProposta?: number
  valorDivida?: number
  dataValidade?: string
}

type FinDashboardData = {
  mesAtual?: string
  dreAtual: {
    receitaBruta: number
    totalDespesas: number
    resultadoLiquido: number
    margemLiquida: number
  }
  contasReceber?: { total: number; atrasadas: number }
  contasPagar: { total: number; atrasadas: number }
  alertas: Array<{
    severidade: 'info' | 'atencao' | 'critico'
    titulo: string
    detalhe: string
    link?: string
  }>
}

type EmpresaFin = {
  id: string
  razaoSocial: string
  nomeFantasia?: string
}

type MarketBrief = {
  geradoEm: string
  fonteOrigem: 'api' | 'cache' | 'mixed'
  narrativaCurta: string
  macro: {
    selic: number | null
    dolar: number | null
    ipca12m: number | null
  }
  topAltas: Array<{ nome: string; variacao7d: number; preco: number; unidade: string }>
  topBaixas: Array<{ nome: string; variacao7d: number; preco: number; unidade: string }>
  alertas: Array<{ severidade: 'info' | 'atencao' | 'critico'; titulo: string; detalhe: string }>
}

type AlixCommandCenter = {
  geradoEm: string
  headline: string
  resumo: string
  kpis: {
    clientesAtivos: number
    propostasAbertas: number
    propostasVencendo: number
    acoesHoje: number
    acoesAtrasadas: number
    semProximaAcao: number
    documentosParaRevisar: number
    confirmacoesPendentes: number
    insightsCriticos: number
    insightsImportantes: number
  }
  tarefasHoje: string[]
  prioridades: Array<{
    id: string
    tipo?: string
    titulo: string
    detalhe: string
    tone: 'info' | 'atencao' | 'critico' | 'ok'
    to?: string
  }>
}

type DecisionItem = {
  id: string
  type?: string
  title: string
  detail: string
  tone: 'info' | 'atencao' | 'critico' | 'ok'
  to: string
}

type SourceState = {
  label: string
  loading: boolean
  error: string | null
  detail: string
}

const STAGE_LABEL: Record<string, string> = {
  lead: 'Lead',
  prospeccao: 'Prospecção',
  qualificacao: 'Qualificação',
  analise: 'Análise',
  diagnostico_em_analise: 'Diagnóstico',
  coleta_documentos: 'Coleta documental',
  proposta: 'Proposta',
  proposta_enviada: 'Proposta enviada',
  negociacao: 'Negociação',
  acordo: 'Acordo',
  acompanhamento: 'Acompanhamento',
  concluido: 'Concluído',
  encerrado: 'Encerrado',
}

const ACTIVE_STAGES = new Set([
  'lead',
  'prospeccao',
  'qualificacao',
  'analise',
  'diagnostico_em_analise',
  'coleta_documentos',
  'proposta',
  'proposta_enviada',
  'negociacao',
  'acordo',
  'acompanhamento',
])

const SENSITIVE_STAGES = new Set(['proposta', 'proposta_enviada', 'negociacao', 'acordo'])

function toClienteView(cliente: ClienteApi): ClienteView {
  const saude = Number(cliente.saudeFinanceira)
  const score = Number(cliente.scoreOperacional)
  return {
    id: cliente.id,
    nome: cliente.nome,
    cidade: cliente.cidade || 'Cidade não informada',
    uf: cliente.uf || '',
    estagio: cliente.estagio || 'lead',
    credor: cliente.credor || 'Credor a definir',
    divida: Number(cliente.valorTotalDivida ?? cliente.valorDivida ?? 0),
    saude: cliente.saudeFinanceira != null && Number.isFinite(saude) ? saude : null,
    proximaAcao: cliente.proximaAcao,
    ultimaAtualizacao: cliente.ultimaAtualizacao,
    scoreOperacional: cliente.scoreOperacional != null && Number.isFinite(score) ? score : null,
    prioridade: cliente.prioridade,
    motivosPrioridade: cliente.motivosPrioridade || [],
    resumoFinanceiro: cliente.resumoFinanceiro ?? fallbackResumoFinanceiro(cliente),
  }
}

function fmtBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

function fmtCompact(value: number): string {
  const n = Number(value) || 0
  if (Math.abs(n) >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1).replace('.', ',')} bi`
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace('.', ',')} mi`
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(0).replace('.', ',')} mil`
  return fmtBRL(n)
}

function hasDefinedCredor(credor?: string): boolean {
  const normalized = String(credor || '').trim().toLowerCase()
  return Boolean(normalized) && !['a definir', 'credor a definir', 'não informado', 'nao informado'].includes(normalized)
}

function fallbackResumoFinanceiro(cliente: ClienteApi): ResumoFinanceiro {
  if (Number(cliente.valorTotalDivida ?? cliente.valorDivida) > 0) {
    return {
      classificacao: 'divida_documentada',
      rotulo: 'Dívida documentada',
      contexto: hasDefinedCredor(cliente.credor) ? cliente.credor! : 'Credor em conferência documental',
    }
  }
  return {
    classificacao: 'em_levantamento',
    rotulo: 'Posição financeira',
    contexto: hasDefinedCredor(cliente.credor) ? cliente.credor! : 'Em levantamento documental',
  }
}

function parseCurrencyText(value: string): number | null {
  const raw = value.trim().replace(/R\$\s*/gi, '').replace(/\s/g, '')
  if (!raw) return null
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatFaixaCapital(value?: string): string | null {
  if (!value) return null
  const valores = value.split(/\s+(?:a|até)\s+/i).map(parseCurrencyText).filter((item): item is number => item != null)
  if (!valores.length) return null
  if (valores.length === 1) return fmtCompact(valores[0])
  return `${fmtCompact(valores[0])}–${fmtCompact(valores[1])}`
}

function financialValue(cliente: ClienteView): string {
  const resumo = cliente.resumoFinanceiro
  if (resumo.classificacao === 'demanda_capital') {
    return formatFaixaCapital(resumo.valorFaixa) || 'Capital em estruturação'
  }
  if (resumo.classificacao === 'divida_documentada') return fmtCompact(cliente.divida)
  if (resumo.classificacao === 'status_contratual') return resumo.contexto
  if (resumo.classificacao === 'estrategia_financeira') return 'Em estruturação'
  return 'Em levantamento'
}

function fmtPct(value: number): string {
  return `${Number(value || 0).toFixed(1).replace('.', ',')}%`
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000)
}

function dateTimeLabel(iso?: string): string {
  if (!iso) return 'horário não informado'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'horário não informado'
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date())
}

function statusLabel(value?: string): string {
  if (!value) return 'A definir'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function sourceLabel(value?: MarketBrief['fonteOrigem']): string {
  if (value === 'api') return 'coleta via API · confira as datas de referência'
  if (value === 'mixed') return 'fontes com disponibilidade parcial'
  if (value === 'cache') return 'últimas observações disponíveis'
  return 'fonte não informada'
}

export default function Dashboard() {
  const [viewParams, setViewParams] = useSearchParams()
  const overviewView = ['carteira', 'contexto'].includes(viewParams.get('visao') || '') ? viewParams.get('visao')! : 'prioridades'
  const setOverviewView = (id: string) => setViewParams(current => { const next = new URLSearchParams(current); next.set('visao', id); return next }, { replace: true })

  const { user } = useAuth()
  const [empresaId, setEmpresaId] = useState('')
  const [decisionFilter, setDecisionFilter] = useState<'todas' | 'clientes' | 'propostas'>('todas')

  const healthApi = useApi<{ status: string }>('/health', { status: 'unknown' })
  const clientesApi = useApi<ClienteApi[]>('/clientes', [])
  const propostasApi = useApi<PropostaResumo[]>('/propostas?full=1', [])
  const empresasApi = useApi<EmpresaFin[]>('/financeiro/empresas', [])
  const financeiroApi = useApi<FinDashboardData | null>(
    empresaId ? `/financeiro/dashboard?empresaId=${encodeURIComponent(empresaId)}` : '/financeiro/dashboard',
    null,
  )
  const mercadoApi = useApi<MarketBrief | null>('/mercado/brief', null)
  const alixApi = useApi<AlixCommandCenter | null>('/alix/command-center?includeMarket=false', null)

  const clientes = useMemo(
    () => (clientesApi.data || []).map(toClienteView),
    [clientesApi.data],
  )

  const metrics = useMemo(() => {
    const clientesAtivos = clientes.filter((cliente) => ACTIVE_STAGES.has(cliente.estagio)).length
    const totalDivida = clientes.reduce((total, cliente) => total + cliente.divida, 0)
    return { clientesAtivos, totalDivida }
  }, [clientes])

  const pipeline = useMemo(() => {
    const counts = new Map<string, number>()
    clientes.forEach((cliente) => counts.set(cliente.estagio, (counts.get(cliente.estagio) || 0) + 1))
    return Array.from(counts.entries())
      .map(([stage, count]) => ({
        stage,
        count,
        pct: clientes.length ? (count / clientes.length) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [clientes])

  const clientesAtencao = useMemo(() => {
    const priorityRank = { critica: 4, alta: 3, media: 2, normal: 1 }
    return [...clientes]
      .sort((a, b) => {
        const priorityDiff = (priorityRank[b.prioridade || 'normal'] || 0) - (priorityRank[a.prioridade || 'normal'] || 0)
        const scoreDiff = (b.scoreOperacional ?? -1) - (a.scoreOperacional ?? -1)
        const aDeadline = daysUntil(a.proximaAcao?.data) ?? 9_999
        const bDeadline = daysUntil(b.proximaAcao?.data) ?? 9_999
        return priorityDiff || scoreDiff || aDeadline - bDeadline
      })
      .slice(0, 5)
  }, [clientes])

  const propostasAbertas = useMemo(
    () => (propostasApi.data || []).filter(
      (proposta) => !['aceita', 'rejeitada', 'expirada', 'concluida', 'concluída'].includes(
        String(proposta.status || '').toLowerCase(),
      ),
    ),
    [propostasApi.data],
  )

  const propostasVencidas = useMemo(
    () => propostasAbertas.filter((proposta) => {
      const prazo = daysUntil(proposta.dataValidade)
      return prazo != null && prazo < 0
    }),
    [propostasAbertas],
  )

  const localDecisions = useMemo<DecisionItem[]>(() => {
    const items: DecisionItem[] = []
    for (const cliente of clientes) {
      const prazo = daysUntil(cliente.proximaAcao?.data)
      if (prazo != null && prazo < 0) {
        items.push({
          id: `atrasada-${cliente.id}`,
          title: `${cliente.nome} · ação atrasada`,
          detail: `${Math.abs(prazo)} dia(s) em atraso · ${cliente.proximaAcao?.descricao || 'Ação sem descrição'}`,
          tone: prazo <= -3 ? 'critico' : 'atencao',
          to: `/clientes/${cliente.id}`,
        })
      } else if (prazo === 0) {
        items.push({
          id: `hoje-${cliente.id}`,
          title: `${cliente.nome} · ação hoje`,
          detail: cliente.proximaAcao?.descricao || 'Próxima ação do dia',
          tone: 'atencao',
          to: `/clientes/${cliente.id}`,
        })
      } else if (!cliente.proximaAcao && SENSITIVE_STAGES.has(cliente.estagio)) {
        items.push({
          id: `sem-acao-${cliente.id}`,
          title: `${cliente.nome} · sem próximo passo`,
          detail: `${STAGE_LABEL[cliente.estagio] || statusLabel(cliente.estagio)} · ${cliente.resumoFinanceiro.rotulo}: ${financialValue(cliente)}`,
          tone: 'atencao',
          to: `/clientes/${cliente.id}`,
        })
      }
    }
    return items
  }, [clientes])

  const decisionItems = useMemo<DecisionItem[]>(() => {
    const proposalDecisions: DecisionItem[] = propostasVencidas.map((proposta) => {
      const prazo = daysUntil(proposta.dataValidade) || 0
      return {
        id: `proposta-vencida-${proposta.id}`,
        title: `${proposta.clienteNome || 'Cliente a confirmar'} · proposta vencida`,
        detail: `${Math.abs(prazo)} dia(s) vencida · ${proposta.credor || 'credor a confirmar'} · ${fmtCompact(Number(proposta.valorProposta || proposta.valorDivida || 0))}`,
        tone: 'critico',
        to: `/propostas?proposta=${encodeURIComponent(proposta.id)}`,
      }
    })
    if (!alixApi.error && alixApi.data) {
      const alixDecisions = alixApi.data.prioridades.map((item) => ({
        id: item.id,
        type: item.tipo,
        title: item.titulo,
        detail: item.detalhe,
        tone: item.tone,
        to: item.to || '/ia',
      }))
      return [...proposalDecisions, ...alixDecisions]
    }
    return [...proposalDecisions, ...localDecisions]
  }, [alixApi.data, alixApi.error, localDecisions, propostasVencidas])
  const visibleDecisions = decisionItems.filter(item => {
    if (decisionFilter === 'todas') return true
    const isProposal = item.type?.startsWith('proposta') || item.to.startsWith('/propostas') || item.id.includes('proposta')
    return decisionFilter === 'propostas' ? isProposal : item.to.startsWith('/clientes') && !isProposal
  })
  const decisionsUnavailable = Boolean(alixApi.error && (clientesApi.error || propostasApi.error))

  const sources = useMemo<SourceState[]>(() => [
    {
      label: 'CRM',
      loading: clientesApi.loading,
      error: clientesApi.error,
      detail: `${clientes.length} registro(s)`,
    },
    {
      label: 'Propostas',
      loading: propostasApi.loading,
      error: propostasApi.error,
      detail: `${propostasApi.data.length} registro(s)`,
    },
    {
      label: 'ALIX',
      loading: alixApi.loading,
      error: alixApi.error,
      detail: alixApi.data ? dateTimeLabel(alixApi.data.geradoEm) : 'aguardando',
    },
    {
      label: 'Mercado',
      loading: mercadoApi.loading,
      error: mercadoApi.error,
      detail: mercadoApi.data ? dateTimeLabel(mercadoApi.data.geradoEm) : 'aguardando',
    },
    {
      label: 'Financeiro',
      loading: financeiroApi.loading,
      error: financeiroApi.error,
      detail: financeiroApi.data?.mesAtual || 'competência atual',
    },
  ], [
    clientes.length,
    clientesApi.error,
    clientesApi.loading,
    propostasApi.data.length,
    propostasApi.error,
    propostasApi.loading,
    alixApi.data,
    alixApi.error,
    alixApi.loading,
    mercadoApi.data,
    mercadoApi.error,
    mercadoApi.loading,
    financeiroApi.data,
    financeiroApi.error,
    financeiroApi.loading,
  ])

  const loading = sources.some((source) => source.loading)
  const activeSources = sources.filter((source) => !source.loading && !source.error).length
  const allSourcesActive = activeSources === sources.length && healthApi.data.status === 'ok'
  const taskCount = alixApi.data
    ? alixApi.data.kpis.acoesAtrasadas + alixApi.data.kpis.acoesHoje + alixApi.data.kpis.semProximaAcao
    : localDecisions.length
  const financeiroTemMovimento = Boolean(
    financeiroApi.data && (
      financeiroApi.data.dreAtual.receitaBruta ||
      financeiroApi.data.dreAtual.totalDespesas ||
      financeiroApi.data.contasPagar.total ||
      financeiroApi.data.contasReceber?.total
    ),
  )

  const refreshAll = () => {
    healthApi.refetch()
    clientesApi.refetch()
    propostasApi.refetch()
    empresasApi.refetch()
    financeiroApi.refetch()
    mercadoApi.refetch()
    alixApi.refetch()
  }

  return (
    <div className="dashboard-grid pb-8 text-[var(--text-strong)]">
      <section className="dashboard-intro" aria-labelledby="dashboard-title">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
              <span className="capitalize">{todayLabel()}</span>
              <span aria-hidden="true">·</span>
              <span>{user.primeiroNome}</span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 ${
                  allSourcesActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${allSourcesActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {loading ? 'Sincronizando dados' : `${activeSources}/${sources.length} fontes ativas`}
              </span>
            </div>
            <h1 id="dashboard-title" className="ui-page-title">
              Visão geral
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Acompanhe o dia e continue o trabalho de onde precisa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refreshAll}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-card px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </button>
            <Link
              to="/ia?view=operations"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#17251b] px-4 text-sm font-semibold text-white transition hover:bg-[#294532] dark:bg-[#e3bd80] dark:text-[#17251b]"
            >
              <Bot className="h-4 w-4" />
              Organizar meu dia
            </Link>
          </div>
        </div>
      </section>

<section className="dashboard-overview" aria-labelledby="overview-title">
        <h2 id="overview-title" className="sr-only">Indicadores do escritório</h2>
        <div className="dashboard-metrics">
          <MetricCell
            icon={Users}
            label="Clientes ativos"
            value={clientesApi.error ? '—' : String(alixApi.data?.kpis.clientesAtivos ?? metrics.clientesAtivos)}
            detail={`${clientes.length} cadastrado(s)`}
            loading={clientesApi.loading}
            to="/crm"
          />
          <MetricCell
            icon={CircleDollarSign}
            label="Dívida mapeada"
            value={clientesApi.error ? '—' : fmtCompact(metrics.totalDivida)}
            detail="Soma da carteira no CRM"
            loading={clientesApi.loading}
            to="/crm"
          />
          <MetricCell
            icon={Handshake}
            label="Propostas abertas"
            value={propostasApi.error ? '—' : String(alixApi.data?.kpis.propostasAbertas ?? propostasAbertas.length)}
            detail={`${propostasVencidas.length} vencida(s) · ${alixApi.data?.kpis.propostasVencendo ?? 0} vencendo`}
            loading={propostasApi.loading || alixApi.loading}
            to="/propostas"
            tone={(alixApi.data?.kpis.propostasVencendo || 0) > 0 ? 'warn' : 'neutral'}
          />
          <MetricCell
            icon={CalendarClock}
            label="Próximos passos"
            value={alixApi.error ? (clientesApi.error ? '—' : String(localDecisions.length)) : String(taskCount)}
            detail={`${alixApi.data?.kpis.acoesAtrasadas ?? 0} atrasado(s) · ${alixApi.data?.kpis.acoesHoje ?? 0} hoje`}
            loading={alixApi.loading}
            to="/crm"
            tone={taskCount > 0 ? 'warn' : 'good'}
          />
          <MetricCell
            icon={FileCheck2}
            label="Documentos em revisão"
            value={alixApi.error ? '—' : String(alixApi.data?.kpis.documentosParaRevisar ?? 0)}
            detail={`${alixApi.data?.kpis.confirmacoesPendentes ?? 0} confirmação(ões) pendente(s)`}
            loading={alixApi.loading}
            to="/ia"
            tone={(alixApi.data?.kpis.documentosParaRevisar || 0) > 0 ? 'warn' : 'good'}
          />
          <MetricCell
            icon={AlertTriangle}
            label="Insights críticos"
            value={alixApi.error ? '—' : String(alixApi.data?.kpis.insightsCriticos ?? 0)}
            detail={`${alixApi.data?.kpis.insightsImportantes ?? 0} importante(s)`}
            loading={alixApi.loading}
            to="/ia"
            tone={(alixApi.data?.kpis.insightsCriticos || 0) > 0 ? 'risk' : 'good'}
          />
        </div>
      </section>

<SectionNav label="Visões do painel" items={[{ id: 'prioridades', label: 'Meu dia', icon: CalendarClock }, { id: 'carteira', label: 'Carteira e propostas', icon: Users }, { id: 'contexto', label: 'Mercado e financeiro', icon: LineChart }]} active={overviewView} onChange={setOverviewView} />
<div hidden={overviewView !== 'prioridades'} className="space-y-5">


      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <OperationalPanel
          title="Próximas ações"
          icon={BriefcaseBusiness}
          detail="Pendências registradas no sistema, com acesso direto ao trabalho"
          action={<TextLink to="/crm" label="Abrir CRM" />}
        >
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Filtrar próximas ações">
            {(['todas', 'clientes', 'propostas'] as const).map(filter => <button key={filter} type="button" aria-pressed={decisionFilter === filter} onClick={() => setDecisionFilter(filter)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${decisionFilter === filter ? 'border-[#17251b] bg-[#17251b] text-white dark:border-white/30' : 'border-stone-200 text-stone-600 hover:bg-stone-50 dark:border-white/15 dark:text-stone-300 dark:hover:bg-white/5'}`}>{filter === 'todas' ? 'Todas' : filter === 'clientes' ? 'Clientes' : 'Propostas'}</button>)}
          </div>
          <div className="max-h-[480px] divide-y divide-stone-200 overflow-y-auto dark:divide-white/10">
            {visibleDecisions.map((item) => <DecisionRow key={item.id} item={item} />)}
            {decisionsUnavailable && <p role="status" className="py-3 text-sm text-amber-700">Parte das pendências está indisponível. Atualize os dados para completar a leitura.</p>}
            {!visibleDecisions.length && !alixApi.loading && !decisionsUnavailable && (
              <EmptyState icon={CheckCircle2} text={decisionFilter === 'todas' ? 'Nenhuma ação urgente identificada nos dados consultados.' : 'Nenhuma ação neste filtro.'} />
            )}
            {alixApi.loading && <LoadingRows />}
          </div>
        </OperationalPanel>

        <aside className="dashboard-note overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-bold">Leitura ALIX</h2>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                {alixApi.error ? 'Indisponível' : alixApi.loading ? 'Atualizando' : 'Dados do sistema'}
              </span>
            </div>
            <p className="mt-4 text-base font-semibold leading-snug text-foreground">
              {alixApi.data?.headline || (alixApi.loading ? 'Analisando a operação...' : 'Sem leitura disponível')}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {alixApi.data?.resumo || 'Os demais indicadores continuam disponíveis pelas fontes do CRM.'}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="mb-3 text-xs font-semibold text-muted-foreground">Pendências para organizar o dia</p>
            <div className="space-y-3">
              {(alixApi.data?.tarefasHoje || []).slice(0, 4).map((task) => (
                <div key={task} className="flex items-start gap-2.5 text-sm leading-relaxed text-[var(--text-soft)]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span>{task}</span>
                </div>
              ))}
              {!alixApi.data?.tarefasHoje.length && (
                <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>Nenhuma tarefa adicional registrada.</span>
                </div>
              )}
            </div>
            <Link
              to="/ia"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90"
            >
              Conversar com a ALIX
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </section>





      <nav
        aria-label="Acessos rápidos"
        className="dashboard-shortcuts ui-panel grid grid-cols-2 overflow-hidden md:grid-cols-3 xl:grid-cols-6"
      >
        <QuickAction to="/crm?novo=1" icon={UserPlus} label="Novo cliente" detail="Cadastro inteligente" primary />
        <QuickAction to="/crm" icon={Users} label="CRM" detail={`${clientes.length} cliente(s)`} />
        <QuickAction to="/propostas" icon={FileText} label="Propostas" detail={`${propostasAbertas.length} aberta(s)`} />
        <QuickAction to="/negociacoes" icon={Handshake} label="Negociações" detail="Deal room" />
        <QuickAction to="/financeiro" icon={Landmark} label="Financeiro" detail={financeiroApi.data?.mesAtual || 'Competência atual'} />
        <QuickAction to="/ia" icon={Bot} label="ALIX" detail={`${alixApi.data?.kpis.documentosParaRevisar ?? 0} doc(s) para revisar`} />
      </nav>
</div><div hidden={overviewView !== 'carteira'}>
      <section className="grid gap-4 xl:grid-cols-2">
        <OperationalPanel
          title="Carteira e pipeline"
          icon={BarChart3}
          detail={`${clientes.length} cliente(s) distribuído(s) por etapa`}
          action={<TextLink to="/crm" label="Ver carteira" />}
        >
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-3">
              {pipeline.map((item) => (
                <PipelineRow key={item.stage} {...item} />
              ))}
              {!pipeline.length && !clientesApi.loading && (
                <EmptyState icon={Users} text="Nenhum cliente cadastrado no CRM." compact />
              )}
            </div>
            <div className="min-w-0 border-t border-stone-200 pt-4 dark:border-white/10 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-stone-700 dark:text-stone-200">Prioridade na carteira</p>
                <span className="text-xs text-stone-500 dark:text-stone-400">score operacional</span>
              </div>
              <div className="divide-y divide-stone-200 dark:divide-white/10">
                {clientesAtencao.map((cliente) => <ClientRow key={cliente.id} cliente={cliente} />)}
              </div>
            </div>
          </div>
        </OperationalPanel>

        <OperationalPanel
          title="Propostas em andamento"
          icon={FileText}
          detail={`${propostasAbertas.length} aberta(s) de ${propostasApi.data.length} no total`}
          action={<TextLink to="/propostas" label="Ver propostas" />}
        >
          <div className="divide-y divide-stone-200 dark:divide-white/10">
            {propostasAbertas.slice(0, 5).map((proposta) => (
              <ProposalRow key={proposta.id} proposta={proposta} />
            ))}
            {!propostasAbertas.length && !propostasApi.loading && (
              <EmptyState icon={FileText} text="Nenhuma proposta aberta no momento." />
            )}
            {propostasApi.loading && <LoadingRows count={3} />}
          </div>
        </OperationalPanel>
      </section>

      </div><div hidden={overviewView !== 'contexto'}>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(330px,0.8fr)]">
        <OperationalPanel
          title="Mercado relevante"
          icon={LineChart}
          detail={mercadoApi.data ? `${dateTimeLabel(mercadoApi.data.geradoEm)} · ${sourceLabel(mercadoApi.data.fonteOrigem)}` : 'Atualizando fontes externas'}
          action={<TextLink to="/mercado" label="Abrir mercado" />}
        >
          {mercadoApi.data && !mercadoApi.error ? (
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{mercadoApi.data.narrativaCurta}</p>
                <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-stone-200 dark:border-white/10">
                  <MarketFact label="Selic" value={mercadoApi.data.macro.selic != null ? `${mercadoApi.data.macro.selic.toFixed(2).replace('.', ',')}%` : '—'} />
                  <MarketFact label="Dólar" value={mercadoApi.data.macro.dolar != null ? fmtBRL(mercadoApi.data.macro.dolar) : '—'} />
                  <MarketFact label="IPCA" value={mercadoApi.data.macro.ipca12m != null ? `${mercadoApi.data.macro.ipca12m.toFixed(2).replace('.', ',')}%` : '—'} />
                </div>
              </div>
              <div className="min-w-0 border-t border-stone-200 pt-4 dark:border-white/10 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                <p className="mb-2 text-xs font-bold text-stone-700 dark:text-stone-200">Movimentos em 7 dias</p>
                <div className="divide-y divide-stone-200 dark:divide-white/10">
                  {[...mercadoApi.data.topAltas.slice(0, 3), ...mercadoApi.data.topBaixas.slice(0, 2)].map((row) => (
                    <div key={row.nome} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-stone-800 dark:text-stone-100">{row.nome}</p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">{row.preco.toLocaleString('pt-BR')} {row.unidade}</p>
                      </div>
                      <span className={`flex-shrink-0 font-bold ${row.variacao7d >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {row.variacao7d >= 0 ? '+' : ''}{row.variacao7d.toFixed(2).replace('.', ',')}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : mercadoApi.loading ? (
            <LoadingRows count={3} />
          ) : (
            <UnavailableState label="Mercado" />
          )}
        </OperationalPanel>

        <OperationalPanel
          title="Financeiro interno"
          icon={Landmark}
          detail={financeiroApi.data?.mesAtual ? `Competência ${financeiroApi.data.mesAtual}` : 'Competência atual'}
          action={
            <div className="flex items-center gap-2">
              {empresasApi.data.length > 0 && (
                <label className="relative hidden sm:block">
                  <span className="sr-only">Empresa</span>
                  <select
                    value={empresaId}
                    onChange={(event) => setEmpresaId(event.target.value)}
                    className="h-8 max-w-[170px] appearance-none rounded-lg border border-stone-300 bg-card pl-2.5 pr-7 text-xs font-semibold text-stone-700 outline-none focus:border-[#cb9d52] dark:border-white/15 dark:bg-white/5 dark:text-white"
                  >
                    <option value="">Todas as empresas</option>
                    {empresasApi.data.map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>{empresa.nomeFantasia || empresa.razaoSocial}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500 dark:text-stone-400" />
                </label>
              )}
              <TextLink to="/financeiro" label="Detalhar" />
            </div>
          }
        >
          {financeiroApi.data && !financeiroApi.error ? (
            <div>
              <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-stone-200 dark:border-white/10">
                <FinanceFact label="Receita" value={fmtCompact(financeiroApi.data.dreAtual.receitaBruta)} />
                <FinanceFact label="Resultado" value={fmtCompact(financeiroApi.data.dreAtual.resultadoLiquido)} tone={financeiroApi.data.dreAtual.resultadoLiquido < 0 ? 'risk' : 'neutral'} />
                <FinanceFact label="Margem" value={fmtPct(financeiroApi.data.dreAtual.margemLiquida)} />
                <FinanceFact label="Contas a pagar" value={fmtCompact(financeiroApi.data.contasPagar.total)} tone={financeiroApi.data.contasPagar.atrasadas > 0 ? 'warn' : 'neutral'} />
              </div>
              {!financeiroTemMovimento && (
                <p className="mt-3 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                  <Database className="h-3.5 w-3.5" />
                  Nenhuma movimentação lançada nesta competência.
                </p>
              )}
            </div>
          ) : financeiroApi.loading ? (
            <LoadingRows count={2} />
          ) : (
            <UnavailableState label="Financeiro" />
          )}
        </OperationalPanel>
      </section>

      </div><details className="border-t border-border pt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Conexões e atualização dos dados · {activeSources}/{sources.length} disponíveis</summary><section className="pt-4" aria-labelledby="sources-title">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="sources-title" className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200">
              <Database className="h-4 w-4" />
              Estado das fontes
            </h2>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Indicadores indisponíveis não são substituídos por valores demonstrativos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sources.map((source) => <SourceBadge key={source.label} source={source} />)}
          </div>
        </div>
      </section></details>
    </div>
  )
}

function SectionHeading({
  id,
  eyebrow,
  title,
  detail,
}: {
  id: string
  eyebrow: string
  title: string
  detail: string
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-bold text-[#a87f3d]">{eyebrow}</p>
        <h2 id={id} className="mt-0.5 text-lg font-bold text-[#17251b] dark:text-white">{title}</h2>
      </div>
      <p className="text-xs text-stone-500 dark:text-stone-400">{detail}</p>
    </div>
  )
}

function QuickAction({
  to,
  icon: Icon,
  label,
  detail,
  primary = false,
}: {
  to: string
  icon: LucideIcon
  label: string
  detail: string
  primary?: boolean
}) {
  return <Link to={to} className="dashboard-shortcut"><Icon size={17} className="shrink-0 text-muted-foreground" /><span className="min-w-0"><strong className="block truncate font-medium">{label}</strong><small>{detail}</small></span></Link>
}

function MetricCell({
  icon: Icon,
  label,
  value,
  detail,
  loading,
  to,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  loading: boolean
  to: string
  tone?: 'neutral' | 'good' | 'warn' | 'risk'
}) {
  const toneClass = {
    neutral: 'text-[#17251b] dark:text-white',
    good: 'text-emerald-700 dark:text-emerald-400',
    warn: 'text-amber-700 dark:text-amber-400',
    risk: 'text-red-700 dark:text-red-400',
  }[tone]
  return (
    <Link
      to={to}
      className="ui-metric ui-panel-interactive group"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="ui-metric-label">{label}</p>
        <Icon className={`h-4 w-4 flex-shrink-0 ${toneClass}`} />
      </div>
      <p className={`ui-metric-value ${toneClass}`}>
        {loading ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-stone-100 dark:bg-white/10" /> : value}
      </p>
      <p className="ui-metric-detail">{detail}</p>
    </Link>
  )
}

function OperationalPanel({
  title,
  icon: Icon,
  detail,
  action,
  children,
}: {
  title: string
  icon: LucideIcon
  detail: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="ui-panel overflow-hidden">
      <div className="ui-panel-heading flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-stone-100 text-[#465b4a] dark:bg-white/10 dark:text-[#b2bda1]">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-[#17251b] dark:text-white">{title}</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{detail}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

function DecisionRow({ item }: { item: DecisionItem }) {
  const tone = {
    critico: { icon: 'bg-red-50 text-red-700', label: 'Crítico' },
    atencao: { icon: 'bg-amber-50 text-amber-700', label: 'Atenção' },
    info: { icon: 'bg-sky-50 text-sky-700', label: 'Informativo' },
    ok: { icon: 'bg-emerald-50 text-emerald-700', label: 'Em dia' },
  }[item.tone]
  return (
    <Link to={item.to} className="group flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
        {item.tone === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-stone-800 group-hover:text-[#17251b] dark:text-stone-100 dark:group-hover:text-white">{item.title}</span>
        <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{item.detail}</span>
      </span>
      <span className={`hidden rounded-full px-2 py-1 text-[11px] font-bold sm:inline ${tone.icon}`}>{tone.label}</span>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#17251b] dark:group-hover:text-white" />
    </Link>
  )
}

function PipelineRow({ stage, count, pct }: { stage: string; count: number; pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-semibold text-stone-700 dark:text-stone-200">{STAGE_LABEL[stage] || statusLabel(stage)}</span>
        <span className="font-bold text-stone-500 dark:text-stone-400">{count}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/10">
        <div className="h-full rounded-full bg-[#465b4a] dark:bg-[#b2bda1]" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
    </div>
  )
}

function ClientRow({ cliente }: { cliente: ClienteView }) {
  const prazo = daysUntil(cliente.proximaAcao?.data)
  const location = cliente.uf ? `${cliente.cidade}/${cliente.uf}` : cliente.cidade
  return (
    <Link to={`/clientes/${cliente.id}`} className="group flex min-w-0 items-center gap-3 py-2.5">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xs font-bold text-[#465b4a] dark:bg-white/10 dark:text-[#b2bda1]">
        {cliente.nome.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-stone-800 group-hover:text-[#17251b] dark:text-stone-100 dark:group-hover:text-white">{cliente.nome}</span>
        <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{location} · {cliente.resumoFinanceiro.rotulo}: {financialValue(cliente)}</span>
      </span>
      <span className="flex-shrink-0 text-right">
        <span className="block text-xs font-bold text-stone-700 dark:text-stone-200">{cliente.scoreOperacional ?? '—'}</span>
        <span className={`block text-[11px] ${prazo != null && prazo < 0 ? 'font-bold text-red-700 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'}`}>
          {prazo == null ? statusLabel(cliente.prioridade) : prazo < 0 ? `${Math.abs(prazo)}d atraso` : prazo === 0 ? 'Hoje' : `em ${prazo}d`}
        </span>
      </span>
    </Link>
  )
}

function ProposalRow({ proposta }: { proposta: PropostaResumo }) {
  const prazo = daysUntil(proposta.dataValidade)
  return (
    <Link to="/propostas" className="group flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-stone-800 group-hover:text-[#17251b] dark:text-stone-100 dark:group-hover:text-white">{proposta.titulo || proposta.credor || 'Proposta sem título'}</span>
        <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{proposta.clienteNome || proposta.clienteId || 'Cliente a confirmar'} · {statusLabel(proposta.status)}</span>
      </span>
      <span className="flex-shrink-0 text-right">
        <span className="block text-xs font-bold text-[#17251b] dark:text-white">{fmtCompact(Number(proposta.valorProposta || proposta.valorDivida || 0))}</span>
        {prazo != null && (
          <span className={`block text-[11px] ${prazo < 0 ? 'font-bold text-red-700 dark:text-red-400' : prazo <= 7 ? 'font-bold text-amber-700 dark:text-amber-400' : 'text-stone-500 dark:text-stone-400'}`}>
            {prazo < 0 ? `vencida há ${Math.abs(prazo)}d` : prazo === 0 ? 'vence hoje' : `vence em ${prazo}d`}
          </span>
        )}
      </span>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function MarketFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-r border-stone-200 px-3 py-2.5 last:border-r-0 dark:border-white/10">
      <p className="truncate text-[11px] font-bold text-stone-500 dark:text-stone-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-stone-800 dark:text-white">{value}</p>
    </div>
  )
}

function FinanceFact({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'warn' | 'risk'
}) {
  const toneClass = tone === 'risk' ? 'text-red-700 dark:text-red-400' : tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-stone-800 dark:text-white'
  return (
    <div className="min-w-0 border-b border-r border-stone-200 px-3 py-3 dark:border-white/10">
      <p className="truncate text-[11px] font-bold text-stone-500 dark:text-stone-400">{label}</p>
      <p className={`mt-1 truncate text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}

function TextLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-[#465b4a] transition hover:bg-stone-100 hover:text-[#17251b] dark:text-[#b2bda1] dark:hover:bg-white/10 dark:hover:text-white">
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  )
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Carregando dados">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="h-9 w-9 animate-pulse rounded-lg bg-stone-100 dark:bg-white/10" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3 w-2/3 animate-pulse rounded bg-stone-100 dark:bg-white/10" />
            <span className="block h-2.5 w-1/2 animate-pulse rounded bg-stone-100 dark:bg-white/10" />
          </span>
        </div>
      ))}
    </div>
  )
}

function EmptyState({
  icon: Icon,
  text,
  compact = false,
}: {
  icon: LucideIcon
  text: string
  compact?: boolean
}) {
  return (
    <div className={`flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400 ${compact ? 'py-2' : 'py-6'}`}>
      <Icon className="h-4 w-4 flex-shrink-0 text-emerald-700" />
      <span>{text}</span>
    </div>
  )
}

function UnavailableState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-4 text-sm text-amber-800">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span>Dados de {label.toLowerCase()} indisponíveis nesta atualização.</span>
    </div>
  )
}

function SourceBadge({ source }: { source: SourceState }) {
  const status = source.loading ? 'loading' : source.error ? 'error' : 'ok'
  const tone = {
    loading: 'border-stone-200 bg-card text-stone-600',
    error: 'border-red-200 bg-red-50 text-red-700',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  }[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}
      title={source.error || source.detail}
    >
      {source.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className={`h-1.5 w-1.5 rounded-full ${source.error ? 'bg-red-500' : 'bg-emerald-500'}`} />}
      {source.label}
    </span>
  )
}
