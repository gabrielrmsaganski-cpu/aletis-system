// ============================================================
// ProcessoAssessoriaTab — 25 documentos do Processo TEX CAPITAL
// (checklists, contratos, planilhas financeiras/operacionais,
// gerenciadores, políticas, POPs, ITs, relatórios, registros).
// ============================================================
import { useEffect, useState, useMemo, lazy, Suspense } from 'react'
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
  Sparkles,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react'

const ChecklistInterativo = lazy(() => import('./ChecklistInterativo'))
const GenerateDocumentModal = lazy(() => import('./GenerateDocumentModal'))

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
    for (const t of catalog.templates) {
      ;(out[t.uiTab] ?? out.documentos).push(t)
    }
    return out
  }, [catalog])

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
        <div className="h-20 rounded-xl bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const tabs = catalog.tabs

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero card */}
      <div className="card-premium p-5 bg-gradient-to-br from-aletis-verde-escuro/[0.03] via-white to-aletis-dourado/[0.04]">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-aletis-verde to-aletis-dourado flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
              Processo de Assessoria TEX CAPITAL
            </h2>
            <p className="text-sm font-body text-aletis-grafite-claro mt-1">
              {catalog.total} documentos oficiais (POL/POP/IT/R.OP/R.CM/R.GQ) — gerar com dados de{' '}
              <strong className="text-aletis-grafite-escuro">{clienteNome ?? clienteId}</strong>{' '}
              preservando 100% da formatação, fontes, logos, fórmulas e macros VBA.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Pill icon={ListChecks} label={`${grouped.checklists.length} checklists`} />
              <Pill icon={FileText} label={`${grouped.contratos.length} contratos`} />
              <Pill icon={TrendingUp} label={`${grouped.diagnostico.length} planilhas core`} />
              <Pill icon={Wheat} label={`${grouped.operacional.length} operacionais`} />
              <Pill icon={Library} label={`${grouped.docs.length} POPs/ITs/políticas`} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-aletis-grafite-claro/15 pb-3">
        {tabs.map((t) => {
          const Icon = TAB_ICON[t.key]
          const count = grouped[t.key]?.length ?? 0
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-body font-medium transition-colors flex items-center gap-2 ${
                active
                  ? 'bg-aletis-verde text-white shadow-sm'
                  : 'bg-white text-aletis-grafite-escuro hover:bg-aletis-verde/5 border border-aletis-grafite-claro/20'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              {count > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    active ? 'bg-white/20 text-white' : 'bg-aletis-verde/10 text-aletis-verde'
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
          if (t.hasChecklist) setOpenChecklist(t)
          else setOpenTemplate(t)
        }}
      />

      {/* Modais */}
      {openTemplate && (
        <Suspense fallback={<ModalShell />}>
          <GenerateDocumentModal
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
            template={openChecklist}
            clienteId={clienteId}
            onClose={() => setOpenChecklist(null)}
          />
        </Suspense>
      )}
    </div>
  )
}

function Pill({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 border border-aletis-grafite-claro/20 text-[11px] font-body font-medium text-aletis-grafite-escuro">
      <Icon className="w-3.5 h-3.5 text-aletis-verde" />
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
      <div className="rounded-xl border border-dashed border-aletis-grafite-claro/30 p-8 text-center bg-aletis-cream/30">
        <p className="text-sm font-body text-aletis-grafite-claro">
          Nenhum documento nesta aba para este perfil.
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
            <header className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">{meta?.emoji ?? '📄'}</span>
                <div>
                  <h3 className="text-xs font-body font-semibold uppercase tracking-wider text-aletis-grafite-escuro">
                    {meta?.label ?? cat}
                  </h3>
                  {meta?.descricao && (
                    <p className="text-[11px] text-aletis-grafite-claro -mt-0.5">{meta.descricao}</p>
                  )}
                </div>
              </div>
              <span className="text-[11px] text-aletis-grafite-claro tabular-nums">
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
      className="group text-left rounded-xl border border-aletis-grafite-claro/20 bg-white p-3.5 hover:border-aletis-verde/40 hover:shadow-md transition-all relative overflow-hidden"
    >
      {/* dourado stripe top quando hover */}
      <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-aletis-dourado/0 via-aletis-dourado to-aletis-dourado/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-start gap-2.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorCls}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-[10px] font-mono font-semibold text-aletis-verde uppercase tracking-wider">
              {t.codigo} v{t.versao}
            </p>
            <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-aletis-grafite-escuro/5 text-aletis-grafite-escuro rounded uppercase">
              {t.formato}
            </span>
            {t.hasVba && (
              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-amber-100 text-amber-700 rounded">
                VBA
              </span>
            )}
            {t.hasChecklist && (
              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-blue-100 text-blue-700 rounded">
                INTERATIVO
              </span>
            )}
          </div>
          <p className="text-sm font-display font-semibold text-aletis-grafite-escuro mt-1 leading-snug line-clamp-2">
            {t.nome}
          </p>
          <p className="text-xs font-body text-aletis-grafite-claro mt-1 line-clamp-2">{t.descricao}</p>
          <div className="flex items-center gap-3 mt-2 text-[10px] font-body text-aletis-grafite-claro">
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
      <div className="mt-2.5 pt-2.5 border-t border-aletis-grafite-claro/10 flex items-center justify-between">
        <span className="text-[11px] font-body text-aletis-grafite-claro">
          {t.hasChecklist ? 'Checklist interativo' : t.placeholdersCount > 0 ? `${t.placeholdersCount} campos` : 'Download direto'}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-body font-medium text-aletis-verde">
          {t.hasChecklist ? <CheckSquare className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
          {t.hasChecklist ? 'Abrir' : 'Gerar'}
        </span>
      </div>
    </button>
  )
}

function ModalShell() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[90vw] max-w-2xl rounded-2xl bg-white p-8 animate-pulse">
        <div className="h-8 w-2/3 bg-gray-100 rounded mb-4" />
        <div className="h-4 w-full bg-gray-100 rounded mb-2" />
        <div className="h-4 w-5/6 bg-gray-100 rounded" />
      </div>
    </div>
  )
}
