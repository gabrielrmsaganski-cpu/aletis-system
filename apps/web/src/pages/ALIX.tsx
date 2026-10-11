/**
 * ALIX — Agente de Leitura e Inteligência Estratégica
 *
 * Wave 10 UI: upload multimodal (drag-drop + paperclip), cliente
 * ativo com badge/briefing, download chips para docs gerados,
 * SSE streaming e modal de memória persistente.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Send,
  Sparkles,
  Bot,
  Loader2,
  Trash2,
  Copy,
  Check,
  Calculator,
  FileText,
  TrendingUp,
  Users,
  Plus,
  MessageSquare,
  ChevronRight,
  Paperclip,
  X,
  Download,
  UserCircle2,
  BookOpen,
  FileSpreadsheet,
  FileBadge,
  Image as ImageIcon,
  AlertTriangle,
  Zap,
  Activity,
  Archive,
  ArchiveRestore,
  Pin,
  Search,
  Pencil,
  BrainCircuit,
  Gauge,
  PanelRightOpen,
  Square,
  ThumbsUp,
  Workflow,
  ShieldCheck,
  PanelLeft,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  FolderOpen,
  ArrowUpRight,
  ArrowDown,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { useAlixConversationContext } from '../hooks/useAlixConversationContext'
import { useAlixExecution } from '../hooks/alix/useAlixExecution'
import { useAlixModelCatalogue } from '../hooks/alix/useAlixModelCatalogue'
import { useAlixOperationalLaunch, type AlixOperationalHandoff } from '../hooks/alix/useAlixOperationalLaunch'
import AlixWorkComposer from '../components/alix/AlixWorkComposer'
import AlixWorkStarters from '../components/alix/AlixWorkStarters'
import AlixModelSelector from '../components/alix/AlixModelSelector'
import AlixExecutionPanel from '../components/alix/AlixExecutionPanel'
import AlixDeliveriesPanel from '../components/alix/AlixDeliveriesPanel'
import { renderAlixContent } from '../components/alix/AlixMessageContent'
import AlixResponseReader from '../components/alix/AlixResponseReader'
import { useAlixViewport } from '../hooks/alix/useAlixViewport'
import { useAlixConversationScroll } from '../hooks/alix/useAlixConversationScroll'
import { collectAlixDeliveries, readAlixRouting, operationalRequestDisplay } from '../components/alix/alixWorkspacePresentation'
import { useWorkspaceFocus } from '../contexts/WorkspaceFocusContext'
import AlixWorkspacePanel from '../components/alix/AlixWorkspacePanel'
import { useAlixStreaming } from '../hooks/alix/useAlixStreaming'
import { SubagentIndicator, detectLastSubagent } from '../components/alix/SubagentIndicator'
import { useDocumentAnalysis } from '../hooks/useDocumentAnalysis'
import AppDialog from '../components/ui/AppDialog'
import MotionDialog from '../components/ui/MotionDialog'
import type { AlixMission, AlixWorkMode } from '../components/alix/AlixTaskCenter'

const AlixAuditPanel = lazy(() => import('../components/alix/AlixAuditPanel'))
const AlixConfirmationsPanel = lazy(() =>
  import('../components/alix/AlixConfirmationBatch').then((mod) => ({
    default: mod.AlixConfirmationsPanel,
  })),
)
const AlixTelemetryPanel = lazy(() => import('../components/alix/AlixTelemetryPanel'))
const AlixGovernancePanel = lazy(() => import('../components/alix/AlixGovernancePanel'))
const DocumentAnalysisCard = lazy(() => import('../components/alix/DocumentAnalysisCard'))
const AlixNotebooksPanel = lazy(() => import('../components/alix/AlixNotebooksPanel'))
const AlixTaskCenter = lazy(() => import('../components/alix/AlixTaskCenter'))
const DocumentPipelinePanel = lazy(() => import('../components/alix/DocumentPipelinePanel'))
const AlixOperationsPanel = lazy(() => import('../components/alix/AlixOperationsPanel'))
const AlixDriveCorpusPanel = lazy(() => import('../components/alix/AlixDriveCorpusPanel'))

// ────────────────────────────────────────────────────────────
// Types — mirror AlixService.ts server types
// ────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  sources?: string[]
  toolsUsed?: string[]
  intent?: string
  metadata?: Record<string, unknown>
  /** ALIX Auditável — trail completo das tools usadas (source/confidence/latency) */
  audit?: import('../components/alix/AlixAuditPanel').AuditTrail | null
}

