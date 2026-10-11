import ClientePortalAssuntosPanel from '../ClientePortalAssuntosPanel'
// ============================================================
// WorkflowSection — arquivos, documentos oficiais e histórico do cliente.
// ============================================================
import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../../hooks/useApi'
import { PortalMessages } from '../../../pages/portal/PortalMessages'
import type { PendenciaDTO, UploadDTO } from '../../../pages/portal/types'
import { useAuth } from '../../../contexts/AuthContext'
import {
  Workflow,
  FileText,
  MessageSquare,
  History,
  Clock,
  Send,
  Wallet,
  ExternalLink,
  Loader2,
  Brain,
  UploadCloud,
  Search,
  Sparkles,
  CheckSquare,
  Cloud,
  FolderOpen,
  CalendarPlus,
  Mail,
  FilePlus2,
  RefreshCw,
  Link2,
} from 'lucide-react'
import type { UseClienteDataReturn } from './useClienteData'
import { fmtData, fmtDataHora } from './utils'

const ProcessoAssessoriaTab = lazy(() => import('../../processo/ProcessoAssessoriaTab'))
const ClienteDocumentosTab = lazy(() => import('../ClienteDocumentosTab'))
const ClienteFluxoCaixaTab = lazy(() => import('../ClienteFluxoCaixaTab'))
const ChangelogPanel = lazy(() => import('../../gestao-financeira/ChangelogPanel'))
const ComentariosPanel = lazy(() => import('../../gestao-financeira/ComentariosPanel'))

type WfTab = 'inteligencia' | 'documentos' | 'google' | 'processo' | 'colaboracao' | 'fluxo' | 'timeline'

interface Props {
  data: UseClienteDataReturn
}

const TABS: { key: WfTab; label: string; icon: typeof Workflow }[] = [
  { key: 'documentos', label: 'Arquivos organizados', icon: FileText },
  { key: 'processo', label: 'Processos e modelos', icon: Workflow },
  { key: 'inteligencia', label: 'IA documental', icon: Brain },
  { key: 'google', label: 'Google Drive', icon: Cloud },
  { key: 'colaboracao', label: 'Pareceres e auditoria', icon: MessageSquare },
  { key: 'fluxo', label: 'Fluxo de caixa', icon: Wallet },
  { key: 'timeline', label: 'Histórico e portal', icon: Clock },
]

const workflowPanelClass = 'rounded-lg border border-aletis-borda bg-card shadow-none'
const workflowInputClass = 'w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground transition focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20 disabled:bg-aletis-cream/40 disabled:text-aletis-grafite-claro'
const workflowPrimaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-aletis-verde px-3.5 text-xs font-semibold text-white shadow-none transition hover:bg-aletis-verde-escuro disabled:cursor-not-allowed disabled:opacity-50'
const workflowSecondaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3.5 text-xs font-semibold text-foreground transition hover:bg-aletis-cream-papel disabled:cursor-not-allowed disabled:opacity-50'
const workflowIconButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-xl border border-aletis-borda bg-card text-[var(--text-soft)] transition hover:bg-aletis-cream-papel hover:text-aletis-verde'

function workflowTabFromSearch(params: URLSearchParams): WfTab {
  const raw = (params.get('workflow') || params.get('wf') || '').trim()
  return TABS.some((t) => t.key === raw) ? (raw as WfTab) : 'documentos'
}

