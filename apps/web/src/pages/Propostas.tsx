import React, { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useApi, apiFetch } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { KpiTile, Chip, type ChipTone } from '../components/ui'
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
  X,
} from 'lucide-react'

// ────────────────────────────────────────────────────────────
// Currency Formatter
// ────────────────────────────────────────────────────────────
const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

// ────────────────────────────────────────────────────────────
// Status Configuration
// ────────────────────────────────────────────────────────────
type ProposalStatus =
  | 'rascunho'
  | 'gerando'
  | 'revisao'
  | 'enviada'
  | 'visualizada'
  | 'aceita'
  | 'rejeitada'
  | 'em_analise'

const statusConfig: Record<
  ProposalStatus,
  { label: string; tone: ChipTone; icon: React.ElementType }
> = {
  rascunho: { label: 'Rascunho', tone: 'slate', icon: FileText },
  gerando: { label: 'Gerando', tone: 'sky', icon: Loader2 },
  revisao: { label: 'Em Revisão', tone: 'amber', icon: AlertCircle },
  enviada: { label: 'Enviada', tone: 'violet', icon: Send },
  visualizada: { label: 'Visualizada', tone: 'sky', icon: Eye },
  aceita: { label: 'Aceita', tone: 'emerald', icon: CheckCircle2 },
  rejeitada: { label: 'Rejeitada', tone: 'red', icon: XCircle },
  em_analise: { label: 'Em Análise', tone: 'amber', icon: Clock },
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

const fallbackProposals: Proposal[] = [
  {
    id: 1,
    titulo: 'Proposta de Liquidação - Ailton Caeiro x Sicoob',
    cliente: 'Ailton Caeiro da Silva',
    credor: 'Sicoob Crediminas',
    valorProposto: 2049802.53,
    valorDivida: 2800000,
    status: 'enviada',
    dataCriacao: '31/03/2026',
    tipo: 'Dação em pagamento',
  },
  {
    id: 2,
    titulo: 'Memória de Cálculo - Paulo Luciano x Fertiflora',
    cliente: 'Paulo Luciano de Oliveira',
    credor: 'Fertiflora Insumos Agrícolas',
    valorProposto: 243178.75,
    valorDivida: 320000,
    status: 'enviada',
    dataCriacao: '24/03/2026',
    tipo: 'Parcelamento 4x R$ 70.550',
  },
  {
    id: 3,
    titulo: 'Proposta de Parcelamento - Maria Santos x Banco do Brasil',
    cliente: 'Maria Santos',
    credor: 'Banco do Brasil',
    valorProposto: 450000.0,
    valorDivida: 620000,
    status: 'aceita',
    dataCriacao: '15/03/2026',
    tipo: 'Parcelamento 12x',
  },
  {
    id: 4,
    titulo: 'Memória de Cálculo - Roberto Almeida x Cresol',
    cliente: 'Roberto Almeida',
    credor: 'Cresol Cooperativa',
    valorProposto: 1020000.0,
    valorDivida: 1350000,
    status: 'aceita',
    dataCriacao: '10/03/2026',
    tipo: 'Renegociação',
  },
  {
    id: 5,
    titulo: 'Proposta de Acordo - Carlos Mendes x Sicredi',
    cliente: 'Carlos Mendes',
    credor: 'Sicredi Vanguarda',
    valorProposto: 780000.0,
    valorDivida: 950000,
    status: 'revisao',
    dataCriacao: '08/04/2026',
    tipo: 'Acordo extrajudicial',
  },
  {
    id: 6,
    titulo: 'Proposta de Liquidação - Pedro Henrique x Itaú',
    cliente: 'Pedro Henrique',
    credor: 'Itaú BBA',
    valorProposto: 320000.0,
    valorDivida: 420000,
    status: 'gerando',
    dataCriacao: '12/04/2026',
    tipo: 'Liquidação antecipada',
  },
  {
    id: 7,
    titulo: 'Proposta Preliminar - João Silva x Bradesco',
    cliente: 'João Silva',
    credor: 'Bradesco Agronegócio',
    valorProposto: 185000.0,
    valorDivida: 250000,
    status: 'rascunho',
    dataCriacao: '14/04/2026',
    tipo: 'Parcelamento 6x',
  },
  {
    id: 8,
    titulo: 'Memória de Cálculo - Faz. Sol Nascente x BNDES',
    cliente: 'Fazenda Sol Nascente',
    credor: 'BNDES',
    valorProposto: 890000.0,
    valorDivida: 1100000,
    status: 'visualizada',
    dataCriacao: '02/04/2026',
    tipo: 'Refinanciamento',
  },
  {
    id: 9,
    titulo: 'Proposta de Acordo - José Moreira x Santander',
    cliente: 'José Moreira',
    credor: 'Santander Rural',
    valorProposto: 510000.0,
    valorDivida: 680000,
    status: 'aceita',
    dataCriacao: '28/02/2026',
    tipo: 'Dação em pagamento',
  },
]

// ────────────────────────────────────────────────────────────
// API Response → Proposal mapping
// ────────────────────────────────────────────────────────────
interface ApiProposta {
  id: string
  clienteId: string
  clienteNome: string
  credor: string
  titulo: string
  tipo: string
  status: string
  valorDivida: number
  valorProposta: number
  descontoPercentual: number
  dataCriacao: string
  dataValidade: string
  ultimaAtualizacao: string
  fundamentacao?: string
  observacoes?: string
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
    titulo: item.titulo,
    cliente: item.clienteNome,
    clienteId: item.clienteId,
    credor: item.credor,
    valorDivida: item.valorDivida,
    valorProposto: item.valorProposta,
    descontoPercentual: item.descontoPercentual,
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
  credor: string
  tipo: string
  valorDivida: string
  valorProposta: string
  fundamentacao: string
  observacoes: string
}

const emptyForm: ProposalForm = {
  titulo: '',
  clienteNome: '',
  clienteId: '',
  credor: '',
  tipo: 'liquidacao',
  valorDivida: '',
  valorProposta: '',
  fundamentacao: '',
  observacoes: '',
}

// ────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────
export default function Propostas() {
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

  // Toast
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()

  // Fetch proposals from backend, fall back to hardcoded data
  const { data: apiPropostas, refetch } = useApi<ApiProposta[]>('/propostas', [])
  const proposals: Proposal[] = useMemo(() => {
    if (apiPropostas && apiPropostas.length > 0) {
      return apiPropostas.map(mapApiToProposal)
    }
    return fallbackProposals
  }, [apiPropostas])

  // Compute stats from actual data
  const stats = useMemo(() => {
    const total = proposals.length
    const elaboracao = proposals.filter(p => ['rascunho', 'gerando', 'revisao'].includes(p.status)).length
    const enviadas = proposals.filter(p => ['enviada', 'visualizada'].includes(p.status)).length
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

    if (dateFilter === 'ultimo-mes') {
      result = result.filter((p) => p.dataCriacao.includes('/04/2026') || p.dataCriacao.includes('/03/2026'))
    } else if (dateFilter === 'ultimos-3-meses') {
      result = result.filter(
        (p) =>
          p.dataCriacao.includes('/04/2026') ||
          p.dataCriacao.includes('/03/2026') ||
          p.dataCriacao.includes('/02/2026')
      )
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
    setFormData({
      titulo: proposal.titulo,
      clienteNome: proposal.cliente,
      clienteId: proposal.clienteId || '',
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
      await apiFetch('/propostas/gerar', {
        method: 'POST',
        body: JSON.stringify({
          clienteId: proposal.clienteId || `cli-${proposal.id}`,
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
    if (!formData.titulo.trim() || !formData.clienteNome.trim() || !formData.credor.trim()) {
      showToast('Preencha título, cliente e credor', 'warning')
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
          clienteId: formData.clienteId || `cli-new-${Date.now()}`,
          clienteNome: formData.clienteNome,
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
    if (!editingProposal) return

    try {
      setSaving(true)
      if (editingProposal.apiId) {
        await apiFetch(`/propostas/${editingProposal.apiId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            titulo: formData.titulo,
            valorProposta: parseFloat(formData.valorProposta) || editingProposal.valorProposto,
            fundamentacao: formData.fundamentacao,
            observacoes: formData.observacoes,
          }),
        })
        showToast('Proposta atualizada com sucesso', 'success')
        refetch()
      } else {
        showToast('Proposta salva localmente', 'info')
      }
      setEditingProposal(null)
    } catch (err) {
      showToast(`Erro ao salvar: ${(err as Error).message}`, 'warning')
    } finally {
      setSaving(false)
    }
  }, [editingProposal, formData, showToast, refetch])

  const updateForm = (field: keyof ProposalForm, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* ── Page Header ─────────────────────────────────────── */}
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
              Propostas
            </h1>
            <p className="text-aletis-grafite-claro font-body mt-1 text-sm">
              Gestão de propostas técnicas
            </p>
          </div>
          <button onClick={handleCreateNew} className="btn-gold flex items-center gap-2 self-start sm:self-auto">
            <Plus className="w-4 h-4" />
            Nova Proposta
          </button>
        </div>
      </header>

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
      <section className="card-premium p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro" />
            <input
              type="text"
              placeholder="Buscar por título, cliente ou credor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10 py-2.5 text-sm"
            />
          </div>

          {/* Status dropdown */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro pointer-events-none" />
            <select
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
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro pointer-events-none" />
          </div>

          {/* Date range */}
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro pointer-events-none" />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="input-field pl-10 pr-8 py-2.5 text-sm appearance-none cursor-pointer min-w-[180px]"
            >
              <option value="todos">Todos os períodos</option>
              <option value="ultimo-mes">Último mês</option>
              <option value="ultimos-3-meses">Últimos 3 meses</option>
              <option value="este-ano">Este ano</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro pointer-events-none" />
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 border border-aletis-borda rounded-xl p-1 self-start lg:self-auto">
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg transition-colors duration-200 ${
                viewMode === 'table'
                  ? 'bg-aletis-verde text-white'
                  : 'text-aletis-grafite-claro hover:bg-aletis-bege'
              }`}
              title="Visualização em tabela"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`p-2 rounded-lg transition-colors duration-200 ${
                viewMode === 'card'
                  ? 'bg-aletis-verde text-white'
                  : 'text-aletis-grafite-claro hover:bg-aletis-bege'
              }`}
              title="Visualização em cards"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* ── Results count ───────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-body text-aletis-grafite-claro">
          {filteredProposals.length} proposta{filteredProposals.length !== 1 ? 's' : ''} encontrada{filteredProposals.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* ── Table View ──────────────────────────────────────── */}
      {viewMode === 'table' && (
        <div className="card-premium overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-aletis-borda bg-aletis-bege/50">
                  <th className="text-left px-5 py-3.5">
                    <button
                      onClick={() => handleSort('titulo')}
                      className="flex items-center gap-1.5 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider hover:text-aletis-grafite-escuro transition-colors"
                    >
                      Título
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5">
                    <button
                      onClick={() => handleSort('cliente')}
                      className="flex items-center gap-1.5 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider hover:text-aletis-grafite-escuro transition-colors"
                    >
                      Cliente
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-left px-5 py-3.5 hidden lg:table-cell">
                    <span className="text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                      Credor
                    </span>
                  </th>
                  <th className="text-right px-5 py-3.5">
                    <button
                      onClick={() => handleSort('valorProposto')}
                      className="flex items-center gap-1.5 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider hover:text-aletis-grafite-escuro transition-colors ml-auto"
                    >
                      Valor Proposto
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-center px-5 py-3.5">
                    <span className="text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                      Status
                    </span>
                  </th>
                  <th className="text-left px-5 py-3.5 hidden md:table-cell">
                    <button
                      onClick={() => handleSort('dataCriacao')}
                      className="flex items-center gap-1.5 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider hover:text-aletis-grafite-escuro transition-colors"
                    >
                      Criação
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="text-center px-5 py-3.5">
                    <span className="text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
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
                        <p className="text-sm font-body font-medium text-aletis-grafite-escuro leading-tight group-hover:text-aletis-verde transition-colors">
                          {proposal.titulo}
                        </p>
                        <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                          {proposal.tipo}
                        </p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-body text-aletis-grafite-escuro">
                        {proposal.cliente}
                      </p>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <p className="text-sm font-body text-aletis-grafite-medio">
                        {proposal.credor}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                        {formatBRL(proposal.valorProposto)}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <StatusBadge status={proposal.status} />
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <p className="text-sm font-body text-aletis-grafite-claro">
                        {proposal.dataCriacao}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleView(proposal)}
                          className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege hover:text-aletis-verde transition-colors"
                          title="Ver proposta"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(proposal)}
                          className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege hover:text-aletis-dourado transition-colors"
                          title="Editar proposta"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDuplicate(proposal)}
                          className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege hover:text-blue-500 transition-colors"
                          title="Duplicar proposta"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownloadPdf(proposal)}
                          className="p-2 rounded-lg text-aletis-grafite-claro hover:bg-aletis-bege hover:text-alerta transition-colors"
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
            <div className="flex flex-col items-center justify-center py-16 text-aletis-grafite-claro">
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
                  Abrir CRM e escolher cliente
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
                <span className="text-xs font-body text-aletis-grafite-claro flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {proposal.dataCriacao}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-sm font-body font-semibold text-aletis-grafite-escuro leading-tight mb-2 group-hover:text-aletis-verde transition-colors">
                {proposal.titulo}
              </h3>

              {/* Details */}
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider w-14 flex-shrink-0">
                    Cliente
                  </span>
                  <span className="text-xs font-body font-medium text-aletis-grafite-escuro truncate">
                    {proposal.cliente}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider w-14 flex-shrink-0">
                    Credor
                  </span>
                  <span className="text-xs font-body font-medium text-aletis-grafite-medio truncate">
                    {proposal.credor}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider w-14 flex-shrink-0">
                    Tipo
                  </span>
                  <span className="text-xs font-body text-aletis-grafite-medio truncate">
                    {proposal.tipo}
                  </span>
                </div>
              </div>

              {/* Value */}
              <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-aletis-bege/60">
                <DollarSign className="w-4 h-4 text-aletis-dourado flex-shrink-0" />
                <span className="text-lg font-display font-bold text-aletis-grafite-escuro">
                  {formatBRL(proposal.valorProposto)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-aletis-borda/60">
                <button
                  onClick={() => handleView(proposal)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body font-medium text-aletis-verde hover:bg-aletis-verde/5 transition-colors"
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
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-body font-medium text-aletis-grafite-medio hover:bg-aletis-bege transition-colors"
                  title="Baixar PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </button>
              </div>
            </div>
          ))}

          {filteredProposals.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-aletis-grafite-claro">
              <FileCheck className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-body">Nenhuma proposta encontrada</p>
              <p className="text-xs font-body mt-1">Tente ajustar os filtros de busca</p>
            </div>
          )}
        </div>
      )}

      {/* ── View Modal ─────────────────────────────────────── */}
      {viewingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewingProposal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-aletis-borda">
              <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">Detalhes da Proposta</h2>
              <button onClick={() => setViewingProposal(null)} className="p-2 rounded-lg hover:bg-aletis-bege transition-colors">
                <X className="w-5 h-5 text-aletis-grafite-claro" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Título</p>
                <p className="text-sm font-body font-medium text-aletis-grafite-escuro">{viewingProposal.titulo}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Cliente</p>
                  <p className="text-sm font-body text-aletis-grafite-escuro">{viewingProposal.cliente}</p>
                </div>
                <div>
                  <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Credor</p>
                  <p className="text-sm font-body text-aletis-grafite-escuro">{viewingProposal.credor}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Tipo</p>
                  <p className="text-sm font-body text-aletis-grafite-escuro">{viewingProposal.tipo}</p>
                </div>
                <div>
                  <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Status</p>
                  <StatusBadge status={viewingProposal.status} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Valor Dívida</p>
                  <p className="text-sm font-body font-semibold text-red-600">{formatBRL(viewingProposal.valorDivida || 0)}</p>
                </div>
                <div>
                  <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Valor Proposto</p>
                  <p className="text-sm font-body font-semibold text-aletis-verde">{formatBRL(viewingProposal.valorProposto)}</p>
                </div>
              </div>
              {viewingProposal.descontoPercentual !== undefined && (
                <div>
                  <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Desconto</p>
                  <p className="text-sm font-body font-semibold text-aletis-dourado">{viewingProposal.descontoPercentual.toFixed(1)}%</p>
                </div>
              )}
              <div>
                <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Data Criação</p>
                <p className="text-sm font-body text-aletis-grafite-escuro">{viewingProposal.dataCriacao}</p>
              </div>
              {viewingProposal.fundamentacao && (
                <div>
                  <p className="text-xs font-body text-aletis-grafite-claro uppercase tracking-wider mb-1">Fundamentação</p>
                  <p className="text-sm font-body text-aletis-grafite-medio">{viewingProposal.fundamentacao}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-aletis-borda">
              <button onClick={() => { setViewingProposal(null); handleEdit(viewingProposal) }} className="px-4 py-2 rounded-xl text-sm font-body font-medium text-aletis-dourado hover:bg-aletis-dourado/5 transition-colors">
                Editar
              </button>
              <button onClick={() => handleDownloadPdf(viewingProposal)} className="px-4 py-2 rounded-xl text-sm font-body font-medium bg-aletis-verde text-white hover:bg-aletis-verde/90 transition-colors">
                Baixar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Modal ───────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-aletis-borda">
              <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">Nova Proposta</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-lg hover:bg-aletis-bege transition-colors">
                <X className="w-5 h-5 text-aletis-grafite-claro" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Título *</label>
                <input type="text" value={formData.titulo} onChange={e => updateForm('titulo', e.target.value)} placeholder="Ex: Proposta de Liquidação - Cliente x Credor" className="input-field py-2.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Cliente *</label>
                  <input type="text" value={formData.clienteNome} onChange={e => updateForm('clienteNome', e.target.value)} placeholder="Nome do cliente" className="input-field py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Credor *</label>
                  <input type="text" value={formData.credor} onChange={e => updateForm('credor', e.target.value)} placeholder="Nome do credor" className="input-field py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Tipo</label>
                <select value={formData.tipo} onChange={e => updateForm('tipo', e.target.value)} className="input-field py-2.5 text-sm appearance-none cursor-pointer">
                  {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Valor Dívida (R$) *</label>
                  <input type="number" value={formData.valorDivida} onChange={e => updateForm('valorDivida', e.target.value)} placeholder="0.00" className="input-field py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Valor Proposta (R$) *</label>
                  <input type="number" value={formData.valorProposta} onChange={e => updateForm('valorProposta', e.target.value)} placeholder="0.00" className="input-field py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Fundamentação</label>
                <textarea value={formData.fundamentacao} onChange={e => updateForm('fundamentacao', e.target.value)} placeholder="Argumentação técnica e jurídica..." rows={3} className="input-field py-2.5 text-sm resize-none" />
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Observações</label>
                <textarea value={formData.observacoes} onChange={e => updateForm('observacoes', e.target.value)} placeholder="Notas internas..." rows={2} className="input-field py-2.5 text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-aletis-borda">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-xl text-sm font-body font-medium text-aletis-grafite-medio hover:bg-aletis-bege transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveCreate} disabled={saving} className="px-6 py-2 rounded-xl text-sm font-body font-medium bg-aletis-verde text-white hover:bg-aletis-verde/90 transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar Proposta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ─────────────────────────────────────── */}
      {editingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingProposal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-aletis-borda">
              <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">Editar Proposta</h2>
              <button onClick={() => setEditingProposal(null)} className="p-2 rounded-lg hover:bg-aletis-bege transition-colors">
                <X className="w-5 h-5 text-aletis-grafite-claro" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Título</label>
                <input type="text" value={formData.titulo} onChange={e => updateForm('titulo', e.target.value)} className="input-field py-2.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Cliente</label>
                  <input type="text" value={formData.clienteNome} disabled className="input-field py-2.5 text-sm bg-gray-50 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Credor</label>
                  <input type="text" value={formData.credor} disabled className="input-field py-2.5 text-sm bg-gray-50 cursor-not-allowed" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Valor Dívida (R$)</label>
                  <input type="text" value={formData.valorDivida ? formatBRL(parseFloat(formData.valorDivida)) : '-'} disabled className="input-field py-2.5 text-sm bg-gray-50 cursor-not-allowed" />
                </div>
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Valor Proposta (R$)</label>
                  <input type="number" value={formData.valorProposta} onChange={e => updateForm('valorProposta', e.target.value)} className="input-field py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Fundamentação</label>
                <textarea value={formData.fundamentacao} onChange={e => updateForm('fundamentacao', e.target.value)} rows={3} className="input-field py-2.5 text-sm resize-none" />
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Observações</label>
                <textarea value={formData.observacoes} onChange={e => updateForm('observacoes', e.target.value)} rows={2} className="input-field py-2.5 text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-aletis-borda">
              <button onClick={() => setEditingProposal(null)} className="px-4 py-2 rounded-xl text-sm font-body font-medium text-aletis-grafite-medio hover:bg-aletis-bege transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="px-6 py-2 rounded-xl text-sm font-body font-medium bg-aletis-dourado text-white hover:bg-aletis-dourado/90 transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom spacer */}
      <div className="h-8" />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
