/**
 * CommandPalette — busca global + navegação rápida (⌘K / Ctrl+K).
 *
 * Overlay fullscreen-blur com:
 *   - input de busca sempre focado
 *   - resultados agrupados por categoria
 *   - navegação por teclado (↑ ↓ Enter Esc)
 *   - "recentes" persistidos em localStorage
 *
 * Registrado globalmente no Layout. Dispara por:
 *   - Cmd+K / Ctrl+K em qualquer página
 *   - Clique na barra de busca do Header
 *   - Evento custom window.dispatchEvent(new Event('aletis:palette:open'))
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, CornerDownLeft, Clock, Command, ArrowUp, ArrowDown } from 'lucide-react'
import {
  CATEGORIES,
  searchTools,
  TOOL_CATALOG,
  type ToolEntry,
} from '../../navigation/toolCatalog'

const RECENT_KEY = 'aletis:palette:recent'
const RECENT_MAX = 5

function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

function pushRecent(id: string) {
  try {
    const current = getRecent().filter((x) => x !== id)
    current.unshift(id)
    localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, RECENT_MAX)))
  } catch {
    /* noop */
  }
}

type GroupedResults = Array<{
  category: (typeof CATEGORIES)[number]
  tools: ToolEntry[]
}>

function groupByCategory(tools: ToolEntry[]): GroupedResults {
  return CATEGORIES.map((category) => ({
    category,
    tools: tools.filter((t) => t.category === category.id),
  })).filter((g) => g.tools.length > 0)
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [recent, setRecent] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setRecent(getRecent())
      const t = window.setTimeout(() => inputRef.current?.focus(), 20)
      return () => window.clearTimeout(t)
    }
    return
  }, [open])

  const results = useMemo(() => searchTools(query), [query])
  const groupedAll = useMemo(() => groupByCategory(results), [results])

  /** Lista plana na ordem visual, para resolver activeIndex → tool */
  const flatVisible: ToolEntry[] = useMemo(() => {
    if (!query && recent.length > 0) {
      const recentTools = recent
        .map((id) => TOOL_CATALOG.find((t) => t.id === id))
        .filter((t): t is ToolEntry => !!t)
      const others = TOOL_CATALOG.filter((t) => !recent.includes(t.id))
      return [...recentTools, ...others]
    }
    return groupedAll.flatMap((g) => g.tools)
  }, [query, recent, groupedAll])

  const activate = useCallback(
    (tool: ToolEntry) => {
      pushRecent(tool.id)
      onClose()
      navigate(tool.route)
    },
    [navigate, onClose]
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, flatVisible.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const tool = flatVisible[activeIndex]
        if (tool) activate(tool)
        return
      }
    },
    [activeIndex, flatVisible, activate, onClose]
  )

  if (!open) return null

  const showingRecents = !query && recent.length > 0
  const recentTools = showingRecents
    ? recent
        .map((id) => TOOL_CATALOG.find((t) => t.id === id))
        .filter((t): t is ToolEntry => !!t)
    : []
  const groupedStart = showingRecents
    ? recentTools.length
    : 0

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[10vh] md:pt-[14vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
      onKeyDown={onKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-aletis-grafite-escuro/50 backdrop-blur-md animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="
          relative w-full max-w-2xl
          bg-white dark:bg-[#1a1a1e]
          border border-aletis-borda dark:border-white/10
          rounded-2xl
          shadow-[0_30px_80px_-20px_rgba(15,76,53,0.45)]
          animate-slide-up overflow-hidden
          flex flex-col max-h-[75vh]
        "
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-aletis-borda dark:border-white/10">
          <Search size={18} className="text-aletis-grafite-medio dark:text-white/40 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="Buscar ferramenta, cliente, relatório..."
            className="flex-1 bg-transparent outline-none text-[15px] text-aletis-grafite-escuro dark:text-white placeholder:text-aletis-grafite-claro dark:placeholder:text-white/30"
            aria-label="Buscar"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege dark:hover:bg-white/5 transition-colors"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
          {flatVisible.length === 0 && (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-aletis-grafite-medio dark:text-white/50">
                Nenhum resultado para <span className="font-semibold">"{query}"</span>
              </p>
              <p className="mt-1 text-xs text-aletis-grafite-claro dark:text-white/40">
                Tente "custeio", "alix", "propostas" ou "cotações".
              </p>
            </div>
          )}

          {showingRecents && recentTools.length > 0 && (
            <Section label="Recentes" icon={<Clock size={11} />}>
              {recentTools.map((tool, i) => (
                <ResultRow
                  key={tool.id}
                  tool={tool}
                  active={activeIndex === i}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => activate(tool)}
                />
              ))}
            </Section>
          )}

          {showingRecents &&
            CATEGORIES.map((cat) => {
              const tools = TOOL_CATALOG.filter(
                (t) => t.category === cat.id && !recent.includes(t.id)
              )
              if (tools.length === 0) return null
              return (
                <Section key={cat.id} label={cat.label}>
                  {tools.map((tool) => {
                    const idx = flatVisible.findIndex((t) => t.id === tool.id)
                    return (
                      <ResultRow
                        key={tool.id}
                        tool={tool}
                        active={activeIndex === idx}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => activate(tool)}
                      />
                    )
                  })}
                </Section>
              )
            })}

          {!showingRecents &&
            groupedAll.map((g) => (
              <Section key={g.category.id} label={g.category.label}>
                {g.tools.map((tool) => {
                  const idx = flatVisible.findIndex((t) => t.id === tool.id)
                  return (
                    <ResultRow
                      key={tool.id}
                      tool={tool}
                      active={activeIndex === idx}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => activate(tool)}
                    />
                  )
                })}
              </Section>
            ))}

          {/* groupedStart é usado apenas para referência; silenciar warning de linter */}
          <span className="hidden">{groupedStart}</span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-aletis-borda dark:border-white/10 bg-aletis-bege/40 dark:bg-white/[0.02] text-[11px] text-aletis-grafite-medio dark:text-white/50">
          <div className="flex items-center gap-3">
            <Hint icon={<ArrowUp size={10} />} label="↑" text="navegar" />
            <Hint icon={<ArrowDown size={10} />} label="↓" text="navegar" />
            <Hint icon={<CornerDownLeft size={11} />} label="↵" text="abrir" />
            <Hint label="Esc" text="fechar" />
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            <Command size={11} />
            <span>
              {flatVisible.length} {flatVisible.length === 1 ? 'ferramenta' : 'ferramentas'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({
  label,
  icon,
  children,
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-5 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.2em] uppercase text-aletis-grafite-medio dark:text-white/40">
        {icon}
        {label}
      </div>
      {children}
    </div>
  )
}