interface ChatSession {
  id: string
  title: string
  clienteId?: string
  archivedAt?: number
  pinnedAt?: number
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

interface SessionSummary {
  id: string
  title: string
  clienteId?: string
  archivedAt?: number
  pinnedAt?: number
  createdAt: number
  updatedAt: number
  messageCount: number
  lastMessage?: string
  legacyShared?: boolean
}

interface ChatResponse {
  reply: ChatMessage
  sessionId: string
  session: Omit<ChatSession, 'messages'> & { messageCount: number }
}

function executionOutcome(metadata?: Record<string, unknown>, mission?: AlixMission): 'completed' | 'interrupted' | 'failed' {
  if (metadata?.executionStatus === 'incomplete'
    || (typeof metadata?.stopReason === 'string' && !['completed', 'stop', 'end_turn'].includes(metadata.stopReason))
    || mission?.status === 'cancelled') return 'interrupted'
  return mission?.status === 'failed' ? 'failed' : 'completed'
}

interface AttachmentChip {
  id: string
  filename: string
  kind: 'pdf' | 'docx' | 'xlsx' | 'image' | 'text' | 'unknown'
  sizeBytes: number
  pageCount?: number
  uploading?: boolean
  error?: string
  scopeStatus?: 'conflict' | 'matched' | 'unverified' | 'session_only'
  scopeMessage?: string
  detectedCliente?: { id?: string; nome?: string; cpfCnpj?: string }
  needsScopeReview?: boolean
}

import type { ClienteSummary as ClienteLite } from '../types/cliente'

interface BriefingDestaque {
  titulo: string
  detalhe: string
  severidade: 'info' | 'atencao' | 'critico'
}

interface BriefingDivida {
  credor: string
  saldoBRL: number | null
  status: string
  origem: 'analise.saldoRecalculado.porDivida'
  naturezaSaldo: 'informado_na_analise' | 'nao_informado'
  situacaoAtual: 'nao_verificada'
}

interface Briefing {
  clienteId: string
  clienteNome: string
  geradoEm: string
  resumoExecutivo: string
  destaques: BriefingDestaque[]
  proximasAcoes: string[]
  dividasAtivas: BriefingDivida[]
  referenciasFinanceirasMemoria: Array<{
    texto: string
    origem: 'memoria'
    memoriaAtualizadaEm: string
    saldoAtualBRL: null
    situacaoAtual: 'nao_verificada'
  }>
  resumoFinanceiro: {
    registrosNaAnalise: number
    registrosComSaldoInformado: number
    registrosSemSaldoInformado: number
    referenciasMemoriaNaoConciliadas: number
    coberturaSaldosNaAnalise: 'sem_registros' | 'nenhum_informado' | 'parcial' | 'todos_informados'
    saldoAtualTotalBRL: null
    situacaoAtual: 'nao_verificada'
  }
  sugestaoPrimeiraAcao: string
  markdown: string
}

interface AlixCommandCenter {
  geradoEm: string
  headline: string
  resumo: string
  ai: {
    operacional: boolean
    memoriaClientes: number
    ferramentasDisponiveis: number
    modelosConfigurados: number
    modelosLiberados: number
  }
  kpis: {
    clientes: number
    clientesAtivos: number
    propostasAbertas: number
    propostasVencendo: number
    acoesHoje: number
    acoesAtrasadas: number
    semProximaAcao: number
    documentosParaRevisar: number
    missoesAtivas?: number
    achadosDocumentais?: number
    confirmacoesPendentes: number
    insightsCriticos: number
    insightsImportantes: number
  }
  tarefasHoje: string[]
  prioridades: Array<{
    id: string
    tipo: string
    titulo: string
    detalhe: string
    tone: 'info' | 'atencao' | 'critico' | 'ok'
    to?: string
  }>
  mercado?: {
    geradoEm?: string
    fonteOrigem?: string
    narrativaCurta?: string
    macro?: { dolar?: number | null; selic?: number | null; ipca12m?: number | null }
  } | null
  status: {
    llm: string
    memoria: string
    hitl: string
  }
}

interface DocumentoGerado {
  id?: string
  filename?: string
  downloadUrl?: string
  sizeBytes?: number
  kind?: string
  mimetype?: string
  tool?: string
}

interface DocumentOnboardingReview {
  id: string
  documentoId?: string
  status: 'needs_review' | 'ready_for_hitl' | 'blocked_duplicate' | 'dismissed' | 'converted'
  filename: string
  candidate: {
    nome?: string
    cpfCnpj?: string
    dividaTotal?: number | string
    bancos?: string[]
  }
  missingFields: string[]
  confidence: number
  duplicateCliente?: { id?: string; nome?: string }
}

interface SessionDocument {
  id: string
  clienteId?: string
  filename: string
  mimetype: string
  sizeBytes: number
  metadata: {
    clientScopeReview?: { status: string; requestedClienteId?: string; verifiedClienteId?: string }
    clientScopeAttachment?: { status: string }
  }
}

function documentBelongsToScope(document: SessionDocument, clienteId: string | null): boolean {
  const review = document.metadata?.clientScopeReview
  // Identidade detectada pelo modelo não determina o destino escolhido pelo consultor.
  return (document.clienteId || (review?.status === 'verified' ? review.verifiedClienteId : undefined) || review?.requestedClienteId || null) === clienteId
}

// ────────────────────────────────────────────────────────────
// Local state keys
// ────────────────────────────────────────────────────────────

const ACTIVE_SESSION_KEY = 'aletis:alix:activeSession'
const ACTIVE_CLIENTE_KEY = 'aletis:alix:activeCliente'
const ANALYSIS_MODE_KEY = 'aletis:alix:analysisMode'
const WORK_MODE_KEY = 'aletis:alix:workMode'

const WORK_MODE_OPTIONS: Array<{ value: AlixWorkMode; label: string }> = [
  { value: 'client_analysis', label: 'Análise de cliente' },
  { value: 'documentary', label: 'Documental' },
  { value: 'negotiation', label: 'Negociação' },
  { value: 'research', label: 'Pesquisa' },
  { value: 'document_generation', label: 'Gerar documento' },
  { value: 'due_diligence', label: 'Due diligence' },
]

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function greetingByTime(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.round(diff / 60000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}min`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  return `${d}d`
}

function formatBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function kindFromFilename(filename: string, mimetype?: string): AttachmentChip['kind'] {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (mimetype?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  if (ext === 'pdf' || mimetype?.includes('pdf')) return 'pdf'
  if (['docx', 'doc'].includes(ext)) return 'docx'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'xlsx'
  if (['txt', 'md'].includes(ext)) return 'text'
  return 'unknown'
}

function iconForKind(kind: AttachmentChip['kind']): React.ElementType {
  switch (kind) {
    case 'image': return ImageIcon
    case 'xlsx': return FileSpreadsheet
    case 'docx': return FileBadge
    case 'pdf':
    case 'text':
    default: return FileText
  }
}

function extractDocumentsFromMessage(msg: ChatMessage): DocumentoGerado[] {
  const md = msg.metadata as Record<string, unknown> | undefined
  if (!md) return []
  const docs = md.documents as unknown
  if (!Array.isArray(docs)) return []
  return docs.filter(
    (d): d is DocumentoGerado =>
      d !== null && typeof d === 'object' && typeof (d as DocumentoGerado).downloadUrl === 'string',
  )
}

// ────────────────────────────────────────────────────────────
// Markdown-lite renderer
// ────────────────────────────────────────────────────────────

/**
 * MessageErrorBoundary — isola crashes do renderContent em uma bolha específica.
 * Evita que uma mensagem corrompida derrube a conversa inteira; se ocorrer erro
 * mostra uma mensagem compacta com fallback de texto puro.
 */
class MessageErrorBoundary extends React.Component<
  { children: React.ReactNode; content?: string | null | undefined },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; content?: string | null | undefined }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error) {
    console.warn('[MessageErrorBoundary]', error.message)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-xs text-amber-700 dark:text-amber-300 italic bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2">
          <div className="font-semibold mb-1">⚠️ mensagem com problema de formatação</div>
          <div className="whitespace-pre-wrap text-current font-mono text-[11px]">
            {typeof this.props.content === 'string' ? this.props.content.slice(0, 800) : '(sem conteúdo)'}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/** Detecta se a linha é um separador de tabela `|---|---|` */
// ────────────────────────────────────────────────────────────
// Quick actions
// ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: BrainCircuit, label: 'Dossiê 360°', prompt: 'Faça uma análise profunda 360° do cliente ativo. Cruze cadastro, demandas, propostas, documentos, negociações e Gestão Financeira; mostre divergências, riscos, oportunidades e próximos passos com evidências.' },
  { icon: FileText, label: 'Cruzar documentos', prompt: 'Cruze profundamente os documentos anexados com o cliente ativo. Confirme as identidades, destaque divergências e não misture dados de pessoas diferentes.' },
  { icon: Calculator, label: 'Simular operação', prompt: 'Veja os dados existentes do cliente e dos documentos, escolha o simulador financeiro adequado e monte cenários comparáveis. Diga apenas quais premissas ainda faltam.' },
  { icon: Gauge, label: 'Cenários da dívida', prompt: 'Analise a capacidade de pagamento e simule cenários de reestruturação da dívida do cliente ativo, comparando prazo, carência, taxa, parcela, DSCR e custo total.' },
  { icon: Sparkles, label: 'Encontrar oportunidades', prompt: 'Investigue profundamente o cliente ativo e traga ideias acionáveis que ainda não foram exploradas, sustentadas por dados do CRM e documentos.' },
  { icon: Search, label: 'Pesquisar tudo', prompt: 'Pesquise profundamente em todo o sistema o assunto que vou informar, cruzando os módulos relevantes e apontando dados ausentes ou conflitantes.' },
]

// ────────────────────────────────────────────────────────────
// SSE helper — parses event-stream from POST /chat/stream
// ────────────────────────────────────────────────────────────



// ────────────────────────────────────────────────────────────
// Wave-PG-17: AlixStatsFooter — rodapé da sidebar com stats PG
// (NPS agregado + confirmations pendentes). Auto-refresh 30s.
// ────────────────────────────────────────────────────────────
type AlixFeedbackRating = 'util' | 'incompleta' | 'incorreto' | 'off-tom'
type AlixFeedbackReason = 'fonte_errada' | 'dado_ausente' | 'calculo' | 'interpretacao' | 'escrita' | 'acao_indevida'

function AlixMessageFeedback({
  message,
  sessionId,
  clienteId,
  missionId,
}: {
  message: ChatMessage
  sessionId: string
  clienteId?: string | null
  missionId?: string | null
}) {
  const [rating, setRating] = useState<AlixFeedbackRating | null>(null)
  const [reason, setReason] = useState<AlixFeedbackReason | ''>('')
  const [notes, setNotes] = useState('')
  const [expectedCorrection, setExpectedCorrection] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const submit = async (selectedRating: AlixFeedbackRating) => {
    if (selectedRating === 'incorreto' && !reason) return
    setStatus('saving')
    try {
      await apiFetch('/alix/feedback', {
        method: 'POST',
        body: JSON.stringify({
          msgId: message.id,
          sessionId,
          rating: selectedRating,
          motivo: reason || undefined,
          notas: notes.trim() || undefined,
          expectedCorrection: expectedCorrection.trim() || undefined,
          clienteId: clienteId || undefined,
          missionId: missionId || undefined,
          responseExcerpt: message.content.slice(0, 4_000),
          agent: String(message.metadata?.agent || 'alix'),
          tools: message.toolsUsed || [],
        }),
      })
      setRating(selectedRating)
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'saved') {
    return (
      <div className="mt-3 flex items-center gap-1.5 border-t border-aletis-borda/40 pt-2 text-[11px] font-semibold text-positivo">
        <Check className="h-3.5 w-3.5" /> Feedback registrado para melhoria da ALIX.
      </div>
    )
  }

  const options: Array<{ value: AlixFeedbackRating; label: string }> = [
    { value: 'util', label: 'Útil' },
    { value: 'incompleta', label: 'Incompleta' },
    { value: 'incorreto', label: 'Incorreta' },
    { value: 'off-tom', label: 'Tom inadequado' },
  ]
  const needsDetail = rating && rating !== 'util'

  return (
    <div className="mt-3 border-t border-aletis-borda/40 pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Avaliação necessária</span>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setRating(option.value)
              setStatus('idle')
              if (option.value === 'util') void submit('util')
            }}
            disabled={status === 'saving'}
            className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition disabled:opacity-50 ${
              rating === option.value
                ? 'border-aletis-verde bg-aletis-verde/10 text-foreground'
                : 'border-aletis-borda bg-card text-[var(--text-soft)] hover:border-aletis-verde'
            }`}
          >
            {option.value === 'util' && <ThumbsUp className="h-3 w-3" />}
            {option.label}
          </button>
        ))}
      </div>
      {needsDetail && (
        <div className="mt-2 grid gap-2 rounded-xl border border-aletis-borda bg-white/70 p-2.5 md:grid-cols-2">
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as AlixFeedbackReason | '')}
            className="h-8 rounded-lg border border-aletis-borda bg-card px-2 text-[11px] outline-none focus:border-aletis-verde"
          >
            <option value="">{rating === 'incorreto' ? 'Motivo obrigatório' : 'Motivo (opcional)'}</option>
            <option value="fonte_errada">Fonte errada</option>
            <option value="dado_ausente">Dado ausente</option>
            <option value="calculo">Cálculo</option>
            <option value="interpretacao">Interpretação</option>
            <option value="escrita">Escrita</option>
            <option value="acao_indevida">Ação indevida</option>
          </select>
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="O que faltou ou ficou errado?"
            className="h-8 rounded-lg border border-aletis-borda bg-card px-2 text-[11px] outline-none focus:border-aletis-verde"
          />
          <input
            value={expectedCorrection}
            onChange={(event) => setExpectedCorrection(event.target.value)}
            placeholder="Como deveria ser? (opcional)"
            className="h-8 rounded-lg border border-aletis-borda bg-card px-2 text-[11px] outline-none focus:border-aletis-verde md:col-span-2"
          />
          <div className="flex items-center gap-2 md:col-span-2">
            <button
              type="button"
              onClick={() => rating && void submit(rating)}
              disabled={status === 'saving' || (rating === 'incorreto' && !reason)}
              className="h-7 rounded-lg bg-aletis-verde px-3 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {status === 'saving' ? 'Registrando…' : 'Registrar feedback'}
            </button>
            {status === 'error' && <span className="text-[11px] text-alerta">Não foi possível salvar. Tente novamente.</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function AlixStatsFooter() {
  const [stats, setStats] = useState<{ total: number; positive: number; negative: number; neutral: number } | null>(null)
  const [pendentes, setPendentes] = useState<number>(0)
  const [qualityOpen, setQualityOpen] = useState<number>(0)

  const carregar = useCallback(async () => {
    try {
      const [s, p, q] = await Promise.all([
        fetch('/api/alix/feedback/stats').then((r) => r.json()).catch(() => null),
        fetch('/api/alix/confirmations/pendentes').then((r) => r.json()).catch(() => null),
        fetch('/api/alix/feedback/weekly').then((r) => r.json()).catch(() => null),
      ])
      if (s?.success) setStats(s.data)
      if (p?.success && Array.isArray(p.data)) setPendentes(p.data.length)
      if (q?.success) setQualityOpen(Number(q.data?.open || 0) + Number(q.data?.investigating || 0))
    } catch { /* swallow */ }
  }, [])

  useEffect(() => {
    void carregar()
    const id = setInterval(() => void carregar(), 30_000)
    return () => clearInterval(id)
  }, [carregar])

  if (!stats || stats.total === 0 && pendentes === 0 && qualityOpen === 0) {
    // Estado vazio — escondemos o footer pra não poluir.
    return null
  }

  const npsPct = stats.total > 0 ? Math.round((stats.positive / stats.total) * 100) : null

  return (
    <div className="border-t border-aletis-borda px-3 py-2 bg-aletis-bege/30">
      <p className="text-[11px] uppercase tracking-wide text-[var(--text-soft)] mb-1">PG · Postgres</p>
      <div className="grid grid-cols-4 gap-1.5 text-[11px]">
        <div className="text-center">
          <p className="text-muted-foreground">NPS</p>
          <p className="font-semibold text-foreground tabular-nums">
            {npsPct == null ? '—' : `${npsPct}%`}
          </p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Feedbacks</p>
          <p className="font-semibold text-foreground tabular-nums">{stats.total}</p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Pend.</p>
          <p className={`font-semibold tabular-nums ${pendentes > 0 ? 'text-amber-700' : 'text-foreground'}`}>
            {pendentes}
          </p>
        </div>
        <div className="text-center">
          <p className="text-muted-foreground">Revisão</p>
          <p className={`font-semibold tabular-nums ${qualityOpen > 0 ? 'text-amber-700' : 'text-foreground'}`}>
            {qualityOpen}
          </p>
        </div>
      </div>
    </div>
  )
}

function DocumentReviewQueue({
  reviews,
  onDismiss,
}: {
  reviews: DocumentOnboardingReview[]
  onDismiss: (id: string) => void
}) {
  const active = reviews.filter((r) => r.status !== 'dismissed' && r.status !== 'converted')
  if (active.length === 0) return null

  const statusLabel: Record<DocumentOnboardingReview['status'], string> = {
    needs_review: 'Revisar',
    ready_for_hitl: 'Pronto HITL',
    blocked_duplicate: 'Duplicado',
    dismissed: 'Ignorado',
    converted: 'Convertido',
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-50 mb-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-300" />
          <span className="text-sm font-semibold">Pré-cadastros documentais</span>
        </div>
        <span className="text-xs text-amber-200/70">{active.length} pendente{active.length > 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-2">
        {active.slice(0, 5).map((review) => {
          const missing = review.missingFields.join(', ')
          const duplicate = review.duplicateCliente?.nome || review.duplicateCliente?.id
          return (
            <div key={review.id} className="rounded-md border border-amber-400/20 bg-black/15 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {review.status === 'blocked_duplicate' && <AlertTriangle className="w-3.5 h-3.5 text-red-300" />}
                    {review.status === 'ready_for_hitl' && <Check className="w-3.5 h-3.5 text-emerald-300" />}
                    <span className="text-xs font-semibold truncate">{review.candidate.nome || review.filename}</span>
                    <span className="text-[11px] rounded-full px-1.5 py-0.5 bg-amber-400/15 text-amber-100">
                      {statusLabel[review.status]}
                    </span>
                  </div>
                  <div className="text-[11px] text-amber-100/70 mt-1">
                    {review.candidate.cpfCnpj || 'CPF/CNPJ pendente'}
                    {(typeof review.candidate.dividaTotal === 'number' || typeof review.candidate.dividaTotal === 'string') && (
                      <span> · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(review.candidate.dividaTotal))}</span>
                    )}
                    <span> · confiança {Math.round((review.confidence || 0) * 100)}%</span>
                  </div>
                  {missing && <div className="text-[11px] text-amber-200 mt-1">Faltando: {missing}</div>}
                  {duplicate && <div className="text-[11px] text-red-200 mt-1">Já existe: {duplicate}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(review.id)}
                  className="p-1 rounded hover:bg-white/10 text-amber-100/70 hover:text-amber-50"
                  title="Ignorar revisão"
                  aria-label="Ignorar revisão"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function commandTone(tone: AlixCommandCenter['prioridades'][number]['tone']): string {
  if (tone === 'critico') return 'border-red-200 bg-red-50 text-red-800'
  if (tone === 'atencao') return 'border-amber-200 bg-amber-50 text-amber-800'
  if (tone === 'ok') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  return 'border-aletis-borda bg-aletis-bege/40 text-foreground'
}

function CommandMetric({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  tone?: 'neutral' | 'good' | 'warn' | 'risk'
}) {
  const cls = tone === 'risk'
    ? 'bg-red-50 text-red-800 border-red-100'
    : tone === 'warn'
    ? 'bg-amber-50 text-amber-800 border-amber-100'
    : tone === 'good'
    ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
    : 'bg-card text-foreground border-aletis-borda'
  return (
    <div className={`min-w-0 rounded-xl border px-3 py-2 ${cls}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
        <Icon className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
      </div>
      <div className="mt-0.5 font-display text-lg font-bold leading-tight">{value}</div>
    </div>
  )
}

function AlixCommandCenterPanel({
  data,
  onPrompt,
}: {
  data: AlixCommandCenter
  onPrompt: (prompt: string) => void
}) {
  const k = data.kpis
  const top = data.prioridades.slice(0, 3)
  const market = data.mercado
  return (
    <section className="rounded-lg border border-aletis-borda bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-aletis-verde text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-base font-bold text-foreground">ALIX hoje</h2>
              <p className="truncate text-xs text-muted-foreground">
                Atualizado {new Date(data.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · memória {data.status.memoria} · ações {data.status.hitl}
              </p>
            </div>
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">{data.headline}</p>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-soft)]">{data.resumo}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPrompt('Priorize minha fila CRM de hoje. Use clientes, propostas, documentos, tarefas vencidas e mercado; traga evidências e a próxima ação recomendada.')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-aletis-verde px-3 py-2 text-xs font-semibold text-white hover:bg-aletis-verde-escuro"
          >
            <Activity className="h-3.5 w-3.5" />
            Priorizar dia
          </button>
          <button
            type="button"
            onClick={() => onPrompt('Mostre os clientes mais críticos agora e explique por que cada um merece atenção hoje.')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-aletis-borda bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-aletis-bege"
          >
            <Users className="h-3.5 w-3.5" />
            Riscos CRM
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <CommandMetric icon={Users} label="Clientes ativos" value={k.clientesAtivos} />
        <CommandMetric icon={AlertTriangle} label="Atrasadas" value={k.acoesAtrasadas} tone={k.acoesAtrasadas ? 'risk' : 'good'} />
        <CommandMetric icon={Activity} label="Hoje" value={k.acoesHoje} tone={k.acoesHoje ? 'warn' : 'neutral'} />
        <CommandMetric icon={FileText} label="Documentos a revisar" value={k.documentosParaRevisar} tone={k.documentosParaRevisar ? 'warn' : 'good'} />
        <CommandMetric icon={TrendingUp} label="Propostas" value={k.propostasAbertas} tone={k.propostasVencendo ? 'warn' : 'neutral'} />
        <CommandMetric icon={Check} label="Memórias" value={data.ai.memoriaClientes} tone={data.ai.memoriaClientes ? 'good' : 'neutral'} />
      </div>

      <div className="mt-4 grid gap-3">
        <div className="min-w-0">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Prioridades detectadas</div>
          <div className="grid gap-2">
            {top.length ? top.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (p.to) window.location.href = p.to
                  else onPrompt(`Explique esta prioridade da ALIX: ${p.titulo}. ${p.detalhe}`)
                }}
                className={`min-w-0 rounded-xl border px-3 py-2 text-left transition hover:shadow-sm ${commandTone(p.tone)}`}
              >
                <div className="truncate text-xs font-bold">{p.titulo}</div>
                <div className="mt-1 line-clamp-2 text-[11px] leading-snug opacity-80">{p.detalhe}</div>
              </button>
            )) : (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                Sem prioridade crítica aberta.
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-aletis-borda bg-aletis-bege/30 px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            Mercado para decisões
          </div>
          <p className="line-clamp-3 text-xs leading-relaxed text-[var(--text-soft)]">
            {market?.narrativaCurta || 'Brief de mercado ainda não carregado.'}
          </p>
          {market?.macro && (
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-foreground">
              {market.macro.dolar != null && <span>USD {Number(market.macro.dolar).toFixed(2).replace('.', ',')}</span>}
              {market.macro.selic != null && <span>Selic {Number(market.macro.selic).toFixed(2).replace('.', ',')}%</span>}
              {market.macro.ipca12m != null && <span>IPCA {Number(market.macro.ipca12m).toFixed(2).replace('.', ',')}%</span>}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

export default function ALIX() {
  const [viewParams, setViewParams] = useSearchParams()
  const operationsView = viewParams.get('view') === 'operations'
  const driveView = viewParams.get('view') === 'drive'
  const chatView = !operationsView && !driveView
  const changeView = (view: 'chat' | 'operations' | 'drive') => setViewParams(current => {
    const next = new URLSearchParams(current)
    if (view !== 'chat') next.set('view', view)
    else next.delete('view')
    return next
  })
  const { focused, setFocused } = useWorkspaceFocus()
  const workspaceRef = useAlixViewport(chatView, focused)
  const [readingMessageId, setReadingMessageId] = useState<string | null>(null)
  const [showContext, setShowContext] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [contextSection, setContextSection] = useState<'sources' | 'work' | 'deliveries' | 'skills'>('sources')
  const [modelPreference, setModelPreference] = useState('gpt-5.6-sol')
  const { options: modelOptions, loading: modelCatalogueLoading, error: modelCatalogueError, refresh: refreshModelCatalogue } = useAlixModelCatalogue()
  const manualModelUnavailable = modelPreference !== 'auto' && (modelCatalogueLoading || !modelOptions.some(model => model.id === modelPreference && model.available))
  const { execution, begin: beginExecution, route: recordRouting, progress: recordProgress, finish: finishExecution, reset: resetExecution } = useAlixExecution()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const {
    activeSessionId, setActiveSessionId, activeClienteId, setActiveClienteId, hydrateClienteId,
    messages, setMessages, input, setInput, attachments, setAttachments, documentReviews, setDocumentReviews,
    working: conversationBusy, work: conversationWork, beginWork, finishWork, isWorking, switchSession, captureContext, isCurrentContext,
  } = useAlixConversationContext<ChatMessage, AttachmentChip, DocumentOnboardingReview>(() => {
    const linkedSession = viewParams.get('sessionId')
    if (linkedSession && /^[A-Za-z0-9_-]{1,180}$/.test(linkedSession)) return { sessionId: linkedSession, clienteId: null }
    try { const sessionId = localStorage.getItem(ACTIVE_SESSION_KEY); return { sessionId, clienteId: sessionId ? localStorage.getItem(ACTIVE_CLIENTE_KEY) : null } }
    catch { return { sessionId: null, clienteId: null } }
  })
  const [isTyping, setIsTyping] = useState(false)
  const [currentTool, setCurrentTool] = useState<string | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(Boolean(activeSessionId))
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null)
  const [sessionReloadKey, setSessionReloadKey] = useState(0)
  const [clientContextError, setClientContextError] = useState<string | null>(null)
  const [notebookOpenError, setNotebookOpenError] = useState<string | null>(null)
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sessionView, setSessionView] = useState<'active' | 'archived'>('active')
  const [sessionSearch, setSessionSearch] = useState('')
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Wave 10 state
  const [dragActive, setDragActive] = useState(false)
  const [clientes, setClientes] = useState<ClienteLite[]>([])
  const [scopeReviewForm, setScopeReviewForm] = useState<{ documentId: string; clienteId: string; reason: string; error?: string; busy?: boolean } | null>(null)
  const [clienteMenuOpen, setClienteMenuOpen] = useState(false)
  const [clienteSearch, setClienteSearch] = useState('')
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [briefingExpanded, setBriefingExpanded] = useState(true)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [memoryMd, setMemoryMd] = useState<string | null>(null)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [showTelemetry, setShowTelemetry] = useState(false)
  const [showGovernance, setShowGovernance] = useState(false)
  const [showNotebooks, setShowNotebooks] = useState(false)
  const [showTasks, setShowTasks] = useState(false)
  const [notebooksMinimized, setNotebooksMinimized] = useState(false)
  const [commandCenter, setCommandCenter] = useState<AlixCommandCenter | null>(null)
  const streamEnabled = true
  const [analysisMode, setAnalysisMode] = useState<'standard' | 'deep'>(() => {
    try { return localStorage.getItem(ANALYSIS_MODE_KEY) === 'standard' ? 'standard' : 'deep' } catch { return 'deep' }
  })
  const [workMode, setWorkMode] = useState<AlixWorkMode>(() => {
    try {
      const value = localStorage.getItem(WORK_MODE_KEY) as AlixWorkMode | null
      return WORK_MODE_OPTIONS.some((item) => item.value === value) ? value as AlixWorkMode : 'client_analysis'
    } catch { return 'client_analysis' }
  })
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null)
  const [pendingMissionId, setPendingMissionId] = useState<string | null>(null)
  const [missionRefreshKey, setMissionRefreshKey] = useState(0)

  const { scrollRef, contentRef, onScroll, hasNewContent, isFollowing, scrollToLatest } = useAlixConversationScroll({ conversationKey: activeSessionId, contentVersion: messages, isTyping, isEmpty: messages.length === 0 && !isTyping, active: chatView })
  const adoptedSessionRef = useRef<string | null>(null)
  const navigationRef = useRef({ sessionId: activeSessionId, urlSessionId: viewParams.get('sessionId') })
  const historyRef = useRef<HTMLElement>(null)
  const clienteSelectorRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropCounterRef = useRef(0)
  const clienteContextRef = useRef(activeClienteId)
  const clienteGenerationRef = useRef(0)
  const memoryControllerRef = useRef<AbortController | null>(null)
  const memoryGenerationRef = useRef(0)
  const reviewsGenerationRef = useRef(0)
  const pendingMissionRef = useRef(pendingMissionId)
  pendingMissionRef.current = pendingMissionId
  if (clienteContextRef.current !== activeClienteId) {
    clienteContextRef.current = activeClienteId
    clienteGenerationRef.current += 1
  }

  const closeMemory = useCallback(() => {
    memoryGenerationRef.current += 1
    memoryControllerRef.current?.abort()
    memoryControllerRef.current = null
    setMemoryOpen(false)
    setMemoryMd(null)
    setMemoryLoading(false)
  }, [])

  const clearClientPanels = useCallback(() => {
    setBriefing(null)
    closeMemory()
    resetExecution()
    pendingMissionRef.current = null
    setPendingMissionId(null)
    setActiveMissionId(null)
  }, [closeMemory, resetExecution])

  const updateClienteContext = useCallback((clienteId: string | null, hydrate = false) => {
    if (clienteContextRef.current !== clienteId) {
      clienteContextRef.current = clienteId
      clienteGenerationRef.current += 1
      clearClientPanels()
    }
    if (hydrate) hydrateClienteId(clienteId)
    else setActiveClienteId(clienteId)
  }, [clearClientPanels, setActiveClienteId, hydrateClienteId])

  useEffect(() => {
    closeMemory()
    setClientContextError(null)
    setReadingMessageId(null)
    return () => {
      memoryGenerationRef.current += 1
      memoryControllerRef.current?.abort()
    }
  }, [activeClienteId, activeSessionId, closeMemory])

  useEffect(() => {
    if (sidebarOpen) historyRef.current?.focus()
  }, [sidebarOpen])

  const activeCliente = clientes.find((c) => c.id === activeClienteId) || null
  const activeSessionArchived = Boolean(sessions.find((session) => session.id === activeSessionId)?.archivedAt)
  const activeClienteLabel = activeCliente?.nome
    || briefing?.clienteNome
    || (activeClienteId ? `Cliente: ${activeClienteId}` : null)

  useEffect(() => {
    const field = inputRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, 112)}px`
  }, [input])

  // ── Initial load ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    apiFetch<SessionSummary[]>('/alix/sessions')
      .then((list) => { if (!cancelled) setSessions(list || []) })
      .catch((err) => console.warn('[ALIX] listar sessões falhou:', err.message))
    apiFetch<ClienteLite[]>('/clientes')
      .then((list) => { if (!cancelled) setClientes(list || []) })
      .catch((err) => console.warn('[ALIX] listar clientes falhou:', err.message))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      apiFetch<AlixCommandCenter>('/alix/command-center')
        .then((data) => { if (!cancelled) setCommandCenter(data) })
        .catch((err) => console.warn('[ALIX] command center falhou:', err.message))
    }
    load()
    const id = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  // Load active session messages
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([])
      setLoadedSessionId(null)
      setIsLoadingSession(false)
      setSessionLoadError(null)
      return
    }
    // A primeira missão já entrega o vínculo da sessão; não recarregue por cima dos tokens locais.
    if (adoptedSessionRef.current === activeSessionId) {
      adoptedSessionRef.current = null
      setLoadedSessionId(activeSessionId)
      setIsLoadingSession(false)
      setSessionLoadError(null)
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const contextVersion = captureContext()
    setIsLoadingSession(true)
    setSessionLoadError(null)
    apiFetch<ChatSession>(`/alix/session/${encodeURIComponent(activeSessionId)}`, { signal: controller.signal })
      .then((session) => {
        if (cancelled || !isCurrentContext(contextVersion)) return
        setClientContextError(null)
        updateClienteContext(session.clienteId ?? null, true)
        setLoadedSessionId(session.id)
        const remote = session?.messages || []
        // Preserva mensagens locais (id começando com "local-" ou "stream-")
        // que ainda não foram persistidas — evita wipe de placeholder durante
        // streaming quando esse useEffect dispara em paralelo (race condition).
        setMessages((prev) => {
          const localOnly = prev.filter((m) => /^(local-|stream-)/.test(m.id))
          if (localOnly.length === 0) return remote
          // Mescla: remote + locais não duplicados (por content+role)
          const merged = [...remote]
          for (const lm of localOnly) {
            const dup = merged.some((rm) => rm.role === lm.role && rm.content === lm.content && Math.abs((rm.timestamp || 0) - (lm.timestamp || 0)) < 60_000)
            if (!dup) merged.push(lm)
          }
          return merged
        })
      })
      .catch((error) => {
        if (!cancelled && isCurrentContext(contextVersion)) {
          setSessionLoadError(error instanceof Error ? error.message : 'Não foi possível carregar esta conversa.')
        }
      })
      .finally(() => { if (!cancelled && isCurrentContext(contextVersion)) setIsLoadingSession(false) })
    return () => { cancelled = true; controller.abort() }
  }, [activeSessionId, sessionReloadKey, captureContext, isCurrentContext, updateClienteContext])

  // Load briefing when clienteId changes
  useEffect(() => {
    setBriefing(null)
    if (!activeClienteId) {
      return
    }
    let cancelled = false
    const controller = new AbortController()
    const contextVersion = captureContext()
    const current = () => !cancelled && isCurrentContext(contextVersion) && clienteContextRef.current === activeClienteId
    apiFetch<Briefing>(`/alix/briefing/${encodeURIComponent(activeClienteId)}`, { signal: controller.signal })
      .then((b) => { if (current()) setBriefing(b?.clienteId === activeClienteId ? b : null) })
      .catch(() => { if (current()) setBriefing(null) })
    return () => { cancelled = true; controller.abort() }
  }, [activeClienteId, activeSessionId, captureContext, isCurrentContext])

  // Persist localStorage prefs
  useEffect(() => {
    try {
      if (activeSessionId) localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId)
      else localStorage.removeItem(ACTIVE_SESSION_KEY)
    } catch { /* ignore */ }
  }, [activeSessionId])

  useEffect(() => {
    try {
      if (activeClienteId) localStorage.setItem(ACTIVE_CLIENTE_KEY, activeClienteId)
      else localStorage.removeItem(ACTIVE_CLIENTE_KEY)
    } catch { /* ignore */ }
  }, [activeClienteId])

  useEffect(() => {
    try { localStorage.setItem(ANALYSIS_MODE_KEY, analysisMode) } catch { /* ignore */ }
  }, [analysisMode])

  useEffect(() => {
    try { localStorage.setItem(WORK_MODE_KEY, workMode) } catch { /* ignore */ }
  }, [workMode])

  // ── Helpers ─────────────────────────────────────────────

  const refreshSessions = useCallback(async () => {
    try {
      const list = await apiFetch<SessionSummary[]>('/alix/sessions')
      setSessions(list || [])
    } catch { /* ignore */ }
  }, [])

  const selectClienteContext = useCallback(async (clienteId: string | null): Promise<void> => {
    if (clienteId === activeClienteId) { setClienteMenuOpen(false); return }
    if (isLoadingSession || sessionLoadError || activeSessionArchived || !beginWork('session')) return
    const version = captureContext()
    setClientContextError(null)
    try {
      // Confirme também null no servidor antes de mostrar o novo escopo na tela.
      if (activeSessionId) {
        await apiFetch(`/alix/session/${encodeURIComponent(activeSessionId)}`, { method: 'PATCH', body: JSON.stringify({ clienteId }) })
      }
      if (!isCurrentContext(version)) return
      updateClienteContext(clienteId)
      setSessions(current => current.map(session => session.id === activeSessionId ? { ...session, clienteId: clienteId ?? undefined } : session))
      setClienteMenuOpen(false)
      setClienteSearch('')
    } catch (error) {
      if (isCurrentContext(version)) setClientContextError(error instanceof Error ? error.message : 'Não foi possível confirmar o cliente desta conversa.')
    } finally {
      finishWork()
    }
  }, [activeClienteId, activeSessionId, isLoadingSession, sessionLoadError, activeSessionArchived, beginWork, finishWork, captureContext, isCurrentContext, updateClienteContext])

  const ensureSession = useCallback(async (): Promise<string> => {
    if (activeSessionId) return activeSessionId
    const created = await apiFetch<ChatSession>('/alix/session', {
      method: 'POST',
      body: JSON.stringify({ title: 'Nova conversa' }),
    })
    adoptedSessionRef.current = created.id
    setActiveSessionId(created.id)
    setLoadedSessionId(created.id)
    if (activeClienteId) {
      try {
        await apiFetch(`/alix/session/${encodeURIComponent(created.id)}`, { method: 'PATCH', body: JSON.stringify({ clienteId: activeClienteId }) })
      } catch (error) {
        setClientContextError('A conversa foi criada, mas o cliente ainda não foi confirmado.')
        throw error
      }
    }
    return created.id
  }, [activeSessionId, activeClienteId, setActiveSessionId])

  const openNotebooks = useCallback(async (): Promise<void> => {
    if (isLoadingSession || sessionLoadError || clientContextError || activeSessionArchived || !beginWork('session')) return
    setNotebookOpenError(null)
    setShowSettings(false)
    setShowContext(false)
    const context = captureContext()
    try {
      await ensureSession()
      if (!isCurrentContext(context)) return
      setShowSettings(false)
      setShowContext(false)
      setNotebooksMinimized(false)
      setShowNotebooks(true)
    } catch (error) {
      if (isCurrentContext(context)) setNotebookOpenError(error instanceof Error ? error.message : 'Não foi possível preparar a conversa para os notebooks.')
    } finally { finishWork() }
  }, [isLoadingSession, sessionLoadError, clientContextError, activeSessionArchived, beginWork, finishWork, captureContext, isCurrentContext, ensureSession])

  const refreshDocumentReviews = useCallback(async (sessionId = activeSessionId, contextVersion = captureContext()): Promise<void> => {
    if (!isCurrentContext(contextVersion)) return
    const generation = ++reviewsGenerationRef.current
    const clienteGeneration = clienteGenerationRef.current
    if (!sessionId) {
      setDocumentReviews([])
      return
    }
    try {
      const [res, corpus] = await Promise.all([
        apiFetch<{ reviews: DocumentOnboardingReview[] }>(`/alix/document-reviews?sessionId=${encodeURIComponent(sessionId)}`),
        apiFetch<{ documents: SessionDocument[] }>(`/alix/documents/${encodeURIComponent(sessionId)}`),
      ])
      if (isCurrentContext(contextVersion) && reviewsGenerationRef.current === generation && clienteGenerationRef.current === clienteGeneration) {
        const scopedIds = new Set((corpus.documents || []).filter(doc => documentBelongsToScope(doc, activeClienteId)).map(doc => doc.id))
        setDocumentReviews((res.reviews || []).filter(review => review.documentoId && scopedIds.has(review.documentoId)))
      }
    } catch {
      // Uma falha transitória não descarta revisões já carregadas para este escopo.
    }
  }, [activeSessionId, activeClienteId, captureContext, isCurrentContext])

  useEffect(() => {
    void refreshDocumentReviews(activeSessionId)
  }, [activeSessionId, refreshDocumentReviews])

  useEffect(() => {
    setScopeReviewForm(null)
    if (!activeSessionId) return
    const context = captureContext()
    const clienteGeneration = clienteGenerationRef.current
    let cancelled = false
    // A revisão sobrevive a recarregar a página ou enviar o documento no chat.
    void apiFetch<{ documents: SessionDocument[] }>(`/alix/documents/${encodeURIComponent(activeSessionId)}`)
      .then(({ documents }) => {
        if (cancelled || !isCurrentContext(context) || clienteGenerationRef.current !== clienteGeneration) return
        const scopedDocuments = documents.filter(doc => documentBelongsToScope(doc, activeClienteId))
        const scopedById = new Map(scopedDocuments.map(doc => [doc.id, doc]))
        const serverIds = new Set(documents.map(doc => doc.id))
        const pending = scopedDocuments.filter(doc => doc.metadata.clientScopeReview && (doc.metadata.clientScopeReview.status !== 'verified' || doc.metadata.clientScopeAttachment?.status === 'failed'))
        setAttachments(current => {
          // Um vínculo confirmado em outro cliente não reaparece ao restaurar o rascunho anterior.
          const retained = current.filter(item => !serverIds.has(item.id) || scopedById.has(item.id)).map(item => {
            const doc = scopedById.get(item.id)
            if (!doc?.metadata.clientScopeReview) return item
            return { ...item, needsScopeReview: pending.some(candidate => candidate.id === item.id), scopeStatus: doc.metadata.clientScopeReview.status === 'verified' ? 'matched' as const : doc.metadata.clientScopeReview.status === 'conflict' ? 'conflict' as const : 'unverified' as const }
          })
          return [...retained, ...pending.filter(doc => !retained.some(item => item.id === doc.id)).map(doc => ({
            id: doc.id, filename: doc.filename, sizeBytes: doc.sizeBytes, kind: kindFromFilename(doc.filename, doc.mimetype),
            needsScopeReview: true, scopeStatus: doc.metadata.clientScopeReview?.status === 'conflict' ? 'conflict' as const : 'unverified' as const,
          }))]
        })
      }).catch(() => undefined)
    return () => { cancelled = true }
  }, [activeSessionId, activeClienteId, captureContext, isCurrentContext, setAttachments])

  const confirmDocumentScope = async () => {
    if (!scopeReviewForm || !activeSessionId || scopeReviewForm.busy || !scopeReviewForm.clienteId || scopeReviewForm.reason.trim().length < 10) return
    const context = captureContext()
    const clienteGeneration = clienteGenerationRef.current
    const form = scopeReviewForm
    setScopeReviewForm({ ...form, busy: true, error: undefined })
    try {
      const result = await apiFetch<{ attachmentError?: string }>(`/alix/documents/${encodeURIComponent(activeSessionId)}/${encodeURIComponent(form.documentId)}/client-scope`, {
        method: 'POST', body: JSON.stringify({ clienteId: form.clienteId, confirmed: true, reason: form.reason.trim() }),
      })
      if (!isCurrentContext(context) || clienteGenerationRef.current !== clienteGeneration) return
      if (result.attachmentError) { setScopeReviewForm({ ...form, error: result.attachmentError }); return }
      setAttachments(current => current.map(item => item.id === form.documentId ? { ...item, needsScopeReview: false, scopeStatus: 'matched', scopeMessage: 'Destino confirmado; documento anexado ao cadastro.' } : item))
      setScopeReviewForm(null)
    } catch (error) {
      if (isCurrentContext(context) && clienteGenerationRef.current === clienteGeneration) setScopeReviewForm({ ...form, error: error instanceof Error ? error.message : 'Não foi possível confirmar o destino.' })
    }
  }

  const dismissDocumentReview = useCallback(async (id: string): Promise<void> => {
    const contextVersion = captureContext()
    const sessionId = activeSessionId
    reviewsGenerationRef.current += 1
    setDocumentReviews((prev) => prev.map((r) => r.id === id ? { ...r, status: 'dismissed' } : r))
    try {
      await apiFetch(`/alix/document-reviews/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      })
    } catch {
      if (isCurrentContext(contextVersion)) void refreshDocumentReviews(sessionId, contextVersion)
    }
  }, [activeSessionId, refreshDocumentReviews, captureContext, isCurrentContext])

  // ── File upload ─────────────────────────────────────────

  const uploadFile = useCallback(async (file: File, sessionId: string): Promise<void> => {
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const kindGuess = kindFromFilename(file.name, file.type)
    setAttachments((prev) => [...prev, {
      id: tempId,
      filename: file.name,
      kind: kindGuess,
      sizeBytes: file.size,
      uploading: true,
    }])

    try {
      const form = new FormData()
      form.append('file', file, file.name)
      const params = new URLSearchParams({ sessionId })
      if (activeClienteId) params.set('clienteId', activeClienteId)
      const res = await fetch(`/api/alix/documents/upload?${params.toString()}`, {
        method: 'POST',
        body: form,
      })

      // Ler como texto primeiro para evitar detached ArrayBuffer em res.json() e
      // para poder logar a resposta bruta em caso de erro.
      const rawText = await res.text()
      let json: any
      try {
        json = JSON.parse(rawText)
      } catch (parseErr) {
        console.error('[ALIX upload] resposta não-JSON:', res.status, rawText.slice(0, 500))
        throw new Error(`Resposta inválida do servidor (${res.status}): ${(parseErr as Error).message}`)
      }

      if (!res.ok || json.success === false) {
        throw new Error(json.error || `Upload falhou (${res.status})`)
      }
      const doc = json.data
      const realId: string = doc?.id
      if (!realId) throw new Error('Resposta sem id do documento')
      setAttachments((prev) => prev.map((a) => a.id === tempId ? {
        id: realId,
        filename: doc.filename || file.name,
        kind: (doc.kind || kindGuess) as AttachmentChip['kind'],
        sizeBytes: doc.sizeBytes || file.size,
        pageCount: doc.pageCount,
        uploading: false,
        scopeStatus: doc.scopeReview?.status,
        scopeMessage: doc.scopeReview?.message,
        detectedCliente: doc.scopeReview?.detectedCliente,
        needsScopeReview: doc.scopeReview?.status !== 'matched' || !doc.anexadoAoCliente?.ok,
      } : a))
      if (doc.onboardingReview?.id) {
        reviewsGenerationRef.current += 1
        setDocumentReviews((prev) => [
          doc.onboardingReview as DocumentOnboardingReview,
          ...prev.filter((r) => r.id !== doc.onboardingReview.id),
        ])
      } else {
        void refreshDocumentReviews(sessionId)
      }
    } catch (err) {
      const msg = (err as Error).message
      console.error('[ALIX upload] erro no upload:', file.name, msg, err)
      setAttachments((prev) => prev.map((a) => a.id === tempId ? { ...a, uploading: false, error: msg } : a))
      // Mantém chip com erro pro usuário remover manualmente
    }
  }, [activeClienteId, refreshDocumentReviews])

  const handleFilePick = useCallback(async (files: FileList | File[]): Promise<void> => {
    if (isWorking() || isLoadingSession || sessionLoadError || clientContextError || activeSessionArchived) return
    const list = Array.from(files)
    if (list.length === 0) return
    const MAX = 25 * 1024 * 1024
    const valid = list.filter((f) => {
      if (f.size > MAX) {
        setAttachments((prev) => [...prev, {
          id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          filename: f.name,
          kind: kindFromFilename(f.name, f.type),
          sizeBytes: f.size,
          uploading: false,
          error: 'Acima de 25 MB',
        }])
        return false
      }
      return true
    })
    if (valid.length === 0) return
    if (!beginWork('files')) return
    try {
      const sid = await ensureSession()
      await Promise.all(valid.map((f) => uploadFile(f, sid)))
    } catch (error) {
      setAttachments(prev => [...prev, ...valid.map(file => ({ id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, filename: file.name, kind: kindFromFilename(file.name, file.type), sizeBytes: file.size, uploading: false, error: error instanceof Error ? error.message : 'Não foi possível preparar o envio.' }))])
    } finally { finishWork() }
  }, [ensureSession, uploadFile, beginWork, finishWork, isWorking, isLoadingSession, sessionLoadError, clientContextError, activeSessionArchived])

  const handleRemoveAttachment = useCallback(async (id: string): Promise<void> => {
    const chip = attachments.find((a) => a.id === id)
    if (isWorking() || chip?.uploading) return
    setAttachments((prev) => prev.filter((a) => a.id !== id))
    if (!chip || chip.error || !activeSessionId) return
    // Fire and forget — deleção server-side é best-effort
    fetch(`/api/alix/documents/${encodeURIComponent(activeSessionId)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => { /* ignore */ })
  }, [attachments, activeSessionId, isWorking])

  // ── Drag-drop ────────────────────────────────────────────

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.dataTransfer?.types?.includes('Files')) return
    dropCounterRef.current += 1
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dropCounterRef.current = Math.max(0, dropCounterRef.current - 1)
    if (dropCounterRef.current === 0) setDragActive(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dropCounterRef.current = 0
    setDragActive(false)
    const files = e.dataTransfer?.files
    if (files && files.length > 0) {
      handleFilePick(files)
    }
  }, [handleFilePick])

  // ── Streaming hook ─────────────────────────────────────
  const { stream: streamChatV2, cancel: cancelStream } = useAlixStreaming()
  useEffect(() => () => cancelStream(), [cancelStream])

  // ── Chat send ────────────────────────────────────────────

  const handleSend = useCallback(async (textOverride?: string): Promise<void> => {
    const text = (textOverride ?? input).trim()
    // Mensagens pendentes (com erro de upload) não vão
    const readyAttachments = attachments.filter((a) => !a.uploading && !a.error)
    if ((!text && readyAttachments.length === 0) || attachments.some(a => a.uploading) || isLoadingSession || sessionLoadError || clientContextError || activeSessionArchived || manualModelUnavailable || !beginWork('reply')) return
    setClienteMenuOpen(false)
    const attachmentIds = readyAttachments.map((a) => a.id)

    const userMsg: ChatMessage = {
      id: `local-u-${Date.now()}`,
      role: 'user',
      content: text || '(arquivos enviados)',
      timestamp: Date.now(),
      metadata: attachmentIds.length > 0 ? { attachments: readyAttachments.map((a) => ({ id: a.id, filename: a.filename, kind: a.kind })) } : undefined,
    }
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    beginExecution(runId)
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    const body = {
      sessionId: activeSessionId || undefined,
      message: text || 'Revise os documentos anexados e me traga os destaques.',
      attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
      clienteId: activeClienteId || undefined,
      analysisMode,
      workMode,
      missionId: pendingMissionId || undefined,
      modelPreference,
    }
    pendingMissionRef.current = null
    setPendingMissionId(null)

    // Só limpa os chips que foram efetivamente enviados; mantém os com erro
    setAttachments((prev) => prev.filter((a) => a.error || a.uploading || a.needsScopeReview))

    let cancelPendingFlush = () => {}
    try {
      if (streamEnabled) {
        // Streaming path — mantém só o indicador de digitação até chegar
        // texto real. Evita renderizar um card ALIX vazio antes dos tokens.
        const placeholderId = `stream-${Date.now()}`
        let agg = ''
        let rafId: number | null = null
        cancelPendingFlush = () => {
          if (rafId != null) window.cancelAnimationFrame(rafId)
          rafId = null
        }
        const toolsAgg: string[] = []
        const flushStream = () => {
          rafId = null
          if (agg.trim().length === 0) return
          setIsTyping(false)
          setMessages((prev) => {
            const has = prev.some((m) => m.id === placeholderId)
            if (has) {
              return prev.map((m) =>
                m.id === placeholderId
                  ? { ...m, content: agg, toolsUsed: [...toolsAgg] }
                  : m,
              )
            }
            return [
              ...prev,
              {
                id: placeholderId,
                role: 'assistant',
                content: agg,
                timestamp: Date.now(),
                toolsUsed: [...toolsAgg],
              } as ChatMessage,
            ]
          })
        }
        const scheduleFlush = () => {
          if (rafId != null) return
          rafId = window.requestAnimationFrame(flushStream)
        }
        const flushNow = () => {
          if (rafId != null) {
            window.cancelAnimationFrame(rafId)
            rafId = null
          }
          flushStream()
        }
        await streamChatV2(body, {
          onRouting: routing => recordRouting(runId, routing),
          onProgress: progress => recordProgress(runId, progress),
          onMission: (mission) => {
            if (!activeSessionId && mission.sessionId) {
              adoptedSessionRef.current = mission.sessionId
              setActiveSessionId(mission.sessionId)
              setLoadedSessionId(mission.sessionId)
            }
            setActiveMissionId(mission.id)
            setMissionRefreshKey((value) => value + 1)
          },
          onTool: (name) => {
            try {
              toolsAgg.push(name)
              setCurrentTool(name)
              // Não cria card vazio só por causa de tool. A resposta visual
              // nasce no primeiro token e recebe a lista acumulada.
              if (agg.trim().length > 0) scheduleFlush()
            } catch { /* ignora handler error */ }
          },
          onToken: (t) => {
            try {
              agg += t
              if (agg.trim().length === 0) return
              scheduleFlush()
            } catch { /* ignora handler error */ }
          },
          onDone: (payload) => {
            try {
              flushNow()
              setIsTyping(false)
              setCurrentTool(null)
              // Normaliza payload.reply defensivamente — backend pode enviar
              // formato inesperado, e não queremos que isso quebre o React.
              // Fallback explícito para `agg` evita "(sem conteúdo)" quando
              // payload.reply.content vem vazio mas o stream entregou tokens.
              const fallbackContent = agg.trim().length > 0
                ? agg
                : 'Não recebi conteúdo da ALIX nesta resposta. Tente enviar de novo.'
              const incomingContent = typeof payload?.reply?.content === 'string' && payload.reply.content.trim().length > 0
                ? payload.reply.content
                : fallbackContent
              const replyObj = payload?.reply as any;
              const safeReply: ChatMessage = (replyObj && typeof replyObj === 'object')
                ? {
                    id: replyObj.id || placeholderId,
                    role: (replyObj.role || 'assistant') as 'assistant',
                    content: incomingContent,
                    timestamp: replyObj.timestamp || Date.now(),
                    toolsUsed: Array.isArray(replyObj.toolsUsed) ? replyObj.toolsUsed : toolsAgg,
                    metadata: replyObj.metadata,
                    sources: Array.isArray(replyObj.sources) ? replyObj.sources : [],
                    audit: Array.isArray(replyObj.audit?.toolCalls) ? replyObj.audit : null,
                  }
                : {
                    id: placeholderId,
                    role: 'assistant' as const,
                    content: fallbackContent,
                    timestamp: Date.now(),
                    toolsUsed: toolsAgg,
                  }
              // Se o placeholder ainda existir, substitui. Se foi wiped por race
              // com useEffect(session refetch), append safeReply pra garantir
              // que a resposta sempre apareça.
              setMessages((prev) => {
                const has = prev.some((m) => m.id === placeholderId)
                if (has) return prev.map((m) => m.id === placeholderId ? safeReply : m)
                return [...prev, safeReply]
              })
              const routing = readAlixRouting(safeReply.metadata)
              if (routing) recordRouting(runId, routing)
              finishExecution(runId, executionOutcome(safeReply.metadata, payload.mission))
              if (payload?.sessionId && (!activeSessionId || activeSessionId !== payload.sessionId)) {
                adoptedSessionRef.current = payload.sessionId
                setActiveSessionId(payload.sessionId)
              }
              refreshSessions()
              setActiveMissionId(null)
              setMissionRefreshKey((value) => value + 1)
            } catch (err) {
              console.warn('[ALIX] onDone handler falhou:', err)
            }
          },
          onError: (errMsg) => {
            finishExecution(runId, 'failed')
            if (rafId != null) {
              window.cancelAnimationFrame(rafId)
              rafId = null
            }
            setIsTyping(false)
            setCurrentTool(null)
            setActiveMissionId(null)
            setMissionRefreshKey((value) => value + 1)
            void refreshSessions()
            setCurrentTool(null)
            const interruptedContent = agg.trim()
              ? `${agg}\n\n**Análise parcial.** ${errMsg}`
              : `Não foi possível concluir a análise: ${errMsg}`
            setMessages((prev) => {
              const has = prev.some((m) => m.id === placeholderId)
              if (has) return prev.map((m) => m.id === placeholderId ? { ...m, content: interruptedContent } : m)
              return [...prev, {
                id: placeholderId,
                role: 'assistant',
                content: interruptedContent,
                timestamp: Date.now(),
                toolsUsed: [...toolsAgg],
              } as ChatMessage]
            })
          },
        })
      } else {
        const resp = await apiFetch<ChatResponse>('/alix/chat', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        // Defensiva: backend pode devolver string em vez de ChatMessage.
        // Normaliza para sempre ser um objeto válido antes de empurrar no estado.
        const normalizedReply: ChatMessage =
          typeof resp.reply === 'string'
            ? {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: resp.reply,
                timestamp: Date.now(),
              }
            : (resp.reply && typeof resp.reply === 'object'
                ? {
                    id: (resp.reply as any).id || `assistant-${Date.now()}`,
                    role: (resp.reply as any).role || 'assistant',
                    content: typeof (resp.reply as any).content === 'string' ? (resp.reply as any).content : '(resposta vazia)',
                    timestamp: (resp.reply as any).timestamp || Date.now(),
                    toolsUsed: Array.isArray((resp.reply as any).toolsUsed) ? (resp.reply as any).toolsUsed : undefined,
                    metadata: (resp.reply as any).metadata,
                    sources: Array.isArray((resp.reply as any).sources) ? (resp.reply as any).sources : undefined,
                    audit: Array.isArray((resp.reply as any).audit?.toolCalls) ? (resp.reply as any).audit : Array.isArray((resp as any).audit?.toolCalls) ? (resp as any).audit : null,
                  }
                : {
                    id: `assistant-${Date.now()}`,
                    role: 'assistant',
                    content: '(resposta vazia)',
                    timestamp: Date.now(),
                  })
        setMessages((prev) => [...prev, normalizedReply])
        const routing = readAlixRouting(normalizedReply.metadata)
        if (routing) recordRouting(runId, routing)
        finishExecution(runId, executionOutcome(normalizedReply.metadata))
        if (!activeSessionId || activeSessionId !== resp.sessionId) {
          adoptedSessionRef.current = resp.sessionId
          setActiveSessionId(resp.sessionId)
        }
        refreshSessions()
      }
    } catch (err) {
      finishExecution(runId, 'failed')
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Erro ao contatar ALIX: ${(err as Error).message}. Tenta de novo?`,
        timestamp: Date.now(),
      }])
    } finally {
      cancelPendingFlush()
      finishExecution(runId, 'interrupted')
      finishWork()
      setIsTyping(false)
    }
  }, [input, attachments, isLoadingSession, sessionLoadError, clientContextError, activeSessionArchived, activeSessionId, activeClienteId, analysisMode, workMode, pendingMissionId, modelPreference, manualModelUnavailable, streamEnabled, refreshSessions, beginWork, finishWork, beginExecution, recordRouting, recordProgress, finishExecution, setActiveSessionId])

  const operationalLaunch = useAlixOperationalLaunch({
    sessionId: activeSessionId, clienteId: activeClienteId, loadedSessionId,
    missionId: pendingMissionId, busy: conversationBusy,
    ready: !isLoadingSession && !sessionLoadError && !clientContextError && !activeSessionArchived && !manualModelUnavailable,
    contextVersion: captureContext(), send: handleSend,
  })

  const handleCancelActiveMission = useCallback(async (): Promise<void> => {
    cancelStream()
    setIsTyping(false)
    setCurrentTool(null)
    const missionId = activeMissionId
    setActiveMissionId(null)
    if (missionId) {
      try {
        await apiFetch(`/alix/missions/${encodeURIComponent(missionId)}/cancel`, { method: 'POST' })
      } catch (error) {
        console.warn('[ALIX] cancelamento da missão falhou:', (error as Error).message)
      }
    }
    setMissionRefreshKey((value) => value + 1)
  }, [activeMissionId, cancelStream])

  const clearSessionPanels = useCallback(() => {
    adoptedSessionRef.current = null
    clearClientPanels()
    setSessionLoadError(null)
    setClientContextError(null)
    setNotebookOpenError(null)
    setShowNotebooks(false)
    setNotebooksMinimized(false)
    setClienteMenuOpen(false)
    setClienteSearch('')
    setActiveMissionId(null)
    setPendingMissionId(null)
    setCurrentTool(null)
    setIsLoadingSession(false)
  }, [clearClientPanels])

  useEffect(() => {
    const rawSessionId = viewParams.get('sessionId')
    const urlSessionId = rawSessionId && /^[A-Za-z0-9_-]{1,180}$/.test(rawSessionId) ? rawSessionId : null
    const previous = navigationRef.current
    const stateChanged = previous.sessionId !== activeSessionId
    const urlChanged = previous.urlSessionId !== rawSessionId
    navigationRef.current = { sessionId: activeSessionId, urlSessionId: rawSessionId }

    // Voltar/avançar e links de conversa também passam pela proteção do trabalho em curso.
    if (urlChanged && !stateChanged && urlSessionId !== activeSessionId) {
      const selected = sessions.find(session => session.id === urlSessionId)
      if (switchSession(urlSessionId, selected?.clienteId)) {
        clearSessionPanels()
        setIsLoadingSession(Boolean(urlSessionId))
        navigationRef.current = { sessionId: urlSessionId, urlSessionId }
        return
      }
    }
    if (rawSessionId !== activeSessionId) {
      navigationRef.current.urlSessionId = activeSessionId
      setViewParams(current => {
        const next = new URLSearchParams(current)
        if (activeSessionId) next.set('sessionId', activeSessionId)
        else next.delete('sessionId')
        return next
      }, { replace: true })
    }
  }, [activeSessionId, viewParams, sessions, switchSession, clearSessionPanels, setViewParams])

  const handleNewSession = useCallback(() => {
    if (!switchSession(null)) return
    clearSessionPanels()
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [switchSession, clearSessionPanels])

  const handleOperationalHandoff = useCallback((handoff: AlixOperationalHandoff) => {
    if (isWorking() || isLoadingSession || input.trim() || attachments.length) return
    if (handoff.session.id !== activeSessionId) {
      if (!switchSession(handoff.session.id, handoff.session.clienteId)) return
      clearSessionPanels()
      setLoadedSessionId(null)
      setIsLoadingSession(true)
    } else if (activeClienteId !== handoff.session.clienteId) {
      updateClienteContext(handoff.session.clienteId)
    }
    setViewParams(current => { const next = new URLSearchParams(current); next.delete('view'); next.set('sessionId', handoff.session.id); return next })
    setShowTasks(true)
    setActiveMissionId(handoff.mission.id)
    setMissionRefreshKey(value => value + 1)
    void refreshSessions()
    if (handoff.canStart) {
      setWorkMode(handoff.mission.workMode)
      setAnalysisMode('deep')
      pendingMissionRef.current = handoff.mission.id
      setPendingMissionId(handoff.mission.id)
      setInput(handoff.mission.prompt)
      operationalLaunch.schedule(handoff, captureContext())
    }
  }, [isWorking, isLoadingSession, input, attachments.length, activeSessionId, activeClienteId, switchSession, clearSessionPanels, updateClienteContext, setViewParams, refreshSessions, operationalLaunch.schedule, captureContext])

  const handleSelectSession = useCallback((id: string) => {
    const selected = sessions.find((session) => session.id === id)
    if (!switchSession(id, selected?.clienteId)) return
    clearSessionPanels()
    setIsLoadingSession(true)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setSidebarOpen(false)
  }, [sessions, switchSession, clearSessionPanels])

  const resumeContextVersion = captureContext()
  const resumeClienteVersion = clienteGenerationRef.current
  const handleResumeMission = useCallback((mission: AlixMission) => {
    if (isWorking() || !isCurrentContext(resumeContextVersion) || clienteGenerationRef.current !== resumeClienteVersion) return
    if (mission.sessionId !== activeSessionId) {
      if (!switchSession(mission.sessionId, mission.clienteId)) return
      clearSessionPanels()
      setIsLoadingSession(true)
    } else if ((mission.clienteId ?? null) !== activeClienteId) {
      updateClienteContext(mission.clienteId ?? null)
    }
    pendingMissionRef.current = mission.id
    setPendingMissionId(mission.id)
    setWorkMode(mission.workMode)
    setInput(mission.prompt)
    setShowTasks(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [activeSessionId, activeClienteId, resumeContextVersion, resumeClienteVersion, isWorking, isCurrentContext, switchSession, clearSessionPanels, updateClienteContext])

  const patchSession = useCallback(async (
    id: string,
    patch: { title?: string; archived?: boolean; pinned?: boolean },
  ): Promise<void> => {
    const updated = await apiFetch<ChatSession>(`/alix/session/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    setSessions((prev) => prev.map((session) => session.id === id
      ? {
          ...session,
          title: updated.title,
          archivedAt: updated.archivedAt,
          pinnedAt: updated.pinnedAt,
          updatedAt: updated.updatedAt,
        }
      : session))
  }, [])

  const handleArchiveSession = useCallback(async (id: string, archived: boolean, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!beginWork('session')) return
    let resetActive = false
    try {
      await patchSession(id, { archived })
      resetActive = archived && activeSessionId === id
    } catch (err) {
      alert(`Erro ao ${archived ? 'arquivar' : 'restaurar'}: ${(err as Error).message}`)
    } finally {
      finishWork()
      if (resetActive) { switchSession(null); clearSessionPanels() }
    }
  }, [activeSessionId, patchSession, beginWork, finishWork, switchSession, clearSessionPanels])

  const handlePinSession = useCallback(async (id: string, pinned: boolean, event: React.MouseEvent) => {
    event.stopPropagation()
    try { await patchSession(id, { pinned }) } catch (err) { alert(`Erro ao fixar conversa: ${(err as Error).message}`) }
  }, [patchSession])

  const beginRename = useCallback((session: SessionSummary, event: React.MouseEvent) => {
    event.stopPropagation()
    setRenamingSessionId(session.id)
    setRenameValue(session.title)
  }, [])

  const commitRename = useCallback(async (): Promise<void> => {
    if (!renamingSessionId) return
    const submittedId = renamingSessionId
    const title = renameValue.trim()
    if (!title) {
      setRenamingSessionId(null)
      return
    }
    try { await patchSession(renamingSessionId, { title }) } catch (err) { alert(`Erro ao renomear: ${(err as Error).message}`) }
    finally { setRenamingSessionId(current => current === submittedId ? null : current) }
  }, [patchSession, renameValue, renamingSessionId])

  const handleDeleteSession = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (isWorking()) return
    if (!window.confirm('Apagar essa conversa? Não dá pra recuperar.')) return
    if (!beginWork('session')) return
    let resetActive = false
    try {
      await apiFetch(`/alix/session/${id}`, { method: 'DELETE' })
      resetActive = activeSessionId === id
      refreshSessions()
    } catch (err) {
      alert(`Erro ao apagar: ${(err as Error).message}`)
    } finally {
      finishWork()
      if (resetActive) { switchSession(null); clearSessionPanels() }
    }
  }, [activeSessionId, refreshSessions, isWorking, beginWork, finishWork, switchSession, clearSessionPanels])

  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }, [])

  const handleOpenMemory = useCallback(async () => {
    if (!activeClienteId) return
    const clienteId = activeClienteId
    const contextVersion = captureContext()
    memoryControllerRef.current?.abort()
    const controller = new AbortController()
    memoryControllerRef.current = controller
    const generation = ++memoryGenerationRef.current
    const current = () => !controller.signal.aborted && generation === memoryGenerationRef.current && isCurrentContext(contextVersion) && clienteContextRef.current === clienteId
    setMemoryOpen(true)
    setMemoryLoading(true)
    setMemoryMd(null)
    try {
      const res = await apiFetch<{ markdown: string }>(`/alix/memory/${encodeURIComponent(clienteId)}`, { signal: controller.signal })
      if (current()) setMemoryMd(res?.markdown || '_(memória vazia)_')
    } catch (err) {
      if (current()) setMemoryMd(`_Erro: ${(err as Error).message}_`)
    } finally {
      if (current()) { memoryControllerRef.current = null; setMemoryLoading(false) }
    }
  }, [activeClienteId, captureContext, isCurrentContext])

  // ── Render ──────────────────────────────────────────────

  const showWelcome = messages.length === 0 && attachments.length === 0
  const anyUploading = attachments.some((a) => a.uploading)
  const anyReady = attachments.some((a) => !a.uploading && !a.error)

  // Wave 11 — Document Analysis
  const { analysis, loading: analysisLoading, error: analysisError, fetchAnalysis, clear: clearAnalysis } = useDocumentAnalysis()
  const lastReadyAttachment = attachments.filter((a) => !a.uploading && !a.error).slice(-1)[0]

  useEffect(() => {
    clearAnalysis()
  }, [activeSessionId, clearAnalysis])

  useEffect(() => {
    if (lastReadyAttachment && activeSessionId) {
      void fetchAnalysis(lastReadyAttachment.id, activeSessionId).catch(() => {})
    }
  }, [lastReadyAttachment?.id, activeSessionId, fetchAnalysis])

  const visibleMessages = useMemo(() => messages.filter((msg) => {
    if (!msg || typeof msg !== 'object') return false
    if (msg.role !== 'user' && msg.role !== 'assistant') return false
    if (msg.role === 'assistant' && (!msg.content || !String(msg.content).trim())) return false
    return true
  }), [messages])
  const deliveries = useMemo(() => collectAlixDeliveries(visibleMessages), [visibleMessages])
  const readyAttachmentCount = attachments.filter(attachment => !attachment.uploading && !attachment.error).length
  const sessionTitle = sessions.find(session => session.id === activeSessionId)?.title
  const openContextSection = (section: typeof contextSection) => {
    setContextSection(section)
    setShowContext(true)
    setSidebarOpen(false)
    setClienteMenuOpen(false)
  }
  const prepareRequest = (prompt: string, mode: AlixWorkMode) => {
    if (isWorking() || isLoadingSession || activeSessionArchived) return
    setInput(prompt)
    setWorkMode(mode)
    pendingMissionRef.current = null
    setPendingMissionId(null)
    setShowContext(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }
  const activeDocumentReviews = documentReviews.filter((r) => r.status !== 'dismissed' && r.status !== 'converted')
  const sendDisabled = activeSessionArchived || conversationBusy || isLoadingSession || Boolean(sessionLoadError || clientContextError) || anyUploading || manualModelUnavailable || (!input.trim() && !anyReady)

  const visibleSessions = useMemo(() => {
    const query = sessionSearch.trim().toLocaleLowerCase('pt-BR')
    return sessions
      .filter((session) => sessionView === 'archived' ? Boolean(session.archivedAt) : !session.archivedAt)
      .filter((session) => !query || `${session.title} ${session.lastMessage || ''}`.toLocaleLowerCase('pt-BR').includes(query))
      .sort((a, b) => Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)) || b.updatedAt - a.updatedAt)
  }, [sessionSearch, sessionView, sessions])

  const filteredClientes = clienteSearch.trim()
    ? clientes.filter((c) => c.nome.toLowerCase().includes(clienteSearch.toLowerCase()) || c.id.toLowerCase().includes(clienteSearch.toLowerCase()))
    : clientes

  return (
    <>
    {readingMessageId && messages.find(message => message.id === readingMessageId) && <AlixResponseReader content={messages.find(message => message.id === readingMessageId)!.content} onClose={() => setReadingMessageId(null)} />}
    <nav aria-label="Espaços da ALIX" className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex max-w-full flex-wrap rounded-xl border border-aletis-borda bg-card p-1 dark:border-white/15 dark:bg-white/5">
        <button type="button" aria-pressed={chatView} onClick={() => changeView('chat')} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold sm:gap-2 sm:px-4 sm:text-sm ${chatView ? 'bg-aletis-verde text-white' : 'text-[var(--text-soft)] hover:bg-aletis-bege dark:text-stone-300 dark:hover:bg-white/10'}`}><MessageSquare size={16} /> Conversar</button>
        <button type="button" aria-pressed={operationsView} onClick={() => changeView('operations')} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold sm:gap-2 sm:px-4 sm:text-sm ${operationsView ? 'bg-aletis-verde text-white' : 'text-[var(--text-soft)] hover:bg-aletis-bege dark:text-stone-300 dark:hover:bg-white/10'}`}><Workflow size={16} /> Meu dia</button>
        <button type="button" aria-pressed={driveView} onClick={() => changeView('drive')} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold sm:gap-2 sm:px-4 sm:text-sm ${driveView ? 'bg-aletis-verde text-white' : 'text-[var(--text-soft)] hover:bg-aletis-bege dark:text-stone-300 dark:hover:bg-white/10'}`}><FolderOpen size={16} /> Drive e dados</button>
      </div>
      {!chatView && conversationBusy && <span role="status" className="inline-flex items-center gap-2 text-xs text-foreground"><Loader2 size={14} className="animate-spin" /> Sua conversa continua em andamento</span>}
      {chatView && <button type="button" onClick={() => openContextSection('skills')} className="hidden min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[var(--text-soft)] hover:bg-aletis-bege dark:text-stone-300 sm:inline-flex"><Sparkles size={15} /> Habilidades</button>}
    </nav>
    {operationsView && <Suspense fallback={<div role="status" className="p-8 text-center text-sm text-stone-500">Carregando área operacional…</div>}><AlixOperationsPanel clienteId={viewParams.get('clienteId') || undefined} clientes={clientes} onHandoff={handleOperationalHandoff} handoffDisabledReason={conversationBusy ? 'Aguarde o trabalho atual terminar para iniciar outra prioridade.' : isLoadingSession ? 'Aguarde a conversa atual carregar.' : input.trim() || attachments.length ? 'Sua conversa tem um rascunho ou anexos. Envie ou guarde esse trabalho antes de iniciar outra prioridade.' : manualModelUnavailable ? 'Selecione um modelo disponível na conversa para iniciar a análise.' : undefined} onScopeChange={id => setViewParams(current => { const next = new URLSearchParams(current); if (id) next.set('clienteId', id); else next.delete('clienteId'); return next })} /></Suspense>}
    {driveView && <Suspense fallback={<div role="status" className="p-8 text-center text-sm text-stone-500">Carregando acervo do Drive…</div>}><AlixDriveCorpusPanel clienteId={viewParams.get('clienteId') || undefined} corporateOnly={viewParams.get('corporateOnly') === '1'} clientes={clientes} onScopeChange={(id, corporate) => setViewParams(current => { const next = new URLSearchParams(current); if (id) next.set('clienteId', id); else next.delete('clienteId'); if (corporate) next.set('corporateOnly', '1'); else next.delete('corporateOnly'); return next })} /></Suspense>}
    <div hidden={!chatView}>
    <div
      ref={workspaceRef}
      className="relative flex h-[calc(100dvh-160px)] min-h-0 gap-3 overflow-hidden [&_button]:focus-visible:outline [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-aletis-verde"
      data-alix-workspace
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag-drop overlay */}
      {dragActive && (
        <div className="absolute inset-0 z-50 bg-aletis-verde/10 backdrop-blur-sm border-2 border-dashed border-aletis-verde rounded-lg flex items-center justify-center pointer-events-none">
          <div className="bg-card rounded-lg shadow-xl px-8 py-6 flex items-center gap-3">
            <Paperclip className="w-6 h-6 text-foreground" />
            <div className="text-base font-semibold text-foreground">Solte os arquivos para a ALIX analisar</div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,image/*"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFilePick(e.target.files)
            e.target.value = ''
          }
        }}
      />

      {/* Memory modal */}
      {memoryOpen && (
        <AppDialog
          title="Memória"
          eyebrow={activeClienteLabel || activeClienteId || 'ALIX'}
          subtitle="Contexto persistente usado pela ALIX para este cliente."
          icon={<BookOpen className="h-5 w-5" />}
          size="lg"
          onClose={closeMemory}
          bodyClassName="bg-aletis-cream-papel/35"
        >
          {memoryLoading ? (
            <div className="flex items-center gap-2 text-[var(--text-soft)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Carregando memória...</span>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg border border-aletis-borda bg-card p-4 font-mono text-xs leading-relaxed text-foreground">
              {memoryMd || '_(memória vazia)_'}
            </pre>
          )}
        </AppDialog>
      )}

      {/* Sidebar - Sessions */}
      {sidebarOpen && (
        <button
          type="button"
          className="absolute inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fechar conversas"
        />
      )}
      {sidebarOpen && (
        <aside ref={historyRef} tabIndex={-1} aria-label="Histórico de conversas" onKeyDown={(event) => { if (event.key === 'Escape') { setSidebarOpen(false); inputRef.current?.focus() } }} className="absolute inset-y-0 left-0 z-40 flex h-full min-h-0 w-[272px] max-w-[calc(100%-1rem)] flex-shrink-0 flex-col overflow-hidden rounded-lg border border-aletis-borda bg-card shadow-lg outline-none lg:relative lg:z-auto lg:shadow-sm">
          <div className="flex items-center justify-between border-b border-aletis-borda px-3 py-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-soft)]">Conversas</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{sessions.filter((session) => !session.archivedAt).length} ativas</div>
            </div>
            <div className="flex items-center gap-1">
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Fechar histórico" className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-soft)] hover:bg-aletis-bege"><X size={17} /></button>
            <button
              onClick={handleNewSession}
              disabled={conversationBusy}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-aletis-verde text-white transition-colors hover:bg-aletis-verde-escuro"
              title="Nova conversa"
              aria-label="Nova conversa"
            >
              <Plus className="h-4 w-4" />
            </button>
            </div>
          </div>
          <div className="space-y-2 border-b border-aletis-borda p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={sessionSearch}
                onChange={(event) => setSessionSearch(event.target.value)}
                placeholder="Buscar no histórico"
                className="h-8 w-full rounded-md border border-aletis-borda bg-aletis-bege/20 pl-8 pr-3 text-xs text-foreground outline-none focus:border-aletis-verde"
              />
            </label>
            <div className="grid h-8 grid-cols-2 rounded-md border border-aletis-borda bg-aletis-bege/30 p-0.5">
              <button
                type="button"
                onClick={() => setSessionView('active')}
                className={`rounded text-[11px] font-semibold transition ${sessionView === 'active' ? 'bg-card text-aletis-verde-escuro shadow-sm' : 'text-muted-foreground'}`}
              >
                Ativas
              </button>
              <button
                type="button"
                onClick={() => setSessionView('archived')}
                className={`rounded text-[11px] font-semibold transition ${sessionView === 'archived' ? 'bg-card text-aletis-verde-escuro shadow-sm' : 'text-muted-foreground'}`}
              >
                Arquivadas ({sessions.filter((session) => Boolean(session.archivedAt)).length})
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {visibleSessions.length === 0 ? (
              <div className="p-4 text-xs leading-relaxed text-muted-foreground">
                {sessionSearch ? 'Nenhuma conversa encontrada.' : sessionView === 'archived' ? 'Nenhuma conversa arquivada.' : 'Inicie uma nova conversa com a ALIX.'}
              </div>
            ) : (
              visibleSessions.map((s) => {
                const active = s.id === activeSessionId
                const clienteNome = s.clienteId ? clientes.find((cliente) => cliente.id === s.clienteId)?.nome : null
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={conversationBusy ? -1 : 0}
                    aria-disabled={conversationBusy}
                    onClick={() => handleSelectSession(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSelectSession(s.id)
                      }
                    }}
                    className={`group w-full cursor-pointer border-b border-aletis-borda/50 p-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-aletis-dourado/40 ${
                      active ? 'bg-aletis-bege' : 'hover:bg-aletis-bege/50'
                    }`}
                    aria-pressed={active}
                    aria-label={`Abrir conversa ${s.title}`}
                  >
                    <div className="flex items-start gap-2">
                      {s.pinnedAt
                        ? <Pin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 fill-aletis-dourado text-aletis-dourado" />
                        : <MessageSquare className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${active ? 'text-foreground' : 'text-muted-foreground'}`} />}
                      <div className="flex-1 min-w-0">
                        {renamingSessionId === s.id ? (
                          <input
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={() => void commitRename()}
                            onKeyDown={(event) => {
                              event.stopPropagation()
                              if (event.key === 'Enter') void commitRename()
                              if (event.key === 'Escape') setRenamingSessionId(null)
                            }}
                            className="h-7 w-full rounded border border-aletis-verde bg-card px-2 text-xs font-semibold outline-none"
                            autoFocus
                          />
                        ) : (
                          <div className={`truncate text-xs font-semibold ${active ? 'text-aletis-verde-escuro' : 'text-foreground'}`}>{s.title}</div>
                        )}
                        {clienteNome && <div className="mt-0.5 truncate text-[11px] font-medium text-foreground">{clienteNome}</div>}
                        {s.legacyShared && <div className="mt-0.5 text-[11px] text-[var(--text-soft)]">Histórico compartilhado</div>}
                        {s.lastMessage && <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{s.lastMessage}</div>}
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span>{s.messageCount} msg</span>
                          <span>•</span>
                          <span>{timeAgo(s.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                        {sessionView === 'active' ? (
                          <>
                            <button type="button" onClick={(event) => handlePinSession(s.id, !s.pinnedAt, event)} className="p-1 text-muted-foreground hover:text-aletis-dourado" title={s.pinnedAt ? 'Desafixar' : 'Fixar'} aria-label={s.pinnedAt ? 'Desafixar conversa' : 'Fixar conversa'}>
                              <Pin className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={(event) => beginRename(s, event)} className="p-1 text-muted-foreground hover:text-aletis-verde" title="Renomear" aria-label="Renomear conversa">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button type="button" disabled={conversationBusy} onClick={(event) => handleArchiveSession(s.id, true, event)} className="p-1 text-muted-foreground hover:text-aletis-verde disabled:opacity-40" title="Arquivar" aria-label="Arquivar conversa">
                              <Archive className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" disabled={conversationBusy} onClick={(event) => handleArchiveSession(s.id, false, event)} className="p-1 text-muted-foreground hover:text-aletis-verde disabled:opacity-40" title="Restaurar" aria-label="Restaurar conversa">
                              <ArchiveRestore className="h-3 w-3" />
                            </button>
                            <button type="button" disabled={conversationBusy} onClick={(event) => handleDeleteSession(s.id, event)} className="p-1 text-muted-foreground hover:text-alerta disabled:opacity-40" title="Excluir definitivamente" aria-label="Excluir conversa definitivamente">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          {/* Wave-PG-17: stats agregados do PG (rodapé da sidebar) */}
          <AlixStatsFooter />
        </aside>
      )}

      {/* Main chat column */}
      <div className="flex-1 min-h-0 flex flex-col min-w-0">
        <header className="mb-2 shrink-0 rounded-xl border border-aletis-borda bg-card p-2 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-1.5 text-foreground sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-aletis-gold"><Sparkles size={20} /></div>
              <div className="min-w-0"><h1 className="font-display text-lg font-semibold leading-tight text-foreground">ALIX</h1><p className="max-w-[360px] truncate text-[11px] text-muted-foreground">{sessionTitle || 'Seu colaborador no ALETIS'}</p></div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => { setSidebarOpen((value) => !value); setShowContext(false) }} aria-expanded={sidebarOpen} aria-label={sidebarOpen ? 'Ocultar histórico de conversas' : 'Abrir histórico de conversas'} title="Histórico de conversas" className={`flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${sidebarOpen ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`}><PanelLeft size={17} /><span className="hidden sm:inline">Histórico</span></button>
              <button type="button" onClick={() => { setFocused(!focused); setSidebarOpen(false); setShowContext(false) }} aria-pressed={focused} aria-label={focused ? 'Sair do modo foco' : 'Ativar modo foco'} title={focused ? 'Sair do modo foco' : 'Ampliar área de trabalho'} className={`flex h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold ${focused ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`}>{focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}<span className="hidden sm:inline">Foco</span></button>
              <button type="button" onClick={handleNewSession} disabled={conversationBusy} aria-label="Nova conversa" title="Nova conversa" className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40"><Plus size={18} /></button>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 px-0.5">
            {/* Cliente selector */}
            <div className="relative min-w-0" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setClienteMenuOpen(false); clienteSelectorRef.current?.focus() } }}>
              <button
                ref={clienteSelectorRef}
                onClick={() => setClienteMenuOpen((v) => !v)}
                disabled={conversationBusy || isLoadingSession}
                aria-expanded={clienteMenuOpen}
                aria-label={activeClienteLabel ? `Cliente ativo: ${activeClienteLabel}. Trocar cliente` : 'Selecionar cliente ativo'}
                className={`flex items-center gap-2 min-h-10 px-2.5 py-2 sm:px-3 rounded-lg text-xs font-semibold transition-colors ${
                  activeClienteId
                    ? 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro'
                    : 'bg-card border border-aletis-borda text-[var(--text-soft)] hover:bg-aletis-bege'
                }`}
                title={activeClienteLabel ? `Cliente ativo: ${activeClienteLabel}` : 'Selecionar cliente ativo'}
              >
                <UserCircle2 className="w-3.5 h-3.5" />
                <span className="max-w-[100px] sm:max-w-[240px] truncate">{activeClienteLabel || 'Sem cliente ativo'}</span>
              </button>
              {clienteMenuOpen && (
                <div className="absolute left-0 mt-2 w-72 max-w-[calc(100vw-3rem)] bg-card rounded-xl shadow-xl border border-aletis-borda z-30 overflow-hidden">
                  <div className="p-2 border-b border-aletis-borda">
                    <input
                      type="text"
                      value={clienteSearch}
                      onChange={(e) => setClienteSearch(e.target.value)}
                      placeholder="Buscar cliente..."
                      className="w-full text-xs px-2 py-1.5 rounded border border-aletis-borda/60 focus:outline-none focus:border-aletis-verde"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto custom-scrollbar">
                    <button
                      onClick={() => void selectClienteContext(null)}
                      disabled={conversationBusy || Boolean(sessionLoadError)}
                      className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-aletis-bege border-b border-aletis-borda/50"
                    >
                      Limpar cliente ativo
                    </button>
                    {filteredClientes.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground">Nenhum cliente.</div>
                    ) : (
                      filteredClientes.slice(0, 50).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => void selectClienteContext(c.id)}
                          disabled={conversationBusy || Boolean(sessionLoadError)}
                          className={`w-full text-left px-3 py-2 text-xs border-b border-aletis-borda/30 hover:bg-aletis-bege ${
                            c.id === activeClienteId ? 'bg-aletis-bege font-semibold text-aletis-verde-escuro' : 'text-foreground'
                          }`}
                        >
                          <div className="truncate">{c.nome}</div>
                          <div className="text-[11px] text-muted-foreground font-mono truncate">{c.id}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => { setContextSection('sources'); setShowContext((value) => !value); setSidebarOpen(false); setClienteMenuOpen(false) }} aria-expanded={showContext} aria-label="Abrir contexto, evidências e missões" title="Cliente, documentos e fontes" className={`flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${showContext && contextSection === 'sources' ? 'bg-aletis-verde text-white' : 'border border-aletis-borda text-[var(--text-soft)] hover:bg-aletis-bege dark:text-stone-300'}`}><PanelRightOpen size={16} /><span>Contexto</span>{readyAttachmentCount > 0 && <span className="rounded bg-aletis-bege px-1.5 text-[11px] text-foreground">{readyAttachmentCount}</span>}</button>
              <button type="button" onClick={() => openContextSection('deliveries')} aria-label="Abrir entregas da conversa" className="flex min-h-10 items-center gap-1.5 rounded-lg border border-aletis-borda px-2.5 text-xs font-semibold text-[var(--text-soft)] hover:bg-aletis-bege dark:text-stone-300"><FolderOpen size={15} /><span className="hidden sm:inline">Entregas</span>{deliveries.length > 0 && <span>{deliveries.length}</span>}</button>
              <button type="button" onClick={() => { setShowSettings(true); setClienteMenuOpen(false) }} aria-label="Opções e ferramentas da ALIX" title="Modo de trabalho, notebooks e uso" className="flex h-10 w-10 items-center justify-center rounded-lg border border-aletis-borda text-[var(--text-soft)] hover:bg-aletis-bege"><SlidersHorizontal size={17} /></button>
            </div>
          </div>
        </header>

        {clientContextError && <div role="alert" className="mb-2 text-sm text-alerta"><p>{clientContextError} Recarregue o contexto para confirmar o cliente antes de continuar.</p><button type="button" onClick={() => setSessionReloadKey(key => key + 1)} className="mt-1 font-semibold underline">Recarregar contexto</button></div>}
        {notebookOpenError && <p role="alert" className="mb-2 text-sm text-alerta">{notebookOpenError}</p>}
        {execution && <div className="mb-2 shrink-0"><AlixExecutionPanel execution={execution} compact onExpand={() => openContextSection('work')} /></div>}

        {/* Chat container */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-aletis-borda bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/[0.025]" data-alix-conversation>
          {/* Messages */}
          <div className="relative min-h-0 flex-1">
          <div ref={scrollRef} onScroll={onScroll} role="log" aria-label="Mensagens da conversa" aria-live="off" className="custom-scrollbar h-full overflow-y-auto overscroll-contain p-3 sm:p-5">
            <div ref={contentRef} className="mx-auto w-full max-w-[1120px] space-y-6">
            {isLoadingSession && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {sessionLoadError && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>Não foi possível carregar esta conversa. Seu rascunho e anexos continuam guardados nesta tela.</p><p className="mt-1 text-xs">{sessionLoadError}</p><button type="button" onClick={() => setSessionReloadKey(key => key + 1)} className="mt-3 rounded-lg border border-amber-400 px-3 py-2 font-semibold">Tentar carregar novamente</button></div>}

            {showWelcome && !isLoadingSession && !sessionLoadError && (
              <div className="space-y-5 px-1 py-2 sm:px-3 sm:py-4">
                <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-aletis-gold-escuro">Inteligência aplicada ao seu trabalho</p><h2 className="font-display text-2xl font-bold leading-tight text-foreground dark:text-white sm:text-3xl">Do pedido à entrega.</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-soft)] dark:text-stone-300">Descreva o resultado, escolha o cliente quando houver e traga os documentos. Acompanhe as consultas, as fontes e o que foi concluído.</p></div>
                <AlixWorkStarters disabled={conversationBusy || isLoadingSession} onSelect={prepareRequest} />
              </div>
            )}

            {visibleMessages.map((msg) => {
              const isUser = msg.role === 'user'
              const displayContent = isUser ? operationalRequestDisplay(msg.content, activeSessionId) : msg.content
              const docs = isUser ? [] : extractDocumentsFromMessage(msg)
              const routing = isUser ? undefined : readAlixRouting(msg.metadata)
              const userAttachments = isUser && msg.metadata && Array.isArray((msg.metadata as any).attachments)
                ? (msg.metadata as any).attachments as Array<{ id: string; filename: string; kind: string }>
                : []
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                  <div className={`min-w-0 rounded-lg px-4 py-3 sm:px-5 ${isUser ? 'max-w-[88%]' : 'w-full'} ${
                    isUser
                      ? 'bg-aletis-verde text-white rounded-br-md'
                      : 'bg-card text-foreground rounded-bl-md border border-aletis-borda/70 shadow-sm dark:bg-[#1b2a20] dark:text-stone-100'
                  }`}>
                    {!isUser && (
                      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-aletis-borda/40">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="w-5 h-5 rounded-full bg-aletis-dourado flex items-center justify-center">
                            <Bot className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-aletis-dourado">ALIX</span>
                          {(msg.metadata as any)?.analysisMode === 'deep' && (
                            <span className="inline-flex items-center gap-1 rounded border border-aletis-verde/25 bg-aletis-verde/10 px-1.5 py-0.5 text-[11px] font-semibold text-aletis-verde-escuro">
                              <BrainCircuit className="h-3 w-3" />
                              Profundo
                            </span>
                          )}
                          {(msg.metadata as any)?.workMode && (
                            <span className="inline-flex items-center gap-1 rounded border border-aletis-dourado/25 bg-aletis-dourado/10 px-1.5 py-0.5 text-[11px] font-semibold text-aletis-dourado">
                              <Workflow className="h-3 w-3" />
                              {WORK_MODE_OPTIONS.find((item) => item.value === (msg.metadata as any).workMode)?.label || 'Missão'}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                        <button type="button" onClick={() => setReadingMessageId(msg.id)} aria-label="Ampliar resposta" title="Abrir resposta em modo de leitura" className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-foreground hover:bg-aletis-bege dark:text-stone-200"><Maximize2 size={15} /><span className="hidden sm:inline">Ler resposta</span></button>
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-aletis-grafite-escuro transition-opacity"
                          title="Copiar"
                          aria-label="Copiar resposta"
                        >
                          {copiedId === msg.id
                            ? <Check className="w-3.5 h-3.5 text-positivo" />
                            : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        </div>
                      </div>
                    )}
                    {routing && <details className="mb-3 rounded-lg border border-aletis-verde/10 bg-white/65 px-3 py-2 text-xs"><summary className="cursor-pointer font-semibold text-foreground">{routing.modelLabel || routing.model}<span className="ml-1.5 font-normal text-[var(--text-soft)]">· {routing.mode === 'auto' ? 'escolha automática' : 'escolha manual'}{routing.fallback ? ' · alternativa utilizada' : ''}</span></summary>{routing.reason && <p className="mt-2 leading-relaxed text-[var(--text-soft)]">{routing.reason}</p>}</details>}
                    {userAttachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {userAttachments.map((a) => {
                          const Icon = iconForKind((a.kind as AttachmentChip['kind']) || 'unknown')
                          return (
                            <span key={a.id} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-white">
                              <Icon className="w-3 h-3" />
                              <span className="max-w-[160px] truncate">{a.filename}</span>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    <div className="min-w-0 break-words text-[15px] leading-7 font-body [overflow-wrap:anywhere]">
                      <MessageErrorBoundary content={displayContent}>
                        {renderAlixContent(displayContent)}
                      </MessageErrorBoundary>
                    </div>
                    {/* ALIX Auditável — trail expansível com source/confidence/latência */}
                    {!isUser && msg.audit && (
                      <details className="mt-3 rounded-lg border border-aletis-borda bg-white/50 px-3 py-2 text-xs text-[var(--text-soft)]"><summary className="cursor-pointer font-semibold">Ver fontes e consultas desta resposta</summary><Suspense fallback={null}><AlixAuditPanel audit={msg.audit} /></Suspense></details>
                    )}
                    {docs.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-aletis-borda/40 flex flex-wrap gap-2">
                        {docs.map((d, i) => {
                          const kind = (d.kind as AttachmentChip['kind']) || kindFromFilename(d.filename || '', d.mimetype)
                          const Icon = iconForKind(kind)
                          return (
                            <a
                              key={d.id || i}
                              href={d.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde-escuro transition-colors"
                            >
                              <Icon className="w-3.5 h-3.5" />
                              <span className="max-w-[220px] truncate">{d.filename || 'documento'}</span>
                              {typeof d.sizeBytes === 'number' && (
                                <span className="text-[11px] opacity-80">{formatBytes(d.sizeBytes)}</span>
                              )}
                              <Download className="w-3 h-3 ml-1" />
                            </a>
                          )
                        })}
                      </div>
                    )}
                    {!isUser && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-aletis-borda/40 flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">Fontes:</span>
                        {msg.sources.map((s, i) => (
                          <span
                            key={i}
                            className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-card border border-aletis-borda text-[var(--text-soft)]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    {!isUser && <div className="flex flex-col items-start gap-x-4 sm:flex-row sm:flex-wrap">
                      <button type="button" onClick={() => setReadingMessageId(msg.id)} aria-label="Ler resposta em tela ampla" className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-foreground hover:bg-aletis-bege"><Maximize2 size={15} />Ler em tela ampla</button>
                      {activeSessionId && !/^Erro (ao|no)\b/i.test(msg.content) && <div className="w-full min-w-0 sm:w-auto sm:flex-1"><AlixMessageFeedback
                          key={`feedback-${msg.id}`}
                          message={msg}
                          sessionId={activeSessionId}
                          clienteId={activeClienteId}
                          missionId={activeMissionId}
                        /></div>}
                    </div>}
                  </div>
                </div>
              )
            })}

            {/* Typing indicator */}
            {isTyping && !execution && (
              <div className="flex justify-start">
                <div className="max-w-[75%] rounded-lg px-5 py-3 bg-aletis-bege border border-aletis-borda/50 rounded-bl-md">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded-full bg-aletis-dourado flex items-center justify-center">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-aletis-dourado">ALIX</span>
                    {currentTool && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-aletis-dourado/15 border border-aletis-dourado/40 text-aletis-dourado animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-aletis-dourado" />
                        usando <code>{currentTool}</code>
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 py-1">
                    <span className="w-2 h-2 rounded-full bg-aletis-grafite-claro animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-aletis-grafite-claro animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-aletis-grafite-claro animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          </div>
          {!isFollowing && <button type="button" onClick={scrollToLatest} className="absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-aletis-borda bg-aletis-verde px-4 py-2 text-xs font-semibold text-white shadow-lg"><ArrowDown size={15} />{hasNewContent ? 'Nova resposta · ir para o fim' : 'Ir para o fim'}</button>}
          </div>
          {/* Painéis de revisão/HITL aparecem só quando há pendência real. */}
          {activeDocumentReviews.length > 0 && (
          <div className="shrink-0 px-4 pt-3 border-t border-aletis-borda bg-zinc-950">
            <DocumentReviewQueue reviews={documentReviews} onDismiss={(id) => void dismissDocumentReview(id)} />
          </div>
          )}
          <Suspense fallback={null}>
            <AlixConfirmationsPanel key={`${activeSessionId || "new"}:${activeClienteId || "global"}`} sessionId={activeSessionId} clienteId={activeClienteId} />
          </Suspense>

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="shrink-0 px-4 pt-3 border-t border-aletis-borda bg-aletis-bege/30 flex flex-wrap gap-2 max-h-28 overflow-y-auto custom-scrollbar">
              {attachments.map((a) => {
                const Icon = iconForKind(a.kind)
                return (
                  <span
                    key={a.id}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                      a.error
                        ? 'bg-alerta/10 text-alerta border-alerta/30'
                        : a.scopeStatus === 'conflict'
                        ? 'bg-alerta/10 text-alerta border-alerta/40'
                        : a.uploading
                        ? 'bg-card text-[var(--text-soft)] border-aletis-borda'
                        : 'bg-card text-foreground border-aletis-verde/40'
                    }`}
                  >
                    {a.uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                    <span className="max-w-[180px] truncate">{a.filename}</span>
                    <span className="text-[11px] text-muted-foreground font-mono">{formatBytes(a.sizeBytes)}</span>
                    {a.error && <span className="text-[11px] text-alerta">{a.error}</span>}
                    {a.scopeStatus === 'conflict' && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold" title={a.scopeMessage}>
                        <AlertTriangle className="h-3 w-3" />
                        Outro cliente{a.detectedCliente?.nome ? `: ${a.detectedCliente.nome}` : ''}
                      </span>
                    )}
                    {a.needsScopeReview && !a.uploading && !a.error && (
                      <button type="button" disabled={conversationBusy} className="underline underline-offset-2 text-aletis-verde-escuro"
                        onClick={() => setScopeReviewForm({ documentId: a.id, clienteId: a.detectedCliente?.id || activeClienteId || '', reason: '' })}>
                        Revisar destino
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveAttachment(a.id)}
                      disabled={conversationBusy || Boolean(a.uploading)}
                      className="text-muted-foreground hover:text-alerta"
                      title="Remover"
                      aria-label="Remover anexo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {scopeReviewForm && attachments.some(item => item.id === scopeReviewForm.documentId) && (
            <form className="shrink-0 border-t border-aletis-borda bg-card p-4 space-y-2 text-sm" onSubmit={event => { event.preventDefault(); void confirmDocumentScope() }}>
              <p className="font-semibold">Confirmar destino de {attachments.find(item => item.id === scopeReviewForm.documentId)?.filename}</p>
              <p className="text-xs text-[var(--text-soft)]">Confira o titular e a finalidade do arquivo. Documentos sem CPF/CNPJ também podem ser vinculados com sua confirmação e justificativa.</p>
              <label className="block">Cliente
                <select required disabled={scopeReviewForm.busy} className="block w-full rounded border border-aletis-borda p-2" value={scopeReviewForm.clienteId} onChange={event => setScopeReviewForm({ ...scopeReviewForm, clienteId: event.target.value })}>
                  <option value="">Selecione o destino</option>
                  {clientes.map(cliente => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}
                </select>
              </label>
              <label className="block">Motivo da vinculação
                <textarea required minLength={10} maxLength={1000} disabled={scopeReviewForm.busy} className="block w-full rounded border border-aletis-borda p-2" rows={2} value={scopeReviewForm.reason} onChange={event => setScopeReviewForm({ ...scopeReviewForm, reason: event.target.value })} placeholder="Informe como verificou que este documento pertence ao cliente ou ao caso." />
              </label>
              {scopeReviewForm.error && <p role="alert" className="text-alerta">{scopeReviewForm.error}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={scopeReviewForm.busy || !scopeReviewForm.clienteId || scopeReviewForm.reason.trim().length < 10} className="rounded bg-aletis-verde px-3 py-2 text-white disabled:opacity-50">{scopeReviewForm.busy ? 'Confirmando…' : 'Confirmar e vincular documento'}</button>
                <button type="button" disabled={scopeReviewForm.busy} onClick={() => setScopeReviewForm(null)}>Manter em revisão</button>
              </div>
            </form>
          )}

          {/* Wave 11 — Document Analysis Card */}
          {(analysis || analysisLoading || analysisError) && (
            <div className="shrink-0 px-4 pb-2 border-t border-aletis-borda bg-aletis-bege/30 max-h-40 overflow-y-auto custom-scrollbar">
              <Suspense fallback={<div className="py-3 text-xs text-muted-foreground">Carregando análise…</div>}>
                <DocumentAnalysisCard
                  analysis={analysis}
                  loading={analysisLoading}
                  error={analysisError}
                  compact={true}
                  onDismiss={clearAnalysis}
                />
              </Suspense>
            </div>
          )}

          {/* Input bar */}
          <div className="shrink-0 border-t border-aletis-borda bg-card p-2 dark:bg-[#17251b]">
            {activeSessionArchived && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-aletis-dourado/35 bg-aletis-dourado/10 px-3 py-2 text-xs text-foreground">
                <span>Esta conversa está arquivada.</span>
                <button
                  type="button"
                  onClick={(event) => activeSessionId && handleArchiveSession(activeSessionId, false, event)}
                  className="inline-flex items-center gap-1.5 font-semibold text-aletis-verde-escuro hover:text-aletis-verde"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  Restaurar para continuar
                </button>
              </div>
            )}
            <AlixWorkComposer
              ref={inputRef}
              value={input}
              onChange={setInput}
              disabled={conversationBusy || isLoadingSession || activeSessionArchived}
              sendDisabled={sendDisabled}
              replying={conversationWork === 'reply'}
              archived={activeSessionArchived}
              hasAttachments={attachments.length > 0}
              onSend={() => void handleSend()}
              onCancel={() => void handleCancelActiveMission()}
              onAttach={() => fileInputRef.current?.click()}
              modelControl={<AlixModelSelector value={modelPreference} options={modelOptions} loading={modelCatalogueLoading} error={modelCatalogueError} disabled={conversationBusy || isLoadingSession} onChange={(value) => { if (!isWorking()) setModelPreference(value) }} onRefresh={() => void refreshModelCatalogue()} />}
              quickActions={<div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1" aria-label="Pedidos rápidos">
                {QUICK_ACTIONS.map((q) => {
                  const Icon = q.icon
                  return <button key={q.label} type="button" onClick={() => { setInput(q.prompt); inputRef.current?.focus() }} disabled={conversationBusy || isLoadingSession || activeSessionArchived || manualModelUnavailable} title="Preparar este pedido para revisar e enviar" className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-[var(--text-soft)] transition-colors hover:bg-aletis-bege hover:text-aletis-verde disabled:opacity-50 dark:text-stone-300"><Icon size={12} />{q.label}</button>
                })}
              </div>}
            />
            {manualModelUnavailable && !modelCatalogueLoading && <div role="status" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-800"><span>O modelo escolhido não está disponível no catálogo atual.</span><button type="button" disabled={conversationBusy} onClick={() => { if (!isWorking()) setModelPreference('auto') }} className="min-h-8 font-semibold underline">Usar seleção automática</button></div>}
          </div>
        </div>
      </div>

      {showNotebooks && activeSessionId && !notebooksMinimized && (
        <Suspense fallback={null}>
          <MotionDialog
            title="Notebooks ALIX"
            eyebrow="WORKSPACE DOCUMENTAL"
            subtitle="Organize fontes, investigue evidências e produza entregas executivas sem perder o contexto do cliente."
            icon={<BookOpen className="h-5 w-5" />}
            onClose={() => {
              setShowNotebooks(false)
              setNotebooksMinimized(false)
            }}
            size="full"
            bodyClassName="h-[min(78dvh,880px)] overflow-hidden p-0"
          >
            <AlixNotebooksPanel
              activeSessionId={activeSessionId}
              activeClienteId={activeClienteId}
              activeClienteLabel={activeClienteLabel}
              attachments={attachments}
              onClose={() => {
                setShowNotebooks(false)
                setNotebooksMinimized(false)
              }}
              onMinimize={() => setNotebooksMinimized(true)}
              onPrompt={(prompt) => {
                setInput(prompt)
                setShowNotebooks(false)
                setTimeout(() => inputRef.current?.focus(), 50)
              }}
            />
          </MotionDialog>
        </Suspense>
      )}

      {showContext && !showNotebooks && (
        <AlixWorkspacePanel title="Contexto e entregas" onClose={() => setShowContext(false)}>
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-aletis-borda bg-card p-1" role="tablist" aria-label="Área de trabalho da ALIX">
            {([{ id: 'sources', label: 'Contexto' }, { id: 'work', label: 'Execução' }, { id: 'deliveries', label: 'Entregas' }, { id: 'skills', label: 'Habilidades' }] as const).map(section => <button key={section.id} type="button" role="tab" id={`alix-tab-${section.id}`} aria-controls={`alix-panel-${section.id}`} aria-selected={contextSection === section.id} onClick={() => setContextSection(section.id)} className={`min-h-10 min-w-0 rounded-lg px-1 text-[11px] font-semibold ${contextSection === section.id ? 'bg-aletis-verde text-white' : 'text-[var(--text-soft)] hover:bg-aletis-bege'}`}>{section.label}</button>)}
          </div>
          <div role="tabpanel" id="alix-panel-sources" aria-labelledby="alix-tab-sources" hidden={contextSection !== 'sources'} className="space-y-3">
            <section className="rounded-xl border border-aletis-borda bg-card p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente deste trabalho</h3>
              <p className="mt-2 break-words text-sm font-semibold text-foreground">{activeClienteLabel || 'Trabalho sem cliente vinculado'}</p>
              {activeClienteId ? <a href={`/clientes/${encodeURIComponent(activeClienteId)}`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-foreground">Abrir cadastro no CRM <ArrowUpRight size={14} /></a> : <p className="mt-2 text-xs leading-relaxed text-[var(--text-soft)]">Selecione um cliente no cabeçalho para trabalhar com o contexto do cadastro.</p>}
            </section>
            <section className="rounded-xl border border-aletis-borda bg-card p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Arquivos deste pedido</h3>
              {attachments.length > 0 ? <ul className="mt-3 space-y-2">{attachments.map(attachment => <li key={attachment.id} className="flex items-start gap-2 text-xs"><FileText size={15} className="mt-0.5 shrink-0 text-foreground" /><div className="min-w-0"><p className="break-words font-medium text-foreground">{attachment.filename}</p><p className="mt-0.5 text-[var(--text-soft)]">{attachment.uploading ? 'Enviando arquivo…' : attachment.error ? 'Não foi possível anexar' : 'Disponível para este pedido'}</p></div></li>)}</ul> : <p className="mt-2 text-xs leading-relaxed text-[var(--text-soft)]">Nenhum arquivo anexado a este pedido. As fontes consultadas aparecem junto de cada resposta.</p>}
              <button type="button" disabled={conversationBusy || isLoadingSession || activeSessionArchived} onClick={() => { setShowContext(false); fileInputRef.current?.click() }} className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-foreground disabled:opacity-50"><Paperclip size={14} />Anexar documentos</button>
            </section>
        {/* Briefing panel */}
        {briefing && (
          <div className="mb-3 bg-card rounded-lg border border-aletis-borda shadow-sm overflow-hidden">
            <button
              onClick={() => setBriefingExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-aletis-bege/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <UserCircle2 className="w-4 h-4 text-foreground flex-shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">
                  Briefing — {briefing.clienteNome}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {briefing.sugestaoPrimeiraAcao}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleOpenMemory() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleOpenMemory() } }}
                  className="text-[11px] font-semibold text-foreground hover:text-aletis-verde-escuro cursor-pointer"
                >
                  Ver memória
                </span>
                <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${briefingExpanded ? 'rotate-90' : ''}`} />
              </div>
            </button>
            {briefingExpanded && (
              <div className="px-4 pb-4 pt-1 space-y-3">
                {briefing.resumoExecutivo && (
                  <div className="text-xs text-[var(--text-soft)] leading-relaxed">{briefing.resumoExecutivo}</div>
                )}
                {briefing.destaques.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {briefing.destaques.slice(0, 6).map((d, i) => {
                      const color = d.severidade === 'critico'
                        ? 'bg-alerta/10 text-alerta border-alerta/30'
                        : d.severidade === 'atencao'
                        ? 'bg-aletis-dourado/10 text-aletis-dourado border-aletis-dourado/30'
                        : 'bg-aletis-verde/10 text-aletis-verde-escuro border-aletis-verde/30'
                      return (
                        <span key={i} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${color}`} title={d.detalhe}>
                          {d.severidade === 'critico' && <AlertTriangle className="w-3 h-3" />}
                          {d.titulo}
                        </span>
                      )
                    })}
                  </div>
                )}
                {briefing.proximasAcoes.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Próximas ações</div>
                    {briefing.proximasAcoes.slice(0, 4).map((a, i) => (
                      <div key={i} className="text-xs text-foreground leading-relaxed flex gap-1.5">
                        <span className="text-foreground">•</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

          </div>
          <div role="tabpanel" id="alix-panel-work" aria-labelledby="alix-tab-work" hidden={contextSection !== 'work'} className="space-y-3">
          <AlixExecutionPanel execution={execution} />
          {!execution && <p className="rounded-xl border border-aletis-borda bg-card p-4 text-xs leading-relaxed text-[var(--text-soft)]">Ao enviar um pedido, acompanhe aqui a IA escolhida, as consultas e o resultado de cada ferramenta.</p>}
          <Suspense fallback={<div className="rounded-lg border border-aletis-borda bg-card p-4 text-xs text-muted-foreground">Carregando central de tarefas…</div>}>
            <AlixTaskCenter
              sessionId={activeSessionId}
              clienteId={activeClienteId}
              refreshKey={missionRefreshKey}
              onResume={handleResumeMission}
            />
          </Suspense>
          <Suspense fallback={null}>
            <DocumentPipelinePanel sessionId={activeSessionId} clienteId={activeClienteId} />
          </Suspense>
          {commandCenter && (
            <AlixCommandCenterPanel
              data={commandCenter}
              onPrompt={(prompt) => setInput(prompt)}
            />
          )}
          </div>
          <div role="tabpanel" id="alix-panel-deliveries" aria-labelledby="alix-tab-deliveries" hidden={contextSection !== 'deliveries'}>
            <AlixDeliveriesPanel deliveries={deliveries} onPrepare={() => prepareRequest('Prepare uma entrega com os dados e as fontes disponíveis. Informe o que falta antes de concluir e disponibilize o arquivo gerado.', 'document_generation')} onOpenNotebooks={() => void openNotebooks()} />
          </div>
          <div role="tabpanel" id="alix-panel-skills" aria-labelledby="alix-tab-skills" hidden={contextSection !== 'skills'} className="space-y-3">
            <p className="text-xs leading-relaxed text-[var(--text-soft)]">Escolha um ponto de partida, adapte o pedido e envie. As consultas e ações aparecem na execução conforme forem realizadas.</p>
            <AlixWorkStarters disabled={conversationBusy || isLoadingSession || activeSessionArchived} onSelect={prepareRequest} />
          </div>
        </AlixWorkspacePanel>
      )}

      {showNotebooks && notebooksMinimized && (
        <button
          type="button"
          onClick={() => setNotebooksMinimized(false)}
          className="absolute bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-aletis-verde px-4 py-2.5 text-xs font-semibold text-white shadow-xl transition hover:bg-aletis-verde-escuro"
          title="Restaurar notebooks documentais"
          aria-label="Restaurar notebooks documentais"
        >
          <PanelRightOpen className="h-4 w-4" />
          Notebooks minimizados
        </button>
      )}

      {showSettings && (
        <AppDialog title="Opções da ALIX" eyebrow="Área de trabalho" subtitle="Defina o tipo de análise ou abra uma ferramenta de apoio." size="md" collapsible={false} onClose={() => setShowSettings(false)}>
          <div className="space-y-5">
            <section><h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-soft)]">Como trabalhar</h2><div className="flex flex-wrap gap-3">
            <label className="flex h-10 items-center gap-1.5 rounded-md border border-aletis-borda bg-card px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" title="Modo de trabalho da missão">
              <Workflow className="h-3.5 w-3.5 text-foreground" />
              <select
                value={workMode}
                onChange={(event) => {
                  setWorkMode(event.target.value as AlixWorkMode)
                  setPendingMissionId(null)
                }}
                className="max-w-[150px] bg-transparent text-[11px] font-semibold normal-case tracking-normal text-foreground outline-none"
                aria-label="Modo de trabalho da ALIX"
              >
                {WORK_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <div className="flex h-10 items-center rounded-md border border-aletis-borda bg-card p-0.5" role="group" aria-label="Profundidade da análise">
              <button
                type="button"
                onClick={() => setAnalysisMode('standard')}
                aria-pressed={analysisMode === 'standard'}
                className={`flex h-8 items-center gap-1 rounded px-2 text-[11px] font-semibold transition ${analysisMode === 'standard' ? 'bg-aletis-bege text-foreground' : 'text-muted-foreground hover:text-aletis-grafite-escuro'}`}
                title="Resposta objetiva com as ferramentas necessárias"
              >
                <Zap className="h-3 w-3" />
                Ágil
              </button>
              <button
                type="button"
                onClick={() => setAnalysisMode('deep')}
                aria-pressed={analysisMode === 'deep'}
                className={`flex h-8 items-center gap-1 rounded px-2 text-[11px] font-semibold transition ${analysisMode === 'deep' ? 'bg-aletis-verde text-white' : 'text-muted-foreground hover:text-aletis-grafite-escuro'}`}
                title="Cruza fontes, documentos, CRM e simuladores antes de concluir"
              >
                <BrainCircuit className="h-3 w-3" />
                Profundo
              </button>
            </div>

            </div></section>
            <section><h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-soft)]">Ferramentas e acompanhamento</h2><div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setShowSettings(false); setShowTasks(true) }}
              aria-label="Abrir central de tarefas da ALIX"
              className="flex items-center gap-1 min-h-10 px-3 py-2 rounded-lg text-[11px] font-semibold bg-card border border-aletis-borda text-muted-foreground hover:text-aletis-grafite-escuro transition-colors"
              title="Missões, progresso, fontes e custo"
            >
              <Workflow className="w-3 h-3" />
              Missões
            </button>

            <button
              onClick={() => void openNotebooks()}
              disabled={conversationBusy || isLoadingSession || Boolean(sessionLoadError || clientContextError)}
              aria-label="Abrir notebooks documentais da ALIX"
              className={`flex items-center gap-1 min-h-10 px-3 py-2 rounded-lg text-[11px] font-semibold border transition-colors ${
                showNotebooks
                  ? 'bg-aletis-verde text-white border-aletis-verde'
                  : 'bg-card border-aletis-borda text-muted-foreground hover:text-aletis-grafite-escuro'
              }`}
              title="Notebooks documentais: organizar fontes, perguntar e gerar documentos"
            >
              <BookOpen className="w-3 h-3" />
              Notebooks
            </button>

            {/* Telemetria visual — abre overlay com custo/tokens/latência/tools */}
            <button
              onClick={() => { setShowSettings(false); setShowTelemetry(true) }}
              aria-label="Abrir painel de uso e custo da ALIX"
              className="flex items-center gap-1 min-h-10 px-3 py-2 rounded-lg text-[11px] font-semibold bg-card border border-aletis-borda text-muted-foreground hover:text-aletis-grafite-escuro transition-colors"
              title="Uso, custo, latência e top tools (60s polling)"
            >
              <Activity className="w-3 h-3" />
              Uso
            </button>

            <button
              onClick={() => { setShowSettings(false); setShowGovernance(true) }}
              aria-label="Abrir painel de governança da ALIX"
              className="flex items-center gap-1 min-h-10 px-3 py-2 rounded-lg text-[11px] font-semibold bg-card border border-aletis-borda text-muted-foreground hover:text-aletis-grafite-escuro transition-colors"
              title="Evals, releases, evidências, aprovações e automações seguras"
            >
              <ShieldCheck className="w-3 h-3" />
              Governança
            </button>

            </div></section>
          </div>
        </AppDialog>
      )}

      {/* Telemetria — mesmo padrão visual dos modais do sistema */}
      {showTasks && (
        <AppDialog
          title="Central de tarefas"
          eyebrow="ALIX WORKSPACE"
          subtitle="Acompanhe missões, passos, fontes, custo, cancelamento e retomada."
          icon={<Workflow className="h-5 w-5" />}
          size="lg"
          onClose={() => setShowTasks(false)}
        >
          <Suspense fallback={<div className="py-6 text-center text-sm text-muted-foreground">Carregando missões…</div>}>
            <AlixTaskCenter
              sessionId={activeSessionId}
              clienteId={activeClienteId}
              refreshKey={missionRefreshKey}
              onResume={handleResumeMission}
            />
            <div className="mt-3">
              <DocumentPipelinePanel sessionId={activeSessionId} clienteId={activeClienteId} />
            </div>
          </Suspense>
        </AppDialog>
      )}

      {showTelemetry && (
        <AppDialog
          title="Uso & custo da ALIX"
          eyebrow="Telemetria"
          subtitle="Custos, tokens, latência e ferramentas mais usadas."
          icon={<Activity className="h-5 w-5" />}
          size="lg"
          onClose={() => setShowTelemetry(false)}
          bodyClassName="bg-aletis-verde-escuro/95"
        >
          <Suspense fallback={<div className="rounded-xl border border-aletis-sage/15 bg-aletis-cream/[0.04] px-4 py-3 text-sm text-aletis-sage">Carregando telemetria...</div>}>
            <AlixTelemetryPanel embedded />
          </Suspense>
        </AppDialog>
      )}

      {showGovernance && (
        <AppDialog
          title="Governança & automações da ALIX"
          eyebrow="Controle de IA"
          subtitle="Avaliações, promoção segura, evidências e ações supervisionadas."
          icon={<ShieldCheck className="h-5 w-5" />}
          size="lg"
          onClose={() => setShowGovernance(false)}
          bodyClassName="bg-aletis-verde-escuro/95"
        >
          <Suspense fallback={<div className="rounded-xl border border-aletis-sage/15 bg-aletis-cream/[0.04] px-4 py-8 text-center text-sm text-aletis-sage">Carregando governança...</div>}>
            <AlixGovernancePanel />
          </Suspense>
        </AppDialog>
      )}
    </div>
    </div>
    </>
  )
}
