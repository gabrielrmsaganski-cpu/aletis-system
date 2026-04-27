import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Target,
  Flame,
  Search,
  Filter,
  Download,
  X,
  Loader2,
  MapPin,
  Building2,
  Users,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  FileText,
  BarChart3,
  Gauge,
  DollarSign,
  Hash,
  Calendar,
  Gavel,
  Wheat,
  Tractor,
  RefreshCw,
  Eye,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Info,
  Cpu,
  Satellite,
  ShieldCheck,
  ShieldAlert,
  Trees,
  Trash2,
  RotateCcw,
  Zap,
  Package,
  Archive,
  StopCircle,
  ListChecks,
  UserPlus,
  PhoneCall,
  MessageSquare,
  History,
  Siren,
  RotateCw,
  Database,
} from 'lucide-react'
import { TabSocios } from '../components/prospeccao/TabSocios'

// ────────────────────────────────────────────────────────────
// Tipos (espelham backend apps/api/src/services/prospeccao/types.ts)
// ────────────────────────────────────────────────────────────
interface DebtRecord {
  fonte: string
  inscricao: string
  tipoSituacao: string
  situacao: string
  tipoCredito: string
  dataInscricao: string
  ajuizado: boolean
  valor: number
}
interface CnpjEnrichment {
  razaoSocial: string
  nomeFantasia?: string
  cnaeFiscal: string
  cnaeFiscalDescricao: string
  cnaesSecundarios: Array<{ codigo: string; descricao: string }>
  situacaoCadastral: string
  motivoSituacaoCadastral?: string
  situacaoEspecial?: string
  dataAbertura: string
  capitalSocial: number
  porte?: string
  naturezaJuridica?: string
  endereco: {
    logradouro: string
    numero: string
    bairro: string
    municipio: string
    uf: string
    cep: string
  }
  socios: Array<{
    nome: string
    qualificacao: string
    dataEntrada?: string
    faixaEtaria?: string
  }>
}
interface AreaEstimation {
  hectaresEstimados: number
  confidence: 'baixa' | 'media' | 'alta'
  metodo: string
  explicacao: string
  hectaresSicar?: number
}
type AgroProfileNivel = 'forte' | 'medio' | 'fraco'
type PfProfileNivel = 'forte' | 'medio' | 'fraco' | 'nenhum'
type JudicialSeverity = 'alta' | 'media' | 'baixa' | 'nenhuma'
type JudicialTipo =
  | 'recuperacao_judicial'
  | 'falencia'
  | 'insolvencia'
  | 'leilao'
  | 'penhora'
  | 'liquidacao_judicial'
  | 'situacao_especial'
interface AgroProfile {
  nivel: AgroProfileNivel
  provavel: boolean
  score: number
  explicacao: string
  evidencias: string[]
}
interface PfProfile {
  relevante: boolean
  nivel: PfProfileNivel
  score: number
  explicacao: string
  evidencias: string[]
}
interface JudicialProfile {
  ativo: boolean
  severidade: JudicialSeverity
  tipos: JudicialTipo[]
  explicacao: string
  evidencias: string[]
}
interface JudicialEvent {
  tipo: JudicialTipo
  fonte: string
  data: string
  resumo: string
  url?: string
  severidade: Exclude<JudicialSeverity, 'nenhuma'>
}
interface LeadScore {
  total: number
  breakdown: {
    divida: number
    ajuizamento: number
    recencia: number
    agroMatch: number
    hectares: number
    velocity: number
    fitRegional: number
    multiSource: number
    douCrise: number
  }
  motivos?: {
    velocity?: string
    fitRegional?: string
    multiSource?: string
    douCrise?: string
  }
  classificacao: 'quente' | 'morno' | 'frio' | 'reativo'
  honorariosEstimados: number
}
interface CarConsultaResult {
  codImovel: string
  areaImovel: number
  municipio: string
  uf: string
  modulosFiscais?: number
  areaAntropizada?: number
  areaReservaLegal?: number
  areaPreservacaoPermanente?: number
  areaVegetacaoNativa?: number
  condicaoCadastro: string
  statusAnalise?: string
  dataCadastro?: string
  tipoImovel?: 'IRU' | 'AST' | 'PCT'
  consultadoEm: string
}
type LeadStatus = 'pendente' | 'completa' | 'excluido'
type ContactOutcomeTipo =
  | 'sucesso'
  | 'interessado'
  | 'retornar'
  | 'recusou'
  | 'ja_regularizou'
  | 'nao_agro'
  | 'fora_target'
type ContactCanal = 'whatsapp' | 'telefone' | 'email' | 'presencial' | 'outro'
interface ContactOutcome {
  cpfCnpj: string
  cpfCnpjClean: string
  tipo: ContactOutcomeTipo
  canal?: ContactCanal
  notas?: string
  registradoPor?: string
  registradoEm: string
}
interface LeadFeedback {
  totalContatos: number
  ultimoOutcome?: ContactOutcomeTipo
  ultimoContatoEm?: string
  ajusteScore: number
  reengajar: boolean
}
interface HotLeadAlert {
  cpfCnpj: string
  cpfCnpjClean: string
  nome: string
  uf: string
  scoreTotal: number
  classificacao: 'quente' | 'morno' | 'frio' | 'reativo'
  honorariosEstimados: number
  totalDivida: number
  ultimoContatoEm?: string
  diasSemContato: number
  urgencia: 'imediata' | 'alta' | 'media'
  motivo: string
}
export interface LeadFull {
  cpfCnpj: string
  cpfCnpjClean: string
  tipoPessoa: 'PF' | 'PJ'
  nome: string
  uf: string
  agroSignals: string[]
  totalDivida: number
  qtdInscricoes: number
  temAjuizada: boolean
  primeiraInscricao: string
  ultimaInscricao: string
  debts: DebtRecord[]
  judicialEvents?: JudicialEvent[]
  sources?: Array<{ fonte: string; ingestedAt: string }>
  cnpj?: CnpjEnrichment
  area: AreaEstimation
  car?: CarConsultaResult
  carSource?: 'offline' | 'live'
  carOutrosImoveis?: CarConsultaResult[]
  score: LeadScore
  agroProfile: AgroProfile
  pfProfile: PfProfile
  judicialProfile: JudicialProfile
  status?: LeadStatus
  enriquecido?: boolean
  enriquecidoEm?: string
  excluidoMotivo?: string
  excluidoEm?: string
  feedback?: LeadFeedback
  contatos?: ContactOutcome[]
}
interface BuscaCounts {
  pendentes: number
  completas: number
  excluidos: number
  todos: number
}
interface SicarIndexStats {
  loaded: boolean
  generatedAt: string | null
  totalImoveis: number
  comCpfCnpj: number
  comNome: number
  byUf: Record<string, number>
  sizeMb: number | null
}
interface SicarStatus {
  sicar: { online: boolean; reason?: string; sitekey?: string }
  captcha: { enabled: boolean; balanceUsd: number | null; error: string | null }
  index: SicarIndexStats
}
interface FilaJob {
  id: string
  cpfCnpj: string
  prioridade: 'alta' | 'normal' | 'baixa'
  motivo: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  attempts: number
  nextAttemptAt: number
  lastError?: string
  batchId?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}
interface FilaStats {
  pending: number
  running: number
  done: number
  failed: number
  cancelled: number
  ultimasFalhas: FilaJob[]
  emVoo: FilaJob[]
  proximos: FilaJob[]
}
interface Stats {
  totalLeads: number
  totalDivida: number
  honorariosPotenciaisTotal: number
  leadsQuentes: number
  leadsComAjuizamento: number
  leadsCompletos: number
  leadsExcluidos: number
  leadsAgroProvavel: number
  leadsPfRural: number
  leadsJudicialAgro: number
  hotLeadsPendentes: number
  leadsParaReengajar: number
  porUf: Array<{ uf: string; count: number; divida: number }>
  porFaixaDivida: Array<{ faixa: string; count: number }>
  porJudicialTipo: Array<{ tipo: JudicialTipo; count: number }>
  topSignals: Array<{ signal: string; count: number }>
  manifest: { fonte: string; atualizadoEm: string }
  fontes?: Array<{
    fonte: string
    descricao: string
    contagem: number
    lastIngestAt: string | null
  }>
}

const OUTCOME_LABEL: Record<ContactOutcomeTipo, { label: string; tone: 'green' | 'amber' | 'sky' | 'red' | 'slate' }> = {
  sucesso: { label: 'Avançou (sucesso)', tone: 'green' },
  interessado: { label: 'Interessado — aguardando', tone: 'green' },
  retornar: { label: 'Reagendar — retornar', tone: 'amber' },
  recusou: { label: 'Recusou', tone: 'red' },
  ja_regularizou: { label: 'Já regularizou', tone: 'slate' },
  nao_agro: { label: 'Não é agro', tone: 'slate' },
  fora_target: { label: 'Fora de target', tone: 'slate' },
}

