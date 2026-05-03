// ============================================================
// MarketplaceModal — explorar/capturar/aplicar templates de cliente
// reutilizáveis. Backend: Wave G gf_template_marketplace.
// ============================================================
import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '../../hooks/useApi'
import { Store, Plus, Download, Trash2, X, Loader2, Star, Sparkles } from 'lucide-react'
import { Skeleton as UISkeleton } from '../ui'

interface Template {
  id: string
  slug: string
  rotulo: string
  descricao?: string | null
  categoria: string
  emoji?: string | null
  visibilidade: 'private' | 'consultor' | 'global'
  autorConsultorId?: string | null
  autorNome?: string | null
  contadores?: { culturas: number; custos: number; contratos: number; fazendas: number }
  usoCount: number
  isOficial: boolean
  criadoEm: string
}

interface Props {
  grupoId: string
  consultorId?: string
  onClose: () => void
  onApplied?: () => void
}

export default function MarketplaceModal({ grupoId, consultorId, onClose, onApplied }: Props) {
  const [tab, setTab] = useState<'browse' | 'capture'>('browse')
  const [templates, setTemplates] = useState<Template[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [applying, setApplying] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = consultorId
        ? `/gestao-financeira/marketplace/templates?consultorId=${encodeURIComponent(consultorId)}`
        : '/gestao-financeira/marketplace/templates'
      const r = await apiFetch<{ templates: Template[] }>(url)
      setTemplates(r.templates)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [consultorId])

  useEffect(() => { load() }, [load])

  async function aplicar(slug: string) {
    setApplying(slug)
    setError(null)
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/marketplace/aplicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateSlug: slug }),
      })
      onApplied?.()
      onClose()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setApplying(null)
    }
  }

  async function deletar(slug: string) {
    if (!confirm(`Excluir o template "${slug}" do marketplace?`)) return
    try {
      const url = consultorId
        ? `/gestao-financeira/marketplace/templates/${slug}?consultorId=${encodeURIComponent(consultorId)}`
        : `/gestao-financeira/marketplace/templates/${slug}`
      await apiFetch(url, { method: 'DELETE' })
      await load()
    } catch (e: any) {
      setError(String(e?.message ?? e))
    }
  }

  const filtered = (templates ?? []).filter((t) => {
    if (!filter.trim()) return true
    const q = filter.toLowerCase()
    return (
      t.rotulo.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      (t.descricao ?? '').toLowerCase().includes(q) ||
      t.categoria.toLowerCase().includes(q)
    )
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <header className="px-5 py-4 border-b border-aletis-grafite-claro/15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-aletis-verde to-aletis-dourado flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-aletis-verde uppercase font-semibold">🏬 Marketplace</p>
              <h2 className="text-base font-display font-semibold text-aletis-grafite-escuro">Templates de cliente</h2>
              <p className="text-[10px] text-aletis-grafite-claro">Reutilize estruturas de outros grupos da sua carteira</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-aletis-grafite-escuro/5 flex items-center justify-center">
            <X className="w-4 h-4 text-aletis-grafite-claro" />
          </button>
        </header>

        <nav className="px-5 pt-3 flex gap-2 border-b border-aletis-grafite-claro/15">
          <TabBtn active={tab === 'browse'} onClick={() => setTab('browse')} label={`📋 Explorar (${templates?.length ?? 0})`} />
          <TabBtn active={tab === 'capture'} onClick={() => setTab('capture')} label="📸 Capturar deste grupo" />
        </nav>

        <div className="flex-1 overflow-y-auto p-5">
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 mb-3">{error}</div>}

          {tab === 'browse' && (
            <div className="space-y-3">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar por rótulo, categoria ou descrição…"
                className="w-full px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-xs"
              />

              {loading && !templates && <Skeleton />}

              {filtered.length === 0 && !loading && (
                <div className="rounded-lg border border-dashed border-aletis-grafite-claro/30 p-8 text-center bg-aletis-cream/20">
                  <Store className="w-6 h-6 text-aletis-grafite-claro/40 mx-auto mb-2" />
                  <p className="text-xs text-aletis-grafite-claro">
                    {filter ? `Nenhum template com "${filter}".` : 'Nenhum template ainda. Capture deste grupo na aba "Capturar".'}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    aplicando={applying === t.slug}
                    onApply={() => aplicar(t.slug)}
                    onDelete={() => deletar(t.slug)}
                    podeApagar={!t.isOficial && (!consultorId || t.autorConsultorId === consultorId)}
                  />
                ))}
              </div>
            </div>
          )}

          {tab === 'capture' && (
            <CaptureForm
              grupoId={grupoId}
              consultorId={consultorId}
              onSuccess={async () => {
                await load()
                setTab('browse')
              }}
              onError={setError}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-body font-semibold border-b-2 transition-colors ${
        active ? 'border-aletis-verde text-aletis-verde' : 'border-transparent text-aletis-grafite-claro hover:text-aletis-grafite-escuro'
      }`}
    >
      {label}
    </button>
  )
}

function TemplateCard({
  template, aplicando, onApply, onDelete, podeApagar,
}: {
  template: Template
  aplicando: boolean
  onApply: () => void
  onDelete: () => void
  podeApagar: boolean
}) {
  const c = template.contadores ?? { culturas: 0, custos: 0, contratos: 0, fazendas: 0 }
  return (
    <div className={`card-premium p-3 border-l-4 ${template.isOficial ? 'border-l-aletis-dourado' : template.visibilidade === 'global' ? 'border-l-aletis-verde' : 'border-l-aletis-grafite-claro/40'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base">{template.emoji ?? '📦'}</span>
            <h4 className="text-sm font-display font-semibold text-aletis-grafite-escuro">{template.rotulo}</h4>
            {template.isOficial && (
              <span className="px-1.5 py-0.5 rounded bg-aletis-dourado/15 text-aletis-dourado-escuro text-[9px] font-bold uppercase inline-flex items-center gap-0.5">
                <Star className="w-2.5 h-2.5" /> Oficial
              </span>
            )}
            {template.visibilidade === 'global' && !template.isOficial && (
              <span className="px-1.5 py-0.5 rounded bg-aletis-verde/15 text-aletis-verde text-[9px] font-bold uppercase">🌐 Global</span>
            )}
          </div>
          <p className="text-[10px] text-aletis-grafite-claro font-mono mt-0.5">
            {template.categoria} · {template.slug}
          </p>
          {template.descricao && (
            <p className="text-[11px] text-aletis-grafite-escuro mt-1 line-clamp-2">{template.descricao}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px] font-mono">
            <Counter label="🌾 culturas" value={c.culturas} />
            <Counter label="💰 custos" value={c.custos} />
            <Counter label="📋 contratos" value={c.contratos} />
            <Counter label="🏞️ fazendas" value={c.fazendas} />
          </div>
          <p className="text-[10px] text-aletis-grafite-claro mt-1.5">
            {template.autorNome ? `por ${template.autorNome} · ` : ''}usado {template.usoCount}×
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onApply}
          disabled={aplicando}
          className="flex-1 px-2 py-1.5 rounded-lg bg-aletis-verde text-white text-[11px] font-semibold hover:bg-aletis-verde-escuro transition-colors inline-flex items-center justify-center gap-1 disabled:opacity-50"
        >
          {aplicando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          {aplicando ? 'Aplicando…' : 'Aplicar'}
        </button>
        {podeApagar && (
          <button
            type="button"
            onClick={onDelete}
            className="px-2 py-1.5 rounded-lg text-aletis-grafite-claro hover:text-red-600 hover:bg-red-50 transition-colors"
            aria-label="Excluir"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <span className="px-1.5 py-0.5 rounded bg-aletis-cream/40 text-aletis-grafite-escuro tabular-nums">
      {label} <strong>{value}</strong>
    </span>
  )
}

function CaptureForm({
  grupoId, consultorId, onSuccess, onError,
}: {
  grupoId: string
  consultorId?: string
  onSuccess: () => void
  onError: (m: string) => void
}) {
  const [slug, setSlug] = useState('')
  const [rotulo, setRotulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('soja')
  const [emoji, setEmoji] = useState('📦')
  const [visibilidade, setVisibilidade] = useState<'private' | 'consultor' | 'global'>('private')
  const [saving, setSaving] = useState(false)

  function gerarSlug() {
    return rotulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
  }

  async function capturar() {
    if (!rotulo.trim()) {
      onError('Informe um rótulo para o template')
      return
    }
    const finalSlug = slug.trim() || gerarSlug()
    setSaving(true)
    try {
      await apiFetch(`/gestao-financeira/grupos/${grupoId}/marketplace/capturar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: finalSlug,
          rotulo,
          descricao,
          categoria,
          emoji,
          visibilidade,
          consultorId,
        }),
      })
      onSuccess()
    } catch (e: any) {
      onError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  const CATEGORIAS = ['soja', 'milho', 'algodao', 'cafe', 'cana', 'pecuaria', 'fruticultura', 'misto', 'outro']
  const EMOJIS = ['📦', '🌾', '🌽', '☕', '🌱', '🐂', '🍇', '🥕', '🐔', '🐷', '🍅']

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="rounded-lg bg-aletis-verde/5 border border-aletis-verde/20 p-3">
        <p className="text-xs text-aletis-grafite-escuro inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-aletis-verde" />
          O sistema captura culturas, custos, contratos e fazendas deste grupo, despersonaliza (remove ids/datas/valores específicos) e disponibiliza no marketplace.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Rótulo (visível)">
          <input
            value={rotulo}
            onChange={(e) => setRotulo(e.target.value)}
            placeholder="Ex: Cliente típico soja MT"
            className="w-full px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-xs"
          />
        </Field>
        <Field label="Slug (chave única)" optional>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder={gerarSlug() || 'slug-auto'}
            className="w-full px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-xs font-mono"
          />
        </Field>
        <Field label="Categoria">
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-xs"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Emoji">
          <div className="flex gap-1 flex-wrap">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`w-8 h-8 rounded text-lg ${emoji === e ? 'bg-aletis-verde/20 ring-2 ring-aletis-verde' : 'hover:bg-aletis-grafite-escuro/5'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Descrição" full>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={3}
            placeholder="Descreva o perfil agro: regiões, áreas típicas, principais credores, particularidades…"
            className="w-full px-3 py-2 rounded-lg border border-aletis-grafite-claro/20 text-xs resize-none"
          />
        </Field>
        <Field label="Visibilidade" full>
          <div className="flex gap-2 flex-wrap">
            <RadioCard
              label="🔒 Privado"
              desc="Só você vê"
              checked={visibilidade === 'private'}
              onChange={() => setVisibilidade('private')}
            />
            <RadioCard
              label="🌐 Global"
              desc="Visível a todos os consultores"
              checked={visibilidade === 'global'}
              onChange={() => setVisibilidade('global')}
            />
          </div>
        </Field>
      </div>

      <button
        type="button"
        onClick={capturar}
        disabled={saving || !rotulo.trim()}
        className="px-4 py-2 rounded-lg bg-aletis-verde text-white text-sm font-semibold hover:bg-aletis-verde-escuro inline-flex items-center gap-2 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Capturar template
      </button>
    </div>
  )
}

function Field({ label, children, optional, full }: { label: string; children: React.ReactNode; optional?: boolean; full?: boolean }) {
  return (
    <label className={`block ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[11px] font-body font-medium uppercase tracking-wider text-aletis-grafite-claro">
        {label} {optional && <span className="text-aletis-grafite-claro/60 normal-case font-normal">(opcional)</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

function RadioCard({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex-1 min-w-[140px] p-2 rounded-lg border-2 text-left transition-colors ${
        checked ? 'border-aletis-verde bg-aletis-verde/5' : 'border-aletis-grafite-claro/20 hover:border-aletis-grafite-claro/40'
      }`}
    >
      <p className="text-xs font-semibold">{label}</p>
      <p className="text-[10px] text-aletis-grafite-claro mt-0.5">{desc}</p>
    </button>
  )
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <UISkeleton key={i} className="h-32 rounded-xl" />
      ))}
    </div>
  )
}
