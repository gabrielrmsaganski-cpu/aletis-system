// ============================================================
// GenerateDocumentModal — formulário dinâmico para gerar
// qualquer um dos 25 documentos do Processo de Assessoria.
// ============================================================
import { useEffect, useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { ChevronDown, Download, Eye, AlertTriangle, Loader2, FileText } from 'lucide-react'
import MotionDialog from '../ui/MotionDialog'

interface PlaceholderMeta {
  name: string
  label: string
  hint?: string
  cell?: string
  clientePath?: string
  required: boolean
  default?: string
  grupo?: string
  tipo?: 'texto' | 'textarea' | 'numero' | 'moeda' | 'data' | 'email' | 'telefone'
}

interface TemplateFull {
  slug: string
  codigo: string
  nome: string
  versao: string
  descricao: string
  formato: 'docx' | 'xlsx' | 'xlsm' | 'pptx' | 'pdf'
  categoria: string
  placeholders?: PlaceholderMeta[]
  estrutura?: { sheets?: number; paginas?: number; slides?: number; formulas?: number }
  hasVba?: boolean
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
  formato: TemplateFull['formato']
  categoria?: string
  hasVba?: boolean
  placeholdersCount?: number
}

interface Props {
  template: TemplateMeta
  clienteId: string
  clienteNome?: string
  onClose: () => void
}

const modalFieldClass = 'mt-1 w-full rounded-xl border bg-card px-3 py-2.5 text-sm font-body text-foreground transition placeholder:text-aletis-grafite-claro/70 focus:outline-none focus:ring-2 dark:bg-white/5 dark:text-white'
const modalSecondaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-aletis-borda bg-card px-3.5 text-xs font-semibold text-foreground transition hover:bg-aletis-cream-papel disabled:cursor-not-allowed disabled:opacity-50'
const modalPrimaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const modalPanelClass = 'rounded-lg border border-aletis-borda bg-card p-4 shadow-none dark:border-white/10 dark:bg-white/5'
const modalLabelClass = 'text-[11px] font-body font-semibold uppercase text-muted-foreground dark:text-white/50'

export default function GenerateDocumentModal({ template, clienteId, clienteNome, onClose }: Props) {
  const [full, setFull] = useState<TemplateFull | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ template: TemplateFull }>(
      `/processo-assessoria/templates/${encodeURIComponent(template.slug)}`,
    )
      .then((d) => !cancelled && setFull(d.template))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
    return () => {
      cancelled = true
    }
  }, [template.slug])

  // Auto-preview quando template carrega ou inputs mudam
  useEffect(() => {
    if (!full) return
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
  }, [full, inputs, template.slug, clienteId])

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
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setGenerating(false)
    }
  }

  const placeholders = full?.placeholders ?? []
  const editables = placeholders.filter((p) => !p.clientePath)
  const auto = placeholders.filter((p) => p.clientePath)
  const missing = preview?.missing ?? []
  const canGenerate = !generating && missing.length === 0

  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs font-body text-muted-foreground flex items-center gap-1.5">
        {loading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolvendo placeholders…
          </>
        ) : preview ? (
          <>
            <Eye className="w-3.5 h-3.5" /> Preview atualizado
          </>
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className={modalSecondaryButtonClass}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          className={`${modalPrimaryButtonClass} ${
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
        </button>
      </div>
    </div>
  )

  return (
    <MotionDialog
      title={template.nome}
      eyebrow={`${template.codigo} · ${template.formato.toUpperCase()}${template.hasVba ? ' · arquivo oficial' : ''}`}
      subtitle={clienteNome ? <>Cliente: <span className="font-medium">{clienteNome}</span></> : undefined}
      icon={<FileText className="h-5 w-5" />}
      onClose={onClose}
      size="full"
      bodyClassName="space-y-4 bg-aletis-cream-papel/35"
      footer={footer}
      swipeToDismiss={!generating}
    >
          <section className={modalPanelClass}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-aletis-borda bg-muted text-foreground">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className={modalLabelClass}>Documento oficial</p>
                  <h3 className="mt-1 break-words font-display text-lg font-bold leading-tight text-foreground dark:text-white">
                    {template.nome}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)] dark:text-white/60">
                    {template.codigo} · versão {full?.versao ?? template.versao ?? 'atual'} · formato {template.formato.toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
                <DocMini label="Formato" value={template.formato.toUpperCase()} />
                <DocMini label="Campos" value={String(placeholders.length)} />
                <DocMini label="CRM" value={String(auto.length)} />
                <DocMini label="Manuais" value={String(editables.length)} />
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {full?.descricao && (
            <section className={modalPanelClass}>
              <p className={modalLabelClass}>Descrição operacional</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)]">{full.descricao}</p>
            </section>
          )}

          {/* Auto-preenchidos do CRM */}
          {auto.length > 0 && (
            <details className="rounded-lg border border-aletis-borda bg-card shadow-none group" open>
              <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-[11px] font-body font-semibold uppercase text-muted-foreground hover:bg-aletis-cream-papel/50">
                <span>Preenchidos automaticamente do CRM ({auto.length})</span>
                <ChevronDown className="h-4 w-4 text-aletis-grafite-claro/60 transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-2 px-4 pb-4 pt-1 md:grid-cols-2 xl:grid-cols-3">
                {auto.map((p) => (
                  <div key={p.name} className="min-w-0 rounded-xl border border-aletis-borda bg-aletis-cream-papel/45 px-3 py-2 text-xs font-body">
                    <p className={modalLabelClass}>{p.label}</p>
                    <p className="mt-1 break-words font-semibold text-foreground [overflow-wrap:anywhere]">
                      {preview?.resolved[p.name] || (
                        <span className="text-amber-600 italic">— faltando no cadastro —</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Editáveis agrupados em accordion */}
          {editables.length > 0 && (
            <div className="space-y-2">
              <h3 className={modalLabelClass}>
                Campos a preencher ({editables.length})
              </h3>
              {groupBy(editables, (p) => p.grupo ?? 'Geral').map(([grupo, items], gi) => (
                <details
                  key={grupo}
                  open={gi === 0}
                  className="rounded-lg border border-aletis-borda bg-card shadow-none group"
                >
                  <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between text-xs font-body font-semibold text-foreground hover:bg-aletis-cream-papel/45">
                    <span className="flex items-center gap-2">
                      {grupo}
                      <span className="text-[11px] font-normal text-muted-foreground">
                        ({items.length} {items.length === 1 ? 'campo' : 'campos'})
                      </span>
                      {items.some((p) => p.required && missing.includes(p.name)) && (
                        <span className="text-[11px] uppercase text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                          incompleto
                        </span>
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 text-aletis-grafite-claro/60 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="grid gap-3 px-4 pb-4 pt-1 md:grid-cols-2">
                    {items.map((p) => (
                      <label key={p.name} className={p.tipo === 'textarea' ? 'block md:col-span-2' : 'block'}>
                        <span className="text-[11px] font-body font-semibold uppercase text-muted-foreground">
                          {p.label}
                          {p.required && <span className="text-red-600 ml-0.5">*</span>}
                        </span>
                        {p.hint && (
                          <span className="text-[11px] font-body text-muted-foreground block">
                            {p.hint}
                          </span>
                        )}
                        {p.tipo === 'textarea' ? (
                          <textarea
                            rows={4}
                            value={inputs[p.name] ?? p.default ?? ''}
                            onChange={(e) => setInputs((s) => ({ ...s, [p.name]: e.target.value }))}
                            className={`${modalFieldClass} ${
                              missing.includes(p.name)
                                ? 'border-red-300 bg-red-50/30 focus:ring-red-200'
                                : 'border-aletis-grafite-claro/25 focus:border-aletis-verde focus:ring-aletis-verde/20'
                            }`}
                            placeholder={p.default ?? ''}
                          />
                        ) : (
                          <input
                            type={
                              p.tipo === 'numero' || p.tipo === 'moeda'
                                ? 'number'
                                : p.tipo === 'data'
                                ? 'date'
                                : p.tipo === 'email'
                                ? 'email'
                                : p.tipo === 'telefone'
                                ? 'tel'
                                : 'text'
                            }
                            value={inputs[p.name] ?? p.default ?? ''}
                            onChange={(e) => setInputs((s) => ({ ...s, [p.name]: e.target.value }))}
                            className={`${modalFieldClass} ${
                              missing.includes(p.name)
                                ? 'border-red-300 bg-red-50/30 focus:ring-red-200'
                                : 'border-aletis-grafite-claro/25 focus:border-aletis-verde focus:ring-aletis-verde/20'
                            }`}
                            placeholder={p.default ?? ''}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}

          {placeholders.length === 0 && (
            <div className="rounded-lg border border-dashed border-aletis-borda p-6 text-center bg-aletis-cream-papel/45">
              <FileText className="w-8 h-8 text-aletis-grafite-claro/40 mx-auto mb-2" />
              <p className="text-sm font-body text-muted-foreground">
                Documento estático — clique em <strong>Baixar</strong> para obter o arquivo oficial.
              </p>
            </div>
          )}

          {/* Status preview */}
          {preview && missing.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs font-body text-amber-800">
                <strong>Campos obrigatórios faltando:</strong>{' '}
                {missing.map((m) => placeholders.find((p) => p.name === m)?.label ?? m).join(', ')}
              </div>
            </div>
          )}

          {full && (
            <div className="text-[11px] font-body text-muted-foreground flex flex-wrap gap-2.5 pt-2 border-t border-aletis-borda">
              {full.estrutura?.sheets && <span>{full.estrutura.sheets} sheets</span>}
              {full.estrutura?.paginas && <span>{full.estrutura.paginas} páginas</span>}
              {full.estrutura?.slides && <span>{full.estrutura.slides} slides</span>}
              {full.estrutura?.formulas && (
                <span>{full.estrutura.formulas.toLocaleString('pt-BR')} fórmulas preservadas</span>
              )}
              {full.hasVba && <span className="text-amber-700 font-semibold">macros VBA preservadas</span>}
            </div>
          )}
    </MotionDialog>
  )
}

function groupBy<T>(items: T[], key: (item: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const k = key(it)
    const arr = map.get(k) ?? []
    arr.push(it)
    map.set(k, arr)
  }
  return Array.from(map.entries())
}

function DocMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-aletis-borda bg-aletis-cream-papel/55 px-3 py-2">
      <p className={modalLabelClass}>{label}</p>
      <p className="mt-1 break-words font-display text-sm font-bold text-foreground">{value}</p>
    </div>
  )
}
