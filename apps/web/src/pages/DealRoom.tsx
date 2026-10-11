import BoardScroller from '../components/ui/BoardScroller'
import PageHeader from '../components/ui/PageHeader'
// ============================================================
// DealRoom — kanban + detalhe das negociações por credor
// ============================================================
import { useEffect, useState, useMemo, useRef, type ReactNode } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { DSCard, DSStatCard, DSEmpty, DSBadge, DSButton } from '../components/ds'
import { MotionDialog } from '../components/ui'
import { uiAction } from '../components/ui/foundation'
import {
  ArrowLeft,
  Plus,
  Building2,
  Calendar,
  TrendingDown,
  Save,
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
  docsPendentes?: Array<{ status?: string } | string>
  historico?: Array<{ ts: string; tipo: string; texto: string; usuarioNome?: string; campo?: string; anterior?: string | number | null; novo?: string | number | null }>
  proximaData?: string
  observacoes?: string
  ultimaInteracao?: string
  /** Wave OS — vínculo a uma proposta global */
  propostaId?: string | null
  proposta?: PropostaSummary | null
}

interface PropostaSummary {
  id: string
  credor?: string | null
  titulo?: string | null
  tipo?: string | null
  status?: string | null
  valorProposta?: string | number | null
  valorProposto?: string | null
  pdfPath?: string | null
  payload?: Record<string, unknown> | null
  criadoEm?: string
  atualizadoEm?: string
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

const fmtBRL = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v) : v
  if (!n || !Number.isFinite(n)) return '—'
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const dealPanelClass = 'rounded-lg border border-aletis-borda bg-card p-4 shadow-none dark:border-white/10 dark:bg-white/5'
const dealLabelClass = 'text-[11px] font-body font-semibold uppercase text-muted-foreground dark:text-white/50'
const dealInputClass = 'w-full rounded-xl border border-aletis-borda bg-card px-3 py-2.5 text-sm font-body text-foreground outline-none transition placeholder:text-aletis-grafite-claro/70 focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/20 dark:border-white/10 dark:bg-white/5 dark:text-white'

