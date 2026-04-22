/**
 * Ferramentas — catálogo explicativo completo do sistema ALETIS.
 *
 * Cada entrada do toolCatalog vira um card editorial com:
 *   - Ícone + categoria (eyebrow)
 *   - Título em serif
 *   - Descrição longa
 *   - Atalho de teclado (se houver)
 *   - CTA "Abrir →"
 *
 * Agrupa por categoria e suporta busca em tempo real.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search, X, Command } from 'lucide-react'
import { AutoPageHeader } from '../components/ui/PageHeader'
import {
  CATEGORIES,
  searchTools,
  type ToolEntry,
} from '../navigation/toolCatalog'

export default function Ferramentas() {
  const [query, setQuery] = useState('')

  const results = useMemo(() => searchTools(query), [query])

  const grouped = useMemo(() => {
    return CATEGORIES.map((category) => ({
      category,
      tools: results.filter((t) => t.category === category.id),
    })).filter((g) => g.tools.length > 0)
  }, [results])

  return (
    <div className="pb-16">
      <AutoPageHeader
        actions={
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('aletis:palette:open'))}
            className="inline-flex items-center gap-2 rounded-xl border border-aletis-borda dark:border-white/10 bg-white dark:bg-white/5 hover:border-aletis-verde/40 px-3.5 py-2 text-[13px] font-medium text-aletis-grafite-escuro dark:text-white/90 transition-colors"
          >
            <Command size={13} />
            Abrir paleta de comandos
            <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-aletis-grafite-claro dark:text-white/40 px-1.5 py-0.5 rounded border border-aletis-borda dark:border-white/10">
              ⌘K
            </span>
          </button>
        }
      />

      {/* Search bar */}
      <div className="mb-10 max-w-xl">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-aletis-grafite-claro dark:text-white/40"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por nome, categoria ou palavra-chave..."
            className="
              w-full pl-11 pr-10 py-3 rounded-2xl text-[14px]
              bg-white dark:bg-white/5
              border border-aletis-borda dark:border-white/10
              text-aletis-grafite-escuro dark:text-white
              placeholder:text-aletis-grafite-claro dark:placeholder:text-white/30
              focus:outline-none focus:ring-2 focus:ring-aletis-verde/30 focus:border-aletis-verde
              shadow-[0_4px_20px_-10px_rgba(15,76,53,0.15)]
              transition-all
            "
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-aletis-grafite-claro hover:bg-aletis-bege dark:hover:bg-white/10 transition-colors"
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {query && (
          <p className="mt-2 text-xs text-aletis-grafite-medio dark:text-white/50">
            {results.length} {results.length === 1 ? 'resultado' : 'resultados'} para "{query}"
          </p>
        )}
      </div>

      {/* Grouped sections */}
      {grouped.length === 0 && (
        <div className="text-center py-16">
          <p className="text-aletis-grafite-medio dark:text-white/50">
            Nenhuma ferramenta encontrada para <span className="font-semibold">"{query}"</span>.
          </p>
        </div>
      )}

      <div className="space-y-12">
        {grouped.map(({ category, tools }) => (
          <section key={category.id}>
            <header className="mb-5 flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-aletis-dourado-escuro">
                    {category.label}
                  </span>
                  <span className="h-px w-16 bg-gradient-to-r from-aletis-dourado/60 to-transparent" />
                </div>
                <h2 className="font-display text-2xl text-aletis-grafite-escuro dark:text-white leading-tight">
                  {category.subtitle}
                </h2>
              </div>
              <span className="text-xs text-aletis-grafite-claro dark:text-white/40">
                {tools.length} {tools.length === 1 ? 'ferramenta' : 'ferramentas'}
              </span>
            </header>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {tools.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function ToolCard({ tool }: { tool: ToolEntry }) {
  const Icon = tool.icon
  return (
    <Link
      to={tool.route}
      className="
        group relative flex flex-col h-full p-6 rounded-2xl
        bg-white dark:bg-white/[0.03]
        border border-aletis-borda dark:border-white/10
        hover:border-aletis-verde/50
        hover:shadow-[0_20px_50px_-20px_rgba(15,76,53,0.25)]
        transition-all duration-300
        overflow-hidden
      "
    >
      {/* Accent corner */}
      <span
        className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-aletis-dourado/0 to-transparent group-hover:from-aletis-dourado/15 transition-all duration-500 rounded-bl-full"
        aria-hidden="true"
      />

      <div className="flex items-start justify-between mb-4 relative">
        <span className="flex-shrink-0 w-11 h-11 rounded-xl bg-aletis-verde/8 dark:bg-aletis-verde/20 group-hover:bg-aletis-verde group-hover:text-white flex items-center justify-center text-aletis-verde dark:text-aletis-dourado transition-all duration-300">
          <Icon size={20} />
        </span>
        {tool.badge && <BadgePill variant={tool.badge} />}
      </div>

      <h3 className="font-display text-[20px] leading-tight text-aletis-grafite-escuro dark:text-white mb-1">
        {tool.title}
      </h3>
      <p className="text-[13px] font-medium text-aletis-verde dark:text-aletis-dourado mb-3">
        {tool.tagline}
      </p>
      <p className="text-[13.5px] leading-relaxed text-aletis-grafite-medio dark:text-white/60 flex-1">
        {tool.description}
      </p>

      <div className="mt-5 pt-4 border-t border-aletis-borda/60 dark:border-white/5 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-aletis-grafite-escuro dark:text-white group-hover:text-aletis-verde dark:group-hover:text-aletis-dourado transition-colors">
          Abrir
          <ArrowRight
            size={14}
            className="transition-transform duration-300 group-hover:translate-x-1"
          />
        </span>
        {tool.shortcut && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-aletis-grafite-claro dark:text-white/40 px-2 py-1 rounded border border-aletis-borda dark:border-white/10">
            {tool.shortcut}
          </span>
        )}
      </div>
    </Link>
  )
}

function BadgePill({ variant }: { variant: 'novo' | 'beta' | 'ia' }) {
  if (variant === 'novo')
    return (
      <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-aletis-dourado text-aletis-verde-escuro">
        novo
      </span>
    )
  if (variant === 'ia')
    return (
      <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-aletis-verde/15 text-aletis-verde">
        IA
      </span>
    )
  return (
    <span className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-aletis-grafite-medio/15 text-aletis-grafite-medio">
      beta
    </span>
  )
}
