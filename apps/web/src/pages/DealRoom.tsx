// ============================================================
// DealRoom — kanban + detalhe das negociações por credor
// ============================================================
import { useEffect, useState, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { DSCard, DSStatCard, DSEmpty, DSBadge, DSButton } from '../components/ds'
import {
  ArrowLeft,
  Plus,
  Building2,
  Calendar,
  TrendingDown,
  Save,
  X,
  MessageSquarePlus,
  Trash2,
} from 'lucide-react'

interface Negociacao {
  id: string
  clienteId: string
  credor: string
  status: string
  responsavel?: string
  valorAtual?: string
  valorProposto?: string
  taxaAtual?: string
  taxaProposta?: string
  prazoMeses?: number
  carenciaMeses?: number
  garantias?: string[]
  docsPendentes?: any[]
  historico?: Array<{ ts: string; tipo: string; texto: string }>
  proximaData?: string
  observacoes?: string
  ultimaInteracao?: string
}

const STATUSES = [
  { id: 'negociando', label: 'Negociando', tone: 'info' as const },
  { id: 'contraproposta', label: 'Contraproposta', tone: 'warning' as const },
  { id: 'aguardando_doc', label: 'Aguardando doc', tone: 'warning' as const },
  { id: 'aprovado', label: 'Aprovado', tone: 'positive' as const },
  { id: 'recusado', label: 'Recusado', tone: 'negative' as const },
  { id: 'encerrado', label: 'Encerrado', tone: 'neutral' as const },
  { id: 'suspenso', label: 'Suspenso', tone: 'neutral' as const },
]

const fmtBRL = (v: any) => {
  const n = typeof v === 'string' ? Number(v) : v
  if (!n || !Number.isFinite(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

export default function DealRoom() {
  const { id: clienteId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [list, setList] = useState<Negociacao[]>([])
  const [resumo, setResumo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(searchParams.get('new') === '1')
  const [editing, setEditing] = useState<string | null>(searchParams.get('neg'))

  const reload = () => {
    if (!clienteId) return
    setLoading(true)
    apiFetch<{ negociacoes: Negociacao[]; resumo: any }>(`/api/deal-room/cliente/${clienteId}`)
      .then((d) => {
        setList(d.negociacoes ?? [])
        setResumo(d.resumo ?? null)
      })
      .catch((err) => setError(String(err?.message || err)))
      .finally(() => setLoading(false))
  }
  useEffect(reload, [clienteId])

  const grouped = useMemo(() => {
    const out: Record<string, Negociacao[]> = {}
    for (const s of STATUSES) out[s.id] = []
    for (const n of list) (out[n.status] ?? out['negociando']).push(n)
    return out
  }, [list])

  const editingNeg = editing ? list.find((n) => n.id === editing) : null

  if (!clienteId) {
    return <div className="p-8"><DSEmpty title="Cliente não especificado" /></div>
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <Link
          to={`/clientes/${clienteId}/command-center`}
          className="text-sm font-body text-aletis-grafite-claro hover:text-aletis-verde inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" /> Command Center
        </Link>
        <DSButton variant="primary" size="sm" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" /> Nova negociação
        </DSButton>
      </div>

      <DSCard>
        <div className="flex items-start gap-3">
          <Building2 className="w-5 h-5 text-aletis-verde mt-0.5" />
          <div>
            <h1 className="text-xl font-display font-bold text-aletis-grafite-escuro dark:text-white tracking-tight">
              Deal Room
            </h1>
            <p className="text-sm font-body text-aletis-grafite-claro dark:text-white/60 mt-0.5">
              Negociações multi-credor — status, contrapropostas, prazos e histórico em uma visão.
            </p>
          </div>
        </div>
      </DSCard>

      {resumo && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DSStatCard label="Total negociações" value={resumo.total} icon={<Building2 className="w-4 h-4" />} />
          <DSStatCard
            label="Valor em jogo"
            value={fmtBRL(resumo.valorEmNegociacao)}
            icon={<TrendingDown className="w-4 h-4" />}
            tone="warning"
          />
          <DSStatCard
            label="Próximo deadline"
            value={
              resumo.proximoDeadline ? new Date(resumo.proximoDeadline.data).toLocaleDateString('pt-BR') : '—'
            }
            hint={resumo.proximoDeadline?.credor}
            icon={<Calendar className="w-4 h-4" />}
          />
          <DSStatCard
            label="Aprovadas"
            value={resumo.porStatus?.aprovado ?? 0}
            tone="positive"
          />
        </div>
      )}

      {loading ? (
        <DSCard><div className="h-32 bg-aletis-borda/30 rounded animate-pulse" /></DSCard>
      ) : error ? (
        <DSCard className="border-red-300"><p className="text-sm text-red-700">{error}</p></DSCard>
      ) : list.length === 0 ? (
        <DSCard>
          <DSEmpty
            icon={<Building2 className="w-5 h-5" />}
            title="Nenhuma negociação neste cliente"
            description="Abra a primeira negociação para começar a acompanhar o status com cada credor."
            cta={
              <DSButton variant="primary" onClick={() => setShowNew(true)}>
                <Plus className="w-4 h-4" /> Abrir primeira negociação
              </DSButton>
            }
          />
        </DSCard>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-3">
          {STATUSES.map((s) => (
            <KanbanColumn
              key={s.id}
              title={s.label}
              tone={s.tone}
              items={grouped[s.id] ?? []}
              onSelect={(n) => {
                setEditing(n.id)
                setSearchParams({ neg: n.id })
              }}
            />
          ))}
        </div>
      )}

      {showNew && clienteId && (
        <NewNegociacaoModal
          clienteId={clienteId}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            reload()
          }}
        />
      )}

      {editingNeg && (
        <NegociacaoDetailModal
          negociacao={editingNeg}
          onClose={() => {
            setEditing(null)
            setSearchParams({})
          }}
          onChange={reload}
        />
      )}
    </div>
  )
}

// ─────────────── KanbanColumn ───────────────
function KanbanColumn({
  title,
  tone,
  items,
  onSelect,
}: {
  title: string
  tone: 'positive' | 'warning' | 'neutral' | 'negative' | 'info' | 'gold'
  items: Negociacao[]
  onSelect: (n: Negociacao) => void
}) {
  return (
    <div className="rounded-xl border border-aletis-borda dark:border-white/10 bg-aletis-bege/30 dark:bg-white/5 p-2">
      <div className="flex items-center justify-between px-1 mb-2">
        <DSBadge tone={tone}>{title}</DSBadge>
        <span className="text-[10px] font-body font-semibold text-aletis-grafite-medio dark:text-white/50">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-[10px] text-aletis-grafite-medio dark:text-white/40 italic px-1 py-2">vazio</p>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelect(n)}
              className="w-full text-left rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro/80 p-2.5 hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-display font-semibold text-aletis-grafite-escuro dark:text-white truncate">
                {n.credor}
              </p>
              <p className="text-[11px] font-mono text-aletis-grafite-claro dark:text-white/60 mt-0.5">
                {fmtBRL(n.valorAtual)}
                {n.valorProposto && (
                  <>
                    <span className="text-aletis-grafite-medio dark:text-white/40"> → </span>
                    <span className="text-positivo">{fmtBRL(n.valorProposto)}</span>
                  </>
                )}
              </p>
              {n.proximaData && (
                <p className="text-[10px] text-aletis-grafite-medio dark:text-white/50 mt-1">
                  Deadline: {new Date(n.proximaData).toLocaleDateString('pt-BR')}
                </p>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ─────────────── NewNegociacaoModal ───────────────
function NewNegociacaoModal({
  clienteId,
  onClose,
  onCreated,
}: {
  clienteId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [credor, setCredor] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [valorAtual, setValorAtual] = useState('')
  const [valorProposto, setValorProposto] = useState('')
  const [taxaAtual, setTaxaAtual] = useState('')
  const [taxaProposta, setTaxaProposta] = useState('')
  const [prazoMeses, setPrazoMeses] = useState('')
  const [carenciaMeses, setCarenciaMeses] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [proximaData, setProximaData] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!credor.trim()) return setError('credor é obrigatório')
    setSaving(true)
    try {
      await apiFetch('/api/deal-room/negociacoes', {
        method: 'POST',
        body: JSON.stringify({
          clienteId,
          credor: credor.trim(),
          responsavel: responsavel.trim() || undefined,
          valorAtual: valorAtual ? Number(valorAtual.replace(/\./g, '').replace(',', '.')) : undefined,
          valorProposto: valorProposto ? Number(valorProposto.replace(/\./g, '').replace(',', '.')) : undefined,
          taxaAtual: taxaAtual ? Number(taxaAtual.replace(',', '.')) : undefined,
          taxaProposta: taxaProposta ? Number(taxaProposta.replace(',', '.')) : undefined,
          prazoMeses: prazoMeses ? Number(prazoMeses) : undefined,
          carenciaMeses: carenciaMeses ? Number(carenciaMeses) : undefined,
          observacoes: observacoes.trim() || undefined,
          proximaData: proximaData || undefined,
        }),
      })
      onCreated()
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Nova negociação" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Credor *" value={credor} onChange={setCredor} fullWidth />
        <Field label="Responsável" value={responsavel} onChange={setResponsavel} fullWidth />
        <Field label="Valor atual (R$)" value={valorAtual} onChange={setValorAtual} placeholder="0,00" />
        <Field label="Valor proposto (R$)" value={valorProposto} onChange={setValorProposto} placeholder="0,00" />
        <Field label="Taxa atual (% a.a.)" value={taxaAtual} onChange={setTaxaAtual} placeholder="ex: 12,5" />
        <Field label="Taxa proposta (% a.a.)" value={taxaProposta} onChange={setTaxaProposta} placeholder="ex: 9,5" />
        <Field label="Prazo (meses)" value={prazoMeses} onChange={setPrazoMeses} type="number" />
        <Field label="Carência (meses)" value={carenciaMeses} onChange={setCarenciaMeses} type="number" />
        <Field label="Próximo deadline" value={proximaData} onChange={setProximaData} type="date" fullWidth />
        <div className="col-span-2">
          <label className="block text-xs font-body font-semibold text-aletis-grafite-escuro dark:text-white mb-1">
            Observações
          </label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm font-body rounded-lg border border-aletis-borda focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20 dark:bg-white/5 dark:border-white/10 dark:text-white"
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-700 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <DSButton variant="secondary" onClick={onClose}>Cancelar</DSButton>
        <DSButton variant="primary" onClick={save} disabled={saving}>
          <Save className="w-4 h-4" /> {saving ? 'Salvando…' : 'Criar'}
        </DSButton>
      </div>
    </Modal>
  )
}

// ─────────────── NegociacaoDetailModal ───────────────
function NegociacaoDetailModal({
  negociacao,
  onClose,
  onChange,
}: {
  negociacao: Negociacao
  onClose: () => void
  onChange: () => void
}) {
  const [status, setStatus] = useState(negociacao.status)
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)

  async function changeStatus(newStatus: string) {
    setSaving(true)
    try {
      await apiFetch(`/api/deal-room/negociacoes/${negociacao.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      setStatus(newStatus)
      onChange()
    } finally {
      setSaving(false)
    }
  }

  async function addNota() {
    if (!nota.trim()) return
    setSaving(true)
    try {
      await apiFetch(`/api/deal-room/negociacoes/${negociacao.id}/nota`, {
        method: 'POST',
        body: JSON.stringify({ texto: nota.trim() }),
      })
      setNota('')
      onChange()
    } finally {
      setSaving(false)
    }
  }

  async function deletar() {
    if (!confirm('Excluir esta negociação? Histórico e contrapropostas serão perdidos.')) return
    await apiFetch(`/api/deal-room/negociacoes/${negociacao.id}`, { method: 'DELETE' })
    onChange()
    onClose()
  }

  return (
    <Modal title={`${negociacao.credor}`} subtitle={`Negociação ${negociacao.id.slice(0, 12)}`} onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-body font-semibold uppercase text-aletis-grafite-claro dark:text-white/60">Status</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => changeStatus(s.id)}
                  disabled={saving || s.id === status}
                  className={`px-2 py-1 text-[11px] font-body font-semibold uppercase rounded-full transition-colors ${
                    s.id === status
                      ? 'bg-aletis-verde text-white ring-2 ring-aletis-verde/40'
                      : 'bg-aletis-borda/60 text-aletis-grafite-escuro hover:bg-aletis-bege dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <KV k="Valor atual" v={fmtBRL(negociacao.valorAtual)} />
          <KV k="Valor proposto" v={fmtBRL(negociacao.valorProposto)} />
          <KV k="Taxa atual" v={negociacao.taxaAtual ? `${Number(negociacao.taxaAtual).toFixed(2)}%` : '—'} />
          <KV k="Taxa proposta" v={negociacao.taxaProposta ? `${Number(negociacao.taxaProposta).toFixed(2)}%` : '—'} />
          <KV k="Prazo" v={negociacao.prazoMeses ? `${negociacao.prazoMeses} meses` : '—'} />
          <KV k="Carência" v={negociacao.carenciaMeses ? `${negociacao.carenciaMeses} meses` : '—'} />
          <KV k="Responsável" v={negociacao.responsavel ?? '—'} />
          <KV
            k="Próximo deadline"
            v={negociacao.proximaData ? new Date(negociacao.proximaData).toLocaleDateString('pt-BR') : '—'}
          />
          {negociacao.observacoes && (
            <div>
              <p className="text-[10px] font-body font-semibold uppercase text-aletis-grafite-claro dark:text-white/60">Observações</p>
              <p className="text-xs text-aletis-grafite-escuro dark:text-white/80 mt-1 italic">
                {negociacao.observacoes}
              </p>
            </div>
          )}
        </div>
        <div>
          <p className="text-[10px] font-body font-semibold uppercase text-aletis-grafite-claro dark:text-white/60">Histórico</p>
          <ul className="space-y-2 mt-2 max-h-72 overflow-y-auto pr-1">
            {(negociacao.historico ?? []).slice().reverse().map((h, i) => (
              <li key={i} className="text-xs border-l-2 border-aletis-verde pl-2 py-0.5">
                <p className="text-aletis-grafite-escuro dark:text-white/90">{h.texto}</p>
                <p className="text-[10px] text-aletis-grafite-medio dark:text-white/40">
                  {new Date(h.ts).toLocaleString('pt-BR')} · {h.tipo}
                </p>
              </li>
            ))}
            {(!negociacao.historico || negociacao.historico.length === 0) && (
              <p className="text-[11px] italic text-aletis-grafite-medio">Sem histórico ainda.</p>
            )}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Adicionar nota ao histórico…"
              className="flex-1 px-3 py-1.5 text-xs font-body rounded-lg border border-aletis-borda dark:bg-white/5 dark:border-white/10 dark:text-white"
            />
            <DSButton size="sm" variant="secondary" onClick={addNota} disabled={!nota.trim() || saving}>
              <MessageSquarePlus className="w-3.5 h-3.5" />
            </DSButton>
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center mt-4 pt-3 border-t border-aletis-borda dark:border-white/10">
        <DSButton variant="ghost" size="sm" onClick={deletar} className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
          <Trash2 className="w-3.5 h-3.5" /> Excluir
        </DSButton>
        <DSButton variant="primary" size="sm" onClick={onClose}>
          Fechar
        </DSButton>
      </div>
    </Modal>
  )
}

// ─────────────── helpers ───────────────
function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
      <div className={`bg-white dark:bg-aletis-grafite-escuro rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-hidden flex flex-col ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}>
        <div className="px-6 py-4 border-b border-aletis-borda dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro dark:text-white">{title}</h3>
            {subtitle && <p className="text-xs font-body text-aletis-grafite-claro dark:text-white/60">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-aletis-grafite-medio hover:bg-aletis-bege dark:hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  fullWidth,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <label className="block text-xs font-body font-semibold text-aletis-grafite-escuro dark:text-white mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm font-body rounded-lg border border-aletis-borda focus:border-aletis-verde focus:outline-none focus:ring-2 focus:ring-aletis-verde/20 dark:bg-white/5 dark:border-white/10 dark:text-white"
      />
    </div>
  )
}

function KV({ k, v }: { k: string; v: string | React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-aletis-grafite-medio dark:text-white/50">{k}</span>
      <span className="font-mono font-semibold text-aletis-grafite-escuro dark:text-white">{v}</span>
    </div>
  )
}
