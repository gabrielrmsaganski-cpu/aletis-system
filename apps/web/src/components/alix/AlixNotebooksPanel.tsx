import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clipboard,
  Database,
  Download,
  FileText,
  GitBranch,
  Globe2,
  Layers3,
  ListTodo,
  Loader2,
  MessageSquarePlus,
  MessageSquareText,
  PanelRightClose,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { apiFetch } from '../../hooks/useApi'

type ArtifactKind = 'dossie' | 'briefing' | 'outline' | 'parecer' | 'proposta' | 'checklist' | 'relatorio' | 'memoria'

interface NotebookSourceRef {
  sessionId: string
  documentId: string
  filename?: string
  kind?: string
  addedAt: string
}

interface NotebookArtifact {
  id: string
  kind: ArtifactKind
  title: string
  markdown: string
  citations: Array<{
    id: string
    documentId: string
    filename: string
    source: string
    page?: number
    sheet?: string
    quote: string
  }>
  lineageId: string
  version: number
  parentArtifactId?: string
  changeSummary?: string
  createdAt: string
  metadata?: Record<string, unknown>
}

interface NotebookSourceScope {
  includeCrm: boolean
  includeDocuments: boolean
  includeProposals: boolean
  includeNegotiations: boolean
  includeWeb: boolean
  proposalIds: string[]
  negotiationIds: string[]
}

interface NotebookComment {
  id: string
  artifactId?: string
  text: string
  status: 'open' | 'applied' | 'resolved'
  appliedInArtifactId?: string
  createdAt: string
  resolvedAt?: string
}

interface NotebookAction {
  id: string
  sourceArtifactId?: string
  kind: 'task' | 'note' | 'proposal' | 'checklist'
  title: string
  content: string
  status: 'open' | 'done' | 'dismissed'
  createdAt: string
  updatedAt: string
}

interface NotebookSourceMap {
  completeness: number
  sources: Array<{
    id: string
    kind: 'crm' | 'document' | 'proposal' | 'negotiation' | 'web' | 'note'
    label: string
    status: 'available' | 'selected' | 'missing' | 'disabled'
    selected: boolean
    detail?: string
  }>
  gaps: Array<{
    key: string
    label: string
    severity: 'critical' | 'important' | 'advisory'
    recommendation: string
  }>
}

interface AlixNotebook {
  id: string
  title: string
  clienteId?: string
  sessionId?: string
  objective?: string
  sourceScope: NotebookSourceScope
  sources: NotebookSourceRef[]
  notes: Array<{ id: string; text: string; createdAt: string }>
  artifacts: NotebookArtifact[]
  comments: NotebookComment[]
  actions: NotebookAction[]
  createdAt: string
  updatedAt: string
}

interface SearchHit {
  citationId: string
  documentId: string
  filename: string
  text: string
  source: string
  page?: number
  sheet?: string
  score: number
}

export interface NotebookAttachmentRef {
  id: string
  filename: string
  kind: string
  uploading?: boolean
  error?: string
  clienteId?: string
  metadata?: {
    clientScopeReview?: { status?: string; requestedClienteId?: string; verifiedClienteId?: string }
  }
}

interface Props {
  activeSessionId: string | null
  activeClienteId: string | null
  activeClienteLabel?: string | null
  attachments: NotebookAttachmentRef[]
  onClose?: () => void
  onMinimize?: () => void
  onPrompt?: (prompt: string) => void
}

const KIND_LABELS: Record<ArtifactKind, string> = {
  dossie: 'Dossiê completo do cliente',
  briefing: 'Briefing executivo',
  outline: 'Roteiro / estrutura',
  parecer: 'Parecer técnico',
  proposta: 'Proposta',
  checklist: 'Checklist',
  relatorio: 'Relatório',
  memoria: 'Memória do caso',
}

const SOURCE_SCOPE_CONTROLS: Array<{
  key: keyof Pick<NotebookSourceScope, 'includeCrm' | 'includeDocuments' | 'includeProposals' | 'includeNegotiations' | 'includeWeb'>
  label: string
}> = [
  { key: 'includeCrm', label: 'CRM e operação' },
  { key: 'includeDocuments', label: 'Documentos' },
  { key: 'includeProposals', label: 'Propostas' },
  { key: 'includeNegotiations', label: 'Negociações' },
  { key: 'includeWeb', label: 'Fontes web' },
]

const READY_ATTACHMENT_FILTER = (a: NotebookAttachmentRef) => !a.uploading && !a.error && !a.id.startsWith('tmp-') && !a.id.startsWith('err-')

function sourceClienteId(source: NotebookAttachmentRef): string | null {
  const review = source.metadata?.clientScopeReview
  return source.clienteId?.trim()
    || (review?.status === 'verified' ? review.verifiedClienteId?.trim() : null)
    || review?.requestedClienteId?.trim()
    || null
}

