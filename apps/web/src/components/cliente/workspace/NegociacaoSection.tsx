import { SectionNav } from '../../ui/SectionNav'
// ============================================================
// NegociacaoSection — propostas, negociações, demandas e contratos.
// ============================================================
import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../../hooks/useApi'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  FileText,
  Handshake,
  Link2,
  Loader2,
  Send,
  TrendingUp,
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import { fmtBRL, fmtBRLCompact, fmtData } from './utils'

const ClientePropostasTab = lazy(() => import('../ClientePropostasTab'))
const ClienteDemandasTab = lazy(() => import('../ClienteDemandasTab'))
const ContratosOficiaisTab = lazy(() => import('../../contratos/ContratosOficiaisTab'))

type DealTab = 'propostas' | 'negociacoes' | 'demandas' | 'contratos'
type MoneyLike = string | number | null | undefined

interface Props {
  data: UseClienteDataReturn
}

interface PropostaResumo {
  id: string
  clienteId?: string
  credor?: string | null
  titulo?: string | null
  tipo?: string | null
  status?: string | null
  valorDivida?: MoneyLike
  valorProposta?: MoneyLike
  valorProposto?: MoneyLike
  descontoPercentual?: MoneyLike
  dataCriacao?: string
  dataValidade?: string
  criadoEm?: string
  atualizadoEm?: string
  ultimaAtualizacao?: string
  demandaId?: string
  demandaTitulo?: string
  versaoDemanda?: number
  pdfUrl?: string | null
  pdfPath?: string | null
  payload?: Record<string, unknown> | null
  arquivoOrigem?: { filename?: string; cofreDownloadUrl?: string | null } | null
  extracaoIa?: { resumo?: string; confianca?: number; camposAusentes?: string[] } | null
}

interface Negociacao {
  id: string
  clienteId?: string
  status: string
  credor?: string
  responsavel?: string | null
  valor?: MoneyLike
  valorAtual?: MoneyLike
  valorProposto?: MoneyLike
  taxa?: MoneyLike
  taxaAtual?: MoneyLike
  taxaProposta?: MoneyLike
  prazo?: number | null
  prazoMeses?: number | null
  carenciaMeses?: number | null
  garantias?: unknown
  docsPendentes?: Array<{ titulo?: string; status?: string } | string> | null
  historico?: Array<{ ts?: string; tipo?: string; texto?: string }> | null
  proximaAcao?: string
  proximaData?: string | null
  observacoes?: string | null
  ultimaInteracao?: string | null
  criadoEm?: string
  atualizadoEm?: string
  propostaId?: string | null
  proposta?: PropostaResumo | null
}

interface DealResumo {
  total?: number
  porStatus?: Record<string, number>
  valorEmNegociacao?: number
  proximoDeadline?: { credor?: string; data?: string } | null
}

interface Demanda {
  id: string
  numero?: number
  credor?: string
  finalidade?: string
  modalidade?: string
  valor?: string | number
  valorPretendido?: string | number
  titulo?: string
  totalPropostas?: number
  status?: string
  propostaPrincipalId?: string
  propostaIds?: string[]
  documentoIds?: string[]
  proximaAcao?: string
  proximaAcaoEm?: string
  prioridade?: string
  checklistResumo?: { pendentes?: number }
  propostas?: Array<{ id: string; principal?: boolean; versaoDemanda?: number }>
}

interface ClienteContract {
  id: string
  titulo: string
  status: string
  credor?: string | null
  valorAtual?: MoneyLike
  propostaId?: string | null
  negociacaoId?: string | null
  demandaId?: string | null
}

const TABS: { key: DealTab; label: string; short: string; hint: string; icon: typeof Send }[] = [
  { key: 'demandas', label: 'Demandas', short: 'Demandas', hint: 'Assuntos e histórico de propostas', icon: TrendingUp },
  { key: 'propostas', label: 'Propostas', short: 'Propostas', hint: 'Uploads, edição e PDF', icon: Send },
  { key: 'negociacoes', label: 'Negociações', short: 'Negociações', hint: 'Credores, prazos e status', icon: Handshake },
  { key: 'contratos', label: 'Contratos', short: 'Contratos', hint: 'Documentos oficiais', icon: FileText },
]

const ACTIVE_NEGOCIACAO = new Set(['negociando', 'contraproposta', 'aguardando_doc', 'em_andamento'])
const ACTIVE_DEMANDA = new Set(['nova', 'em_analise', 'em_proposta', 'negociacao', 'aprovada', 'aprovado', 'protocolada', 'em_andamento'])
const READY_PROPOSTA = new Set(['aceita', 'aprovado', 'aprovada', 'enviada'])

const dealPanelClass = 'rounded-lg border border-aletis-borda bg-card shadow-none'
const dealEyebrowClass = 'text-[11px] font-body font-semibold uppercase text-aletis-gold-escuro'
const dealLabelClass = 'text-[11px] font-body font-semibold uppercase text-muted-foreground'
const dealSoftButtonClass = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-aletis-borda bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-aletis-cream-papel'
const dealPrimaryButtonClass = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-aletis-verde px-3 text-xs font-semibold text-white shadow-none transition hover:bg-aletis-verde-escuro'

