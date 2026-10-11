import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, Archive, CheckCircle2, ChevronRight, Clock, Edit3, ExternalLink, FileCheck, FileText, Inbox, Loader2, Plus, RefreshCw, Save, Sparkles, X } from 'lucide-react'
import { apiFetch, ApiError } from '../../hooks/useApi'
import { CATEGORIA_LABEL, type PendenciaDTO, type UploadDTO } from '../../pages/portal/types'
import { needsClientAction, portalDateOnly, publicAnalysisLabel, publicDriveLabel, requestIsOverdue, REQUEST_PRIORITY_LABEL, REQUEST_STATUS_LABEL, safeDriveUrl, sortPortalRequests, uploadIsProcessing } from '../../pages/portal/DocumentWorkflow'
import { fmtBytes, formatDateTime } from '../../pages/portal/utils'

interface TeamUpload extends UploadDTO {
  portalCompartilhado?: boolean
  documentoId?: string
  resumoIa?: string
  googleDrive?: { url?: string }
  metadata?: {
    resumoIa?: string
    alixDocumentId?: string
    googleDrive?: { url?: string }
    processing?: { analysis?: { status?: string; errorCode?: string }; drive?: { status?: string; url?: string; folderName?: string; errorCode?: string } }
  }
}
interface UploadAnalysis {
  status?: string
  resumo?: string
  achados?: Array<{ titulo: string; descricao: string; prioridade: string }>
  campos?: Array<{ rotulo: string; valor: string | number | null; fonte?: string; status?: string }>
  document?: { id?: string; filename?: string; pageCount?: number; evidenceCount?: number }
  cobertura?: { complete?: boolean; totalChars?: number; readChars?: number; totalChunks?: number; readChunks?: number }
  totais?: { achados: number; campos: number }
}
interface Props { clienteId: string; clienteNome?: string; onOpenDocumento: (id: string) => void }
const panel = 'rounded-2xl border border-aletis-borda bg-card shadow-elevation-1 dark:border-white/10 dark:bg-white/5'
const input = 'mt-1 min-h-11 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm font-normal text-foreground focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20 dark:border-white/15 dark:bg-aletis-verde-escuro dark:text-white'
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-aletis-verde px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-aletis-verde-escuro disabled:cursor-not-allowed disabled:opacity-50'
const secondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-aletis-cream-papel disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white'

// Uma chave por cliente evita exibir a solicitação ou a análise da entidade anterior.
export default function ClientePortalDocumentosPanel(props: Props) { return <PortalDocumentosContent key={props.clienteId} {...props} /> }

