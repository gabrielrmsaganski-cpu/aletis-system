import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  ClienteDemanda,
  ClienteDemandaCategoria,
  ClienteDemandaEventoTipo,
  ClienteDemandaPrioridade,
  ClienteDemandaStatus,
} from '@aletis/shared-types'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Plus,
  Save,
  Search,
  Star,
  Target,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'

import { apiFetch, apiFetchFull } from '../../hooks/useApi'
import { MotionDialog } from '../ui'
import { uiAction } from '../ui/foundation'

type DemandStatus = ClienteDemandaStatus
type DemandPriority = ClienteDemandaPrioridade
type DemandCategory = ClienteDemandaCategoria

interface DemandProposal {
  id: string
  demandaId?: string
  demandaTitulo?: string
  versaoDemanda?: number
  titulo?: string
  credor?: string
  tipo?: string
  status?: string
  valorDivida?: string
  valorProposta?: string
  economiaPotencial?: string
  descontoPercentual?: string
  variacaoVersaoAnterior?: string
  principal: boolean
  dataCriacao?: string
  ultimaAtualizacao?: string
}

export interface ClientDemand extends ClienteDemanda {
  codigo: string
  atrasada: boolean
  proximaAcaoAtrasada: boolean
  checklistResumo: { total: number; concluidos: number; pendentes: number; percentual: number }
  ultimaAtividade?: ClienteDemanda['eventos'][number]
  totalPropostas: number
  propostasAtivas: number
  propostas: DemandProposal[]
}

interface DemandSummary {
  total: number
  ativas: number
  atrasadas: number
  urgentes: number
  semResponsavel: number
  proximasAcoesHoje: number
  checklistPendentes: number
  totalPropostas: number
  propostasSemDemanda?: number
  valorPretendido: string
}

interface ClientDocument {
  id: string
  nome: string
  categoria?: string
  grupoDocumento?: string
  enviadoEm?: string
  downloadUrl?: string
}

interface Props {
  clienteId: string
  clienteNome: string
  onOpenProposals: (demand: Pick<ClientDemand, 'id' | 'titulo'>) => void
  onCountChange?: (count: number) => void
  onChange?: (demands: ClientDemand[]) => void
}

const STATUS: Array<{ value: DemandStatus; label: string }> = [
  { value: 'nova', label: 'Nova' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'em_proposta', label: 'Em proposta' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'aprovada', label: 'Aprovada' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'suspensa', label: 'Suspensa' },
  { value: 'cancelada', label: 'Cancelada' },
]

const PRIORITY: Array<{ value: DemandPriority; label: string }> = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Alta' },
  { value: 'urgente', label: 'Urgente' },
]

const CATEGORIES: Array<{ value: DemandCategory; label: string }> = [
  { value: 'credito', label: 'Crédito' },
  { value: 'renegociacao', label: 'Renegociação' },
  { value: 'juridico', label: 'Jurídico' },
  { value: 'tributario', label: 'Tributário' },
  { value: 'investimento', label: 'Investimento' },
  { value: 'operacional', label: 'Operacional' },
  { value: 'outro', label: 'Outro' },
]

const EVENT_TYPES: Array<{ value: ClienteDemandaEventoTipo; label: string }> = [
  { value: 'nota', label: 'Nota' },
  { value: 'contato', label: 'Contato com cliente' },
  { value: 'tarefa', label: 'Tarefa executada' },
  { value: 'documento', label: 'Documento' },
  { value: 'proposta', label: 'Proposta' },
]

interface DemandForm {
  titulo: string
  assunto: string
  descricao: string
  categoria: DemandCategory
  status: DemandStatus
  prioridade: DemandPriority
  responsavel: string
  credor: string
  valorPretendido: string
  prazoAlvo: string
  proximaAcao: string
  proximaAcaoEm: string
  probabilidade: number
  resultadoEsperado: string
  tags: string
  documentoIds: string[]
}

const EMPTY_FORM: DemandForm = {
  titulo: '',
  assunto: '',
  descricao: '',
  categoria: 'outro',
  status: 'nova',
  prioridade: 'normal',
  responsavel: '',
  credor: '',
  valorPretendido: '',
  prazoAlvo: '',
  proximaAcao: '',
  proximaAcaoEm: '',
  probabilidade: 10,
  resultadoEsperado: '',
  tags: '',
  documentoIds: [],
}

type DemandFilter = 'ativas' | 'atrasadas' | 'todas' | 'concluidas'

