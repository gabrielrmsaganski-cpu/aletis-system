/**
 * ALIX (Agente de Leitura e Inteligência Estratégica)
 *
 * Interface de chat com a IA ALIX do sistema ALETIS. Gerencia
 * sessoes de conversa persistidas no backend (/alix/sessions),
 * envia perguntas em linguagem natural e exibe respostas com
 * fontes citadas (BCB, Conab, ANP, NASA FIRMS, CRM, sumulas
 * STJ, MCR, Plano Safra) e renderizacao markdown-lite. Inclui
 * acoes rapidas pre-configuradas (Dolar, Soja, Selic, Clima).
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
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

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

// ────────────────────────────────────────────────────────────
// Local state keys (only the active session ID is persisted locally)
// ────────────────────────────────────────────────────────────

const ACTIVE_SESSION_KEY = 'aletis:alix:activeSession'

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

// ────────────────────────────────────────────────────────────
// Markdown-lite renderer (matches server output style)
// ────────────────────────────────────────────────────────────

function renderContent(content: string): React.ReactNode {
  const lines = content.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />
        const parts: React.ReactNode[] = []
        let remaining = line
        let key = 0
        while (remaining.length > 0) {
          const bold = remaining.match(/\*\*(.+?)\*\*/)
          const italic = remaining.match(/_([^_]+)_/)
          const first =
            bold && italic
              ? bold.index! < italic.index! ? { match: bold, type: 'b' as const } : { match: italic, type: 'i' as const }
              : bold ? { match: bold, type: 'b' as const }
              : italic ? { match: italic, type: 'i' as const }
              : null
          if (!first) {
            parts.push(<span key={`t-${key++}`}>{remaining}</span>)
            break
          }
          if (first.match.index! > 0) parts.push(<span key={`t-${key++}`}>{remaining.slice(0, first.match.index)}</span>)
          if (first.type === 'b') parts.push(<strong key={`b-${key++}`} className="font-semibold text-aletis-grafite-escuro">{first.match[1]}</strong>)
          else parts.push(<em key={`i-${key++}`} className="italic text-aletis-grafite-medio">{first.match[1]}</em>)
          remaining = remaining.slice(first.match.index! + first.match[0].length)
        }
        return <div key={i}>{parts}</div>
      })}
    </>
  )
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Initial load: fetch all sessions; if active ID persists, load that session
  useEffect(() => {
    let cancelled = false
    apiFetch<SessionSummary[]>('/alix/sessions')
      .then((list) => {
        if (cancelled) return
        setSessions(list || [])
      })
      .catch((err) => console.warn('[ALIX] listar sessoes falhou:', err.message))
    return () => { cancelled = true }
  }, [])

  // Load active session messages when id changes
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
        setMessages(session?.messages || [])
      })
      .catch(() => {
        if (cancelled) return
        setActiveSessionId(null)
        try { localStorage.removeItem(ACTIVE_SESSION_KEY) } catch { /* ignore */ }
      })
      .finally(() => { if (!cancelled) setIsLoadingSession(false) })
    return () => { cancelled = true }
  }, [activeSessionId])

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, isTyping])

  // Persist active session id
  useEffect(() => {
    try {
      if (activeSessionId) localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId)
      else localStorage.removeItem(ACTIVE_SESSION_KEY)
    } catch { /* ignore */ }
  }, [activeSessionId])

  // ── Helpers ─────────────────────────────────────────────

  const refreshSessions = useCallback(async () => {
    try {
      const list = await apiFetch<SessionSummary[]>('/alix/sessions')
      setSessions(list || [])
    } catch { /* ignore */ }
  }, [])

  const handleSend = useCallback(async (textOverride?: string) => {
    const text = (textOverride ?? input).trim()
    if (!text || isTyping) return

    const userMsg: ChatMessage = {
      id: `local-u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    try {
      const resp = await apiFetch<ChatResponse>('/alix/chat', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeSessionId || undefined,
          message: text,
        }),
      })
      setMessages((prev) => [...prev, resp.reply])
      if (!activeSessionId || activeSessionId !== resp.sessionId) {
        setActiveSessionId(resp.sessionId)
      }
      refreshSessions()
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
  }, [input, isTyping, activeSessionId, refreshSessions])

  const handleNewSession = useCallback(() => {
    setActiveSessionId(null)
    setMessages([])
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleSelectSession = useCallback((id: string) => {
    setActiveSessionId(id)
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

  // ── Render ──────────────────────────────────────────────

  const showWelcome = !activeSessionId && messages.length === 0

  return (
    <div className="h-[calc(100vh-140px)] flex gap-4">
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
                  <button
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    className={`w-full text-left p-3 border-b border-aletis-borda/50 transition-colors group ${
                      active ? 'bg-aletis-bege' : 'hover:bg-aletis-bege/50'
                    }`}
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
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-aletis-grafite-claro hover:text-alerta transition-opacity"
                        title="Deletar"
                        aria-label="Deletar conversa"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </button>
                )
              })
            )}
          </div>
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

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-positivo/10 text-positivo text-xs font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-positivo animate-pulse" />
              Servidor
            </span>
          </div>
        </div>

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
                    {greetingByTime()} Christian. ALIX aqui — pergunta em linguagem natural, eu consulto dados ao vivo (BCB, Conab, ANP, NASA FIRMS, CRM), súmulas STJ, MCR e Plano Safra. Tudo com citação de fonte.
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg) => {
              const isUser = msg.role === 'user'
              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                  <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3 ${
                    isUser
                      ? 'bg-aletis-verde text-white rounded-br-md'
                      : 'bg-aletis-bege text-aletis-grafite-escuro rounded-bl-md border border-aletis-borda/50'
                  }`}>
                    {!isUser && (
                      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-aletis-borda/40">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-aletis-dourado flex items-center justify-center">
                            <Bot className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-aletis-dourado">ALIX</span>
                          {msg.intent && (
                            <span className="text-[10px] text-aletis-grafite-claro font-mono">• {msg.intent}</span>
                          )}
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
                    <div className="text-sm leading-relaxed whitespace-pre-wrap font-body">
                      {renderContent(msg.content)}
                    </div>
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

          {/* Input bar */}
          <div className="border-t border-aletis-borda p-4">
            <div className="flex gap-3 items-end">
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
                placeholder="Pergunta em linguagem natural..."
                className="input-field flex-1 disabled:opacity-60"
                aria-label="Mensagem para ALIX"
              />
              <button
                onClick={() => handleSend()}
                disabled={isTyping || !input.trim()}
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