export default function NegociacaoSection({ data }: Props) {
  const { cliente, apiId } = data
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('dealTab') as DealTab | null
  const [active, setActive] = useState<DealTab>(TABS.some((tab) => tab.key === requestedTab) ? requestedTab! : 'demandas')
  const [proposalsOpened, setProposalsOpened] = useState(requestedTab === 'propostas')
  useEffect(() => { if (active === 'propostas') setProposalsOpened(true) }, [active])
  const [proposalDemand, setProposalDemand] = useState<{ id: string; titulo: string } | null>(null)
  const [negociacoes, setNegociacoes] = useState<Negociacao[]>([])
  const [propostas, setPropostas] = useState<PropostaResumo[]>([])
  const [propostasOrfas, setPropostasOrfas] = useState<PropostaResumo[]>([])
  const [dealResumo, setDealResumo] = useState<DealResumo | null>(null)
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [loadingDeal, setLoadingDeal] = useState(false)
  const [propostasCount, setPropostasCount] = useState<number | null>(null)
  const [contracts, setContracts] = useState<ClienteContract[] | null>(null)
  const [linksError, setLinksError] = useState<string | null>(null)
  const [linksVersion, setLinksVersion] = useState(0)
  const refreshLinks = useCallback(() => setLinksVersion(value => value + 1), [])

  useEffect(() => {
    if (!apiId) return
    const controller = new AbortController()
    const active = () => !controller.signal.aborted
    setLinksError(null)
    setLoadingDeal(true)
    apiFetch<{ negociacoes?: Negociacao[]; propostasOrfas?: PropostaResumo[]; resumo?: DealResumo }>(
      `/deal-room/cliente/${apiId}/with-propostas`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!active()) return
        setNegociacoes(Array.isArray(r?.negociacoes) ? r.negociacoes : [])
        setPropostasOrfas(Array.isArray(r?.propostasOrfas) ? r.propostasOrfas : [])
        setDealResumo(r?.resumo ?? null)
      })
      .catch((error: Error) => { if (active()) setLinksError(`Não foi possível atualizar as negociações: ${error.message}`) })
      .finally(() => { if (active()) setLoadingDeal(false) })

    apiFetch<PropostaResumo[]>(`/propostas?clienteId=${encodeURIComponent(apiId)}&full=1`, { signal: controller.signal })
      .then((r) => {
        if (!active()) return
        const list = Array.isArray(r) ? r : []
        setPropostas(list)
        setPropostasCount(list.length)
      })
      .catch((error: Error) => { if (active()) setLinksError(`Não foi possível atualizar as propostas: ${error.message}`) })

    apiFetch<Demanda[]>(`/clientes/${encodeURIComponent(apiId)}/demandas`, { signal: controller.signal })
      .then((r) => { if (active()) setDemandas(Array.isArray(r) ? r : []) })
      .catch((error: Error) => { if (active()) setLinksError(`Não foi possível atualizar as demandas: ${error.message}`) })

    apiFetch<{ contracts: ClienteContract[] }>(`/clientes/${encodeURIComponent(apiId)}/core`, { signal: controller.signal })
      .then(result => { if (active()) setContracts(Array.isArray(result.contracts) ? result.contracts : []) })
      .catch((error: Error) => { if (active()) { setContracts(null); setLinksError(`Não foi possível consultar os contratos: ${error.message}`) } })
    return () => controller.abort()
  }, [apiId, linksVersion])

  useEffect(() => {
    setContracts(null)
    setNegociacoes([])
    setPropostas([])
    setPropostasOrfas([])
    setDemandas([])
    setDealResumo(null)
  }, [apiId])

  const relacoes = useMemo(
    () => negociacoes.map((n) => buildNegotiationView(n, propostas)),
    [negociacoes, propostas],
  )
  const propostasVigentes = useMemo(
    () => selectCurrentProposals(propostas, demandas),
    [demandas, propostas],
  )
  const propostasVigentesIds = useMemo(
    () => new Set(propostasVigentes.map((proposta) => proposta.id)),
    [propostasVigentes],
  )
  const propostasOrfasVigentes = useMemo(
    () => propostasOrfas.filter((proposta) => propostasVigentesIds.has(proposta.id)),
    [propostasOrfas, propostasVigentesIds],
  )

  useEffect(() => {
    if (!requestedTab || !TABS.some((tab) => tab.key === requestedTab) || requestedTab === active) return
    setActive(requestedTab)
  }, [active, requestedTab])

  function changeTab(tab: DealTab) {
    setActive(tab)
    const next = new URLSearchParams(searchParams)
    next.set('dealTab', tab)
    setSearchParams(next, { replace: true })
  }

  const handleProposalDataChange = useCallback((next: PropostaResumo[]) => {
    setPropostas(next)
  }, [])

  if (!cliente || !apiId) return null

  const negAtivasDealRoom = negociacoes.filter((n) => ACTIVE_NEGOCIACAO.has(n.status)).length
  const demAtivas = demandas.filter((d) => ACTIVE_DEMANDA.has(d.status ?? 'em_analise')).length
  const valorProposto = propostasVigentes.reduce((sum, p) => sum + (asNumber(getPropostaValor(p)) ?? 0), 0)
  const propostasProntas = propostasVigentes.filter((p) => READY_PROPOSTA.has(p.status ?? '')).length
  const docsPendentes = negociacoes.reduce((sum, n) => {
    const docs = Array.isArray(n.docsPendentes) ? n.docsPendentes : []
    return sum + docs.filter((doc) => typeof doc === 'string' || doc.status !== 'aprovado').length
  }, 0)
  const demandasSemProposta = demandas.filter((demanda) => (
    ACTIVE_DEMANDA.has(demanda.status ?? 'em_analise')
    && !demanda.propostaPrincipalId
    && !demanda.propostaIds?.length
    && !demanda.totalPropostas
    && !demanda.propostas?.length
  )).length
  const propostasExpiradas = propostasVigentes.filter((proposta) => (
    Boolean(proposta.dataValidade)
    && dateMs(proposta.dataValidade) < Date.now()
    && !['aceita', 'aprovada', 'aprovado'].includes(proposta.status ?? '')
  ))
  const economiaVigente = propostasVigentes.reduce((sum, proposta) => {
    const divida = asNumber(proposta.valorDivida) ?? 0
    const proposto = asNumber(getPropostaValor(proposta)) ?? 0
    return sum + (divida > 0 && proposto > 0 ? Math.max(0, divida - proposto) : 0)
  }, 0)
  const propostasComPendencia = new Set([
    ...propostasOrfasVigentes.map((proposta) => proposta.id),
    ...propostasExpiradas.map((proposta) => proposta.id),
  ]).size
  const totalPendencias = docsPendentes + demandasSemProposta + propostasComPendencia
  const tabCounts: Record<DealTab, number | string> = {
    propostas: propostasCount ?? propostas.length,
    negociacoes: relacoes.length,
    demandas: demandas.length,
    contratos: contracts?.length ?? '—',
  }
  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden animate-fade-in">
      <header className="overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-none">
        <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-aletis-verde text-white">
              <Handshake className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className={dealEyebrowClass}>operação comercial</p>
              <h2 className="mt-0.5 text-xl font-display font-semibold text-foreground">Negociação e propostas</h2>
              <p className="mt-1 text-sm text-[var(--text-soft)]">
                {demAtivas} demanda(s) ativa(s), {propostasVigentes.length} proposta(s) vigente(s) e {negAtivasDealRoom} negociação(ões) formalizada(s).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => changeTab('propostas')} className={dealSoftButtonClass}>
              <Send className="h-3.5 w-3.5" /> Propostas
            </button>
            <Link to={`/clientes/${cliente.id}/deal-room?new=1`} className={dealPrimaryButtonClass}>
              <Handshake className="h-3.5 w-3.5" /> Nova negociação
            </Link>
            <Link to={`/clientes/${cliente.id}/deal-room`} className={dealSoftButtonClass} title="Abrir Deal Room completo">
              <Building2 className="h-3.5 w-3.5" /><ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="border-t border-aletis-borda px-4 pt-1">
          <SectionNav label="Fluxo da negociação" active={active} onChange={changeTab} items={TABS.map(tab => ({ id: tab.key, label: tab.short + ' (' + tabCounts[tab.key] + ')', icon: tab.icon, detail: tab.hint }))} />
        </div>

        <div className="grid grid-cols-2 border-t border-aletis-borda bg-stone-50 lg:grid-cols-4">
          <DealSummaryMetric label="Valor vigente" value={valorProposto > 0 ? fmtBRLCompact(valorProposto) : fmtBRLCompact(cliente.resumoFinanceiro.totalDivida)} />
          <DealSummaryMetric label="Economia indicada" value={economiaVigente > 0 ? fmtBRLCompact(economiaVigente) : '—'} tone="good" />
          <DealSummaryMetric label="Próximo prazo" value={dealResumo?.proximoDeadline?.data ? fmtData(dealResumo.proximoDeadline.data) : 'Não definido'} detail={dealResumo?.proximoDeadline?.credor} />
          <DealSummaryMetric label="Pendências" value={String(totalPendencias)} detail={`${propostas.length} versão(ões) no histórico`} tone={totalPendencias ? 'warn' : 'good'} />
        </div>
      </header>

      {linksError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p className="flex-1">{linksError}</p><button type="button" onClick={refreshLinks} disabled={loadingDeal} className={dealSoftButtonClass}>Atualizar vínculos</button></div>}

      {totalPendencias > 0 && (
        <section className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
            <div>
              <p className="text-xs font-bold text-amber-900">Fila que precisa de decisão</p>
              <p className="mt-0.5 text-[11px] text-amber-800">Abra o grupo correspondente para resolver sem perder o contexto do cliente.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {demandasSemProposta > 0 && <button type="button" onClick={() => changeTab('demandas')} className="rounded-md border border-amber-300 bg-card px-2.5 py-1.5 text-[11px] font-bold text-amber-900">{demandasSemProposta} demanda(s) sem proposta</button>}
            {propostasOrfasVigentes.length > 0 && <button type="button" onClick={() => changeTab('negociacoes')} className="rounded-md border border-amber-300 bg-card px-2.5 py-1.5 text-[11px] font-bold text-amber-900">{propostasOrfasVigentes.length} proposta(s) vigente(s) sem negociação</button>}
            {propostasExpiradas.length > 0 && <button type="button" onClick={() => changeTab('propostas')} className="rounded-md border border-red-200 bg-card px-2.5 py-1.5 text-[11px] font-bold text-red-700">{propostasExpiradas.length} expirada(s)</button>}
            {docsPendentes > 0 && <button type="button" onClick={() => changeTab('negociacoes')} className="rounded-md border border-amber-300 bg-card px-2.5 py-1.5 text-[11px] font-bold text-amber-900">{docsPendentes} documento(s) pendente(s)</button>}
          </div>
        </section>
      )}

      {proposalsOpened && (
        <div hidden={active !== 'propostas'}>
        <Suspense fallback={<Sk />}>
          <ClientePropostasTab
            key={apiId}
            clienteId={apiId}
            clienteNome={cliente.nome}
            valorDividaPadrao={cliente.resumoFinanceiro.totalDivida}
            onCountChange={setPropostasCount}
            onDataChange={handleProposalDataChange}
            onLinksChange={refreshLinks}
            demandaId={proposalDemand?.id}
            demandaTitulo={proposalDemand?.titulo}
            onClearDemanda={() => setProposalDemand(null)}
            demandas={demandas}
          />
        </Suspense>
        </div>
      )}
      {active === 'negociacoes' && (
        <NegociacoesEmbed
          relacoes={relacoes}
          loading={loadingDeal}
          clienteId={cliente.id}
          propostas={propostasVigentes}
          propostasOrfas={propostasOrfasVigentes}
          resumo={dealResumo}
          demandas={demandas}
        />
      )}
      {active === 'demandas' && (
        <Suspense fallback={<Sk />}>
        <ClienteDemandasTab
          clienteId={cliente.id}
          clienteNome={cliente.nome}
          onChange={setDemandas}
          onOpenProposals={(demand) => {
            setProposalDemand(demand)
            changeTab('propostas')
          }}
        />
        </Suspense>
      )}
      {active === 'contratos' && (
        <ContratosEmbed
          clienteId={apiId}
          propostas={propostas}
          negociacoes={negociacoes}
          demandas={demandas}
          contracts={contracts}
        />
      )}
    </div>
  )
}

