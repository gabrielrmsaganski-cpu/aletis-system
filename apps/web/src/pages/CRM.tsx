import CrmClientList, { type CrmDirectoryRow } from '../components/crm/CrmClientList'
import BoardScroller from '../components/ui/BoardScroller'
import PageHeader from '../components/ui/PageHeader'
/**
 * CRM ALETIS - estação operacional do consultor.
 *
 * Reúne carteira, prioridades ALIX, filtros e execução rápida sem retirar
 * do consultor o contexto do cliente.
 */
import React, { useEffect, useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApi, apiFetch } from '../hooks/useApi'
import { MotionDialog } from '../components/ui'
import { uiAction } from '../components/ui/foundation'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { ClientDocumentIntake } from '../components/crm/ClientDocumentIntake'
import { DEFAULT_CRM_VIEW, foldCrmSearch, patchCrmView, readCrmView, type CrmViewState } from '../components/crm/crmViewState'
import {
  consolidateDocumentPreviews,
  documentFingerprint,
  documentUploadCategory,
  type ClientDocumentType,
  type IntakeConflict,
  type IntakeDocumentoPreview,
  type IntakeDocumentPreview,
  type IntakeProgress,
  type NovoClienteAnexo,
} from '../components/crm/clientOnboarding'
import { exportCSV } from '../utils/exportReports'
import { spring, staggerContainer, staggerItem, slideUp, fadeIn } from '../motion/tokens'
import {
  Users, Search, Filter, LayoutGrid, List, Plus, MapPin,
  Building2, ChevronDown, ArrowRight, Download,
  Loader2, CalendarPlus, CalendarClock, AlertTriangle, Clock3,
  CheckCircle2, Bot, PhoneCall, ArrowRightLeft, Sparkles,
  UserPlus, User, Phone, Mail, Calendar, Tag, Wallet, Hash, Home,
  Tractor, Banknote, ClipboardList, MapPinned, Briefcase,
  Sprout, Landmark, FileText, RotateCcw, Trash2, UploadCloud,
  ChevronLeft, ChevronRight, Handshake, X,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════
type Estagio =
  | 'lead' | 'prospeccao' | 'qualificacao' | 'analise'
  | 'proposta' | 'negociacao' | 'acordo' | 'acompanhamento'
  | 'concluido' | 'encerrado'

interface ProximaAcao { data: string; descricao: string; criadoEm: string }

type ResumoFinanceiro = {
  classificacao: 'divida_documentada' | 'demanda_capital' | 'estrategia_financeira' | 'status_contratual' | 'em_levantamento'
  rotulo: string
  contexto: string
  descricao?: string
  valorFaixa?: string
}

interface Cliente {
  id: string; nome: string; cidade: string; uf: string
  credor: string; valorDivida: number; estagio: Estagio
  saudeFinanceira: number | null; consultor: string
  escritorio?: string
  resumoFinanceiro: ResumoFinanceiro
  tags?: string[]; proximaAcao?: ProximaAcao
  estagioDesde?: string; ultimaAtualizacao?: string
  scoreOperacional: number
  prioridade: 'critica' | 'alta' | 'media' | 'normal'
  motivosPrioridade: string[]
  proximaMelhorAcao?: {
    tipo: 'definir_proxima_acao' | 'registrar_contato' | 'avancar_estagio' | 'revisar_dossie'
    descricao: string; dataSugerida?: string
  }
}

interface ProactiveInsight {
  id: string; tipo: string
  urgencia: 'info' | 'importante' | 'critico'
  titulo: string; detalhes: string
  payload?: {
    clienteId?: string; suggestedTool?: string
    suggestedPayload?: Record<string, unknown>
    diasSemAtualizacao?: number; diasAtraso?: number
  }
}

interface ClienteApi {
  id: string; nome: string; cidade: string; uf: string
  cpfCnpj?: string
  estagio: string; consultor: string; credor: string
  escritorio?: string
  valorTotalDivida: number; valorTotalPago?: number
  culturas?: string[]; areaTotalHa?: number
  ultimaAtualizacao?: string; saudeFinanceira?: number
  tags?: string[]; proximaAcao?: ProximaAcao
  estagioDesde?: string; scoreOperacional?: number
  prioridade?: 'critica' | 'alta' | 'media' | 'normal'
  motivosPrioridade?: string[]
  resumoFinanceiro?: ResumoFinanceiro
  proximaMelhorAcao?: Cliente['proximaMelhorAcao']
}

interface IntakePreview {
  campos: Partial<typeof EMPTY_NOVO_CLIENTE> & {
    culturas?: string[] | string
    tags?: string[] | string
    areaTotalHa?: string | number
    valorTotalDivida?: string | number
    valorTotalPago?: string | number
  }
  resumo?: string
  camposAusentes?: string[]
  confianca?: number
  origem?: 'ia' | 'heuristica'
}

type NovoClienteForm = typeof EMPTY_NOVO_CLIENTE
type NovoClienteTab = 'documentos' | 'identificacao' | 'localizacao' | 'operacao' | 'financeiro' | 'classificacao' | 'revisao'
type IntakeSourceMode = 'arquivos' | 'texto'

function createIntakeSessionId(): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `crm-intake-${id}`
}

interface GrupoFamiliarForm {
  id: string
  nome: string
  parentesco: string
  papel: string
  cpfCnpj: string
  telefone: string
  email: string
  atuaAtividade: boolean
  observacoes: string
}

interface DemandaInicialForm {
  id: string
  titulo: string
  assunto: string
  descricao: string
  categoria: 'credito' | 'renegociacao' | 'juridico' | 'tributario' | 'investimento' | 'operacional' | 'outro'
  credor: string
  valorPretendido: string
  prazoAlvo: string
  proximaAcao: string
  proximaAcaoEm: string
  probabilidade: string
  resultadoEsperado: string
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
}

const EMPTY_NOVO_CLIENTE = {
  // ── Identificação ──
  nome: '', cpfCnpj: '', tipo: 'pessoa_fisica' as 'pessoa_fisica' | 'pessoa_juridica',
  email: '', telefone: '', whatsapp: '',
  // ── Localização ──
  cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  // ── Operação Rural ──
  atividade: '', areaTotalHa: '', culturas: '', carCodigoImovel: '',
  // ── Financeiro ──
  credor: '', modalidadeCredito: '', valorTotalDivida: '', valorTotalPago: '', observacoes: '',
  // ── Classificação ──
  estagio: 'lead' as Estagio, consultor: 'Christian Kohler', escritorio: '', tags: '',
  // ── Grupo familiar / pessoas vinculadas ──
  grupoFamiliar: [] as GrupoFamiliarForm[],
}

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  lead: { label: 'Lead', color: '#6B7280' },
  prospeccao: { label: 'Prospecção', color: '#9CA3AF' },
  qualificacao: { label: 'Qualificação', color: '#3B82F6' },
  analise: { label: 'Análise', color: '#8B5CF6' },
  proposta: { label: 'Proposta', color: '#cb9d52' },
  negociacao: { label: 'Negociação', color: '#E67E22' },
  acordo: { label: 'Acordo', color: '#27AE60' },
  acompanhamento: { label: 'Acompanhamento', color: '#17251b' },
  concluido: { label: 'Concluído', color: '#465b4a' },
  encerrado: { label: 'Encerrado', color: '#374151' },
}
const DEFAULT_STAGE = { label: 'Outro', color: '#6B7280' }

const ALL_STAGES: Estagio[] = [
  'lead','prospeccao','qualificacao','analise','proposta',
  'negociacao','acordo','acompanhamento','concluido','encerrado',
]

const OFFICE_OPTIONS = [
  { value: 'Aletis', label: 'Aletis - Matriz' },
  { value: 'Canarana', label: 'Canarana' },
] as const
const OFFICE_UNASSIGNED = '__sem_escritorio__'

function officeLabel(value?: string): string {
  if (!value) return 'Sem escritório'
  return OFFICE_OPTIONS.find((office) => office.value.toLowerCase() === value.toLowerCase())?.label ?? value
}

const NOVO_CLIENTE_STEPS: Array<{
  id: NovoClienteTab
  label: string
  shortLabel: string
  description: string
  icon: typeof FileText
}> = [
  { id: 'documentos', label: 'Documentos', shortLabel: 'Docs', description: 'Dossiê e leitura por IA', icon: UploadCloud },
  { id: 'identificacao', label: 'Identificação', shortLabel: 'Cliente', description: 'Dados e pessoas vinculadas', icon: User },
  { id: 'localizacao', label: 'Localização', shortLabel: 'Local', description: 'Endereço e região', icon: MapPinned },
  { id: 'operacao', label: 'Operação e demandas', shortLabel: 'Operação', description: 'Atividade e frentes de trabalho', icon: Tractor },
  { id: 'financeiro', label: 'Financeiro', shortLabel: 'Finanças', description: 'Dívida e credores', icon: Banknote },
  { id: 'classificacao', label: 'Responsável', shortLabel: 'Gestão', description: 'Pipeline e segmentação', icon: ClipboardList },
  { id: 'revisao', label: 'Revisão final', shortLabel: 'Revisão', description: 'Conferência antes de criar', icon: CheckCircle2 },
]

const STAGE_NEXT: Partial<Record<Estagio, Estagio>> = {
  lead: 'qualificacao', prospeccao: 'qualificacao', qualificacao: 'analise',
  analise: 'proposta', proposta: 'negociacao', negociacao: 'acordo',
  acordo: 'acompanhamento', acompanhamento: 'concluido',
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const formatBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const formatBRLCompact = (v: number): string => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)}K`
  return formatBRL(v)
}

function hasDefinedCredor(credor?: string): boolean {
  const normalized = String(credor || '').trim().toLowerCase()
  return Boolean(normalized) && !['a definir', 'credor a definir', 'não informado', 'nao informado'].includes(normalized)
}

function fallbackResumoFinanceiro(cliente: ClienteApi): ResumoFinanceiro {
  if (Number(cliente.valorTotalDivida) > 0) {
    return {
      classificacao: 'divida_documentada',
      rotulo: 'Dívida documentada',
      contexto: hasDefinedCredor(cliente.credor) ? cliente.credor : 'Credor em conferência documental',
    }
  }
  return {
    classificacao: 'em_levantamento',
    rotulo: 'Posição financeira',
    contexto: hasDefinedCredor(cliente.credor) ? cliente.credor : 'Em levantamento documental',
  }
}

function parseCurrencyText(value: string): number | null {
  const raw = value.trim().replace(/R\$\s*/gi, '').replace(/\s/g, '')
  if (!raw) return null
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function formatFaixaCapital(value?: string): string | null {
  if (!value) return null
  const valores = value.split(/\s+(?:a|até)\s+/i).map(parseCurrencyText).filter((item): item is number => item != null)
  if (!valores.length) return null
  if (valores.length === 1) return formatBRLCompact(valores[0])
  return `${formatBRLCompact(valores[0])}–${formatBRLCompact(valores[1])}`
}

function financialValue(cliente: Cliente): string {
  const resumo = cliente.resumoFinanceiro
  if (resumo.classificacao === 'demanda_capital') {
    return formatFaixaCapital(resumo.valorFaixa) || 'Capital em estruturação'
  }
  if (resumo.classificacao === 'divida_documentada') return formatBRLCompact(cliente.valorDivida)
  if (resumo.classificacao === 'status_contratual') return resumo.contexto
  if (resumo.classificacao === 'estrategia_financeira') return 'Em estruturação'
  return 'Em levantamento'
}

function diasDesde(iso?: string): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

function diasAte(iso?: string): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return Math.floor((d.getTime() - Date.now()) / 86_400_000)
}

function getInitials(nome: string): string {
  const parts = nome.split(' ')
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function mapApiCliente(c: ClienteApi): Cliente {
  return {
    id: c.id, nome: c.nome, cidade: c.cidade ?? '', uf: c.uf ?? '',
    credor: c.credor ?? 'A definir', valorDivida: c.valorTotalDivida ?? 0,
    estagio: (c.estagio as Estagio) || 'lead',
    saudeFinanceira: c.saudeFinanceira ?? null, consultor: c.consultor,
    escritorio: c.escritorio?.trim() || undefined,
    resumoFinanceiro: c.resumoFinanceiro ?? fallbackResumoFinanceiro(c),
    tags: c.tags, proximaAcao: c.proximaAcao, estagioDesde: c.estagioDesde,
    ultimaAtualizacao: c.ultimaAtualizacao,
    scoreOperacional: c.scoreOperacional ?? 0,
    prioridade: c.prioridade ?? 'normal',
    motivosPrioridade: c.motivosPrioridade ?? [],
    proximaMelhorAcao: c.proximaMelhorAcao,
  }
}

function isClienteAtivo(c: Cliente): boolean {
  return c.estagio !== 'concluido' && c.estagio !== 'encerrado'
}

type SortKey = 'nome' | 'cidade' | 'credor' | 'valorDivida' | 'estagio' | 'saudeFinanceira' | 'consultor' | 'scoreOperacional'
type SortDir = 'asc' | 'desc'
type OperationalFilter = 'todos' | 'prioridade' | 'atrasados' | 'hoje' | 'semAcao' | 'parados'
type QuickActionMode = 'proximaAcao' | 'contato'

function matchesOperationalFilter(c: Cliente, filter: OperationalFilter): boolean {
  if (filter === 'todos') return true
  if (!isClienteAtivo(c)) return false
  const prox = diasAte(c.proximaAcao?.data)
  const parado = diasDesde(c.estagioDesde || c.ultimaAtualizacao)
  if (filter === 'prioridade') return c.prioridade === 'critica' || c.prioridade === 'alta'
  if (filter === 'atrasados') return prox !== null && prox < 0
  if (filter === 'hoje') return prox === 0
  if (filter === 'semAcao') return !c.proximaAcao
  if (filter === 'parados') return parado !== null && parado >= 30
  return true
}

function digitsOnly(value: string | undefined | null): string {
  return String(value ?? '').replace(/\D/g, '')
}

function buildNovoClienteReadiness({
  form,
  anexos,
  intakePreview,
  intakeDocPreview,
  duplicado,
}: {
  form: NovoClienteForm
  anexos: NovoClienteAnexo[]
  intakePreview: IntakePreview | null
  intakeDocPreview: IntakeDocumentPreview | null
  duplicado: ClienteApi | null
}) {
  const propostaDetectada = anexos.some((a) => a.tipo === 'proposta' || a.preview?.tipoArquivo === 'proposta') || Boolean(intakeDocPreview?.propostaDetectada)
  const contratoDetectado = anexos.some((a) => a.tipo === 'contrato' || a.preview?.tipoArquivo === 'contrato')
  const documentos = anexos.filter((a) => {
    const tipo = a.tipo === 'auto' ? a.preview?.tipoArquivo : a.tipo
    return tipo !== 'proposta' && tipo !== 'contrato'
  }).length
  const confianca = Math.max(intakePreview?.confianca ?? 0, intakeDocPreview?.confianca ?? 0)
  const required = [
    { id: 'nome', label: 'Nome/razão social', ok: Boolean(form.nome.trim()), tab: 'identificacao' as const, detail: form.nome || 'pendente' },
    { id: 'cidade', label: 'Cidade', ok: Boolean(form.cidade.trim()), tab: 'localizacao' as const, detail: form.cidade || 'pendente' },
    { id: 'uf', label: 'UF', ok: form.uf.trim().length === 2, tab: 'localizacao' as const, detail: form.uf || 'pendente' },
    { id: 'escritorio', label: 'Escritório responsável', ok: Boolean(form.escritorio.trim()), tab: 'classificacao' as const, detail: form.escritorio || 'pendente' },
  ]
  const operational = [
    { id: 'contato', label: 'Contato útil', ok: Boolean(form.telefone.trim() || form.whatsapp.trim() || form.email.trim()), tab: 'identificacao' as const, detail: form.whatsapp || form.telefone || form.email || 'sem contato' },
    { id: 'grupo', label: 'Grupo familiar', ok: form.grupoFamiliar.length > 0, tab: 'identificacao' as const, detail: form.grupoFamiliar.length ? `${form.grupoFamiliar.length} vínculo(s)` : 'opcional' },
    { id: 'financeiro', label: 'Contexto financeiro', ok: Boolean(form.credor.trim() || form.valorTotalDivida.trim() || form.observacoes.trim()), tab: 'financeiro' as const, detail: form.credor || form.valorTotalDivida || 'pendente' },
    { id: 'agro', label: 'Base agro', ok: Boolean(form.atividade.trim() || form.culturas.trim() || form.areaTotalHa.trim() || form.carCodigoImovel.trim()), tab: 'operacao' as const, detail: form.atividade || form.culturas || 'pendente' },
  ]
  return {
    required,
    operational,
    readyToSave: required.every((item) => item.ok),
    duplicado,
    propostaDetectada,
    contratoDetectado,
    documentos,
    anexos: anexos.length,
    confianca,
    missingRequired: required.filter((item) => !item.ok).length,
    missingOperational: operational.filter((item) => !item.ok).length,
  }
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTES COM MOTION
// ═══════════════════════════════════════════════════════════════

function HealthBar({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <div className="flex items-center gap-2" title="Saúde financeira ainda não calculada">
        <div className="h-2 w-16 overflow-hidden rounded-full bg-stone-200 dark:bg-white/10" />
        <span className="w-7 text-right text-xs text-stone-400 dark:text-stone-500">—</span>
      </div>
    )
  }
  const color = value >= 70 ? '#27AE60' : value >= 40 ? '#E67E22' : '#C0392B'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-aletis-borda/50 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${value}%`, backgroundColor: color }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-xs font-body text-muted-foreground w-7 text-right">{value}</span>
    </div>
  )
}

