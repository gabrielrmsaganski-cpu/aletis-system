// ============================================================
// ContratosOficiaisTab — geração dos 10 contratos ALETIS
// preservando 100% da formatação original (logos, fontes, layout).
// ============================================================
import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { FileText, Download, Eye, AlertCircle, Sparkles, X } from 'lucide-react'

interface PlaceholderMeta {
  name: string
  label: string
  hint?: string
  required: boolean
  sourceKind: 'cliente' | 'derived' | 'input' | 'outorgantes_bloco'
}

interface TemplateCard {
  slug: string
  title: string
  subtitle?: string
  category: 'contrato-base' | 'anexo-servico' | 'nda' | 'procuracao' | 'termo-aceite'
  placeholders: PlaceholderMeta[]
}

interface PreviewResponse {
  slug: string
  title: string
  resolved: Record<string, string>
  missing: string[]
}

interface OutorganteEntry {
  nome: string
  qualificacao?: string
  endereco?: string
  cep?: string
  rg?: string
  orgaoRg?: string
  cpf: string
  genero?: 'M' | 'F'
}

const CATEGORY_ORDER: TemplateCard['category'][] = [
  'contrato-base',
  'anexo-servico',
  'nda',
  'procuracao',
  'termo-aceite',
]

const CATEGORY_LABEL: Record<TemplateCard['category'], string> = {
  'contrato-base': 'Contrato base',
  'anexo-servico': 'Anexos de serviço',
  nda: 'NDA',
  procuracao: 'Procuração',
  'termo-aceite': 'Termo de aceite',
}

const CATEGORY_COLOR: Record<TemplateCard['category'], string> = {
  'contrato-base': 'border-aletis-dourado/40 bg-gradient-to-br from-aletis-dourado/5 to-white',
  'anexo-servico': 'border-aletis-verde/30 bg-white',
  nda: 'border-aletis-grafite-escuro/30 bg-white',
  procuracao: 'border-aletis-grafite-escuro/30 bg-white',
  'termo-aceite': 'border-aletis-grafite-escuro/30 bg-white',
}

interface Props {
  clienteId: string
}

