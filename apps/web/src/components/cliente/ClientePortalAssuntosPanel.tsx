import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClienteDemanda } from '@aletis/shared-types'
import { ArrowDown, ArrowUp, CheckCircle2, ClipboardList, Eye, FilePenLine, Loader2, Plus, RefreshCw, Send, Trash2, X } from 'lucide-react'
import { ApiError, apiFetch } from '../../hooks/useApi'
import { MATTER_STATUS_LABEL, matterDate, matterProgress, MILESTONE_STATUS_LABEL, type PortalMatter, type PortalMattersData, type PortalMilestone, type PortalMilestoneStatus } from '../../pages/portal/PortalMattersModel'

const input = 'mt-1 min-h-10 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-aletis-gold disabled:opacity-65 dark:border-white/20 dark:bg-black/10 dark:text-white'
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-aletis-borda px-3 py-2 text-xs font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-aletis-gold disabled:opacity-50 dark:border-white/20 dark:text-white'
const label = 'block text-xs font-semibold text-[var(--text-soft)] dark:text-white/65'
const freshId = () => globalThis.crypto.randomUUID()
const dateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
const toLocalInput = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
interface MatterDraft {
  demandaId?: string
  titulo: string
  resumo: string
  status: PortalMatter['status']
  responsavel: string
  proximoPasso: string
  dependeDe: PortalMatter['dependeDe']
  prazo: string
  marcos: Array<PortalMilestone & { concluidoLocal: string }>
}
type DemandOrigin = Pick<ClienteDemanda, 'id' | 'titulo'>
function draftFrom(matter?: PortalMatter, origin?: DemandOrigin): MatterDraft {
  return { demandaId: matter?.demandaId || origin?.id, titulo: matter?.titulo || origin?.titulo.slice(0, 160) || '', resumo: matter?.resumo || '', status: matter?.status || 'nao_iniciado', responsavel: matter?.responsavel || '', proximoPasso: matter?.proximoPasso || '', dependeDe: matter?.dependeDe || 'equipe', prazo: matter?.prazo || '', marcos: (matter?.marcos || []).map(item => ({ ...item, concluidoLocal: toLocalInput(item.concluidoEm) })) }
}

export default function ClientePortalAssuntosPanel({ clienteId }: { clienteId: string }) { return <MattersPanel key={clienteId} clienteId={clienteId} /> }