function PortalDocumentosContent({ clienteId, clienteNome, onOpenDocumento }: Props) {
  const base = `/clientes/${encodeURIComponent(clienteId)}/portal`
  const [requests, setRequests] = useState<PendenciaDTO[]>([])
  const [uploads, setUploads] = useState<TeamUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [tab, setTab] = useState<'pedidos' | 'recebidos'>('pedidos')
  const [filter, setFilter] = useState<'ativos' | 'revisao' | 'encerrados' | 'todos'>('ativos')
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(20)
  useEffect(() => setVisible(20), [search, filter, tab])
  const [editor, setEditor] = useState<PendenciaDTO | 'novo' | null>(null)
  const [review, setReview] = useState<{ request: PendenciaDTO; status: 'aprovado' | 'rejeitado' | 'cancelado' } | null>(null)
  const [analysis, setAnalysis] = useState<TeamUpload | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [sharing, setSharing] = useState<string | null>(null)
  const loadSequence = useRef(0)
  const mounted = useRef(true)
  const controller = useRef<AbortController | null>(null)
  const retryGuard = useRef(false)
  const shareGuard = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort() } }, [])
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    controller.current?.abort()
    const current = new AbortController(); controller.current = current
    try {
      const [nextRequests, nextUploads] = await Promise.all([
        apiFetch<PendenciaDTO[]>(`${base}/pendencias`, { signal: current.signal }),
        apiFetch<TeamUpload[]>(`${base}/uploads`, { signal: current.signal }),
      ])
      if (!mounted.current || sequence !== loadSequence.current) return
      setRequests(nextRequests); setUploads(nextUploads); setError(null)
    } catch (error) { if (mounted.current && !current.signal.aborted && sequence === loadSequence.current) setError(error instanceof Error ? error.message : 'Não foi possível carregar o portal deste cliente.') }
    finally { if (mounted.current && sequence === loadSequence.current) setLoading(false) }
  }, [base])
  useEffect(() => { void load() }, [load])
  const processing = uploads.some(uploadIsProcessing)
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !editor && !review) void load() }, processing ? 8_000 : 30_000)
    return () => window.clearInterval(timer)
  }, [load, processing, editor, review])
  const saved = async (message: string) => { if (!mounted.current) return; setEditor(null); setReview(null); setNotice(message); await load() }
  const retry = async (upload: TeamUpload, etapa: 'analise' | 'drive' | 'todas') => {
    if (retryGuard.current) return
    retryGuard.current = true; setRetrying(upload.id); setNotice(null)
    try {
      await apiFetch(`${base}/uploads/${encodeURIComponent(upload.id)}/reprocessar`, { method: 'POST', body: JSON.stringify({ etapa }) })
      if (mounted.current) { setNotice('Arquivo colocado na fila. Acompanhe a leitura e o arquivamento nesta lista.'); await load() }
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'Não foi possível reprocessar o arquivo.') }
    finally { retryGuard.current = false; if (mounted.current) setRetrying(null) }
  }
  const share = async (upload: TeamUpload) => {
    if (shareGuard.current) return
    shareGuard.current = true; setSharing(upload.id)
    try {
      await apiFetch(`${base}/uploads/${encodeURIComponent(upload.id)}/compartilhar`, { method: 'PATCH', body: JSON.stringify({ disponivel: !upload.portalCompartilhado }) })
      if (mounted.current) { setNotice(upload.portalCompartilhado ? 'Arquivo retirado da área do cliente. O documento permanece no CRM.' : 'Arquivo disponibilizado no portal do cliente.'); await load() }
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'Não foi possível atualizar a disponibilidade do arquivo.') }
    finally { shareGuard.current = false; if (mounted.current) setSharing(null) }
  }
  const pending = requests.filter(needsClientAction).length
  const awaitingReview = requests.filter(p => p.status === 'enviado').length
  const closed = requests.filter(p => p.status === 'aprovado' || p.status === 'cancelado').length
  const requestList = sortPortalRequests(requests).filter(p => (filter === 'todos' || (filter === 'ativos' ? p.status !== 'aprovado' && p.status !== 'cancelado' : filter === 'revisao' ? p.status === 'enviado' : p.status === 'aprovado' || p.status === 'cancelado')) && `${p.titulo} ${p.descricao || ''} ${p.tipoDocumento || ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))
  const uploadList = [...uploads].filter(upload => `${upload.nomeOriginal} ${requests.find(p => p.id === upload.pendenciaId)?.titulo || ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))).sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm))
  return <section className={`${panel} overflow-hidden`} aria-label="Solicitações de documentos no portal do cliente">
    <div className="border-b border-aletis-borda bg-aletis-cream-papel/50 p-4 sm:p-5 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-aletis-gold/35 bg-aletis-gold/15 text-aletis-gold-escuro"><Inbox size={21} /></div><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-widest text-aletis-gold-escuro">Portal do cliente</p><h2 className="mt-1 font-display text-lg font-semibold text-foreground dark:text-white">Solicitar, receber e conferir documentos</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/65">Organize os pedidos de {clienteNome || 'este cliente'} com orientação, prazo e prioridade. Os arquivos chegam ao CRM para análise da ALIX e organização no Drive.</p></div></div>
        <div className="flex shrink-0 flex-wrap gap-2"><button type="button" onClick={() => void load()} disabled={loading} className={secondary} aria-label="Atualizar pedidos e arquivos"><RefreshCw size={14} /></button><button type="button" onClick={() => setEditor('novo')} className={primary}><Plus size={15} />Solicitar documento</button></div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">{[[pending, 'Aguardando cliente'], [awaitingReview, 'Pedidos para conferir'], [uploads.length, 'Arquivos recebidos']].map(([value, label]) => <div key={String(label)} className="min-w-0 rounded-xl border border-aletis-borda bg-card p-3 dark:border-white/10 dark:bg-white/5"><p className="font-display text-xl font-bold text-foreground dark:text-white">{value}</p><p className="mt-1 break-words text-[11px] text-[var(--text-soft)] dark:text-white/60">{label}</p></div>)}</div>
    </div>
    <div className="p-4 sm:p-5">
      {notice && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => void load()} className="min-h-10 rounded-lg px-3 font-semibold underline">Atualizar lista</button></div>}
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Área do portal"><button type="button" onClick={() => { setTab('pedidos'); setSearch('') }} aria-pressed={tab === 'pedidos'} className={tab === 'pedidos' ? primary : secondary}><FileCheck size={14} />Pedidos ({requests.length})</button><button type="button" onClick={() => { setTab('recebidos'); setSearch('') }} aria-pressed={tab === 'recebidos'} className={tab === 'recebidos' ? primary : secondary}><Sparkles size={14} />Recebidos · ALIX e Drive ({uploads.length})</button></div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label><span className="sr-only">Buscar pedido ou documento</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={tab === 'pedidos' ? 'Buscar pedido, orientação ou tipo' : 'Buscar arquivo ou pedido'} className={input} /></label>{tab === 'pedidos' && <label><span className="sr-only">Estado do pedido</span><select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} className={input}><option value="ativos">Ativos ({pending + awaitingReview})</option><option value="revisao">Para conferir ({awaitingReview})</option><option value="encerrados">Encerrados ({closed})</option><option value="todos">Todos</option></select></label>}</div>
      {loading ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-[var(--text-soft)]"><Loader2 size={16} className="animate-spin" />Carregando solicitações e arquivos…</p> : tab === 'pedidos' ? <>
        {!requestList.length && <div className="rounded-xl border border-dashed border-aletis-borda p-6 text-sm text-[var(--text-soft)] dark:text-white/60">Nenhum pedido nesta lista. Use “Solicitar documento” para orientar o próximo envio do cliente.</div>}
        <ul className="space-y-3">{requestList.slice(0, visible).map(p => {
          const linked = uploads.filter(u => u.pendenciaId === p.id)
          const canEdit = !['aprovado', 'cancelado'].includes(p.status)
          return <li key={p.id} className="rounded-lg border border-aletis-borda p-4 dark:border-white/10">
            <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap gap-2 text-[11px] font-semibold"><span className={`rounded-full px-2.5 py-1 ${p.status === 'enviado' ? 'bg-amber-100 text-amber-900' : p.status === 'aprovado' ? 'bg-emerald-100 text-emerald-900' : 'bg-aletis-cream text-foreground'}`}>{REQUEST_STATUS_LABEL[p.status]}</span><span className="py-1 text-[var(--text-soft)] dark:text-white/60">{REQUEST_PRIORITY_LABEL[p.prioridade || 'normal']}</span>{requestIsOverdue(p) && <span className="py-1 text-red-700">Prazo vencido</span>}</div><h3 className="break-words text-sm font-bold text-foreground dark:text-white">{p.titulo}</h3><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/65">{p.descricao || 'Sem orientação adicional.'}</p></div>{canEdit && <button type="button" onClick={() => setEditor(p)} className={secondary} aria-label={`Editar pedido ${p.titulo}`}><Edit3 size={13} />Editar</button>}</div>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-soft)] dark:text-white/60"><span>{CATEGORIA_LABEL[p.categoria]}{p.tipoDocumento ? ` · ${p.tipoDocumento}` : ''}</span><span>Prazo: {portalDateOnly(p.prazo)}</span><span>{p.obrigatorio ? 'Necessário' : 'Complementar'}</span></p>
            {p.observacao && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-xs leading-relaxed text-foreground"><strong>Orientação da conferência:</strong> {p.observacao}</p>}
            {linked.length > 0 && <div className="mt-3 rounded-xl border border-aletis-borda bg-aletis-cream-papel/40 p-3 dark:border-white/10 dark:bg-white/5"><p className="mb-2 text-xs font-semibold text-foreground dark:text-white">{linked.length} anexo(s) deste pedido</p><ul className="space-y-2">{linked.map(upload => <li key={upload.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words text-xs font-semibold text-foreground dark:text-white">{upload.nomeOriginal}</p><p className="mt-1 text-[11px] text-[var(--text-soft)] dark:text-white/60">{formatDateTime(upload.enviadoEm)} · {publicAnalysisLabel(upload.analiseStatus)}</p></div><div className="flex shrink-0 gap-2"><button type="button" className={secondary} onClick={() => onOpenDocumento(upload.documentoId || upload.id)} aria-label={`Abrir documento ${upload.nomeOriginal}`}><FileText size={13} />Documento</button><button type="button" className={secondary} onClick={() => setAnalysis(upload)} aria-label={`Ler análise de ${upload.nomeOriginal}`}><Sparkles size={13} />ALIX</button></div></li>)}</ul></div>}
            <div className="mt-4 flex flex-wrap gap-2">{p.status === 'enviado' && <><button type="button" className={primary} disabled={!linked.length || !p.updatedAt} onClick={() => setReview({ request: p, status: 'aprovado' })}><CheckCircle2 size={14} />Conferir e aprovar pedido</button><button type="button" className={secondary} disabled={!p.updatedAt} onClick={() => setReview({ request: p, status: 'rejeitado' })}><AlertCircle size={14} />Pedir correção</button></>}{canEdit && <button type="button" className={secondary} disabled={!p.updatedAt} onClick={() => setReview({ request: p, status: 'cancelado' })}>Encerrar solicitação</button>}</div>
          </li>
        })}</ul>
      </> : <>
        {!uploadList.length && <p className="rounded-xl border border-dashed border-aletis-borda p-6 text-sm text-[var(--text-soft)] dark:text-white/60">Os arquivos recebidos pelo portal aparecerão aqui, junto da leitura da ALIX e do arquivamento.</p>}
        <ul className="space-y-3">{uploadList.slice(0, visible).map(upload => {
          const drive = safeDriveUrl(upload.googleDrive?.url || upload.metadata?.googleDrive?.url || upload.metadata?.processing?.drive?.url)
          const resumo = upload.resumoIa || upload.metadata?.resumoIa
          return <li key={upload.id} className="rounded-lg border border-aletis-borda p-4 dark:border-white/10"><div className="flex min-w-0 items-start gap-3"><FileText size={20} className="mt-1 shrink-0 text-aletis-gold-escuro" /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold text-foreground dark:text-white">{upload.nomeOriginal}</h3><p className="mt-1 text-xs text-[var(--text-soft)] dark:text-white/60">{formatDateTime(upload.enviadoEm)} · {fmtBytes(upload.tamanho)} · {upload.enviadoPor === 'cliente' ? 'Enviado pelo cliente' : 'Enviado pela equipe'}</p><p className="mt-1 break-words text-xs text-[var(--text-soft)] dark:text-white/60">{requests.find(p => p.id === upload.pendenciaId)?.titulo || 'Envio sem pedido específico'}</p></div></div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="inline-flex items-center gap-1.5 rounded-full bg-aletis-cream px-3 py-1.5 text-foreground"><Sparkles size={13} />{publicAnalysisLabel(upload.analiseStatus)}</span><span className="inline-flex items-center gap-1.5 rounded-full bg-aletis-cream px-3 py-1.5 text-foreground"><Archive size={13} />{publicDriveLabel(upload.driveStatus)}</span></div>
            {resumo && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-xs leading-relaxed text-foreground">{resumo}</p>}
            <div className="mt-4 flex flex-wrap gap-2">{upload.enviadoPor === 'consultor' && <button type="button" aria-pressed={upload.portalCompartilhado === true} disabled={Boolean(sharing)} onClick={() => void share(upload)} className={upload.portalCompartilhado ? primary : secondary}>{sharing === upload.id ? <Loader2 size={14} className="animate-spin" /> : <FileCheck size={14} />}{upload.portalCompartilhado ? 'Disponível ao cliente · retirar' : 'Disponibilizar ao cliente'}</button>}<button type="button" className={secondary} onClick={() => onOpenDocumento(upload.documentoId || upload.id)}><FileText size={14} />Abrir documento no CRM</button><button type="button" className={secondary} onClick={() => setAnalysis(upload)}><Sparkles size={14} />Ver análise da ALIX</button>{drive && <a href={drive} target="_blank" rel="noreferrer" className={secondary}><ExternalLink size={14} />Abrir no Drive</a>}<button type="button" disabled={Boolean(retrying) || upload.analiseStatus === 'processando' || upload.driveStatus === 'processando'} onClick={() => void retry(upload, 'todas')} className={secondary}>{retrying === upload.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Reprocessar</button></div>
          </li>
        })}</ul>
      </>}
      {(tab === 'pedidos' ? requestList.length : uploadList.length) > visible && <button type="button" onClick={() => setVisible(value => value + 20)} className={`${secondary} mt-4 w-full`}>Mostrar mais · {visible} de {tab === 'pedidos' ? requestList.length : uploadList.length}</button>}
    </div>
    <SharedProgress base={base} clienteNome={clienteNome} />
    {editor && <RequestEditor key={editor === 'novo' ? 'novo' : editor.id} base={base} request={editor === 'novo' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => saved(editor === 'novo' ? 'Pedido disponibilizado no portal do cliente.' : 'Pedido atualizado no portal do cliente.')} onConflict={() => void load()} />}
    {review && <RequestReview base={base} {...review} onClose={() => setReview(null)} onSaved={() => saved(review.status === 'aprovado' ? 'Conferência registrada. O cliente verá o pedido aprovado.' : review.status === 'rejeitado' ? 'Correção solicitada com a orientação registrada no portal.' : 'Solicitação encerrada. O histórico e os arquivos foram preservados.')} onConflict={() => void load()} />}
    {analysis && <AnalysisDialog key={analysis.id} base={base} upload={analysis} onClose={() => setAnalysis(null)} />}
  </section>
}

function PortalPanelDialog({ title, description, onClose, children, busy = false }: { title: string; description: string; onClose: () => void; children: React.ReactNode; busy?: boolean }) {
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose() }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60" /><Dialog.Content onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault() }} className="fixed left-1/2 top-1/2 z-[91] max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg bg-card p-5 shadow-2xl sm:p-6 dark:bg-aletis-verde-escuro"><div className="mb-5 flex items-start gap-4"><div className="min-w-0 flex-1"><Dialog.Title className="font-display text-lg font-bold text-foreground dark:text-white">{title}</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--text-soft)] dark:text-white/65">{description}</Dialog.Description></div><Dialog.Close disabled={busy} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-aletis-cream disabled:opacity-50" aria-label="Fechar painel"><X size={18} /></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>
}

function RequestEditor({ base, request, onClose, onSaved, onConflict }: { base: string; request?: PendenciaDTO; onClose: () => void; onSaved: () => Promise<void>; onConflict: () => void }) {
  const [titulo, setTitulo] = useState(request?.titulo || '')
  const [descricao, setDescricao] = useState(request?.descricao || '')
  const [categoria, setCategoria] = useState<PendenciaDTO['categoria']>(request?.categoria || 'outros')
  const [tipoDocumento, setTipoDocumento] = useState(request?.tipoDocumento || '')
  const [prazo, setPrazo] = useState(request?.prazo || '')
  const [prioridade, setPrioridade] = useState<PendenciaDTO['prioridade']>(request?.prioridade || 'normal')
  const [obrigatorio, setObrigatorio] = useState(request?.obrigatorio ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const guard = useRef(false)
  const idempotencyKey = useRef(crypto.randomUUID())
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (guard.current || conflict) return
    if (titulo.trim().length < 2) { setError('Informe o nome do documento solicitado com pelo menos dois caracteres.'); return }
    if (request && !request.updatedAt) { setError('Atualize a lista antes de editar este pedido.'); setConflict(true); onConflict(); return }
    guard.current = true; setBusy(true); setError(null)
    try {
      await apiFetch(`${base}/pendencias${request ? `/${encodeURIComponent(request.id)}` : ''}`, {
        method: request ? 'PATCH' : 'POST', headers: request ? undefined : { 'Idempotency-Key': idempotencyKey.current },
        body: JSON.stringify({ titulo: titulo.trim(), descricao: descricao.trim(), categoria, tipoDocumento: tipoDocumento.trim() || null, prazo: prazo || null, prioridade, obrigatorio, ...(request ? { expectedUpdatedAt: request.updatedAt } : {}) }),
      })
      if (alive.current) await onSaved()
    } catch (error) {
      if (!alive.current) return
      if (error instanceof ApiError && (error.status === 409 || error.status === 428)) { setConflict(true); setError('Este pedido mudou enquanto você editava. A lista foi atualizada. Feche este painel e abra a versão atual antes de salvar.'); onConflict() }
      else setError(error instanceof Error ? error.message : 'Não foi possível salvar o pedido.')
    } finally { guard.current = false; if (alive.current) setBusy(false) }
  }
  return <PortalPanelDialog title={request ? 'Editar solicitação' : 'Solicitar documento ao cliente'} description="O pedido e as orientações abaixo ficam visíveis no portal deste cliente. Seja específico sobre as páginas, o período e as informações necessárias." onClose={onClose} busy={busy}>
    <form onSubmit={event => void submit(event)} className="space-y-4">
      <label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/70">Documento solicitado<input autoFocus required minLength={2} maxLength={200} value={titulo} onChange={event => setTitulo(event.target.value)} className={input} placeholder="Nome claro do documento" /></label>
      <label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/70">Orientação para o cliente<textarea rows={4} maxLength={4000} value={descricao} onChange={event => setDescricao(event.target.value)} className={input} placeholder="Explique o que enviar, de qual período e como obter o documento, se necessário." /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/70">Categoria<select value={categoria} onChange={event => setCategoria(event.target.value as PendenciaDTO['categoria'])} className={input}>{Object.entries(CATEGORIA_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/70">Tipo esperado<input maxLength={150} value={tipoDocumento} onChange={event => setTipoDocumento(event.target.value)} className={input} placeholder="Detalhe o tipo de documento" /></label><label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/70">Prazo de envio<input type="date" value={prazo} onChange={event => setPrazo(event.target.value)} className={input} /></label><label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/70">Prioridade<select value={prioridade} onChange={event => setPrioridade(event.target.value as PendenciaDTO['prioridade'])} className={input}><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></label></div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-foreground dark:text-white"><input type="checkbox" checked={obrigatorio} onChange={event => setObrigatorio(event.target.checked)} className="h-4 w-4 accent-aletis-verde" />Documento necessário para continuar o atendimento</label>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-aletis-borda pt-4"><button type="button" onClick={onClose} disabled={busy} className={secondary}>{conflict ? 'Fechar e conferir lista atual' : 'Cancelar'}</button><button type="submit" disabled={busy || conflict || titulo.trim().length < 2} className={primary}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{busy ? 'Salvando…' : request ? 'Salvar alterações' : 'Disponibilizar pedido'}</button></div>
    </form>
  </PortalPanelDialog>
}

function RequestReview({ base, request, status, onClose, onSaved, onConflict }: { base: string; request: PendenciaDTO; status: 'aprovado' | 'rejeitado' | 'cancelado'; onClose: () => void; onSaved: () => Promise<void>; onConflict: () => void }) {
  const [observacao, setObservacao] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const guard = useRef(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (guard.current || conflict || !request.updatedAt) return
    if (status === 'rejeitado' && !observacao.trim()) { setError('Explique ao cliente o que precisa ser corrigido.'); return }
    if (status === 'aprovado' && !confirmed) { setError('Confirme a conferência de todos os anexos do pedido.'); return }
    guard.current = true; setBusy(true); setError(null)
    try {
      await apiFetch(`${base}/pendencias/${encodeURIComponent(request.id)}`, { method: 'PATCH', body: JSON.stringify({ status, observacao: observacao.trim(), expectedUpdatedAt: request.updatedAt }) })
      if (alive.current) await onSaved()
    } catch (error) { if (alive.current) { if (error instanceof ApiError && (error.status === 409 || error.status === 428)) { setConflict(true); setError('O pedido mudou, possivelmente com um novo anexo. A lista foi atualizada. Reabra o pedido e confira a versão atual.'); onConflict() } else setError(error instanceof Error ? error.message : 'Não foi possível registrar a conferência.') } }
    finally { guard.current = false; if (alive.current) setBusy(false) }
  }
  const title = status === 'aprovado' ? 'Aprovar os documentos deste pedido' : status === 'rejeitado' ? 'Solicitar correção ao cliente' : 'Encerrar esta solicitação'
  return <PortalPanelDialog title={title} description={request.titulo} onClose={onClose} busy={busy}><form onSubmit={event => void submit(event)} className="space-y-4">
    <p className="text-sm leading-relaxed text-[var(--text-soft)] dark:text-white/65">{status === 'aprovado' ? 'A aprovação registra a conferência da equipe sobre o pedido inteiro, incluindo seus anexos.' : status === 'rejeitado' ? 'A orientação aparecerá para o cliente junto do botão para reenviar. Os arquivos anteriores permanecem no histórico.' : 'O pedido deixará de exigir envio. Os arquivos e o histórico de atendimento serão preservados.'}</p>
    {status === 'aprovado' && <label className="flex items-start gap-3 rounded-xl border border-aletis-borda p-3 text-sm text-foreground dark:text-white"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-aletis-verde" />Conferi os anexos e confirmo que atendem a esta solicitação.</label>}
    <label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/70">{status === 'rejeitado' ? 'O que o cliente precisa corrigir (obrigatório)' : 'Observação para o cliente (opcional)'}<textarea autoFocus rows={4} required={status === 'rejeitado'} maxLength={4000} value={observacao} onChange={event => setObservacao(event.target.value)} className={input} /></label>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className={secondary}>Voltar</button><button type="submit" disabled={busy || conflict || (status === 'aprovado' && !confirmed) || (status === 'rejeitado' && !observacao.trim())} className={primary}>{busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}{status === 'aprovado' ? 'Registrar aprovação' : status === 'rejeitado' ? 'Solicitar novo envio' : 'Encerrar solicitação'}</button></div>
  </form></PortalPanelDialog>
}

function AnalysisDialog({ base, upload, onClose }: { base: string; upload: TeamUpload; onClose: () => void }) {
  const [data, setData] = useState<UploadAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError(null); setData(null)
    apiFetch<UploadAnalysis>(`${base}/uploads/${encodeURIComponent(upload.id)}/analysis`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setData(data) }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    return () => controller.abort()
  }, [base, upload.id, attempt])
  return <PortalPanelDialog title="Análise documental da ALIX" description={upload.nomeOriginal} onClose={onClose}>
    <p className="mb-4 rounded-xl border border-aletis-gold/30 bg-aletis-gold/10 p-3 text-xs leading-relaxed text-foreground">Leitura de apoio à equipe. Confira as evidências no documento antes de confirmar dados ou aprovar a solicitação. Estes achados não são publicados automaticamente para o cliente.</p>
    {error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} className={`${secondary} mt-3`}>Tentar novamente</button></div> : !data ? <p role="status" className="flex items-center gap-2 py-6 text-sm text-[var(--text-soft)]"><Loader2 size={16} className="animate-spin" />Carregando leitura…</p> : <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs text-[var(--text-soft)] dark:text-white/65">{data.document?.pageCount ? <span className="rounded-full border border-aletis-borda px-3 py-1.5">{data.document.pageCount} página(s)</span> : null}{data.document?.evidenceCount !== undefined ? <span className="rounded-full border border-aletis-borda px-3 py-1.5">{data.document.evidenceCount} evidência(s)</span> : null}<span className={`rounded-full border px-3 py-1.5 ${data.cobertura?.complete ? 'border-emerald-200 text-emerald-800' : 'border-amber-200 text-amber-800'}`}>{data.cobertura?.complete ? 'Cobertura de leitura completa' : 'Cobertura de leitura a conferir'}</span></div>
      {data.resumo ? <div className="rounded-xl border border-aletis-borda p-4"><h3 className="text-sm font-bold text-foreground">Resumo da leitura</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-soft)] dark:text-white/65">{data.resumo}</p></div> : <p className="rounded-xl bg-muted p-4 text-sm text-foreground">A leitura ainda não disponibilizou um resumo. Acompanhe o estado de processamento na lista de arquivos.</p>}
      {Boolean(data.achados?.length) && <div><h3 className="mb-2 text-sm font-bold text-foreground dark:text-white">Pontos que merecem conferência{data.totais ? ` · exibindo ${data.achados?.length || 0} de ${data.totais.achados}` : ''}</h3><ul className="space-y-2">{data.achados!.map((finding, index) => <li key={index} className="rounded-xl border border-aletis-borda p-3"><p className="text-sm font-semibold text-foreground dark:text-white">{finding.titulo}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/65">{finding.descricao}</p></li>)}</ul></div>}
      {Boolean(data.campos?.length) && <div><h3 className="mb-2 text-sm font-bold text-foreground dark:text-white">Informações encontradas{data.totais ? ` · exibindo ${data.campos?.length || 0} de ${data.totais.campos}` : ''}</h3><dl className="grid gap-2 sm:grid-cols-2">{data.campos!.map((field, index) => <div key={index} className="min-w-0 rounded-xl border border-aletis-borda p-3"><dt className="text-xs font-semibold text-[var(--text-soft)] dark:text-white/65">{field.rotulo}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground dark:text-white">{field.valor === null ? 'Não identificado' : String(field.valor)}</dd>{field.fonte && <p className="mt-2 break-words text-[11px] text-[var(--text-soft)] dark:text-white/60">Fonte: {field.fonte}</p>}</div>)}</dl></div>}
    </div>}
  </PortalPanelDialog>
}


interface SharedProgressItem { id: string; data: string; tipo: string; descricao: string; detalhes?: string }
function SharedProgress({ base, clienteNome }: { base: string; clienteNome?: string }) {
  const [items, setItems] = useState<SharedProgressItem[]>([])
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const guard = useRef(false)
  const alive = useRef(true)
  const key = useRef(crypto.randomUUID())
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    apiFetch<SharedProgressItem[]>(`${base}/andamentos`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setItems(data); setError(null) } }).catch(error => { if (!controller.signal.aborted) setError(error.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { alive.current = false; controller.abort() }
  }, [base, retry])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (guard.current || titulo.trim().length < 2 || !descricao.trim()) return
    guard.current = true; setBusy(true); setError(null); setNotice(null)
    try {
      await apiFetch(`${base}/andamentos`, { method: 'POST', headers: { 'Idempotency-Key': key.current }, body: JSON.stringify({ titulo: titulo.trim(), descricao: descricao.trim() }) })
      if (alive.current) { setTitulo(''); setDescricao(''); key.current = crypto.randomUUID(); setNotice('Andamento publicado no histórico do portal do cliente.'); setRetry(value => value + 1) }
    } catch (error) { if (alive.current) setError(error instanceof Error ? error.message : 'Não foi possível publicar o andamento.') }
    finally { guard.current = false; if (alive.current) setBusy(false) }
  }
  return <details className="border-t border-aletis-borda p-4 sm:p-5 dark:border-white/10">
    <summary className="cursor-pointer font-display text-sm font-semibold text-foreground dark:text-white">Andamentos compartilhados com o cliente <span className="font-normal text-[var(--text-soft)]">({items.length})</span></summary>
    <p className="mt-3 text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/65">Publique uma explicação clara do que aconteceu e dos próximos passos para {clienteNome || 'o cliente'}. O conteúdo abaixo ficará visível no histórico do portal.</p>
    <form onSubmit={event => void submit(event)} className="mt-4 space-y-3">
      <label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/65">Título do andamento<input required minLength={2} maxLength={160} value={titulo} onChange={event => setTitulo(event.target.value)} className={input} /></label>
      <label className="block text-xs font-semibold text-[var(--text-soft)] dark:text-white/65">Atualização para o cliente<textarea required rows={3} maxLength={3000} value={descricao} onChange={event => setDescricao(event.target.value)} className={input} /></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 underline">Atualizar histórico</button></p>}
      {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      <button type="submit" disabled={busy || titulo.trim().length < 2 || !descricao.trim()} className={primary}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Publicar andamento no portal</button>
    </form>
    <button type="button" onClick={() => setRetry(value => value + 1)} className={`${secondary} mt-4`}><RefreshCw size={13} />Atualizar andamentos</button>
    <div className="mt-5">{loading ? <p className="text-xs text-[var(--text-soft)]">Carregando histórico…</p> : !items.length ? <p className="text-xs text-[var(--text-soft)]">Nenhum andamento publicado pela equipe.</p> : <ol className="space-y-3">{[...items].sort((a, b) => b.data.localeCompare(a.data)).map(item => <li key={item.id} className="rounded-xl border border-aletis-borda p-3 dark:border-white/10"><p className="text-xs text-[var(--text-soft)] dark:text-white/60">{formatDateTime(item.data)}</p><h4 className="mt-1 break-words text-sm font-semibold text-foreground dark:text-white">{item.descricao}</h4>{item.detalhes && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/65">{item.detalhes}</p>}</li>)}</ol>}</div>
  </details>
}