export default function DealRoom() {
  const { id: clienteId } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [list, setList] = useState<Negociacao[]>([])
  const [resumo, setResumo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(searchParams.get('new') === '1')
  const [editing, setEditing] = useState<string | null>(searchParams.get('neg'))
  const initialPropostaId = searchParams.get('proposta')

  const [propostasOrfas, setPropostasOrfas] = useState<PropostaSummary[]>([])
  const reload = () => {
    if (!clienteId) return
    setLoading(true)
    // Wave OS — endpoint with-propostas correlaciona Deal Room ↔ proposta
    apiFetch<{ negociacoes: Negociacao[]; propostasOrfas: PropostaSummary[]; resumo: any }>(
      `/deal-room/cliente/${clienteId}/with-propostas`,
    )
      .then((d) => {
        setList(d.negociacoes ?? [])
        setResumo(d.resumo ?? null)
        setPropostasOrfas(d.propostasOrfas ?? [])
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
          to={`/clientes/${clienteId}?area=negociacao`}
          className="text-sm font-body text-muted-foreground hover:text-aletis-verde inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao cliente
        </Link>
        <DSButton
          variant="primary"
          size="sm"
          onClick={() => {
            setShowNew(true)
            setSearchParams({ new: '1' })
          }}
        >
          <Plus className="w-4 h-4" /> Nova negociação
        </DSButton>
      </div>

      <PageHeader title={<>Negociações por credor</>} description={<> <p className="text-sm font-body text-muted-foreground dark:text-white/60 mt-0.5">
              Negociações multi-credor — status, contrapropostas, prazos e histórico em uma visão.
            </p> </>} />

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
            label="Próximo prazo"
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
              <DSButton
                variant="primary"
                onClick={() => {
                  setShowNew(true)
                  setSearchParams({ new: '1' })
                }}
              >
                <Plus className="w-4 h-4" /> Abrir primeira negociação
              </DSButton>
            }
          />
        </DSCard>
      ) : (
        <div className="ui-panel"><BoardScroller label="Funil de negociações" itemLabels={{ one: 'negociação', many: 'negociações' }} sections={STATUSES.map(status => ({ id: status.id, label: status.label, count: (grouped[status.id] ?? []).length }))}>
          {STATUSES.map((s) => (
            <div key={s.id} data-board-section={s.id} className="w-[280px] shrink-0"><KanbanColumn
              title={s.label}
              tone={s.tone}
              items={grouped[s.id] ?? []}
              onSelect={(n) => {
                setEditing(n.id)
                setSearchParams({ neg: n.id })
              }}
            /></div>
          ))}
        </BoardScroller></div>
      )}

      {/* Wave OS — Propostas órfãs (não vinculadas a nenhuma negociação) */}
      {propostasOrfas.length > 0 && (
        <DSCard className="border-aletis-dourado/40 bg-aletis-dourado/5">
          <div className="flex items-start gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-aletis-dourado/20 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-aletis-dourado" />
            </div>
            <div>
              <h3 className="text-sm font-display font-semibold text-foreground dark:text-white">
                Propostas sem negociação vinculada ({propostasOrfas.length})
              </h3>
              <p className="text-xs font-body text-muted-foreground dark:text-white/60 mt-0.5">
                Estas propostas já foram carregadas no cliente, mas ainda não viraram uma negociação por credor.
                Crie a negociação por aqui para puxar valor, título e vínculo automaticamente.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            {propostasOrfas.slice(0, 6).map((p) => (
              <div key={p.id} className="rounded-lg border border-aletis-borda dark:border-white/10 bg-card dark:bg-white/5 p-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-display font-semibold text-foreground dark:text-white truncate">
                    {p.titulo || `Proposta ${p.id.slice(0, 8)}`}
                  </p>
                  <p className="text-[11px] font-body text-muted-foreground dark:text-white/60 mt-0.5">
                    {p.tipo} · {p.status} {p.valorProposto && `· ${fmtBRL(p.valorProposto)}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowNew(true)
                      setSearchParams({ new: '1', proposta: p.id })
                    }}
                    className="text-[11px] font-body font-semibold text-foreground hover:underline whitespace-nowrap"
                  >
                    negociar
                  </button>
                  <Link
                    to={`/propostas?id=${p.id}`}
                    className="text-[11px] font-body text-muted-foreground hover:underline whitespace-nowrap"
                  >
                    abrir proposta
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </DSCard>
      )}

      {showNew && clienteId && (
        <NewNegociacaoModal
          clienteId={clienteId}
          propostas={propostasOrfas}
          initialPropostaId={initialPropostaId}
          onClose={() => {
            setShowNew(false)
            setSearchParams({})
          }}
          onCreated={() => {
            setShowNew(false)
            setSearchParams({})
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
        <span className="text-[11px] font-body font-semibold text-[var(--text-soft)] dark:text-white/50">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1 py-3">Nenhuma negociação nesta etapa.</p>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-label={`Abrir negociação com ${n.credor}`}
              onClick={() => onSelect(n)}
              className="w-full text-left rounded-lg border border-aletis-borda dark:border-white/10 bg-card p-3 hover:border-aletis-verde/40 transition-colors"
            >
              <p className="text-sm leading-snug font-display font-semibold text-foreground break-words">
                {n.credor}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground mt-2">
                {fmtBRL(n.valorAtual)}
                {n.valorProposto && (
                  <>
                    <span className="text-[var(--text-soft)] dark:text-white/40"> → </span>
                    <span className="text-positivo">{fmtBRL(n.valorProposto)}</span>
                  </>
                )}
              </p>
              {n.proximaData && (
                <p className="text-[11px] text-[var(--text-soft)] dark:text-white/50 mt-1">
                  Prazo: {new Date(n.proximaData).toLocaleDateString('pt-BR')}
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
  propostas,
  initialPropostaId,
  onClose,
  onCreated,
}: {
  clienteId: string
  propostas: PropostaSummary[]
  initialPropostaId?: string | null
  onClose: () => void
  onCreated: () => void
}) {
  const [propostaId, setPropostaId] = useState(initialPropostaId ?? '')
  const [credor, setCredor] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [valorAtual, setValorAtual] = useState('')
  const [valorProposto, setValorProposto] = useState('')
  const [taxaAtual, setTaxaAtual] = useState('')
  const [taxaProposta, setTaxaProposta] = useState('')
  const [prazoMeses, setPrazoMeses] = useState('')
  const [carenciaMeses, setCarenciaMeses] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [garantias, setGarantias] = useState('')
  const [proximaData, setProximaData] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idempotencyKey = useRef(`neg-${crypto.randomUUID()}`)

  const propostaSelecionada = useMemo(
    () => propostas.find((p) => p.id === propostaId) ?? null,
    [propostas, propostaId],
  )

  useEffect(() => {
    if (!propostaSelecionada) return
    const valor = asMoneyNumber(getPropostaValor(propostaSelecionada))
    setCredor(getPropostaCredor(propostaSelecionada) || propostaSelecionada.titulo || '')
    setValorProposto(valor != null ? String(valor) : '')
    const payload = propostaSelecionada.payload ?? {}
    const read = (keys: string[]) => keys.map((key) => payload[key]).find((value) => value !== undefined && value !== null && value !== '')
    const valorAtual = asMoneyNumber(read(['valorDivida', 'valorAtual', 'saldoAtual']))
    if (valorAtual != null) setValorAtual(String(valorAtual))
    const taxaAtual = read(['taxaAtual', 'taxa'])
    const taxaProposta = read(['taxaProposta', 'taxaNegociada'])
    if (taxaAtual != null) setTaxaAtual(String(taxaAtual))
    if (taxaProposta != null) setTaxaProposta(String(taxaProposta))
    const prazo = read(['prazoMeses', 'prazo'])
    const carencia = read(['carenciaMeses', 'carencia'])
    if (prazo != null) setPrazoMeses(String(prazo))
    if (carencia != null) setCarenciaMeses(String(carencia))
    const garantia = read(['garantias', 'garantia'])
    if (Array.isArray(garantia)) setGarantias(garantia.join(', '))
    else if (garantia != null) setGarantias(String(garantia))
    setObservacoes((prev) => {
      const texto = `Negociação aberta a partir da proposta ${propostaSelecionada.titulo || propostaSelecionada.id}.`
      return !prev || prev.startsWith('Negociação aberta a partir da proposta ') ? texto : prev
    })
  }, [propostaSelecionada])

  async function save() {
    if (!credor.trim()) return setError('Credor é obrigatório.')
    const numeric = (value: string, label: string) => {
      if (!value.trim()) return undefined
      const parsed = Number(value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value)
      if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} deve ser válido e não negativo.`)
      return parsed.toFixed(2)
    }
    setSaving(true)
    try {
      await apiFetch('/deal-room/negociacoes', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey.current },
        body: JSON.stringify({
          clienteId,
          credor: credor.trim(),
          responsavel: responsavel.trim() || undefined,
          valorAtual: numeric(valorAtual, 'Valor atual'),
          valorProposto: numeric(valorProposto, 'Valor proposto'),
          taxaAtual: numeric(taxaAtual, 'Taxa atual'),
          taxaProposta: numeric(taxaProposta, 'Taxa proposta'),
          prazoMeses: prazoMeses ? Number(prazoMeses) : undefined,
          carenciaMeses: carenciaMeses ? Number(carenciaMeses) : undefined,
          observacoes: observacoes.trim() || undefined,
          garantias: garantias.split(',').map((item) => item.trim()).filter(Boolean),
          proximaData: proximaData || undefined,
          propostaId: propostaId || undefined,
        }),
      })
      onCreated()
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
      <button type="button" onClick={onClose} disabled={saving} className={uiAction.secondary}>
        Cancelar
      </button>
      <button type="button" onClick={save} disabled={saving} className={uiAction.primary}>
        <Save className="w-4 h-4" /> {saving ? 'Salvando...' : 'Criar negociação'}
      </button>
    </div>
  )

  return (
    <Modal title="Nova negociação" subtitle="Crie um acompanhamento por credor" onClose={onClose} footer={footer} bodyClassName="space-y-4">
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <section className={dealPanelClass}>
        <div className="mb-4">
          <p className={dealLabelClass}>Origem e identificação</p>
          <h3 className="mt-1 font-display text-base font-bold text-foreground dark:text-white">
            Dados centrais da negociação
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Vincule uma proposta existente ou preencha manualmente o credor e o responsável pelo acompanhamento.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {propostas.length > 0 && (
          <div className="sm:col-span-2">
            <label className={`mb-1 block ${dealLabelClass}`}>
              Puxar dados de uma proposta
            </label>
            <select
              value={propostaId}
              onChange={(e) => setPropostaId(e.target.value)}
              className={dealInputClass}
            >
              <option value="">Sem proposta vinculada</option>
              {propostas.map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.titulo || `Proposta ${p.id.slice(0, 8)}`)} {getPropostaValor(p) ? `- ${fmtBRL(getPropostaValor(p))}` : ''}
                </option>
              ))}
            </select>
            {propostaSelecionada && (
              <p className="mt-2 rounded-xl border border-aletis-verde/25 bg-aletis-verde/5 px-3 py-2 text-[11px] leading-relaxed text-[var(--text-soft)]">
                O sistema vai vincular esta proposta à negociação e preencher os campos principais.
              </p>
            )}
          </div>
        )}
        <Field label="Credor *" value={credor} onChange={setCredor} fullWidth />
        <Field label="Responsável" value={responsavel} onChange={setResponsavel} fullWidth />
        </div>
      </section>

      <section className={dealPanelClass}>
        <div className="mb-4">
          <p className={dealLabelClass}>Condições financeiras</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Valores, taxas e prazos que serão acompanhados no funil e usados no histórico da negociação.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Valor atual (R$)" value={valorAtual} onChange={setValorAtual} placeholder="0,00" />
        <Field label="Valor proposto (R$)" value={valorProposto} onChange={setValorProposto} placeholder="0,00" />
        <Field label="Taxa atual (% a.a.)" value={taxaAtual} onChange={setTaxaAtual} placeholder="ex: 12,5" />
        <Field label="Taxa proposta (% a.a.)" value={taxaProposta} onChange={setTaxaProposta} placeholder="ex: 9,5" />
        <Field label="Prazo (meses)" value={prazoMeses} onChange={setPrazoMeses} type="number" />
        <Field label="Carência (meses)" value={carenciaMeses} onChange={setCarenciaMeses} type="number" />
        </div>
      </section>

      <section className={dealPanelClass}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Próximo deadline" value={proximaData} onChange={setProximaData} type="date" fullWidth />
        <Field label="Garantias" value={garantias} onChange={setGarantias} placeholder="Separe por vírgulas" fullWidth />
        <div className="sm:col-span-2">
          <label className={`mb-1 block ${dealLabelClass}`}>
            Observações
          </label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={4}
            className={`${dealInputClass} resize-y leading-relaxed`}
          />
        </div>
      </div>
      </section>
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
  const [form, setForm] = useState(() => ({
    credor: negociacao.credor || '',
    responsavel: negociacao.responsavel || '',
    valorAtual: moneyInput(negociacao.valorAtual),
    valorProposto: moneyInput(negociacao.valorProposto),
    taxaAtual: numberInput(negociacao.taxaAtual),
    taxaProposta: numberInput(negociacao.taxaProposta),
    prazoMeses: negociacao.prazoMeses != null ? String(negociacao.prazoMeses) : '',
    carenciaMeses: negociacao.carenciaMeses != null ? String(negociacao.carenciaMeses) : '',
    garantias: Array.isArray(negociacao.garantias) ? negociacao.garantias.join(', ') : '',
    proximaData: dateInput(negociacao.proximaData),
    observacoes: negociacao.observacoes || '',
  }))
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function changeStatus(newStatus: string) {
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/deal-room/negociacoes/${negociacao.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      setStatus(newStatus)
      onChange()
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  async function salvarCampos() {
    if (!form.credor.trim()) {
      setError('Credor é obrigatório.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/deal-room/negociacoes/${negociacao.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          credor: form.credor.trim(),
          status,
          responsavel: form.responsavel.trim() || null,
          valorAtual: parseMoneyInput(form.valorAtual),
          valorProposto: parseMoneyInput(form.valorProposto),
          taxaAtual: parseMoneyInput(form.taxaAtual),
          taxaProposta: parseMoneyInput(form.taxaProposta),
          prazoMeses: form.prazoMeses ? Number(form.prazoMeses) : null,
          carenciaMeses: form.carenciaMeses ? Number(form.carenciaMeses) : null,
          garantias: form.garantias.split(',').map((g) => g.trim()).filter(Boolean),
          proximaData: form.proximaData || null,
          observacoes: form.observacoes.trim() || null,
        }),
      })
      onChange()
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  async function addNota() {
    if (!nota.trim()) return
    setSaving(true)
    try {
      await apiFetch(`/deal-room/negociacoes/${negociacao.id}/nota`, {
        method: 'POST',
        body: JSON.stringify({ texto: nota.trim() }),
      })
      setNota('')
      onChange()
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  async function deletar() {
    if (!confirm('Arquivar esta negociação? O histórico será preservado e ela ficará encerrada.')) return
    await apiFetch(`/deal-room/negociacoes/${negociacao.id}`, { method: 'DELETE' })
    onChange()
    onClose()
  }

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={deletar} className={`${uiAction.ghost} justify-center text-red-600 hover:bg-red-50 hover:text-red-700 sm:justify-start`}>
        <Trash2 className="w-3.5 h-3.5" /> Excluir
      </button>
      <button type="button" onClick={onClose} className={uiAction.primary}>
        Fechar
      </button>
    </div>
  )

  return (
    <Modal title={`${form.credor || negociacao.credor}`} subtitle={`Negociação ${negociacao.id.slice(0, 12)}`} onClose={onClose} wide footer={footer} bodyClassName="space-y-4">
      <section className={dealPanelClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className={dealLabelClass}>Ficha da negociação</p>
            <h3 className="mt-1 break-words font-display text-lg font-bold text-foreground dark:text-white">
              {form.credor || negociacao.credor}
            </h3>
            <p className="mt-1 text-sm text-[var(--text-soft)] dark:text-white/60">
              {form.responsavel || 'Responsável não informado'} · {dateInput(form.proximaData) ? `deadline ${new Date(form.proximaData).toLocaleDateString('pt-BR')}` : 'sem deadline'}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-4 lg:min-w-[620px]">
            <DealMini label="Status" value={STATUSES.find((s) => s.id === status)?.label || status} />
            <DealMini label="Valor atual" value={fmtBRL(parseMoneyInput(form.valorAtual) ?? negociacao.valorAtual)} />
            <DealMini label="Proposto" value={fmtBRL(parseMoneyInput(form.valorProposto) ?? negociacao.valorProposto)} />
            <DealMini label="Histórico" value={`${negociacao.historico?.length ?? 0} registro(s)`} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
          <div>
            <p className="text-[11px] font-body font-semibold uppercase text-muted-foreground dark:text-white/60">Status</p>
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
                      : 'bg-aletis-borda/60 text-foreground hover:bg-aletis-bege dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/15'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className={dealPanelClass}>
            <p className={`mb-3 ${dealLabelClass}`}>
              Campos editáveis
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Credor" value={form.credor} onChange={(v) => setForm((p) => ({ ...p, credor: v }))} fullWidth />
              <Field label="Responsável" value={form.responsavel} onChange={(v) => setForm((p) => ({ ...p, responsavel: v }))} fullWidth />
              <Field label="Valor atual (R$)" value={form.valorAtual} onChange={(v) => setForm((p) => ({ ...p, valorAtual: v }))} />
              <Field label="Valor proposto (R$)" value={form.valorProposto} onChange={(v) => setForm((p) => ({ ...p, valorProposto: v }))} />
              <Field label="Taxa atual (% a.a.)" value={form.taxaAtual} onChange={(v) => setForm((p) => ({ ...p, taxaAtual: v }))} />
              <Field label="Taxa proposta (% a.a.)" value={form.taxaProposta} onChange={(v) => setForm((p) => ({ ...p, taxaProposta: v }))} />
              <Field label="Prazo (meses)" type="number" value={form.prazoMeses} onChange={(v) => setForm((p) => ({ ...p, prazoMeses: v }))} />
              <Field label="Carência (meses)" type="number" value={form.carenciaMeses} onChange={(v) => setForm((p) => ({ ...p, carenciaMeses: v }))} />
              <Field label="Próximo deadline" type="date" value={form.proximaData} onChange={(v) => setForm((p) => ({ ...p, proximaData: v }))} fullWidth />
              <Field label="Garantias" value={form.garantias} onChange={(v) => setForm((p) => ({ ...p, garantias: v }))} placeholder="Hipoteca, aval, CPR..." fullWidth />
            </div>
            <label className="mt-3 block">
              <span className={dealLabelClass}>Observações</span>
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                rows={4}
                className={`${dealInputClass} mt-1 resize-y leading-relaxed`}
              />
            </label>
            <div className="mt-3 flex justify-end">
              <DSButton variant="primary" size="sm" onClick={salvarCampos} disabled={saving}>
                <Save className="w-3.5 h-3.5" /> {saving ? 'Salvando...' : 'Salvar campos'}
              </DSButton>
            </div>
          </div>
          {negociacao.proposta && (
            <div className="rounded-lg border border-aletis-verde/30 bg-aletis-verde/5 p-4 dark:bg-aletis-verde/10">
              <p className="text-[11px] font-body font-semibold uppercase text-foreground">Proposta vinculada</p>
              <p className="text-xs font-display font-semibold text-foreground dark:text-white mt-1">
                {negociacao.proposta.titulo || negociacao.proposta.id.slice(0, 12)}
              </p>
              <p className="text-[11px] text-muted-foreground dark:text-white/60 mt-0.5">
                {negociacao.proposta.tipo ?? '—'} · {negociacao.proposta.status ?? '—'}
              </p>
              <Link
                to={`/propostas?id=${negociacao.proposta.id}`}
                className="text-[11px] font-body text-foreground hover:underline mt-1 inline-block"
              >
                abrir proposta →
              </Link>
            </div>
          )}
        </div>
        <div className={dealPanelClass}>
          <p className={dealLabelClass}>Histórico</p>
          <ul className="space-y-2 mt-2 max-h-72 overflow-y-auto pr-1">
            {(negociacao.historico ?? []).slice().reverse().map((h, i) => (
              <li key={i} className="text-xs border-l-2 border-aletis-verde pl-2 py-0.5">
                <p className="text-foreground dark:text-white/90">{h.texto}</p>
                <p className="text-[11px] text-[var(--text-soft)] dark:text-white/40">
                  {new Date(h.ts).toLocaleString('pt-BR')} · {h.tipo}{h.usuarioNome ? ` · ${h.usuarioNome}` : ''}
                </p>
                {h.campo && <p className="text-[11px] text-[var(--text-soft)]">{h.campo}: {String(h.anterior ?? '—')} → {String(h.novo ?? '—')}</p>}
              </li>
            ))}
            {(!negociacao.historico || negociacao.historico.length === 0) && (
              <p className="text-[11px] italic text-[var(--text-soft)]">Sem histórico ainda.</p>
            )}
          </ul>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Adicionar nota ao histórico…"
              className="min-w-0 flex-1 rounded-xl border border-aletis-borda px-3 py-2 text-xs font-body outline-none transition focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/20 dark:bg-white/5 dark:border-white/10 dark:text-white"
            />
            <DSButton size="sm" variant="secondary" onClick={addNota} disabled={!nota.trim() || saving}>
              <MessageSquarePlus className="w-3.5 h-3.5" />
            </DSButton>
          </div>
        </div>
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
  footer,
  bodyClassName = '',
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  footer?: ReactNode
  bodyClassName?: string
}) {
  return (
    <MotionDialog
      title={title}
      subtitle={subtitle}
      eyebrow="Deal Room"
      icon={<Building2 size={20} />}
      onClose={onClose}
      size={wide ? 'xl' : 'lg'}
      bodyClassName={`bg-aletis-cream-papel/35 ${bodyClassName}`}
      footer={footer}
    >
      {children}
    </MotionDialog>
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
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <label className={`mb-1 block ${dealLabelClass}`}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={dealInputClass}
      />
    </div>
  )
}

function DealMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-aletis-borda bg-aletis-cream-papel/55 px-3 py-2">
      <p className={dealLabelClass}>{label}</p>
      <p className="mt-1 break-words font-display text-sm font-bold text-foreground dark:text-white">{value}</p>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string | ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-[var(--text-soft)] dark:text-white/50">{k}</span>
      <span className="font-mono font-semibold text-foreground dark:text-white">{v}</span>
    </div>
  )
}

function getPropostaValor(p: PropostaSummary | null | undefined): string | number | null | undefined {
  if (!p) return null
  return p.valorProposta ?? p.valorProposto ?? (p.payload?.valorProposta as string | number | undefined) ?? (p.payload?.valorProposto as string | number | undefined)
}

function getPropostaCredor(p: PropostaSummary | null | undefined): string | null {
  if (!p) return null
  const payload = p.payload ?? {}
  const value = p.credor
    ?? payload.credor
    ?? payload.banco
    ?? payload.instituicao
    ?? payload.instituicaoFinanceira
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asMoneyNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = String(value).trim()
  const cleaned = raw.replace(/[^\d,.-]/g, '')
  const normalized = cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function moneyInput(value: unknown): string {
  const n = asMoneyNumber(value)
  return n == null ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function numberInput(value: unknown): string {
  const n = asMoneyNumber(value)
  return n == null ? '' : String(n).replace('.', ',')
}

function parseMoneyInput(value: string): number | null {
  const n = asMoneyNumber(value)
  return n == null ? null : n
}

function dateInput(value: unknown): string {
  if (!value) return ''
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}
