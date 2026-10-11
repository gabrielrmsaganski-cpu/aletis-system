import MetricCard from '../components/ui/MetricCard'
import { SectionNav } from '../components/ui/SectionNav'
import PageHeader from '../components/ui/PageHeader'
/**
 * Financeiro — gestão financeira INTERNA do negócio ALETIS.
 *
 * 7 abas:
 *   • Dashboard    — KPIs, fluxo 12m, top categorias, alertas, DAS previsto
 *   • Receitas     — honorários recebidos/a receber + upload NF/NFS-e
 *   • Despesas     — operacional por categoria + upload comprovante
 *   • Impostos     — DAS/INSS/ISS + calculadora DAS automática
 *   • Extratos     — lançamentos bancários + importação OFX + conciliação
 *   • Fechamento   — checklist + geração ZIP/PDF pro contador
 *   • Configurações — empresa, contador, regime, contas bancárias
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useApi, apiFetch } from '../hooks/useApi'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Upload,
  Plus,
  FileText,
  Building2,
  Landmark,
  Receipt,
  Wallet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Download,
  Calendar,
  PieChart,
  Package,
  Loader2,
  Trash2,
  Edit3,
  Calculator,
  Mail,
  FileCheck,
  Target,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Paperclip,
  Link2,
  RefreshCw,
  Database,
  ChevronRight,
} from 'lucide-react'
import AppDialog from '../components/ui/AppDialog'
import { uiAction, uiSurface, uiText } from '../components/ui/foundation'

/* ================= Helpers ================= */

const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

const fmtPct = (v: number): string => `${(v ?? 0).toFixed(1).replace('.', ',')}%`

const fmtDate = (iso?: string): string => {
  if (!iso) return '—'
  const s = iso.slice(0, 10)
  const parts = s.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

const fmtCompetencia = (c: string): string => {
  const [y, m] = c.split('-').map(Number)
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${nomes[m - 1]}/${y}`
}

const currentCompetencia = (): string => new Date().toISOString().slice(0, 7)

const fieldLabelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)]'
const financePanelClass = `${uiSurface.panel} shadow-none`
const financePanelPaddedClass = `${financePanelClass} p-5`
const financeTableWrapClass = `${financePanelClass} overflow-x-auto custom-scrollbar`
const financeTableHeadClass = 'bg-aletis-cream-papel/75 text-[11px] uppercase tracking-[0.12em] text-[var(--text-soft)]'
const financeTableRowClass = 'border-t border-aletis-borda/45 transition-colors hover:bg-aletis-cream-papel/60'
const financeInlineActionClass = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-foreground transition hover:bg-aletis-cream-papel hover:text-aletis-verde-escuro disabled:opacity-50'
const financeDangerActionClass = 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700'

/* ================= Tipos ================= */

type Tab = 'dashboard' | 'receitas' | 'despesas' | 'impostos' | 'extratos' | 'fechamento' | 'empresas' | 'config'

interface Anexo {
  id: string
  nomeOriginal: string
  nomeArmazenado: string
  tipo: string
  tamanho: number
  uploadEm: string
}

interface Receita {
  id: string
  competencia: string
  descricao: string
  cliente?: { nome: string; cpfCnpj?: string }
  valorBruto: number
  valorLiquido: number
  retencoes?: Record<string, number>
  nfse?: { numero: string; dataEmissao: string; discriminacao?: string }
  dataEmissao: string
  dataPrevisaoRecebimento?: string
  dataRecebimento?: string
  formaPagamento?: string
  status: 'emitida' | 'recebida' | 'atrasada' | 'cancelada'
  anexos: Anexo[]
  observacoes?: string
}

interface Despesa {
  id: string
  competencia: string
  descricao: string
  fornecedor?: { nome: string; cpfCnpj?: string }
  categoria: string
  valor: number
  dataEmissao: string
  dataVencimento: string
  dataPagamento?: string
  status: 'pendente' | 'paga' | 'atrasada' | 'cancelada'
  formaPagamento?: string
  anexos: Anexo[]
  observacoes?: string
}

interface Imposto {
  id: string
  competencia: string
  tipo: string
  descricao: string
  baseCalculo?: number
  aliquota?: number
  valor: number
  dataVencimento: string
  dataPagamento?: string
  status: 'a_pagar' | 'pago' | 'atrasado'
  anexos: Anexo[]
  memoriaCalculo?: string
}

interface Lancamento {
  id: string
  contaId: string
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
  categoria?: string
  vinculadoA?: { tipo: string; id: string }
  fitid?: string
  origem: string
}

interface CategoriaMeta { id: string; nome: string; dedutivel: boolean }

interface DashboardData {
  mesAtual: string
  dreAtual: {
    receitaBruta: number
    receitaLiquida: number
    totalDespesas: number
    despesasDedutiveis: number
    despesasNaoDedutiveis: number
    impostosApurados: number
    resultadoLiquido: number
    margemLiquida: number
    despesasPorCategoria: Record<string, number>
    contagens: { receitas: number; despesas: number; impostos: number; extratos: number }
  }
  faturamento12m: number
  rbt12: number
  dasProximo?: {
    valorDAS: number
    aliquotaEfetiva: number
    faixa: number
    vencimento: string
    memoriaCalculo: string
    detalhamentoPartilha: Record<string, number>
  }
  contasReceber: {
    total: number; atrasadas: number
    proximosVencimentos: Array<{ id: string; cliente: string; valor: number; vencimento: string; diasAtraso: number }>
    aging: {
      emDia: { count: number; total: number }
      atraso_1_30: { count: number; total: number }
      atraso_31_60: { count: number; total: number }
      atraso_61_90: { count: number; total: number }
      atraso_90plus: { count: number; total: number }
      indiceSaude: number
      dso: number
    }
  }
  contasPagar: {
    total: number; atrasadas: number
    proximosVencimentos: Array<{ id: string; descricao: string; valor: number; vencimento: string; diasAtraso: number }>
  }
  fluxoCaixa12m: Array<{ mes: string; receita: number; despesa: number; resultado: number; acumulado: number }>
  topCategoriasDespesa: Array<{ categoria: string; nome: string; valor: number; pct: number }>
  topClientes: Array<{ cliente: string; valor: number; pct: number }>
  margensPorCliente: Array<{
    clienteKey: string
    nome: string
    cpfCnpj?: string
    receitaBruta: number
    receitaLiquida: number
    despesasAtribuidas: number
    margem: number
    margemPct: number
    numReceitas: number
    numDespesas: number
    ultimaAtividade?: string
    classificacao: 'ouro' | 'prata' | 'bronze' | 'prejuizo'
  }>
  projecaoCaixa90d: {
    diasHorizonte: number
    saldoInicial: number
    semanas: Array<{
      inicio: string
      fim: string
      entradas: number
      saidas: number
      resultado: number
      saldoFinal: number
      alertaNegativo: boolean
    }>
    totais: { entradas: number; saidas: number; resultado: number; saldoFinalProjetado: number }
    primeiroGap?: { semanaInicio: string; deficit: number }
    geradoEm: string
  }
  alertas: Array<{ tipo: string; severidade: 'info' | 'atencao' | 'critico'; titulo: string; detalhe: string }>
}

interface ChecklistItem { titulo: string; ok: boolean; detalhe: string }
interface Checklist { competencia: string; itens: ChecklistItem[]; pronto: boolean }

interface Config {
  empresa: { razaoSocial: string; nomeFantasia?: string; cnpj: string; inscricaoMunicipal?: string; endereco?: string; cidade?: string; uf?: string; cep?: string }
  regime: string
  anexoSimples: string
  contador: { nome: string; escritorio?: string; email: string; telefone?: string; crcRegional?: string }
  aliquotas: { iss: number; irRetencaoFonte?: number }
  contasBancarias: Array<{ id: string; nome: string; banco: string; tipo: string; ativa: boolean }>
}

/* ================= Componente raiz ================= */

export default function Financeiro() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [competencia, setCompetencia] = useState<string>(currentCompetencia())
  const [toast, setToast] = useState<{ tipo: 'sucesso' | 'erro'; msg: string } | null>(null)

  const {
    data: empresas,
  } = useApi<Array<{ id: string; razaoSocial: string; nomeFantasia?: string; cnpj: string }>>('/financeiro/empresas', [])

  const [empresaId, setEmpresaId] = useState<string>(() => {
    try { return localStorage.getItem('aletis_fin_empresaId') ?? '' } catch { return '' }
  })

  useEffect(() => {
    if (empresaId) localStorage.setItem('aletis_fin_empresaId', empresaId)
  }, [empresaId])

  const showToast = (tipo: 'sucesso' | 'erro', msg: string) => {
    setToast({ tipo, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const qEmp = (base: string) => {
    const sep = base.includes('?') ? '&' : '?'
    return empresaId ? `${base}${sep}empresaId=${encodeURIComponent(empresaId)}` : base
  }

  const tabs: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'receitas', label: 'Receitas', icon: TrendingUp },
    { key: 'despesas', label: 'Despesas', icon: TrendingDown },
    { key: 'impostos', label: 'Impostos', icon: Receipt },
    { key: 'extratos', label: 'Extratos', icon: Wallet },
    { key: 'fechamento', label: 'Fechamento', icon: Package },
    { key: 'empresas', label: 'Empresas', icon: Building2 },
    { key: 'config', label: 'Configurações', icon: Building2 },
  ]

  return (
    <div className="min-h-screen">
      {/* Header */}
      <PageHeader eyebrow="Gestão financeira interna" title={<>Financeiro</>} description={<> <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--text-soft)]">
                Receitas, despesas, impostos e extratos do negócio, com fechamento mensal pronto para o contador.
              </p> </>} actions={<> <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {empresas.length > 0 && (
              <label className="flex h-10 min-w-0 items-center gap-2 rounded-lg border border-aletis-borda bg-card px-3 text-[var(--text-soft)]">
                <Building2 className="h-4 w-4 text-aletis-gold-escuro" />
                <select
                  value={empresaId}
                  onChange={(e) => setEmpresaId(e.target.value)}
                  aria-label="Empresa"
                  className="w-full min-w-0 bg-transparent text-sm text-foreground focus:outline-none sm:max-w-64"
                >
                  <option value="">Todas as empresas</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nomeFantasia || e.razaoSocial}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex h-10 items-center gap-2 rounded-lg border border-aletis-borda bg-card px-3 text-[var(--text-soft)]">
              <Calendar className="h-4 w-4 text-aletis-gold-escuro" />
              <input
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className="bg-transparent text-sm text-foreground focus:outline-none"
              />
            </label>
          </div> </>} />

      <SectionNav label="Áreas de finanças" items={tabs.map(item => ({ id: item.key, label: item.label === 'Dashboard' ? 'Visão geral' : item.label, icon: item.icon }))} active={tab} onChange={setTab} />

      {/* Conteúdo */}
      <div>
        {tab === 'dashboard' && <DashboardSection showToast={showToast} empresaId={empresaId} qEmp={qEmp} />}
        {tab === 'receitas' && <ReceitasSection competencia={competencia} showToast={showToast} empresaId={empresaId} qEmp={qEmp} />}
        {tab === 'despesas' && <DespesasSection competencia={competencia} showToast={showToast} empresaId={empresaId} qEmp={qEmp} />}
        {tab === 'impostos' && <ImpostosSection competencia={competencia} showToast={showToast} empresaId={empresaId} qEmp={qEmp} />}
        {tab === 'extratos' && <ExtratosSection competencia={competencia} showToast={showToast} empresaId={empresaId} qEmp={qEmp} />}
        {tab === 'fechamento' && <FechamentoSection competencia={competencia} showToast={showToast} empresaId={empresaId} qEmp={qEmp} />}
        {tab === 'empresas' && <EmpresasSection showToast={showToast} />}
        {tab === 'config' && <ConfigSection showToast={showToast} />}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg ${
          toast.tipo === 'sucesso' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
          {toast.tipo === 'sucesso' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="text-sm font-medium">{toast.msg}</span>
        </div>
      )}
    </div>
  )
}

/* ================= Dashboard ================= */

function DashboardSection({ showToast, empresaId, qEmp }: { showToast: (t: 'sucesso' | 'erro', m: string) => void; empresaId: string; qEmp: (base: string) => string }) {
  const { data, loading, refetch } = useApi<DashboardData | null>(qEmp('/financeiro/dashboard'), null)

  if (loading) return <DashboardSkeleton />
  if (!data) return <EmptyCard icon={BarChart3} titulo="Sem dados no dashboard" detalhe="Cadastre receitas e despesas para ver os KPIs." />

  const {
    dreAtual, fluxoCaixa12m, topCategoriasDespesa, topClientes, contasReceber, contasPagar,
    dasProximo, rbt12, alertas, margensPorCliente, projecaoCaixa90d,
  } = data

  const maxFluxo = Math.max(...fluxoCaixa12m.map((f) => Math.max(f.receita, f.despesa)), 1)

  return (
    <div className="space-y-6">
      {/* ═══════════ ALERTAS PREMIUM ═══════════ */}
      {alertas.length > 0 && (
        <div className="space-y-2.5">
          {alertas.map((a, i) => (
            <DashboardAlert key={i} severidade={a.severidade} titulo={a.titulo} detalhe={a.detalhe} />
          ))}
        </div>
      )}

      {/* ═══════════ KPIs PREMIUM ═══════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Receita do mês"
          value={fmtBRL(dreAtual.receitaBruta)}
          subtitle={`${dreAtual.contagens.receitas} receita(s) cadastradas`}
          icon={TrendingUp}
          color="verde"
          trend="up"
        />
        <KpiCard
          label="Despesas + Impostos"
          value={fmtBRL(dreAtual.totalDespesas + dreAtual.impostosApurados)}
          subtitle={`${dreAtual.contagens.despesas} desp. + ${dreAtual.contagens.impostos} imp.`}
          icon={TrendingDown}
          color="rose"
          trend="down"
        />
        <KpiCard
          label="Resultado líquido"
          value={fmtBRL(dreAtual.resultadoLiquido)}
          subtitle={`Margem líquida de ${fmtPct(dreAtual.margemLiquida)}`}
          icon={dreAtual.resultadoLiquido >= 0 ? ArrowUpRight : ArrowDownRight}
          color={dreAtual.resultadoLiquido >= 0 ? 'emerald' : 'rose'}
          trend={dreAtual.resultadoLiquido >= 0 ? 'up' : 'down'}
        />
        <KpiCard
          label="RBT12 — Simples Nacional"
          value={fmtBRL(rbt12)}
          subtitle={`${fmtPct((rbt12 / 4_800_000) * 100)} do limite de R$ 4,8M`}
          icon={Landmark}
          color="dourado"
        />
      </div>

      {/* ═══════════ RESUMO FINANCEIRO | 3 COLUNAS ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* DAS Premium */}
        <DasCard das={dasProximo} />
        {/* Contas a Receber */}
        <ContasCard
          tipo="receber"
          total={contasReceber.total}
          atrasadas={contasReceber.atrasadas}
          proximos={contasReceber.proximosVencimentos.slice(0, 4).map(v => ({ id: v.id, label: v.cliente, valor: v.valor, diasAtraso: v.diasAtraso }))}
        />
        {/* Contas a Pagar */}
        <ContasCard
          tipo="pagar"
          total={contasPagar.total}
          atrasadas={contasPagar.atrasadas}
          proximos={contasPagar.proximosVencimentos.slice(0, 4).map(v => ({ id: v.id, label: v.descricao, valor: v.valor, diasAtraso: v.diasAtraso }))}
        />
      </div>

      {/* ═══════════ AGING + PROJEÇÃO | 2 COLUNAS ═══════════ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <AgingRecebiveis aging={contasReceber.aging} total={contasReceber.total} />
        <ProjecaoCaixa projecao={projecaoCaixa90d} />
      </div>

      {/* ═══════════ FLUXO DE CAIXA 12M ═══════════ */}
      <div className="rounded-lg border border-aletis-borda/40 bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-foreground" />
              Fluxo de caixa — últimos 12 meses
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Receita bruta × Despesas operacionais por competência</p>
          </div>
          <button onClick={refetch} className="inline-flex items-center gap-1.5 rounded-lg border border-aletis-borda/50 bg-aletis-bege/40 px-3 py-1.5 text-[11px] font-medium text-[var(--text-soft)] hover:bg-aletis-bege transition-colors">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        </div>
        <div className="flex items-end gap-1.5 h-48 overflow-x-auto pb-1 custom-scrollbar">
          {fluxoCaixa12m.map((f) => {
            const receitaH = Math.max((f.receita / maxFluxo) * 100, 2)
            const despesaH = Math.max((f.despesa / maxFluxo) * 100, 2)
            return (
              <div key={f.mes} className="flex flex-col items-center gap-1.5 min-w-[56px] flex-1" title={`${fmtCompetencia(f.mes)}\nReceita: ${fmtBRL(f.receita)}\nDespesa: ${fmtBRL(f.despesa)}\nResultado: ${fmtBRL(f.resultado)}\nAcumulado: ${fmtBRL(f.acumulado)}`}>
                <div className="flex items-end gap-[3px] h-36 w-full justify-center">
                  <div className="w-[14px] rounded-t-lg bg-emerald-400/90 hover:bg-emerald-500 transition-colors" style={{ height: `${receitaH}%` }} />
                  <div className="w-[14px] rounded-t-lg bg-rose-400/90 hover:bg-rose-500 transition-colors" style={{ height: `${despesaH}%` }} />
                </div>
                <div className={`text-[11px] font-medium ${f.resultado >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {fmtCompetencia(f.mes).split('/')[0]}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex gap-5 mt-3 pt-3 border-t border-aletis-borda/30">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-soft)] font-medium"><span className="w-2.5 h-2.5 rounded bg-emerald-400" />Receita</span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-soft)] font-medium"><span className="w-2.5 h-2.5 rounded bg-rose-400" />Despesa</span>
        </div>
      </div>

      {/* ═══════════ TOPs | 2 COLUNAS ═══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopListCard
          titulo="Top categorias de despesa"
          subtitulo="Últimos 3 meses"
          icon={PieChart}
          itens={topCategoriasDespesa.map(c => ({ nome: c.nome, valor: c.valor, pct: c.pct, cor: 'verde' }))}
          empty="Sem despesas nos últimos 3 meses."
        />
        <TopListCard
          titulo="Top clientes do ano"
          subtitulo="Receita bruta por cliente"
          icon={Target}
          itens={topClientes.map(c => ({ nome: c.cliente, valor: c.valor, pct: c.pct, cor: 'dourado' }))}
          empty="Sem receitas registradas este ano."
        />
      </div>

      {/* ═══════════ MARGENS POR CLIENTE ═══════════ */}
      <MargensPorCliente margens={margensPorCliente} />

      {/* Wave-PG-13 */}
      <FinanceiroSqlPanel />
    </div>
  )
}

