// ============================================================
// WorkspaceShell — navegação canônica do cliente no CRM.
// Mantém uma única entrada por área para reduzir duplicações.
// ============================================================
import { useEffect, useState, useMemo, lazy, Suspense, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Phone, MapPin,
  Briefcase, Activity, Target, Handshake, Workflow,
  Pencil, Save, Loader2, Database, Sprout, Bot, Sparkles, Plus, StickyNote,
  CheckCircle2, AlertTriangle, FileText, CalendarClock, Send,
  Paperclip, UploadCloud, ChevronDown, Landmark, Trash2,
} from 'lucide-react'
import { MotionDialog } from '../../ui'
import { uiAction } from '../../ui/foundation'
import { useClienteData, type Cliente, type UseClienteDataReturn } from './useClienteData'
import { fmtBRLCompact, healthColor } from './utils'
import StageBadge from './StageBadge'
import { slideUp, fadeIn } from '../../../motion/tokens'
import { apiFetch } from '../../../hooks/useApi'
import { useNavigationPreferences } from '../../../hooks/useNavigationPreferences'
import { useAuth } from '../../../contexts/AuthContext'

// Lazy load das áreas
const PulseSection = lazy(() => import('./PulseSection'))
const IdentidadeSection = lazy(() => import('./IdentidadeSection'))
const DiagnosticoSection = lazy(() => import('./DiagnosticoSection'))
const OperacaoSection = lazy(() => import('./OperacaoSection'))
const FarmsViabilidadeSection = lazy(() => import('./FarmsViabilidadeSection'))
const NegociacaoSection = lazy(() => import('./NegociacaoSection'))
const WorkflowSection = lazy(() => import('./WorkflowSection'))
const QuickActionsBar = lazy(() => import('./QuickActionsBar'))
const ClientePortalFiscalPanel = lazy(() => import('../ClientePortalFiscalPanel'))

export type WorkspaceArea = 'pulse' | 'identidade' | 'diagnostico' | 'gestao' | 'farms' | 'negociacao' | 'workflow' | 'fiscal'

interface AreaDef {
  key: WorkspaceArea
  label: string
  short: string
  icon: typeof Briefcase
}

const AREAS: AreaDef[] = [
  { key: 'pulse', label: 'Visão geral', short: 'Resumo', icon: Activity },
  { key: 'identidade', label: 'Cadastro', short: 'Cadastro', icon: Briefcase },
  { key: 'diagnostico', label: 'Diagnóstico', short: 'Diagnóstico', icon: Target },
  { key: 'gestao', label: 'Financeiro', short: 'Financeiro', icon: Database },
  { key: 'fiscal', label: 'Fiscal / SEFAZ', short: 'SEFAZ', icon: Landmark },
  { key: 'farms', label: 'Viabilidade', short: 'Viabilidade', icon: Sprout },
  { key: 'negociacao', label: 'Negociação', short: 'Deal', icon: Handshake },
  { key: 'workflow', label: 'Documentos e processos', short: 'Arquivos', icon: Workflow },
]
const AREA_DESCRIPTIONS: Record<WorkspaceArea, string> = {
  pulse: 'O próximo passo, os alertas e as últimas informações do atendimento.',
  identidade: 'Dados pessoais, contatos, propriedade e informações do cadastro.',
  gestao: 'Dívidas, contratos, caixa e planejamento financeiro do cliente.',
  workflow: 'Documentos, processos, solicitações e histórico do portal em um só lugar.',
  negociacao: 'Demandas, propostas e evolução das negociações.',
  fiscal: 'Documentos fiscais, consultas e conexão com a SEFAZ.',
  diagnostico: 'Indicadores, riscos e análises para apoiar as decisões.',
  farms: 'Cenários de produção e viabilidade das atividades rurais.',
}
const AREA_ORDER: WorkspaceArea[] = ['pulse', 'identidade', 'workflow', 'negociacao', 'gestao', 'fiscal', 'diagnostico', 'farms']

interface Props { urlId: string }
type EditTab = 'dados' | 'atendimento' | 'propriedade' | 'financeiro'

function areaFromSearchParams(params: URLSearchParams): WorkspaceArea {
  const raw = (params.get('area') || params.get('tab') || '').trim()
  const aliases: Record<string, WorkspaceArea> = {
    resumo: 'pulse',
    cadastro: 'identidade',
    identidade: 'identidade',
    diagnostico: 'diagnostico',
    'gestao-financeira': 'gestao',
    financeiro: 'gestao',
    fiscal: 'fiscal',
    sefaz: 'fiscal',
    gestao: 'gestao',
    farms: 'farms',
    viabilidade: 'farms',
    proposta: 'negociacao',
    propostas: 'negociacao',
    negociacoes: 'negociacao',
    negociacao: 'negociacao',
    documentos: 'workflow',
    arquivos: 'workflow',
    workflow: 'workflow',
  }
  if (aliases[raw]) return aliases[raw]
  return AREAS.some((a) => a.key === raw) ? (raw as WorkspaceArea) : 'pulse'
}

