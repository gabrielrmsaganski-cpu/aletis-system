/**
 * CRM (Gestao de Clientes)
 *
 * Pagina de gestao de clientes do sistema ALETIS com visualizacoes
 * em Lista (tabela com ordenacao) e Kanban (por estagio do pipeline).
 * Permite buscar por nome/cidade/credor, filtrar por estagio,
 * exportar CSV, criar novo cliente (POST /clientes) e navegar para
 * a pagina de detalhes. Consome GET /clientes com fallback local.
 */
import React, { useState, useMemo } from 'react'
import { useApi, apiFetch } from '../hooks/useApi'
import { KpiTile, fmtNum } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { exportCSV } from '../utils/exportReports'
import { Link } from 'react-router-dom'
import {
  Users,
  Search,
  Filter,
  LayoutGrid,
  List,
  Plus,
  MapPin,
  Building2,
  ChevronDown,
  MoreHorizontal,
  Eye,
  Download,
  X,
  Loader2,
} from 'lucide-react'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────
type Estagio =
  | 'lead'
  | 'qualificacao'
  | 'analise'
  | 'proposta'
  | 'negociacao'
  | 'acordo'
  | 'acompanhamento'
  | 'concluido'

interface ProximaAcao {
  data: string
  descricao: string
  criadoEm: string
}

interface Cliente {
  id: string
  nome: string
  cidade: string
  uf: string
  credor: string
  valorDivida: number
  estagio: Estagio
  saudeFinanceira: number
  consultor: string
  tags?: string[]
  proximaAcao?: ProximaAcao
  estagioDesde?: string
  ultimaAtualizacao?: string
}

// ────────────────────────────────────────────────────────────
// Stage Definitions
// ────────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  lead: { label: 'Lead', color: '#6B7280' },
  prospeccao: { label: 'Prospecção', color: '#9CA3AF' },
  qualificacao: { label: 'Qualificação', color: '#3B82F6' },
  analise: { label: 'Análise', color: '#8B5CF6' },
  proposta: { label: 'Proposta', color: '#C9A84C' },
  negociacao: { label: 'Negociação', color: '#E67E22' },
  acordo: { label: 'Acordo', color: '#27AE60' },
  acompanhamento: { label: 'Acompanhamento', color: '#0F4C35' },
  concluido: { label: 'Concluído', color: '#1B6B4A' },
  encerrado: { label: 'Encerrado', color: '#374151' },
}

const DEFAULT_STAGE = { label: 'Outro', color: '#6B7280' }

const ALL_STAGES: Estagio[] = [
  'lead',
  'qualificacao',
  'analise',
  'proposta',
  'negociacao',
  'acordo',
  'acompanhamento',
  'concluido',
]

