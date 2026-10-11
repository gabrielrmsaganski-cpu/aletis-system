import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CheckCheck, Download, Loader2, MessageSquare, Paperclip, RefreshCw, Search, Send } from 'lucide-react'
import { apiFetch } from '../../hooks/useApi'
import type { PendenciaDTO, UploadDTO } from './types'
import { conversationDownloadPath, conversationSendIntent, mergeConversation, type ConversationMessage, type ConversationSendIntent } from './PortalConversationModel'

export interface PortalMessagesProps {
  clienteId: string; token?: string; mode: 'cliente' | 'equipe'; clienteNome?: string
  uploads?: UploadDTO[]; requests?: PendenciaDTO[]; initialDraft?: string
  active?: boolean
}
const field = 'w-full rounded-xl border border-slate-200 bg-card px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none disabled:bg-slate-100'
const button = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium disabled:opacity-50'
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
export function PortalMessages(props: PortalMessagesProps) {
  return <ScopedPortalMessages key={`${props.mode}:${props.clienteId}`} {...props} />
}
function ScopedPortalMessages({ clienteId, token, mode, clienteNome, uploads = [], requests = [], initialDraft = '', active = true }: PortalMessagesProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [draft, setDraft] = useState(initialDraft)
  const [selected, setSelected] = useState<string[]>([])
  const [requestId, setRequestId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [readError, setReadError] = useState('')
  const [sendError, setSendError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [hasOlder, setHasOlder] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const mounted = useRef(true)
  const epoch = useRef(0)
  const controllers = useRef(new Set<AbortController>())
  const readControllers = useRef(new Set<AbortController>())
  const activeRef = useRef(active); activeRef.current = active
  const reading = useRef(false)
  const sendingRef = useRef(false)
  const intent = useRef<ConversationSendIntent | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const objectUrls = useRef(new Set<string>())
  const base = mode === 'cliente' ? '/portal/mensagens' : `/clientes/${encodeURIComponent(clienteId)}/portal-mensagens`
  const lastSuggestion = useRef(initialDraft)
  useEffect(() => {
    if (initialDraft !== lastSuggestion.current) { lastSuggestion.current = initialDraft; setDraft(value => value || initialDraft) }
  }, [initialDraft])
  const request = useCallback(async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const controller = new AbortController(); controllers.current.add(controller)
    if (!options.method || options.method === 'GET') readControllers.current.add(controller)
    const timer = setTimeout(() => controller.abort(), 30_000)
    try {
      if (mode === 'equipe') return await apiFetch<T>(path, { ...options, signal: controller.signal })
      const headers = new Headers(options.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (options.body) headers.set('Content-Type', 'application/json')
      const response = await fetch(`/api${path}`, { ...options, credentials: 'include', headers, signal: controller.signal })
      const body = await response.json().catch(() => null)
      if (!response.ok || body?.success === false || !body || !Object.prototype.hasOwnProperty.call(body, 'data')) throw Object.assign(new Error(body?.error || body?.message || 'Não foi possível concluir a solicitação.'), { status: response.status })
      return body.data as T
    } catch (error) {
      if (mounted.current && controller.signal.aborted) throw new Error('A confirmação demorou mais que o esperado. Tente novamente.')
      throw error
    } finally { clearTimeout(timer); controllers.current.delete(controller); readControllers.current.delete(controller) }
  }, [mode, token])
  const load = useCallback(async (older?: ConversationMessage) => {
    if (reading.current || !activeRef.current || document.visibilityState !== 'visible') return
    const started = epoch.current
    reading.current = true
    try {
      const suffix = older ? `?before=${encodeURIComponent(older.criadoEm)}&beforeId=${encodeURIComponent(older.id)}` : ''
      const rows = await request<ConversationMessage[]>(`${base}${suffix}`)
      if (!Array.isArray(rows)) throw new Error('A conversa retornou um formato inesperado. Atualize novamente.')
      if (!mounted.current || epoch.current !== started) return
      setMessages(previous => mergeConversation(previous, rows)); setReadError('')
      if (older || !older && !messages.length) setHasOlder(rows.length === 200)
    } catch (error) { if (mounted.current && epoch.current === started) setReadError((error as Error).message) }
    finally { if (epoch.current === started) { reading.current = false; if (mounted.current) setLoading(false) } }
  }, [base, request, messages.length])
  const loadRef = useRef(load); loadRef.current = load
  useEffect(() => {
    if (active) void loadRef.current()
    else { epoch.current += 1; reading.current = false; readControllers.current.forEach(controller => controller.abort()); readControllers.current.clear() }
  }, [active])
  useEffect(() => {
    mounted.current = true
    void loadRef.current()
    const interval = setInterval(() => { void loadRef.current() }, 10_000)
    const visible = () => { if (document.visibilityState === 'visible') void loadRef.current() }
    document.addEventListener('visibilitychange', visible)
    return () => {
      mounted.current = false; epoch.current += 1; reading.current = false; clearInterval(interval); document.removeEventListener('visibilitychange', visible)
      controllers.current.forEach(controller => controller.abort()); controllers.current.clear()
      objectUrls.current.forEach(url => URL.revokeObjectURL(url)); objectUrls.current.clear()
      intent.current = null
    }
  }, [base])

  const visibleMessages = messages.filter(message => `${message.texto} ${message.autorNome} ${message.solicitacao?.titulo || ''} ${(message.anexos || []).map(file => file.nome).join(' ')}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  useEffect(() => {
    const root = viewport.current
    if (!active || !root || typeof IntersectionObserver === 'undefined') return
    const seen = new Set<string>(); let timer: ReturnType<typeof setTimeout> | undefined; let marking = false; let observing = true
    const schedule = () => {
      if (timer) clearTimeout(timer)
      if (!activeRef.current || !seen.size || document.visibilityState !== 'visible' || !document.hasFocus()) return
      timer = setTimeout(async () => {
        if (!observing || !activeRef.current || marking || !mounted.current || document.visibilityState !== 'visible' || !document.hasFocus()) return
        const ids = [...seen].slice(0, 200)
        if (!ids.length) return
        marking = true
        try {
          const result = await request<{ ids: string[]; marcadas: number; lidaEm: string }>(`${base}/marcar-lidas`, { method: 'POST', body: JSON.stringify({ ids }) })
          if (!observing || !mounted.current) return
          setMessages(previous => previous.map(message => result.ids.includes(message.id) ? { ...message, lidaEm: result.lidaEm } : message))
          window.dispatchEvent(new CustomEvent('portal:messages-read', { detail: { clienteId, ids: result.ids, marcadas: result.marcadas } }))
          window.dispatchEvent(new CustomEvent('portal:messages-updated', { detail: { clienteId } }))
        } catch (error) { if (observing && mounted.current) setReadError(`Mensagens carregadas; confirmação de leitura pendente. ${(error as Error).message}`) }
        finally { marking = false }
      }, 900)
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) { const id = (entry.target as HTMLElement).dataset.messageId; if (id) { if (entry.isIntersecting) seen.add(id); else seen.delete(id) } }
      schedule()
    }, { root, threshold: 0.65 })
    root.querySelectorAll<HTMLElement>('[data-unread="true"]').forEach(element => observer.observe(element))
    document.addEventListener('visibilitychange', schedule); window.addEventListener('focus', schedule)
    return () => { observing = false; if (timer) clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', schedule); window.removeEventListener('focus', schedule) }
  }, [base, request, clienteId, messages, search, active])

  async function send() {
    if (sendingRef.current) return
    try { intent.current = conversationSendIntent(intent.current, { texto: draft, uploadIds: selected, pendenciaId: requestId || undefined }, () => crypto.randomUUID()) }
    catch (error) { setSendError((error as Error).message); return }
    sendingRef.current = true; setSending(true); setSendError('')
    const submission = intent.current
    try {
      const saved = await request<ConversationMessage>(base, { method: 'POST', headers: { 'Idempotency-Key': submission.key }, body: JSON.stringify(submission.payload) })
      if (!mounted.current) return
      if (!saved?.id) throw new Error('O servidor não confirmou a mensagem. Tente confirmar o mesmo envio.')
      setMessages(previous => mergeConversation(previous, [saved])); setDraft(''); setSelected([]); setRequestId(''); setUncertain(false); intent.current = null
      window.dispatchEvent(new CustomEvent('portal:messages-changed', { detail: { clienteId } }))
      window.dispatchEvent(new CustomEvent('portal:messages-updated', { detail: { clienteId } }))
      requestAnimationFrame(() => viewport.current?.scrollTo({ top: viewport.current.scrollHeight, behavior: 'smooth' }))
    } catch (error) {
      if (!mounted.current) return
      const status = (error as { status?: number }).status
      const rejected = status && [400, 401, 403, 404, 409, 413, 422, 429].includes(status)
      if (rejected) intent.current = null
      setUncertain(!rejected); setSendError((error as Error).message)
    } finally { sendingRef.current = false; if (mounted.current) setSending(false) }
  }
  async function download(uploadId: string) {
    const controller = new AbortController(); controllers.current.add(controller); setDownloadError('')
    try {
      const response = await fetch(conversationDownloadPath(mode, clienteId, uploadId), { credentials: 'include', signal: controller.signal,
        headers: mode === 'cliente' && token ? { Authorization: `Bearer ${token}` } : {} })
      if (!response.ok) throw new Error('Arquivo indisponível. Atualize a conversa ou fale com a equipe.')
      const blob = await response.blob(); if (!mounted.current) return
      const url = URL.createObjectURL(blob); objectUrls.current.add(url)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = messages.flatMap(message => message.anexos || []).find(file => file.uploadId === uploadId)?.nome || 'Documento'
      anchor.click(); setTimeout(() => { URL.revokeObjectURL(url); objectUrls.current.delete(url) }, 1000)
    } catch (error) { if (mounted.current) setDownloadError((error as Error).message) }
    finally { controllers.current.delete(controller) }
  }
  const available = uploads.filter(upload => upload.clienteId === clienteId && (upload.enviadoPor === 'cliente' || mode === 'cliente'
    || (upload as UploadDTO & { portalCompartilhado?: boolean; metadata?: { portalCompartilhado?: boolean } }).portalCompartilhado === true
    || (upload as UploadDTO & { metadata?: { portalCompartilhado?: boolean } }).metadata?.portalCompartilhado === true))
  const own = mode === 'cliente' ? 'cliente' : 'consultor'
  return <section className="rounded-2xl border border-slate-200 bg-card p-4 shadow-sm space-y-3" aria-label="Conversa com a equipe">
    <header className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-900 flex items-center gap-2"><MessageSquare size={18} />{mode === 'cliente' ? 'Converse com sua equipe' : `Conversa com ${clienteNome || 'o cliente'}`}</h2><p className="text-xs text-slate-500 mt-1">Mensagens, documentos enviados e solicitações no mesmo lugar.</p></div><button className={button} onClick={() => void load()} aria-label="Atualizar conversa"><RefreshCw size={16} /></button></header>
    <label className="flex gap-2 items-center"><Search size={16} /><input className={field} value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar mensagens, autor ou arquivo" /></label>
    {readError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{readError}</p>}
    {hasOlder && <button className={button} onClick={() => void load(messages[0])}>Carregar mensagens anteriores</button>}
    <div ref={viewport} className="h-[min(52vh,480px)] min-h-48 overflow-y-auto rounded-xl bg-slate-50 p-3 space-y-3" aria-busy={loading}>
      {loading && !messages.length ? <p className="text-sm text-slate-500">Carregando conversa…</p> : !visibleMessages.length ? <p className="text-sm text-slate-500 py-8 text-center">{search ? 'Nenhuma mensagem corresponde à pesquisa nas mensagens carregadas.' : 'Envie sua primeira mensagem. Ela ficará registrada nesta conversa.'}</p> : visibleMessages.map((message, index) => <div key={message.id}>
        {(!index || message.criadoEm.slice(0, 10) !== visibleMessages[index - 1].criadoEm.slice(0, 10)) && <p className="text-center text-xs text-slate-500 my-3">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(message.criadoEm))}</p>}
        <article className={`max-w-[92%] sm:max-w-[80%] rounded-2xl p-3 text-sm ${message.de === own ? 'ml-auto bg-emerald-700 text-white' : 'bg-card border border-slate-200 text-slate-800'}`}>
          <p data-message-id={message.id} data-unread={String(message.de !== own && message.de !== 'sistema' && !message.lidaEm)} className="text-xs font-semibold mb-1">{message.autorNome}</p>{message.solicitacao && <p className="text-xs opacity-80 mb-2">Sobre: {message.solicitacao.titulo}</p>}
          <p className="whitespace-pre-wrap break-words">{message.texto}</p>
          {(message.anexos || []).map(file => <button key={file.uploadId} disabled={!file.disponivel} onClick={() => void download(file.uploadId)} className="mt-2 flex max-w-full items-center gap-2 rounded-lg border border-current/20 p-2 text-left text-xs disabled:opacity-50"><Download size={14} className="shrink-0" /><span className="break-all">{file.nome}{!file.disponivel && ' · acesso encerrado'}</span></button>)}
          <p className="mt-2 text-[10px] opacity-75 flex items-center justify-end gap-1">{dateTime(message.criadoEm)} {message.de === own && <>{message.lidaEm ? <CheckCheck size={13} /> : <Check size={13} />}<span title={message.lidaEm ? `Lida em ${dateTime(message.lidaEm)}` : 'Recebida pelo sistema'}>{message.lidaEm ? 'Lida' : 'Entregue'}</span></>}</p>
        </article>
      </div>)}
    </div>
    {downloadError && <p role="alert" className="text-sm text-red-700">{downloadError}</p>}
    {initialDraft && draft !== initialDraft && draft && !uncertain && <button className={button} onClick={() => setDraft(initialDraft)}>Usar a mensagem sugerida</button>}
    <textarea aria-label="Sua mensagem" className={`${field} min-h-24 resize-y`} maxLength={2000} placeholder="Escreva sua mensagem. Enter cria uma nova linha." value={draft} disabled={sending || uncertain} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
    <div className="flex items-center justify-between gap-2"><button className={button} onClick={() => setShowFiles(value => !value)} disabled={sending || uncertain}><Paperclip size={15} />Anexar documento já enviado{selected.length ? ` (${selected.length})` : ''}</button><span className="text-xs text-slate-500">{draft.length}/2.000</span></div>
    {showFiles && <div className="rounded-xl border border-slate-200 p-3 space-y-2 max-h-44 overflow-auto">{!available.length ? <p className="text-xs text-slate-500">Envie o arquivo na área Documentos para anexá-lo aqui.</p> : available.map(file => <label key={file.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={selected.includes(file.id)} disabled={sending || uncertain || selected.length >= 10 && !selected.includes(file.id)} onChange={event => setSelected(value => event.target.checked ? [...value, file.id] : value.filter(id => id !== file.id))} /><span className="break-all">{file.nomeOriginal}</span></label>)}</div>}
    {requests.some(item => item.clienteId === clienteId) && <label className="block text-xs text-slate-600">Relacionar a uma solicitação<select className={`${field} mt-1`} disabled={sending || uncertain} value={requestId} onChange={event => setRequestId(event.target.value)}><option value="">Conversa geral</option>{requests.filter(item => item.clienteId === clienteId).map(item => <option key={item.id} value={item.id}>{item.titulo}</option>)}</select></label>}
    {sendError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{sendError}{uncertain && ' A mensagem foi preservada. Confirme o mesmo envio para evitar duplicação.'}</p>}
    <footer className="flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Enviar pelo botão ou Ctrl + Enter.</span><button className={`${button} bg-emerald-700 text-white border-emerald-700`} onClick={() => void send()} disabled={sending || !draft.trim() && !selected.length}>{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}{sending ? 'Enviando…' : uncertain ? 'Confirmar envio' : 'Enviar mensagem'}</button></footer>
  </section>
}