export default function WorkspaceShell({ urlId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const data = useClienteData(urlId)
  const [editArea, setEditArea] = useState<EditTab | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [contextExpanded, setContextExpanded] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const toolsRef = useRef<HTMLDetailsElement>(null)
  const { routeForTool } = useNavigationPreferences()
  const crmReturnTo = routeForTool('crm-aletis', '/crm')
  useEffect(() => { setEditArea(null); setNoteOpen(false); setCopilotOpen(false); setContextExpanded(false); setToolsOpen(false) }, [urlId])

  const [activeArea, setActiveArea] = useState<WorkspaceArea>(() => areaFromSearchParams(searchParams))

  useEffect(() => {
    const nextArea = areaFromSearchParams(searchParams)
    if (nextArea !== activeArea) setActiveArea(nextArea)
  }, [activeArea, searchParams])

  function changeArea(area: WorkspaceArea) {
    setActiveArea(area)
    const next = new URLSearchParams(searchParams)
    next.set('area', area)
    next.delete('tab')
    setSearchParams(next, { replace: true })
  }

  if (data.loading && !data.cliente) {
    return <ShellSkeleton />
  }
  if (data.error || !data.cliente) {
    return (
      <motion.div variants={fadeIn} initial="hidden" animate="visible" className="card-premium p-8 text-center">
        <p className="text-sm text-red-700 font-semibold">Erro ao carregar cliente</p>
        <p className="text-xs text-muted-foreground mt-1">{data.error ?? 'Cliente não encontrado'}</p>
        <Link to={crmReturnTo} className="inline-flex items-center gap-1.5 mt-4 text-sm text-foreground hover:underline">
          <ArrowLeft className="w-4 h-4" /> Voltar ao CRM ALETIS
        </Link>
      </motion.div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Breadcrumb */}
      <motion.div variants={slideUp} initial="hidden" animate="visible" className="mb-3">
        <Link to={crmReturnTo} className="inline-flex items-center gap-1.5 text-xs font-body text-muted-foreground hover:text-aletis-verde transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar à carteira{crmReturnTo.includes('?') ? ' filtrada' : ''}
        </Link>
      </motion.div>

      {/* Hero */}
      <motion.div variants={slideUp} initial="hidden" animate="visible">
        <Hero key={data.cliente.id} cliente={data.cliente} analises={data.analises} srai={data.srai} financialHealth={data.financialHealth} onEdit={() => setEditArea('dados')} onAddNote={() => setNoteOpen(true)} />
      </motion.div>

      <div className="client-workspace">
        <nav className="client-workspace-nav" aria-label="Áreas do cliente">
          <p className="client-nav-label">Atendimento</p>
          {AREA_ORDER.map(key => { const area = AREAS.find(item => item.key === key)!; const Icon = area.icon; return <button key={area.key} type="button" aria-current={activeArea === area.key ? 'page' : undefined} onClick={() => changeArea(area.key)} className="client-nav-button"><Icon size={17} strokeWidth={1.7} /><span>{area.label}</span></button> })}
          <p className="client-nav-label mt-4">Apoio ao atendimento</p>
          <button type="button" onClick={() => setCopilotOpen(true)} className="client-nav-button"><Bot size={17} /><span>Assistente ALIX</span></button>
          <button type="button" onClick={() => { setToolsOpen(true); requestAnimationFrame(() => { toolsRef.current?.scrollIntoView({ block: 'start' }); toolsRef.current?.querySelector('summary')?.focus({ preventScroll: true }) }) }} className="client-nav-button"><Sparkles size={17} /><span>Mais ferramentas</span></button>
        </nav>
        <div className="min-w-0">
          <header className="client-area-title"><h2>{AREAS.find(area => area.key === activeArea)?.label}</h2><p>{AREA_DESCRIPTIONS[activeArea]}</p></header>
      {/* Área ativa com AnimatePresence */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${data.cliente.id}:${activeArea}`}
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <Suspense fallback={<AreaSkeleton />}>
            {activeArea === 'pulse' && <PulseSection data={data} onNavigate={changeArea} />}
            {activeArea === 'identidade' && <IdentidadeSection data={data} onEdit={setEditArea} />}
            {activeArea === 'diagnostico' && <DiagnosticoSection data={data} onNavigateArea={changeArea} />}
            {activeArea === 'gestao' && <OperacaoSection data={data} onEditFinancial={() => setEditArea('financeiro')} />}
            {activeArea === 'fiscal' && <ClientePortalFiscalPanel key={data.apiId??urlId} clienteId={data.apiId??urlId} />}
            {activeArea === 'farms' && <FarmsViabilidadeSection data={data} />}
            {activeArea === 'negociacao' && <NegociacaoSection data={data} />}
            {activeArea === 'workflow' && <WorkflowSection data={data} />}
          </Suspense>
        </motion.div>
      </AnimatePresence>

      <details ref={toolsRef} open={toolsOpen} onToggle={(event) => setToolsOpen(event.currentTarget.open)} className="mt-6 scroll-mt-24 rounded-xl border border-aletis-borda bg-card px-3 py-2 dark:border-white/10 dark:bg-card">
        <summary className="cursor-pointer text-sm font-semibold text-foreground dark:text-white">Mais ferramentas e assistente ALIX</summary>
        {toolsOpen && <Suspense fallback={null}><QuickActionsBar key={data.apiId ?? urlId} urlId={urlId} cliente={data.cliente} apiId={data.apiId} onReload={data.reload} /></Suspense>}
        <section className="mt-3 overflow-hidden rounded-xl border border-aletis-gold/25 bg-card dark:bg-card">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5"><Bot className="h-4 w-4 shrink-0 text-aletis-gold-escuro" /><span className="text-xs font-semibold text-foreground dark:text-white">ALIX neste cliente</span><p className="hidden min-w-0 flex-1 truncate px-2 text-xs text-muted-foreground lg:block">{data.cliente.proximaAcao?.descricao || 'Contexto, documentos e próximos passos do atendimento'}</p><button type="button" aria-expanded={contextExpanded} onClick={() => setContextExpanded((current) => !current)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-[var(--text-soft)] hover:bg-aletis-bege dark:text-aletis-sage dark:hover:bg-white/5">{contextExpanded ? 'Recolher contexto' : 'Ver contexto'}<ChevronDown className={`h-3 w-3 transition ${contextExpanded ? 'rotate-180' : ''}`} /></button><button type="button" onClick={() => setCopilotOpen(true)} className="rounded-lg bg-aletis-verde px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-aletis-verde-medio dark:bg-aletis-gold dark:text-aletis-verde">Conversar com ALIX</button></div>
          {contextExpanded && <CrmCopilotPanel key={data.apiId ?? urlId} data={data} onOpenChat={() => setCopilotOpen(true)} />}
        </section>
      </details>

        </div>
      </div>

      {editArea && (
        <ClienteEditModal
          key={`${data.cliente.id}:${editArea}`}
          cliente={data.cliente}
          initialTab={editArea}
          onClose={() => setEditArea(null)}
          onOpenFinancialWorkspace={() => {
            setEditArea(null)
            changeArea('gestao')
          }}
          onSave={async (patch) => {
            await data.patchCliente(patch)
            await data.reload()
            setEditArea(null)
          }}
        />
      )}

      {noteOpen && <QuickNoteDialog data={data} onClose={() => setNoteOpen(false)} />}

      {copilotOpen && (
        <ClienteCopilotDialog key={data.apiId ?? urlId} data={data} onClose={() => setCopilotOpen(false)} />
      )}
    </div>
  )
}

function QuickNoteDialog({ data, onClose }: { data: UseClienteDataReturn; onClose: () => void }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const notes = [...(data.cliente?.notas ?? [])].reverse().slice(0, 5)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!text.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      await data.addNota(text, user.nome)
      setText('')
      setSaved(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a informação.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <MotionDialog
      title="Adicionar informação"
      subtitle={data.cliente?.nome ?? 'Cliente'}
      eyebrow="Histórico do cliente"
      icon={<StickyNote size={20} />}
      onClose={onClose}
      size="md"
      footer={<div className="flex w-full justify-end gap-2"><button type="button" onClick={onClose} className={uiAction.secondary}>Fechar</button><button type="submit" form="quick-client-note" disabled={saving || !text.trim()} className={uiAction.primary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar informação</button></div>}
    >
      <form id="quick-client-note" onSubmit={save} className="space-y-3">
        <p className="text-sm text-[var(--text-soft)]">Registre o que foi conversado, uma pendência ou qualquer contexto importante. A informação ficará no histórico deste cliente.</p>
        <label className="block text-sm font-semibold text-foreground">Nova informação
          <textarea autoFocus required rows={5} value={text} onChange={(event) => { setText(event.target.value); setSaved(false) }} placeholder="Ex.: Christian conversou com o cliente. Ele enviará os documentos até sexta-feira." className="mt-1 w-full resize-y rounded-xl border border-aletis-borda bg-card px-3 py-2.5 font-normal leading-relaxed outline-none focus:border-aletis-verde" />
        </label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {saved && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">Informação salva no histórico do cliente.</p>}
      </form>
      <div className="mt-5 border-t border-aletis-borda pt-4">
        <h3 className="text-sm font-semibold text-foreground">Informações recentes</h3>
        {notes.length ? <div className="mt-2 space-y-2">{notes.map((note) => <article key={note.id} className="rounded-xl bg-aletis-bege/60 p-3"><p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{note.texto}</p><p className="mt-2 text-xs text-muted-foreground">{note.autor}{note.criadoEm ? ` · ${new Date(note.criadoEm).toLocaleDateString('pt-BR')}` : ''}</p></article>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Ainda não há informações registradas.</p>}
      </div>
    </MotionDialog>
  )
}

type BriefingMini = {
  resumoExecutivo?: string
  sugestaoPrimeiraAcao?: string
  destaques?: Array<{ titulo: string; detalhe: string; severidade: 'info' | 'atencao' | 'critico' }>
  proximasAcoes?: string[]
}

type DocMini = { id: string; nome: string; categoria: string; resumoIa?: string }
type PropostaMini = { id: string; titulo?: string; status?: string; valorProposta?: number; valorProposto?: number }
type DealMini = { negociacoes?: unknown[]; propostasOrfas?: unknown[] }
type OperationalDossier = {
  atualizadoEm: string
  qualidade: { score: number; nivel: string; resumo: string }
  documentos: {
    total: number
    porGrupo: Record<string, number>
    faltantes: string[]
    revisao: Array<{ id: string; nome: string; motivo: string }>
    principais: Array<{ id: string; nome: string; grupoDocumento: string; categoriaInteligente: string; prioridade: string; resumoIa?: string }>
  }
  propostas: { total: number; abertas: number; valorTotal: number; itens: Array<{ id: string; titulo: string; status?: string; credor?: string; valor?: number }> }
  core: { tarefasPendentes: number; tarefasAtrasadas: number; reunioesFuturas: number; contratosAtivos: number; eventosTimeline: number }
  modulos: { farms: number; gestaoFinanceira: number }
  pendencias: Array<{ id: string; area: string; prioridade: string; titulo: string; detalhe: string; acaoSugerida: string }>
  proximasAcoes: Array<{ titulo: string; detalhe: string; area: string; prioridade: string }>
  instrucoesAlix: string[]
}

function CrmCopilotPanel({ data, onOpenChat }: { data: UseClienteDataReturn; onOpenChat: () => void }) {
  const { cliente, apiId, analises, srai } = data
  const [briefing, setBriefing] = useState<BriefingMini | null>(null)
  const [docs, setDocs] = useState<DocMini[] | null>(null)
  const [propostas, setPropostas] = useState<PropostaMini[] | null>(null)
  const [deal, setDeal] = useState<DealMini | null>(null)
  const [dossieOperacional, setDossieOperacional] = useState<OperationalDossier | null>(null)
  const [loading, setLoading] = useState(false)
  const [failedSources, setFailedSources] = useState<string[]>([])
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!apiId) return
    const controller = new AbortController()
    setLoading(true)
    setFailedSources([])
    Promise.allSettled([
      apiFetch<BriefingMini>(`/alix/briefing/${encodeURIComponent(apiId)}`, { signal: controller.signal }),
      apiFetch<DocMini[]>(`/clientes/${encodeURIComponent(apiId)}/documentos`, { signal: controller.signal }),
      apiFetch<PropostaMini[]>(`/propostas?clienteId=${encodeURIComponent(apiId)}&full=1`, { signal: controller.signal }),
      apiFetch<DealMini>(`/deal-room/cliente/${encodeURIComponent(apiId)}/with-propostas`, { signal: controller.signal }),
      apiFetch<OperationalDossier>(`/clientes/${encodeURIComponent(apiId)}/dossie-operacional`, { signal: controller.signal }),
    ])
      .then(([b, d, p, dr, od]) => {
        if (controller.signal.aborted) return
        setBriefing(b.status === 'fulfilled' ? b.value : null)
        setDocs(d.status === 'fulfilled' && Array.isArray(d.value) ? d.value : null)
        setPropostas(p.status === 'fulfilled' && Array.isArray(p.value) ? p.value : null)
        setDeal(dr.status === 'fulfilled' ? dr.value : null)
        setDossieOperacional(od.status === 'fulfilled' ? od.value : null)
        setFailedSources([b, d, p, dr, od].flatMap((result, index) => result.status === 'rejected' ? [['resumo', 'documentos', 'propostas', 'negociações', 'dossiê operacional'][index]] : []))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [apiId, attempt])

  if (!cliente || !apiId) return null

  const categorias = new Set((docs ?? []).map((d) => d.categoria))
  const faltamDocs = dossieOperacional?.documentos?.faltantes ?? []
  const alertas = [
    ...((srai?.alertas ?? []).slice(0, 2).map((a) => ({ texto: a, nivel: 'SRAI' }))),
    ...((analises?.alertasTop ?? []).slice(0, 2).map((a) => ({ texto: a.mensagem, nivel: a.nivel }))),
  ].slice(0, 3)
  const dealCount = deal?.negociacoes?.length ?? null
  const propostaCount = dossieOperacional?.propostas?.total ?? propostas?.length ?? null
  const action = dossieOperacional?.proximasAcoes?.[0]?.titulo || briefing?.sugestaoPrimeiraAcao || cliente.proximaAcao?.descricao || 'Definir próxima ação do atendimento'
  const pendenciasOperacionais = dossieOperacional?.pendencias
    ? dossieOperacional.pendencias.map((p) => p.titulo)
    : [
        faltamDocs.length ? `Documentos pendentes: ${faltamDocs.slice(0, 3).join(', ')}` : null,
        propostaCount === 0 ? 'Nenhuma proposta cadastrada ou importada' : null,
        dealCount === 0 ? 'Nenhuma negociação aberta no Deal Room' : null,
        !cliente.proximaAcao ? 'Próxima ação ainda sem data/responsável' : null,
        cliente.dividas.length === 0 ? 'Contratos/dívidas ainda não cadastrados no dossiê' : null,
      ].filter(Boolean) as string[]
  const healthNarrative = financialHealthNarrative(data.financialHealth)

  return (
    <section className="border-t border-aletis-borda bg-card p-3 dark:border-white/10 dark:bg-card lg:p-4" aria-busy={loading}>
      {failedSources.length > 0 && <div role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><span className="flex-1">Contexto parcial: não foi possível consultar {failedSources.join(', ')}.</span><button type="button" onClick={() => setAttempt((current) => current + 1)} disabled={loading} className="font-semibold underline">Tentar novamente</button></div>}
      <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.35fr)_minmax(300px,0.95fr)] xl:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-aletis-dourado/15">
              <Bot className="w-5 h-5 text-aletis-dourado" />
            </div>
            <div>
              <p className="text-sm font-display font-semibold text-foreground">Copiloto do CRM</p>
              <p className="text-[11px] text-muted-foreground">Leitura operacional, sem escrever sem revisão.</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--text-soft)]">
            {loading
              ? 'Atualizando contexto do cliente...'
              : healthNarrative || dossieOperacional?.qualidade?.resumo || briefing?.resumoExecutivo || 'Preencha documentos, financeiro e propostas para a IA ter mais contexto.'}
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-2">
          <CopilotTile icon={FileText} label="Documentos" value={String(dossieOperacional?.documentos?.total ?? docs?.length ?? '—')} hint={!docs && !dossieOperacional ? loading ? 'consultando' : 'não foi possível consultar' : faltamDocs.length ? `${faltamDocs.length} categoria(s) não encontrada(s)` : `${categorias.size} categoria(s) identificada(s)`} tone={faltamDocs.length ? 'warn' : 'neutral'} />
          <CopilotTile icon={Handshake} label="Negociações" value={String(dealCount ?? '—')} hint={deal ? `${deal.propostasOrfas?.length ?? 0} proposta(s) sem vínculo` : loading ? 'consultando' : 'não foi possível consultar'} tone={dealCount == null ? 'neutral' : dealCount ? 'good' : 'warn'} />
          <CopilotTile icon={Sparkles} label="Propostas" value={String(propostaCount ?? '—')} hint={propostaCount == null ? loading ? 'consultando' : 'não foi possível consultar' : 'propostas deste cliente'} tone={propostaCount ? 'good' : 'neutral'} />
          <CopilotTile icon={CalendarClock} label="Próxima ação" value={cliente.proximaAcao ? 'definida' : 'pendente'} hint={cliente.proximaAcao?.data} tone={cliente.proximaAcao ? 'good' : 'warn'} />
        </div>

        <div className="min-w-0 rounded-xl border border-aletis-borda bg-aletis-bege/30 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">Ação sugerida</p>
              <p className="mt-1 text-xs font-semibold leading-snug text-foreground line-clamp-2">{action}</p>
            </div>
          </div>
          {pendenciasOperacionais.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-[11px] font-bold uppercase text-amber-800">Pendências 360</p>
              <ul className="mt-1 space-y-1">
                {pendenciasOperacionais.slice(0, 2).map((item) => (
                  <li key={item} className="flex gap-1.5 text-[11px] text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    <span className="leading-snug line-clamp-1">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {alertas.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-aletis-borda/60 pt-2">
              {alertas.slice(0, 1).map((a, i) => (
                <p key={`${a.nivel}-${i}`} className="flex gap-1.5 text-[11px] text-amber-800">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-1">{a.texto}</span>
                </p>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Link to={`/clientes/${cliente.id}?area=workflow`} className="inline-flex h-8 items-center rounded-lg border border-aletis-borda bg-card px-2.5 text-[11px] font-semibold text-foreground hover:bg-aletis-bege">
              Documentos
            </Link>
            <Link to={`/clientes/${cliente.id}?area=negociacao`} className="inline-flex h-8 items-center rounded-lg border border-aletis-borda bg-card px-2.5 text-[11px] font-semibold text-foreground hover:bg-aletis-bege">
              Negociação
            </Link>
            <button
              type="button"
              onClick={onOpenChat}
              className="inline-flex h-8 items-center rounded-lg bg-aletis-dourado px-2.5 text-[11px] font-semibold text-white hover:bg-aletis-dourado-escuro"
            >
              Conversar com IA
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function financialHealthNarrative(health: UseClienteDataReturn['financialHealth']): string | null {
  if (!health || health.score == null) return null
  const pressures = health.fatores
    .filter((factor) => factor.tipo !== 'positivo')
    .slice(0, 2)
    .map((factor) => factor.titulo.toLowerCase())
  const level = healthLevelLabel(health.nivel).toLowerCase()
  if (pressures.length > 0) {
    return `Saúde financeira ${level} (${health.score}/100). ${pressures.join(' e ')} exigem acompanhamento do consultor.`
  }
  return `Saúde financeira ${level} (${health.score}/100), sem pressão relevante nos indicadores atualmente disponíveis.`
}

type ClienteCopilotMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type PersistedCopilotSession = {
  id: string
  messages?: Array<{
    id?: string
    role?: string
    content?: string
    timestamp?: number
  }>
}

function initialCopilotMessages(cliente: Cliente): ClienteCopilotMessage[] {
  return [
    {
      id: 'intro',
      role: 'assistant',
      content: [
        '## Contexto carregado',
        `- Cliente: ${cliente.nome}`,
        '- Posso resumir situação, conferir documentos, analisar propostas, sugerir próxima ação e preparar diagnóstico.',
        '- Vou sinalizar quando algum dado não constar no CRM em vez de preencher por suposição.',
      ].join('\n'),
    },
  ]
}

function extractVisibleUserPrompt(content: string): string {
  const marker = '[PERGUNTA DO CONSULTOR]'
  const markerIndex = content.lastIndexOf(marker)
  if (markerIndex >= 0) return content.slice(markerIndex + marker.length).trim()

  const hiddenPrefixes = [
    'Cliente ativo:',
    'Responda de forma objetiva',
    'Use SEMPRE esta estrutura',
  ]
  const hiddenLines = new Set([
    '## Resumo',
    '- síntese objetiva',
    '## O que consta no CRM',
    '- fatos confirmados',
    '## Riscos e pendências',
    '- pendências ou "não consta no CRM"',
    '## Próxima ação',
    '- uma ação prática para o consultor',
  ])
  const visible = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !hiddenPrefixes.some((prefix) => line.startsWith(prefix)))
    .filter((line) => !hiddenLines.has(line))

  return (visible.length ? visible.join('\n') : content).trim()
}

function mapPersistedCopilotMessages(session: PersistedCopilotSession): ClienteCopilotMessage[] {
  return (session.messages ?? [])
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message, index) => ({
      id: message.id || `persisted-${index}`,
      role: message.role as 'user' | 'assistant',
      content: message.role === 'user'
        ? extractVisibleUserPrompt(String(message.content || ''))
        : String(message.content || ''),
    }))
    .filter((message) => message.content.trim().length > 0)
}

function cleanCopilotInline(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .trim()
}

function compactOperationalDossierForPrompt(dossie: OperationalDossier | null): string {
  if (!dossie) return 'Dossiê operacional ainda não carregado nesta sessão.'
  return JSON.stringify({
    atualizadoEm: dossie.atualizadoEm,
    qualidade: dossie.qualidade,
    documentos: {
      total: dossie.documentos.total,
      porGrupo: dossie.documentos.porGrupo,
      faltantes: dossie.documentos.faltantes,
      revisao: dossie.documentos.revisao.slice(0, 8),
      principais: dossie.documentos.principais.slice(0, 8),
    },
    propostas: dossie.propostas,
    core: dossie.core,
    modulos: dossie.modulos,
    pendencias: dossie.pendencias.slice(0, 8),
    proximasAcoes: dossie.proximasAcoes.slice(0, 6),
    instrucoesAlix: dossie.instrucoesAlix,
  }, null, 2).slice(0, 14000)
}

function CopilotAnswer({ content }: { content: string }) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return <p className="text-sm text-[var(--text-soft)]">Sem conteúdo retornado.</p>

  const blocks: Array<{ type: 'heading' | 'bullet' | 'number' | 'paragraph'; text: string }> = []
  for (const line of lines) {
    const heading = line.match(/^#{1,4}\s+(.+)$/) || line.match(/^\*\*(.+?)\*\*:?$/)
    if (heading) {
      blocks.push({ type: 'heading', text: cleanCopilotInline(heading[1]) })
      continue
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/)
    if (bullet) {
      blocks.push({ type: 'bullet', text: cleanCopilotInline(bullet[1]) })
      continue
    }
    const numbered = line.match(/^\d+[\.)]\s+(.+)$/)
    if (numbered) {
      blocks.push({ type: 'number', text: cleanCopilotInline(numbered[1]) })
      continue
    }
    blocks.push({ type: 'paragraph', text: cleanCopilotInline(line) })
  }

  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <p key={`${block.type}-${index}`} className="pt-1 text-[11px] font-bold uppercase text-foreground">
              {block.text}
            </p>
          )
        }
        if (block.type === 'bullet' || block.type === 'number') {
          return (
            <div key={`${block.type}-${index}`} className="flex gap-2 rounded-lg bg-aletis-bege/40 px-2.5 py-2">
              <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-aletis-dourado" />
              <p className="text-sm leading-relaxed text-foreground">{block.text}</p>
            </div>
          )
        }
        return (
          <p key={`${block.type}-${index}`} className="text-sm leading-relaxed text-[var(--text-soft)]">
            {block.text}
          </p>
        )
      })}
    </div>
  )
}

function ClienteCopilotDialog({ data, onClose }: { data: UseClienteDataReturn; onClose: () => void }) {
  const cliente = data.cliente!
  const apiId = data.apiId || cliente.id
  const sessionId = `crm-copilot-${apiId}`
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [memory, setMemory] = useState<string>('')
  const [dossieOperacional, setDossieOperacional] = useState<OperationalDossier | null>(null)
  const [messages, setMessages] = useState<ClienteCopilotMessage[]>(() => initialCopilotMessages(cliente))

  useEffect(() => {
    let cancelled = false
    setLoadingHistory(true)
    apiFetch<PersistedCopilotSession>(`/alix/session/${encodeURIComponent(sessionId)}`)
      .then((session) => {
        if (cancelled) return
        const restored = mapPersistedCopilotMessages(session)
        setMessages(restored.length > 0 ? restored : initialCopilotMessages(cliente))
      })
      .catch(() => {
        if (!cancelled) setMessages(initialCopilotMessages(cliente))
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false)
      })
    return () => { cancelled = true }
  }, [sessionId, cliente.id, cliente.nome])

  useEffect(() => {
    let cancelled = false
    apiFetch<{ markdown: string }>(`/alix/memory/${encodeURIComponent(apiId)}`)
      .then((r) => { if (!cancelled) setMemory(r.markdown || '') })
      .catch(() => { if (!cancelled) setMemory('') })
    return () => { cancelled = true }
  }, [apiId])

  async function refreshDossieOperacional() {
    try {
      const dossie = await apiFetch<OperationalDossier>(`/clientes/${encodeURIComponent(apiId)}/dossie-operacional`)
      setDossieOperacional(dossie)
      return dossie
    } catch {
      setDossieOperacional(null)
      return null
    }
  }

  useEffect(() => {
    let cancelled = false
    apiFetch<OperationalDossier>(`/clientes/${encodeURIComponent(apiId)}/dossie-operacional`)
      .then((r) => { if (!cancelled) setDossieOperacional(r) })
      .catch(() => { if (!cancelled) setDossieOperacional(null) })
    return () => { cancelled = true }
  }, [apiId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text: string) {
    const message = text.trim()
    if (!message || loading || loadingHistory) return
    setInput('')
    setLoading(true)
    const userMsg: ClienteCopilotMessage = { id: `u-${Date.now()}`, role: 'user', content: message }
    const pendingId = `a-${Date.now()}`
    setMessages((prev) => [...prev, userMsg, { id: pendingId, role: 'assistant', content: 'Analisando o contexto do cliente...' }])
    try {
      const resp = await apiFetch<{
        reply: string | { content?: string }
        sessionId: string
      }>('/alix/chat', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          clienteId: apiId,
          message: [
            `Cliente ativo: ${cliente.nome} (${apiId}).`,
            'Dossiê operacional do CRM, para uso factual e sem extrapolação:',
            compactOperationalDossierForPrompt(dossieOperacional),
            'Responda de forma objetiva para o consultor ALETIS. Não invente; se faltar dado, diga exatamente o que falta.',
            'Use SEMPRE esta estrutura, com no máximo 12 bullets no total:',
            '## Resumo',
            '- síntese objetiva',
            '## Fatos no CRM',
            '- fatos confirmados e documentos/fontes internas disponíveis',
            '## Inferências e limites',
            '- inferências operacionais separadas de fatos, ou "não consta no CRM"',
            '## Pendências',
            '- documentos/campos/processos faltantes',
            '## Próxima ação',
            '- uma ação prática para o consultor',
            '[PERGUNTA DO CONSULTOR]',
            message,
          ].join('\n'),
        }),
      })
      const content = typeof resp.reply === 'string'
        ? resp.reply
        : (resp.reply?.content || 'Não consegui gerar resposta para este contexto.')
      setMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content } : m))
    } catch (err) {
      setMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, content: `Erro ao consultar a IA: ${(err as Error).message}` } : m))
    } finally {
      setLoading(false)
    }
  }

  async function uploadCopilotFiles(files: FileList | null | undefined) {
    const selected = Array.from(files ?? [])
    if (selected.length === 0 || uploadingDocs) return
    setUploadingDocs(true)
    const pendingId = `upload-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        role: 'assistant',
        content: `Recebendo ${selected.length} arquivo(s), anexando ao cliente e preparando leitura IA...`,
      },
    ])
    const ok: string[] = []
    const fail: string[] = []
    try {
      for (const file of selected) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('categoria', 'outros')
        const res = await fetch(`/api/clientes/${encodeURIComponent(apiId)}/documentos?categoria=outros`, {
          method: 'POST',
          body: fd,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || json.success === false) {
          fail.push(`${file.name}: ${json.error || `HTTP ${res.status}`}`)
        } else {
          ok.push(file.name)
        }
      }
      await data.reload()
      const statusText = [
        ok.length ? `${ok.length} arquivo(s) anexado(s): ${ok.slice(0, 3).join(', ')}` : '',
        fail.length ? `${fail.length} falha(s): ${fail.slice(0, 2).join(' | ')}` : '',
      ].filter(Boolean).join('\n')
      setMessages((prev) => prev.map((m) => (
        m.id === pendingId
          ? { ...m, content: `## Documentos recebidos\n- ${statusText || 'Nenhum arquivo processado.'}\n- Os arquivos ficam no cofre documental deste cliente.` }
          : m
      )))
      if (ok.length > 0) {
        await refreshDossieOperacional()
        await sendMessage([
          `Acabei de anexar ${ok.length} documento(s) ao cliente ${cliente.nome}.`,
          'Leia o contexto disponível no CRM e me devolva:',
          '1. resumo operacional do que entrou;',
          '2. campos ou documentos que preciso conferir;',
          '3. próxima ação prática.',
        ].join('\n'))
      }
    } catch (err: any) {
      setMessages((prev) => prev.map((m) => (
        m.id === pendingId ? { ...m, content: `Erro ao anexar documentos: ${String(err?.message || err)}` } : m
      )))
    } finally {
      setUploadingDocs(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const prompts = [
    'Resumo para reunião com fatos e pendências.',
    'Quais documentos faltam ou precisam revisão?',
    'Analisar propostas, negociações e próximos passos.',
    'Montar checklist operacional para diagnóstico.',
  ]

  return (
    <MotionDialog
      title="IA do cliente"
      subtitle={cliente.nome}
      icon={<Bot size={20} />}
      onClose={onClose}
      size="lg"
      collapsible
      bodyClassName="flex min-h-0 overflow-hidden p-0"
    >
      <div className="grid h-[calc(100dvh-96px)] min-h-0 w-full grid-cols-1 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-b border-aletis-borda bg-[#f7f3ea] p-4 lg:border-b-0 lg:border-r">
          <div>
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Contexto do cliente</p>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
              <ContextChip label="Estágio" value={cliente.estagio} />
              <ContextChip label="Credor" value={cliente.credor || 'A definir'} />
              <ContextChip label="Dívida" value={fmtBRLCompact(cliente.valorTotalDivida || 0)} />
              <ContextChip label="Score 360" value={dossieOperacional ? `${dossieOperacional.qualidade.score}/100` : 'carregando'} />
              <ContextChip label="Docs" value={dossieOperacional ? `${dossieOperacional.documentos.total}` : 'carregando'} />
              <ContextChip label="Memória" value={memory ? `${Math.round(memory.length / 1000)}k chars` : 'vazia'} />
              <ContextChip label="Histórico" value={loadingHistory ? 'carregando' : `${messages.length} mensagens`} />
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-aletis-borda bg-white/75 p-3">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Prioridades detectadas</p>
            <div className="mt-2 space-y-2">
              {(dossieOperacional?.proximasAcoes ?? []).slice(0, 4).map((acao, index) => (
                <div key={`${acao.area}-${index}`} className="rounded-lg bg-aletis-bege/50 px-2.5 py-2">
                  <p className="text-xs font-semibold leading-snug text-foreground">{acao.titulo}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{acao.detalhe}</p>
                </div>
              ))}
              {!dossieOperacional && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Carregando score operacional, documentos e pendências deste cliente.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { void refreshDossieOperacional() }}
              className="mt-2 text-[11px] font-semibold text-foreground hover:underline"
            >
              Atualizar contexto
            </button>
          </div>
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-bold uppercase text-muted-foreground">Perguntas rápidas</p>
            {prompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => sendMessage(p)}
                disabled={loading || loadingHistory}
                className="w-full rounded-lg border border-aletis-borda bg-card px-3 py-2 text-left text-xs font-semibold text-foreground transition hover:border-aletis-dourado/50 hover:bg-aletis-dourado/5 disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
          <p className="mt-4 rounded-lg border border-aletis-dourado/25 bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-[var(--text-soft)]">
            A conversa fica salva neste cliente. Dados ausentes devem aparecer como pendência, não como conclusão.
          </p>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.txt"
            onChange={(e) => { void uploadCopilotFiles(e.target.files) }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingDocs}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-aletis-verde/30 bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-aletis-verde/10 disabled:opacity-50"
          >
            {uploadingDocs ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            Anexar e pedir leitura
          </button>
        </aside>
        <section className="flex min-h-0 flex-col bg-card">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-aletis-bege/20 p-4">
            {loadingHistory && (
              <div className="mx-auto w-fit rounded-full border border-aletis-borda bg-card px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                Carregando histórico deste cliente...
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[92%] rounded-xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'ml-auto bg-aletis-verde text-white'
                    : 'mr-auto border border-aletis-borda bg-card text-foreground'
                }`}
              >
                {m.role === 'assistant' ? <CopilotAnswer content={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              sendMessage(input)
            }}
            className="border-t border-aletis-borda bg-card p-3"
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingDocs}
                className="hidden h-11 w-11 shrink-0 items-center justify-center self-end rounded-xl border border-aletis-borda text-[var(--text-soft)] hover:bg-aletis-bege disabled:opacity-50 sm:flex"
                title="Anexar documento ao cliente"
                aria-label="Anexar documento ao cliente"
              >
                {uploadingDocs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Pergunte sobre documentos, propostas, diagnóstico, riscos ou próxima ação..."
                rows={2}
                disabled={loadingHistory}
                className="input-field min-w-0 flex-1 resize-none py-2.5 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(input)
                  }
                }}
              />
              <button
                type="submit"
                disabled={loading || loadingHistory || !input.trim()}
                className="inline-flex items-center self-end gap-2 rounded-xl bg-aletis-verde px-4 py-2.5 text-sm font-semibold text-white hover:bg-aletis-verde/90 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar
              </button>
            </div>
          </form>
        </section>
      </div>
    </MotionDialog>
  )
}

function ContextChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-aletis-borda bg-card px-3 py-2">
      <p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-foreground" title={value}>{value}</p>
    </div>
  )
}

function CopilotTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Bot
  label: string
  value: string
  hint?: string
  tone: 'good' | 'warn' | 'neutral'
}) {
  const cls = tone === 'good'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : tone === 'warn'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-aletis-borda bg-card text-foreground'
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2 ${cls}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <p className="mt-1 truncate text-lg font-display font-semibold leading-none">{value}</p>
      {hint && <p className="mt-1 truncate text-[11px] opacity-80">{hint}</p>}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Hero do cliente
// ────────────────────────────────────────────────────────────
function Hero({ cliente, analises, srai, financialHealth, onEdit, onAddNote }: {
  cliente: Cliente
  analises: ReturnType<typeof useClienteData>['analises']
  srai: ReturnType<typeof useClienteData>['srai']
  financialHealth: ReturnType<typeof useClienteData>['financialHealth']
  onEdit: () => void
  onAddNote: () => void
}) {
  const [healthOpen, setHealthOpen] = useState(false)
  const [indicatorsOpen, setIndicatorsOpen] = useState(false)
  const margemPct = analises?.margemCliente?.margemPct
  const saldoLivre = analises?.fluxoCaixaSafra?.saldoLivre
  const sraiClass = srai?.classificacao
  const sraiTone =
    sraiClass === 'critico' ? 'border-red-200 bg-red-50 text-red-800' :
    sraiClass === 'alto' ? 'border-amber-200 bg-amber-50 text-amber-800' :
    sraiClass === 'moderado' ? 'border-blue-200 bg-blue-50 text-blue-800' :
    'border-emerald-200 bg-emerald-50 text-emerald-800'

  return (
    <header className="client-header">
      <div className="client-header-main">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2"><span className="ui-page-eyebrow !mb-0">Atendimento do cliente</span><StageBadge estagio={cliente.estagio} /></div>
          <h1 className="client-header-title">{cliente.nome}</h1>
          <div className="client-header-context"><span className="inline-flex items-center gap-1.5"><MapPin size={13} />{cliente.cidade || 'Cidade não informada'}{cliente.uf ? '/' + cliente.uf : ''}</span><span>Consultor: {cliente.consultor || 'não atribuído'}</span>{cliente.telefone && <span className="inline-flex items-center gap-1.5"><Phone size={13} />{cliente.telefone}</span>}</div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={onEdit} className={uiAction.secondary}><Pencil size={15} /> Editar cadastro</button><button type="button" onClick={onAddNote} className={uiAction.primary}><Plus size={16} /> Registrar informação</button></div>
      </div>
      <details className="mt-4">
        <summary className="inline-flex cursor-pointer flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground"><ChevronDown size={14} /> Dados e indicadores do cliente <span aria-hidden="true">·</span><span className="tabular-nums">Dívida: {fmtBRLCompact(cliente.resumoFinanceiro.totalDivida)}</span></summary>
        <div className="mt-4 grid gap-5 rounded-xl border border-border bg-card p-4 lg:grid-cols-2">
          <div><div className="grid grid-cols-2 gap-3"><HeroMeta label="Documento" value={cliente.cpfCnpj || 'Não informado'} mono /><HeroMeta label="Localização" value={[cliente.cidade, cliente.uf].filter(Boolean).join('/') || 'Não informada'} icon={MapPin} /><HeroMeta label="Contato" value={cliente.telefone || 'Não informado'} icon={Phone} /><HeroMeta label="Consultor" value={cliente.consultor || 'Não atribuído'} /></div>{sraiClass && <span className={'mt-3 inline-flex rounded-lg border px-2.5 py-1 text-xs ' + sraiTone}>SRAI {srai?.scoreTotal ?? '?'} · {sraiClass}</span>}</div>
        <motion.div variants={fadeIn} initial="hidden" animate="visible" className="grid content-start grid-cols-2 gap-3">
          <div className="col-span-2"><Kpi label="Dívida atual" value={fmtBRLCompact(cliente.resumoFinanceiro.totalDivida)} tone="bad" sub="exposição cadastrada" /></div>
          <div className="col-span-2 rounded-xl bg-aletis-bege/60 px-3 py-2.5"><p className="text-[11px] font-semibold uppercase text-muted-foreground">Próxima ação</p><p className="mt-1 text-sm font-semibold text-foreground">{cliente.proximaAcao?.descricao || 'Nenhuma ação definida'}</p><p className="mt-0.5 text-xs text-muted-foreground">{cliente.proximaAcao?.data ? new Date(`${cliente.proximaAcao.data.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : 'Defina uma ação na aba Resumo'}</p></div>
          <button type="button" aria-expanded={indicatorsOpen} onClick={() => setIndicatorsOpen((current) => !current)} className="col-span-2 inline-flex min-h-9 items-center justify-between rounded-xl border border-aletis-borda bg-card px-3 text-xs font-semibold text-[var(--text-soft)] hover:bg-aletis-bege">{indicatorsOpen ? 'Ocultar indicadores financeiros' : 'Ver indicadores financeiros'}<ChevronDown className={`h-3.5 w-3.5 transition ${indicatorsOpen ? 'rotate-180' : ''}`} /></button>
          {indicatorsOpen && <>
          <Kpi label="Saldo livre" value={saldoLivre != null ? fmtBRLCompact(saldoLivre) : '—'} tone={(saldoLivre ?? 0) >= 0 ? 'good' : 'bad'} sub="safra atual" />
          <Kpi label="Margem cliente" value={margemPct != null ? `${margemPct.toFixed(1)}%` : '—'} tone={(margemPct ?? 0) > 15 ? 'good' : (margemPct ?? 0) > 0 ? 'warn' : 'bad'} sub={analises?.margemCliente?.classificacao || 'sem lançamentos vinculados'} />
          <div className="col-span-2"><FinancialHealthKpi
            health={financialHealth}
            fallbackScore={cliente.saudeFinanceira}
            open={healthOpen}
            onToggle={() => setHealthOpen((current) => !current)}
          /></div>
          {healthOpen && financialHealth && (
            <div className="col-span-2 border-t border-aletis-borda pt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase text-muted-foreground">Composição da saúde financeira</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-soft)]">
                    Cobertura {financialHealth.coberturaPct}% · confiança {healthConfidenceLabel(financialHealth.confianca)}
                  </p>
                </div>
                <span className="text-[11px] text-muted-foreground">{financialHealth.metodologiaVersao}</span>
              </div>
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {financialHealth.componentes.map((item) => (
                  <div key={item.id} className="min-w-0 border-b border-aletis-borda/70 pb-2 last:border-b-0">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-semibold text-[var(--text-soft)]">{item.label}</span>
                      <span className="shrink-0 font-mono font-bold text-foreground">{item.score == null ? '—' : `${item.score}/100`}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden bg-aletis-borda/60">
                      <span className="block h-full transition-all" style={{ width: `${item.score ?? 0}%`, backgroundColor: healthColor(item.score) }} />
                    </div>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground" title={`${healthMetricValue(item.id, item.valor)}. ${item.leitura}`}>
                      {healthMetricValue(item.id, item.valor)} · {item.leitura}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>}
        </motion.div>
        </div>
      </details>
    </header>
  )
}

function FinancialHealthKpi({
  health,
  fallbackScore,
  open,
  onToggle,
}: {
  health: ReturnType<typeof useClienteData>['financialHealth']
  fallbackScore: number | null
  open: boolean
  onToggle: () => void
}) {
  const score = health?.score ?? fallbackScore
  const tone = score == null ? 'neutral' : score >= 65 ? 'good' : score >= 40 ? 'warn' : 'bad'
  const cls = tone === 'good'
    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
    : tone === 'warn'
      ? 'border-amber-200 bg-amber-50/85 text-amber-800'
      : tone === 'bad'
        ? 'border-red-200 bg-red-50/85 text-red-800'
        : 'border-aletis-borda bg-card text-foreground'
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`min-h-[92px] min-w-0 rounded-lg border px-4 py-3 text-left shadow-sm transition hover:border-aletis-verde/35 ${cls}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-body font-semibold uppercase text-current/70">Saúde financeira</p>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      <p className="mt-2 text-xl font-display font-semibold leading-tight tabular-nums text-foreground">
        {score == null ? '—' : `${score}/100`}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-current/70">
        {health ? `${healthLevelLabel(health.nivel)} · ver cálculo` : 'calculando indicadores'}
      </p>
    </button>
  )
}

function healthLevelLabel(value: NonNullable<ReturnType<typeof useClienteData>['financialHealth']>['nivel']): string {
  return ({ forte: 'Forte', equilibrada: 'Equilibrada', atencao: 'Atenção', pressionada: 'Pressionada', critica: 'Crítica', indisponivel: 'Não calculada' })[value]
}

function healthConfidenceLabel(value: NonNullable<ReturnType<typeof useClienteData>['financialHealth']>['confianca']): string {
  return ({ alta: 'alta', media: 'média', baixa: 'baixa' })[value]
}

function healthMetricValue(id: string, value: string): string {
  if (value === 'não calculado' || value === 'sem lançamentos' || value === 'sem contratos') return value
  if (id === 'saldo_safra' || id === 'divida_por_hectare') return fmtBRLCompact(Number(value))
  return value
}

function HeroMeta({
  label,
  value,
  icon: Icon,
  mono = false,
}: {
  label: string
  value: string
  icon?: typeof MapPin
  mono?: boolean
}) {
  return (
    <div className="min-w-0 rounded-xl border border-aletis-borda bg-card px-3 py-2">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 flex min-w-0 items-center gap-1.5 truncate text-xs font-semibold text-[var(--text-soft)] ${mono ? 'font-mono' : ''}`} title={value}>
        {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0 text-foreground" />}
        <span className="truncate">{value}</span>
      </p>
    </div>
  )
}

type ClienteEditForm = {
  nome: string
  cpfCnpj: string
  tipo: 'pessoa_fisica' | 'pessoa_juridica'
  telefone: string
  whatsapp: string
  email: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  atividade: string
  estagio: Cliente['estagio']
  consultor: string
  escritorio: string
  credor: string
  modalidadeCredito: string
  valorTotalDivida: string
  valorTotalPago: string
  areaTotalHa: string
  culturas: string
  carCodigoImovel: string
  tags: string
  proximaAcaoData: string
  proximaAcaoDescricao: string
  observacoes: string
  dividas: EditorDebt[]
  pagamentos: EditorPayment[]
}

type EditorAdditionalInfo = { id: string; campo: string; valor: string }

type EditorDebt = {
  id: string
  credor: string
  contrato: string
  modalidade: string
  emitente: string
  tomador: string
  finalidade: string
  enquadramento: string
  numeroCedula: string
  valorOriginal: string
  valorAtualizado: string
  valorParcela: string
  vencimento: string
  dataContratacao: string
  primeiraParcela: string
  ultimaParcela: string
  parcelasTotal: string
  parcelasPagas: string
  prazoMeses: string
  carenciaMeses: string
  diasAtraso: string
  taxaNominalAa: string
  taxaEfetivaAa: string
  cetAa: string
  indexador: string
  periodicidade: string
  metodoCalculo: string
  garantias: string
  observacoes: string
  informacoesAdicionais: EditorAdditionalInfo[]
  status: 'ativa' | 'renegociada' | 'paga' | 'em_acordo' | 'em_dia' | 'atrasada' | 'quitada' | 'nao_informado'
}

type EditorPayment = {
  id: string
  data: string
  valor: string
  descricao: string
  tipo: 'pagamento' | 'dacao' | 'deposito_judicial'
  status: 'previsto' | 'realizado' | 'compensado' | 'cancelado'
  credor: string
  contrato: string
  formaPagamento: string
  comprovante: string
  observacoes: string
  informacoesAdicionais: EditorAdditionalInfo[]
}

const ESTAGIOS: Array<{ value: Cliente['estagio']; label: string }> = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'analise', label: 'Análise' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'acordo', label: 'Acordo' },
  { value: 'acompanhamento', label: 'Acompanhamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'prospeccao', label: 'Prospecção' },
  { value: 'encerrado', label: 'Encerrado' },
]

const ESCRITORIOS = [
  { value: 'Aletis', label: 'Aletis - Matriz' },
  { value: 'Canarana', label: 'Canarana' },
] as const

function moneyInput(value?: number): string {
  return value != null && Number.isFinite(value) ? String(value).replace('.', ',') : ''
}

function parseDecimal(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

function editorDebtId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `debt-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function editorRowId(prefix: string): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function integerInput(value?: number): string {
  return value == null || !Number.isFinite(value) ? '' : String(Math.trunc(value))
}

function parseOptionalInteger(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number.parseInt(value.replace(/\D/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function ClienteEditModal({ cliente, initialTab, onClose, onSave, onOpenFinancialWorkspace }: {
  cliente: Cliente
  initialTab: EditTab
  onClose: () => void
  onSave: (patch: Partial<Cliente>) => Promise<void>
  onOpenFinancialWorkspace: () => void
}) {
  const [editTab, setEditTab] = useState<EditTab>(initialTab)
  const [form, setForm] = useState<ClienteEditForm>(() => ({
    nome: cliente.nome || '',
    cpfCnpj: cliente.cpfCnpj || '',
    tipo: cliente.tipo || 'pessoa_fisica',
    telefone: cliente.telefone || '',
    whatsapp: cliente.whatsapp || '',
    email: cliente.email || '',
    cep: cliente.cep || cliente.endereco?.cep || '',
    endereco: cliente.endereco?.logradouro || '',
    numero: cliente.endereco?.numero || '',
    complemento: cliente.endereco?.complemento || '',
    bairro: cliente.endereco?.bairro || '',
    cidade: cliente.cidade || '',
    uf: cliente.uf || '',
    atividade: cliente.atividade || '',
    estagio: cliente.estagio || 'lead',
    consultor: cliente.consultor || '',
    escritorio: cliente.escritorio || '',
    credor: cliente.credor || '',
    modalidadeCredito: cliente.modalidadeCredito || '',
    valorTotalDivida: moneyInput(cliente.valorTotalDivida ?? cliente.resumoFinanceiro.totalDivida),
    valorTotalPago: moneyInput(cliente.valorTotalPago ?? cliente.resumoFinanceiro.totalPago),
    areaTotalHa: cliente.areaTotalHa != null ? String(cliente.areaTotalHa).replace('.', ',') : '',
    culturas: (cliente.culturas ?? cliente.propriedade?.culturas ?? []).join(', '),
    carCodigoImovel: cliente.carCodigoImovel || cliente.car?.codImovel || '',
    tags: (cliente.tags ?? []).join(', '),
    proximaAcaoData: cliente.proximaAcao?.data?.slice(0, 10) || '',
    proximaAcaoDescricao: cliente.proximaAcao?.descricao || '',
    observacoes: cliente.observacoes || cliente.propriedade?.condicao || '',
    dividas: cliente.dividas.map((debt) => ({
      id: debt.id || editorDebtId(),
      credor: debt.credor || '',
      contrato: debt.contrato === '—' ? '' : debt.contrato || '',
      modalidade: debt.modalidade || '',
      emitente: debt.emitente || '',
      tomador: debt.tomador || '',
      finalidade: debt.finalidade || '',
      enquadramento: debt.enquadramento || '',
      numeroCedula: debt.numeroCedula || '',
      valorOriginal: moneyInput(debt.valorOriginal),
      valorAtualizado: moneyInput(debt.valorAtual),
      valorParcela: moneyInput(debt.valorParcela),
      vencimento: debt.vencimento?.slice(0, 10) || '',
      dataContratacao: debt.dataContratacao?.slice(0, 10) || '',
      primeiraParcela: debt.primeiraParcela?.slice(0, 10) || '',
      ultimaParcela: debt.ultimaParcela?.slice(0, 10) || '',
      parcelasTotal: integerInput(debt.parcelasTotal),
      parcelasPagas: integerInput(debt.parcelasPagas),
      prazoMeses: integerInput(debt.prazoMeses),
      carenciaMeses: integerInput(debt.carenciaMeses),
      diasAtraso: integerInput(debt.diasAtraso),
      taxaNominalAa: debt.taxaNominalAa || (debt.taxa === '—' ? '' : debt.taxa) || '',
      taxaEfetivaAa: debt.taxaEfetivaAa || '',
      cetAa: debt.cetAa || '',
      indexador: debt.indexador || '',
      periodicidade: debt.periodicidade || '',
      metodoCalculo: debt.metodoCalculo || '',
      garantias: (debt.garantias ?? []).join(', '),
      observacoes: debt.observacoes || '',
      informacoesAdicionais: (debt.informacoesAdicionais ?? []).map((info) => ({ id: editorRowId('debt-info'), campo: info.campo || '', valor: info.valor || '' })),
      status: debt.status,
    })),
    pagamentos: cliente.pagamentos.map((payment) => ({
      id: payment.id || editorRowId('payment'),
      data: payment.data?.slice(0, 10) || '',
      valor: moneyInput(payment.valor),
      descricao: payment.descricao || '',
      tipo: payment.tipo,
      status: payment.status || 'realizado',
      credor: payment.credor || '',
      contrato: payment.contrato || '',
      formaPagamento: payment.formaPagamento || '',
      comprovante: payment.comprovante || '',
      observacoes: payment.observacoes || '',
      informacoesAdicionais: (payment.informacoesAdicionais ?? []).map((info) => ({ id: editorRowId('payment-info'), campo: info.campo || '', valor: info.valor || '' })),
    })),
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function update<K extends keyof ClienteEditForm>(key: K, value: ClienteEditForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateDebt(id: string, patch: Partial<EditorDebt>) {
    setForm((prev) => ({ ...prev, dividas: prev.dividas.map((debt) => debt.id === id ? { ...debt, ...patch } : debt) }))
  }

  function addDebt() {
    setForm((prev) => ({
      ...prev,
      dividas: [...prev.dividas, {
        id: editorDebtId(), credor: '', contrato: '', modalidade: '', emitente: '', tomador: '', finalidade: '', enquadramento: '', numeroCedula: '',
        valorOriginal: '', valorAtualizado: '', valorParcela: '', vencimento: '', dataContratacao: '', primeiraParcela: '', ultimaParcela: '',
        parcelasTotal: '', parcelasPagas: '', prazoMeses: '', carenciaMeses: '', diasAtraso: '', taxaNominalAa: '', taxaEfetivaAa: '', cetAa: '',
        indexador: '', periodicidade: '', metodoCalculo: '', garantias: '', observacoes: '', informacoesAdicionais: [], status: 'ativa',
      }],
    }))
  }

  function addPayment() {
    setForm((prev) => ({
      ...prev,
      pagamentos: [...prev.pagamentos, {
        id: editorRowId('payment'), data: new Date().toISOString().slice(0, 10), valor: '', descricao: '', tipo: 'pagamento', status: 'realizado',
        credor: '', contrato: '', formaPagamento: '', comprovante: '', observacoes: '', informacoesAdicionais: [],
      }],
    }))
  }

  function updatePayment(id: string, patch: Partial<EditorPayment>) {
    setForm((prev) => ({ ...prev, pagamentos: prev.pagamentos.map((payment) => payment.id === id ? { ...payment, ...patch } : payment) }))
  }

  function addAdditionalInfo(kind: 'debt' | 'payment', id: string) {
    const item = { id: editorRowId('info'), campo: '', valor: '' }
    if (kind === 'debt') updateDebt(id, { informacoesAdicionais: [...(form.dividas.find((debt) => debt.id === id)?.informacoesAdicionais ?? []), item] })
    else updatePayment(id, { informacoesAdicionais: [...(form.pagamentos.find((payment) => payment.id === id)?.informacoesAdicionais ?? []), item] })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nome.trim()) {
      setError('Nome do cliente é obrigatório.')
      setEditTab('dados')
      return
    }
    if (!form.escritorio.trim()) {
      setError('Selecione o escritório responsável antes de salvar.')
      setEditTab('atendimento')
      return
    }
    if (Boolean(form.proximaAcaoData) !== Boolean(form.proximaAcaoDescricao.trim())) {
      setError('Preencha a data e a descrição da próxima ação, ou deixe os dois campos vazios.')
      setEditTab('atendimento')
      return
    }
    if (form.dividas.some((debt) => !debt.contrato.trim())) {
      setError('Informe o número do contrato nas dívidas adicionadas ou remova a linha vazia.')
      setEditTab('financeiro')
      return
    }
    if (form.pagamentos.some((payment) => !payment.data || !payment.descricao.trim())) {
      setError('Informe a data e a descrição nos pagamentos adicionados ou remova o lançamento vazio.')
      setEditTab('financeiro')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        nome: form.nome.trim(),
        cpfCnpj: form.cpfCnpj.trim(),
        tipo: form.tipo,
        telefone: form.telefone.trim(),
        whatsapp: form.whatsapp.trim(),
        email: form.email.trim(),
        endereco: {
          ...(cliente.endereco ?? {}),
          cep: form.cep.replace(/\D/g, ''),
          logradouro: form.endereco.trim(),
          numero: form.numero.trim(),
          complemento: form.complemento.trim(),
          bairro: form.bairro.trim(),
          cidade: form.cidade.trim(),
          uf: form.uf.trim().toUpperCase(),
          fonte: cliente.endereco?.fonte ?? 'manual',
          enriquecidoEm: new Date().toISOString(),
        },
        cidade: form.cidade.trim(),
        uf: form.uf.trim().toUpperCase(),
        cep: form.cep.replace(/\D/g, ''),
        atividade: form.atividade.trim(),
        estagio: form.estagio,
        consultor: form.consultor.trim(),
        escritorio: form.escritorio.trim(),
        credor: form.credor.trim(),
        modalidadeCredito: form.modalidadeCredito.trim(),
        valorTotalDivida: parseDecimal(form.valorTotalDivida),
        valorTotalPago: parseDecimal(form.valorTotalPago),
        areaTotalHa: parseDecimal(form.areaTotalHa),
        culturas: form.culturas.split(',').map((c) => c.trim()).filter(Boolean),
        carCodigoImovel: form.carCodigoImovel.trim(),
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        proximaAcao: form.proximaAcaoData && form.proximaAcaoDescricao.trim()
          ? { data: form.proximaAcaoData, descricao: form.proximaAcaoDescricao.trim() }
          : null,
        dividas: form.dividas
          .filter((debt) => debt.contrato.trim())
          .map((debt) => ({
            id: debt.id,
            credor: debt.credor.trim(),
            contrato: debt.contrato.trim(),
            modalidade: debt.modalidade.trim(),
            emitente: debt.emitente.trim(),
            tomador: debt.tomador.trim(),
            finalidade: debt.finalidade.trim(),
            enquadramento: debt.enquadramento.trim(),
            numeroCedula: debt.numeroCedula.trim(),
            valorOriginal: parseDecimal(debt.valorOriginal),
            valorAtual: parseDecimal(debt.valorAtualizado),
            valorAtualizado: parseDecimal(debt.valorAtualizado),
            valorParcela: parseDecimal(debt.valorParcela),
            vencimento: debt.vencimento,
            dataContratacao: debt.dataContratacao,
            primeiraParcela: debt.primeiraParcela,
            ultimaParcela: debt.ultimaParcela,
            parcelasTotal: parseOptionalInteger(debt.parcelasTotal),
            parcelasPagas: parseOptionalInteger(debt.parcelasPagas),
            prazoMeses: parseOptionalInteger(debt.prazoMeses),
            carenciaMeses: parseOptionalInteger(debt.carenciaMeses),
            diasAtraso: parseOptionalInteger(debt.diasAtraso),
            taxa: debt.taxaNominalAa.trim(),
            taxaNominalAa: debt.taxaNominalAa.trim(),
            taxaEfetivaAa: debt.taxaEfetivaAa.trim(),
            cetAa: debt.cetAa.trim(),
            indexador: debt.indexador.trim(),
            periodicidade: debt.periodicidade.trim(),
            metodoCalculo: debt.metodoCalculo.trim(),
            garantias: debt.garantias.split(',').map((item) => item.trim()).filter(Boolean),
            observacoes: debt.observacoes.trim(),
            informacoesAdicionais: debt.informacoesAdicionais.filter((info) => info.campo.trim()).map((info) => ({ campo: info.campo.trim(), valor: info.valor.trim() })),
            status: debt.status,
          })),
        pagamentos: form.pagamentos
          .filter((payment) => payment.data && payment.descricao.trim())
          .map((payment) => ({
            id: payment.id,
            data: payment.data,
            valor: parseDecimal(payment.valor),
            descricao: payment.descricao.trim(),
            tipo: payment.tipo,
            status: payment.status,
            credor: payment.credor.trim(),
            contrato: payment.contrato.trim(),
            formaPagamento: payment.formaPagamento.trim(),
            comprovante: payment.comprovante.trim(),
            observacoes: payment.observacoes.trim(),
            informacoesAdicionais: payment.informacoesAdicionais.filter((info) => info.campo.trim()).map((info) => ({ campo: info.campo.trim(), valor: info.valor.trim() })),
          })),
        observacoes: form.observacoes.trim(),
      })
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <MotionDialog
      title="Editar dados do cliente"
      subtitle={cliente.nome}
      eyebrow="CRM ALETIS"
      icon={<Pencil size={20} />}
      onClose={onClose}
      size="full"
      bodyClassName="bg-aletis-cream-papel/35"
      footer={(
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">
            Alterações ficam no cadastro do cliente e alimentam documentos, propostas, ALIX e relatórios.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onClose} className={uiAction.secondary}>
              Cancelar
            </button>
            <button form="cliente-edit-form" type="submit" disabled={saving} className={uiAction.primary}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar alterações
            </button>
          </div>
        </div>
      )}
    >
      <form id="cliente-edit-form" onSubmit={submit} className="space-y-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-body font-semibold uppercase text-muted-foreground">Ficha operacional</p>
                <h3 className="mt-1 font-display text-xl font-bold text-foreground">{form.nome || cliente.nome}</h3>
                <p className="mt-1 text-sm text-[var(--text-soft)]">
                  {form.cidade || cliente.cidade || 'Cidade não informada'}{form.uf ? `/${form.uf}` : cliente.uf ? `/${cliente.uf}` : ''} · {form.atividade || 'atividade não informada'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Escolha uma área, faça as alterações e salve quando terminar.</p>
            </div>
          </section>

          <nav aria-label="Áreas de edição" className="flex flex-wrap gap-2">
            {([
              ['dados', 'Dados e contato'],
              ['atendimento', 'Atendimento'],
              ['propriedade', 'Endereço e agro'],
              ['financeiro', 'Financeiro'],
            ] as const).map(([key, label]) => <button key={key} type="button" aria-current={editTab === key ? 'step' : undefined} onClick={() => setEditTab(key)} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${editTab === key ? 'border-aletis-verde bg-aletis-verde text-white' : 'border-aletis-borda bg-card text-[var(--text-soft)] hover:bg-aletis-bege'}`}>{label}</button>)}
          </nav>

          <div className="space-y-4">
            {editTab === 'dados' && <section className={editPanelClass}>
              <EditSectionHeader title="Identificação e contato" hint="Dados usados por CRM, WhatsApp, documentos e IA." />
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <EditField label="Nome" value={form.nome} onChange={(v) => update('nome', v)} className="md:col-span-2" />
                <label className="space-y-1">
                  <span className={editLabelClass}>Tipo de pessoa</span>
                  <select value={form.tipo} onChange={(event) => update('tipo', event.target.value as ClienteEditForm['tipo'])} className={editInputClass}>
                    <option value="pessoa_fisica">Pessoa física</option>
                    <option value="pessoa_juridica">Pessoa jurídica</option>
                  </select>
                </label>
                <EditField label="CPF/CNPJ (opcional)" value={form.cpfCnpj} onChange={(v) => update('cpfCnpj', v)} />
                <EditField label="Telefone" value={form.telefone} onChange={(v) => update('telefone', v)} />
                <EditField label="WhatsApp" value={form.whatsapp} onChange={(v) => update('whatsapp', v)} />
                <EditField label="E-mail" value={form.email} onChange={(v) => update('email', v)} className="md:col-span-2" />
              </div>
            </section>}

            {editTab === 'atendimento' && <section className={editPanelClass}>
              <EditSectionHeader title="Funil e responsabilidade" hint="Controla priorização, painel principal e alertas da ALIX." />
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className={editLabelClass}>Estágio</span>
                  <select
                    value={form.estagio}
                    onChange={(e) => update('estagio', e.target.value as Cliente['estagio'])}
                    className={editInputClass}
                  >
                    {ESTAGIOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </label>
                <EditField label="Consultor" value={form.consultor} onChange={(v) => update('consultor', v)} />
                <label className="space-y-1">
                  <span className={editLabelClass}>Escritório *</span>
                  <select value={form.escritorio} onChange={(e) => update('escritorio', e.target.value)} className={editInputClass}>
                    <option value="">Selecione o escritório</option>
                    {ESCRITORIOS.map((office) => <option key={office.value} value={office.value}>{office.label}</option>)}
                  </select>
                </label>
                <EditField label="Etiquetas" value={form.tags} onChange={(v) => update('tags', v)} placeholder="urgente, documentos pendentes" className="md:col-span-2" />
                <EditField label="Data da próxima ação" value={form.proximaAcaoData} onChange={(v) => update('proximaAcaoData', v)} type="date" />
                <EditField label="Próxima ação" value={form.proximaAcaoDescricao} onChange={(v) => update('proximaAcaoDescricao', v)} placeholder="Ex.: ligar e solicitar balanço" />
              </div>
            </section>}
          </div>

          {editTab === 'propriedade' && <section className={editPanelClass}>
            <EditSectionHeader title="Endereço e base agro" hint="A base geográfica alimenta clima, CAR, documentos rurais e viabilidade." />
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <EditField label="CEP" value={form.cep} onChange={(v) => update('cep', v)} inputMode="numeric" />
              <EditField label="Endereço" value={form.endereco} onChange={(v) => update('endereco', v)} className="md:col-span-2" />
              <EditField label="Número" value={form.numero} onChange={(v) => update('numero', v)} />
              <EditField label="Bairro / Zona" value={form.bairro} onChange={(v) => update('bairro', v)} />
              <EditField label="Complemento" value={form.complemento} onChange={(v) => update('complemento', v)} />
              <EditField label="Cidade" value={form.cidade} onChange={(v) => update('cidade', v)} />
              <EditField label="UF" value={form.uf} onChange={(v) => update('uf', v)} maxLength={2} />
              <EditField label="Atividade principal" value={form.atividade} onChange={(v) => update('atividade', v)} className="md:col-span-2" />
              <EditField label="Área total (ha)" value={form.areaTotalHa} onChange={(v) => update('areaTotalHa', v)} inputMode="decimal" />
              <EditField label="Código CAR" value={form.carCodigoImovel} onChange={(v) => update('carCodigoImovel', v)} />
              <EditField label="Culturas" value={form.culturas} onChange={(v) => update('culturas', v)} placeholder="Soja, milho, algodão..." className="md:col-span-2 xl:col-span-4" />
            </div>
          </section>}

          {editTab === 'financeiro' && <section className={editPanelClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <EditSectionHeader title="Financeiro completo" hint="Edite contratos, condições, parcelas, garantias, pagamentos e qualquer informação adicional." showDot={false} />
              <button type="button" onClick={onOpenFinancialWorkspace} className={uiAction.secondary}><Database className="h-4 w-4" /> Abrir gestão avançada</button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <EditField label="Credor principal" value={form.credor} onChange={(v) => update('credor', v)} />
              <EditField label="Modalidade de crédito" value={form.modalidadeCredito} onChange={(v) => update('modalidadeCredito', v)} />
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <EditField label="Dívida total" value={form.valorTotalDivida} onChange={(v) => update('valorTotalDivida', v)} inputMode="decimal" />
              <EditField label="Total pago" value={form.valorTotalPago} onChange={(v) => update('valorTotalPago', v)} inputMode="decimal" />
              <div className="rounded-xl border border-aletis-borda bg-aletis-cream-papel/65 px-3 py-2">
                <p className={editLabelClass}>Pendente estimado</p>
                <p className="mt-1 text-sm font-display font-semibold text-foreground">
                  {fmtBRLCompact(Math.max(0, parseDecimal(form.valorTotalDivida) - parseDecimal(form.valorTotalPago)))}
                </p>
              </div>
            </div>
            <div className="mt-5 border-t border-aletis-borda pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div><h4 className="text-sm font-semibold text-foreground">Contratos e dívidas</h4><p className="text-xs text-muted-foreground">Detalhe cada contrato para que os cálculos e negociações usem a composição correta.</p></div>
                <button type="button" onClick={addDebt} className={uiAction.secondary}><Plus className="h-4 w-4" /> Adicionar dívida</button>
              </div>
              <div className="mt-3 space-y-3">
                {form.dividas.length === 0 && <div className="rounded-xl border border-dashed border-aletis-borda bg-aletis-bege/30 px-4 py-5 text-center text-sm text-muted-foreground">Nenhuma dívida detalhada. O total acima pode ser mantido mesmo sem contratos.</div>}
                {form.dividas.map((debt, index) => (
                  <details key={debt.id} open={index === 0} className="rounded-xl border border-aletis-borda bg-aletis-bege/20 p-3">
                    <summary className="flex cursor-pointer list-none items-center gap-3">
                      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-foreground">{debt.contrato || `Nova dívida ${index + 1}`}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{[debt.credor, debt.modalidade, debt.status.replace(/_/g, ' ')].filter(Boolean).join(' · ') || 'Preencha os detalhes do contrato'}</p></div>
                      <span className="text-[11px] font-semibold text-foreground">Editar tudo</span>
                      <button type="button" onClick={(event) => { event.preventDefault(); setForm((prev) => ({ ...prev, dividas: prev.dividas.filter((item) => item.id !== debt.id) })) }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700" aria-label={`Remover dívida ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
                    </summary>
                    <div className="mt-4 grid gap-3 border-t border-aletis-borda pt-4 md:grid-cols-2 xl:grid-cols-4">
                      <EditField label="Credor" value={debt.credor} onChange={(value) => updateDebt(debt.id, { credor: value })} />
                      <EditField label="Contrato *" value={debt.contrato} onChange={(value) => updateDebt(debt.id, { contrato: value })} />
                      <EditField label="Modalidade" value={debt.modalidade} onChange={(value) => updateDebt(debt.id, { modalidade: value })} />
                      <label className="space-y-1"><span className={editLabelClass}>Situação</span><select value={debt.status} onChange={(event) => updateDebt(debt.id, { status: event.target.value as EditorDebt['status'] })} className={editInputClass}><option value="ativa">Ativa</option><option value="em_dia">Em dia</option><option value="atrasada">Atrasada</option><option value="em_acordo">Em acordo</option><option value="renegociada">Renegociada</option><option value="paga">Paga</option><option value="quitada">Quitada</option><option value="nao_informado">Não informada</option></select></label>
                      <EditField label="Valor original" value={debt.valorOriginal} onChange={(value) => updateDebt(debt.id, { valorOriginal: value })} inputMode="decimal" />
                      <EditField label="Saldo atualizado" value={debt.valorAtualizado} onChange={(value) => updateDebt(debt.id, { valorAtualizado: value })} inputMode="decimal" />
                      <EditField label="Valor da parcela" value={debt.valorParcela} onChange={(value) => updateDebt(debt.id, { valorParcela: value })} inputMode="decimal" />
                      <EditField label="Vencimento" value={debt.vencimento} onChange={(value) => updateDebt(debt.id, { vencimento: value })} type="date" />
                      <EditField label="Emitente" value={debt.emitente} onChange={(value) => updateDebt(debt.id, { emitente: value })} />
                      <EditField label="Tomador" value={debt.tomador} onChange={(value) => updateDebt(debt.id, { tomador: value })} />
                      <EditField label="Finalidade" value={debt.finalidade} onChange={(value) => updateDebt(debt.id, { finalidade: value })} />
                      <EditField label="Enquadramento / programa" value={debt.enquadramento} onChange={(value) => updateDebt(debt.id, { enquadramento: value })} />
                      <EditField label="Número da cédula" value={debt.numeroCedula} onChange={(value) => updateDebt(debt.id, { numeroCedula: value })} />
                      <EditField label="Data da contratação" value={debt.dataContratacao} onChange={(value) => updateDebt(debt.id, { dataContratacao: value })} type="date" />
                      <EditField label="Primeira parcela" value={debt.primeiraParcela} onChange={(value) => updateDebt(debt.id, { primeiraParcela: value })} type="date" />
                      <EditField label="Última parcela" value={debt.ultimaParcela} onChange={(value) => updateDebt(debt.id, { ultimaParcela: value })} type="date" />
                      <EditField label="Total de parcelas" value={debt.parcelasTotal} onChange={(value) => updateDebt(debt.id, { parcelasTotal: value })} inputMode="numeric" />
                      <EditField label="Parcelas pagas" value={debt.parcelasPagas} onChange={(value) => updateDebt(debt.id, { parcelasPagas: value })} inputMode="numeric" />
                      <EditField label="Prazo (meses)" value={debt.prazoMeses} onChange={(value) => updateDebt(debt.id, { prazoMeses: value })} inputMode="numeric" />
                      <EditField label="Carência (meses)" value={debt.carenciaMeses} onChange={(value) => updateDebt(debt.id, { carenciaMeses: value })} inputMode="numeric" />
                      <EditField label="Dias em atraso" value={debt.diasAtraso} onChange={(value) => updateDebt(debt.id, { diasAtraso: value })} inputMode="numeric" />
                      <EditField label="Taxa nominal a.a." value={debt.taxaNominalAa} onChange={(value) => updateDebt(debt.id, { taxaNominalAa: value })} placeholder="Ex.: 12,5%" />
                      <EditField label="Taxa efetiva a.a." value={debt.taxaEfetivaAa} onChange={(value) => updateDebt(debt.id, { taxaEfetivaAa: value })} placeholder="Ex.: 13,2%" />
                      <EditField label="CET a.a." value={debt.cetAa} onChange={(value) => updateDebt(debt.id, { cetAa: value })} placeholder="Ex.: 14,1%" />
                      <EditField label="Indexador" value={debt.indexador} onChange={(value) => updateDebt(debt.id, { indexador: value })} placeholder="CDI, IPCA, Selic..." />
                      <EditField label="Periodicidade" value={debt.periodicidade} onChange={(value) => updateDebt(debt.id, { periodicidade: value })} placeholder="Mensal, anual, safra..." />
                      <EditField label="Método de cálculo" value={debt.metodoCalculo} onChange={(value) => updateDebt(debt.id, { metodoCalculo: value })} placeholder="PRICE, SAC, simples..." />
                      <EditField label="Garantias" value={debt.garantias} onChange={(value) => updateDebt(debt.id, { garantias: value })} placeholder="Imóvel, aval, penhor..." className="md:col-span-2 xl:col-span-4" />
                      <label className="space-y-1 md:col-span-2 xl:col-span-4"><span className={editLabelClass}>Observações do contrato</span><textarea value={debt.observacoes} onChange={(event) => updateDebt(debt.id, { observacoes: event.target.value })} rows={3} className={`${editInputClass} resize-y`} placeholder="Condições, pendências, renegociações, detalhes jurídicos ou bancários..." /></label>
                    </div>
                    <AdditionalInfoEditor items={debt.informacoesAdicionais} onAdd={() => addAdditionalInfo('debt', debt.id)} onChange={(items) => updateDebt(debt.id, { informacoesAdicionais: items })} />
                  </details>
                ))}
              </div>
            </div>
            <div className="mt-5 border-t border-aletis-borda pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div><h4 className="text-sm font-semibold text-foreground">Pagamentos e dações</h4><p className="text-xs text-muted-foreground">Cadastre, altere ou remova qualquer pagamento ligado ao cliente ou a um contrato.</p></div>
                <button type="button" onClick={addPayment} className={uiAction.secondary}><Plus className="h-4 w-4" /> Adicionar pagamento</button>
              </div>
              <div className="mt-3 space-y-3">
                {form.pagamentos.length === 0 && <div className="rounded-xl border border-dashed border-aletis-borda bg-aletis-bege/30 px-4 py-5 text-center text-sm text-muted-foreground">Nenhum pagamento cadastrado.</div>}
                {form.pagamentos.map((payment, index) => (
                  <details key={payment.id} open={index === 0} className="rounded-xl border border-aletis-borda bg-card p-3">
                    <summary className="flex cursor-pointer list-none items-center gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-foreground">{payment.descricao || `Novo pagamento ${index + 1}`}</p><p className="mt-0.5 truncate text-[11px] text-muted-foreground">{[payment.data, payment.credor, payment.contrato].filter(Boolean).join(' · ') || 'Preencha os dados do lançamento'}</p></div><span className="text-[11px] font-semibold text-foreground">Editar tudo</span><button type="button" onClick={(event) => { event.preventDefault(); setForm((prev) => ({ ...prev, pagamentos: prev.pagamentos.filter((item) => item.id !== payment.id) })) }} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700" aria-label={`Remover pagamento ${index + 1}`}><Trash2 className="h-4 w-4" /></button></summary>
                    <div className="mt-4 grid gap-3 border-t border-aletis-borda pt-4 md:grid-cols-2 xl:grid-cols-4">
                      <EditField label="Data *" value={payment.data} onChange={(value) => updatePayment(payment.id, { data: value })} type="date" />
                      <EditField label="Valor" value={payment.valor} onChange={(value) => updatePayment(payment.id, { valor: value })} inputMode="decimal" />
                      <label className="space-y-1"><span className={editLabelClass}>Tipo</span><select value={payment.tipo} onChange={(event) => updatePayment(payment.id, { tipo: event.target.value as EditorPayment['tipo'] })} className={editInputClass}><option value="pagamento">Pagamento</option><option value="dacao">Dação</option><option value="deposito_judicial">Depósito judicial</option></select></label>
                      <label className="space-y-1"><span className={editLabelClass}>Situação</span><select value={payment.status} onChange={(event) => updatePayment(payment.id, { status: event.target.value as EditorPayment['status'] })} className={editInputClass}><option value="previsto">Previsto</option><option value="realizado">Realizado</option><option value="compensado">Compensado</option><option value="cancelado">Cancelado</option></select></label>
                      <EditField label="Descrição *" value={payment.descricao} onChange={(value) => updatePayment(payment.id, { descricao: value })} className="md:col-span-2" />
                      <EditField label="Credor" value={payment.credor} onChange={(value) => updatePayment(payment.id, { credor: value })} />
                      <EditField label="Contrato vinculado" value={payment.contrato} onChange={(value) => updatePayment(payment.id, { contrato: value })} />
                      <EditField label="Forma de pagamento" value={payment.formaPagamento} onChange={(value) => updatePayment(payment.id, { formaPagamento: value })} />
                      <EditField label="Comprovante / referência" value={payment.comprovante} onChange={(value) => updatePayment(payment.id, { comprovante: value })} className="md:col-span-2 xl:col-span-3" />
                      <label className="space-y-1 md:col-span-2 xl:col-span-4"><span className={editLabelClass}>Observações do pagamento</span><textarea value={payment.observacoes} onChange={(event) => updatePayment(payment.id, { observacoes: event.target.value })} rows={3} className={`${editInputClass} resize-y`} /></label>
                    </div>
                    <AdditionalInfoEditor items={payment.informacoesAdicionais} onAdd={() => addAdditionalInfo('payment', payment.id)} onChange={(items) => updatePayment(payment.id, { informacoesAdicionais: items })} />
                  </details>
                ))}
              </div>
            </div>
            <label className="mt-3 block space-y-1">
              <span className={editLabelClass}>Observações</span>
              <textarea
                value={form.observacoes}
                onChange={(e) => update('observacoes', e.target.value)}
                rows={4}
                className={`${editInputClass} resize-y leading-relaxed`}
              />
            </label>
          </section>}
        </form>
    </MotionDialog>
  )
}

const editPanelClass = 'rounded-lg border border-aletis-borda bg-card p-4 shadow-none'
const editLabelClass = 'text-[11px] font-body font-semibold uppercase text-muted-foreground'
const editInputClass = 'w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-aletis-grafite-claro/70 focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15'

function AdditionalInfoEditor({ items, onAdd, onChange }: {
  items: EditorAdditionalInfo[]
  onAdd: () => void
  onChange: (items: EditorAdditionalInfo[]) => void
}) {
  function update(id: string, patch: Partial<EditorAdditionalInfo>) {
    onChange(items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  return (
    <div className="mt-4 rounded-xl border border-dashed border-aletis-borda bg-white/70 p-3">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-foreground">Outras informações</p><p className="text-[11px] text-muted-foreground">Crie campos livres para registrar qualquer detalhe que não apareça acima.</p></div><button type="button" onClick={onAdd} className="inline-flex h-8 items-center gap-1 rounded-lg border border-aletis-borda px-2.5 text-[11px] font-semibold text-foreground hover:bg-aletis-bege"><Plus className="h-3.5 w-3.5" /> Adicionar campo</button></div>
      {items.length > 0 && <div className="mt-3 space-y-2">{items.map((item) => <div key={item.id} className="grid gap-2 sm:grid-cols-[minmax(140px,0.35fr)_1fr_auto]"><input value={item.campo} onChange={(event) => update(item.id, { campo: event.target.value })} className={editInputClass} placeholder="Nome do campo" /><input value={item.valor} onChange={(event) => update(item.id, { valor: event.target.value })} className={editInputClass} placeholder="Informação" /><button type="button" onClick={() => onChange(items.filter((current) => current.id !== item.id))} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700" aria-label="Remover informação adicional"><Trash2 className="h-4 w-4" /></button></div>)}</div>}
    </div>
  )
}

function EditSectionHeader({ title, hint, showDot = true }: { title: string; hint: string; showDot?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
      <h3 className="text-sm font-display font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      {showDot && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-aletis-dourado" />}
    </div>
  )
}

function EditField({ label, value, onChange, className = '', ...inputProps }: {
  label: string
  value: string
  onChange: (value: string) => void
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className={`min-w-0 space-y-1 ${className}`}>
      <span className={editLabelClass}>{label}</span>
      <input
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={editInputClass}
      />
    </label>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const cls = tone === 'good'
    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
    : tone === 'warn'
    ? 'border-amber-200 bg-amber-50/85 text-amber-800'
    : tone === 'bad'
    ? 'border-red-200 bg-red-50/85 text-red-800'
    : 'border-aletis-borda bg-card text-foreground'
  const dotCls = tone === 'good'
    ? 'bg-emerald-500'
    : tone === 'warn'
    ? 'bg-amber-500'
    : tone === 'bad'
    ? 'bg-red-500'
    : 'bg-aletis-grafite-claro'
  return (
    <div className={`min-h-[92px] min-w-0 rounded-lg border px-4 py-3 shadow-sm ${cls}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-body font-semibold uppercase text-current/70">{label}</p>
        <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${dotCls}`} />
      </div>
      <p className="mt-2 text-xl font-display font-semibold leading-tight text-foreground tabular-nums">{value}</p>
      {sub && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-current/70">{sub}</p>}
    </div>
  )
}

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-aletis-bege/30 space-y-3">
      <div className="h-24 rounded-lg bg-gray-100 animate-pulse" />
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