// ────────────────────────────────────────────────────────────
// Currency Helpers
// ────────────────────────────────────────────────────────────
const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatBRLCompact = (value: number): string => {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}K`
  return formatBRL(value)
}

// ────────────────────────────────────────────────────────────
// API Response Type (field names returned by GET /api/clientes)
// ────────────────────────────────────────────────────────────
interface ClienteApi {
  id: string
  nome: string
  cidade: string
  uf: string
  estagio: string
  consultor: string
  credor: string
  valorTotalDivida: number
  valorTotalPago?: number
  culturas?: string[]
  areaTotalHa?: number
  ultimaAtualizacao?: string
  saudeFinanceira?: number
  tags?: string[]
  proximaAcao?: ProximaAcao
  estagioDesde?: string
}

function mapApiCliente(c: ClienteApi): Cliente {
  return {
    id: c.id,
    nome: c.nome,
    cidade: c.cidade,
    uf: c.uf,
    credor: c.credor,
    valorDivida: c.valorTotalDivida ?? 0,
    estagio: (c.estagio as Estagio) || 'lead',
    saudeFinanceira: c.saudeFinanceira ?? 50,
    consultor: c.consultor,
    tags: c.tags,
    proximaAcao: c.proximaAcao,
    estagioDesde: c.estagioDesde,
    ultimaAtualizacao: c.ultimaAtualizacao,
  }
}

/** Dias desde YYYY-MM-DD ou ISO. null se inválido. */
function diasDesde(iso?: string): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

/** Dias até próxima ação (negativo = atrasado). null se inválido. */
function diasAte(iso?: string): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((d.getTime() - Date.now()) / 86_400_000)
}

// ────────────────────────────────────────────────────────────
// Fallback Data — vazio por padrão; API é a fonte de verdade.
// ────────────────────────────────────────────────────────────
const FALLBACK_CLIENTES: Cliente[] = []

// ────────────────────────────────────────────────────────────
// Helper: initials from name
// ────────────────────────────────────────────────────────────
function getInitials(nome: string): string {
  const parts = nome.split(' ')
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ────────────────────────────────────────────────────────────
// Mini Health Bar
// ────────────────────────────────────────────────────────────
function HealthBar({ value }: { value: number }) {
  const color =
    value >= 70 ? '#27AE60' : value >= 40 ? '#E67E22' : '#C0392B'

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-aletis-borda/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-body text-aletis-grafite-claro w-7 text-right">
        {value}
      </span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Health Dot (for Kanban cards)
// ────────────────────────────────────────────────────────────
function HealthDot({ value }: { value: number }) {
  const color =
    value >= 70 ? '#27AE60' : value >= 40 ? '#E67E22' : '#C0392B'

  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
      title={`Saúde: ${value}`}
    />
  )
}

// ────────────────────────────────────────────────────────────
// Stage Badge
// ────────────────────────────────────────────────────────────
function StageBadge({ estagio }: { estagio: Estagio }) {
  const cfg = STAGE_CONFIG[estagio] || DEFAULT_STAGE
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-body"
      style={{
        backgroundColor: cfg.color + '18',
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  )
}

// ────────────────────────────────────────────────────────────
// Avatar
// ────────────────────────────────────────────────────────────
function Avatar({ nome, estagio }: { nome: string; estagio: Estagio }) {
  const color = (STAGE_CONFIG[estagio] || DEFAULT_STAGE).color
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold font-body flex-shrink-0"
      style={{ backgroundColor: color }}
    >
      {getInitials(nome)}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Sort Types
// ────────────────────────────────────────────────────────────
type SortKey = 'nome' | 'cidade' | 'credor' | 'valorDivida' | 'estagio' | 'saudeFinanceira' | 'consultor'
type SortDir = 'asc' | 'desc'

// ────────────────────────────────────────────────────────────
// MAIN CRM COMPONENT
// ────────────────────────────────────────────────────────────
export default function CRM() {
  const { data: clientesApi, loading, refetch } = useApi<ClienteApi[]>('/clientes', [])
  const clientes: Cliente[] = useMemo(
    () => (clientesApi && clientesApi.length > 0 ? clientesApi.map(mapApiCliente) : FALLBACK_CLIENTES),
    [clientesApi],
  )
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<'todos' | Estagio>('todos')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('nome')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Novo Cliente modal state
  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [saving, setSaving] = useState(false)
  const [novoCliente, setNovoCliente] = useState({
    nome: '',
    cpfCnpj: '',
    cidade: '',
    uf: '',
    telefone: '',
    email: '',
    culturas: '',
  })

  const updateNovoCliente = (field: string, value: string) => {
    setNovoCliente(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveNovoCliente = async () => {
    if (!novoCliente.nome.trim()) {
      showToast('Nome do cliente é obrigatório', 'warning')
      return
    }
    setSaving(true)
    try {
      await apiFetch('/clientes', {
        method: 'POST',
        body: JSON.stringify({
          nome: novoCliente.nome.trim(),
          cpfCnpj: novoCliente.cpfCnpj.trim(),
          cidade: novoCliente.cidade.trim(),
          uf: novoCliente.uf.trim().toUpperCase(),
          telefone: novoCliente.telefone.trim(),
          email: novoCliente.email.trim(),
          culturas: novoCliente.culturas
            .split(',')
            .map(c => c.trim())
            .filter(Boolean),
          estagio: 'lead',
          consultor: 'Christian Kohler',
        }),
      })
      showToast('Cliente criado com sucesso', 'success')
      setShowNovoCliente(false)
      setNovoCliente({ nome: '', cpfCnpj: '', cidade: '', uf: '', telefone: '', email: '', culturas: '' })
      // Refresh list
      refetch()
    } catch (err) {
      showToast(`Erro ao criar cliente: ${(err as Error).message}`, 'warning')
    } finally {
      setSaving(false)
    }
  }

  // ── Filter + Sort logic ──
  const filteredClientes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    let result = clientes.filter((c) => {
      const matchesSearch =
        !q ||
        c.nome.toLowerCase().includes(q) ||
        c.cidade.toLowerCase().includes(q) ||
        c.credor.toLowerCase().includes(q)
      const matchesStage = stageFilter === 'todos' || c.estagio === stageFilter
      return matchesSearch && matchesStage
    })

    result.sort((a, b) => {
      let valA: string | number = a[sortKey] as string | number
      let valB: string | number = b[sortKey] as string | number
      if (sortKey === 'cidade') {
        valA = `${a.cidade}/${a.uf}`
        valB = `${b.cidade}/${b.uf}`
      }
      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB as string, 'pt-BR')
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number)
    })

    return result
  }, [clientes, searchQuery, stageFilter, sortKey, sortDir])

  // ── Kanban grouping ──
  const kanbanColumns = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return ALL_STAGES.map((stage) => ({
      stage,
      config: STAGE_CONFIG[stage] || DEFAULT_STAGE,
      clients: clientes.filter((c) => {
        const matchesSearch =
          !q ||
          c.nome.toLowerCase().includes(q) ||
          c.cidade.toLowerCase().includes(q) ||
          c.credor.toLowerCase().includes(q)
        return c.estagio === stage && matchesSearch
      }),
    }))
  }, [clientes, searchQuery])

  // ── Column sort handler ──
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function SortIndicator({ column }: { column: SortKey }) {
    if (sortKey !== column) return null
    return (
      <span className="ml-1 text-aletis-dourado">
        {sortDir === 'asc' ? '\u2191' : '\u2193'}
      </span>
    )
  }

  // ── Stats (derivados dos clientes reais — não inventar números) ──
  const stats = useMemo(() => {
    const total = clientes.length
    // "Ativos" = não arquivados/concluídos.
    const ativos = clientes.filter((c) => c.estagio !== 'concluido').length
    const emNegociacao = clientes.filter((c) => c.estagio === 'negociacao').length
    // "Acordos este mês" = clientes que fecharam acordo cuja últimaAtualizacao
    // cai no mês corrente. Sem campo `acordoEm` ainda no domínio.
    const inicioMes = new Date()
    inicioMes.setDate(1)
    inicioMes.setHours(0, 0, 0, 0)
    const acordosMes = clientes.filter((c) => {
      if (c.estagio !== 'acordo' && c.estagio !== 'concluido') return false
      const ts = c.ultimaAtualizacao ? new Date(c.ultimaAtualizacao).getTime() : 0
      return ts >= inicioMes.getTime()
    }).length
    return { total, ativos, emNegociacao, acordosMes }
  }, [clientes])

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* ── Page Header ── */}
      <header className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
              CRM
            </h1>
            <p className="text-aletis-grafite-claro font-body mt-1 text-sm">
              Gestão de clientes e pipeline de negócios
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => {
                if (filteredClientes.length === 0) {
                  showToast('Nenhum cliente para exportar', 'warning')
                  return
                }
                const colunas = ['Nome', 'Cidade', 'UF', 'Credor', 'Dívida (R$)', 'Estágio', 'Saúde Financeira', 'Consultor']
                const linhas = filteredClientes.map(c => [
                  c.nome, c.cidade, c.uf, c.credor,
                  c.valorDivida.toFixed(2).replace('.', ','),
                  STAGE_CONFIG[c.estagio]?.label || c.estagio,
                  c.saudeFinanceira, c.consultor,
                ])
                exportCSV('clientes_aletis', colunas, linhas)
                showToast(`${filteredClientes.length} cliente(s) exportado(s) em CSV`, 'success')
              }}
              className="btn-outline inline-flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
            <button
              onClick={() => setShowNovoCliente(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Novo Cliente
            </button>
          </div>
        </div>
      </header>

      {/* ── Stats Bar — DS KpiTile para alinhamento premium ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile icon={Users} label="Total" value={fmtNum(stats.total)} accent="verde" variant="light" tooltip="Total de clientes cadastrados (qualquer estágio)." />
        <KpiTile icon={Users} label="Ativos" value={fmtNum(stats.ativos)} accent="verde" variant="light" sub="clientes com relacionamento" tooltip="Clientes não-concluídos — ainda em alguma etapa do funil." />
        <KpiTile icon={Users} label="Em negociação" value={fmtNum(stats.emNegociacao)} accent="ambar" variant="light" sub="pipeline ativo" tooltip="Clientes no estágio 'negociação' especificamente — cobrança/acordo em andamento." />
        <KpiTile icon={Users} label="Acordos este mês" value={fmtNum(stats.acordosMes)} accent="dourado" variant="light" tooltip="Clientes que entraram em estágio 'acordo' ou 'concluído' com última atualização no mês corrente." />
      </div>

      {/* ── Toolbar: Search + Filter + View Toggle ── */}
      <div className="card-premium p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro" />
            <input
              type="text"
              placeholder="Buscar por nome, cidade ou credor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10 py-2.5 text-sm"
            />
          </div>

          {/* Stage Filter */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen((f) => !f)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-aletis-borda bg-white text-sm font-body text-aletis-grafite-escuro hover:border-aletis-verde/40 transition-colors"
            >
              <Filter className="w-4 h-4 text-aletis-grafite-claro" />
              <span>
                {stageFilter === 'todos'
                  ? 'Todos os estágios'
                  : (STAGE_CONFIG[stageFilter] || DEFAULT_STAGE).label}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-aletis-grafite-claro" />
            </button>
            {filterOpen && (
              <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl border border-aletis-borda shadow-xl z-20 py-1 animate-fade-in">
                <button
                  onClick={() => {
                    setStageFilter('todos')
                    setFilterOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2 text-sm font-body hover:bg-aletis-bege transition-colors ${
                    stageFilter === 'todos'
                      ? 'text-aletis-verde font-semibold'
                      : 'text-aletis-grafite-escuro'
                  }`}
                >
                  Todos os estágios
                </button>
                {ALL_STAGES.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => {
                      setStageFilter(stage)
                      setFilterOpen(false)
                    }}
                    className={`w-full text-left px-4 py-2 text-sm font-body hover:bg-aletis-bege transition-colors flex items-center gap-2 ${
                      stageFilter === stage
                        ? 'text-aletis-verde font-semibold'
                        : 'text-aletis-grafite-escuro'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: (STAGE_CONFIG[stage] || DEFAULT_STAGE).color }}
                    />
                    {(STAGE_CONFIG[stage] || DEFAULT_STAGE).label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-aletis-bege rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-body transition-all duration-200 ${
                viewMode === 'list'
                  ? 'bg-white text-aletis-verde shadow-sm font-semibold'
                  : 'text-aletis-grafite-claro hover:text-aletis-grafite-escuro'
              }`}
            >
              <List className="w-4 h-4" />
              Lista
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-body transition-all duration-200 ${
                viewMode === 'kanban'
                  ? 'bg-white text-aletis-verde shadow-sm font-semibold'
                  : 'text-aletis-grafite-claro hover:text-aletis-grafite-escuro'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Kanban
            </button>
          </div>
        </div>
      </div>

      {/* ── Close filter dropdown on outside click ── */}
      {filterOpen && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setFilterOpen(false)}
        />
      )}

      {/* ════════════════════════════════════════════════════════
           LIST VIEW
           ════════════════════════════════════════════════════════ */}
      {viewMode === 'list' && (
        <div className="card-premium overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
              <div className="h-full w-full animate-pulse bg-gradient-to-b from-aletis-bege/40 via-white/80 to-aletis-bege/40" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-aletis-borda bg-aletis-bege/50">
                  {[
                    { key: 'nome' as SortKey, label: 'Cliente' },
                    { key: 'cidade' as SortKey, label: 'Cidade/UF' },
                    { key: 'credor' as SortKey, label: 'Credor' },
                    { key: 'valorDivida' as SortKey, label: 'Valor Dívida' },
                    { key: 'estagio' as SortKey, label: 'Estágio' },
                    { key: 'saudeFinanceira' as SortKey, label: 'Saúde Financeira' },
                    { key: 'consultor' as SortKey, label: 'Consultor' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider cursor-pointer select-none hover:text-aletis-verde transition-colors"
                    >
                      {col.label}
                      <SortIndicator column={col.key} />
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                    Aging / Próx. Ação
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredClientes.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-aletis-borda/50 hover:bg-aletis-bege/30 transition-colors duration-150 group"
                  >
                    {/* Cliente */}
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar nome={c.nome} estagio={c.estagio} />
                        <Link
                          to={`/clientes/${c.id}`}
                          className="text-sm font-body font-medium text-aletis-grafite-escuro group-hover:text-aletis-verde transition-colors truncate min-w-0"
                          title={c.nome}
                        >
                          {c.nome}
                        </Link>
                      </div>
                    </td>
                    {/* Cidade/UF */}
                    <td className="px-4 py-3 max-w-[180px]">
                      <div className="flex items-center gap-1.5 text-sm font-body text-aletis-grafite-medio min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-aletis-grafite-claro flex-shrink-0" />
                        <span className="truncate" title={`${c.cidade}/${c.uf}`}>{c.cidade}/{c.uf}</span>
                      </div>
                    </td>
                    {/* Credor */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <div className="flex items-center gap-1.5 text-sm font-body text-aletis-grafite-medio min-w-0">
                        <Building2 className="w-3.5 h-3.5 text-aletis-grafite-claro flex-shrink-0" />
                        <span className="truncate" title={c.credor}>{c.credor}</span>
                      </div>
                    </td>
                    {/* Valor Dívida */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                        {formatBRL(c.valorDivida)}
                      </span>
                    </td>
                    {/* Estágio */}
                    <td className="px-4 py-3">
                      <StageBadge estagio={c.estagio} />
                    </td>
                    {/* Saúde Financeira */}
                    <td className="px-4 py-3">
                      <HealthBar value={c.saudeFinanceira} />
                    </td>
                    {/* Consultor */}
                    <td className="px-4 py-3">
                      <span className="text-sm font-body text-aletis-grafite-medio">
                        {c.consultor}
                      </span>
                    </td>
                    {/* Aging / Próxima Ação */}
                    <td className="px-4 py-3">
                      {(() => {
                        const dias = diasDesde(c.estagioDesde || c.ultimaAtualizacao)
                        const prox = diasAte(c.proximaAcao?.data)
                        return (
                          <div className="flex flex-col gap-1 text-xs font-body">
                            {dias !== null && (
                              <span
                                className={`inline-flex items-center ${
                                  dias < 7
                                    ? 'text-aletis-grafite-claro'
                                    : dias < 30
                                    ? 'text-amber-600'
                                    : 'text-red-600 font-semibold'
                                }`}
                                title={`Último movimento há ${dias} dia(s)`}
                              >
                                {dias < 7 ? '🟢' : dias < 30 ? '🟡' : '🔴'} {dias}d parado
                              </span>
                            )}
                            {prox !== null && c.proximaAcao && (
                              <span
                                className={`inline-flex items-center gap-1 truncate max-w-[180px] ${
                                  prox < 0
                                    ? 'text-red-600 font-semibold'
                                    : prox <= 3
                                    ? 'text-amber-600'
                                    : 'text-aletis-verde'
                                }`}
                                title={c.proximaAcao.descricao}
                              >
                                {prox < 0 ? `⏰ Atr. ${Math.abs(prox)}d` : prox === 0 ? '⏰ Hoje' : `⏰ ${prox}d`}
                                <span className="truncate text-aletis-grafite-medio">— {c.proximaAcao.descricao}</span>
                              </span>
                            )}
                            {c.tags && c.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 max-w-[180px]">
                                {c.tags.slice(0, 2).map((t) => (
                                  <span
                                    key={t}
                                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-aletis-verde/10 text-aletis-verde truncate max-w-[80px]"
                                    title={t}
                                  >
                                    {t}
                                  </span>
                                ))}
                                {c.tags.length > 2 && (
                                  <span className="text-[9px] text-aletis-grafite-claro">+{c.tags.length - 2}</span>
                                )}
                              </div>
                            )}
                            {dias === null && prox === null && (!c.tags || c.tags.length === 0) && (
                              <span className="text-aletis-grafite-claro">—</span>
                            )}
                          </div>
                        )
                      })()}
                    </td>
                    {/* Ações */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          to={`/clientes/${c.id}`}
                          className="p-1.5 rounded-lg hover:bg-aletis-verde/10 text-aletis-grafite-claro hover:text-aletis-verde transition-colors"
                          title="Ver detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => showToast('Opções adicionais em desenvolvimento', 'info')}
                          className="p-1.5 rounded-lg hover:bg-aletis-bege text-aletis-grafite-claro hover:text-aletis-grafite-escuro transition-colors"
                          title="Mais opções"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredClientes.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-sm font-body text-aletis-grafite-claro"
                    >
                      Nenhum cliente encontrado com os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           KANBAN VIEW
           ════════════════════════════════════════════════════════ */}
      {viewMode === 'kanban' && (
        <div className="overflow-x-auto pb-4 relative">
          {loading && (
            <div className="absolute inset-0 bg-white/60 z-10 rounded-xl">
              <div className="h-full w-full animate-pulse bg-gradient-to-b from-aletis-bege/40 via-white/80 to-aletis-bege/40 rounded-xl" />
            </div>
          )}
          <div className="flex gap-4 min-w-max">
            {kanbanColumns.map(({ stage, config, clients }) => (
              <div
                key={stage}
                className="w-[260px] flex-shrink-0 flex flex-col"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: config.color }}
                    />
                    <h3 className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                      {config.label}
                    </h3>
                  </div>
                  <span
                    className="w-6 h-6 rounded-lg text-[11px] font-bold font-body flex items-center justify-center"
                    style={{
                      backgroundColor: config.color + '18',
                      color: config.color,
                    }}
                  >
                    {clients.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 space-y-2.5 bg-aletis-bege/60 rounded-xl p-2.5 min-h-[200px]">
                  {clients.map((c) => (
                    <Link
                      key={c.id}
                      to={`/clientes/${c.id}`}
                      className="block bg-white border border-aletis-borda rounded-xl p-3.5 hover:shadow-lg hover:-translate-y-0.5 hover:border-aletis-verde/30 transition-all duration-200 group/card"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p
                          className="text-sm font-body font-semibold text-aletis-grafite-escuro leading-tight group-hover/card:text-aletis-verde transition-colors min-w-0 line-clamp-2 break-words"
                          title={c.nome}
                        >
                          {c.nome}
                        </p>
                        <div className="flex-shrink-0">
                          <HealthDot value={c.saudeFinanceira} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-body text-aletis-grafite-claro mb-1.5 min-w-0">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate" title={`${c.cidade}/${c.uf}`}>{c.cidade}/{c.uf}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-body text-aletis-grafite-claro mb-2 min-w-0">
                        <Building2 className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate" title={c.credor}>{c.credor}</span>
                      </div>
                      <p className="text-sm font-body font-bold text-aletis-grafite-escuro truncate">
                        {formatBRLCompact(c.valorDivida)}
                      </p>

                      {/* Tags */}
                      {c.tags && c.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {c.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="text-[9px] font-body font-semibold px-1.5 py-0.5 rounded bg-aletis-verde/10 text-aletis-verde border border-aletis-verde/20 truncate max-w-[90px]"
                              title={t}
                            >
                              {t}
                            </span>
                          ))}
                          {c.tags.length > 3 && (
                            <span className="text-[9px] text-aletis-grafite-claro font-body">+{c.tags.length - 3}</span>
                          )}
                        </div>
                      )}

                      {/* Aging + próxima ação */}
                      {(() => {
                        const dias = diasDesde(c.estagioDesde || c.ultimaAtualizacao)
                        const prox = diasAte(c.proximaAcao?.data)
                        if (dias === null && prox === null) return null
                        return (
                          <div className="mt-2 pt-2 border-t border-aletis-borda/50 flex items-center justify-between gap-2 text-[10px] font-body">
                            {dias !== null ? (
                              <span
                                className={`truncate ${
                                  dias < 7
                                    ? 'text-aletis-grafite-claro'
                                    : dias < 30
                                    ? 'text-amber-600'
                                    : 'text-red-600 font-semibold'
                                }`}
                                title="Dias sem atualização do estágio"
                              >
                                {dias}d no estágio
                              </span>
                            ) : <span />}
                            {prox !== null && (
                              <span
                                className={`truncate font-semibold ${
                                  prox < 0
                                    ? 'text-red-600'
                                    : prox <= 3
                                    ? 'text-amber-600'
                                    : 'text-aletis-verde'
                                }`}
                                title={c.proximaAcao?.descricao}
                              >
                                {prox < 0 ? `Atrasado ${Math.abs(prox)}d` : prox === 0 ? 'Hoje' : `Em ${prox}d`}
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </Link>
                  ))}
                  {clients.length === 0 && (
                    <div className="flex items-center justify-center h-24 text-xs font-body text-aletis-grafite-claro">
                      Nenhum cliente
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom spacer */}
      <div className="h-8" />

      {/* ── Novo Cliente Modal ─────────────────────────────── */}
      {showNovoCliente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowNovoCliente(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-aletis-borda">
              <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">Novo Cliente</h2>
              <button onClick={() => setShowNovoCliente(false)} className="p-2 rounded-lg hover:bg-aletis-bege transition-colors">
                <X className="w-5 h-5 text-aletis-grafite-claro" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Nome *</label>
                <input type="text" value={novoCliente.nome} onChange={e => updateNovoCliente('nome', e.target.value)} placeholder="Nome completo ou razão social" className="input-field py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">CPF / CNPJ</label>
                <input type="text" value={novoCliente.cpfCnpj} onChange={e => updateNovoCliente('cpfCnpj', e.target.value)} placeholder="000.000.000-00 ou 00.000.000/0001-00" className="input-field py-2.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Cidade</label>
                  <input type="text" value={novoCliente.cidade} onChange={e => updateNovoCliente('cidade', e.target.value)} placeholder="Ex: Toledo" className="input-field py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">UF</label>
                  <input type="text" value={novoCliente.uf} onChange={e => updateNovoCliente('uf', e.target.value)} placeholder="Ex: PR" maxLength={2} className="input-field py-2.5 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Telefone</label>
                  <input type="text" value={novoCliente.telefone} onChange={e => updateNovoCliente('telefone', e.target.value)} placeholder="(00) 00000-0000" className="input-field py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Email</label>
                  <input type="email" value={novoCliente.email} onChange={e => updateNovoCliente('email', e.target.value)} placeholder="email@exemplo.com" className="input-field py-2.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Culturas</label>
                <input type="text" value={novoCliente.culturas} onChange={e => updateNovoCliente('culturas', e.target.value)} placeholder="Soja, Milho, Algodão (separadas por vírgula)" className="input-field py-2.5 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-aletis-borda">
              <button onClick={() => setShowNovoCliente(false)} className="px-4 py-2 rounded-xl text-sm font-body font-medium text-aletis-grafite-medio hover:bg-aletis-bege transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveNovoCliente} disabled={saving} className="px-6 py-2 rounded-xl text-sm font-body font-medium bg-aletis-verde text-white hover:bg-aletis-verde/90 transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar Cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
