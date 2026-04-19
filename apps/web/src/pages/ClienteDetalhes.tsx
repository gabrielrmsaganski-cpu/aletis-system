import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  MapPin,
  Building2,
  ArrowLeft,
  FileText,
  Send,
  Edit3,
  Phone,
  Mail,
  Calendar,
  Landmark,
  Tractor,
  Wheat,
  DollarSign,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  MessageCircle,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  Handshake,
  CreditCard,
  Eye,
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
  // Aliases do backend — api/routes/clientes.ts usa outro vocabulário
  | 'prospeccao'
  | 'encerrado'

type TabId = 'visao-geral' | 'dividas' | 'propostas' | 'documentos' | 'fluxo-caixa' | 'timeline'

interface Divida {
  id: string
  credor: string
  contrato: string
  modalidade: string
  valorOriginal: number
  valorAtual: number
  taxa: string
  status: 'em_dia' | 'atrasada' | 'renegociada' | 'quitada'
  historicoPagamentos: HistoricoPagamento[]
}

interface HistoricoPagamento {
  data: string
  valor: number
  tipo: string
}

interface TimelineEvent {
  id: string
  tipo: string
  data: string
  titulo: string
  descricao: string
  usuario: string
}

interface ClienteData {
  id: string
  nome: string
  cpfCnpj: string
  cidade: string
  uf: string
  telefone: string
  email: string
  estagio: Estagio
  saudeFinanceira: number
  consultor: string
  propriedade: {
    nome: string
    area: string
    culturas: string[]
    condicao: string
  }
  resumoFinanceiro: {
    totalDivida: number
    totalPago: number
    pendente: number
  }
  dividas: Divida[]
  evolucaoDivida: { mes: string; valor: number }[]
  timeline: TimelineEvent[]
}

// ────────────────────────────────────────────────────────────
// Stage Config
// ────────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  lead: { label: 'Lead', color: '#6B7280' },
  qualificacao: { label: 'Qualificação', color: '#3B82F6' },
  analise: { label: 'Análise', color: '#8B5CF6' },
  proposta: { label: 'Proposta', color: '#C9A84C' },
  negociacao: { label: 'Negociação', color: '#E67E22' },
  acordo: { label: 'Acordo', color: '#27AE60' },
  acompanhamento: { label: 'Acompanhamento', color: '#0F4C35' },
  concluido: { label: 'Concluído', color: '#1B6B4A' },
  // Aliases do backend (api/routes/clientes.ts usa outro vocabulário)
  prospeccao: { label: 'Prospecção', color: '#6B7280' },
  encerrado: { label: 'Encerrado', color: '#1B6B4A' },
}

