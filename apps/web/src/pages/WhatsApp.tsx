import PageHeader from '../components/ui/PageHeader'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FileText,
  Headphones,
  MessageCircle,
  QrCode,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'

type EvolutionConnectionStatus = 'disconnected' | 'connecting' | 'qr_available' | 'connected' | 'degraded' | 'error'

interface StatusData {
  provider: string
  evolution?: { configurado: boolean; baseUrl?: string; instance?: string; webhookUrl?: string; status?: EvolutionConnectionStatus; reachable?: boolean; checkedAt?: string }
  whatsapp?: { configurado: boolean }
  speech?: { configurado: boolean; regiao?: string; voz?: string }
  calendar?: { configurado: boolean; dryRun: boolean; consultor: string; timezone: string }
  storage?: { provider: string; dir: string }
  documentosObrigatorios?: Array<{ key: string; label: string }>
}

interface EvolutionConnectData {
  pairingCode?: unknown
  code?: string
  base64?: string
  count?: number
}

interface Conversation {
  id: string
  clienteId?: string | null
  telefone: string
  nomeContato?: string | null
  atendimentoModo: string
  aiEnabled?: boolean
  status: string
  etapa: string
  crmStatus?: string | null
  currentState?: string | null
  elegibilidadeStatus: string
  eligibilityScore?: number
  assignedUserId?: string | null
  takeoverReason?: string | null
  prioridade: string
  ultimaMensagemEm?: string | null
  totalMensagens?: number
  documentosPendentes?: number
  ultimaMensagem?: string | null
  resumo?: string | null
}

interface Message {
  id: string
  direction: string
  type: string
  status: string
  text?: string | null
  transcription?: string | null
  mediaFilename?: string | null
  timestamp: string
}

interface DocumentItem {
  id: string
  filename: string
  categoria: string
  status: string
  resumoIa?: string | null
  criadoEm?: string | null
}

interface ChecklistItem {
  key: string
  label: string
  status: 'recebido' | 'pendente' | string
}

interface Bundle {
  conversation: Conversation
  messages: Message[]
  documents: DocumentItem[]
  eligibility: Array<Record<string, unknown>>
  calendarEvents: Array<Record<string, unknown>>
  checklist: ChecklistItem[]
}

const statusLabel: Record<string, string> = {
  aberta: 'Aberta',
  aguardando_cliente: 'Aguardando cliente',
  aguardando_consultor: 'Aguardando consultor',
  reuniao_agendada: 'Reuniao agendada',
  encerrada: 'Encerrada',
}

interface ManualSendAttempt {
  conversationId: string
  text: string
  idempotencyKey: string
}

interface ManualSendState {
  activeId?: string | null
  drafts: Record<string, string>
  attempts: ManualSendAttempt[]
}

const MANUAL_SEND_STORAGE = 'aletis:whatsapp:manual-send:v1'

/** Repetir a mesma tentativa conserva sua identidade até o envio ser confirmado. */
export function resolveManualSendAttempt(attempts: ManualSendAttempt[], conversationId: string, text: string, newKey: () => string): ManualSendAttempt {
  const normalized = text.trim()
  return attempts.find((attempt) => attempt.conversationId === conversationId && attempt.text === normalized)
    || { conversationId, text: normalized, idempotencyKey: newKey() }
}

export function confirmedManualSend(status?: string): boolean {
  return ['sent', 'delivered', 'read'].includes(status || '')
}

