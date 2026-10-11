// ============================================================
// PlanilhaInterativa — formulário web com abas por sheet
// para planilhas xlsx/xlsm do Processo de Assessoria.
// ============================================================
import { useEffect, useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { motion } from 'framer-motion'
import {
  Download,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  Eye,
  Save,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import MotionDialog from '../ui/MotionDialog'

interface StructureResponse {
  slug: string
  formato: string
  sheets: Array<{
    name: string
    index: number
    rowCount: number
    columnCount: number
    placeholders: Array<{
      name: string
      label: string
      hint?: string
      cell: string
      required: boolean
      clientePath?: string
      default?: string
    }>
  }>
}

interface PreviewResponse {
  template: { slug: string; codigo: string; nome: string; formato: string }
  resolved: Record<string, string>
  missing: string[]
  cliente: { id: string; nome: string }
}

interface TemplateMeta {
  slug: string
  codigo: string
  nome: string
  versao?: string
  descricao?: string
  formato: string
  hasVba?: boolean
  estrutura?: { sheets?: number; formulas?: number }
}

interface Props {
  template: TemplateMeta
  clienteId: string
  clienteNome?: string
  onClose: () => void
}

const planilhaSecondaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3.5 text-xs font-semibold text-foreground transition hover:bg-aletis-cream-papel disabled:cursor-not-allowed disabled:opacity-50'
const planilhaPrimaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const planilhaInputClass = 'mt-1.5 w-full rounded-xl border bg-card px-3 py-2.5 text-sm font-body text-foreground transition placeholder:text-aletis-grafite-claro/70 focus:outline-none focus:ring-2'
const planilhaPanelClass = 'rounded-lg border border-aletis-borda bg-card p-4 shadow-none'
const planilhaLabelClass = 'text-[11px] font-body font-semibold uppercase text-muted-foreground'

export default function PlanilhaInterativa({ template, clienteId, clienteNome, onClose }: Props) {
  const [structure, setStructure] = useState<StructureResponse | null>(null)
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [activeSheet, setActiveSheet] = useState(0)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      apiFetch<StructureResponse>(`/processo-assessoria/templates/${encodeURIComponent(template.slug)}/structure`),
      apiFetch<PreviewResponse>(`/processo-assessoria/templates/${encodeURIComponent(template.slug)}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId }),
      }),
    ])
      .then(([s, p]) => {
        if (cancelled) return
        setStructure(s)
        setPreview(p)
        // Inicializar inputs com valores resolvidos
        setInputs(p.resolved)
        if (s.sheets.length > 0) setActiveSheet(0)
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [template.slug, clienteId])

  // Auto-preview quando inputs mudam (com debounce de 600ms)
  useEffect(() => {
    if (!preview) return
    const t = setTimeout(() => {
      let cancelled = false
      setLoading(true)
      apiFetch<PreviewResponse>(
        `/processo-assessoria/templates/${encodeURIComponent(template.slug)}/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clienteId, inputs }),
        },
      )
        .then((d) => !cancelled && setPreview(d))
        .catch((e) => !cancelled && setError(String(e?.message ?? e)))
        .finally(() => !cancelled && setLoading(false))
      return () => {
        cancelled = true
      }
    }, 600)
    return () => clearTimeout(t)
  }, [inputs, template.slug, clienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const url = `/api/processo-assessoria/templates/${encodeURIComponent(template.slug)}/render`
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clienteId, inputs }),
      })
      if (!resp.ok) {
        const txt = await resp.text()
        throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`)
      }
      const blob = await resp.blob()
      const dl = document.createElement('a')
      dl.href = URL.createObjectURL(blob)
      const cd = resp.headers.get('Content-Disposition') ?? ''
      const m = cd.match(/filename="?([^"]+)"?/)
      dl.download = m?.[1] ?? `${template.slug}.${template.formato}`
      document.body.appendChild(dl)
      dl.click()
      document.body.removeChild(dl)
      setTimeout(() => URL.revokeObjectURL(dl.href), 30_000)
      setSavedMsg('Arquivo gerado com sucesso!')
      setTimeout(() => setSavedMsg(null), 3000)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setGenerating(false)
    }
  }

  const sheets = structure?.sheets ?? []
  const currentSheet = sheets[activeSheet]
  const missing = preview?.missing ?? []
  const canGenerate = !generating && missing.length === 0

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs font-body text-muted-foreground flex items-center gap-1.5">
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolvendo campos…
          </>
        ) : preview ? (
          <>
            <Eye className="w-3.5 h-3.5" /> Preview atualizado
          </>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={onClose}
          className={planilhaSecondaryButtonClass}
        >
          Cancelar
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          className={`${planilhaPrimaryButtonClass} ${
            canGenerate
              ? 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro'
              : 'bg-aletis-grafite-claro/15 text-muted-foreground cursor-not-allowed'
          }`}
        >
          {generating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          {generating ? 'Gerando…' : `Baixar .${template.formato}`}
        </motion.button>
      </div>
    </div>
  )

  return (
    <MotionDialog
      title={template.nome}
      eyebrow={`${template.codigo} · ${template.formato.toUpperCase()}${template.hasVba ? ' · arquivo oficial' : ''}`}
      subtitle={clienteNome ? <>Cliente: <span className="font-medium">{clienteNome}</span></> : undefined}
      icon={<FileSpreadsheet className="h-5 w-5" />}
      onClose={onClose}
      size="full"
      swipeToDismiss={!generating}
      footer={footer}
      bodyClassName="space-y-4 bg-aletis-cream-papel/35"
    >
      {structure && (
        <section className={planilhaPanelClass}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className={planilhaLabelClass}>Planilha oficial</p>
              <h3 className="mt-1 break-words font-display text-lg font-bold leading-tight text-foreground">
                {template.nome}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)]">
                {template.descricao || 'Preencha os campos editáveis por aba e preserve fórmulas, estrutura e macros do arquivo oficial.'}
              </p>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
              <PlanilhaMini label="Formato" value={template.formato.toUpperCase()} />
              <PlanilhaMini label="Abas" value={`${sheets.length}`} />
              <PlanilhaMini label="Campos" value={`${sheets.reduce((sum, sheet) => sum + sheet.placeholders.length, 0)}`} />
              <PlanilhaMini label="Fórmulas" value={template.estrutura?.formulas ? template.estrutura.formulas.toLocaleString('pt-BR') : '—'} />
            </div>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {savedMsg && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-center gap-2">
          <Save className="w-4 h-4" />
          <span>{savedMsg}</span>
        </div>
      )}

      {loading && !structure && (
        <div className="space-y-4">
          <div className="h-8 rounded-lg bg-gray-100 animate-pulse w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {structure && sheets.length === 0 && (
        <div className="rounded-lg border border-dashed border-aletis-borda p-6 text-center bg-aletis-cream-papel/45">
          <FileSpreadsheet className="w-8 h-8 text-aletis-grafite-claro/40 mx-auto mb-2" />
          <p className="text-sm font-body text-muted-foreground">
            Este documento não possui campos editáveis por planilha. Use o botão <strong>Baixar</strong> para obter o arquivo oficial.
          </p>
        </div>
      )}

      {structure && sheets.length > 0 && (
        <div className="flex flex-col h-full">
          {/* Tabs de sheets */}
          <div className="rounded-lg border border-aletis-borda bg-card p-2 shadow-none">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => setActiveSheet((s) => Math.max(0, s - 1))}
              disabled={activeSheet === 0}
              className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border border-aletis-borda text-muted-foreground hover:bg-aletis-cream-papel disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {sheets.map((sheet, idx) => {
              const hasFields = sheet.placeholders.length > 0
              const isActive = idx === activeSheet
              return (
                <button
                  key={sheet.name}
                  type="button"
                  onClick={() => setActiveSheet(idx)}
                  className={`flex-shrink-0 h-9 px-3 rounded-xl text-xs font-body font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-aletis-verde text-white shadow-sm'
                      : hasFields
                        ? 'bg-card text-foreground hover:bg-aletis-cream-papel border border-aletis-borda'
                        : 'bg-aletis-cream-papel/55 text-muted-foreground border border-aletis-borda'
                  }`}
                >
                  {sheet.name}
                  {hasFields && (
                    <span
                      className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-aletis-verde/10 text-foreground'
                      }`}
                    >
                      {sheet.placeholders.length}
                    </span>
                  )}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setActiveSheet((s) => Math.min(sheets.length - 1, s + 1))}
              disabled={activeSheet === sheets.length - 1}
              className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-xl border border-aletis-borda text-muted-foreground hover:bg-aletis-cream-papel disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          </div>

          {/* Info do sheet atual */}
          {currentSheet && (
            <div className="mb-3 mt-4 flex items-center justify-between rounded-lg border border-aletis-borda bg-card px-4 py-3 shadow-none">
              <div>
                <p className={planilhaLabelClass}>Aba atual</p>
                <h3 className="mt-1 text-sm font-display font-semibold text-foreground">
                  {currentSheet.name}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {currentSheet.rowCount} linhas · {currentSheet.columnCount} colunas
                </p>
              </div>
              <span className="rounded-xl bg-aletis-verde/10 px-2.5 py-1 text-[11px] font-mono text-foreground">
                {template.formato.toUpperCase()}
                {template.hasVba && ' + VBA'}
              </span>
            </div>
          )}

          {/* Campos do sheet */}
          {currentSheet && currentSheet.placeholders.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {currentSheet.placeholders.map((p) => {
                const val = inputs[p.name] ?? p.default ?? ''
                const isMissing = missing.includes(p.name)
                const isAuto = !!p.clientePath && !inputs[p.name]
                return (
                  <label
                    key={p.name}
                    className={`block rounded-lg border p-3 shadow-sm transition-colors ${
                      isMissing
                        ? 'border-red-200 bg-red-50/30'
                        : isAuto
                          ? 'border-aletis-verde/20 bg-aletis-verde/5'
                          : 'border-aletis-grafite-claro/15 bg-card hover:border-aletis-verde/30'
                    }`}
                  >
                    <span className="text-[11px] font-body font-semibold uppercase text-muted-foreground flex items-center gap-1">
                      {p.label}
                      {p.required && <span className="text-red-600">*</span>}
                      {isAuto && (
                        <span className="text-[11px] font-mono text-foreground bg-aletis-verde/10 px-1.5 py-0.5 rounded">
                          auto
                        </span>
                      )}
                    </span>
                    {p.hint && (
                      <span className="text-[11px] font-body text-muted-foreground block">{p.hint}</span>
                    )}
                    <span className="text-[11px] font-mono text-aletis-grafite-claro/60 block mt-0.5">{p.cell}</span>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) =>
                        setInputs((s) => ({ ...s, [p.name]: e.target.value }))
                      }
                      className={`${planilhaInputClass} ${
                        isMissing
                          ? 'border-red-300 bg-red-50/30 focus:ring-red-200'
                          : 'border-aletis-grafite-claro/25 focus:border-aletis-verde focus:ring-aletis-verde/20'
                      }`}
                      placeholder={p.default ?? ''}
                    />
                  </label>
                )
              })}
            </div>
          )}

          {currentSheet && currentSheet.placeholders.length === 0 && (
            <div className="rounded-lg border border-dashed border-aletis-borda p-6 text-center bg-aletis-cream-papel/45">
              <FileSpreadsheet className="w-8 h-8 text-aletis-grafite-claro/40 mx-auto mb-2" />
              <p className="text-sm font-body text-muted-foreground">
                Esta aba não possui campos editáveis no formulário web.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Campos obrigatórios faltando */}
      {preview && missing.length > 0 && (
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs font-body text-amber-800">
            <strong>Campos obrigatórios faltando:</strong>{' '}
            {missing.map((m) => {
              const ph = structure?.sheets
                .flatMap((s) => s.placeholders)
                .find((p) => p.name === m)
              return ph?.label ?? m
            }).join(', ')}
          </div>
        </div>
      )}

      {/* Estatísticas */}
      {structure && (
        <div className="mt-4 text-[11px] font-body text-muted-foreground flex flex-wrap gap-2.5 pt-2 border-t border-aletis-borda">
          {template.estrutura?.sheets && <span>{template.estrutura.sheets} sheets</span>}
          {template.estrutura?.formulas && (
            <span>{template.estrutura.formulas.toLocaleString('pt-BR')} fórmulas preservadas</span>
          )}
          {template.hasVba && <span className="text-amber-700 font-semibold">macros VBA preservadas</span>}
        </div>
      )}
    </MotionDialog>
  )
}

function PlanilhaMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-aletis-borda bg-aletis-cream-papel/55 px-3 py-2">
      <p className={planilhaLabelClass}>{label}</p>
      <p className="mt-1 break-words font-display text-sm font-bold text-foreground">{value}</p>
    </div>
  )
}
