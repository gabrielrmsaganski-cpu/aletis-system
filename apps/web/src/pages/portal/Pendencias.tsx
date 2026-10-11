import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, CheckCheck, CheckCircle2, Clock, FileText, Inbox, Loader2, RotateCcw, Upload, X } from 'lucide-react'
import { CATEGORIA_LABEL, type PendenciaDTO, type UploadDTO } from './types'
import { fmtBytes, formatDateTime } from './utils'
import { canUploadToRequest, needsClientAction, portalDateOnly, publicAnalysisLabel, publicDriveLabel, PORTAL_UPLOAD_ACCEPT, requestIsOverdue, REQUEST_PRIORITY_LABEL, REQUEST_STATUS_LABEL, sortPortalRequests } from './DocumentWorkflow'
import type { PortalUploadQueueControls } from './usePortalUploadQueue'

const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-aletis-verde px-4 py-2 text-sm font-semibold text-white transition hover:bg-aletis-verde-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aletis-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export function PendenciasInbox({ pendencias, uploads, queue, selectedRequestId, onOpenUpload }: {
  pendencias: PendenciaDTO[]
  uploads: UploadDTO[]
  queue: PortalUploadQueueControls
  selectedRequestId?: string
  onOpenUpload?: (id: string) => void
}) {
  const [filter, setFilter] = useState<'acao' | 'revisao' | 'concluidos' | 'todos'>('acao')
  const sorted = useMemo(() => sortPortalRequests(pendencias), [pendencias])
  const selected = pendencias.find(request => request.id === selectedRequestId)
  useEffect(() => {
    if (!selected) return
    setFilter(needsClientAction(selected) ? 'acao' : selected.status === 'enviado' ? 'revisao' : 'concluidos')
    const timer = window.setTimeout(() => { const card = document.getElementById(`portal-pedido-${selected.id}`); card?.focus({ preventScroll: true }); card?.scrollIntoView?.({ block: 'start', behavior: 'auto' }) }, 0)
    return () => window.clearTimeout(timer)
  }, [selectedRequestId, selected?.status])
  const counts = {
    acao: pendencias.filter(needsClientAction).length,
    revisao: pendencias.filter(p => p.status === 'enviado').length,
    concluidos: pendencias.filter(p => p.status === 'aprovado' || p.status === 'cancelado').length,
    todos: pendencias.length,
  }
  const filtered = sorted.filter(p => filter === 'todos' || (filter === 'acao' ? needsClientAction(p) : filter === 'revisao' ? p.status === 'enviado' : p.status === 'aprovado' || p.status === 'cancelado'))

  return (
    <div className="card-premium min-w-0 p-4 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-aletis-gold/40 bg-aletis-gold/15 text-aletis-gold-escuro"><Inbox size={21} /></div>
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">O que preciso enviar</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Siga a orientação de cada pedido. Você pode enviar todas as páginas e os anexos juntos.</p>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar solicitações de documentos">
        {([['acao', 'Para enviar'], ['revisao', 'Em conferência'], ['concluidos', 'Concluídos'], ['todos', 'Todos']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold ${filter === id ? 'border-aletis-verde bg-aletis-verde text-white' : 'border-aletis-cream-escuro bg-card text-foreground hover:bg-aletis-cream'}`}>
            {label} <span className="ml-1 opacity-75">{counts[id]}</span>
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-aletis-sage/40 bg-aletis-sage/10 p-5 text-foreground">
          <CheckCheck className="mb-3 h-6 w-6" />
          <p className="font-semibold">{filter === 'acao' ? 'Nenhum envio pendente neste momento' : 'Nenhum pedido nesta lista'}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{counts.revisao > 0 && filter === 'acao' ? `${counts.revisao} pedido(s) já recebido(s) estão em conferência. Se a equipe precisar de algum ajuste, a orientação aparecerá aqui.` : 'Novas solicitações aparecem aqui conforme o andamento do seu atendimento.'}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(p => <RequestCard key={p.id} request={p} uploads={uploads.filter(u => u.pendenciaId === p.id)} queue={queue} selected={p.id === selectedRequestId} onOpenUpload={onOpenUpload} />)}
        </ul>
      )}
    </div>
  )
}

function RequestCard({ request: p, uploads, queue, selected, onOpenUpload }: { request: PendenciaDTO; uploads: UploadDTO[]; queue: PortalUploadQueueControls; selected?: boolean; onOpenUpload?: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const overdue = requestIsOverdue(p)
  const active = queue.items.filter(item => item.pendenciaId === p.id && ['aguardando', 'enviando'].includes(item.status)).length
  const canUpload = canUploadToRequest(p)
  const statusClass = p.status === 'rejeitado' ? 'border-amber-300 bg-amber-50' : p.status === 'aprovado' ? 'border-aletis-sage/60 bg-aletis-sage/10' : 'border-aletis-cream-escuro bg-aletis-cream-papel/50'
  return (
    <li id={`portal-pedido-${p.id}`} tabIndex={-1} aria-label={`Pedido: ${p.titulo}`} className={`min-w-0 scroll-mt-28 rounded-2xl border p-4 outline-none focus:ring-2 focus:ring-aletis-gold sm:p-5 ${statusClass} ${selected ? 'ring-2 ring-aletis-gold' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-current/10 bg-white/80 px-2.5 py-1 text-foreground">
          {p.status === 'aprovado' ? <CheckCheck size={13} /> : p.status === 'enviado' ? <Clock size={13} /> : p.status === 'rejeitado' ? <AlertCircle size={13} /> : <FileText size={13} />}
          {REQUEST_STATUS_LABEL[p.status]}
        </span>
        {needsClientAction(p) && p.prioridade && p.prioridade !== 'normal' && <span className={p.prioridade === 'urgente' ? 'text-red-700' : 'text-amber-800'}>{REQUEST_PRIORITY_LABEL[p.prioridade]}</span>}
        {p.obrigatorio && <span className="text-muted-foreground">Necessário</span>}
      </div>
      <h4 className="break-words font-display text-base font-bold text-foreground">{p.titulo}</h4>
      {p.descricao && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{p.descricao}</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span>{CATEGORIA_LABEL[p.categoria]}</span>
        {p.tipoDocumento && <span className="break-words">Tipo esperado: {p.tipoDocumento}</span>}
        {p.prazo && <span className={`inline-flex items-center gap-1 font-semibold ${overdue ? 'text-red-700' : ''}`}><CalendarDays size={13} />{overdue ? 'Prazo passado: ' : 'Enviar até '}{portalDateOnly(p.prazo)}</span>}
      </div>
      {p.observacao && p.status === 'rejeitado' && <div className="mt-4 rounded-xl border border-amber-200 bg-card px-3 py-3 text-sm leading-relaxed text-amber-900"><p className="font-bold">O que ajustar no novo envio</p><p className="mt-1 whitespace-pre-wrap break-words">{p.observacao}</p></div>}
      {p.status === 'enviado' && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Recebemos seus arquivos. A equipe vai conferir o pedido e avisar aqui se precisar de algo mais.</p>}
      {uploads.length > 0 && <details className="mt-4 rounded-xl border border-aletis-cream-escuro bg-white/75 px-3 py-2">
        <summary className="min-h-8 cursor-pointer py-1 text-xs font-semibold text-foreground">{uploads.length} arquivo(s) recebido(s) neste pedido</summary>
        <ul className="mt-2 space-y-3 pb-1">{[...uploads].sort((a, b) => b.enviadoEm.localeCompare(a.enviadoEm)).map(u => <li key={u.id} className="border-t border-aletis-cream-escuro pt-3 text-xs text-muted-foreground"><p className="break-words font-semibold text-foreground">{u.nomeOriginal}</p><p className="mt-1">{formatDateTime(u.enviadoEm)} · {fmtBytes(u.tamanho)}{u.versao ? ` · Versão ${u.versao}` : ''}</p><p className="mt-1">{publicAnalysisLabel(u.analiseStatus)} · {publicDriveLabel(u.driveStatus)}</p>{u.review && <p className="mt-2 whitespace-pre-wrap break-words">{u.review.status === 'aprovado' ? 'Conferido pela equipe' : 'Ajuste solicitado'}{u.review.observacao ? `: ${u.review.observacao}` : ''}</p>}{onOpenUpload && <button type="button" onClick={() => onOpenUpload(u.id)} className="mt-2 min-h-11 rounded-lg border border-aletis-cream-escuro px-3 font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-aletis-gold" aria-label={`Abrir arquivo recebido ${u.nomeOriginal}`}>Abrir arquivo</button>}</li>)}</ul>
      </details>}
      {canUpload && <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">PDF, foto, Word ou planilha · até 20 MB por arquivo</p>
        <input ref={input} type="file" multiple accept={PORTAL_UPLOAD_ACCEPT} className="sr-only" tabIndex={-1} aria-label={`Arquivos para ${p.titulo}`} onChange={event => { const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; queue.enqueue(files, p) }} />
        <button type="button" onClick={() => input.current?.click()} className={`${buttonClass} shrink-0`} aria-label={`${p.status === 'rejeitado' ? 'Enviar correção' : p.status === 'enviado' ? 'Adicionar arquivos' : 'Enviar arquivos'}: ${p.titulo}`}>
          {active ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {p.status === 'rejeitado' ? 'Enviar correção' : p.status === 'enviado' ? 'Adicionar arquivos' : 'Enviar arquivos'}
        </button>
      </div>}
    </li>
  )
}

export function UploadEspontaneo({ queue }: { queue: PortalUploadQueueControls }) {
  const [drag, setDrag] = useState(false)
  const [categoria, setCategoria] = useState<PendenciaDTO['categoria']>('outros')
  const input = useRef<HTMLInputElement>(null)
  const enqueue = (files: FileList | null) => { if (files?.length) queue.enqueue(Array.from(files), undefined, categoria) }
  return (
    <section className={`rounded-2xl border-2 border-dashed p-5 transition ${drag ? 'border-aletis-gold bg-aletis-gold/10' : 'border-aletis-cream-escuro bg-card'}`} onDragOver={event => { event.preventDefault(); setDrag(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrag(false) }} onDrop={event => { event.preventDefault(); setDrag(false); enqueue(event.dataTransfer.files) }}>
      <Upload className="mb-3 h-6 w-6 text-aletis-gold-escuro" />
      <h3 className="font-display text-base font-bold text-foreground">Enviar outro documento</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Para arquivos que não fazem parte dos pedidos ao lado. Eles também serão recebidos e organizados no seu atendimento.</p>
      <label className="mt-4 block text-xs font-semibold text-foreground">Categoria
        <select value={categoria} onChange={event => setCategoria(event.target.value as PendenciaDTO['categoria'])} className="mt-1 min-h-11 w-full rounded-xl border border-aletis-cream-escuro bg-card px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20">
          {Object.entries(CATEGORIA_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <input ref={input} type="file" multiple className="sr-only" tabIndex={-1} aria-label="Outros documentos" accept={PORTAL_UPLOAD_ACCEPT} onChange={event => { enqueue(event.currentTarget.files); event.currentTarget.value = '' }} />
      <button type="button" onClick={() => input.current?.click()} className={`${buttonClass} mt-3 w-full`}><Upload size={16} />Escolher arquivos</button>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Ou arraste aqui. Até 20 arquivos por seleção, com no máximo 20 MB cada. Confira se todas as páginas estão nítidas.</p>
    </section>
  )
}

export function PortalUploadQueuePanel({ queue }: { queue: PortalUploadQueueControls }) {
  if (!queue.items.length && !queue.notice) return null
  return (
    <section className="card-premium min-w-0 p-4 sm:p-5" aria-label="Acompanhamento dos envios">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-foreground">Seus envios</h3>
        {queue.items.some(item => item.status === 'recebido') && <button type="button" onClick={queue.clearReceived} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-foreground hover:bg-aletis-cream">Limpar concluídos da fila</button>}
      </div>
      {queue.notice && <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{queue.notice}</p>}
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{queue.busy ? 'Mantenha esta página aberta até aparecer “Recebido”. Você pode navegar pelas abas do portal.' : 'Os arquivos recebidos ficam disponíveis no histórico abaixo, mesmo depois de limpar esta fila.'}</p>
      <ul className="max-h-[420px] space-y-2 overflow-y-auto">
        {queue.items.map(item => <li key={item.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-aletis-cream-escuro p-3">
          {item.status === 'recebido' ? <CheckCircle2 size={18} className="mt-1 shrink-0 text-foreground" /> : item.status === 'enviando' ? <Loader2 size={18} className="mt-1 shrink-0 animate-spin text-aletis-gold-escuro" /> : item.status === 'erro' ? <AlertCircle size={18} className="mt-1 shrink-0 text-red-700" /> : <Clock size={18} className="mt-1 shrink-0 text-muted-foreground" />}
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-semibold text-foreground">{item.nome}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">{fmtBytes(item.tamanho)} · {item.pedido || 'Outro documento'}</p>
            {item.status === 'enviando' && <><div role="progressbar" aria-label={`Envio de ${item.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progresso} className="mt-2 h-1.5 overflow-hidden rounded-full bg-aletis-cream-escuro"><div className="h-full bg-aletis-verde transition-all" style={{ width: `${item.progresso}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">{item.progresso >= 99 ? 'Confirmando recebimento…' : `Enviando · ${item.progresso}%`}</p></>}
            {item.status === 'aguardando' && <p className="mt-1 text-xs text-muted-foreground">Aguardando envio</p>}
            {item.status === 'recebido' && <p role="status" className="mt-1 break-words text-xs font-semibold text-foreground">Recebido · {item.recibo ? formatDateTime(item.recibo.enviadoEm) : ''}<span className="mt-1 block font-normal">Comprovante: {item.recibo?.id}</span></p>}
            {item.erro && <p role="alert" className="mt-2 text-xs leading-relaxed text-red-700">{item.erro}</p>}
            {item.status === 'erro' && item.retryable && <button type="button" onClick={() => queue.retry(item.id)} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-aletis-cream-escuro px-3 text-xs font-semibold text-foreground"><RotateCcw size={14} />Tentar novamente</button>}
          </div>
          {item.status !== 'enviando' && item.status !== 'recebido' && <button type="button" onClick={() => queue.remove(item.id)} aria-label={`Remover ${item.nome} da fila`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-aletis-cream"><X size={16} /></button>}
        </li>)}
      </ul>
    </section>
  )
}
