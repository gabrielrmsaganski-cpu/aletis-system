import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CalendarClock, Check, CheckCheck, ChevronDown, ClipboardList, Database, Loader2, RefreshCw, Search, Sparkles, UserRound } from 'lucide-react'
import { ApiError, apiFetch, useApi } from '../../hooks/useApi'
import type { AlixOperationalHandoff } from '../../hooks/alix/useAlixOperationalLaunch'

type OperationalItem = {
  id: string
  fingerprint?: string
  kind: string
  priority: 'critical' | 'attention' | 'info'
  title: string
  reason: string
  nextAction: string
  clienteId: string
  clienteName?: string
  dueDate?: string
  owner?: string
  to: string
  sources: Array<{ kind: string; id: string; label: string; updatedAt?: string; documentId?: string; revision?: string; excerpt?: string; page?: number; sheet?: string }>
}

export type OperationalPlan = {
  generatedAt: string
  referenceDate: string
  timeZone: 'America/Cuiaba'
  fingerprint: string
  scope: { clienteId?: string }
  coverage: {
    status: 'complete' | 'partial' | 'unavailable'
    sources: Array<{ key: string; label: string; status: 'available' | 'unavailable'; origin: 'postgres' | 'memory'; records: number | null; detail?: string }>
  }
  counts: { clients: number | null; activeClients: number | null; activeDemands: number | null; openProposals: number | null; priorities: number; overdue: number; dueToday: number; missingNextAction: number; missingOwner: number }
  items: OperationalItem[]
}

type Preparation = { mission: { id: string; title: string; status: string }; plan: OperationalPlan; reused: boolean }
type Filter = 'all' | 'overdue' | 'today' | 'next' | 'owner' | 'documentary'
const filterLabels: Record<Filter, string> = { all: 'Todas', overdue: 'Atrasadas', today: 'Hoje', next: 'Sem próximo passo', owner: 'Sem responsável', documentary: 'Documentos e dados' }
const civilDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : 'Data não informada'
const instant = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Data não informada' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Cuiaba' }).format(date)
}

