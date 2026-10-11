// ============================================================
// ClientePropostasTab — dashboard de propostas dentro da negociação
// do cliente, com upload + extração por IA e edição completa.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError, apiFetch, apiFetchFull } from '../../hooks/useApi'
import { ProposalDraftEditor, cannotReapplyProposal, proposalChanges, proposalRevision, proposalTransitions, type ProposalSaveResult } from './proposalDraft'
import {
  AlertTriangle,
  Banknote,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  ListChecks,
  Loader2,
  Percent,
  Plus,
  Save,
  Scale,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'

type PropostaStatus = 'rascunho' | 'em_analise' | 'enviada' | 'aceita' | 'rejeitada' | 'expirada' | string
type PropostaTipo = 'liquidacao' | 'renegociacao' | 'memoria_calculo' | 'parcelamento' | 'acordo_judicial' | string
type ItemTipo = 'pagamento' | 'dacao' | 'compensacao' | 'desconto' | 'parcela'

interface ItemProposta {
  descricao: string
  valor: number
  tipo: ItemTipo
  data?: string
}

interface Proposta {
  id: string
  revision?: number
  clienteId: string
  demandaId?: string
  demandaTitulo?: string
  versaoDemanda?: number
  assunto?: string
  clienteNome?: string
  credor: string
  titulo: string
  tipo: PropostaTipo
  status: PropostaStatus
  valorDivida: number
  valorProposta: number
  descontoPercentual: number
  itens: ItemProposta[]
  condicoes: string[]
  fundamentacao: string
  dataCriacao: string
  dataValidade: string
  ultimaAtualizacao?: string
  pdfUrl?: string | null
  observacoes: string
  arquivoOrigem?: {
    alixDocumentId?: string
    alixSessionId?: string
    filename?: string
    mimetype?: string
    sizeBytes?: number
    cofreUploadId?: string
    cofreDownloadUrl?: string
  }
  extracaoIa?: {
    origem?: 'openai' | 'fallback' | 'manual'
    estado?: 'queued' | 'processing' | 'completed' | 'completed_basic' | 'failed'
    modelo?: string
    resumo?: string
    confianca?: number
    camposAusentes?: string[]
    textoExtraidoChars?: number
    erro?: string
  }
}

interface Props {
  clienteId: string
  clienteNome?: string
  valorDividaPadrao?: number
  onGerarProposta?: () => void
  onCountChange?: (count: number) => void
  onDataChange?: (propostas: Proposta[]) => void
  onLinksChange?: () => void
  demandaId?: string
  demandaTitulo?: string
  onClearDemanda?: () => void
  demandas?: DemandaProposalContext[]
}

interface DemandaProposalContext {
  id: string
  titulo?: string
  propostaPrincipalId?: string
  propostaIds?: string[]
  propostas?: Array<{ id: string; principal?: boolean; versaoDemanda?: number }>
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  em_analise: 'Em análise',
  enviada: 'Enviada',
  aceita: 'Aceita',
  rejeitada: 'Rejeitada',
  expirada: 'Expirada',
}

const PROPOSAL_FIELD_LABELS: Record<string, string> = {
  clienteNome: 'Cliente', demandaId: 'Demanda', demandaTitulo: 'Título da demanda', assunto: 'Assunto',
  credor: 'Credor', titulo: 'Título', tipo: 'Tipo', status: 'Situação', valorDivida: 'Valor da dívida',
  valorProposta: 'Valor proposto', itens: 'Parcelas e pagamentos', condicoes: 'Condições',
  fundamentacao: 'Fundamentação', observacoes: 'Observações', dataCriacao: 'Data da proposta', dataValidade: 'Validade',
}

function comparisonValue(value: unknown): string {
  const text = typeof value === 'string' ? value : value == null ? 'Não informado' : JSON.stringify(value)
  return text.length > 350 ? `${text.slice(0, 350)}…` : text || 'Não informado'
}

const TIPO_LABEL: Record<string, string> = {
  liquidacao: 'Liquidação',
  renegociacao: 'Renegociação',
  memoria_calculo: 'Memória de cálculo',
  parcelamento: 'Parcelamento',
  acordo_judicial: 'Acordo judicial',
}

const propostaPanelCls = 'rounded-lg border border-aletis-borda bg-card shadow-none'
const propostaSubPanelCls = 'rounded-lg border border-aletis-borda bg-aletis-cream-papel/45 p-4'
const propostaPrimaryBtnCls = 'inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-aletis-verde px-3.5 text-xs font-semibold text-white shadow-none transition hover:bg-aletis-verde-escuro disabled:cursor-not-allowed disabled:opacity-50'

export default function ClientePropostasTab({
  clienteId,
  clienteNome,
  valorDividaPadrao = 0,
  onCountChange,
  onDataChange,
  onLinksChange,
  demandaId,
  demandaTitulo,
  onClearDemanda,
  demandas = [],
}: Props) {
  const [list, setList] = useState<Proposta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [mutating, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const editors = useRef(new Map<string, ProposalDraftEditor<Proposta>>())
  const [, redrawEditor] = useState(0)
  const [latestVersion, setLatestVersion] = useState<Proposta | null>(null)
  const [comparing, setComparing] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [proposalSearch, setProposalSearch] = useState('')
  const [proposalStatus, setProposalStatus] = useState('todos')
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const preserveUnsaved = (event: BeforeUnloadEvent) => {
      if (![...editors.current.values()].some(editor => editor.dirty || editor.saving)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preserveUnsaved)
    return () => window.removeEventListener('beforeunload', preserveUnsaved)
  }, [])

  const reload = useCallback(async () => {
    if (!clienteId) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<Proposta[]>(`/propostas?clienteId=${encodeURIComponent(clienteId)}&full=1`)
      const normalized = (data || []).map(normalizarProposta)
      setList(normalized)
      setSelectedId((prev) => {
        if (prev && normalized.some((p) => p.id === prev)) return prev
        return normalized[0]?.id ?? null
      })
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setLoading(false)
    }
  }, [clienteId])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    onCountChange?.(list.length)
    onDataChange?.(list)
  }, [list, onCountChange, onDataChange])

  const scopedList = useMemo(
    () => demandaId ? list.filter((proposal) => proposal.demandaId === demandaId) : list,
    [demandaId, list],
  )
  const currentList = useMemo(
    () => selectCurrentProposalsForStats(scopedList, demandas),
    [demandas, scopedList],
  )
  const currentIds = useMemo(() => new Set(currentList.map((proposal) => proposal.id)), [currentList])
  const visibleList = useMemo(() => {
    const search = normalizeSearch(proposalSearch)
    return scopedList
      .filter((proposal) => proposalStatus === 'todos' || proposal.status === proposalStatus)
      .filter((proposal) => !search || normalizeSearch([
        proposal.titulo,
        proposal.credor,
        proposal.demandaTitulo,
        proposal.assunto,
      ].join(' ')).includes(search))
      .sort(compareProposals)
  }, [proposalSearch, proposalStatus, scopedList])
  const selected = useMemo(() => visibleList.find((p) => p.id === selectedId) ?? null, [visibleList, selectedId])
  const editor = useMemo(() => {
    if (!selected) return null
    const key = `${clienteId}:${selected.id}`
    let current = editors.current.get(key)
    if (!current) { current = new ProposalDraftEditor(selected); editors.current.set(key, current) }
    return current
  }, [clienteId, selected?.id])
  useEffect(() => editor?.subscribe(() => redrawEditor(value => value + 1)), [editor])
  useEffect(() => { if (selected) editor?.receive(selected) }, [editor, selected])
  useEffect(() => { setLatestVersion(null); setError(null) }, [editor])
  const draft = editor?.draft ?? null
  const setDraft = (value: Proposta) => editor?.edit(value)
  const saving = mutating || Boolean(editor?.saving)
  const isDirty = Boolean(editor?.dirty)
  const saveState = editor?.saving ? 'saving' : editor?.error ? 'error' : isDirty ? 'dirty' : 'saved'
  const saveError = editor?.error instanceof Error ? editor.error.message : null
  const conflict = editor?.error instanceof ApiError && editor.error.status === 409
  const termsLocked = editor?.confirmed.status === 'aceita' || (editor?.saving && draft?.status === 'aceita')
  const canRemove = Boolean(editor && ['rascunho', 'em_analise'].includes(editor.confirmed.status))

  useEffect(() => {
    if (selectedId && visibleList.some((proposal) => proposal.id === selectedId)) return
    setSelectedId(visibleList[0]?.id ?? null)
  }, [demandaId, selectedId, visibleList])

  const hasBackgroundExtraction = useMemo(
    () => list.some((proposal) => ['queued', 'processing'].includes(proposal.extracaoIa?.estado || '')),
    [list],
  )

  useEffect(() => {
    if (!clienteId || !hasBackgroundExtraction || isDirty || saving || editor?.paused) return
    let disposed = false
    const refresh = async () => {
      try {
        const data = await apiFetch<Proposta[]>(`/propostas?clienteId=${encodeURIComponent(clienteId)}&full=1`)
        if (!disposed) setList((data || []).map(normalizarProposta))
      } catch {
        // A leitura em segundo plano é retomada no próximo ciclo; a edição atual
        // nunca é perdida por uma indisponibilidade transitória.
      }
    }
    const timer = window.setInterval(() => { void refresh() }, 3_000)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [clienteId, hasBackgroundExtraction, isDirty, saving, editor?.paused])

  const salvarAtual = useCallback(async (current: ProposalDraftEditor<Proposta>, opts: { silent?: boolean } = {}) => {
    if (current.saving) return
    if (current.error instanceof ApiError && current.error.status === 409) return
    setError(null)
    if (!opts.silent) setNotice(null)
    try {
      const result = await current.save(async (id, patch) => {
        const response = await apiFetchFull<ProposalSaveResult<Proposta>>(`/propostas/${encodeURIComponent(id)}`, {
          method: 'PATCH', body: JSON.stringify(patch),
        })
        const normalized = normalizarProposta(response.data)
        setList((prev) => prev.map((p) => p.id === normalized.id ? normalized : p))
        if (patch.status !== undefined || response.meta?.negociacaoId || response.meta?.contratoId) onLinksChange?.()
        return { ...response, data: normalized }
      })
      if (!result) return
      setLastSavedAt(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      if (!opts.silent || result.meta?.contratoId) setNotice(result.meta?.contratoId
        ? 'Aceite registrado. Demanda, negociação e rascunho contratual vinculados. Confira a aba Contratos.'
        : 'Proposta salva.')
    } catch {
      // O editor retém o rascunho e pausa as tentativas até uma decisão do usuário.
    }
  }, [onLinksChange])

  useEffect(() => {
    if (!editor || !isDirty || editor.saving || editor.paused || saving) return
    const timer = window.setTimeout(() => {
      void salvarAtual(editor, { silent: true })
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [draft, editor, isDirty, saving, salvarAtual])

  async function compararVersao() {
    if (!editor || comparing) return
    setComparing(true)
    try {
      const latest = normalizarProposta(await apiFetch<Proposta>(`/propostas/${encodeURIComponent(editor.confirmed.id)}`))
      setLatestVersion(latest)
    } catch (err) { setError((err as Error).message) }
    finally { setComparing(false) }
  }

  function reconciliarVersao(keepChanges: boolean) {
    if (!editor || !latestVersion) return
    editor.reconcile(latestVersion, keepChanges)
    setList(prev => prev.map(proposal => proposal.id === latestVersion.id ? latestVersion : proposal))
    setLatestVersion(null)
    setError(null)
    setNotice(keepChanges ? 'Alterações reaplicadas. Confira os campos e clique em Salvar.' : 'Versão atual carregada.')
    onLinksChange?.()
  }

  const stats = useMemo(() => {
    const valorProposto = currentList.reduce((s, p) => s + (Number(p.valorProposta) || 0), 0)
    const divida = currentList.reduce((s, p) => s + (Number(p.valorDivida) || 0), 0)
    const economia = currentList.reduce((s, p) => s + Math.max(0, (Number(p.valorDivida) || 0) - (Number(p.valorProposta) || 0)), 0)
    return {
      totalVersoes: scopedList.length,
      vigentes: currentList.length,
      valorProposto,
      economia,
      descontoMedio: divida > 0 ? (economia / divida) * 100 : 0,
    }
  }, [currentList, scopedList.length])

  async function uploadArquivo(file: File | null | undefined) {
    if (!file || uploading) return
    setUploading(true)
    setError(null)
    setNotice(null)
    try {
      const form = new FormData()
      form.append('clienteId', clienteId)
      form.append('clienteNome', clienteNome || '')
      if (demandaId) form.append('demandaId', demandaId)
      if (demandaTitulo) form.append('demandaTitulo', demandaTitulo)
      form.append('file', file)
      const res = await apiFetchFull<{ success: true; data: Proposta; meta?: any }>('/propostas/upload', {
        method: 'POST',
        body: form,
      })
      const proposta = normalizarProposta(res.data)
      setList((prev) => [proposta, ...prev.filter((p) => p.id !== proposta.id)])
      setSelectedId(proposta.id)
      setNotice(
        ['queued', 'processing'].includes(proposta.extracaoIa?.estado || '')
          ? 'Arquivo recebido. OCR e IA estão preenchendo a proposta em segundo plano.'
          : proposta.extracaoIa?.confianca
          ? `IA preencheu a proposta com ${Math.round((proposta.extracaoIa.confianca || 0) * 100)}% de confiança.`
          : 'Arquivo importado. Revise os campos destacados antes de enviar.',
      )
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function criarManual() {
    setSaving(true)
    setError(null)
    try {
      const created = await apiFetch<Proposta>('/propostas/gerar', {
        method: 'POST',
        body: JSON.stringify({
          clienteId,
          clienteNome: clienteNome || clienteId,
          demandaId,
          demandaTitulo,
          assunto: demandaTitulo,
          credor: 'Banco a definir',
          titulo: 'Nova proposta de negociação',
          tipo: 'renegociacao',
          valorDivida: Number(valorDividaPadrao) || 0,
          valorProposta: Number(valorDividaPadrao) || 0,
          itens: [],
          condicoes: [],
          fundamentacao: '',
          observacoes: '',
        }),
      })
      const proposta = normalizarProposta(created)
      setList((prev) => [proposta, ...prev])
      setSelectedId(proposta.id)
      setNotice('Proposta manual criada. Edite os campos; as alterações serão salvas automaticamente.')
    } catch (err: any) {
      setError(String(err?.message || err))
    } finally {
      setSaving(false)
    }
  }

  async function salvar() {
    if (!editor) return
    await salvarAtual(editor)
  }

  async function remover() {
    if (!draft || !editor || saving || !canRemove || !confirm('Remover esta proposta da negociação do cliente?')) return
    setSaving(true)
    try {
      await apiFetch(`/propostas/${encodeURIComponent(draft.id)}?expectedRevision=${proposalRevision(editor.confirmed)}`, { method: 'DELETE' })
      const next = list.filter((p) => p.id !== draft.id)
      setList(next)
      setSelectedId(next.find((proposal) => !demandaId || proposal.demandaId === demandaId)?.id ?? null)
      setNotice('Proposta removida.')
    } catch (err: any) {
      setError(String(err?.message || err))
      if (err instanceof ApiError && err.status === 409) {
        editor.error = err
        editor.paused = true
        redrawEditor(value => value + 1)
      }
    } finally {
      setSaving(false)
    }
  }

  function selecionarPorIndice(index: number) {
    const safe = Math.min(Math.max(index, 0), visibleList.length - 1)
    setSelectedId(visibleList[safe]?.id ?? null)
  }

  const selectedIndex = selected ? Math.max(0, visibleList.findIndex((p) => p.id === selected.id)) : 0
  const draftAlerts = draft ? buildProposalAlerts(draft) : []
  const draftChecks = draft ? buildConferenceChecks(draft) : []
  const draftFluxoTotal = draft ? (draft.itens || []).reduce((sum, item) => sum + (Number(item.valor) || 0), 0) : 0

  if (loading) {
    return (
      <div className={`${propostaPanelCls} p-4`}>
        <div className="h-72 animate-pulse rounded-lg bg-aletis-cream/60" />
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden animate-fade-in">
      {(error || saveError) && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div className="min-w-0 flex-1">
            <p>{error || saveError}</p>
            {Boolean(editor?.error) && <p className="mt-1 text-xs">Sua edição foi preservada. O salvamento automático está pausado.</p>}
            {Boolean(editor?.error) && <button type="button" disabled={comparing || saving} onClick={() => void compararVersao()} className={`${secondaryBtnCls} mt-2`}>{comparing ? 'Consultando…' : 'Comparar com versão atual'}</button>}
          </div>
        </div>
      )}
      {latestVersion && editor && latestVersion.id === editor.confirmed.id && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold">Versão atual: {STATUS_LABEL[latestVersion.status] || latestVersion.status}</p>
          <p className="mt-1 text-xs">Confira os campos editados antes de decidir qual versão usar.</p>
          <dl className="mt-3 space-y-2">
            {Object.keys(proposalChanges(editor.confirmed, editor.draft)).map(key => (
              <div key={key} className="grid gap-1 border-t border-amber-200 pt-2 sm:grid-cols-3">
                <dt className="font-semibold">{PROPOSAL_FIELD_LABELS[key] || key}</dt>
                <dd className="break-words">Sua edição: {comparisonValue((editor.draft as unknown as Record<string, unknown>)[key])}</dd>
                <dd className="break-words">Atual: {comparisonValue((latestVersion as unknown as Record<string, unknown>)[key])}</dd>
              </div>
            ))}
          </dl>
          {cannotReapplyProposal(editor.confirmed, editor.draft, latestVersion) && <p className="mt-3 text-xs">A proposta atual já foi encerrada ou aceita. Seus termos não podem ser substituídos por esta edição.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => reconciliarVersao(false)} className={secondaryBtnCls}>Usar versão atual e descartar minha edição</button>
            <button type="button" disabled={cannotReapplyProposal(editor.confirmed, editor.draft, latestVersion)} onClick={() => reconciliarVersao(true)} className={propostaPrimaryBtnCls}>Reaplicar minhas alterações para revisão</button>
          </div>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4" />
          <span>{notice}</span>
        </div>
      )}
      {demandaId && (
        <div className="flex flex-col gap-2 border border-aletis-verde/25 bg-aletis-verde/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-foreground">demanda em foco</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{demandaTitulo || demandaId}</p>
            <p className="text-[11px] text-muted-foreground">Novos uploads e propostas manuais serão vinculados automaticamente a este assunto.</p>
          </div>
          {onClearDemanda && <button type="button" onClick={onClearDemanda} className={secondaryBtnCls}>Ver todas</button>}
        </div>
      )}

      <section
        className={`${propostaPanelCls} min-w-0 overflow-hidden`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          uploadArquivo(event.dataTransfer.files?.[0])
        }}
      >
        <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase text-foreground">carteira de propostas</p>
            <h3 className="mt-0.5 text-lg font-display font-semibold text-foreground">
              {demandaId ? demandaTitulo || 'Propostas da demanda' : 'Propostas do cliente'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.vigentes} vigente(s) em {stats.totalVersoes} versão(ões)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-aletis-verde/30 bg-aletis-verde/5 px-3 text-xs font-bold text-foreground transition hover:bg-aletis-verde/10">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.txt"
                onChange={(event) => uploadArquivo(event.target.files?.[0])}
              />
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {uploading ? 'Analisando arquivo' : 'Importar proposta'}
            </label>
            <button type="button" onClick={criarManual} disabled={saving || uploading} className={propostaPrimaryBtnCls}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Nova proposta
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-aletis-borda bg-stone-50 lg:grid-cols-4">
          <ProposalSummaryCell label="Versões" value={String(stats.totalVersoes)} />
          <ProposalSummaryCell label="Vigentes" value={String(stats.vigentes)} />
          <ProposalSummaryCell label="Valor vigente" value={fmtBRL(stats.valorProposto)} />
          <ProposalSummaryCell label="Economia" value={`${fmtBRL(stats.economia)} · ${stats.descontoMedio.toFixed(1)}%`} tone="good" />
        </div>
      </section>

      {scopedList.length === 0 ? (
        <section className={`${propostaPanelCls} flex min-h-[280px] flex-col items-center justify-center p-8 text-center`}>
          <FileText className="h-10 w-10 text-aletis-grafite-claro/60" />
          <h3 className="mt-3 text-base font-display font-semibold text-foreground">
            {demandaId ? 'Nenhuma proposta nesta demanda.' : 'Nenhuma proposta cadastrada para este cliente.'}
          </h3>
          <p className="mt-1 max-w-lg text-sm text-muted-foreground">
            Faça upload da proposta enviada pelo banco ou crie uma proposta manual para acompanhar este assunto.
          </p>
        </section>
      ) : visibleList.length === 0 || !draft ? (
        <section className={`${propostaPanelCls} flex min-h-[240px] flex-col items-center justify-center p-8 text-center`}>
          <Search className="h-9 w-9 text-aletis-grafite-claro/60" />
          <h3 className="mt-3 text-base font-display font-semibold text-foreground">Nenhuma proposta encontrada</h3>
          <p className="mt-1 text-sm text-muted-foreground">Ajuste a busca ou o filtro de status.</p>
          <button
            type="button"
            onClick={() => { setProposalSearch(''); setProposalStatus('todos') }}
            className={`${secondaryBtnCls} mt-4`}
          >
            Limpar filtros
          </button>
        </section>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
          <aside className={`${propostaPanelCls} min-w-0 overflow-hidden`}>
            <div className="border-b border-aletis-borda bg-aletis-cream-papel/55 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Histórico por demanda
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {visibleList.length} de {scopedList.length} versão(ões)
                  </p>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => selecionarPorIndice(selectedIndex - 1)} className={iconBtnCls} disabled={selectedIndex <= 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => selecionarPorIndice(selectedIndex + 1)} className={iconBtnCls} disabled={selectedIndex >= visibleList.length - 1}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_132px] gap-2">
                <label className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={proposalSearch}
                    onChange={(event) => setProposalSearch(event.target.value)}
                    placeholder="Buscar proposta"
                    aria-label="Buscar proposta"
                    className="h-9 w-full rounded-lg border border-aletis-borda bg-card pl-8 pr-3 text-xs text-foreground outline-none focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/10"
                  />
                </label>
                <select
                  value={proposalStatus}
                  onChange={(event) => setProposalStatus(event.target.value)}
                  aria-label="Filtrar propostas por status"
                  className="h-9 min-w-0 rounded-lg border border-aletis-borda bg-card px-2 text-xs text-foreground outline-none focus:border-aletis-verde"
                >
                  <option value="todos">Todos status</option>
                  {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <div className="max-h-[440px] min-h-0 space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-180px)] xl:min-h-[360px]">
              {visibleList.map((p, idx) => {
                const active = p.id === draft.id
                const economia = economiaProposta(p)
                const completeness = proposalCompleteness(p)
                const previous = visibleList[idx - 1]
                const groupLabel = p.demandaTitulo || p.assunto || (p.demandaId ? `Demanda ${p.demandaId.slice(0, 8)}` : 'Sem demanda vinculada')
                const previousGroupLabel = previous
                  ? previous.demandaTitulo || previous.assunto || (previous.demandaId ? `Demanda ${previous.demandaId.slice(0, 8)}` : 'Sem demanda vinculada')
                  : null
                return (
                  <div key={p.id}>
                    {groupLabel !== previousGroupLabel && (
                      <div className="mb-1.5 mt-3 flex items-center justify-between gap-2 first:mt-0">
                        <p className="truncate text-[11px] font-bold uppercase text-muted-foreground">{groupLabel}</p>
                        <span className="flex-shrink-0 text-[11px] text-muted-foreground">
                          {scopedList.filter((candidate) => (candidate.demandaId || candidate.demandaTitulo || candidate.assunto || 'sem-demanda') === (p.demandaId || p.demandaTitulo || p.assunto || 'sem-demanda')).length} versão(ões)
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        active
                          ? 'border-aletis-verde bg-aletis-verde/5 shadow-sm ring-1 ring-aletis-verde/10'
                          : 'border-aletis-borda bg-card hover:border-aletis-verde/35 hover:bg-aletis-cream/30'
                      }`}
                    >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{p.titulo}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.credor || 'Credor a confirmar'}</p>
                        {p.demandaTitulo && <p className="mt-1 truncate text-[11px] font-semibold uppercase text-foreground">{p.demandaTitulo} · V{p.versaoDemanda || 1}</p>}
                      </div>
                      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${currentIds.has(p.id) ? 'bg-emerald-100 text-emerald-700' : 'bg-aletis-cream text-muted-foreground'}`}>
                        {currentIds.has(p.id) ? 'Vigente' : `V${p.versaoDemanda || 1}`}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <span className="text-muted-foreground">Proposto</span>
                      <span className="text-right font-semibold tabular-nums text-foreground">{fmtBRL(p.valorProposta)}</span>
                      <span className="text-muted-foreground">Economia</span>
                      <span className="text-right font-semibold tabular-nums">{fmtBRL(economia)}</span>
                      <span className="text-muted-foreground">Desconto</span>
                      <span className="text-right font-semibold tabular-nums">{Number(p.descontoPercentual || 0).toFixed(1)}%</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-aletis-cream">
                      <div className="h-full rounded-full bg-aletis-verde" style={{ width: `${completeness}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <StatusBadge status={p.status} />
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        {['queued', 'processing'].includes(p.extracaoIa?.estado || '')
                          ? <Loader2 className="h-3 w-3 animate-spin text-foreground" />
                          : p.extracaoIa ? <Bot className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                        {['queued', 'processing'].includes(p.extracaoIa?.estado || '') ? 'IA processando' : `${completeness}% completo`}
                      </span>
                    </div>
                    </button>
                  </div>
                )
              })}
            </div>
          </aside>

          <main className="min-w-0 space-y-4">
            <div className="sticky top-2 z-20 flex flex-col gap-3 rounded-lg border border-aletis-borda bg-white/95 p-3 shadow-none backdrop-blur lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{draft.titulo}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span>{draft.credor || 'Credor a confirmar'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Clock3 className="h-3 w-3 text-foreground" /> {saveStateLabel(saveState)}
                    {lastSavedAt && saveState === 'saved' ? ` às ${lastSavedAt}` : ''}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {draft.pdfUrl && <a href={draft.pdfUrl} target="_blank" rel="noreferrer" className={iconBtnCls} title="Abrir PDF"><Download className="h-4 w-4" /></a>}
                {draft.arquivoOrigem?.cofreDownloadUrl && <a href={draft.arquivoOrigem.cofreDownloadUrl} target="_blank" rel="noreferrer" className={iconBtnCls} title="Abrir arquivo original"><FileText className="h-4 w-4" /></a>}
                <button type="button" onClick={remover} disabled={saving || !canRemove} className={`${iconBtnCls} text-red-700 hover:bg-red-50`} title={canRemove ? 'Remover proposta' : 'Propostas enviadas ou encerradas preservam o histórico comercial'} aria-label="Remover proposta"><Trash2 className="h-4 w-4" /></button>
                <button type="button" onClick={salvar} disabled={saving || !isDirty || conflict} className={propostaPrimaryBtnCls}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar
                </button>
              </div>
            </div>

            <section className={`${propostaPanelCls} min-w-0 overflow-hidden p-4`}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={draft.status} />
                {draft.demandaTitulo && <span className="inline-flex items-center gap-1 rounded-md bg-aletis-verde/10 px-2 py-1 text-xs font-semibold text-foreground">{draft.demandaTitulo} · V{draft.versaoDemanda || 1}</span>}
                <span className="inline-flex items-center gap-1 rounded-md bg-aletis-cream px-2 py-1 text-xs font-semibold text-muted-foreground"><Scale className="h-3.5 w-3.5" />{TIPO_LABEL[draft.tipo] || draft.tipo}</span>
                {draft.arquivoOrigem?.filename && <span className="max-w-full truncate rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{draft.arquivoOrigem.filename}</span>}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
                <Metric label="Dívida base" value={fmtBRL(draft.valorDivida)} icon={Banknote} />
                <Metric label="Valor proposto" value={fmtBRL(draft.valorProposta)} tone="good" icon={Banknote} />
                <Metric label="Economia" value={fmtBRL(economiaProposta(draft))} tone="good" />
                <Metric label="Desconto" value={`${Number(draft.descontoPercentual || 0).toFixed(1)}%`} icon={Percent} />
                <Metric label="Validade" value={fmtData(draft.dataValidade)} icon={Calendar} />
              </div>
              <div className="mt-3 rounded-lg border border-aletis-borda bg-aletis-cream-papel/45 p-3">
                <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-muted-foreground">
                  <span>Desconto econômico</span>
                  <span>{Number(draft.descontoPercentual || 0).toFixed(1)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-aletis-cream">
                  <div
                    className="h-full rounded-full bg-aletis-verde"
                    style={{ width: `${Math.max(0, Math.min(100, Number(draft.descontoPercentual) || 0))}%` }}
                  />
                </div>
              </div>
            </section>

            <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,420px)]">
              <div className={`${propostaPanelCls} min-w-0 overflow-hidden p-4`}>
                <SectionHeader
                  icon={ShieldCheck}
                  eyebrow="Resumo e conferência"
                  title="Resumo executivo"
                  hint="Leitura curta para decidir se a proposta está pronta para negociação."
                />
                <p className="mt-3 rounded-lg border border-aletis-borda bg-aletis-cream-papel/45 px-3 py-2.5 text-sm leading-relaxed text-[var(--text-soft)]">
                  {resumoOperacional(draft)}
                </p>
                {draft.extracaoIa && (
                  <div className={`mt-3 rounded-lg border px-3 py-2.5 ${['queued', 'processing'].includes(draft.extracaoIa.estado || '') ? 'border-blue-200 bg-blue-50' : 'border-emerald-200 bg-emerald-50'}`}>
                    <p className={`flex items-center gap-1.5 text-xs font-semibold ${['queued', 'processing'].includes(draft.extracaoIa.estado || '') ? 'text-blue-800' : 'text-emerald-800'}`}>
                      {['queued', 'processing'].includes(draft.extracaoIa.estado || '') ? <Loader2 className="h-4 w-4 animate-spin text-blue-700" /> : <Bot className="h-4 w-4" />}
                      {['queued', 'processing'].includes(draft.extracaoIa.estado || '') ? 'OCR e IA em andamento' : 'Leitura automática'}
                    </p>
                    <p className={`mt-1 text-sm leading-relaxed ${['queued', 'processing'].includes(draft.extracaoIa.estado || '') ? 'text-blue-900/80' : 'text-emerald-900/80'}`}>
                      {draft.extracaoIa.resumo || 'Sem resumo automático.'}
                    </p>
                  </div>
                )}
                {draftAlerts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {draftAlerts.map((item) => (
                      <div key={item.text} className={alertCls(item.tone)}>
                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <InfoPill label="Itens" value={String(draft.itens?.length || 0)} />
                  <InfoPill label="Condições" value={String(draft.condicoes?.filter(Boolean).length || 0)} />
                  <InfoPill label="Atualizado" value={fmtData(draft.ultimaAtualizacao)} />
                  <InfoPill label="Arquivo" value={draft.arquivoOrigem?.filename || 'sem anexo'} />
                </div>
              </div>

              <div className={`${propostaPanelCls} min-w-0 overflow-hidden p-4`}>
                <SectionHeader
                  icon={FileCheck2}
                  eyebrow="Antes de avançar"
                  title="Checklist da proposta"
                  hint="Pontos que o consultor precisa conferir."
                />
                <div className="mt-3 space-y-2">
                  {draftChecks.map((item) => (
                    <div key={item.label} className={`rounded-lg border px-3 py-2 ${item.ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                      <div className="flex items-start gap-2">
                        {item.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />}
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${item.ok ? 'text-emerald-800' : 'text-amber-800'}`}>{item.label}</p>
                          <p className={`mt-0.5 text-[11px] ${item.ok ? 'text-emerald-800/70' : 'text-amber-800/75'}`}>{item.hint}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
              <div className={`${propostaPanelCls} min-w-0 overflow-hidden p-4`}>
                <SectionHeader
                  icon={Tag}
                  eyebrow="Edição"
                  title="Campos principais"
                  hint="Campos salvos automaticamente e usados no PDF, no dashboard e na negociação."
                  action={<span className="text-[11px] font-semibold text-foreground">{editor?.paused ? 'Revisão manual' : 'Autosave ativo'}</span>}
                />
                {termsLocked && <p className="mt-3 text-xs text-[var(--text-soft)]">Proposta aceita. Os termos foram preservados; você pode atualizar as observações internas.</p>}

                <fieldset disabled={Boolean(termsLocked)} className={`mt-4 ${propostaSubPanelCls}`}>
                  <p className="mb-3 text-[11px] font-semibold uppercase text-muted-foreground">Identificação da proposta</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Título"><input className={inputCls} value={draft.titulo} onChange={(e) => setDraft({ ...draft, titulo: e.target.value })} /></Field>
                    <Field label="Credor / banco"><input className={inputCls} value={draft.credor} onChange={(e) => setDraft({ ...draft, credor: e.target.value })} /></Field>
                    <Field label="Tipo">
                      <select className={inputCls} value={draft.tipo} onChange={(e) => setDraft({ ...draft, tipo: e.target.value })}>
                        <option value="renegociacao">Renegociação</option>
                        <option value="liquidacao">Liquidação</option>
                        <option value="memoria_calculo">Memória de cálculo</option>
                        <option value="parcelamento">Parcelamento</option>
                        <option value="acordo_judicial">Acordo judicial</option>
                      </select>
                    </Field>
                    <Field label="Status">
                      <select className={inputCls} value={draft.status} disabled={saving} onChange={(e) => { editor!.paused = true; setDraft({ ...draft, status: e.target.value }) }}>
                        {[...new Set([editor?.confirmed.status || draft.status, ...(proposalTransitions[editor?.confirmed.status || ''] || [])])].map(status => <option key={status} value={status}>{STATUS_LABEL[status] || status}</option>)}
                      </select>
                      {draft.status !== editor?.confirmed.status && <p className="mt-1 text-xs text-amber-800">Clique em Salvar para confirmar a mudança de situação.</p>}
                    </Field>
                  </div>
                </fieldset>

                <fieldset disabled={Boolean(termsLocked)} className={`mt-3 ${propostaSubPanelCls}`}>
                  <p className="mb-3 text-[11px] font-semibold uppercase text-muted-foreground">Valores e datas</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Valor da dívida"><input type="number" inputMode="decimal" className={inputCls} value={draft.valorDivida} onChange={(e) => atualizarValores(draft, setDraft, { valorDivida: Number(e.target.value) })} /></Field>
                    <Field label="Valor proposto"><input type="number" inputMode="decimal" className={inputCls} value={draft.valorProposta} onChange={(e) => atualizarValores(draft, setDraft, { valorProposta: Number(e.target.value) })} /></Field>
                    <Field label="Data da proposta"><input type="date" className={inputCls} value={draft.dataCriacao || ''} onChange={(e) => setDraft({ ...draft, dataCriacao: e.target.value })} /></Field>
                    <Field label="Validade"><input type="date" className={inputCls} value={draft.dataValidade || ''} onChange={(e) => setDraft({ ...draft, dataValidade: e.target.value })} /></Field>
                  </div>
                </fieldset>

                <div className={`mt-3 ${propostaSubPanelCls}`}>
                  <SectionHeader
                    icon={FileText}
                    eyebrow="Apoio da negociação"
                    title="Textos de apoio"
                    hint="Argumentos e notas internas ficam separados dos termos formais para facilitar revisão e PDF."
                  />
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <Field label="Fundamentação">
                      <textarea disabled={Boolean(termsLocked)} className={`${inputCls} min-h-[168px] resize-y leading-relaxed`} value={draft.fundamentacao || ''} onChange={(e) => setDraft({ ...draft, fundamentacao: e.target.value })} />
                    </Field>
                    <Field label="Observações internas">
                      <textarea className={`${inputCls} min-h-[168px] resize-y leading-relaxed`} value={draft.observacoes || ''} onChange={(e) => setDraft({ ...draft, observacoes: e.target.value })} />
                    </Field>
                  </div>
                </div>
              </div>

              <fieldset disabled={Boolean(termsLocked)} className={`${propostaPanelCls} min-w-0 overflow-hidden p-4`}>
                <SectionHeader
                  icon={ListChecks}
                  eyebrow="Termos"
                  title="Termos e condições"
                  hint="Cada condição vira item separado para conferência e uso no PDF."
                  action={
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, condicoes: [...(draft.condicoes || []), 'Nova condição'] })}
                      className={secondaryBtnCls}
                    >
                      <Plus className="h-4 w-4" />
                      Condição
                    </button>
                  }
                />
                <div className="mt-3 space-y-2">
                  {(draft.condicoes || []).length > 0 ? (
                    (draft.condicoes || []).map((condicao, idx) => (
                      <div key={`condicao-${idx}`} className="rounded-lg border border-aletis-borda bg-aletis-cream-papel/45 p-3 shadow-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                          <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-aletis-borda bg-card text-xs font-semibold text-[var(--text-soft)] sm:mt-1">
                            {idx + 1}
                          </span>
                          <textarea
                            className={`${inputCls} min-h-[96px] resize-y leading-relaxed`}
                            value={condicao}
                            onChange={(e) => updateCondition(draft, setDraft, idx, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeCondition(draft, setDraft, idx)}
                            className={`${iconBtnCls} mt-1 hover:bg-red-50 hover:text-red-600`}
                            title="Remover condição"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, condicoes: ['Condição a definir'] })}
                      className="flex min-h-[140px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-aletis-borda bg-aletis-cream-papel/45 px-4 py-5 text-center text-sm text-muted-foreground transition hover:border-aletis-verde/40 hover:bg-aletis-verde/5"
                    >
                      <ListChecks className="mb-2 h-5 w-5 text-foreground" />
                      Adicionar primeira condição
                    </button>
                  )}
                </div>
              </fieldset>
            </section>

            <fieldset disabled={Boolean(termsLocked)} className={`${propostaPanelCls} min-w-0 overflow-hidden p-4`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <SectionHeader
                  icon={ListChecks}
                  eyebrow="Demonstrativo"
                  title="Fluxo / itens da proposta"
                  hint="Parcelas, pagamentos, dação, compensação ou descontos extraídos do documento."
                />
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, itens: [...(draft.itens || []), { descricao: 'Nova parcela', valor: 0, tipo: 'parcela' }] })}
                  className={secondaryBtnCls}
                >
                  <Plus className="h-4 w-4" />
                  Item
                </button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <InfoPill label="Itens no fluxo" value={String(draft.itens?.length || 0)} />
                <InfoPill label="Total lançado" value={fmtBRL(draftFluxoTotal)} />
                <InfoPill label="Valor proposto" value={fmtBRL(draft.valorProposta)} />
              </div>
              <div className="mt-3 space-y-3 md:hidden">
                {(draft.itens || []).map((item, idx) => (
                  <div key={`mobile-${idx}-${item.descricao}`} className="rounded-lg border border-aletis-borda bg-aletis-cream-papel/45 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="rounded-lg border border-aletis-borda bg-card px-2.5 py-1 text-[11px] font-semibold text-[var(--text-soft)]">
                        Item {idx + 1}
                      </span>
                      <button type="button" className={`${iconBtnCls} hover:bg-red-50 hover:text-red-600`} onClick={() => setDraft({ ...draft, itens: draft.itens.filter((_, i) => i !== idx) })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3">
                      <Field label="Descrição">
                        <input className={inputCls} value={item.descricao} onChange={(e) => updateItem(draft, setDraft, idx, { descricao: e.target.value })} />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Tipo">
                          <select className={inputCls} value={item.tipo} onChange={(e) => updateItem(draft, setDraft, idx, { tipo: e.target.value as ItemTipo })}>
                            <option value="parcela">Parcela</option>
                            <option value="pagamento">Pagamento</option>
                            <option value="dacao">Dação</option>
                            <option value="compensacao">Compensação</option>
                            <option value="desconto">Desconto</option>
                          </select>
                        </Field>
                        <Field label="Valor">
                          <input type="number" className={`${inputCls} text-right tabular-nums`} value={item.valor || 0} onChange={(e) => updateItem(draft, setDraft, idx, { valor: Number(e.target.value) })} />
                        </Field>
                      </div>
                      <Field label="Data">
                        <input type="date" className={inputCls} value={item.data || ''} onChange={(e) => updateItem(draft, setDraft, idx, { data: e.target.value })} />
                      </Field>
                    </div>
                  </div>
                ))}
                {(!draft.itens || draft.itens.length === 0) && (
                  <div className="rounded-lg border border-dashed border-aletis-borda bg-aletis-cream-papel/45 px-4 py-8 text-center text-sm text-muted-foreground">
                    Nenhum item lançado. Adicione parcelas ou pagamentos para montar o demonstrativo.
                  </div>
                )}
              </div>
              <div className="mt-3 hidden overflow-x-auto rounded-lg border border-aletis-borda bg-card md:block">
                <table className="ui-table w-full min-w-[880px] table-fixed text-xs">
                  <thead className="bg-aletis-cream-papel/70 text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="w-[38%] px-3 py-2 text-left">Descrição</th>
                      <th className="w-[18%] px-3 py-2 text-left">Tipo</th>
                      <th className="w-[18%] px-3 py-2 text-right">Valor</th>
                      <th className="w-[18%] px-3 py-2 text-left">Data</th>
                      <th className="w-[8%] px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(draft.itens || []).map((item, idx) => (
                      <tr key={`${idx}-${item.descricao}`} className="border-t border-aletis-borda/70">
                        <td className="px-3 py-2 align-top">
                          <input className={inputCls} value={item.descricao} onChange={(e) => updateItem(draft, setDraft, idx, { descricao: e.target.value })} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select className={inputCls} value={item.tipo} onChange={(e) => updateItem(draft, setDraft, idx, { tipo: e.target.value as ItemTipo })}>
                            <option value="parcela">Parcela</option>
                            <option value="pagamento">Pagamento</option>
                            <option value="dacao">Dação</option>
                            <option value="compensacao">Compensação</option>
                            <option value="desconto">Desconto</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="number" className={`${inputCls} text-right tabular-nums`} value={item.valor || 0} onChange={(e) => updateItem(draft, setDraft, idx, { valor: Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input type="date" className={inputCls} value={item.data || ''} onChange={(e) => updateItem(draft, setDraft, idx, { data: e.target.value })} />
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          <button type="button" className={`${iconBtnCls} hover:bg-red-50 hover:text-red-600`} onClick={() => setDraft({ ...draft, itens: draft.itens.filter((_, i) => i !== idx) })}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {(!draft.itens || draft.itens.length === 0) && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                          Nenhum item lançado. Adicione parcelas ou pagamentos para montar o demonstrativo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </fieldset>
          </main>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, tone = 'neutral', icon: Icon }: { label: string; value: string; tone?: 'neutral' | 'good'; icon?: typeof Calendar }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tone === 'good' ? 'border-emerald-200 bg-emerald-50' : 'border-aletis-borda bg-aletis-cream-papel/55'}`}>
      <p className="flex items-center gap-1 text-[11px] font-body font-semibold uppercase text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className={`mt-1 break-words text-base font-display font-semibold tabular-nums ${tone === 'good' ? 'text-emerald-700' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

function ProposalSummaryCell({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' }) {
  return (
    <div className="min-w-0 border-b border-aletis-borda px-4 py-3 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <p className="text-[11px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate text-sm font-display font-semibold tabular-nums ${tone === 'good' ? 'text-emerald-700' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  hint,
  action,
}: {
  icon: typeof Calendar
  eyebrow: string
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-aletis-borda bg-aletis-bege/45 text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-muted-foreground">{eyebrow}</p>
          <h4 className="mt-0.5 text-sm font-display font-semibold text-foreground">{title}</h4>
          {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {action && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
    </div>
  )
}

function saveStateLabel(state: 'saved' | 'dirty' | 'saving' | 'error') {
  if (state === 'saving') return 'Salvando proposta...'
  if (state === 'dirty') return 'Alterações ainda não salvas'
  if (state === 'error') return 'Erro ao salvar'
  return 'Proposta salva'
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-aletis-borda bg-aletis-cream-papel/55 px-2.5 py-2">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words font-semibold text-foreground">{value}</p>
    </div>
  )
}

type AlertTone = 'good' | 'warn' | 'bad'

function alertCls(tone: AlertTone) {
  if (tone === 'good') return 'flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800'
  if (tone === 'bad') return 'flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700'
  return 'flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'aceita' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    status === 'enviada' || status === 'em_analise' ? 'bg-blue-50 text-blue-700 border-blue-200' :
    status === 'rejeitada' || status === 'expirada' ? 'bg-red-50 text-red-700 border-red-200' :
    'bg-aletis-cream text-muted-foreground border-aletis-borda'
  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${cls}`}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function economiaProposta(p: Proposta): number {
  return Math.max(0, (Number(p.valorDivida) || 0) - (Number(p.valorProposta) || 0))
}

function proposalCompleteness(p: Proposta): number {
  const checks = [
    hasUsefulCredor(p.credor),
    Boolean(p.titulo?.trim()),
    Number(p.valorDivida) > 0,
    Number(p.valorProposta) > 0,
    Boolean(p.dataValidade),
    (p.condicoes || []).filter(Boolean).length > 0,
    (p.itens || []).length > 0,
    Boolean(p.arquivoOrigem?.filename || p.extracaoIa?.resumo || p.observacoes || p.fundamentacao),
  ]
  const done = checks.filter(Boolean).length
  return Math.round((done / checks.length) * 100)
}

function buildProposalAlerts(p: Proposta): Array<{ tone: AlertTone; text: string }> {
  const alerts: Array<{ tone: AlertTone; text: string }> = []
  if (!hasUsefulCredor(p.credor)) alerts.push({ tone: 'warn', text: 'Credor ainda precisa ser confirmado antes de usar a proposta em negociação.' })
  if (Number(p.valorDivida) <= 0 || Number(p.valorProposta) <= 0) alerts.push({ tone: 'warn', text: 'Valores principais incompletos: confira dívida base e valor proposto.' })
  if (Number(p.valorProposta) > Number(p.valorDivida) && Number(p.valorDivida) > 0) alerts.push({ tone: 'bad', text: 'Valor proposto maior que a dívida base. Confira se há capitalização, taxa ou erro de lançamento.' })
  if (isExpired(p.dataValidade) && p.status !== 'aceita') alerts.push({ tone: 'bad', text: 'Validade vencida. Atualize a data ou marque como expirada antes de avançar.' })
  if ((p.condicoes || []).filter(Boolean).length === 0) alerts.push({ tone: 'warn', text: 'Nenhuma condição cadastrada. Registre prazo, garantias, carência, entrada ou exigências do banco.' })
  if ((p.itens || []).length === 0) alerts.push({ tone: 'warn', text: 'Fluxo da proposta sem itens. Lance parcelas, pagamento à vista, dação ou descontos para montar o demonstrativo.' })
  if ((p.extracaoIa?.confianca || 1) < 0.65) alerts.push({ tone: 'warn', text: 'Leitura automática com baixa confiança. Revise manualmente os campos extraídos.' })
  if (p.extracaoIa?.erro) alerts.push({ tone: 'warn', text: `Leitura parcial do arquivo: ${p.extracaoIa.erro}` })
  if (alerts.length === 0) alerts.push({ tone: 'good', text: 'Proposta com os campos essenciais preenchidos. Ainda assim, valide valores, datas e condições antes de enviar.' })
  return alerts
}

function buildConferenceChecks(p: Proposta): Array<{ label: string; hint: string; ok: boolean }> {
  return [
    {
      label: 'Credor e tipo identificados',
      hint: hasUsefulCredor(p.credor) ? `${p.credor} · ${TIPO_LABEL[p.tipo] || p.tipo}` : 'Informe banco/credor e tipo da proposta.',
      ok: hasUsefulCredor(p.credor),
    },
    {
      label: 'Valores principais preenchidos',
      hint: Number(p.valorDivida) > 0 && Number(p.valorProposta) > 0 ? `${fmtBRL(p.valorDivida)} → ${fmtBRL(p.valorProposta)}` : 'Preencha dívida base e valor proposto.',
      ok: Number(p.valorDivida) > 0 && Number(p.valorProposta) > 0,
    },
    {
      label: 'Prazo de validade definido',
      hint: p.dataValidade ? `Validade em ${fmtData(p.dataValidade)}` : 'Informe a validade para controle de follow-up.',
      ok: Boolean(p.dataValidade) && !isExpired(p.dataValidade),
    },
    {
      label: 'Condições registradas',
      hint: `${(p.condicoes || []).filter(Boolean).length} condição(ões) cadastrada(s).`,
      ok: (p.condicoes || []).filter(Boolean).length > 0,
    },
    {
      label: 'Demonstrativo financeiro montado',
      hint: `${p.itens?.length || 0} item(ns) no fluxo da proposta.`,
      ok: (p.itens || []).length > 0,
    },
    {
      label: 'Arquivo ou justificativa anexada',
      hint: p.arquivoOrigem?.filename || p.extracaoIa?.resumo ? 'Há origem documental vinculada.' : 'Anexe proposta, PDF do banco ou registre fundamentação.',
      ok: Boolean(p.arquivoOrigem?.filename || p.extracaoIa?.resumo || p.fundamentacao),
    },
  ]
}

function isExpired(date: string | undefined) {
  if (!date) return false
  const d = new Date(`${date}T23:59:59`)
  if (Number.isNaN(d.getTime())) return false
  return d.getTime() < Date.now()
}

function hasUsefulCredor(credor: string | undefined) {
  const value = (credor || '').trim().toLowerCase()
  return Boolean(value && !['credor a confirmar', 'banco a definir', 'banco'].includes(value))
}

function updateItem(draft: Proposta, setDraft: (p: Proposta) => void, idx: number, patch: Partial<ItemProposta>) {
  const itens = [...(draft.itens || [])]
  itens[idx] = { ...itens[idx], ...patch }
  setDraft({ ...draft, itens })
}

function updateCondition(draft: Proposta, setDraft: (p: Proposta) => void, idx: number, value: string) {
  const condicoes = [...(draft.condicoes || [])]
  condicoes[idx] = value
  setDraft({ ...draft, condicoes })
}

function removeCondition(draft: Proposta, setDraft: (p: Proposta) => void, idx: number) {
  setDraft({ ...draft, condicoes: (draft.condicoes || []).filter((_, i) => i !== idx) })
}

function atualizarValores(draft: Proposta, setDraft: (p: Proposta) => void, patch: Partial<Pick<Proposta, 'valorDivida' | 'valorProposta'>>) {
  const next = { ...draft, ...patch }
  next.descontoPercentual = next.valorDivida > 0 ? ((next.valorDivida - next.valorProposta) / next.valorDivida) * 100 : 0
  setDraft(next)
}

function selectCurrentProposalsForStats(
  proposals: Proposta[],
  demands: DemandaProposalContext[],
): Proposta[] {
  const selected = new Map<string, Proposta>()
  const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]))

  for (const demand of demands) {
    const explicitId = demand.propostaPrincipalId
      ?? demand.propostas?.find((proposal) => proposal.principal)?.id
    const candidates = proposals.filter((proposal) => proposal.demandaId === demand.id)
    const current = (explicitId ? byId.get(explicitId) : undefined)
      ?? [...candidates].sort(compareProposals)[0]
    if (current) selected.set(current.id, current)
  }

  const grouped = new Map<string, Proposta[]>()
  for (const proposal of proposals) {
    if (!proposal.demandaId) {
      selected.set(proposal.id, proposal)
      continue
    }
    const group = grouped.get(proposal.demandaId) ?? []
    group.push(proposal)
    grouped.set(proposal.demandaId, group)
  }
  for (const group of grouped.values()) {
    if (group.some((proposal) => selected.has(proposal.id))) continue
    const current = [...group].sort(compareProposals)[0]
    if (current) selected.set(current.id, current)
  }

  return Array.from(selected.values()).sort(compareProposals)
}

function compareProposals(a: Proposta, b: Proposta): number {
  const aGroup = normalizeSearch(a.demandaTitulo || a.assunto || a.demandaId || 'sem demanda')
  const bGroup = normalizeSearch(b.demandaTitulo || b.assunto || b.demandaId || 'sem demanda')
  const groupDiff = aGroup.localeCompare(bGroup, 'pt-BR')
  if (groupDiff !== 0) return groupDiff
  const versionDiff = Number(b.versaoDemanda ?? 0) - Number(a.versaoDemanda ?? 0)
  if (versionDiff !== 0) return versionDiff
  return dateValue(b.ultimaAtualizacao || b.dataCriacao) - dateValue(a.ultimaAtualizacao || a.dataCriacao)
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function dateValue(value: string | undefined): number {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizarProposta(raw: any): Proposta {
  return {
    id: String(raw.id),
    revision: Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
    clienteId: String(raw.clienteId || ''),
    clienteNome: raw.clienteNome || '',
    demandaId: raw.demandaId || undefined,
    demandaTitulo: raw.demandaTitulo || undefined,
    versaoDemanda: Number(raw.versaoDemanda) || undefined,
    assunto: raw.assunto || undefined,
    credor: raw.credor || 'Credor a confirmar',
    titulo: raw.titulo || 'Proposta sem título',
    tipo: raw.tipo || 'renegociacao',
    status: raw.status || 'rascunho',
    valorDivida: Number(raw.valorDivida) || 0,
    valorProposta: Number(raw.valorProposta) || 0,
    descontoPercentual: Number(raw.descontoPercentual) || 0,
    itens: Array.isArray(raw.itens) ? raw.itens.map((i: any) => ({ descricao: i.descricao || 'Item', valor: Number(i.valor) || 0, tipo: i.tipo || 'parcela', data: i.data || '' })) : [],
    condicoes: Array.isArray(raw.condicoes) ? raw.condicoes.map(String) : [],
    fundamentacao: raw.fundamentacao || '',
    dataCriacao: raw.dataCriacao || '',
    dataValidade: raw.dataValidade || '',
    ultimaAtualizacao: raw.ultimaAtualizacao || '',
    pdfUrl: raw.pdfUrl || null,
    observacoes: raw.observacoes || '',
    arquivoOrigem: raw.arquivoOrigem,
    extracaoIa: raw.extracaoIa,
  }
}

function fmtBRL(v: number | undefined | null) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v) || 0)
}

function fmtData(s: string | undefined) {
  if (!s) return '—'
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR')
}

function resumoOperacional(p: Proposta) {
  const economia = Math.max(0, (Number(p.valorDivida) || 0) - (Number(p.valorProposta) || 0))
  const partes = [
    `Proposta de ${TIPO_LABEL[p.tipo] || p.tipo} para ${p.credor || 'credor a confirmar'}.`,
    `Dívida base de ${fmtBRL(p.valorDivida)} e valor proposto de ${fmtBRL(p.valorProposta)}.`,
    economia > 0 ? `Economia estimada de ${fmtBRL(economia)} (${Number(p.descontoPercentual || 0).toFixed(1)}%).` : 'Sem desconto econômico registrado.',
    `${p.itens?.length || 0} item(ns) de fluxo e ${p.condicoes?.length || 0} condição(ões) cadastrada(s).`,
  ]
  return partes.join(' ')
}

const inputCls = 'w-full rounded-lg border border-aletis-borda bg-card px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-aletis-grafite-claro/70 focus:border-aletis-verde focus:ring-2 focus:ring-aletis-verde/15'
const secondaryBtnCls = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-aletis-borda bg-card px-3 text-xs font-semibold text-foreground transition hover:border-aletis-verde/40 hover:bg-aletis-verde/5 disabled:cursor-not-allowed disabled:opacity-50'
const iconBtnCls = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-aletis-borda bg-card text-muted-foreground transition hover:border-aletis-verde/40 hover:text-aletis-verde disabled:cursor-not-allowed disabled:opacity-40'
