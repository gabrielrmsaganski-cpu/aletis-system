/**
 * ALIX — Agente de Leitura e Inteligência Estratégica
 *
 * Wave 10 UI: upload multimodal (drag-drop + paperclip), cliente
 * ativo com badge/briefing, download chips para docs gerados,
 * SSE streaming e modal de memória persistente.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  Scale,
  Cloud,
  Users,
  DollarSign,
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
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { AlixConfirmationsPanel } from '../components/alix/AlixConfirmationBatch'
import { SubagentIndicator, detectLastSubagent } from '../components/alix/SubagentIndicator'

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
}

interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

interface SessionSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
  lastMessage?: string
}

interface ChatResponse {
  reply: ChatMessage
  sessionId: string
  session: Omit<ChatSession, 'messages'> & { messageCount: number }
}

interface AttachmentChip {
  id: string
  filename: string
  kind: 'pdf' | 'docx' | 'xlsx' | 'image' | 'text' | 'unknown'
  sizeBytes: number
  pageCount?: number
  uploading?: boolean
  error?: string
}

interface ClienteLite {
  id: string
  nome: string
}

interface BriefingDestaque {
  titulo: string
  detalhe: string
  severidade: 'info' | 'atencao' | 'critico'
}

interface BriefingDivida {
  credor: string
  saldoBRL: number
  status: string
}

interface Briefing {
  clienteId: string
  clienteNome: string
  geradoEm: string
  resumoExecutivo: string
  destaques: BriefingDestaque[]
  proximasAcoes: string[]
  dividasAtivas: BriefingDivida[]
  sugestaoPrimeiraAcao: string
  markdown: string
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

// ────────────────────────────────────────────────────────────
// Local state keys
// ────────────────────────────────────────────────────────────

const ACTIVE_SESSION_KEY = 'aletis:alix:activeSession'
const ACTIVE_CLIENTE_KEY = 'aletis:alix:activeCliente'
const STREAM_KEY = 'aletis:alix:stream'

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
          <div className="whitespace-pre-wrap text-aletis-grafite-escuro dark:text-white/85 font-mono text-[11px]">
            {typeof this.props.content === 'string' ? this.props.content.slice(0, 800) : '(sem conteúdo)'}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Renderiza inline: **bold**, _italic_, `code`, [link](url).
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0
  // Regex priority: code > link > bold > italic
  const patterns: Array<{ re: RegExp; type: 'code' | 'link' | 'b' | 'i' }> = [
    { re: /`([^`]+)`/, type: 'code' },
    { re: /\[([^\]]+)\]\(([^)]+)\)/, type: 'link' },
    { re: /\*\*([^*]+)\*\*/, type: 'b' },
    { re: /(?<![a-z0-9_])_([^_]+)_(?![a-z0-9_])/i, type: 'i' },
  ]
  while (remaining.length > 0) {
    let best: { match: RegExpMatchArray; type: typeof patterns[number]['type'] } | null = null
    for (const p of patterns) {
      const m = remaining.match(p.re)
      if (m && (best == null || (m.index ?? 0) < (best.match.index ?? 0))) {
        best = { match: m, type: p.type }
      }
    }
    if (!best) {
      parts.push(<span key={`t-${key++}`}>{remaining}</span>)
      break
    }
    const idx = best.match.index ?? 0
    if (idx > 0) parts.push(<span key={`t-${key++}`}>{remaining.slice(0, idx)}</span>)
    if (best.type === 'b') {
      parts.push(<strong key={`b-${key++}`} className="font-semibold text-aletis-grafite-escuro dark:text-white">{best.match[1]}</strong>)
    } else if (best.type === 'i') {
      parts.push(<em key={`i-${key++}`} className="italic text-aletis-grafite-medio dark:text-white/70">{best.match[1]}</em>)
    } else if (best.type === 'code') {
      parts.push(
        <code key={`c-${key++}`} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-aletis-grafite-escuro dark:text-white/90 text-[0.88em] font-mono">
          {best.match[1]}
        </code>,
      )
    } else if (best.type === 'link') {
      parts.push(
        <a
          key={`l-${key++}`}
          href={best.match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-aletis-verde hover:underline"
        >
          {best.match[1]}
        </a>,
      )
    }
    remaining = remaining.slice(idx + best.match[0].length)
  }
  return parts
}

/** Detecta se a linha é um separador de tabela `|---|---|` */
function isTableSeparator(line: string): boolean {
  const t = line.trim()
  if (!t.startsWith('|')) return false
  return /^\|(\s*:?-+:?\s*\|)+\s*$/.test(t)
}

/** Parse célula a partir de uma linha `| a | b | c |`. */
function parseTableRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return t.split('|').map((c) => c.trim())
}