const FALLBACK_STAGE = { label: 'Lead', color: '#6B7280' }

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
// Mock Data — Ailton Caeiro (primary)
// ────────────────────────────────────────────────────────────
const ailtonData: ClienteData = {
  id: 'ailton-caeiro',
  nome: 'Ailton Caeiro',
  cpfCnpj: '123.456.789-00',
  cidade: 'Toledo',
  uf: 'PR',
  telefone: '(45) 99912-3456',
  email: 'ailton.caeiro@email.com',
  estagio: 'proposta',
  saudeFinanceira: 42,
  consultor: 'Christian Kohler',
  propriedade: {
    nome: 'Fazenda Santa Clara',
    area: '480 hectares',
    culturas: ['Soja', 'Milho safrinha', 'Trigo'],
    condicao: 'Produtiva com restrições hídricas pontuais na safrinha 2025',
  },
  resumoFinanceiro: {
    totalDivida: 2_200_000,
    totalPago: 380_000,
    pendente: 1_820_000,
  },
  dividas: [
    {
      id: 'div-01',
      credor: 'Sicoob',
      contrato: 'CRE-2022/04512',
      modalidade: 'Custeio Agrícola',
      valorOriginal: 850_000,
      valorAtual: 1_020_000,
      taxa: 'INPC + 5,5% a.a.',
      status: 'atrasada',
      historicoPagamentos: [
        { data: '15/03/2023', valor: 85_000, tipo: 'Parcela' },
        { data: '15/06/2023', valor: 85_000, tipo: 'Parcela' },
        { data: '15/09/2023', valor: 42_500, tipo: 'Parcela parcial' },
      ],
    },
    {
      id: 'div-02',
      credor: 'Sicoob',
      contrato: 'CRE-2023/01287',
      modalidade: 'Investimento (Pronaf)',
      valorOriginal: 420_000,
      valorAtual: 480_000,
      taxa: 'Selic + 2,0% a.a.',
      status: 'renegociada',
      historicoPagamentos: [
        { data: '10/01/2024', valor: 60_000, tipo: 'Parcela' },
        { data: '10/04/2024', valor: 60_000, tipo: 'Parcela' },
      ],
    },
    {
      id: 'div-03',
      credor: 'Banco do Brasil',
      contrato: 'BB-2021/78943',
      modalidade: 'Comercialização',
      valorOriginal: 320_000,
      valorAtual: 410_000,
      taxa: '8,75% a.a. pré-fixada',
      status: 'atrasada',
      historicoPagamentos: [
        { data: '20/07/2022', valor: 47_500, tipo: 'Parcela' },
      ],
    },
    {
      id: 'div-04',
      credor: 'Fertipar',
      contrato: 'FERT-2024/00231',
      modalidade: 'Crédito Fornecedor (Insumos)',
      valorOriginal: 180_000,
      valorAtual: 195_000,
      taxa: 'IPCA + 4,0% a.a.',
      status: 'em_dia',
      historicoPagamentos: [],
    },
    {
      id: 'div-05',
      credor: 'Cresol',
      contrato: 'CR-2020/33210',
      modalidade: 'Capital de Giro',
      valorOriginal: 65_000,
      valorAtual: 95_000,
      taxa: 'CDI + 3,5% a.a.',
      status: 'atrasada',
      historicoPagamentos: [],
    },
  ],
  evolucaoDivida: [
    { mes: 'Jan/24', valor: 1_750_000 },
    { mes: 'Mar/24', valor: 1_820_000 },
    { mes: 'Mai/24', valor: 1_890_000 },
    { mes: 'Jul/24', valor: 1_960_000 },
    { mes: 'Set/24', valor: 2_010_000 },
    { mes: 'Nov/24', valor: 2_080_000 },
    { mes: 'Jan/25', valor: 2_120_000 },
    { mes: 'Mar/25', valor: 2_150_000 },
    { mes: 'Mai/25', valor: 2_170_000 },
    { mes: 'Jul/25', valor: 2_180_000 },
    { mes: 'Set/25', valor: 2_190_000 },
    { mes: 'Dez/25', valor: 2_200_000 },
  ],
  timeline: [
    {
      id: 'ev-01',
      tipo: 'contato_inicial',
      data: '12/01/2025',
      titulo: 'Primeiro contato realizado',
      descricao:
        'Cliente fez contato via indicação do Sicoob Toledo. Relata dificuldades em honrar parcelas desde a safrinha 2024.',
      usuario: 'Christian Kohler',
    },
    {
      id: 'ev-02',
      tipo: 'documento_recebido',
      data: '20/01/2025',
      titulo: 'Documentação recebida',
      descricao:
        'Recebidos 5 contratos, extrato patrimonial, CCIR e declaração de ITR. Pendente: balancete da cooperativa.',
      usuario: 'Ana Beatriz Lima',
    },
    {
      id: 'ev-03',
      tipo: 'reuniao',
      data: '05/02/2025',
      titulo: 'Reunião presencial em Toledo/PR',
      descricao:
        'Visita à Fazenda Santa Clara. Constatada boa infraestrutura, com silos próprios e mecanização completa. Área irrigada: 120ha.',
      usuario: 'Christian Kohler',
    },
    {
      id: 'ev-04',
      tipo: 'analise',
      data: '18/02/2025',
      titulo: 'Análise financeira concluída',
      descricao:
        'Dívida total apurada: R$ 2,2M. Capacidade de pagamento estimada: R$ 35K/mês em período de entressafra, R$ 90K/mês após colheita.',
      usuario: 'Rafael Teixeira',
    },
    {
      id: 'ev-05',
      tipo: 'proposta_gerada',
      data: '10/03/2025',
      titulo: 'Proposta de reestruturação gerada',
      descricao:
        'Proposta contempla consolidação das dívidas Sicoob + BB com prazo de 8 anos, carência de 12 meses e taxa renegociada a INPC + 3,8% a.a.',
      usuario: 'Christian Kohler',
    },
    {
      id: 'ev-06',
      tipo: 'reuniao',
      data: '25/03/2025',
      titulo: 'Reunião com gerente Sicoob',
      descricao:
        'Apresentação da proposta ao gerente regional. Feedback positivo. Pendente: aprovação do comitê de crédito.',
      usuario: 'Christian Kohler',
    },
    {
      id: 'ev-07',
      tipo: 'pagamento',
      data: '02/04/2025',
      titulo: 'Pagamento parcial efetuado',
      descricao:
        'Cliente efetuou pagamento de R$ 47.500 referente a parcela atrasada do contrato BB-2021/78943, demonstrando boa-fé na negociação.',
      usuario: 'Ana Beatriz Lima',
    },
  ],
}

