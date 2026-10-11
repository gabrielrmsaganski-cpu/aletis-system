/** Busca global: registros reais do CRM, propostas e catálogo de ferramentas. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Search, X, CornerDownLeft, Clock, Command, Users, FileText, Loader2, AlertCircle, type LucideIcon } from 'lucide-react'
import { CATEGORIES, searchTools, TOOL_CATALOG, type ToolEntry } from '../../navigation/toolCatalog'
import { useEntitySearch } from '../../hooks/useEntitySearch'
import type { SearchEntity } from '../../navigation/entitySearch'
import BrandMark from './BrandMark'
import { useNavigationPreferences } from '../../hooks/useNavigationPreferences'

interface PaletteResult {
  id: string
  title: string
  description: string
  route: string
  icon: LucideIcon
  label: string
  toolId?: string
}

interface ResultGroup { id: string; label: string; items: PaletteResult[]; total?: number }

const toolResult = (tool: ToolEntry): PaletteResult => ({ id: `tool:${tool.id}`, title: tool.title, description: tool.tagline, route: tool.route, icon: tool.icon, label: 'Ferramenta', toolId: tool.id })
const entityResult = (entity: SearchEntity): PaletteResult => ({ ...entity, icon: entity.kind === 'cliente' ? Users : FileText, label: entity.status || (entity.kind === 'cliente' ? 'Cliente' : 'Proposta') })

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const { recent, favorites } = useNavigationPreferences()
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const search = useEntitySearch(query, open)
  const hasQuery = Boolean(query.trim())

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    setQuery('')
    setActiveIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => {
      window.clearTimeout(timer)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [open])

  const groups = useMemo<ResultGroup[]>(() => {
    const tools = searchTools(query)
    const resultForTool = (tool: ToolEntry): PaletteResult => ({ ...toolResult(tool), route: recent.find((item) => item.toolId === tool.id)?.route ?? tool.route })
    if (hasQuery) {
      return [
        { id: 'clients', label: 'Clientes', items: search.clients.map(entityResult), total: search.totalClients },
        { id: 'proposals', label: 'Propostas', items: search.proposals.map(entityResult), total: search.totalProposals },
        { id: 'tools', label: 'Ferramentas e páginas', items: tools.slice(0, 12).map(resultForTool), total: tools.length },
      ].filter((group) => group.items.length)
    }
    const recentTools = recent.map((item) => TOOL_CATALOG.find((tool) => tool.id === item.toolId)).filter((tool): tool is ToolEntry => Boolean(tool) && !favorites.includes(tool!.id))
    const favoriteTools = favorites.map((id) => TOOL_CATALOG.find((tool) => tool.id === id)).filter((tool): tool is ToolEntry => Boolean(tool))
    const featured = new Set([...favorites, ...recent.map((item) => item.toolId)])
    return [
      { id: 'favorites', label: 'Seus favoritos', items: favoriteTools.map(resultForTool) },
      { id: 'recent', label: 'Ferramentas recentes', items: recentTools.map(resultForTool) },
      ...CATEGORIES.map((category) => ({ id: category.id, label: category.label, items: tools.filter((tool) => tool.category === category.id && !featured.has(tool.id)).map(resultForTool) })),
    ].filter((group) => group.items.length)
  }, [query, hasQuery, recent, favorites, search.clients, search.proposals, search.totalClients, search.totalProposals])
  const results = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const activeId = results[activeIndex]?.id

  useEffect(() => { setActiveIndex(0) }, [query, search.query, search.loading])
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeId, open])

  const activate = useCallback((result: PaletteResult) => {
    onClose()
    navigate(result.route)
  }, [navigate, onClose])

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key === 'Tab') {
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('input, button:not([tabindex="-1"]):not(:disabled)')
      const first = focusable?.[0]
      const last = focusable?.[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    if (event.target !== inputRef.current) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
    }
    if (event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); activate(results[activeIndex]) }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15 }} className="fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[5dvh] sm:px-4 sm:pt-[10dvh]" onKeyDown={onKeyDown}>
          <div className="absolute inset-0 bg-aletis-grafite-escuro/50 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
          <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-label="Busca global ALETIS" initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} className="relative flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-aletis-borda bg-card shadow-2xl dark:border-white/10 dark:bg-[#1a1a1e]">
            <div className="flex items-center justify-between bg-aletis-verde-escuro px-5 py-3">
              <BrandMark variant="full" tone="cream" size={28} />
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-aletis-gold"><Command size={12} /> Busca global</span>
            </div>
            <div className="flex items-center gap-3 border-b border-aletis-borda px-4 py-4 dark:border-white/10 sm:px-5">
              {search.loading ? <Loader2 size={19} className="shrink-0 animate-spin text-foreground" /> : <Search size={19} className="shrink-0 text-[var(--text-soft)] dark:text-white/50" />}
              <input ref={inputRef} type="text" value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} placeholder="Buscar clientes, propostas ou ferramentas…" className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-aletis-grafite-claro dark:text-white" role="combobox" aria-label="Buscar clientes, propostas ou ferramentas" aria-autocomplete="list" aria-expanded="true" aria-controls="aletis-search-results" aria-activedescendant={activeId ? `palette-${activeId}` : undefined} autoComplete="off" spellCheck={false} />
              <button type="button" onClick={onClose} aria-label="Fechar busca" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-soft)] hover:bg-aletis-bege focus-visible:outline focus-visible:outline-2 focus-visible:outline-aletis-verde dark:text-white/60 dark:hover:bg-white/10"><X size={18} /></button>
            </div>
            <div className="border-b border-aletis-borda/60 bg-aletis-bege/30 px-5 py-2 text-xs text-[var(--text-soft)] dark:border-white/10 dark:bg-white/5 dark:text-white/60" aria-live="polite" role="status">
              {search.loading ? 'Consultando clientes e propostas…' : query.trim().length < 2 ? 'Digite ao menos 2 caracteres para encontrar clientes e propostas. As ferramentas estão abaixo.' : `${search.totalClients} cliente(s) · ${search.totalProposals} proposta(s) · ${results.filter((item) => item.toolId).length} ferramenta(s) exibida(s)`}
            </div>
            {search.errors.length > 0 && (
              <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900" role="alert">
                <AlertCircle size={16} className="shrink-0" /><span className="flex-1">{search.errors.join(' ')} Os demais resultados continuam disponíveis.</span>
                <button type="button" onClick={search.retry} className="shrink-0 rounded font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-800">Tentar novamente</button>
              </div>
            )}
            <div id="aletis-search-results" role="listbox" aria-label="Resultados da busca" aria-busy={search.loading} className="custom-scrollbar flex-1 overflow-y-auto py-2">
              {!results.length && !search.loading && (
                <div className="px-5 py-10 text-center"><p className="text-sm text-foreground dark:text-white">Nenhum resultado para “{query.trim()}”.</p><p className="mt-2 text-xs text-[var(--text-soft)] dark:text-white/50">Busque pelo nome do cliente, título ou identificador da proposta, ou nome de uma ferramenta. Documentos e conversas ainda não fazem parte desta busca.</p></div>
              )}
              {groups.map((group) => (
                <div key={group.id} role="group" aria-labelledby={`palette-group-${group.id}`} className="mb-2">
                  <div id={`palette-group-${group.id}`} className="flex items-center gap-1.5 px-5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-soft)] dark:text-white/50">{group.id === 'recent' && <Clock size={11} />}{group.label}{group.total != null && <span className="ml-auto tracking-normal">{group.items.length < group.total ? `${group.items.length} de ${group.total} · refine a busca` : group.total}</span>}</div>
                  {group.items.map((result) => {
                    const Icon = result.icon
                    const active = result.id === activeId
                    return (
                      <button id={`palette-${result.id}`} key={result.id} type="button" role="option" aria-selected={active} tabIndex={-1} onMouseEnter={() => setActiveIndex(results.findIndex((item) => item.id === result.id))} onClick={() => activate(result)} className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors sm:px-5 ${active ? 'bg-aletis-verde/[0.07] dark:bg-white/10' : 'hover:bg-aletis-bege/50 dark:hover:bg-white/5'}`}>
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-aletis-verde text-white' : 'bg-aletis-bege text-foreground dark:bg-white/5 dark:text-aletis-gold'}`}><Icon size={18} /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-foreground dark:text-white">{result.title}</span><span className="mt-0.5 block truncate text-xs text-[var(--text-soft)] dark:text-white/50">{result.description}</span></span>
                        <span className="hidden max-w-28 truncate rounded-full border border-aletis-borda px-2 py-1 text-[10px] capitalize text-[var(--text-soft)] dark:border-white/10 dark:text-white/60 sm:block">{result.label}</span>
                        {active && <CornerDownLeft size={14} className="shrink-0 text-foreground dark:text-aletis-gold" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-aletis-borda bg-aletis-bege/30 px-5 py-3 text-[11px] text-[var(--text-soft)] dark:border-white/10 dark:bg-white/5 dark:text-white/50"><span>↑ ↓ navegar · Enter abrir · Esc fechar</span><span className="hidden sm:inline">{results.length} resultados exibidos</span></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