/* ────────────────────────────────────────────────────────────
 * FinanceiroSqlPanel — consome /api/financeiro/sql/* (Wave-PG-13).
 * Painel colapsável independente dos widgets nativos (que rodam em
 * RAM). Aqui as queries são SQL agregado direto no PG — escalam pra
 * milhões de linhas sem custar memória do node.
 * ──────────────────────────────────────────────────────────── */
interface MargemRow {
  clienteCpfCnpj: string
  clienteNome: string | null
  receitas: number
  despesas: number
  margem: number
}
interface FluxoRow {
  competencia: string
  receitas: number
  despesas: number
  impostos: number
  saldo: number
}
interface CategoriaRow {
  categoria: string
  total: number
  n: number
}

function FinanceiroSqlPanel() {
  const [open, setOpen] = useState(false)
  const [margens, setMargens] = useState<MargemRow[]>([])
  const [fluxo, setFluxo] = useState<FluxoRow[]>([])
  const [categorias, setCategorias] = useState<CategoriaRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const ano = new Date().getFullYear()
      const desde = `${ano}-01`
      const ate = `${ano}-12`
      const [r1, r2, r3] = await Promise.all([
        fetch(`/api/financeiro/sql/margem-cliente?ano=${ano}&limit=10`).then((r) => r.json()),
        fetch(`/api/financeiro/sql/fluxo-competencia?desde=${desde}&ate=${ate}`).then((r) => r.json()),
        fetch('/api/financeiro/sql/top-categorias?limit=8').then((r) => r.json()),
      ])
      setMargens(r1?.data ?? [])
      setFluxo(r2?.data ?? [])
      setCategorias(r3?.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha SQL')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleToggle = useCallback(() => {
    const next = !open
    setOpen(next)
    if (next && margens.length === 0 && fluxo.length === 0 && categorias.length === 0) {
      void carregar()
    }
  }, [open, carregar, margens.length, fluxo.length, categorias.length])

  const maxSaldo = Math.max(1, ...fluxo.map((f) => Math.abs(f.saldo)))

  return (
    <div className="rounded-xl border border-aletis-borda/60 bg-card shadow-sm overflow-x-auto custom-scrollbar">
      <button
        onClick={handleToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-aletis-bege/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Database className="h-4 w-4 text-foreground" />
          <div className="text-left">
            <h3 className="font-display text-sm font-semibold text-foreground">
              Análise SQL via Postgres
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Margem por cliente · Fluxo {new Date().getFullYear()} · Top categorias — queries indexadas no PG
            </p>
          </div>
        </div>
        <ChevronRight
          size={14}
          className={`text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-aletis-borda/50 space-y-4 pt-4">
          {error && (
            <p className="text-xs text-rose-600">{error}</p>
          )}
          {loading && (
            <p className="text-xs text-[var(--text-soft)] italic">Carregando do PG…</p>
          )}

          {/* Fluxo competência mini-chart */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-2">
              Fluxo por competência ({fluxo.length} meses)
            </h4>
            {fluxo.length > 0 ? (
              <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1">
                {fluxo.map((f) => (
                  <div
                    key={f.competencia}
                    className="flex flex-col items-center gap-1 min-w-[40px]"
                    title={`${f.competencia}: rec R$ ${f.receitas.toFixed(0)} / desp R$ ${f.despesas.toFixed(0)} / saldo R$ ${f.saldo.toFixed(0)}`}
                  >
                    <div
                      className={`w-6 rounded-t ${f.saldo >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                      style={{ height: `${(Math.abs(f.saldo) / maxSaldo) * 100}%`, minHeight: '2px' }}
                    />
                    <div className="text-[11px] text-muted-foreground tabular-nums">{f.competencia.slice(5)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground italic">
                Sem dados no PG ainda — registre receitas/despesas pra popular.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Margem por cliente */}
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2">
                Margem por cliente (top {margens.length})
              </h4>
              {margens.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {margens.map((m) => (
                    <li
                      key={m.clienteCpfCnpj}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="font-medium text-foreground truncate">
                        {m.clienteNome || m.clienteCpfCnpj}
                      </span>
                      <span
                        className={`tabular-nums font-mono ${m.margem >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}
                      >
                        R$ {m.margem.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  Sem clientes vinculados ainda.
                </p>
              )}
            </div>

            {/* Top categorias */}
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2">
                Top categorias de despesa
              </h4>
              {categorias.length > 0 ? (
                <ul className="space-y-1.5 text-xs">
                  {categorias.map((c) => (
                    <li
                      key={c.categoria}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-foreground">
                        {c.categoria} <span className="text-muted-foreground">({c.n})</span>
                      </span>
                      <span className="tabular-nums font-mono text-foreground">
                        R$ {c.total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  Sem despesas registradas no PG.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-aletis-borda/50">
            <button
              onClick={carregar}
              disabled={loading}
              className="text-[11px] text-foreground hover:underline disabled:opacity-50 inline-flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Recarregar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ================= Aging de Recebíveis ================= */

type AgingData = DashboardData['contasReceber']['aging']
type AgingBucketKey = 'emDia' | 'atraso_1_30' | 'atraso_31_60' | 'atraso_61_90' | 'atraso_90plus'

/* ═══════════════════════════════════════════════════════════
 *  COMPONENTES PREMIUM — DASHBOARD WIDGETS
 * ═══════════════════════════════════════════════════════════ */

function DashboardAlert({ severidade, titulo, detalhe }: { severidade: 'critico' | 'atencao' | 'info'; titulo: string; detalhe: string }) {
  const cfg = {
    critico: { border: 'border-rose-200', bg: 'bg-rose-50', icon: AlertCircle, iconColor: 'text-rose-600', title: 'text-rose-800' },
    atencao: { border: 'border-amber-200', bg: 'bg-amber-50', icon: AlertTriangle, iconColor: 'text-amber-600', title: 'text-amber-800' },
    info:    { border: 'border-sky-200',   bg: 'bg-sky-50',   icon: AlertCircle, iconColor: 'text-sky-600',   title: 'text-sky-800' },
  }
  const c = cfg[severidade]
  const Icon = c.icon
  return (
    <div className={`flex items-start gap-3 rounded-lg border ${c.border} ${c.bg} p-4`}>
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${c.iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-display font-semibold ${c.title}`}>{titulo}</div>
        <div className="text-xs text-[var(--text-soft)] mt-0.5 leading-relaxed">{detalhe}</div>
      </div>
    </div>
  )
}

function DasCard({ das }: { das?: { valorDAS: number; faixa: number; aliquotaEfetiva: number; vencimento: string; memoriaCalculo: string } }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-aletis-borda bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="absolute top-0 right-0 w-24 h-24 bg-[#1e4d3a]/[0.03] rounded-bl-full" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-4">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e4d3a] shadow-sm">
            <Calculator className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-display text-sm font-semibold text-foreground">DAS previsto</h3>
            <p className="text-[11px] text-muted-foreground">Simples Nacional · Anexo III</p>
          </div>
        </div>
        {das ? (
          <div className="space-y-2">
            <div className="text-[28px] font-display font-semibold text-[#1e4d3a] tracking-tight leading-none">{fmtBRL(das.valorDAS)}</div>
            <div className="flex items-center gap-3 text-[11px] text-[var(--text-soft)]">
              <span>Faixa <strong className="text-foreground">{das.faixa}</strong></span>
              <span>·</span>
              <span>Alíq. efetiva <strong className="text-foreground">{fmtPct(das.aliquotaEfetiva)}</strong></span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e4d3a]/5 px-2.5 py-1 text-[11px] text-[#1e4d3a] font-medium">
              <Calendar className="h-3 w-3" />
              Vencimento: {fmtDate(das.vencimento)}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic">Sem receita no mês — DAS dispensado.</div>
        )}
      </div>
    </div>
  )
}

function ContasCard({ tipo, total, atrasadas, proximos }: {
  tipo: 'receber' | 'pagar'
  total: number
  atrasadas: number
  proximos: Array<{ id: string; label: string; valor: number; diasAtraso: number }>
}) {
  const isReceber = tipo === 'receber'
  const iconBg = isReceber ? 'bg-emerald-500' : 'bg-rose-500'
  const textMain = isReceber ? 'text-emerald-700' : 'text-rose-700'
  const Icon = isReceber ? ArrowDownRight : ArrowUpRight
  const titulo = isReceber ? 'Contas a receber' : 'Contas a pagar'
  return (
    <div className="rounded-lg border border-aletis-borda/40 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2 mb-4">
        <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg} shadow-sm`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-display text-sm font-semibold text-foreground">{titulo}</h3>
      </div>
      <div className={`text-[28px] font-display font-semibold tracking-tight ${textMain} leading-none mb-2`}>{fmtBRL(total)}</div>
      {atrasadas > 0 && (
        <div className="flex items-center gap-1 text-[11px] text-rose-600 mb-4 font-medium">
          <AlertCircle className="h-3 w-3" />
          {fmtBRL(atrasadas)} em atraso
        </div>
      )}
      <div className="space-y-2">
        {proximos.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-aletis-borda/20 last:border-0">
            <span className="truncate text-[var(--text-soft)] max-w-[180px]">{p.label}</span>
            <div className="flex items-center gap-2 shrink-0">
              {p.diasAtraso > 0 && <span className="text-[11px] text-rose-500 font-medium">{p.diasAtraso}d atraso</span>}
              <span className={`font-semibold ${p.diasAtraso > 0 ? 'text-rose-600' : 'text-foreground'}`}>{fmtBRL(p.valor)}</span>
            </div>
          </div>
        ))}
        {proximos.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">Nenhum próximo vencimento.</p>
        )}
      </div>
    </div>
  )
}

function TopListCard({ titulo, subtitulo, icon: Icon, itens, empty }: {
  titulo: string; subtitulo: string; icon: React.ElementType;
  itens: Array<{ nome: string; valor: number; pct: number; cor: 'verde' | 'dourado' }>;
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-aletis-borda/40 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="mb-4">
        <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
          <Icon className="h-4 w-4 text-foreground" />
          {titulo}
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitulo}</p>
      </div>
      {itens.length > 0 ? (
        <div className="space-y-3">
          {itens.map((c, i) => (
            <div key={i}>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-[var(--text-soft)] truncate max-w-[60%]">{c.nome}</span>
                <span className="font-medium text-foreground">{fmtBRL(c.valor)} · {fmtPct(c.pct)}</span>
              </div>
              <div className="h-2 rounded-full bg-aletis-bege overflow-hidden">
                <div className={`h-full rounded-full ${c.cor === 'dourado' ? 'bg-[#c8a96e]' : 'bg-[#1e4d3a]'} transition-all`} style={{ width: `${c.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">{empty}</p>
      )}
    </div>
  )
}

/* ================= Aging de Recebíveis Premium ================= */

function AgingRecebiveis({ aging, total }: { aging: AgingData; total: number }) {
  const buckets: Array<{ id: AgingBucketKey; label: string; color: string; barColor: string; bg: string }> = [
    { id: 'emDia', label: 'Em dia', color: 'text-emerald-700', barColor: 'bg-emerald-500', bg: 'bg-emerald-50' },
    { id: 'atraso_1_30', label: '1–30 dias', color: 'text-amber-700', barColor: 'bg-amber-400', bg: 'bg-amber-50' },
    { id: 'atraso_31_60', label: '31–60 dias', color: 'text-orange-700', barColor: 'bg-orange-500', bg: 'bg-orange-50' },
    { id: 'atraso_61_90', label: '61–90 dias', color: 'text-rose-700', barColor: 'bg-rose-500', bg: 'bg-rose-50' },
    { id: 'atraso_90plus', label: '90+ dias', color: 'text-red-800', barColor: 'bg-red-700', bg: 'bg-red-50' },
  ]

  const saudeCfg =
    aging.indiceSaude >= 85 ? { cor: 'text-emerald-700', bg: 'bg-emerald-500', label: 'Excelente' } :
    aging.indiceSaude >= 65 ? { cor: 'text-amber-700', bg: 'bg-amber-400', label: 'Bom' } :
    aging.indiceSaude >= 45 ? { cor: 'text-orange-700', bg: 'bg-orange-500', label: 'Atenção' } :
    { cor: 'text-rose-700', bg: 'bg-rose-500', label: 'Crítico' }

  if (total === 0) {
    return (
      <div className="rounded-lg border border-aletis-borda/40 bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 mb-3">
          <ArrowDownRight className="h-4 w-4 text-emerald-600" />
          <h3 className="font-display text-sm font-semibold text-foreground">Recebíveis por prazo</h3>
        </div>
        <p className="text-sm text-muted-foreground italic">Nenhum recebível em aberto no momento.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-aletis-borda/40 bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-emerald-600" />
            Recebíveis por prazo
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Distribuição da carteira em aberto por faixa de atraso</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">DSO</div>
            <div className="text-sm font-display font-semibold text-foreground">{aging.dso.toFixed(0)} <span className="text-xs font-normal text-muted-foreground">dias</span></div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Índice de saúde</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-sm font-display font-semibold ${saudeCfg.cor}`}>{aging.indiceSaude.toFixed(0)}/100</span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-aletis-bege text-[var(--text-soft)]">{saudeCfg.label}</span>
            </div>
            <div className="w-28 h-1.5 rounded-full bg-aletis-borda/30 overflow-hidden mt-1.5">
              <div className={`h-full ${saudeCfg.bg} transition-all`} style={{ width: `${Math.max(0, Math.min(100, aging.indiceSaude))}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Stacked health bar */}
      <div className="flex h-4 rounded-full overflow-hidden border border-aletis-borda/30 mb-5">
        {buckets.map((b) => {
          const bucket = aging[b.id]
          const pct = total > 0 ? (bucket.total / total) * 100 : 0
          if (pct === 0) return null
          return (
            <div key={b.id} className={`${b.barColor} transition-all`} style={{ width: `${pct}%` }} title={`${b.label}: ${bucket.count} recebíveis, ${fmtBRL(bucket.total)} (${pct.toFixed(1)}%)`} />
          )
        })}
      </div>

      {/* Bucket grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {buckets.map((b) => {
          const bucket = aging[b.id]
          const pct = total > 0 ? (bucket.total / total) * 100 : 0
          return (
            <div key={b.id} className={`rounded-xl border border-aletis-borda/40 ${b.bg} p-3`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-display font-semibold uppercase tracking-wider ${b.color}`}>{b.label}</span>
                <span className="text-[11px] text-muted-foreground font-medium">{pct.toFixed(0)}%</span>
              </div>
              <div className={`font-display text-lg font-bold ${b.color} leading-tight`}>{fmtBRL(bucket.total)}</div>
              <div className="text-[11px] text-[var(--text-soft)] mt-0.5">{bucket.count} {bucket.count === 1 ? 'recebível' : 'recebíveis'}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ================= Projeção de Caixa 90d Premium ================= */

type ProjecaoCaixaData = DashboardData['projecaoCaixa90d']

function ProjecaoCaixa({ projecao }: { projecao: ProjecaoCaixaData }) {
  if (!projecao || !projecao.semanas?.length) return null
  const { saldoInicial, semanas, totais, primeiroGap, diasHorizonte } = projecao
  const maxMag = Math.max(...semanas.map((s) => Math.max(Math.abs(s.entradas), Math.abs(s.saidas), Math.abs(s.saldoFinal))), 1)
  const saldoFinalCor = totais.saldoFinalProjetado >= 0 ? 'text-emerald-700' : 'text-rose-700'

  return (
    <div className="rounded-lg border border-aletis-borda/40 bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-foreground" />
            Projeção de caixa
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Próximos {diasHorizonte} dias</p>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <div className="text-right">
            <div className="text-muted-foreground">Saldo inicial</div>
            <div className="font-semibold text-foreground">{fmtBRL(saldoInicial)}</div>
          </div>
          <div className="h-6 w-px bg-aletis-borda/40" />
          <div className="text-right">
            <div className="text-muted-foreground">Saldo projetado</div>
            <div className={`font-semibold ${saldoFinalCor}`}>{fmtBRL(totais.saldoFinalProjetado)}</div>
          </div>
        </div>
      </div>

      {primeiroGap && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Gap de caixa em {fmtDate(primeiroGap.semanaInicio)}</div>
            <div className="text-rose-600/80">Déficit projetado: {fmtBRL(Math.abs(primeiroGap.deficit))}. Antecipe recebíveis ou negocie prazos.</div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-1 custom-scrollbar">
        <div className="flex items-end gap-1.5 h-44 min-w-max">
          {semanas.map((s) => {
            const entradaH = Math.max((s.entradas / maxMag) * 100, 1)
            const saidaH = Math.max((s.saidas / maxMag) * 100, 1)
            const saldoH = Math.max((Math.abs(s.saldoFinal) / maxMag) * 100, 1)
            return (
              <div key={s.inicio} className="flex flex-col items-center gap-1.5 min-w-[56px]" title={`${fmtDate(s.inicio)} - ${fmtDate(s.fim)}\nEntradas: ${fmtBRL(s.entradas)}\nSaídas: ${fmtBRL(s.saidas)}\nSaldo: ${fmtBRL(s.saldoFinal)}`}>
                <div className="flex items-end gap-[3px] h-36">
                  <div className="w-[14px] rounded-t-lg bg-emerald-400/90 hover:bg-emerald-500 transition-colors" style={{ height: `${entradaH}%` }} />
                  <div className="w-[14px] rounded-t-lg bg-rose-400/90 hover:bg-rose-500 transition-colors" style={{ height: `${saidaH}%` }} />
                  <div className={`w-[14px] rounded-t-lg ${s.saldoFinal >= 0 ? 'bg-[#1e4d3a]/90 hover:bg-[#1e4d3a]' : 'bg-red-600/90 hover:bg-red-600'} transition-colors`} style={{ height: `${saldoH}%` }} />
                </div>
                <div className={`text-[11px] font-medium ${s.alertaNegativo ? 'text-rose-600' : 'text-muted-foreground'}`}>
                  {fmtDate(s.inicio).slice(0, 5)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex gap-5 mt-3 pt-3 border-t border-aletis-borda/30">
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-soft)] font-medium"><span className="w-2.5 h-2.5 rounded bg-emerald-400" />Entradas ({fmtBRL(totais.entradas)})</span>
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-soft)] font-medium"><span className="w-2.5 h-2.5 rounded bg-rose-400" />Saídas ({fmtBRL(totais.saidas)})</span>
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-soft)] font-medium"><span className="w-2.5 h-2.5 rounded bg-[#1e4d3a]" />Saldo</span>
      </div>
    </div>
  )
}

/* ================= Margens por Cliente Premium ================= */

type MargemCliente = DashboardData['margensPorCliente'][number]

const BADGE_CLASS: Record<MargemCliente['classificacao'], string> = {
  ouro:     'bg-amber-50 text-amber-700 border-amber-200',
  prata:    'bg-slate-50 text-slate-600 border-slate-200',
  bronze:   'bg-orange-50 text-orange-700 border-orange-200',
  prejuizo: 'bg-rose-50 text-rose-700 border-rose-200',
}

function MargensPorCliente({ margens }: { margens: MargemCliente[] }) {
  if (!margens || margens.length === 0) {
    return (
      <div className="rounded-lg border border-aletis-borda/40 bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-foreground" />
          Margem por cliente
        </h3>
        <p className="text-sm text-muted-foreground italic">Sem dados — vincule clientes em receitas e despesas para calcular margem.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-aletis-borda/40 bg-card p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
            <Target className="h-4 w-4 text-foreground" />
            Margem por cliente
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Top {margens.length} clientes do ano · inclui despesas com vínculo explícito</p>
        </div>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <table className="ui-table w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-aletis-borda/30">
              <th className="py-2.5 pr-4 font-medium text-[11px] uppercase tracking-wider">Cliente</th>
              <th className="py-2.5 pr-4 text-right font-medium text-[11px] uppercase tracking-wider">Receita bruta</th>
              <th className="py-2.5 pr-4 text-right font-medium text-[11px] uppercase tracking-wider">Despesas vinc.</th>
              <th className="py-2.5 pr-4 text-right font-medium text-[11px] uppercase tracking-wider">Margem</th>
              <th className="py-2.5 pr-4 text-right font-medium text-[11px] uppercase tracking-wider">Margem %</th>
              <th className="py-2.5 pr-4 text-center font-medium text-[11px] uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody>
            {margens.map((m) => (
              <tr key={m.clienteKey} className="border-b border-aletis-borda/20 last:border-0 hover:bg-aletis-bege/30 transition-colors">
                <td className="py-3 pr-4">
                  <div className="font-semibold text-foreground truncate max-w-[220px]" title={m.nome}>{m.nome}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{m.numReceitas} receita(s) · {m.numDespesas} despesa(s)</div>
                </td>
                <td className="py-3 pr-4 text-right text-foreground font-medium">{fmtBRL(m.receitaBruta)}</td>
                <td className="py-3 pr-4 text-right text-[var(--text-soft)]">{fmtBRL(m.despesasAtribuidas)}</td>
                <td className={`py-3 pr-4 text-right font-bold ${m.margem >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtBRL(m.margem)}</td>
                <td className={`py-3 pr-4 text-right font-bold ${m.margemPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtPct(m.margemPct)}</td>
                <td className="py-3 pr-4 text-center">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${BADGE_CLASS[m.classificacao]}`}>
                    {m.classificacao === 'ouro' ? 'Ouro' : m.classificacao === 'prata' ? 'Prata' : m.classificacao === 'bronze' ? 'Bronze' : 'Prejuízo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ================= Receitas ================= */

function ReceitasSection({ competencia, showToast, empresaId, qEmp }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void; empresaId: string; qEmp: (base: string) => string }) {
  const { data: receitas, loading, refetch } = useApi<Receita[]>(qEmp(`/financeiro/receitas?competencia=${competencia}`), [])
  const [showNew, setShowNew] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const total = useMemo(() => receitas.reduce((s, r) => s + r.valorBruto, 0), [receitas])
  const recebido = useMemo(() => receitas.filter((r) => r.status === 'recebida').reduce((s, r) => s + r.valorLiquido, 0), [receitas])
  const aReceber = useMemo(() => receitas.filter((r) => r.status !== 'recebida' && r.status !== 'cancelada').reduce((s, r) => s + r.valorLiquido, 0), [receitas])

  const handleUploadNf = async (files: FileList) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('competencia', competencia)
      for (const f of Array.from(files)) fd.append('file', f)
      const res = await fetch('/api/financeiro/receitas/upload-nf', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.success === false) throw new Error(json.error || 'Erro ao subir NF')
      if (json.data.receita) showToast('sucesso', `NFS-e nº ${json.data.receita.nfse?.numero ?? ''} importada e receita criada`)
      else showToast('sucesso', 'Anexo(s) carregado(s) — crie a receita manualmente')
      refetch()
    } catch (err: any) {
      showToast('erro', err.message ?? 'Falha no upload')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta receita?')) return
    try {
      await apiFetch(`/financeiro/receitas/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Receita excluída')
      refetch()
    } catch (err: any) {
      showToast('erro', err.message)
    }
  }

  const marcarRecebida = async (r: Receita) => {
    try {
      await apiFetch(`/financeiro/receitas/${r.id}`, {
        method: 'PUT',
        body: JSON.stringify({ dataRecebimento: new Date().toISOString().slice(0, 10), status: 'recebida' }),
      })
      showToast('sucesso', 'Receita marcada como recebida')
      refetch()
    } catch (err: any) {
      showToast('erro', err.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniStat label="Total no mês" value={fmtBRL(total)} icon={DollarSign} color="blue" />
        <MiniStat label="Recebido" value={fmtBRL(recebido)} icon={CheckCircle2} color="emerald" />
        <MiniStat label="A receber" value={fmtBRL(aReceber)} icon={Calendar} color="amber" />
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setShowNew(true)} className={uiAction.primary}>
          <Plus className="h-4 w-4" /> Nova receita
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className={uiAction.secondary}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar NFS-e (XML) / NF (PDF)
        </button>
        <input ref={fileRef} type="file" accept=".xml,.pdf" multiple className="hidden" onChange={(e) => e.target.files && handleUploadNf(e.target.files)} />
      </div>

      <div className={financeTableWrapClass}>
        <table className="ui-table w-full text-sm">
          <thead className={financeTableHeadClass}>
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">NFS-e</th>
              <th className="px-3 py-2 text-right">Bruto</th>
              <th className="px-3 py-2 text-right">Líquido</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
            {!loading && receitas.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground italic">Sem receitas em {fmtCompetencia(competencia)}</td></tr>
            )}
            {receitas.map((r) => (
              <tr key={r.id} className={financeTableRowClass}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.dataEmissao)}</td>
                <td className="px-3 py-2">{r.descricao}</td>
                <td className="px-3 py-2 text-[var(--text-soft)]">{r.cliente?.nome ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-soft)]">{r.nfse?.numero ?? '—'}</td>
                <td className="px-3 py-2 text-right">{fmtBRL(r.valorBruto)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtBRL(r.valorLiquido)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {r.anexos.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-soft)] mr-2" title={`${r.anexos.length} anexo(s)`}>
                      <Paperclip className="h-3 w-3" />{r.anexos.length}
                    </span>
                  )}
                  {r.status !== 'recebida' && r.status !== 'cancelada' && (
                    <button onClick={() => marcarRecebida(r)} className={`${financeInlineActionClass} mr-1`} title="Marcar como recebida">
                      Receber
                    </button>
                  )}
                  <button onClick={() => handleDelete(r.id)} className={financeDangerActionClass}>
                    <Trash2 className="inline h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NovaReceitaModal competencia={competencia} empresaId={empresaId} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refetch(); showToast('sucesso', 'Receita cadastrada') }} onError={(m) => showToast('erro', m)} />}
    </div>
  )
}

/* ================= Despesas ================= */

function DespesasSection({ competencia, showToast, empresaId, qEmp }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void; empresaId: string; qEmp: (base: string) => string }) {
  const { data: despesas, loading, refetch } = useApi<Despesa[]>(qEmp(`/financeiro/despesas?competencia=${competencia}`), [])
  const { data: categorias } = useApi<CategoriaMeta[]>('/financeiro/categorias', [])
  const [showNew, setShowNew] = useState(false)

  const total = useMemo(() => despesas.reduce((s, d) => s + d.valor, 0), [despesas])
  const pago = useMemo(() => despesas.filter((d) => d.status === 'paga').reduce((s, d) => s + d.valor, 0), [despesas])
  const pendente = useMemo(() => despesas.filter((d) => d.status !== 'paga' && d.status !== 'cancelada').reduce((s, d) => s + d.valor, 0), [despesas])

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta despesa?')) return
    try {
      await apiFetch(`/financeiro/despesas/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Despesa excluída')
      refetch()
    } catch (err: any) {
      showToast('erro', err.message)
    }
  }

  const marcarPaga = async (d: Despesa) => {
    try {
      await apiFetch(`/financeiro/despesas/${d.id}`, {
        method: 'PUT',
        body: JSON.stringify({ dataPagamento: new Date().toISOString().slice(0, 10), status: 'paga' }),
      })
      showToast('sucesso', 'Despesa paga')
      refetch()
    } catch (err: any) {
      showToast('erro', err.message)
    }
  }

  const catMap = Object.fromEntries(categorias.map((c) => [c.id, c.nome]))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniStat label="Total no mês" value={fmtBRL(total)} icon={DollarSign} color="blue" />
        <MiniStat label="Pago" value={fmtBRL(pago)} icon={CheckCircle2} color="emerald" />
        <MiniStat label="A pagar" value={fmtBRL(pendente)} icon={Calendar} color="amber" />
      </div>

      <div className="flex gap-2">
        <button onClick={() => setShowNew(true)} className={uiAction.primary}>
          <Plus className="h-4 w-4" /> Nova despesa
        </button>
      </div>

      <div className={financeTableWrapClass}>
        <table className="ui-table w-full text-sm">
          <thead className={financeTableHeadClass}>
            <tr>
              <th className="px-3 py-2 text-left">Vencimento</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left">Fornecedor</th>
              <th className="px-3 py-2 text-left">Categoria</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
            {!loading && despesas.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground italic">Sem despesas em {fmtCompetencia(competencia)}</td></tr>
            )}
            {despesas.map((d) => (
              <tr key={d.id} className={financeTableRowClass}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(d.dataVencimento)}</td>
                <td className="px-3 py-2">{d.descricao}</td>
                <td className="px-3 py-2 text-[var(--text-soft)]">{d.fornecedor?.nome ?? '—'}</td>
                <td className="px-3 py-2 text-xs"><span className="rounded-full bg-aletis-bege px-2 py-0.5 text-foreground">{catMap[d.categoria] ?? d.categoria}</span></td>
                <td className="px-3 py-2 text-right">{fmtBRL(d.valor)}</td>
                <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {d.anexos.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--text-soft)] mr-2">
                      <Paperclip className="h-3 w-3" />{d.anexos.length}
                    </span>
                  )}
                  {d.status !== 'paga' && d.status !== 'cancelada' && (
                    <button onClick={() => marcarPaga(d)} className={`${financeInlineActionClass} mr-1`}>Pagar</button>
                  )}
                  <button onClick={() => handleDelete(d.id)} className={financeDangerActionClass}>
                    <Trash2 className="inline h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NovaDespesaModal competencia={competencia} categorias={categorias} empresaId={empresaId} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refetch(); showToast('sucesso', 'Despesa cadastrada') }} onError={(m) => showToast('erro', m)} />}
    </div>
  )
}

/* ================= Impostos ================= */

function ImpostosSection({ competencia, showToast, empresaId, qEmp }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void; empresaId: string; qEmp: (base: string) => string }) {
  const { data: impostos, loading, refetch } = useApi<Imposto[]>(qEmp(`/financeiro/impostos?competencia=${competencia}`), [])
  const [calculating, setCalculating] = useState(false)
  const [calcResult, setCalcResult] = useState<any>(null)

  const calcularDAS = async (criar: boolean) => {
    setCalculating(true)
    try {
      const body: any = { competencia, criar }
      if (empresaId) body.empresaId = empresaId
      const res = await apiFetch<any>('/financeiro/impostos/calcular-das', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      setCalcResult(res.calc)
      if (criar && res.imposto) {
        showToast('sucesso', `DAS ${fmtBRL(res.calc.valorDAS)} registrado`)
        refetch()
      }
    } catch (err: any) {
      showToast('erro', err.message)
    } finally {
      setCalculating(false)
    }
  }

  const marcarPago = async (imp: Imposto) => {
    try {
      await apiFetch(`/financeiro/impostos/${imp.id}`, {
        method: 'PUT',
        body: JSON.stringify({ dataPagamento: new Date().toISOString().slice(0, 10), status: 'pago' }),
      })
      showToast('sucesso', 'Imposto pago')
      refetch()
    } catch (err: any) { showToast('erro', err.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este imposto?')) return
    try {
      await apiFetch(`/financeiro/impostos/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Imposto excluído')
      refetch()
    } catch (err: any) { showToast('erro', err.message) }
  }

  return (
    <div className="space-y-4">
      <div className={financePanelPaddedClass}>
        <h3 className="font-display text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-foreground" />
          Calculadora de DAS — Simples Nacional (Anexo III)
        </h3>
        <p className="text-xs text-[var(--text-soft)] mb-3">
          Calcula automaticamente o DAS do mês usando a receita bruta do mês e o RBT12
          (últimos 12 meses), aplicando a fórmula{' '}
          <code className="bg-card px-1.5 py-0.5 rounded">((RBT12 × alíquota) − PD) / RBT12</code>.
        </p>
        <div className="flex gap-2">
          <button onClick={() => calcularDAS(false)} disabled={calculating} className={uiAction.secondary}>
            {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Calcular
          </button>
          <button onClick={() => calcularDAS(true)} disabled={calculating} className={uiAction.primary}>
            <Plus className="h-4 w-4" />
            Calcular e registrar
          </button>
        </div>
        {calcResult && (
          <div className="mt-3 rounded-lg bg-card p-3 border border-aletis-verde/20">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><span className="text-[var(--text-soft)]">Receita</span><div className="font-semibold">{fmtBRL(calcResult.receitaBrutaMes)}</div></div>
              <div><span className="text-[var(--text-soft)]">RBT12</span><div className="font-semibold">{fmtBRL(calcResult.rbt12)}</div></div>
              <div><span className="text-[var(--text-soft)]">Alíq. efetiva</span><div className="font-semibold">{fmtPct(calcResult.aliquotaEfetiva)}</div></div>
              <div><span className="text-[var(--text-soft)]">DAS</span><div className="font-bold text-foreground">{fmtBRL(calcResult.valorDAS)}</div></div>
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-[11px] font-mono text-[var(--text-soft)]">{calcResult.memoriaCalculo}</pre>
          </div>
        )}
      </div>

      <div className={financeTableWrapClass}>
        <table className="ui-table w-full text-sm">
          <thead className={financeTableHeadClass}>
            <tr>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left">Vencimento</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
            {!loading && impostos.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground italic">Sem impostos em {fmtCompetencia(competencia)}</td></tr>
            )}
            {impostos.map((i) => (
              <tr key={i.id} className={financeTableRowClass}>
                <td className="px-3 py-2 uppercase text-xs font-semibold text-foreground">{i.tipo.replace('_', ' ')}</td>
                <td className="px-3 py-2">{i.descricao}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(i.dataVencimento)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtBRL(i.valor)}</td>
                <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {i.status !== 'pago' && (
                    <button onClick={() => marcarPago(i)} className={`${financeInlineActionClass} mr-1`}>Pagar</button>
                  )}
                  <button onClick={() => handleDelete(i.id)} className={financeDangerActionClass}>
                    <Trash2 className="inline h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ================= Extratos ================= */

/* ================= Reconciliação OFX assistida ================= */

interface SugestaoReconciliacao {
  lancamentoId: string
  lancamento: { id: string; data: string; descricao: string; valor: number; tipo: 'credito' | 'debito' }
  candidatos: Array<{
    entidadeTipo: 'receita' | 'despesa' | 'imposto'
    entidadeId: string
    entidadeDescricao: string
    entidadeValor: number
    entidadeData: string
    score: number
    criterios: { valorExato: boolean; diffDias: number; keywordMatch: boolean; mesmaCompetencia: boolean }
    motivo: string
  }>
}

function ReconciliacaoSugestoes({
  showToast,
  onReconciliado,
}: {
  showToast: (t: 'sucesso' | 'erro', m: string) => void
  onReconciliado: () => void
}) {
  const { data: sugestoes, loading, refetch } = useApi<SugestaoReconciliacao[]>('/financeiro/reconciliacao/sugestoes', [])
  const [expandido, setExpandido] = useState(false)
  const [aplicando, setAplicando] = useState<string | null>(null)

  const aplicar = async (lancamentoId: string, cand: SugestaoReconciliacao['candidatos'][number]) => {
    setAplicando(`${lancamentoId}:${cand.entidadeId}`)
    try {
      await apiFetch(`/financeiro/lancamentos/${lancamentoId}/vincular`, {
        method: 'POST',
        body: JSON.stringify({ tipo: cand.entidadeTipo, entidadeId: cand.entidadeId }),
      })
      showToast('sucesso', `Reconciliado com ${cand.entidadeTipo} · score ${cand.score}`)
      refetch()
      onReconciliado()
    } catch (err: any) {
      showToast('erro', err.message ?? 'Falha ao reconciliar')
    } finally {
      setAplicando(null)
    }
  }

  if (loading) return null
  if (!sugestoes || sugestoes.length === 0) {
    return (
      <div className={`${financePanelClass} flex items-center gap-2 p-3 text-xs text-muted-foreground`}>
        <Link2 className="h-4 w-4 text-foreground" />
        Nenhuma reconciliação pendente — todos os lançamentos OFX estão vinculados ou sem match.
      </div>
    )
  }

  const totalSugestoes = sugestoes.reduce((s, x) => s + x.candidatos.length, 0)

  return (
    <div className="rounded-xl border border-amber-300/60 bg-amber-50/40 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-50/80"
      >
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-amber-700" />
          <span className="font-display text-sm font-semibold text-foreground">
            Reconciliação OFX — {sugestoes.length} lançamento(s) com {totalSugestoes} sugestão(ões)
          </span>
        </div>
        <span className="text-xs text-amber-700">
          {expandido ? 'Recolher' : 'Expandir'}
        </span>
      </button>
      {expandido && (
        <div className="divide-y divide-amber-200/60 border-t border-amber-200/60">
          {sugestoes.slice(0, 20).map((s) => (
            <div key={s.lancamentoId} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${s.lancamento.tipo === 'credito' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {s.lancamento.tipo === 'credito' ? 'Crédito' : 'Débito'}
                  </span>
                  <span className="text-[var(--text-soft)]">{fmtDate(s.lancamento.data)}</span>
                  <span className="font-medium text-foreground truncate max-w-[420px]">{s.lancamento.descricao}</span>
                </div>
                <span className="font-semibold text-foreground">{fmtBRL(Math.abs(s.lancamento.valor))}</span>
              </div>
              <div className="space-y-1 pl-4 border-l-2 border-amber-300/60">
                {s.candidatos.map((c) => {
                  const key = `${s.lancamentoId}:${c.entidadeId}`
                  const isAplicando = aplicando === key
                  return (
                    <div key={c.entidadeId} className="flex items-center justify-between gap-2 text-xs bg-card rounded px-2 py-1.5 border border-amber-200/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 uppercase">
                            {c.entidadeTipo}
                          </span>
                          <span className="truncate text-foreground" title={c.entidadeDescricao}>
                            {c.entidadeDescricao}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--text-soft)]">
                          <span>{fmtBRL(c.entidadeValor)}</span>
                          <span>{fmtDate(c.entidadeData)}</span>
                          <span className="italic">{c.motivo}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[11px] font-bold ${c.score >= 80 ? 'text-emerald-700' : c.score >= 60 ? 'text-amber-700' : 'text-[var(--text-soft)]'}`}>
                          {c.score}
                        </span>
                        <button
                          onClick={() => aplicar(s.lancamentoId, c)}
                          disabled={isAplicando}
                          className="inline-flex items-center gap-1 rounded bg-aletis-verde px-2 py-1 text-[11px] text-white hover:bg-aletis-verde-escuro disabled:opacity-50"
                        >
                          {isAplicando ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Vincular
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {sugestoes.length > 20 && (
            <div className="px-4 py-2 text-[11px] text-muted-foreground italic text-center">
              Mais {sugestoes.length - 20} sugestão(ões) — refine o filtro para ver as restantes.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ExtratosSection({ competencia, showToast, empresaId, qEmp }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void; empresaId: string; qEmp: (base: string) => string }) {
  const [ano, mes] = competencia.split('-').map(Number)
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const inicio = `${competencia}-01`
  const fim = `${competencia}-${String(ultimoDia).padStart(2, '0')}`
  const { data: lancamentos, loading, refetch } = useApi<Lancamento[]>(
    qEmp(`/financeiro/lancamentos?dataInicio=${inicio}&dataFim=${fim}`), []
  )
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResumo, setImportResumo] = useState<any>(null)

  const credito = useMemo(() => lancamentos.filter((l) => l.tipo === 'credito').reduce((s, l) => s + l.valor, 0), [lancamentos])
  const debito = useMemo(() => lancamentos.filter((l) => l.tipo === 'debito').reduce((s, l) => s + l.valor, 0), [lancamentos])

  const handleImportOfx = async (files: FileList) => {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('competencia', competencia)
      fd.append('contaId', 'default')
      fd.append('file', files[0])
      const res = await fetch('/api/financeiro/lancamentos/importar-ofx', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok || json.success === false) throw new Error(json.error || 'Falha ao importar OFX')
      setImportResumo(json.data)
      showToast('sucesso', `${json.data.totais.criados} lançamentos criados (${json.data.totais.duplicados} duplicados ignorados)`)
      refetch()
    } catch (err: any) {
      showToast('erro', err.message)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return
    try {
      await apiFetch(`/financeiro/lancamentos/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Lançamento excluído')
      refetch()
    } catch (err: any) { showToast('erro', err.message) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MiniStat label="Entradas (crédito)" value={fmtBRL(credito)} icon={ArrowDownRight} color="emerald" />
        <MiniStat label="Saídas (débito)" value={fmtBRL(Math.abs(debito))} icon={ArrowUpRight} color="rose" />
        <MiniStat label="Saldo no período" value={fmtBRL(credito + debito)} icon={Wallet} color="blue" />
      </div>

      <div className="flex gap-2">
        <button onClick={() => fileRef.current?.click()} disabled={importing} className={uiAction.primary}>
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar OFX
        </button>
        <input ref={fileRef} type="file" accept=".ofx" className="hidden" onChange={(e) => e.target.files && handleImportOfx(e.target.files)} />
      </div>

      {importResumo && (
        <div className="rounded-xl border border-aletis-verde/30 bg-aletis-bege/50 p-3 text-xs">
          <strong>OFX importado:</strong> banco {importResumo.conta.bankId ?? '—'}, conta {importResumo.conta.accountId ?? '—'}.
          Período: {fmtDate(importResumo.periodo.inicio)} a {fmtDate(importResumo.periodo.fim)}.
          {importResumo.totais.criados} lançamentos criados, {importResumo.totais.duplicados} já existentes.
        </div>
      )}

      <ReconciliacaoSugestoes showToast={showToast} onReconciliado={refetch} />

      <div className={financeTableWrapClass}>
        <table className="ui-table w-full text-sm">
          <thead className={financeTableHeadClass}>
            <tr>
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Descrição</th>
              <th className="px-3 py-2 text-left">Categoria</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2 text-left">Origem</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
            {!loading && lancamentos.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground italic">Sem lançamentos no período</td></tr>
            )}
            {lancamentos.map((l) => (
              <tr key={l.id} className={financeTableRowClass}>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.data)}</td>
                <td className="px-3 py-2">{l.descricao}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-soft)]">{l.categoria ?? 'não classificado'}</td>
                <td className={`px-3 py-2 text-right font-medium ${l.tipo === 'credito' ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtBRL(l.valor)}</td>
                <td className="px-3 py-2 text-xs uppercase text-muted-foreground">{l.origem}</td>
                <td className="px-3 py-2 text-right">
                  {l.vinculadoA && (
                    <Link2 className="inline h-3.5 w-3.5 text-foreground mr-1" />
                  )}
                  <button onClick={() => handleDelete(l.id)} className={financeDangerActionClass}>
                    <Trash2 className="inline h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ================= Fechamento ================= */

function FechamentoSection({ competencia, showToast, empresaId, qEmp }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void; empresaId: string; qEmp: (base: string) => string }) {
  const { data: checklist, loading, refetch } = useApi<Checklist | null>(qEmp(`/financeiro/fechamento/${competencia}/checklist`), null)
  const [generating, setGenerating] = useState(false)

  const download = async (tipo: 'zip' | 'pdf') => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/financeiro/fechamento/${competencia}/download-${tipo}`)
      if (!res.ok) throw new Error(`Falha ao baixar ${tipo.toUpperCase()}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `fechamento-${competencia}.${tipo}`
      a.click()
      URL.revokeObjectURL(url)
      showToast('sucesso', `${tipo.toUpperCase()} baixado`)
    } catch (err: any) {
      showToast('erro', err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={financePanelPaddedClass}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-aletis-verde/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground">
              <Package className="h-3 w-3" />
              Pacote para o contador
            </div>
            <h3 className="font-display text-xl font-bold text-foreground">
              Fechamento de {fmtCompetencia(competencia)}
            </h3>
            <p className="text-sm text-[var(--text-soft)] mt-1 max-w-xl">
              Gera um ZIP com todos os anexos organizados (NFS-e, comprovantes, extrato OFX),
              CSVs para importação contábil e um PDF formal com DRE, memória de cálculo do DAS
              e checklist — pronto pra anexar num e-mail ao contador.
            </p>
          </div>
          <button onClick={refetch} className={uiAction.iconButton} title="Atualizar checklist">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => download('zip')} disabled={generating} className={uiAction.primary}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Baixar ZIP completo
          </button>
          <button onClick={() => download('pdf')} disabled={generating} className={uiAction.secondary}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Baixar apenas PDF resumo
          </button>
        </div>
      </div>

      <div className={financePanelPaddedClass}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-foreground" />
            Checklist de fechamento
          </h3>
          {checklist && (
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
              checklist.pronto ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {checklist.pronto ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {checklist.pronto ? 'Pronto para envio' : 'Pendências'}
            </span>
          )}
        </div>

        {loading && <p className="text-xs text-muted-foreground italic">Carregando…</p>}
        {checklist && (
          <ul className="space-y-2">
            {checklist.itens.map((item, i) => (
              <li key={i} className={`flex items-start gap-3 rounded-lg border p-3 ${item.ok ? 'border-emerald-100 bg-emerald-50/30' : 'border-amber-100 bg-amber-50/30'}`}>
                <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${item.ok ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                  {item.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                </div>
                <div>
                  <div className="text-sm font-display font-medium text-foreground">{item.titulo}</div>
                  <div className="text-xs text-[var(--text-soft)] mt-0.5">{item.detalhe}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ================= Empresas ================= */

interface Empresa {
  id: string
  cnpj: string
  razaoSocial: string
  nomeFantasia?: string
  atividadePrincipal?: string
  naturezaJuridica?: string
  endereco?: string
  cidade?: string
  uf?: string
  cep?: string
  telefone?: string
  email?: string
  dataAbertura?: string
  situacaoCadastral?: 'ativa' | 'inativa' | 'baixada'
  porte?: 'ME' | 'EPP' | 'ME' | 'DEMAIS'
  ativa: boolean
  responsavel?: string
  observacoes?: string
}

interface Levantamento {
  id: string
  empresaId: string
  competencia: string
  faturamento: number
  custosOperacionais: number
  despesasAdministrativas: number
  folhaPagamento: number
  impostos: number
  resultadoLiquido: number
  margemPercentual: number
  observacoes?: string
}

interface RelatorioEmpresa {
  empresa: Empresa | null
  serie12m: Array<{ competencia: string; faturamento: number; resultado: number; margemPct: number }>
  totais12m: { faturamento: number; custos: number; despesas: number; folha: number; impostos: number; resultado: number }
  mediaMargem: number
}

function EmpresasSection({ showToast }: { showToast: (t: 'sucesso' | 'erro', m: string) => void }) {
  const { data: empresas, loading, refetch } = useApi<Empresa[]>('/financeiro/empresas', [])
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null)
  const [abaEmpresa, setAbaEmpresa] = useState<'levantamentos' | 'relatorio'>('levantamentos')
  const [showModalEmpresa, setShowModalEmpresa] = useState(false)
  const [showModalLev, setShowModalLev] = useState(false)
  const [editandoEmpresa, setEditandoEmpresa] = useState<Empresa | null>(null)
  const [editandoLev, setEditandoLev] = useState<Levantamento | null>(null)

  const { data: levantamentos, refetch: refetchLevs } = useApi<Levantamento[]>(
    empresaSelecionada ? `/financeiro/levantamentos?empresaId=${empresaSelecionada.id}` : null,
    [],
  )

  const { data: relatorio } = useApi<RelatorioEmpresa | null>(
    empresaSelecionada && abaEmpresa === 'relatorio' ? `/financeiro/empresas/${empresaSelecionada.id}/relatorio` : null,
    null,
  )

  const [formEmpresa, setFormEmpresa] = useState<Partial<Empresa>>({ ativa: true })
  const [formLev, setFormLev] = useState<Partial<Levantamento>>({ competencia: currentCompetencia(), faturamento: 0, custosOperacionais: 0, despesasAdministrativas: 0, folhaPagamento: 0, impostos: 0 })

  const salvarEmpresa = async () => {
    if (!formEmpresa.cnpj?.trim() || !formEmpresa.razaoSocial?.trim()) {
      showToast('erro', 'CNPJ e Razão Social são obrigatórios')
      return
    }
    try {
      if (editandoEmpresa) {
        await apiFetch(`/financeiro/empresas/${editandoEmpresa.id}`, { method: 'PUT', body: JSON.stringify(formEmpresa) })
        showToast('sucesso', 'Empresa atualizada')
      } else {
        await apiFetch(`/financeiro/empresas`, { method: 'POST', body: JSON.stringify(formEmpresa) })
        showToast('sucesso', 'Empresa criada')
      }
      setShowModalEmpresa(false)
      setEditandoEmpresa(null)
      setFormEmpresa({ ativa: true })
      refetch()
    } catch (e: any) {
      showToast('erro', e.message)
    }
  }

  const excluirEmpresa = async (id: string) => {
    if (!confirm('Excluir empresa e todos os levantamentos vinculados?')) return
    try {
      await apiFetch(`/financeiro/empresas/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Empresa excluída')
      if (empresaSelecionada?.id === id) setEmpresaSelecionada(null)
      refetch()
    } catch (e: any) {
      showToast('erro', e.message)
    }
  }

  const salvarLev = async () => {
    if (!empresaSelecionada) return
    if (!formLev.competencia) { showToast('erro', 'Competência obrigatória'); return }
    try {
      const payload = { ...formLev, empresaId: empresaSelecionada.id }
      if (editandoLev) {
        await apiFetch(`/financeiro/levantamentos/${editandoLev.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        showToast('sucesso', 'Levantamento atualizado')
      } else {
        await apiFetch(`/financeiro/levantamentos`, { method: 'POST', body: JSON.stringify(payload) })
        showToast('sucesso', 'Levantamento criado')
      }
      setShowModalLev(false)
      setEditandoLev(null)
      setFormLev({ competencia: currentCompetencia(), faturamento: 0, custosOperacionais: 0, despesasAdministrativas: 0, folhaPagamento: 0, impostos: 0 })
      refetchLevs()
    } catch (e: any) {
      showToast('erro', e.message)
    }
  }

  const excluirLev = async (id: string) => {
    if (!confirm('Excluir levantamento?')) return
    try {
      await apiFetch(`/financeiro/levantamentos/${id}`, { method: 'DELETE' })
      showToast('sucesso', 'Levantamento excluído')
      refetchLevs()
    } catch (e: any) {
      showToast('erro', e.message)
    }
  }

  return (
    <div className="space-y-5">
      {!empresaSelecionada ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold text-foreground">Empresas do Grupo</h2>
            <button
              onClick={() => { setEditandoEmpresa(null); setFormEmpresa({ ativa: true }); setShowModalEmpresa(true) }}
              className={uiAction.primary}
            >
              <Plus className="w-4 h-4" /> Nova Empresa
            </button>
          </div>
          {loading && <LoadingCard />}
          {!loading && (!empresas || empresas.length === 0) && (
            <EmptyCard icon={Building2} titulo="Nenhuma empresa cadastrada" detalhe="Cadastre as empresas do grupo para fazer o levantamento mensal." />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {empresas?.map((e) => (
              <div key={e.id} className={`${financePanelPaddedClass} ${uiSurface.panelHover} cursor-pointer group`} onClick={() => setEmpresaSelecionada(e)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-display font-semibold text-foreground truncate group-hover:text-aletis-verde transition-colors">{e.razaoSocial}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{e.cnpj}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${e.ativa ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{e.ativa ? 'Ativa' : 'Inativa'}</span>
                </div>
                <div className="mt-3 space-y-1 text-xs text-[var(--text-soft)]">
                  {e.nomeFantasia && <p>Nome fantasia: {e.nomeFantasia}</p>}
                  {e.cidade && <p>{e.cidade}{e.uf ? `/${e.uf}` : ''}</p>}
                  {e.responsavel && <p>Resp: {e.responsavel}</p>}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={(ev) => { ev.stopPropagation(); setEditandoEmpresa(e); setFormEmpresa(e); setShowModalEmpresa(true) }}
                    className={uiAction.iconButton}
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(ev) => { ev.stopPropagation(); excluirEmpresa(e.id) }}
                    className={`${uiAction.iconButton} hover:text-rose-600`}
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setEmpresaSelecionada(null)} className="text-sm text-foreground hover:underline">← Voltar às empresas</button>
          </div>
          <div className={financePanelPaddedClass}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-display font-semibold text-foreground">{empresaSelecionada.razaoSocial}</h2>
                <p className="text-sm text-[var(--text-soft)] mt-0.5">{empresaSelecionada.cnpj} {empresaSelecionada.nomeFantasia ? `• ${empresaSelecionada.nomeFantasia}` : ''}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAbaEmpresa('levantamentos')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${abaEmpresa === 'levantamentos' ? 'bg-aletis-verde text-white' : 'bg-card border border-aletis-borda text-[var(--text-soft)] hover:bg-aletis-bege'}`}>Levantamentos</button>
                <button onClick={() => setAbaEmpresa('relatorio')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${abaEmpresa === 'relatorio' ? 'bg-aletis-verde text-white' : 'bg-card border border-aletis-borda text-[var(--text-soft)] hover:bg-aletis-bege'}`}>Relatório 12m</button>
              </div>
            </div>
          </div>

          {abaEmpresa === 'levantamentos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-semibold text-foreground">Levantamentos Mensais</h3>
                <button onClick={() => { setEditandoLev(null); setFormLev({ competencia: currentCompetencia(), faturamento: 0, custosOperacionais: 0, despesasAdministrativas: 0, folhaPagamento: 0, impostos: 0 }); setShowModalLev(true) }} className={uiAction.primary}>
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>
              {!levantamentos || levantamentos.length === 0 ? (
                <EmptyCard icon={BarChart3} titulo="Sem levantamentos" detalhe="Adicione o primeiro levantamento mensal para esta empresa." />
              ) : (
                <div className={financeTableWrapClass}>
                  <table className="ui-table w-full text-sm">
                    <thead className={financeTableHeadClass}>
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider">Competência</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wider">Faturamento</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wider">Custos</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wider">Despesas</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wider">Folha</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wider">Impostos</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wider">Resultado</th>
                        <th className="text-right px-3 py-2 text-xs font-semibold uppercase tracking-wider">Margem</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-aletis-borda/50">
                      {levantamentos.map((l) => (
                        <tr key={l.id} className="transition-colors hover:bg-aletis-cream-papel/60">
                          <td className="px-3 py-2 font-medium">{fmtCompetencia(l.competencia)}</td>
                          <td className="px-3 py-2 text-right">{fmtBRL(l.faturamento)}</td>
                          <td className="px-3 py-2 text-right">{fmtBRL(l.custosOperacionais)}</td>
                          <td className="px-3 py-2 text-right">{fmtBRL(l.despesasAdministrativas)}</td>
                          <td className="px-3 py-2 text-right">{fmtBRL(l.folhaPagamento)}</td>
                          <td className="px-3 py-2 text-right">{fmtBRL(l.impostos)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${l.resultadoLiquido >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtBRL(l.resultadoLiquido)}</td>
                          <td className="px-3 py-2 text-right">{l.margemPercentual.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => { setEditandoLev(l); setFormLev(l); setShowModalLev(true) }} className={uiAction.iconButton}><Edit3 className="w-3.5 h-3.5" /></button>
                              <button onClick={() => excluirLev(l.id)} className={`${uiAction.iconButton} hover:text-rose-600`}><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {abaEmpresa === 'relatorio' && (
            <div className="space-y-4">
              {!relatorio ? (
                <LoadingCard />
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard label="Faturamento 12m" value={fmtBRL(relatorio.totais12m.faturamento)} icon={TrendingUp} color="emerald" />
                    <KpiCard label="Resultado 12m" value={fmtBRL(relatorio.totais12m.resultado)} icon={TrendingUp} color={relatorio.totais12m.resultado >= 0 ? 'emerald' : 'rose'} />
                    <KpiCard label="Margem Média" value={`${relatorio.mediaMargem.toFixed(1)}%`} icon={Target} color="amber" />
                    <KpiCard label=" Meses no período" value={`${relatorio.serie12m.length}`} icon={Calendar} color="blue" />
                  </div>
                  {relatorio.serie12m.length > 0 && (
                    <div className={financePanelPaddedClass}>
                      <h3 className="text-sm font-display font-semibold text-foreground mb-3">Evolução mensal</h3>
                      <div className="flex items-end gap-2 h-40 overflow-x-auto pb-1">
                        {relatorio.serie12m.map((s) => {
                          const maxVal = Math.max(...relatorio.serie12m.map((x) => Math.max(x.faturamento, Math.abs(x.resultado))), 1)
                          return (
                            <div key={s.competencia} className="flex flex-col items-center gap-1 min-w-[56px]">
                              <div className="flex items-end gap-0.5 h-32">
                                <div className="w-3 bg-emerald-400 rounded-t" style={{ height: `${(s.faturamento / maxVal) * 100}%` }} />
                                <div className={`w-3 rounded-t ${s.resultado >= 0 ? 'bg-aletis-verde' : 'bg-rose-500'}`} style={{ height: `${(Math.abs(s.resultado) / maxVal) * 100}%` }} />
                              </div>
                              <span className="text-[11px] text-muted-foreground">{fmtCompetencia(s.competencia)}</span>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex gap-3 mt-2 text-[11px]">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400" />Faturamento</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-aletis-verde" />Resultado +</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-500" />Resultado -</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Empresa */}
      {showModalEmpresa && (
        <AppDialog
          title={editandoEmpresa ? 'Editar empresa' : 'Nova empresa'}
          eyebrow="Financeiro interno"
          subtitle="Cadastre ou atualize os dados cadastrais da empresa do grupo."
          icon={<Building2 className="h-5 w-5" />}
          size="md"
          onClose={() => setShowModalEmpresa(false)}
          bodyClassName="space-y-4"
          footerClassName="flex justify-end gap-2"
          footer={(
            <>
              <button type="button" onClick={() => setShowModalEmpresa(false)} className={uiAction.secondary}>Cancelar</button>
              <button type="button" onClick={salvarEmpresa} className={uiAction.primary}>Salvar</button>
            </>
          )}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="CNPJ *" value={formEmpresa.cnpj ?? ''} onChange={(v) => setFormEmpresa((p) => ({ ...p, cnpj: v }))} />
            <Field label="Razão social *" value={formEmpresa.razaoSocial ?? ''} onChange={(v) => setFormEmpresa((p) => ({ ...p, razaoSocial: v }))} />
            <Field label="Nome fantasia" value={formEmpresa.nomeFantasia ?? ''} onChange={(v) => setFormEmpresa((p) => ({ ...p, nomeFantasia: v }))} />
            <Field label="Responsável" value={formEmpresa.responsavel ?? ''} onChange={(v) => setFormEmpresa((p) => ({ ...p, responsavel: v }))} />
            <Field label="Cidade" value={formEmpresa.cidade ?? ''} onChange={(v) => setFormEmpresa((p) => ({ ...p, cidade: v }))} />
            <Field label="UF" value={formEmpresa.uf ?? ''} onChange={(v) => setFormEmpresa((p) => ({ ...p, uf: v.toUpperCase() }))} />
            <div className="sm:col-span-2">
              <label className={fieldLabelClass}>Observações</label>
              <textarea
                className="input-field min-h-20 resize-y text-sm"
                rows={3}
                value={formEmpresa.observacoes ?? ''}
                onChange={(e) => setFormEmpresa((p) => ({ ...p, observacoes: e.target.value }))}
              />
            </div>
          </div>
        </AppDialog>
      )}

      {/* Modal Levantamento */}
      {showModalLev && (
        <AppDialog
          title={editandoLev ? 'Editar levantamento' : 'Novo levantamento'}
          eyebrow={empresaSelecionada?.razaoSocial ?? 'Empresa'}
          subtitle="Informe a competência e os principais valores financeiros do mês."
          icon={<BarChart3 className="h-5 w-5" />}
          size="md"
          onClose={() => setShowModalLev(false)}
          bodyClassName="space-y-4"
          footerClassName="flex justify-end gap-2"
          footer={(
            <>
              <button type="button" onClick={() => setShowModalLev(false)} className={uiAction.secondary}>Cancelar</button>
              <button type="button" onClick={salvarLev} className={uiAction.primary}>Salvar</button>
            </>
          )}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Competência *" type="month" value={formLev.competencia ?? ''} onChange={(v) => setFormLev((p) => ({ ...p, competencia: v }))} />
            <Field label="Faturamento" type="number" value={String(formLev.faturamento ?? 0)} onChange={(v) => setFormLev((p) => ({ ...p, faturamento: Number(v) }))} />
            <Field label="Custos operacionais" type="number" value={String(formLev.custosOperacionais ?? 0)} onChange={(v) => setFormLev((p) => ({ ...p, custosOperacionais: Number(v) }))} />
            <Field label="Despesas administrativas" type="number" value={String(formLev.despesasAdministrativas ?? 0)} onChange={(v) => setFormLev((p) => ({ ...p, despesasAdministrativas: Number(v) }))} />
            <Field label="Folha pagamento" type="number" value={String(formLev.folhaPagamento ?? 0)} onChange={(v) => setFormLev((p) => ({ ...p, folhaPagamento: Number(v) }))} />
            <Field label="Impostos" type="number" value={String(formLev.impostos ?? 0)} onChange={(v) => setFormLev((p) => ({ ...p, impostos: Number(v) }))} />
            <div className="sm:col-span-2">
              <label className={fieldLabelClass}>Observações</label>
              <textarea
                className="input-field min-h-20 resize-y text-sm"
                rows={3}
                value={formLev.observacoes ?? ''}
                onChange={(e) => setFormLev((p) => ({ ...p, observacoes: e.target.value }))}
              />
            </div>
          </div>
        </AppDialog>
      )}
    </div>
  )
}

/* ================= Configurações ================= */

function ConfigSection({ showToast }: { showToast: (t: 'sucesso' | 'erro', m: string) => void }) {
  const { data: config, loading, refetch } = useApi<Config | null>('/financeiro/config', null)
  const [form, setForm] = useState<Config | null>(null)

  useEffect(() => { if (config) setForm(config) }, [config])

  if (loading || !form) return <LoadingCard />

  const save = async () => {
    try {
      await apiFetch('/financeiro/config', { method: 'PUT', body: JSON.stringify(form) })
      showToast('sucesso', 'Configurações salvas')
      refetch()
    } catch (err: any) {
      showToast('erro', err.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className={financePanelPaddedClass}>
        <h3 className="font-display text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-foreground" /> Dados da empresa
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Razão social" value={form.empresa.razaoSocial} onChange={(v) => setForm({ ...form, empresa: { ...form.empresa, razaoSocial: v } })} />
          <Field label="Nome fantasia" value={form.empresa.nomeFantasia ?? ''} onChange={(v) => setForm({ ...form, empresa: { ...form.empresa, nomeFantasia: v } })} />
          <Field label="CNPJ" value={form.empresa.cnpj} onChange={(v) => setForm({ ...form, empresa: { ...form.empresa, cnpj: v } })} />
          <Field label="Inscrição Municipal" value={form.empresa.inscricaoMunicipal ?? ''} onChange={(v) => setForm({ ...form, empresa: { ...form.empresa, inscricaoMunicipal: v } })} />
          <Field label="Endereço" value={form.empresa.endereco ?? ''} onChange={(v) => setForm({ ...form, empresa: { ...form.empresa, endereco: v } })} />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Cidade" value={form.empresa.cidade ?? ''} onChange={(v) => setForm({ ...form, empresa: { ...form.empresa, cidade: v } })} />
            <Field label="UF" value={form.empresa.uf ?? ''} onChange={(v) => setForm({ ...form, empresa: { ...form.empresa, uf: v } })} />
            <Field label="CEP" value={form.empresa.cep ?? ''} onChange={(v) => setForm({ ...form, empresa: { ...form.empresa, cep: v } })} />
          </div>
        </div>
      </div>

      <div className={financePanelPaddedClass}>
        <h3 className="font-display text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-foreground" /> Regime tributário
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={fieldLabelClass}>Regime</label>
            <select value={form.regime} onChange={(e) => setForm({ ...form, regime: e.target.value })} className="input-field h-10 text-sm">
              <option value="simples_nacional">Simples Nacional</option>
              <option value="lucro_presumido">Lucro Presumido</option>
              <option value="mei">MEI</option>
            </select>
          </div>
          <div>
            <label className={fieldLabelClass}>Anexo Simples</label>
            <select value={form.anexoSimples} onChange={(e) => setForm({ ...form, anexoSimples: e.target.value })} className="input-field h-10 text-sm">
              <option value="I">I — Comércio</option>
              <option value="II">II — Indústria</option>
              <option value="III">III — Serviços profissionais (consultoria)</option>
              <option value="IV">IV — Serviços</option>
              <option value="V">V — Serviços profissionais</option>
            </select>
          </div>
          <Field label="Alíquota ISS (%)" value={String(form.aliquotas.iss)} onChange={(v) => setForm({ ...form, aliquotas: { ...form.aliquotas, iss: Number(v) || 0 } })} />
          <Field label="IR retenção fonte (%)" value={String(form.aliquotas.irRetencaoFonte ?? '')} onChange={(v) => setForm({ ...form, aliquotas: { ...form.aliquotas, irRetencaoFonte: Number(v) || undefined } })} />
        </div>
      </div>

      <div className={financePanelPaddedClass}>
        <h3 className="font-display text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Mail className="h-4 w-4 text-foreground" /> Contador (destinatário do pacote mensal)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome" value={form.contador.nome} onChange={(v) => setForm({ ...form, contador: { ...form.contador, nome: v } })} />
          <Field label="Escritório" value={form.contador.escritorio ?? ''} onChange={(v) => setForm({ ...form, contador: { ...form.contador, escritorio: v } })} />
          <Field label="E-mail" value={form.contador.email} onChange={(v) => setForm({ ...form, contador: { ...form.contador, email: v } })} />
          <Field label="Telefone" value={form.contador.telefone ?? ''} onChange={(v) => setForm({ ...form, contador: { ...form.contador, telefone: v } })} />
          <Field label="CRC" value={form.contador.crcRegional ?? ''} onChange={(v) => setForm({ ...form, contador: { ...form.contador, crcRegional: v } })} />
        </div>
      </div>

      <button onClick={save} className={uiAction.primary}>
        <CheckCircle2 className="h-4 w-4" /> Salvar configurações
      </button>
    </div>
  )
}

/* ================= Modais ================= */

function NovaReceitaModal({ competencia, onClose, onSaved, onError, empresaId }: { competencia: string; onClose: () => void; onSaved: () => void; onError: (m: string) => void; empresaId?: string }) {
  const [form, setForm] = useState({
    competencia,
    descricao: '',
    clienteNome: '',
    clienteCpfCnpj: '',
    valorBruto: '',
    iss: '',
    ir: '',
    dataEmissao: new Date().toISOString().slice(0, 10),
    dataPrevisaoRecebimento: '',
    formaPagamento: 'pix',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.descricao || !form.valorBruto) { onError('Descrição e valor são obrigatórios'); return }
    setSaving(true)
    try {
      const payload: any = {
        competencia: form.competencia,
        descricao: form.descricao,
        cliente: form.clienteNome ? { nome: form.clienteNome, cpfCnpj: form.clienteCpfCnpj } : undefined,
        valorBruto: Number(form.valorBruto),
        retencoes: { iss: Number(form.iss) || 0, ir: Number(form.ir) || 0 },
        dataEmissao: form.dataEmissao,
        dataPrevisaoRecebimento: form.dataPrevisaoRecebimento || undefined,
        formaPagamento: form.formaPagamento,
        anexos: [],
      }
      if (empresaId) payload.empresaId = empresaId
      await apiFetch('/financeiro/receitas', { method: 'POST', body: JSON.stringify(payload) })
      onSaved()
    } catch (err: any) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      titulo="Nova receita"
      onClose={onClose}
      icon={<DollarSign className="h-5 w-5" />}
      footer={(
        <>
          <button type="button" onClick={onClose} className={uiAction.secondary}>Cancelar</button>
          <button type="button" onClick={handleSubmit} disabled={saving} className={uiAction.primary}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Competência" type="month" value={form.competencia} onChange={(v) => setForm({ ...form, competencia: v })} />
        <Field label="Data emissão" type="date" value={form.dataEmissao} onChange={(v) => setForm({ ...form, dataEmissao: v })} />
        <div className="sm:col-span-2">
          <Field label="Descrição" value={form.descricao} onChange={(v) => setForm({ ...form, descricao: v })} />
        </div>
        <Field label="Cliente" value={form.clienteNome} onChange={(v) => setForm({ ...form, clienteNome: v })} />
        <Field label="CPF/CNPJ" value={form.clienteCpfCnpj} onChange={(v) => setForm({ ...form, clienteCpfCnpj: v })} />
        <Field label="Valor bruto" type="number" value={form.valorBruto} onChange={(v) => setForm({ ...form, valorBruto: v })} />
        <Field label="Previsão recebimento" type="date" value={form.dataPrevisaoRecebimento} onChange={(v) => setForm({ ...form, dataPrevisaoRecebimento: v })} />
        <Field label="Retenção ISS" type="number" value={form.iss} onChange={(v) => setForm({ ...form, iss: v })} />
        <Field label="Retenção IR" type="number" value={form.ir} onChange={(v) => setForm({ ...form, ir: v })} />
      </div>
    </Modal>
  )
}

function NovaDespesaModal({ competencia, categorias, onClose, onSaved, onError, empresaId }: { competencia: string; categorias: CategoriaMeta[]; onClose: () => void; onSaved: () => void; onError: (m: string) => void; empresaId?: string }) {
  const [form, setForm] = useState({
    competencia,
    descricao: '',
    fornecedorNome: '',
    categoria: 'software_saas',
    valor: '',
    dataEmissao: new Date().toISOString().slice(0, 10),
    dataVencimento: new Date().toISOString().slice(0, 10),
    formaPagamento: 'pix',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.descricao || !form.valor) { onError('Descrição e valor são obrigatórios'); return }
    setSaving(true)
    try {
      const payload: any = {
        competencia: form.competencia,
        descricao: form.descricao,
        fornecedor: form.fornecedorNome ? { nome: form.fornecedorNome } : undefined,
        categoria: form.categoria,
        valor: Number(form.valor),
        dataEmissao: form.dataEmissao,
        dataVencimento: form.dataVencimento,
        formaPagamento: form.formaPagamento,
        anexos: [],
      }
      if (empresaId) payload.empresaId = empresaId
      await apiFetch('/financeiro/despesas', { method: 'POST', body: JSON.stringify(payload) })
      onSaved()
    } catch (err: any) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      titulo="Nova despesa"
      onClose={onClose}
      icon={<Receipt className="h-5 w-5" />}
      footer={(
        <>
          <button type="button" onClick={onClose} className={uiAction.secondary}>Cancelar</button>
          <button type="button" onClick={handleSubmit} disabled={saving} className={uiAction.primary}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Competência" type="month" value={form.competencia} onChange={(v) => setForm({ ...form, competencia: v })} />
        <div>
          <label className={fieldLabelClass}>Categoria</label>
          <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="input-field text-sm">
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <Field label="Descrição" value={form.descricao} onChange={(v) => setForm({ ...form, descricao: v })} />
        </div>
        <Field label="Fornecedor" value={form.fornecedorNome} onChange={(v) => setForm({ ...form, fornecedorNome: v })} />
        <Field label="Valor" type="number" value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
        <Field label="Data emissão" type="date" value={form.dataEmissao} onChange={(v) => setForm({ ...form, dataEmissao: v })} />
        <Field label="Vencimento" type="date" value={form.dataVencimento} onChange={(v) => setForm({ ...form, dataVencimento: v })} />
      </div>
    </Modal>
  )
}

/* ================= UI Building blocks ================= */

/* ═══════════════════════════════════════════════════════════
 *  COMPONENTES DE UI PREMIUM — DASHBOARD FINANCEIRO
 * ═══════════════════════════════════════════════════════════ */

function KpiCard({ label, value, subtitle, icon: Icon, color, trend }: {
  label: string; value: string; subtitle?: string; icon: React.ElementType;
  color: 'emerald' | 'rose' | 'blue' | 'amber' | 'dourado' | 'verde';
  trend?: 'up' | 'down' | 'neutral';
}) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : null
  return <MetricCard label={label} value={value} detail={subtitle} icon={Icon} tone={color === 'rose' ? 'danger' : color === 'amber' ? 'warning' : 'neutral'} accessory={TrendIcon ? <TrendIcon aria-label={trend === 'up' ? 'Em alta' : 'Em queda'} className="ml-2 inline h-4 w-4 text-muted-foreground" /> : undefined} />
}

function MiniStat({ label, value, icon: Icon, color, trend }: { label: string; value: string; icon: React.ElementType; color: 'emerald' | 'rose' | 'blue' | 'amber' | 'dourado' | 'verde'; trend?: 'up' | 'down' | 'neutral' }) {
  return <KpiCard label={label} value={value} icon={Icon} color={color} trend={trend} />
}

// Re-export do canônico (components/ui/StatusBadge) com inferStatusTone
// que cobre os labels deste arquivo (recebida/paga/emitida/pendente/etc).
import UIStatusBadge from '../components/ui/StatusBadge'

function StatusBadge({ status }: { status: string }) {
  return <UIStatusBadge label={status} />
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className={fieldLabelClass}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field h-10 text-sm"
      />
    </div>
  )
}

function Modal({
  titulo,
  onClose,
  children,
  icon,
  footer,
}: {
  titulo: string
  onClose: () => void
  children: React.ReactNode
  icon?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <AppDialog
      title={titulo}
      eyebrow="Financeiro interno"
      subtitle="Preencha os campos obrigatórios e revise os valores antes de salvar."
      icon={icon}
      size="md"
      onClose={onClose}
      bodyClassName="space-y-4"
      footerClassName="flex justify-end gap-2"
      footer={footer}
    >
      {children}
    </AppDialog>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-lg border border-aletis-borda/40 bg-card p-5 animate-pulse">
            <div className="h-3 w-24 bg-aletis-borda/40 rounded mb-4" />
            <div className="h-8 w-36 bg-aletis-borda/40 rounded mb-2" />
            <div className="h-3 w-20 bg-aletis-borda/40 rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-aletis-borda/40 bg-card p-6 animate-pulse h-64" />
    </div>
  )
}

function LoadingCard() {
  return (
    <div className="rounded-lg border border-aletis-borda/40 bg-card p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-aletis-verde/5 mb-4">
        <Loader2 className="h-7 w-7 animate-spin text-foreground" />
      </div>
      <p className="text-sm font-medium text-[var(--text-soft)]">Carregando dados financeiros…</p>
    </div>
  )
}

function EmptyCard({ icon: Icon, titulo, detalhe }: { icon: React.ElementType; titulo: string; detalhe: string }) {
  return (
    <div className="rounded-lg border border-aletis-borda/40 bg-card p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-aletis-bege/60 mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" />
      </div>
      <h4 className="font-display text-base font-semibold text-foreground">{titulo}</h4>
      <p className="text-sm text-[var(--text-soft)] mt-1 max-w-sm mx-auto">{detalhe}</p>
    </div>
  )
}