export default function AlixOperationsPanel({ clienteId, clientes, onScopeChange, onHandoff, handoffDisabledReason }: {
  clienteId?: string
  clientes: Array<{ id: string; nome: string }>
  onScopeChange: (id: string) => void
  onHandoff?: (handoff: AlixOperationalHandoff) => void
  handoffDisabledReason?: string
}) {
  const scope = clienteId || ''
  const resource = useApi<OperationalPlan | null>(`/alix/operations${scope ? `?clienteId=${encodeURIComponent(scope)}` : ''}`, null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(24)
  const [preparation, setPreparation] = useState<{ scope: string; result: Preparation } | null>(null)
  const [feedback, setFeedback] = useState<{ scope: string; error: string } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [handoffId, setHandoffId] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  useEffect(() => {
    setFilter('all')
    setSearch('')
    setLimit(24)
    setPreparing(false)
    setHandoffId(null)
    return () => { request.current?.abort(); request.current = null }
  }, [scope])
  useEffect(() => { setLimit(24) }, [filter, search])
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || resource.loading || preparing || handoffId || request.current) return
      resource.refetch()
    }
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [scope, resource.refetch, resource.loading, preparing, handoffId])

  const saved = preparation?.scope === scope ? preparation.result : null
  const plan = saved && (!resource.data || saved.plan.generatedAt > resource.data.generatedAt) ? saved.plan : resource.data
  const visible = useMemo(() => {
    if (!plan) return []
    const query = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return plan.items.filter(item => {
      if (filter === 'overdue' && !(item.dueDate && item.dueDate < plan.referenceDate)) return false
      if (filter === 'today' && item.dueDate !== plan.referenceDate) return false
      if (filter === 'next' && !item.kind.endsWith('missing_action')) return false
      if (filter === 'owner' && item.owner) return false
      if (filter === 'documentary' && !item.kind.startsWith('documentary_') && !item.kind.startsWith('checklist_')) return false
      return !query || [item.title, item.clienteName, item.clienteId, item.owner, item.reason].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query)
    })
  }, [plan, filter, search])

  async function prepare() {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setPreparing(true)
    setFeedback(null)
    try {
      const result = await apiFetch<Preparation>('/alix/operations/prepare', { method: 'POST', body: JSON.stringify(scope ? { clienteId: scope } : {}), signal: controller.signal })
      if (!controller.signal.aborted) setPreparation({ scope, result })
    } catch (error) {
      if (!controller.signal.aborted) setFeedback({ scope, error: error instanceof Error ? error.message : 'Não foi possível preparar o plano.' })
    } finally {
      if (request.current === controller) { request.current = null; setPreparing(false) }
    }
  }

  const counts = plan?.counts
  async function handoff(item: OperationalItem) {
    if (request.current || handoffDisabledReason || !onHandoff || !item.fingerprint) return
    const controller = new AbortController()
    request.current = controller
    setHandoffId(item.id)
    setFeedback(null)
    try {
      const result = await apiFetch<AlixOperationalHandoff>('/alix/operations/handoff', { method: 'POST', body: JSON.stringify({ clienteId: item.clienteId, itemId: item.id, fingerprint: item.fingerprint }), signal: controller.signal })
      if (!controller.signal.aborted && scopeRef.current === scope) onHandoff(result)
    } catch (error) {
      if (!controller.signal.aborted && scopeRef.current === scope) {
        setFeedback({ scope, error: error instanceof Error ? error.message : 'Não foi possível preparar este trabalho.' })
        if (error instanceof ApiError && error.status === 409) resource.refetch()
      }
    } finally {
      if (request.current === controller) { request.current = null; setHandoffId(null) }
    }
  }

  const unavailable = !plan || plan.coverage.status === 'unavailable'
  const partial = plan?.coverage.status === 'partial'
  const metric = (value?: number | null) => value == null || unavailable ? '—' : value
  return (
    <section className="space-y-5 pb-8 text-stone-900 dark:text-stone-100" aria-labelledby="operations-title">
      <header className="overflow-hidden rounded-2xl bg-[#17251b] text-white">
        <div className="flex flex-col gap-5 p-5 sm:p-7 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#e3bd80]"><Sparkles size={15} /> ALIX · Organização operacional</div>
            <h1 id="operations-title" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Seu dia começa com o próximo passo.</h1>
            <p className="mt-2 text-sm leading-relaxed text-stone-300">Prazos, demandas, propostas e pendências documentais reunidos em uma fila de trabalho. Escolha uma prioridade para a ALIX consultar as fontes, analisar a pendência e preparar o próximo passo.</p>
          </div>
          <button type="button" onClick={() => void prepare()} disabled={preparing || Boolean(handoffId) || unavailable || resource.loading || Boolean(resource.error)} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#e3bd80] px-5 text-sm font-bold text-[#17251b] transition hover:bg-[#f2d4a2] disabled:cursor-wait disabled:opacity-50">
            {preparing ? <Loader2 size={18} className="animate-spin" /> : <ClipboardList size={18} />}
            {preparing ? 'Preparando e salvando…' : 'Preparar meu dia'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 px-5 py-3 text-xs text-stone-300 sm:px-7">
          <span className="inline-flex items-center gap-1.5"><Database size={13} /> CRM, demandas, checklists, propostas e documentos</span>
          <span>{plan ? `Consulta: ${instant(plan.generatedAt)} · Cuiabá` : 'Consultando registros…'}</span>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-stone-500 dark:text-stone-400">Área de trabalho
          <select value={scope} onChange={event => onScopeChange(event.target.value)} className="h-11 max-w-full rounded-lg border border-stone-300 bg-card px-3 text-sm font-medium text-stone-800 dark:border-white/15 dark:bg-[#1c2820] dark:text-white sm:w-80">
            <option value="">Toda a carteira</option>
            {scope && !clientes.some(cliente => cliente.id === scope) && <option value={scope}>Cliente {scope}</option>}
            {clientes.map(cliente => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}
          </select>
        </label>
        <button type="button" onClick={resource.refetch} disabled={resource.loading || preparing || Boolean(handoffId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-300 bg-card px-4 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"><RefreshCw size={15} className={resource.loading ? 'animate-spin' : ''} /> Atualizar leitura</button>
      </div>

      {(resource.error || partial || plan?.coverage.status === 'unavailable') && <div role="status" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div><p className="font-semibold">{resource.error ? 'Não foi possível atualizar a leitura' : partial ? 'Leitura parcial da carteira' : 'Fontes indisponíveis'}</p><p className="mt-1">{resource.error || 'Algumas fontes não responderam. As prioridades exibidas cobrem somente os registros que foi possível consultar.'}{resource.error && plan ? ' A última consulta permanece visível com sua data.' : ''}</p></div></div>}
      {handoffDisabledReason && <p role="status" className="text-sm text-stone-600 dark:text-stone-400">{handoffDisabledReason}</p>}
      {feedback?.scope === scope && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{feedback.error}</p>}
      {saved && <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"><CheckCheck size={19} className="mt-0.5 shrink-0" /><div><p className="font-semibold">{saved.reused ? 'Este plano já estava preparado e foi reutilizado.' : 'Plano preparado e salvo nas missões da ALIX.'}</p><p className="mt-1">{saved.plan.counts.priorities} prioridades registradas. Abra os registros abaixo para executar os próximos passos.</p>{plan && saved.plan.fingerprint !== plan.fingerprint && <p className="mt-1 font-medium">Os dados mudaram desde a preparação. Prepare novamente para salvar a leitura atual.</p>}</div></div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ['Prazos atrasados', counts?.overdue, 'overdue', CalendarClock],
          ['Para hoje', counts?.dueToday, 'today', Check],
          ['Sem próximo passo', counts?.missingNextAction, 'next', ClipboardList],
          ['Sem responsável', counts?.missingOwner, 'owner', UserRound],
        ] as const).map(([label, count, id, Icon]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(filter === id ? 'all' : id)} className={`rounded-xl border bg-card p-4 text-left transition dark:bg-white/5 ${filter === id ? 'border-[#17251b] ring-1 ring-[#17251b] dark:border-[#e3bd80] dark:ring-[#e3bd80]' : 'border-stone-200 hover:border-stone-400 dark:border-white/10'}`}><div className="mb-3 flex items-center justify-between gap-2 text-xs font-medium text-stone-500 dark:text-stone-400"><span>{label}</span><Icon size={16} className="shrink-0" /></div><span className={`text-3xl font-bold tracking-tight ${id === 'overdue' && count ? 'text-rose-700 dark:text-rose-300' : ''}`}>{metric(count)}</span></button>)}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-card dark:border-white/10 dark:bg-white/[0.03]">
          <div className="space-y-4 border-b border-stone-200 p-4 dark:border-white/10 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Fila de trabalho <span className="ml-1 text-sm font-normal text-stone-500">{plan ? `(${visible.length})` : ''}</span></h2><label className="relative block w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-stone-400" /><input aria-label="Buscar prioridade, cliente ou responsável" value={search} onChange={event => setSearch(event.target.value)} placeholder="Cliente, ação ou responsável" className="h-10 w-full rounded-lg border border-stone-200 bg-stone-50 pl-9 pr-3 text-xs outline-none focus:border-[#17251b] dark:border-white/10 dark:bg-white/5" /></label></div>
            <div className="flex flex-wrap gap-2" aria-label="Filtrar prioridades">{(Object.keys(filterLabels) as Filter[]).map(id => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${filter === id ? 'bg-[#17251b] text-white dark:bg-[#e3bd80] dark:text-[#17251b]' : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-white/5 dark:text-stone-300'}`}>{filterLabels[id]}</button>)}</div>
          </div>
          {resource.loading && !plan && <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-stone-500"><Loader2 size={18} className="animate-spin" /> Consultando prioridades…</div>}
          {!resource.loading && !visible.length && <div className="p-8 text-center"><ClipboardList size={28} className="mx-auto text-stone-400" /><p className="mt-3 font-semibold">{unavailable ? 'Aguardando os registros operacionais' : search || filter !== 'all' ? 'Nenhuma prioridade neste filtro' : 'Nenhuma pendência identificada nas fontes disponíveis'}</p><p className="mx-auto mt-2 max-w-md text-sm text-stone-500">{unavailable ? 'Atualize a leitura para tentar novamente.' : 'A leitura considera próximos passos e prazos dos próximos sete dias, além de checklists sem prazo e dados que precisam de conferência.'}</p>{(search || filter !== 'all') && <button type="button" className="mt-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300" onClick={() => { setSearch(''); setFilter('all') }}>Limpar filtros</button>}</div>}
          <div className="divide-y divide-stone-100 dark:divide-white/10">{visible.slice(0, limit).map(item => <article key={item.id} className="p-4 sm:p-5"><div className="flex items-start gap-3"><span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.priority === 'critical' ? 'bg-rose-500' : item.priority === 'attention' ? 'bg-amber-500' : 'bg-stone-400'}`} /><div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><span className="font-semibold text-emerald-800 dark:text-emerald-300">{item.clienteName || item.clienteId}</span>{item.dueDate && <span className={item.dueDate < (plan?.referenceDate || '') ? 'font-semibold text-rose-700 dark:text-rose-300' : 'text-stone-500'}>{item.dueDate === plan?.referenceDate ? 'Hoje' : civilDate(item.dueDate)}</span>}</div><h3 className="break-words text-sm font-bold leading-relaxed">{item.title}</h3><p className="mt-1 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{item.reason}</p><p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">{item.nextAction}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-1 text-xs text-stone-500"><UserRound size={12} /> {item.owner || 'Responsável não informado'}</span><div className="flex flex-wrap gap-2">{onHandoff && <button type="button" title={handoffDisabledReason} disabled={Boolean(handoffDisabledReason) || preparing || Boolean(handoffId) || !item.fingerprint || resource.loading || Boolean(resource.error)} onClick={() => void handoff(item)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#17251b] px-3 text-xs font-semibold text-white hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#e3bd80] dark:text-[#17251b]">{handoffId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{handoffId === item.id ? 'Preparando trabalho…' : 'Trabalhar com a ALIX'}</button>}<Link to={item.to} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-stone-100 px-3 text-xs font-semibold text-[#17251b] hover:bg-stone-200 dark:bg-white/10 dark:text-white">Abrir registro <ArrowRight size={14} /></Link></div></div><details className="mt-2 text-xs text-stone-500"><summary className="w-fit cursor-pointer py-1 hover:text-stone-800 dark:hover:text-stone-200">Ver origem desta prioridade</summary><ul className="mt-1 space-y-1.5 border-l-2 border-stone-200 pl-3 dark:border-white/10">{item.sources.map((source, index) => <li key={`${source.kind}:${source.id}:${index}`} className="break-words"><PrioritySource source={source} /></li>)}</ul></details></div></div></article>)}</div>
          {visible.length > limit && <div className="border-t border-stone-100 p-4 text-center dark:border-white/10"><button type="button" onClick={() => setLimit(value => value + 24)} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold hover:bg-stone-100 dark:hover:bg-white/10">Mostrar mais ({visible.length - limit}) <ChevronDown size={15} /></button></div>}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-stone-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.03]"><h2 className="flex items-center gap-2 text-sm font-bold"><Database size={16} /> Fontes desta leitura</h2><p className="mt-2 text-xs leading-relaxed text-stone-500">{plan?.coverage.status === 'complete' ? 'Todas as fontes responderam à consulta.' : 'A disponibilidade de cada fonte aparece abaixo.'}</p><ul className="mt-4 space-y-4">{plan?.coverage.sources.map(source => <li key={source.key}><div className="flex items-center gap-2 text-xs font-semibold">{source.status === 'available' ? <Check size={14} className="text-emerald-700" /> : <AlertCircle size={14} className="text-amber-600" />}{source.label}</div><p className="mt-1 pl-5 text-xs text-stone-500">{source.status === 'available' ? `${source.records} registros consultados` : 'Consulta indisponível'}</p></li>)}</ul></div>
          <div className="rounded-xl bg-stone-100 p-5 dark:bg-white/5"><h2 className="text-sm font-bold">O que a ALIX prepara</h2><p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400">Organiza o dia e salva o plano com suas fontes. Em cada prioridade, “Trabalhar com a ALIX” abre uma conversa com o cliente certo e inicia a análise e os rascunhos. Repetir abre o mesmo trabalho.</p><p className="mt-3 text-xs leading-relaxed text-stone-600 dark:text-stone-400">Você recebe fatos, lacunas, material preparado e a próxima decisão. Alterações no CRM e envios passam pela confirmação habitual.</p></div>
        </aside>
      </div>
    </section>
  )
}


function PrioritySource({ source }: { source: OperationalItem['sources'][number] }) {
  if (source.kind === 'drive_analysis') {
    const url = source.documentId && /^[A-Za-z0-9_-]{1,200}$/.test(source.documentId)
      ? `https://drive.google.com/file/d/${encodeURIComponent(source.documentId)}/view` : undefined
    return <>
      <span className="font-semibold text-stone-700 dark:text-stone-300">{source.label}</span>
      {(source.page || source.sheet) && <span className="block">{source.page ? `Página ${source.page}` : ''}{source.page && source.sheet ? ' · ' : ''}{source.sheet ? `Aba ${source.sheet}` : ''}</span>}
      {source.excerpt && <blockquote className="mt-1 border-l-2 border-stone-300 pl-2 text-stone-700 dark:text-stone-300">{source.excerpt}</blockquote>}
      {source.updatedAt && <span className="mt-1 block">Conferência atualizada em {instant(source.updatedAt)}</span>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-lg bg-stone-100 px-3 text-xs font-semibold text-emerald-800 hover:bg-stone-200 dark:bg-white/10 dark:text-emerald-300">Abrir documento no Drive <ArrowRight size={13} /></a>}
    </>
  }
  return <>{source.label} · <span className="font-mono text-[10px]">{source.id}</span>{source.documentId && <span className="block">Documento: <span className="font-mono text-[10px]">{source.documentId}</span>{source.page ? ` · página ${source.page}` : ''}{source.sheet ? ` · aba ${source.sheet}` : ''}</span>}{source.revision && <span className="block break-all">Revisão: <span className="font-mono text-[10px]">{source.revision}</span></span>}{source.excerpt && <blockquote className="mt-1 border-l-2 border-stone-300 pl-2 text-stone-700 dark:text-stone-300">{source.excerpt}</blockquote>}{source.updatedAt && <span className="block">Atualizado em {instant(source.updatedAt)}</span>}</>
}