function HealthDot({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full border border-stone-300 bg-stone-100 dark:border-white/20 dark:bg-white/10" title="Saúde financeira ainda não calculada" />
  }
  const color = value >= 70 ? '#27AE60' : value >= 40 ? '#E67E22' : '#C0392B'
  return (
    <motion.span
      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
      title={`Saúde: ${value}`}
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
    />
  )
}

function StageBadge({ estagio }: { estagio: Estagio }) {
  const cfg = STAGE_CONFIG[estagio] || DEFAULT_STAGE
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-body"
      style={{ backgroundColor: cfg.color + '18', color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

function PriorityBadge({ prioridade, score }: { prioridade: Cliente['prioridade']; score: number }) {
  const cls =
    prioridade === 'critica' ? 'bg-red-100 text-red-800 border-red-200' :
    prioridade === 'alta' ? 'bg-amber-100 text-amber-800 border-amber-200' :
    prioridade === 'media' ? 'bg-blue-100 text-blue-800 border-blue-200' :
    'bg-slate-100 text-slate-700 border-slate-200'
  const label = prioridade === 'critica' ? 'Crítica' : prioridade === 'alta' ? 'Alta' : prioridade === 'media' ? 'Média' : 'Normal'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold font-body ${cls}`}>
      {label}
      <span className="font-mono text-[11px] opacity-80">{score}</span>
    </span>
  )
}

function CrmMetricCell({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  icon: typeof Users
  label: string
  value: string
  detail: string
  tone?: 'neutral' | 'good' | 'warn' | 'risk'
}) {
  const toneClass = {
    neutral: 'text-foreground dark:text-white',
    good: 'text-emerald-700 dark:text-emerald-400',
    warn: 'text-amber-700 dark:text-amber-400',
    risk: 'text-red-700 dark:text-red-400',
  }[tone]
  return (
    <div className="min-h-[112px] min-w-0 border-b border-r border-stone-200 p-4 dark:border-white/10 xl:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-bold text-stone-500 dark:text-stone-400">{label}</p>
        <Icon className={`h-4 w-4 flex-shrink-0 ${toneClass}`} />
      </div>
      <p className={`mt-2 truncate text-xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{detail}</p>
    </div>
  )
}

function NovoClienteReadinessPanel({
  readiness,
  onNavigate,
}: {
  readiness: ReturnType<typeof buildNovoClienteReadiness>
  onNavigate: (tab: 'identificacao' | 'localizacao' | 'operacao' | 'financeiro' | 'classificacao') => void
}) {
  const statusLabel = readiness.duplicado
    ? 'Possível duplicidade'
    : readiness.readyToSave
      ? 'Pronto para criar'
      : `${readiness.missingRequired} obrigatório(s) pendente(s)`
  const statusClass = readiness.duplicado
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : readiness.readyToSave
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : 'border-amber-200 bg-amber-50 text-amber-800'

  return (
    <section className="mb-5 rounded-xl border border-aletis-borda bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="xl:w-64 min-w-0">
          <p className="text-[11px] font-mono uppercase text-foreground font-semibold">
            revisão antes de salvar
          </p>
          <h3 className="mt-1 text-sm font-display font-semibold text-foreground">
            Qualidade do cadastro
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Confere se o cliente pode ser criado e se documentos/propostas serão vinculados corretamente.
          </p>
          <div className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClass}`}>
            {readiness.readyToSave && !readiness.duplicado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {statusLabel}
          </div>
          {readiness.duplicado && (
            <p className="mt-2 text-[11px] leading-snug text-amber-800">
              CPF/CNPJ já aparece em {readiness.duplicado.nome}. O cadastro continua permitido; revise se é vínculo familiar, homônimo ou cadastro separado.
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {[...readiness.required, ...readiness.operational].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.tab)}
                className={`min-w-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                  item.ok
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-50'
                    : 'border-amber-200 bg-amber-50/75 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase">
                  {item.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {item.label}
                </span>
                <span className="mt-1 block truncate text-[11px] opacity-80">{item.detail}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <CadastroMiniStatus icon={FileText} label="Anexos" value={`${readiness.anexos}`} hint={readiness.anexos ? 'serão salvos no cliente' : 'opcional'} />
            <CadastroMiniStatus icon={Sparkles} label="Confiança IA" value={readiness.confianca ? `${Math.round(readiness.confianca * 100)}%` : '—'} hint="revise antes de criar" />
            <CadastroMiniStatus icon={Banknote} label="Proposta" value={readiness.propostaDetectada ? 'detectada' : 'não detectada'} hint={readiness.propostaDetectada ? 'irá para Negociações' : 'pode enviar depois'} />
            <CadastroMiniStatus icon={ClipboardList} label="Documentos úteis" value={`${readiness.documentos + (readiness.contratoDetectado ? 1 : 0)}`} hint={readiness.contratoDetectado ? 'inclui contrato' : 'documentos gerais'} />
          </div>

          {readiness.duplicado && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              Já existe cliente com este CPF/CNPJ: <strong>{readiness.duplicado.nome}</strong>. Revise antes de criar outro cadastro.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function CadastroMiniStatus({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof FileText
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-aletis-borda bg-aletis-bege/25 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-display font-semibold text-foreground">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 border-b border-aletis-borda/60 pb-2 last:border-0 last:pb-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-foreground" title={value}>{value}</dd>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
export default function CRM() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: clientesApi, loading, error, refetch } = useApi<ClienteApi[]>('/clientes', [])
  const clientes: Cliente[] = useMemo(
    () => (clientesApi && clientesApi.length > 0 ? clientesApi.map(mapApiCliente) : []),
    [clientesApi],
  )
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()

  const { viewMode, searchQuery, stageFilter, operationalFilter, officeFilter, sortKey, sortDir } = readCrmView(searchParams)
  const updateView = (patch: Partial<CrmViewState>) => setSearchParams((current) => patchCrmView(current, patch), { replace: true })
  const setViewMode = (viewMode: CrmViewState['viewMode']) => updateView({ viewMode })
  const setSearchQuery = (searchQuery: string) => updateView({ searchQuery })
  const setStageFilter = (stageFilter: CrmViewState['stageFilter']) => updateView({ stageFilter })
  const setOperationalFilter = (operationalFilter: OperationalFilter) => updateView({ operationalFilter })

  const [acaoCliente, setAcaoCliente] = useState<Cliente | null>(null)
  const [quickActionMode, setQuickActionMode] = useState<QuickActionMode>('proximaAcao')
  const [savingAcao, setSavingAcao] = useState(false)
  const [acaoForm, setAcaoForm] = useState({
    data: '', descricao: '', canal: 'telefone', resultado: '', proximaData: '', proximaDescricao: ''
  })

  const [stageMove, setStageMove] = useState<{ cliente: Cliente; estagio: Estagio } | null>(null)
  const [savingStage, setSavingStage] = useState(false)
  const [stageMotivo, setStageMotivo] = useState('')

  const [alixInsights, setAlixInsights] = useState<ProactiveInsight[]>([])
  const [loadingAlixInsights, setLoadingAlixInsights] = useState(false)

  const [showNovoCliente, setShowNovoCliente] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [novoClienteTab, setNovoClienteTab] = useState<NovoClienteTab>('documentos')
  const [novoClienteVisitedSteps, setNovoClienteVisitedSteps] = useState<Set<NovoClienteTab>>(new Set(['documentos']))
  const [intakeSourceMode, setIntakeSourceMode] = useState<IntakeSourceMode>('arquivos')
  const [intakeText, setIntakeText] = useState('')
  const [intakeLoading, setIntakeLoading] = useState(false)
  const [intakePreview, setIntakePreview] = useState<IntakePreview | null>(null)
  const [intakeDocsLoading, setIntakeDocsLoading] = useState(false)
  const [intakeSessionId, setIntakeSessionId] = useState(createIntakeSessionId)
  const [intakeDocPreview, setIntakeDocPreview] = useState<IntakeDocumentPreview | null>(null)
  const [novoClienteAnexos, setNovoClienteAnexos] = useState<NovoClienteAnexo[]>([])
  const [novoClienteDemandas, setNovoClienteDemandas] = useState<DemandaInicialForm[]>([])
  const [intakeProgress, setIntakeProgress] = useState<IntakeProgress | null>(null)
  const [conflitosResolvidos, setConflitosResolvidos] = useState<Set<string>>(new Set())
  const intakeSessionRef = useRef(intakeSessionId)
  const intakeRefreshTimers = useRef<number[]>([])
  const novoClienteContentRef = React.useRef<HTMLDivElement | null>(null)

  const [novoCliente, setNovoCliente] = useState({
    ...EMPTY_NOVO_CLIENTE,
    grupoFamiliar: [] as GrupoFamiliarForm[],
    escritorio: '',
  })

  useEffect(() => {
    intakeSessionRef.current = intakeSessionId
    return () => {
      intakeRefreshTimers.current.forEach((timer) => window.clearTimeout(timer))
      intakeRefreshTimers.current = []
    }
  }, [intakeSessionId])

  const officeOptions = useMemo(() => {
    const known = new Map<string, string>(OFFICE_OPTIONS.map((office) => [office.value.toLowerCase(), office.value]))
    for (const cliente of clientes) {
      const value = cliente.escritorio?.trim()
      if (value && !known.has(value.toLowerCase())) known.set(value.toLowerCase(), value)
    }
    return Array.from(known.values()).sort((a, b) => {
      const aIndex = OFFICE_OPTIONS.findIndex((office) => office.value.toLowerCase() === a.toLowerCase())
      const bIndex = OFFICE_OPTIONS.findIndex((office) => office.value.toLowerCase() === b.toLowerCase())
      if (aIndex >= 0 || bIndex >= 0) return (aIndex >= 0 ? aIndex : 999) - (bIndex >= 0 ? bIndex : 999)
      return a.localeCompare(b, 'pt-BR')
    })
  }, [clientes])

  function changeOfficeFilter(value: string) {
    updateView({ officeFilter: value })
  }

  useEffect(() => {
    if (searchParams.get('novo') !== '1') return
    setShowNovoCliente(true)
    setNovoClienteTab('documentos')
    setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('novo'); return next }, { replace: true })
  }, [searchParams])



  const duplicadoNovoCliente = useMemo(() => {
    const clean = digitsOnly(novoCliente.cpfCnpj)
    if (clean.length !== 11 && clean.length !== 14) return null
    return (clientesApi ?? []).find((cliente) => digitsOnly(cliente.cpfCnpj) === clean) ?? null
  }, [clientesApi, novoCliente.cpfCnpj])

  const novoClienteReadiness = useMemo(() => buildNovoClienteReadiness({
    form: novoCliente,
    anexos: novoClienteAnexos,
    intakePreview,
    intakeDocPreview,
    duplicado: duplicadoNovoCliente,
  }), [novoCliente, novoClienteAnexos, intakePreview, intakeDocPreview, duplicadoNovoCliente])

  const novoClienteUnresolvedConflicts = useMemo(() => (
    (intakeDocPreview?.conflitos || []).filter((conflict) => !conflitosResolvidos.has(conflict.campo)).length
  ), [intakeDocPreview, conflitosResolvidos])
  const novoClienteReadyToCreate = novoClienteReadiness.readyToSave && novoClienteUnresolvedConflicts === 0

  const novoClienteStepStatus = useMemo<Record<NovoClienteTab, boolean>>(() => ({
    documentos: Boolean(intakePreview || novoClienteAnexos.some((anexo) => anexo.status === 'pronto' || anexo.status === 'enviado') || novoClienteVisitedSteps.has('identificacao')),
    identificacao: Boolean(novoCliente.nome.trim() && (novoCliente.cpfCnpj.trim() || novoCliente.telefone.trim() || novoCliente.whatsapp.trim() || novoCliente.email.trim())),
    localizacao: Boolean(novoCliente.cidade.trim() && novoCliente.uf.trim().length === 2),
    operacao: Boolean(novoCliente.atividade.trim() || novoCliente.culturas.trim() || novoCliente.areaTotalHa.trim() || novoCliente.carCodigoImovel.trim() || novoClienteDemandas.some((demanda) => demanda.titulo.trim()) || novoClienteVisitedSteps.has('financeiro')),
    financeiro: Boolean(novoCliente.credor.trim() || novoCliente.valorTotalDivida.trim() || novoCliente.observacoes.trim() || novoClienteDemandas.some((demanda) => demanda.titulo.trim()) || novoClienteVisitedSteps.has('classificacao')),
    classificacao: Boolean(novoCliente.escritorio.trim() && novoClienteVisitedSteps.has('classificacao')),
    revisao: novoClienteReadyToCreate,
  }), [novoCliente, novoClienteAnexos, novoClienteDemandas, intakePreview, novoClienteReadyToCreate, novoClienteVisitedSteps])

  const novoClienteStepIndex = NOVO_CLIENTE_STEPS.findIndex((step) => step.id === novoClienteTab)
  const novoClienteCompletedSteps = NOVO_CLIENTE_STEPS.filter((step) => novoClienteStepStatus[step.id]).length
  const novoClienteProgress = Math.round((novoClienteCompletedSteps / NOVO_CLIENTE_STEPS.length) * 100)

  function moveNovoClienteStep(direction: -1 | 1) {
    const next = NOVO_CLIENTE_STEPS[novoClienteStepIndex + direction]
    if (next) setNovoClienteTab(next.id)
  }

  useEffect(() => {
    setNovoClienteVisitedSteps((current) => current.has(novoClienteTab) ? current : new Set([...current, novoClienteTab]))
  }, [novoClienteTab])

  useEffect(() => {
    novoClienteContentRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [novoClienteTab, intakeSourceMode])

  const updateNovoCliente = (field: string, value: string) => {
    setNovoCliente(prev => ({ ...prev, [field]: value }))
  }

  function addGrupoFamiliarPessoa() {
    setNovoCliente((prev) => ({
      ...prev,
      grupoFamiliar: [
        ...prev.grupoFamiliar,
        {
          id: `gf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          nome: '',
          parentesco: '',
          papel: '',
          cpfCnpj: '',
          telefone: '',
          email: '',
          atuaAtividade: false,
          observacoes: '',
        },
      ],
    }))
  }

  function updateGrupoFamiliarPessoa(id: string, field: keyof GrupoFamiliarForm, value: string | boolean) {
    setNovoCliente((prev) => ({
      ...prev,
      grupoFamiliar: prev.grupoFamiliar.map((p) => p.id === id ? { ...p, [field]: value } : p),
    }))
  }

  function removeGrupoFamiliarPessoa(id: string) {
    setNovoCliente((prev) => ({
      ...prev,
      grupoFamiliar: prev.grupoFamiliar.filter((p) => p.id !== id),
    }))
  }

  function addDemandaInicial() {
    setNovoClienteDemandas((current) => [
      ...current,
      {
        id: `demanda-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        titulo: '',
        assunto: '',
        descricao: '',
        categoria: 'outro',
        credor: novoCliente.credor.trim(),
        valorPretendido: '',
        prazoAlvo: '',
        proximaAcao: '',
        proximaAcaoEm: '',
        probabilidade: '10',
        resultadoEsperado: '',
        prioridade: 'normal',
      },
    ])
  }

  function updateDemandaInicial(id: string, field: keyof DemandaInicialForm, value: string) {
    setNovoClienteDemandas((current) => current.map((demanda) => demanda.id === id ? { ...demanda, [field]: value } : demanda))
  }

  function removeDemandaInicial(id: string) {
    setNovoClienteDemandas((current) => current.filter((demanda) => demanda.id !== id))
  }

  // ── Formatters ──
  function maskCpfCnpj(v: string): string {
    const digits = v.replace(/\D/g, '')
    if (digits.length <= 11) {
      return digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    }
    return digits.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
  }
  function maskPhone(v: string): string {
    const digits = v.replace(/\D/g, '').slice(0, 11)
    if (digits.length > 10) return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  function maskCep(v: string): string {
    return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
  }
  function fmtCurrencyInput(v: string): string {
    const digits = v.replace(/\D/g, '')
    if (!digits) return ''
    const n = Number(digits) / 100
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  function moneyToInput(v: unknown): string {
    if (v == null || v === '') return ''
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    const raw = String(v)
    const cleaned = raw.replace(/[^\d,.-]/g, '')
    const normalized = cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '')
    const n = Number(normalized)
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  }

  function listToInput(value: unknown): string {
    if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).join(', ')
    return String(value ?? '').trim()
  }

  function applyIntakeCampos(c: IntakePreview['campos'] | IntakeDocumentPreview['campos']) {
    setNovoCliente((prev) => ({
      ...prev,
      nome: String(c.nome ?? prev.nome ?? ''),
      cpfCnpj: c.cpfCnpj ? maskCpfCnpj(String(c.cpfCnpj)) : prev.cpfCnpj,
      tipo: c.tipo === 'pessoa_juridica' ? 'pessoa_juridica' : c.tipo === 'pessoa_fisica' ? 'pessoa_fisica' : prev.tipo,
      email: String(c.email ?? prev.email ?? ''),
      telefone: c.telefone ? maskPhone(String(c.telefone)) : prev.telefone,
      whatsapp: c.whatsapp ? maskPhone(String(c.whatsapp)) : prev.whatsapp,
      cep: c.cep ? maskCep(String(c.cep)) : prev.cep,
      endereco: String(c.endereco ?? prev.endereco ?? ''),
      numero: String(c.numero ?? prev.numero ?? ''),
      complemento: String(c.complemento ?? prev.complemento ?? ''),
      bairro: String(c.bairro ?? prev.bairro ?? ''),
      cidade: String(c.cidade ?? prev.cidade ?? ''),
      uf: c.uf ? String(c.uf).toUpperCase().slice(0, 2) : prev.uf,
      atividade: String(c.atividade ?? prev.atividade ?? ''),
      areaTotalHa: c.areaTotalHa != null ? String(c.areaTotalHa).replace('.', ',') : prev.areaTotalHa,
      culturas: c.culturas != null ? listToInput(c.culturas) : prev.culturas,
      carCodigoImovel: String(c.carCodigoImovel ?? prev.carCodigoImovel ?? ''),
      credor: String(c.credor ?? prev.credor ?? ''),
      modalidadeCredito: String(c.modalidadeCredito ?? prev.modalidadeCredito ?? ''),
      valorTotalDivida: c.valorTotalDivida != null ? moneyToInput(c.valorTotalDivida) : prev.valorTotalDivida,
      valorTotalPago: c.valorTotalPago != null ? moneyToInput(c.valorTotalPago) : prev.valorTotalPago,
      observacoes: String(c.observacoes ?? prev.observacoes ?? ''),
      estagio: ALL_STAGES.includes(c.estagio as Estagio) ? (c.estagio as Estagio) : prev.estagio,
      consultor: String(c.consultor ?? prev.consultor ?? ''),
      tags: c.tags != null ? listToInput(c.tags) : prev.tags,
    }))
  }

  function applyIntakeCamposMissing(c: IntakePreview['campos'] | IntakeDocumentPreview['campos']) {
    setNovoCliente((prev) => ({
      ...prev,
      nome: prev.nome || String(c.nome ?? ''),
      cpfCnpj: prev.cpfCnpj || (c.cpfCnpj ? maskCpfCnpj(String(c.cpfCnpj)) : ''),
      email: prev.email || String(c.email ?? ''),
      telefone: prev.telefone || (c.telefone ? maskPhone(String(c.telefone)) : ''),
      whatsapp: prev.whatsapp || (c.whatsapp ? maskPhone(String(c.whatsapp)) : ''),
      cep: prev.cep || (c.cep ? maskCep(String(c.cep)) : ''),
      endereco: prev.endereco || String(c.endereco ?? ''),
      numero: prev.numero || String(c.numero ?? ''),
      complemento: prev.complemento || String(c.complemento ?? ''),
      bairro: prev.bairro || String(c.bairro ?? ''),
      cidade: prev.cidade || String(c.cidade ?? ''),
      uf: prev.uf || (c.uf ? String(c.uf).toUpperCase().slice(0, 2) : ''),
      atividade: prev.atividade || String(c.atividade ?? ''),
      areaTotalHa: prev.areaTotalHa || (c.areaTotalHa != null ? String(c.areaTotalHa).replace('.', ',') : ''),
      culturas: prev.culturas || (c.culturas != null ? listToInput(c.culturas) : ''),
      carCodigoImovel: prev.carCodigoImovel || String(c.carCodigoImovel ?? ''),
      credor: prev.credor || String(c.credor ?? ''),
      modalidadeCredito: prev.modalidadeCredito || String(c.modalidadeCredito ?? ''),
      valorTotalDivida: prev.valorTotalDivida || (c.valorTotalDivida != null ? moneyToInput(c.valorTotalDivida) : ''),
      valorTotalPago: prev.valorTotalPago || (c.valorTotalPago != null ? moneyToInput(c.valorTotalPago) : ''),
      observacoes: prev.observacoes || String(c.observacoes ?? ''),
      consultor: prev.consultor || String(c.consultor ?? ''),
      tags: prev.tags || (c.tags != null ? listToInput(c.tags) : ''),
    }))
  }

  async function handleIntakePreview() {
    const texto = intakeText.trim()
    if (texto.length < 20) {
      showToast('Cole dados suficientes para a IA analisar o pré-cadastro', 'warning')
      return
    }
    setIntakeLoading(true)
    setIntakePreview(null)
    try {
      const preview = await apiFetch<IntakePreview>('/clientes/intake-preview', {
        method: 'POST',
        body: JSON.stringify({ texto }),
      })
      const c = preview.campos || {}
      applyIntakeCampos(c)
      setIntakePreview(preview)
      const missing = preview.camposAusentes?.length ? ` Faltam: ${preview.camposAusentes.join(', ')}.` : ''
      showToast(`Pré-cadastro preenchido para revisão.${missing}`, 'success')
    } catch (err) {
      showToast(`Erro na leitura por IA: ${(err as Error).message}`, 'warning')
    } finally {
      setIntakeLoading(false)
    }
  }

  function addNovoClienteFiles(files: FileList | File[]) {
    const incoming = Array.from(files || [])
    if (!incoming.length) return
    const known = new Set(novoClienteAnexos.map((anexo) => documentFingerprint(anexo.file)))
    const accepted: File[] = []
    let duplicates = 0
    let oversized = 0
    for (const file of incoming) {
      const fingerprint = documentFingerprint(file)
      if (known.has(fingerprint)) {
        duplicates += 1
        continue
      }
      if (file.size > 20 * 1024 * 1024) {
        oversized += 1
        continue
      }
      known.add(fingerprint)
      accepted.push(file)
    }
    if (duplicates) showToast(`${duplicates} arquivo(s) repetido(s) foram ignorados`, 'warning')
    if (oversized) showToast(`${oversized} arquivo(s) acima de 20 MB precisam ser reduzidos`, 'warning')
    if (!accepted.length) return
    setConflitosResolvidos(new Set())
    setNovoClienteAnexos((prev) => [
      ...prev,
      ...accepted.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        tipo: 'auto' as const,
        status: 'aguardando' as const,
      })),
    ])
  }

  function updateAnexoTipo(id: string, tipo: ClientDocumentType) {
    setNovoClienteAnexos((prev) => prev.map((a) => a.id === id ? { ...a, tipo } : a))
  }

  function removeNovoClienteAnexo(id: string) {
    const next = novoClienteAnexos.filter((anexo) => anexo.id !== id)
    const previews = next.map((anexo) => anexo.preview).filter(Boolean) as IntakeDocumentoPreview[]
    setNovoClienteAnexos(next)
    setIntakeDocPreview(previews.length ? consolidateDocumentPreviews(previews) : null)
  }

  function retryNovoClienteAnexo(id: string) {
    setNovoClienteAnexos((prev) => prev.map((anexo) => anexo.id === id
      ? { ...anexo, status: 'aguardando', preview: undefined, error: undefined }
      : anexo))
  }

  function reanalyzeNovoClienteAnexos() {
    setIntakeDocPreview(null)
    setConflitosResolvidos(new Set())
    setNovoClienteAnexos((prev) => prev.map((anexo) => ({
      ...anexo,
      status: 'aguardando',
      preview: undefined,
      error: undefined,
      tipo: anexo.tipo === 'auto' ? 'auto' : anexo.tipo,
    })))
  }

  function applyIntakeConflict(conflict: IntakeConflict, optionIndex: number) {
    const option = conflict.opcoes[optionIndex]
    if (!option) return
    applyIntakeCampos({ [conflict.campo]: option.value })
    setConflitosResolvidos((current) => new Set([...current, conflict.campo]))
    showToast(`${conflict.campo} atualizado a partir do documento selecionado`, 'success')
  }

  async function handleAnalyzeNovoClienteDocs() {
    const pending = novoClienteAnexos.filter((anexo) => anexo.status === 'aguardando')
    if (!pending.length || intakeDocsLoading) return
    const pendingIds = new Set(pending.map((anexo) => anexo.id))
    intakeRefreshTimers.current.forEach((timer) => window.clearTimeout(timer))
    intakeRefreshTimers.current = []
    const previewById = new Map<string, IntakeDocumentoPreview>()
    for (const anexo of novoClienteAnexos) {
      if (!pendingIds.has(anexo.id) && anexo.preview) previewById.set(anexo.id, anexo.preview)
    }
    const batchSize = 4
    const batches = Array.from({ length: Math.ceil(pending.length / batchSize) }, (_, index) => (
      pending.slice(index * batchSize, (index + 1) * batchSize)
    ))
    setIntakeDocsLoading(true)
    setNovoClienteAnexos((prev) => prev.map((anexo) => pendingIds.has(anexo.id)
      ? { ...anexo, status: 'analisando', error: undefined }
      : anexo))
    setIntakeProgress({ concluidos: 0, total: pending.length, loteAtual: 1, totalLotes: batches.length })
    let completed = 0
    let failures = 0

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex]
      const form = new FormData()
      batch.forEach((anexo) => form.append('files', anexo.file, anexo.file.name))
      setIntakeProgress({ concluidos: completed, total: pending.length, loteAtual: batchIndex + 1, totalLotes: batches.length })
      try {
        const preview = await apiFetch<IntakeDocumentPreview>(`/clientes/intake-document-preview?sessionId=${encodeURIComponent(intakeSessionId)}`, {
          method: 'POST',
          body: form,
          timeoutMs: 180_000,
        })
        const updates = new Map<string, IntakeDocumentoPreview>()
        batch.forEach((anexo, index) => {
          const documentPreview = preview.documentos?.[index]
          if (documentPreview) {
            updates.set(anexo.id, documentPreview)
            previewById.set(anexo.id, documentPreview)
            if (documentPreview.erro) failures += 1
          } else {
            failures += 1
          }
        })
        setNovoClienteAnexos((prev) => prev.map((anexo) => {
          const documentPreview = updates.get(anexo.id)
          if (!batch.some((item) => item.id === anexo.id)) return anexo
          if (!documentPreview || documentPreview.erro) {
            return { ...anexo, status: 'erro', preview: documentPreview, error: documentPreview?.erro || 'O arquivo não retornou uma leitura válida.' }
          }
          return {
            ...anexo,
            preview: documentPreview,
            status: ['queued', 'processing', 'extracting'].includes(documentPreview.estadoProcessamento || '') ? 'analisando' : 'pronto',
            error: undefined,
          }
        }))
      } catch (err) {
        failures += batch.length
        const message = (err as Error).message
        setNovoClienteAnexos((prev) => prev.map((anexo) => batch.some((item) => item.id === anexo.id)
          ? { ...anexo, status: 'erro', error: message }
          : anexo))
      }
      completed += batch.length
      setIntakeProgress({ concluidos: completed, total: pending.length, loteAtual: batchIndex + 1, totalLotes: batches.length })
    }

    let consolidated = consolidateDocumentPreviews([...previewById.values()])
    try {
      consolidated = await apiFetch<IntakeDocumentPreview>('/clientes/intake-dossier-preview', {
        method: 'POST',
        body: JSON.stringify({ sessionId: intakeSessionId }),
      })
    } catch (err) {
      showToast(`A síntese profunda não foi concluída; mantendo a consolidação local: ${(err as Error).message}`, 'warning')
    }
    setIntakeDocPreview(consolidated)
    if (consolidated.documentos.length) applyIntakeCampos(consolidated.campos)
    // A extração de IA roda em segundo plano. Reconsulta algumas vezes para
    // incorporar campos enriquecidos sem obrigar o usuário a reenviar arquivos.
    const refreshAsyncDossier = (attempt: number) => {
      if (attempt > 60) return
      const timer = window.setTimeout(async () => {
        if (!showNovoCliente || intakeSessionRef.current !== intakeSessionId) return
        let stillProcessing = true
        try {
          const refreshed = await apiFetch<IntakeDocumentPreview>(`/clientes/intake-dossier-preview?sessionId=${encodeURIComponent(intakeSessionId)}`)
          const refreshedCompleteness = Number(refreshed.completude ?? 0)
          const currentCompleteness = Number(consolidated.completude ?? 0)
          setIntakeDocPreview(refreshed)
          if (refreshedCompleteness >= currentCompleteness) applyIntakeCamposMissing(refreshed.campos)
          const byDocumentId = new Map(refreshed.documentos.filter((doc) => doc.alixDocumentId).map((doc) => [doc.alixDocumentId, doc]))
          setNovoClienteAnexos((current) => current.map((anexo) => {
            const updated = anexo.preview?.alixDocumentId ? byDocumentId.get(anexo.preview.alixDocumentId) : undefined
            if (!updated) return anexo
            if (updated.estadoProcessamento === 'failed' || updated.erro) return { ...anexo, preview: updated, status: 'erro', error: updated.erro || 'A leitura deste arquivo falhou.' }
            const pendingState = ['queued', 'processing', 'extracting'].includes(updated.estadoProcessamento || '')
            return { ...anexo, preview: updated, status: pendingState ? 'analisando' : 'pronto', error: undefined }
          }))
          stillProcessing = refreshed.documentos.some((doc) => ['queued', 'processing', 'extracting'].includes(doc.estadoProcessamento || ''))
        } catch { /* processamento ainda em andamento; próxima tentativa */ }
        if (stillProcessing) refreshAsyncDossier(attempt + 1)
      }, 3000)
      intakeRefreshTimers.current.push(timer)
    }
    refreshAsyncDossier(1)
    setIntakeDocsLoading(false)
    setIntakeProgress(null)
    const conflitos = consolidated.conflitos?.length || 0
    const detail = [
      failures ? `${failures} falha(s)` : '',
      conflitos ? `${conflitos} divergência(s) para revisar` : '',
    ].filter(Boolean).join(' · ')
    showToast(`Dossiê atualizado: ${consolidated.documentos.length} documento(s) processado(s)${detail ? ` · ${detail}` : ''}`, failures ? 'warning' : 'success')
  }

  useEffect(() => {
    if (!showNovoCliente || intakeDocsLoading || saving) return
    if (novoClienteAnexos.some((anexo) => anexo.status === 'aguardando')) void handleAnalyzeNovoClienteDocs()
  }, [showNovoCliente, intakeDocsLoading, saving, novoClienteAnexos])

  async function uploadNovoClienteAnexos(cliente: ClienteApi): Promise<{ propostas: number; documentos: number; falhas: number }> {
    let propostasCriadas = 0
    let documentosSalvos = 0
    let falhas = 0
    let cursor = 0
    const uploadOne = async (anexo: NovoClienteAnexo) => {
      const tipoFinal = anexo.tipo === 'auto' ? (anexo.preview?.tipoArquivo || 'documento') : anexo.tipo
      setNovoClienteAnexos((prev) => prev.map((item) => item.id === anexo.id ? { ...item, status: 'enviando' } : item))
      try {
        const form = new FormData()
        form.append('file', anexo.file, anexo.file.name)
        if (tipoFinal === 'proposta') {
          form.append('clienteId', cliente.id)
          form.append('clienteNome', cliente.nome)
          if (anexo.preview?.alixDocumentId) {
            form.append('alixDocumentId', anexo.preview.alixDocumentId)
            form.append('alixSessionId', intakeSessionId)
          }
          await apiFetch('/propostas/upload', { method: 'POST', body: form })
          propostasCriadas += 1
        } else {
          const categoria = documentUploadCategory(tipoFinal)
          if (anexo.preview?.alixDocumentId) {
            await apiFetch(`/clientes/${encodeURIComponent(cliente.id)}/documentos/intake`, {
              method: 'POST',
              body: JSON.stringify({
                sessionId: intakeSessionId,
                documentos: [{ documentoId: anexo.preview.alixDocumentId, categoria }],
              }),
            })
          } else {
            await apiFetch(`/clientes/${encodeURIComponent(cliente.id)}/documentos?categoria=${categoria}`, {
              method: 'POST',
              body: form,
            })
          }
          documentosSalvos += 1
        }
        setNovoClienteAnexos((prev) => prev.map((item) => item.id === anexo.id ? { ...item, status: 'enviado' } : item))
    } catch (err) {
        falhas += 1
        setNovoClienteAnexos((prev) => prev.map((item) => item.id === anexo.id ? { ...item, status: 'erro', error: `Falha ao salvar este arquivo no cliente: ${(err as Error).message}` } : item))
      }
    }
    const workers = Array.from({ length: Math.min(3, novoClienteAnexos.length) }, async () => {
      while (cursor < novoClienteAnexos.length) {
        const index = cursor
        cursor += 1
        await uploadOne(novoClienteAnexos[index])
      }
    })
    await Promise.all(workers)
    if (propostasCriadas > 0) {
      try {
        await apiFetch(`/clientes/${encodeURIComponent(cliente.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            estagio: 'negociacao',
            timelineEvent: {
              data: new Date().toISOString().slice(0, 10),
              tipo: 'proposta',
              descricao: `${propostasCriadas} proposta(s) importada(s) no cadastro inicial`,
              detalhes: 'Arquivos enviados no modal de novo cliente e processados pela IA.',
            },
          }),
        })
      } catch {
        /* cliente criado; falha de estágio não deve bloquear navegação */
      }
    }
    return { propostas: propostasCriadas, documentos: documentosSalvos, falhas }
  }

  function resetNovoClienteDraft() {
    setNovoCliente({
      ...EMPTY_NOVO_CLIENTE,
      grupoFamiliar: [],
      escritorio: '',
    })
    setNovoClienteTab('documentos')
    setNovoClienteVisitedSteps(new Set(['documentos']))
    setIntakeSourceMode('arquivos')
    setIntakeText('')
    setIntakePreview(null)
    setIntakeDocPreview(null)
    setNovoClienteAnexos([])
    setNovoClienteDemandas([])
    setIntakeSessionId(createIntakeSessionId())
    setIntakeProgress(null)
    setConflitosResolvidos(new Set())
  }

  useEffect(() => {
    let cancelled = false
    setLoadingAlixInsights(true)
    apiFetch<ProactiveInsight[]>('/alix/insights?days=2')
      .then((items) => {
        if (cancelled) return
        setAlixInsights(
          (items || [])
            .filter((i) => String(i.payload?.clienteId || '').trim())
            .filter((i) => i.urgencia === 'critico' || i.urgencia === 'importante')
            .slice(0, 12),
        )
      })
      .catch(() => { if (!cancelled) setAlixInsights([]) })
      .finally(() => { if (!cancelled) setLoadingAlixInsights(false) })
    return () => { cancelled = true }
  }, [])

  const openAcaoModal = (cliente: Cliente, mode: QuickActionMode = 'proximaAcao') => {
    setAcaoCliente(cliente)
    setQuickActionMode(mode)
    setAcaoForm({
      data: cliente.proximaAcao?.data || new Date().toISOString().slice(0, 10),
      descricao: cliente.proximaAcao?.descricao || '',
      canal: 'telefone', resultado: '', proximaData: '', proximaDescricao: '',
    })
  }

  const closeAcaoModal = () => {
    if (savingAcao) return
    setAcaoCliente(null)
    setAcaoForm({ data: '', descricao: '', canal: 'telefone', resultado: '', proximaData: '', proximaDescricao: '' })
  }

  const handleSaveProximaAcao = async () => {
    if (!acaoCliente) return
    if (!acaoForm.data || !acaoForm.descricao.trim()) {
      showToast('Informe data e descrição da próxima ação', 'warning')
      return
    }
    setSavingAcao(true)
    try {
      await apiFetch(`/clientes/${acaoCliente.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          proximaAcao: {
            data: acaoForm.data, descricao: acaoForm.descricao.trim(),
            criadoEm: new Date().toISOString(), criadoPor: 'Equipe ALETIS',
          },
        }),
      })
      showToast('Próxima ação atualizada', 'success')
      closeAcaoModal()
      refetch()
    } catch (err) {
      showToast(`Erro ao salvar próxima ação: ${(err as Error).message}`, 'warning')
    } finally {
      setSavingAcao(false)
    }
  }

  const handleSaveContato = async () => {
    if (!acaoCliente) return
    if (!acaoForm.descricao.trim()) {
      showToast('Descreva o contato realizado', 'warning')
      return
    }
    setSavingAcao(true)
    try {
      const patch: Record<string, unknown> = {
        timelineEvent: {
          data: new Date().toISOString().slice(0, 10),
          tipo: acaoForm.canal === 'reuniao' ? 'reuniao' : 'contato',
          descricao: `${acaoForm.canal}: ${acaoForm.descricao.trim()}`,
          detalhes: acaoForm.resultado.trim() || 'Registrado pela equipe ALETIS',
        },
      }
      if (acaoForm.proximaData && acaoForm.proximaDescricao.trim()) {
        patch.proximaAcao = {
          data: acaoForm.proximaData, descricao: acaoForm.proximaDescricao.trim(),
          criadoEm: new Date().toISOString(), criadoPor: 'Equipe ALETIS',
        }
      }
      await apiFetch(`/clientes/${acaoCliente.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      showToast('Contato registrado no CRM', 'success')
      closeAcaoModal()
      refetch()
    } catch (err) {
      showToast(`Erro ao registrar contato: ${(err as Error).message}`, 'warning')
    } finally {
      setSavingAcao(false)
    }
  }

  const openStageMove = (cliente: Cliente, estagio: Estagio) => {
    if (cliente.estagio === estagio) return
    setStageMove({ cliente, estagio })
    setStageMotivo('')
  }

  const openSuggestedAction = (cliente: Cliente) => {
    const sug = cliente.proximaMelhorAcao
    if (!sug) { openAcaoModal(cliente, 'proximaAcao'); return }
    if (sug.tipo === 'registrar_contato') {
      openAcaoModal(cliente, 'contato')
      setAcaoForm(prev => ({ ...prev, descricao: sug.descricao, proximaData: sug.dataSugerida || '', proximaDescricao: '' }))
      return
    }
    if (sug.tipo === 'avancar_estagio' && STAGE_NEXT[cliente.estagio]) {
      openStageMove(cliente, STAGE_NEXT[cliente.estagio]!)
      setStageMotivo(sug.descricao)
      return
    }
    openAcaoModal(cliente, 'proximaAcao')
    setAcaoForm(prev => ({ ...prev, data: sug.dataSugerida || prev.data, descricao: sug.descricao }))
  }

  const handleSaveStageMove = async () => {
    if (!stageMove) return
    setSavingStage(true)
    try {
      await apiFetch(`/clientes/${stageMove.cliente.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          estagio: stageMove.estagio,
          timelineEvent: {
            data: new Date().toISOString().slice(0, 10), tipo: 'estagio',
            descricao: `Movido no Kanban: ${STAGE_CONFIG[stageMove.cliente.estagio]?.label || stageMove.cliente.estagio} → ${STAGE_CONFIG[stageMove.estagio]?.label || stageMove.estagio}`,
            detalhes: stageMotivo.trim() || 'Movimentação manual no CRM',
          },
        }),
      })
      showToast('Estágio atualizado', 'success')
      setStageMove(null)
      refetch()
    } catch (err) {
      showToast(`Erro ao alterar estágio: ${(err as Error).message}`, 'warning')
    } finally {
      setSavingStage(false)
    }
  }

  const handleSaveNovoCliente = async () => {
    if (!novoCliente.nome.trim()) { showToast('Nome do cliente é obrigatório', 'warning'); setNovoClienteTab('identificacao'); return }
    if (!novoCliente.cidade.trim()) { showToast('Cidade é obrigatória', 'warning'); setNovoClienteTab('localizacao'); return }
    if (!novoCliente.uf.trim() || novoCliente.uf.trim().length !== 2) { showToast('UF é obrigatória (2 letras)', 'warning'); setNovoClienteTab('localizacao'); return }
    if (!novoCliente.escritorio.trim()) { showToast('Selecione o escritório responsável', 'warning'); setNovoClienteTab('classificacao'); return }
    if (novoClienteDemandas.some((demanda) => !demanda.titulo.trim())) { showToast('Preencha o título das demandas adicionadas ou remova as linhas vazias', 'warning'); setNovoClienteTab('operacao'); return }
    setSaving(true)
    try {
      const parseMoney = (v: string) => {
        if (!v) return 0
        return Number(v.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')) || 0
      }
      const criado = await apiFetch<ClienteApi>('/clientes', {
        method: 'POST',
        body: JSON.stringify({
          // Identificação
          nome: novoCliente.nome.trim(),
          cpfCnpj: novoCliente.cpfCnpj.trim(),
          tipo: novoCliente.tipo,
          telefone: novoCliente.telefone.trim(),
          email: novoCliente.email.trim(),
          whatsapp: novoCliente.whatsapp.trim(),
          // Localização
          cep: novoCliente.cep.trim().replace(/\D/g, ''),
          endereco: novoCliente.endereco.trim(),
          numero: novoCliente.numero.trim(),
          complemento: novoCliente.complemento.trim(),
          bairro: novoCliente.bairro.trim(),
          cidade: novoCliente.cidade.trim(),
          uf: novoCliente.uf.trim().toUpperCase(),
          // Operação Rural
          atividade: novoCliente.atividade.trim(),
          areaTotalHa: Number(novoCliente.areaTotalHa.replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
          culturas: novoCliente.culturas.split(',').map(c => c.trim()).filter(Boolean),
          carCodigoImovel: novoCliente.carCodigoImovel.trim(),
          // Financeiro
          credor: novoCliente.credor.trim() || 'A definir',
          modalidadeCredito: novoCliente.modalidadeCredito.trim() || undefined,
          valorTotalDivida: parseMoney(novoCliente.valorTotalDivida),
          valorTotalPago: parseMoney(novoCliente.valorTotalPago),
          observacoes: novoCliente.observacoes.trim(),
          // Classificação
          estagio: novoCliente.estagio,
          consultor: novoCliente.consultor.trim() || 'Christian Kohler',
          escritorio: novoCliente.escritorio.trim(),
          tags: novoCliente.tags.split(',').map(t => t.trim()).filter(Boolean),
          grupoFamiliar: novoCliente.grupoFamiliar
            .filter((p) => p.nome.trim())
            .map((p) => ({
              nome: p.nome.trim(),
              parentesco: p.parentesco.trim() || undefined,
              papel: p.papel.trim() || undefined,
              cpfCnpj: p.cpfCnpj.trim() || undefined,
              telefone: p.telefone.trim() || undefined,
              email: p.email.trim() || undefined,
              atuaAtividade: p.atuaAtividade,
              observacoes: p.observacoes.trim() || undefined,
            })),
        }),
      })
      let uploadMsg = ''
      let demandasCriadas = 0
      let demandasFalhas = 0
      const demandasValidas = novoClienteDemandas.filter((demanda) => demanda.titulo.trim())
      if (demandasValidas.length) {
        const results = await Promise.allSettled(demandasValidas.map((demanda) => apiFetch(`/clientes/${encodeURIComponent(criado.id)}/demandas`, {
          method: 'POST',
          body: JSON.stringify({
            titulo: demanda.titulo.trim(),
            assunto: demanda.assunto.trim() || demanda.titulo.trim(),
            descricao: demanda.descricao.trim() || undefined,
            categoria: demanda.categoria,
            credor: demanda.credor.trim() || undefined,
            valorPretendido: demanda.valorPretendido || undefined,
            prazoAlvo: demanda.prazoAlvo || undefined,
            proximaAcao: demanda.proximaAcao.trim() || undefined,
            proximaAcaoEm: demanda.proximaAcaoEm || undefined,
            probabilidade: Number(demanda.probabilidade) || 0,
            resultadoEsperado: demanda.resultadoEsperado.trim() || undefined,
            prioridade: demanda.prioridade,
            responsavel: novoCliente.consultor.trim() || 'Christian Kohler',
            origem: 'manual',
          }),
        })))
        demandasCriadas = results.filter((result) => result.status === 'fulfilled').length
        demandasFalhas = results.length - demandasCriadas
        uploadMsg += ` · ${demandasCriadas} demanda(s) organizada(s)`
        if (demandasFalhas) uploadMsg += `, ${demandasFalhas} demanda(s) com falha`
      }
      if (novoClienteAnexos.length) {
        const r = await uploadNovoClienteAnexos(criado)
        uploadMsg += ` · ${r.documentos} documento(s) no cofre, ${r.propostas} proposta(s) em negociação`
        if (r.falhas) uploadMsg += `, ${r.falhas} anexo(s) com falha`
      }
      showToast(`Cliente criado com sucesso${uploadMsg}`, uploadMsg.includes('falha') ? 'warning' : 'success')
      setShowNovoCliente(false)
      setQuickCreateOpen(false)
      resetNovoClienteDraft()
      refetch()
      if (criado?.id) navigate(`/clientes/${criado.id}`)
    } catch (err) {
      const msg = (err as Error).message
      showToast(`Erro ao criar cliente: ${msg}`, 'warning')
    } finally {
      setSaving(false)
    }
  }

  // ── Filter + Sort logic ──
  const carteiraClientes = useMemo(
    () => clientes.filter((cliente) => {
      if (officeFilter === 'todos') return true
      if (officeFilter === OFFICE_UNASSIGNED) return !cliente.escritorio
      return cliente.escritorio?.toLowerCase() === officeFilter.toLowerCase()
    }),
    [clientes, officeFilter],
  )

  const filteredClientes = useMemo(() => {
    const q = foldCrmSearch(searchQuery)
    let result = carteiraClientes.filter((c) => {
      const matchesSearch = !q || [c.nome, c.cidade, c.uf, c.credor, c.escritorio ?? '']
        .some((value) => foldCrmSearch(value).includes(q))
      const matchesStage = stageFilter === 'todos' || c.estagio === stageFilter
      const matchesOperational = matchesOperationalFilter(c, operationalFilter)
      return matchesSearch && matchesStage && matchesOperational
    })
    result.sort((a, b) => {
      let valA: string | number = (a[sortKey] ?? -1) as string | number
      let valB: string | number = (b[sortKey] ?? -1) as string | number
      if (sortKey === 'cidade') { valA = `${a.cidade}/${a.uf}`; valB = `${b.cidade}/${b.uf}` }
      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB as string, 'pt-BR')
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number)
    })
    return result
  }, [carteiraClientes, searchQuery, stageFilter, operationalFilter, sortKey, sortDir])

  const kanbanColumns = useMemo(() => {
    return ALL_STAGES.map((stage) => ({
      stage, config: STAGE_CONFIG[stage] || DEFAULT_STAGE,
      clients: filteredClientes.filter((c) => c.estagio === stage),
    }))
  }, [filteredClientes])

  // ── Stats ──
  const stats = useMemo(() => {
    const total = carteiraClientes.length
    const ativos = carteiraClientes.filter(isClienteAtivo).length
    const emNegociacao = carteiraClientes.filter((c) => c.estagio === 'negociacao').length
    const prioridade = carteiraClientes.filter((c) => matchesOperationalFilter(c, 'prioridade')).length
    const criticos = carteiraClientes.filter((c) => c.prioridade === 'critica').length
    const atrasados = carteiraClientes.filter((c) => matchesOperationalFilter(c, 'atrasados')).length
    const hoje = carteiraClientes.filter((c) => matchesOperationalFilter(c, 'hoje')).length
    const semAcao = carteiraClientes.filter((c) => matchesOperationalFilter(c, 'semAcao')).length
    const parados = carteiraClientes.filter((c) => matchesOperationalFilter(c, 'parados')).length
    const totalDivida = carteiraClientes.reduce((total, cliente) => total + cliente.valorDivida, 0)
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0,0,0,0)
    const acordosMes = carteiraClientes.filter((c) => {
      if (c.estagio !== 'acordo' && c.estagio !== 'concluido') return false
      const ts = c.ultimaAtualizacao ? new Date(c.ultimaAtualizacao).getTime() : 0
      return ts >= inicioMes.getTime()
    }).length
    return { total, ativos, emNegociacao, acordosMes, prioridade, criticos, atrasados, hoje, semAcao, parados, totalDivida }
  }, [carteiraClientes])

  const operationalFilters = useMemo(() => ([
    { key: 'prioridade' as const, label: 'Prioridade ALIX', count: stats.prioridade, icon: Sparkles, tone: 'gold' },
    { key: 'atrasados' as const, label: 'Atrasados', count: stats.atrasados, icon: AlertTriangle, tone: 'red' },
    { key: 'hoje' as const, label: 'Hoje', count: stats.hoje, icon: CalendarClock, tone: 'amber' },
    { key: 'semAcao' as const, label: 'Sem ação', count: stats.semAcao, icon: Clock3, tone: 'slate' },
    { key: 'parados' as const, label: 'Parados 30d+', count: stats.parados, icon: Clock3, tone: 'red' },
  ]), [stats.prioridade, stats.atrasados, stats.hoje, stats.semAcao, stats.parados])

  const alixInsightsByCliente = useMemo(() => {
    const map = new Map<string, ProactiveInsight[]>()
    for (const insight of alixInsights) {
      const clienteId = String(insight.payload?.clienteId || '')
      if (!clienteId) continue
      const list = map.get(clienteId) || []
      list.push(insight)
      map.set(clienteId, list)
    }
    return map
  }, [alixInsights])

  const topAlixCards = useMemo(() => {
    return alixInsights
      .map((insight) => ({ insight, cliente: carteiraClientes.find((c) => c.id === insight.payload?.clienteId) }))
      .filter((x): x is { insight: ProactiveInsight; cliente: Cliente } => Boolean(x.cliente))
      .slice(0, 3)
  }, [alixInsights, carteiraClientes])


  const directoryRows = useMemo<CrmDirectoryRow[]>(() => filteredClientes.map(c => {
    const due = diasAte(c.proximaAcao?.data)
    const days = diasDesde(c.estagioDesde || c.ultimaAtualizacao)
    return {
      id: c.id, name: c.nome, initials: getInitials(c.nome), location: [c.cidade, c.uf].filter(Boolean).join('/') || 'Localização não informada',
      office: officeLabel(c.escritorio), consultant: c.consultor,
      stage: <StageBadge estagio={c.estagio} />, priority: <PriorityBadge prioridade={c.prioridade} score={c.scoreOperacional} />,
      priorityReasons: c.motivosPrioridade, health: <HealthBar value={c.saudeFinanceira} />,
      financialValue: financialValue(c), financialLabel: c.resumoFinanceiro.rotulo, financialContext: c.resumoFinanceiro.contexto, financialDescription: c.resumoFinanceiro.descricao,
      nextAction: c.proximaAcao?.descricao, overdue: due != null && due < 0,
      dueLabel: !c.proximaAcao ? 'Sem próxima ação' : due == null ? 'Ação sem data válida' : due < 0 ? Math.abs(due) + ' dia(s) em atraso' : due === 0 ? 'Para hoje' : 'Em ' + due + ' dia(s)',
      inactivity: days == null ? undefined : days + ' dia(s) sem movimentação', suggestedAction: c.proximaMelhorAcao?.descricao,
      insights: (alixInsightsByCliente.get(c.id) || []).map(insight => insight.titulo + (insight.detalhes ? ' — ' + insight.detalhes : '')),
      canAdvance: Boolean(STAGE_NEXT[c.estagio]),
    }
  }), [filteredClientes, alixInsightsByCliente])
  const hasViewFilters = Boolean(searchQuery || stageFilter !== 'todos' || officeFilter !== 'todos' || operationalFilter !== 'todos')
  const clearViewFilters = () => updateView({ ...DEFAULT_CRM_VIEW, viewMode })
  const withClient = (id: string, action: (cliente: Cliente) => void) => { const cliente = clientes.find(item => item.id === id); if (cliente) action(cliente) }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen pb-2 text-stone-900 dark:text-stone-100">
      <PageHeader title="Clientes" eyebrow="CRM · Relacionamento" description="Encontre um cliente, acompanhe o próximo passo e continue o atendimento." actions={<> <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={loading}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-300 bg-card text-stone-600 transition hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-stone-300 dark:hover:bg-white/10"
              title="Atualizar carteira"
              aria-label="Atualizar carteira"
            >
              <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (filteredClientes.length === 0) { showToast('Nenhum cliente para exportar', 'warning'); return }
                const colunas = ['Nome','Cidade','UF','Escritório','Credor','Dívida (R$)','Estágio','Saúde Financeira','Consultor']
                const linhas = filteredClientes.map(c => [c.nome, c.cidade, c.uf, officeLabel(c.escritorio), c.credor, c.valorDivida.toFixed(2).replace('.',','), STAGE_CONFIG[c.estagio]?.label||c.estagio, c.saudeFinanceira ?? '', c.consultor])
                exportCSV('clientes_aletis', colunas, linhas)
                showToast(`${filteredClientes.length} cliente(s) exportado(s)`, 'success')
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300 bg-card px-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Exportar</span>
            </button>
            <button
              type="button"
              onClick={() => setQuickCreateOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-aletis-verde px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-aletis-verde-medio dark:bg-aletis-dourado dark:text-aletis-verde dark:hover:bg-aletis-dourado-suave"
            >
              <Plus className="h-4 w-4" />
              Novo cliente
            </button>
          </div> </>} />

      {error && <div role="alert" className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center"><AlertTriangle size={18} className="shrink-0 text-amber-700" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-amber-900">Não foi possível atualizar a carteira</p><p className="mt-1 text-xs text-amber-800">{clientes.length ? 'Os últimos dados carregados continuam visíveis. ' : ''}{error}</p></div><button type="button" onClick={refetch} className="w-fit rounded-lg border border-amber-300 bg-card px-3 py-2 text-xs font-semibold text-amber-900">Tentar novamente</button></div>}

      {((!loading && !error) || clientes.length > 0) && <div className="crm-overview" aria-label="Atalhos de acompanhamento">
        <button type="button" className="crm-overview-button" aria-pressed={operationalFilter === 'todos'} onClick={() => setOperationalFilter('todos')}><div><strong>{stats.total}</strong><span>Clientes na carteira</span></div><Users size={20} /></button>
        <button type="button" className="crm-overview-button" aria-pressed={operationalFilter === 'atrasados'} onClick={() => setOperationalFilter('atrasados')}><div><strong>{stats.atrasados}</strong><span>Com ações atrasadas</span></div><CalendarClock size={20} /></button>
        <button type="button" className="crm-overview-button" aria-pressed={operationalFilter === 'semAcao'} onClick={() => setOperationalFilter('semAcao')}><div><strong>{stats.semAcao}</strong><span>Sem próxima ação</span></div><Clock3 size={20} /></button>
      </div>}


      <motion.section
        variants={slideUp}
        initial="hidden"
        animate="visible"
        className="ui-panel overflow-hidden"
        aria-labelledby="crm-workspace-title"
      >
        <h2 id="crm-workspace-title" className="sr-only">Carteira de clientes</h2>
        <div className="grid gap-3 border-b border-stone-200 px-4 py-3 dark:border-white/10 md:grid-cols-[minmax(0,1fr)_190px_auto] sm:px-5">
          <label className="relative min-w-0">
            <span className="sr-only">Buscar clientes</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              placeholder="Buscar cliente, cidade, escritório ou credor"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-10 w-full rounded-lg border border-stone-300 bg-card pl-10 pr-3 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-aletis-dourado focus:ring-2 focus:ring-aletis-dourado/15 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500"
            />
          </label>
          <label className="relative min-w-0">
            <span className="sr-only">Filtrar por escritório</span>
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <select
              value={officeFilter}
              onChange={(event) => changeOfficeFilter(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-stone-300 bg-card pl-10 pr-8 text-sm font-semibold text-stone-700 outline-none transition focus:border-aletis-dourado focus:ring-2 focus:ring-aletis-dourado/15 dark:border-white/15 dark:bg-[#17251b] dark:text-white"
            >
              <option value="todos">Todos os escritórios</option>
              {officeOptions.map((office) => <option key={office} value={office}>{officeLabel(office)}</option>)}
              <option value={OFFICE_UNASSIGNED}>Sem escritório</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          </label>
          <label className="min-w-0"><span className="sr-only">Filtrar por etapa</span><select value={stageFilter} onChange={event => setStageFilter(event.target.value as CrmViewState['stageFilter'])} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"><option value="todos">Todas as etapas</option>{ALL_STAGES.map(stage => <option key={stage} value={stage}>{(STAGE_CONFIG[stage] || DEFAULT_STAGE).label}</option>)}</select></label>
        </div>
        <div className="crm-quick-views" role="group" aria-label="Acompanhamento da carteira">
          <button type="button" className="crm-quick-view" aria-pressed={operationalFilter === 'todos'} onClick={() => setOperationalFilter('todos')}>Todos <span>{stats.total}</span></button>
          {operationalFilters.map(item => <button key={item.key} type="button" className="crm-quick-view" aria-pressed={operationalFilter === item.key} onClick={() => setOperationalFilter(operationalFilter === item.key ? 'todos' : item.key)}>{item.label}<span>{item.count}</span></button>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs text-muted-foreground">
          <span aria-live="polite">{filteredClientes.length} cliente(s){hasViewFilters ? ' com os filtros selecionados' : ' · abra para continuar o atendimento'}</span>
          <div className="inline-flex w-fit overflow-hidden rounded-lg border border-stone-200 bg-stone-50 p-0.5 dark:border-white/10 dark:bg-white/5" role="group" aria-label="Visualização da carteira">
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition ${viewMode === 'list' ? 'bg-card text-foreground shadow-sm dark:bg-white/10 dark:text-white' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-white'}`}
            >
              <List className="h-3.5 w-3.5" /> Lista
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'kanban'}
              onClick={() => setViewMode('kanban')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-bold transition ${viewMode === 'kanban' ? 'bg-card text-foreground shadow-sm dark:bg-white/10 dark:text-white' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-white'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Funil
            </button>
          </div>
          <label className="inline-flex items-center gap-2">Ordenar por<select aria-label="Ordenar clientes" value={sortKey + ':' + sortDir} onChange={event => { const [key, direction] = event.target.value.split(':'); updateView({ sortKey: key as SortKey, sortDir: direction as SortDir }) }} className="max-w-48 rounded-md border border-border bg-card px-2 py-1.5 text-foreground">{Object.entries({ scoreOperacional: 'Prioridade', nome: 'Nome', cidade: 'Cidade', credor: 'Credor', valorDivida: 'Valor', estagio: 'Etapa', saudeFinanceira: 'Saúde financeira', consultor: 'Consultor' }).flatMap(([key,label]) => ['asc','desc'].map(direction => <option key={key+direction} value={key+':'+direction}>{label} · {direction === 'asc' ? 'crescente' : 'decrescente'}</option>))}</select></label>
        </div>
        {hasViewFilters && <div className="crm-filter-chips" aria-label="Filtros ativos">
          {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label="Remover filtro de busca">Busca: {searchQuery}<X size={12} /></button>}
          {officeFilter !== 'todos' && <button type="button" onClick={() => changeOfficeFilter('todos')} aria-label="Remover filtro de escritório">{officeFilter === OFFICE_UNASSIGNED ? 'Sem escritório' : officeLabel(officeFilter)}<X size={12} /></button>}
          {stageFilter !== 'todos' && <button type="button" onClick={() => setStageFilter('todos')} aria-label="Remover filtro de etapa">{(STAGE_CONFIG[stageFilter] || DEFAULT_STAGE).label}<X size={12} /></button>}
          {operationalFilter !== 'todos' && <button type="button" onClick={() => setOperationalFilter('todos')} aria-label="Remover filtro de acompanhamento">{operationalFilters.find(item => item.key === operationalFilter)?.label}<X size={12} /></button>}
          <button type="button" onClick={clearViewFilters}>Limpar todos</button>
        </div>}

        {loading && !clientes.length && <div role="status" className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando carteira…</div>}

        {viewMode === 'list' && (!loading || clientes.length > 0) && <CrmClientList rows={directoryRows} hasFilters={hasViewFilters} onClearFilters={clearViewFilters}
          onSchedule={id => withClient(id, c => openAcaoModal(c, 'proximaAcao'))}
          onContact={id => withClient(id, c => openAcaoModal(c, 'contato'))}
          onSuggestedAction={id => withClient(id, openSuggestedAction)}
          onAdvance={id => withClient(id, c => { const next = STAGE_NEXT[c.estagio]; if (next) openStageMove(c, next) })}
        />}

        <AnimatePresence mode="wait">
          {viewMode === 'kanban' && (
            <motion.div key="kanban" variants={fadeIn} initial="hidden" animate="visible" exit="hidden" className="relative min-w-0">
              {loading && <div className="absolute inset-0 z-20 animate-pulse bg-white/65 dark:bg-card/70" />}
              <BoardScroller label="Funil de clientes" sections={kanbanColumns.filter(({ stage }) => stageFilter === 'todos' || stage === stageFilter).map(({ stage, config, clients }) => ({ id: stage, label: config.label, count: clients.length }))}>
                {kanbanColumns.filter(({ stage }) => stageFilter === 'todos' || stage === stageFilter).map(({ stage, config, clients }) => (
                  <div key={stage} data-board-section={stage} role="group" aria-label={`Etapa ${config.label}: ${clients.length} clientes`} className="flex w-[276px] flex-shrink-0 flex-col" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const clienteId = event.dataTransfer.getData('text/plain'); const cliente = clientes.find((item) => item.id === clienteId); if (cliente) openStageMove(cliente, stage) }}>
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: config.color }} /><h3 className="truncate text-xs font-bold text-stone-700 dark:text-stone-200">{config.label}</h3></div>
                      <span className="flex h-6 min-w-6 items-center justify-center rounded-md bg-stone-100 px-1.5 text-[11px] font-bold text-stone-600 dark:bg-white/10 dark:text-stone-300">{clients.length}</span>
                    </div>
                    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="min-h-[240px] flex-1 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-2 dark:border-white/10 dark:bg-black/10">
                      {clients.map((c) => {
                        const dias = diasDesde(c.estagioDesde || c.ultimaAtualizacao)
                        const prox = diasAte(c.proximaAcao?.data)
                        return (
                          <motion.article key={c.id} variants={staggerItem} draggable onDragStart={(event) => { (event as any).dataTransfer?.setData('text/plain', c.id); (event as any).dataTransfer.effectAllowed = 'move' }} className="cursor-grab rounded-lg border border-stone-200 bg-card p-3 shadow-sm transition hover:border-aletis-verde/30 active:cursor-grabbing dark:border-white/10 dark:bg-[#17251b]" layout>
                            <div className="flex items-start justify-between gap-2"><Link to={`/clientes/${c.id}`} className="line-clamp-2 text-sm font-bold leading-snug text-stone-800 hover:text-aletis-verde dark:text-white dark:hover:text-aletis-dourado">{c.nome}</Link><HealthDot value={c.saudeFinanceira} /></div>
                            <div className="mt-2 flex items-center justify-between gap-2"><PriorityBadge prioridade={c.prioridade} score={c.scoreOperacional} /><span className="truncate text-xs font-bold text-stone-700 dark:text-stone-200" title={c.resumoFinanceiro.descricao}>{financialValue(c)}</span></div>
                            <p className="mt-1 truncate text-[11px] font-semibold text-stone-500 dark:text-stone-400">{c.resumoFinanceiro.rotulo}</p>
                            <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">{c.cidade}/{c.uf} · {officeLabel(c.escritorio)} · {c.resumoFinanceiro.contexto}</p>
                            <div className="mt-2 border-t border-stone-100 pt-2 text-[11px] dark:border-white/10">
                              <div className="flex items-center justify-between gap-2"><span className={dias != null && dias >= 30 ? 'font-bold text-red-700 dark:text-red-400' : 'text-stone-500 dark:text-stone-400'}>{dias == null ? 'Sem histórico' : `${dias}d no estágio`}</span><span className={prox != null && prox < 0 ? 'font-bold text-red-700 dark:text-red-400' : 'font-bold text-amber-700 dark:text-amber-400'}>{prox == null ? 'Sem ação' : prox < 0 ? `${Math.abs(prox)}d atraso` : prox === 0 ? 'Hoje' : `em ${prox}d`}</span></div>
                              {c.proximaAcao && <p className="mt-1 line-clamp-3 leading-relaxed text-stone-500 dark:text-stone-400" title={c.proximaAcao.descricao}>{c.proximaAcao.descricao}</p>}
                            </div>
                            <div className="mt-2 flex items-center gap-1 border-t border-stone-100 pt-2 dark:border-white/10">
                              <button type="button" onClick={() => openAcaoModal(c, 'proximaAcao')} className="inline-flex h-7 items-center gap-1 rounded-md bg-amber-50 px-2 text-[11px] font-bold text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"><CalendarPlus className="h-3 w-3" /> Agendar</button>
                              <button type="button" onClick={() => openAcaoModal(c, 'contato')} className="inline-flex h-7 items-center gap-1 rounded-md bg-stone-100 px-2 text-[11px] font-bold text-stone-600 dark:bg-white/10 dark:text-stone-300"><PhoneCall className="h-3 w-3" /> Contato</button>
                              {STAGE_NEXT[c.estagio] && <button type="button" onClick={() => openStageMove(c, STAGE_NEXT[c.estagio]!)} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-white/10" title="Avançar etapa" aria-label={`Avançar ${c.nome}`}><ArrowRightLeft className="h-3.5 w-3.5" /></button>}
                            </div>
                          </motion.article>
                        )
                      })}
                      {!clients.length && <div className="flex h-24 items-center justify-center text-xs text-stone-400">Nenhum cliente</div>}
                    </motion.div>
                  </div>
                ))}
              </BoardScroller>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

        {(loadingAlixInsights || topAlixCards.length > 0) && (
          <details className="mt-5 overflow-hidden rounded-xl border border-border bg-card"><summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 text-sm font-semibold"><span className="inline-flex items-center gap-2"><Bot size={17} /> Recomendações da ALIX <span className="text-xs font-normal text-muted-foreground">{loadingAlixInsights ? "Carregando" : topAlixCards.length + " sinais"}</span></span><ChevronDown size={15} /></summary><section className="grid border-y border-aletis-borda bg-[var(--bg-surface-soft)] text-[var(--text-strong)] lg:grid-cols-[190px_repeat(3,minmax(0,1fr))]" aria-label="Monitor ALIX">
            <div className="flex items-start gap-3 border-b border-aletis-borda px-4 py-4 lg:border-b-0 lg:border-r sm:px-5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-aletis-gold-escuro">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">Monitor ALIX</p>
                <p className="text-xs text-[var(--text-muted)]">{loadingAlixInsights ? 'Analisando carteira' : `${topAlixCards.length} sinal(is) prioritário(s)`}</p>
              </div>
            </div>
            {loadingAlixInsights ? (
              [0, 1, 2].map((item) => <div key={item} className="min-h-[106px] animate-pulse border-b border-aletis-borda bg-white/[0.03] p-4 last:border-b-0 lg:border-b-0 lg:border-r" />)
            ) : topAlixCards.map(({ insight, cliente }) => (
              <div key={insight.id} className="min-w-0 border-b border-aletis-borda px-4 py-3 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${insight.urgencia === 'critico' ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <p className="truncate text-xs font-bold text-[var(--text-strong)]" title={cliente.nome}>{cliente.nome}</p>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]" title={insight.detalhes}>{insight.titulo}</p>
                <div className="mt-2 flex items-center gap-1">
                  <button type="button" onClick={() => openAcaoModal(cliente, 'proximaAcao')} className="inline-flex h-7 items-center gap-1 rounded-md bg-aletis-dourado px-2 text-[11px] font-bold text-foreground transition hover:bg-aletis-dourado-suave"><CalendarPlus className="h-3 w-3" /> Agendar</button>
                  <button type="button" onClick={() => openAcaoModal(cliente, 'contato')} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[var(--text-soft)] transition hover:bg-card"><PhoneCall className="h-3 w-3" /> Contato</button>
                </div>
              </div>
            ))}
          </section></details>
        )}

      {((!loading && !error) || clientes.length > 0) && <details className="mb-4 overflow-hidden rounded-lg border border-stone-200 bg-card dark:border-white/10 dark:bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-foreground marker:hidden dark:text-white sm:px-5">
          <span className="inline-flex items-center gap-2"><ChevronDown size={14} /> Indicadores da carteira</span>
          <span className="text-xs font-normal text-stone-500">{stats.ativos} ativos · {stats.semAcao} sem ação · {formatBRLCompact(stats.totalDivida)}</span>
        </summary>
      <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 border-t border-stone-200 dark:border-white/10 md:grid-cols-4" aria-label="Resumo da carteira">
          <motion.div variants={staggerItem}><CrmMetricCell icon={Banknote} label="Carteira mapeada" value={formatBRLCompact(stats.totalDivida)} detail={`${stats.total} cliente(s) no total`} /></motion.div>
          <motion.div variants={staggerItem}><CrmMetricCell icon={Users} label="Clientes ativos" value={String(stats.ativos)} detail={`${stats.acordosMes} acordo(s) no mês`} tone="good" /></motion.div>
          <motion.div variants={staggerItem}><CrmMetricCell icon={Clock3} label="Sem próxima ação" value={String(stats.semAcao)} detail={`${stats.parados} parado(s) há 30d+`} tone={stats.semAcao ? 'warn' : 'good'} /></motion.div>
          <motion.div variants={staggerItem}><CrmMetricCell icon={Handshake} label="Em negociação" value={String(stats.emNegociacao)} detail={`${stats.atrasados} ação(ões) atrasada(s)`} tone={stats.atrasados ? 'risk' : 'neutral'} /></motion.div>
        </motion.section>
      </details>}
        <div className="h-4" />

      {/* ══════════════════════════════════════════════════════════
           MODAIS — MotionDialog (spring, collapse, swipe)
           ══════════════════════════════════════════════════════════ */}

      {/* ── Novo Cliente ── */}
      {quickCreateOpen && (
        <MotionDialog
          title="Novo cliente"
          subtitle="Comece com os dados essenciais. Complete o cadastro depois na área do cliente."
          eyebrow="CRM ALETIS"
          icon={<UserPlus size={20} />}
          onClose={() => { if (!saving) setQuickCreateOpen(false) }}
          size="md"
          footer={(
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" disabled={saving} onClick={() => { setQuickCreateOpen(false); setShowNovoCliente(true); setNovoClienteTab('identificacao') }} className={uiAction.secondary}>
                Cadastro completo e documentos
              </button>
              <button form="crm-quick-create" type="submit" disabled={saving} className={uiAction.primary}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar e abrir cliente
              </button>
            </div>
          )}
        >
          <form id="crm-quick-create" onSubmit={(event) => { event.preventDefault(); void handleSaveNovoCliente() }} className="space-y-4">
            <p className="rounded-xl bg-aletis-bege px-3 py-2 text-sm text-[var(--text-soft)]">Preencha os quatro campos obrigatórios. Contatos e observações podem ser adicionados agora ou mais tarde.</p>
            <label className="block text-sm font-semibold text-foreground">Nome ou razão social *
              <input autoFocus required value={novoCliente.nome} onChange={(event) => updateNovoCliente('nome', event.target.value)} placeholder="Nome do cliente" className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2.5 font-normal outline-none focus:border-aletis-verde" />
            </label>
            <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
              <label className="block text-sm font-semibold text-foreground">Cidade *
                <input required value={novoCliente.cidade} onChange={(event) => updateNovoCliente('cidade', event.target.value)} placeholder="Cidade" className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2.5 font-normal outline-none focus:border-aletis-verde" />
              </label>
              <label className="block text-sm font-semibold text-foreground">UF *
                <input required maxLength={2} minLength={2} value={novoCliente.uf} onChange={(event) => updateNovoCliente('uf', event.target.value.toUpperCase())} placeholder="MT" className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2.5 font-normal uppercase outline-none focus:border-aletis-verde" />
              </label>
            </div>
            <label className="block text-sm font-semibold text-foreground">Escritório responsável *
              <select required value={novoCliente.escritorio} onChange={(event) => updateNovoCliente('escritorio', event.target.value)} className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2.5 font-normal outline-none focus:border-aletis-verde">
                <option value="">Selecione</option>
                {OFFICE_OPTIONS.map((office) => <option key={office.value} value={office.value}>{office.label}</option>)}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-foreground">Telefone ou WhatsApp
                <input value={novoCliente.telefone} onChange={(event) => updateNovoCliente('telefone', event.target.value)} placeholder="(00) 00000-0000" className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2.5 font-normal outline-none focus:border-aletis-verde" />
              </label>
              <label className="block text-sm font-semibold text-foreground">E-mail
                <input type="email" value={novoCliente.email} onChange={(event) => updateNovoCliente('email', event.target.value)} placeholder="cliente@exemplo.com" className="mt-1 w-full rounded-xl border border-aletis-borda bg-card px-3 py-2.5 font-normal outline-none focus:border-aletis-verde" />
              </label>
            </div>
            <label className="block text-sm font-semibold text-foreground">Informações iniciais
              <textarea rows={3} value={novoCliente.observacoes} onChange={(event) => updateNovoCliente('observacoes', event.target.value)} placeholder="O que já sabemos sobre este cliente?" className="mt-1 w-full resize-y rounded-xl border border-aletis-borda bg-card px-3 py-2.5 font-normal outline-none focus:border-aletis-verde" />
            </label>
          </form>
        </MotionDialog>
      )}
      <AnimatePresence>
        {showNovoCliente && (
      <MotionDialog
        key="novo-cliente"
        onClose={() => { if (!saving) setShowNovoCliente(false) }}
        eyebrow="CRM ALETIS"
        title="Onboarding de cliente"
        subtitle={novoCliente.nome.trim() || 'Novo cadastro inteligente'}
        icon={<UserPlus size={20} />}
        size="full"
        className="md:h-[min(92dvh,900px)]"
        collapsible
        closeOnBackdrop={!saving}
        swipeToDismiss={false}
        bodyClassName="!flex !min-h-0 !flex-col !overflow-hidden !p-0 !bg-aletis-cream-papel/35"
        headerActions={(
          <div className="flex items-center gap-3 rounded-lg border border-aletis-borda bg-card px-3 py-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-aletis-borda/60">
              <div className="h-full rounded-full bg-aletis-verde transition-[width] duration-500" style={{ width: `${novoClienteProgress}%` }} />
            </div>
            <span className="text-xs font-bold text-[var(--text-soft)]">{novoClienteProgress}%</span>
          </div>
        )}
        footer={(
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <button
                type="button"
                onClick={resetNovoClienteDraft}
                disabled={saving}
                className={`${uiAction.ghost} text-red-700 hover:text-red-700`}
              >
                <RotateCcw className="h-4 w-4" /> Limpar cadastro
              </button>
              <span className="text-[11px] font-semibold text-muted-foreground sm:hidden">
                {novoClienteStepIndex + 1}/{NOVO_CLIENTE_STEPS.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button type="button" onClick={() => setShowNovoCliente(false)} disabled={saving} className={`${uiAction.secondary} hidden sm:inline-flex`}>
                Cancelar
              </button>
              {novoClienteStepIndex > 0 && (
                <button type="button" onClick={() => moveNovoClienteStep(-1)} disabled={saving} className={uiAction.secondary}>
                  <ChevronLeft className="h-4 w-4" /> Voltar
                </button>
              )}
              {novoClienteTab !== 'revisao' ? (
                <button type="button" onClick={() => moveNovoClienteStep(1)} disabled={saving} className={`${uiAction.primary} ${novoClienteStepIndex === 0 ? 'col-span-2 sm:col-span-1' : ''}`}>
                  Continuar <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
              <button
                type="button"
                onClick={handleSaveNovoCliente}
                disabled={saving || intakeDocsLoading || !novoClienteReadyToCreate}
                className={uiAction.primary}
                title={!novoClienteReadiness.readyToSave ? 'Complete nome, cidade, UF e escritório' : novoClienteUnresolvedConflicts ? 'Resolva as divergências documentais' : 'Criar cliente'}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {novoClienteAnexos.length ? 'Criar e importar' : 'Criar cliente'}
              </button>
              )}
            </div>
          </div>
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
          <aside className="shrink-0 border-b border-aletis-borda bg-card lg:flex lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r lg:border-white/10 lg:bg-aletis-verde">
            <div className="onboarding-sidebar-intro hidden border-b border-white/10 px-5 py-5 lg:block">
              <p className="text-[11px] font-bold uppercase text-aletis-dourado">Cadastro inteligente</p>
              <p className="mt-1 text-base font-display font-semibold text-white">Novo relacionamento</p>
              <p className="mt-1 text-xs leading-relaxed text-white/60">Dados, documentos e contexto reunidos em um único fluxo.</p>
            </div>
            <nav className="onboarding-sidebar-nav flex gap-1 overflow-x-auto p-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-1 lg:overflow-y-auto lg:p-3" aria-label="Etapas do novo cliente">
              {NOVO_CLIENTE_STEPS.map((step, index) => {
                const Icon = step.icon
                const active = novoClienteTab === step.id
                const complete = novoClienteStepStatus[step.id]
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setNovoClienteTab(step.id)}
                    aria-current={active ? 'step' : undefined}
                    className={`onboarding-step-button group flex min-w-[82px] shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors lg:min-w-0 lg:px-3 lg:py-2.5 ${
                      active
                        ? 'bg-aletis-verde text-white lg:bg-white lg:text-aletis-verde'
                        : 'text-[var(--text-soft)] hover:bg-aletis-bege/50 lg:text-white/70 lg:hover:bg-white/10 lg:hover:text-white'
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold ${
                      active ? 'border-white/20 bg-white/10 lg:border-aletis-verde/15 lg:bg-aletis-verde/10' : 'border-aletis-borda bg-card lg:border-white/15 lg:bg-white/5'
                    }`}>
                      {complete && !active ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-bold lg:text-xs"><span className="lg:hidden">{step.shortLabel}</span><span className="hidden lg:inline">{step.label}</span></span>
                      <span className={`onboarding-step-description hidden truncate text-[11px] lg:block ${active ? 'text-muted-foreground' : 'text-white/45'}`}>{step.description}</span>
                    </span>
                    <span className="onboarding-step-number ml-auto hidden text-[11px] font-mono opacity-45 lg:block">{String(index + 1).padStart(2, '0')}</span>
                  </button>
                )
              })}
            </nav>
            <div className="onboarding-sidebar-progress hidden border-t border-white/10 p-5 lg:block">
              <div className="flex items-center justify-between text-[11px] font-semibold text-white/60">
                <span>Progresso</span><span>{novoClienteProgress}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-aletis-dourado transition-[width] duration-500" style={{ width: `${novoClienteProgress}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-white/45">{novoClienteCompletedSteps} de {NOVO_CLIENTE_STEPS.length} etapas completas</p>
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-aletis-cream-papel/30">
            <header className="shrink-0 border-b border-aletis-borda bg-card px-4 py-3.5 md:px-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase text-aletis-dourado">Etapa {novoClienteStepIndex + 1} de {NOVO_CLIENTE_STEPS.length}</p>
                  <h3 className="mt-0.5 text-lg font-display font-semibold text-foreground">{NOVO_CLIENTE_STEPS[novoClienteStepIndex]?.label}</h3>
                  <p className="text-xs text-muted-foreground">{NOVO_CLIENTE_STEPS[novoClienteStepIndex]?.description}</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[190px]">
                    <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">Escritório responsável *</span>
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <select
                        value={novoCliente.escritorio}
                        onChange={(event) => updateNovoCliente('escritorio', event.target.value)}
                        className={`input-field h-10 w-full appearance-none bg-card py-0 pl-10 pr-8 text-sm font-semibold ${novoCliente.escritorio ? 'border-emerald-300' : 'border-amber-300'}`}
                        aria-required="true"
                      >
                        <option value="">Selecione o escritório</option>
                        {OFFICE_OPTIONS.map((office) => <option key={office.value} value={office.value}>{office.label}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </label>
                  <div className="flex flex-wrap gap-1.5 pb-0.5">
                    {novoClienteAnexos.length > 0 && <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800">{novoClienteAnexos.length} documento(s)</span>}
                    {novoClienteReadiness.missingRequired > 0
                      ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">{novoClienteReadiness.missingRequired} obrigatório(s) pendente(s)</span>
                      : <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800">Dados essenciais completos</span>}
                  </div>
                </div>
              </div>
            </header>

            <div
              ref={novoClienteContentRef}
              data-onboarding-scroll
              tabIndex={0}
              className="onboarding-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-scroll overscroll-contain p-4 outline-none md:p-6"
            >
              {novoClienteTab === 'documentos' && (
                <motion.div key="documentos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  <div className="mb-4 inline-flex rounded-lg border border-aletis-borda bg-card p-1">
                    <button type="button" onClick={() => setIntakeSourceMode('arquivos')} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors ${intakeSourceMode === 'arquivos' ? 'bg-aletis-verde text-white' : 'text-[var(--text-soft)] hover:bg-aletis-bege/50'}`}>
                      <UploadCloud className="h-3.5 w-3.5" /> Arquivos e dossiê
                    </button>
                    <button type="button" onClick={() => setIntakeSourceMode('texto')} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors ${intakeSourceMode === 'texto' ? 'bg-aletis-verde text-white' : 'text-[var(--text-soft)] hover:bg-aletis-bege/50'}`}>
                      <Sparkles className="h-3.5 w-3.5" /> Texto rápido
                    </button>
                  </div>

                  {intakeSourceMode === 'arquivos' ? (
                    <ClientDocumentIntake
                      anexos={novoClienteAnexos}
                      dossier={intakeDocPreview}
                      progress={intakeProgress}
                      loading={intakeDocsLoading}
                      disabled={saving || intakeDocsLoading}
                      conflitosResolvidos={conflitosResolvidos}
                      onFiles={addNovoClienteFiles}
                      onTypeChange={updateAnexoTipo}
                      onRemove={removeNovoClienteAnexo}
                      onRetry={retryNovoClienteAnexo}
                      onReanalyzeAll={reanalyzeNovoClienteAnexos}
                      onApplyConflict={applyIntakeConflict}
                    />
                  ) : (
                    <section className="overflow-hidden rounded-lg border border-aletis-dourado/35 bg-card shadow-sm">
                      <div className="border-b border-aletis-borda bg-aletis-dourado/5 px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-aletis-dourado" />
                          <h4 className="text-sm font-display font-semibold text-foreground">Leitura de conversa ou ficha</h4>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">Cole o conteúdo recebido por WhatsApp, e-mail ou formulário.</p>
                      </div>
                      <div className="p-4">
                        <textarea
                          value={intakeText}
                          onChange={(event) => setIntakeText(event.target.value)}
                          rows={8}
                          placeholder="Nome, CPF/CNPJ, cidade/UF, contato, credor, valor da dívida, culturas, CAR e demais observações..."
                          className="input-field min-h-[190px] w-full resize-y bg-card py-3 text-sm"
                        />
                        {intakePreview && (
                          <div className="mt-3 border-l-2 border-aletis-dourado bg-aletis-dourado/5 px-3 py-2.5 text-xs text-[var(--text-soft)]">
                            <p className="font-bold text-foreground">{intakePreview.origem === 'ia' ? 'Leitura ALETIS' : 'Leitura básica'} · {Math.round((intakePreview.confianca ?? 0) * 100)}% de confiança</p>
                            {intakePreview.resumo && <p className="mt-1 leading-relaxed">{intakePreview.resumo}</p>}
                            {!!intakePreview.camposAusentes?.length && <p className="mt-1 text-amber-700">Ainda precisa conferir: {intakePreview.camposAusentes.join(', ')}</p>}
                          </div>
                        )}
                        <div className="mt-4 flex justify-end">
                          <button type="button" onClick={handleIntakePreview} disabled={intakeLoading || saving || intakeText.trim().length < 20} className={uiAction.primary}>
                            {intakeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Interpretar e preencher
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                </motion.div>
              )}

        {/* ── TAB: IDENTIFICAÇÃO ── */}
        {novoClienteTab === 'identificacao' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Nome completo / Razão social *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.nome} onChange={e => updateNovoCliente('nome', e.target.value)} placeholder="Ex: João da Silva ou Fazenda Exemplo Ltda" className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Tipo *</label>
                <div className="flex gap-2">
                  {(['pessoa_fisica', 'pessoa_juridica'] as const).map(t => (
                    <button key={t} type="button" onClick={() => updateNovoCliente('tipo', t)} className={`flex-1 px-3 py-2 rounded-lg border text-xs font-body font-semibold transition-colors ${novoCliente.tipo === t ? 'bg-aletis-verde text-white border-aletis-verde' : 'bg-card text-[var(--text-soft)] border-aletis-borda hover:bg-aletis-bege/50'}`}>
                      {t === 'pessoa_fisica' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">CPF / CNPJ <span className="normal-case tracking-normal text-muted-foreground">(opcional)</span></label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.cpfCnpj} onChange={e => updateNovoCliente('cpfCnpj', maskCpfCnpj(e.target.value))} placeholder={novoCliente.tipo === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0001-00'} maxLength={18} className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Telefone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="tel" value={novoCliente.telefone} onChange={e => updateNovoCliente('telefone', maskPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">WhatsApp</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="tel" value={novoCliente.whatsapp} onChange={e => updateNovoCliente('whatsapp', maskPhone(e.target.value))} placeholder="(00) 00000-0000" maxLength={15} className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="email" value={novoCliente.email} onChange={e => updateNovoCliente('email', e.target.value)} placeholder="cliente@exemplo.com" className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-aletis-borda bg-white/80 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-display font-semibold text-foreground">Grupo familiar e pessoas vinculadas</h4>
                  <p className="text-xs text-muted-foreground">
                    Inclua cônjuge, filhos, sócios, avalistas, arrendadores ou pessoas que participam da operação. CPF/CNPJ não é obrigatório.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addGrupoFamiliarPessoa}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-aletis-verde/30 bg-aletis-verde/5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-aletis-verde/10"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Adicionar pessoa
                </button>
              </div>
              {novoCliente.grupoFamiliar.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed border-aletis-borda bg-aletis-bege/30 px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma pessoa vinculada ainda. Este bloco pode ser preenchido agora ou depois dentro do cliente.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {novoCliente.grupoFamiliar.map((pessoa, index) => (
                    <div key={pessoa.id} className="rounded-lg border border-aletis-borda bg-card p-3">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase text-[var(--text-soft)]">Pessoa vinculada {index + 1}</p>
                        <button
                          type="button"
                          onClick={() => removeGrupoFamiliarPessoa(pessoa.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700"
                          title="Remover pessoa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <input className="input-field py-2.5 text-sm" value={pessoa.nome} onChange={(e) => updateGrupoFamiliarPessoa(pessoa.id, 'nome', e.target.value)} placeholder="Nome completo" />
                        <input className="input-field py-2.5 text-sm" value={pessoa.parentesco} onChange={(e) => updateGrupoFamiliarPessoa(pessoa.id, 'parentesco', e.target.value)} placeholder="Parentesco ou vínculo" />
                        <input className="input-field py-2.5 text-sm" value={pessoa.papel} onChange={(e) => updateGrupoFamiliarPessoa(pessoa.id, 'papel', e.target.value)} placeholder="Papel: sócio, avalista, gestor..." />
                        <input className="input-field py-2.5 text-sm" value={pessoa.cpfCnpj} onChange={(e) => updateGrupoFamiliarPessoa(pessoa.id, 'cpfCnpj', maskCpfCnpj(e.target.value))} placeholder="CPF/CNPJ opcional" maxLength={18} />
                        <input className="input-field py-2.5 text-sm" value={pessoa.telefone} onChange={(e) => updateGrupoFamiliarPessoa(pessoa.id, 'telefone', maskPhone(e.target.value))} placeholder="Telefone/WhatsApp" maxLength={15} />
                        <input className="input-field py-2.5 text-sm" value={pessoa.email} onChange={(e) => updateGrupoFamiliarPessoa(pessoa.id, 'email', e.target.value)} placeholder="E-mail" />
                        <label className="inline-flex items-center gap-2 rounded-lg border border-aletis-borda px-3 py-2 text-xs font-semibold text-[var(--text-soft)]">
                          <input type="checkbox" checked={pessoa.atuaAtividade} onChange={(e) => updateGrupoFamiliarPessoa(pessoa.id, 'atuaAtividade', e.target.checked)} />
                          Atua na atividade rural/empresa
                        </label>
                        <input className="input-field py-2.5 text-sm" value={pessoa.observacoes} onChange={(e) => updateGrupoFamiliarPessoa(pessoa.id, 'observacoes', e.target.value)} placeholder="Observações relevantes" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── TAB: LOCALIZAÇÃO ── */}
        {novoClienteTab === 'localizacao' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">CEP</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.cep} onChange={e => updateNovoCliente('cep', maskCep(e.target.value))} placeholder="00000-000" maxLength={9} className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Cidade *</label>
                <div className="relative">
                  <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.cidade} onChange={e => updateNovoCliente('cidade', e.target.value)} placeholder="Ex: Toledo" className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">UF *</label>
                <input type="text" value={novoCliente.uf} onChange={e => updateNovoCliente('uf', e.target.value.toUpperCase())} placeholder="PR" maxLength={2} className="input-field py-2.5 text-sm w-full" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Endereço</label>
                <input type="text" value={novoCliente.endereco} onChange={e => updateNovoCliente('endereco', e.target.value)} placeholder="Rua, Avenida, Fazenda..." className="input-field py-2.5 text-sm w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Número</label>
                <input type="text" value={novoCliente.numero} onChange={e => updateNovoCliente('numero', e.target.value)} placeholder="S/N" className="input-field py-2.5 text-sm w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Complemento</label>
                <input type="text" value={novoCliente.complemento} onChange={e => updateNovoCliente('complemento', e.target.value)} placeholder="Sala, Galpão, Lote..." className="input-field py-2.5 text-sm w-full" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Bairro / Zona Rural</label>
                <input type="text" value={novoCliente.bairro} onChange={e => updateNovoCliente('bairro', e.target.value)} placeholder="Ex: Centro, Zona Rural, Gleba 1..." className="input-field py-2.5 text-sm w-full" />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── TAB: OPERAÇÃO RURAL ── */}
        {novoClienteTab === 'operacao' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Atividade Principal</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.atividade} onChange={e => updateNovoCliente('atividade', e.target.value)} placeholder="Ex: Produção de Grãos, Pecuária Leiteira, Agroindústria..." className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Área Total (ha)</label>
                <div className="relative">
                  <Sprout className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" inputMode="decimal" value={novoCliente.areaTotalHa} onChange={e => updateNovoCliente('areaTotalHa', e.target.value)} placeholder="Ex: 500" className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Código CAR (Cadastro Ambiental Rural)</label>
                <div className="relative">
                  <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.carCodigoImovel} onChange={e => updateNovoCliente('carCodigoImovel', e.target.value)} placeholder="MT-1234567-ABCDEF..." className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Culturas / Atividades</label>
                <div className="relative">
                  <Sprout className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.culturas} onChange={e => updateNovoCliente('culturas', e.target.value)} placeholder="Soja, Milho, Algodão, Pecuária (separadas por vírgula)" className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
            </div>

            <section className="border-t border-aletis-borda pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-display font-semibold text-foreground">
                    <Handshake className="h-4 w-4 text-aletis-dourado" />
                    Demandas iniciais
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Separe cada assunto ou objetivo. As propostas futuras serão organizadas dentro da demanda correspondente.</p>
                </div>
                <button type="button" onClick={addDemandaInicial} className={`${uiAction.secondary} shrink-0`}>
                  <Plus className="h-4 w-4" />
                  Adicionar demanda
                </button>
              </div>

              {novoClienteDemandas.length === 0 ? (
                <button
                  type="button"
                  onClick={addDemandaInicial}
                  className="mt-4 flex w-full items-center justify-center gap-2 border border-dashed border-aletis-borda bg-card px-4 py-5 text-sm font-semibold text-foreground transition-colors hover:border-aletis-verde/40 hover:bg-aletis-verde/5"
                >
                  <Plus className="h-4 w-4" />
                  Registrar a primeira demanda deste cliente
                </button>
              ) : (
                <div className="mt-4 space-y-3">
                  {novoClienteDemandas.map((demanda, index) => (
                    <div key={demanda.id} className="rounded-lg border border-aletis-borda bg-card p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase text-aletis-dourado">Demanda {String(index + 1).padStart(2, '0')}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Uma frente independente de trabalho e suas versões de proposta.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDemandaInicial(demanda.id)}
                          title="Remover demanda"
                          aria-label={`Remover demanda ${index + 1}`}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Título da demanda *</label>
                          <input value={demanda.titulo} onChange={(event) => updateDemandaInicial(demanda.id, 'titulo', event.target.value)} placeholder="Ex: Custeio da safra 2026/27" className="input-field w-full py-2.5 text-sm" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Categoria</label>
                          <select value={demanda.categoria} onChange={(event) => updateDemandaInicial(demanda.id, 'categoria', event.target.value)} className="input-field w-full bg-card py-2.5 text-sm">
                            <option value="credito">Crédito</option>
                            <option value="renegociacao">Renegociação</option>
                            <option value="juridico">Jurídico</option>
                            <option value="tributario">Tributário</option>
                            <option value="investimento">Investimento</option>
                            <option value="operacional">Operacional</option>
                            <option value="outro">Outro</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Assunto / finalidade</label>
                          <input value={demanda.assunto} onChange={(event) => updateDemandaInicial(demanda.id, 'assunto', event.target.value)} placeholder="Ex: Capital de giro, renegociação, investimento" className="input-field w-full py-2.5 text-sm" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Credor / instituição</label>
                          <input value={demanda.credor} onChange={(event) => updateDemandaInicial(demanda.id, 'credor', event.target.value)} placeholder="Ex: Banco do Brasil" className="input-field w-full py-2.5 text-sm" />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Valor pretendido (R$)</label>
                          <input inputMode="decimal" value={demanda.valorPretendido} onChange={(event) => updateDemandaInicial(demanda.id, 'valorPretendido', fmtCurrencyInput(event.target.value))} placeholder="R$ 0,00" className="input-field w-full py-2.5 text-sm" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Prioridade</label>
                            <select value={demanda.prioridade} onChange={(event) => updateDemandaInicial(demanda.id, 'prioridade', event.target.value)} className="input-field w-full bg-card py-2.5 text-sm">
                              <option value="baixa">Baixa</option>
                              <option value="normal">Normal</option>
                              <option value="alta">Alta</option>
                              <option value="urgente">Urgente</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Prazo alvo</label>
                            <input type="date" value={demanda.prazoAlvo} onChange={(event) => updateDemandaInicial(demanda.id, 'prazoAlvo', event.target.value)} className="input-field w-full py-2.5 text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Probabilidade</label>
                          <select value={demanda.probabilidade} onChange={(event) => updateDemandaInicial(demanda.id, 'probabilidade', event.target.value)} className="input-field w-full bg-card py-2.5 text-sm">
                            <option value="10">10% · Mapeamento</option>
                            <option value="25">25% · Qualificada</option>
                            <option value="50">50% · Em construção</option>
                            <option value="75">75% · Negociação</option>
                            <option value="90">90% · Aprovação</option>
                          </select>
                        </div>
                        <div className="md:col-span-2 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
                          <div>
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Próxima ação</label>
                            <input value={demanda.proximaAcao} onChange={(event) => updateDemandaInicial(demanda.id, 'proximaAcao', event.target.value)} placeholder="Ex: Solicitar extrato atualizado ao cliente" className="input-field w-full py-2.5 text-sm" />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Data da ação</label>
                            <input type="date" value={demanda.proximaAcaoEm} onChange={(event) => updateDemandaInicial(demanda.id, 'proximaAcaoEm', event.target.value)} className="input-field w-full py-2.5 text-sm" />
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Resultado esperado</label>
                          <input value={demanda.resultadoEsperado} onChange={(event) => updateDemandaInicial(demanda.id, 'resultadoEsperado', event.target.value)} placeholder="Ex: Aprovar limite de R$ 1,2 milhão até setembro" className="input-field w-full py-2.5 text-sm" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">Contexto da demanda</label>
                          <textarea value={demanda.descricao} onChange={(event) => updateDemandaInicial(demanda.id, 'descricao', event.target.value)} placeholder="Objetivo, particularidades, garantias, histórico e resultado esperado..." className="input-field min-h-[76px] w-full resize-none py-2.5 text-sm" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </motion.div>
        )}

        {/* ── TAB: FINANCEIRO ── */}
        {novoClienteTab === 'financeiro' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Credor Principal</label>
                <div className="relative">
                  <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.credor} onChange={e => updateNovoCliente('credor', e.target.value)} placeholder="Ex: Sicoob, Banco do Brasil, PGFN, Safra..." className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Modalidade do Crédito</label>
                <select value={novoCliente.modalidadeCredito} onChange={e => updateNovoCliente('modalidadeCredito', e.target.value)} className="input-field py-2.5 text-sm w-full bg-card">
                  <option value="">Selecionar...</option>
                  <option value="custeio_rural">Custeio Rural</option>
                  <option value="investimento_rural">Investimento Rural</option>
                  <option value="credito_pessoal">Crédito Pessoal</option>
                  <option value="capital_giro">Capital de Giro</option>
                  <option value="fornecedor_insumos">Fornecedor / Insumos</option>
                  <option value="cpr">CPR</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Dívida Total Estimada (R$)</label>
                <div className="relative">
                  <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" inputMode="decimal" value={novoCliente.valorTotalDivida} onChange={e => updateNovoCliente('valorTotalDivida', fmtCurrencyInput(e.target.value))} placeholder="R$ 0,00" className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Valor Total Pago (R$)</label>
                <div className="relative">
                  <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" inputMode="decimal" value={novoCliente.valorTotalPago} onChange={e => updateNovoCliente('valorTotalPago', fmtCurrencyInput(e.target.value))} placeholder="R$ 0,00" className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Observações Financeiras / Contexto da Dívida</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <textarea value={novoCliente.observacoes} onChange={e => updateNovoCliente('observacoes', e.target.value)} placeholder="Descreva brevemente a origem da dívida, garantias existentes, processos judiciais, etc." className="input-field pl-10 py-2.5 text-sm min-h-[96px] resize-none w-full" />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── TAB: CLASSIFICAÇÃO ── */}
        {novoClienteTab === 'classificacao' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Estágio no Pipeline</label>
                <select value={novoCliente.estagio} onChange={e => updateNovoCliente('estagio', e.target.value as Estagio)} className="input-field py-2.5 text-sm w-full bg-card">
                  {ALL_STAGES.map(s => <option key={s} value={s}>{STAGE_CONFIG[s]?.label || s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Consultor Responsável</label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.consultor} onChange={e => updateNovoCliente('consultor', e.target.value)} placeholder="Ex: Christian Kohler" className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Escritório responsável *</label>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select value={novoCliente.escritorio} onChange={e => updateNovoCliente('escritorio', e.target.value)} className="input-field w-full appearance-none bg-card py-2.5 pl-10 pr-8 text-sm" aria-required="true">
                    <option value="">Selecione o escritório</option>
                    {OFFICE_OPTIONS.map((office) => <option key={office.value} value={office.value}>{office.label}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Tags / Segmentos</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={novoCliente.tags} onChange={e => updateNovoCliente('tags', e.target.value)} placeholder="Ex: prospecto-frio, reativação, grande-porte, renegociação (separadas por vírgula)" className="input-field pl-10 py-2.5 text-sm w-full" />
                </div>
              </div>
            </div>
          </motion.div>
        )}

              {novoClienteTab === 'revisao' && (
                <motion.div key="revisao" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
                  {(intakeDocPreview?.conflitos || []).some((conflict) => !conflitosResolvidos.has(conflict.campo)) && (
                    <button
                      type="button"
                      onClick={() => { setNovoClienteTab('documentos'); setIntakeSourceMode('arquivos') }}
                      className="flex w-full items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left hover:bg-amber-100"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-amber-900">Existem divergências documentais para resolver</span>
                        <span className="mt-0.5 block text-[11px] text-amber-800">Volte ao dossiê e escolha qual informação deve permanecer no cadastro.</span>
                      </span>
                      <ChevronRight className="ml-auto mt-1 h-4 w-4 shrink-0 text-amber-700" />
                    </button>
                  )}

                  <NovoClienteReadinessPanel readiness={novoClienteReadiness} onNavigate={setNovoClienteTab} />

                  <div className="grid gap-4 xl:grid-cols-3">
                    <section className="rounded-lg border border-aletis-borda bg-card p-4">
                      <p className="text-[11px] font-bold uppercase text-aletis-dourado">Cliente</p>
                      <p className="mt-2 truncate text-base font-display font-semibold text-foreground">{novoCliente.nome || 'Nome pendente'}</p>
                      <dl className="mt-3 space-y-2 text-xs">
                        <ReviewRow label="Documento" value={novoCliente.cpfCnpj || 'Não informado'} />
                        <ReviewRow label="Contato" value={novoCliente.whatsapp || novoCliente.telefone || novoCliente.email || 'Não informado'} />
                        <ReviewRow label="Local" value={[novoCliente.cidade, novoCliente.uf].filter(Boolean).join('/') || 'Não informado'} />
                        <ReviewRow label="Vínculos" value={`${novoCliente.grupoFamiliar.length} pessoa(s)`} />
                      </dl>
                      <button type="button" onClick={() => setNovoClienteTab('identificacao')} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-foreground hover:underline">Revisar identificação <ChevronRight className="h-3.5 w-3.5" /></button>
                    </section>

                    <section className="rounded-lg border border-aletis-borda bg-card p-4">
                      <p className="text-[11px] font-bold uppercase text-aletis-dourado">Operação e financeiro</p>
                      <p className="mt-2 truncate text-base font-display font-semibold text-foreground">{novoCliente.atividade || 'Atividade pendente'}</p>
                      <dl className="mt-3 space-y-2 text-xs">
                        <ReviewRow label="Área" value={novoCliente.areaTotalHa ? `${novoCliente.areaTotalHa} ha` : 'Não informada'} />
                        <ReviewRow label="Culturas" value={novoCliente.culturas || 'Não informadas'} />
                        <ReviewRow label="Credor" value={novoCliente.credor || 'Não informado'} />
                        <ReviewRow label="Dívida" value={novoCliente.valorTotalDivida ? `R$ ${novoCliente.valorTotalDivida}` : 'Não informada'} />
                        <ReviewRow label="Demandas" value={`${novoClienteDemandas.length} frente(s)`} />
                      </dl>
                      <button type="button" onClick={() => setNovoClienteTab('financeiro')} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-foreground hover:underline">Revisar financeiro <ChevronRight className="h-3.5 w-3.5" /></button>
                    </section>

                    <section className="rounded-lg border border-aletis-borda bg-card p-4">
                      <p className="text-[11px] font-bold uppercase text-aletis-dourado">Documentos e destino</p>
                      <p className="mt-2 text-base font-display font-semibold text-foreground">{novoClienteAnexos.length} arquivo(s)</p>
                      <dl className="mt-3 space-y-2 text-xs">
                        <ReviewRow label="Escritório" value={novoCliente.escritorio ? officeLabel(novoCliente.escritorio) : 'Pendente'} />
                        <ReviewRow label="Lidos" value={`${novoClienteAnexos.filter((anexo) => anexo.status === 'pronto' || anexo.status === 'enviado').length}/${novoClienteAnexos.length}`} />
                        <ReviewRow label="Propostas" value={`${novoClienteReadiness.propostaDetectada ? 'Detectada' : 'Nenhuma'}`} />
                        <ReviewRow label="Contrato" value={novoClienteReadiness.contratoDetectado ? 'Detectado' : 'Nenhum'} />
                        <ReviewRow label="Confiança IA" value={novoClienteReadiness.confianca ? `${Math.round(novoClienteReadiness.confianca * 100)}%` : 'Sem leitura'} />
                      </dl>
                      <button type="button" onClick={() => { setNovoClienteTab('documentos'); setIntakeSourceMode('arquivos') }} className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-foreground hover:underline">Revisar documentos <ChevronRight className="h-3.5 w-3.5" /></button>
                    </section>
                  </div>

                  <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${novoClienteReadyToCreate ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    {novoClienteReadyToCreate ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}
                    <div>
                      <p className={`text-sm font-bold ${novoClienteReadyToCreate ? 'text-emerald-900' : 'text-amber-900'}`}>
                        {novoClienteReadyToCreate
                          ? 'Cadastro pronto para ser criado'
                          : novoClienteUnresolvedConflicts > 0
                            ? 'Resolva as divergências documentais antes de criar'
                            : 'Complete os dados essenciais antes de criar'}
                      </p>
                      <p className={`mt-0.5 text-xs ${novoClienteReadyToCreate ? 'text-emerald-800' : 'text-amber-800'}`}>
                        {novoClienteAnexos.length
                          ? 'Ao confirmar, o cliente será criado e os documentos serão enviados aos módulos correspondentes.'
                          : 'Ao confirmar, o cliente será incluído no pipeline com os dados revisados acima.'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

            </div>
          </main>
        </div>

      </MotionDialog>
        )}
      </AnimatePresence>

      {/* ── Próxima Ação / Contato ── */}
      <AnimatePresence>
        {!!acaoCliente && (
      <MotionDialog
        key="acao-cliente"
        onClose={closeAcaoModal}
        title={quickActionMode === 'contato' ? 'Registrar contato' : 'Próxima ação'}
        subtitle={acaoCliente?.nome}
        icon={quickActionMode === 'contato' ? <Phone size={20} /> : <CalendarPlus size={20} />}
        size="md"
        collapsible
        closeOnBackdrop={!savingAcao}
        swipeToDismiss={!savingAcao}
        bodyClassName="bg-aletis-cream-papel/35"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeAcaoModal}
              disabled={savingAcao}
              className={uiAction.secondary}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={quickActionMode === 'contato' ? handleSaveContato : handleSaveProximaAcao}
              disabled={savingAcao}
              className={uiAction.primary}
            >
              {savingAcao && <Loader2 className="h-4 w-4 animate-spin" />}
              {quickActionMode === 'contato' ? 'Registrar contato' : 'Salvar ação'}
            </button>
          </div>
        )}
      >
        {quickActionMode === 'proximaAcao' ? (
          <div className="space-y-4 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
            <div>
              <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Data</label>
              <input type="date" value={acaoForm.data} onChange={e => setAcaoForm(prev => ({...prev, data: e.target.value}))} className="input-field py-2.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">O que deve ser feito</label>
              <textarea value={acaoForm.descricao} onChange={e => setAcaoForm(prev => ({...prev, descricao: e.target.value}))} placeholder="Ex: ligar para cliente, pedir documentos..." className="input-field py-2.5 text-sm min-h-[96px] resize-none w-full" />
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
            <div>
              <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Canal</label>
              <select value={acaoForm.canal} onChange={e => setAcaoForm(prev => ({...prev, canal: e.target.value}))} className="input-field py-2.5 text-sm w-full">
                <option value="telefone">Telefone</option><option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option><option value="reuniao">Reunião</option>
                <option value="visita">Visita</option><option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Resumo do contato</label>
              <textarea value={acaoForm.descricao} onChange={e => setAcaoForm(prev => ({...prev, descricao: e.target.value}))} placeholder="Ex: cliente pediu simulação com carência..." className="input-field py-2.5 text-sm min-h-[86px] resize-none w-full" />
            </div>
            <div>
              <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Resultado / detalhe</label>
              <input type="text" value={acaoForm.resultado} onChange={e => setAcaoForm(prev => ({...prev, resultado: e.target.value}))} placeholder="Ex: retornará com documentos até sexta" className="input-field py-2.5 text-sm w-full" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Próx. data</label>
                <input type="date" value={acaoForm.proximaData} onChange={e => setAcaoForm(prev => ({...prev, proximaData: e.target.value}))} className="input-field py-2.5 text-sm w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Próxima ação</label>
                <input type="text" value={acaoForm.proximaDescricao} onChange={e => setAcaoForm(prev => ({...prev, proximaDescricao: e.target.value}))} placeholder="Opcional" className="input-field py-2.5 text-sm w-full" />
              </div>
            </div>
          </div>
        )}

      </MotionDialog>
        )}
      </AnimatePresence>

      {/* ── Mover Estágio ── */}
      <AnimatePresence>
        {!!stageMove && (
      <MotionDialog
        key="stage-move"
        onClose={() => { if (!savingStage) setStageMove(null) }}
        title="Mover estágio"
        subtitle={stageMove?.cliente.nome}
        icon={<ArrowRightLeft size={20} />}
        size="md"
        collapsible
        closeOnBackdrop={!savingStage}
        swipeToDismiss={!savingStage}
        bodyClassName="bg-aletis-cream-papel/35"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setStageMove(null)}
              disabled={savingStage}
              className={uiAction.secondary}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveStageMove}
              disabled={savingStage}
              className={uiAction.primary}
            >
              {savingStage && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar movimento
            </button>
          </div>
        )}
      >
        <div className="space-y-4 rounded-lg border border-aletis-borda bg-card p-4 shadow-none">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-aletis-borda p-3">
              <p className="text-[11px] uppercase text-muted-foreground font-semibold mb-1">Atual</p>
              {stageMove && <StageBadge estagio={stageMove.cliente.estagio} />}
            </div>
            <div className="rounded-lg border border-aletis-verde/30 bg-aletis-verde/5 p-3">
              <p className="text-[11px] uppercase text-muted-foreground font-semibold mb-1">Novo</p>
              {stageMove && <StageBadge estagio={stageMove.estagio} />}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-body font-semibold uppercase text-muted-foreground mb-1.5">Motivo</label>
            <textarea value={stageMotivo} onChange={e => setStageMotivo(e.target.value)} placeholder="Ex: cliente aceitou premissas da proposta..." className="input-field py-2.5 text-sm min-h-[88px] resize-none w-full" />
          </div>
        </div>

      </MotionDialog>
        )}
      </AnimatePresence>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