export default function ClienteDemandasTab({ clienteId, clienteNome, onOpenProposals, onCountChange, onChange }: Props) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDemandId = searchParams.get('demanda')?.trim() || null
  const [demands, setDemands] = useState<ClientDemand[]>([])
  const [documents, setDocuments] = useState<ClientDocument[]>([])
  const [summary, setSummary] = useState<DemandSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const reloadController = useRef<AbortController | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<'create' | 'edit' | 'activity' | null>(null)
  const [form, setForm] = useState<DemandForm>(EMPTY_FORM)
  const [filter, setFilter] = useState<DemandFilter>(requestedDemandId ? 'todas' : 'ativas')
  const [search, setSearch] = useState('')
  const [checklistTitle, setChecklistTitle] = useState('')
  const [activityForm, setActivityForm] = useState<{ tipo: ClienteDemandaEventoTipo; titulo: string; descricao: string }>({
    tipo: 'nota', titulo: '', descricao: '',
  })

  function selectDemand(id: string | null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (id) next.set('demanda', id)
      else next.delete('demanda')
      return next
    }, { replace: true })
  }

  async function reload(preferredId?: string) {
    reloadController.current?.abort()
    const controller = new AbortController()
    reloadController.current = controller
    setLoading(true)
    setError(null)
    try {
      const response = await apiFetchFull<{ success: boolean; data: ClientDemand[]; resumo: DemandSummary }>(
        `/clientes/${encodeURIComponent(clienteId)}/demandas`,
        { signal: controller.signal },
      )
      if (controller.signal.aborted) return
      const next = Array.isArray(response.data) ? response.data : []
      setDemands(next)
      setSummary(response.resumo)
      onCountChange?.(next.length)
      onChange?.(next)
      if (preferredId && next.some((item) => item.id === preferredId)) selectDemand(preferredId)
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    setDemands([])
    setSummary(null)
    setModal(null)
    setDocuments([])
    setFilter(requestedDemandId ? 'todas' : 'ativas')
    setSearch('')
    void reload()
    return () => reloadController.current?.abort()
  }, [clienteId])

  useEffect(() => {
    const controller = new AbortController()
    apiFetch<ClientDocument[]>(`/clientes/${encodeURIComponent(clienteId)}/documentos`, { signal: controller.signal })
      .then((items) => { if (!controller.signal.aborted) setDocuments(Array.isArray(items) ? items : []) })
      .catch(() => { if (!controller.signal.aborted) setDocuments([]) })
    return () => controller.abort()
  }, [clienteId])

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return demands.filter((item) => {
      if (filter === 'concluidas' && !['concluida', 'cancelada'].includes(item.status)) return false
      if (filter === 'ativas' && ['concluida', 'cancelada'].includes(item.status)) return false
      if (filter === 'atrasadas' && !item.atrasada && !item.proximaAcaoAtrasada) return false
      if (!query) return true
      return [item.codigo, item.titulo, item.assunto, item.credor, item.responsavel, ...item.tags]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(query))
    })
  }, [demands, filter, search])
  // Um link desconhecido nunca abre silenciosamente outra demanda.
  const selected = requestedDemandId ? demands.find((item) => item.id === requestedDemandId) ?? null : visible[0] ?? null
  const selectedId = selected?.id ?? null
  const linkedDemandMissing = !loading && !error && requestedDemandId && !selected
  const documentsById = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents])

  function openCreate() {
    setForm(EMPTY_FORM)
    setModal('create')
  }

  function openEdit() {
    if (!selected) return
    setForm({
      titulo: selected.titulo,
      assunto: selected.assunto,
      descricao: selected.descricao || '',
      categoria: selected.categoria,
      status: selected.status,
      prioridade: selected.prioridade,
      responsavel: selected.responsavel || '',
      credor: selected.credor || '',
      valorPretendido: selected.valorPretendido || '',
      prazoAlvo: selected.prazoAlvo || '',
      proximaAcao: selected.proximaAcao || '',
      proximaAcaoEm: selected.proximaAcaoEm || '',
      probabilidade: selected.probabilidade,
      resultadoEsperado: selected.resultadoEsperado || '',
      tags: selected.tags.join(', '),
      documentoIds: selected.documentoIds,
    })
    setModal('edit')
  }

  async function submit() {
    if (!form.titulo.trim()) {
      setError('Informe o título da demanda.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = { ...form, tags: form.tags.split(',').map((item) => item.trim()).filter(Boolean) }
      const saved = modal === 'edit' && selected
        ? await apiFetch<ClientDemand>(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiFetch<ClientDemand>(`/clientes/${encodeURIComponent(clienteId)}/demandas`, { method: 'POST', body: JSON.stringify(payload) })
      setModal(null)
      await reload(saved.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function patchDemand(patch: Record<string, unknown>) {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      })
      await reload(selected.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function registerActivity() {
    if (!selected || !activityForm.titulo.trim()) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}/eventos`, {
        method: 'POST', body: JSON.stringify(activityForm),
      })
      setActivityForm({ tipo: 'nota', titulo: '', descricao: '' })
      setModal(null)
      await reload(selected.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function completeNextAction() {
    if (!selected?.proximaAcao) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}/eventos`, {
        method: 'POST',
        body: JSON.stringify({ tipo: 'tarefa', titulo: `Concluída: ${selected.proximaAcao}` }),
      })
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}`, {
        method: 'PATCH', body: JSON.stringify({ proximaAcao: '', proximaAcaoEm: '' }),
      })
      await reload(selected.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function addChecklistItem() {
    if (!selected || !checklistTitle.trim()) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}/checklist`, {
        method: 'POST', body: JSON.stringify({ titulo: checklistTitle.trim() }),
      })
      setChecklistTitle('')
      await reload(selected.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function updateChecklistItem(itemId: string, patch: Record<string, unknown>) {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}/checklist/${encodeURIComponent(itemId)}`, {
        method: 'PATCH', body: JSON.stringify(patch),
      })
      await reload(selected.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function removeChecklistItem(itemId: string) {
    if (!selected) return
    setSaving(true)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}/checklist/${encodeURIComponent(itemId)}`, { method: 'DELETE' })
      await reload(selected.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function setPrimaryProposal(proposalId: string | null) {
    if (!selected) return
    setSaving(true)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}/proposta-principal`, {
        method: 'POST', body: JSON.stringify({ propostaId: proposalId }),
      })
      await reload(selected.id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function moveProposal(proposalId: string, demandId: string) {
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(demandId)}/propostas/${encodeURIComponent(proposalId)}`, { method: 'POST' })
      await reload(demandId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function removeSelected() {
    if (!selected || selected.propostaIds.length > 0) return
    if (!confirm(`Excluir a demanda "${selected.titulo}"?`)) return
    setSaving(true)
    try {
      await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/${encodeURIComponent(selected.id)}`, { method: 'DELETE' })
      selectDemand(null)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading && demands.length === 0) {
    return <div className="flex min-h-72 items-center justify-center border border-aletis-borda bg-card"><Loader2 className="h-5 w-5 animate-spin text-foreground" /></div>
  }

  return (
    <div className="min-w-0 overflow-hidden border border-aletis-borda bg-card">
      {linkedDemandMissing && <div role="status" className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="flex-1">A demanda deste link não foi encontrada nesta ficha.</span><button type="button" onClick={() => selectDemand(null)} className="font-semibold underline">Ver demandas disponíveis</button></div>}
      {selected && !visible.some((item) => item.id === selected.id) && <div role="status" className="flex flex-wrap items-center gap-2 border-b border-aletis-borda bg-aletis-bege px-4 py-2 text-xs text-[var(--text-soft)]"><span className="flex-1">A demanda aberta pelo link está fora dos filtros atuais.</span><button type="button" onClick={() => { setFilter('todas'); setSearch('') }} className="font-semibold underline">Mostrar na lista</button></div>}
      <header className="border-b border-aletis-borda px-4 py-4 lg:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-aletis-gold-escuro">central de demandas</p>
            <h3 className="mt-1 font-display text-lg font-bold text-foreground">Operação de {clienteNome}</h3>
            <p className="mt-1 text-xs text-[var(--text-soft)]">Assuntos, próximos passos, documentos e versões comerciais em uma única linha de trabalho.</p>
          </div>
          <button type="button" onClick={openCreate} className={uiAction.primary}><Plus className="h-4 w-4" /> Nova demanda</button>
        </div>
        <div className="mt-4 grid grid-cols-2 border border-aletis-borda sm:grid-cols-3 xl:grid-cols-6">
          <SummaryCell label="Demandas ativas" value={String(summary?.ativas ?? '—')} />
          <SummaryCell label="Com atraso" value={String(summary?.atrasadas ?? '—')} tone={(summary?.atrasadas ?? 0) > 0 ? 'danger' : undefined} />
          <SummaryCell label="Ações hoje" value={String(summary?.proximasAcoesHoje ?? '—')} />
          <SummaryCell label="Pendências" value={String(summary?.checklistPendentes ?? '—')} />
          <SummaryCell label="Propostas" value={String(summary?.totalPropostas ?? '—')} />
          <SummaryCell label="Valor em pauta" value={summary ? formatBRL(summary.valorPretendido) : '—'} />
        </div>
      </header>

      {error && <div role="alert" className="flex flex-wrap items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{error}</span><button type="button" disabled={loading} onClick={() => void reload()} className="text-xs font-semibold underline">Tentar novamente</button></div>}
      {(summary?.propostasSemDemanda ?? 0) > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-aletis-borda bg-muted px-4 py-3 text-xs text-[var(--text-soft)]">
        <span>{summary!.propostasSemDemanda} proposta(s) ainda sem demanda vinculada.</span>
        <button type="button" disabled={saving} className={uiAction.secondary} onClick={async () => {
          setSaving(true)
          setError(null)
          try { await apiFetch(`/clientes/${encodeURIComponent(clienteId)}/demandas/reconciliar`, { method: 'POST' }); await reload() }
          catch (err) { setError((err as Error).message) }
          finally { setSaving(false) }
        }}>Organizar propostas existentes</button>
      </div>}

      <div className="grid min-h-[650px] grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-aletis-borda bg-aletis-cream-papel/35 lg:border-b-0 lg:border-r">
          <div className="border-b border-aletis-borda p-2.5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(event) => { setSearch(event.target.value); selectDemand(null) }} className={`${inputClass} h-9 py-1.5 pl-8 text-xs`} placeholder="Buscar demanda, credor ou responsável" />
            </label>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {(['ativas', 'atrasadas', 'todas', 'concluidas'] as const).map((item) => (
                <button key={item} type="button" onClick={() => { setFilter(item); selectDemand(null) }} className={`h-8 min-w-0 px-1 text-[11px] font-semibold ${filter === item ? 'bg-aletis-verde text-white' : 'bg-card text-[var(--text-soft)] hover:bg-aletis-bege'}`}>
                  {item === 'ativas' ? 'Ativas' : item === 'atrasadas' ? 'Atrasos' : item === 'todas' ? 'Todas' : 'Encerradas'}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto lg:max-h-[850px]">
            {visible.map((demand) => (
              <button key={demand.id} type="button" aria-pressed={selectedId === demand.id} onClick={() => selectDemand(demand.id)} className={`w-full border-b border-aletis-borda px-4 py-3 text-left transition ${selectedId === demand.id ? 'bg-card shadow-[inset_3px_0_0_#1f4d37]' : 'hover:bg-white/75'}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-muted-foreground">{demand.codigo}</span>
                  <DemandStatus status={demand.status} />
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">{demand.titulo}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{demand.credor || categoryLabel(demand.categoria)}</p>
                {demand.proximaAcao && (
                  <div className={`mt-2 flex items-center gap-1.5 text-[11px] ${demand.proximaAcaoAtrasada ? 'font-semibold text-red-700' : 'text-[var(--text-soft)]'}`}>
                    <Clock3 className="h-3 w-3 shrink-0" /><span className="truncate">{demand.proximaAcao}</span><span className="shrink-0">{compactDate(demand.proximaAcaoEm)}</span>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--text-soft)]">
                  <span>{demand.totalPropostas} proposta(s) · {demand.checklistResumo.pendentes} pendência(s)</span>
                  <Priority value={demand.prioridade} />
                </div>
                <div className="mt-2 h-1 bg-aletis-borda/60"><span className="block h-full bg-aletis-verde" style={{ width: `${demand.probabilidade}%` }} /></div>
              </button>
            ))}
            {visible.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">Nenhuma demanda corresponde ao filtro.</p>}
          </div>
        </aside>

        <main className="min-w-0">
          {!selected ? (
            <div className="flex min-h-[650px] flex-col items-center justify-center px-6 text-center">
              <BriefcaseBusiness className="h-9 w-9 text-aletis-grafite-claro/60" />
              <p className="mt-3 text-sm font-semibold text-foreground">{error ? 'Não foi possível carregar as demandas' : linkedDemandMissing ? 'Selecione uma demanda disponível' : demands.length ? 'Nenhuma demanda neste filtro' : 'Crie a primeira demanda do cliente'}</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">{error ? 'Tente consultar novamente para ver os próximos passos deste cliente.' : demands.length ? 'Use a lista ao lado ou ajuste os filtros para continuar.' : 'Cada assunto terá sua própria execução, documentos, timeline e histórico de propostas.'}</p>
              {!error && !demands.length && !linkedDemandMissing && <button type="button" onClick={openCreate} className={`${uiAction.primary} mt-4`}><Plus className="h-4 w-4" /> Nova demanda</button>}
            </div>
          ) : (
            <div className="min-w-0">
              <div className="border-b border-aletis-borda px-4 py-4 lg:px-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground">{selected.codigo}</span>
                      <DemandStatus status={selected.status} />
                      <Priority value={selected.prioridade} />
                      <span className="bg-aletis-bege px-2 py-0.5 text-[11px] font-bold uppercase text-[var(--text-soft)]">{categoryLabel(selected.categoria)}</span>
                      {(selected.atrasada || selected.proximaAcaoAtrasada) && <span className="inline-flex items-center gap-1 bg-red-100 px-2 py-0.5 text-[11px] font-bold uppercase text-red-800"><AlertTriangle className="h-3 w-3" /> Atenção</span>}
                    </div>
                    <h3 className="mt-2 font-display text-xl font-bold leading-tight text-foreground">{selected.titulo}</h3>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-soft)]">{selected.descricao || 'Sem descrição operacional.'}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => setModal('activity')} className={uiAction.secondary}><MessageSquarePlus className="h-4 w-4" /> Atividade</button>
                    <button type="button" onClick={openEdit} className={uiAction.secondary}><Pencil className="h-4 w-4" /> Editar</button>
                    <button type="button" onClick={() => onOpenProposals(selected)} className={uiAction.primary}><Plus className="h-4 w-4" /> Proposta</button>
                  </div>
                </div>
              </div>

              <div className="grid border-b border-aletis-borda sm:grid-cols-2 xl:grid-cols-5">
                <DetailCell icon={CircleDollarSign} label="Valor pretendido" value={formatBRL(selected.valorPretendido)} />
                <DetailCell icon={UserRound} label="Responsável" value={selected.responsavel || 'Não atribuído'} attention={!selected.responsavel} />
                <DetailCell icon={CalendarClock} label="Prazo-alvo" value={formatDate(selected.prazoAlvo)} attention={selected.atrasada} />
                <DetailCell icon={Target} label="Probabilidade" value={`${selected.probabilidade}%`} />
                <DetailCell icon={FileText} label="Propostas" value={`${selected.totalPropostas} total · ${selected.propostasAtivas} ativa(s)`} />
              </div>

              <section className="grid border-b border-aletis-borda xl:grid-cols-2">
                <div className="border-b border-aletis-borda px-4 py-4 xl:border-b-0 xl:border-r lg:px-5">
                  <SectionHeading eyebrow="execução" title="Próxima ação" trailing={selected.proximaAcaoEm ? formatDate(selected.proximaAcaoEm) : undefined} />
                  {selected.proximaAcao ? (
                    <div className={`mt-3 border-l-4 px-3 py-3 ${selected.proximaAcaoAtrasada ? 'border-red-600 bg-red-50' : 'border-aletis-verde bg-aletis-cream-papel/45'}`}>
                      <p className="text-sm font-semibold text-foreground">{selected.proximaAcao}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={saving} onClick={() => void completeNextAction()} className={uiAction.primary}><Check className="h-4 w-4" /> Concluir</button>
                        <button type="button" onClick={openEdit} className={uiAction.secondary}><CalendarClock className="h-4 w-4" /> Reprogramar</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={openEdit} className="mt-3 flex w-full items-center justify-between border border-dashed border-aletis-borda px-3 py-4 text-left hover:bg-aletis-bege/35">
                      <span><strong className="block text-xs text-foreground">Nenhuma próxima ação definida</strong><span className="mt-1 block text-[11px] text-muted-foreground">Toda demanda ativa deve indicar o próximo movimento.</span></span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-foreground" />
                    </button>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <DemandField label="Atualizar etapa">
                      <select value={selected.status} disabled={saving} onChange={(event) => void patchDemand({ status: event.target.value })} className={`${inputClass} h-10 py-1.5`}>{STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                    </DemandField>
                    <div>
                      <p className="text-[11px] font-semibold uppercase text-muted-foreground">Resultado esperado</p>
                      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-soft)]">{selected.resultadoEsperado || 'Ainda não definido.'}</p>
                    </div>
                  </div>
                </div>

                <div className="px-4 py-4 lg:px-5">
                  <SectionHeading eyebrow="controle" title="Checklist da demanda" trailing={`${selected.checklistResumo.concluidos}/${selected.checklistResumo.total}`} />
                  <div className="mt-3 h-1.5 bg-aletis-borda/60"><span className="block h-full bg-aletis-verde transition-all" style={{ width: `${selected.checklistResumo.percentual}%` }} /></div>
                  <div className="mt-3 max-h-56 overflow-y-auto border-y border-aletis-borda/70">
                    {selected.checklist.map((item) => (
                      <div key={item.id} className="group flex items-start gap-2 border-b border-aletis-borda/60 py-2.5 last:border-0">
                        <button type="button" disabled={saving} onClick={() => void updateChecklistItem(item.id, { concluido: !item.concluido })} className="mt-0.5 shrink-0 text-foreground" title={item.concluido ? 'Reabrir item' : 'Concluir item'}>
                          {item.concluido ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-medium ${item.concluido ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item.titulo}</p>
                          {(item.prazo || item.responsavel) && <p className="mt-0.5 text-[11px] text-muted-foreground">{[item.responsavel, compactDate(item.prazo)].filter(Boolean).join(' · ')}</p>}
                        </div>
                        <button type="button" disabled={saving} onClick={() => void removeChecklistItem(item.id)} className="shrink-0 p-1 text-muted-foreground opacity-70 hover:text-red-700 sm:opacity-0 sm:group-hover:opacity-100" title="Remover item"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                    {selected.checklist.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Nenhum item adicionado.</p>}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input value={checklistTitle} onChange={(event) => setChecklistTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void addChecklistItem() }} className={`${inputClass} h-9 py-1.5 text-xs`} placeholder="Adicionar pendência..." />
                    <button type="button" disabled={saving || !checklistTitle.trim()} onClick={() => void addChecklistItem()} className={uiAction.iconButton} title="Adicionar ao checklist" aria-label="Adicionar ao checklist"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
              </section>

              <section className="border-b border-aletis-borda px-4 py-4 lg:px-5">
                <SectionHeading eyebrow="comparativo comercial" title="Versões de proposta" trailing={`${selected.propostas.length} registro(s)`} />
                <div className="mt-3 overflow-x-auto border border-aletis-borda">
                  {selected.propostas.length > 0 ? (
                    <table className="ui-table w-full min-w-[1120px] text-xs">
                      <thead className="bg-aletis-cream-papel/70 text-[11px] uppercase text-muted-foreground">
                        <tr><th className="w-12 px-2 py-2 text-center">Principal</th><th className="px-3 py-2 text-left">Versão</th><th className="px-3 py-2 text-left">Proposta</th><th className="px-3 py-2 text-left">Credor</th><th className="px-3 py-2 text-right">Dívida</th><th className="px-3 py-2 text-right">Oferta</th><th className="px-3 py-2 text-right">Economia</th><th className="px-3 py-2 text-right">Desconto</th><th className="px-3 py-2 text-right">Vs. anterior</th><th className="px-3 py-2 text-center">Status</th><th className="px-3 py-2 text-left">Demanda</th></tr>
                      </thead>
                      <tbody>{selected.propostas.map((proposal) => (
                        <tr key={proposal.id} className={proposal.principal ? 'border-t border-aletis-gold bg-amber-50/35' : 'border-t border-aletis-borda/70'}>
                          <td className="px-2 py-3 text-center"><button type="button" disabled={saving} onClick={() => void setPrimaryProposal(proposal.principal ? null : proposal.id)} className={proposal.principal ? 'text-aletis-gold-escuro' : 'text-muted-foreground hover:text-aletis-gold-escuro'} title={proposal.principal ? 'Remover como principal' : 'Definir como principal'}><Star className={`h-4 w-4 ${proposal.principal ? 'fill-current' : ''}`} /></button></td>
                          <td className="px-3 py-3 font-mono text-[var(--text-soft)]">V{proposal.versaoDemanda || 1}</td>
                          <td className="max-w-[250px] px-3 py-3"><p className="truncate font-semibold text-foreground">{proposal.titulo || proposal.id}</p><p className="text-[11px] text-muted-foreground">{formatDate(proposal.ultimaAtualizacao || proposal.dataCriacao)}</p></td>
                          <td className="px-3 py-3 text-[var(--text-soft)]">{proposal.credor || 'A definir'}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-[var(--text-soft)]">{formatBRL(proposal.valorDivida)}</td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-foreground">{formatBRL(proposal.valorProposta)}</td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">{formatBRL(proposal.economiaPotencial, true)}</td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatPercent(proposal.descontoPercentual)}</td>
                          <td className={`px-3 py-3 text-right font-semibold tabular-nums ${Number(proposal.variacaoVersaoAnterior) > 0 ? 'text-emerald-700' : Number(proposal.variacaoVersaoAnterior) < 0 ? 'text-red-700' : 'text-muted-foreground'}`}>{formatSignedBRL(proposal.variacaoVersaoAnterior)}</td>
                          <td className="px-3 py-3 text-center"><span className="bg-aletis-bege px-2 py-1 text-[11px] font-semibold uppercase">{proposal.status || 'rascunho'}</span></td>
                          <td className="px-3 py-3"><select aria-label={`Mover ${proposal.titulo || proposal.id}`} value={selected.id} disabled={saving} onChange={(event) => void moveProposal(proposal.id, event.target.value)} className="h-8 w-full border border-aletis-borda bg-card px-2 text-[11px] outline-none focus:border-aletis-verde">{demands.map((demand) => <option key={demand.id} value={demand.id}>{demand.codigo} · {demand.titulo}</option>)}</select></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  ) : (
                    <button type="button" onClick={() => onOpenProposals(selected)} className="flex w-full items-center justify-between gap-4 px-4 py-6 text-left hover:bg-aletis-bege/35"><span><strong className="block text-sm text-foreground">Nenhuma proposta nesta demanda</strong><span className="mt-1 block text-xs text-muted-foreground">Crie a primeira proposta já vinculada a este assunto.</span></span><ArrowRight className="h-5 w-5 text-foreground" /></button>
                  )}
                </div>
              </section>

              <section className="grid border-b border-aletis-borda xl:grid-cols-2">
                <div className="border-b border-aletis-borda px-4 py-4 xl:border-b-0 xl:border-r lg:px-5">
                  <SectionHeading eyebrow="base documental" title="Documentos vinculados" trailing={`${selected.documentoIds.length} arquivo(s)`} />
                  {selected.documentoIds.length > 0 ? (
                    <div className="mt-3 divide-y divide-aletis-borda border-y border-aletis-borda">
                      {selected.documentoIds.map((documentId) => {
                        const document = documentsById.get(documentId)
                        return (
                          <a key={documentId} href={document?.downloadUrl} target={document?.downloadUrl ? '_blank' : undefined} rel="noreferrer" className="flex min-w-0 items-center gap-2 py-2.5 text-left hover:bg-aletis-bege/35">
                            <Paperclip className="h-4 w-4 shrink-0 text-foreground" />
                            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground">{document?.nome || documentId}</span><span className="block truncate text-[11px] text-muted-foreground">{document?.grupoDocumento || document?.categoria || 'Documento vinculado'}</span></span>
                            {document?.downloadUrl && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                          </a>
                        )
                      })}
                    </div>
                  ) : (
                    <button type="button" onClick={openEdit} className="mt-3 flex w-full items-center justify-between gap-3 border border-dashed border-aletis-borda px-3 py-3 text-left hover:bg-aletis-bege/35"><span className="text-xs text-muted-foreground">Nenhum documento específico vinculado.</span><span className="shrink-0 text-xs font-semibold text-foreground">Vincular</span></button>
                  )}
                </div>

                <div className="px-4 py-4 lg:px-5">
                  <SectionHeading eyebrow="memória operacional" title="Histórico da demanda" trailing={`${selected.eventos.length} evento(s)`} />
                  <div className="mt-3 max-h-64 overflow-y-auto">
                    {[...selected.eventos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).map((event, index) => (
                      <div key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                        {index < selected.eventos.length - 1 && <span className="absolute bottom-0 left-[7px] top-4 w-px bg-aletis-borda" />}
                        <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 border-2 border-white bg-aletis-verde ring-1 ring-aletis-borda" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-foreground">{event.titulo}</p><span className="text-[11px] text-muted-foreground">{formatDateTime(event.criadoEm)}</span></div>
                          {event.descricao && <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-soft)]">{event.descricao}</p>}
                          <p className="mt-1 text-[11px] font-semibold uppercase text-muted-foreground">{eventTypeLabel(event.tipo)}{event.autor ? ` · ${event.autor}` : ''}</p>
                        </div>
                      </div>
                    ))}
                    {selected.eventos.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma atividade registrada.</p>}
                  </div>
                </div>
              </section>

              {selected.propostaIds.length === 0 && (
                <div className="px-4 py-3 lg:px-5"><button type="button" onClick={() => void removeSelected()} disabled={saving} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:underline"><Trash2 className="h-3.5 w-3.5" /> Excluir demanda sem propostas</button></div>
              )}
            </div>
          )}
        </main>
      </div>

      {(modal === 'create' || modal === 'edit') && (
        <MotionDialog title={modal === 'create' ? 'Nova demanda' : `Editar ${selected?.codigo || 'demanda'}`} subtitle="Defina o objetivo e o próximo movimento operacional" eyebrow="CRM ALETIS" icon={<BriefcaseBusiness className="h-5 w-5" />} size="xl" onClose={() => setModal(null)} footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className={uiAction.secondary}>Cancelar</button><button type="button" onClick={() => void submit()} disabled={saving} className={uiAction.primary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar demanda</button></div>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DemandField label="Título" className="sm:col-span-2 lg:col-span-3"><input autoFocus value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} className={inputClass} placeholder="Ex.: Renegociação custeio safra 2026/27" /></DemandField>
            <DemandField label="Categoria"><select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value as DemandCategory })} className={inputClass}>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></DemandField>
            <DemandField label="Assunto"><input value={form.assunto} onChange={(event) => setForm({ ...form, assunto: event.target.value })} className={inputClass} placeholder="Linha, contrato ou finalidade" /></DemandField>
            <DemandField label="Credor / instituição"><input value={form.credor} onChange={(event) => setForm({ ...form, credor: event.target.value })} className={inputClass} /></DemandField>
            <DemandField label="Status"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as DemandStatus })} className={inputClass}>{STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></DemandField>
            <DemandField label="Prioridade"><select value={form.prioridade} onChange={(event) => setForm({ ...form, prioridade: event.target.value as DemandPriority })} className={inputClass}>{PRIORITY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></DemandField>
            <DemandField label="Responsável"><input value={form.responsavel} onChange={(event) => setForm({ ...form, responsavel: event.target.value })} className={inputClass} /></DemandField>
            <DemandField label="Valor pretendido"><input inputMode="decimal" value={form.valorPretendido} onChange={(event) => setForm({ ...form, valorPretendido: event.target.value })} className={inputClass} /></DemandField>
            <DemandField label="Prazo-alvo"><input type="date" value={form.prazoAlvo} onChange={(event) => setForm({ ...form, prazoAlvo: event.target.value })} className={inputClass} /></DemandField>
            <DemandField label={`Probabilidade · ${form.probabilidade}%`}><input type="range" min="0" max="100" step="5" value={form.probabilidade} onChange={(event) => setForm({ ...form, probabilidade: Number(event.target.value) })} className="h-10 w-full accent-aletis-verde" /></DemandField>
            <DemandField label="Próxima ação" className="sm:col-span-2"><input value={form.proximaAcao} onChange={(event) => setForm({ ...form, proximaAcao: event.target.value })} className={inputClass} placeholder="Ex.: Validar garantias com o banco" /></DemandField>
            <DemandField label="Data da próxima ação"><input type="date" value={form.proximaAcaoEm} onChange={(event) => setForm({ ...form, proximaAcaoEm: event.target.value })} className={inputClass} /></DemandField>
            <DemandField label="Resultado esperado" className="sm:col-span-2 lg:col-span-3"><input value={form.resultadoEsperado} onChange={(event) => setForm({ ...form, resultadoEsperado: event.target.value })} className={inputClass} placeholder="Resultado concreto que encerra esta demanda" /></DemandField>
            <DemandField label="Descrição operacional" className="sm:col-span-2 lg:col-span-3"><textarea rows={3} value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} className={`${inputClass} resize-y`} /></DemandField>
            <DemandField label="Tags" className="sm:col-span-2 lg:col-span-3"><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} className={inputClass} placeholder="safra, prioridade, banco" /></DemandField>
            <DemandField label={`Documentos do cliente (${form.documentoIds.length} vinculados)`} className="sm:col-span-2 lg:col-span-3">
              <div className="max-h-52 overflow-y-auto border border-aletis-borda bg-aletis-cream-papel/25">
                {documents.length > 0 ? documents.map((document) => {
                  const checked = form.documentoIds.includes(document.id)
                  return (
                    <label key={document.id} className="flex cursor-pointer items-start gap-3 border-b border-aletis-borda/70 px-3 py-2.5 last:border-b-0 hover:bg-white">
                      <input type="checkbox" checked={checked} onChange={() => setForm({ ...form, documentoIds: checked ? form.documentoIds.filter((id) => id !== document.id) : [...form.documentoIds, document.id] })} className="mt-0.5 h-4 w-4 accent-aletis-verde" />
                      <span className="min-w-0"><span className="block truncate text-xs font-semibold text-foreground">{document.nome}</span><span className="block text-[11px] text-muted-foreground">{document.grupoDocumento || document.categoria || 'Documento'}</span></span>
                    </label>
                  )
                }) : <p className="px-3 py-4 text-xs text-muted-foreground">Nenhum documento disponível no cofre deste cliente.</p>}
              </div>
            </DemandField>
          </div>
        </MotionDialog>
      )}

      {modal === 'activity' && selected && (
        <MotionDialog title="Registrar atividade" subtitle={`${selected.codigo} · ${selected.titulo}`} eyebrow="Memória operacional" icon={<Activity className="h-5 w-5" />} size="md" onClose={() => setModal(null)} footer={<div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(null)} className={uiAction.secondary}>Cancelar</button><button type="button" disabled={saving || !activityForm.titulo.trim()} onClick={() => void registerActivity()} className={uiAction.primary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Registrar</button></div>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <DemandField label="Tipo"><select value={activityForm.tipo} onChange={(event) => setActivityForm({ ...activityForm, tipo: event.target.value as ClienteDemandaEventoTipo })} className={inputClass}>{EVENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></DemandField>
            <DemandField label="Título"><input autoFocus value={activityForm.titulo} onChange={(event) => setActivityForm({ ...activityForm, titulo: event.target.value })} className={inputClass} placeholder="Ex.: Retorno do cliente" /></DemandField>
            <DemandField label="Detalhes" className="sm:col-span-2"><textarea rows={5} value={activityForm.descricao} onChange={(event) => setActivityForm({ ...activityForm, descricao: event.target.value })} className={`${inputClass} resize-y`} placeholder="Registre decisões, compromissos e contexto relevante." /></DemandField>
          </div>
        </MotionDialog>
      )}
    </div>
  )
}

const inputClass = 'w-full border border-aletis-borda bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15'

function DemandField({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={`min-w-0 space-y-1 ${className}`}><span className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>{children}</label>
}

function SectionHeading({ eyebrow, title, trailing }: { eyebrow: string; title: string; trailing?: string }) {
  return <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase text-aletis-gold-escuro">{eyebrow}</p><h4 className="mt-1 text-sm font-bold text-foreground">{title}</h4></div>{trailing && <span className="shrink-0 text-xs text-muted-foreground">{trailing}</span>}</div>
}

function SummaryCell({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return <div className="min-w-0 border-b border-r border-aletis-borda px-3 py-2.5 last:border-r-0 xl:border-b-0"><p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p><p className={`mt-1 truncate font-display text-base font-bold ${tone === 'danger' ? 'text-red-700' : 'text-foreground'}`} title={value}>{value}</p></div>
}

function DetailCell({ icon: Icon, label, value, attention = false }: { icon: typeof FileText; label: string; value: string; attention?: boolean }) {
  return <div className="min-w-0 border-b border-r border-aletis-borda px-4 py-3 last:border-r-0 xl:border-b-0"><div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground"><Icon className={`h-3.5 w-3.5 ${attention ? 'text-red-600' : 'text-foreground'}`} />{label}</div><p className={`mt-1 truncate text-sm font-semibold ${attention ? 'text-red-700' : 'text-foreground'}`} title={value}>{value}</p></div>
}

function DemandStatus({ status }: { status: DemandStatus }) {
  const label = STATUS.find((item) => item.value === status)?.label || status
  const cls = status === 'aprovada' || status === 'concluida' ? 'bg-emerald-100 text-emerald-800' : status === 'cancelada' || status === 'suspensa' ? 'bg-gray-200 text-gray-700' : status === 'negociacao' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
  return <span className={`px-2 py-0.5 text-[11px] font-bold uppercase ${cls}`}>{label}</span>
}

function Priority({ value }: { value: DemandPriority }) {
  const cls = value === 'urgente' ? 'text-red-700' : value === 'alta' ? 'text-amber-700' : 'text-muted-foreground'
  return <span className={`inline-flex items-center gap-1 font-semibold uppercase ${cls}`}>{value === 'urgente' && <AlertTriangle className="h-3 w-3" />}{value}</span>
}

function categoryLabel(value: DemandCategory): string {
  return CATEGORIES.find((item) => item.value === value)?.label || 'Outro'
}

function eventTypeLabel(value: ClienteDemandaEventoTipo): string {
  return EVENT_TYPES.find((item) => item.value === value)?.label || (value === 'status' ? 'Alteração de etapa' : value === 'sistema' ? 'Sistema' : value)
}

function formatBRL(value: unknown, showZero = false): string {
  const amount = Number(value)
  return Number.isFinite(amount) && (amount > 0 || showZero) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(amount) : 'A definir'
}

function formatSignedBRL(value?: string): string {
  if (value === undefined) return '—'
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount === 0) return 'Sem variação'
  const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Math.abs(amount))
  return `${amount > 0 ? '+' : '-'}${formatted}`
}

function formatPercent(value?: string): string {
  const amount = Number(value)
  return Number.isFinite(amount) ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(amount)}%` : '—'
}

function compactDate(value?: string): string {
  return value ? formatDate(value).replace(/\/\d{4}$/, '') : ''
}

function formatDate(value?: string): string {
  if (!value) return 'A definir'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
