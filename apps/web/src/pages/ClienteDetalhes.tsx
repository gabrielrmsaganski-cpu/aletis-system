import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import PatrimonioTab from '../components/patrimonio/PatrimonioTab'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { MapThumbnail } from '../components/MapThumbnail'
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
  Filter,
  StickyNote,
  Trash2,
  Tag,
  Sparkles,
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

type TabId = 'visao-geral' | 'dividas' | 'risco' | 'exposicao' | 'patrimonio' | 'visitas' | 'propostas' | 'documentos' | 'fluxo-caixa' | 'timeline' | 'portal-chat'

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
  vencimento?: string
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

interface EnderecoRico {
  cep?: string
  formatado?: string
  cidade?: string
  uf?: string
  logradouro?: string
  bairro?: string
  coordenadas?: { lat: number; lng: number; source?: string }
  fonte?: string
}

interface ClimaAgro {
  lat: number
  lng: number
  periodo: { inicio: string; fim: string }
  tempMediaAnualC: number | null
  chuvaAcumuladaAnualMm: number | null
  radiacaoMediaDiariaMjM2: number | null
  umidadeRelativaMediaPct: number | null
  mensais: Array<{ anoMes: string; tempMediaC: number | null; chuvaMmTotal: number | null }>
  fonte: string
}

interface ProducaoMunicipal {
  codigoMunicipioIbge: number
  anoReferencia: string
  culturas: Array<{ cultura: string; tipo: 'temporaria' | 'permanente'; valorMilReais: number; anoReferencia: string }>
  rebanho: Array<{ especie: string; cabecas: number; anoReferencia: string }>
  valorTotalLavouraMilReais: number
  fonte: string
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
  endereco?: EnderecoRico
  clima?: ClimaAgro
  producaoMunicipal?: ProducaoMunicipal
  areaTotalHa?: number
  car?: { areaImovel?: number; codImovel?: string; municipio?: string; uf?: string }
}

// ── Tipos auxiliares (novos endpoints) ──────────────────────
interface SraiResult {
  scoreTotal: number
  classificacao: 'baixo' | 'moderado' | 'alto' | 'critico'
  componentes: { financeiro: number; operacional: number; climatico: number; relacionamento: number }
  alertas: string[]
  recomendacoes: string[]
  versao: string
}

interface AbsResult {
  elegivel: boolean
  nivelElegibilidade: 'integral' | 'parcial' | 'condicional' | 'inelegivel'
  scorePercentual: number
  checkpoints: Array<{
    item: string
    descricao: string
    status: 'ok' | 'pendente' | 'falha' | 'nao_aplicavel'
    detalhes?: string
    fundamentacao: string
  }>
  taxasEstimadasPct: { min: number; max: number }
  acoesRecomendadas: string[]
  fundamentacaoGeral: string
  versao: string
}

// Snapshot do AutoCalcOrchestrator (Cliente Inteligente — Fase 1).
// Shape em espelho de `apps/api/src/services/cliente/types.ts`.
interface AnaliseCliente {
  inputHash: string
  geradoEm: string
  versao: string
  duracaoMs: number
  srai: (SraiResult & { input: unknown }) | null
  abs: (AbsResult & { input: unknown }) | null
  saldoRecalculado: {
    taxaMensalPadrao: number
    dataCorte: string
    totalValorOriginal: number
    totalValorAtualizado: number
    totalSaldoRecalculado: number
    totalJurosAcumulados: number
    porDivida: Array<{
      contrato: string
      credor: string
      valorOriginal: number
      valorAtualizado: number
      saldoRecalculado: number
      jurosAcumulados: number
      diasDesdeVencimento: number
    }>
  } | null
  projecao5Safras: {
    anos: Array<{
      ano: number
      safra: string
      receitaBruta: number
      custoTotal: number
      margemBruta: number
      dividas: number
      saldoLiquido: number
      saldoAcumulado: number
    }>
    valorPresenteLiquido: number
    viabilidade: 'VIAVEL' | 'APERTADO' | 'INVIAVEL'
    anosCriticos: string[]
    recomendacoes: string[]
  } | null
  fluxoCaixaSafra: {
    receitaBruta: number
    custoTotal: number
    margemBruta: number
    totalDividas: number
    saldoLivre: number
    capacidadePagamento: number
    fluxoMensal: Array<{ mes: string; receita: number; despesa: number; saldo: number; saldoAcumulado: number }>
  } | null
  margemCliente: {
    nome: string
    receitaBruta: number
    receitaLiquida: number
    despesasAtribuidas: number
    margem: number
    margemPct: number
    classificacao: 'ouro' | 'prata' | 'bronze' | 'prejuizo'
  } | null
  alertasTop: Array<{
    nivel: 'critico' | 'alto' | 'moderado' | 'info'
    origem: 'srai' | 'abs' | 'caixa' | 'dividas' | 'relacionamento'
    mensagem: string
  }>
  recomendacoes: Array<{
    id: string
    titulo: string
    categoria: 'recuperacao' | 'oportunidade' | 'relacionamento' | 'compliance' | 'estrategia'
    prioridade: 'p1' | 'p2' | 'p3'
    acao: string
    justificativa: string
    impactoEstimado?: string
  }>
  erros: Record<string, string>
}

interface ExposicaoItem {
  commodity: string
  areaHa: number
  produtividade: number
  unidadeProdutividade: string
  precoReferencia: number
  unidadePreco: string
  pctReceita?: number
  atualizadoEm?: string
  observacoes?: string
}

interface VisitaChecklist {
  infraestruturaOk?: boolean
  maquinarioOk?: boolean
  lavouraOk?: boolean
  armazenagemOk?: boolean
  ambientalOk?: boolean
  documentacaoOk?: boolean
  receptividadeOk?: boolean
}

interface VisitaTecnica {
  id: string
  data: string
  consultor: string
  duracaoMinutos?: number
  checklist: VisitaChecklist
  observacoesGerais?: string
  riscos?: string[]
  oportunidades?: string[]
  criadoEm: string
}

interface VisitaForm {
  data: string
  consultor: string
  duracaoMinutos: number
  checklist: VisitaChecklist
  observacoesGerais: string
  riscos: string
  oportunidades: string
}

function defaultVisitaForm(): VisitaForm {
  return {
    data: new Date().toISOString().slice(0, 10),
    consultor: '',
    duracaoMinutos: 60,
    checklist: {
      infraestruturaOk: false,
      maquinarioOk: false,
      lavouraOk: false,
      armazenagemOk: false,
      ambientalOk: false,
      documentacaoOk: false,
      receptividadeOk: false,
    },
    observacoesGerais: '',
    riscos: '',
    oportunidades: '',
  }
}

