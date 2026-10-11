import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, ExternalLink, FileSearch, FileText, FolderOpen, Loader2, RefreshCw, Search, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { apiFetch, useApi } from '../../hooks/useApi'
import AppDialog from '../ui/AppDialog'

type Coverage = { status?: string; totalPages?: number; pendingPages?: unknown[]; totalRows?: number; extractedRows?: number; limitations?: string[] }
export type DriveCorpusFile = { fileId: string; name: string; mimeType?: string; path: string; clienteId?: string | null; category: string; readStatus: string; coverage?: Coverage | null; characters: number; url?: string | null; revision?: string | null; readAt?: string | null }
type Overview = {
  canViewAll: boolean
  organization?: { hubUrl: string } | null
  totals: { files: number; folders: number; extracted: number; partial: number; pending: number; failed: number; unsupported: number; withoutClient: number; characters: number | string }
  states?: unknown
  clients: Array<{ id: string; nome: string; files: number; extracted: number; partial: number }>
  categories: Array<{ category: string; files: number }>
  inventory: { complete: boolean; completedAt?: string | null; updatedAt?: string | null }
  reading: { status: string; lastUpdate?: string | null; note?: string | null }
  monitoring?: { status: string; updatedAt: string; lastSuccessfulSyncAt?: string | null; note: string } | null
}
type FileList = { files: DriveCorpusFile[]; total: number; nextOffset: number | null }
type SearchResult = DriveCorpusFile & { chunkId: string; text: string; source?: string; page?: number; sheet?: string }
type ContentSearch = { results: SearchResult[]; nextOffset: number | null; instruction?: string }
type ReadPage = { file: DriveCorpusFile; available: boolean; text: string; range?: { start: number; end: number }; totalCharacters: number; nextCursor: string | null; instruction?: string }
type Reader = { scope: string; file: DriveCorpusFile; cursor?: string; history: Array<string | undefined>; page: ReadPage | null; loading: boolean; error: string | null }

