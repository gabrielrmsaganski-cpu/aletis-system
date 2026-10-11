import SearchField from '../components/ui/SearchField'
import ViewSwitch from '../components/ui/ViewSwitch'
import FilterBar from '../components/ui/FilterBar'
import PageHeader from '../components/ui/PageHeader'
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, useApi, apiFetch, apiFetchFull } from '../hooks/useApi'
import { proposalRevision } from '../components/cliente/proposalDraft'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { KpiTile, Chip, InlineButton, type ChipTone } from '../components/ui'
import {
  FileText,
  Plus,
  Search,
  Filter,
  LayoutGrid,
  LayoutList,
  Eye,
  Pencil,
  Copy,
  Download,
  Clock,
  DollarSign,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FileCheck,
  ChevronDown,
  ArrowUpDown,
} from 'lucide-react'
import AppDialog from '../components/ui/AppDialog'
import { uiAction } from '../components/ui/foundation'

// ────────────────────────────────────────────────────────────
// Currency Formatter
// ────────────────────────────────────────────────────────────
function toFiniteNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatBRL = (value: unknown): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(toFiniteNumber(value))

function textOr(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim()
  return normalized || fallback
}

// ────────────────────────────────────────────────────────────
// Status Configuration
// ────────────────────────────────────────────────────────────
type ProposalStatus =
  | 'rascunho'
  | 'em_analise'
  | 'enviada'
  | 'aceita'
  | 'rejeitada'
  | 'expirada'

const statusConfig: Record<
  ProposalStatus,
  { label: string; tone: ChipTone; icon: React.ElementType }
> = {
  rascunho: { label: 'Rascunho', tone: 'slate', icon: FileText },
  em_analise: { label: 'Em análise', tone: 'amber', icon: Clock },
  enviada: { label: 'Enviada', tone: 'violet', icon: Send },
  aceita: { label: 'Aceita', tone: 'emerald', icon: CheckCircle2 },
  rejeitada: { label: 'Rejeitada', tone: 'red', icon: XCircle },
  expirada: { label: 'Expirada', tone: 'red', icon: AlertCircle },
}

const DEFAULT_STATUS_CONFIG: { label: string; tone: ChipTone; icon: React.ElementType } = {
  label: 'Outro',
  tone: 'slate',
  icon: FileText,
}

// ────────────────────────────────────────────────────────────
// Proposal Data
// ────────────────────────────────────────────────────────────
interface Proposal {
  id: number
  revision?: number
  apiId?: string
  titulo: string
  cliente: string
  clienteId?: string
  credor: string
  valorDivida?: number
  valorProposto: number
  descontoPercentual?: number
  status: ProposalStatus
  dataCriacao: string
  tipo: string
  fundamentacao?: string
  observacoes?: string
}

// ────────────────────────────────────────────────────────────
// API Response → Proposal mapping
// ────────────────────────────────────────────────────────────
interface ApiProposta {
  id: string
  revision?: number
  clienteId: string
  clienteNome: string
  credor: string
  titulo: string
  tipo: string
  status: string
  valorDivida: number | string | null
  valorProposta: number | string | null
  descontoPercentual: number | string | null
  dataCriacao: string
  dataValidade: string
  ultimaAtualizacao: string
  fundamentacao?: string
  observacoes?: string
}

interface ProposalMutationResponse {
  data: ApiProposta
  meta?: {
    negociacaoId?: string
    contratoId?: string
  }
}

function mapApiToProposal(item: ApiProposta, index: number): Proposal {
  const formatDate = (iso: string): string => {
    if (!iso) return ''
    const parts = iso.split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return iso
  }
  return {
    id: index + 1,
    apiId: item.id,
    revision: item.revision,
    titulo: textOr(item.titulo, 'Proposta sem título — revisar'),
    cliente: textOr(item.clienteNome, 'Cliente não identificado'),
    clienteId: item.clienteId,
    credor: textOr(item.credor, 'Credor não identificado'),
    valorDivida: toFiniteNumber(item.valorDivida),
    valorProposto: toFiniteNumber(item.valorProposta),
    descontoPercentual: toFiniteNumber(item.descontoPercentual),
    status: (item.status || 'rascunho') as ProposalStatus,
    dataCriacao: formatDate(item.dataCriacao),
    tipo: item.tipo,
    fundamentacao: item.fundamentacao,
    observacoes: item.observacoes,
  }
}

// ────────────────────────────────────────────────────────────
// Status Badge Component
// ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ProposalStatus }) {
  const config = statusConfig[status] || DEFAULT_STATUS_CONFIG
  return <Chip tone={config.tone} icon={config.icon} label={config.label} size="md" />
}

const proposalLabelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]'
const proposalInputClass = 'input-field h-10 text-sm'
const proposalTextAreaClass = 'input-field min-h-24 resize-y text-sm'

function DetailField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className={proposalLabelClass}>{label}</p>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// New Proposal Form Defaults
// ────────────────────────────────────────────────────────────
const TIPO_OPTIONS = [
  { value: 'liquidacao', label: 'Liquidação' },
  { value: 'renegociacao', label: 'Renegociação' },
  { value: 'memoria_calculo', label: 'Memória de Cálculo' },
  { value: 'parcelamento', label: 'Parcelamento' },
  { value: 'acordo_judicial', label: 'Acordo Judicial' },
]

