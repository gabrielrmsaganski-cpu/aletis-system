import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
} from 'lucide-react'

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
interface LeadScore {
  total: number
  breakdown: {
    divida: number
    ajuizamento: number
    recencia: number
    agroMatch: number
    hectares: number
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
interface LeadFull {
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
  cnpj?: CnpjEnrichment
  area: AreaEstimation
  car?: CarConsultaResult
  carSource?: 'offline' | 'live'
  carOutrosImoveis?: CarConsultaResult[]
  score: LeadScore
  status?: LeadStatus
  enriquecido?: boolean
  enriquecidoEm?: string
  excluidoMotivo?: string
  excluidoEm?: string
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
interface Stats {
  totalLeads: number
  totalDivida: number
  honorariosPotenciaisTotal: number
  leadsQuentes: number
  leadsComAjuizamento: number
  leadsCompletos: number
  leadsExcluidos: number
  porUf: Array<{ uf: string; count: number; divida: number }>
  porFaixaDivida: Array<{ faixa: string; count: number }>
  topSignals: Array<{ signal: string; count: number }>
  manifest: { fonte: string; atualizadoEm: string }
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
const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtBRLShort = (v: number): string => {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(2)} bi`
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(2)} mi`
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(1)} mil`
  return `R$ ${v.toFixed(0)}`
}
const fmtHa = (ha: number): string =>
  ha >= 1000 ? `${(ha / 1000).toFixed(ha >= 10000 ? 0 : 1)} mil ha` : `${ha.toLocaleString('pt-BR')} ha`
const fmtNum = (n: number): string => n.toLocaleString('pt-BR')

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const CLASSIF_STYLE: Record<string, { bg: string; text: string; border: string; label: string; icon: React.ElementType }> = {
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

  // Bulk enrich
  const [bulkOpen, setBulkOpen] = useState(false)
  const [batch, setBatch] = useState<BatchState>({
    phase: 'idle', batchId: null, total: 0, processed: 0, ok: 0, fail: 0, errors: [],
  })

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
    termo: termo || undefined,
    status: statusTab,
    sortBy,
  }), [uf, minHectares, minDivida, maxDivida, tipoPessoa, apenasAjuizadas, termo, sortBy, statusTab])

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

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadSicarStatus() }, [loadSicarStatus])
  useEffect(() => { search() }, [search])
  // reset para página 1 quando a aba de status muda
  useEffect(() => { setPage(1) }, [statusTab])

  const handleEnrich = useCallback(async (cpfCnpj: string) => {
    setEnriching(cpfCnpj)
    try {
      const r = await fetch(`/api/prospeccao/enriquecer/${cpfCnpj}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const j = await r.json()
      if (j.success) {
        setSelectedLead(j.data)
        // Atualiza lista também (score pode ter mudado)
        setLeads((prev) => prev.map((l) => (l.cpfCnpjClean === j.data.cpfCnpjClean ? j.data : l)))
      }
    } catch (e) {
      console.warn('[enrich] erro', e)
    } finally {
      setEnriching(null)
    }
  }, [])

  const handleConsultarCar = useCallback(async (cpfCnpj: string, codImovel: string) => {
    setCarLoading(cpfCnpj)
    setCarError(null)
    try {
      const r = await fetch(`/api/prospeccao/enriquecer/${cpfCnpj}`, {
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
    try {
      const r = await fetch(`/api/prospeccao/lead/${cpfCnpj}`, {
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

  const handleRestaurar = useCallback(async (cpfCnpj: string) => {
    setDeleting(cpfCnpj)
    try {
      const r = await fetch(`/api/prospeccao/lead/${cpfCnpj}/restaurar`, { method: 'POST' })
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
  }, [uf, minHectares, minDivida, maxDivida, tipoPessoa, apenasAjuizadas, termo, sortBy])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-6">
      {/* Hero OODA */}
      <HeroOODA stats={stats} loading={loadingStats} sicarStatus={sicarStatus} />

      {/* Toolbar de filtros */}
      <FilterPanel
        uf={uf} setUf={setUf}
        minHectares={minHectares} setMinHectares={setMinHectares}
        minDivida={minDivida} setMinDivida={setMinDivida}
        tipoPessoa={tipoPessoa} setTipoPessoa={setTipoPessoa}
        apenasAjuizadas={apenasAjuizadas} setApenasAjuizadas={setApenasAjuizadas}
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
          carError={carError}
          sicarStatus={sicarStatus}
          onClose={() => { setSelectedLead(null); setCarError(null) }}
          onEnrich={() => handleEnrich(selectedLead.cpfCnpjClean)}
          onExcluir={(motivo) => handleExcluir(selectedLead.cpfCnpjClean, motivo)}
          onRestaurar={() => handleRestaurar(selectedLead.cpfCnpjClean)}
          onConsultarCar={(codImovel) => handleConsultarCar(selectedLead.cpfCnpjClean, codImovel)}
        />
      )}

      {/* Modal de enriquecimento em lote */}
      {bulkOpen && (
        <BulkEnrichModal
          initialFilters={{ uf, minHectares, minDivida, tipoPessoa, apenasAjuizadas, termo }}
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-aletis-verde via-aletis-verde-escuro to-[#06281c] text-white shadow-xl">
      {/* Pattern */}
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'radial-gradient(circle at 20% 50%, #C9A84C 0%, transparent 50%), radial-gradient(circle at 80% 80%, #2A8F64 0%, transparent 50%)',
      }} />

      <div className="relative p-6 lg:p-8">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-aletis-dourado/15 border border-aletis-dourado/30 text-aletis-dourado text-[11px] font-semibold uppercase tracking-widest mb-3">
              <Cpu size={12} /> OODA · Prospecção cirúrgica
            </div>
            <h1 className="font-display text-3xl lg:text-4xl font-bold leading-tight mb-2">
              Leads agro com dívida ativa
            </h1>
            <p className="text-white/70 text-sm max-w-2xl">
              Busca profunda no <b>PGFN</b> + enriquecimento <b>BrasilAPI</b> + área oficial via <b>SICAR</b>{' '}
              (reCAPTCHA resolvido por 2captcha) + <b>scoring</b> multi-dimensional.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Sparkles size={14} className="text-aletis-dourado" />
              {loading ? 'carregando…' : stats ? `${fmtNum(stats.totalLeads)} leads indexados` : '—'}
            </div>
            <SicarStatusBadge status={sicarStatus} />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 lg:gap-4">
          <KpiTile
            icon={Target}
            label="Leads agro"
            value={stats ? fmtNum(stats.totalLeads) : '…'}
            sub="PGFN 2025-Q4"
            accent="dourado"
          />
          <KpiTile
            icon={Flame}
            label="Quentes (score ≥ 75)"
            value={stats ? fmtNum(stats.leadsQuentes) : '…'}
            sub={stats ? `${((stats.leadsQuentes / stats.totalLeads) * 100).toFixed(1)}% do total` : ''}
            accent="vermelho"
          />
          <KpiTile
            icon={Gavel}
            label="Com ajuizamento"
            value={stats ? fmtNum(stats.leadsComAjuizamento) : '…'}
            sub="urgência alta"
            accent="ambar"
          />
          <KpiTile
            icon={CheckCircle2}
            label="Completas"
            value={stats ? fmtNum(stats.leadsCompletos) : '…'}
            sub={stats?.leadsExcluidos ? `${fmtNum(stats.leadsExcluidos)} excluídos` : 'enriquecidos + persistidos'}
            accent="verde"
          />
          <KpiTile
            icon={DollarSign}
            label="Dívida total indexada"
            value={stats ? fmtBRLShort(stats.totalDivida) : '…'}
            sub="soma consolidada"
            accent="verde"
          />
          <KpiTile
            icon={TrendingUp}
            label="Honorários potenciais"
            value={stats ? fmtBRLShort(stats.honorariosPotenciaisTotal) : '…'}
            sub="modelo 1% ALETIS"
            accent="dourado"
          />
        </div>

        {/* Strip de topSignals */}
        {stats && stats.topSignals.length > 0 && (
          <div className="mt-6 pt-6 border-t border-white/10">
            <p className="text-[11px] uppercase tracking-widest text-white/50 mb-2">
              Sinais agro identificados
            </p>
            <div className="flex flex-wrap gap-2">
              {stats.topSignals.slice(0, 12).map((s) => (
                <span
                  key={s.signal}
                  className="px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-white/80 flex items-center gap-1.5"
                >
                  <Wheat size={11} className="text-aletis-dourado" />
                  {s.signal}
                  <span className="text-white/50 font-mono text-[10px]">{fmtNum(s.count)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
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
  const color = online
    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30'
    : 'text-amber-300 bg-amber-500/10 border-amber-400/30'
  const balance = captcha.balanceUsd != null ? `$${captcha.balanceUsd.toFixed(2)}` : '—'
  const balanceTone = (captcha.balanceUsd ?? 0) < 0.5 ? 'text-red-300' : 'text-white/70'
  const indexLoaded = index?.loaded
  const indexColor = indexLoaded
    ? 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30'
    : 'text-white/50 bg-white/5 border-white/10'
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] ${color}`}>
        <StatusIcon size={12} />
        <span className="font-semibold">SICAR · {online ? 'online' : 'indisponível'}</span>
        {!online && sicar.reason && (
          <span className="text-white/50 truncate max-w-[220px]" title={sicar.reason}>
            · {sicar.reason}
          </span>
        )}
        <span className="text-white/30">|</span>
        <span className={`flex items-center gap-1 ${balanceTone}`}>
          <Satellite size={11} /> 2captcha {captcha.enabled ? balance : 'off'}
        </span>
      </div>
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] ${indexColor}`}>
        <Trees size={10} />
        {indexLoaded ? (
          <>
            <span className="font-semibold">
              Índice offline · {fmtNum(index.totalImoveis)} imóveis
            </span>
            {Object.keys(index.byUf).length > 0 && (
              <span className="text-white/50">
                {Object.entries(index.byUf)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([uf, n]) => `${uf}:${n >= 1000 ? (n / 1000).toFixed(0) + 'k' : n}`)
                  .join(' · ')}
              </span>
            )}
          </>
        ) : (
          <span>Índice offline vazio — rode <code className="font-mono">pnpm ingest:sicar</code></span>
        )}
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
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  accent: 'dourado' | 'vermelho' | 'ambar' | 'verde'
}) {
  const accentColor = {
    dourado: 'text-aletis-dourado bg-aletis-dourado/10',
    vermelho: 'text-red-300 bg-red-500/15',
    ambar: 'text-amber-300 bg-amber-500/15',
    verde: 'text-emerald-300 bg-emerald-500/15',
  }[accent]

  return (
    <div className="bg-white/5 backdrop-blur rounded-xl border border-white/10 p-4 hover:bg-white/10 transition">
      <div className={`w-9 h-9 rounded-lg ${accentColor} flex items-center justify-center mb-2`}>
        <Icon size={18} />
      </div>
      <p className="text-xs uppercase tracking-wider text-white/50 mb-0.5">{label}</p>
      <p className="font-display text-xl lg:text-2xl font-bold">{value}</p>
      {sub && <p className="text-[10px] text-white/40 mt-0.5">{sub}</p>}
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
    termo, setTermo, sortBy, setSortBy, onApply, onExport, total, loading,
  } = props

  return (
    <div className="bg-white dark:bg-aletis-grafite-escuro rounded-2xl border border-aletis-borda dark:border-white/5 shadow-sm p-4 lg:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Filter size={16} className="text-aletis-verde" />
        <h3 className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">Filtros cirúrgicos</h3>
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
            Buscar ({fmtNum(total)})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
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

      <div className="mt-3 flex items-center gap-4">
        <label className="inline-flex items-center gap-2 text-xs text-aletis-grafite-medio dark:text-white/60 cursor-pointer">
          <input
            type="checkbox"
            checked={apenasAjuizadas}
            onChange={(e) => setApenasAjuizadas(e.target.checked)}
            className="accent-aletis-verde"
          />
          <Gavel size={12} /> Apenas com ajuizamento (urgência)
        </label>
      </div>
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
      className={`group px-6 py-4 transition cursor-pointer ${
        isExcluido
          ? 'opacity-60 hover:opacity-80 bg-slate-50 dark:bg-white/[0.02]'
          : 'hover:bg-aletis-bege/60 dark:hover:bg-white/5'
      }`}
    >
      <div className="flex items-center gap-4 flex-wrap">
        {/* Score bubble */}
        <div
          className={`flex-shrink-0 w-14 h-14 rounded-xl border-2 ${cls.border} ${cls.bg} flex flex-col items-center justify-center`}
          title={`${cls.label} · ${lead.score.total} pts`}
        >
          <span className={`font-display text-xl font-bold ${cls.text}`}>{lead.score.total}</span>
          <span className={`text-[9px] uppercase tracking-wider ${cls.text}`}>{cls.label}</span>
        </div>

        {/* Ficha */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3 className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white truncate">
              {lead.nome}
            </h3>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-aletis-grafite-medio dark:text-white/40 bg-aletis-bege dark:bg-white/5">
              {lead.tipoPessoa}
            </span>
            {isCompleta && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/30 flex items-center gap-1">
                <CheckCircle2 size={10} /> completa
              </span>
            )}
            {isExcluido && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 flex items-center gap-1">
                <Archive size={10} /> excluído
              </span>
            )}
            {lead.temAjuizada && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/30 flex items-center gap-1">
                <Gavel size={10} /> ajuizada
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs text-aletis-grafite-medio dark:text-white/50">
            <span className="flex items-center gap-1"><MapPin size={11} /> {lead.uf}</span>
            <span className="flex items-center gap-1"><Hash size={11} /> {lead.cpfCnpj}</span>
            <span className="flex items-center gap-1"><FileText size={11} /> {lead.qtdInscricoes} inscrições</span>
            {isExcluido && lead.excluidoMotivo && (
              <span className="italic text-slate-500">motivo: {lead.excluidoMotivo}</span>
            )}
            {Array.from(new Set(lead.agroSignals)).slice(0, 3).map((s) => (
              <span key={s} className="flex items-center gap-1 text-aletis-verde">
                <Wheat size={11} /> {s}
              </span>
            ))}
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-4 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/40">Dívida</p>
            <p className="font-mono text-sm font-semibold text-aletis-grafite-escuro dark:text-white">
              {fmtBRLShort(lead.totalDivida)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/40">Área</p>
            <p className={`font-mono text-sm font-semibold ${CONFIDENCE_COLOR[lead.area.confidence]}`}>
              {lead.area.hectaresEstimados > 0 ? fmtHa(lead.area.hectaresEstimados) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/40">Honor.</p>
            <p className="font-mono text-sm font-semibold text-aletis-dourado">
              {fmtBRLShort(lead.score.honorariosEstimados)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {!isCompleta && !isExcluido && (
            <button
              onClick={(e) => { e.stopPropagation(); onEnrich() }}
              disabled={enriching}
              title={lead.tipoPessoa === 'PJ' ? 'BrasilAPI + índice SICAR' : 'Lookup índice SICAR offline'}
              className="px-2.5 py-1.5 rounded-lg border border-aletis-verde/30 text-aletis-verde hover:bg-aletis-verde/10 transition text-xs font-medium flex items-center gap-1 disabled:opacity-50"
            >
              {enriching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Enriquecer
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
  initialFilters: { uf: string; minHectares: number; minDivida: number; tipoPessoa: '' | 'PF' | 'PJ'; apenasAjuizadas: boolean; termo: string }
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
    termo: bulkTermo || undefined,
  }), [bulkUf, bulkTipoPessoa, bulkMinDivida, bulkMaxDivida, bulkMinHectares, bulkApenasAjuizadas, bulkTermo])

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

                  <label className="inline-flex items-center gap-2 text-xs text-aletis-grafite-medio dark:text-white/60 cursor-pointer md:mt-6">
                    <input
                      type="checkbox"
                      checked={bulkApenasAjuizadas}
                      onChange={(e) => setBulkApenasAjuizadas(e.target.checked)}
                      className="accent-aletis-verde"
                    />
                    <Gavel size={12} /> Apenas com ajuizamento
                  </label>
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
  carError,
  sicarStatus,
  onClose,
  onEnrich,
  onExcluir,
  onRestaurar,
  onConsultarCar,
}: {
  lead: LeadFull
  enriching: boolean
  carLoading: boolean
  deleting: boolean
  carError: string | null
  sicarStatus: SicarStatus | null
  onClose: () => void
  onEnrich: () => void
  onExcluir: (motivo: string) => void
  onRestaurar: () => void
  onConsultarCar: (codImovel: string) => void
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
  const [tab, setTab] = useState<'identidade' | 'divida' | 'agro' | 'car' | 'socios' | 'score'>('identidade')

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
          <div className="grid grid-cols-4 gap-3 mt-4">
            <DrawerKpi label="Score" value={`${lead.score.total}`} sub={cls.label} />
            <DrawerKpi label="Dívida total" value={fmtBRLShort(lead.totalDivida)} sub="consolidada" />
            <DrawerKpi label="Área estimada" value={lead.area.hectaresEstimados > 0 ? fmtHa(lead.area.hectaresEstimados) : '—'} sub={`conf. ${lead.area.confidence}`} />
            <DrawerKpi label="Honorários" value={fmtBRLShort(lead.score.honorariosEstimados)} sub="1% modelo ALETIS" />
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-3 border-b border-aletis-borda dark:border-white/5 flex gap-1 flex-wrap">
          {([
            { id: 'identidade', label: 'Identidade', icon: Building2 },
            { id: 'divida', label: 'Dívida ativa', icon: Gavel },
            { id: 'agro', label: 'Sinais agro', icon: Wheat },
            { id: 'car', label: 'CAR real', icon: Trees },
            { id: 'socios', label: 'Sócios/QSA', icon: Users },
            { id: 'score', label: 'Score', icon: Gauge },
          ] as const).map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition ${
                  active
                    ? 'bg-aletis-bege dark:bg-white/5 text-aletis-verde border-b-2 border-aletis-verde -mb-px'
                    : 'text-aletis-grafite-medio dark:text-white/50 hover:text-aletis-verde'
                }`}
              >
                <Icon size={13} /> {t.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-sm">
          {tab === 'identidade' && <TabIdentidade lead={lead} onEnrich={onEnrich} enriching={enriching} />}
          {tab === 'divida' && <TabDivida lead={lead} />}
          {tab === 'agro' && <TabAgro lead={lead} />}
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
        </div>
      </aside>
    </div>
  )
}

function DrawerKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg border border-white/15 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-white/60 mb-0.5">{label}</p>
      <p className="font-display text-lg font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-white/50">{sub}</p>}
    </div>
  )
}

function TabIdentidade({ lead, onEnrich, enriching }: { lead: LeadFull; onEnrich: () => void; enriching: boolean }) {
  return (
    <>
      <InfoRow icon={Hash} label="CPF/CNPJ" value={lead.cpfCnpj} mono />
      <InfoRow icon={Building2} label="Tipo" value={lead.tipoPessoa === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física'} />
      <InfoRow icon={MapPin} label="UF (PGFN)" value={lead.uf} />
      <InfoRow icon={Calendar} label="Primeira inscrição" value={lead.primeiraInscricao || '—'} />
      <InfoRow icon={Calendar} label="Última inscrição" value={lead.ultimaInscricao || '—'} />

      {!lead.cnpj && !lead.car && (
        <div className="mt-4 p-4 rounded-xl border border-dashed border-aletis-verde/40 bg-aletis-verde/5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-aletis-verde" />
            <p className="font-semibold text-sm text-aletis-verde">Enriquecimento completo disponível</p>
          </div>
          <p className="text-xs text-aletis-grafite-medio dark:text-white/60 mb-3">
            {lead.tipoPessoa === 'PJ'
              ? 'BrasilAPI (sócios, CNAE, capital social) + busca automática no índice SICAR offline pela área real do imóvel.'
              : 'Busca automática no índice SICAR offline pela área real do imóvel (CPF/CNPJ ou razão social).'}
          </p>
          <button
            onClick={onEnrich}
            disabled={enriching}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-aletis-verde text-white text-xs font-semibold hover:bg-aletis-verde-escuro transition disabled:opacity-50"
          >
            {enriching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Enriquecer agora
          </button>
        </div>
      )}

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
  const groupedByFonte = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>()
    for (const d of lead.debts) {
      const e = m.get(d.fonte) || { count: 0, total: 0 }
      e.count++
      e.total += d.valor
      m.set(d.fonte, e)
    }
    return Array.from(m.entries()).map(([fonte, v]) => ({ fonte, ...v }))
  }, [lead.debts])

  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {groupedByFonte.map((g) => (
          <div key={g.fonte} className="bg-aletis-bege/50 dark:bg-white/5 rounded-lg p-3 border border-aletis-borda dark:border-white/10">
            <p className="text-[10px] uppercase tracking-wider text-aletis-grafite-medio dark:text-white/50">{g.fonte}</p>
            <p className="font-display text-lg font-bold text-aletis-grafite-escuro dark:text-white">{fmtBRLShort(g.total)}</p>
            <p className="text-[10px] text-aletis-grafite-medio dark:text-white/40">{g.count} inscrições</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-aletis-borda dark:border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-aletis-bege/50 dark:bg-white/5 text-aletis-grafite-medio dark:text-white/50">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Fonte</th>
              <th className="text-left px-3 py-2 font-medium">Inscrição</th>
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">Situação</th>
              <th className="text-center px-3 py-2 font-medium">Ajuiz.</th>
              <th className="text-right px-3 py-2 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-aletis-borda dark:divide-white/5">
            {lead.debts.slice(0, 50).map((d, i) => (
              <tr key={i} className="hover:bg-aletis-bege/30 dark:hover:bg-white/5">
                <td className="px-3 py-2 font-mono">{d.fonte}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{d.inscricao}</td>
                <td className="px-3 py-2">{d.dataInscricao}</td>
                <td className="px-3 py-2 truncate max-w-[180px]">{d.situacao}</td>
                <td className="px-3 py-2 text-center">
                  {d.ajuizado ? (
                    <span className="text-red-600 dark:text-red-400">●</span>
                  ) : (
                    <span className="text-aletis-grafite-medio dark:text-white/30">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold">{fmtBRL(d.valor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-aletis-verde/5 border-t-2 border-aletis-verde">
            <tr>
              <td colSpan={5} className="px-3 py-2 text-right font-semibold text-aletis-grafite-escuro dark:text-white">Total</td>
              <td className="px-3 py-2 text-right font-mono font-bold text-aletis-verde">{fmtBRL(lead.totalDivida)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {lead.debts.length > 50 && (
        <p className="text-[11px] text-aletis-grafite-medio dark:text-white/40 mt-2 text-center">
          Exibindo as 50 primeiras de {lead.debts.length} inscrições.
        </p>
      )}
    </>
  )
}

function TabAgro({ lead }: { lead: LeadFull }) {
  return (
    <>
      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4 bg-gradient-to-br from-aletis-verde/5 to-transparent">
        <div className="flex items-center gap-2 mb-2">
          <Tractor size={16} className="text-aletis-verde" />
          <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white">Estimativa de área rural</p>
          <span className={`ml-auto text-xs font-semibold ${CONFIDENCE_COLOR[lead.area.confidence]}`}>
            Confiança: {lead.area.confidence}
          </span>
        </div>
        <div className="flex items-baseline gap-3 mb-3">
          <span className="font-display text-4xl font-bold text-aletis-verde">
            {lead.area.hectaresEstimados > 0 ? fmtNum(lead.area.hectaresEstimados) : '—'}
          </span>
          <span className="text-aletis-grafite-medio dark:text-white/50 text-sm">hectares (est.)</span>
        </div>
        <p className="text-[11px] text-aletis-grafite-medio dark:text-white/50 mb-2">
          Método: <b className="text-aletis-grafite-escuro dark:text-white">{lead.area.metodo}</b>
        </p>
        {lead.area.explicacao && (
          <pre className="whitespace-pre-wrap text-[11px] text-aletis-grafite-medio dark:text-white/60 bg-aletis-bege/50 dark:bg-black/20 p-3 rounded-lg font-mono leading-relaxed">
            {lead.area.explicacao}
          </pre>
        )}
        <p className="text-[10px] text-aletis-grafite-medio dark:text-white/40 mt-3 italic">
          ⚠️ Estimativa via proxies (razão social, capital, CNAE, folha). Para área real, consulte CAR/SICAR.
        </p>
      </div>

      <div className="rounded-xl border border-aletis-borda dark:border-white/10 p-4">
        <p className="font-semibold text-sm mb-2 flex items-center gap-2">
          <Wheat size={14} className="text-aletis-dourado" /> Sinais agro detectados no nome
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

function TabSocios({ lead }: { lead: LeadFull }) {
  if (!lead.cnpj) {
    return (
      <div className="text-center py-8 text-aletis-grafite-medio dark:text-white/50">
        <Users size={32} className="mx-auto mb-2 opacity-40" />
        Dados de sócios disponíveis após enriquecimento BrasilAPI.
      </div>
    )
  }
  if (lead.cnpj.socios.length === 0) {
    return <p className="text-xs text-aletis-grafite-medio dark:text-white/50">Sem QSA cadastrado.</p>
  }
  return (
    <div className="space-y-2">
      {lead.cnpj.socios.map((s, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-aletis-bege/50 dark:bg-white/5 border border-aletis-borda dark:border-white/10">
          <div className="w-9 h-9 rounded-full bg-aletis-verde/15 flex items-center justify-center">
            <Users size={14} className="text-aletis-verde" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-aletis-grafite-escuro dark:text-white truncate">{s.nome}</p>
            <p className="text-[11px] text-aletis-grafite-medio dark:text-white/50">
              {s.qualificacao}
              {s.faixaEtaria && ` · ${s.faixaEtaria}`}
              {s.dataEntrada && ` · desde ${s.dataEntrada}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

function TabScore({ lead }: { lead: LeadFull }) {
  const b = lead.score.breakdown
  const items = [
    { label: 'Tamanho da dívida', value: b.divida, max: 40, icon: DollarSign },
    { label: 'Ajuizamento (urgência)', value: b.ajuizamento, max: 20, icon: Gavel },
    { label: 'Recência da inscrição', value: b.recencia, max: 15, icon: Calendar },
    { label: 'Qualidade do sinal agro', value: b.agroMatch, max: 15, icon: Wheat },
    { label: 'Área estimada', value: b.hectares, max: 10, icon: Tractor },
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
          const pct = (it.value / it.max) * 100
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