const URGENCIA_STYLE: Record<HotLeadAlert['urgencia'], { bg: string; text: string; border: string; label: string }> = {
  imediata: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-800', label: 'Imediata' },
  alta: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800', label: 'Alta' },
  media: { bg: 'bg-sky-50 dark:bg-sky-950/30', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-300 dark:border-sky-800', label: 'Média' },
}

const fmtDate = (iso?: string): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

type BatchPhase = 'idle' | 'starting' | 'running' | 'done' | 'cancelled' | 'error'
interface BatchState {
  phase: BatchPhase
  batchId: string | null
  total: number
  processed: number
  ok: number
  fail: number
  lastLead?: {
    cpfCnpj: string
    nome: string
    uf: string
    hectares?: number
    carSource?: 'offline' | 'live'
    score?: number
    error?: string
  } | null
  errors: string[]
}

// ────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────
export const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtBRLShort = (v: number): string => {
  // Formato compacto pt-BR — um único dígito após a vírgula para legibilidade,
  // sem arrastar centavos irrelevantes em valores grandes.
  const f = (x: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  if (v >= 1e12) return `R$ ${f(v / 1e12)} tri`
  if (v >= 1e9) return `R$ ${f(v / 1e9)} bi`
  if (v >= 1e6) return `R$ ${f(v / 1e6)} mi`
  if (v >= 1e3) return `R$ ${f(v / 1e3)} mil`
  return `R$ ${v.toFixed(0)}`
}
const fmtHa = (ha: number): string =>
  ha >= 1000 ? `${(ha / 1000).toFixed(ha >= 10000 ? 0 : 1)} mil ha` : `${ha.toLocaleString('pt-BR')} ha`
const fmtNum = (n: number): string => n.toLocaleString('pt-BR')

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export const CLASSIF_STYLE: Record<string, { bg: string; text: string; border: string; label: string; icon: React.ElementType }> = {
  quente: { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-800', label: 'Quente', icon: Flame },
  morno: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800', label: 'Morno', icon: Target },
  frio: { bg: 'bg-sky-50 dark:bg-sky-950/30', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-300 dark:border-sky-800', label: 'Frio', icon: Gauge },
  reativo: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-300 dark:border-slate-700', label: 'Reativo', icon: Info },
}

const CONFIDENCE_COLOR: Record<string, string> = {
  alta: 'text-green-600 dark:text-green-400',
  media: 'text-amber-600 dark:text-amber-400',
  baixa: 'text-slate-500 dark:text-slate-500',
}

const JUDICIAL_LABEL: Record<JudicialTipo, string> = {
  recuperacao_judicial: 'RJ',
  falencia: 'Falência',
  insolvencia: 'Insolvência',
  leilao: 'Leilão',
  penhora: 'Penhora',
  liquidacao_judicial: 'Liquidação',
  situacao_especial: 'Sit. especial',
}

const JUDICIAL_STYLE: Record<JudicialSeverity, { badge: string; text: string; border: string }> = {
  alta: {
    badge: 'bg-red-100 dark:bg-red-950/30',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-300 dark:border-red-800',
  },
  media: {
    badge: 'bg-amber-100 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-800',
  },
  baixa: {
    badge: 'bg-sky-100 dark:bg-sky-950/30',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-300 dark:border-sky-800',
  },
  nenhuma: {
    badge: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-400',
    border: 'border-slate-300 dark:border-slate-700',
  },
}

// Labels amigáveis das fontes PGFN (valores reais observados no dataset).
const FONTE_LABEL: Record<string, { label: string; desc: string }> = {
  PREV: { label: 'Previdenciário', desc: 'Contribuições ao INSS (empregador, segurado, terceiros)' },
  NAOPREV: { label: 'Não-previdenciário', desc: 'Tributos federais (IRPJ, CSLL, PIS, COFINS, IRRF, multas)' },
  FGTS: { label: 'FGTS', desc: 'Débitos ao Fundo de Garantia do Tempo de Serviço' },
}

// Normaliza nomes longos de `tipoCredito` (ex.: "Receita da dívida ativa - COFINS" → "COFINS").
function shortTipoCredito(raw: string): string {
  if (!raw || raw === 'OUTROS') return raw || '—'
  return raw
    .replace(/^Receita\s+da\s+d[ií]vida\s+ativa\s*-\s*/i, '')
    .replace(/^R\s+D\s+Ativa\s*-\s*/i, '')
    .replace(/^Rec\.\s+d[ií]v\.\s+ativa\s*-\s*/i, '')
    .trim()
}

// Classifica uma situação PGFN em um bucket visual auditável.
type SituacaoBucket = 'ajuizada' | 'rescindido' | 'cobranca' | 'negociado' | 'suspenso' | 'outro'
function situacaoBucket(s: string): SituacaoBucket {
  const up = (s || '').toUpperCase()
  if (up.includes('RESCINDIDO')) return 'rescindido'
  if (up.includes('SUSPEN')) return 'suspenso'
  if (up.includes('SISPAR') || up.includes('NEGOCIAD')) return 'negociado'
  if (up.includes('AJUIZ')) return 'ajuizada'
  if (up.includes('COBRANC')) return 'cobranca'
  return 'outro'
}

const SITUACAO_STYLE: Record<SituacaoBucket, { label: string; chip: string }> = {
  ajuizada: { label: 'Ajuizada', chip: 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800' },
  rescindido: { label: 'Parcelam. rescindido', chip: 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800' },
  cobranca: { label: 'Em cobrança', chip: 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800' },
  negociado: { label: 'Negociado (Sispar)', chip: 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800' },
  suspenso: { label: 'Suspenso (judicial)', chip: 'bg-sky-100 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800' },
  outro: { label: 'Outro', chip: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700' },
}

// ────────────────────────────────────────────────────────────
// Página principal
// ────────────────────────────────────────────────────────────
export default function Prospeccao() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [leads, setLeads] = useState<LeadFull[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<BuscaCounts>({ pendentes: 0, completas: 0, excluidos: 0, todos: 0 })
  const [loading, setLoading] = useState(false)
  const [loadingStats, setLoadingStats] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [uf, setUf] = useState<string>('')
  const [minHectares, setMinHectares] = useState<number>(1000)
  const [minDivida, setMinDivida] = useState<number>(500_000)
  const [maxDivida, setMaxDivida] = useState<number | undefined>(undefined)
  const [tipoPessoa, setTipoPessoa] = useState<'PF' | 'PJ' | ''>('')
  const [apenasAjuizadas, setApenasAjuizadas] = useState<boolean>(false)
  const [apenasAgroProvavel, setApenasAgroProvavel] = useState<boolean>(false)
  const [apenasPfRural, setApenasPfRural] = useState<boolean>(false)
  const [apenasJudicialAgro, setApenasJudicialAgro] = useState<boolean>(false)
  const [judicialTipos, setJudicialTipos] = useState<JudicialTipo[]>([])
  const [termo, setTermo] = useState<string>('')
  const [sortBy, setSortBy] = useState<'score' | 'divida' | 'hectares' | 'recencia'>('score')
  const [statusTab, setStatusTab] = useState<'todos' | 'pendente' | 'completa' | 'excluido'>('todos')
  const [page, setPage] = useState(1)
  const pageSize = 25

  const [selectedLead, setSelectedLead] = useState<LeadFull | null>(null)
  const [enriching, setEnriching] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sicarStatus, setSicarStatus] = useState<SicarStatus | null>(null)
  const [carLoading, setCarLoading] = useState<string | null>(null)
  const [carError, setCarError] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState<string | null>(null)
  const [iniciarMsg, setIniciarMsg] = useState<{ tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null>(null)
  const [enrichFlash, setEnrichFlash] = useState<{ at: number; lines: string[]; isError?: boolean } | null>(null)
  // Auto-dismiss global (4.5s) — funciona mesmo se o drawer estiver fechado.
  useEffect(() => {
    if (!enrichFlash) return
    const t = setTimeout(() => setEnrichFlash(null), 4500)
    return () => clearTimeout(t)
  }, [enrichFlash])
  const navigate = useNavigate()

  // Bulk enrich
  const [bulkOpen, setBulkOpen] = useState(false)
  const [batch, setBatch] = useState<BatchState>({
    phase: 'idle', batchId: null, total: 0, processed: 0, ok: 0, fail: 0, errors: [],
  })

  // Feedback loop (hot-leads + reengajamento)
  const [hotLeads, setHotLeads] = useState<HotLeadAlert[]>([])
  const [loadingHot, setLoadingHot] = useState(false)
  const [registrandoContato, setRegistrandoContato] = useState(false)
  const [contatoModalOpen, setContatoModalOpen] = useState(false)

  // Fila persistente de enriquecimento (Onda 3)
  const [filaStats, setFilaStats] = useState<FilaStats | null>(null)

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const r = await fetch('/api/prospeccao/stats')
      const j = await r.json()
      if (j.success) setStats(j.data)
    } catch (e: any) {
      console.warn('[prospeccao] stats error', e)
    } finally {
      setLoadingStats(false)
    }
  }, [])

  const buildFilterBody = useCallback(() => ({
    uf: uf || undefined,
    minHectares: minHectares || undefined,
    minDivida: minDivida || undefined,
    maxDivida,
    tipoPessoa: tipoPessoa || undefined,
    apenasAjuizadas,
    apenasAgroProvavel,
    apenasPfRural,
    apenasJudicialAgro,
    judicialTipos: judicialTipos.length ? judicialTipos : undefined,
    termo: termo || undefined,
    status: statusTab,
    sortBy,
  }), [uf, minHectares, minDivida, maxDivida, tipoPessoa, apenasAjuizadas, apenasAgroProvavel, apenasPfRural, apenasJudicialAgro, judicialTipos, termo, sortBy, statusTab])

  const search = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const body = { ...buildFilterBody(), page, pageSize }
      const r = await fetch('/api/prospeccao/buscar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha na busca')
      setLeads(j.data.leads)
      setTotal(j.data.total)
      if (j.data.counts) setCounts(j.data.counts)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [buildFilterBody, page])

  const loadSicarStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/prospeccao/car/status')
      const j = await r.json()
      if (j.success) setSicarStatus(j.data)
    } catch (e) {
      console.warn('[sicar] status error', e)
    }
  }, [])

  const loadHotLeads = useCallback(async () => {
    setLoadingHot(true)
    try {
      const r = await fetch('/api/prospeccao/hot-leads?limite=20')
      const j = await r.json()
      if (j.success) setHotLeads(j.data)
    } catch (e) {
      console.warn('[hot-leads] erro', e)
    } finally {
      setLoadingHot(false)
    }
  }, [])

  const loadFilaStats = useCallback(async () => {
    try {
      const r = await fetch('/api/prospeccao/fila')
      const j = await r.json()
      if (j.success) setFilaStats(j.data)
    } catch (e) {
      console.warn('[fila] erro', e)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadSicarStatus() }, [loadSicarStatus])
  useEffect(() => { loadHotLeads() }, [loadHotLeads])
  useEffect(() => { search() }, [search])
  // Polling da fila — só ativa enquanto houver jobs em voo ou pendentes.
  useEffect(() => {
    loadFilaStats()
    const id = setInterval(loadFilaStats, 3000)
    return () => clearInterval(id)
  }, [loadFilaStats])
  // reset para página 1 quando a aba de status muda
  useEffect(() => { setPage(1) }, [statusTab])

  const handleEnrich = useCallback(async (cpfCnpj: string) => {
    setEnriching(cpfCnpj)
    const clean = cpfCnpj.replace(/\D/g, '')
    try {
      const before = leads.find((l) => l.cpfCnpjClean === clean)
      const r = await fetch(`/api/prospeccao/enriquecer/${encodeURIComponent(clean)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await r.json()
      if (j.success) {
        setSelectedLead(j.data)
        setLeads((prev) => prev.map((l) => (l.cpfCnpjClean === j.data.cpfCnpjClean ? j.data : l)))
        const next: LeadFull = j.data

        // Caso especial: PF com CPF mascarado no PGFN (só 6 dígitos) — BrasilAPI
        // não aceita CPF (só CNPJ) e SICAR individual exige CPF completo.
        // Explicamos ao usuário para evitar "não funcionou" silencioso.
        const isPseudoDoc = next.tipoPessoa === 'PF' && next.cpfCnpjClean.length < 11
        if (isPseudoDoc) {
          setEnrichFlash({
            at: Date.now(),
            lines: [
              'CPF mascarado pelo PGFN (sigilo fiscal) — sem CPF completo não é possível chamar BrasilAPI/RFB nem CAR individual.',
              next.car
                ? `índice SICAR casou: CAR ${next.car.codImovel} · ${fmtNum(next.car.areaImovel)} ha`
                : 'índice SICAR offline (portal em manutenção) → área continua estimada pela razão social + contexto UF',
            ],
          })
          return
        }

        // Resumo curto do que foi trazido — mostrado como flash verde no drawer por 4s.
        const delta: string[] = []
        if (!before?.cnpj && next.cnpj) delta.push(`CNPJ: ${next.cnpj.razaoSocial}${next.cnpj.cnaeFiscal ? ` · CNAE ${next.cnpj.cnaeFiscal}` : ''}`)
        if ((next.cnpj?.socios?.length ?? 0) > 0) delta.push(`${next.cnpj!.socios.length} sócios no QSA`)
        if (next.area?.hectaresEstimados && (before?.area?.hectaresEstimados ?? 0) !== next.area.hectaresEstimados)
          delta.push(`${fmtNum(next.area.hectaresEstimados)} ha (${next.area.metodo})`)
        if (next.car && !before?.car) delta.push(`CAR ${next.car.codImovel}`)
        if ((before?.score.total ?? 0) !== next.score.total)
          delta.push(`score ${next.score.total} · ${next.score.classificacao}`)
        setEnrichFlash({ at: Date.now(), lines: delta.length ? delta : ['dados já consolidados — nada novo materializado agora'] })
      } else {
        setEnrichFlash({ at: Date.now(), lines: [j.error || 'backend retornou erro'], isError: true })
      }
    } catch (e) {
      console.warn('[enrich] erro', e)
      setEnrichFlash({ at: Date.now(), lines: ['falha de rede ao enriquecer — tente novamente'], isError: true })
    } finally {
      setEnriching(null)
    }
  }, [leads])

  const handleConsultarCar = useCallback(async (cpfCnpj: string, codImovel: string) => {
    setCarLoading(cpfCnpj)
    setCarError(null)
    const clean = cpfCnpj.replace(/\D/g, '')
    try {
      const r = await fetch(`/api/prospeccao/enriquecer/${encodeURIComponent(clean)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codImovel }),
      })
      const j = await r.json()
      if (!j.success) {
        setCarError(j.error || 'Falha na consulta SICAR')
        return
      }
      setSelectedLead(j.data)
      setLeads((prev) => prev.map((l) => (l.cpfCnpjClean === j.data.cpfCnpjClean ? j.data : l)))
    } catch (e: any) {
      setCarError(e?.message || 'Falha na consulta SICAR')
    } finally {
      setCarLoading(null)
    }
  }, [])

  const handleExcluir = useCallback(async (cpfCnpj: string, motivo: string) => {
    setDeleting(cpfCnpj)
    const clean = cpfCnpj.replace(/\D/g, '')
    try {
      const r = await fetch(`/api/prospeccao/lead/${encodeURIComponent(clean)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao excluir')
      // Fecha drawer se estiver aberto no lead excluído
      setSelectedLead((sel) => (sel && sel.cpfCnpj === cpfCnpj ? null : sel))
      await Promise.all([search(), loadStats()])
    } catch (e) {
      console.warn('[delete] erro', e)
    } finally {
      setDeleting(null)
    }
  }, [search, loadStats])

  /**
   * Importa o lead PGFN para o funil CRM (estágio "prospecção").
   * Idempotente — se cpfCnpj já está no CRM, retorna o cliente existente.
   * Redireciona automaticamente para /clientes/:id ao concluir.
   */
  const handleIniciarProspeccao = useCallback(async (cpfCnpj: string) => {
    setIniciando(cpfCnpj)
    setIniciarMsg(null)
    try {
      const r = await fetch('/api/clientes/iniciar-prospeccao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpfCnpj }),
      })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao iniciar prospecção')
      setIniciarMsg({
        tipo: j.jaExistia ? 'info' : 'sucesso',
        texto: j.jaExistia
          ? 'Cliente já estava no funil — abrindo detalhes…'
          : 'Lead importado para o CRM — abrindo detalhes…',
      })
      setTimeout(() => navigate(`/clientes/${j.data.id}`), 600)
    } catch (e: any) {
      setIniciarMsg({ tipo: 'erro', texto: e?.message || 'Falha ao iniciar prospecção' })
    } finally {
      setIniciando(null)
    }
  }, [navigate])

  /**
   * Abre o drawer buscando detalhes completos do lead (usado pelo HotLeadsPanel).
   * Usa só-dígitos para não quebrar em CNPJs com "/" (ex: 11.111.111/0001-11).
   */
  const openLeadByCpf = useCallback(async (cpfCnpj: string) => {
    const clean = cpfCnpj.replace(/\D/g, '')
    try {
      const r = await fetch(`/api/prospeccao/lead/${encodeURIComponent(clean)}`)
      const j = await r.json()
      if (j.success) setSelectedLead(j.data)
    } catch (e) {
      console.warn('[open-lead] erro', e)
    }
  }, [])

  /**
   * Registra outcome de contato. Se o tipo for "porta fechada", o backend move
   * automaticamente o lead para a blacklist — refletimos fechando o drawer.
   */
  const handleRegistrarContato = useCallback(
    async (
      cpfCnpj: string,
      payload: { tipo: ContactOutcomeTipo; canal?: ContactCanal; notas?: string; registradoPor?: string },
    ) => {
      setRegistrandoContato(true)
      const clean = cpfCnpj.replace(/\D/g, '')
      try {
        const r = await fetch(`/api/prospeccao/lead/${encodeURIComponent(clean)}/contato`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const j = await r.json()
        if (!j.success) throw new Error(j.error || 'Falha ao registrar contato')
        if (j.data.lead) {
          setSelectedLead(j.data.lead)
          setLeads((prev) => prev.map((l) => (l.cpfCnpjClean === j.data.lead.cpfCnpjClean ? j.data.lead : l)))
        }
        setContatoModalOpen(false)
        await Promise.all([loadHotLeads(), loadStats()])
      } catch (e: any) {
        console.warn('[contato] erro', e)
        alert(e?.message || 'Falha ao registrar contato')
      } finally {
        setRegistrandoContato(false)
      }
    },
    [loadHotLeads, loadStats],
  )

  const handleRestaurar = useCallback(async (cpfCnpj: string) => {
    setDeleting(cpfCnpj)
    const clean = cpfCnpj.replace(/\D/g, '')
    try {
      const r = await fetch(`/api/prospeccao/lead/${encodeURIComponent(clean)}/restaurar`, { method: 'POST' })
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'Falha ao restaurar')
      await Promise.all([search(), loadStats()])
    } catch (e) {
      console.warn('[restore] erro', e)
    } finally {
      setDeleting(null)
    }
  }, [search, loadStats])

  const handleEnrichLote = useCallback(async (concurrency: number, customFilters?: Record<string, any>) => {
    setBatch({
      phase: 'starting', batchId: null, total: 0, processed: 0, ok: 0, fail: 0, errors: [], lastLead: null,
    })

    try {
      const body = customFilters
        ? { ...customFilters, concurrency }
        : { ...buildFilterBody(), concurrency }
      const res = await fetch('/api/prospeccao/enriquecer-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok || !res.body) throw new Error('Falha ao iniciar lote')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        // SSE frames separados por \n\n
        const frames = buf.split('\n\n')
        buf = frames.pop() || ''
        for (const frame of frames) {
          const lines = frame.split('\n')
          let eventName = 'message'
          let dataStr = ''
          for (const l of lines) {
            if (l.startsWith('event:')) eventName = l.slice(6).trim()
            else if (l.startsWith('data:')) dataStr += l.slice(5).trim()
          }
          if (!dataStr) continue
          let payload: any
          try { payload = JSON.parse(dataStr) } catch { continue }

          if (eventName === 'batch' && payload.batchId) {
            setBatch((b) => ({ ...b, batchId: payload.batchId, phase: 'running' }))
          } else if (eventName === 'start') {
            setBatch((b) => ({ ...b, phase: 'running', total: payload.total, batchId: payload.batchId }))
          } else if (eventName === 'progress') {
            setBatch((b) => ({
              ...b,
              phase: 'running',
              total: payload.total,
              processed: payload.processed,
              ok: payload.ok,
              fail: payload.fail,
              lastLead: payload.lead ? { ...payload.lead, error: payload.error } : null,
              errors: payload.error ? [...b.errors.slice(-19), `${payload.lead?.nome || '?'}: ${payload.error}`] : b.errors,
            }))
          } else if (eventName === 'done') {
            setBatch((b) => ({ ...b, phase: 'done', processed: payload.processed, ok: payload.ok, fail: payload.fail, total: payload.total }))
          } else if (eventName === 'cancelled') {
            setBatch((b) => ({ ...b, phase: 'cancelled', processed: payload.processed, ok: payload.ok, fail: payload.fail }))
          } else if (eventName === 'error') {
            setBatch((b) => ({ ...b, phase: 'error', errors: [...b.errors, payload.error || 'erro'] }))
          }
        }
      }
    } catch (e: any) {
      setBatch((b) => ({ ...b, phase: 'error', errors: [...b.errors, e?.message || 'falha de conexão'] }))
    } finally {
      // refresh da lista e stats ao final
      await Promise.all([search(), loadStats()])
    }
  }, [buildFilterBody, search, loadStats])

  const handleCancelLote = useCallback(async () => {
    if (!batch.batchId) return
    try {
      await fetch(`/api/prospeccao/enriquecer-lote/${batch.batchId}/cancelar`, { method: 'POST' })
    } catch {}
  }, [batch.batchId])

  const exportCsv = useCallback(async () => {
    const body = {
      uf: uf || undefined,
      minHectares: minHectares || undefined,
      minDivida: minDivida || undefined,
      maxDivida,
      tipoPessoa: tipoPessoa || undefined,
      apenasAjuizadas,
      apenasAgroProvavel,
      apenasPfRural,
      apenasJudicialAgro,
      judicialTipos: judicialTipos.length ? judicialTipos : undefined,
      termo: termo || undefined,
      sortBy,
    }
    const r = await fetch('/api/prospeccao/export.csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `prospeccao-agro-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [uf, minHectares, minDivida, maxDivida, tipoPessoa, apenasAjuizadas, apenasAgroProvavel, apenasPfRural, apenasJudicialAgro, judicialTipos, termo, sortBy])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-6">
      {/* Hero OODA */}
      <HeroOODA stats={stats} loading={loadingStats} sicarStatus={sicarStatus} />

      {/* Roteamento de hot-leads + reengajamento (feedback loop) */}
      <HotLeadsPanel
        alerts={hotLeads}
        loading={loadingHot}
        onOpen={openLeadByCpf}
        onRefresh={loadHotLeads}
      />

      {/* Wave-PG-12: query rápida via SQL indexado (39k leads PGFN no PG) */}
      <QuickSqlPanel onOpen={openLeadByCpf} />

      {/* Fila persistente de enriquecimento — visível só se tem trabalho ativo */}
      {filaStats && (filaStats.pending + filaStats.running + filaStats.failed > 0) && (
        <FilaEnriquecimentoPanel stats={filaStats} onRetry={async (id) => {
          await fetch(`/api/prospeccao/fila/${id}/retry`, { method: 'POST' })
          loadFilaStats()
        }} />
      )}

      {/* Toolbar de filtros */}
      <FilterPanel
        uf={uf} setUf={setUf}
        minHectares={minHectares} setMinHectares={setMinHectares}
        minDivida={minDivida} setMinDivida={setMinDivida}
        tipoPessoa={tipoPessoa} setTipoPessoa={setTipoPessoa}
        apenasAjuizadas={apenasAjuizadas} setApenasAjuizadas={setApenasAjuizadas}
        apenasAgroProvavel={apenasAgroProvavel} setApenasAgroProvavel={setApenasAgroProvavel}
        apenasPfRural={apenasPfRural} setApenasPfRural={setApenasPfRural}
        apenasJudicialAgro={apenasJudicialAgro} setApenasJudicialAgro={setApenasJudicialAgro}
        judicialTipos={judicialTipos} setJudicialTipos={setJudicialTipos}
        termo={termo} setTermo={setTermo}
        sortBy={sortBy} setSortBy={setSortBy}
        onApply={() => { setPage(1); search() }}
        onExport={exportCsv}
        total={total}
        loading={loading}
      />

      {/* Grid de resultados */}
      <div className="bg-white dark:bg-aletis-grafite-escuro rounded-2xl border border-aletis-borda dark:border-white/5 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-aletis-borda dark:border-white/5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-aletis-verde/10 flex items-center justify-center">
              <Target size={18} className="text-aletis-verde" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-aletis-grafite-escuro dark:text-white">
                Leads encontrados
              </h2>
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
                {loading ? 'Buscando…' : `${fmtNum(total)} resultados — página ${page}/${totalPages}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setBulkOpen(true)}
            disabled={counts.pendentes === 0 && batch.phase !== 'running'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-aletis-verde to-aletis-verde-escuro text-white hover:brightness-110 disabled:opacity-40 transition shadow-sm"
            title="Enriquecer em lote os leads que correspondem aos filtros"
          >
            <Zap size={13} /> Enriquecer em lote
          </button>
        </div>

        {/* Tabs de status */}
        <StatusTabs
          active={statusTab}
          counts={counts}
          onChange={(v) => setStatusTab(v)}
        />

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading && leads.length === 0 ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="animate-spin text-aletis-verde" size={32} />
          </div>
        ) : leads.length === 0 ? (
          <div className="p-12 text-center text-aletis-grafite-medio dark:text-white/50">
            <Search size={32} className="mx-auto mb-3 opacity-40" />
            Nenhum lead corresponde aos filtros aplicados.
          </div>
        ) : (
          <div className="divide-y divide-aletis-borda dark:divide-white/5">
            {leads.map((lead) => (
              <LeadRow
                key={lead.cpfCnpjClean}
                lead={lead}
                onOpen={() => setSelectedLead(lead)}
                onEnrich={() => handleEnrich(lead.cpfCnpjClean)}
                onExcluir={(motivo) => handleExcluir(lead.cpfCnpjClean, motivo)}
                onRestaurar={() => handleRestaurar(lead.cpfCnpjClean)}
                enriching={enriching === lead.cpfCnpjClean}
                deleting={deleting === lead.cpfCnpjClean}
              />
            ))}
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-aletis-borda dark:border-white/5 flex items-center justify-between text-sm">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-aletis-borda dark:border-white/10 text-aletis-grafite-medio dark:text-white/60 hover:bg-aletis-bege dark:hover:bg-white/5 disabled:opacity-40 transition"
            >
              Anterior
            </button>
            <span className="text-aletis-grafite-medio dark:text-white/50">
              {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border border-aletis-borda dark:border-white/10 text-aletis-grafite-medio dark:text-white/60 hover:bg-aletis-bege dark:hover:bg-white/5 disabled:opacity-40 transition"
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {/* Drawer de detalhes */}
      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          enriching={enriching === selectedLead.cpfCnpjClean}
          carLoading={carLoading === selectedLead.cpfCnpjClean}
          deleting={deleting === selectedLead.cpfCnpjClean}
          iniciando={iniciando === selectedLead.cpfCnpjClean}
          iniciarMsg={iniciarMsg}
          enrichFlash={enrichFlash}
          dismissEnrichFlash={() => setEnrichFlash(null)}
          carError={carError}
          sicarStatus={sicarStatus}
          onClose={() => { setSelectedLead(null); setCarError(null); setIniciarMsg(null); setEnrichFlash(null); setContatoModalOpen(false) }}
          onEnrich={() => handleEnrich(selectedLead.cpfCnpjClean)}
          onExcluir={(motivo) => handleExcluir(selectedLead.cpfCnpjClean, motivo)}
          onRestaurar={() => handleRestaurar(selectedLead.cpfCnpjClean)}
          onConsultarCar={(codImovel) => handleConsultarCar(selectedLead.cpfCnpjClean, codImovel)}
          onIniciarProspeccao={() => handleIniciarProspeccao(selectedLead.cpfCnpjClean)}
          onAbrirContato={() => setContatoModalOpen(true)}
        />
      )}

      {/* Toast global de enriquecimento — visível mesmo sem drawer aberto */}
      {enrichFlash && !selectedLead && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded-xl shadow-2xl border p-4 flex items-start gap-3 text-sm animate-slide-in-right ${
            enrichFlash.isError
              ? 'bg-red-50 dark:bg-red-950/90 border-red-300 dark:border-red-800 text-red-900 dark:text-red-100'
              : 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
          }`}
        >
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">
              {enrichFlash.isError ? 'Falha no enriquecimento' : 'Lead enriquecido com sucesso'}
            </p>
            <p className="text-xs opacity-80 mt-0.5">{enrichFlash.lines.join(' · ')}</p>
          </div>
          <button onClick={() => setEnrichFlash(null)} className="opacity-60 hover:opacity-100" aria-label="Fechar">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Modal de registrar contato (feedback loop) */}
      {contatoModalOpen && selectedLead && (
        <RegistrarContatoModal
          lead={selectedLead}
          saving={registrandoContato}
          onCancel={() => setContatoModalOpen(false)}
          onSubmit={(payload) => handleRegistrarContato(selectedLead.cpfCnpjClean, payload)}
        />
      )}

      {/* Modal de enriquecimento em lote */}
      {bulkOpen && (
        <BulkEnrichModal
          initialFilters={{
            uf,
            minHectares,
            minDivida,
            tipoPessoa,
            apenasAjuizadas,
            apenasAgroProvavel,
            apenasPfRural,
            apenasJudicialAgro,
            judicialTipos,
            termo,
          }}
          batch={batch}
          sicarStatus={sicarStatus}
          onStart={handleEnrichLote}
          onCancel={handleCancelLote}
          onClose={() => {
            if (batch.phase === 'running' || batch.phase === 'starting') return
            setBulkOpen(false)
            setBatch({ phase: 'idle', batchId: null, total: 0, processed: 0, ok: 0, fail: 0, errors: [] })
          }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// HERO — dashboard OODA no topo
// ────────────────────────────────────────────────────────────
function HeroOODA({
  stats,
  loading,
  sicarStatus,
}: {
  stats: Stats | null
  loading: boolean
  sicarStatus: SicarStatus | null
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-aletis-verde via-aletis-verde-escuro to-[#06281c] text-white shadow-[0_30px_60px_-20px_rgba(6,40,28,0.55)]">
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 12% 20%, #C9A84C 0%, transparent 45%), radial-gradient(circle at 92% 85%, #2A8F64 0%, transparent 45%)',
        }}
      />

      <div className="relative px-6 py-7 lg:px-10 lg:py-9 space-y-7">
        {/* LINHA 1 — título + status */}
        <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-6 items-start">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-aletis-dourado/15 border border-aletis-dourado/30 text-aletis-dourado text-[10.5px] font-semibold uppercase tracking-[0.16em]">
              <Cpu size={12} /> OODA · Prospecção cirúrgica
            </span>
            <h1 className="mt-3 font-display text-[28px] lg:text-[36px] font-bold leading-[1.1] tracking-tight">
              Leads agro com dívida ativa
            </h1>
            <p className="mt-2 text-white/70 text-sm lg:text-[13.5px] max-w-2xl leading-relaxed">
              Busca profunda no <b className="text-white/90">PGFN</b> + enriquecimento{' '}
              <b className="text-white/90">BrasilAPI</b> + área oficial via{' '}
              <b className="text-white/90">SICAR</b> · scoring multi-dimensional.
            </p>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-2 min-w-0">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/60">
              <Sparkles size={12} className="text-aletis-dourado" />
              {loading ? 'carregando…' : stats ? `${fmtNum(stats.totalLeads)} leads indexados` : '—'}
            </div>
            {stats?.fontes && stats.fontes.length > 0 && (
              <div className="flex flex-wrap lg:justify-end gap-1">
                {stats.fontes.map((f) => (
                  <span
                    key={f.fonte}
                    title={`${f.descricao}${f.lastIngestAt ? ' · ' + new Date(f.lastIngestAt).toLocaleDateString('pt-BR') : ''}`}
                    className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-white/10 bg-white/[0.04] text-white/55"
                  >
                    {f.fonte} · {fmtNum(f.contagem)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* LINHA 2 — status SICAR consolidado */}
        <SicarStatusBadge status={sicarStatus} />

        {/* LINHA 3 — KPIs em grid 12 colunas, sempre 4 por linha no desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-3 lg:gap-4">
          <KpiTile
            icon={Target}
            label="Leads agro"
            value={stats ? fmtNum(stats.totalLeads) : '…'}
            sub="PGFN + fontes públicas"
            accent="dourado"
            loading={loading}
          />
          <KpiTile
            icon={Wheat}
            label="Agro provável"
            value={stats ? fmtNum(stats.leadsAgroProvavel) : '…'}
            sub="heurística reforçada"
            accent="verde"
            loading={loading}
          />
          <KpiTile
            icon={Users}
            label="PF rural"
            value={stats ? fmtNum(stats.leadsPfRural) : '…'}
            sub="PF com âncora agro"
            accent="ambar"
            loading={loading}
          />
          <KpiTile
            icon={Gavel}
            label="Judicial agro"
            value={stats ? fmtNum(stats.leadsJudicialAgro) : '…'}
            sub={stats?.porJudicialTipo?.[0] ? `${JUDICIAL_LABEL[stats.porJudicialTipo[0].tipo]} em destaque` : 'RJ · falência · leilão'}
            accent="vermelho"
            loading={loading}
          />
          <KpiTile
            icon={Flame}
            label="Quentes · score ≥ 75"
            value={stats ? fmtNum(stats.leadsQuentes) : '…'}
            sub={stats ? `${((stats.leadsQuentes / Math.max(stats.totalLeads, 1)) * 100).toFixed(1)}% do total` : ''}
            accent="vermelho"
            loading={loading}
          />
          <KpiTile
            icon={CheckCircle2}
            label="Completas"
            value={stats ? fmtNum(stats.leadsCompletos) : '…'}
            sub={stats?.leadsExcluidos ? `${fmtNum(stats.leadsExcluidos)} excluídos` : 'enriquecidos + persistidos'}
            accent="verde"
            loading={loading}
          />
          <KpiTile
            icon={DollarSign}
            label="Universo PGFN"
            value={stats ? fmtBRLShort(stats.totalDivida) : '…'}
            sub="soma bruta antes do filtro"
            accent="verde"
            loading={loading}
          />
          <KpiTile
            icon={TrendingUp}
            label="Honorários potenciais"
            value={stats ? fmtBRLShort(stats.honorariosPotenciaisTotal) : '…'}
            sub={stats ? `1% × ${fmtBRLShort(stats.honorariosPotenciaisTotal * 100)} (leads ativos)` : 'modelo 1% ALETIS'}
            accent="dourado"
            loading={loading}
          />
        </div>

        {/* LINHA 4 — avisos de feedback-loop (hot-leads, reengajar, judicial) */}
        {stats && (stats.hotLeadsPendentes > 0 || stats.leadsParaReengajar > 0 || stats.porJudicialTipo.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {stats.hotLeadsPendentes > 0 && (
              <AlertChip icon={Siren} tone="red" value={stats.hotLeadsPendentes} suffix={`hot-lead${stats.hotLeadsPendentes === 1 ? '' : 's'} aguardando contato`} />
            )}
            {stats.leadsParaReengajar > 0 && (
              <AlertChip icon={RotateCw} tone="gold" value={stats.leadsParaReengajar} suffix={`lead${stats.leadsParaReengajar === 1 ? '' : 's'} para reengajar`} />
            )}
            {stats.porJudicialTipo.slice(0, 3).map((item) => (
              <AlertChip
                key={item.tipo}
                icon={Gavel}
                tone={item.tipo === 'falencia' || item.tipo === 'recuperacao_judicial' ? 'red' : 'amber'}
                value={item.count}
                suffix={JUDICIAL_LABEL[item.tipo]}
              />
            ))}
          </div>
        )}

        {/* LINHA 5 — Sinais agro identificados */}
        {stats && stats.topSignals.length > 0 && (
          <div className="pt-6 border-t border-white/10">
            <div className="flex items-center justify-between gap-4 mb-3">
              <p className="text-[10.5px] uppercase tracking-[0.18em] text-white/45 font-medium">
                Sinais agro identificados
              </p>
              <span className="text-[10px] text-white/40">top {Math.min(12, stats.topSignals.length)} de {fmtNum(stats.topSignals.length)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stats.topSignals.slice(0, 12).map((s) => (
                <span
                  key={s.signal}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[11px] text-white/80 hover:bg-white/10 transition"
                >
                  <Wheat size={10} className="text-aletis-dourado shrink-0" />
                  <span className="truncate max-w-[180px]">{s.signal}</span>
                  <span className="text-white/45 font-mono text-[10px]">{fmtNum(s.count)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// Compact chip used by HeroOODA for feedback-loop alerts.
function AlertChip({
  icon: Icon,
  tone,
  value,
  suffix,
}: {
  icon: React.ElementType
  tone: 'red' | 'amber' | 'gold'
  value: number
  suffix: string
}) {
  const toneCls = {
    red: 'bg-red-500/15 border-red-400/30 text-red-200',
    amber: 'bg-amber-500/15 border-amber-400/30 text-amber-200',
    gold: 'bg-aletis-dourado/15 border-aletis-dourado/40 text-aletis-dourado',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11.5px] ${toneCls}`}>
      <Icon size={12} />
      <b className="font-semibold tabular-nums">{fmtNum(value)}</b>
      <span className="opacity-90">{suffix}</span>
    </span>
  )
}

function SicarStatusBadge({ status }: { status: SicarStatus | null }) {
  if (!status) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/50">
        <Loader2 size={11} className="animate-spin" /> SICAR · aferindo status…
      </div>
    )
  }
  const { sicar, captcha, index } = status
  const online = sicar.online
  const StatusIcon = online ? ShieldCheck : ShieldAlert
  const balance = captcha.balanceUsd != null ? `$${captcha.balanceUsd.toFixed(2)}` : '—'
  const balanceTone = (captcha.balanceUsd ?? 0) < 0.5 ? 'text-red-300' : 'text-white/70'
  const indexLoaded = !!index?.loaded
  const individualDisponivel = online && captcha.enabled && (captcha.balanceUsd ?? 0) > 0

  const sicarTone = online ? 'text-emerald-300' : 'text-amber-300'
  const bulkTone = indexLoaded ? 'text-emerald-300' : 'text-white/55'
  const indivTone = individualDisponivel ? 'text-emerald-300' : 'text-white/55'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-0 sm:divide-x sm:divide-white/10">
      {/* Portal oficial */}
      <div className="sm:pr-4 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-1">Portal SICAR</p>
        <div className="flex items-center gap-1.5">
          <StatusIcon size={13} className={sicarTone} />
          <span className={`text-xs font-semibold ${sicarTone}`}>
            {online ? 'Online' : 'Em manutenção'}
          </span>
        </div>
        <p className="text-[10.5px] text-white/50 truncate mt-0.5" title={sicar.reason || ''}>
          {sicar.reason || 'Consulta de CAR individual habilitada'}
        </p>
      </div>

      {/* Bulk offline */}
      <div className="sm:px-4 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-1">Bulk offline</p>
        <div className="flex items-center gap-1.5">
          <Trees size={13} className={bulkTone} />
          <span className={`text-xs font-semibold ${bulkTone}`}>
            {indexLoaded ? `${fmtNum(index.totalImoveis)} imóveis` : 'Aguardando portal'}
          </span>
        </div>
        <p className="text-[10.5px] text-white/50 truncate mt-0.5">
          {indexLoaded && Object.keys(index.byUf).length > 0
            ? Object.entries(index.byUf).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([uf, n]) => `${uf}:${n >= 1000 ? (n / 1000).toFixed(0) + 'k' : n}`).join(' · ')
            : 'Retry automático 2×/dia'}
        </p>
      </div>

      {/* Consulta individual + saldo captcha */}
      <div className="sm:pl-4 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-1">Consulta individual</p>
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={13} className={indivTone} />
          <span className={`text-xs font-semibold ${indivTone}`}>
            {individualDisponivel ? 'Disponível' : online ? 'Sem saldo' : 'Indisponível'}
          </span>
        </div>
        <p className={`text-[10.5px] mt-0.5 flex items-center gap-1 ${balanceTone}`}>
          <Satellite size={10} /> 2captcha {captcha.enabled ? balance : 'off'}
        </p>
      </div>
    </div>
  )
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  loading,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  accent: 'dourado' | 'vermelho' | 'ambar' | 'verde'
  loading?: boolean
}) {
  const accentColor = {
    dourado: 'text-aletis-dourado bg-aletis-dourado/10',
    vermelho: 'text-red-300 bg-red-500/15',
    ambar: 'text-amber-300 bg-amber-500/15',
    verde: 'text-emerald-300 bg-emerald-500/15',
  }[accent]

  return (
    <div className="group h-[128px] bg-white/[0.04] backdrop-blur rounded-2xl border border-white/10 p-3.5 flex flex-col gap-2 hover:bg-white/[0.08] hover:border-white/15 transition">
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg ${accentColor} flex items-center justify-center shrink-0`}>
          <Icon size={16} />
        </div>
        <p className="text-[10.5px] uppercase tracking-[0.12em] text-white/55 font-medium leading-tight line-clamp-2">
          {label}
        </p>
      </div>
      <div className="flex-1 flex flex-col justify-end min-h-0">
        {loading ? (
          <div className="h-7 w-20 rounded bg-white/10 animate-pulse" />
        ) : (
          <p className="font-display text-[26px] leading-none font-bold tabular-nums tracking-tight truncate" title={value}>
            {value}
          </p>
        )}
        {sub && (
          <p className="text-[10.5px] text-white/45 mt-1 truncate" title={sub}>
            {sub}
          </p>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// FilterPanel
// ────────────────────────────────────────────────────────────
function FilterPanel(props: {
  uf: string
  setUf: (v: string) => void
  minHectares: number
  setMinHectares: (v: number) => void
  minDivida: number
  setMinDivida: (v: number) => void
  tipoPessoa: '' | 'PF' | 'PJ'
  setTipoPessoa: (v: '' | 'PF' | 'PJ') => void
  apenasAjuizadas: boolean
  setApenasAjuizadas: (v: boolean) => void
  apenasAgroProvavel: boolean
  setApenasAgroProvavel: (v: boolean) => void
  apenasPfRural: boolean
  setApenasPfRural: (v: boolean) => void
  apenasJudicialAgro: boolean
  setApenasJudicialAgro: (v: boolean) => void
  judicialTipos: JudicialTipo[]
  setJudicialTipos: (v: JudicialTipo[]) => void
  termo: string
  setTermo: (v: string) => void
  sortBy: 'score' | 'divida' | 'hectares' | 'recencia'
  setSortBy: (v: 'score' | 'divida' | 'hectares' | 'recencia') => void
  onApply: () => void
  onExport: () => void
  total: number
  loading: boolean
}) {
  const {
    uf, setUf, minHectares, setMinHectares, minDivida, setMinDivida,
    tipoPessoa, setTipoPessoa, apenasAjuizadas, setApenasAjuizadas,
    apenasAgroProvavel, setApenasAgroProvavel, apenasPfRural, setApenasPfRural,
    apenasJudicialAgro, setApenasJudicialAgro, judicialTipos, setJudicialTipos,
    termo, setTermo, sortBy, setSortBy, onApply, onExport, total, loading,
  } = props

  return (
    <div className="bg-white dark:bg-aletis-grafite-escuro rounded-2xl border border-aletis-borda dark:border-white/5 shadow-sm">
      <div className="px-5 lg:px-6 py-4 border-b border-aletis-borda/70 dark:border-white/5 flex items-center gap-3 flex-wrap">
        <Filter size={16} className="text-aletis-verde" />
        <h3 className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">Filtros cirúrgicos</h3>
        <span className="text-[11px] text-aletis-grafite-medio dark:text-white/45">
          refine o universo antes da ação
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-aletis-bege dark:bg-white/5 text-aletis-grafite-escuro dark:text-white hover:bg-aletis-verde/10 transition"
          >
            <Download size={13} /> Exportar CSV
          </button>
          <button
            onClick={onApply}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-aletis-verde text-white hover:bg-aletis-verde-escuro disabled:opacity-50 transition"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Aplicar · {fmtNum(total)}
          </button>
        </div>
      </div>

      <div className="px-5 lg:px-6 py-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Termo */}
        <label className="block">
          <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
            <Search size={11} /> Buscar por nome/CPF/CNPJ
          </span>
          <input
            type="text"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onApply()}
            placeholder="ex.: AGROPECUARIA…"
            className="w-full px-3 py-2 text-sm rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none transition"
          />
        </label>

        {/* UF */}
        <label className="block">
          <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
            <MapPin size={11} /> UF
          </span>
          <select
            value={uf}
            onChange={(e) => setUf(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none transition"
          >
            <option value="">todas</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>

        {/* Hectares min */}
        <label className="block">
          <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
            <Tractor size={11} /> Hectares mín. <span className="text-aletis-verde font-semibold">{fmtHa(minHectares)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={10000}
            step={100}
            value={minHectares}
            onChange={(e) => setMinHectares(Number(e.target.value))}
            className="w-full accent-aletis-verde"
          />
        </label>

        {/* Dívida min */}
        <label className="block">
          <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
            <DollarSign size={11} /> Dívida mín. <span className="text-aletis-verde font-semibold">{fmtBRLShort(minDivida)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={50_000_000}
            step={100_000}
            value={minDivida}
            onChange={(e) => setMinDivida(Number(e.target.value))}
            className="w-full accent-aletis-verde"
          />
        </label>

        {/* Tipo pessoa */}
        <label className="block">
          <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
            <Building2 size={11} /> Tipo
          </span>
          <select
            value={tipoPessoa}
            onChange={(e) => setTipoPessoa(e.target.value as any)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none transition"
          >
            <option value="">PF e PJ</option>
            <option value="PJ">Pessoa jurídica</option>
            <option value="PF">Pessoa física</option>
          </select>
        </label>

        {/* Ordenação */}
        <label className="block">
          <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
            <BarChart3 size={11} /> Ordenar por
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none transition"
          >
            <option value="score">Score (potencial)</option>
            <option value="divida">Valor da dívida</option>
            <option value="hectares">Hectares estimados</option>
            <option value="recencia">Inscrição mais recente</option>
          </select>
        </label>
      </div>

      <div className="px-5 lg:px-6 py-4 border-t border-aletis-borda/70 dark:border-white/5 grid gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-aletis-grafite-medio dark:text-white/40 font-medium mb-2">
            Toggles cirúrgicos
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <FilterToggle icon={Gavel} label="Apenas com ajuizamento" checked={apenasAjuizadas} onChange={setApenasAjuizadas} />
            <FilterToggle icon={Wheat} label="Apenas agro provável" checked={apenasAgroProvavel} onChange={setApenasAgroProvavel} />
            <FilterToggle icon={Users} label="Apenas PF rural" checked={apenasPfRural} onChange={setApenasPfRural} />
            <FilterToggle icon={AlertTriangle} label="Apenas judicial agro" checked={apenasJudicialAgro} onChange={setApenasJudicialAgro} />
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-aletis-grafite-medio dark:text-white/40 font-medium mb-2">
            Tipos de evento judicial · clique para combinar
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(JUDICIAL_LABEL) as JudicialTipo[]).map((tipo) => {
              const active = judicialTipos.includes(tipo)
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setJudicialTipos(active ? judicialTipos.filter((t) => t !== tipo) : [...judicialTipos, tipo])}
                  className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                    active
                      ? 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800'
                      : 'bg-white dark:bg-white/[0.04] text-aletis-grafite-medio dark:text-white/55 border-aletis-borda dark:border-white/10 hover:border-red-300 dark:hover:border-red-800 hover:text-red-700 dark:hover:text-red-300'
                  }`}
                >
                  {JUDICIAL_LABEL[tipo]}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// Checkbox semântico com label + ícone — usado em FilterPanel e BulkEnrichModal.
function FilterToggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ElementType
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-aletis-grafite-escuro dark:text-white/75 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-aletis-verde w-3.5 h-3.5"
      />
      <Icon size={12} className="text-aletis-grafite-medio dark:text-white/45" />
      <span>{label}</span>
    </label>
  )
}

// ────────────────────────────────────────────────────────────
// Primitivos visuais usados por LeadRow e tabs — declaradas ANTES
// de LeadRow para não depender de hoisting durante Vite Fast Refresh.
// ────────────────────────────────────────────────────────────

// Pílula padrão para badges de linha — paleta consistente.
function Chip({
  tone,
  icon: Icon,
  label,
}: {
  tone: 'emerald' | 'red' | 'sky' | 'amber' | 'slate' | 'gold'
  icon: React.ElementType
  label: string
}) {
  const cls = {
    emerald: 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
    red: 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900',
    sky: 'bg-sky-100 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-900',
    amber: 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    gold: 'bg-aletis-dourado/10 text-aletis-dourado border-aletis-dourado/30',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      <Icon size={10} /> {label}
    </span>
  )
}

// Métrica alinhada à direita para tabela de leads.
function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-[0.14em] text-aletis-grafite-medio dark:text-white/40 font-medium">{label}</p>
      <p className={`font-mono text-sm font-semibold mt-0.5 ${valueClass ?? 'text-aletis-grafite-escuro dark:text-white'}`}>
        {value}
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// LeadRow
// ────────────────────────────────────────────────────────────
function LeadRow({
  lead,
  onOpen,
  onEnrich,
  onExcluir,
  onRestaurar,
  enriching,
  deleting,
}: {
  lead: LeadFull
  onOpen: () => void
  onEnrich: () => void
  onExcluir: (motivo: string) => void
  onRestaurar: () => void
  enriching: boolean
  deleting: boolean
}) {
  const cls = CLASSIF_STYLE[lead.score.classificacao]
  const isCompleta = lead.status === 'completa'
  const isExcluido = lead.status === 'excluido'

  const askExclude = (e: React.MouseEvent) => {
    e.stopPropagation()
    const motivo = window.prompt(
      `Excluir LEAD "${lead.nome}"?\n\nInforme o motivo (ex.: já cliente, sem fit, duplicata):`,
      'sem fit comercial'
    )
    if (motivo && motivo.trim()) onExcluir(motivo.trim())
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className={`group px-5 lg:px-6 py-4 transition cursor-pointer ${
        isExcluido
          ? 'opacity-60 hover:opacity-80 bg-slate-50 dark:bg-white/[0.02]'
          : 'hover:bg-aletis-bege/60 dark:hover:bg-white/[0.03]'
      }`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 lg:gap-5">
        {/* Score bubble */}
        <div
          className={`flex-shrink-0 w-16 h-16 rounded-2xl border ${cls.border} ${cls.bg} flex flex-col items-center justify-center`}
          title={`${cls.label} · ${lead.score.total} pts`}
        >
          <span className={`font-display text-2xl font-bold leading-none tabular-nums ${cls.text}`}>{lead.score.total}</span>
          <span className={`text-[9px] uppercase tracking-[0.14em] mt-1 font-semibold ${cls.text}`}>{cls.label}</span>
        </div>

        {/* Ficha */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-semibold text-[14px] text-aletis-grafite-escuro dark:text-white truncate max-w-full">
              {lead.nome}
            </h3>
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono text-aletis-grafite-medio dark:text-white/50 bg-aletis-bege dark:bg-white/5">
              {lead.tipoPessoa}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            {isCompleta && <Chip tone="emerald" icon={CheckCircle2} label="completa" />}
            {isExcluido && <Chip tone="slate" icon={Archive} label="excluído" />}
            {lead.temAjuizada && <Chip tone="red" icon={Gavel} label="ajuizada" />}
            {lead.agroProfile?.provavel && <Chip tone="emerald" icon={Wheat} label={`agro ${lead.agroProfile.nivel}`} />}
            {lead.pfProfile?.relevante && <Chip tone="sky" icon={Users} label="PF rural" />}
            {lead.judicialProfile?.ativo && lead.judicialProfile.tipos.slice(0, 2).map((tipo) => (
              <Chip key={tipo} tone="red" icon={AlertTriangle} label={JUDICIAL_LABEL[tipo]} />
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[11.5px] text-aletis-grafite-medio dark:text-white/50">
            <span className="inline-flex items-center gap-1 shrink-0"><MapPin size={11} /> {lead.uf}</span>
            <span className="inline-flex items-center gap-1 shrink-0 font-mono"><Hash size={11} /> {lead.cpfCnpj}</span>
            <span className="inline-flex items-center gap-1 shrink-0"><FileText size={11} /> {lead.qtdInscricoes} inscrições</span>
            {isExcluido && lead.excluidoMotivo && (
              <span className="italic text-slate-500 truncate">motivo: {lead.excluidoMotivo}</span>
            )}
            {lead.judicialEvents?.[0] && (
              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 truncate max-w-[240px]">
                <AlertTriangle size={11} /> {lead.judicialEvents[0].resumo}
              </span>
            )}
          </div>
        </div>

        {/* Métricas · alinhadas à direita, grid consistente */}
        <div className="hidden md:grid grid-cols-3 gap-5 text-right tabular-nums">
          <Metric label="Dívida" value={fmtBRLShort(lead.totalDivida)} />
          <Metric
            label="Área"
            value={lead.area.hectaresEstimados > 0 ? fmtHa(lead.area.hectaresEstimados) : '—'}
            valueClass={CONFIDENCE_COLOR[lead.area.confidence]}
          />
          <Metric label="Honorários" value={fmtBRLShort(lead.score.honorariosEstimados)} valueClass="text-aletis-dourado" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {!isExcluido && (
            <button
              onClick={(e) => { e.stopPropagation(); onEnrich() }}
              disabled={enriching}
              title={
                isCompleta
                  ? 'Reenriquecer — re-busca BrasilAPI/SICAR e recalcula score'
                  : lead.tipoPessoa === 'PJ'
                    ? 'BrasilAPI + índice SICAR'
                    : 'Lookup índice SICAR offline'
              }
              className={`px-2.5 py-1.5 rounded-lg border transition text-xs font-medium flex items-center gap-1 disabled:opacity-50 ${
                isCompleta
                  ? 'border-aletis-borda dark:border-white/10 text-aletis-grafite-medio dark:text-white/60 hover:border-aletis-verde/30 hover:text-aletis-verde'
                  : 'border-aletis-verde/30 text-aletis-verde hover:bg-aletis-verde/10'
              }`}
            >
              {enriching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {enriching ? 'Enriquecendo…' : isCompleta ? 'Reenriquecer' : 'Enriquecer'}
            </button>
          )}
          {!isExcluido ? (
            <button
              onClick={askExclude}
              disabled={deleting}
              title="Excluir lead (vai para a aba Excluídos)"
              className="px-2 py-1.5 rounded-lg border border-red-300/60 dark:border-red-700/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onRestaurar() }}
              disabled={deleting}
              title="Restaurar lead"
              className="px-2 py-1.5 rounded-lg border border-aletis-borda dark:border-white/10 text-aletis-grafite-medio dark:text-white/60 hover:bg-aletis-bege dark:hover:bg-white/5 transition disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
            </button>
          )}
          <ChevronRight size={18} className="text-aletis-grafite-medio dark:text-white/30 group-hover:text-aletis-verde transition" />
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// StatusTabs — pendentes / completas / excluídos
// ────────────────────────────────────────────────────────────
function StatusTabs({
  active,
  counts,
  onChange,
}: {
  active: 'todos' | 'pendente' | 'completa' | 'excluido'
  counts: BuscaCounts
  onChange: (v: 'todos' | 'pendente' | 'completa' | 'excluido') => void
}) {
  const tabs = [
    { id: 'todos' as const, label: 'Todos (ativos)', count: counts.todos, icon: ListChecks, color: 'text-aletis-grafite-escuro dark:text-white' },
    { id: 'pendente' as const, label: 'Pendentes', count: counts.pendentes, icon: Package, color: 'text-amber-600 dark:text-amber-400' },
    { id: 'completa' as const, label: 'Completas', count: counts.completas, icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400' },
    { id: 'excluido' as const, label: 'Excluídos', count: counts.excluidos, icon: Archive, color: 'text-slate-500 dark:text-slate-400' },
  ]
  return (
    <div className="px-6 pt-3 pb-0 border-b border-aletis-borda dark:border-white/5 flex gap-1 flex-wrap bg-aletis-bege/40 dark:bg-white/[0.02]">
      {tabs.map((t) => {
        const Icon = t.icon
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition ${
              isActive
                ? `bg-white dark:bg-aletis-grafite-escuro ${t.color} border-b-2 border-aletis-verde -mb-px`
                : 'text-aletis-grafite-medio dark:text-white/50 hover:text-aletis-verde'
            }`}
          >
            <Icon size={13} />
            {t.label}
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              isActive
                ? 'bg-aletis-verde/10 text-aletis-verde'
                : 'bg-white/60 dark:bg-white/5 text-aletis-grafite-medio dark:text-white/40'
            }`}>
              {fmtNum(t.count)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// BulkEnrichModal — enriquecimento em lote com progresso ao vivo
// ────────────────────────────────────────────────────────────
interface BulkPreview {
  elegiveis: number
  jaCompletos: number
  comCarProvavel: number
  semCarProvavel: number
  porUf: Array<{ uf: string; count: number }>
}

function BulkEnrichModal({
  initialFilters,
  batch,
  sicarStatus,
  onStart,
  onCancel,
  onClose,
}: {
  initialFilters: {
    uf: string
    minHectares: number
    minDivida: number
    tipoPessoa: '' | 'PF' | 'PJ'
    apenasAjuizadas: boolean
    apenasAgroProvavel: boolean
    apenasPfRural: boolean
    apenasJudicialAgro: boolean
    judicialTipos: JudicialTipo[]
    termo: string
  }
  batch: BatchState
  sicarStatus: SicarStatus | null
  onStart: (concurrency: number, customFilters?: Record<string, any>) => void
  onCancel: () => void
  onClose: () => void
}) {
  // Filtros editáveis (defaults vindos da página, mas sobrescrevíveis aqui)
  const [bulkUf, setBulkUf] = useState<string>(initialFilters.uf)
  const [bulkTipoPessoa, setBulkTipoPessoa] = useState<'' | 'PF' | 'PJ'>(initialFilters.tipoPessoa)
  const [bulkMinDivida, setBulkMinDivida] = useState<number>(initialFilters.minDivida)
  const [bulkMaxDivida, setBulkMaxDivida] = useState<number | undefined>(undefined)
  const [bulkMinHectares, setBulkMinHectares] = useState<number>(initialFilters.minHectares)
  const [bulkApenasAjuizadas, setBulkApenasAjuizadas] = useState<boolean>(initialFilters.apenasAjuizadas)
  const [bulkApenasAgroProvavel, setBulkApenasAgroProvavel] = useState<boolean>(initialFilters.apenasAgroProvavel)
  const [bulkApenasPfRural, setBulkApenasPfRural] = useState<boolean>(initialFilters.apenasPfRural)
  const [bulkApenasJudicialAgro, setBulkApenasJudicialAgro] = useState<boolean>(initialFilters.apenasJudicialAgro)
  const [bulkJudicialTipos, setBulkJudicialTipos] = useState<JudicialTipo[]>(initialFilters.judicialTipos)
  const [bulkTermo, setBulkTermo] = useState<string>(initialFilters.termo)
  const [concurrency, setConcurrency] = useState(3)
  const [limite, setLimite] = useState<'' | '100' | '500' | '1000'>('')

  const [preview, setPreview] = useState<BulkPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  const running = batch.phase === 'running' || batch.phase === 'starting'
  const pct = batch.total > 0 ? Math.round((batch.processed / batch.total) * 100) : 0

  const buildBulkFilters = useCallback(() => ({
    uf: bulkUf || undefined,
    tipoPessoa: bulkTipoPessoa || undefined,
    minDivida: bulkMinDivida || undefined,
    maxDivida: bulkMaxDivida,
    minHectares: bulkMinHectares || undefined,
    apenasAjuizadas: bulkApenasAjuizadas,
    apenasAgroProvavel: bulkApenasAgroProvavel,
    apenasPfRural: bulkApenasPfRural,
    apenasJudicialAgro: bulkApenasJudicialAgro,
    judicialTipos: bulkJudicialTipos.length ? bulkJudicialTipos : undefined,
    termo: bulkTermo || undefined,
    pageSize: limite ? Number(limite) : undefined,
  }), [bulkUf, bulkTipoPessoa, bulkMinDivida, bulkMaxDivida, bulkMinHectares, bulkApenasAjuizadas, bulkApenasAgroProvavel, bulkApenasPfRural, bulkApenasJudicialAgro, bulkJudicialTipos, bulkTermo, limite])

  // Preview com debounce quando filtros mudam (só na fase idle)
  useEffect(() => {
    if (batch.phase !== 'idle') return
    const t = setTimeout(async () => {
      setLoadingPreview(true)
      try {
        const r = await fetch('/api/prospeccao/enriquecer-lote/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBulkFilters()),
        })
        const j = await r.json()
        if (j.success) setPreview(j.data)
      } finally {
        setLoadingPreview(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [buildBulkFilters, batch.phase])

  const elegiveisAposLimite = preview
    ? limite ? Math.min(preview.elegiveis, Number(limite)) : preview.elegiveis
    : 0

  const handleStartClick = () => {
    const filters = buildBulkFilters()
    const full: Record<string, any> = { ...filters, status: 'pendente', sortBy: 'score' }
    if (limite) full.pageSize = Number(limite) // não usado no backend — informativo
    onStart(concurrency, full)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={running ? undefined : onClose} aria-hidden="true" />
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-aletis-grafite-escuro rounded-2xl shadow-2xl border border-aletis-borda dark:border-white/10">
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 bg-gradient-to-r from-aletis-verde to-aletis-verde-escuro text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
              <Zap size={18} />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Enriquecimento em lote</h3>
              <p className="text-xs text-white/70">
                BrasilAPI + SICAR aprofundado — automático, zero captcha consumido
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-40 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Controles de filtro — só editáveis antes de iniciar */}
          {batch.phase === 'idle' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-aletis-bege/40 dark:bg-white/5 border border-aletis-borda dark:border-white/10">
                <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-2 flex items-center gap-1">
                  <Filter size={11} /> Escopo do lote
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
                      <MapPin size={11} /> UF
                    </span>
                    <select
                      value={bulkUf}
                      onChange={(e) => setBulkUf(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none transition"
                    >
                      <option value="">todas</option>
                      {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
                      <Building2 size={11} /> Tipo
                    </span>
                    <select
                      value={bulkTipoPessoa}
                      onChange={(e) => setBulkTipoPessoa(e.target.value as any)}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none transition"
                    >
                      <option value="">PF e PJ</option>
                      <option value="PJ">Pessoa jurídica</option>
                      <option value="PF">Pessoa física</option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
                      <Hash size={11} /> Limite
                    </span>
                    <select
                      value={limite}
                      onChange={(e) => setLimite(e.target.value as any)}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none transition"
                    >
                      <option value="">todos</option>
                      <option value="100">primeiros 100 (top score)</option>
                      <option value="500">primeiros 500</option>
                      <option value="1000">primeiros 1000</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <label className="block">
                    <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
                      <DollarSign size={11} /> Dívida mín. <span className="text-aletis-verde font-semibold">{fmtBRLShort(bulkMinDivida)}</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={50_000_000}
                      step={100_000}
                      value={bulkMinDivida}
                      onChange={(e) => setBulkMinDivida(Number(e.target.value))}
                      className="w-full accent-aletis-verde"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
                      <Tractor size={11} /> Hectares mín. <span className="text-aletis-verde font-semibold">{fmtHa(bulkMinHectares)}</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={10000}
                      step={100}
                      value={bulkMinHectares}
                      onChange={(e) => setBulkMinHectares(Number(e.target.value))}
                      className="w-full accent-aletis-verde"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <label className="block">
                    <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 flex items-center gap-1">
                      <Search size={11} /> Termo (nome/CPF/CNPJ)
                    </span>
                    <input
                      type="text"
                      value={bulkTermo}
                      onChange={(e) => setBulkTermo(e.target.value)}
                      placeholder="(opcional)"
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none transition"
                    />
                  </label>

                  <div className="flex flex-wrap gap-3 md:mt-6">
                    <label className="inline-flex items-center gap-2 text-xs text-aletis-grafite-medio dark:text-white/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkApenasAjuizadas}
                        onChange={(e) => setBulkApenasAjuizadas(e.target.checked)}
                        className="accent-aletis-verde"
                      />
                      <Gavel size={12} /> Apenas com ajuizamento
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-aletis-grafite-medio dark:text-white/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkApenasAgroProvavel}
                        onChange={(e) => setBulkApenasAgroProvavel(e.target.checked)}
                        className="accent-aletis-verde"
                      />
                      <Wheat size={12} /> Agro provável
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-aletis-grafite-medio dark:text-white/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkApenasPfRural}
                        onChange={(e) => setBulkApenasPfRural(e.target.checked)}
                        className="accent-aletis-verde"
                      />
                      <Users size={12} /> PF rural
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-aletis-grafite-medio dark:text-white/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkApenasJudicialAgro}
                        onChange={(e) => setBulkApenasJudicialAgro(e.target.checked)}
                        className="accent-aletis-verde"
                      />
                      <AlertTriangle size={12} /> Judicial agro
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {(Object.keys(JUDICIAL_LABEL) as JudicialTipo[]).map((tipo) => {
                    const active = bulkJudicialTipos.includes(tipo)
                    return (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => setBulkJudicialTipos(active ? bulkJudicialTipos.filter((t) => t !== tipo) : [...bulkJudicialTipos, tipo])}
                        className={`px-2.5 py-1 rounded-full text-xs border transition ${
                          active
                            ? 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800'
                            : 'bg-white dark:bg-white/5 text-aletis-grafite-medio dark:text-white/50 border-aletis-borda dark:border-white/10 hover:border-red-300 dark:hover:border-red-800'
                        }`}
                      >
                        {JUDICIAL_LABEL[tipo]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Preview */}
              <div className="p-3 rounded-xl bg-gradient-to-br from-aletis-verde/10 to-aletis-dourado/5 border border-aletis-verde/20">
                <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-2 flex items-center gap-1">
                  {loadingPreview ? <Loader2 size={11} className="animate-spin" /> : <Info size={11} />}
                  Preview do lote
                </p>
                {!preview ? (
                  <p className="text-xs text-aletis-grafite-medio dark:text-white/50">calculando…</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50">Elegíveis</p>
                        <p className="font-display text-xl font-bold text-aletis-verde">{fmtNum(elegiveisAposLimite)}</p>
                        {limite && preview.elegiveis > elegiveisAposLimite && (
                          <p className="text-[10px] text-aletis-grafite-medio dark:text-white/40">de {fmtNum(preview.elegiveis)}</p>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50">Já completos</p>
                        <p className="font-display text-xl font-bold text-aletis-grafite-medio dark:text-white/50">{fmtNum(preview.jaCompletos)}</p>
                        <p className="text-[10px] text-aletis-grafite-medio dark:text-white/40">ignorados</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">CAR provável</p>
                        <p className="font-display text-xl font-bold text-emerald-700 dark:text-emerald-300">{fmtNum(preview.comCarProvavel)}</p>
                        <p className="text-[10px] text-aletis-grafite-medio dark:text-white/40">índice offline</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400">Sem CAR</p>
                        <p className="font-display text-xl font-bold text-amber-700 dark:text-amber-300">{fmtNum(preview.semCarProvavel)}</p>
                        <p className="text-[10px] text-aletis-grafite-medio dark:text-white/40">estimativa composta</p>
                      </div>
                    </div>
                    {preview.porUf.length > 1 && (
                      <div className="pt-2 border-t border-aletis-verde/20">
                        <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">
                          Distribuição por UF
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {preview.porUf.slice(0, 10).map((u) => (
                            <span
                              key={u.uf}
                              className="px-2 py-0.5 rounded-full bg-white/60 dark:bg-white/5 border border-aletis-borda dark:border-white/10 text-[10px] font-mono text-aletis-grafite-escuro dark:text-white"
                            >
                              {u.uf} <span className="text-aletis-verde font-semibold">{fmtNum(u.count)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Aviso se índice SICAR não estiver carregado */}
              {sicarStatus && !sicarStatus.index.loaded && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex gap-2">
                  <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 dark:text-amber-200">
                    <p className="font-semibold mb-0.5">Índice SICAR offline não carregado</p>
                    <p className="text-amber-800 dark:text-amber-300/80">
                      O enriquecimento vai rodar (BrasilAPI + estimativa composta), mas sem CAR real.
                      Rode <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">pnpm ingest:sicar</code> para ativar a busca offline aprofundada.
                    </p>
                  </div>
                </div>
              )}

              {/* Concorrência */}
              <label className="block">
                <span className="text-[11px] font-medium text-aletis-grafite-medio dark:text-white/50 mb-1 block">
                  Concorrência <span className="text-aletis-verde font-semibold">{concurrency} em paralelo</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  className="w-full accent-aletis-verde"
                />
                <p className="text-[11px] text-aletis-grafite-medio dark:text-white/40 mt-1">
                  Recomendado 3. Acima de 5 pode disparar rate-limit na BrasilAPI.
                </p>
              </label>

              <button
                onClick={handleStartClick}
                disabled={!preview || preview.elegiveis === 0}
                className="w-full py-3 rounded-xl bg-aletis-verde text-white font-semibold hover:bg-aletis-verde-escuro disabled:opacity-40 transition flex items-center justify-center gap-2"
              >
                <Zap size={16} /> Iniciar enriquecimento
                {preview && ` (${fmtNum(elegiveisAposLimite)} leads)`}
              </button>
            </div>
          )}

          {/* Progresso */}
          {batch.phase !== 'idle' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-aletis-grafite-escuro dark:text-white">
                    {batch.phase === 'running' ? 'Processando…' :
                     batch.phase === 'starting' ? 'Iniciando lote…' :
                     batch.phase === 'done' ? 'Concluído' :
                     batch.phase === 'cancelled' ? 'Cancelado' : 'Erro'}
                  </span>
                  <span className="text-xs font-mono text-aletis-grafite-medio dark:text-white/60">
                    {fmtNum(batch.processed)} / {fmtNum(batch.total)} · {pct}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-aletis-bege dark:bg-white/10 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      batch.phase === 'error' ? 'bg-red-500' :
                      batch.phase === 'cancelled' ? 'bg-slate-400' :
                      'bg-gradient-to-r from-aletis-verde to-aletis-dourado'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">OK</p>
                  <p className="font-display text-lg font-bold text-emerald-700 dark:text-emerald-300">{fmtNum(batch.ok)}</p>
                </div>
                <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <p className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400">Falhas</p>
                  <p className="font-display text-lg font-bold text-red-700 dark:text-red-300">{fmtNum(batch.fail)}</p>
                </div>
                <div className="p-2 rounded-lg bg-aletis-bege dark:bg-white/5 border border-aletis-borda dark:border-white/10">
                  <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50">Restantes</p>
                  <p className="font-display text-lg font-bold text-aletis-grafite-escuro dark:text-white">
                    {fmtNum(Math.max(0, batch.total - batch.processed))}
                  </p>
                </div>
              </div>

              {batch.lastLead && (
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-white/5 border border-aletis-borda dark:border-white/10 text-xs font-mono text-aletis-grafite-medio dark:text-white/60 truncate">
                  <span className="text-aletis-grafite-medio dark:text-white/40">último:</span>{' '}
                  <b className="text-aletis-grafite-escuro dark:text-white">{batch.lastLead.nome}</b>{' '}
                  <span className="text-aletis-verde">({batch.lastLead.uf})</span>
                  {batch.lastLead.carSource && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px]">
                      SICAR {batch.lastLead.carSource}
                    </span>
                  )}
                  {batch.lastLead.hectares != null && batch.lastLead.hectares > 0 && (
                    <span className="ml-2 text-aletis-verde">{fmtHa(batch.lastLead.hectares)}</span>
                  )}
                  {batch.lastLead.error && (
                    <span className="ml-2 text-red-500">— {batch.lastLead.error}</span>
                  )}
                </div>
              )}

              {batch.errors.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-red-600 dark:text-red-400 font-medium">
                    {batch.errors.length} erro(s) — ver detalhes
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto text-red-700 dark:text-red-300 font-mono">
                    {batch.errors.slice(-20).map((err, i) => (
                      <li key={i} className="truncate">• {err}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex gap-2 pt-2">
                {running ? (
                  <button
                    onClick={onCancel}
                    className="flex-1 py-2.5 rounded-xl border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 transition flex items-center justify-center gap-2"
                  >
                    <StopCircle size={14} /> Cancelar lote
                  </button>
                ) : (
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl bg-aletis-verde text-white font-semibold hover:bg-aletis-verde-escuro transition"
                  >
                    Fechar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// LeadDrawer — deep-dive
// ────────────────────────────────────────────────────────────
function LeadDrawer({
  lead,
  enriching,
  carLoading,
  deleting,
  iniciando,
  iniciarMsg,
  enrichFlash,
  dismissEnrichFlash,
  carError,
  sicarStatus,
  onClose,
  onEnrich,
  onExcluir,
  onRestaurar,
  onConsultarCar,
  onIniciarProspeccao,
  onAbrirContato,
}: {
  lead: LeadFull
  enriching: boolean
  carLoading: boolean
  deleting: boolean
  iniciando: boolean
  iniciarMsg: { tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null
  enrichFlash: { at: number; lines: string[]; isError?: boolean } | null
  dismissEnrichFlash: () => void
  carError: string | null
  sicarStatus: SicarStatus | null
  onClose: () => void
  onEnrich: () => void
  onExcluir: (motivo: string) => void
  onRestaurar: () => void
  onConsultarCar: (codImovel: string) => void
  onIniciarProspeccao: () => void
  onAbrirContato: () => void
}) {
  const isExcluido = lead.status === 'excluido'
  const askExclude = () => {
    const motivo = window.prompt(
      `Excluir LEAD "${lead.nome}"?\n\nInforme o motivo:`,
      'sem fit comercial'
    )
    if (motivo && motivo.trim()) onExcluir(motivo.trim())
  }
  const cls = CLASSIF_STYLE[lead.score.classificacao]
  const [tab, setTab] = useState<'identidade' | 'divida' | 'agro' | 'judicial' | 'car' | 'socios' | 'score' | 'contatos'>('identidade')

  // Auto-dismiss do flash de enriquecimento após 4.5s.
  useEffect(() => {
    if (!enrichFlash) return
    const t = setTimeout(dismissEnrichFlash, 4500)
    return () => clearTimeout(t)
  }, [enrichFlash, dismissEnrichFlash])

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <aside className="w-full max-w-3xl bg-white dark:bg-aletis-grafite-escuro shadow-2xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-br from-aletis-verde to-aletis-verde-escuro text-white px-6 py-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls.bg} ${cls.text} border ${cls.border}`}>
                  <Flame size={10} /> {cls.label}
                </span>
                <span className="text-[10px] text-white/50 font-mono">{lead.cpfCnpj}</span>
              </div>
              <h2 className="font-display text-2xl font-bold leading-tight">{lead.nome}</h2>
              <p className="text-white/70 text-xs mt-1 flex items-center gap-3 flex-wrap">
                <span><MapPin size={11} className="inline mr-1" /> {lead.uf}</span>
                <span>{lead.tipoPessoa === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'}</span>
                <span>{lead.qtdInscricoes} inscrições PGFN</span>
                {lead.agroProfile?.provavel && <span>agro {lead.agroProfile.nivel}</span>}
                {lead.pfProfile?.relevante && <span>PF rural</span>}
                {lead.judicialProfile?.ativo && <span>crise judicial {lead.judicialProfile.severidade}</span>}
                {lead.status === 'completa' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 text-[10px] font-semibold">
                    <CheckCircle2 size={10} /> enriquecido
                  </span>
                )}
                {isExcluido && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-500/30 text-slate-200 text-[10px] font-semibold">
                    <Archive size={10} /> excluído
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!isExcluido ? (
                <button
                  onClick={askExclude}
                  disabled={deleting}
                  className="p-2 rounded-lg hover:bg-red-500/20 text-red-200 transition disabled:opacity-40"
                  title="Excluir lead"
                  aria-label="Excluir"
                >
                  {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                </button>
              ) : (
                <button
                  onClick={onRestaurar}
                  disabled={deleting}
                  className="p-2 rounded-lg hover:bg-white/10 transition disabled:opacity-40"
                  title="Restaurar lead"
                  aria-label="Restaurar"
                >
                  {deleting ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <DrawerKpi label="Score" value={`${lead.score.total}`} sub={cls.label} />
            <DrawerKpi label="Dívida total" value={fmtBRLShort(lead.totalDivida)} sub="consolidada" />
            <DrawerKpi label="Área estimada" value={lead.area.hectaresEstimados > 0 ? fmtHa(lead.area.hectaresEstimados) : '—'} sub={`conf. ${lead.area.confidence}`} />
            <DrawerKpi label="Honorários" value={fmtBRLShort(lead.score.honorariosEstimados)} sub="1% modelo ALETIS" />
          </div>

          {/* Badges de feedback loop — aparecem se o lead tem contatos registrados */}
          {lead.feedback && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/80">
                <History size={11} /> {lead.feedback.totalContatos} contato{lead.feedback.totalContatos === 1 ? '' : 's'}
              </span>
              {lead.feedback.ultimoOutcome && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-white/80">
                  último: <b>{OUTCOME_LABEL[lead.feedback.ultimoOutcome].label}</b> · {fmtDate(lead.feedback.ultimoContatoEm)}
                </span>
              )}
              {lead.feedback.ajusteScore !== 0 && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                    lead.feedback.ajusteScore > 0
                      ? 'bg-emerald-500/20 border-emerald-300/40 text-emerald-100'
                      : 'bg-red-500/20 border-red-300/40 text-red-100'
                  }`}
                >
                  ajuste score {lead.feedback.ajusteScore > 0 ? `+${lead.feedback.ajusteScore}` : lead.feedback.ajusteScore}
                </span>
              )}
              {lead.feedback.reengajar && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-aletis-dourado/25 border border-aletis-dourado/50 text-aletis-dourado font-semibold">
                  <Siren size={11} /> cooldown vencido · reengajar
                </span>
              )}
            </div>
          )}

          {/* CTA principal — importar lead para o CRM */}
          {!isExcluido && (
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2">
              <button
                onClick={onIniciarProspeccao}
                disabled={iniciando}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-aletis-verde-escuro font-semibold text-sm shadow-lg hover:bg-aletis-bege transition disabled:opacity-60"
              >
                {iniciando ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                {iniciando ? 'Importando…' : 'Iniciar prospecção · levar ao CRM'}
              </button>
              <button
                onClick={onAbrirContato}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 text-white border border-white/30 font-semibold text-sm hover:bg-white/25 transition"
              >
                <PhoneCall size={16} /> Registrar contato
              </button>
              {iniciarMsg && (
                <span
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
                    iniciarMsg.tipo === 'sucesso'
                      ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-300/40'
                      : iniciarMsg.tipo === 'info'
                      ? 'bg-white/15 text-white border border-white/20'
                      : 'bg-red-500/20 text-red-100 border border-red-300/40'
                  }`}
                >
                  {iniciarMsg.texto}
                </span>
              )}
            </div>
          )}
        </div>

        {enrichFlash && (
          <div
            className={`px-6 py-3 border-b text-xs flex items-start gap-3 ${
              enrichFlash.isError
                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
            }`}
          >
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold mb-0.5">
                {enrichFlash.isError ? 'Falha no enriquecimento' : 'Lead enriquecido com sucesso'}
              </p>
              <p className="text-[11px] opacity-80 truncate">
                {enrichFlash.lines.join(' · ')}
              </p>
            </div>
            <button onClick={dismissEnrichFlash} className="opacity-60 hover:opacity-100" aria-label="Fechar">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Tabs — scroll horizontal suave em viewports estreitos */}
        <div className="sticky top-[112px] z-[5] bg-white dark:bg-aletis-grafite-escuro border-b border-aletis-borda dark:border-white/5">
          <div className="px-6 pt-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-1 w-max">
              {([
                { id: 'identidade', label: 'Identidade', icon: Building2 },
                { id: 'divida', label: 'Dívida ativa', icon: Gavel },
                { id: 'agro', label: 'Sinais agro', icon: Wheat },
                { id: 'judicial', label: 'Crise judicial', icon: AlertTriangle },
                { id: 'car', label: 'CAR real', icon: Trees },
                { id: 'socios', label: 'Sócios/QSA', icon: Users },
                { id: 'score', label: 'Score', icon: Gauge },
                { id: 'contatos', label: 'Contatos', icon: PhoneCall },
              ] as const).map((t) => {
                const Icon = t.icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium rounded-t-lg transition whitespace-nowrap ${
                      active
                        ? 'bg-aletis-bege dark:bg-white/5 text-aletis-verde border-b-2 border-aletis-verde -mb-px'
                        : 'text-aletis-grafite-medio dark:text-white/50 border-b-2 border-transparent -mb-px hover:text-aletis-verde hover:border-aletis-verde/30'
                    }`}
                  >
                    <Icon size={13} /> {t.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-sm">
          {tab === 'identidade' && <TabIdentidade lead={lead} onEnrich={onEnrich} enriching={enriching} />}
          {tab === 'divida' && <TabDivida lead={lead} />}
          {tab === 'agro' && <TabAgro lead={lead} />}
          {tab === 'judicial' && <TabJudicial lead={lead} />}
          {tab === 'car' && (
            <TabCar
              lead={lead}
              loading={carLoading}
              error={carError}
              sicarStatus={sicarStatus}
              onConsultar={onConsultarCar}
            />
          )}
          {tab === 'socios' && <TabSocios lead={lead} />}
          {tab === 'score' && <TabScore lead={lead} />}
          {tab === 'contatos' && <TabContatos lead={lead} onAbrirContato={onAbrirContato} />}
        </div>
      </aside>
    </div>
  )
}

function TabContatos({ lead, onAbrirContato }: { lead: LeadFull; onAbrirContato: () => void }) {
  const contatos = lead.contatos || []
  const feedback = lead.feedback
  // Ordena do mais recente para o mais antigo — UX de histórico
  const ordenados = [...contatos].sort((a, b) => b.registradoEm.localeCompare(a.registradoEm))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display text-base font-bold text-aletis-grafite-escuro dark:text-white flex items-center gap-2">
            <History size={16} className="text-aletis-verde" /> Histórico de contatos
          </h3>
          <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
            Outcomes alimentam o feedback loop — scoring é recalculado automaticamente.
          </p>
        </div>
        <button
          onClick={onAbrirContato}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-aletis-verde text-white hover:brightness-110 transition"
        >
          <PhoneCall size={13} /> Novo contato
        </button>
      </div>

      {feedback && (
        <div className="rounded-xl border border-aletis-borda dark:border-white/10 bg-aletis-bege/40 dark:bg-white/5 p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <KpiLine label="Total" value={`${feedback.totalContatos}`} />
          <KpiLine label="Último outcome" value={feedback.ultimoOutcome ? OUTCOME_LABEL[feedback.ultimoOutcome].label : '—'} />
          <KpiLine label="Último contato" value={fmtDate(feedback.ultimoContatoEm)} />
          <KpiLine
            label="Ajuste no score"
            value={feedback.ajusteScore > 0 ? `+${feedback.ajusteScore}` : `${feedback.ajusteScore}`}
            accent={feedback.ajusteScore > 0 ? 'green' : feedback.ajusteScore < 0 ? 'red' : undefined}
          />
        </div>
      )}

      {ordenados.length === 0 ? (
        <div className="p-8 text-center text-aletis-grafite-medio dark:text-white/50 text-sm">
          <PhoneCall size={28} className="mx-auto mb-2 opacity-40" />
          Nenhum contato registrado ainda. Use "Novo contato" para iniciar o histórico.
        </div>
      ) : (
        <ul className="space-y-2">
          {ordenados.map((c, i) => {
            const cfg = OUTCOME_LABEL[c.tipo]
            const toneCls =
              cfg.tone === 'green'
                ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20'
                : cfg.tone === 'amber'
                ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20'
                : cfg.tone === 'red'
                ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
                : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30'
            return (
              <li key={`${c.registradoEm}-${i}`} className={`rounded-lg border px-3 py-2 ${toneCls}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-aletis-grafite-escuro dark:text-white">
                    {cfg.label}
                    {c.canal && <span className="ml-2 text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50">· {c.canal}</span>}
                  </span>
                  <span className="text-[11px] text-aletis-grafite-medio dark:text-white/50">
                    {fmtDate(c.registradoEm)}
                    {c.registradoPor ? ` · ${c.registradoPor}` : ''}
                  </span>
                </div>
                {c.notas && (
                  <p className="mt-1 text-xs text-aletis-grafite-medio dark:text-white/70 whitespace-pre-wrap">
                    {c.notas}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function KpiLine({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'green' | 'red'
}) {
  const tone =
    accent === 'green'
      ? 'text-emerald-700 dark:text-emerald-300'
      : accent === 'red'
      ? 'text-red-700 dark:text-red-300'
      : 'text-aletis-grafite-escuro dark:text-white'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50">{label}</p>
      <p className={`font-display text-sm font-bold ${tone}`}>{value}</p>
    </div>
  )
}

function DrawerKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/[0.08] backdrop-blur rounded-xl border border-white/10 px-3 py-2.5 min-w-0">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/55 mb-0.5 truncate">{label}</p>
      <p className="font-display text-lg font-bold leading-tight tabular-nums truncate" title={value}>{value}</p>
      {sub && <p className="text-[10px] text-white/50 truncate mt-0.5" title={sub}>{sub}</p>}
    </div>
  )
}

function TabIdentidade({ lead, onEnrich, enriching }: { lead: LeadFull; onEnrich: () => void; enriching: boolean }) {
  const jaEnriquecido = !!lead.cnpj || !!lead.car || lead.status === 'completa'
  // PGFN entrega CPF mascarado para PF (sigilo fiscal) — só os 6 dígitos do meio.
  // Nessa condição BrasilAPI/SICAR individual não podem ser chamados.
  const isPseudoPfDoc = lead.tipoPessoa === 'PF' && lead.cpfCnpjClean.length < 11
  return (
    <>
      <InfoRow icon={Hash} label="CPF/CNPJ" value={lead.cpfCnpj} mono />
      <InfoRow icon={Building2} label="Tipo" value={lead.tipoPessoa === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'} />
      <InfoRow icon={MapPin} label="UF (PGFN)" value={lead.uf} />
      <InfoRow icon={Calendar} label="Primeira inscrição" value={lead.primeiraInscricao || '—'} />
      <InfoRow icon={Calendar} label="Última inscrição" value={lead.ultimaInscricao || '—'} />
      {lead.enriquecidoEm && (
        <InfoRow icon={Sparkles} label="Enriquecido em" value={new Date(lead.enriquecidoEm).toLocaleString('pt-BR')} />
      )}

      {isPseudoPfDoc && (
        <div className="mt-4 p-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-2">
          <Info size={14} className="text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <p className="font-semibold mb-0.5">CPF mascarado pelo PGFN (sigilo fiscal)</p>
            <p className="opacity-90">
              O PGFN publica PF com apenas os 6 dígitos do meio do CPF (ex.: <code className="font-mono">***.{lead.cpfCnpj}-**</code>).
              Sem o CPF completo, não há como chamar a BrasilAPI (só aceita CNPJ) nem consultar o CAR individual.
              O enriquecimento para PF vai se limitar ao índice SICAR offline por razão social — quando disponível.
            </p>
          </div>
        </div>
      )}

      {/* Card de enriquecimento — SEMPRE visível, texto adapta ao estado */}
      <div className={`mt-4 p-4 rounded-xl border ${jaEnriquecido
        ? 'border-aletis-borda dark:border-white/10 bg-aletis-bege/40 dark:bg-white/5'
        : 'border-dashed border-aletis-verde/40 bg-aletis-verde/5'}`}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Sparkles size={14} className={jaEnriquecido ? 'text-aletis-grafite-medio' : 'text-aletis-verde'} />
          <p className={`font-semibold text-sm ${jaEnriquecido ? 'text-aletis-grafite-escuro dark:text-white' : 'text-aletis-verde'}`}>
            {jaEnriquecido ? 'Reenriquecer dados' : 'Enriquecimento completo disponível'}
          </p>
          {enriching && (
            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-aletis-verde/15 text-aletis-verde text-[10px] font-semibold">
              <Loader2 size={10} className="animate-spin" /> em andamento…
            </span>
          )}
        </div>
        <p className="text-xs text-aletis-grafite-medio dark:text-white/60 mb-3">
          {isPseudoPfDoc
            ? 'Tenta match no índice SICAR offline por razão social + UF. Não há BrasilAPI/QSA para PF.'
            : jaEnriquecido
              ? 'Rebusca BrasilAPI/SICAR, atualiza dados cadastrais, área real e recalcula score.'
              : lead.tipoPessoa === 'PJ'
                ? 'BrasilAPI (sócios, CNAE, capital social) + busca automática no índice SICAR offline pela área real do imóvel.'
                : 'Busca automática no índice SICAR offline pela área real do imóvel (CPF/CNPJ ou razão social).'}
        </p>
        <button
          onClick={onEnrich}
          disabled={enriching}
          aria-busy={enriching}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 ${
            jaEnriquecido
              ? 'border border-aletis-verde/30 text-aletis-verde hover:bg-aletis-verde/10'
              : 'bg-aletis-verde text-white hover:bg-aletis-verde-escuro'
          }`}
        >
          {enriching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {enriching ? 'Enriquecendo…' : jaEnriquecido ? 'Reenriquecer agora' : 'Enriquecer agora'}
        </button>
      </div>

      {lead.cnpj && (
        <div className="mt-4 p-4 rounded-xl bg-aletis-bege/50 dark:bg-white/5 border border-aletis-borda dark:border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={14} className="text-aletis-verde" />
            <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">Dados RFB (via BrasilAPI)</p>
          </div>
          <InfoRow icon={Building2} label="Razão social" value={lead.cnpj.razaoSocial} />
          {lead.cnpj.nomeFantasia && <InfoRow icon={Building2} label="Nome fantasia" value={lead.cnpj.nomeFantasia} />}
          <InfoRow icon={FileText} label="CNAE" value={`${lead.cnpj.cnaeFiscal} — ${lead.cnpj.cnaeFiscalDescricao}`} />
          <InfoRow icon={Calendar} label="Abertura" value={lead.cnpj.dataAbertura} />
          <InfoRow icon={CheckCircle2} label="Situação" value={lead.cnpj.situacaoCadastral} />
          <InfoRow icon={DollarSign} label="Capital social" value={fmtBRL(lead.cnpj.capitalSocial)} />
          {lead.cnpj.porte && <InfoRow icon={BarChart3} label="Porte" value={lead.cnpj.porte} />}
          <InfoRow
            icon={MapPin}
            label="Endereço"
            value={[
              lead.cnpj.endereco.logradouro,
              lead.cnpj.endereco.numero,
              lead.cnpj.endereco.bairro,
              `${lead.cnpj.endereco.municipio}/${lead.cnpj.endereco.uf}`,
              lead.cnpj.endereco.cep,
            ].filter(Boolean).join(', ')}
          />
        </div>
      )}
    </>
  )
}

function TabDivida({ lead }: { lead: LeadFull }) {
  const [showAll, setShowAll] = useState(false)
  const groupedByFonte = useMemo(() => {
    const m = new Map<string, { count: number; total: number; ajuizadas: number }>()
    for (const d of lead.debts) {
      const e = m.get(d.fonte) || { count: 0, total: 0, ajuizadas: 0 }
      e.count++
      e.total += d.valor
      if (d.ajuizado) e.ajuizadas++
      m.set(d.fonte, e)
    }
    return Array.from(m.entries())
      .map(([fonte, v]) => ({ fonte, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [lead.debts])

  const situacaoAgg = useMemo(() => {
    const m = new Map<SituacaoBucket, { count: number; total: number }>()
    for (const d of lead.debts) {
      const key = situacaoBucket(d.situacao)
      const e = m.get(key) || { count: 0, total: 0 }
      e.count++
      e.total += d.valor
      m.set(key, e)
    }
    return Array.from(m.entries())
      .map(([bucket, v]) => ({ bucket, ...v }))
      .sort((a, b) => b.total - a.total)
  }, [lead.debts])

  const tipoAgg = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>()
    for (const d of lead.debts) {
      const key = shortTipoCredito(d.tipoCredito || 'OUTROS') || 'OUTROS'
      const e = m.get(key) || { count: 0, total: 0 }
      e.count++
      e.total += d.valor
      m.set(key, e)
    }
    return Array.from(m.entries())
      .map(([tipo, v]) => ({ tipo, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [lead.debts])

  const sortedDebts = useMemo(
    () => [...lead.debts].sort((a, b) => b.valor - a.valor),
    [lead.debts],
  )
  const visibleDebts = showAll ? sortedDebts : sortedDebts.slice(0, 50)
  const ajuizadasTotal = lead.debts.filter((d) => d.ajuizado).length

  return (
    <div className="space-y-4">
      {/* Sub-totais por FONTE (FGTS / PREV / NÃO-PREV) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {groupedByFonte.map((g) => {
          const meta = FONTE_LABEL[g.fonte] || { label: g.fonte, desc: '' }
          return (
            <div key={g.fonte} className="bg-aletis-bege/50 dark:bg-white/5 rounded-lg p-3 border border-aletis-borda dark:border-white/10">
              <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50">{meta.label}</p>
              <p className="font-display text-lg font-bold text-aletis-grafite-escuro dark:text-white">{fmtBRLShort(g.total)}</p>
              <p className="text-[10px] text-aletis-grafite-medio dark:text-white/50">
                {g.count} inscrições{g.ajuizadas > 0 ? ` · ${g.ajuizadas} ajuizadas` : ''}
              </p>
              {meta.desc && (
                <p className="text-[10px] text-aletis-grafite-medio dark:text-white/40 mt-1 leading-tight">{meta.desc}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Distribuição por SITUAÇÃO — leitura jurídica */}
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-3 bg-white/60 dark:bg-black/10">
        <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-2">
          Situação das inscrições
        </p>
        <div className="flex flex-wrap gap-2">
          {situacaoAgg.map((s) => {
            const st = SITUACAO_STYLE[s.bucket]
            return (
              <span key={s.bucket} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${st.chip}`}>
                {st.label}
                <span className="opacity-70">· {s.count}</span>
                <span className="font-mono">· {fmtBRLShort(s.total)}</span>
              </span>
            )
          })}
          {ajuizadasTotal > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800">
              <Gavel size={10} /> Ajuizadas total · {ajuizadasTotal}
            </span>
          )}
        </div>
      </div>

      {/* Distribuição por tipo de crédito */}
      {tipoAgg.length > 0 && (
        <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-2">
            Principais tipos de crédito (top {tipoAgg.length})
          </p>
          <div className="space-y-1">
            {tipoAgg.map((t) => {
              const pct = Math.min(100, Math.round((t.total / Math.max(1, lead.totalDivida)) * 100))
              return (
                <div key={t.tipo} className="flex items-center gap-3 text-xs">
                  <span className="flex-1 min-w-0 truncate text-aletis-grafite-escuro dark:text-white" title={t.tipo}>{t.tipo}</span>
                  <span className="text-aletis-grafite-medio dark:text-white/50 text-[11px]">{t.count}×</span>
                  <span className="font-mono font-semibold text-aletis-grafite-escuro dark:text-white w-24 text-right">{fmtBRLShort(t.total)}</span>
                  <div className="w-16 h-1.5 rounded-full bg-aletis-borda/40 dark:bg-white/10 overflow-hidden">
                    <div className="h-full bg-aletis-verde" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tabela detalhada — cada inscrição com tipo de crédito legível */}
      <div className="overflow-x-auto rounded-lg border border-aletis-borda dark:border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-aletis-bege/50 dark:bg-white/5 text-aletis-grafite-medio dark:text-white/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Fonte</th>
              <th className="text-left px-3 py-2 font-medium">Inscrição</th>
              <th className="text-left px-3 py-2 font-medium">Tipo de crédito</th>
              <th className="text-left px-3 py-2 font-medium">Situação</th>
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-center px-3 py-2 font-medium">Ajuiz.</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-aletis-borda dark:divide-white/5">
            {visibleDebts.map((d, i) => {
              const st = SITUACAO_STYLE[situacaoBucket(d.situacao)]
              const fonteLabel = FONTE_LABEL[d.fonte]?.label ?? d.fonte
              return (
                <tr key={`${d.fonte}-${d.inscricao}-${i}`} className="hover:bg-aletis-bege/30 dark:hover:bg-white/5">
                  <td className="px-3 py-2 whitespace-nowrap text-[11px] font-semibold text-aletis-grafite-escuro dark:text-white">{fonteLabel}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-aletis-grafite-medio dark:text-white/60">{d.inscricao}</td>
                  <td className="px-3 py-2 truncate max-w-[220px]" title={d.tipoCredito}>{shortTipoCredito(d.tipoCredito)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${st.chip}`} title={d.situacao}>
                      {st.label}
                    </span>
                    {d.tipoSituacao && (
                      <span className="ml-1 text-[10px] text-aletis-grafite-medio dark:text-white/40">· {d.tipoSituacao}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-[11px]">{d.dataInscricao}</td>
                  <td className="px-3 py-2 text-center">
                    {d.ajuizado ? (
                      <span className="text-red-600 dark:text-red-400" title="Ajuizada">●</span>
                    ) : (
                      <span className="text-aletis-grafite-medio dark:text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">{fmtBRL(d.valor)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-aletis-verde/5 border-t-2 border-aletis-verde">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right font-semibold text-aletis-grafite-escuro dark:text-white">Total</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-aletis-verde">{fmtBRL(lead.totalDivida)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {lead.debts.length > 50 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full text-[11px] text-aletis-verde hover:underline py-1"
        >
          {showAll ? `Mostrar apenas as 50 maiores` : `Ver todas as ${lead.debts.length} inscrições`}
        </button>
      )}
    </div>
  )
}

function TabAgro({ lead }: { lead: LeadFull }) {
  return (
    <>
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4 bg-gradient-to-br from-aletis-verde/5 to-transparent">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Tractor size={16} className="text-aletis-verde" />
          <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">Perfil agro</p>
          <span className="ml-auto text-xs font-semibold text-aletis-verde">
            {lead.agroProfile.provavel ? `agro ${lead.agroProfile.nivel}` : 'baixo sinal agro'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="font-display text-4xl font-bold text-aletis-verde">
                {lead.area.hectaresEstimados > 0 ? fmtNum(lead.area.hectaresEstimados) : '—'}
              </span>
              <span className="text-aletis-grafite-medio dark:text-white/50 text-sm">hectares (est.)</span>
            </div>
            <p className="text-[11px] text-aletis-grafite-medio dark:text-white/50 mb-2">
              Método: <b className="text-aletis-grafite-escuro dark:text-white">{lead.area.metodo}</b>
            </p>
            <p className={`text-[11px] font-semibold ${CONFIDENCE_COLOR[lead.area.confidence]}`}>
              Confiança: {lead.area.confidence}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-2">
              Evidências agro
            </p>
            <div className="flex flex-wrap gap-2">
              {lead.agroProfile.evidencias.length > 0 ? lead.agroProfile.evidencias.map((item) => (
                <span key={item} className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {item}
                </span>
              )) : (
                <span className="text-xs text-aletis-grafite-medio dark:text-white/50">sem evidência forte</span>
              )}
            </div>
          </div>
        </div>
        {lead.area.explicacao && (
          <pre className="mt-3 whitespace-pre-wrap text-[11px] text-aletis-grafite-medio dark:text-white/60 bg-aletis-bege/50 dark:bg-black/20 p-3 rounded-lg font-mono leading-relaxed">
            {lead.area.explicacao}
          </pre>
        )}
      </div>

      {lead.tipoPessoa === 'PF' && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-900/50 p-4 bg-sky-50/50 dark:bg-sky-950/10">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-sky-600 dark:text-sky-400" />
            <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">Perfil PF rural</p>
          </div>
          <p className="text-sm font-semibold text-sky-700 dark:text-sky-300 mb-2">
            {lead.pfProfile.relevante ? `PF rural ${lead.pfProfile.nivel}` : 'PF sem âncora rural forte'}
          </p>
          <div className="flex flex-wrap gap-2">
            {lead.pfProfile.evidencias.length > 0 ? lead.pfProfile.evidencias.map((item) => (
              <span key={item} className="px-2.5 py-1 rounded-full bg-sky-100 dark:bg-sky-950/30 border border-sky-300 dark:border-sky-800 text-xs font-medium text-sky-700 dark:text-sky-300">
                {item}
              </span>
            )) : (
              <span className="text-xs text-aletis-grafite-medio dark:text-white/50">sem vínculo PF rural derivado</span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4">
        <p className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Wheat size={14} className="text-aletis-dourado" /> Sinais agro cruzados
        </p>
        <div className="flex flex-wrap gap-2">
          {lead.agroSignals.length > 0 ? (
            Array.from(new Set(lead.agroSignals)).map((s) => (
              <span key={s} className="px-2.5 py-1 rounded-full bg-aletis-dourado/15 border border-aletis-dourado/30 text-xs font-medium text-aletis-dourado">
                {s}
              </span>
            ))
          ) : (
            <span className="text-xs text-aletis-grafite-medio dark:text-white/50">nenhum</span>
          )}
        </div>
      </div>
    </>
  )
}

function TabCar({
  lead,
  loading,
  error,
  sicarStatus,
  onConsultar,
}: {
  lead: LeadFull
  loading: boolean
  error: string | null
  sicarStatus: SicarStatus | null
  onConsultar: (codImovel: string) => void
}) {
  const [codigo, setCodigo] = useState(lead.car?.codImovel || '')
  const sicarOnline = sicarStatus?.sicar.online ?? false
  const disabled = loading || !codigo.trim() || !sicarOnline
  const car = lead.car

  return (
    <>
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4 bg-gradient-to-br from-aletis-verde/5 to-transparent">
        <div className="flex items-center gap-2 mb-3">
          <Trees size={16} className="text-aletis-verde" />
          <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">
            Cadastro Ambiental Rural (SICAR)
          </p>
          <span className={`ml-auto text-[11px] font-semibold flex items-center gap-1 ${
            sicarOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
          }`}>
            {sicarOnline ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
            {sicarOnline ? 'online' : 'indisponível'}
          </span>
        </div>

        <p className="text-[11px] text-aletis-grafite-medio dark:text-white/60 mb-3 leading-relaxed">
          Consulta pública em <code className="font-mono text-aletis-verde">consultapublica.car.gov.br</code> —
          reCAPTCHA v2 resolvido automaticamente via <b>2captcha</b>. Informe o código CAR do imóvel
          (formato <span className="font-mono">UF-XXXXXXX-…</span>) para obter a área oficial, módulos fiscais e
          reserva legal.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Ex.: MT-5107578-ABCD1234…"
            className="flex-1 px-3 py-2 text-sm font-mono rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro focus:border-aletis-verde focus:ring-1 focus:ring-aletis-verde outline-none transition"
          />
          <button
            onClick={() => onConsultar(codigo.trim())}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde-escuro transition disabled:opacity-40"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Satellite size={13} />}
            {loading ? 'consultando…' : 'Consultar SICAR'}
          </button>
        </div>

        {!sicarOnline && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2 flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            SICAR indisponível no momento{sicarStatus?.sicar.reason ? ` (${sicarStatus.sicar.reason})` : ''}.
            Tente novamente em alguns minutos — o captcha fica pronto para disparar assim que o serviço voltar.
          </p>
        )}
        {error && (
          <p className="text-[11px] text-red-700 dark:text-red-400 mt-2 flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            {error}
          </p>
        )}
      </div>

      {car ? (
        <div className="rounded-xl border border-emerald-400/40 bg-emerald-50/50 dark:bg-emerald-950/15 p-4">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">
              Dados oficiais do imóvel
            </p>
            {lead.carSource === 'offline' ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-aletis-verde/15 text-aletis-verde border border-aletis-verde/30 flex items-center gap-1">
                <Trees size={10} /> índice offline
              </span>
            ) : lead.carSource === 'live' ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-400/30 flex items-center gap-1">
                <Satellite size={10} /> consulta ao vivo (2captcha)
              </span>
            ) : null}
            <span className="ml-auto text-[10px] font-mono text-aletis-grafite-medio dark:text-white/40">
              {new Date(car.consultadoEm).toLocaleString('pt-BR')}
            </span>
          </div>

          <div className="flex items-baseline gap-3 mb-4">
            <span className="font-display text-4xl font-bold text-emerald-700 dark:text-emerald-400">
              {fmtNum(Math.round(lead.area.hectaresSicar ?? car.areaImovel))}
            </span>
            <span className="text-sm text-aletis-grafite-medio dark:text-white/60">
              hectares {lead.carOutrosImoveis && lead.carOutrosImoveis.length > 1 ? '— total do proprietário' : '— área do imóvel'}
            </span>
          </div>

          {lead.carOutrosImoveis && lead.carOutrosImoveis.length > 1 && (
            <div className="mb-3 p-2.5 rounded-lg bg-white/60 dark:bg-black/20 border border-aletis-borda dark:border-white/10">
              <p className="text-[11px] font-semibold text-aletis-grafite-escuro dark:text-white mb-1.5">
                Proprietário com {lead.carOutrosImoveis.length} imóveis:
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {lead.carOutrosImoveis.map((im) => (
                  <div key={im.codImovel} className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-aletis-grafite-medio dark:text-white/60 truncate mr-2">{im.codImovel}</span>
                    <span className="text-aletis-grafite-medio dark:text-white/50">{im.municipio}/{im.uf}</span>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 ml-2">
                      {fmtNum(Math.round(im.areaImovel))} ha
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <InfoRow icon={Hash} label="Código CAR" value={car.codImovel} mono />
            <InfoRow icon={MapPin} label="Município / UF" value={`${car.municipio || '—'} / ${car.uf}`} />
            {car.modulosFiscais != null && (
              <InfoRow icon={BarChart3} label="Módulos fiscais" value={String(car.modulosFiscais)} />
            )}
            <InfoRow icon={CheckCircle2} label="Condição" value={car.condicaoCadastro} />
            {car.statusAnalise && <InfoRow icon={Info} label="Status análise" value={car.statusAnalise} />}
            {car.dataCadastro && <InfoRow icon={Calendar} label="Cadastro em" value={car.dataCadastro} />}
            {car.tipoImovel && <InfoRow icon={Building2} label="Tipo imóvel" value={car.tipoImovel} />}
            {car.areaReservaLegal != null && (
              <InfoRow icon={Trees} label="Reserva legal" value={`${fmtNum(Math.round(car.areaReservaLegal))} ha`} />
            )}
            {car.areaPreservacaoPermanente != null && (
              <InfoRow icon={Trees} label="APP" value={`${fmtNum(Math.round(car.areaPreservacaoPermanente))} ha`} />
            )}
            {car.areaVegetacaoNativa != null && (
              <InfoRow icon={Trees} label="Vegetação nativa" value={`${fmtNum(Math.round(car.areaVegetacaoNativa))} ha`} />
            )}
            {car.areaAntropizada != null && (
              <InfoRow icon={Tractor} label="Área antropizada" value={`${fmtNum(Math.round(car.areaAntropizada))} ha`} />
            )}
          </div>

          <p className="text-[10px] text-aletis-grafite-medio dark:text-white/50 mt-3 italic">
            Fonte: SFB/SICAR · consulta pública via 2captcha. A estimativa da aba "Sinais agro" foi substituída pela área real.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-aletis-borda dark:border-white/10 p-4 text-center">
          <Satellite size={24} className="mx-auto mb-2 text-aletis-grafite-medio dark:text-white/40" />
          <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
            Nenhuma consulta CAR ainda. Informe o código do imóvel acima para trazer a área oficial do SICAR.
          </p>
        </div>
      )}
    </>
  )
}

function TabJudicial({ lead }: { lead: LeadFull }) {
  const events = lead.judicialEvents ?? []
  const severityStyle = JUDICIAL_STYLE[lead.judicialProfile.severidade]
  const [showRaw, setShowRaw] = useState(false)

  const ajuizadasDebts = useMemo(() => lead.debts.filter((d) => d.ajuizado), [lead.debts])
  const ajuizadasValor = ajuizadasDebts.reduce((acc, d) => acc + d.valor, 0)
  const rescindidasCount = lead.debts.filter((d) => situacaoBucket(d.situacao) === 'rescindido').length
  const suspensasCount = lead.debts.filter((d) => situacaoBucket(d.situacao) === 'suspenso').length
  const suspensasValor = lead.debts
    .filter((d) => situacaoBucket(d.situacao) === 'suspenso')
    .reduce((acc, d) => acc + d.valor, 0)

  const sitEspecial = lead.cnpj?.situacaoEspecial
  const motivoCad = lead.cnpj?.motivoSituacaoCadastral
  const rawJudicialSignals = (lead.agroSignals || []).filter((s) => s.startsWith('DOU:') && !s.startsWith('DOU:agro:'))

  return (
    <div className="space-y-4">
      {/* Hero: perfil judicial consolidado */}
      <div className={`rounded-xl border p-4 ${severityStyle.badge} ${severityStyle.border}`}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <AlertTriangle size={16} className={severityStyle.text} />
          <p className={`font-semibold text-sm ${severityStyle.text}`}>Perfil judicial consolidado</p>
          <span className={`ml-auto text-xs font-semibold ${severityStyle.text}`}>
            {lead.judicialProfile.ativo ? `severidade ${lead.judicialProfile.severidade}` : 'sem crise judicial materializada'}
          </span>
        </div>
        <p className="text-sm text-aletis-grafite-escuro dark:text-white mb-3">
          {lead.judicialProfile.explicacao}
        </p>
        <div className="flex flex-wrap gap-2">
          {lead.judicialProfile.tipos.length > 0 ? lead.judicialProfile.tipos.map((tipo) => (
            <span key={tipo} className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${severityStyle.badge} ${severityStyle.text} ${severityStyle.border}`}>
              {JUDICIAL_LABEL[tipo]}
            </span>
          )) : (
            <span className="text-xs text-aletis-grafite-medio dark:text-white/50">nenhum tipo judicial estruturado</span>
          )}
        </div>
        {lead.judicialProfile.evidencias.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {lead.judicialProfile.evidencias.map((item) => (
              <span key={item} className="px-2.5 py-1 rounded-full bg-white/60 dark:bg-black/20 border border-aletis-borda dark:border-white/10 text-xs text-aletis-grafite-escuro dark:text-white/80">
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sinais cruzados: PGFN x DOU x BrasilAPI x SICAR */}
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4">
        <p className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Archive size={14} className="text-aletis-verde" /> Sinais cruzados · mapa das fontes
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {/* PGFN */}
          <div className={`p-3 rounded-lg border ${ajuizadasDebts.length > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : 'bg-aletis-bege/40 dark:bg-white/5 border-aletis-borda dark:border-white/10'}`}>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">PGFN · execução fiscal</p>
            {ajuizadasDebts.length > 0 ? (
              <>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  {ajuizadasDebts.length} inscrições ajuizadas · {fmtBRL(ajuizadasValor)}
                </p>
                {rescindidasCount > 0 && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                    {rescindidasCount} parcelamento(s) rescindido(s) — risco de novo ajuizamento
                  </p>
                )}
                {suspensasCount > 0 && (
                  <p className="text-[11px] text-sky-700 dark:text-sky-300 mt-1">
                    {suspensasCount} suspensa(s) por decisão judicial · {fmtBRL(suspensasValor)}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">Nenhuma inscrição PGFN ajuizada</p>
            )}
          </div>

          {/* BrasilAPI · CNPJ */}
          <div className={`p-3 rounded-lg border ${sitEspecial || motivoCad ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900' : 'bg-aletis-bege/40 dark:bg-white/5 border-aletis-borda dark:border-white/10'}`}>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">BrasilAPI · situação cadastral</p>
            {lead.cnpj ? (
              <>
                <p className="text-sm text-aletis-grafite-escuro dark:text-white">
                  {lead.cnpj.situacaoCadastral || '—'}
                </p>
                {sitEspecial && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
                    Situação especial: <b>{sitEspecial}</b>
                  </p>
                )}
                {motivoCad && (
                  <p className="text-[11px] text-aletis-grafite-medio dark:text-white/60 mt-1">
                    Motivo: {motivoCad}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
                CNPJ ainda não enriquecido · clique em "Enriquecer agora" para materializar
              </p>
            )}
          </div>

          {/* DOU */}
          <div className={`p-3 rounded-lg border ${rawJudicialSignals.length > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : 'bg-aletis-bege/40 dark:bg-white/5 border-aletis-borda dark:border-white/10'}`}>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">DOU · publicações oficiais</p>
            {events.length > 0 ? (
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                {events.length} evento(s) estruturado(s) · ver abaixo
              </p>
            ) : rawJudicialSignals.length > 0 ? (
              <p className="text-sm text-red-700 dark:text-red-300">
                Sinais brutos DOU presentes mas sem evento estruturado
              </p>
            ) : (
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
                Sem publicação DOU recente associada
              </p>
            )}
          </div>

          {/* SICAR/CAR */}
          <div className={`p-3 rounded-lg border ${lead.car ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900' : 'bg-aletis-bege/40 dark:bg-white/5 border-aletis-borda dark:border-white/10'}`}>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">SICAR · patrimônio rural</p>
            {lead.car ? (
              <>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  CAR {lead.car.codImovel} · {fmtNum(lead.car.areaImovel)} ha
                </p>
                {lead.car.municipio && (
                  <p className="text-[11px] text-aletis-grafite-medio dark:text-white/60 mt-1">
                    {lead.car.municipio}/{lead.car.uf} · {lead.car.condicaoCadastro || lead.car.statusAnalise || '—'}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
                CAR não materializado · pode ancorar penhora/alienação judicial
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Eventos estruturados do DOU */}
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4">
        <p className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Gavel size={14} className="text-red-600 dark:text-red-400" /> Eventos estruturados do DOU
        </p>
        {events.length === 0 ? (
          <p className="text-xs text-aletis-grafite-medio dark:text-white/50">
            Nenhum evento judicial estruturado ainda. Quando DOU/BrasilAPI materializam sinais (recuperação judicial, falência, leilão, penhora), eles aparecem aqui com tipo, severidade, data e resumo auditável.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((event, index) => {
              const style = JUDICIAL_STYLE[event.severidade]
              return (
                <div key={`${event.tipo}-${event.data}-${index}`} className={`rounded-lg border p-3 ${style.badge} ${style.border}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.badge} ${style.text} ${style.border}`}>
                        {JUDICIAL_LABEL[event.tipo]}
                      </span>
                      <span className="text-[11px] text-aletis-grafite-medio dark:text-white/50">
                        {event.fonte} · {fmtDate(event.data)}
                      </span>
                    </div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>
                      {event.severidade}
                    </span>
                  </div>
                  <p className="text-sm text-aletis-grafite-escuro dark:text-white/90">{event.resumo}</p>
                  {event.url && (
                    <a
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 mt-2 text-xs text-aletis-verde hover:underline"
                    >
                      <Eye size={12} /> abrir publicação no DOU
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Leitura comercial */}
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4 bg-aletis-bege/40 dark:bg-white/5">
        <p className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Info size={14} className="text-aletis-verde" /> Leitura comercial
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <KpiLine label="Dívida total" value={fmtBRL(lead.totalDivida)} />
          <KpiLine label="Inscrições" value={`${lead.qtdInscricoes}${ajuizadasDebts.length ? ` · ${ajuizadasDebts.length} ajuizadas` : ''}`} accent={ajuizadasDebts.length ? 'red' : undefined} />
          <KpiLine label="Multi-source" value={lead.sources?.length ? `${lead.sources.length} fontes · ${lead.sources.map((s) => s.fonte).join(', ')}` : 'fonte única'} />
          <KpiLine label="Agro provável" value={lead.agroProfile.provavel ? `sim · ${lead.agroProfile.nivel}` : 'não'} accent={lead.agroProfile.provavel ? 'green' : undefined} />
          <KpiLine label="PF rural" value={lead.pfProfile.relevante ? `sim · ${lead.pfProfile.nivel}` : 'não'} accent={lead.pfProfile.relevante ? 'green' : undefined} />
          <KpiLine label="Score total" value={`${lead.score.total} · ${lead.score.classificacao}`} />
        </div>
      </div>

      {/* Sinais brutos — auditoria expandível */}
      {rawJudicialSignals.length > 0 && (
        <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="w-full flex items-center justify-between text-sm font-semibold text-aletis-grafite-escuro dark:text-white"
          >
            <span className="flex items-center gap-2">
              <Hash size={14} className="text-aletis-grafite-medio" /> Sinais brutos para auditoria ({rawJudicialSignals.length})
            </span>
            <span className="text-[11px] text-aletis-grafite-medio">{showRaw ? 'ocultar' : 'ver'}</span>
          </button>
          {showRaw && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rawJudicialSignals.map((s) => (
                <code key={s} className="px-2 py-0.5 rounded bg-aletis-bege/50 dark:bg-white/5 border border-aletis-borda dark:border-white/10 text-[10px] font-mono text-aletis-grafite-escuro dark:text-white/70">
                  {s}
                </code>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TabScore({ lead }: { lead: LeadFull }) {
  const b = lead.score.breakdown
  const m = lead.score.motivos
  const items: Array<{ label: string; value: number; max: number; icon: any; hint?: string }> = [
    { label: 'Tamanho da dívida', value: b.divida, max: 30, icon: DollarSign },
    { label: 'Ajuizamento (urgência)', value: b.ajuizamento, max: 15, icon: Gavel },
    { label: 'Recência da inscrição', value: b.recencia, max: 10, icon: Calendar },
    { label: 'Qualidade do sinal agro', value: b.agroMatch, max: 10, icon: Wheat },
    { label: 'Área estimada', value: b.hectares, max: 10, icon: Tractor },
    { label: 'Velocity do passivo', value: b.velocity ?? 0, max: 10, icon: Zap, hint: m?.velocity },
    { label: 'Fit regional ALETIS', value: b.fitRegional ?? 0, max: 15, icon: MapPin, hint: m?.fitRegional },
    { label: 'Cross-source', value: b.multiSource ?? 0, max: 5, icon: Archive, hint: m?.multiSource },
    { label: 'Crise pública (DOU)', value: b.douCrise ?? 0, max: 5, icon: AlertTriangle, hint: m?.douCrise },
  ]
  return (
    <>
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4 bg-gradient-to-br from-aletis-verde/5 to-transparent">
        <p className="text-[11px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50 mb-1">
          Score ALETIS
        </p>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-5xl font-bold text-aletis-verde">{lead.score.total}</span>
          <span className="text-sm text-aletis-grafite-medio dark:text-white/50">/ 100</span>
          <span className="ml-auto text-sm font-semibold text-aletis-grafite-escuro dark:text-white">
            {CLASSIF_STYLE[lead.score.classificacao].label}
          </span>
        </div>
        <p className="text-xs text-aletis-grafite-medio dark:text-white/50 mt-1">
          Honorários estimados (1% dívida): <b className="text-aletis-dourado">{fmtBRL(lead.score.honorariosEstimados)}</b>
        </p>
      </div>

      <div className="space-y-2">
        {items.map((it) => {
          const Icon = it.icon
          const pct = it.max > 0 ? (it.value / it.max) * 100 : 0
          return (
            <div key={it.label}>
              <div className="flex items-center justify-between mb-1 text-xs">
                <span className="flex items-center gap-1.5 text-aletis-grafite-escuro dark:text-white">
                  <Icon size={12} /> {it.label}
                </span>
                <span className="font-mono text-aletis-grafite-medio dark:text-white/60">
                  {it.value} / {it.max}
                </span>
              </div>
              <div className="h-2 bg-aletis-bege dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-aletis-verde to-aletis-verde-medio rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {it.hint && (
                <p className="mt-0.5 text-[10px] italic text-aletis-grafite-medio dark:text-white/40">
                  {it.hint}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ElementType
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <Icon size={13} className="text-aletis-grafite-medio dark:text-white/40 mt-0.5 flex-shrink-0" />
      <span className="text-aletis-grafite-medio dark:text-white/50 w-32 flex-shrink-0">{label}</span>
      <span className={`text-aletis-grafite-escuro dark:text-white flex-1 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// QuickSqlPanel — Wave-PG-12: query indexada nos 39k leads PGFN
// Filtros simples (UF, score min, dívida range, ajuizado, orderBy) e
// resultado em até 200 linhas. Aproveita índices do Postgres
// (lead_pgfn_uf_idx + lead_pgfn_score_idx) — muito mais rápido
// que filtrar Map em RAM.
// ────────────────────────────────────────────────────────────
interface SqlLeadRow {
  cnpjCpf: string
  nome: string | null
  uf: string | null
  totalDivida: string | null
  inscricoesCount: number | null
  ajuizado: boolean
  agroScore: number | null
}

function QuickSqlPanel({ onOpen }: { onOpen: (cpfCnpj: string) => void }) {
  const [uf, setUf] = useState('')
  const [minDividaMi, setMinDividaMi] = useState('')
  const [ajuizado, setAjuizado] = useState<'all' | 'true' | 'false'>('all')
  const [orderBy, setOrderBy] = useState<'divida' | 'score' | 'nome'>('divida')
  const [limit, setLimit] = useState(50)
  const [rows, setRows] = useState<SqlLeadRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const search = useCallback(async () => {
    setLoading(true)
    setAviso(null)
    try {
      const params = new URLSearchParams()
      if (uf) params.set('uf', uf)
      if (minDividaMi) params.set('minDivida', String(Number(minDividaMi) * 1_000_000))
      if (ajuizado !== 'all') params.set('ajuizado', ajuizado)
      params.set('orderBy', orderBy)
      params.set('limit', String(limit))
      const r = await fetch(`/api/prospeccao/leads/sql?${params.toString()}`)
      const j = await r.json()
      if (!j.success) throw new Error(j.error || 'falha SQL')
      setRows(j.leads ?? [])
      setTotal(j.total ?? 0)
      if (j.aviso) setAviso(j.aviso)
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [uf, minDividaMi, ajuizado, orderBy, limit])

  return (
    <div className="rounded-2xl border border-aletis-borda dark:border-white/5 bg-white dark:bg-aletis-grafite-escuro shadow-sm overflow-hidden">
      <button
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next && rows.length === 0) void search()
        }}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-aletis-bege/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Database size={18} className="text-aletis-verde" />
          <div className="text-left">
            <h2 className="font-display text-base font-bold text-aletis-grafite-escuro dark:text-white">
              Query rápida via SQL (Postgres)
            </h2>
            <p className="text-xs text-aletis-grafite-medio dark:text-white/60">
              Filtros indexados nos 39k leads PGFN — bem mais rápido que filtros em RAM
            </p>
          </div>
        </div>
        <ChevronRight
          size={16}
          className={`text-aletis-grafite-claro transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-4 border-t border-aletis-borda/50">
          <div className="pt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <label className="block text-xs">
              <span className="text-aletis-grafite-medio dark:text-white/60">UF</span>
              <input
                type="text"
                value={uf}
                maxLength={2}
                onChange={(e) => setUf(e.target.value.toUpperCase())}
                placeholder="PR"
                className="mt-1 w-full px-2 py-1.5 rounded border border-aletis-borda bg-white text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-aletis-grafite-medio dark:text-white/60">Dívida mín (R$ mi)</span>
              <input
                type="number"
                value={minDividaMi}
                onChange={(e) => setMinDividaMi(e.target.value)}
                placeholder="50"
                className="mt-1 w-full px-2 py-1.5 rounded border border-aletis-borda bg-white text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-aletis-grafite-medio dark:text-white/60">Ajuizado</span>
              <select
                value={ajuizado}
                onChange={(e) => setAjuizado(e.target.value as 'all' | 'true' | 'false')}
                className="mt-1 w-full px-2 py-1.5 rounded border border-aletis-borda bg-white text-sm"
              >
                <option value="all">Todos</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-aletis-grafite-medio dark:text-white/60">Ordenar por</span>
              <select
                value={orderBy}
                onChange={(e) => setOrderBy(e.target.value as 'divida' | 'score' | 'nome')}
                className="mt-1 w-full px-2 py-1.5 rounded border border-aletis-borda bg-white text-sm"
              >
                <option value="divida">Dívida (maior primeiro)</option>
                <option value="score">Score agro (maior primeiro)</option>
                <option value="nome">Nome (alfabético)</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-aletis-grafite-medio dark:text-white/60">Limite</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="mt-1 w-full px-2 py-1.5 rounded border border-aletis-borda bg-white text-sm"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={search}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde-claro transition disabled:opacity-50"
            >
              {loading ? 'Consultando…' : 'Buscar via PG'}
            </button>
            <p className="text-xs text-aletis-grafite-claro tabular-nums">
              {total > 0 ? `${total.toLocaleString('pt-BR')} leads (mostrando ${rows.length})` : ''}
            </p>
          </div>
          {aviso && (
            <p className="text-xs text-amber-700 italic">{aviso}</p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-aletis-borda/50 bg-aletis-bege/30">
              <table className="w-full text-sm">
                <thead className="bg-aletis-grafite-escuro/5 text-[10px] uppercase tracking-wider text-aletis-grafite-medio">
                  <tr>
                    <th className="text-left px-3 py-2">Nome</th>
                    <th className="text-left px-3 py-2">CNPJ/CPF</th>
                    <th className="text-left px-3 py-2">UF</th>
                    <th className="text-right px-3 py-2">Dívida (R$)</th>
                    <th className="text-center px-3 py-2">Insc.</th>
                    <th className="text-center px-3 py-2">Score</th>
                    <th className="text-center px-3 py-2">Aj.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-aletis-borda/40">
                  {rows.map((r) => (
                    <tr
                      key={r.cnpjCpf}
                      onClick={() => onOpen(r.cnpjCpf)}
                      className="cursor-pointer hover:bg-white"
                    >
                      <td className="px-3 py-2 font-medium text-aletis-grafite-escuro truncate max-w-[280px]">
                        {r.nome ?? '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-aletis-grafite-medio">
                        {r.cnpjCpf}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-aletis-verde/10 text-aletis-verde-escuro">
                          {r.uf ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-aletis-grafite-escuro">
                        {r.totalDivida
                          ? `${(Number(r.totalDivida) / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-aletis-grafite-medio">
                        {r.inscricoesCount ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-aletis-grafite-medio">
                        {r.agroScore ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.ajuizado ? (
                          <span className="text-red-600">⚖</span>
                        ) : (
                          <span className="text-aletis-grafite-claro">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// HotLeadsPanel — roteamento de leads quentes sem contato recente
// ────────────────────────────────────────────────────────────
function HotLeadsPanel({
  alerts,
  loading,
  onOpen,
  onRefresh,
}: {
  alerts: HotLeadAlert[]
  loading: boolean
  onOpen: (cpfCnpj: string) => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? alerts : alerts.slice(0, 5)

  if (!loading && alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-aletis-borda dark:border-white/5 bg-white dark:bg-aletis-grafite-escuro px-6 py-4 shadow-sm flex items-center gap-3 text-sm text-aletis-grafite-medio dark:text-white/60">
        <Siren size={18} className="text-aletis-verde flex-shrink-0" />
        <span>Nenhum hot-lead aguardando contato — todos os leads quentes foram trabalhados recentemente.</span>
        <button
          onClick={onRefresh}
          className="ml-auto inline-flex items-center gap-1 text-xs text-aletis-verde hover:underline"
        >
          <RotateCw size={12} /> atualizar
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-gradient-to-br from-red-50/80 to-amber-50/40 dark:from-red-950/20 dark:to-amber-950/10 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-red-100 dark:border-red-900/40 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center">
            <Siren size={18} className="text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="font-display text-base font-bold text-aletis-grafite-escuro dark:text-white">
              Hot-leads pendentes de ação
            </h2>
            <p className="text-xs text-aletis-grafite-medio dark:text-white/60">
              Leads quentes sem contato nos últimos 14 dias — ordenados por urgência
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-aletis-grafite-medio dark:text-white/60 hover:bg-white/50 dark:hover:bg-white/5 transition disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
          atualizar
        </button>
      </div>

      {loading && alerts.length === 0 ? (
        <div className="p-8 flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-aletis-verde" />
        </div>
      ) : (
        <ul className="divide-y divide-red-100/60 dark:divide-red-900/30">
          {visible.map((a) => {
            const u = URGENCIA_STYLE[a.urgencia]
            return (
              <li
                key={a.cpfCnpjClean}
                className="px-6 py-3 flex items-center gap-3 hover:bg-white/50 dark:hover:bg-white/5 transition cursor-pointer"
                onClick={() => onOpen(a.cpfCnpj)}
              >
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${u.bg} ${u.text} ${u.border} flex-shrink-0`}>
                  {u.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-aletis-grafite-escuro dark:text-white truncate">
                    {a.nome}
                    <span className="mx-2 text-aletis-grafite-medio/50" aria-hidden="true">·</span>
                    <span className="text-[10px] font-normal text-aletis-grafite-medio dark:text-white/50 font-mono">
                      {a.cpfCnpj}
                    </span>
                  </p>
                  <p className="text-[11px] text-aletis-grafite-medio dark:text-white/60 truncate">
                    {a.motivo} · {a.uf} · dívida {fmtBRLShort(a.totalDivida)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-aletis-grafite-escuro dark:text-white">
                    {a.scoreTotal}
                  </p>
                  <p className="text-[10px] text-aletis-grafite-medio dark:text-white/50">
                    {Number.isFinite(a.diasSemContato) && a.diasSemContato < 9999
                      ? `${a.diasSemContato}d sem contato`
                      : 'nunca contatado'}
                  </p>
                </div>
                <ChevronRight size={16} className="text-aletis-grafite-medio dark:text-white/40 flex-shrink-0" />
              </li>
            )
          })}
        </ul>
      )}

      {alerts.length > 5 && (
        <div className="px-6 py-2 border-t border-red-100 dark:border-red-900/40 text-center">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-aletis-verde hover:underline font-semibold"
          >
            {expanded ? 'ver menos' : `ver todos (${alerts.length})`}
          </button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// RegistrarContatoModal — registra outcome e alimenta o feedback loop
// ────────────────────────────────────────────────────────────
function RegistrarContatoModal({
  lead,
  saving,
  onCancel,
  onSubmit,
}: {
  lead: LeadFull
  saving: boolean
  onCancel: () => void
  onSubmit: (p: { tipo: ContactOutcomeTipo; canal?: ContactCanal; notas?: string; registradoPor?: string }) => void
}) {
  const [tipo, setTipo] = useState<ContactOutcomeTipo>('retornar')
  const [canal, setCanal] = useState<ContactCanal>('whatsapp')
  const [notas, setNotas] = useState('')
  const [registradoPor, setRegistradoPor] = useState('')

  // Avisa que esses tipos disparam exclusão automática — o backend já faz,
  // mas UI tem que ser honesta sobre a consequência.
  const excluiLead: Record<ContactOutcomeTipo, boolean> = {
    sucesso: false,
    interessado: false,
    retornar: false,
    recusou: true,
    ja_regularizou: true,
    nao_agro: true,
    fora_target: true,
  }

  const submit = () => {
    onSubmit({
      tipo,
      canal,
      notas: notas.trim() || undefined,
      registradoPor: registradoPor.trim() || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onCancel()} />
      <div className="relative w-full max-w-lg bg-white dark:bg-aletis-grafite-escuro rounded-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-aletis-borda dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-aletis-grafite-escuro dark:text-white flex items-center gap-2">
              <MessageSquare size={16} className="text-aletis-verde" /> Registrar contato
            </h3>
            <p className="text-xs text-aletis-grafite-medio dark:text-white/50 truncate max-w-[28rem]">
              {lead.nome} · {lead.cpfCnpj}
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={saving}
            className="p-2 rounded-lg hover:bg-aletis-bege dark:hover:bg-white/5 text-aletis-grafite-medio dark:text-white/60 transition disabled:opacity-40"
            aria-label="Cancelar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-aletis-grafite-escuro dark:text-white/80 mb-2">
              Resultado do contato
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(OUTCOME_LABEL) as ContactOutcomeTipo[]).map((t) => {
                const cfg = OUTCOME_LABEL[t]
                const selected = tipo === t
                const toneCls =
                  cfg.tone === 'green'
                    ? selected
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 ring-2 ring-emerald-200 dark:ring-emerald-900'
                      : 'border-aletis-borda dark:border-white/10 hover:border-emerald-400'
                    : cfg.tone === 'amber'
                    ? selected
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-200 dark:ring-amber-900'
                      : 'border-aletis-borda dark:border-white/10 hover:border-amber-400'
                    : cfg.tone === 'red'
                    ? selected
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/40 ring-2 ring-red-200 dark:ring-red-900'
                      : 'border-aletis-borda dark:border-white/10 hover:border-red-400'
                    : selected
                    ? 'border-slate-500 bg-slate-100 dark:bg-slate-800 ring-2 ring-slate-200 dark:ring-slate-700'
                    : 'border-aletis-borda dark:border-white/10 hover:border-slate-400'
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    disabled={saving}
                    className={`text-left rounded-lg border px-3 py-2 text-xs transition ${toneCls}`}
                  >
                    <span className="block font-semibold text-aletis-grafite-escuro dark:text-white">
                      {cfg.label}
                    </span>
                    {excluiLead[t] && (
                      <span className="block mt-0.5 text-[10px] text-red-600 dark:text-red-400">
                        move lead para blacklist
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-aletis-grafite-escuro dark:text-white/80 mb-1">
                Canal
              </label>
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value as ContactCanal)}
                disabled={saving}
                className="w-full px-3 py-2 rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro text-sm text-aletis-grafite-escuro dark:text-white"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="telefone">Telefone</option>
                <option value="email">Email</option>
                <option value="presencial">Presencial</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-aletis-grafite-escuro dark:text-white/80 mb-1">
                Registrado por
              </label>
              <input
                type="text"
                value={registradoPor}
                onChange={(e) => setRegistradoPor(e.target.value)}
                disabled={saving}
                placeholder="seu nome"
                className="w-full px-3 py-2 rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro text-sm text-aletis-grafite-escuro dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-aletis-grafite-escuro dark:text-white/80 mb-1">
              Notas
            </label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={saving}
              rows={3}
              placeholder="Detalhes úteis para o próximo contato…"
              className="w-full px-3 py-2 rounded-lg border border-aletis-borda dark:border-white/10 bg-white dark:bg-aletis-grafite-escuro text-sm text-aletis-grafite-escuro dark:text-white"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-aletis-borda dark:border-white/10 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-aletis-grafite-medio dark:text-white/60 hover:bg-aletis-bege dark:hover:bg-white/5 transition"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-aletis-verde text-white hover:brightness-110 transition disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Registrar
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   FilaEnriquecimentoPanel — status da fila persistente (Onda 3)
   Mostra contadores, jobs em voo e últimas falhas com retry manual.
═══════════════════════════════════════════════════════════════════════ */

function FilaEnriquecimentoPanel({
  stats,
  onRetry,
}: {
  stats: FilaStats
  onRetry: (id: string) => void | Promise<void>
}) {
  const totalAtivo = stats.pending + stats.running
  return (
    <div className="bg-white dark:bg-aletis-grafite-escuro rounded-2xl border border-aletis-borda dark:border-white/5 p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-aletis-dourado/10 flex items-center justify-center">
            <RefreshCw className={'w-4 h-4 text-aletis-dourado' + (stats.running > 0 ? ' animate-spin' : '')} />
          </div>
          <div>
            <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro dark:text-white">
              Fila de enriquecimento
            </h3>
            <p className="text-[11px] font-body text-aletis-grafite-claro dark:text-white/50">
              {totalAtivo > 0
                ? `${totalAtivo} em processamento · ${stats.failed} falhas`
                : `${stats.failed} falhas pendentes — clique retry para reprocessar`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-body">
          <BadgeFila label="Pendentes" valor={stats.pending} tone="amber" />
          <BadgeFila label="Em voo" valor={stats.running} tone="sky" />
          <BadgeFila label="Falhas" valor={stats.failed} tone="red" />
          <BadgeFila label="Concluídos" valor={stats.done} tone="green" />
        </div>
      </div>

      {stats.emVoo.length > 0 && (
        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50/60 dark:bg-sky-500/5 p-2.5">
          <p className="text-[10px] font-body font-semibold uppercase tracking-wider text-sky-800 dark:text-sky-300 mb-1.5">
            Processando agora ({stats.emVoo.length})
          </p>
          <ul className="space-y-1">
            {stats.emVoo.slice(0, 3).map((j) => (
              <li key={j.id} className="text-[11px] font-mono text-aletis-grafite-escuro dark:text-white/80">
                {j.cpfCnpj} · tentativa {j.attempts}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.ultimasFalhas.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 dark:bg-red-500/5 p-2.5">
          <p className="text-[10px] font-body font-semibold uppercase tracking-wider text-red-800 dark:text-red-300 mb-1.5">
            Últimas falhas ({stats.ultimasFalhas.length})
          </p>
          <ul className="space-y-1.5">
            {stats.ultimasFalhas.slice(0, 5).map((j) => (
              <li key={j.id} className="flex items-start gap-2 text-[11px]">
                <span className="font-mono text-aletis-grafite-escuro dark:text-white/80 flex-shrink-0">
                  {j.cpfCnpj}
                </span>
                <span className="flex-1 text-aletis-grafite-medio dark:text-white/60 truncate italic">
                  {j.lastError || 'erro desconhecido'}
                </span>
                <button
                  onClick={() => onRetry(j.id)}
                  className="text-[10px] font-body font-semibold text-aletis-verde hover:underline flex-shrink-0"
                >
                  Retry
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function BadgeFila({ label, valor, tone }: { label: string; valor: number; tone: 'amber' | 'sky' | 'red' | 'green' }) {
  const classes =
    tone === 'amber' ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
    : tone === 'sky' ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300'
    : tone === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-500/10 dark:text-red-300'
    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-semibold text-[11px] ${classes}`}>
      {valor}
      <span className="text-[9px] font-body uppercase tracking-wider opacity-80">{label}</span>
    </span>
  )
}