interface ProposalForm {
  titulo: string
  clienteNome: string
  clienteId: string
  demandaId: string
  demandaTitulo: string
  credor: string
  tipo: string
  valorDivida: string
  valorProposta: string
  fundamentacao: string
  observacoes: string
}

const EDIT_FIELD_LABELS: Record<string, string> = { titulo: 'Título', valorProposta: 'Valor proposto', fundamentacao: 'Fundamentação', observacoes: 'Observações' }

function editProposalValue(proposal: Proposal, key: string): string {
  if (key === 'valorProposta') return String(proposal.valorProposto)
  return String(proposal[key as keyof Proposal] ?? '')
}

function editProposalChanges(proposal: Proposal, form: ProposalForm): Record<string, string> {
  const fields = proposal.status === 'aceita' ? ['observacoes'] : Object.keys(EDIT_FIELD_LABELS)
  return Object.fromEntries(fields.filter(key => form[key as keyof ProposalForm] !== editProposalValue(proposal, key)).map(key => [key, form[key as keyof ProposalForm]]))
}

const emptyForm: ProposalForm = {
  titulo: '',
  clienteNome: '',
  clienteId: '',
  demandaId: '',
  demandaTitulo: '',
  credor: '',
  tipo: 'liquidacao',
  valorDivida: '',
  valorProposta: '',
  fundamentacao: '',
  observacoes: '',
}

interface ClienteOption {
  id: string
  nome: string
  credor?: string
  valorTotalDivida?: number | string | null
}

interface DemandaOption {
  id: string
  titulo: string
  credor?: string
  valorPretendido?: string
  status?: string
}