export default function ContratosOficiaisTab({ clienteId }: Props) {
  const [templates, setTemplates] = useState<TemplateCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TemplateCard | null>(null)

  useEffect(() => {
    apiFetch<TemplateCard[]>('/api/contratos/templates')
      .then((d) => setTemplates(d))
      .catch((err) => setError(String(err?.message || err)))
  }, [])

  const grouped = useMemo(() => {
    if (!templates) return null
    const out: Record<TemplateCard['category'], TemplateCard[]> = {
      'contrato-base': [], 'anexo-servico': [], nda: [], procuracao: [], 'termo-aceite': [],
    }
    for (const t of templates) (out[t.category] ?? []).push(t)
    return out
  }, [templates])

  if (error) {
    return (
      <div className="card-premium p-6 border-l-4 border-red-500">
        <p className="text-sm font-body text-red-700">Erro carregando templates: {error}</p>
      </div>
    )
  }
  if (!templates || !grouped) {
    return (
      <div className="card-premium p-12 text-center">
        <div className="animate-pulse text-aletis-grafite-claro">Carregando templates…</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card-premium p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-aletis-verde to-aletis-dourado flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
              Contratos & Anexos Oficiais ALETIS
            </h2>
            <p className="text-sm font-body text-aletis-grafite-claro mt-0.5">
              {templates.length} templates padronizados. O sistema preenche os campos do cliente automaticamente
              e mantém 100% da formatação, fontes e logos do documento original.
            </p>
          </div>
        </div>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const list = grouped[cat] ?? []
        if (list.length === 0) return null
        return (
          <section key={cat}>
            <h3 className="text-xs font-body font-semibold uppercase tracking-wider text-aletis-grafite-claro mb-2">
              {CATEGORY_LABEL[cat]}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {list.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => setSelected(t)}
                  className={`text-left rounded-xl border-2 p-4 hover:shadow-md transition-shadow ${CATEGORY_COLOR[t.category]}`}
                >
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-aletis-verde flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-display font-semibold text-aletis-grafite-escuro leading-snug">
                        {t.title}
                      </p>
                      {t.subtitle && (
                        <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">{t.subtitle}</p>
                      )}
                      <p className="text-[11px] font-body text-aletis-grafite-medio mt-1.5">
                        {t.placeholders.length} campo{t.placeholders.length !== 1 ? 's' : ''} editáve
                        {t.placeholders.length !== 1 ? 'is' : 'l'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )
      })}

      {selected && (
        <ContratoModal template={selected} clienteId={clienteId} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

// ── Modal de geração ─────────────────────────────────────────
function ContratoModal({
  template,
  clienteId,
  onClose,
}: {
  template: TemplateCard
  clienteId: string
  onClose: () => void
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [outorgantes, setOutorgantes] = useState<OutorganteEntry[]>([])
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMultiPessoa = template.placeholders.some((p) => p.sourceKind === 'outorgantes_bloco')

  // Preview com debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setError(null)
      apiFetch<PreviewResponse>(`/api/contratos/templates/${template.slug}/preview`, {
        method: 'POST',
        body: JSON.stringify({
          clienteId,
          inputs,
          outorgantes: outorgantes.length ? outorgantes : undefined,
        }),
      })
        .then((d) => setPreview(d))
        .catch((err) => setError(String(err?.message || err)))
    }, 300)
    return () => clearTimeout(t)
  }, [template.slug, clienteId, JSON.stringify(inputs), JSON.stringify(outorgantes)])

  async function gerar() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/contratos/templates/${template.slug}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          inputs,
          outorgantes: outorgantes.length ? outorgantes : undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const fnMatch = cd.match(/filename="?([^";]+)"?/)
      const filename = fnMatch?.[1] ?? `${template.slug}.docx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setGenerating(false)
    }
  }

  const editablePlaceholders = template.placeholders.filter(
    (p) => p.sourceKind !== 'outorgantes_bloco',
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-aletis-borda flex items-center gap-3">
          <FileText className="w-5 h-5 text-aletis-verde flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro truncate">{template.title}</h2>
            {template.subtitle && (
              <p className="text-xs font-body text-aletis-grafite-claro truncate">{template.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-aletis-grafite-medio hover:bg-aletis-bege transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Inputs editáveis */}
          {editablePlaceholders.length > 0 && (
            <section>
              <h3 className="text-xs font-body font-semibold uppercase tracking-wider text-aletis-grafite-claro mb-2">
                Campos do contrato
              </h3>
              <div className="space-y-3">
                {editablePlaceholders.map((p) => {
                  const resolvedVal = preview?.resolved[p.name] ?? ''
                  const missing = preview?.missing.includes(p.name) ?? false
                  const overridden = Object.prototype.hasOwnProperty.call(inputs, p.name)
                  const displayVal = overridden ? inputs[p.name] : resolvedVal
                  return (
                    <div key={p.name}>
                      <label className="block text-xs font-body font-medium text-aletis-grafite-escuro mb-1">
                        {p.label}
                        {p.required && <span className="text-red-500 ml-1">*</span>}
                        {p.sourceKind === 'cliente' && !overridden && (
                          <span className="ml-2 text-[10px] text-aletis-verde font-normal">(do cadastro)</span>
                        )}
                        {p.sourceKind === 'derived' && !overridden && (
                          <span className="ml-2 text-[10px] text-aletis-verde font-normal">(calculado)</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={displayVal}
                        onChange={(e) =>
                          setInputs((prev) => ({ ...prev, [p.name]: e.target.value }))
                        }
                        placeholder={p.hint}
                        className={`w-full px-3 py-2 text-sm font-body rounded-lg border ${
                          missing
                            ? 'border-red-400 bg-red-50/50'
                            : 'border-aletis-borda focus:border-aletis-verde'
                        } focus:outline-none focus:ring-2 focus:ring-aletis-verde/20`}
                      />
                      {p.hint && (
                        <p className="text-[11px] text-aletis-grafite-medio mt-0.5">{p.hint}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Outorgantes (NDA / Procuração) */}
          {isMultiPessoa && (
            <section>
              <h3 className="text-xs font-body font-semibold uppercase tracking-wider text-aletis-grafite-claro mb-2">
                Outorgantes / Partes
              </h3>
              <p className="text-xs text-aletis-grafite-medio mb-2">
                Adicione todas as pessoas físicas que vão assinar (cliente + cônjuge + outros). Se vazio,
                usa apenas os dados do cliente principal.
              </p>
              <div className="space-y-3">
                {outorgantes.map((o, i) => (
                  <div key={i} className="border border-aletis-borda rounded-lg p-3 grid grid-cols-2 gap-2">
                    <input className="px-2 py-1 text-sm border rounded col-span-2"
                      placeholder="Nome completo *" value={o.nome}
                      onChange={(e) => updateOutorgante(i, { nome: e.target.value })} />
                    <input className="px-2 py-1 text-sm border rounded"
                      placeholder="Qualificação (agricultor)" value={o.qualificacao ?? ''}
                      onChange={(e) => updateOutorgante(i, { qualificacao: e.target.value })} />
                    <select className="px-2 py-1 text-sm border rounded"
                      value={o.genero ?? 'M'}
                      onChange={(e) => updateOutorgante(i, { genero: e.target.value as 'M' | 'F' })}>
                      <option value="M">Masculino</option>
                      <option value="F">Feminino</option>
                    </select>
                    <input className="px-2 py-1 text-sm border rounded col-span-2"
                      placeholder="Endereço completo" value={o.endereco ?? ''}
                      onChange={(e) => updateOutorgante(i, { endereco: e.target.value })} />
                    <input className="px-2 py-1 text-sm border rounded"
                      placeholder="CEP" value={o.cep ?? ''}
                      onChange={(e) => updateOutorgante(i, { cep: e.target.value })} />
                    <input className="px-2 py-1 text-sm border rounded"
                      placeholder="RG (com órgão)" value={o.rg ?? ''}
                      onChange={(e) => updateOutorgante(i, { rg: e.target.value })} />
                    <input className="px-2 py-1 text-sm border rounded col-span-2"
                      placeholder="CPF *" value={o.cpf}
                      onChange={(e) => updateOutorgante(i, { cpf: e.target.value })} />
                    <button type="button" className="col-span-2 text-xs text-red-600 hover:underline"
                      onClick={() => removeOutorgante(i)}>Remover</button>
                  </div>
                ))}
                <button type="button" onClick={addOutorgante}
                  className="w-full px-3 py-2 text-xs font-body rounded-lg border border-dashed border-aletis-verde text-aletis-verde hover:bg-aletis-verde/5">
                  + Adicionar outorgante
                </button>
              </div>
            </section>
          )}

          {/* Preview de saída */}
          {preview && preview.missing.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-300 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <strong>Faltando preencher:</strong> {preview.missing.join(', ')}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-300 p-3 text-xs text-red-800">
              <strong>Erro:</strong> {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-aletis-borda flex items-center justify-between gap-3 bg-aletis-bege/30">
          <p className="text-xs text-aletis-grafite-medio">
            {preview && preview.missing.length === 0 ? '✓ Pronto para gerar' : 'Complete os campos obrigatórios'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-body rounded-lg border border-aletis-borda text-aletis-grafite-escuro hover:bg-aletis-bege transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={gerar}
              disabled={generating || (preview?.missing.length ?? 0) > 0}
              className="px-4 py-2 text-sm font-body font-semibold rounded-lg bg-aletis-verde text-white hover:bg-aletis-verde-escuro transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              {generating ? 'Gerando…' : 'Gerar e baixar (.docx)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  function updateOutorgante(i: number, patch: Partial<OutorganteEntry>) {
    setOutorgantes((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))
  }
  function removeOutorgante(i: number) {
    setOutorgantes((prev) => prev.filter((_, idx) => idx !== i))
  }
  function addOutorgante() {
    setOutorgantes((prev) => [...prev, { nome: '', cpf: '', genero: 'M' }])
  }
}