const genericData: ClienteData = {
  id: 'generic',
  nome: 'Cliente Exemplo',
  cpfCnpj: '000.000.000-00',
  cidade: 'Cidade',
  uf: 'UF',
  telefone: '(00) 00000-0000',
  email: 'cliente@email.com',
  estagio: 'lead',
  saudeFinanceira: 50,
  consultor: 'Consultor',
  propriedade: {
    nome: 'Fazenda Exemplo',
    area: '200 hectares',
    culturas: ['Soja', 'Milho'],
    condicao: 'Boa',
  },
  resumoFinanceiro: {
    totalDivida: 500_000,
    totalPago: 100_000,
    pendente: 400_000,
  },
  dividas: [
    {
      id: 'div-gen-01',
      credor: 'Banco X',
      contrato: 'CTR-001',
      modalidade: 'Custeio Agrícola',
      valorOriginal: 300_000,
      valorAtual: 350_000,
      taxa: '10% a.a.',
      status: 'em_dia',
      historicoPagamentos: [
        { data: '01/01/2025', valor: 50_000, tipo: 'Parcela' },
      ],
    },
    {
      id: 'div-gen-02',
      credor: 'Fornecedor Y',
      contrato: 'CTR-002',
      modalidade: 'Crédito Fornecedor',
      valorOriginal: 200_000,
      valorAtual: 150_000,
      taxa: '8% a.a.',
      status: 'em_dia',
      historicoPagamentos: [
        { data: '01/03/2025', valor: 50_000, tipo: 'Parcela' },
      ],
    },
  ],
  evolucaoDivida: [
    { mes: 'Jan/25', valor: 480_000 },
    { mes: 'Mar/25', valor: 500_000 },
    { mes: 'Mai/25', valor: 490_000 },
    { mes: 'Jul/25', valor: 470_000 },
    { mes: 'Set/25', valor: 450_000 },
    { mes: 'Dez/25', valor: 400_000 },
  ],
  timeline: [
    {
      id: 'ev-gen-01',
      tipo: 'contato_inicial',
      data: '01/01/2025',
      titulo: 'Primeiro contato',
      descricao: 'Cliente entrou em contato buscando assessoria.',
      usuario: 'Consultor',
    },
  ],
}

