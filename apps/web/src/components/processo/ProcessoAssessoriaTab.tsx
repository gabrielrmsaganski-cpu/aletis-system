// ============================================================
// ProcessoAssessoriaTab — biblioteca de documentos oficiais ALETIS.
// ============================================================
import { useEffect, useState, useMemo, lazy, Suspense } from 'react'
import { AnimatePresence } from 'framer-motion'
import { apiFetch } from '../../hooks/useApi'
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  Presentation,
  Download,
  CheckSquare,
  ListChecks,
  TrendingUp,
  Wheat,
  FolderArchive,
  Library,
  AlertTriangle,
  ChevronRight,
  Search,
  X,
} from 'lucide-react'

const ChecklistInterativo = lazy(() => import('./ChecklistInterativo'))
const GenerateDocumentModal = lazy(() => import('./GenerateDocumentModal'))
const PlanilhaInterativa = lazy(() => import('./PlanilhaInterativa'))

type DocFormato = 'docx' | 'xlsx' | 'xlsm' | 'pptx' | 'pdf'
type UiTab = 'documentos' | 'checklists' | 'diagnostico' | 'contratos' | 'operacional' | 'docs'

interface TemplateMeta {
  slug: string
  codigo: string
  nome: string
  versao: string
  descricao: string
  categoria: string
  formato: DocFormato
  uiTab: UiTab
  estrutura?: { sheets?: number; paginas?: number; slides?: number; formulas?: number }
  hasVba: boolean
  hasChecklist: boolean
  placeholdersCount: number
}

interface CategoriaMeta {
  label: string
  descricao: string
  emoji: string
  ordem: number
}

interface TabMeta {
  key: UiTab
  label: string
  emoji: string
}

interface CatalogResponse {
  total: number
  tabs: TabMeta[]
  categorias: Record<string, CategoriaMeta>
  templates: TemplateMeta[]
}

type MigrationStatus = 'native' | 'importable' | 'template-only' | 'needs-build' | 'reference'

interface WorkbookProfile {
  path: string
  filename: string
  sizeBytes: number
  sheets: number
  formulas: number
  populatedCells: number
  hasMacros: boolean
  module: string
  status: MigrationStatus
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  replacement: string
  implemented: string[]
  gaps: string[]
  nextActions: string[]
}

interface SpreadsheetSummary {
  generatedAt: string
  totals: {
    files: number
    sheets: number
    formulas: number
    populatedCells: number
    native: number
    importable: number
    templateOnly: number
    needsBuild: number
    reference: number
  }
  modules: Array<{
    id: string
    label: string
    description: string
    files: number
    formulas: number
    status: MigrationStatus
    routeHints: string[]
  }>
  workbooks: WorkbookProfile[]
}

const FORMATO_ICON: Record<DocFormato, typeof FileText> = {
  docx: FileText,
  xlsx: FileSpreadsheet,
  xlsm: FileSpreadsheet,
  pptx: Presentation,
  pdf: FileImage,
}

const FORMATO_COLOR: Record<DocFormato, string> = {
  docx: 'text-blue-600 bg-blue-50',
  xlsx: 'text-emerald-600 bg-emerald-50',
  xlsm: 'text-emerald-700 bg-emerald-100',
  pptx: 'text-orange-600 bg-orange-50',
  pdf: 'text-red-600 bg-red-50',
}

const TAB_ICON: Record<UiTab, typeof FileText> = {
  documentos: FolderArchive,
  checklists: ListChecks,
  diagnostico: TrendingUp,
  contratos: FileText,
  operacional: Wheat,
  docs: Library,
}

const processoPanelClass = 'rounded-lg border border-aletis-borda bg-card shadow-none'
const processoInputClass = 'rounded-xl border border-aletis-borda bg-card px-3 py-2 text-sm text-foreground transition placeholder:text-aletis-grafite-claro/70 focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/15'
const processoFilterButtonClass = 'h-9 rounded-xl border px-3 text-[11px] font-mono font-bold uppercase transition-colors'

interface Props {
  clienteId: string
  clienteNome?: string
}

