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
import {
  ArrowRight,
  Search,
  X,
  Command,
  Keyboard,
  Sparkles,
  Workflow,
  LifeBuoy,
} from 'lucide-react'
import { AutoPageHeader } from '../components/ui/PageHeader'
import {
  CATEGORIES,
  searchTools,
  TOOL_CATALOG,
  type ToolEntry,
} from '../navigation/toolCatalog'

/** Auto-referência à própria página — filtrada da grid, já que clicar não navegaria a lugar algum. */
const SELF_REF_ID = 'ferramentas'

export default function Ferramentas() {
  const [query, setQuery] = useState('')

  const results = useMemo(
    () => searchTools(query).filter((t) => t.id !== SELF_REF_ID),
    [query]
  )

  const grouped = useMemo(() => {
    return CATEGORIES.map((category) => ({
      category,
      tools: results.filter((t) => t.category === category.id),
    })).filter((g) => g.tools.length > 0)
  }, [results])

  const totalTools = TOOL_CATALOG.filter((t) => t.id !== SELF_REF_ID).length
  const showingOverview = !query.trim()

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

      {showingOverview && <SystemOverview totalTools={totalTools} />}

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

/**
 * SystemOverview — bloco editorial que apresenta o sistema inteiro.
 *
 * Substitui o que seria o "card auto-referente de Todas as ferramentas"
 * por uma explicação genuína do que o ALETIS faz e como as peças se
 * encaixam. Escondida quando o usuário digita no filtro de busca, pra
 * não competir com os resultados.
 */
function SystemOverview({ totalTools }: { totalTools: number }) {
  const pillars: Array<{
    eyebrow: string
    title: string
    body: string
    icon: React.ReactNode
  }> = [
    {
      eyebrow: 'Fluxo do cliente',
      title: 'Da prospecção ao contrato',
      body:
        'Prospecção gera leads qualificados por SICAR/CAR. O CRM classifica cada um em estágios. Propostas constroem simulações Price/SAC. Contratos materializam em 6 tipos de instrumento (CPR-F, CPR-F/Física, confissão, renegociação, acordo, transação).',
      icon: <Workflow size={18} />,
    },
    {
      eyebrow: 'Operação agro',
      title: 'Custeio + crédito rural',
      body:
        'Plano de custeio 2026 com 7 abas (Proponente → Comercialização), cálculo de VPL/TIR/payback/margem, auto-save e export PDF no padrão BB/Sicoob. Calculadora de linhas Pronamp/Pronaf/MCR verificada no servidor.',
      icon: <Sparkles size={18} />,
    },
    {
      eyebrow: 'IA Alix',
      title: 'Agente com ~69 ferramentas',
      body:
        'Claude Sonnet 4.6 via Azure Foundry com acesso a dossiê, custeio, contabilidade Lambda, fiscal, relatórios, simuladores CBS-IBS/Funrural/Desenrola, BSC Agro, SICOR Bacen, RAG BM25, upload multimodal e geração real de PDF/DOCX/XLSX.',
      icon: <LifeBuoy size={18} />,
    },
  ]

  return (
    <section
      aria-labelledby="overview-title"
      className="mb-12 rounded-3xl bg-gradient-to-br from-aletis-verde to-aletis-verde-escuro text-white relative overflow-hidden shadow-[0_30px_80px_-30px_rgba(15,76,53,0.45)]"
    >
      {/* Decoração sutil: grão + brilho em diagonal */}
      <span
        aria-hidden="true"
        className="absolute -top-24 -right-20 w-80 h-80 rounded-full bg-aletis-dourado/15 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-1/4 w-96 h-40 rounded-full bg-aletis-dourado/10 blur-3xl"
      />

      {/* Parte 1 — manifesto */}
      <div className="relative px-6 lg:px-10 pt-10 pb-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-aletis-dourado">
              O que é o ALETIS
            </span>
            <span className="h-px w-16 bg-gradient-to-r from-aletis-dourado/70 to-transparent" />
          </div>
          <h2
            id="overview-title"
            className="font-display text-[32px] lg:text-[40px] leading-[1.05] tracking-tight text-white"
          >
            Uma plataforma para reestruturar dívidas rurais — da primeira
            visita ao campo até o contrato assinado.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/80 max-w-2xl">
            O sistema reúne <b className="text-white">{totalTools} ferramentas</b> organizadas
            em seis trilhas que acompanham o consultor em todo o ciclo:
            prospecção de produtores, análise financeira, estruturação de
            crédito rural, negociação com credores, inteligência de mercado
            e gestão interna do escritório. Tudo conectado à{' '}
            <b className="text-aletis-dourado">Alix</b>, a IA da ALETIS
            treinada nesse repertório.
          </p>
        </div>

        {/* Números */}
        <div className="grid grid-cols-3 gap-2 content-center">
          <StatBlock value={String(totalTools)} label="ferramentas" />
          <StatBlock value="6" label="categorias" />
          <StatBlock value="~69" label="tools IA" accent />
          <StatBlock value="6" label="tipos de contrato" />
          <StatBlock value="7" label="abas custeio" />
          <StatBlock value="4" label="perspectivas BSC" />
        </div>
      </div>

      {/* Parte 2 — três pilares */}
      <div className="relative border-t border-white/10 bg-white/[0.04] backdrop-blur-sm">
        <div className="px-6 lg:px-10 py-8 grid gap-8 md:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="relative">
              <div className="flex items-center gap-2.5 mb-3">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-aletis-dourado/15 text-aletis-dourado">
                  {p.icon}
                </span>
                <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-aletis-dourado">
                  {p.eyebrow}
                </span>
              </div>
              <h3 className="font-display text-[19px] leading-tight text-white mb-1.5">
                {p.title}
              </h3>
              <p className="text-[13px] leading-relaxed text-white/70">{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Parte 3 — shortcuts & next */}
      <div className="relative border-t border-white/10 px-6 lg:px-10 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 text-[12.5px] text-white/70">
          <Keyboard size={14} className="text-aletis-dourado" />
          <span>
            Atalho global:{' '}
            <kbd className="inline-flex items-center gap-0.5 text-[11px] font-mono px-1.5 py-0.5 rounded border border-white/20 bg-white/5 text-white mx-0.5">
              ⌘K
            </kbd>
            {' '}ou{' '}
            <kbd className="inline-flex items-center gap-0.5 text-[11px] font-mono px-1.5 py-0.5 rounded border border-white/20 bg-white/5 text-white mx-0.5">
              Ctrl K
            </kbd>
            {' '}abre a paleta e pula direto para qualquer ferramenta.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('aletis:palette:open'))}
            className="inline-flex items-center gap-2 rounded-xl bg-aletis-dourado text-aletis-verde-escuro hover:bg-aletis-dourado-claro px-4 py-2 text-[13px] font-semibold transition-colors"
          >
            <Command size={13} />
            Abrir paleta
          </button>
          <Link
            to="/ia"
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 text-white px-4 py-2 text-[13px] font-semibold transition-colors"
          >
            Conversar com Alix
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </section>
  )
}

function StatBlock({
  value,
  label,
  accent,
}: {
  value: string
  label: string
  accent?: boolean
}) {
  return (
    <div
      className={`
        rounded-xl px-3 py-2.5
        ${accent ? 'bg-aletis-dourado/15 border border-aletis-dourado/30' : 'bg-white/[0.06] border border-white/10'}
      `}
    >
      <div
        className={`font-display text-[22px] leading-none ${accent ? 'text-aletis-dourado' : 'text-white'}`}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] tracking-wider uppercase text-white/60">
        {label}
      </div>
    </div>
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