function DealSummaryMetric({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string
  value: string
  detail?: string
  tone?: 'neutral' | 'good' | 'warn'
}) {
  const valueClass = tone === 'good' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-800' : 'text-foreground'
  return (
    <div className="min-w-0 border-b border-aletis-borda px-4 py-3 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <p className={dealLabelClass}>{label}</p>
      <p className={`mt-1 truncate text-base font-display font-semibold tabular-nums ${valueClass}`}>{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  )
}

const KANBAN_STATUSES: Array<{ id: string; label: string; tone: 'good' | 'warn' | 'bad' | 'info' | 'neutral' }> = [
  { id: 'negociando', label: 'Negociando', tone: 'info' },
  { id: 'contraproposta', label: 'Contraproposta', tone: 'warn' },
  { id: 'aguardando_doc', label: 'Aguardando doc', tone: 'warn' },
  { id: 'aprovado', label: 'Aprovado', tone: 'good' },
  { id: 'recusado', label: 'Recusado', tone: 'bad' },
  { id: 'encerrado', label: 'Encerrado', tone: 'neutral' },
]

const STATUS_LABEL: Record<string, string> = {
  negociando: 'Negociando',
  contraproposta: 'Contraproposta',
  aguardando_doc: 'Aguardando doc',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  encerrado: 'Encerrado',
  suspenso: 'Suspenso',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  em_andamento: 'Em andamento',
  em_analise: 'Em análise',
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceita: 'Aceita',
  rejeitada: 'Rejeitada',
  expirada: 'Expirada',
}

type NegociacaoView = {
  negociacao: Negociacao
  proposta: PropostaResumo | null
  vinculo: 'manual' | 'automatico' | 'nenhum'
  valorAtual: number | null
  valorProposto: number | null
  economia: number | null
  docsPendentes: number
}

function ResumoMini({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Send
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-aletis-borda bg-card px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
        <Icon className="w-3.5 h-3.5 flex-shrink-0 text-foreground" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-display font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground truncate">{hint}</p>}
    </div>
  )
}

function NegociacoesEmbed({
  relacoes,
  loading,
  clienteId,
  propostas,
  propostasOrfas,
  resumo,
  demandas,
}: {
  relacoes: NegociacaoView[]
  loading: boolean
  clienteId: string
  propostas: PropostaResumo[]
  propostasOrfas: PropostaResumo[]
  resumo: DealResumo | null
  demandas: Demanda[]
}) {
  if (loading) return <Sk />

  const valorAtual = relacoes.reduce((sum, r) => sum + (r.valorAtual ?? 0), 0)
  const valorProposto = relacoes.reduce((sum, r) => sum + (r.valorProposto ?? 0), 0)
  const economia = valorAtual > 0 && valorProposto > 0 ? Math.max(0, valorAtual - valorProposto) : null
  const vinculadas = relacoes.filter((r) => r.vinculo !== 'nenhum').length

  if (relacoes.length === 0) {
    return (
      <div className="space-y-3">
        <section className={`${dealPanelClass} p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-aletis-borda bg-muted text-foreground">
            <Handshake className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-display font-semibold text-foreground">
              Nenhuma negociação aberta ainda
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {propostas.length > 0
                ? 'Já existem propostas carregadas. Abra uma negociação por credor para acompanhar status, prazos, documentos e histórico.'
                : 'Carregue uma proposta ou abra uma negociação para começar o acompanhamento por credor.'}
            </p>
          </div>
          <Link
            to={`/clientes/${clienteId}/deal-room?new=1`}
            className={dealPrimaryButtonClass}
          >
            <Building2 className="w-3.5 h-3.5" /> Abrir primeira negociação
          </Link>
          </div>
        </section>
        {propostas.length > 0 && (
          <PropostasSoltas propostas={propostas} clienteId={clienteId} titulo="Propostas prontas para virar negociação" />
        )}
        {demandas.length > 0 && (
          <DemandasParaNegociacao demandas={demandas} propostas={propostas} clienteId={clienteId} />
        )}
      </div>
    )
  }

  const grouped = buildKanban(relacoes)

  return (
    <div className="min-w-0 space-y-3">
      <section className={`${dealPanelClass} grid grid-cols-2 overflow-hidden lg:grid-cols-4`}>
        <DealSummaryMetric label="Negociações" value={`${relacoes.length}`} detail={`${vinculadas} com proposta`} />
        <DealSummaryMetric label="Valor atual" value={fmtBRLCompact(valorAtual || resumo?.valorEmNegociacao || null)} />
        <DealSummaryMetric label="Valor proposto" value={fmtBRLCompact(valorProposto || null)} tone="good" />
        <DealSummaryMetric label="Economia" value={economia != null ? fmtBRLCompact(economia) : '—'} tone="good" />
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <section className="min-w-0">
          <div className="mb-3 flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className={dealEyebrowClass}>mesa de negociação</p>
              <h3 className="mt-1 text-base font-display font-semibold text-foreground">
                Negociações detalhadas
              </h3>
              <p className="mt-1 text-xs text-[var(--text-soft)]">
                Credor, proposta vigente, documentos e próxima ação no mesmo acompanhamento.
              </p>
            </div>
            <Link to={`/clientes/${clienteId}/deal-room`} className={`${dealSoftButtonClass} flex-shrink-0`}>
              <Building2 className="h-3.5 w-3.5" /> Completo
            </Link>
          </div>

          <div className="space-y-3">
            {relacoes.map((row) => (
              <NegociacaoCard key={row.negociacao.id} row={row} clienteId={clienteId} />
            ))}
          </div>
        </section>

        <aside className="min-w-0 space-y-3">
          <section className={`${dealPanelClass} overflow-hidden`}>
            <div className="border-b border-aletis-borda px-3 py-3">
              <p className={dealEyebrowClass}>funil</p>
              <h4 className="mt-1 text-sm font-display font-semibold text-foreground">Status por credor</h4>
            </div>
            <div className="divide-y divide-aletis-borda">
              {grouped.map((col) => (
                <div key={col.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase text-foreground">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${toneDot(col.tone)}`} />
                      <span className="truncate">{col.label}</span>
                    </p>
                    <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[var(--text-soft)]">{col.items.length}</span>
                  </div>
                  {col.items.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {col.items.slice(0, 3).map((row) => (
                        <Link
                          key={row.negociacao.id}
                          to={`/clientes/${clienteId}/deal-room?neg=${row.negociacao.id}`}
                          className="max-w-full truncate rounded-md border border-aletis-borda bg-stone-50 px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-aletis-cream-papel"
                        >
                          {row.negociacao.credor ?? 'Credor sem nome'}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <PropostasSoltas propostas={propostasOrfas} clienteId={clienteId} titulo="Propostas sem negociação vinculada" />
        </aside>
      </div>
    </div>
  )
}

function DemandasParaNegociacao({
  demandas,
  propostas,
  clienteId,
}: {
  demandas: Demanda[]
  propostas: PropostaResumo[]
  clienteId: string
}) {
  const proposalByDemand = new Map(
    propostas.filter((proposal) => proposal.demandaId).map((proposal) => [proposal.demandaId!, proposal]),
  )
  const queue = [...demandas]
    .filter((demanda) => !['concluida', 'cancelada', 'recusada', 'desembolsada'].includes(demanda.status ?? ''))
    .sort((a, b) => dateMs(a.proximaAcaoEm) - dateMs(b.proximaAcaoEm))

  if (queue.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className={dealEyebrowClass}>fila operacional</p>
          <h4 className="mt-0.5 text-sm font-display font-semibold text-foreground">Demandas prontas para acompanhamento</h4>
        </div>
        <span className="flex-shrink-0 text-xs font-semibold text-muted-foreground">{queue.length} ativa(s)</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {queue.map((demanda) => {
          const proposal = proposalByDemand.get(demanda.id)
          const link = `/clientes/${clienteId}/deal-room?new=1&demanda=${encodeURIComponent(demanda.id)}${proposal ? `&proposta=${encodeURIComponent(proposal.id)}` : ''}`
          return (
            <article key={demanda.id} className={`${dealPanelClass} min-w-0 p-3`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${demandaStatusClass(demanda.status)}`}>
                      {STATUS_LABEL[demanda.status ?? ''] ?? demanda.status ?? 'Em análise'}
                    </span>
                    {demanda.prioridade && <span className="text-[11px] font-semibold uppercase text-muted-foreground">{demanda.prioridade}</span>}
                  </div>
                  <h5 className="mt-2 truncate text-sm font-semibold text-foreground">
                    {demanda.titulo || demanda.finalidade || `Demanda ${demanda.numero ?? demanda.id.slice(0, 8)}`}
                  </h5>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {demanda.credor || 'Credor a definir'} · {fmtBRLCompact(asNumber(demanda.valorPretendido ?? demanda.valor))}
                  </p>
                </div>
                <Link to={link} className={`${dealSoftButtonClass} flex-shrink-0`}>
                  <Handshake className="h-3.5 w-3.5" /> Negociar
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MetricTiny label="Proposta" value={proposal ? `V${proposal.versaoDemanda || 1}` : 'Pendente'} positive={Boolean(proposal)} />
                <MetricTiny label="Documentos" value={`${demanda.documentoIds?.length ?? 0}`} />
                <MetricTiny label="Checklist" value={`${demanda.checklistResumo?.pendentes ?? 0} pend.`} />
              </div>
              <p className="mt-3 truncate text-xs text-[var(--text-soft)]">
                <strong>Próxima ação:</strong> {demanda.proximaAcao || (proposal ? 'Abrir tratativa com o credor' : 'Preparar proposta vigente')}
                {demanda.proximaAcaoEm ? ` · ${fmtData(demanda.proximaAcaoEm)}` : ''}
              </p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function NegociacaoCard({ row, clienteId }: { row: NegociacaoView; clienteId: string }) {
  const n = row.negociacao
  const proposta = row.proposta
  const prazo = n.proximaData ?? n.criadoEm
  const taxaAtual = asNumber(n.taxaAtual ?? n.taxa)
  const taxaProposta = asNumber(n.taxaProposta)
  const historico = Array.isArray(n.historico) ? n.historico : []
  const last = historico[historico.length - 1]

  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-sm transition hover:border-aletis-verde/30 ">
      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.85fr)_minmax(190px,0.65fr)] lg:p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${statusClass(n.status)}`}>
              {STATUS_LABEL[n.status] ?? n.status}
            </span>
            {row.vinculo !== 'nenhum' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold uppercase text-emerald-700">
                <Link2 className="w-3 h-3" />
                {row.vinculo === 'manual' ? 'vinculada' : 'sugerida'}
              </span>
            )}
          </div>
          <h4 className="mt-2 break-words text-base font-display font-semibold leading-tight text-foreground">
            {n.credor ?? getPropostaCredor(proposta) ?? 'Credor a definir'}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {n.responsavel ? `Responsável: ${n.responsavel}` : 'Responsável não informado'}
          </p>
          {last?.texto && (
            <p className="mt-2 rounded-lg border border-aletis-borda bg-aletis-cream-papel/60 px-3 py-2 text-xs leading-relaxed text-[var(--text-soft)] line-clamp-2">
              {last.texto}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 min-w-0">
          <MetricTiny label="Atual" value={fmtBRL(row.valorAtual)} />
          <MetricTiny label="Proposto" value={fmtBRL(row.valorProposto)} positive />
          <MetricTiny label="Economia" value={row.economia != null ? fmtBRL(row.economia) : '—'} positive />
          <MetricTiny
            label="Taxa"
            value={taxaProposta != null ? `${taxaProposta.toFixed(2)}%` : taxaAtual != null ? `${taxaAtual.toFixed(2)}%` : '—'}
          />
        </div>

        <div className="min-w-0 rounded-lg border border-aletis-borda bg-aletis-cream-papel/50 p-3">
          <p className={dealLabelClass}>Próxima ação</p>
          <p className="mt-1 text-sm font-semibold leading-snug text-foreground">
            {n.proximaAcao || (prazo ? fmtData(prazo) : 'Definir prazo')}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {row.docsPendentes > 0 ? `${row.docsPendentes} doc(s) pendente(s)` : 'Sem documentos pendentes'}
          </p>
          <Link
            to={`/clientes/${clienteId}/deal-room?neg=${n.id}`}
            className="mt-3 inline-flex h-8 items-center gap-1 rounded-lg bg-aletis-verde/10 px-2.5 text-[11px] font-semibold text-foreground hover:bg-aletis-verde/20"
          >
            Abrir negociação <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {proposta && (
        <div className="border-t border-emerald-100 bg-emerald-50/60 px-3 py-3 lg:px-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase text-emerald-700">
                Proposta {row.vinculo === 'automatico' ? 'sugerida automaticamente' : 'vinculada'}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-foreground truncate">
                {proposta.titulo || `Proposta ${proposta.id.slice(0, 8)}`}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {getPropostaCredor(proposta) ?? 'Credor não informado'} · {STATUS_LABEL[proposta.status ?? ''] ?? proposta.status ?? 'sem status'} · {fmtBRL(asNumber(getPropostaValor(proposta)))}
              </p>
            </div>
            <Link
              to={`/propostas?proposta=${encodeURIComponent(proposta.id)}`}
              className="inline-flex h-8 flex-shrink-0 items-center rounded-lg border border-emerald-200 bg-card px-2.5 text-[11px] font-semibold text-foreground hover:bg-emerald-50"
            >
              abrir proposta
            </Link>
          </div>
        </div>
      )}
    </article>
  )
}

function PropostasSoltas({
  propostas,
  clienteId,
  titulo,
}: {
  propostas: PropostaResumo[]
  clienteId: string
  titulo: string
}) {
  if (propostas.length === 0) {
    return (
      <section className={`${dealPanelClass} p-3`}>
        <p className="text-xs font-semibold text-foreground">{titulo}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Nenhuma pendência nesta etapa.</p>
      </section>
    )
  }

  return (
    <section className={`${dealPanelClass} overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 border-b border-aletis-borda px-3 py-3">
        <div>
          <p className={dealEyebrowClass}>vínculo pendente</p>
          <h4 className="mt-0.5 text-sm font-display font-semibold text-foreground">{titulo}</h4>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
          {propostas.length}
        </span>
      </div>
      <div className="divide-y divide-aletis-borda">
        {propostas.slice(0, 6).map((p) => (
          <div key={p.id} className="flex min-w-0 flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase ${statusClass(p.status ?? '')}`}>
                  {STATUS_LABEL[p.status ?? ''] ?? p.status ?? 'Sem status'}
                </span>
                {p.demandaTitulo && <span className="max-w-full truncate text-[11px] font-semibold uppercase text-foreground">{p.demandaTitulo}</span>}
              </div>
              <p className="mt-1.5 truncate text-xs font-semibold text-foreground">{p.titulo || `Proposta ${p.id.slice(0, 8)}`}</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{getPropostaCredor(p) ?? 'Credor a confirmar'}</p>
            </div>
            <p className="flex-shrink-0 text-sm font-display font-semibold tabular-nums text-foreground">{fmtBRL(asNumber(getPropostaValor(p)))}</p>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <Link to={`/propostas?proposta=${encodeURIComponent(p.id)}`} className={dealSoftButtonClass}>
                <FileText className="h-3.5 w-3.5" /> Proposta
              </Link>
              <Link to={`/clientes/${clienteId}/deal-room?new=1&proposta=${p.id}`} className={dealPrimaryButtonClass}>
                <Handshake className="h-3.5 w-3.5" /> Negociar
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function DemandasEmbed({
  list,
  hasGrupo,
  clienteId,
  propostas,
  negociacoes,
}: {
  list: Demanda[]
  grupoId: string | null
  hasGrupo: boolean
  clienteId: string
  propostas: PropostaResumo[]
  negociacoes: Negociacao[]
}) {
  if (!hasGrupo) {
    return (
      <div className={`${dealPanelClass} p-8 text-center`}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-aletis-borda bg-muted text-foreground">
          <TrendingUp className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-display font-semibold text-foreground">Demandas ainda sem grupo financeiro</h3>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Crie ou abra o grupo de gestão financeira para trazer necessidades de crédito para a negociação.
        </p>
        <Link
          to={`/clientes/${clienteId}?area=gestao`}
          className={`${dealPrimaryButtonClass} mt-4`}
        >
          Ir para Financeiro <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    )
  }

  const total = list.reduce((sum, d) => sum + (asNumber(d.valor) ?? 0), 0)
  const aprovadas = list.filter((d) => ['aprovada', 'aprovado', 'desembolsada'].includes(d.status ?? '')).length
  const emAnalise = list.filter((d) => ACTIVE_DEMANDA.has(d.status ?? 'em_analise')).length
  const credoresComProposta = new Set(propostas.map((p) => normalizeKey(getPropostaCredor(p))).filter(Boolean))
  const credoresComDeal = new Set(negociacoes.map((n) => normalizeKey(n.credor)).filter(Boolean))

  if (list.length === 0) {
    return (
      <div className={`${dealPanelClass} p-8 text-center`}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg border border-aletis-borda bg-muted text-foreground">
          <TrendingUp className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-display font-semibold text-foreground">Nenhuma demanda cadastrada</h3>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Edite na área <strong>Financeiro</strong> para puxar a necessidade de crédito para a negociação.
        </p>
        <Link
          to={`/clientes/${clienteId}?area=gestao`}
          className={`${dealPrimaryButtonClass} mt-4`}
        >
          Abrir Financeiro
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <ResumoMini icon={TrendingUp} label="Demandas" value={`${list.length}`} hint={`${emAnalise} no funil`} />
        <ResumoMini icon={DollarSign} label="Valor solicitado" value={fmtBRLCompact(total)} />
        <ResumoMini icon={CheckCircle2} label="Aprovadas" value={`${aprovadas}`} />
        <ResumoMini icon={Link2} label="Com proposta/deal" value={`${credoresComProposta.size}/${credoresComDeal.size || list.length}`} />
      </div>

      <div className={`${dealPanelClass} min-w-0 overflow-hidden`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <div className="min-w-0 p-4 pb-1">
            <p className={dealEyebrowClass}>origem financeira</p>
            <h3 className="mt-1 text-base font-display font-semibold text-foreground">
              Demandas de crédito do cliente
            </h3>
            <p className="mt-1 text-xs text-[var(--text-soft)]">
              A lista vem da Gestão Financeira e serve como origem para propostas, bancos e contratos.
            </p>
          </div>
          <Link
            to={`/clientes/${clienteId}?area=gestao`}
            className={`${dealSoftButtonClass} mx-4 mt-4 sm:mx-0 sm:mr-4`}
          >
            editar no Financeiro <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        <div className="overflow-x-auto border-t border-aletis-borda">
          <table className="ui-table min-w-[760px] w-full text-xs">
            <thead>
              <tr className="border-b border-aletis-borda bg-aletis-cream-papel/55 text-[11px] uppercase text-muted-foreground">
                <th className="px-4 py-2 text-left">Nº</th>
                <th className="px-3 py-2 text-left">Credor</th>
                <th className="px-3 py-2 text-left">Finalidade</th>
                <th className="px-3 py-2 text-left">Modalidade</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-center">Vínculo</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => {
                const key = normalizeKey(d.credor)
                const hasLink = !!key && (credoresComProposta.has(key) || credoresComDeal.has(key))
                return (
                  <tr key={d.id} className="border-b border-aletis-borda/60 hover:bg-aletis-cream-papel/45">
                    <td className="px-4 py-3 font-mono text-[var(--text-soft)]">{d.numero ?? '—'}</td>
                    <td className="px-3 py-3 font-semibold text-foreground">{d.credor ?? '—'}</td>
                    <td className="px-3 py-3 text-[var(--text-soft)]">{d.finalidade ?? '—'}</td>
                    <td className="px-3 py-3 text-[var(--text-soft)]">{d.modalidade ?? '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">{fmtBRL(asNumber(d.valor))}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                        hasLink ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {hasLink ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {hasLink ? 'ligado' : 'pendente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${demandaStatusClass(d.status)}`}>
                        {STATUS_LABEL[d.status ?? 'em_analise'] ?? d.status ?? 'Em análise'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ContratosEmbed({
  clienteId,
  propostas,
  negociacoes,
  demandas,
  contracts,
}: {
  clienteId: string
  propostas: PropostaResumo[]
  negociacoes: Negociacao[]
  demandas: Demanda[]
  contracts: ClienteContract[] | null
}) {
  const propostasProntas = propostas.filter((p) => ['aceita', 'aprovado', 'aprovada', 'enviada'].includes(p.status ?? '')).length
  const dealsAprovados = negociacoes.filter((n) => ['aprovado', 'concluido'].includes(n.status)).length
  const docsPendentes = negociacoes.reduce((sum, n) => {
    const docs = Array.isArray(n.docsPendentes) ? n.docsPendentes : []
    return sum + docs.filter((doc) => typeof doc === 'string' || doc.status !== 'aprovado').length
  }, 0)

  return (
    <div className="space-y-3">
      <section className={`${dealPanelClass} p-4`}>
        <p className={dealEyebrowClass}>contratos registrados</p>
        <h3 className="mt-1 text-base font-display font-semibold">Rascunhos e contratos do cliente</h3>
        <p className="mt-1 text-xs text-[var(--text-soft)]">O aceite da proposta cria um rascunho para revisão jurídica. A assinatura e a geração do documento continuam sendo etapas próprias.</p>
        {contracts === null ? <p className="mt-4 text-sm text-muted-foreground">Contratos ainda não disponíveis.</p>
          : contracts.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Nenhum contrato registrado para este cliente.</p>
          : <div className="mt-4 space-y-3">{contracts.map(contract => <article key={contract.id} className="rounded-lg border border-aletis-borda p-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="text-sm font-semibold">{contract.titulo}</h4><span className="rounded bg-aletis-cream px-2 py-1 text-xs">{contract.status === 'rascunho' ? 'Rascunho · revisão jurídica pendente' : contract.status}</span></div>
            <p className="mt-1 text-xs text-[var(--text-soft)]">{contract.credor || 'Credor não informado'} · {fmtBRL(asNumber(contract.valorAtual))}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {contract.propostaId && <Link className={dealSoftButtonClass} to={`/propostas?proposta=${encodeURIComponent(contract.propostaId)}`}>Abrir proposta de origem</Link>}
              {contract.negociacaoId && <Link className={dealSoftButtonClass} to={`/clientes/${encodeURIComponent(clienteId)}/deal-room`}>Conferir negociação</Link>}
              {contract.demandaId && <Link className={dealSoftButtonClass} to={`/clientes/${encodeURIComponent(clienteId)}?area=negociacao&dealTab=demandas&demanda=${encodeURIComponent(contract.demandaId)}`}>Abrir demanda</Link>}
            </div>
          </article>)}</div>}
      </section>
      <section className={`${dealPanelClass} overflow-hidden`}>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className={dealEyebrowClass}>contratos oficiais</p>
            <h3 className="mt-1 text-base font-display font-semibold text-foreground">
              Geração de documentos com dados do cliente
            </h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-soft)]">
              Os contratos usam os dados cadastrados do cliente e devem ser gerados depois de conferir proposta, negociação e documentos pendentes.
            </p>
          </div>
          <Link
            to={`/clientes/${clienteId}/deal-room`}
            className={dealSoftButtonClass}
          >
            <Building2 className="h-3.5 w-3.5" />
            Conferir Deal Room
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-aletis-borda bg-aletis-cream-papel/35 p-3 lg:grid-cols-4">
          <ResumoMini icon={FileText} label="Propostas prontas" value={`${propostasProntas}`} />
          <ResumoMini icon={Handshake} label="Deals aprovados" value={`${dealsAprovados}`} />
          <ResumoMini icon={TrendingUp} label="Demandas origem" value={`${demandas.length}`} />
          <ResumoMini icon={AlertTriangle} label="Documentos pendentes" value={`${docsPendentes}`} />
        </div>
      </section>
      <Suspense fallback={<Sk />}>
        <ContratosOficiaisTab clienteId={clienteId} />
      </Suspense>
    </div>
  )
}

function MetricTiny({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-aletis-borda bg-aletis-cream-papel/45 px-3 py-2">
      <p className={dealLabelClass}>{label}</p>
      <p className={`mt-1 truncate text-sm font-display font-semibold tabular-nums ${positive ? 'text-emerald-700' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  )
}

function Sk() {
  return (
    <div className="space-y-2">
      <div className="h-12 rounded-lg bg-gray-100 animate-pulse" />
      <div className="h-32 rounded-lg bg-gray-100 animate-pulse flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    </div>
  )
}

function buildNegotiationView(negociacao: Negociacao, propostas: PropostaResumo[]): NegociacaoView {
  const propostaManual = negociacao.proposta ?? propostas.find((p) => p.id === negociacao.propostaId) ?? null
  const propostaAuto = propostaManual ? null : findMatchingProposal(negociacao, propostas)
  const proposta = propostaManual ?? propostaAuto
  const valorAtual = asNumber(negociacao.valorAtual ?? negociacao.valor ?? proposta?.valorDivida)
  const valorProposto = asNumber(negociacao.valorProposto ?? getPropostaValor(proposta))
  const economia = valorAtual != null && valorProposto != null ? Math.max(0, valorAtual - valorProposto) : null
  const docs = Array.isArray(negociacao.docsPendentes) ? negociacao.docsPendentes : []
  const docsPendentes = docs.filter((doc) => typeof doc === 'string' || doc.status !== 'aprovado').length

  return {
    negociacao,
    proposta,
    vinculo: propostaManual ? 'manual' : propostaAuto ? 'automatico' : 'nenhum',
    valorAtual,
    valorProposto,
    economia,
    docsPendentes,
  }
}

function selectCurrentProposals(propostas: PropostaResumo[], demandas: Demanda[]): PropostaResumo[] {
  const selected = new Map<string, PropostaResumo>()
  const byId = new Map(propostas.map((proposta) => [proposta.id, proposta]))

  for (const demanda of demandas) {
    const explicitId = demanda.propostaPrincipalId
      ?? demanda.propostas?.find((proposta) => proposta.principal)?.id
    const candidates = propostas.filter((proposta) => proposta.demandaId === demanda.id)
    const explicit = explicitId ? byId.get(explicitId) : undefined
    const current = explicit ?? [...candidates].sort(compareProposalRecency)[0]
    if (current) selected.set(current.id, current)
  }

  const grouped = new Map<string, PropostaResumo[]>()
  for (const proposta of propostas) {
    if (!proposta.demandaId) {
      selected.set(proposta.id, proposta)
      continue
    }
    const group = grouped.get(proposta.demandaId) ?? []
    group.push(proposta)
    grouped.set(proposta.demandaId, group)
  }
  for (const group of grouped.values()) {
    if (group.some((proposta) => selected.has(proposta.id))) continue
    const current = [...group].sort(compareProposalRecency)[0]
    if (current) selected.set(current.id, current)
  }

  return Array.from(selected.values()).sort(compareProposalRecency)
}

function compareProposalRecency(a: PropostaResumo, b: PropostaResumo): number {
  const versionDiff = Number(b.versaoDemanda ?? 0) - Number(a.versaoDemanda ?? 0)
  if (versionDiff !== 0) return versionDiff
  return dateMs(b.atualizadoEm ?? b.ultimaAtualizacao ?? b.criadoEm ?? b.dataCriacao)
    - dateMs(a.atualizadoEm ?? a.ultimaAtualizacao ?? a.criadoEm ?? a.dataCriacao)
}

function buildKanban(relacoes: NegociacaoView[]) {
  const extras = Array.from(new Set(relacoes.map((r) => r.negociacao.status)))
    .filter((status) => !KANBAN_STATUSES.some((s) => s.id === status))
    .map((status) => ({ id: status, label: STATUS_LABEL[status] ?? status, tone: 'neutral' as const }))
  return [...KANBAN_STATUSES, ...extras].map((s) => ({
    ...s,
    items: relacoes.filter((r) => r.negociacao.status === s.id),
  }))
}

function findMatchingProposal(negociacao: Negociacao, propostas: PropostaResumo[]): PropostaResumo | null {
  const credor = normalizeKey(negociacao.credor)
  if (!credor) return null

  const candidates = propostas.filter((p) => {
    const propostaCredor = normalizeKey(getPropostaCredor(p))
    const titulo = normalizeKey(p.titulo)
    return Boolean(
      (propostaCredor && (propostaCredor === credor || propostaCredor.includes(credor) || credor.includes(propostaCredor)))
      || (titulo && titulo.includes(credor)),
    )
  })

  if (candidates.length === 0) return null
  return [...candidates].sort((a, b) => dateMs(b.atualizadoEm ?? b.ultimaAtualizacao ?? b.criadoEm ?? b.dataCriacao) - dateMs(a.atualizadoEm ?? a.ultimaAtualizacao ?? a.criadoEm ?? a.dataCriacao))[0]
}

function getPropostaCredor(p: PropostaResumo | null | undefined): string | null {
  if (!p) return null
  const payload = p.payload ?? {}
  const value = p.credor
    ?? stringFromPayload(payload, 'credor')
    ?? stringFromPayload(payload, 'banco')
    ?? stringFromPayload(payload, 'instituicao')
    ?? stringFromPayload(payload, 'instituicaoFinanceira')
  return value || null
}

function getPropostaValor(p: PropostaResumo | null | undefined): MoneyLike {
  if (!p) return null
  return p.valorProposta ?? p.valorProposto ?? p.payload?.valorProposta as MoneyLike ?? p.payload?.valorProposto as MoneyLike
}

function stringFromPayload(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asNumber(value: MoneyLike): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = String(value).trim()
  if (!raw) return null
  const cleaned = raw.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function dateMs(value: string | undefined): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function statusClass(status: string) {
  if (['aprovado', 'concluido', 'aceita'].includes(status)) return 'bg-emerald-100 text-emerald-700'
  if (['recusado', 'cancelado', 'rejeitada', 'expirada'].includes(status)) return 'bg-red-100 text-red-700'
  if (['negociando', 'em_andamento', 'enviada'].includes(status)) return 'bg-blue-100 text-blue-700'
  if (['contraproposta', 'aguardando_doc', 'em_analise'].includes(status)) return 'bg-amber-100 text-amber-800'
  return 'bg-gray-100 text-gray-700'
}

function demandaStatusClass(status: string | undefined) {
  if (['aprovada', 'aprovado', 'desembolsada'].includes(status ?? '')) return 'bg-emerald-100 text-emerald-700'
  if (['recusada', 'recusado', 'cancelada'].includes(status ?? '')) return 'bg-red-100 text-red-700'
  if (['protocolada', 'em_andamento'].includes(status ?? '')) return 'bg-blue-100 text-blue-700'
  return 'bg-amber-100 text-amber-800'
}

function toneDot(tone: 'good' | 'warn' | 'bad' | 'info' | 'neutral') {
  if (tone === 'good') return 'bg-emerald-500'
  if (tone === 'warn') return 'bg-amber-500'
  if (tone === 'bad') return 'bg-red-500'
  if (tone === 'info') return 'bg-blue-500'
  return 'bg-stone-400'
}