function formatDate(value?: string): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function ArtifactCitations({ citations }: { citations: NotebookArtifact['citations'] }) {
  if (citations.length === 0) return null
  return (
    <div className="mt-3 border-t border-aletis-borda pt-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fontes recuperadas para esta resposta</div>
      <div className="mt-2 space-y-1.5">
        {citations.map((citation) => (
          <div key={citation.id} className="text-[10px] leading-relaxed text-[var(--text-soft)]">
            <span className="font-bold text-foreground">[{citation.id}]</span>{' '}
            {citation.filename}{citation.page ? ` · p. ${citation.page}` : citation.sheet ? ` · aba ${citation.sheet}` : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AlixNotebooksPanel({
  activeSessionId,
  activeClienteId,
  activeClienteLabel,
  attachments,
  onClose,
  onMinimize,
  onPrompt,
}: Props) {
  const [notebooks, setNotebooks] = useState<AlixNotebook[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<AlixNotebook | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [newTitle, setNewTitle] = useState('')
  const [newObjective, setNewObjective] = useState('')
  const [manualSourceIds, setManualSourceIds] = useState('')
  const [noteText, setNoteText] = useState('')
  const [query, setQuery] = useState('')
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<NotebookArtifact | null>(null)
  const [artifactKind, setArtifactKind] = useState<ArtifactKind>('dossie')
  const [artifactObjective, setArtifactObjective] = useState('')
  const [generatedArtifact, setGeneratedArtifact] = useState<NotebookArtifact | null>(null)
  const [researchWeb, setResearchWeb] = useState(true)
  const [sessionDocuments, setSessionDocuments] = useState<{ sessionId: string | null; clienteId: string | null; documents: NotebookAttachmentRef[] } | null>(null)
  const [canonicalClients, setCanonicalClients] = useState<{ key: string; ids: Map<string, string> } | null>(null)
  const [sourceMap, setSourceMap] = useState<NotebookSourceMap | null>(null)
  const [commentText, setCommentText] = useState('')
  const [revisionInstructions, setRevisionInstructions] = useState('')

  const scopeKey = JSON.stringify([activeSessionId, activeClienteId])
  const readContext = useRef({ scopeKey, scopeVersion: 0, selectedId, selectionVersion: 0 })
  const readGeneration = useRef({ list: 0, selected: 0, sourceMap: 0 })
  // Invalida também A → B → A; comparar somente o ID deixaria a primeira leitura de A reaparecer.
  if (readContext.current.scopeKey !== scopeKey) {
    readContext.current.scopeKey = scopeKey
    readContext.current.scopeVersion += 1
    readContext.current.selectionVersion += 1
  }
  if (readContext.current.selectedId !== selectedId) {
    readContext.current.selectedId = selectedId
    readContext.current.selectionVersion += 1
  }
  useEffect(() => () => { readContext.current.scopeVersion += 1 }, [])

  const readyAttachments = useMemo(() => attachments.filter(READY_ATTACHMENT_FILTER), [attachments])
  const selectedNotebook = (selected?.id === selectedId ? selected : null) || notebooks.find((n) => n.id === selectedId) || null
  const sourceCandidates = useMemo(() => {
    const merged = new Map<string, NotebookAttachmentRef>()
    const documents = sessionDocuments?.sessionId === activeSessionId && sessionDocuments?.clienteId === activeClienteId
      ? sessionDocuments.documents : []
    // O vínculo lido no servidor prevalece sobre o chip resumido da conversa.
    for (const document of [...readyAttachments, ...documents]) {
      if (READY_ATTACHMENT_FILTER(document)) merged.set(document.id, { ...merged.get(document.id), ...document })
    }
    return [...merged.values()]
  }, [readyAttachments, sessionDocuments, activeSessionId, activeClienteId])
  const selectedClienteId = selectedNotebook?.clienteId || activeClienteId
  const canonicalKey = JSON.stringify([activeSessionId, activeClienteId, selectedClienteId,
    [...new Set([activeClienteId, selectedClienteId, ...sourceCandidates.map(sourceClienteId)].filter((id): id is string => Boolean(id)))].sort(),
  ])
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const ids = (JSON.parse(canonicalKey) as [unknown, unknown, unknown, string[]])[3]
    if (ids.length < 2) return () => { cancelled = true; controller.abort() }
    // GET de cliente já resolve aliases e devolve o ID canônico no DTO existente.
    void Promise.all(ids.map(async id => {
      try {
        const cliente = await apiFetch<{ id: string }>(`/clientes/${encodeURIComponent(id)}`, { signal: controller.signal })
        return [id, typeof cliente.id === 'string' ? cliente.id.trim() : ''] as const
      } catch { return [id, ''] as const }
    })).then(entries => {
      if (!cancelled) setCanonicalClients({ key: canonicalKey, ids: new Map(entries.filter(([, id]) => id)) })
    })
    return () => { cancelled = true; controller.abort() }
  }, [canonicalKey])
  const sourcesForCliente = (clienteId: string | null) => sourceCandidates.filter(source => {
    const owner = sourceClienteId(source)
    if (!owner) return true
    if (!clienteId) return false
    if (owner === clienteId) return true
    const ids = canonicalClients?.key === canonicalKey ? canonicalClients.ids : null
    const canonicalOwner = ids?.get(owner)
    return Boolean(canonicalOwner && canonicalOwner === ids?.get(clienteId))
  })
  const newNotebookSources = sourcesForCliente(activeClienteId)
  const availableSources = sourcesForCliente(selectedClienteId)

  const refreshList = useCallback(async () => {
    if (readContext.current.scopeKey !== scopeKey) return
    const version = readContext.current.scopeVersion
    const generation = ++readGeneration.current.list
    const current = () => readContext.current.scopeVersion === version && readGeneration.current.list === generation
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (activeClienteId) params.set('clienteId', activeClienteId)
      params.set('limit', '40')
      const data = await apiFetch<{ notebooks: AlixNotebook[]; total: number }>(`/alix/notebooks?${params.toString()}`)
      if (!current()) return
      const list = data.notebooks || []
      setNotebooks(list)
      setSelectedId((current) => {
        if (current && list.some((notebook) => notebook.id === current)) return current
        return list[0]?.id || null
      })
    } catch (err) {
      if (current()) setError((err as Error).message)
    } finally {
      if (current()) setLoading(false)
    }
  }, [activeClienteId, scopeKey])

  const refreshSelected = useCallback(async (id: string | null) => {
    if (readContext.current.selectedId !== id) return
    const { scopeVersion, selectionVersion } = readContext.current
    const generation = ++readGeneration.current.selected
    const current = () => readContext.current.scopeVersion === scopeVersion && readContext.current.selectionVersion === selectionVersion && readGeneration.current.selected === generation
    if (!id) {
      setSelected(null)
      setBusy(value => value === 'selected' ? null : value)
      return
    }
    setBusy('selected')
    setError(null)
    try {
      const notebook = await apiFetch<AlixNotebook>(`/alix/notebooks/${encodeURIComponent(id)}`)
      if (!current() || notebook.id !== id) return
      setSelected(notebook)
      setNotebooks((prev) => {
        const exists = prev.some((n) => n.id === notebook.id)
        return exists ? prev.map((n) => (n.id === notebook.id ? notebook : n)) : [notebook, ...prev]
      })
    } catch (err) {
      if (current()) setError((err as Error).message)
    } finally {
      if (current()) setBusy(value => value === 'selected' ? null : value)
    }
  }, [])

  const refreshSourceMap = useCallback(async (id: string | null) => {
    if (readContext.current.selectedId !== id) return
    const { scopeVersion, selectionVersion } = readContext.current
    const generation = ++readGeneration.current.sourceMap
    const current = () => readContext.current.scopeVersion === scopeVersion && readContext.current.selectionVersion === selectionVersion && readGeneration.current.sourceMap === generation
    setSourceMap(null)
    if (!id) {
      return
    }
    try {
      const data = await apiFetch<NotebookSourceMap>(`/alix/notebooks/${encodeURIComponent(id)}/source-map`)
      if (current()) setSourceMap(data)
    } catch {
      if (current()) setSourceMap(null)
    }
  }, [])

  useEffect(() => { void refreshList() }, [refreshList])
  useEffect(() => { void refreshSelected(selectedId) }, [selectedId, refreshSelected])
  useEffect(() => { void refreshSourceMap(selectedId) }, [selectedId, refreshSourceMap])
  useEffect(() => {
    setSessionDocuments(null)
    if (!activeSessionId) {
      return
    }
    let cancelled = false
    apiFetch<{ documents: NotebookAttachmentRef[] }>(`/alix/documents/${encodeURIComponent(activeSessionId)}`)
      .then((data) => { if (!cancelled) setSessionDocuments({ sessionId: activeSessionId, clienteId: activeClienteId, documents: data.documents || [] }) })
      .catch(() => { if (!cancelled) setSessionDocuments(null) })
    return () => { cancelled = true }
  }, [activeSessionId, activeClienteId])
  useEffect(() => {
    // Ao trocar o cliente, nao mantem na tela dados de outro contexto.
    setNotebooks([])
    setSelectedId(null)
    setSelected(null)
    setSourceMap(null)
  }, [scopeKey])
  useEffect(() => {
    // Resultados sao vinculados ao notebook selecionado, nunca ao painel inteiro.
    setSearchHits([])
    setAnswer(null)
    setGeneratedArtifact(null)
    setCommentText('')
    setRevisionInstructions('')
  }, [selectedId])

  const createNotebook = async () => {
    const title = newTitle.trim() || `Notebook ${activeClienteLabel || 'ALIX'}`
    setBusy('create')
    setError(null)
    try {
      const sources = activeSessionId
        ? newNotebookSources.map((a) => ({ sessionId: activeSessionId, documentId: a.id }))
        : []
      const notebook = await apiFetch<AlixNotebook>('/alix/notebooks', {
        method: 'POST',
        body: JSON.stringify({
          title,
          objective: newObjective.trim() || undefined,
          clienteId: activeClienteId || undefined,
          sessionId: activeSessionId || undefined,
          sources,
        }),
      })
      setNotebooks((prev) => [notebook, ...prev.filter((n) => n.id !== notebook.id)])
      setSelectedId(notebook.id)
      setSelected(notebook)
      setNewTitle('')
      setNewObjective('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const addSources = async (mode: 'attachments' | 'manual') => {
    const sourceSessionId = activeSessionId || selectedNotebook?.sessionId
    if (!selectedNotebook || !sourceSessionId) return
    const ids = mode === 'attachments'
      ? availableSources.map((a) => a.id)
      : manualSourceIds.split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean)
    if (ids.length === 0) return
    setBusy('sources')
    setError(null)
    try {
      const notebook = await apiFetch<AlixNotebook>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/sources`, {
        method: 'POST',
        body: JSON.stringify({
          sources: ids.map((documentId) => ({ sessionId: sourceSessionId, documentId })),
        }),
      })
      setSelected(notebook)
      setManualSourceIds('')
      await refreshSourceMap(notebook.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const addNote = async () => {
    if (!selectedNotebook || !noteText.trim()) return
    setBusy('note')
    setError(null)
    try {
      const notebook = await apiFetch<AlixNotebook>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text: noteText.trim() }),
      })
      setSelected(notebook)
      setNoteText('')
      await refreshSourceMap(notebook.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const runSearch = async () => {
    if (!selectedNotebook || !query.trim()) return
    setBusy('search')
    setError(null)
    try {
      const data = await apiFetch<{ query: string; hits: SearchHit[]; total: number }>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/search`, {
        method: 'POST',
        body: JSON.stringify({ query: query.trim(), limit: 8 }),
      })
      setSearchHits(data.hits || [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const askNotebook = async () => {
    if (!selectedNotebook || !question.trim()) return
    setBusy('ask')
    setError(null)
    setAnswer(null)
    try {
      const artifact = await apiFetch<NotebookArtifact>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/ask`, {
        method: 'POST',
        body: JSON.stringify({ question: question.trim(), limit: 10, researchWeb }),
      })
      setAnswer(artifact)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const generateArtifact = async () => {
    if (!selectedNotebook) return
    setBusy('generate')
    setError(null)
    setGeneratedArtifact(null)
    try {
      const artifact = await apiFetch<NotebookArtifact>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/generate`, {
        method: 'POST',
        body: JSON.stringify({
          kind: artifactKind,
          objective: artifactObjective.trim() || selectedNotebook.objective || undefined,
          audience: 'Equipe ALETIS e cliente final, quando aplicável',
          limit: 12,
          researchWeb,
        }),
      })
      setGeneratedArtifact(artifact)
      await refreshSelected(selectedNotebook.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const updateSourceScope = async (key: keyof Pick<NotebookSourceScope,
    'includeCrm' | 'includeDocuments' | 'includeProposals' | 'includeNegotiations' | 'includeWeb'>) => {
    if (!selectedNotebook) return
    setBusy(`scope:${key}`)
    setError(null)
    try {
      const notebook = await apiFetch<AlixNotebook>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/source-scope`, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: !selectedNotebook.sourceScope[key] }),
      })
      setSelected(notebook)
      await refreshSourceMap(notebook.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const addEditorialComment = async (artifact: NotebookArtifact) => {
    if (!selectedNotebook || !commentText.trim()) return
    setBusy('comment')
    setError(null)
    try {
      const notebook = await apiFetch<AlixNotebook>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/comments`, {
        method: 'POST',
        body: JSON.stringify({ artifactId: artifact.id, text: commentText.trim() }),
      })
      setSelected(notebook)
      setCommentText('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const updateArtifact = async (artifact: NotebookArtifact) => {
    if (!selectedNotebook) return
    setBusy('update-artifact')
    setError(null)
    try {
      const revision = await apiFetch<NotebookArtifact>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/artifacts/${encodeURIComponent(artifact.id)}/update`, {
        method: 'POST',
        body: JSON.stringify({
          instructions: revisionInstructions.trim() || undefined,
          limit: 16,
          researchWeb,
        }),
      })
      setGeneratedArtifact(revision)
      setRevisionInstructions('')
      await refreshSelected(selectedNotebook.id)
      await refreshSourceMap(selectedNotebook.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const convertArtifact = async (artifact: NotebookArtifact, target: NotebookAction['kind']) => {
    if (!selectedNotebook) return
    setBusy(`convert:${target}`)
    setError(null)
    try {
      const data = await apiFetch<{ notebook: AlixNotebook; action?: NotebookAction; artifact?: NotebookArtifact }>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/artifacts/${encodeURIComponent(artifact.id)}/convert`, {
        method: 'POST',
        body: JSON.stringify({ target }),
      })
      setSelected(data.notebook)
      if (data.artifact) setGeneratedArtifact(data.artifact)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const updateAction = async (action: NotebookAction, status: NotebookAction['status']) => {
    if (!selectedNotebook) return
    setBusy(`action:${action.id}`)
    setError(null)
    try {
      const notebook = await apiFetch<AlixNotebook>(`/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/actions/${encodeURIComponent(action.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setSelected(notebook)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const copyMarkdown = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Não foi possível copiar para a área de transferência.')
    }
  }

  const openHtmlDocument = (artifact: NotebookArtifact) => {
    if (!selectedNotebook) return
    window.open(
      `/api/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/artifacts/${encodeURIComponent(artifact.id)}/html`,
      '_blank',
    )
  }

  const openExport = (artifact: NotebookArtifact, format: 'pdf' | 'docx') => {
    if (!selectedNotebook) return
    window.open(
      `/api/alix/notebooks/${encodeURIComponent(selectedNotebook.id)}/artifacts/${encodeURIComponent(artifact.id)}/export/${format}`,
      '_blank',
    )
  }

  const askViaChat = () => {
    if (!selectedNotebook || !onPrompt) return
    onPrompt(`Use o notebook documental "${selectedNotebook.title}" (${selectedNotebook.id}) para responder com citações: ${question || 'resuma os principais pontos e riscos.'}`)
  }

  const sourceSessionId = activeSessionId || selectedNotebook?.sessionId

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-aletis-borda bg-gradient-to-br from-aletis-verde to-aletis-verde-escuro px-4 py-4 text-white sm:px-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-aletis-dourado">
            <BookOpen className="h-4 w-4" />
            Notebooks ALIX
          </div>
          <h2 className="mt-1 text-lg font-display font-bold">Workspace de inteligência</h2>
          <p className="mt-1 text-xs leading-relaxed text-white/70">
            CRM, dados internos, documentos e web em um único dossiê rastreável.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void refreshList()}
            className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            title="Atualizar notebooks"
            aria-label="Atualizar notebooks"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {onMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              className="rounded-lg px-2 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
              title="Minimizar painel e voltar à conversa"
              aria-label="Minimizar painel de notebooks"
            >
              <span className="hidden sm:inline">Minimizar</span>
              <PanelRightClose className="h-4 w-4 sm:hidden" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              title="Fechar painel"
              aria-label="Fechar painel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="border-b border-alerta/20 bg-alerta/10 px-4 py-2 text-xs font-medium text-alerta">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid min-h-full grid-cols-1 2xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-b border-aletis-borda bg-aletis-bege/20 2xl:border-b-0 2xl:border-r">
          <div className="space-y-2 border-b border-aletis-borda p-3">
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder="Nome do notebook"
              className="h-9 w-full rounded-lg border border-aletis-borda bg-card px-3 text-xs outline-none focus:border-aletis-verde"
            />
            <textarea
              value={newObjective}
              onChange={(event) => setNewObjective(event.target.value)}
              placeholder="Objetivo: ex. dossiê para renegociação, parecer, organização de documentos..."
              rows={3}
              className="w-full resize-none rounded-lg border border-aletis-borda bg-card px-3 py-2 text-xs leading-relaxed outline-none focus:border-aletis-verde"
            />
            <button
              type="button"
              onClick={() => void createNotebook()}
              disabled={busy === 'create'}
              className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-aletis-verde px-3 text-xs font-semibold text-white transition hover:bg-aletis-verde-escuro disabled:opacity-60"
            >
              {busy === 'create' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Criar notebook
            </button>
            {newNotebookSources.length > 0 && (
              <div className="rounded-lg border border-aletis-dourado/30 bg-aletis-dourado/10 p-2 text-[11px] leading-relaxed text-foreground">
                {newNotebookSources.length} documento(s) desta conversa entrarão como fontes no novo notebook.
              </div>
            )}
          </div>

          <div className="p-2">
            {loading && notebooks.length === 0 ? (
              <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : notebooks.length === 0 ? (
              <div className="p-3 text-xs leading-relaxed text-muted-foreground">
                Nenhum notebook criado ainda para o contexto atual.
              </div>
            ) : (
              notebooks.map((notebook) => (
                <button
                  key={notebook.id}
                  type="button"
                  onClick={() => setSelectedId(notebook.id)}
                  className={`mb-2 w-full rounded-xl border p-3 text-left transition ${
                    selectedNotebook?.id === notebook.id
                      ? 'border-aletis-verde bg-card shadow-sm'
                      : 'border-aletis-borda bg-white/70 hover:border-aletis-verde/40'
                  }`}
                >
                  <div className="line-clamp-2 text-xs font-bold text-foreground">{notebook.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    <span>{notebook.sources?.length || 0} fontes</span>
                    <span>•</span>
                    <span>{notebook.artifacts?.length || 0} docs</span>
                    <span>•</span>
                    <span>{formatDate(notebook.updatedAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="min-w-0 p-4 md:p-5">
          {!selectedNotebook ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-aletis-borda bg-aletis-bege/20 p-8 text-center">
              <div>
                <BookOpen className="mx-auto h-9 w-9 text-muted-foreground" />
                <h3 className="mt-3 text-sm font-bold text-foreground">Crie ou selecione um notebook</h3>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  Use notebooks para trabalhos com várias fontes, memória do caso e documentos finais com rastreabilidade.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <section className="rounded-2xl border border-aletis-borda bg-aletis-bege/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-display font-bold text-foreground">{selectedNotebook.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
                      {selectedNotebook.objective || 'Sem objetivo definido.'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold text-muted-foreground">
                      <span>{selectedNotebook.sources.length} documento(s)</span>
                      <span>{selectedNotebook.notes.length} notas</span>
                      <span>{selectedNotebook.artifacts.length} documentos gerados</span>
                      {activeClienteLabel && <span>{activeClienteLabel}</span>}
                    </div>
                  </div>
                  {busy === 'selected' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </section>

              <section className="rounded-2xl border border-aletis-borda bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-soft)]">
                    <Layers3 className="h-4 w-4 text-aletis-dourado" />
                    Mapa de fontes e lacunas
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-aletis-bege">
                      <div className="h-full rounded-full bg-aletis-verde transition-all" style={{ width: `${sourceMap?.completeness || 0}%` }} />
                    </div>
                    <span className="text-xs font-bold text-foreground">{sourceMap?.completeness ?? '—'}%</span>
                  </div>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Escolha o corpus antes da geração. Notas e comentários orientam a edição, mas não viram fatos automaticamente.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SOURCE_SCOPE_CONTROLS.map((control) => {
                    const enabled = selectedNotebook.sourceScope?.[control.key] !== false
                    return (
                      <button
                        key={control.key}
                        type="button"
                        onClick={() => void updateSourceScope(control.key)}
                        disabled={busy === `scope:${control.key}`}
                        className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition ${
                          enabled
                            ? 'border-aletis-verde/30 bg-aletis-verde/10 text-aletis-verde-escuro'
                            : 'border-aletis-borda bg-card text-muted-foreground'
                        }`}
                      >
                        {busy === `scope:${control.key}`
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {control.label}
                      </button>
                    )
                  })}
                </div>
                {sourceMap && (
                  <div className="mt-3 grid gap-3 2xl:grid-cols-2">
                    <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl bg-aletis-bege/20 p-3 custom-scrollbar">
                      {sourceMap.sources.map((source) => (
                        <div key={`${source.kind}:${source.id}`} className="flex items-start gap-2 text-[11px]">
                          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                            source.status === 'selected' ? 'bg-aletis-verde' : source.status === 'missing' ? 'bg-alerta' : 'bg-aletis-grafite-claro/50'
                          }`} />
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-foreground">{source.label}</div>
                            {source.detail && <div className="line-clamp-1 text-[10px] text-muted-foreground">{source.detail}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="max-h-44 space-y-2 overflow-y-auto custom-scrollbar">
                      {sourceMap.gaps.length === 0 ? (
                        <div className="flex items-center gap-2 rounded-xl border border-aletis-verde/20 bg-aletis-verde/5 p-3 text-[11px] font-semibold text-aletis-verde-escuro">
                          <CheckCircle2 className="h-4 w-4" /> Sem lacunas estruturais detectadas.
                        </div>
                      ) : sourceMap.gaps.map((gap) => (
                        <div key={gap.key} className="rounded-xl border border-alerta/20 bg-alerta/5 p-3">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                            <AlertTriangle className="h-3.5 w-3.5 text-alerta" /> {gap.label}
                          </div>
                          <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-soft)]">{gap.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="grid gap-3 2xl:grid-cols-2">
                <div className="rounded-2xl border border-aletis-borda bg-card p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-soft)]">
                    <FileText className="h-4 w-4 text-foreground" />
                    Fontes
                  </div>
                  <div className="mt-3 space-y-2">
                    {selectedNotebook.sources.length === 0 ? (
                      <div className="rounded-xl border border-aletis-verde/20 bg-aletis-verde/5 p-3 text-xs leading-relaxed text-[var(--text-soft)]">
                        <div className="flex items-center gap-2 font-semibold text-aletis-verde-escuro"><Database className="h-3.5 w-3.5" /> Dados internos automáticos</div>
                        <p className="mt-1">Ao gerar, a ALIX consulta CRM, Dossiê Agro, gestão financeira e Farms do cliente vinculado.</p>
                      </div>
                    ) : (
                      selectedNotebook.sources.slice(0, 8).map((source) => (
                        <div key={`${source.sessionId}:${source.documentId}`} className="rounded-lg border border-aletis-borda bg-aletis-bege/20 px-3 py-2">
                          <div className="line-clamp-1 text-xs font-semibold text-foreground">{source.filename || source.documentId}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{source.kind || 'documento'} • {formatDate(source.addedAt)}</div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-3 space-y-2 border-t border-aletis-borda pt-3">
                    <button
                      type="button"
                      onClick={() => void addSources('attachments')}
                      disabled={!sourceSessionId || availableSources.length === 0 || busy === 'sources'}
                      className="flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-aletis-verde/30 text-xs font-semibold text-foreground transition hover:bg-aletis-verde/10 disabled:opacity-50"
                    >
                      {busy === 'sources' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Adicionar documentos da conversa ({availableSources.length})
                    </button>
                    <div className="flex gap-2">
                      <input
                        value={manualSourceIds}
                        onChange={(event) => setManualSourceIds(event.target.value)}
                        placeholder="IDs de documentos, separados por vírgula"
                        className="h-8 min-w-0 flex-1 rounded-lg border border-aletis-borda px-3 text-xs outline-none focus:border-aletis-verde"
                      />
                      <button
                        type="button"
                        onClick={() => void addSources('manual')}
                        disabled={!sourceSessionId || !manualSourceIds.trim() || busy === 'sources'}
                        className="rounded-lg bg-aletis-verde px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-aletis-borda bg-card p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-soft)]">
                    <Clipboard className="h-4 w-4 text-foreground" />
                    Notas do consultor
                  </div>
                  <textarea
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="Cole observações, hipóteses, direcionamentos do cliente, pendências ou estrutura desejada..."
                    rows={5}
                    className="mt-3 w-full resize-none rounded-xl border border-aletis-borda bg-aletis-bege/20 px-3 py-2 text-xs leading-relaxed outline-none focus:border-aletis-verde"
                  />
                  <button
                    type="button"
                    onClick={() => void addNote()}
                    disabled={!noteText.trim() || busy === 'note'}
                    className="mt-2 flex h-8 items-center justify-center gap-2 rounded-lg bg-aletis-verde px-3 text-xs font-semibold text-white transition hover:bg-aletis-verde-escuro disabled:opacity-50"
                  >
                    {busy === 'note' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Salvar nota
                  </button>
                  {selectedNotebook.notes.length > 0 && (
                    <div className="mt-3 max-h-32 space-y-2 overflow-y-auto custom-scrollbar">
                      {selectedNotebook.notes.slice(0, 4).map((note) => (
                        <div key={note.id} className="rounded-lg bg-aletis-bege/40 px-3 py-2 text-[11px] leading-relaxed text-[var(--text-soft)]">
                          {note.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="grid gap-3 2xl:grid-cols-2">
                <div className="rounded-2xl border border-aletis-borda bg-card p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-soft)]">
                    <Search className="h-4 w-4 text-foreground" />
                    Buscar nas fontes
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') void runSearch() }}
                      placeholder="Ex.: garantias, vencimentos, banco, CPR..."
                      className="h-9 min-w-0 flex-1 rounded-lg border border-aletis-borda px-3 text-xs outline-none focus:border-aletis-verde"
                    />
                    <button
                      type="button"
                      onClick={() => void runSearch()}
                      disabled={!query.trim() || busy === 'search'}
                      className="rounded-lg bg-aletis-verde px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busy === 'search' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Buscar'}
                    </button>
                  </div>
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto custom-scrollbar">
                    {searchHits.map((hit) => (
                      <div key={`${hit.documentId}-${hit.citationId}`} className="rounded-xl border border-aletis-borda bg-aletis-bege/20 p-3">
                        <div className="text-[11px] font-semibold text-foreground">
                          [{hit.citationId}] {hit.filename || hit.documentId}
                        </div>
                        <p className="mt-1 line-clamp-4 text-[11px] leading-relaxed text-[var(--text-soft)]">
                          {safeText(hit.text) || 'Trecho não disponível.'}
                        </p>
                      </div>
                    ))}
                      </div>
                    </div>

                <div className="rounded-2xl border border-aletis-borda bg-card p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-soft)]">
                    <MessageSquareText className="h-4 w-4 text-foreground" />
                    Perguntar ao notebook
                  </div>
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Faça uma pergunta específica sobre as fontes deste notebook..."
                    rows={4}
                    className="mt-3 w-full resize-none rounded-xl border border-aletis-borda bg-aletis-bege/20 px-3 py-2 text-xs leading-relaxed outline-none focus:border-aletis-verde"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void askNotebook()}
                      disabled={!question.trim() || busy === 'ask'}
                      className="flex h-8 items-center gap-2 rounded-lg bg-aletis-verde px-3 text-xs font-semibold text-white transition hover:bg-aletis-verde-escuro disabled:opacity-50"
                    >
                      {busy === 'ask' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Responder com fontes
                    </button>
                    <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-aletis-borda px-3 text-[11px] font-semibold text-[var(--text-soft)] hover:border-aletis-verde">
                      <input
                        type="checkbox"
                        checked={researchWeb}
                        onChange={(event) => setResearchWeb(event.target.checked)}
                        className="accent-aletis-verde"
                      />
                      <Globe2 className="h-3.5 w-3.5 text-foreground" />
                      Pesquisa web
                    </label>
                    <button
                      type="button"
                      onClick={askViaChat}
                      disabled={!onPrompt}
                      className="h-8 rounded-lg border border-aletis-borda px-3 text-xs font-semibold text-[var(--text-soft)] transition hover:border-aletis-verde hover:text-aletis-verde disabled:opacity-50"
                    >
                      Mandar para chat
                    </button>
                  </div>
                  {answer && (
                    <div className="mt-3 rounded-xl border border-aletis-borda bg-aletis-bege/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-bold text-foreground">{answer.title}</div>
                        <button type="button" onClick={() => void copyMarkdown(answer.markdown)} className="text-muted-foreground hover:text-aletis-verde" title="Copiar resposta">
                          {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--text-soft)] custom-scrollbar">{answer.markdown}</pre>
                      <ArtifactCitations citations={answer.citations} />
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-aletis-borda pt-3">
                        <span className="mr-1 text-[10px] font-semibold uppercase text-muted-foreground">Converter em</span>
                        {([
                          ['task', 'Tarefa'],
                          ['note', 'Nota'],
                          ['proposal', 'Proposta'],
                          ['checklist', 'Checklist'],
                        ] as const).map(([target, label]) => (
                          <button
                            key={target}
                            type="button"
                            onClick={() => void convertArtifact(answer, target)}
                            disabled={busy === `convert:${target}`}
                            className="h-7 rounded-lg border border-aletis-borda bg-card px-2.5 text-[10px] font-semibold text-[var(--text-soft)] transition hover:border-aletis-verde hover:text-aletis-verde disabled:opacity-50"
                          >
                            {busy === `convert:${target}` ? 'Salvando…' : label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-aletis-borda bg-card p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-soft)]">
                  <Sparkles className="h-4 w-4 text-aletis-dourado" />
                  Gerar documento
                </div>
                <div className="mt-3 grid gap-2 2xl:grid-cols-[190px_minmax(0,1fr)_auto]">
                  <select
                    value={artifactKind}
                    onChange={(event) => setArtifactKind(event.target.value as ArtifactKind)}
                    className="h-9 rounded-lg border border-aletis-borda bg-card px-3 text-xs outline-none focus:border-aletis-verde"
                  >
                    {Object.entries(KIND_LABELS).map(([kind, label]) => (
                      <option key={kind} value={kind}>{label}</option>
                    ))}
                  </select>
                  <input
                    value={artifactObjective}
                    onChange={(event) => setArtifactObjective(event.target.value)}
                    placeholder="Objetivo do documento final"
                    className="h-9 rounded-lg border border-aletis-borda px-3 text-xs outline-none focus:border-aletis-verde"
                  />
                  <button
                    type="button"
                    onClick={() => void generateArtifact()}
                    disabled={busy === 'generate'}
                    className="flex h-9 items-center justify-center gap-2 rounded-lg bg-aletis-dourado px-4 text-xs font-bold text-aletis-verde-escuro transition hover:bg-aletis-dourado-escuro disabled:opacity-50"
                  >
                    {busy === 'generate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Gerar
                  </button>
                </div>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[var(--text-soft)]">
                  <input
                    type="checkbox"
                    checked={researchWeb}
                    onChange={(event) => setResearchWeb(event.target.checked)}
                    className="accent-aletis-verde"
                  />
                  <Globe2 className="h-3.5 w-3.5 text-foreground" />
                  Complementar com pesquisa web pública e fontes brasileiras
                </label>
                {(generatedArtifact || selectedNotebook.artifacts[0]) && (
                  <div className="mt-4 rounded-xl border border-aletis-borda bg-aletis-bege/20 p-3">
                    {(() => {
                      const artifact = generatedArtifact || selectedNotebook.artifacts[0]
                      const versions = selectedNotebook.artifacts
                        .filter((item) => item.lineageId === artifact.lineageId)
                        .sort((a, b) => b.version - a.version)
                      const artifactComments = selectedNotebook.comments
                        .filter((comment) => !comment.artifactId || versions.some((version) => version.id === comment.artifactId))
                      return (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-foreground">{artifact.title}</div>
                              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                {KIND_LABELS[artifact.kind]} • versão {artifact.version} • {formatDate(artifact.createdAt)}
                              </div>
                              {artifact.changeSummary && <p className="mt-1 text-[11px] text-[var(--text-soft)]">{artifact.changeSummary}</p>}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openHtmlDocument(artifact)}
                                className="flex h-8 items-center gap-1.5 rounded-lg border border-aletis-verde/30 bg-card px-3 text-xs font-semibold text-foreground transition hover:bg-aletis-verde/5"
                              >
                                <FileText className="h-3.5 w-3.5" />
                                HTML
                              </button>
                              <button
                                type="button"
                                onClick={() => openExport(artifact, 'pdf')}
                                className="flex h-8 items-center gap-1.5 rounded-lg border border-aletis-borda bg-card px-3 text-xs font-semibold text-[var(--text-soft)] transition hover:border-aletis-verde"
                              >
                                <Download className="h-3.5 w-3.5" /> PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => openExport(artifact, 'docx')}
                                className="flex h-8 items-center gap-1.5 rounded-lg border border-aletis-borda bg-card px-3 text-xs font-semibold text-[var(--text-soft)] transition hover:border-aletis-verde"
                              >
                                <Download className="h-3.5 w-3.5" /> DOCX
                              </button>
                              <button
                                type="button"
                                onClick={() => void copyMarkdown(artifact.markdown)}
                                className="flex h-8 items-center gap-1.5 rounded-lg border border-aletis-borda px-3 text-xs font-semibold text-[var(--text-soft)] transition hover:border-aletis-verde hover:text-aletis-verde"
                              >
                                {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                                Copiar
                              </button>
                            </div>
                          </div>
                          <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-card p-3 text-[11px] leading-relaxed text-foreground custom-scrollbar">
                            {artifact.markdown}
                          </pre>
                          <ArtifactCitations citations={artifact.citations} />

                          <div className="mt-4 grid gap-3 border-t border-aletis-borda pt-4 2xl:grid-cols-2">
                            <div>
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                <GitBranch className="h-3.5 w-3.5" /> Atualização seletiva
                              </div>
                              <textarea
                                value={revisionInstructions}
                                onChange={(event) => setRevisionInstructions(event.target.value)}
                                rows={3}
                                placeholder="Instrução opcional. A ALIX também detectará novas fontes e aplicará comentários abertos."
                                className="mt-2 w-full resize-none rounded-lg border border-aletis-borda bg-card px-3 py-2 text-[11px] leading-relaxed outline-none focus:border-aletis-verde"
                              />
                              <button
                                type="button"
                                onClick={() => void updateArtifact(artifact)}
                                disabled={busy === 'update-artifact'}
                                className="mt-2 flex h-8 items-center gap-2 rounded-lg bg-aletis-verde px-3 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                {busy === 'update-artifact' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
                                Atualizar documento
                              </button>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                <MessageSquarePlus className="h-3.5 w-3.5" /> Revisão colaborativa
                              </div>
                              <textarea
                                value={commentText}
                                onChange={(event) => setCommentText(event.target.value)}
                                rows={3}
                                placeholder="Comentário do consultor: será tratado como instrução editorial, não como evidência."
                                className="mt-2 w-full resize-none rounded-lg border border-aletis-borda bg-card px-3 py-2 text-[11px] leading-relaxed outline-none focus:border-aletis-verde"
                              />
                              <button
                                type="button"
                                onClick={() => void addEditorialComment(artifact)}
                                disabled={!commentText.trim() || busy === 'comment'}
                                className="mt-2 flex h-8 items-center gap-2 rounded-lg border border-aletis-verde/30 px-3 text-xs font-semibold text-foreground disabled:opacity-50"
                              >
                                {busy === 'comment' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                Adicionar comentário
                              </button>
                            </div>
                          </div>

                          {(versions.length > 1 || artifactComments.length > 0) && (
                            <div className="mt-4 grid gap-3 2xl:grid-cols-2">
                              <div className="rounded-xl bg-card p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Histórico de versões</div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {versions.map((version) => (
                                    <button
                                      key={version.id}
                                      type="button"
                                      onClick={() => setGeneratedArtifact(version)}
                                      className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold ${version.id === artifact.id ? 'border-aletis-verde bg-aletis-verde/10 text-foreground' : 'border-aletis-borda text-[var(--text-soft)]'}`}
                                    >
                                      v{version.version} · {formatDate(version.createdAt)}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="rounded-xl bg-card p-3">
                                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Comentários editoriais</div>
                                <div className="mt-2 max-h-24 space-y-1.5 overflow-y-auto custom-scrollbar">
                                  {artifactComments.map((comment) => (
                                    <div key={comment.id} className="text-[10px] leading-relaxed text-[var(--text-soft)]">
                                      <span className={`mr-1 font-bold ${comment.status === 'open' ? 'text-alerta' : 'text-foreground'}`}>{comment.status === 'open' ? 'Aberto' : 'Aplicado'}:</span>
                                      {comment.text}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </section>

              {selectedNotebook.actions.length > 0 && (
                <section className="rounded-2xl border border-aletis-borda bg-card p-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--text-soft)]">
                    <ListTodo className="h-4 w-4 text-foreground" />
                    Entregáveis convertidos
                  </div>
                  <div className="mt-3 grid gap-2 2xl:grid-cols-2">
                    {selectedNotebook.actions.slice(0, 12).map((action) => (
                      <div key={action.id} className="flex items-start justify-between gap-3 rounded-xl border border-aletis-borda bg-aletis-bege/20 p-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase text-muted-foreground">{action.kind}</div>
                          <div className="line-clamp-2 text-xs font-semibold text-foreground">{action.title}</div>
                        </div>
                        {action.status === 'open' ? (
                          <button
                            type="button"
                            onClick={() => void updateAction(action, 'done')}
                            disabled={busy === `action:${action.id}`}
                            className="shrink-0 rounded-lg border border-aletis-verde/30 px-2 py-1 text-[10px] font-semibold text-foreground disabled:opacity-50"
                          >
                            Concluir
                          </button>
                        ) : (
                          <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-foreground">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </main>
        </div>
      </div>
    </div>
  )
}