function renderContent(content: string | undefined | null): React.ReactNode {
  if (content == null || typeof content !== 'string') {
    return <span className="text-aletis-grafite-medio dark:text-white/50 italic">(sem conteúdo)</span>
  }
  if (content.length === 0) {
    return <span className="text-aletis-grafite-medio dark:text-white/50 italic">(resposta vazia)</span>
  }
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Linha vazia → separador (pula sequências de linhas vazias, 1 <br>)
    if (!trimmed) {
      // colapsa múltiplas vazias — só emite um gap
      let emitted = false
      while (i < lines.length && !lines[i].trim()) {
        if (!emitted) { blocks.push(<div key={`gap-${key++}`} className="h-2" />); emitted = true }
        i++
      }
      continue
    }

    // Header (# ## ###)
    const h = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (h) {
      const level = h[1].length
      const txt = h[2]
      const size = level === 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-sm'
      blocks.push(
        <div key={`h-${key++}`} className={`${size} font-semibold text-aletis-grafite-escuro dark:text-white mt-2 mb-1`}>
          {renderInline(txt)}
        </div>,
      )
      i++
      continue
    }

    // Horizontal rule
    if (/^-{3,}$|^_{3,}$|^\*{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${key++}`} className="my-2 border-aletis-borda dark:border-white/10" />)
      i++
      continue
    }

    // Tabela: linha começa com `|`, próxima é separador
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = parseTableRow(lines[i])
      i += 2 // pula header + separador
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|') && !isTableSeparator(lines[i])) {
        rows.push(parseTableRow(lines[i]))
        i++
      }
      blocks.push(
        <div key={`tbl-${key++}`} className="my-2 overflow-x-auto rounded-lg border border-aletis-borda dark:border-white/10">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-aletis-bege/40 dark:bg-white/[0.04]">
              <tr>
                {header.map((c, ci) => (
                  <th key={ci} className="px-3 py-2 text-left font-semibold text-aletis-grafite-escuro dark:text-white border-b border-aletis-borda dark:border-white/10">
                    {renderInline(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b last:border-b-0 border-aletis-borda/60 dark:border-white/5">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-aletis-grafite-escuro dark:text-white/85 align-top">
                      {renderInline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Lista ordenada/não-ordenada — agrupa sequência
    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/)
    const olMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/)
    if (ulMatch || olMatch) {
      const items: React.ReactNode[] = []
      const ordered = !!olMatch
      while (i < lines.length) {
        const l = lines[i].trim()
        const um = l.match(/^[-*•]\s+(.+)$/)
        const om = l.match(/^\d+[.)]\s+(.+)$/)
        if (!um && !om) break
        const txt = um ? um[1] : om![1]
        items.push(
          <li key={`li-${i}`} className="text-aletis-grafite-escuro dark:text-white/85 leading-relaxed">
            {renderInline(txt)}
          </li>,
        )
        i++
      }
      blocks.push(
        ordered
          ? <ol key={`ol-${key++}`} className="list-decimal pl-5 my-1 space-y-0.5">{items}</ol>
          : <ul key={`ul-${key++}`} className="list-disc pl-5 my-1 space-y-0.5">{items}</ul>,
      )
      continue
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const qLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        qLines.push(lines[i].trim().slice(2))
        i++
      }
      blocks.push(
        <blockquote key={`bq-${key++}`} className="border-l-2 border-aletis-verde/50 pl-3 my-2 text-aletis-grafite-medio dark:text-white/60 italic">
          {qLines.map((l, qi) => <div key={qi}>{renderInline(l)}</div>)}
        </blockquote>,
      )
      continue
    }

    // Parágrafo normal — agrupa linhas consecutivas como um bloco
    const paraLines: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('#') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('> ') &&
      !/^-{3,}$|^_{3,}$|^\*{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={`p-${key++}`} className="text-aletis-grafite-escuro dark:text-white/85 leading-relaxed">
        {paraLines.map((pl, pi) => (
          <React.Fragment key={pi}>
            {pi > 0 && <br />}
            {renderInline(pl)}
          </React.Fragment>
        ))}
      </p>,
    )
  }

  return <>{blocks}</>
}

// ────────────────────────────────────────────────────────────
// Quick actions
// ────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { icon: DollarSign, label: 'Dólar hoje', prompt: 'Qual o dólar hoje?' },
  { icon: TrendingUp, label: 'Soja', prompt: 'Quanto está a soja?' },
  { icon: Calculator, label: 'Selic', prompt: 'Selic atual' },
  { icon: Cloud, label: 'Clima', prompt: 'Clima em Uberlândia' },
  { icon: Users, label: 'Ailton Caeiro', prompt: 'Status do cliente Ailton Caeiro' },
  { icon: FileText, label: 'MCR 2-6-4', prompt: 'MCR 2-6-4' },
  { icon: Scale, label: 'Súmula 298', prompt: 'Súmula 298 STJ' },
]

// ────────────────────────────────────────────────────────────
// SSE helper — parses event-stream from POST /chat/stream
// ────────────────────────────────────────────────────────────

interface SSEHandlers {
  onToken?: (text: string) => void
  onTool?: (name: string) => void
  onDone?: (payload: { reply: ChatMessage; sessionId: string; sources?: string[]; toolsUsed?: string[] }) => void
  onError?: (err: string) => void
}

async function streamChat(
  body: Record<string, unknown>,
  handlers: SSEHandlers,
  signal?: AbortSignal,
): Promise<void> {
  // Timeout defensivo de 5min — ALIX pode levar minutos (Opus com thinking),
  // mas >5min indica travamento. Evita spinner infinito na UI.
  const internalCtl = new AbortController()
  const timeout = setTimeout(() => internalCtl.abort(new Error('stream-timeout-5min')), 5 * 60_000)
  const finalSignal = signal
    ? anyAbortSignal(signal, internalCtl.signal)
    : internalCtl.signal
  const startedAt = Date.now()
  let gotAnyEvent = false

  try {
    const res = await fetch('/api/alix/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: finalSignal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ao iniciar stream`)
    if (!res.body) throw new Error('Resposta sem body (streaming não suportado pelo navegador)')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Events are delimited by blank line (\n\n)
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        let event = 'message'
        let data = ''
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).trim()
        }
        if (!data) continue
        try {
          const payload = JSON.parse(data)
          gotAnyEvent = true
          if (event === 'token' && typeof payload.text === 'string') handlers.onToken?.(payload.text)
          else if (event === 'tool' && typeof payload.name === 'string') handlers.onTool?.(payload.name)
          else if (event === 'done') handlers.onDone?.(payload)
          else if (event === 'error') handlers.onError?.(payload.error || 'erro')
          // event === 'ping' é heartbeat — ignora silenciosamente
          // event === 'thinking' é status — ignora (ou pode ser tratado futuramente)
        } catch {
          // ignore malformed frame
        }
      }
    }
    // Conexão fechou sem evento nenhum = degrade silencioso
    if (!gotAnyEvent) {
      handlers.onError?.('conexão fechou sem resposta — tente de novo')
    }
  } catch (err) {
    const msg = (err as Error)?.message || 'falha no stream'
    if (msg.includes('stream-timeout')) {
      handlers.onError?.(`tempo esgotado (>5min) após ${Math.round((Date.now() - startedAt) / 1000)}s`)
    } else if (msg.includes('abort') || msg.includes('aborted')) {
      // cancelamento manual — não exibe erro
    } else {
      handlers.onError?.(msg)
    }
  } finally {
    clearTimeout(timeout)
  }
}