function ResultRow({
  tool,
  active,
  onMouseEnter,
  onClick,
}: {
  tool: ToolEntry
  active: boolean
  onMouseEnter: () => void
  onClick: () => void
}) {
  const Icon = tool.icon
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-5 py-2.5
        text-left transition-colors
        ${
          active
            ? 'bg-aletis-verde/[0.06] dark:bg-white/[0.05]'
            : 'hover:bg-aletis-bege/50 dark:hover:bg-white/[0.03]'
        }
      `}
    >
      <span
        className={`
          flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors
          ${active ? 'bg-aletis-verde text-white' : 'bg-aletis-bege dark:bg-white/5 text-aletis-verde dark:text-aletis-dourado'}
        `}
      >
        <Icon size={16} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-aletis-grafite-escuro dark:text-white truncate">
            {tool.title}
          </span>
          {tool.badge === 'novo' && (
            <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-aletis-dourado/20 text-aletis-dourado-escuro">
              novo
            </span>
          )}
          {tool.badge === 'ia' && (
            <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-aletis-verde/15 text-aletis-verde">
              IA
            </span>
          )}
          {tool.badge === 'beta' && (
            <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-aletis-grafite-medio/15 text-aletis-grafite-medio">
              beta
            </span>
          )}
        </span>
        <span className="block text-[12px] text-aletis-grafite-medio dark:text-white/50 truncate">
          {tool.tagline}
        </span>
      </span>
      {tool.shortcut && (
        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-aletis-grafite-claro dark:text-white/40 px-2 py-1 rounded border border-aletis-borda dark:border-white/10">
          {tool.shortcut}
        </span>
      )}
      {active && (
        <CornerDownLeft
          size={14}
          className="flex-shrink-0 text-aletis-verde dark:text-aletis-dourado"
          aria-hidden="true"
        />
      )}
    </button>
  )
}

function Hint({
  icon,
  label,
  text,
}: {
  icon?: React.ReactNode
  label: string
  text: string
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border border-aletis-borda dark:border-white/10 text-[10px] font-mono text-aletis-grafite-medio dark:text-white/60 bg-white dark:bg-white/5">
        {icon ?? label}
      </kbd>
      <span>{text}</span>
    </span>
  )
}