export default function WorkflowSection({ data }: Props) {
  const { cliente, apiId } = data
  const [searchParams, setSearchParams] = useSearchParams()
  const [active, setActive] = useState<WfTab>(() => workflowTabFromSearch(searchParams))
  const [grupoId, setGrupoId] = useState<string | null>(null)

  useEffect(() => {
    const next = workflowTabFromSearch(searchParams)
    if (next !== active) setActive(next)
  }, [active, searchParams])

  function changeTab(tab: WfTab) {
    setActive(tab)
    const next = new URLSearchParams(searchParams)
    next.set('area', 'workflow')
    next.set('workflow', tab)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (!apiId) return
    apiFetch<{ grupos: Array<{ id: string }> }>(`/gestao-financeira/grupos?clienteId=${apiId}`)
      .then((r) => { if (r.grupos?.[0]) setGrupoId(r.grupos[0].id) })
      .catch(() => {})
  }, [apiId])

  if (!cliente || !apiId) return null

  return (
    <div className="space-y-3 animate-fade-in">
      <nav className="client-secondary-nav" aria-label="Ferramentas de documentos e processos">
        {TABS.map(tab => { const Icon = tab.icon; return <button key={tab.key} type="button" aria-pressed={active === tab.key} onClick={() => changeTab(tab.key)} className="inline-flex items-center gap-1.5"><Icon size={14} />{tab.label}</button> })}
      </nav>

      {active === 'inteligencia' && (
        <CoreIntelligenceView clienteId={apiId} clienteNome={cliente.nome} />
      )}
      {active === 'processo' && (
        <Suspense fallback={<Sk />}>
          <ProcessoAssessoriaTab clienteId={apiId} clienteNome={cliente.nome} />
        </Suspense>
      )}
      {active === 'documentos' && (
        <Suspense fallback={<Sk />}>
          <ClienteDocumentosTab
            clienteId={apiId}
            clienteNome={cliente.nome}
            onOpenOfficialDocuments={() => changeTab('processo')}
          />
        </Suspense>
      )}
      {active === 'google' && (
        <GoogleClientWorkspaceView key={apiId} clienteId={apiId} clienteNome={cliente.nome} />
      )}
      {active === 'colaboracao' && (
        <ColaboracaoView grupoId={grupoId} />
      )}
      {active === 'fluxo' && (
        <Suspense fallback={<Sk />}>
          <ClienteFluxoCaixaTab clienteId={apiId} />
        </Suspense>
      )}
      {active === 'timeline' && (
        <div className="space-y-5"><ClientePortalAssuntosPanel clienteId={apiId} /><TimelineView clienteId={apiId} clienteNome={cliente.nome} /></div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
interface CoreDocument {
  id: string
  nome: string
  tipo: string
  categoria: string
  status: string
  tamanho: number
  criadoEm?: string
  textoExtraidoChars: number
  ragStatus?: string
  embeddingStatus?: string
  resumoIa?: string
  source: 'core' | 'portal'
  downloadUrl: string
}

interface CoreSummary {
  metrics: {
    contatos: number
    tarefasPendentes: number
    tarefasAtrasadas: number
    reunioesFuturas: number
    contratosAtivos: number
    eventosTimeline: number
  }
  tasks: Array<{ id: string; titulo: string; status: string; prioridade?: string; dueAt?: string }>
  timeline: Array<{ id: string; title?: string; description?: string; eventType?: string; createdAt?: string }>
}

interface KnowledgeSummary {
  totalDocumentos: number
  pendentes: number
  vencendo: number
  indexados: number
  pendentesIndexacao: number
  categorias: Record<string, number>
}

interface ClientAskResponse {
  answer: string
  provider: string
  confidence: number
  sources: Array<{ documentId?: string; sourceFilename?: string; excerpt?: string }>
}

interface GoogleWorkspaceStatus {
  status: 'unconfigured' | 'disconnected' | 'connected' | 'expired' | 'revoked' | 'error'
  googleEmail?: string | null
  features: { drive: string; docs: string; calendar: string; gmail: string }
  missingEnv: string[]
}

interface GoogleClientBundle {
  folder: null | {
    googleFolderId: string
    folderUrl: string
    folderName: string
    subfolders: Record<string, { id: string; url: string; name: string }>
  }
  documents: Array<{ id: string; documentType: string; title: string; googleDocUrl: string; createdAt: string }>
  events: Array<{ id: string; title: string; startTime: string; eventUrl?: string | null; status: string }>
  emails: Array<{ id: string; subject: string; toEmail: string; sentAt?: string | null; createdAt: string }>
}

interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  sizeBytes: string | null
  modifiedAt: string | null
  url: string
  path: string
}

interface GoogleDriveImportResult {
  id: string
  requestId: string
  status: 'pending' | 'running' | 'paused' | 'partial' | 'completed'
  sessionId?: string
  results: Array<{ fileId: string; name?: string; imported: boolean; state?: string; reason?: string; sessionId?: string; documentId?: string; needsReview?: boolean }>
  meta: { requested: number; imported: number; remaining: number; pendingReview?: number; failed: number }
}

function CoreIntelligenceView({ clienteId, clienteNome }: { clienteId: string; clienteNome: string }) {
  const [core, setCore] = useState<CoreSummary | null>(null)
  const [docs, setDocs] = useState<CoreDocument[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [categoria, setCategoria] = useState('contrato')
  const [question, setQuestion] = useState('Resuma a situação atual deste cliente e liste pendências prioritárias.')
  const [answer, setAnswer] = useState<ClientAskResponse | null>(null)
  const [asking, setAsking] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const [coreData, docsData, knowledgeData] = await Promise.all([
        apiFetch<CoreSummary>(`/clientes/${clienteId}/core`),
        apiFetch<{ documents: CoreDocument[]; total: number }>(`/clientes/${clienteId}/documents`),
        apiFetch<KnowledgeSummary>(`/clientes/${clienteId}/knowledge-summary`),
      ])
      setCore(coreData)
      setDocs(docsData.documents || [])
      setKnowledge(knowledgeData)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  async function uploadFile(file?: File | null) {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('clienteId', clienteId)
      form.append('categoria', categoria)
      form.append('source', 'client_workspace')
      await apiFetch(`/documents/upload`, { method: 'POST', body: form })
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function ask() {
    const q = question.trim()
    if (!q) return
    setAsking(true)
    setError(null)
    try {
      const data = await apiFetch<ClientAskResponse>(`/clientes/${clienteId}/ask`, {
        method: 'POST',
        body: JSON.stringify({ question: q }),
      })
      setAnswer(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAsking(false)
    }
  }

  async function indexDoc(id: string) {
    setError(null)
    try {
      await apiFetch(`/documents/${id}/index`, { method: 'POST' })
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function addTask() {
    const titulo = taskTitle.trim()
    if (!titulo) return
    setError(null)
    try {
      await apiFetch(`/clients/${clienteId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ titulo, prioridade: 'alta', status: 'pendente' }),
      })
      setTaskTitle('')
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const staleDocs = docs.filter((d) => d.source === 'core' && d.ragStatus === 'pending')

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricTile label="Documentos" value={knowledge?.totalDocumentos ?? 0} hint={`${knowledge?.indexados ?? 0} indexados`} />
        <MetricTile label="Pendências" value={core?.metrics.tarefasPendentes ?? 0} hint={`${core?.metrics.tarefasAtrasadas ?? 0} atrasadas`} />
        <MetricTile label="Reuniões" value={core?.metrics.reunioesFuturas ?? 0} hint="Próximos compromissos" />
        <MetricTile label="Contratos" value={core?.metrics.contratosAtivos ?? 0} hint="Ativos no cliente" />
        <MetricTile label="RAG" value={staleDocs.length} hint="Docs pendentes" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-3">
        <section className={`${workflowPanelClass} min-w-0 p-4`}>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl border border-aletis-borda bg-aletis-bege/45 text-foreground flex items-center justify-center">
              <Brain className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-display uppercase tracking-[0.14em] text-muted-foreground">inteligência do cliente</p>
              <h3 className="text-sm font-display font-semibold text-foreground">Pergunte sobre {clienteNome}</h3>
              <p className="text-xs leading-relaxed text-[var(--text-soft)] mt-1">
                A resposta usa CRM, documentos indexados e memória contextual, separando fatos, leitura operacional e próximos passos.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-2">
            {[
              'Quais documentos faltam?',
              'Resuma este cliente para uma reunião.',
              'Quais tarefas estão atrasadas?',
              'Quais riscos aparecem nos documentos?',
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => setQuestion(prompt)}
                className="h-8 rounded-xl border border-aletis-borda bg-card px-2.5 text-[11px] font-medium text-[var(--text-soft)] transition hover:bg-aletis-bege/45 hover:text-aletis-grafite-escuro"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              className={`${workflowInputClass} min-h-[88px] flex-1 resize-y leading-relaxed`}
              placeholder="Pergunte algo sobre este cliente..."
            />
            <button
              onClick={ask}
              disabled={asking || !question.trim()}
              className={`${workflowPrimaryButtonClass} h-auto min-h-[88px] self-stretch px-4 text-sm`}
            >
              {asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Analisar
            </button>
          </div>

          {answer ? (
            <div className="mt-4 rounded-lg border border-aletis-borda bg-aletis-cream-papel/55 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-foreground" />
                <span className="text-xs font-semibold text-foreground">
                  Resposta contextual · confiança {(answer.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {answer.answer}
              </div>
              {answer.sources?.length > 0 && (
                <div className="mt-3 border-t border-aletis-borda pt-3">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">fontes consultadas</p>
                  <div className="space-y-1.5">
                    {answer.sources.slice(0, 4).map((source, idx) => (
                      <p key={`${source.documentId}-${idx}`} className="text-[11px] text-[var(--text-soft)] line-clamp-2">
                        <strong>{source.sourceFilename || source.documentId || 'Documento'}</strong> · {source.excerpt}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-aletis-borda bg-aletis-cream-papel/35 p-4 text-xs text-muted-foreground">
              A inteligência contextual ainda não foi consultada nesta sessão.
            </div>
          )}
        </section>

        <aside className="space-y-3 min-w-0">
          <section className={`${workflowPanelClass} p-4`}>
            <div className="flex items-center justify-between mb-3 gap-2">
              <div>
                <p className="text-[11px] font-display uppercase tracking-[0.14em] text-muted-foreground">central documental</p>
                <h3 className="text-sm font-display font-semibold text-foreground">Upload e indexação</h3>
              </div>
              <label className={`${workflowPrimaryButtonClass} cursor-pointer`}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                Enviar
                <input type="file" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0])} />
              </label>
            </div>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className={`${workflowInputClass} mb-3 text-xs`}
            >
              <option value="contrato">Contratos</option>
              <option value="proposta">Propostas</option>
              <option value="fiscal">Fiscal e contábil</option>
              <option value="patrimonio">Patrimônio e garantias</option>
              <option value="agro">Produção agro</option>
              <option value="identidade">Identificação</option>
              <option value="outros">Outros</option>
            </select>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {loading ? (
                <Sk />
              ) : docs.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  Nenhum documento encontrado para este cliente ainda.
                </p>
              ) : docs.slice(0, 12).map((doc) => (
                <div key={`${doc.source}-${doc.id}`} className="rounded-xl border border-aletis-borda bg-card p-3 transition hover:border-aletis-verde/30">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-foreground mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{doc.nome}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {doc.categoria} · {doc.status} · {Math.max(1, Math.round(doc.tamanho / 1024))} KB
                      </p>
                      {doc.resumoIa && (
                        <p className="text-[11px] text-[var(--text-soft)] mt-1 line-clamp-2">{doc.resumoIa}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      {doc.source === 'core' && doc.ragStatus === 'pending' && (
                        <button
                          onClick={() => indexDoc(doc.id)}
                          className={workflowIconButtonClass}
                          title="Indexar documento para IA"
                        >
                          <Search className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <a
                        href={doc.downloadUrl}
                        className={workflowIconButtonClass}
                        title="Baixar documento"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`${workflowPanelClass} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-display font-semibold text-foreground">Pendências operacionais</h3>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                placeholder="Nova tarefa para este cliente..."
                className={`${workflowInputClass} min-w-0 flex-1 text-xs`}
              />
              <button
                onClick={addTask}
                disabled={!taskTitle.trim()}
                className={workflowPrimaryButtonClass}
              >
                Criar
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {!core?.tasks?.length ? (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhuma tarefa registrada no CRM core.</p>
              ) : core.tasks.slice(0, 8).map((task) => (
                <div key={task.id} className="rounded-xl border border-aletis-borda bg-card px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">{task.titulo}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {task.status} · {task.prioridade || 'normal'}{task.dueAt ? ` · ${fmtData(task.dueAt)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function MetricTile({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className={`${workflowPanelClass} p-3.5`}>
      <p className="text-[11px] font-display font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-display font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-[var(--text-soft)] mt-0.5">{hint}</p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function GoogleClientWorkspaceView({ clienteId, clienteNome }: { clienteId: string; clienteNome: string }) {
  const { user } = useAuth()
  const [status, setStatus] = useState<GoogleWorkspaceStatus | null>(null)
  const [bundle, setBundle] = useState<GoogleClientBundle | null>(null)
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([])
  const [inventory, setInventory] = useState<{
    files: GoogleDriveFile[]; truncated: boolean; status: 'complete' | 'scanning' | 'paused' | 'unlinked'
    updatedAt?: string; error?: string | null; pendingFolders?: number
  } | null>(null)
  const [driveLoading, setDriveLoading] = useState(false)
  const [driveQuery, setDriveQuery] = useState('')
  const [driveVisible, setDriveVisible] = useState(80)
  const refreshController = useRef<AbortController | null>(null)
  const inventoryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedDriveFileIds, setSelectedDriveFileIds] = useState<string[]>([])
  const [driveImportSummary, setDriveImportSummary] = useState<string | null>(null)
  const [driveImportResults, setDriveImportResults] = useState<GoogleDriveImportResult['results']>([])
  const [driveImportBatches, setDriveImportBatches] = useState<GoogleDriveImportResult[]>([])
  const importRequest = useRef<{ requestId: string; fileIds: string[] } | null>(null)
  const importMounted = useRef(true)
  const importGeneration = useRef(0)
  const importController = useRef<AbortController | null>(null)
  const importStorageKey = `aletis:drive-import:${user.id}:${clienteId}`
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<string | null>(null)
  const [docType, setDocType] = useState('relatorio_estrategico')
  const [meeting, setMeeting] = useState({ title: `Reunião ALETIS - ${clienteNome}`, startTime: '', endTime: '', attendees: '' })
  const [email, setEmail] = useState({ to: '', subject: `ALETIS - ${clienteNome}`, body: '' })
  const [error, setError] = useState<string | null>(null)

  async function readInventory(controller: AbortController, force = false) {
    if (controller.signal.aborted) return
    setDriveLoading(true)
    try {
      const next = await apiFetch<NonNullable<typeof inventory>>(`/integrations/google/drive/client/${clienteId}/files${force ? '?refresh=true' : ''}`, { signal: controller.signal })
      if (controller.signal.aborted) return
      setInventory(next)
      setDriveFiles(next.files)
      if (!next.truncated) setSelectedDriveFileIds(current => current.filter(id => next.files.some(file => file.id === id)))
      if (next.status === 'scanning') {
        inventoryTimer.current = setTimeout(() => { void readInventory(controller) }, 250)
      } else setDriveLoading(false)
    } catch (err) {
      if (controller.signal.aborted) return
      setDriveLoading(false)
      setError((err as Error).message)
    }
  }

  async function refresh(force = false) {
    refreshController.current?.abort()
    if (inventoryTimer.current) clearTimeout(inventoryTimer.current)
    const controller = new AbortController()
    refreshController.current = controller
    setLoading(true)
    setError(null)
    try {
      const [st, data, imports] = await Promise.all([
        apiFetch<GoogleWorkspaceStatus>('/integrations/google/status', { signal: controller.signal }),
        apiFetch<GoogleClientBundle>(`/clientes/${clienteId}/google-workspace`, { signal: controller.signal }),
        apiFetch<{ batches: GoogleDriveImportResult[] }>(`/integrations/google/drive/client/${clienteId}/import-batches`, { signal: controller.signal }).catch(() => ({ batches: [] })),
      ])
      if (controller.signal.aborted) return
      setStatus(st)
      setBundle(data)
      setDriveImportBatches(imports.batches)
      if (!importRequest.current) {
        try {
          const stored: unknown = JSON.parse(localStorage.getItem(importStorageKey) || 'null')
          if (stored && typeof stored === 'object' && 'requestId' in stored && 'fileIds' in stored
            && typeof stored.requestId === 'string' && /^[a-f0-9-]{36}$/i.test(stored.requestId)
            && Array.isArray(stored.fileIds) && stored.fileIds.length > 0 && stored.fileIds.length <= 20
            && stored.fileIds.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{6,160}$/.test(id))) {
            importRequest.current = { requestId: stored.requestId, fileIds: [...stored.fileIds].sort() }
          }
        } catch { /* Sem armazenamento local. */ }
      }
      const previousImport = imports.batches.find(batch => batch.requestId === importRequest.current?.requestId) || imports.batches[0]
      if (previousImport) showImportReceipt(previousImport)
      if (importRequest.current) setSelectedDriveFileIds(current => current.length ? current : [...importRequest.current!.fileIds])
      setLoading(false)
      if (st.features.drive === 'Conectado') {
        await readInventory(controller, force)
      } else {
        setDriveFiles([])
        setInventory(null)
        setDriveLoading(false)
        setSelectedDriveFileIds([])
      }
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    importGeneration.current++
    importMounted.current = true
    importRequest.current = null
    setAction(null)
    setBundle(null)
    setDriveFiles([])
    setSelectedDriveFileIds([])
    setDriveImportResults([])
    setDriveImportBatches([])
    setDriveImportSummary(null)
    void refresh()
    return () => {
      importMounted.current = false
      importGeneration.current++
      importController.current?.abort()
      refreshController.current?.abort()
      if (inventoryTimer.current) clearTimeout(inventoryTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, user.id])

  async function run(label: string, fn: () => Promise<void>) {
    setAction(label)
    setError(null)
    try {
      await fn()
      await refresh(['upload', 'doc', 'folder'].includes(label))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAction(null)
    }
  }

  async function uploadDrive(file?: File | null) {
    if (!file) return
    await run('upload', async () => {
      const form = new FormData()
      form.append('file', file)
      form.append('clientId', clienteId)
      form.append('subfolder', 'Documentos')
      await apiFetch('/integrations/google/drive/upload-client-file', { method: 'POST', body: form })
    })
  }

  function toggleDriveFile(fileId: string) {
    setSelectedDriveFileIds((current) => {
      if (current.includes(fileId)) return current.filter((id) => id !== fileId)
      if (current.length >= 20) {
        setError('Selecione no máximo 20 arquivos por importação para a ALIX.')
        return current
      }
      return [...current, fileId]
    })
  }

  function showImportReceipt(receipt: GoogleDriveImportResult) {
    setDriveImportResults(receipt.results)
    setDriveImportSummary(`${receipt.meta.imported} arquivo(s) recebido(s)${receipt.meta.pendingReview ? `; ${receipt.meta.pendingReview} aguarda(m) confirmação de destino` : ''}${receipt.meta.remaining ? `; ${receipt.meta.remaining} pendente(s). Retome o mesmo lote para continuar.` : '.'}`)
    setDriveImportBatches(current => [receipt, ...current.filter(batch => batch.requestId !== receipt.requestId)])
    if (receipt.status === 'completed' && importRequest.current?.requestId === receipt.requestId) {
      try { localStorage.removeItem(importStorageKey) } catch { /* Recibo continua no servidor. */ }
    }
  }

  async function submitDriveImport(requestId: string, fileIds: string[]) {
    if (action === 'import-drive') return
    const generation = importGeneration.current
    const isCurrent = () => importMounted.current && importGeneration.current === generation
    const controller = new AbortController()
    importController.current = controller
    importRequest.current = { requestId, fileIds: [...fileIds].sort() }
    try { localStorage.setItem(importStorageKey, JSON.stringify(importRequest.current)) } catch { /* Chave também permanece em memória. */ }
    setAction('import-drive')
    setError(null)
    try {
      const result = await apiFetch<GoogleDriveImportResult>('/integrations/google/drive/client/' + clienteId + '/import', {
        method: 'POST',
        body: JSON.stringify({ requestId, fileIds }),
        timeoutMs: 120_000,
        signal: controller.signal,
      })
      if (!isCurrent()) return
      showImportReceipt(result)
      // Manter a seleção preserva a chave no botão principal quando há falha parcial.
      setSelectedDriveFileIds(result.results.map(item => item.fileId))
      await refresh()
    } catch (err) {
      if (!isCurrent()) return
      setError(`${(err as Error).message} A chave do lote foi preservada. Retome a mesma importação.`)
      try {
        const receipt = await apiFetch<GoogleDriveImportResult>(`/integrations/google/drive/client/${clienteId}/import-batches/${requestId}`)
        if (isCurrent()) showImportReceipt(receipt)
      } catch { /* O botão repete a mesma chave, inclusive se a primeira resposta se perdeu. */ }
    } finally {
      if (importController.current === controller) importController.current = null
      if (isCurrent()) setAction(null)
    }
  }

  async function importSelectedDriveFiles() {
    if (selectedDriveFileIds.length === 0) return
    const fileIds = [...selectedDriveFileIds].sort()
    const previous = importRequest.current
    const unfinished = !driveImportBatches.some(batch => batch.requestId === previous?.requestId && batch.status === 'completed')
    const requestId = previous && unfinished && JSON.stringify(previous.fileIds) === JSON.stringify(fileIds) ? previous.requestId : crypto.randomUUID()
    await submitDriveImport(requestId, fileIds)
  }

  const connected = status?.status === 'connected'
  const driveConnected = status?.features.drive === 'Conectado'
  const docsConnected = status?.features.docs === 'Conectado' || status?.features.docs === 'Conectado via Drive'
  const calendarConnected = status?.features.calendar === 'Conectado'
  const gmailConnected = status?.features.gmail === 'Conectado'
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const filteredDriveFiles = driveFiles.filter(file => normalize(`${file.name} ${file.path}`).includes(normalize(driveQuery)))

  if (loading && !bundle) return <Sk />

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-alerta/30 bg-alerta/5 p-3 text-xs text-alerta">
          {error}
        </div>
      )}

      <header className={`${workflowPanelClass} p-5`}>
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-xl bg-aletis-verde/10 border border-aletis-verde/20 flex items-center justify-center">
              <Cloud className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-display font-semibold text-foreground">Integrações Google do cliente</h3>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  connected ? 'bg-positivo/10 text-positivo border-positivo/30' : 'bg-aletis-bege text-[var(--text-soft)] border-aletis-borda'
                }`}>
                  {connected ? 'Workspace conectado' : 'Workspace pendente'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-soft)] mt-1">
                Pasta do Drive, documentos gerados, eventos de agenda e e-mails vinculados ao histórico do cliente.
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                Conta conectada: <strong>{status?.googleEmail || 'não conectada'}</strong>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => refresh(inventory?.status === 'complete')} className={workflowSecondaryButtonClass}>
              <RefreshCw className={`h-3.5 w-3.5 inline mr-1 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <a href="/configuracoes?tab=google" className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-aletis-grafite-escuro px-3.5 text-xs font-semibold text-white shadow-none transition hover:bg-aletis-verde">
              <Link2 className="h-3.5 w-3.5" />
              Configurar
            </a>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr] gap-4">
        <section className="space-y-4">
          <div className={`${workflowPanelClass} p-4`}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-display font-semibold text-foreground">Pasta Google Drive</h4>
                <p className="text-xs text-muted-foreground mt-0.5">Cria uma estrutura padrão sem duplicar pasta já existente.</p>
              </div>
              <button
                disabled={!driveConnected || action === 'folder'}
                onClick={() => run('folder', async () => {
                  await apiFetch('/integrations/google/drive/create-client-folder', {
                    method: 'POST',
                    body: JSON.stringify({ clientId: clienteId }),
                  })
                })}
                className={workflowPrimaryButtonClass}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Criar pasta
              </button>
            </div>
            {bundle?.folder ? (
              <div className="rounded-lg border border-aletis-borda bg-aletis-cream-papel/55 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{bundle.folder.folderName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{bundle.folder.googleFolderId}</p>
                  </div>
                  <a href={bundle.folder.folderUrl} target="_blank" rel="noreferrer" className={workflowIconButtonClass} title="Abrir no Drive">
                    <ExternalLink className="h-4 w-4 text-[var(--text-soft)]" />
                  </a>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {Object.keys(bundle.folder.subfolders || {}).map((name) => (
                    <span key={name} className="rounded-full bg-card border border-aletis-borda px-2 py-0.5 text-[11px] text-[var(--text-soft)]">{name}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-aletis-borda bg-aletis-cream-papel/35 p-4 text-center text-xs text-muted-foreground">
                Nenhuma pasta Google Drive vinculada a este cliente ainda.
              </p>
            )}
            <div className="mt-3">
              <label className={`${workflowSecondaryButtonClass} cursor-pointer`}>
                <UploadCloud className="h-3.5 w-3.5" />
                Enviar arquivo ao Drive
                <input type="file" className="hidden" disabled={!driveConnected} onChange={(e) => uploadDrive(e.target.files?.[0])} />
              </label>
            </div>
          </div>

          {bundle?.folder && (
            <div className={`${workflowPanelClass} p-4`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 className="text-sm font-display font-semibold text-foreground">Acervo já existente no Drive</h4>
                  <p className="mt-0.5 text-xs text-muted-foreground">Selecione até 20 arquivos, inclusive Google Docs, Sheets e Slides. Após a leitura, confirme o cliente de destino na ALIX.</p>
                </div>
                <button
                  type="button"
                  disabled={!driveConnected || selectedDriveFileIds.length === 0 || action === 'import-drive'}
                  onClick={importSelectedDriveFiles}
                  className={workflowPrimaryButtonClass}
                >
                  <Brain className="h-3.5 w-3.5" />
                  {action === 'import-drive' ? 'Recebendo arquivos…' : `Importar à ALIX (${selectedDriveFileIds.length})`}
                </button>
              </div>
              {driveImportSummary && (
                <p className={`mt-3 rounded-xl border px-3 py-2 text-xs ${driveImportResults.some(item => !item.imported) ? 'border-alerta/25 bg-alerta/5 text-alerta' : 'border-positivo/25 bg-positivo/5 text-positivo'}`}>{driveImportSummary}</p>
              )}
              {driveImportBatches.length > 0 && <details className="mt-2 text-xs">
                <summary className="cursor-pointer font-semibold">Importações recentes deste usuário</summary>
                <div className="mt-2 space-y-2">{driveImportBatches.map(batch => <div key={batch.requestId} className="rounded-lg border border-aletis-borda p-2">
                  <span>{batch.meta.imported}/{batch.meta.requested} recebido(s){batch.status === 'running' ? ' · em execução' : ''}</span>
                  {batch.meta.remaining > 0 && <button type="button" disabled={action === 'import-drive' || !driveConnected} className="ml-2 font-semibold text-foreground underline" onClick={() => void submitDriveImport(batch.requestId, batch.results.map(file => file.fileId))}>Retomar este lote</button>}
                  {batch.sessionId && <a href={`/ia?sessionId=${encodeURIComponent(batch.sessionId)}`} className="ml-2 font-semibold text-foreground underline">Revisar documentos</a>}
                </div>)}</div>
              </details>}
              {driveImportResults.length > 0 && <div className="mt-2 space-y-2 text-xs" aria-label="Resultado da importação">
                {driveImportResults.map(item => <div key={item.fileId} className="rounded-lg border border-aletis-borda p-2">
                  <p className="font-semibold">{item.name || driveFiles.find(file => file.id === item.fileId)?.name || item.fileId}</p>
                  <p className={item.imported ? 'text-[var(--text-soft)]' : 'text-alerta'}>{item.imported
                    ? item.needsReview === false ? 'Destino confirmado. Consulte a ALIX para acompanhar a leitura e o arquivamento.' : 'Recebido. Acompanhe a leitura e confirme o vínculo na ALIX.'
                    : item.reason || (item.state === 'reading' ? 'Recebendo arquivo do Drive.' : item.state === 'pending' ? 'Aguardando recebimento.' : 'Não foi possível importar este arquivo.')}</p>
                </div>)}
                {[...new Set(driveImportResults.filter(item => item.imported && item.sessionId).map(item => item.sessionId!))].map(sessionId =>
                  <a key={sessionId} href={`/ia?sessionId=${encodeURIComponent(sessionId)}`} className="inline-flex rounded-lg bg-aletis-verde px-3 py-2 font-semibold text-white">Revisar documentos na ALIX</a>)}
              </div>}
              <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-aletis-borda bg-aletis-cream-papel/50 px-3 py-2 text-xs text-[var(--text-soft)]">
                {driveLoading ? `Lendo o Drive: ${driveFiles.length} arquivos encontrados. A leitura continua automaticamente.`
                  : inventory?.status === 'paused' ? `Leitura pausada: ${inventory.error || 'não foi possível consultar o Google'}. O progresso foi salvo.`
                  : inventory?.status === 'complete' ? `Inventário concluído${inventory.updatedAt ? ` · ${fmtDataHora(inventory.updatedAt)}` : ''}.`
                  : 'Aguardando leitura do acervo.'}
                {inventory?.status === 'paused' && <button type="button" onClick={() => refresh()} className="ml-2 font-semibold text-foreground underline">Retomar leitura</button>}
              </div>
              {driveFiles.length > 0 && <input aria-label="Buscar arquivos do Drive" value={driveQuery} onChange={event => { setDriveQuery(event.target.value); setDriveVisible(80) }} placeholder="Buscar por nome ou pasta em todo o acervo" className={`${workflowInputClass} mt-3 text-xs`} />}
              {driveFiles.length > 0 && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground">{filteredDriveFiles.length} de {driveFiles.length} arquivo(s){inventory?.truncated ? ' · leitura parcial' : ''}.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSelectedDriveFileIds(filteredDriveFiles.slice(0, 20).map((file) => file.id))} className="text-[11px] font-semibold text-foreground hover:underline">Selecionar até 20</button>
                    <button type="button" onClick={() => setSelectedDriveFileIds([])} className="text-[11px] font-semibold text-[var(--text-soft)] hover:underline">Limpar</button>
                  </div>
                </div>
              )}
              {filteredDriveFiles.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-aletis-borda bg-aletis-cream-papel/35 p-3 text-center text-xs text-muted-foreground">{driveLoading ? 'Aguardando os próximos arquivos do Drive…' : driveQuery ? 'Nenhum arquivo corresponde à busca.' : inventory?.status === 'complete' ? 'Nenhum arquivo foi encontrado nesta pasta.' : 'Ainda não há arquivos disponíveis nesta leitura.'}</p>
              ) : (
                <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {filteredDriveFiles.slice(0, driveVisible).map((file) => (
                    <label key={file.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 py-2 transition hover:border-aletis-verde/35">
                      <input type="checkbox" checked={selectedDriveFileIds.includes(file.id)} onChange={() => toggleDriveFile(file.id)} className="h-3.5 w-3.5 rounded border-aletis-borda text-foreground focus:ring-aletis-verde" />
                      <FileText className="h-3.5 w-3.5 shrink-0 text-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-foreground">{file.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{file.path || 'Pasta principal'}{file.modifiedAt ? ' · ' + fmtDataHora(file.modifiedAt) : ''}</span>
                      </span>
                      <a href={file.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className={workflowIconButtonClass} title="Abrir no Drive">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </label>
                  ))}
                  {filteredDriveFiles.length > driveVisible && <button type="button" onClick={() => setDriveVisible(current => current + 80)} className="w-full py-2 text-xs font-semibold text-foreground">Mostrar mais arquivos ({filteredDriveFiles.length - driveVisible} restantes)</button>}
                </div>
              )}
            </div>
          )}

          <div className={`${workflowPanelClass} p-4`}>
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1">
                <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Gerar Google Docs</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value)} className={`${workflowInputClass} text-xs`}>
                  <option value="relatorio_estrategico">Relatório estratégico</option>
                  <option value="proposta_comercial">Proposta comercial</option>
                  <option value="ficha_cliente">Ficha do cliente</option>
                  <option value="contrato">Contrato</option>
                  <option value="checklist_onboarding">Checklist de onboarding</option>
                </select>
              </div>
              <button
                disabled={!docsConnected || action === 'doc'}
                onClick={() => run('doc', async () => {
                  await apiFetch('/integrations/google/docs/create-from-template', {
                    method: 'POST',
                    body: JSON.stringify({ clientId: clienteId, documentType: docType }),
                  })
                })}
                className={workflowPrimaryButtonClass}
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                Gerar documento
              </button>
            </div>
            <RecordList
              empty="Nenhum Google Docs gerado para este cliente."
              items={(bundle?.documents || []).map((doc) => ({
                id: doc.id,
                title: doc.title,
                meta: `${doc.documentType} · ${fmtDataHora(doc.createdAt)}`,
                href: doc.googleDocUrl,
              }))}
            />
          </div>
        </section>

        <aside className="space-y-4">
          <div className={`${workflowPanelClass} p-4`}>
            <h4 className="mb-3 inline-flex items-center gap-2 text-sm font-display font-semibold text-foreground">
              <CalendarPlus className="h-4 w-4 text-foreground" />
              Agendar no Google Calendar
            </h4>
            <div className="grid grid-cols-1 gap-2">
              <input value={meeting.title} onChange={(e) => setMeeting({ ...meeting, title: e.target.value })} className={`${workflowInputClass} text-xs`} placeholder="Título" />
              <input type="datetime-local" value={meeting.startTime} onChange={(e) => setMeeting({ ...meeting, startTime: e.target.value })} className={`${workflowInputClass} text-xs`} />
              <input type="datetime-local" value={meeting.endTime} onChange={(e) => setMeeting({ ...meeting, endTime: e.target.value })} className={`${workflowInputClass} text-xs`} />
              <input value={meeting.attendees} onChange={(e) => setMeeting({ ...meeting, attendees: e.target.value })} className={`${workflowInputClass} text-xs`} placeholder="Participantes separados por vírgula" />
              <button
                disabled={!calendarConnected || !meeting.startTime || action === 'event'}
                onClick={() => run('event', async () => {
                  await apiFetch('/integrations/google/calendar/create-event', {
                    method: 'POST',
                    body: JSON.stringify({
                      clientId: clienteId,
                      title: meeting.title,
                      startTime: new Date(meeting.startTime).toISOString(),
                      endTime: meeting.endTime ? new Date(meeting.endTime).toISOString() : undefined,
                      attendees: meeting.attendees.split(',').map((x) => x.trim()).filter(Boolean),
                      createMeetLink: true,
                    }),
                  })
                })}
                className={workflowPrimaryButtonClass}
              >
                Criar evento
              </button>
            </div>
            <RecordList
              empty="Nenhum evento Google vinculado."
              items={(bundle?.events || []).map((event) => ({
                id: event.id,
                title: event.title,
                meta: `${event.status} · ${fmtDataHora(event.startTime)}`,
                href: event.eventUrl || undefined,
              }))}
            />
          </div>

          <div className={`${workflowPanelClass} p-4`}>
            <h4 className="mb-3 inline-flex items-center gap-2 text-sm font-display font-semibold text-foreground">
              <Mail className="h-4 w-4 text-foreground" />
              Enviar e-mail pelo Gmail
            </h4>
            <div className="grid grid-cols-1 gap-2">
              <input value={email.to} onChange={(e) => setEmail({ ...email, to: e.target.value })} className={`${workflowInputClass} text-xs`} placeholder="Destinatário" />
              <input value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} className={`${workflowInputClass} text-xs`} placeholder="Assunto" />
              <textarea value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} className={`${workflowInputClass} min-h-[104px] resize-y text-xs leading-relaxed`} placeholder="Corpo do e-mail. O envio só ocorre ao clicar em Enviar." />
              <button
                disabled={!gmailConnected || !email.to || !email.body.trim() || action === 'email'}
                onClick={() => run('email', async () => {
                  await apiFetch('/integrations/google/gmail/send', {
                    method: 'POST',
                    body: JSON.stringify({ clientId: clienteId, ...email }),
                  })
                  setEmail({ ...email, body: '' })
                })}
                className={workflowPrimaryButtonClass}
              >
                Enviar e registrar
              </button>
            </div>
            <RecordList
              empty="Nenhum e-mail enviado pelo ALETIS."
              items={(bundle?.emails || []).map((mail) => ({
                id: mail.id,
                title: mail.subject,
                meta: `${mail.toEmail} · ${fmtDataHora(mail.sentAt || mail.createdAt)}`,
              }))}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}

function RecordList({ empty, items }: { empty: string; items: Array<{ id: string; title: string; meta: string; href?: string }> }) {
  return (
    <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-aletis-borda bg-aletis-cream-papel/35 p-3 text-center text-xs text-muted-foreground">{empty}</p>
      ) : items.slice(0, 8).map((item) => (
        <div key={item.id} className="rounded-xl border border-aletis-borda bg-card px-3 py-2.5 flex items-center justify-between gap-3 transition hover:border-aletis-verde/30">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{item.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{item.meta}</p>
          </div>
          {item.href && (
            <a href={item.href} target="_blank" rel="noreferrer" className={workflowIconButtonClass} title="Abrir">
              <ExternalLink className="h-3.5 w-3.5 text-[var(--text-soft)]" />
            </a>
          )}
        </div>
      ))}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
function ColaboracaoView({ grupoId }: { grupoId: string | null }) {
  if (!grupoId) {
    return (
      <div className={`${workflowPanelClass} p-8 text-center`}>
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-aletis-borda bg-aletis-bege/45 text-foreground">
          <MessageSquare className="w-5 h-5" />
        </div>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">
          Comentários e Changelog requerem grupo de gestão financeira ativo.
          Crie via <strong>auto-import</strong> na Operação ou QuickActionsBar.
        </p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Suspense fallback={<Sk />}>
        <ComentariosPanel grupoId={grupoId} />
      </Suspense>
      <Suspense fallback={<Sk />}>
        <ChangelogPanel grupoId={grupoId} />
      </Suspense>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
interface TimelineEvent {
  id: string
  tipo: string
  data: string
  titulo?: string
  descricao?: string
  detalhes?: string
  usuario?: string
}

function TimelineView({ clienteId, clienteNome }: { clienteId: string; clienteNome: string }) {
  return <TimelineContent key={clienteId} clienteId={clienteId} clienteNome={clienteNome} />
}

function TimelineContent({ clienteId, clienteNome }: { clienteId: string; clienteNome: string }) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [portalAtivo, setPortalAtivo] = useState(false)
  const [uploads, setUploads] = useState<UploadDTO[]>([])
  const [requests, setRequests] = useState<PendenciaDTO[]>([])
  const [portalError, setPortalError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch<any>(`/clientes/${clienteId}`, { signal: controller.signal })
      .then(d => {
        if (controller.signal.aborted) return
        setTimeline(Array.isArray(d?.timeline) ? d.timeline : [])
        setPortalAtivo(!!d?.portalAcesso?.ativo)
      })
      .catch(() => { if (!controller.signal.aborted) setPortalError('Não foi possível carregar o histórico. Atualize esta área.') })
    let loading = false
    const loadFiles = async () => {
      if (loading || document.visibilityState !== 'visible') return
      loading = true
      try {
        const [files, pending] = await Promise.all([
          apiFetch<UploadDTO[]>(`/clientes/${clienteId}/portal/uploads`, { signal: controller.signal }),
          apiFetch<PendenciaDTO[]>(`/clientes/${clienteId}/portal/pendencias`, { signal: controller.signal }),
        ])
        if (!controller.signal.aborted) { setUploads(files); setRequests(pending); setPortalError(null) }
      } catch { if (!controller.signal.aborted) setPortalError('Os arquivos para anexar não puderam ser atualizados. Tente novamente em instantes.') }
      finally { loading = false }
    }
    void loadFiles()
    const interval = window.setInterval(loadFiles, 30_000)
    return () => { controller.abort(); window.clearInterval(interval) }
  }, [clienteId])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Timeline */}
      <section className={`${workflowPanelClass} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-foreground" />
          <h3 className="text-sm font-display font-semibold text-foreground">Timeline do cliente</h3>
          <span className="text-[11px] text-muted-foreground ml-auto">{timeline.length} evento(s)</span>
        </div>
        {timeline.length === 0 ? (
          <p className="rounded-lg border border-dashed border-aletis-borda bg-aletis-cream-papel/35 py-5 text-center text-xs text-muted-foreground">Sem eventos registrados.</p>
        ) : (
          <ol className="relative pl-4 border-l-2 border-aletis-borda">
            {timeline.slice().reverse().map((ev) => (
              <li key={ev.id} className="mb-3 ml-2">
                <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-aletis-verde" />
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  {fmtData(ev.data)} · {ev.tipo}
                </p>
                <p className="text-xs font-semibold text-foreground mt-0.5">
                  {ev.titulo ?? ev.descricao?.slice(0, 80) ?? 'Evento'}
                </p>
                {(ev.detalhes ?? ev.descricao) && (
                  <p className="text-[11px] text-[var(--text-soft)] mt-0.5 leading-snug">
                    {ev.detalhes ?? ev.descricao}
                  </p>
                )}
                {ev.usuario && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">por {ev.usuario}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Chat Portal */}
      <section className={`${workflowPanelClass} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-foreground" />
          <h3 className="text-sm font-display font-semibold text-foreground">Chat Portal Cliente</h3>
          <span className={`ml-auto px-1.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
            portalAtivo ? 'bg-emerald-100 text-emerald-700' : 'bg-aletis-grafite-claro/15 text-[var(--text-soft)]'
          }`}>
            {portalAtivo ? 'ativo' : 'sem acesso'}
          </span>
        </div>
        {!portalAtivo && (
          <p className="mb-3 rounded-xl border border-aletis-borda bg-aletis-cream-papel/35 p-3 text-xs leading-relaxed text-[var(--text-soft)]">
            O acesso de {clienteNome} ao portal está inativo. A equipe pode consultar o histórico; para o cliente responder, ative o acesso em Configurações → Acessos Portal Cliente.
          </p>
        )}
        {portalError && <p role="alert" className="mb-3 text-xs text-amber-700">{portalError}</p>}
        <PortalMessages clienteId={clienteId} clienteNome={clienteNome} mode="equipe" uploads={uploads} requests={requests} />
      </section>
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
