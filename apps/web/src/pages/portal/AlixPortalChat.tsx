// ============================================================
// Portal — ALIX restrita: FAB + painel + streaming SSE.
// ============================================================
// Uma conversa por cliente, persistida no localStorage. Streaming
// token-a-token. ALIX só vê dados do próprio cliente; backend bloqueia
// qualquer tentativa de extrair dados de terceiros.
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MessageSquare,
  Send,
  X,
  Sparkles,
  Loader2,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import type { ClienteMe, PortalAlixSessionMessage } from './types'

interface Props {
  cliente: ClienteMe
  token: string
}

interface LocalMsg extends PortalAlixSessionMessage {
  /** Mensagem ainda streaming (último assistant). */
  streaming?: boolean
}

const STORAGE_KEY = (clienteId: string) => `aletis.portal.alix.session.${clienteId}`

export function AlixPortalChat({ cliente, token }: Props) {
  const [open, setOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<LocalMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Hidrata sessão do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY(cliente.id))
      if (raw) {
        const parsed = JSON.parse(raw) as { sessionId: string | null; messages: LocalMsg[] }
        setSessionId(parsed.sessionId ?? null)
        setMessages(parsed.messages ?? [])
      }
    } catch { /* corrupted, ignora */ }
  }, [cliente.id])

  // Persiste a cada mudança
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY(cliente.id),
        JSON.stringify({ sessionId, messages }),
      )
    } catch { /* quota cheia, ignora */ }
  }, [cliente.id, sessionId, messages])

  // Auto-scroll
  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, open, streaming])

  // Cancela stream ao desmontar
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const enviar = useCallback(async () => {
    const texto = input.trim()
    if (!texto || streaming) return
    setError(null)
    setInput('')

    const userMsg: LocalMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: texto,
      ts: Date.now(),
    }
    const assistantPlaceholder: LocalMsg = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      ts: Date.now(),
      streaming: true,
    }
    setMessages((prev) => [...prev, userMsg, assistantPlaceholder])
    setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const resp = await fetch('/api/portal/alix/stream', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ sessionId, message: texto }),
        signal: ctrl.signal,
      })
      if (!resp.ok || !resp.body) {
        const j = await resp.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error || `Erro ${resp.status}`)
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split(/\n\n/)
        buffer = events.pop() ?? ''
        for (const block of events) {
          processEvent(block)
        }
      }
      // flush
      if (buffer.length > 0) processEvent(buffer)
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Falha na conversa')
      setMessages((prev) =>
        prev.map((m) =>
          m.streaming ? { ...m, streaming: false, content: m.content || '(erro ao gerar resposta)' } : m,
        ),
      )
    } finally {
      setStreaming(false)
      abortRef.current = null
    }

    function processEvent(block: string) {
      if (!block.trim()) return
      const lines = block.split('\n')
      let event = 'message'
      const data: string[] = []
      for (const ln of lines) {
        if (ln.startsWith('event:')) event = ln.slice(6).trim()
        else if (ln.startsWith('data:')) data.push(ln.slice(5).trim())
      }
      const payload = data.join('\n')
      let json: unknown = null
      try { json = payload ? JSON.parse(payload) : null } catch { return }
      if (event === 'token') {
        const txt = (json as { text?: string })?.text ?? ''
        setMessages((prev) =>
          prev.map((m, idx) =>
            idx === prev.length - 1 && m.streaming ? { ...m, content: m.content + txt } : m,
          ),
        )
      } else if (event === 'done') {
        const id = (json as { sessionId?: string })?.sessionId
        if (id) setSessionId(id)
        setMessages((prev) =>
          prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
        )
      } else if (event === 'error') {
        const msg = (json as { error?: string })?.error || 'Erro'
        throw new Error(msg)
      }
    }
  }, [input, streaming, sessionId, token])

  const limpar = useCallback(async () => {
    abortRef.current?.abort()
    if (sessionId) {
      // Best-effort no backend
      fetch(`/api/portal/alix/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => { /* swallow */ })
    }
    setSessionId(null)
    setMessages([])
    setError(null)
  }, [sessionId, token])

  return (
    <>
      {/* FAB */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir chat com ALIX"
          className="fixed bottom-5 right-5 z-40 group flex items-center gap-2.5 rounded-full bg-aletis-verde shadow-2xl shadow-aletis-verde/40 hover:shadow-aletis-gold/40 transition-all px-4 py-3 hover:scale-105 active:scale-95"
        >
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-aletis-gold text-aletis-verde">
            <Sparkles size={14} />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-aletis-gold opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-aletis-gold" />
            </span>
          </span>
          <span className="font-display text-[12px] font-bold uppercase tracking-wider text-aletis-cream pr-1">
            Falar com ALIX
          </span>
        </button>
      )}

      {/* Painel */}
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 sm:bottom-5 sm:right-5 sm:inset-x-auto sm:max-w-[420px] sm:w-[420px]">
          <div className="bg-white border border-aletis-cream-escuro/70 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col h-[80vh] sm:h-[640px] max-h-[90vh] overflow-hidden">
            {/* Header */}
            <header className="bg-gradient-to-r from-aletis-verde-escuro to-aletis-verde px-4 py-3 flex items-center gap-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-aletis-gold flex items-center justify-center flex-shrink-0">
                <Sparkles size={16} className="text-aletis-verde" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-[13px] font-bold text-white leading-none">
                  ALIX no seu caso
                </p>
                <p className="font-body text-[11px] text-aletis-cream/75 mt-0.5">
                  Inteligência ALETIS · responde só sobre você
                </p>
              </div>
              <button
                type="button"
                onClick={limpar}
                disabled={streaming || messages.length === 0}
                className="p-1.5 rounded-lg text-aletis-cream/70 hover:text-aletis-gold disabled:opacity-30 transition"
                title="Apagar conversa"
                aria-label="Apagar conversa"
              >
                <Trash2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-aletis-cream/70 hover:text-white transition"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </header>

            {/* Histórico */}
            <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4 bg-aletis-cream-papel space-y-3">
              {messages.length === 0 && (
                <div className="text-center mt-8">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-aletis-gold/15 border border-aletis-gold/40 mb-3">
                    <Sparkles size={20} className="text-aletis-gold-escuro" />
                  </div>
                  <p className="font-display text-[14px] font-bold text-aletis-verde">
                    Olá, {cliente.nome.split(' ')[0]}!
                  </p>
                  <p className="mt-1 font-body text-[12.5px] text-aletis-verde-medio leading-relaxed max-w-[260px] mx-auto">
                    Posso ajudar com dúvidas sobre seu caso. Pergunte coisas como:
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {[
                      'Quanto eu ainda devo no total?',
                      'Quanto eu vou pagar de honorário ALETIS?',
                      'Como funciona o êxito sobre a economia?',
                      'O que é o documento que ainda está pendente?',
                    ].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setInput(q)}
                        className="block w-full text-left px-3 py-1.5 rounded-lg border border-aletis-cream-escuro bg-white hover:border-aletis-gold hover:bg-aletis-gold/5 transition font-body text-[12px] text-aletis-verde"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m) => (
                <Bubble key={m.id} msg={m} />
              ))}
              {error && (
                <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 flex items-start gap-2">
                  <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="font-body text-[12px] text-red-700">{error}</p>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-aletis-cream-escuro/70 bg-white px-3 py-3 flex-shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  enviar()
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      enviar()
                    }
                  }}
                  rows={1}
                  placeholder="Pergunte sobre seu caso…"
                  disabled={streaming}
                  className="flex-1 resize-none rounded-xl border border-aletis-cream-escuro bg-white px-3 py-2 font-body text-[13px] text-aletis-verde placeholder:text-aletis-verde-claro focus:outline-none focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/20 max-h-32"
                />
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-aletis-verde text-white hover:bg-aletis-verde-escuro disabled:opacity-50 disabled:cursor-not-allowed transition flex-shrink-0"
                  aria-label="Enviar"
                >
                  {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
              <p className="mt-2 font-body text-[10px] text-aletis-verde-medio leading-snug">
                ALIX responde com base nos dados do seu caso. Para decisões sensíveis (assinar, aceitar valores), confirme com {cliente.consultor || 'seu consultor'}.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Bubble({ msg }: { msg: LocalMsg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-aletis-gold flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles size={12} className="text-aletis-verde" />
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 font-body text-[13px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-aletis-verde text-aletis-cream rounded-br-md'
            : 'bg-white text-aletis-grafite-escuro border border-aletis-cream-escuro rounded-bl-md'
        }`}
      >
        {msg.content || (msg.streaming ? <PulsingDots /> : <em className="opacity-50">…</em>)}
        {msg.streaming && msg.content && <span className="inline-block w-1.5 h-4 ml-0.5 bg-aletis-gold-escuro animate-pulse align-middle" />}
      </div>
    </div>
  )
}

function PulsingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-aletis-verde-medio">
      <MessageSquare size={12} className="animate-pulse" />
      <span>pensando…</span>
    </span>
  )
}
