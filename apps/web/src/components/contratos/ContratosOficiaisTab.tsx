// ============================================================
// ContratosOficiaisTab — geração dos 10 contratos ALETIS
// preservando 100% da formatação original (logos, fontes, layout).
// ============================================================
import { useEffect, useState, useMemo } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { FileText, Download, AlertCircle, Sparkles } from 'lucide-react'
import AppDialog from '../ui/AppDialog'
import { uiAction } from '../ui/foundation'

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
  originalFile: string
  placeholders: PlaceholderMeta[]
}

interface PreviewResponse {
  slug: string
  title: string
  resolved: Record<string, unknown>
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
  'anexo-servico': 'border-aletis-verde/30 bg-card',
  nda: 'border-aletis-grafite-escuro/30 bg-card',
  procuracao: 'border-aletis-grafite-escuro/30 bg-card',
  'termo-aceite': 'border-aletis-grafite-escuro/30 bg-card',
}

const contratoPanelClass = 'rounded-lg border border-aletis-borda bg-card p-4 shadow-none'
const contratoLabelClass = 'text-[11px] font-body font-semibold uppercase text-muted-foreground'
const contratoInputClass = 'w-full rounded-xl border border-aletis-borda bg-card px-3 py-2.5 text-sm font-body text-foreground outline-none transition placeholder:text-aletis-grafite-claro/70 focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/20'

function formatContratoValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(formatContratoValue).filter(Boolean).join(', ')
  if (typeof value !== 'object') return ''

  const obj = value as Record<string, unknown>
  const enderecoBase = firstText(obj.logradouro, obj.rua, obj.endereco, obj.address)
  const numero = firstText(obj.numero, obj.number)
  const bairro = firstText(obj.bairro, obj.district)
  const cidade = firstText(obj.cidade, obj.municipio, obj.city)
  const estado = firstText(obj.uf, obj.estado, obj.state)
  const cep = firstText(obj.cep, obj.zipCode, obj.postalCode)
  const cidadeUf = [cidade, estado].filter(Boolean).join('/')
  const enderecoParts = [
    enderecoBase,
    numero ? `n. ${numero}` : '',
    bairro,
    cidadeUf,
    cep ? `CEP ${cep}` : '',
  ].filter(Boolean)

  if (enderecoParts.length) return enderecoParts.join(', ')

  return Object.entries(obj)
    .map(([key, nestedValue]) => {
      const formatted = formatContratoValue(nestedValue)
      return formatted ? `${humanizeContratoKey(key)}: ${formatted}` : ''
    })
    .filter(Boolean)
    .join(', ')
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function humanizeContratoKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
}

interface Props {
  clienteId: string
}