// ────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────
export default function Propostas() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todas')
  const [dateFilter, setDateFilter] = useState<string>('todos')
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [sortField, setSortField] = useState<string>('dataCriacao')
  const [sortAsc, setSortAsc] = useState(false)

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [viewingProposal, setViewingProposal] = useState<Proposal | null>(null)
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null)
  const [formData, setFormData] = useState<ProposalForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const mutationInFlight = useRef(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editConflict, setEditConflict] = useState(false)
  const [editingLatest, setEditingLatest] = useState<Proposal | null>(null)

  // Toast
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()

  // Fonte única: API persistida. Estado vazio é exibido como vazio, sem mocks.
  const { data: apiPropostas, refetch } = useApi<ApiProposta[]>('/propostas', [])
  const { data: clientes } = useApi<ClienteOption[]>('/clientes', [])
  const [demandas, setDemandas] = useState<DemandaOption[]>([])
  const [loadingDemandas, setLoadingDemandas] = useState(false)
  const proposals: Proposal[] = useMemo(() => {
    return (apiPropostas ?? []).map(mapApiToProposal)
  }, [apiPropostas])

  useEffect(() => {
    const requestedId = searchParams.get('proposta') || searchParams.get('id')
    if (!requestedId || !apiPropostas) return
    const proposal = proposals.find((item) => item.apiId === requestedId)
    if (!proposal) return
    setViewingProposal(proposal)
  }, [apiPropostas, proposals, searchParams])

  const closeViewingProposal = () => {
    setViewingProposal(null)
    if (!searchParams.has('proposta') && !searchParams.has('id')) return
    const next = new URLSearchParams(searchParams)
    next.delete('proposta')
    next.delete('id')
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (!formData.clienteId || !showCreateModal) {
      setDemandas([])
      return
    }
    const controller = new AbortController()
    setLoadingDemandas(true)
    apiFetch<DemandaOption[]>(`/clientes/${formData.clienteId}/demandas`, { signal: controller.signal })
      .then(setDemandas)
      .catch((error) => {
        if ((error as Error).name !== 'AbortError') showToast(`Não foi possível carregar as demandas: ${(error as Error).message}`, 'warning')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDemandas(false)
      })
    return () => controller.abort()
  }, [formData.clienteId, showCreateModal, showToast])

  const creditorOptions = useMemo(() => Array.from(new Set([
    ...clientes.map((cliente) => textOr(cliente.credor, '')),
    ...demandas.map((demanda) => textOr(demanda.credor, '')),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [clientes, demandas])

  // Compute stats from actual data
  const stats = useMemo(() => {
    const total = proposals.length
    const elaboracao = proposals.filter(p => ['rascunho', 'em_analise'].includes(p.status)).length
    const enviadas = proposals.filter(p => p.status === 'enviada').length
    const aceitas = proposals.filter(p => p.status === 'aceita').length
    return [
      { label: 'Total', value: total, icon: FileText, accent: 'verde' as const, sub: 'propostas cadastradas' },
      { label: 'Em Elaboração', value: elaboracao, icon: Loader2, accent: 'sky' as const, sub: 'rascunhos + revisão' },
      { label: 'Enviadas', value: enviadas, icon: Send, accent: 'violet' as const, sub: 'aguardando retorno' },
      { label: 'Aceitas', value: aceitas, icon: CheckCircle2, accent: 'verde' as const, sub: 'fechadas com sucesso' },
    ]
  }, [proposals])

  // Filter logic
  const filteredProposals = useMemo(() => {
    let result = [...proposals]

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      result = result.filter(
        (p) =>
          p.titulo.toLowerCase().includes(q) ||
          p.cliente.toLowerCase().includes(q) ||
          p.credor.toLowerCase().includes(q)
      )
    }

    if (statusFilter !== 'todas') {
      result = result.filter((p) => p.status === statusFilter)
    }

    if (dateFilter !== 'todos') {
      const now = new Date()
      const threshold = new Date(now)
      if (dateFilter === 'ultimo-mes') threshold.setMonth(threshold.getMonth() - 1)
      if (dateFilter === 'ultimos-3-meses') threshold.setMonth(threshold.getMonth() - 3)
      if (dateFilter === 'este-ano') threshold.setMonth(0, 1)
      threshold.setHours(0, 0, 0, 0)
      result = result.filter((proposal) => {
        const [day, month, year] = proposal.dataCriacao.split('/').map(Number)
        const createdAt = new Date(year, month - 1, day)
        return Number.isFinite(createdAt.getTime()) && createdAt >= threshold && createdAt <= now
      })
    }

    result.sort((a, b) => {
      let cmp = 0
      if (sortField === 'valorProposto') {
        cmp = a.valorProposto - b.valorProposto
      } else if (sortField === 'cliente') {
        cmp = a.cliente.localeCompare(b.cliente)
      } else {
        const parseDate = (d: string) => {
          const [day, month, year] = d.split('/')
          return new Date(+year, +month - 1, +day).getTime()
        }
        cmp = parseDate(a.dataCriacao) - parseDate(b.dataCriacao)
      }
      return sortAsc ? cmp : -cmp
    })

    return result
  }, [proposals, searchTerm, statusFilter, dateFilter, sortField, sortAsc])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  // ── Action Handlers ─────────────────────────────────────────

  const handleCreateNew = useCallback(() => {
    setFormData(emptyForm)
    setShowCreateModal(true)
  }, [])

  const handleView = useCallback((proposal: Proposal) => {
    setViewingProposal(proposal)
  }, [])

  const handleEdit = useCallback((proposal: Proposal) => {
    setEditError(null)
    setEditConflict(false)
    setEditingLatest(null)
    setFormData({
      titulo: proposal.titulo,
      clienteNome: proposal.cliente,
      clienteId: proposal.clienteId || '',
      demandaId: '',
      demandaTitulo: '',
      credor: proposal.credor,
      tipo: proposal.tipo,
      valorDivida: String(proposal.valorDivida || ''),
      valorProposta: String(proposal.valorProposto),
      fundamentacao: proposal.fundamentacao || '',
      observacoes: proposal.observacoes || '',
    })
    setEditingProposal(proposal)
  }, [])

  const handleDuplicate = useCallback(async (proposal: Proposal) => {
    try {
      setSaving(true)
      if (!proposal.clienteId) {
        showToast('Esta proposta não possui cliente canônico. Vincule-a a um cliente antes de duplicar.', 'warning')
        return
      }
      await apiFetch('/propostas/gerar', {
        method: 'POST',
        body: JSON.stringify({
          clienteId: proposal.clienteId,
          clienteNome: proposal.cliente,
          credor: proposal.credor,
          titulo: `[COPIA] ${proposal.titulo}`,
          tipo: proposal.tipo.includes('Parcelamento') ? 'parcelamento' : proposal.tipo.includes('Dação') ? 'liquidacao' : 'renegociacao',
          valorDivida: proposal.valorDivida || proposal.valorProposto * 1.3,
          valorProposta: proposal.valorProposto,
        }),
      })
      showToast('Proposta duplicada com sucesso', 'success')
      refetch()
    } catch (err) {
      showToast(`Erro ao duplicar: ${(err as Error).message}`, 'warning')
    } finally {
      setSaving(false)
    }
  }, [showToast, refetch])

  const handleDownloadPdf = useCallback(async (proposal: Proposal) => {
    if (!proposal.apiId) {
      showToast('Gerando PDF... Funcionalidade completa em breve', 'info')
      return
    }
    showToast('Gerando PDF...', 'info')
    try {
      const res = await fetch(`/api/propostas/${proposal.apiId}/pdf`)
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `proposta-${proposal.apiId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('PDF baixado com sucesso', 'success')
    } catch (err) {
      showToast(`Erro ao gerar PDF: ${(err as Error).message}`, 'warning')
    }
  }, [showToast])

  const handleSaveCreate = useCallback(async () => {
    if (!formData.titulo.trim() || !formData.clienteId || !formData.clienteNome.trim() || !formData.credor.trim()) {
      showToast('Selecione um cliente do CRM e preencha título e credor', 'warning')
      return
    }
    const valorDivida = parseFloat(formData.valorDivida) || 0
    const valorProposta = parseFloat(formData.valorProposta) || 0
    if (valorDivida <= 0 || valorProposta <= 0) {
      showToast('Preencha valores da dívida e proposta', 'warning')
      return
    }

    try {
      setSaving(true)
      await apiFetch('/propostas/gerar', {
        method: 'POST',
        body: JSON.stringify({
          clienteId: formData.clienteId,
          clienteNome: formData.clienteNome,
          demandaId: formData.demandaId || undefined,
          demandaTitulo: formData.demandaTitulo || undefined,
          credor: formData.credor,
          titulo: formData.titulo,
          tipo: formData.tipo,
          valorDivida,
          valorProposta,
          fundamentacao: formData.fundamentacao,
          observacoes: formData.observacoes,
        }),
      })
      showToast('Proposta criada com sucesso', 'success')
      setShowCreateModal(false)
      refetch()
    } catch (err) {
      showToast(`Erro ao criar: ${(err as Error).message}`, 'warning')
    } finally {
      setSaving(false)
    }
  }, [formData, showToast, refetch])

  const handleSaveEdit = useCallback(async () => {
    if (!editingProposal || mutationInFlight.current || editConflict) return
    const patch = editProposalChanges(editingProposal, formData)
    if (!Object.keys(patch).length) { setEditingProposal(null); return }

    try {
      mutationInFlight.current = true
      setSaving(true)
      setEditError(null)
      if (editingProposal.apiId) {
        const updated = await apiFetch<ApiProposta>(`/propostas/${encodeURIComponent(editingProposal.apiId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...patch, expectedRevision: proposalRevision({ ...editingProposal, id: editingProposal.apiId }) }),
        })
        setViewingProposal(current => current?.apiId === updated.id ? mapApiToProposal(updated, current.id - 1) : current)
        showToast('Proposta atualizada com sucesso', 'success')
        refetch()
      } else {
        showToast('Proposta salva localmente', 'info')
      }
      setEditingProposal(null)
    } catch (err) {
      setEditError((err as Error).message)
      if (err instanceof ApiError && err.status === 409) {
        setEditConflict(true)
        if (editingProposal.apiId) {
          try {
            const latest = await apiFetch<ApiProposta>(`/propostas/${encodeURIComponent(editingProposal.apiId)}`)
            setEditingLatest(mapApiToProposal(latest, editingProposal.id - 1))
          } catch { /* A edição permanece aberta; a consulta pode ser repetida. */ }
        }
      }
      showToast(`Erro ao salvar: ${(err as Error).message}`, 'warning')
    } finally {
      setSaving(false)
      mutationInFlight.current = false
    }
  }, [editingProposal, editConflict, formData, showToast, refetch])

  const reconcileEdit = async (keepChanges: boolean) => {
    if (!editingProposal?.apiId || saving) return
    let latest = editingLatest
    if (!latest) {
      try { latest = mapApiToProposal(await apiFetch<ApiProposta>(`/propostas/${encodeURIComponent(editingProposal.apiId)}`), editingProposal.id - 1); setEditingLatest(latest) }
      catch (error) { setEditError((error as Error).message); return }
      return
    }
    const changes = keepChanges ? editProposalChanges(editingProposal, formData) : {}
    if (latest.status === 'aceita' && Object.keys(changes).some(key => key !== 'observacoes')) return
    handleEdit(latest)
    if (keepChanges) setFormData(current => ({ ...current, ...Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, String(value ?? '')])) }))
    showToast(keepChanges ? 'Confira as alterações reaplicadas e salve novamente.' : 'Versão atual carregada.', 'info')
  }

  const handleStatusTransition = useCallback(async (
    proposal: Proposal,
    status: 'enviada' | 'aceita',
  ) => {
    if (mutationInFlight.current) return
    if (!proposal.apiId) {
      showToast('Esta proposta ainda não possui identificação persistida.', 'warning')
      return
    }
    try {
      mutationInFlight.current = true
      setSaving(true)
      const result = await apiFetchFull<ProposalMutationResponse>('/propostas/' + proposal.apiId, {
        method: 'PATCH',
        body: JSON.stringify({ status, expectedRevision: proposalRevision({ ...proposal, id: proposal.apiId }) }),
      })
      setViewingProposal((current) => {
        if (!current || current.apiId !== proposal.apiId) return current
        return mapApiToProposal(result.data, current.id - 1)
      })
      refetch()
      if (result.data.status === 'aceita') {
        showToast(
          result.meta?.contratoId
            ? 'Aceite registrado. Negociação e rascunho contratual ' + result.meta.contratoId + ' foram vinculados.'
            : 'Aceite registrado. A negociação foi atualizada.',
          'success',
        )
      } else {
        showToast(
          result.meta?.negociacaoId
            ? 'Envio registrado. Negociação ' + result.meta.negociacaoId + ' criada ou atualizada.'
            : 'Envio da proposta registrado.',
          'success',
        )
      }
    } catch (error) {
      showToast('Não foi possível atualizar o status: ' + (error as Error).message, 'warning')
      if (error instanceof ApiError && error.status === 409) {
        refetch()
        try {
          const latest = await apiFetch<ApiProposta>(`/propostas/${encodeURIComponent(proposal.apiId)}`)
          setViewingProposal(current => current?.apiId === latest.id ? mapApiToProposal(latest, current.id - 1) : current)
        } catch { /* O erro original já informa que o aceite não foi confirmado. */ }
      }
    } finally {
      setSaving(false)
      mutationInFlight.current = false
    }
  }, [refetch, showToast])

  const updateForm = (field: keyof ProposalForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const selectCliente = (clienteId: string) => {
    const cliente = clientes.find((item) => item.id === clienteId)
    setFormData((previous) => ({
      ...previous,
      clienteId,
      clienteNome: cliente?.nome || '',
      demandaId: '',
      demandaTitulo: '',
      credor: textOr(cliente?.credor, ''),
      valorDivida: previous.valorDivida || String(toFiniteNumber(cliente?.valorTotalDivida) || ''),
    }))
  }

  const selectDemanda = (demandaId: string) => {
    const demanda = demandas.find((item) => item.id === demandaId)
    setFormData((previous) => ({
      ...previous,
      demandaId,
      demandaTitulo: demanda?.titulo || '',
      credor: textOr(demanda?.credor, previous.credor),
      valorDivida: previous.valorDivida || String(toFiniteNumber(demanda?.valorPretendido) || ''),
    }))
  }

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* ── Page Header ─────────────────────────────────────── */}
      <PageHeader eyebrow="Comercial" title={<>Propostas</>} description={<> <p className="text-muted-foreground font-body mt-1 text-sm">
              Gestão de propostas técnicas
            </p> </>} actions={<> <InlineButton
            variant="primary"
            size="md"
            icon={Plus}
            onClick={handleCreateNew}
            className="self-start sm:self-auto"
          >
            Nova Proposta
          </InlineButton> </>} />

      {/* ── Stats Strip ─────────────────────────────────────── */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <KpiTile
            key={stat.label}
            variant="light"
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            sub={stat.sub}
            accent={stat.accent}
          />
        ))}
      </section>

      {/* ── Filter Bar ──────────────────────────────────────── */}
      <FilterBar className="mb-6" activeCount={Number(Boolean(searchTerm.trim())) + Number(statusFilter !== 'todas') + Number(dateFilter !== 'todos')} onClear={() => { setSearchTerm(''); setStatusFilter('todas'); setDateFilter('todos') }}>
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-end">
          <SearchField label="Buscar propostas" value={searchTerm} onChange={setSearchTerm} placeholder="Título, cliente ou credor" />

          {/* Status dropdown */}
          <div className="relative">
            <label htmlFor="propostas-status" className="mb-1.5 block text-xs font-medium text-muted-foreground">Status</label>
            <Filter className="absolute left-3 bottom-3 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              id="propostas-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field pl-10 pr-8 py-2.5 text-sm appearance-none cursor-pointer min-w-[180px]"
            >
              <option value="todas">Todas</option>
              <option value="rascunho">Rascunho</option>
              <option value="gerando">Gerando</option>
              <option value="revisao">Em Revisão</option>
              <option value="enviada">Enviada</option>
              <option value="visualizada">Visualizada</option>
              <option value="aceita">Aceita</option>
              <option value="rejeitada">Rejeitada</option>
            </select>
            <ChevronDown className="absolute right-3 bottom-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>

          {/* Date range */}
          <div className="relative">
            <label htmlFor="propostas-periodo" className="mb-1.5 block text-xs font-medium text-muted-foreground">Período</label>
            <Clock className="absolute left-3 bottom-3 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              id="propostas-periodo"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="input-field pl-10 pr-8 py-2.5 text-sm appearance-none cursor-pointer min-w-[180px]"
            >
              <option value="todos">Todos os períodos</option>
              <option value="ultimo-mes">Último mês</option>
              <option value="ultimos-3-meses">Últimos 3 meses</option>
              <option value="este-ano">Este ano</option>
            </select>
            <ChevronDown className="absolute right-3 bottom-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>


        </div>
      </FilterBar>

      {/* ── Results count ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm font-body text-muted-foreground">
          {filteredProposals.length} proposta{filteredProposals.length !== 1 ? 's' : ''} encontrada{filteredProposals.length !== 1 ? 's' : ''}
        </p>
        <ViewSwitch label="Visualização das propostas" value={viewMode} onChange={setViewMode} options={[{value:'table',label:'Lista',icon:LayoutList},{value:'card',label:'Cartões',icon:LayoutGrid}]} />
      </div>

      {/* ── Table View ──────────────────────────────────────── */}
      {viewMode === 'table' && (
        <div className="card-premium overflow-hidden">
          <div className="overflow-x-auto">
            <table className="ui-table w-full">
              <thead>
                <tr className="border-b border-aletis-borda bg-aletis-bege/50">
                  <th className="text-left px-5 py-3.5">
                    <button
                      onClick={() => handleSort('titulo')}
                      className="flex items-center gap-1.5 text-xs font-body font-semibold text-[var(--text-soft)] uppercase tracking-wider hover:text-aletis-grafite-escuro transition-colors"
                    >
                      Título
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5">
                    <button
                      onClick={() => handleSort('cliente')}
                      className="flex items-center gap-1.5 text-xs font-body font-semibold text-[var(--text-soft)] uppercase tracking-wider hover:text-aletis-grafite-escuro transition-colors"
                    >
                      Cliente
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 hidden lg:table-cell">
                    <span className="text-xs font-body font-semibold text-[var(--text-soft)] uppercase tracking-wider">
                      Credor
                    </span>
                  </th>
                  <th className="text-right px-5 py-3.5">
                    <button
                      onClick={() => handleSort('valorProposto')}
                      className="flex items-center gap-1.5 text-xs font-body font-semibold text-[var(--text-soft)] uppercase tracking-wider hover:text-aletis-grafite-escuro transition-colors ml-auto"
                    >
                      Valor Proposto
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-center px-5 py-3.5">
                    <span className="text-xs font-body font-semibold text-[var(--text-soft)] uppercase tracking-wider">
                      Status
                    </span>
                  </th>
                  <th className="text-left px-5 py-3.5 hidden md:table-cell">
                    <button
                      onClick={() => handleSort('dataCriacao')}
                      className="flex items-center gap-1.5 text-xs font-body font-semibold text-[var(--text-soft)] uppercase tracking-wider hover:text-aletis-grafite-escuro transition-colors"
                    >
                      Criação
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-center px-5 py-3.5">
                    <span className="text-xs font-body font-semibold text-[var(--text-soft)] uppercase tracking-wider">
                      Ações
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-aletis-borda/60">
                {filteredProposals.map((proposal) => (
                  <tr
                    key={proposal.id}
                    className="hover:bg-aletis-bege/40 transition-colors duration-150 group"
                  >
                    <td className="px-5 py-4">
                      <div>
                        <p className="text-sm font-body font-medium text-foreground leading-tight group-hover:text-aletis-verde transition-colors">
                          {proposal.titulo}
                        </p>
                        <p className="text-xs font-body text-muted-foreground mt-0.5">
                          {proposal.tipo}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-body text-foreground">
                        {proposal.cliente}
                      </p>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <p className="text-sm font-body text-[var(--text-soft)]">
                        {proposal.credor}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="text-sm font-body font-semibold text-foreground">
                        {formatBRL(proposal.valorProposto)}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <StatusBadge status={proposal.status} />
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="text-sm font-body text-muted-foreground">
                        {proposal.dataCriacao}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleView(proposal)}
                          className="p-2 rounded-lg text-muted-foreground hover:bg-aletis-bege hover:text-aletis-verde transition-colors"
                          title="Ver proposta"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(proposal)}
                          className="p-2 rounded-lg text-muted-foreground hover:bg-aletis-bege hover:text-aletis-dourado transition-colors"
                          title="Editar proposta"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(proposal)}
                          className="p-2 rounded-lg text-muted-foreground hover:bg-aletis-bege hover:text-blue-500 transition-colors"
                          title="Duplicar proposta"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(proposal)}
                          className="p-2 rounded-lg text-muted-foreground hover:bg-aletis-bege hover:text-alerta transition-colors"
                          title="Baixar PDF"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredProposals.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileCheck className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-body">Nenhuma proposta encontrada</p>
              <p className="text-xs font-body mt-1">
                {proposals.length === 0
                  ? 'Comece gerando uma proposta para um cliente da carteira.'
                  : 'Tente ajustar os filtros de busca.'}
              </p>
              {proposals.length === 0 && (
                <Link
                  to="/crm"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde-claro transition"
                >
                  Abrir CRM ALETIS e escolher cliente
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Card View ───────────────────────────────────────── */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProposals.map((proposal) => (
            <div
              key={proposal.id}
              className="card-premium p-5 group hover:border-aletis-verde/30 transition-all duration-300"
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <StatusBadge status={proposal.status} />
                <span className="text-xs font-body text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {proposal.dataCriacao}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-sm font-body font-semibold text-foreground leading-tight mb-2 group-hover:text-aletis-verde transition-colors">
                {proposal.titulo}
              </h3>

              {/* Details */}
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wider w-14 flex-shrink-0">
                    Cliente
                  </span>
                  <span className="text-xs font-body font-medium text-foreground truncate">
                    {proposal.cliente}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wider w-14 flex-shrink-0">
                    Credor
                  </span>
                  <span className="text-xs font-body font-medium text-[var(--text-soft)] truncate">
                    {proposal.credor}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wider w-14 flex-shrink-0">
                    Tipo
                  </span>
                  <span className="text-xs font-body text-[var(--text-soft)] truncate">
                    {proposal.tipo}
                  </span>
                </div>
              </div>

              {/* Value */}
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-aletis-bege/60">
                <DollarSign className="w-4 h-4 text-aletis-dourado flex-shrink-0" />
                <span className="text-lg font-display font-semibold text-foreground">
                  {formatBRL(proposal.valorProposto)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-aletis-borda/60">
                <button
                  onClick={() => handleView(proposal)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body font-medium text-foreground hover:bg-aletis-verde/5 transition-colors"
                  title="Ver proposta"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver
                </button>
                <button
                  onClick={() => handleEdit(proposal)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body font-medium text-aletis-dourado hover:bg-aletis-dourado/5 transition-colors"
                  title="Editar proposta"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => handleDuplicate(proposal)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body font-medium text-blue-500 hover:bg-blue-50 transition-colors"
                  title="Duplicar proposta"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicar
                </button>
                <button
                  onClick={() => handleDownloadPdf(proposal)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body font-medium text-[var(--text-soft)] hover:bg-aletis-bege transition-colors"
                  title="Baixar PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
              </div>
            </div>
          ))}

          {filteredProposals.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FileCheck className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-body">Nenhuma proposta encontrada</p>
              <p className="text-xs font-body mt-1">Tente ajustar os filtros de busca</p>
            </div>
          )}
        </div>
      )}

      {/* ── View Modal ─────────────────────────────────────── */}
      {viewingProposal && (
        <AppDialog
          title="Detalhes da proposta"
          eyebrow={viewingProposal.cliente}
          subtitle={viewingProposal.titulo}
          icon={<FileText className="h-5 w-5" />}
          size="md"
          onClose={closeViewingProposal}
          bodyClassName="space-y-5"
          footerClassName="flex justify-end gap-2"
          footer={(
            <>
              {viewingProposal.status === 'em_analise' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleStatusTransition(viewingProposal, 'enviada')}
                  className={uiAction.secondary}
                >
                  <Send className="h-4 w-4" /> Registrar envio
                </button>
              )}
              {viewingProposal.status === 'enviada' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleStatusTransition(viewingProposal, 'aceita')}
                  className={uiAction.primary}
                >
                  <CheckCircle2 className="h-4 w-4" /> Registrar aceite
                </button>
              )}
              <button type="button" onClick={() => { closeViewingProposal(); handleEdit(viewingProposal) }} className={uiAction.secondary}>
                <Pencil className="h-4 w-4" /> Editar
              </button>
              <button type="button" onClick={() => handleDownloadPdf(viewingProposal)} className={uiAction.primary}>
                <Download className="h-4 w-4" /> Baixar PDF
              </button>
            </>
          )}
        >
          <DetailField label="Título">
            <span className="font-medium">{viewingProposal.titulo}</span>
          </DetailField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label="Cliente">{viewingProposal.cliente}</DetailField>
            <DetailField label="Credor">{viewingProposal.credor}</DetailField>
            <DetailField label="Tipo">{viewingProposal.tipo}</DetailField>
            <DetailField label="Status"><StatusBadge status={viewingProposal.status} /></DetailField>
            <DetailField label="Valor dívida">
              <span className="font-semibold text-rose-600">{formatBRL(viewingProposal.valorDivida || 0)}</span>
            </DetailField>
            <DetailField label="Valor proposto">
              <span className="font-semibold text-foreground">{formatBRL(viewingProposal.valorProposto)}</span>
            </DetailField>
            {viewingProposal.descontoPercentual !== undefined && (
              <DetailField label="Desconto">
                <span className="font-semibold text-aletis-gold-escuro">{viewingProposal.descontoPercentual.toFixed(1)}%</span>
              </DetailField>
            )}
            <DetailField label="Data criação">{viewingProposal.dataCriacao}</DetailField>
          </div>

          {viewingProposal.fundamentacao && (
            <DetailField label="Fundamentação">
              <p className="text-[var(--text-soft)]">{viewingProposal.fundamentacao}</p>
            </DetailField>
          )}
        </AppDialog>
      )}

      {/* ── Create Modal ───────────────────────────────────── */}
      {showCreateModal && (
        <AppDialog
          title="Nova proposta"
          eyebrow="Propostas"
          subtitle="Cadastre a proposta comercial com valores, credor e fundamentação."
          icon={<FileText className="h-5 w-5" />}
          size="md"
          onClose={() => setShowCreateModal(false)}
          bodyClassName="space-y-4"
          footerClassName="flex justify-end gap-2"
          footer={(
            <>
              <button type="button" onClick={() => setShowCreateModal(false)} className={uiAction.secondary}>Cancelar</button>
              <button type="button" onClick={handleSaveCreate} disabled={saving} className={uiAction.primary}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar proposta
              </button>
            </>
          )}
        >
          <div>
            <label className={proposalLabelClass}>Título *</label>
            <input type="text" value={formData.titulo} onChange={e => updateForm('titulo', e.target.value)} placeholder="Ex: Proposta de Liquidação - Cliente x Credor" className={proposalInputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={proposalLabelClass}>Cliente *</label>
              <select value={formData.clienteId} onChange={e => selectCliente(e.target.value)} className={`${proposalInputClass} cursor-pointer`}>
                <option value="">Selecione no CRM</option>
                {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={proposalLabelClass}>Credor *</label>
              <select value={formData.credor} onChange={e => updateForm('credor', e.target.value)} className={`${proposalInputClass} cursor-pointer`} disabled={!formData.clienteId}>
                <option value="">Selecione um credor cadastrado</option>
                {formData.credor && !creditorOptions.includes(formData.credor) && <option value={formData.credor}>{formData.credor}</option>}
                {creditorOptions.map((credor) => <option key={credor} value={credor}>{credor}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={proposalLabelClass}>Demanda / caso</label>
            <select value={formData.demandaId} onChange={e => selectDemanda(e.target.value)} className={`${proposalInputClass} cursor-pointer`} disabled={!formData.clienteId || loadingDemandas}>
              <option value="">{loadingDemandas ? 'Carregando demandas…' : 'Associar automaticamente à demanda compatível'}</option>
              {demandas.map((demanda) => <option key={demanda.id} value={demanda.id}>{demanda.titulo} · {demanda.status || 'ativa'}</option>)}
            </select>
            {formData.clienteId && !loadingDemandas && demandas.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">A primeira demanda será criada e vinculada pelo fluxo operacional ao salvar.</p>
            )}
          </div>
          <div>
            <label className={proposalLabelClass}>Tipo</label>
            <select value={formData.tipo} onChange={e => updateForm('tipo', e.target.value)} className={`${proposalInputClass} cursor-pointer appearance-none`}>
              {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={proposalLabelClass}>Valor dívida (R$) *</label>
              <input type="number" value={formData.valorDivida} onChange={e => updateForm('valorDivida', e.target.value)} placeholder="0.00" className={proposalInputClass} />
            </div>
            <div>
              <label className={proposalLabelClass}>Valor proposta (R$) *</label>
              <input type="number" value={formData.valorProposta} onChange={e => updateForm('valorProposta', e.target.value)} placeholder="0.00" className={proposalInputClass} />
            </div>
          </div>
          <div>
            <label className={proposalLabelClass}>Fundamentação</label>
            <textarea value={formData.fundamentacao} onChange={e => updateForm('fundamentacao', e.target.value)} placeholder="Argumentação técnica e jurídica..." rows={3} className={proposalTextAreaClass} />
          </div>
          <div>
            <label className={proposalLabelClass}>Observações</label>
            <textarea value={formData.observacoes} onChange={e => updateForm('observacoes', e.target.value)} placeholder="Notas internas..." rows={2} className="input-field min-h-20 resize-y text-sm" />
          </div>
        </AppDialog>
      )}

      {/* ── Edit Modal ─────────────────────────────────────── */}
      {editingProposal && (
        <AppDialog
          title="Editar proposta"
          eyebrow={editingProposal.cliente}
          subtitle="Atualize título, valor proposto, fundamentação e observações."
          icon={<Pencil className="h-5 w-5" />}
          size="md"
          onClose={() => { if (!saving) setEditingProposal(null) }}
          bodyClassName="space-y-4"
          footerClassName="flex justify-end gap-2"
          footer={(
            <>
              <button type="button" disabled={saving} onClick={() => setEditingProposal(null)} className={uiAction.secondary}>Cancelar</button>
              <button type="button" onClick={handleSaveEdit} disabled={saving || editConflict} className={uiAction.primary}>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar alterações
              </button>
            </>
          )}
        >
          {editingProposal.status === 'aceita' && <p className="text-xs text-[var(--text-soft)]">Proposta aceita. Somente as observações internas podem ser alteradas.</p>}
          {editError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{editError} Sua edição foi preservada.</p>}
          {editConflict && <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
            <p>Outra gravação alterou esta proposta. Compare os campos antes de continuar.</p>
            {editingLatest && Object.entries(editProposalChanges(editingProposal, formData)).map(([key, value]) => <div key={key} className="break-words border-t border-amber-200 pt-2"><strong>{EDIT_FIELD_LABELS[key] || key}</strong><p>Sua edição: {String(value).slice(0, 250)}</p><p>Atual: {String(editProposalValue(editingLatest, key)).slice(0, 250)}</p></div>)}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void reconcileEdit(false)} className={uiAction.secondary}>{editingLatest ? 'Usar versão atual e descartar minha edição' : 'Consultar versão atual'}</button>
              {editingLatest && <button type="button" disabled={editingLatest.status === 'aceita' && Object.keys(editProposalChanges(editingProposal, formData)).some(key => key !== 'observacoes')} onClick={() => void reconcileEdit(true)} className={uiAction.secondary}>Reaplicar meus campos para revisão</button>}
            </div>
          </div>}
          <div>
            <label className={proposalLabelClass}>Título</label>
            <input type="text" disabled={saving || editingProposal.status === 'aceita'} value={formData.titulo} onChange={e => updateForm('titulo', e.target.value)} className={proposalInputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={proposalLabelClass}>Cliente</label>
              <input type="text" value={formData.clienteNome} disabled className={`${proposalInputClass} cursor-not-allowed bg-muted`} />
            </div>
            <div>
              <label className={proposalLabelClass}>Credor</label>
              <input type="text" value={formData.credor} disabled className={`${proposalInputClass} cursor-not-allowed bg-muted`} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={proposalLabelClass}>Valor dívida (R$)</label>
              <input type="text" value={formData.valorDivida ? formatBRL(parseFloat(formData.valorDivida)) : '-'} disabled className={`${proposalInputClass} cursor-not-allowed bg-muted`} />
            </div>
            <div>
              <label className={proposalLabelClass}>Valor proposta (R$)</label>
              <input type="number" disabled={saving || editingProposal.status === 'aceita'} value={formData.valorProposta} onChange={e => updateForm('valorProposta', e.target.value)} className={proposalInputClass} />
            </div>
          </div>
          <div>
            <label className={proposalLabelClass}>Fundamentação</label>
            <textarea disabled={saving || editingProposal.status === 'aceita'} value={formData.fundamentacao} onChange={e => updateForm('fundamentacao', e.target.value)} rows={3} className={proposalTextAreaClass} />
          </div>
          <div>
            <label className={proposalLabelClass}>Observações</label>
            <textarea disabled={saving} value={formData.observacoes} onChange={e => updateForm('observacoes', e.target.value)} rows={2} className="input-field min-h-20 resize-y text-sm" />
          </div>
        </AppDialog>
      )}

      {/* Bottom spacer */}
      <div className="h-8" />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