// ────────────────────────────────────────────────────────────
// Stage Config
// ────────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  lead: { label: 'Lead', color: '#6B7280' },
  qualificacao: { label: 'Qualificação', color: '#3B82F6' },
  analise: { label: 'Análise', color: '#8B5CF6' },
  proposta: { label: 'Proposta', color: '#cb9d52' },
  negociacao: { label: 'Negociação', color: '#E67E22' },
  acordo: { label: 'Acordo', color: '#27AE60' },
  acompanhamento: { label: 'Acompanhamento', color: '#17251b' },
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
    quitada: { label: 'Quitada', bg: '#17251b18', text: '#17251b' },
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
    proposta_gerada: { icon: Send, color: '#cb9d52' },
    pagamento: { icon: DollarSign, color: '#27AE60' },
    acordo: { icon: Handshake, color: '#17251b' },
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
  { id: 'risco', label: 'Risco & AB+S' },
  { id: 'exposicao', label: 'Exposição' },
  { id: 'patrimonio', label: 'Patrimônio' },
  { id: 'visitas', label: 'Visitas' },
  { id: 'propostas', label: 'Propostas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'fluxo-caixa', label: 'Fluxo de Caixa' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'portal-chat', label: 'Chat Portal' },
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
  const [timelineFilter, setTimelineFilter] = useState<string>('todos')
  const [notas, setNotas] = useState<Array<{ id: string; autor: string; criadoEm: string; texto: string }>>([])
  const [novaNota, setNovaNota] = useState('')
  const [addingNota, setAddingNota] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [novaTag, setNovaTag] = useState('')
  const [proximaAcao, setProximaAcao] = useState<{ data: string; descricao: string } | null>(null)
  const [proximaAcaoForm, setProximaAcaoForm] = useState({ data: '', descricao: '' })
  const [editingProxAcao, setEditingProxAcao] = useState(false)
  // SRAI + AB+S
  const [srai, setSrai] = useState<SraiResult | null>(null)
  const [abs, setAbs] = useState<AbsResult | null>(null)
  const [loadingRisco, setLoadingRisco] = useState(false)
  const [absQuery, setAbsQuery] = useState({ plantioDireto: false, ilpf: false, prada: false })
  // Snapshot de análises automáticas (AutoCalcOrchestrator)
  const [analises, setAnalises] = useState<AnaliseCliente | null>(null)
  const [loadingAnalises, setLoadingAnalises] = useState(false)
  const [recalculando, setRecalculando] = useState(false)
  // Exposição por commodity
  const [exposicao, setExposicao] = useState<ExposicaoItem[]>([])
  const [savingExposicao, setSavingExposicao] = useState(false)
  // Visitas técnicas
  const [visitas, setVisitas] = useState<VisitaTecnica[]>([])
  const [novaVisita, setNovaVisita] = useState<VisitaForm>(defaultVisitaForm())
  const [savingVisita, setSavingVisita] = useState(false)
  // Portal Cliente — mensagens (consultor responde pelo sistema)
  const [portalMensagens, setPortalMensagens] = useState<Array<{
    id: string
    de: 'cliente' | 'consultor' | 'sistema'
    autorNome: string
    texto: string
    criadoEm: string
    lidaEm?: string
  }>>([])
  const [portalChatInput, setPortalChatInput] = useState('')
  const [enviandoMsgPortal, setEnviandoMsgPortal] = useState(false)
  const [portalStatus, setPortalStatus] = useState<{ ativo: boolean; usuario: string } | null>(null)
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
                vencimento: d.vencimento,
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
            endereco: data.endereco,
            clima: data.clima,
            producaoMunicipal: data.producaoMunicipal,
            areaTotalHa: data.areaTotalHa,
            car: data.car
              ? {
                  areaImovel: data.car.areaImovel,
                  codImovel: data.car.codImovel,
                  municipio: data.car.municipio,
                  uf: data.car.uf,
                }
              : undefined,
          }
          setApiCliente(mapped)
          setNotas(Array.isArray(data.notas) ? data.notas : [])
          setTags(Array.isArray(data.tags) ? data.tags : [])
          setProximaAcao(data.proximaAcao || null)
        }
      })
      .catch(() => { /* fallback to inline data */ })
  }, [id])

  // Load SRAI + ABS + exposicao + visitas
  useEffect(() => {
    if (!id) return
    const apiId = id === 'ailton-caeiro' ? 'cli-001' : id === 'paulo-luciano' ? 'cli-002' : id
    setLoadingRisco(true)
    Promise.all([
      apiFetch<{ success: boolean; data: SraiResult }>(`/clientes/${apiId}/srai`).catch(() => null),
      apiFetch<{ success: boolean; data: AbsResult }>(
        `/clientes/${apiId}/abs?plantioDireto=${absQuery.plantioDireto}&ilpf=${absQuery.ilpf}&prada=${absQuery.prada}`,
      ).catch(() => null),
      apiFetch<any>(`/clientes/${apiId}`).catch(() => null),
    ])
      .then(([sraiRes, absRes, clienteRes]) => {
        if (sraiRes?.success) setSrai(sraiRes.data)
        if (absRes?.success) setAbs(absRes.data)
        if (clienteRes) {
          setExposicao(Array.isArray(clienteRes.exposicaoCommodity) ? clienteRes.exposicaoCommodity : [])
          setVisitas(Array.isArray(clienteRes.visitasTecnicas) ? clienteRes.visitasTecnicas : [])
          setPortalMensagens(Array.isArray(clienteRes.portalMensagens) ? clienteRes.portalMensagens : [])
          setPortalStatus(
            clienteRes.portalAcesso
              ? { ativo: !!clienteRes.portalAcesso.ativo, usuario: clienteRes.portalAcesso.usuario }
              : null,
          )
        }
      })
      .finally(() => setLoadingRisco(false))
  }, [id, absQuery])

  // Snapshot consolidado do AutoCalcOrchestrator — materializado no backend e
  // servido em uma única chamada. Idempotente: a 2ª leitura devolve o mesmo
  // objeto enquanto nada no cliente muda.
  useEffect(() => {
    if (!id) return
    const apiId = id === 'ailton-caeiro' ? 'cli-001' : id === 'paulo-luciano' ? 'cli-002' : id
    setLoadingAnalises(true)
    // apiFetch auto-desembrulha { success, data } → devolve só `data`
    apiFetch<AnaliseCliente>(`/clientes/${apiId}/analises`)
      .then((data) => {
        if (data) setAnalises(data)
      })
      .catch(() => { /* ignore — UI já mostra empty state */ })
      .finally(() => setLoadingAnalises(false))
  }, [id])

  const recalcularAnalises = useCallback(async () => {
    if (!id) return
    const apiId = id === 'ailton-caeiro' ? 'cli-001' : id === 'paulo-luciano' ? 'cli-002' : id
    setRecalculando(true)
    try {
      const data = await apiFetch<AnaliseCliente>(`/clientes/${apiId}/recalcular`, { method: 'POST' })
      if (data) {
        setAnalises(data)
        showToast(`Análises recalculadas (${data.duracaoMs}ms)`, 'success')
      }
    } catch (err: any) {
      showToast(err?.message || 'Falha ao recalcular', 'error')
    } finally {
      setRecalculando(false)
    }
  }, [id, showToast])

  const apiIdResolved = useMemo(
    () => (id === 'ailton-caeiro' ? 'cli-001' : id === 'paulo-luciano' ? 'cli-002' : id),
    [id],
  )

  // Polling de mensagens do portal (10s) quando a aba está aberta
  useEffect(() => {
    if (!apiIdResolved || activeTab !== 'portal-chat') return
    let cancelado = false
    const fetchMsgs = async () => {
      try {
        const res = await apiFetch<{ success: boolean; data: typeof portalMensagens }>(
          `/clientes/${apiIdResolved}/portal-mensagens`,
        )
        if (!cancelado && res?.success) setPortalMensagens(res.data)
        await apiFetch(`/clientes/${apiIdResolved}/portal-mensagens/marcar-lidas`, { method: 'PATCH' }).catch(() => null)
      } catch { /* ignore */ }
    }
    fetchMsgs()
    const h = window.setInterval(fetchMsgs, 10000)
    return () => {
      cancelado = true
      window.clearInterval(h)
    }
  }, [activeTab, apiIdResolved])

  const handleAddNota = useCallback(async () => {
    if (!novaNota.trim() || !apiIdResolved) return
    setAddingNota(true)
    try {
      const res = await apiFetch<{ success: boolean; data: { id: string; autor: string; criadoEm: string; texto: string } }>(
        `/clientes/${apiIdResolved}/notas`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: novaNota.trim(), autor: 'Equipe ALETIS' }),
        },
      )
      if (res.success) {
        setNotas((prev) => [...prev, res.data])
        setNovaNota('')
        showToast('Nota adicionada', 'success')
      }
    } catch {
      showToast('Falha ao adicionar nota', 'error')
    } finally {
      setAddingNota(false)
    }
  }, [novaNota, apiIdResolved, showToast])

  const handleRemoverNota = useCallback(async (notaId: string) => {
    if (!apiIdResolved) return
    try {
      await apiFetch(`/clientes/${apiIdResolved}/notas/${notaId}`, { method: 'DELETE' })
      setNotas((prev) => prev.filter((n) => n.id !== notaId))
    } catch {
      showToast('Falha ao remover nota', 'error')
    }
  }, [apiIdResolved, showToast])

  const handleSaveTags = useCallback(async (novas: string[]) => {
    if (!apiIdResolved) return
    try {
      await apiFetch(`/clientes/${apiIdResolved}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: novas }),
      })
      setTags(novas)
    } catch {
      showToast('Falha ao salvar tags', 'error')
    }
  }, [apiIdResolved, showToast])

  const handleSaveProximaAcao = useCallback(async () => {
    if (!apiIdResolved) return
    if (!proximaAcaoForm.data || !proximaAcaoForm.descricao.trim()) {
      showToast('Informe data e descrição', 'error')
      return
    }
    try {
      await apiFetch(`/clientes/${apiIdResolved}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proximaAcao: {
            data: proximaAcaoForm.data,
            descricao: proximaAcaoForm.descricao.trim(),
            criadoEm: new Date().toISOString(),
          },
        }),
      })
      setProximaAcao({ data: proximaAcaoForm.data, descricao: proximaAcaoForm.descricao.trim() })
      setEditingProxAcao(false)
      showToast('Próxima ação salva', 'success')
    } catch {
      showToast('Falha ao salvar ação', 'error')
    }
  }, [apiIdResolved, proximaAcaoForm, showToast])

  // Exposição commodity — salvar lista inteira via PUT
  const handleSalvarExposicao = useCallback(async (lista: ExposicaoItem[]) => {
    if (!apiIdResolved) return
    setSavingExposicao(true)
    try {
      const res = await apiFetch<{ success: boolean; data: ExposicaoItem[] }>(
        `/clientes/${apiIdResolved}/exposicao`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exposicao: lista }),
        },
      )
      if (res.success) {
        setExposicao(res.data)
        showToast('Exposição atualizada', 'success')
      }
    } catch {
      showToast('Falha ao salvar exposição', 'error')
    } finally {
      setSavingExposicao(false)
    }
  }, [apiIdResolved, showToast])

  // Visita técnica — criar
  const handleCriarVisita = useCallback(async () => {
    if (!apiIdResolved) return
    if (!novaVisita.consultor.trim() || !novaVisita.data) {
      showToast('Informe consultor e data', 'error')
      return
    }
    setSavingVisita(true)
    try {
      const res = await apiFetch<{ success: boolean; data: VisitaTecnica }>(
        `/clientes/${apiIdResolved}/visitas`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: novaVisita.data,
            consultor: novaVisita.consultor.trim(),
            duracaoMinutos: novaVisita.duracaoMinutos || undefined,
            checklist: novaVisita.checklist,
            observacoesGerais: novaVisita.observacoesGerais.trim() || undefined,
            riscos: novaVisita.riscos.split('\n').map((r) => r.trim()).filter(Boolean),
            oportunidades: novaVisita.oportunidades.split('\n').map((o) => o.trim()).filter(Boolean),
          }),
        },
      )
      if (res.success) {
        setVisitas((prev) => [...prev, res.data])
        setNovaVisita(defaultVisitaForm())
        showToast('Visita registrada', 'success')
      }
    } catch {
      showToast('Falha ao registrar visita', 'error')
    } finally {
      setSavingVisita(false)
    }
  }, [apiIdResolved, novaVisita, showToast])

  const handleRemoverVisita = useCallback(async (visitaId: string) => {
    if (!apiIdResolved) return
    try {
      await apiFetch(`/clientes/${apiIdResolved}/visitas/${visitaId}`, { method: 'DELETE' })
      setVisitas((prev) => prev.filter((v) => v.id !== visitaId))
      showToast('Visita removida', 'success')
    } catch {
      showToast('Falha ao remover visita', 'error')
    }
  }, [apiIdResolved, showToast])

  const handleEnviarMsgPortal = useCallback(async () => {
    const texto = portalChatInput.trim()
    if (!texto || !apiIdResolved || enviandoMsgPortal) return
    setEnviandoMsgPortal(true)
    try {
      const res = await apiFetch<{ success: boolean; data: (typeof portalMensagens)[number] }>(
        `/clientes/${apiIdResolved}/portal-mensagens`,
        { method: 'POST', body: JSON.stringify({ texto }) },
      )
      if (res?.success) {
        setPortalMensagens((prev) => [...prev, res.data])
        setPortalChatInput('')
      }
    } catch {
      showToast('Falha ao enviar mensagem', 'error')
    } finally {
      setEnviandoMsgPortal(false)
    }
  }, [portalChatInput, apiIdResolved, enviandoMsgPortal, showToast])

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
              <Link
                to={`/clientes/${cliente.id}/dossie`}
                className="btn-outline inline-flex items-center gap-2 text-sm px-4 py-2.5"
                title="Dossiê Agro Canônico (padrão Daycoval 2025)"
              >
                <FileCheck className="w-4 h-4" />
                Dossiê Agro
              </Link>
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
          {/* ══════════════ PAINEL INTELIGENTE (AutoCalcOrchestrator) ══════════════ */}
          <PainelInteligente
            analises={analises}
            loading={loadingAnalises}
            recalculando={recalculando}
            onRecalcular={recalcularAnalises}
          />

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

            {/* Localização + Satélite */}
            {cliente.endereco?.coordenadas && (
              <div className="card-premium p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-aletis-verde" />
                  </div>
                  <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                    Localização & Satélite
                  </h3>
                </div>
                <MapThumbnail
                  lat={cliente.endereco.coordenadas.lat}
                  lng={cliente.endereco.coordenadas.lng}
                  legenda={cliente.endereco.formatado}
                  titulo={cliente.nome}
                  areaHa={cliente.areaTotalHa || cliente.car?.areaImovel}
                  height={240}
                />
                {cliente.endereco.formatado && (
                  <p className="mt-3 text-xs font-body text-aletis-grafite-medio leading-relaxed">
                    {cliente.endereco.formatado}
                  </p>
                )}
                {cliente.endereco.fonte && (
                  <p className="mt-2 text-[10px] font-body text-aletis-grafite-claro uppercase tracking-wider">
                    Fonte: {cliente.endereco.fonte}
                  </p>
                )}
              </div>
            )}

            {/* Clima Agroclimático (NASA POWER) */}
            {cliente.clima && (
              <div className="card-premium p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-sky-500/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                      Clima Agroclimático
                    </h3>
                    <p className="text-[11px] font-body text-aletis-grafite-claro truncate">
                      {cliente.clima.fonte} · {cliente.clima.periodo.inicio} → {cliente.clima.periodo.fim}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ClimaCell
                    label="Temp. média"
                    value={cliente.clima.tempMediaAnualC != null ? `${cliente.clima.tempMediaAnualC.toFixed(1)} °C` : '—'}
                  />
                  <ClimaCell
                    label="Chuva anual"
                    value={
                      cliente.clima.chuvaAcumuladaAnualMm != null
                        ? `${Math.round(cliente.clima.chuvaAcumuladaAnualMm).toLocaleString('pt-BR')} mm`
                        : '—'
                    }
                  />
                  <ClimaCell
                    label="Radiação solar"
                    value={
                      cliente.clima.radiacaoMediaDiariaMjM2 != null
                        ? `${cliente.clima.radiacaoMediaDiariaMjM2.toFixed(1)} MJ/m²·dia`
                        : '—'
                    }
                  />
                  <ClimaCell
                    label="Umidade rel."
                    value={
                      cliente.clima.umidadeRelativaMediaPct != null
                        ? `${cliente.clima.umidadeRelativaMediaPct.toFixed(0)}%`
                        : '—'
                    }
                  />
                </div>
              </div>
            )}

            {/* Produção Municipal (IBGE SIDRA) */}
            {cliente.producaoMunicipal && (cliente.producaoMunicipal.culturas.length > 0 || cliente.producaoMunicipal.rebanho.length > 0) && (
              <div className="card-premium p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-aletis-dourado/10 flex items-center justify-center">
                    <Wheat className="w-4 h-4 text-aletis-dourado" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                      Produção do Município
                    </h3>
                    <p className="text-[11px] font-body text-aletis-grafite-claro truncate">
                      {cliente.producaoMunicipal.fonte} · ref {cliente.producaoMunicipal.anoReferencia}
                    </p>
                  </div>
                </div>
                {cliente.producaoMunicipal.culturas.length > 0 && (
                  <>
                    <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider mb-2">
                      Top culturas (valor da produção)
                    </p>
                    <div className="space-y-1.5 mb-3">
                      {cliente.producaoMunicipal.culturas.slice(0, 5).map((c) => (
                        <div key={c.cultura + c.tipo} className="flex items-center justify-between gap-2 text-xs font-body">
                          <span className="truncate text-aletis-grafite-escuro">{c.cultura}</span>
                          <span className="font-mono text-aletis-grafite-medio flex-shrink-0">
                            R$ {c.valorMilReais.toLocaleString('pt-BR')} mil
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {cliente.producaoMunicipal.rebanho.length > 0 && (
                  <>
                    <p className="text-[11px] font-body text-aletis-grafite-claro uppercase tracking-wider mb-2 mt-2">
                      Rebanho (cabeças)
                    </p>
                    <div className="space-y-1.5">
                      {cliente.producaoMunicipal.rebanho.slice(0, 3).map((r) => (
                        <div key={r.especie} className="flex items-center justify-between gap-2 text-xs font-body">
                          <span className="truncate text-aletis-grafite-escuro">{r.especie}</span>
                          <span className="font-mono text-aletis-grafite-medio flex-shrink-0">
                            {r.cabecas.toLocaleString('pt-BR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Próxima Ação */}
            <div className="card-premium p-5">
              <div className="flex items-center justify-between gap-2.5 mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                    Próxima Ação
                  </h3>
                </div>
                {!editingProxAcao && (
                  <button
                    onClick={() => {
                      setProximaAcaoForm({
                        data: proximaAcao?.data || new Date().toISOString().slice(0, 10),
                        descricao: proximaAcao?.descricao || '',
                      })
                      setEditingProxAcao(true)
                    }}
                    className="text-xs font-body font-semibold text-aletis-verde hover:underline"
                  >
                    {proximaAcao ? 'Editar' : 'Agendar'}
                  </button>
                )}
              </div>

              {editingProxAcao ? (
                <div className="space-y-2">
                  <input
                    type="date"
                    value={proximaAcaoForm.data}
                    onChange={(e) => setProximaAcaoForm((p) => ({ ...p, data: e.target.value }))}
                    className="w-full text-sm font-body border border-aletis-borda rounded-lg px-3 py-2 focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none"
                  />
                  <textarea
                    value={proximaAcaoForm.descricao}
                    onChange={(e) => setProximaAcaoForm((p) => ({ ...p, descricao: e.target.value }))}
                    placeholder="Ex: Ligar para Sicoob, enviar proposta de parcelamento..."
                    rows={2}
                    className="w-full text-sm font-body border border-aletis-borda rounded-lg px-3 py-2 focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveProximaAcao}
                      className="flex-1 text-xs font-body font-semibold bg-aletis-verde text-white rounded-lg py-2 hover:bg-aletis-verde-escuro transition"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingProxAcao(false)}
                      className="px-4 text-xs font-body text-aletis-grafite-medio hover:text-aletis-grafite-escuro"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : proximaAcao ? (
                (() => {
                  const dias = Math.floor((new Date(proximaAcao.data).getTime() - Date.now()) / 86_400_000)
                  const color = dias < 0 ? 'text-red-600' : dias <= 3 ? 'text-amber-600' : 'text-aletis-verde'
                  return (
                    <div>
                      <p className="text-sm font-body text-aletis-grafite-escuro mb-1">{proximaAcao.descricao}</p>
                      <p className={`text-xs font-body font-semibold ${color}`}>
                        {new Date(proximaAcao.data).toLocaleDateString('pt-BR')} ·{' '}
                        {dias < 0 ? `atrasado ${Math.abs(dias)} dia(s)` : dias === 0 ? 'hoje' : `em ${dias} dia(s)`}
                      </p>
                    </div>
                  )
                })()
              ) : (
                <p className="text-xs font-body text-aletis-grafite-claro">
                  Nenhuma ação agendada. Clique em <strong>Agendar</strong> para criar uma.
                </p>
              )}
            </div>

            {/* Tags */}
            <div className="card-premium p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
                  <Tag className="w-4 h-4 text-aletis-verde" />
                </div>
                <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                  Tags / Rótulos
                </h3>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {tags.length === 0 && (
                  <span className="text-xs font-body text-aletis-grafite-claro">
                    Nenhuma tag. Use tags como "alta-prioridade", "aguardando-doc", etc.
                  </span>
                )}
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 text-xs font-body font-semibold px-2 py-1 rounded-lg bg-aletis-verde/10 text-aletis-verde border border-aletis-verde/20"
                  >
                    {t}
                    <button
                      onClick={() => handleSaveTags(tags.filter((x) => x !== t))}
                      className="hover:text-red-600"
                      aria-label={`Remover tag ${t}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const t = novaTag.trim().toLowerCase().replace(/\s+/g, '-')
                  if (t && !tags.includes(t)) {
                    handleSaveTags([...tags, t])
                    setNovaTag('')
                  }
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={novaTag}
                  onChange={(e) => setNovaTag(e.target.value)}
                  placeholder="nova-tag"
                  className="flex-1 text-xs font-body border border-aletis-borda rounded-lg px-2.5 py-1.5 focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none"
                />
                <button
                  type="submit"
                  className="text-xs font-body font-semibold bg-aletis-verde text-white rounded-lg px-3 py-1.5 hover:bg-aletis-verde-escuro transition disabled:opacity-50"
                  disabled={!novaTag.trim()}
                >
                  + Adicionar
                </button>
              </form>
            </div>

            {/* Notas internas */}
            <div className="card-premium p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
                  <StickyNote className="w-4 h-4 text-aletis-verde" />
                </div>
                <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                  Notas Internas ({notas.length})
                </h3>
              </div>

              <div className="space-y-2 mb-3 max-h-[320px] overflow-y-auto pr-1">
                {notas.length === 0 && (
                  <p className="text-xs font-body text-aletis-grafite-claro italic">
                    Sem notas ainda. Registre observações estratégicas, deliberações internas ou contexto não-estruturado.
                  </p>
                )}
                {notas.slice().reverse().map((n) => (
                  <div
                    key={n.id}
                    className="group relative rounded-lg border border-aletis-borda bg-aletis-bege/30 p-3"
                  >
                    <p className="text-xs font-body text-aletis-grafite-escuro whitespace-pre-wrap leading-relaxed">
                      {n.texto}
                    </p>
                    <div className="flex items-center justify-between mt-2 text-[10px] font-body text-aletis-grafite-claro">
                      <span>{n.autor} · {new Date(n.criadoEm).toLocaleString('pt-BR')}</span>
                      <button
                        onClick={() => handleRemoverNota(n.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition"
                        aria-label="Remover nota"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <textarea
                  value={novaNota}
                  onChange={(e) => setNovaNota(e.target.value)}
                  placeholder="Adicionar nota interna (visível só pela equipe)..."
                  rows={2}
                  className="w-full text-xs font-body border border-aletis-borda rounded-lg px-3 py-2 focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none resize-none"
                />
                <button
                  onClick={handleAddNota}
                  disabled={!novaNota.trim() || addingNota}
                  className="w-full text-xs font-body font-semibold bg-aletis-verde text-white rounded-lg py-2 hover:bg-aletis-verde-escuro transition disabled:opacity-50"
                >
                  {addingNota ? 'Adicionando...' : '+ Adicionar Nota'}
                </button>
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
                      Vencimento / Aging
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
                            {(() => {
                              if (!d.vencimento)
                                return (
                                  <span className="text-xs text-aletis-grafite-claro">—</span>
                                )
                              const dias = Math.floor(
                                (new Date(d.vencimento).getTime() - Date.now()) / 86_400_000,
                              )
                              const quitada = d.status === 'quitada'
                              const color = quitada
                                ? 'text-positivo'
                                : dias < -60
                                ? 'text-red-700 font-bold'
                                : dias < -30
                                ? 'text-red-600 font-semibold'
                                : dias < 0
                                ? 'text-red-500 font-semibold'
                                : dias < 30
                                ? 'text-amber-600 font-semibold'
                                : 'text-aletis-grafite-medio'
                              return (
                                <div className="text-xs font-body">
                                  <div className={color}>
                                    {new Date(d.vencimento).toLocaleDateString('pt-BR')}
                                  </div>
                                  <div className={`text-[10px] ${color}`}>
                                    {quitada
                                      ? 'Quitada'
                                      : dias < 0
                                      ? `Atrasada ${Math.abs(dias)}d`
                                      : `Vence em ${dias}d`}
                                  </div>
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={d.status} />
                          </td>
                        </tr>
                        {/* Expanded: Payment History */}
                        {isExpanded && (
                          <tr className="bg-aletis-bege/40">
                            <td colSpan={9} className="px-8 py-4">
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

          {/* Aging Buckets */}
          {cliente.dividas.some((d) => d.vencimento) && (
            <div className="card-premium p-4">
              <h4 className="text-sm font-display font-semibold text-aletis-grafite-escuro mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-aletis-dourado" />
                Distribuição por Vencimento (Aging)
              </h4>
              {(() => {
                const now = Date.now()
                const buckets = {
                  quitada: { valor: 0, count: 0 },
                  aVencer: { valor: 0, count: 0 },
                  atraso30: { valor: 0, count: 0 },
                  atraso60: { valor: 0, count: 0 },
                  atrasoPlus: { valor: 0, count: 0 },
                }
                cliente.dividas.forEach((d) => {
                  if (d.status === 'quitada') {
                    buckets.quitada.valor += d.valorAtual
                    buckets.quitada.count++
                    return
                  }
                  if (!d.vencimento) return
                  const dias = Math.floor(
                    (new Date(d.vencimento).getTime() - now) / 86_400_000,
                  )
                  if (dias >= 0) {
                    buckets.aVencer.valor += d.valorAtual
                    buckets.aVencer.count++
                  } else if (dias >= -30) {
                    buckets.atraso30.valor += d.valorAtual
                    buckets.atraso30.count++
                  } else if (dias >= -60) {
                    buckets.atraso60.valor += d.valorAtual
                    buckets.atraso60.count++
                  } else {
                    buckets.atrasoPlus.valor += d.valorAtual
                    buckets.atrasoPlus.count++
                  }
                })
                const items = [
                  { key: 'aVencer', label: 'A vencer', color: 'bg-emerald-50 border-emerald-200 text-emerald-800', data: buckets.aVencer },
                  { key: 'atraso30', label: '1-30d atraso', color: 'bg-amber-50 border-amber-200 text-amber-800', data: buckets.atraso30 },
                  { key: 'atraso60', label: '31-60d atraso', color: 'bg-orange-50 border-orange-200 text-orange-800', data: buckets.atraso60 },
                  { key: 'atrasoPlus', label: '60d+ atraso', color: 'bg-red-50 border-red-200 text-red-800', data: buckets.atrasoPlus },
                  { key: 'quitada', label: 'Quitadas', color: 'bg-positivo/10 border-positivo/30 text-positivo', data: buckets.quitada },
                ]
                return (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {items.map((it) => (
                      <div
                        key={it.key}
                        className={`border rounded-xl p-3 ${it.color}`}
                      >
                        <p className="text-[10px] font-body font-semibold uppercase tracking-wider opacity-80">
                          {it.label}
                        </p>
                        <p className="text-base font-display font-bold mt-1">
                          {formatBRL(it.data.valor)}
                        </p>
                        <p className="text-[11px] font-body mt-0.5 opacity-70">
                          {it.data.count} contrato{it.data.count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
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
        <div className="space-y-4 animate-fade-in">
          {/* Filter chips */}
          {(() => {
            const tipos = Array.from(new Set(cliente.timeline.map((e) => e.tipo)))
            return (
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-aletis-grafite-claro" />
                <button
                  onClick={() => setTimelineFilter('todos')}
                  className={`text-xs font-body font-semibold px-2.5 py-1 rounded-full border transition ${
                    timelineFilter === 'todos'
                      ? 'bg-aletis-verde text-white border-aletis-verde'
                      : 'bg-white text-aletis-grafite-medio border-aletis-borda hover:border-aletis-verde/40'
                  }`}
                >
                  Todos ({cliente.timeline.length})
                </button>
                {tipos.map((t) => {
                  const count = cliente.timeline.filter((e) => e.tipo === t).length
                  return (
                    <button
                      key={t}
                      onClick={() => setTimelineFilter(t)}
                      className={`text-xs font-body font-semibold px-2.5 py-1 rounded-full border transition capitalize ${
                        timelineFilter === t
                          ? 'bg-aletis-verde text-white border-aletis-verde'
                          : 'bg-white text-aletis-grafite-medio border-aletis-borda hover:border-aletis-verde/40'
                      }`}
                    >
                      {t.replace(/_/g, ' ')} ({count})
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {(() => {
            const filtered = timelineFilter === 'todos'
              ? cliente.timeline
              : cliente.timeline.filter((e) => e.tipo === timelineFilter)
            if (filtered.length === 0) {
              return (
                <div className="card-premium p-12 text-center">
                  <p className="text-sm font-body text-aletis-grafite-claro">
                    Nenhum evento {timelineFilter !== 'todos' ? `do tipo "${timelineFilter}"` : 'registrado'}.
                  </p>
                </div>
              )
            }
            return (
              <div className="space-y-0">
                {filtered.map((event, i) => (
                  <div key={event.id} className="flex gap-4 group">
                    {/* Timeline Line + Icon */}
                    <div className="flex flex-col items-center">
                      <TimelineIcon tipo={event.tipo} />
                      {i < filtered.length - 1 && (
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
              </div>
            )
          })()}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: RISCO & AB+S
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'risco' && (
        <div className="space-y-6 animate-fade-in">
          {loadingRisco && <p className="text-sm text-aletis-grafite-claro">Carregando análise de risco…</p>}

          {srai && (
            <div className="card-premium p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-display font-bold text-aletis-grafite-escuro">Score SRAI (Risco Agrícola Integrado)</h3>
                  <p className="text-[11px] font-body text-aletis-grafite-claro mt-0.5">{srai.versao}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={`text-3xl font-display font-bold ${
                      srai.classificacao === 'baixo' ? 'text-positivo' :
                      srai.classificacao === 'moderado' ? 'text-amber-600' :
                      srai.classificacao === 'alto' ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {srai.scoreTotal}
                    </p>
                    <p className={`text-xs font-body font-semibold uppercase tracking-wider ${
                      srai.classificacao === 'baixo' ? 'text-positivo' :
                      srai.classificacao === 'moderado' ? 'text-amber-600' :
                      srai.classificacao === 'alto' ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      risco {srai.classificacao}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {Object.entries(srai.componentes).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-aletis-bege/40 border border-aletis-borda/50 p-3">
                    <p className="text-[10px] font-body uppercase tracking-wider text-aletis-grafite-claro">{k}</p>
                    <p className="text-xl font-display font-bold text-aletis-grafite-escuro mt-1">{v}</p>
                    <div className="h-1.5 bg-aletis-borda/40 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-aletis-dourado" style={{ width: `${v}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {srai.alertas.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-body font-semibold uppercase tracking-wider text-aletis-grafite-medio mb-2">Alertas ({srai.alertas.length})</p>
                  <ul className="space-y-1">
                    {srai.alertas.map((a, i) => (
                      <li key={i} className="text-xs font-body text-aletis-grafite-medio flex items-start gap-2">
                        <span className="text-red-500 mt-0.5">•</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-xs font-body font-semibold uppercase tracking-wider text-aletis-grafite-medio mb-2">Recomendações</p>
                <ul className="space-y-1">
                  {srai.recomendacoes.map((r, i) => (
                    <li key={i} className="text-xs font-body text-aletis-grafite-medio flex items-start gap-2">
                      <span className="text-aletis-dourado mt-0.5">→</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {abs && (
            <div className="card-premium p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-display font-bold text-aletis-grafite-escuro">Elegibilidade AB+S</h3>
                  <p className="text-[11px] font-body text-aletis-grafite-claro mt-0.5">{abs.versao}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-body font-semibold uppercase tracking-wider ${
                    abs.nivelElegibilidade === 'integral' ? 'text-positivo' :
                    abs.nivelElegibilidade === 'parcial' ? 'text-amber-600' :
                    abs.nivelElegibilidade === 'condicional' ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {abs.nivelElegibilidade}
                  </p>
                  <p className="text-xl font-display font-bold text-aletis-grafite-escuro">{abs.scorePercentual}%</p>
                  {abs.taxasEstimadasPct.max > 0 && (
                    <p className="text-[11px] font-body text-aletis-grafite-claro">
                      Taxas: {abs.taxasEstimadasPct.min}%-{abs.taxasEstimadasPct.max}% a.a.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 flex-wrap mb-4 p-3 bg-aletis-bege/30 rounded-lg">
                <label className="text-xs font-body flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={absQuery.plantioDireto}
                    onChange={(e) => setAbsQuery((q) => ({ ...q, plantioDireto: e.target.checked }))}
                  />
                  Plantio direto
                </label>
                <label className="text-xs font-body flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={absQuery.ilpf}
                    onChange={(e) => setAbsQuery((q) => ({ ...q, ilpf: e.target.checked }))}
                  />
                  iLPF
                </label>
                <label className="text-xs font-body flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={absQuery.prada}
                    onChange={(e) => setAbsQuery((q) => ({ ...q, prada: e.target.checked }))}
                  />
                  PRADA
                </label>
              </div>

              <div className="space-y-2 mb-4">
                {abs.checkpoints.map((c) => (
                  <div key={c.item} className="flex items-start gap-3 p-3 rounded-lg border border-aletis-borda/50">
                    <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      c.status === 'ok' ? 'bg-positivo/15 text-positivo' :
                      c.status === 'pendente' ? 'bg-amber-100 text-amber-700' :
                      c.status === 'falha' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {c.status === 'ok' ? '✓' : c.status === 'falha' ? '✕' : c.status === 'pendente' ? '!' : '—'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-body font-semibold text-aletis-grafite-escuro">{c.descricao}</p>
                      {c.detalhes && <p className="text-xs font-body text-aletis-grafite-medio mt-0.5">{c.detalhes}</p>}
                      <p className="text-[10px] font-body text-aletis-grafite-claro mt-1 italic">{c.fundamentacao}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-aletis-borda/60 pt-3">
                <p className="text-xs font-body font-semibold uppercase tracking-wider text-aletis-grafite-medio mb-2">Ações Recomendadas</p>
                <ul className="space-y-1">
                  {abs.acoesRecomendadas.map((a, i) => (
                    <li key={i} className="text-xs font-body text-aletis-grafite-medio flex items-start gap-2">
                      <span className="text-aletis-dourado mt-0.5">→</span>{a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {!loadingRisco && !srai && !abs && (
            <div className="card-premium p-12 text-center text-sm text-aletis-grafite-claro">
              Não foi possível carregar análise de risco.
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: EXPOSIÇÃO COMMODITY
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'exposicao' && (
        <div className="space-y-4 animate-fade-in">
          <div className="card-premium p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-display font-bold text-aletis-grafite-escuro">Exposição por Commodity</h3>
                <p className="text-[11px] font-body text-aletis-grafite-claro mt-0.5">
                  Base para simulador multi-cenário e score SRAI
                </p>
              </div>
              <button
                className="px-3 py-1.5 text-xs font-body font-semibold rounded-lg bg-aletis-verde text-white hover:bg-aletis-verde/90"
                onClick={() =>
                  setExposicao((prev) => [
                    ...prev,
                    {
                      commodity: 'soja',
                      areaHa: 0,
                      produtividade: 60,
                      unidadeProdutividade: 'sc/ha',
                      precoReferencia: 140,
                      unidadePreco: 'R$/sc',
                    },
                  ])
                }
              >
                + Adicionar
              </button>
            </div>

            {exposicao.length === 0 && (
              <p className="text-sm text-aletis-grafite-claro py-8 text-center">
                Nenhuma commodity cadastrada. Adicione a primeira linha acima.
              </p>
            )}

            {exposicao.map((e, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3 p-3 rounded-lg border border-aletis-borda/50 bg-aletis-bege/20">
                <input
                  className="input-field py-2 text-sm"
                  placeholder="commodity"
                  value={e.commodity}
                  onChange={(ev) => setExposicao((prev) => prev.map((x, i) => i === idx ? { ...x, commodity: ev.target.value } : x))}
                />
                <input
                  className="input-field py-2 text-sm"
                  type="number"
                  placeholder="área (ha)"
                  value={e.areaHa}
                  onChange={(ev) => setExposicao((prev) => prev.map((x, i) => i === idx ? { ...x, areaHa: Number(ev.target.value) } : x))}
                />
                <input
                  className="input-field py-2 text-sm"
                  type="number"
                  placeholder="produtividade"
                  value={e.produtividade}
                  onChange={(ev) => setExposicao((prev) => prev.map((x, i) => i === idx ? { ...x, produtividade: Number(ev.target.value) } : x))}
                />
                <input
                  className="input-field py-2 text-sm"
                  placeholder="unid. prod."
                  value={e.unidadeProdutividade}
                  onChange={(ev) => setExposicao((prev) => prev.map((x, i) => i === idx ? { ...x, unidadeProdutividade: ev.target.value } : x))}
                />
                <input
                  className="input-field py-2 text-sm"
                  type="number"
                  placeholder="preço ref."
                  value={e.precoReferencia}
                  onChange={(ev) => setExposicao((prev) => prev.map((x, i) => i === idx ? { ...x, precoReferencia: Number(ev.target.value) } : x))}
                />
                <div className="flex items-center gap-1">
                  <input
                    className="input-field py-2 text-sm flex-1"
                    placeholder="unid. preço"
                    value={e.unidadePreco}
                    onChange={(ev) => setExposicao((prev) => prev.map((x, i) => i === idx ? { ...x, unidadePreco: ev.target.value } : x))}
                  />
                  <button
                    className="px-2 py-2 rounded text-red-600 hover:bg-red-50"
                    onClick={() => setExposicao((prev) => prev.filter((_, i) => i !== idx))}
                    title="Remover"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}

            {exposicao.length > 0 && (
              <div className="flex justify-end pt-3 border-t border-aletis-borda/60">
                <button
                  disabled={savingExposicao}
                  onClick={() => handleSalvarExposicao(exposicao)}
                  className="px-4 py-2 rounded-lg text-sm font-body font-semibold bg-aletis-dourado text-aletis-grafite-escuro hover:bg-aletis-dourado/90 disabled:opacity-50"
                >
                  {savingExposicao ? 'Salvando…' : 'Salvar Exposição'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: PATRIMÔNIO
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'patrimonio' && apiIdResolved && (
        <div className="animate-fade-in">
          <PatrimonioTab clienteId={apiIdResolved} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: VISITAS TÉCNICAS
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'visitas' && (
        <div className="space-y-4 animate-fade-in">
          {/* Form nova visita */}
          <div className="card-premium p-6">
            <h3 className="text-base font-display font-bold text-aletis-grafite-escuro mb-3">Nova Visita Técnica</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <input
                type="date"
                className="input-field py-2 text-sm"
                value={novaVisita.data}
                onChange={(e) => setNovaVisita((v) => ({ ...v, data: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Consultor"
                className="input-field py-2 text-sm"
                value={novaVisita.consultor}
                onChange={(e) => setNovaVisita((v) => ({ ...v, consultor: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Duração (min)"
                className="input-field py-2 text-sm"
                value={novaVisita.duracaoMinutos}
                onChange={(e) => setNovaVisita((v) => ({ ...v, duracaoMinutos: Number(e.target.value) }))}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3 p-3 rounded-lg bg-aletis-bege/20">
              {(Object.keys(novaVisita.checklist) as Array<keyof VisitaChecklist>).map((k) => (
                <label key={k} className="text-xs font-body flex items-center gap-1.5 cursor-pointer capitalize">
                  <input
                    type="checkbox"
                    checked={!!novaVisita.checklist[k]}
                    onChange={(e) =>
                      setNovaVisita((v) => ({
                        ...v,
                        checklist: { ...v.checklist, [k]: e.target.checked },
                      }))
                    }
                  />
                  {k.replace(/Ok$/, '').replace(/([A-Z])/g, ' $1').trim()}
                </label>
              ))}
            </div>
            <textarea
              className="input-field py-2 text-sm w-full mb-2"
              rows={2}
              placeholder="Observações gerais"
              value={novaVisita.observacoesGerais}
              onChange={(e) => setNovaVisita((v) => ({ ...v, observacoesGerais: e.target.value }))}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <textarea
                className="input-field py-2 text-sm"
                rows={3}
                placeholder="Riscos identificados (um por linha)"
                value={novaVisita.riscos}
                onChange={(e) => setNovaVisita((v) => ({ ...v, riscos: e.target.value }))}
              />
              <textarea
                className="input-field py-2 text-sm"
                rows={3}
                placeholder="Oportunidades (uma por linha)"
                value={novaVisita.oportunidades}
                onChange={(e) => setNovaVisita((v) => ({ ...v, oportunidades: e.target.value }))}
              />
            </div>
            <button
              disabled={savingVisita}
              onClick={handleCriarVisita}
              className="px-4 py-2 rounded-lg text-sm font-body font-semibold bg-aletis-verde text-white hover:bg-aletis-verde/90 disabled:opacity-50"
            >
              {savingVisita ? 'Salvando…' : 'Registrar Visita'}
            </button>
          </div>

          {/* Histórico */}
          {visitas.length > 0 && (
            <div className="card-premium p-6">
              <h3 className="text-base font-display font-bold text-aletis-grafite-escuro mb-3">
                Histórico ({visitas.length})
              </h3>
              <div className="space-y-3">
                {[...visitas].reverse().map((v) => {
                  const okCount = Object.values(v.checklist).filter(Boolean).length
                  const totalCount = Object.keys(v.checklist).length
                  return (
                    <div key={v.id} className="p-4 rounded-lg border border-aletis-borda/50 bg-aletis-bege/20">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                            {v.data} · {v.consultor}
                          </p>
                          <p className="text-[11px] font-body text-aletis-grafite-claro">
                            {v.duracaoMinutos ? `${v.duracaoMinutos} min · ` : ''}Checklist {okCount}/{totalCount}
                          </p>
                        </div>
                        <button
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => handleRemoverVisita(v.id)}
                        >
                          Remover
                        </button>
                      </div>
                      {v.observacoesGerais && (
                        <p className="text-xs font-body text-aletis-grafite-medio mt-1">{v.observacoesGerais}</p>
                      )}
                      {v.riscos && v.riscos.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-body font-semibold uppercase tracking-wider text-red-600">Riscos</p>
                          <ul className="list-disc list-inside text-xs font-body text-aletis-grafite-medio">
                            {v.riscos.map((r, i) => <li key={i}>{r}</li>)}
                          </ul>
                        </div>
                      )}
                      {v.oportunidades && v.oportunidades.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-body font-semibold uppercase tracking-wider text-positivo">Oportunidades</p>
                          <ul className="list-disc list-inside text-xs font-body text-aletis-grafite-medio">
                            {v.oportunidades.map((o, i) => <li key={i}>{o}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
           TAB: CHAT PORTAL (consultor ↔ cliente)
           ════════════════════════════════════════════════════════ */}
      {activeTab === 'portal-chat' && (
        <div className="space-y-4 animate-fade-in">
          {/* Status do acesso */}
          <div className="card-premium p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base font-display font-bold text-aletis-grafite-escuro">
                Mensagens do Portal do Cliente
              </h3>
              <p className="text-xs font-body text-aletis-grafite-claro mt-1">
                {portalStatus
                  ? `Usuário: ${portalStatus.usuario} · ${portalStatus.ativo ? 'ativo' : 'inativo'}`
                  : 'Cliente ainda sem acesso ao Portal. Crie a credencial em Configurações → Acessos Portal Cliente.'}
              </p>
            </div>
            {!portalStatus && (
              <button
                onClick={() => navigate('/configuracoes?tab=acessos')}
                className="btn-primary text-xs px-4 py-2"
              >
                Criar acesso
              </button>
            )}
          </div>

          {/* Chat */}
          <div className="card-premium overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-aletis-verde to-aletis-verde-medio flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-display font-bold text-xs">
                {cliente.nome.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-white font-body font-semibold text-sm">{cliente.nome}</p>
                <p className="text-white/60 text-xs font-body">
                  Responda diretamente — o cliente verá no Portal em tempo real
                </p>
              </div>
            </div>

            <div className="px-5 py-5 space-y-3 max-h-[520px] overflow-y-auto custom-scrollbar bg-aletis-bege/30">
              {portalMensagens.length === 0 ? (
                <p className="text-center text-sm font-body text-aletis-grafite-claro py-8">
                  Nenhuma mensagem trocada ainda.
                </p>
              ) : (
                portalMensagens.map((msg) => {
                  const meu = msg.de === 'consultor'
                  return (
                    <div key={msg.id} className={`flex ${meu ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                          meu
                            ? 'bg-aletis-verde text-white rounded-br-md'
                            : 'bg-white border border-aletis-borda text-aletis-grafite-escuro rounded-bl-md shadow-sm'
                        }`}
                      >
                        <p className="text-sm font-body leading-relaxed whitespace-pre-wrap">
                          {msg.texto}
                        </p>
                        <p
                          className={`text-[10px] font-body mt-1 flex items-center gap-1 ${
                            meu ? 'text-white/70' : 'text-aletis-grafite-claro'
                          }`}
                        >
                          {msg.autorNome} ·{' '}
                          {new Date(msg.criadoEm).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {meu && msg.lidaEm && <span className="ml-1">✓✓</span>}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-aletis-borda/60 bg-white">
              <div className="flex items-center gap-3">
                <textarea
                  value={portalChatInput}
                  onChange={(e) => setPortalChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleEnviarMsgPortal()
                    }
                  }}
                  placeholder={
                    portalStatus
                      ? 'Digite sua resposta ao cliente…'
                      : 'Cliente sem acesso ao Portal — crie a credencial para ativar o canal.'
                  }
                  disabled={!portalStatus}
                  rows={2}
                  className="input-field py-2.5 text-sm flex-1 resize-none"
                  maxLength={2000}
                />
                <button
                  onClick={handleEnviarMsgPortal}
                  disabled={!portalChatInput.trim() || enviandoMsgPortal || !portalStatus}
                  className="btn-primary px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enviandoMsgPortal ? '…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
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

function ClimaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-aletis-bege/50 border border-aletis-borda/60 px-3 py-2">
      <p className="text-[10px] font-body text-aletis-grafite-claro uppercase tracking-wider">{label}</p>
      <p className="text-sm font-body font-semibold text-aletis-grafite-escuro mt-0.5 truncate">{value}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   PainelInteligente — 6 cards de análises automáticas (Cliente Inteligente)
   Consome o snapshot produzido pelo AutoCalcOrchestrator no backend.
═══════════════════════════════════════════════════════════════════════ */

interface PainelInteligenteProps {
  analises: AnaliseCliente | null
  loading: boolean
  recalculando: boolean
  onRecalcular: () => void
}

function PainelInteligente({ analises, loading, recalculando, onRecalcular }: PainelInteligenteProps) {
  if (loading && !analises) {
    return (
      <div className="rounded-2xl border border-aletis-borda bg-white p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center animate-pulse">
            <Sparkles className="w-4 h-4 text-aletis-verde" />
          </div>
          <div>
            <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
              Painel Inteligente
            </h3>
            <p className="text-xs font-body text-aletis-grafite-claro">Calculando análises automáticas...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-aletis-bege/40 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!analises) {
    return (
      <div className="rounded-2xl border border-aletis-borda bg-white p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-aletis-verde" />
            </div>
            <div>
              <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
                Painel Inteligente
              </h3>
              <p className="text-xs font-body text-aletis-grafite-claro">
                Análises ainda não foram geradas.
              </p>
            </div>
          </div>
          <button
            onClick={onRecalcular}
            disabled={recalculando}
            className="text-xs font-body font-semibold text-aletis-verde px-3 py-1.5 rounded-lg border border-aletis-verde hover:bg-aletis-verde hover:text-white transition-colors disabled:opacity-60"
          >
            {recalculando ? 'Calculando...' : 'Calcular agora'}
          </button>
        </div>
      </div>
    )
  }

  const { srai, abs, saldoRecalculado, projecao5Safras, fluxoCaixaSafra, margemCliente, alertasTop, recomendacoes } = analises

  return (
    <div className="rounded-2xl border border-aletis-borda bg-gradient-to-br from-white to-aletis-bege/30 p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-aletis-verde to-aletis-dourado flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
              Painel Inteligente
            </h3>
            <p className="text-[11px] font-body text-aletis-grafite-claro">
              {analises.versao} · gerado em {new Date(analises.geradoEm).toLocaleString('pt-BR')} · {analises.duracaoMs}ms
            </p>
          </div>
        </div>
        <button
          onClick={onRecalcular}
          disabled={recalculando}
          className="text-xs font-body font-semibold text-aletis-verde px-3 py-1.5 rounded-lg border border-aletis-verde hover:bg-aletis-verde hover:text-white transition-colors disabled:opacity-60"
        >
          {recalculando ? 'Recalculando...' : 'Recalcular'}
        </button>
      </div>

      {/* Recomendações do SmartAdvisor — o "que fazer agora" */}
      {recomendacoes && recomendacoes.length > 0 && (
        <div className="mb-4 rounded-xl border border-aletis-verde/30 bg-gradient-to-br from-aletis-verde/5 to-aletis-dourado/5 p-3">
          <p className="text-[11px] font-body font-semibold uppercase tracking-wider text-aletis-verde-escuro mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Recomendações ({recomendacoes.length})
          </p>
          <ul className="space-y-2">
            {recomendacoes.slice(0, 5).map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-aletis-borda bg-white px-3 py-2 flex items-start gap-3"
              >
                <span
                  className={
                    'inline-flex items-center justify-center text-[10px] font-bold font-mono w-6 h-6 rounded-md flex-shrink-0 mt-0.5 ' +
                    (r.prioridade === 'p1'
                      ? 'bg-red-100 text-red-700'
                      : r.prioridade === 'p2'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-sky-100 text-sky-700')
                  }
                >
                  {r.prioridade.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-display font-semibold text-aletis-grafite-escuro leading-tight">
                      {r.titulo}
                    </span>
                    <span className="text-[9px] uppercase tracking-wider font-body font-semibold text-aletis-grafite-claro bg-aletis-bege/60 px-1.5 py-0.5 rounded">
                      {r.categoria}
                    </span>
                  </div>
                  <p className="text-[11px] font-body text-aletis-grafite-medio mt-1 leading-snug">{r.acao}</p>
                  <p className="text-[10px] font-body text-aletis-grafite-claro mt-1 italic leading-snug">
                    {r.justificativa}
                  </p>
                  {r.impactoEstimado && (
                    <p className="text-[10px] font-body text-aletis-verde font-semibold mt-1">
                      Impacto: {r.impactoEstimado}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Radar de alertas */}
      {alertasTop.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-[11px] font-body font-semibold uppercase tracking-wider text-amber-800 mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Radar ({alertasTop.length})
          </p>
          <ul className="space-y-1">
            {alertasTop.map((a, i) => (
              <li key={i} className="text-xs font-body text-aletis-grafite-escuro flex items-start gap-2">
                <span
                  className={
                    'inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ' +
                    (a.nivel === 'critico'
                      ? 'bg-red-500'
                      : a.nivel === 'alto'
                        ? 'bg-orange-500'
                        : a.nivel === 'moderado'
                          ? 'bg-amber-500'
                          : 'bg-sky-500')
                  }
                />
                <span className="flex-1 leading-snug">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-aletis-grafite-claro mr-1.5">
                    {a.origem}
                  </span>
                  {a.mensagem}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6 cards automáticos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Card 1 — SRAI */}
        <CardAnalise
          icon={<TrendingDown className="w-4 h-4" />}
          titulo="Score SRAI"
          legenda={srai?.versao ?? '—'}
          vazio={!srai}
        >
          {srai && (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className={
                    'text-3xl font-display font-bold ' +
                    (srai.classificacao === 'baixo'
                      ? 'text-positivo'
                      : srai.classificacao === 'moderado'
                        ? 'text-amber-600'
                        : srai.classificacao === 'alto'
                          ? 'text-orange-600'
                          : 'text-red-600')
                  }
                >
                  {srai.scoreTotal}
                </span>
                <span className="text-xs font-body uppercase tracking-wider text-aletis-grafite-medio">
                  risco {srai.classificacao}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {Object.entries(srai.componentes).map(([k, v]) => (
                  <div key={k} className="rounded bg-aletis-bege/60 px-1.5 py-1">
                    <p className="text-[9px] font-body text-aletis-grafite-claro uppercase truncate">{k.slice(0, 4)}</p>
                    <p className="text-xs font-body font-semibold text-aletis-grafite-escuro">{v}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardAnalise>

        {/* Card 2 — ABS */}
        <CardAnalise
          icon={<FileCheck className="w-4 h-4" />}
          titulo="Elegibilidade AB+S"
          legenda={abs?.versao ?? '—'}
          vazio={!abs}
        >
          {abs && (
            <>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className={
                    'text-lg font-display font-bold capitalize ' +
                    (abs.nivelElegibilidade === 'integral'
                      ? 'text-positivo'
                      : abs.nivelElegibilidade === 'parcial'
                        ? 'text-amber-600'
                        : abs.nivelElegibilidade === 'condicional'
                          ? 'text-orange-600'
                          : 'text-red-600')
                  }
                >
                  {abs.nivelElegibilidade}
                </span>
                <span className="text-2xl font-display font-bold text-aletis-grafite-escuro">
                  {abs.scorePercentual}%
                </span>
              </div>
              {abs.taxasEstimadasPct.max > 0 && (
                <p className="text-xs font-body text-aletis-grafite-medio mt-1">
                  Taxa estimada: {abs.taxasEstimadasPct.min}%–{abs.taxasEstimadasPct.max}% a.a.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {abs.checkpoints.slice(0, 4).map((c) => (
                  <span
                    key={c.item}
                    className={
                      'text-[10px] font-body px-1.5 py-0.5 rounded ' +
                      (c.status === 'ok'
                        ? 'bg-positivo/15 text-positivo'
                        : c.status === 'pendente'
                          ? 'bg-amber-100 text-amber-700'
                          : c.status === 'falha'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-aletis-bege/60 text-aletis-grafite-medio')
                    }
                  >
                    {c.item}
                  </span>
                ))}
              </div>
            </>
          )}
        </CardAnalise>

        {/* Card 3 — Saldo recalculado */}
        <CardAnalise
          icon={<CreditCard className="w-4 h-4" />}
          titulo="Saldo Recalculado"
          legenda={saldoRecalculado ? `Juros ${saldoRecalculado.taxaMensalPadrao}% a.m.` : '—'}
          vazio={!saldoRecalculado}
        >
          {saldoRecalculado && (
            <>
              <p className="text-2xl font-display font-bold text-aletis-grafite-escuro font-mono">
                {formatBRLCompact(saldoRecalculado.totalSaldoRecalculado)}
              </p>
              <div className="mt-1 flex flex-col gap-0.5">
                <p className="text-[11px] font-body text-aletis-grafite-medio">
                  Principal{' '}
                  <span className="font-mono text-aletis-grafite-escuro">
                    {formatBRLCompact(saldoRecalculado.totalValorOriginal)}
                  </span>
                </p>
                <p className="text-[11px] font-body text-aletis-grafite-medio">
                  Juros acumulados{' '}
                  <span className="font-mono text-red-700 font-semibold">
                    +{formatBRLCompact(saldoRecalculado.totalJurosAcumulados)}
                  </span>
                </p>
                <p className="text-[10px] font-body text-aletis-grafite-claro">
                  {saldoRecalculado.porDivida.length} dívida(s) · corte {saldoRecalculado.dataCorte}
                </p>
              </div>
            </>
          )}
        </CardAnalise>

        {/* Card 4 — Projeção 5 safras */}
        <CardAnalise
          icon={<TrendingUp className="w-4 h-4" />}
          titulo="Projeção 5 safras"
          legenda={projecao5Safras ? `VPL a 12% aa` : 'Cultura não informada'}
          vazio={!projecao5Safras}
        >
          {projecao5Safras && (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className={
                    'text-lg font-display font-bold ' +
                    (projecao5Safras.viabilidade === 'VIAVEL'
                      ? 'text-positivo'
                      : projecao5Safras.viabilidade === 'APERTADO'
                        ? 'text-amber-600'
                        : 'text-red-600')
                  }
                >
                  {projecao5Safras.viabilidade}
                </span>
                <span className="text-sm font-mono font-semibold text-aletis-grafite-escuro">
                  VPL {formatBRLCompact(projecao5Safras.valorPresenteLiquido)}
                </span>
              </div>
              <div className="mt-2 flex gap-0.5 items-end h-10">
                {projecao5Safras.anos.map((a) => {
                  const maxAbs = Math.max(
                    ...projecao5Safras.anos.map((x) => Math.abs(x.saldoLiquido) || 1),
                  )
                  const h = Math.max(3, Math.round((Math.abs(a.saldoLiquido) / maxAbs) * 36))
                  return (
                    <div
                      key={a.ano}
                      className="flex-1 flex flex-col items-center gap-0.5"
                      title={`${a.safra}: ${formatBRLCompact(a.saldoLiquido)}`}
                    >
                      <div
                        style={{ height: `${h}px` }}
                        className={
                          'w-full rounded-sm ' +
                          (a.saldoLiquido >= 0 ? 'bg-positivo/70' : 'bg-red-500/70')
                        }
                      />
                      <span className="text-[9px] font-mono text-aletis-grafite-claro">{a.ano}</span>
                    </div>
                  )
                })}
              </div>
              {projecao5Safras.anosCriticos.length > 0 && (
                <p className="text-[10px] font-body text-red-700 mt-1">
                  Críticos: {projecao5Safras.anosCriticos.join(', ')}
                </p>
              )}
            </>
          )}
        </CardAnalise>

        {/* Card 5 — Fluxo caixa safra */}
        <CardAnalise
          icon={<DollarSign className="w-4 h-4" />}
          titulo="Fluxo Safra"
          legenda={fluxoCaixaSafra ? `+6m pós-colheita` : 'Cultura não informada'}
          vazio={!fluxoCaixaSafra}
        >
          {fluxoCaixaSafra && (
            <>
              <p
                className={
                  'text-2xl font-display font-bold font-mono ' +
                  (fluxoCaixaSafra.saldoLivre >= 0 ? 'text-positivo' : 'text-red-600')
                }
              >
                {formatBRLCompact(fluxoCaixaSafra.saldoLivre)}
              </p>
              <p className="text-[11px] font-body text-aletis-grafite-medio mt-0.5">saldo livre da safra</p>
              <div className="mt-2 space-y-0.5">
                <LinhaKV k="Receita" v={formatBRLCompact(fluxoCaixaSafra.receitaBruta)} />
                <LinhaKV k="Custo" v={formatBRLCompact(fluxoCaixaSafra.custoTotal)} />
                <LinhaKV k="Dívidas" v={formatBRLCompact(fluxoCaixaSafra.totalDividas)} />
                <LinhaKV
                  k="Comprometimento"
                  v={`${fluxoCaixaSafra.capacidadePagamento.toFixed(0)}% da margem`}
                  destaque={
                    fluxoCaixaSafra.capacidadePagamento > 100
                      ? 'red'
                      : fluxoCaixaSafra.capacidadePagamento > 70
                        ? 'amber'
                        : 'green'
                  }
                />
              </div>
            </>
          )}
        </CardAnalise>

        {/* Card 6 — Margem cliente (Financeiro) */}
        <CardAnalise
          icon={<Handshake className="w-4 h-4" />}
          titulo="Margem Cliente"
          legenda={margemCliente ? margemCliente.classificacao.toUpperCase() : 'Sem lançamentos'}
          vazio={!margemCliente}
        >
          {margemCliente && (
            <>
              <div className="flex items-baseline gap-2">
                <span
                  className={
                    'text-2xl font-display font-bold font-mono ' +
                    (margemCliente.margem >= 0 ? 'text-positivo' : 'text-red-600')
                  }
                >
                  {formatBRLCompact(margemCliente.margem)}
                </span>
                <span className="text-sm font-body font-semibold text-aletis-grafite-medio">
                  {margemCliente.margemPct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 space-y-0.5">
                <LinhaKV k="Receita líquida" v={formatBRLCompact(margemCliente.receitaLiquida)} />
                <LinhaKV k="Despesas" v={formatBRLCompact(margemCliente.despesasAtribuidas)} />
              </div>
              <span
                className={
                  'inline-block mt-2 text-[10px] font-body font-semibold uppercase tracking-wider px-2 py-0.5 rounded ' +
                  (margemCliente.classificacao === 'ouro'
                    ? 'bg-aletis-dourado/20 text-aletis-dourado'
                    : margemCliente.classificacao === 'prata'
                      ? 'bg-sky-100 text-sky-700'
                      : margemCliente.classificacao === 'bronze'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-red-100 text-red-700')
                }
              >
                {margemCliente.classificacao}
              </span>
            </>
          )}
        </CardAnalise>
      </div>
    </div>
  )
}

function CardAnalise({
  icon,
  titulo,
  legenda,
  vazio,
  children,
}: {
  icon: React.ReactNode
  titulo: string
  legenda: string
  vazio: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl bg-white border border-aletis-borda/60 p-3.5 hover:border-aletis-verde/40 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-md bg-aletis-verde/10 flex items-center justify-center text-aletis-verde">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-display font-semibold text-aletis-grafite-escuro truncate">
            {titulo}
          </p>
          <p className="text-[10px] font-body text-aletis-grafite-claro truncate">{legenda}</p>
        </div>
      </div>
      {vazio ? (
        <p className="text-xs font-body italic text-aletis-grafite-claro py-2">Dados insuficientes</p>
      ) : (
        <div>{children}</div>
      )}
    </div>
  )
}

function LinhaKV({ k, v, destaque }: { k: string; v: string; destaque?: 'red' | 'amber' | 'green' }) {
  const cor =
    destaque === 'red' ? 'text-red-600' : destaque === 'amber' ? 'text-amber-700' : destaque === 'green' ? 'text-positivo' : 'text-aletis-grafite-escuro'
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] font-body">
      <span className="text-aletis-grafite-medio truncate">{k}</span>
      <span className={`font-mono font-semibold ${cor}`}>{v}</span>
    </div>
  )
}

