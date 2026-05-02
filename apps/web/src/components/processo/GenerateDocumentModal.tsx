// ============================================================
// GenerateDocumentModal — formulário dinâmico para gerar
// qualquer um dos 25 documentos do Processo de Assessoria.
// ============================================================
import { useEffect, useState } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { X, Download, Eye, AlertTriangle, Loader2, FileText } from 'lucide-react'

interface PlaceholderMeta {
  name: string
  label: string
  hint?: string
  cell?: string
  clientePath?: string
  required: boolean
  default?: string
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

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-6">
      <div className="bg-white rounded-none md:rounded-2xl w-full max-w-2xl max-h-[100vh] md:max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-semibold text-aletis-verde uppercase">
              {template.codigo} · {template.formato.toUpperCase()}
              {template.hasVba && ' · VBA preservado'}
            </p>
            <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro leading-tight mt-0.5">
              {template.nome}
            </h2>
            {clienteNome && (
              <p className="text-xs font-body text-aletis-grafite-claro mt-1">
                Cliente: <span className="text-aletis-grafite-escuro font-medium">{clienteNome}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5 text-aletis-grafite-claro" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {full?.descricao && (
            <p className="text-sm font-body text-aletis-grafite-claro">{full.descricao}</p>
          )}

          {/* Auto-preenchidos do CRM */}
          {auto.length > 0 && (
            <section>
              <h3 className="text-[11px] font-body font-semibold uppercase tracking-wider text-aletis-grafite-claro mb-2">
                Preenchidos automaticamente do CRM
              </h3>
              <div className="rounded-lg bg-aletis-cream/30 border border-aletis-grafite-claro/10 p-3 space-y-1.5">
                {auto.map((p) => (
                  <div key={p.name} className="flex items-baseline gap-2 text-xs font-body">
                    <span className="text-aletis-grafite-claro min-w-[140px]">{p.label}:</span>
                    <span className="text-aletis-grafite-escuro font-medium font-mono">
                      {preview?.resolved[p.name] || (
                        <span className="text-amber-600 italic">— faltando no cadastro —</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Editáveis */}
          {editables.length > 0 && (
            <section>
              <h3 className="text-[11px] font-body font-semibold uppercase tracking-wider text-aletis-grafite-claro mb-2">
                Campos a preencher
              </h3>
              <div className="space-y-2.5">
                {editables.map((p) => (
                  <label key={p.name} className="block">
                    <span className="text-xs font-body font-medium text-aletis-grafite-escuro">
                      {p.label}
                      {p.required && <span className="text-red-600 ml-0.5">*</span>}
                    </span>
                    {p.hint && (
                      <span className="text-[10px] font-body text-aletis-grafite-claro block">
                        {p.hint}
                      </span>
                    )}
                    <input
                      type="text"
                      value={inputs[p.name] ?? p.default ?? ''}
                      onChange={(e) => setInputs((s) => ({ ...s, [p.name]: e.target.value }))}
                      className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm font-body focus:outline-none focus:ring-2 ${
                        missing.includes(p.name)
                          ? 'border-red-300 bg-red-50/30 focus:ring-red-200'
                          : 'border-aletis-grafite-claro/25 focus:border-aletis-verde focus:ring-aletis-verde/20'
                      }`}
                      placeholder={p.default ?? ''}
                    />
                  </label>
                ))}
              </div>
            </section>
          )}

          {placeholders.length === 0 && (
            <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-6 text-center bg-aletis-cream/20">
              <FileText className="w-8 h-8 text-aletis-grafite-claro/40 mx-auto mb-2" />
              <p className="text-sm font-body text-aletis-grafite-claro">
                Documento estático — clique em <strong>Baixar</strong> para obter o arquivo oficial.
              </p>
            </div>
          )}

          {/* Status preview */}
          {preview && missing.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs font-body text-amber-800">
                <strong>Campos obrigatórios faltando:</strong>{' '}
                {missing.map((m) => placeholders.find((p) => p.name === m)?.label ?? m).join(', ')}
              </div>
            </div>
          )}

          {full && (
            <div className="text-[10px] font-body text-aletis-grafite-claro flex flex-wrap gap-2.5 pt-2 border-t border-aletis-grafite-claro/10">
              {full.estrutura?.sheets && <span>{full.estrutura.sheets} sheets</span>}
              {full.estrutura?.paginas && <span>{full.estrutura.paginas} páginas</span>}
              {full.estrutura?.slides && <span>{full.estrutura.slides} slides</span>}
              {full.estrutura?.formulas && (
                <span>{full.estrutura.formulas.toLocaleString('pt-BR')} fórmulas preservadas</span>
              )}
              {full.hasVba && <span className="text-amber-700 font-semibold">macros VBA preservadas</span>}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t border-aletis-grafite-claro/15 flex items-center justify-between gap-3 flex-shrink-0 bg-aletis-cream/20">
          <div className="text-xs font-body text-aletis-grafite-claro flex items-center gap-1.5">
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-body font-medium text-aletis-grafite-escuro hover:bg-aletis-grafite-escuro/5 border border-aletis-grafite-claro/20 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={!canGenerate}
              className={`px-4 py-1.5 rounded-lg text-xs font-body font-semibold inline-flex items-center gap-1.5 transition-colors ${
                canGenerate
                  ? 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro'
                  : 'bg-aletis-grafite-claro/15 text-aletis-grafite-claro cursor-not-allowed'
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
        </footer>
      </div>
    </div>
  )
}