// ────────────────────────────────────────────────────────────
// Circular Health Gauge (SVG)
// ────────────────────────────────────────────────────────────
function HealthGauge({ value, size = 80 }: { value: number; size?: number }) {
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = (value / 100) * circumference
  const color = value >= 70 ? '#27AE60' : value >= 40 ? '#E67E22' : '#C0392B'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E2DDD5"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-[1.5s] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-display font-bold" style={{ color }}>
          {value}
        </span>
        <span className="text-[9px] font-body text-aletis-grafite-claro -mt-0.5">saúde</span>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Stage Badge
// ────────────────────────────────────────────────────────────
function StageBadge({ estagio, large }: { estagio: Estagio; large?: boolean }) {
  const cfg = STAGE_CONFIG[estagio] || FALLBACK_STAGE
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold font-body ${
        large ? 'px-4 py-1.5 text-sm' : 'px-2.5 py-0.5 text-[11px]'
      }`}
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
// Debt Status Badge
// ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    em_dia: { label: 'Em dia', bg: '#27AE6018', text: '#27AE60' },
    atrasada: { label: 'Atrasada', bg: '#C0392B18', text: '#C0392B' },
    renegociada: { label: 'Renegociada', bg: '#3B82F618', text: '#3B82F6' },
    quitada: { label: 'Quitada', bg: '#0F4C3518', text: '#0F4C35' },
  }
  const cfg = map[status] || { label: status, bg: '#6B728018', text: '#6B7280' }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-body"
      style={{ backgroundColor: cfg.bg, color: cfg.text }}
    >
      {cfg.label}
    </span>
  )
}

// ────────────────────────────────────────────────────────────
// Timeline Icon Mapper
// ────────────────────────────────────────────────────────────
function TimelineIcon({ tipo }: { tipo: string }) {
  const iconMap: Record<string, { icon: React.ElementType; color: string }> = {
    contato_inicial: { icon: Phone, color: '#3B82F6' },
    documento_recebido: { icon: FileCheck, color: '#8B5CF6' },
    reuniao: { icon: User, color: '#E67E22' },
    analise: { icon: Eye, color: '#6B7280' },
    proposta_gerada: { icon: Send, color: '#C9A84C' },
    pagamento: { icon: DollarSign, color: '#27AE60' },
    acordo: { icon: Handshake, color: '#0F4C35' },
  }
  const cfg = iconMap[tipo] || { icon: Calendar, color: '#6B7280' }
  const Icon = cfg.icon

  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: cfg.color + '18' }}
    >
      <Icon className="w-4 h-4" style={{ color: cfg.color }} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Custom Tooltip for Chart
// ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-aletis-grafite-escuro text-white px-4 py-3 rounded-xl shadow-xl border border-white/10">
      <p className="text-xs text-white/60 font-body mb-1">{label}</p>
      <p className="text-base font-display font-semibold text-aletis-dourado-suave">
        {formatBRL(payload[0].value)}
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Tab Definitions
// ────────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string }[] = [
  { id: 'visao-geral', label: 'Visão Geral' },
  { id: 'dividas', label: 'Dívidas' },
  { id: 'propostas', label: 'Propostas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'fluxo-caixa', label: 'Fluxo de Caixa' },
  { id: 'timeline', label: 'Timeline' },
]

// ────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────
export default function ClienteDetalhes() {
  const { id } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState<TabId>('visao-geral')
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null)
  const [apiCliente, setApiCliente] = useState<ClienteData | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ telefone: '', email: '', estagio: '' })
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()

  // Try to fetch from backend API
  useEffect(() => {
    if (!id) return
    // Map URL id formats to API ids
    const apiId = id === 'ailton-caeiro' ? 'cli-001' : id === 'paulo-luciano' ? 'cli-002' : id
    apiFetch<any>(`/clientes/${apiId}`)
      .then(data => {
        if (data && data.nome) {
          // Backend usa vocabulário diferente para status de dívida; mapeia p/ o do UI.
          const debtStatusMap: Record<string, Divida['status']> = {
            ativa: 'atrasada',
            em_acordo: 'renegociada',
            renegociada: 'renegociada',
            paga: 'quitada',
            em_dia: 'em_dia',
            atrasada: 'atrasada',
            quitada: 'quitada',
          }
          const mappedDividas: Divida[] = Array.isArray(data.dividas)
            ? data.dividas.map((d: any, idx: number): Divida => ({
                id: d.id || `div-${idx}`,
                credor: d.credor || '—',
                contrato: d.contrato || '—',
                modalidade: d.modalidade || 'Crédito Rural',
                valorOriginal: Number(d.valorOriginal) || 0,
                // Backend grava `valorAtualizado`, UI espera `valorAtual`
                valorAtual: Number(d.valorAtual ?? d.valorAtualizado) || 0,
                taxa: d.taxa || '—',
                status: debtStatusMap[d.status] || 'em_dia',
                historicoPagamentos: Array.isArray(d.historicoPagamentos) ? d.historicoPagamentos : [],
              }))
            : []

          // Backend timeline: {data, tipo, descricao, detalhes?}; UI espera {id, titulo, usuario, ...}
          const mappedTimeline: TimelineEvent[] = Array.isArray(data.timeline)
            ? data.timeline.map((t: any, idx: number): TimelineEvent => ({
                id: t.id || `ev-${idx}`,
                tipo: t.tipo || 'analise',
                data: t.data || '',
                titulo: t.titulo || (t.descricao ? String(t.descricao).slice(0, 80) : 'Evento'),
                descricao: t.detalhes || t.descricao || '',
                usuario: t.usuario || data.consultor || 'Sistema',
              }))
            : []

          const areaLabel = data.car?.areaImovel
            ? `${Number(data.car.areaImovel).toLocaleString('pt-BR')} ha`
            : data.areaTotalHa
              ? `${data.areaTotalHa} hectares`
              : '—'
          const condicao = data.observacoes || data.car?.condicaoCadastro || 'Em análise'

          const mapped: ClienteData = {
            id: data.id,
            nome: data.nome,
            cpfCnpj: data.cpfCnpj || '---',
            cidade: data.cidade,
            uf: data.uf,
            telefone: data.telefone || '(--) -----',
            email: data.email || '',
            estagio: data.estagio || 'lead',
            saudeFinanceira: data.saudeFinanceira ?? 50,
            consultor: data.consultor || 'Não atribuído',
            propriedade: data.propriedade || {
              nome: data.car?.codImovel ? `CAR ${data.car.codImovel}` : data.nome,
              area: areaLabel,
              culturas: Array.isArray(data.culturas) ? data.culturas : [],
              condicao,
            },
            resumoFinanceiro: data.resumoFinanceiro || {
              totalDivida: Number(data.valorTotalDivida) || 0,
              totalPago: Number(data.valorTotalPago) || 0,
              pendente: (Number(data.valorTotalDivida) || 0) - (Number(data.valorTotalPago) || 0),
            },
            dividas: mappedDividas,
            evolucaoDivida: Array.isArray(data.evolucaoDivida) ? data.evolucaoDivida : [],
            timeline: mappedTimeline,
          }
          setApiCliente(mapped)
        }
      })
      .catch(() => { /* fallback to inline data */ })
  }, [id])

  // Resolve client data — prefer API, fallback to inline
  const cliente: ClienteData = useMemo(() => {
    if (apiCliente) return apiCliente
    if (id === 'ailton-caeiro' || id === 'cli-001') return ailtonData
    return { ...genericData, id: id || 'unknown' }
  }, [id, apiCliente])

  const stageCfg = STAGE_CONFIG[cliente.estagio] || FALLBACK_STAGE

  // ── Action Handlers (defined after cliente is available) ──
  const handleGerarProposta = useCallback(() => {
    navigate('/propostas')
  }, [navigate])

  const handleEnviarWhatsApp = useCallback(() => {
    const phone = cliente.telefone.replace(/\D/g, '')
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`
    const msg = encodeURIComponent(`Olá ${cliente.nome}, aqui é a ALETIS Assessoria. Gostaríamos de conversar sobre sua reestruturação financeira.`)
    window.open(`https://wa.me/${fullPhone}?text=${msg}`, '_blank')
    showToast(`WhatsApp aberto para ${cliente.nome}`, 'success')
  }, [cliente, showToast])

  const handleEditarCliente = useCallback(() => {
    setEditForm({
      telefone: cliente.telefone,
      email: cliente.email,
      estagio: cliente.estagio,
    })
    setShowEditModal(true)
  }, [cliente])

  const handleSaveEdit = useCallback(async () => {
    const apiId = id === 'ailton-caeiro' ? 'cli-001' : id === 'paulo-luciano' ? 'cli-002' : id
    try {
      setSaving(true)
      await apiFetch(`/clientes/${apiId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          telefone: editForm.telefone,
          email: editForm.email,
          estagio: editForm.estagio,
        }),
      })
      showToast('Cliente atualizado com sucesso', 'success')
      setShowEditModal(false)
      setApiCliente(prev => prev ? { ...prev, telefone: editForm.telefone, email: editForm.email, estagio: editForm.estagio as Estagio } : prev)
    } catch (err) {
      showToast(`Erro ao salvar: ${(err as Error).message}`, 'warning')
    } finally {
      setSaving(false)
    }
  }, [id, editForm, showToast])

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* ── Back Link ── */}
      <div className="mb-4">
        <Link
          to="/crm"
          className="inline-flex items-center gap-1.5 text-sm font-body text-aletis-grafite-claro hover:text-aletis-verde transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao CRM
        </Link>
      </div>

      {/* ════════════════════════════════════════════════════════
           HEADER SECTION
           ════════════════════════════════════════════════════════ */}
      <div className="card-premium p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          {/* Left: Client Info */}
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-display font-bold flex-shrink-0"
              style={{ backgroundColor: stageCfg.color }}
            >
              {cliente.nome
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
                {cliente.nome}
              </h1>
              <p className="text-sm font-body text-aletis-grafite-claro mt-0.5">
                CPF/CNPJ: {cliente.cpfCnpj}
              </p>
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-sm font-body text-aletis-grafite-medio">
                  <MapPin className="w-3.5 h-3.5 text-aletis-grafite-claro" />
                  {cliente.cidade}/{cliente.uf}
                </span>
                <span className="flex items-center gap-1.5 text-sm font-body text-aletis-grafite-medio">
                  <Phone className="w-3.5 h-3.5 text-aletis-grafite-claro" />
                  {cliente.telefone}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <StageBadge estagio={cliente.estagio} large />
              </div>
            </div>
          </div>

          {/* Right: Gauge + Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <HealthGauge value={cliente.saudeFinanceira} size={80} />
            <div className="flex flex-wrap gap-2">
              <button onClick={handleGerarProposta} className="btn-gold inline-flex items-center gap-2 text-sm px-4 py-2.5">
                <FileText className="w-4 h-4" />
                Gerar Proposta
              </button>
              <button onClick={handleEnviarWhatsApp} className="btn-outline inline-flex items-center gap-2 text-sm px-4 py-2.5">
                <MessageCircle className="w-4 h-4" />
                Enviar WhatsApp
              </button>
              <button onClick={handleEditarCliente} className="btn-outline inline-flex items-center gap-2 text-sm px-4 py-2.5">
                <Edit3 className="w-4 h-4" />
                Editar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
           TAB NAVIGATION
           ════════════════════════════════════════════════════════ */}
      <div className="border-b border-aletis-borda mb-6">
        <nav className="flex gap-0 overflow-x-auto" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-body font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
                activeTab === tab.id
                  ? 'border-aletis-verde text-aletis-verde'
                  : 'border-transparent text-aletis-grafite-claro hover:text-aletis-grafite-escuro hover:border-aletis-borda'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ════════════════════════════════════════════════════════
           TAB: VISAO GERAL
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'visao-geral' && (
        <div className="space-y-6 animate-fade-in">
          {/* Info Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Dados Pessoais */}
            <div className="card-premium p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-aletis-verde" />
                </div>
                <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                  Dados Pessoais
                </h3>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    Nome
                  </p>
                  <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                    {cliente.nome}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    CPF/CNPJ
                  </p>
                  <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                    {cliente.cpfCnpj}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    Telefone
                  </p>
                  <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                    {cliente.telefone}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    Email
                  </p>
                  <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                    {cliente.email}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    Consultor
                  </p>
                  <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                    {cliente.consultor}
                  </p>
                </div>
              </div>
            </div>

            {/* Propriedade Rural */}
            <div className="card-premium p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-lg bg-aletis-dourado/10 flex items-center justify-center">
                  <Tractor className="w-4 h-4 text-aletis-dourado" />
                </div>
                <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                  Propriedade Rural
                </h3>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    Nome
                  </p>
                  <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                    {cliente.propriedade.nome}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    Área
                  </p>
                  <p className="text-sm font-body font-medium text-aletis-grafite-escuro">
                    {cliente.propriedade.area}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    Culturas
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {cliente.propriedade.culturas.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-aletis-verde/10 text-aletis-verde text-[11px] font-semibold font-body"
                      >
                        <Wheat className="w-3 h-3" />
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    Condição
                  </p>
                  <p className="text-sm font-body text-aletis-grafite-medio leading-relaxed">
                    {cliente.propriedade.condicao}
                  </p>
                </div>
              </div>
            </div>

            {/* Resumo Financeiro */}
            <div className="card-premium p-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-lg bg-alerta/10 flex items-center justify-center">
                  <Landmark className="w-4 h-4 text-alerta" />
                </div>
                <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                  Resumo Financeiro
                </h3>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-aletis-borda/50">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-alerta" />
                    <span className="text-sm font-body text-aletis-grafite-medio">
                      Total Dívida
                    </span>
                  </div>
                  <span className="text-lg font-display font-bold text-alerta">
                    {formatBRL(cliente.resumoFinanceiro.totalDivida)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-aletis-borda/50">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-positivo" />
                    <span className="text-sm font-body text-aletis-grafite-medio">
                      Total Pago
                    </span>
                  </div>
                  <span className="text-lg font-display font-bold text-positivo">
                    {formatBRL(cliente.resumoFinanceiro.totalPago)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-ambar" />
                    <span className="text-sm font-body text-aletis-grafite-medio">
                      Pendente
                    </span>
                  </div>
                  <span className="text-lg font-display font-bold text-ambar">
                    {formatBRL(cliente.resumoFinanceiro.pendente)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Debt Evolution Chart */}
          <div className="card-premium p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
                  Evolução da Dívida
                </h3>
                <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
                  Saldo devedor acumulado ao longo do tempo
                </p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={cliente.evolucaoDivida}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2DDD5" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6B6B6B', fontSize: 11, fontFamily: 'Inter' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6B6B6B', fontSize: 11, fontFamily: 'Inter' }}
                    tickFormatter={(v) => formatBRLCompact(v)}
                    width={75}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="#C0392B"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#C0392B', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#C0392B', strokeWidth: 2, stroke: '#fff' }}
                    animationDuration={1500}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: DIVIDAS
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'dividas' && (
        <div className="space-y-4 animate-fade-in">
          <div className="card-premium overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-aletis-borda bg-aletis-bege/50">
                    <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider w-8" />
                    <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                      Credor
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                      Contrato
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                      Modalidade
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                      Valor Original
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                      Valor Atual
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                      Taxa
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cliente.dividas.map((d) => {
                    const isExpanded = expandedDebt === d.id
                    return (
                      <React.Fragment key={d.id}>
                        <tr
                          className="border-b border-aletis-borda/50 hover:bg-aletis-bege/30 transition-colors duration-150 cursor-pointer"
                          onClick={() =>
                            setExpandedDebt(isExpanded ? null : d.id)
                          }
                        >
                          <td className="px-4 py-3">
                            <ChevronRight
                              className={`w-4 h-4 text-aletis-grafite-claro transition-transform duration-200 ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-aletis-grafite-claro" />
                              <span className="text-sm font-body font-medium text-aletis-grafite-escuro">
                                {d.credor}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-body text-aletis-grafite-medio font-mono">
                              {d.contrato}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-body text-aletis-grafite-medio">
                              {d.modalidade}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-body text-aletis-grafite-escuro">
                              {formatBRL(d.valorOriginal)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                              {formatBRL(d.valorAtual)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-body text-aletis-grafite-medio">
                              {d.taxa}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={d.status} />
                          </td>
                        </tr>
                        {/* Expanded: Payment History */}
                        {isExpanded && (
                          <tr className="bg-aletis-bege/40">
                            <td colSpan={8} className="px-8 py-4">
                              <div className="mb-2">
                                <h4 className="text-sm font-body font-semibold text-aletis-grafite-escuro flex items-center gap-2">
                                  <CreditCard className="w-4 h-4 text-aletis-verde" />
                                  Histórico de Pagamentos
                                </h4>
                              </div>
                              {d.historicoPagamentos.length > 0 ? (
                                <div className="space-y-2">
                                  {d.historicoPagamentos.map((p, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-4 py-2 px-3 bg-white rounded-lg border border-aletis-borda/50"
                                    >
                                      <span className="text-xs font-body text-aletis-grafite-claro w-24">
                                        {p.data}
                                      </span>
                                      <span className="text-sm font-body font-semibold text-positivo">
                                        {formatBRL(p.valor)}
                                      </span>
                                      <span className="text-xs font-body text-aletis-grafite-medio">
                                        {p.tipo}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm font-body text-aletis-grafite-claro italic">
                                  Nenhum pagamento registrado para este contrato.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary Footer */}
          <div className="card-premium p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                  Total Original
                </p>
                <p className="text-lg font-display font-bold text-aletis-grafite-escuro">
                  {formatBRL(cliente.dividas.reduce((s, d) => s + d.valorOriginal, 0))}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                  Total Atualizado
                </p>
                <p className="text-lg font-display font-bold text-alerta">
                  {formatBRL(cliente.dividas.reduce((s, d) => s + d.valorAtual, 0))}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                  Acréscimo
                </p>
                <p className="text-lg font-display font-bold text-ambar">
                  +
                  {formatBRL(
                    cliente.dividas.reduce((s, d) => s + d.valorAtual, 0) -
                      cliente.dividas.reduce((s, d) => s + d.valorOriginal, 0)
                  )}
                </p>
              </div>
            </div>
            <div className="text-sm font-body text-aletis-grafite-claro">
              {cliente.dividas.length} contrato{cliente.dividas.length !== 1 ? 's' : ''} registrado
              {cliente.dividas.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: PROPOSTAS (placeholder)
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'propostas' && (
        <div className="card-premium p-12 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-aletis-dourado/10 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-aletis-dourado" />
          </div>
          <h3 className="text-lg font-display font-semibold text-aletis-grafite-escuro mb-2">
            Propostas de Reestruturação
          </h3>
          <p className="text-sm font-body text-aletis-grafite-claro max-w-md mx-auto">
            As propostas geradas para este cliente serão exibidas aqui. Clique em "Gerar Proposta"
            para iniciar uma nova análise de reestruturação.
          </p>
          <button onClick={handleGerarProposta} className="btn-gold mt-6 inline-flex items-center gap-2 text-sm">
            <Send className="w-4 h-4" />
            Gerar Nova Proposta
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: DOCUMENTOS (placeholder)
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'documentos' && (
        <div className="card-premium p-12 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-aletis-verde/10 flex items-center justify-center mx-auto mb-4">
            <FileCheck className="w-8 h-8 text-aletis-verde" />
          </div>
          <h3 className="text-lg font-display font-semibold text-aletis-grafite-escuro mb-2">
            Documentos do Cliente
          </h3>
          <p className="text-sm font-body text-aletis-grafite-claro max-w-md mx-auto">
            Contratos, extratos, CCIR, ITR e demais documentos do cliente serão gerenciados nesta
            área.
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: FLUXO DE CAIXA (placeholder)
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'fluxo-caixa' && (
        <div className="card-premium p-12 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-positivo/10 flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-8 h-8 text-positivo" />
          </div>
          <h3 className="text-lg font-display font-semibold text-aletis-grafite-escuro mb-2">
            Fluxo de Caixa
          </h3>
          <p className="text-sm font-body text-aletis-grafite-claro max-w-md mx-auto">
            Projeção de receitas da safra versus obrigações financeiras. Em desenvolvimento.
          </p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: TIMELINE
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'timeline' && (
        <div className="space-y-0 animate-fade-in">
          {cliente.timeline.map((event, i) => (
            <div key={event.id} className="flex gap-4 group">
              {/* Timeline Line + Icon */}
              <div className="flex flex-col items-center">
                <TimelineIcon tipo={event.tipo} />
                {i < cliente.timeline.length - 1 && (
                  <div className="w-px flex-1 bg-aletis-borda min-h-[24px]" />
                )}
              </div>

              {/* Content Card */}
              <div className="flex-1 pb-6">
                <div className="card-premium p-4 hover:shadow-xl transition-shadow duration-200">
                  <div className="flex items-start justify-between mb-1.5">
                    <h4 className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                      {event.titulo}
                    </h4>
                    <span className="text-[11px] font-body text-aletis-grafite-claro whitespace-nowrap ml-3 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {event.data}
                    </span>
                  </div>
                  <p className="text-sm font-body text-aletis-grafite-medio leading-relaxed mb-2">
                    {event.descricao}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs font-body text-aletis-grafite-claro">
                    <User className="w-3 h-3" />
                    {event.usuario}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {cliente.timeline.length === 0 && (
            <div className="card-premium p-12 text-center">
              <p className="text-sm font-body text-aletis-grafite-claro">
                Nenhum evento registrado na timeline.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Bottom spacer */}
      <div className="h-8" />

      {/* ── Edit Client Modal ────────────────────────────── */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-aletis-borda">
              <h2 className="text-lg font-display font-bold text-aletis-grafite-escuro">Editar Cliente</h2>
              <button onClick={() => setShowEditModal(false)} className="p-2 rounded-lg hover:bg-aletis-bege transition-colors text-aletis-grafite-claro">
                &times;
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Nome</label>
                <input type="text" value={cliente.nome} disabled className="input-field py-2.5 text-sm bg-gray-50 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Telefone</label>
                <input type="text" value={editForm.telefone} onChange={e => setEditForm(prev => ({ ...prev, telefone: e.target.value }))} className="input-field py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))} className="input-field py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-body font-semibold text-aletis-grafite-medio uppercase tracking-wider mb-1.5">Estágio</label>
                <select value={editForm.estagio} onChange={e => setEditForm(prev => ({ ...prev, estagio: e.target.value }))} className="input-field py-2.5 text-sm appearance-none cursor-pointer">
                  {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-aletis-borda">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 rounded-xl text-sm font-body font-medium text-aletis-grafite-medio hover:bg-aletis-bege transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="px-6 py-2 rounded-xl text-sm font-body font-medium bg-aletis-verde text-white hover:bg-aletis-verde/90 transition-colors disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