const statuses: Record<string, string> = { extracted: 'Texto extraído', complete: 'Texto extraído', partial: 'Leitura parcial', pending: 'Aguardando leitura', changed: 'Nova versão pendente', deferred: 'Leitura adiada', reading: 'Em leitura', processing: 'Em leitura', failed: 'Requer nova tentativa', unsupported: 'Conversão necessária', folder: 'Pasta' }
const categoryLabels: Record<string, string> = { cadastral: 'Cadastro e identificação', identificacao: 'Cadastro e identificação', contratos: 'Contratos', contrato: 'Contratos', financeiro: 'Financeiro', fiscal: 'Fiscal e tributário', rural: 'Atividade rural', imoveis: 'Imóveis e garantias', processos: 'Processos', propostas: 'Propostas', institucional: 'Institucional', corporativo: 'Corporativo', operacional: 'Operacional', outros: 'Outros documentos', unknown: 'A classificar' }
const categoryName = (category: string) => categoryLabels[category] || category.replace(/_/g, ' ').replace(/^./, letter => letter.toUpperCase())
const count = (value?: number | string | null) => value == null ? '—' : new Intl.NumberFormat('pt-BR').format(typeof value === 'string' ? (/^\d+$/.test(value) ? BigInt(value) : Number(value)) : value)
const instant = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Cuiaba' }).format(new Date(value)) : 'Ainda não registrada'
function params(values: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') search.set(key, String(value))
  const query = search.toString()
  return query ? `?${query}` : ''
}
function sourceUrl(value?: string | null) {
  if (!value) return null
  try { const parsed = new URL(value); return parsed.protocol === 'https:' && /(^|\.)google\.com$/.test(parsed.hostname) ? parsed.href : null } catch { return null }
}
function Status({ file }: { file: Pick<DriveCorpusFile, 'readStatus' | 'coverage' | 'mimeType'> }) {
  if (file.mimeType === 'application/vnd.google-apps.shortcut') return <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600"><ExternalLink size={11} />Atalho do Drive</span>
  const complete = file.readStatus === 'extracted' || file.readStatus === 'complete'
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${complete ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' : file.readStatus === 'failed' ? 'bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200'}`}>{complete ? <Check size={11} /> : <FileSearch size={11} />}{statuses[file.readStatus] || 'Cobertura em verificação'}</span>
}

export default function AlixDriveCorpusPanel({ clienteId, corporateOnly = false, clientes, onScopeChange }: {
  clienteId?: string
  corporateOnly?: boolean
  clientes: Array<{ id: string; nome: string }>
  onScopeChange: (clientId: string, corporateOnly: boolean) => void
}) {
  const scope = corporateOnly ? 'corporate' : clienteId || 'all'
  const scopeParams = useMemo(() => ({ clienteId: corporateOnly ? undefined : clienteId, corporateOnly: corporateOnly ? '1' : undefined }), [clienteId, corporateOnly])
  const overview = useApi<Overview | null>(`/alix/drive-corpus/overview${params(scopeParams)}`, null)
  const [mode, setMode] = useState<'catalog' | 'content'>('catalog')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [offset, setOffset] = useState(0)
  const [history, setHistory] = useState<number[]>([])
  const [reader, setReader] = useState<Reader | null>(null)
  const readRequest = useRef<AbortController | null>(null)
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const catalog = useApi<FileList | null>(mode === 'catalog' ? `/alix/drive-corpus/files${params({ ...scopeParams, query, status, category, offset, limit: 20 })}` : null, null)
  const search = useApi<ContentSearch | null>(mode === 'content' && query ? `/alix/drive-corpus/search${params({ ...scopeParams, query, offset, limit: 20 })}` : null, null)
  useEffect(() => {
    setReader(null); setOffset(0); setHistory([]); setStatus(''); setCategory('')
    return () => { readRequest.current?.abort(); readRequest.current = null }
  }, [scope])
  const closeReader = () => { readRequest.current?.abort(); readRequest.current = null; setReader(null) }
  const visibleReader = reader?.scope === scope ? reader : null
  const resource = mode === 'catalog' ? catalog : search
  const loading = resource.loading
  useEffect(() => {
    if (!overview.data?.monitoring && !['reading', 'not_started', 'paused_auth'].includes(overview.data?.reading.status || '')) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!overview.loading) overview.refetch()
      if (!resource.loading) resource.refetch()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [scope, overview.data?.reading.status, overview.data?.monitoring?.status, overview.loading, overview.refetch, resource.loading, resource.refetch])
  const resourceError = resource.error
  const items = mode === 'catalog' ? catalog.data?.files || [] : search.data?.results || []
  const nextOffset = mode === 'catalog' ? catalog.data?.nextOffset : search.data?.nextOffset
  const clientNames = useMemo(() => new Map([...clientes, ...(overview.data?.clients || [])].map(client => [client.id, client.nome])), [clientes, overview.data?.clients])
  const filtered = Boolean(query || status || category)
  const totals = overview.data?.totals
  const resetPage = () => { setOffset(0); setHistory([]) }
  function submit(event: FormEvent) { event.preventDefault(); setQuery(draft.trim()); resetPage() }
  function refresh() { overview.refetch(); resource.refetch() }
  async function read(file: DriveCorpusFile, cursor?: string, previous: Array<string | undefined> = []) {
    readRequest.current?.abort()
    const controller = new AbortController()
    readRequest.current = controller
    setReader({ scope, file, cursor, history: previous, page: null, loading: true, error: null })
    try {
      const page = await apiFetch<ReadPage>(`/alix/drive-corpus/files/${encodeURIComponent(file.fileId)}${params({ clienteId: scopeParams.clienteId, cursor })}`, { signal: controller.signal })
      if (!controller.signal.aborted && scopeRef.current === scope) setReader({ scope, file: page.file, cursor, history: previous, page, loading: false, error: null })
    } catch (error) {
      if (!controller.signal.aborted && scopeRef.current === scope) setReader({ scope, file, cursor, history: previous, page: null, loading: false, error: error instanceof Error ? error.message : 'Não foi possível abrir este trecho.' })
    } finally { if (readRequest.current === controller) readRequest.current = null }
  }
  const inputClass = 'h-11 min-w-0 max-w-full rounded-lg border border-stone-300 bg-card px-3 text-sm text-stone-800 outline-none focus:border-[#17251b] dark:border-white/15 dark:bg-[#1c2820] dark:text-white'
  const actionClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-stone-200 bg-card px-3 text-xs font-semibold text-[#17251b] hover:bg-stone-50 disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-stone-100'
  return <section className="min-w-0 space-y-5 pb-8 text-stone-900 dark:text-stone-100" aria-labelledby="drive-corpus-title">
    <header className="overflow-hidden rounded-2xl bg-[#17251b] text-white">
      <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl"><div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#e3bd80]"><Sparkles size={15} /> ALIX · Drive e dados</div><h1 id="drive-corpus-title" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Seu acervo, com contexto e origem.</h1><p className="mt-2 text-sm leading-relaxed text-stone-300">Encontre informações dentro dos documentos, confira a leitura de cada arquivo e navegue até o cliente ou a fonte original.</p></div>
        <div className="flex items-center gap-3 rounded-xl border border-[#e3bd80]/20 bg-white/5 p-4 lg:max-w-xs"><ShieldCheck size={25} className="shrink-0 text-[#e3bd80]" /><p className="text-xs leading-relaxed text-stone-300">A cobertura mostra o texto que foi extraído. A análise da ALIX considera as fontes e as lacunas de cada documento.</p></div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 px-5 py-3 text-xs text-stone-300 sm:px-7"><span className="inline-flex items-center gap-1.5"><FolderOpen size={13} />{overview.data ? overview.data.inventory.complete ? 'Inventário concluído' : 'Inventário em andamento' : 'Consultando inventário…'}</span><span>Última leitura: {instant(overview.data?.reading.lastUpdate || overview.data?.inventory.updatedAt)}</span></div>
    </header>

    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-stone-500 dark:text-stone-400">Área do acervo<select aria-label="Área do acervo" className={`${inputClass} w-full sm:w-80`} value={scope} onChange={event => { const value = event.target.value; onScopeChange(value === 'corporate' || value === 'all' ? '' : value, value === 'corporate') }}>
        <option value="all" disabled={overview.data?.canViewAll === false}>Todo o acervo acessível</option><option value="corporate" disabled={overview.data?.canViewAll === false}>Drive corporativo</option>
        {clienteId && !clientNames.has(clienteId) && <option value={clienteId}>Cliente selecionado</option>}
        {[...clientNames].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <div className="flex flex-wrap gap-2">{overview.data?.canViewAll && sourceUrl(overview.data.organization?.hubUrl) && <a href={sourceUrl(overview.data.organization?.hubUrl)!} target="_blank" rel="noopener noreferrer" className={actionClass}><ExternalLink size={15} />Abrir Central no Drive</a>}<button type="button" onClick={refresh} disabled={overview.loading || loading} className={actionClass}><RefreshCw size={15} className={overview.loading || loading ? 'animate-spin' : ''} />Atualizar painel</button></div>
    </div>
    {overview.error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200"><p className="font-semibold">Não foi possível consultar este acervo.</p><p className="mt-1">{overview.error}</p>{!clienteId && <p className="mt-2">Selecione um cliente para consultar os documentos disponíveis para você.</p>}</div>}
    {overview.loading && !overview.data && <p role="status" className="flex items-center gap-2 text-sm text-stone-500"><Loader2 size={16} className="animate-spin" />Conferindo cobertura do Drive…</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {([['Arquivos no acervo', totals?.files, FolderOpen], ['Texto extraído', totals?.extracted, FileText], ['Leitura parcial', totals?.partial, FileSearch], ['Leitura pendente', totals?.pending, BookOpen]] as const).map(([label, value, Icon]) => <div key={label} className="min-w-0 rounded-xl border border-stone-200 bg-card p-4 dark:border-white/10 dark:bg-white/[0.03]"><div className="mb-3 flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-stone-400"><span>{label}</span><Icon size={16} className="shrink-0" /></div><span className="text-3xl font-bold tracking-tight">{count(value)}</span></div>)}
    </div>
    {overview.data?.reading.note && <p role="status" className="flex items-start gap-2 rounded-xl bg-stone-100 p-4 text-xs leading-relaxed text-stone-600 dark:bg-white/5 dark:text-stone-300"><AlertCircle size={16} className="mt-0.5 shrink-0" />{overview.data.reading.note}</p>}
    {overview.data?.monitoring && <div role="status" className="rounded-xl border border-stone-200 bg-card p-4 text-xs leading-relaxed dark:border-white/10 dark:bg-white/5">
      <p className="flex items-center gap-2 font-semibold"><RefreshCw size={14} />Atualização automática do Drive</p>
      <p className="mt-1 text-stone-600 dark:text-stone-300">{overview.data.monitoring.note}</p>
      <p className="mt-1 text-stone-500">Última conferência de mudanças: {instant(overview.data.monitoring.lastSuccessfulSyncAt)}</p>
    </div>}
    {overview.data?.canViewAll && (overview.data.reading.status === 'paused_auth' || overview.data.monitoring?.status === 'awaiting_authorization') &&
      <Link to="/configuracoes?tab=google" className={actionClass}>Verificar conexão com o Google<ArrowRight size={14} /></Link>}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-card dark:border-white/10 dark:bg-white/[0.03]">
        <div className="space-y-4 border-b border-stone-200 p-4 dark:border-white/10 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">{mode === 'catalog' ? 'Documentos do acervo' : 'Pesquisar no conteúdo'}</h2><div className="flex rounded-lg bg-stone-100 p-1 dark:bg-white/5" aria-label="Tipo de busca">{([['catalog', 'Nome e pasta'], ['content', 'Dentro dos arquivos']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => { setMode(value); resetPage() }} className={`min-h-9 rounded-md px-3 text-xs font-semibold ${mode === value ? 'bg-[#17251b] text-white dark:bg-[#e3bd80] dark:text-[#17251b]' : 'text-stone-500 dark:text-stone-300'}`}>{label}</button>)}</div></div>
          <form onSubmit={submit} className="flex min-w-0 gap-2"><label className="relative min-w-0 flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-stone-400" /><input aria-label={mode === 'content' ? 'Buscar no conteúdo dos documentos' : 'Buscar por nome ou pasta'} maxLength={300} value={draft} onChange={event => setDraft(event.target.value)} placeholder={mode === 'content' ? 'Banco, contrato, matrícula, informação…' : 'Nome do documento ou pasta…'} className={`${inputClass} w-full pl-9`} /></label><button type="submit" disabled={loading || (mode === 'content' && draft.trim().length < 2)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#17251b] px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-[#e3bd80] dark:text-[#17251b]">Buscar</button></form>
          {mode === 'catalog' && <div className="flex flex-wrap gap-2"><select aria-label="Estado de leitura" value={status} onChange={event => { setStatus(event.target.value); resetPage() }} className={`${inputClass} flex-1 sm:flex-none`}><option value="">Todos os estados</option>{['complete', 'partial', 'pending', 'changed', 'deferred', 'failed', 'unsupported'].map(state => <option key={state} value={state}>{statuses[state]}</option>)}</select><select aria-label="Categoria documental" value={category} onChange={event => { setCategory(event.target.value); resetPage() }} className={`${inputClass} flex-1 sm:flex-none`}><option value="">Todas as categorias</option>{overview.data?.categories.map(item => <option key={item.category} value={item.category}>{categoryName(item.category)} ({count(item.files)})</option>)}</select></div>}
          {mode === 'content' && <p className="text-xs leading-relaxed text-stone-500">A busca consulta o texto extraído e apresenta o trecho de origem. Resultados vazios não comprovam ausência em arquivos ainda pendentes ou parciais.</p>}
        </div>
        {resourceError && <div role="alert" className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{resourceError}</p><button type="button" onClick={resource.refetch} className="mt-2 font-semibold underline">Tentar novamente</button></div>}
        {loading && <div role="status" className="flex items-center justify-center gap-2 p-8 text-sm text-stone-500"><Loader2 size={18} className="animate-spin" />{mode === 'catalog' ? 'Consultando documentos…' : 'Buscando nos trechos extraídos…'}</div>}
        {!loading && !resourceError && !items.length && <div className="p-8 text-center"><FileSearch size={30} className="mx-auto text-stone-400" /><h3 className="mt-3 font-semibold">{mode === 'content' && !query ? 'Qual informação você precisa encontrar?' : filtered ? 'Nenhum resultado neste filtro' : 'Nenhum arquivo disponível nesta área'}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-500">{mode === 'content' && !query ? 'Busque uma palavra, um número de contrato ou um trecho do documento.' : 'Confira o cliente selecionado, os filtros e a cobertura de leitura do acervo.'}</p>{filtered && <button type="button" onClick={() => { setQuery(''); setDraft(''); setStatus(''); setCategory(''); resetPage() }} className="mt-4 text-sm font-semibold text-emerald-800 dark:text-emerald-300">Limpar filtros</button>}</div>}
        {!loading && <div className="divide-y divide-stone-100 dark:divide-white/10">{items.map((file, index) => <article key={`${file.fileId}:${'chunkId' in file ? file.chunkId : index}`} className="p-4 sm:p-5"><div className="flex items-start gap-3"><FileText size={19} className="mt-1 shrink-0 text-stone-400" /><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><Status file={file} /><span className="text-[11px] text-stone-500">{categoryName(file.category || 'outros')}</span></div><h3 className="break-words text-sm font-bold leading-relaxed">{file.name}</h3><p className="mt-1 break-words text-xs leading-relaxed text-stone-500">{file.path || 'Pasta principal'}</p>{'text' in file && <blockquote className="mt-3 whitespace-pre-wrap break-words border-l-2 border-[#d2b178] bg-stone-50 px-3 py-2 text-sm leading-relaxed text-stone-700 dark:bg-white/5 dark:text-stone-300">{String(file.text)}<footer className="mt-2 text-xs text-stone-500">{'page' in file && file.page ? `Página ${file.page}` : 'sheet' in file && file.sheet ? `Planilha ${file.sheet}` : 'Trecho do documento'}</footer></blockquote>}<div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-xs text-stone-500"><Users size={12} />{file.clienteId ? clientNames.get(file.clienteId) || 'Cliente vinculado' : 'Sem cliente definido'}</span><div className="flex flex-wrap gap-2">{file.clienteId && <Link to={`/clientes/${encodeURIComponent(file.clienteId)}`} className={actionClass}>Abrir cliente<ChevronRight size={13} /></Link>}<button type="button" onClick={() => void read(file)} className={actionClass}><BookOpen size={13} />Ler arquivo</button>{sourceUrl(file.url) && <a href={sourceUrl(file.url)!} target="_blank" rel="noopener noreferrer" className={actionClass}>Original<ExternalLink size={13} /></a>}</div></div></div></div></article>)}</div>}
        {(offset > 0 || nextOffset != null) && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 p-4 dark:border-white/10"><span className="text-xs text-stone-500">{offset + 1}–{offset + items.length}{mode === 'catalog' && catalog.data ? ` de ${count(catalog.data.total)}` : ''}</span><div className="flex gap-2"><button type="button" disabled={loading || !history.length} onClick={() => { setOffset(history.at(-1) || 0); setHistory(current => current.slice(0, -1)) }} className={actionClass}><ArrowLeft size={13} />Anterior</button><button type="button" disabled={loading || nextOffset == null} onClick={() => { if (nextOffset != null) { setHistory(current => [...current, offset]); setOffset(nextOffset) } }} className={actionClass}>Próxima<ArrowRight size={13} /></button></div></div>}
      </div>
      <aside className="space-y-4"><div className="rounded-xl border border-stone-200 bg-card p-5 dark:border-white/10 dark:bg-white/[0.03]"><h2 className="text-sm font-bold">Cobertura do acervo</h2><dl className="mt-4 space-y-3 text-xs">{[['Pastas inventariadas', totals?.folders], ['Caracteres extraídos', totals?.characters], ['Sem cliente definido', totals?.withoutClient], ['Nova tentativa necessária', totals?.failed], ['Conversão necessária', totals?.unsupported]].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-3"><dt className="text-stone-500">{label}</dt><dd className="shrink-0 font-semibold">{count(value as number | undefined)}</dd></div>)}</dl></div><div className="rounded-xl bg-stone-100 p-5 dark:bg-white/5"><h2 className="text-sm font-bold">Do documento ao próximo passo</h2><p className="mt-2 text-xs leading-relaxed text-stone-600 dark:text-stone-400">Localize a informação, confira o trecho e abra o cadastro do cliente. Na conversa, peça à ALIX para cruzar as fontes, apontar divergências e preparar o documento necessário.</p><p className="mt-3 text-xs leading-relaxed text-stone-600 dark:text-stone-400">Arquivos sem cliente definido permanecem separados até que o vínculo seja comprovado. Um documento parcial continua identificado como parcial.</p></div></aside>
    </div>
    {visibleReader && <AppDialog title={visibleReader.file.name} subtitle={visibleReader.file.path || 'Pasta principal'} eyebrow="Leitura do acervo Drive" icon={<BookOpen size={22} />} onClose={closeReader} collapsible={false} size="lg" footer={<div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-stone-500">{visibleReader.page?.range ? `Caracteres ${count(visibleReader.page.range.start + 1)}–${count(visibleReader.page.range.end)} de ${count(visibleReader.page.totalCharacters)}` : 'Cada trecho mantém a origem do arquivo.'}</span><div className="flex flex-wrap gap-2"><button type="button" disabled={visibleReader.loading || !visibleReader.history.length} onClick={() => void read(visibleReader.file, visibleReader.history.at(-1), visibleReader.history.slice(0, -1))} className={actionClass}><ArrowLeft size={13} />Trecho anterior</button><button type="button" disabled={visibleReader.loading || !visibleReader.page?.nextCursor} onClick={() => { if (visibleReader.page?.nextCursor) void read(visibleReader.file, visibleReader.page.nextCursor, [...visibleReader.history, visibleReader.cursor]) }} className={actionClass}>Próximo trecho<ArrowRight size={13} /></button></div></div>}>
      <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><Status file={visibleReader.file} />{sourceUrl(visibleReader.file.url) && <a href={sourceUrl(visibleReader.file.url)!} target="_blank" rel="noopener noreferrer" className={actionClass}>Abrir original<ExternalLink size={13} /></a>}</div>{visibleReader.loading && <p role="status" className="flex items-center gap-2 py-8 text-sm text-stone-500"><Loader2 size={17} className="animate-spin" />Abrindo trecho…</p>}{visibleReader.error && <div role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900"><p>{visibleReader.error}</p><button type="button" onClick={() => void read(visibleReader.file)} className="mt-2 font-semibold underline">Abrir desde o início</button></div>}{visibleReader.page && <><p className="rounded-lg bg-stone-100 p-3 text-xs leading-relaxed text-stone-600 dark:bg-white/5 dark:text-stone-300">{visibleReader.page.instruction || 'Confira a cobertura e continue pelos trechos antes de concluir sobre o documento integral.'}</p>{visibleReader.page.available ? <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-stone-800 dark:text-stone-200">{visibleReader.page.text}</pre> : <p className="py-6 text-sm text-stone-500">O texto deste arquivo ainda não está disponível. Consulte o estado de leitura ou abra o original.</p>}{visibleReader.file.coverage?.limitations?.length ? <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-200">{visibleReader.file.coverage.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul> : null}</>}</div>
    </AppDialog>}
  </section>
}
