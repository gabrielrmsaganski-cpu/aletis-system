import PageHeader from '../components/ui/PageHeader'
/** Catálogo operacional: busca imediata, favoritos e contexto das últimas ferramentas. */
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Search, X, Command, Star, Clock3, ChevronDown } from 'lucide-react'
import { CATEGORIES, searchTools, TOOL_CATALOG, type ToolEntry } from '../navigation/toolCatalog'
import { useNavigationPreferences } from '../hooks/useNavigationPreferences'

export default function Ferramentas() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const categoryId = CATEGORIES.some((category) => category.id === params.get('categoria')) ? params.get('categoria') : null
  const onlyFavorites = params.get('favoritos') === '1'
  const { favorites, recent, toggleFavorite, routeForTool } = useNavigationPreferences()
  const changeFilter = (key: string, value: string | null) => {
    setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); return next }, { replace: true })
  }
  const matches = useMemo(() => searchTools(query).filter((tool) => tool.id !== 'ferramentas'), [query])
  const results = matches.filter((tool) => (!categoryId || tool.category === categoryId) && (!onlyFavorites || favorites.includes(tool.id)))
  const groups = CATEGORIES.map((category) => ({ category, tools: results.filter((tool) => tool.category === category.id) })).filter((group) => group.tools.length)
  const recentTools = recent.filter((item) => item.toolId !== 'ferramentas').slice(0, 4).map((item) => ({ ...item, tool: TOOL_CATALOG.find((tool) => tool.id === item.toolId)! })).filter((item) => item.tool)
  const total = TOOL_CATALOG.length - 1

  return <div className="space-y-6 pb-8">
    <PageHeader title={<>Ferramentas</>} eyebrow={<> <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-aletis-gold-escuro">Seu espaço de trabalho</p> </>} description={<> <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-soft)] dark:text-aletis-sage">Encontre o que precisa, fixe os atalhos do seu dia e retome o trabalho de onde parou.</p> </>} actions={<> <button type="button" onClick={() => window.dispatchEvent(new Event('aletis:palette:open'))} className="inline-flex h-10 w-fit shrink-0 items-center gap-2 rounded-lg border border-aletis-borda bg-card px-3 text-xs font-semibold text-foreground hover:border-aletis-gold/50 dark:border-white/15 dark:bg-white/5 dark:text-white"><Command size={15} /> Busca global <kbd className="ml-2 text-[11px] font-normal opacity-50">Ctrl K</kbd></button> </>} />

    <section aria-label="Encontrar ferramentas" className="rounded-xl border border-aletis-borda bg-card shadow-sm dark:border-white/10 dark:bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row">
        <label className="relative flex-1"><span className="sr-only">Buscar ferramentas</span><Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="search" value={query} onChange={(event) => changeFilter('q', event.target.value || null)} placeholder="O que você precisa fazer? Ex.: crédito rural, documentos, fluxo de caixa" className="h-12 w-full rounded-lg border border-aletis-borda bg-aletis-bege/25 pl-11 pr-10 text-sm text-foreground outline-none placeholder:text-aletis-grafite-claro focus:border-aletis-gold focus:ring-2 focus:ring-aletis-gold/15 dark:border-white/15 dark:bg-white/5 dark:text-white" />{query && <button type="button" onClick={() => changeFilter('q', null)} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground hover:bg-aletis-bege dark:hover:bg-white/10"><X size={16} /></button>}</label>
        <button type="button" aria-pressed={onlyFavorites} onClick={() => changeFilter('favoritos', onlyFavorites ? null : '1')} className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition ${onlyFavorites ? 'border-aletis-gold/50 bg-aletis-gold/10 text-aletis-gold-escuro dark:text-aletis-gold' : 'border-aletis-borda text-[var(--text-soft)] hover:bg-aletis-bege/50 dark:border-white/15 dark:text-aletis-sage'}`}><Star size={17} className={onlyFavorites ? 'fill-current' : ''} /> Favoritos <span className="text-xs opacity-60">{favorites.filter((id) => id !== 'ferramentas').length}</span></button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-t border-aletis-borda/70 px-4 py-3 dark:border-white/10" aria-label="Categorias de ferramentas">
        {[{ id: null, label: 'Todas' }, ...CATEGORIES].map((category) => <button key={category.id ?? 'all'} type="button" aria-pressed={categoryId === category.id} onClick={() => changeFilter('categoria', category.id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${categoryId === category.id ? 'bg-aletis-verde text-white dark:bg-aletis-gold dark:text-aletis-verde' : 'text-[var(--text-soft)] hover:bg-aletis-bege/60 dark:text-aletis-sage dark:hover:bg-white/5'}`}>{category.label}</button>)}
      </div>
    </section>

    {!query && !onlyFavorites && !categoryId && recentTools.length > 0 && <section aria-label="Retomar ferramentas"><h2 className="mb-3 flex items-center gap-2 text-xs font-semibold text-[var(--text-soft)] dark:text-aletis-sage"><Clock3 size={14} /> Acessadas recentemente</h2><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{recentTools.map(({ tool, route }) => <Link key={tool.id} to={route} className="group flex min-w-0 items-center gap-3 rounded-lg border border-aletis-borda bg-card px-3 py-3 transition hover:border-aletis-gold/50 dark:border-white/10 dark:bg-white/[0.03]"><tool.icon size={17} className="shrink-0 text-aletis-gold-escuro" /><span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground dark:text-white">{tool.title}</span><ArrowUpRight size={14} className="text-muted-foreground group-hover:text-aletis-verde" /></Link>)}</div></section>}

    <p role="status" aria-live="polite" className="text-xs text-muted-foreground dark:text-aletis-sage">{results.length} de {total} ferramentas{query && ` para “${query}”`}{onlyFavorites && ' · seus favoritos'}</p>
    {results.length === 0 && <div className="rounded-xl border border-dashed border-aletis-borda py-12 text-center dark:border-white/15"><Search size={28} className="mx-auto mb-3 text-muted-foreground" /><p className="text-sm font-semibold text-foreground dark:text-white">{onlyFavorites && !favorites.length ? 'Seu espaço, do seu jeito' : 'Nenhuma ferramenta com esses filtros'}</p><p className="mx-auto mt-2 max-w-md px-4 text-xs leading-relaxed text-[var(--text-soft)] dark:text-aletis-sage">{onlyFavorites && !favorites.length ? 'Use a estrela nas ferramentas para fixar até 8 atalhos no menu.' : 'Tente outro termo ou limpe os filtros para explorar o catálogo.'}</p><button type="button" onClick={() => setParams({}, { replace: true })} className="mt-4 rounded-lg border border-aletis-borda bg-card px-3 py-2 text-xs font-semibold text-foreground dark:border-white/15 dark:bg-white/5 dark:text-white">Ver todas as ferramentas</button></div>}
    <div className="space-y-7">{groups.map(({ category, tools }) => <section key={category.id} aria-labelledby={`tools-${category.id}`}><div className="mb-3 flex items-baseline gap-3"><h2 id={`tools-${category.id}`} className="text-sm font-bold text-foreground dark:text-white">{category.label}</h2><p className="hidden text-xs text-muted-foreground sm:block dark:text-aletis-sage">{category.subtitle}</p><span className="ml-auto text-[11px] text-muted-foreground">{tools.length}</span></div><div className="module-catalog">{tools.map((tool) => <ToolCard key={tool.id} tool={tool} to={routeForTool(tool.id, tool.route)} favorite={favorites.includes(tool.id)} onFavorite={() => toggleFavorite(tool.id)} />)}</div></section>)}</div>

    <details className="group rounded-xl border border-aletis-borda bg-card p-4 dark:border-white/10 dark:bg-white/[0.03]"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground dark:text-white">Como as ferramentas se conectam<ChevronDown size={16} className="transition group-open:rotate-180" /></summary><div className="mt-4 grid gap-4 text-xs leading-relaxed text-[var(--text-soft)] dark:text-aletis-sage md:grid-cols-3"><p><strong className="block mb-1 text-foreground dark:text-white">Relacionamento</strong>Prospecte, organize a carteira no CRM e acompanhe propostas, negociações e contratos.</p><p><strong className="block mb-1 text-foreground dark:text-white">Operação</strong>Abra o cliente para trabalhar com cadastro, diagnóstico, financeiro, viabilidade, arquivos e processo.</p><p><strong className="block mb-1 text-foreground dark:text-white">Inteligência</strong>Use a ALIX com o contexto disponível e consulte mercado e clima com as respectivas fontes.</p></div></details>
  </div>
}

function ToolCard({ tool, to, favorite, onFavorite }: { tool: ToolEntry; to: string; favorite: boolean; onFavorite: () => void }) {
  const Icon = tool.icon
  return <article className="group relative flex">
    <Link to={to} className="flex min-w-0 flex-1 gap-3 rounded-xl p-4 pr-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-aletis-gold"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-aletis-verde/[0.06] text-foreground dark:bg-white/5 dark:text-aletis-gold"><Icon size={19} /></span><div className="min-w-0"><h3 className="text-sm font-semibold text-foreground dark:text-white">{tool.title}</h3><p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)] dark:text-aletis-sage">{tool.tagline}</p><p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground dark:text-white/40">{tool.description}</p></div></Link>
    <button type="button" onClick={onFavorite} aria-pressed={favorite} aria-label={`${favorite ? 'Remover' : 'Adicionar'} ${tool.title} ${favorite ? 'dos' : 'aos'} favoritos`} className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-aletis-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-aletis-gold ${favorite ? 'text-aletis-gold-escuro dark:text-aletis-gold' : 'text-aletis-grafite-claro/60 dark:text-white/30'}`}><Star size={16} className={favorite ? 'fill-current' : ''} /></button>
  </article>
}