export default function ContratosOficiaisTab({ clienteId }: Props) {
  const [templates, setTemplates] = useState<TemplateCard[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TemplateCard | null>(null)

  useEffect(() => {
    apiFetch<TemplateCard[]>('/contratos/templates')
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
        <div className="animate-pulse text-muted-foreground">Carregando templates…</div>
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
            <h2 className="text-lg font-display font-semibold text-foreground">
              Contratos & Anexos Oficiais ALETIS
            </h2>
            <p className="text-sm font-body text-muted-foreground mt-0.5">
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
            <h3 className="text-xs font-body font-semibold uppercase text-muted-foreground mb-2">
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
                    <FileText className="w-5 h-5 text-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-display font-semibold text-foreground leading-snug">
                        {t.title}
                      </p>
                      {t.subtitle && (
                        <p className="text-xs font-body text-muted-foreground mt-0.5">{t.subtitle}</p>
                      )}
                      <p className="text-[11px] font-mono text-aletis-grafite-medio/80 mt-1.5 truncate" title={t.originalFile}>
                        {t.originalFile}
                      </p>
                      <p className="text-[11px] font-body text-[var(--text-soft)] mt-1">
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
      apiFetch<PreviewResponse>(`/contratos/templates/${template.slug}/preview`, {
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
  const missingCount = preview?.missing.length ?? 0
  const footer = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[var(--text-soft)]">
        {preview && missingCount === 0 ? '✓ Pronto para gerar' : 'Complete os campos obrigatórios'}
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className={uiAction.secondary}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={gerar}
          disabled={generating || missingCount > 0}
          className={uiAction.primary}
        >
          <Download className="w-4 h-4" />
          {generating ? 'Gerando…' : 'Gerar e baixar (.docx)'}
        </button>
      </div>
    </div>
  )

  return (
    <AppDialog
      title={template.title}
      subtitle={template.subtitle}
      eyebrow="Contrato oficial"
      icon={<FileText className="h-5 w-5" />}
      onClose={onClose}
      size="xl"
      bodyClassName="space-y-5 bg-aletis-cream-papel/35"
      footer={footer}
    >
          <section className={contratoPanelClass}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className={contratoLabelClass}>Contrato oficial</p>
                <h3 className="mt-1 break-words font-display text-lg font-bold text-foreground">
                  {template.title}
                </h3>
                {template.subtitle && (
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-soft)]">{template.subtitle}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Arquivo base: <span className="font-mono">{template.originalFile}</span>
                </p>
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2 lg:min-w-[360px]">
                <ContratoMini label="Categoria" value={CATEGORY_LABEL[template.category]} />
                <ContratoMini label="Campos" value={`${template.placeholders.length}`} />
                <ContratoMini label="Pendentes" value={`${missingCount}`} />
                <ContratoMini label="Partes" value={isMultiPessoa ? 'múltiplas' : 'cliente'} />
              </div>
            </div>
          </section>

          {/* Inputs editáveis */}
          {editablePlaceholders.length > 0 && (
            <section className={contratoPanelClass}>
              <h3 className={`${contratoLabelClass} mb-3`}>
                Campos do contrato
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {editablePlaceholders.map((p) => {
                  const resolvedVal = formatContratoValue(preview?.resolved[p.name])
                  const missing = preview?.missing.includes(p.name) ?? false
                  const overridden = Object.prototype.hasOwnProperty.call(inputs, p.name)
                  const displayVal = overridden ? inputs[p.name] : resolvedVal
                  return (
                    <div key={p.name} className="min-w-0">
                      <label className={`mb-1 block ${contratoLabelClass}`}>
                        {p.label}
                        {p.required && <span className="text-red-500 ml-1">*</span>}
                        {p.sourceKind === 'cliente' && !overridden && (
                          <span className="ml-2 text-[11px] text-foreground font-normal">(do cadastro)</span>
                        )}
                        {p.sourceKind === 'derived' && !overridden && (
                          <span className="ml-2 text-[11px] text-foreground font-normal">(calculado)</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={displayVal}
                        onChange={(e) =>
                          setInputs((prev) => ({ ...prev, [p.name]: e.target.value }))
                        }
                        placeholder={p.hint}
                        className={`${contratoInputClass} ${
                          missing
                            ? 'border-red-400 bg-red-50/50'
                            : ''
                        }`}
                      />
                      {p.hint && (
                        <p className="text-[11px] text-[var(--text-soft)] mt-0.5">{p.hint}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Outorgantes (NDA / Procuração) */}
          {isMultiPessoa && (
            <section className={contratoPanelClass}>
              <h3 className={`${contratoLabelClass} mb-2`}>
                Outorgantes / Partes
              </h3>
              <p className="text-xs text-[var(--text-soft)] mb-2">
                Adicione todas as pessoas físicas que vão assinar (cliente + cônjuge + outros). Se vazio,
                usa apenas os dados do cliente principal.
              </p>
              <div className="space-y-3">
                {outorgantes.map((o, i) => (
                  <div key={i} className="rounded-lg border border-aletis-borda bg-aletis-cream-papel/40 p-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input className={`${contratoInputClass} md:col-span-2`}
                      placeholder="Nome completo *" value={o.nome}
                      onChange={(e) => updateOutorgante(i, { nome: e.target.value })} />
                    <input className={contratoInputClass}
                      placeholder="Qualificação (agricultor)" value={o.qualificacao ?? ''}
                      onChange={(e) => updateOutorgante(i, { qualificacao: e.target.value })} />
                    <select className={contratoInputClass}
                      value={o.genero ?? 'M'}
                      onChange={(e) => updateOutorgante(i, { genero: e.target.value as 'M' | 'F' })}>
                      <option value="M">Masculino</option>
                      <option value="F">Feminino</option>
                    </select>
                    <input className={`${contratoInputClass} md:col-span-2`}
                      placeholder="Endereço completo" value={o.endereco ?? ''}
                      onChange={(e) => updateOutorgante(i, { endereco: e.target.value })} />
                    <input className={contratoInputClass}
                      placeholder="CEP" value={o.cep ?? ''}
                      onChange={(e) => updateOutorgante(i, { cep: e.target.value })} />
                    <input className={contratoInputClass}
                      placeholder="RG (com órgão)" value={o.rg ?? ''}
                      onChange={(e) => updateOutorgante(i, { rg: e.target.value })} />
                    <input className={`${contratoInputClass} md:col-span-2`}
                      placeholder="CPF *" value={o.cpf}
                      onChange={(e) => updateOutorgante(i, { cpf: e.target.value })} />
                    <button type="button" className="text-xs font-semibold text-red-600 hover:underline md:col-span-2"
                      onClick={() => removeOutorgante(i)}>Remover</button>
                  </div>
                ))}
                <button type="button" onClick={addOutorgante}
                  className="w-full rounded-xl border border-dashed border-aletis-verde px-3 py-2 text-xs font-body font-semibold text-foreground hover:bg-aletis-verde/5">
                  + Adicionar outorgante
                </button>
              </div>
            </section>
          )}

          {/* Preview de saída */}
          {preview && preview.missing.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                <strong>Faltando preencher:</strong> {preview.missing.join(', ')}
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-300 p-3 text-xs text-red-800">
              <strong>Erro:</strong> {error}
            </div>
          )}
    </AppDialog>
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

function ContratoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-aletis-borda bg-aletis-cream-papel/55 px-3 py-2">
      <p className={contratoLabelClass}>{label}</p>
      <p className="mt-1 break-words font-display text-sm font-bold text-foreground">{value}</p>
    </div>
  )
}