function readManualSendState(): ManualSendState {
  try {
    const value = JSON.parse(sessionStorage.getItem(MANUAL_SEND_STORAGE) || '{}') as Partial<ManualSendState>
    const drafts = Object.fromEntries(Object.entries(value.drafts || {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    const attempts = Array.isArray(value.attempts) ? value.attempts.filter((attempt) =>
      attempt && typeof attempt.conversationId === 'string' && typeof attempt.text === 'string' && typeof attempt.idempotencyKey === 'string' && attempt.idempotencyKey.trim().length > 0,
    ) : []
    return { activeId: typeof value.activeId === 'string' ? value.activeId : null, drafts, attempts }
  } catch { return { drafts: {}, attempts: [] } }
}

const messageStatusLabel: Record<string, string> = {
  received: 'Recebida', recebido: 'Recebida', pending: 'Aguardando confirmação', queued: 'Na fila', sending: 'Enviando',
  sent: 'Enviada', delivered: 'Entregue', read: 'Lida', failed: 'Falha no envio', uncertain: 'Envio sem confirmação',
  dry_run: 'Simulação · não enviada', cancelled: 'Cancelada',
}

function fmtDate(value?: string | null): string {
  if (!value) return 'Sem data'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function initials(name?: string | null, phone?: string): string {
  const source = name || phone || 'WA'
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'WA'
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
      ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {label}
    </span>
  )
}

const evolutionStatusMeta: Record<EvolutionConnectionStatus, { label: string; cls: string }> = {
  disconnected: { label: 'WhatsApp desconectado', cls: 'bg-slate-100 text-slate-700' },
  connecting: { label: 'WhatsApp conectando', cls: 'bg-sky-50 text-sky-700' },
  qr_available: { label: 'QR disponível', cls: 'bg-amber-50 text-amber-800' },
  connected: { label: 'WhatsApp conectado', cls: 'bg-emerald-50 text-emerald-700' },
  degraded: { label: 'WhatsApp degradado', cls: 'bg-amber-50 text-amber-800' },
  error: { label: 'Falha na conexão', cls: 'bg-red-50 text-red-700' },
}

function EvolutionStatusPill({ status }: { status: EvolutionConnectionStatus }) {
  const meta = evolutionStatusMeta[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  )
}

export default function WhatsApp() {
  const [initialManualState] = useState(readManualSendState)
  const [status, setStatus] = useState<StatusData | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [activeId, setActiveId] = useState<string | null>(initialManualState.activeId || null)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState(initialManualState.activeId ? initialManualState.drafts[initialManualState.activeId] || '' : '')
  const [qrData, setQrData] = useState<EvolutionConnectData | null>(null)
  const [connectionBusy, setConnectionBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeIdRef = useRef<string | null>(activeId)
  const sendingRef = useRef(false)
  const manualStateRef = useRef<ManualSendState>(initialManualState)

  function saveManualState(next: ManualSendState): boolean {
    manualStateRef.current = next
    try { sessionStorage.setItem(MANUAL_SEND_STORAGE, JSON.stringify(next)); return true } catch { return false }
  }

  function selectConversation(id: string | null) {
    if (id !== activeIdRef.current) {
      setBundle(null)
      setDraft(id ? manualStateRef.current!.drafts[id] || '' : '')
    }
    activeIdRef.current = id
    setActiveId(id)
    if (manualStateRef.current.activeId !== id) saveManualState({ ...manualStateRef.current, activeId: id })
  }

  function updateDraft(text: string) {
    setDraft(text)
    const id = activeIdRef.current
    if (id) saveManualState({ ...manualStateRef.current!, drafts: { ...manualStateRef.current!.drafts, [id]: text } })
  }

  const activeConversation = (bundle?.conversation.id === activeId ? bundle.conversation : null) || conversations.find((c) => c.id === activeId) || null

  async function loadAll(nextActiveId?: string | null) {
    setLoading(true)
    setError(null)
    try {
      const [st, conv] = await Promise.all([
        apiFetch<StatusData>('/whatsapp/status'),
        apiFetch<{ conversations: Conversation[]; total: number }>(`/whatsapp/conversations?search=${encodeURIComponent(search)}`),
      ])
      setStatus(st)
      setConversations(conv.conversations)
      const chosen = nextActiveId || activeIdRef.current || conv.conversations[0]?.id || null
      selectConversation(chosen)
      if (chosen) {
        const detail = await apiFetch<Bundle>(`/whatsapp/conversations/${encodeURIComponent(chosen)}`)
        if (activeIdRef.current === chosen) setBundle(detail)
      } else {
        setBundle(null)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function openConversation(id: string) {
    selectConversation(id)
    setError(null)
    try {
      const detail = await apiFetch<Bundle>(`/whatsapp/conversations/${encodeURIComponent(id)}`)
      if (activeIdRef.current === id) setBundle(detail)
    } catch (err) {
      if (activeIdRef.current === id) setError((err as Error).message)
    }
  }

  async function setMode(mode: 'handoff' | 'ai') {
    if (!activeId) return
    setBusy(true)
    try {
      await apiFetch(`/whatsapp/conversations/${encodeURIComponent(activeId)}/${mode}`, { method: 'POST' })
      await openConversation(activeId)
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage() {
    if (!activeId || !draft.trim() || busy || sendingRef.current) return
    const conversationId = activeId
    const text = draft.trim()
    const previous = manualStateRef.current!
    const attempt = resolveManualSendAttempt(previous.attempts, conversationId, text, () => crypto.randomUUID())
    const attempts = previous.attempts.some((item) => item.idempotencyKey === attempt.idempotencyKey)
      ? previous.attempts : [...previous.attempts, attempt]
    if (!saveManualState({ ...previous, drafts: { ...previous.drafts, [conversationId]: draft }, attempts })) {
      setError('Não foi possível guardar esta tentativa. Mantenha a conversa aberta e tente novamente.')
      return
    }
    sendingRef.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await apiFetch<Message>(`/whatsapp/conversations/${encodeURIComponent(conversationId)}/send`, {
        method: 'POST',
        body: JSON.stringify({ text, idempotencyKey: attempt.idempotencyKey }),
      })
      if (!confirmedManualSend(result?.status)) throw new Error('O envio ainda não foi confirmado. Confira o histórico da conversa.')
      const current = manualStateRef.current!
      const drafts = { ...current.drafts }
      if (drafts[conversationId]?.trim() === text) drafts[conversationId] = ''
      saveManualState({ ...current, drafts, attempts: current.attempts.filter((item) => item.idempotencyKey !== attempt.idempotencyKey) })
      if (activeIdRef.current === conversationId) {
        setDraft(drafts[conversationId] || '')
        await openConversation(conversationId)
      }
    } catch (err) {
      if (activeIdRef.current === conversationId) {
        setError((err as Error).message)
        void apiFetch<Bundle>(`/whatsapp/conversations/${encodeURIComponent(conversationId)}`)
          .then((detail) => { if (activeIdRef.current === conversationId) setBundle(detail) })
          .catch(() => { /* O erro original e o rascunho continuam visíveis. */ })
      }
    } finally {
      sendingRef.current = false
      setBusy(false)
    }
  }

  async function resendDocumentChecklist() {
    if (!activeId) return
    setBusy(true)
    setError(null)
    try {
      await apiFetch(`/whatsapp/conversations/${encodeURIComponent(activeId)}/documents/checklist`, { method: 'POST' })
      await openConversation(activeId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function connectInstance() {
    const instance = status?.evolution?.instance || 'aletis-principal'
    setConnectionBusy(true)
    setError(null)
    try {
      const data = await apiFetch<EvolutionConnectData>(`/whatsapp/evolution/instances/${encodeURIComponent(instance)}/connect`, {
        method: 'POST',
      })
      setQrData(data)
      await loadAll(activeId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConnectionBusy(false)
    }
  }

  async function configureWebhook() {
    setConnectionBusy(true)
    setError(null)
    try {
      await apiFetch('/whatsapp/evolution/webhook/set', {
        method: 'POST',
        body: JSON.stringify({ instance: status?.evolution?.instance || 'aletis-principal' }),
      })
      await loadAll(activeId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConnectionBusy(false)
    }
  }

  useEffect(() => {
    loadAll()
    const timer = window.setInterval(() => loadAll(activeId), 30_000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const metrics = useMemo(() => {
    const humanas = conversations.filter((c) => c.atendimentoModo === 'humano').length
    const agendadas = conversations.filter((c) => c.status === 'reuniao_agendada').length
    const pendDocs = conversations.reduce((sum, c) => sum + Number(c.documentosPendentes || 0), 0)
    const elegiveis = conversations.filter((c) => ['Elegível', 'Reunião oferecida', 'Reunião agendada'].includes(c.crmStatus || '')).length
    return { humanas, agendadas, pendDocs, elegiveis }
  }, [conversations])

  const checklist = bundle?.checklist || status?.documentosObrigatorios?.map((d) => ({ ...d, status: 'pendente' })) || []
  const qrSrc = qrData?.base64
    ? qrData.base64.startsWith('data:') ? qrData.base64 : `data:image/png;base64,${qrData.base64}`
    : null
  const evolutionStatus = status?.evolution?.status ?? (status?.evolution?.configurado ? 'degraded' : 'disconnected')
  const calendarReady = Boolean(status?.calendar?.configurado) || Boolean(status?.calendar?.dryRun)
  const emptyState = evolutionStatus === 'connected'
    ? {
        title: 'Aguardando a primeira conversa',
        detail: 'A instância está conectada. Assim que chegar a primeira mensagem pelo webhook, a conversa aparece aqui com IA, checklist, documentos e agenda.',
      }
    : {
        title: 'Conexão WhatsApp pendente',
        detail: 'Conecte a instância, gere o QR se necessário e configure o webhook para começar a receber conversas.',
      }

  return (
    <div className="min-h-[calc(100vh-88px)] text-foreground">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-4">
        <PageHeader title="WhatsApp" description="Conversas, agenda e documentos do atendimento." eyebrow={<> <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">Central WhatsApp IA</p> </>} actions={<> <div className="flex flex-wrap items-center gap-2">
            <EvolutionStatusPill status={evolutionStatus} />
            <StatusPill ok={Boolean(status?.speech?.configurado)} label={status?.speech?.configurado ? 'Audio ativo' : 'Audio pendente'} />
            <StatusPill ok={calendarReady} label={status?.calendar?.dryRun ? 'Agenda em teste' : status?.calendar?.configurado ? 'Agenda conectada' : 'Agenda pendente'} />
            <button
              onClick={() => loadAll(activeId)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-card px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div> </>} />

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Conversas</span>
              <MessageCircle className="h-4 w-4 text-foreground" />
            </div>
            <p className="mt-2 text-2xl font-semibold">{conversations.length}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Com humano</span>
              <Headphones className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-semibold">{metrics.humanas}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Elegiveis</span>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-semibold">{metrics.elegiveis}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Reunioes</span>
              <CalendarDays className="h-4 w-4 text-sky-600" />
            </div>
            <p className="mt-2 text-2xl font-semibold">{metrics.agendadas}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Documentos pendentes</span>
              <FileText className="h-4 w-4 text-rose-600" />
            </div>
            <p className="mt-2 text-2xl font-semibold">{metrics.pendDocs}</p>
          </div>
        </section>

        <details open={evolutionStatus !== 'connected' ? true : undefined} className="rounded-lg border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-medium">Conexão e integrações</summary><section className="pt-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-foreground" />
                <h2 className="font-semibold text-slate-900">Conexao WhatsApp</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Tudo fica nesta tela: crie a instancia, gere o QR e configure o webhook sem depender do Manager local.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={connectInstance}
                disabled={connectionBusy}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-aletis-verde px-3 text-sm font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50"
              >
                <QrCode className="h-4 w-4" />
                Gerar QR
              </button>
              <button
                onClick={configureWebhook}
                disabled={connectionBusy}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 disabled:opacity-50"
              >
                Configurar webhook
              </button>
            </div>
          </div>

          {qrSrc || qrData?.code ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              {qrSrc ? (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <img src={qrSrc} alt="QR Code para conectar WhatsApp" className="mx-auto h-48 w-48 rounded bg-card object-contain p-2" />
                </div>
              ) : null}
              <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium text-slate-900">Como conectar</p>
                <p className="mt-1">Abra o WhatsApp no celular, acesse aparelhos conectados e escaneie o QR acima.</p>
                {qrData?.count ? <p className="mt-2 text-xs text-slate-500">Tentativa atual: {qrData.count}</p> : null}
                {qrData?.code ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600">Ver codigo bruto</summary>
                    <pre className="mt-2 max-h-28 overflow-auto rounded bg-card p-2 text-[11px] text-slate-500">{qrData.code}</pre>
                  </details>
                ) : null}
              </div>
            </div>
          ) : null}
        </section></details>

        <section aria-label="Conversas e atendimento" className="grid min-h-[680px] grid-cols-1 gap-4 pb-2 xl:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside className="min-w-0 rounded-md border border-slate-200 bg-card shadow-sm">
            <div className="border-b border-slate-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadAll(activeId)
                  }}
                  placeholder="Buscar contato ou telefone"
                  className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-aletis-verde focus:bg-white"
                />
              </div>
            </div>
            <div className="max-h-[620px] overflow-y-auto">
              {loading && conversations.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">Carregando conversas...</div>
              ) : conversations.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  Nenhuma conversa recebida ainda. Configure a instancia na Evolution API e aponte o webhook para o ALETIS.
                </div>
              ) : conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`flex w-full gap-3 border-b border-slate-100 p-3 text-left transition hover:bg-slate-50 ${
                    activeId === c.id ? 'bg-emerald-50/80' : 'bg-card'
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-aletis-verde text-sm font-semibold text-white">
                    {initials(c.nomeContato, c.telefone)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">{c.nomeContato || c.telefone}</p>
                      <span className="shrink-0 text-[11px] text-slate-500">{fmtDate(c.ultimaMensagemEm)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">{c.ultimaMensagem || c.resumo || 'Sem mensagens exibidas'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{statusLabel[c.status] || c.status}</span>
                      {c.crmStatus && (
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700">{c.crmStatus}</span>
                      )}
                      <span className={`rounded px-1.5 py-0.5 text-[11px] ${c.atendimentoModo === 'ia' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                        {c.atendimentoModo === 'ia' ? 'IA' : 'Humano'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex min-w-0 flex-col rounded-md border border-slate-200 bg-card shadow-sm">
            {activeConversation ? (
              <>
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-slate-900">{activeConversation.nomeContato || activeConversation.telefone}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <span>{activeConversation.telefone}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span>{statusLabel[activeConversation.status] || activeConversation.status}</span>
                      <span className="h-1 w-1 rounded-full bg-slate-300" />
                      <span>{(activeConversation.currentState || activeConversation.etapa).replace(/_/g, ' ')}</span>
                      {activeConversation.crmStatus && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">{activeConversation.crmStatus}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeConversation.clienteId && (
                      <Link
                        to={`/clientes/${activeConversation.clienteId}`}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-card px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-4 w-4" />
                        CRM
                      </Link>
                    )}
                    <button
                      onClick={() => setMode('handoff')}
                      disabled={busy || activeConversation.atendimentoModo === 'humano'}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-800 disabled:opacity-50"
                    >
                      <UserRound className="h-4 w-4" />
                      Assumir
                    </button>
                    <button
                      onClick={() => setMode('ai')}
                      disabled={busy || activeConversation.atendimentoModo === 'ia'}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 disabled:opacity-50"
                    >
                      <Bot className="h-4 w-4" />
                      Devolver para IA
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
                  <div className="mx-auto flex max-w-4xl flex-col gap-3">
                    {(bundle?.messages || []).length === 0 ? (
                      <div className="rounded-md border border-dashed border-slate-300 bg-card p-8 text-center text-sm text-slate-500">
                        A conversa foi criada, mas ainda nao ha mensagens persistidas.
                      </div>
                    ) : bundle!.messages.map((m) => {
                      const outbound = m.direction === 'outbound'
                      const unconfirmed = outbound && !confirmedManualSend(m.status)
                      return (
                        <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[78%] rounded-md px-4 py-3 shadow-sm ${
                            unconfirmed ? 'border border-amber-200 bg-amber-50 text-amber-950' : outbound ? 'bg-aletis-verde text-white' : 'bg-card text-slate-800'
                          }`}>
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                              {m.text || m.transcription || m.mediaFilename || `[${m.type}]`}
                            </p>
                            <div className={`mt-2 flex items-center gap-2 text-[11px] ${unconfirmed ? 'text-amber-800' : outbound ? 'text-white/75' : 'text-slate-400'}`}>
                              <span>{fmtDate(m.timestamp)}</span>
                              <span>{messageStatusLabel[m.status] || (outbound ? 'Confirmação pendente' : m.status)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-100 p-3">
                  <div className="flex gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => updateDraft(e.target.value)}
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault()
                          sendMessage()
                        }
                      }}
                      placeholder="Escreva uma resposta manual..."
                      className="min-h-[44px] flex-1 resize-none rounded-md border border-slate-200 bg-card px-3 py-2 text-sm outline-none focus:border-aletis-verde"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={busy || !draft.trim()}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-aletis-verde text-white hover:bg-aletis-verde-escuro disabled:opacity-50"
                      aria-label="Enviar mensagem"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div className="max-w-md">
                  <MessageCircle className="mx-auto h-10 w-10 text-slate-300" />
                  <h2 className="mt-3 text-lg font-semibold text-slate-900">{emptyState.title}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {emptyState.detail}
                  </p>
                </div>
              </div>
            )}
          </section>

          <aside className="min-w-0 space-y-4 overflow-x-auto xl:col-span-2 2xl:col-span-1">
            {activeConversation && (
              <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-foreground" />
                  <h3 className="font-semibold text-slate-900">Controle da conversa</h3>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Modo</p>
                    <p className="mt-1 font-semibold">{activeConversation.atendimentoModo === 'ia' ? 'IA ativa' : 'Humano assumiu'}</p>
                  </div>
                  <div className="rounded border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Score</p>
                    <p className="mt-1 font-semibold">{Number(activeConversation.eligibilityScore || 0).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
                {activeConversation.takeoverReason && (
                  <p className="mt-3 rounded border border-amber-100 bg-amber-50 p-2 text-xs text-amber-800">
                    {activeConversation.takeoverReason}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={resendDocumentChecklist}
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-card px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FileCheck2 className="h-4 w-4" />
                    Reenviar documentos
                  </button>
                  {activeConversation.clienteId && (
                    <Link
                      to={`/clientes/${activeConversation.clienteId}?area=workflow`}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-card px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir cliente
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-foreground" />
                <h3 className="font-semibold text-slate-900">Operacao</h3>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Instancia</span>
                  <span className="truncate font-medium">{status?.evolution?.instance || 'Nao definida'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Conexão</span>
                  <span className="truncate font-medium">{evolutionStatusMeta[evolutionStatus].label}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Webhook</span>
                  <span className="truncate font-medium">{status?.evolution?.webhookUrl ? 'Configurado' : 'Pendente'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Agenda</span>
                  <span className="truncate font-medium">{status?.calendar?.dryRun ? 'Modo teste' : 'Conectada'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Storage</span>
                  <span className="truncate font-medium">{status?.storage?.provider || 'local'}</span>
                </div>
              </div>
            </div>

            {bundle?.calendarEvents?.length ? (
              <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <CalendarCheck2 className="h-4 w-4 text-sky-600" />
                  <h3 className="font-semibold text-slate-900">Agenda</h3>
                </div>
                <div className="mt-3 space-y-2">
                  {bundle.calendarEvents.slice(0, 3).map((event: any, idx) => (
                    <div key={String(event.id || idx)} className="rounded border border-slate-100 bg-slate-50 p-3 text-sm">
                      <p className="font-medium text-slate-800">{String(event.titulo || event.summary || 'Reuniao ALETIS')}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {fmtDate(String(event.start_at || event.startAt || event.start || ''))} · {String(event.status || 'registrado')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <h3 className="font-semibold text-slate-900">Elegibilidade</h3>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {activeConversation
                  ? `Status: ${activeConversation.elegibilidadeStatus.replace(/_/g, ' ')}`
                  : 'Selecione uma conversa para ver a triagem.'}
              </p>
              <div className="mt-3 space-y-2">
                {(bundle?.eligibility || []).map((item: any) => (
                  <div key={String(item.question_key || item.questionKey)} className="rounded border border-slate-100 bg-slate-50 p-2">
                    <p className="text-xs font-medium text-slate-500">{String(item.question_key || item.questionKey).replace(/_/g, ' ')}</p>
                    <p className="mt-1 break-words text-sm text-slate-800">{String(item.answer_text || item.answerText || '')}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-sky-600" />
                <h3 className="font-semibold text-slate-900">Checklist documental</h3>
              </div>
              <div className="mt-3 space-y-2">
                {checklist.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 rounded border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="min-w-0 break-words text-sm text-slate-700">{item.label}</span>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${
                      item.status === 'recebido' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
              {bundle?.documents?.length ? (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Recebidos</p>
                  <div className="mt-2 space-y-2">
                    {bundle.documents.map((doc) => (
                      <div key={doc.id} className="rounded border border-slate-100 p-2">
                        <p className="break-words text-sm font-medium text-slate-800">{doc.filename}</p>
                        <p className="mt-1 text-xs text-slate-500">{doc.categoria} · {doc.status}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      </div>
    </div>
  )
}