function MattersPanel({ clienteId }: { clienteId: string }) {
  const [items, setItems] = useState<PortalMatter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<'todos' | 'publicados' | 'rascunhos'>('todos')
  const [search, setSearch] = useState('')
  const [visible, setVisible] = useState(8)
  const [editing, setEditing] = useState<PortalMatter | 'new' | null>(null)
  const [origin, setOrigin] = useState<DemandOrigin | undefined>()
  const [showImport, setShowImport] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const base = `/clientes/${encodeURIComponent(clienteId)}/portal/assuntos`
  const load = useCallback(async () => {
    const version = ++generation.current; request.current?.abort()
    const current = new AbortController(); request.current = current; setLoading(true)
    try {
      const response = await apiFetch<PortalMattersData>(base, { signal: current.signal })
      if (!current.signal.aborted && generation.current === version) { setItems(response.assuntos); setError(null) }
    } catch (error) {
      if (!current.signal.aborted && generation.current === version) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setItems([])
        setError(error instanceof Error ? error.message : 'Não foi possível carregar os assuntos do portal.')
      }
    } finally { if (!current.signal.aborted && generation.current === version) setLoading(false) }
  }, [base])
  useEffect(() => { void load(); return () => { generation.current += 1; request.current?.abort() } }, [load])
  const published = items.filter(item => item.visibilidade === 'publicado').length
  const filtered = items.filter(item => (filter === 'todos' || item.visibilidade === (filter === 'publicados' ? 'publicado' : 'rascunho')) && `${item.titulo} ${item.responsavel || ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR').trim()))
  const openEditor = (item: PortalMatter | 'new', source?: DemandOrigin) => { setOrigin(source); setEditing(item); setShowImport(false); setPreview(null); setNotice(null) }
  return <section aria-labelledby="client-portal-matters-heading" className="rounded-lg border border-aletis-borda bg-card p-4 shadow-sm sm:p-5 dark:border-white/10 dark:bg-white/5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="client-portal-matters-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-foreground dark:text-white"><ClipboardList size={20} />Assuntos no portal do cliente</h2><p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/60">Compartilhe o plano, o trabalho concluído e o próximo passo de cada assunto. Rascunhos ficam disponíveis à equipe; o cliente vê as versões publicadas.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={loading || !!editing} onClick={() => void load()} className={button} aria-label="Atualizar assuntos do portal"><RefreshCw size={15} /></button><button type="button" disabled={!!editing} onClick={() => openEditor('new')} className={`${button} border-aletis-verde bg-aletis-verde text-white`}><Plus size={15} />Novo assunto</button><button type="button" disabled={loading || !!editing} aria-expanded={showImport} className={button} onClick={() => setShowImport(value => !value)}><ClipboardList size={15} />Usar assunto do CRM como rascunho</button></div></div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {showImport && <DemandPicker clienteId={clienteId} matters={items} onChoose={source => { const existing = items.find(item => item.demandaId === source.id); openEditor(existing || 'new', existing ? undefined : source) }} onClose={() => setShowImport(false)} />}
    {editing && <MatterEditor key={editing === 'new' ? `new:${origin?.id || ''}` : `${editing.id}:${editing.atualizadoEm}`} base={base} matter={editing === 'new' ? undefined : editing} origin={origin} onClose={() => setEditing(null)} onSaved={result => { setEditing(null); setNotice(result.visibilidade === 'publicado' ? 'Assunto publicado. O plano e a atualização estão disponíveis no portal do cliente.' : 'Rascunho salvo para a equipe. Publique quando o plano estiver pronto.'); void load() }} onReload={() => { setEditing(null); void load() }} />}
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar assuntos da equipe">{([['todos', `Todos (${items.length})`], ['publicados', `Publicados (${published})`], ['rascunhos', `Rascunhos (${items.length - published})`]] as const).map(([value, title]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setVisible(8) }} className={`${button} ${filter === value ? 'bg-muted dark:bg-white/10' : ''}`}>{title}</button>)}</div><label className="min-w-0 flex-1 sm:max-w-xs"><span className="sr-only">Buscar assunto da equipe</span><input type="search" value={search} onChange={event => { setSearch(event.target.value); setVisible(8) }} placeholder="Buscar assunto ou responsável" className={input} /></label></div>
    {loading && !items.length ? <p role="status" className="mt-4 text-sm text-[var(--text-soft)]">Carregando assuntos…</p> : !filtered.length ? <p className="mt-4 rounded-xl border border-dashed border-aletis-borda p-5 text-sm leading-relaxed text-[var(--text-soft)] dark:text-white/60">{items.length ? 'Nenhum assunto corresponde a este filtro.' : 'Publique o primeiro assunto para que o cliente acompanhe o plano, as etapas e os próximos passos.'}</p> : <ul className="mt-4 space-y-3">{filtered.slice(0, visible).map(item => { const progress = matterProgress(item); return <li key={item.id} className="min-w-0 rounded-xl border border-aletis-borda p-4 dark:border-white/10"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 text-[11px] font-semibold"><span className={`rounded-full px-2 py-1 ${item.visibilidade === 'publicado' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{item.visibilidade === 'publicado' ? 'Visível ao cliente' : 'Rascunho da equipe'}</span><span className="py-1 text-[var(--text-soft)] dark:text-white/60">{MATTER_STATUS_LABEL[item.status]}</span></div><h3 className="mt-2 break-words text-sm font-semibold text-foreground dark:text-white">{item.titulo}</h3><p className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/60">{item.proximoPasso || item.resumo}</p><p className="mt-2 text-xs text-[var(--text-soft)] dark:text-white/60">{progress.total ? `${progress.concluidos}/${progress.total} etapas concluídas` : 'Sem etapas definidas'} · {item.responsavel || 'Equipe ALETIS'}{item.prazo && ` · Prazo: ${matterDate(item.prazo)}`}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={() => setPreview(preview === item.id ? null : item.id)} aria-expanded={preview === item.id}><Eye size={14} />Prévia</button><button type="button" disabled={!!editing} className={button} onClick={() => openEditor(item)}><FilePenLine size={14} />{item.visibilidade === 'publicado' ? 'Atualizar' : 'Revisar e publicar'}</button></div></div><p className="mt-3 text-[11px] text-[var(--text-soft)] dark:text-white/50">Atualizado em {dateTime(item.atualizadoEm)}</p>{preview === item.id && <MatterPreview matter={item} />}</li> })}</ul>}
    {filtered.length > visible && <button type="button" onClick={() => setVisible(value => value + 8)} className={`${button} mt-4 w-full`}>Mostrar mais assuntos</button>}
  </section>
}

function DemandPicker({ clienteId, matters, onChoose, onClose }: { clienteId: string; matters: PortalMatter[]; onChoose: (source: DemandOrigin) => void; onClose: () => void }) {
  const [items, setItems] = useState<DemandOrigin[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    setLoading(true); setError('')
    try {
      const response = await apiFetch<ClienteDemanda[]>(`/clientes/${encodeURIComponent(clienteId)}/demandas`, { signal: controller.signal })
      // O rascunho recebe apenas a referência e o título, que serão revisados antes da publicação.
      if (!controller.signal.aborted) setItems(response.map(item => ({ id: item.id, titulo: item.titulo })))
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Não foi possível carregar os assuntos do CRM.') }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }, [clienteId])
  useEffect(() => { void load(); return () => { request.current?.abort() } }, [load])
  const source = items.find(item => item.id === selected)
  const existing = matters.find(item => item.demandaId === selected)
  return <div className="mt-4 min-w-0 rounded-xl border border-aletis-sage/40 bg-muted p-4 dark:border-white/15 dark:bg-black/10"><p className="text-sm font-semibold text-foreground dark:text-white">Vincular um assunto já cadastrado no CRM</p><p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/60">Escolha a referência e revise o título. Depois, prepare o resumo e o plano que ficarão disponíveis no portal.</p>
    {loading ? <p role="status" className="mt-3 text-sm text-[var(--text-soft)] dark:text-white/60">Carregando assuntos do CRM…</p> : error ? <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" onClick={() => void load()} className="ml-2 min-h-10 font-semibold underline">Tentar novamente</button></div> : !items.length ? <p className="mt-3 text-sm text-[var(--text-soft)] dark:text-white/60">Este cliente ainda não tem assuntos cadastrados no CRM. Você pode preparar um novo plano pelo botão Novo assunto.</p> : <label className={`${label} mt-3`}>Assunto do CRM<select value={selected} onChange={event => setSelected(event.target.value)} className={input}><option value="">Selecione um assunto</option>{items.map(item => <option key={item.id} value={item.id}>{item.titulo}{matters.some(matter => matter.demandaId === item.id) ? ' · Já possui plano no portal' : ''}</option>)}</select></label>}
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={loading || !source} onClick={() => { if (source) onChoose(source) }} className={`${button} border-aletis-verde bg-aletis-verde text-white`}>{existing ? 'Abrir plano existente' : 'Preparar rascunho vinculado'}</button><button type="button" className={button} onClick={onClose}>Fechar seleção</button></div>
  </div>
}

function MatterEditor({ base, matter, origin, onClose, onSaved, onReload }: { base: string; matter?: PortalMatter; origin?: DemandOrigin; onClose: () => void; onSaved: (result: PortalMatter) => void; onReload: () => void }) {
  const [draft, setDraft] = useState<MatterDraft>(() => draftFrom(matter, origin))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const guard = useRef(false)
  const request = useRef<AbortController | null>(null)
  const attempt = useRef<{ body: string; key: string } | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const published = matter?.visibilidade === 'publicado'
  useEffect(() => () => { request.current?.abort() }, [])
  const update = <K extends keyof MatterDraft>(key: K, value: MatterDraft[K]) => { setDraft(current => ({ ...current, [key]: value })); setConfirmed(false) }
  const updateMilestone = (id: string, patch: Partial<MatterDraft['marcos'][number]>) => { setDraft(current => ({ ...current, marcos: current.marcos.map(item => item.id === id ? { ...item, ...patch } : item) })); setConfirmed(false) }
  const changeStatus = (status: PortalMatter['status']) => {
    setDraft(current => ({ ...current, status, dependeDe: status === 'aguardando_cliente' ? 'cliente' : status === 'aguardando_terceiro' ? 'terceiro' : status === 'concluido' || status === 'cancelado' ? 'nenhum' : current.dependeDe === 'nenhum' ? 'equipe' : current.dependeDe }))
    setConfirmed(false)
  }
  const moveMilestone = (index: number, delta: number) => {
    if (index + delta < 0 || index + delta >= draft.marcos.length) return
    setDraft(current => { const marcos = [...current.marcos]; [marcos[index], marcos[index + delta]] = [marcos[index + delta], marcos[index]]; return { ...current, marcos } }); setConfirmed(false)
  }
  async function save(visibility: PortalMatter['visibilidade']) {
    if (guard.current || !form.current?.reportValidity()) return
    if (visibility === 'publicado' && !confirmed) { setError('Confira a prévia e confirme o texto que ficará disponível ao cliente.'); return }
    if (visibility === 'publicado' && !['concluido', 'cancelado'].includes(draft.status) && draft.proximoPasso.trim().length < 3) { setError('Informe um próximo passo claro para este assunto em aberto.'); return }
    if (draft.marcos.some(item => item.status === 'concluido' && !item.concluidoLocal)) { setError('Informe quando cada etapa concluída foi realizada.'); return }
    let marcos: PortalMilestone[]
    try {
      marcos = draft.marcos.map(({ concluidoLocal, concluidoEm: _previous, ...item }) => ({ ...item, titulo: item.titulo.trim(), descricao: item.descricao?.trim() || undefined, prazo: item.prazo || undefined, ...(item.status === 'concluido' ? { concluidoEm: matter?.marcos.find(previous => previous.id === item.id && previous.status === 'concluido')?.concluidoEm || new Date(concluidoLocal).toISOString() } : {}) }))
    } catch { setError('Confira as datas de conclusão das etapas.'); return }
    const payload = {
      titulo: draft.titulo.trim(), resumo: draft.resumo.trim(), status: draft.status, responsavel: draft.responsavel.trim() || undefined,
      proximoPasso: draft.proximoPasso.trim() || undefined, dependeDe: draft.dependeDe, prazo: draft.prazo || undefined, marcos, visibilidade: visibility,
      ...(draft.demandaId ? { demandaId: draft.demandaId } : {}), ...(matter ? { expectedUpdatedAt: matter.atualizadoEm } : {}),
    }
    const body = JSON.stringify(payload)
    if (!attempt.current || attempt.current.body !== body) attempt.current = { body, key: freshId() }
    const controller = new AbortController(); request.current = controller
    guard.current = true; setBusy(true); setError(null); setConflict(false)
    try {
      const result = await apiFetch<PortalMatter>(matter ? `${base}/${encodeURIComponent(matter.id)}` : base, { method: matter ? 'PATCH' : 'POST', body, headers: matter ? undefined : { 'Idempotency-Key': attempt.current.key }, signal: controller.signal })
      if (!controller.signal.aborted) onSaved(result)
    } catch (error) {
      if (!controller.signal.aborted) { setError(error instanceof Error ? error.message : 'Não foi possível salvar este assunto.'); setConflict(error instanceof ApiError && error.status === 409) }
    } finally { guard.current = false; if (!controller.signal.aborted) setBusy(false) }
  }
  const previewMilestones = draft.marcos.map(item => ({ ...item, concluidoEm: item.status === 'concluido' && item.concluidoLocal && Number.isFinite(new Date(item.concluidoLocal).getTime()) ? new Date(item.concluidoLocal).toISOString() : undefined }))
  const previewMatter: PortalMatter = { id: matter?.id || 'preview', clienteId: matter?.clienteId || '', titulo: draft.titulo || 'Título do assunto', resumo: draft.resumo || 'Resumo do acompanhamento', status: draft.status, responsavel: draft.responsavel, proximoPasso: draft.proximoPasso, dependeDe: draft.dependeDe, prazo: draft.prazo, visibilidade: 'publicado', marcos: previewMilestones, criadoEm: matter?.criadoEm || new Date().toISOString(), atualizadoEm: matter?.atualizadoEm || new Date().toISOString() }
  return <form ref={form} onSubmit={event => { event.preventDefault(); void save(published ? 'publicado' : 'rascunho') }} className="mt-5 space-y-5 rounded-lg border border-aletis-sage/50 bg-muted p-4 sm:p-5 dark:border-white/15 dark:bg-black/10" aria-label={matter ? 'Editar assunto do portal' : 'Novo assunto do portal'}>
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-display font-semibold text-foreground dark:text-white">{matter ? `Atualizar: ${matter.titulo}` : 'Preparar um assunto para o cliente'}</h3><p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/60">Todos os textos e etapas deste formulário serão visíveis ao cliente quando publicados. Use orientações claras e descreva somente o trabalho efetivamente realizado.</p></div><button type="button" disabled={busy} onClick={onClose} className={button} aria-label="Fechar edição do assunto"><X size={16} /></button></div>
    {draft.demandaId && <p className="rounded-xl border border-aletis-sage/40 bg-card p-3 text-xs leading-relaxed text-foreground dark:bg-white/5 dark:text-white/70">Vinculado ao assunto do CRM. Revise o título e prepare o resumo, a situação e as etapas que o cliente poderá acompanhar.</p>}
    <fieldset disabled={busy} className="grid min-w-0 gap-4 md:grid-cols-2"><label className={`${label} md:col-span-2`}>Título do assunto<input required minLength={3} maxLength={160} value={draft.titulo} onChange={event => update('titulo', event.target.value)} className={input} placeholder="Ex.: Revisão das operações de crédito" /></label><label className={`${label} md:col-span-2`}>Resumo para o cliente<textarea required minLength={3} maxLength={3000} rows={3} value={draft.resumo} onChange={event => update('resumo', event.target.value)} className={input} placeholder="Explique o objetivo, o que está sendo acompanhado e a situação atual." /></label><label className={label}>Situação do assunto<select value={draft.status} onChange={event => changeStatus(event.target.value as PortalMatter['status'])} className={input}>{Object.entries(MATTER_STATUS_LABEL).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label><label className={label}>De quem depende o próximo passo<select value={draft.dependeDe} onChange={event => update('dependeDe', event.target.value as PortalMatter['dependeDe'])} disabled={['aguardando_cliente', 'aguardando_terceiro', 'concluido', 'cancelado'].includes(draft.status)} className={input}><option value="equipe">Equipe ALETIS</option><option value="cliente">Cliente</option><option value="terceiro">Terceiro / órgão / instituição</option><option value="nenhum">Sem ação pendente</option></select></label><label className={label}>Responsável pelo acompanhamento<input maxLength={160} value={draft.responsavel} onChange={event => update('responsavel', event.target.value)} className={input} placeholder="Nome ou equipe responsável" /></label><label className={label}>Prazo previsto<input type="date" value={draft.prazo} onChange={event => update('prazo', event.target.value)} className={input} /><span className="mt-1 block font-normal">Deixe vazio quando o prazo ainda não estiver definido.</span></label><label className={`${label} md:col-span-2`}>Próximo passo que o cliente verá<textarea maxLength={1000} rows={3} value={draft.proximoPasso} onChange={event => update('proximoPasso', event.target.value)} className={input} placeholder="Ex.: Nossa equipe está conferindo os documentos. O próximo passo será apresentar os pontos para sua revisão." /></label></fieldset>
    <fieldset disabled={busy} className="min-w-0"><legend className="text-sm font-semibold text-foreground dark:text-white">Etapas do plano · {draft.marcos.length}/100</legend><p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)] dark:text-white/60">Organize a sequência de trabalho. Para registrar uma etapa concluída, informe a data real. Etapas publicadas permanecem no histórico.</p>
      <ol className="mt-3 space-y-3">{draft.marcos.map((milestone, index) => { const original = matter?.marcos.find(item => item.id === milestone.id); const lockedCompleted = published && original?.status === 'concluido'; const retained = published && !!original; return <li key={milestone.id} className="min-w-0 rounded-xl border border-aletis-borda bg-card p-3 sm:p-4 dark:border-white/15 dark:bg-white/5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-semibold text-foreground dark:text-white">Etapa {index + 1}</h4><div className="flex gap-1"><button type="button" disabled={busy || index === 0} className={button} onClick={() => moveMilestone(index, -1)} aria-label={`Mover etapa ${index + 1} para cima`}><ArrowUp size={13} /></button><button type="button" disabled={busy || index === draft.marcos.length - 1} className={button} onClick={() => moveMilestone(index, 1)} aria-label={`Mover etapa ${index + 1} para baixo`}><ArrowDown size={13} /></button>{!lockedCompleted && <button type="button" disabled={busy || retained && milestone.status === 'cancelado'} className={button} onClick={() => retained ? updateMilestone(milestone.id, { status: 'cancelado', concluidoLocal: '' }) : update('marcos', draft.marcos.filter(item => item.id !== milestone.id))} aria-label={`${retained ? 'Cancelar' : 'Remover'} etapa ${index + 1}`}><Trash2 size={13} />{retained ? 'Cancelar' : 'Remover'}</button>}</div></div><div className="grid min-w-0 gap-3 sm:grid-cols-2"><label className={`${label} sm:col-span-2`}>Nome da etapa {index + 1}<input required minLength={3} maxLength={160} value={milestone.titulo} onChange={event => updateMilestone(milestone.id, { titulo: event.target.value })} className={input} /></label><label className={label}>Situação da etapa {index + 1}<select disabled={lockedCompleted} value={milestone.status} onChange={event => updateMilestone(milestone.id, { status: event.target.value as PortalMilestoneStatus, concluidoLocal: event.target.value === 'concluido' ? milestone.concluidoLocal : '' })} className={input}>{Object.entries(MILESTONE_STATUS_LABEL).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label><label className={label}>Prazo da etapa {index + 1}<input type="date" value={milestone.prazo || ''} onChange={event => updateMilestone(milestone.id, { prazo: event.target.value })} className={input} /></label>{milestone.status === 'concluido' && <label className={`${label} sm:col-span-2`}>Data e hora reais da conclusão da etapa {index + 1}<input required type="datetime-local" value={milestone.concluidoLocal} disabled={lockedCompleted} max={toLocalInput(new Date().toISOString())} onChange={event => updateMilestone(milestone.id, { concluidoLocal: event.target.value })} className={input} /><span className="mt-1 block font-normal">{lockedCompleted ? 'Conclusão já publicada e preservada no histórico.' : 'Use a data em que o trabalho foi realizado. O sistema registra a publicação separadamente.'}</span></label>}<label className={`${label} sm:col-span-2`}>Orientação ou resultado da etapa {index + 1}<textarea rows={2} maxLength={1000} value={milestone.descricao || ''} onChange={event => updateMilestone(milestone.id, { descricao: event.target.value })} className={input} /></label></div></li> })}</ol><button type="button" disabled={busy || draft.marcos.length >= 100} className={`${button} mt-3 bg-card dark:bg-white/5`} onClick={() => update('marcos', [...draft.marcos, { id: freshId(), titulo: '', status: 'pendente', concluidoLocal: '' }])}><Plus size={14} />Adicionar etapa</button>
    </fieldset>
    <div className="space-y-3 border-t border-aletis-borda pt-4 dark:border-white/15"><button type="button" className={button} onClick={() => setShowPreview(value => !value)} aria-expanded={showPreview}><Eye size={15} />{showPreview ? 'Fechar prévia do cliente' : 'Conferir prévia do cliente'}</button>{showPreview && <MatterPreview matter={previewMatter} />}<label className="flex items-start gap-2 rounded-xl bg-card p-3 text-sm leading-relaxed text-foreground dark:bg-white/5 dark:text-white/80"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => { setConfirmed(event.target.checked); setError(null) }} className="mt-1 shrink-0" />Conferi os textos, as etapas e as datas; este plano pode ser mostrado ao cliente.</label></div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-relaxed text-red-800">{error}{conflict && <p className="mt-2">Sua edição foi mantida. Confira o registro atualizado antes de publicar.<button type="button" className="ml-2 min-h-10 font-semibold underline" onClick={onReload}>Recarregar e descartar esta edição</button></p>}</div>}
    <div className="flex flex-wrap gap-2">{!published && <button type="submit" disabled={busy} className={`${button} bg-card dark:bg-white/5`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FilePenLine size={14} />}Salvar rascunho</button>}<button type="button" disabled={busy || !confirmed} onClick={() => void save('publicado')} className={`${button} border-aletis-verde bg-aletis-verde text-white`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{published ? 'Publicar atualização' : 'Publicar no portal'}</button><button type="button" disabled={busy} onClick={onClose} className={button}>Fechar</button></div>
  </form>
}

function MatterPreview({ matter }: { matter: PortalMatter }) {
  return <div className="mt-4 min-w-0 rounded-xl border border-aletis-sage/30 bg-card p-4 dark:border-white/15 dark:bg-black/10"><p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-aletis-gold-escuro"><Eye size={13} />Prévia do conteúdo para o cliente</p><h4 className="mt-3 break-words font-display text-lg font-semibold text-foreground dark:text-white">{matter.titulo}</h4><p className="mt-1 text-xs font-semibold text-muted-foreground dark:text-white/70">{MATTER_STATUS_LABEL[matter.status]} · {matter.responsavel || 'Equipe ALETIS'}{matter.prazo && ` · Prazo: ${matterDate(matter.prazo)}`}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-soft)] dark:text-white/65">{matter.resumo}</p>{matter.proximoPasso && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-sm text-foreground dark:bg-white/5 dark:text-white/80"><strong>Próximo passo: </strong>{matter.proximoPasso}</p>}{matter.marcos.length > 0 && <ol className="mt-3 space-y-2">{matter.marcos.map((item, index) => <li key={item.id} className="text-sm text-[var(--text-soft)] dark:text-white/65"><span className="flex items-start gap-2">{item.status === 'concluido' && <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-muted-foreground" />}<span className="break-words"><strong className="font-semibold">{index + 1}. {item.titulo || 'Nome da etapa'}</strong> · {MILESTONE_STATUS_LABEL[item.status]}</span></span>{item.descricao && <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed">{item.descricao}</p>}{item.prazo && <p className="mt-1 text-xs">Prazo: {matterDate(item.prazo)}</p>}{item.status === 'concluido' && item.concluidoEm && <p className="mt-1 text-xs">Concluída em {dateTime(item.concluidoEm)}</p>}</li>)}</ol>}</div>
}