export default function ProcessoAssessoriaTab({ clienteId, clienteNome }: Props) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<UiTab>('documentos')
  const [openTemplate, setOpenTemplate] = useState<TemplateMeta | null>(null)
  const [openChecklist, setOpenChecklist] = useState<TemplateMeta | null>(null)
  const [openPlanilha, setOpenPlanilha] = useState<TemplateMeta | null>(null)
  const [busca, setBusca] = useState('')
  const [formatoFiltro, setFormatoFiltro] = useState<DocFormato | 'todos'>('todos')

  useEffect(() => {
    let cancelled = false
    apiFetch<CatalogResponse>('/processo-assessoria/templates')
      .then((d) => {
        if (cancelled) return
        setCatalog(d)
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
    return () => {
      cancelled = true
    }
  }, [])

  const grouped = useMemo(() => {
    if (!catalog) return null
    const out: Record<UiTab, TemplateMeta[]> = {
      documentos: [],
      checklists: [],
      diagnostico: [],
      contratos: [],
      operacional: [],
      docs: [],
    }
    const q = busca.trim().toLowerCase()
    for (const t of catalog.templates) {
      if (formatoFiltro !== 'todos' && t.formato !== formatoFiltro) continue
      if (q) {
        const hay = `${t.nome} ${t.codigo} ${t.descricao} ${t.categoria}`.toLowerCase()
        if (!hay.includes(q)) continue
      }
      ;(out[t.uiTab] ?? out.documentos).push(t)
    }
    return out
  }, [catalog, busca, formatoFiltro])

  const totalFiltrado = useMemo(() => {
    if (!grouped) return 0
    return Object.values(grouped).reduce((acc, arr) => acc + arr.length, 0)
  }, [grouped])

  if (error) {
    return (
      <div className="rounded-xl border-l-4 border-red-500 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              Não consegui carregar o catálogo de documentos
            </p>
            <p className="text-xs text-red-700 mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!catalog || !grouped) {
    return (
      <div className="space-y-3">
        <div className="h-20 rounded-lg bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const tabs = catalog.tabs

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero card */}
      <div className={`${processoPanelClass} p-5`}>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl border border-aletis-borda bg-aletis-bege/45 flex items-center justify-center flex-shrink-0">
            <Library className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-display font-semibold text-foreground">
              Documentos oficiais ALETIS
            </h2>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-[var(--text-soft)]">
              {catalog.total} modelos oficiais para gerar, editar e baixar com dados de{' '}
              <strong className="text-foreground">{clienteNome ?? clienteId}</strong>{' '}
              a partir do CRM.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Pill icon={ListChecks} label={`${grouped.checklists.length} checklists`} />
              <Pill icon={FileText} label={`${grouped.contratos.length} contratos`} />
              <Pill icon={TrendingUp} label={`${grouped.diagnostico.length} diagnósticos`} />
              <Pill icon={Wheat} label={`${grouped.operacional.length} operacionais`} />
              <Pill icon={Library} label={`${grouped.docs.length} POPs/ITs/políticas`} />
            </div>
          </div>
        </div>
      </div>

      {/* Busca + filtro de formato */}
      <div className={`${processoPanelClass} flex flex-col items-stretch gap-3 p-3 sm:flex-row sm:items-center`}>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar documento por nome, código ou descrição..."
            className="w-full rounded-xl border border-aletis-borda bg-card py-2 pl-9 pr-9 text-sm text-foreground transition placeholder:text-aletis-grafite-claro/70 focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/15"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-aletis-grafite-claro/10 transition-colors"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['todos', 'docx', 'xlsx', 'xlsm', 'pptx', 'pdf'] as const).map((f) => {
            const active = formatoFiltro === f
            return (
              <button
                key={f}
                type="button"
              onClick={() => setFormatoFiltro(f)}
                className={`${processoFilterButtonClass} ${
                  active
                    ? 'bg-aletis-verde text-white border-aletis-verde'
                    : 'bg-card text-foreground border-aletis-grafite-claro/25 hover:border-aletis-verde/40'
                }`}
              >
                {f === 'todos' ? 'Todos' : f}
              </button>
            )
          })}
        </div>
        {(busca || formatoFiltro !== 'todos') && (
          <span className="text-[11px] font-body text-muted-foreground tabular-nums whitespace-nowrap px-2">
            {totalFiltrado} de {catalog.total}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className={`${processoPanelClass} flex flex-wrap gap-2 p-2`}>
        {tabs.map((t) => {
          const Icon = TAB_ICON[t.key]
          const count = grouped[t.key]?.length ?? 0
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`h-10 rounded-xl px-3 text-sm font-body font-semibold transition-colors flex items-center gap-2 ${
                active
                  ? 'bg-aletis-grafite-escuro text-white shadow-sm'
                  : 'bg-card text-[var(--text-soft)] hover:bg-aletis-bege/45 hover:text-aletis-grafite-escuro border border-aletis-borda'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    active ? 'bg-white/20 text-white' : 'bg-aletis-verde/10 text-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Conteúdo da tab ativa */}
      <TabContent
        tab={activeTab}
        templates={grouped[activeTab] ?? []}
        categorias={catalog.categorias}
        onSelect={(t) => {
          if (t.hasChecklist) {
            setOpenChecklist(t)
          } else if (t.formato === 'xlsx' || t.formato === 'xlsm') {
            setOpenPlanilha(t)
          } else {
            setOpenTemplate(t)
          }
        }}
      />

      {/* Modais */}
      <AnimatePresence>
        {openTemplate && (
          <Suspense fallback={<ModalShell />}>
            <GenerateDocumentModal
              key="generate-doc"
              template={openTemplate}
              clienteId={clienteId}
              clienteNome={clienteNome}
              onClose={() => setOpenTemplate(null)}
            />
          </Suspense>
        )}
        {openChecklist && (
          <Suspense fallback={<ModalShell />}>
            <ChecklistInterativo
              key="checklist"
              template={openChecklist}
              clienteId={clienteId}
              onClose={() => setOpenChecklist(null)}
            />
          </Suspense>
        )}
        {openPlanilha && (
          <Suspense fallback={<ModalShell />}>
            <PlanilhaInterativa
              key="planilha"
              template={openPlanilha}
              clienteId={clienteId}
              clienteNome={clienteNome}
              onClose={() => setOpenPlanilha(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  )
}

const STATUS_META: Record<MigrationStatus, { label: string; className: string }> = {
  native: { label: 'Nativo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  importable: { label: 'Importável', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  'template-only': { label: 'Template', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  'needs-build': { label: 'Construir', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  reference: { label: 'Referência', className: 'bg-zinc-50 text-zinc-600 border-zinc-200' },
}

const WORKBOOK_TO_TEMPLATE: Record<string, string> = {
  'R.OP.001_Registro de Gestao Financeira_v2.0.xlsm': 'registro-gestao-financeira-v2',
  'R.OP.001_Registro de Gestão Financeirav2.0.xlsm (v.01 -  em rev_2026_02_25).xlsm': 'registro-gestao-financeira-v2',
  'R.OP.001_Diagnóstico Financeiro_v1.0.xlsm': 'diagnostico-financeiro',
  'R.OP.002_Cadastro de Clientes_v1.0.xlsm': 'cadastro-clientes',
  'R.OP.007_Registro Financeiro Mensal_Cliente_v1.0.xlsx': 'registro-financeiro-mensal',
  'R.OP.010_Custos do Cliente_v1.0.xlsx': 'custos-cliente',
  'R.OP.011_Quadro de Produção do Cliente_v1.0.xlsx': 'quadro-producao-cliente',
  'R.CM.004_Gerenciador de Contratos_v1.0.xlsx': 'gerenciador-contratos',
  'R.OP.008_Foto Mensal_v1.0.xlsm': 'foto-mensal',
  'R.OP.009_Checklist de Rotina_v1.0.xlsx': 'checklist-rotina-assessoria',
}

function PlanilhasSistemaPanel({
  summary,
  onSelectTemplate,
  catalogTemplates,
}: {
  summary: SpreadsheetSummary
  onSelectTemplate?: (tpl: TemplateMeta) => void
  catalogTemplates: TemplateMeta[]
}) {
  return null
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-aletis-cream/30 border border-aletis-grafite-claro/10 px-3 py-2">
      <p className="text-[11px] font-body text-muted-foreground">{label}</p>
      <p className="text-sm font-display font-semibold text-foreground tabular-nums">
        {value.toLocaleString('pt-BR')}
      </p>
    </div>
  )
}

function Pill({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-aletis-borda bg-card px-2.5 py-1 text-[11px] font-body font-semibold text-foreground">
      <Icon className="w-3.5 h-3.5 text-foreground" />
      {label}
    </span>
  )
}

function TabContent({
  tab,
  templates,
  categorias,
  onSelect,
}: {
  tab: UiTab
  templates: TemplateMeta[]
  categorias: Record<string, CategoriaMeta>
  onSelect: (t: TemplateMeta) => void
}) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-aletis-borda bg-aletis-cream-papel/45 p-8 text-center">
        <Search className="w-7 h-7 text-aletis-grafite-claro/50 mx-auto mb-2" />
        <p className="text-sm font-body text-muted-foreground">
          Nenhum documento corresponde aos filtros nesta aba.
        </p>
        <p className="text-xs font-body text-aletis-grafite-claro/70 mt-1">
          Tente limpar a busca ou trocar de aba.
        </p>
      </div>
    )
  }
  // agrupa por categoria
  const byCat = new Map<string, TemplateMeta[]>()
  for (const t of templates) {
    const arr = byCat.get(t.categoria) ?? []
    arr.push(t)
    byCat.set(t.categoria, arr)
  }
  const ordered = Array.from(byCat.entries()).sort((a, b) => {
    const oa = categorias[a[0]]?.ordem ?? 99
    const ob = categorias[b[0]]?.ordem ?? 99
    return oa - ob
  })
  return (
    <div className="space-y-6">
      {ordered.map(([cat, list]) => {
        const meta = categorias[cat]
        return (
          <section key={cat}>
            <header className="mb-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-aletis-borda bg-aletis-bege/45 text-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-xs font-body font-semibold uppercase text-foreground">
                    {meta?.label ?? cat}
                  </h3>
                  {meta?.descricao && (
                    <p className="text-[11px] text-muted-foreground -mt-0.5">{meta.descricao}</p>
                  )}
                </div>
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {list.length} doc{list.length !== 1 ? 's' : ''}
              </span>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((t) => (
                <TemplateCardItem key={t.slug} t={t} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function TemplateCardItem({
  t,
  onSelect,
}: {
  t: TemplateMeta
  onSelect: (t: TemplateMeta) => void
}) {
  const Icon = FORMATO_ICON[t.formato] ?? FileText
  const colorCls = FORMATO_COLOR[t.formato] ?? 'text-gray-600 bg-gray-50'
  return (
    <button
      type="button"
      onClick={() => onSelect(t)}
      className="group relative overflow-hidden rounded-lg border border-aletis-borda bg-card p-4 text-left shadow-none transition-all hover:border-aletis-verde/35 "
    >
      <div className="flex items-start gap-2.5">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colorCls}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[11px] font-mono font-semibold text-foreground uppercase">
              {t.codigo} v{t.versao}
            </p>
            <span className="rounded-lg bg-aletis-grafite-escuro/5 px-1.5 py-0.5 text-[11px] font-mono font-bold uppercase text-foreground">
              {t.formato}
            </span>
            {t.hasVba && (
              <span className="rounded-lg bg-amber-100 px-1.5 py-0.5 text-[11px] font-mono font-bold text-amber-700">
                VBA
              </span>
            )}
            {t.hasChecklist && (
              <span className="rounded-lg bg-blue-100 px-1.5 py-0.5 text-[11px] font-mono font-bold text-blue-700">
                INTERATIVO
              </span>
            )}
          </div>
          <p className="text-sm font-display font-semibold text-foreground mt-1 leading-snug line-clamp-2">
            {t.nome}
          </p>
          <p className="text-xs font-body text-muted-foreground mt-1 line-clamp-2">{t.descricao}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] font-body text-muted-foreground">
            {t.estrutura?.sheets && (
              <span className="tabular-nums">{t.estrutura.sheets} sheets</span>
            )}
            {t.estrutura?.paginas && (
              <span className="tabular-nums">{t.estrutura.paginas} páginas</span>
            )}
            {t.estrutura?.slides && (
              <span className="tabular-nums">{t.estrutura.slides} slides</span>
            )}
            {t.estrutura?.formulas && (
              <span className="tabular-nums">{t.estrutura.formulas.toLocaleString('pt-BR')} fórmulas</span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-aletis-grafite-claro/40 group-hover:text-aletis-verde transition-colors" />
      </div>
      {/* footer ação */}
      <div className="mt-3 flex items-center justify-between border-t border-aletis-borda pt-3">
        <span className="text-[11px] font-body text-muted-foreground">
          {t.hasChecklist
            ? 'Checklist interativo'
            : t.formato === 'xlsx' || t.formato === 'xlsm'
              ? 'Planilha interativa'
              : t.placeholdersCount > 0
                ? `${t.placeholdersCount} campos`
                : 'Download direto'}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-body font-medium text-foreground">
          {t.hasChecklist ? (
            <CheckSquare className="w-3.5 h-3.5" />
          ) : t.formato === 'xlsx' || t.formato === 'xlsm' ? (
            <FileSpreadsheet className="w-3.5 h-3.5" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {t.hasChecklist ? 'Abrir' : t.formato === 'xlsx' || t.formato === 'xlsm' ? 'Preencher' : 'Gerar'}
        </span>
      </div>
    </button>
  )
}

function ModalShell() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[90vw] max-w-2xl rounded-lg bg-card p-8 animate-pulse">
        <div className="h-8 w-2/3 bg-gray-100 rounded mb-4" />
        <div className="h-4 w-full bg-gray-100 rounded mb-2" />
        <div className="h-4 w-5/6 bg-gray-100 rounded" />
      </div>
    </div>
  )
}