/** Compõe múltiplos AbortSignal em um só (polyfill para navegadores sem AbortSignal.any). */
function anyAbortSignal(...signals: AbortSignal[]): AbortSignal {
  // Usa AbortSignal.any se disponível (Chrome 116+, FF 124+)
  if ('any' in AbortSignal && typeof (AbortSignal as any).any === 'function') {
    return (AbortSignal as any).any(signals)
  }
  const ctl = new AbortController()
  for (const s of signals) {
    if (s.aborted) { ctl.abort(s.reason); break }
    s.addEventListener('abort', () => ctl.abort(s.reason), { once: true })
  }
  return ctl.signal
}

// ────────────────────────────────────────────────────────────
// Wave-PG-17: AlixStatsFooter — rodapé da sidebar com stats PG
// (NPS agregado + confirmations pendentes). Auto-refresh 30s.
// ────────────────────────────────────────────────────────────
function AlixStatsFooter() {
  const [stats, setStats] = useState<{ total: number; positive: number; negative: number; neutral: number } | null>(null)
  const [pendentes, setPendentes] = useState<number>(0)

  const carregar = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        fetch('/api/alix/feedback/stats').then((r) => r.json()).catch(() => null),
        fetch('/api/alix/confirmations/pendentes').then((r) => r.json()).catch(() => null),
      ])
      if (s?.success) setStats(s.data)
      if (p?.success && Array.isArray(p.data)) setPendentes(p.data.length)
    } catch { /* swallow */ }
  }, [])

  useEffect(() => {
    void carregar()
    const id = setInterval(() => void carregar(), 30_000)
    return () => clearInterval(id)
  }, [carregar])

  if (!stats || stats.total === 0 && pendentes === 0) {
    // Estado vazio — escondemos o footer pra não poluir.
    return null
  }

  const npsPct = stats.total > 0 ? Math.round((stats.positive / stats.total) * 100) : null

  return (
    <div className="border-t border-aletis-borda px-3 py-2 bg-aletis-bege/30">
      <p className="text-[10px] uppercase tracking-wide text-aletis-grafite-medio mb-1">PG · Postgres</p>
      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <div className="text-center">
          <p className="text-aletis-grafite-claro">NPS</p>
          <p className="font-semibold text-aletis-grafite-escuro tabular-nums">
            {npsPct == null ? '—' : `${npsPct}%`}
          </p>
        </div>
        <div className="text-center">
          <p className="text-aletis-grafite-claro">Feedbacks</p>
          <p className="font-semibold text-aletis-grafite-escuro tabular-nums">{stats.total}</p>
        </div>
        <div className="text-center">
          <p className="text-aletis-grafite-claro">Pend.</p>
          <p className={`font-semibold tabular-nums ${pendentes > 0 ? 'text-amber-700' : 'text-aletis-grafite-escuro'}`}>
            {pendentes}
          </p>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

export default function ALIX() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_SESSION_KEY) } catch { return null }
  })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Wave 10 state
  const [attachments, setAttachments] = useState<AttachmentChip[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [clientes, setClientes] = useState<ClienteLite[]>([])
  const [activeClienteId, setActiveClienteId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_CLIENTE_KEY) } catch { return null }
  })
  const [clienteMenuOpen, setClienteMenuOpen] = useState(false)
  const [clienteSearch, setClienteSearch] = useState('')
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [briefingExpanded, setBriefingExpanded] = useState(true)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [memoryMd, setMemoryMd] = useState<string | null>(null)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [streamEnabled, setStreamEnabled] = useState<boolean>(() => {
    // Default true: streaming entrega tokens em tempo real e tem fallback
    // robusto. localStorage só desabilita se valor for explicitamente '0'.
    try {
      const v = localStorage.getItem(STREAM_KEY)
      return v === null ? true : v === '1'
    } catch { return true }
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropCounterRef = useRef(0)

  const activeCliente = clientes.find((c) => c.id === activeClienteId) || null
  const activeClienteLabel = activeCliente?.nome
    || briefing?.clienteNome
    || (activeClienteId ? `Cliente: ${activeClienteId}` : null)

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

  // Load active session messages
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([])
      return
    }
    let cancelled = false
    setIsLoadingSession(true)
    apiFetch<ChatSession>(`/alix/session/${activeSessionId}`)
      .then((session) => {
        if (cancelled) return
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
      .catch(() => {
        if (!cancelled) {
          setActiveSessionId(null)
          try { localStorage.removeItem(ACTIVE_SESSION_KEY) } catch { /* ignore */ }
        }
      })
      .finally(() => { if (!cancelled) setIsLoadingSession(false) })
    return () => { cancelled = true }
  }, [activeSessionId])

  // Load briefing when clienteId changes
  useEffect(() => {
    if (!activeClienteId) {
      setBriefing(null)
      return
    }
    let cancelled = false
    apiFetch<Briefing>(`/alix/briefing/${encodeURIComponent(activeClienteId)}`)
      .then((b) => { if (!cancelled) setBriefing(b) })
      .catch(() => { if (!cancelled) setBriefing(null) })
    return () => { cancelled = true }
  }, [activeClienteId])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isTyping])

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
    try { localStorage.setItem(STREAM_KEY, streamEnabled ? '1' : '0') } catch { /* ignore */ }
  }, [streamEnabled])

  // ── Helpers ─────────────────────────────────────────────

  const refreshSessions = useCallback(async () => {
    try {
      const list = await apiFetch<SessionSummary[]>('/alix/sessions')
      setSessions(list || [])
    } catch { /* ignore */ }
  }, [])

  const ensureSession = useCallback(async (): Promise<string> => {
    if (activeSessionId) return activeSessionId
    const created = await apiFetch<ChatSession>('/alix/session', {
      method: 'POST',
      body: JSON.stringify({ title: 'Nova conversa' }),
    })
    setActiveSessionId(created.id)
    return created.id
  }, [activeSessionId])

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
      const res = await fetch(`/api/alix/documents/upload?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'POST',
        body: form,
      })
      const json = await res.json()
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
      } : a))
    } catch (err) {
      const msg = (err as Error).message
      setAttachments((prev) => prev.map((a) => a.id === tempId ? { ...a, uploading: false, error: msg } : a))
      // Mantém chip com erro pro usuário remover manualmente
    }
  }, [])

  const handleFilePick = useCallback(async (files: FileList | File[]): Promise<void> => {
    const list = Array.from(files)
    if (list.length === 0) return
    const MAX = 20 * 1024 * 1024
    const valid = list.filter((f) => {
      if (f.size > MAX) {
        setAttachments((prev) => [...prev, {
          id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          filename: f.name,
          kind: kindFromFilename(f.name, f.type),
          sizeBytes: f.size,
          uploading: false,
          error: 'Acima de 20 MB',
        }])
        return false
      }
      return true
    })
    if (valid.length === 0) return

    const sid = await ensureSession()
    await Promise.all(valid.map((f) => uploadFile(f, sid)))
  }, [ensureSession, uploadFile])

  const handleRemoveAttachment = useCallback(async (id: string): Promise<void> => {
    const chip = attachments.find((a) => a.id === id)
    setAttachments((prev) => prev.filter((a) => a.id !== id))
    if (!chip || chip.error || !activeSessionId) return
    // Fire and forget — deleção server-side é best-effort
    fetch(`/api/alix/documents/${encodeURIComponent(activeSessionId)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => { /* ignore */ })
  }, [attachments, activeSessionId])

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

  // ── Chat send ────────────────────────────────────────────

  const handleSend = useCallback(async (textOverride?: string): Promise<void> => {
    const text = (textOverride ?? input).trim()
    if ((!text && attachments.length === 0) || isTyping) return

    // Mensagens pendentes (com erro de upload) não vão
    const readyAttachments = attachments.filter((a) => !a.uploading && !a.error)
    const attachmentIds = readyAttachments.map((a) => a.id)

    const userMsg: ChatMessage = {
      id: `local-u-${Date.now()}`,
      role: 'user',
      content: text || '(arquivos enviados)',
      timestamp: Date.now(),
      metadata: attachmentIds.length > 0 ? { attachments: readyAttachments.map((a) => ({ id: a.id, filename: a.filename, kind: a.kind })) } : undefined,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    const body = {
      sessionId: activeSessionId || undefined,
      message: text || 'Revise os documentos anexados e me traga os destaques.',
      attachments: attachmentIds.length > 0 ? attachmentIds : undefined,
      clienteId: activeClienteId || undefined,
    }

    // Só limpa os chips que foram efetivamente enviados; mantém os com erro
    setAttachments((prev) => prev.filter((a) => a.error || a.uploading))

    try {
      if (streamEnabled) {
        // Streaming path — vai agregando tokens num reply placeholder
        const placeholderId = `stream-${Date.now()}`
        let agg = ''
        const toolsAgg: string[] = []
        setMessages((prev) => [...prev, {
          id: placeholderId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          toolsUsed: [],
        }])
        await streamChat(body, {
          onTool: (name) => {
            try {
              toolsAgg.push(name)
              // Se o placeholder foi wiped por race com useEffect(session refetch),
              // re-adiciona com toolsUsed atualizado.
              setMessages((prev) => {
                const has = prev.some((m) => m.id === placeholderId)
                if (has) return prev.map((m) => m.id === placeholderId ? { ...m, toolsUsed: [...(m.toolsUsed || []), name] } : m)
                return [...prev, { id: placeholderId, role: 'assistant', content: agg, timestamp: Date.now(), toolsUsed: [...toolsAgg] } as ChatMessage]
              })
            } catch { /* ignora handler error */ }
          },
          onToken: (t) => {
            try {
              agg += t
              setMessages((prev) => {
                const has = prev.some((m) => m.id === placeholderId)
                if (has) return prev.map((m) => m.id === placeholderId ? { ...m, content: agg } : m)
                return [...prev, { id: placeholderId, role: 'assistant', content: agg, timestamp: Date.now(), toolsUsed: [...toolsAgg] } as ChatMessage]
              })
            } catch { /* ignora handler error */ }
          },
          onDone: (payload) => {
            try {
              // Normaliza payload.reply defensivamente — backend pode enviar
              // formato inesperado, e não queremos que isso quebre o React.
              // Fallback explícito para `agg` evita "(sem conteúdo)" quando
              // payload.reply.content vem vazio mas o stream entregou tokens.
              const fallbackContent = agg || '(resposta vazia)'
              const incomingContent = typeof payload?.reply?.content === 'string' && payload.reply.content.length > 0
                ? payload.reply.content
                : fallbackContent
              const safeReply: ChatMessage = (payload?.reply && typeof payload.reply === 'object')
                ? {
                    id: payload.reply.id || placeholderId,
                    role: payload.reply.role || 'assistant',
                    content: incomingContent,
                    timestamp: payload.reply.timestamp || Date.now(),
                    toolsUsed: Array.isArray(payload.reply.toolsUsed) ? payload.reply.toolsUsed : toolsAgg,
                    metadata: payload.reply.metadata,
                    sources: Array.isArray(payload.reply.sources) ? payload.reply.sources : [],
                  }
                : {
                    id: placeholderId,
                    role: 'assistant',
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
              if (payload?.sessionId && (!activeSessionId || activeSessionId !== payload.sessionId)) {
                setActiveSessionId(payload.sessionId)
              }
              refreshSessions()
            } catch (err) {
              console.warn('[ALIX] onDone handler falhou:', err)
            }
          },
          onError: (errMsg) => {
            setMessages((prev) => prev.map((m) => m.id === placeholderId ? { ...m, content: `Erro no stream: ${errMsg}` } : m))
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
                  }
                : {
                    id: `assistant-${Date.now()}`,
                    role: 'assistant',
                    content: '(resposta vazia)',
                    timestamp: Date.now(),
                  })
        setMessages((prev) => [...prev, normalizedReply])
        if (!activeSessionId || activeSessionId !== resp.sessionId) {
          setActiveSessionId(resp.sessionId)
        }
        refreshSessions()
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Erro ao contatar ALIX: ${(err as Error).message}. Tenta de novo?`,
        timestamp: Date.now(),
      }])
    } finally {
      setIsTyping(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, attachments, isTyping, activeSessionId, activeClienteId, streamEnabled, refreshSessions])

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null)
    setMessages([])
    setAttachments([])
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id)
    setAttachments([])
    setInput('')
  }, [])

  const handleDeleteSession = useCallback(async (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!window.confirm('Apagar essa conversa? Não dá pra recuperar.')) return
    try {
      await apiFetch(`/alix/session/${id}`, { method: 'DELETE' })
      if (activeSessionId === id) {
        setActiveSessionId(null)
        setMessages([])
      }
      refreshSessions()
    } catch (err) {
      alert(`Erro ao apagar: ${(err as Error).message}`)
    }
  }, [activeSessionId, refreshSessions])

  const handleCopy = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }, [])

  const handleOpenMemory = useCallback(async () => {
    if (!activeClienteId) return
    setMemoryOpen(true)
    setMemoryLoading(true)
    setMemoryMd(null)
    try {
      const res = await apiFetch<{ markdown: string }>(`/alix/memory/${encodeURIComponent(activeClienteId)}`)
      setMemoryMd(res?.markdown || '_(memória vazia)_')
    } catch (err) {
      setMemoryMd(`_Erro: ${(err as Error).message}_`)
    } finally {
      setMemoryLoading(false)
    }
  }, [activeClienteId])

  // ── Render ──────────────────────────────────────────────

  const showWelcome = !activeSessionId && messages.length === 0 && attachments.length === 0
  const anyUploading = attachments.some((a) => a.uploading)
  const anyReady = attachments.some((a) => !a.uploading && !a.error)
  const sendDisabled = isTyping || anyUploading || (!input.trim() && !anyReady)

  const filteredClientes = clienteSearch.trim()
    ? clientes.filter((c) => c.nome.toLowerCase().includes(clienteSearch.toLowerCase()) || c.id.toLowerCase().includes(clienteSearch.toLowerCase()))
    : clientes

  return (
    <div
      className="h-[calc(100vh-140px)] flex gap-4 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag-drop overlay */}
      {dragActive && (
        <div className="absolute inset-0 z-50 bg-aletis-verde/10 backdrop-blur-sm border-2 border-dashed border-aletis-verde rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex items-center gap-3">
            <Paperclip className="w-6 h-6 text-aletis-verde" />
            <div className="text-base font-semibold text-aletis-grafite-escuro">Solte os arquivos pra enviar à Alix</div>
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
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setMemoryOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-aletis-borda">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-aletis-verde" />
                <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">
                  Memória — {activeClienteLabel || activeClienteId}
                </h2>
              </div>
              <button
                onClick={() => setMemoryOpen(false)}
                className="p-1.5 rounded-lg text-aletis-grafite-claro hover:text-aletis-grafite-escuro hover:bg-aletis-bege"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {memoryLoading ? (
                <div className="flex items-center gap-2 text-aletis-grafite-medio">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Carregando memória…</span>
                </div>
              ) : (
                <pre className="text-xs font-mono text-aletis-grafite-escuro whitespace-pre-wrap leading-relaxed">{memoryMd || '_(memória vazia)_'}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - Sessions */}
      {sidebarOpen && (
        <aside className="w-64 flex-shrink-0 bg-white rounded-2xl border border-aletis-borda shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-aletis-borda flex items-center justify-between">
            <span className="text-xs font-semibold text-aletis-grafite-medio uppercase tracking-wide">Conversas</span>
            <button
              onClick={handleNewSession}
              className="p-1.5 rounded-lg bg-aletis-verde text-white hover:bg-aletis-verde-escuro transition-colors"
              title="Nova conversa"
              aria-label="Nova conversa"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {sessions.length === 0 ? (
              <div className="p-4 text-xs text-aletis-grafite-claro">Nenhuma conversa ainda. Mande uma pergunta.</div>
            ) : (
              sessions.map((s) => {
                const active = s.id === activeSessionId
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectSession(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handleSelectSession(s.id)
                      }
                    }}
                    className={`w-full text-left p-3 border-b border-aletis-borda/50 transition-colors group cursor-pointer focus:outline-none focus:ring-2 focus:ring-aletis-dourado/40 ${
                      active ? 'bg-aletis-bege' : 'hover:bg-aletis-bege/50'
                    }`}
                    aria-pressed={active}
                    aria-label={`Abrir conversa ${s.title}`}
                  >
                    <div className="flex items-start gap-2">
                      <MessageSquare className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${active ? 'text-aletis-verde' : 'text-aletis-grafite-claro'}`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-semibold truncate ${active ? 'text-aletis-verde-escuro' : 'text-aletis-grafite-escuro'}`}>
                          {s.title}
                        </div>
                        <div className="text-[10px] text-aletis-grafite-claro flex items-center gap-1.5 mt-0.5">
                          <span>{s.messageCount} msg</span>
                          <span>•</span>
                          <span>{timeAgo(s.updatedAt)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-aletis-grafite-claro hover:text-alerta transition-opacity"
                        title="Deletar"
                        aria-label="Deletar conversa"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2 rounded-lg text-aletis-grafite-claro hover:text-aletis-grafite-escuro hover:bg-aletis-bege transition-colors"
              title={sidebarOpen ? 'Ocultar conversas' : 'Mostrar conversas'}
              aria-label="Alternar barra lateral"
            >
              <ChevronRight className={`w-4 h-4 transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-aletis-verde to-aletis-verde-escuro flex items-center justify-center shadow-md">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-aletis-grafite-escuro leading-tight">ALIX</h1>
              <p className="text-aletis-grafite-medio text-sm font-body">
                Agente de Leitura e Inteligência Estratégica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Cliente selector */}
            <div className="relative">
              <button
                onClick={() => setClienteMenuOpen((v) => !v)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  activeClienteId
                    ? 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro'
                    : 'bg-white border border-aletis-borda text-aletis-grafite-medio hover:bg-aletis-bege'
                }`}
                title={activeClienteLabel ? `Cliente ativo: ${activeClienteLabel}` : 'Selecionar cliente ativo'}
              >
                <UserCircle2 className="w-3.5 h-3.5" />
                <span className="max-w-[180px] truncate">{activeClienteLabel || 'Sem cliente ativo'}</span>
              </button>
              {clienteMenuOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-aletis-borda z-30 overflow-hidden">
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
                      onClick={() => {
                        setActiveClienteId(null)
                        setClienteMenuOpen(false)
                        setClienteSearch('')
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-aletis-grafite-claro hover:bg-aletis-bege border-b border-aletis-borda/50"
                    >
                      Limpar cliente ativo
                    </button>
                    {filteredClientes.length === 0 ? (
                      <div className="p-4 text-xs text-aletis-grafite-claro">Nenhum cliente.</div>
                    ) : (
                      filteredClientes.slice(0, 50).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setActiveClienteId(c.id)
                            setClienteMenuOpen(false)
                            setClienteSearch('')
                          }}
                          className={`w-full text-left px-3 py-2 text-xs border-b border-aletis-borda/30 hover:bg-aletis-bege ${
                            c.id === activeClienteId ? 'bg-aletis-bege font-semibold text-aletis-verde-escuro' : 'text-aletis-grafite-escuro'
                          }`}
                        >
                          <div className="truncate">{c.nome}</div>
                          <div className="text-[10px] text-aletis-grafite-claro font-mono truncate">{c.id}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Stream toggle */}
            <button
              onClick={() => setStreamEnabled((v) => !v)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                streamEnabled
                  ? 'bg-aletis-dourado/20 text-aletis-dourado border border-aletis-dourado/40'
                  : 'bg-white border border-aletis-borda text-aletis-grafite-claro hover:text-aletis-grafite-escuro'
              }`}
              title="Streaming progressivo de tokens (SSE)"
            >
              <Zap className="w-3 h-3" />
              Stream
            </button>

            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-positivo/10 text-positivo text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-positivo animate-pulse" />
              Servidor
            </span>
          </div>
        </div>

        {/* Briefing panel */}
        {briefing && (
          <div className="mb-4 bg-white rounded-2xl border border-aletis-borda shadow-sm overflow-hidden">
            <button
              onClick={() => setBriefingExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-aletis-bege/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <UserCircle2 className="w-4 h-4 text-aletis-verde flex-shrink-0" />
                <span className="text-xs font-semibold text-aletis-grafite-escuro truncate">
                  Briefing — {briefing.clienteNome}
                </span>
                <span className="text-[10px] text-aletis-grafite-claro truncate">
                  {briefing.sugestaoPrimeiraAcao}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); handleOpenMemory() }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleOpenMemory() } }}
                  className="text-[10px] font-semibold text-aletis-verde hover:text-aletis-verde-escuro cursor-pointer"
                >
                  Ver memória
                </span>
                <ChevronRight className={`w-3.5 h-3.5 text-aletis-grafite-claro transition-transform ${briefingExpanded ? 'rotate-90' : ''}`} />
              </div>
            </button>
            {briefingExpanded && (
              <div className="px-4 pb-4 pt-1 space-y-3">
                {briefing.resumoExecutivo && (
                  <div className="text-xs text-aletis-grafite-medio leading-relaxed">{briefing.resumoExecutivo}</div>
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
                        <span key={i} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border ${color}`} title={d.detalhe}>
                          {d.severidade === 'critico' && <AlertTriangle className="w-3 h-3" />}
                          {d.titulo}
                        </span>
                      )
                    })}
                  </div>
                )}
                {briefing.proximasAcoes.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-aletis-grafite-claro">Próximas ações</div>
                    {briefing.proximasAcoes.slice(0, 4).map((a, i) => (
                      <div key={i} className="text-xs text-aletis-grafite-escuro leading-relaxed flex gap-1.5">
                        <span className="text-aletis-verde">•</span>
                        <span>{a}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Chat container */}
        <div className="flex-1 bg-white rounded-2xl border border-aletis-borda shadow-sm flex flex-col overflow-hidden">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {isLoadingSession && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-aletis-grafite-claro" />
              </div>
            )}

            {showWelcome && !isLoadingSession && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-aletis-bege text-aletis-grafite-escuro border border-aletis-borda/50">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded-full bg-aletis-dourado flex items-center justify-center">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-aletis-dourado">ALIX</span>
                  </div>
                  <div className="text-sm leading-relaxed font-body">
                    {greetingByTime()} Christian. ALIX aqui — pergunta em linguagem natural, anexa PDF/XLSX/imagem, escolhe cliente ativo pra eu puxar a memória dele e gerar propostas/pareceres/fluxos de caixa reais com um pedido só.
                  </div>
                </div>
              </div>
            )}

            {messages.filter((msg) => msg && typeof msg === 'object' && (msg.role === 'user' || msg.role === 'assistant')).map((msg) => {
              const isUser = msg.role === 'user'
              const docs = isUser ? [] : extractDocumentsFromMessage(msg)
              const userAttachments = isUser && msg.metadata && Array.isArray((msg.metadata as any).attachments)
                ? (msg.metadata as any).attachments as Array<{ id: string; filename: string; kind: string }>
                : []
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                  <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3 ${
                    isUser
                      ? 'bg-aletis-verde text-white rounded-br-md'
                      : 'bg-aletis-bege text-aletis-grafite-escuro rounded-bl-md border border-aletis-borda/50'
                  }`}>
                    {!isUser && (
                      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-aletis-borda/40">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="w-5 h-5 rounded-full bg-aletis-dourado flex items-center justify-center">
                            <Bot className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-aletis-dourado">ALIX</span>
                          {msg.intent && (
                            <span className="text-[10px] text-aletis-grafite-claro font-mono">• {msg.intent}</span>
                          )}
                          {/* Alix Insano — indicator do sub-agente que respondeu */}
                          <SubagentIndicator active={detectLastSubagent(msg.toolsUsed)} />
                        </div>
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="opacity-0 group-hover:opacity-100 text-aletis-grafite-claro hover:text-aletis-grafite-escuro transition-opacity"
                          title="Copiar"
                          aria-label="Copiar resposta"
                        >
                          {copiedId === msg.id
                            ? <Check className="w-3.5 h-3.5 text-positivo" />
                            : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                    {userAttachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {userAttachments.map((a) => {
                          const Icon = iconForKind((a.kind as AttachmentChip['kind']) || 'unknown')
                          return (
                            <span key={a.id} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/20 border border-white/30 text-white">
                              <Icon className="w-3 h-3" />
                              <span className="max-w-[160px] truncate">{a.filename}</span>
                            </span>
                          )
                        })}
                      </div>
                    )}
                    <div className="text-sm leading-relaxed whitespace-pre-wrap font-body">
                      <MessageErrorBoundary content={msg.content}>
                        {renderContent(msg.content)}
                      </MessageErrorBoundary>
                    </div>
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
                                <span className="text-[10px] opacity-80">{formatBytes(d.sizeBytes)}</span>
                              )}
                              <Download className="w-3 h-3 ml-1" />
                            </a>
                          )
                        })}
                      </div>
                    )}
                    {!isUser && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-aletis-borda/40 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-body text-aletis-grafite-claro uppercase tracking-wide">Fontes:</span>
                        {msg.sources.map((s, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white border border-aletis-borda text-aletis-grafite-medio"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="max-w-[75%] rounded-2xl px-5 py-3 bg-aletis-bege border border-aletis-borda/50 rounded-bl-md">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-5 h-5 rounded-full bg-aletis-dourado flex items-center justify-center">
                      <Bot className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-aletis-dourado">ALIX</span>
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

          {/* Attachment chips */}
          {/* Alix Insano — painel de pending confirmations + batches (SSE stream) */}
          <div className="px-4 pt-3 border-t border-aletis-borda bg-zinc-950">
            <AlixConfirmationsPanel />
          </div>

          {attachments.length > 0 && (
            <div className="px-4 pt-3 border-t border-aletis-borda bg-aletis-bege/30 flex flex-wrap gap-2">
              {attachments.map((a) => {
                const Icon = iconForKind(a.kind)
                return (
                  <span
                    key={a.id}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      a.error
                        ? 'bg-alerta/10 text-alerta border-alerta/30'
                        : a.uploading
                        ? 'bg-white text-aletis-grafite-medio border-aletis-borda'
                        : 'bg-white text-aletis-grafite-escuro border-aletis-verde/40'
                    }`}
                  >
                    {a.uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
                    <span className="max-w-[180px] truncate">{a.filename}</span>
                    <span className="text-[10px] text-aletis-grafite-claro font-mono">{formatBytes(a.sizeBytes)}</span>
                    {a.error && <span className="text-[10px] text-alerta">{a.error}</span>}
                    <button
                      onClick={() => handleRemoveAttachment(a.id)}
                      className="text-aletis-grafite-claro hover:text-alerta"
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

          {/* Input bar */}
          <div className="border-t border-aletis-borda p-4">
            <div className="flex gap-2 items-end">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isTyping}
                className="p-2.5 rounded-xl border border-aletis-borda text-aletis-grafite-medio hover:text-aletis-verde hover:border-aletis-verde transition-colors disabled:opacity-50"
                title="Anexar arquivo (PDF, Word, Excel, imagem)"
                aria-label="Anexar arquivo"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                disabled={isTyping}
                placeholder={attachments.length > 0 ? 'Pergunta sobre os arquivos…' : 'Pergunta em linguagem natural…'}
                className="input-field flex-1 disabled:opacity-60"
                aria-label="Mensagem para ALIX"
              />
              <button
                onClick={() => handleSend()}
                disabled={sendDisabled}
                className="btn-primary px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                aria-label="Enviar"
              >
                {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-3 overflow-x-auto custom-scrollbar pb-1">
              {QUICK_ACTIONS.map((q) => {
                const Icon = q.icon
                return (
                  <button
                    key={q.label}
                    onClick={() => handleSend(q.prompt)}
                    disabled={isTyping}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-aletis-borda text-aletis-grafite-medio hover:bg-aletis-verde hover:text-white hover:border-aletis-verde transition-all disabled:opacity-50"
                  >
                    <Icon className="w-3 h-3" />
                    {q.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
