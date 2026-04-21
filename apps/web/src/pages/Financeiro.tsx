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
import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useApi, apiFetch } from '../hooks/useApi'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Upload,
  Plus,
  X,
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
} from 'lucide-react'

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

/* ================= Tipos ================= */

type Tab = 'dashboard' | 'receitas' | 'despesas' | 'impostos' | 'extratos' | 'fechamento' | 'config'

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

  const showToast = (tipo: 'sucesso' | 'erro', msg: string) => {
    setToast({ tipo, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const tabs: Array<{ key: Tab; label: string; icon: React.ElementType }> = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'receitas', label: 'Receitas', icon: TrendingUp },
    { key: 'despesas', label: 'Despesas', icon: TrendingDown },
    { key: 'impostos', label: 'Impostos', icon: Receipt },
    { key: 'extratos', label: 'Extratos', icon: Wallet },
    { key: 'fechamento', label: 'Fechamento', icon: Package },
    { key: 'config', label: 'Configurações', icon: Building2 },
  ]

  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* Header */}
      <header className="relative mb-6 overflow-hidden rounded-2xl border border-aletis-verde/20 bg-gradient-to-br from-aletis-verde via-aletis-verde to-aletis-grafite-escuro shadow-lg">
        <div className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #C9A84C 0%, transparent 35%), radial-gradient(circle at 80% 60%, #ffffff 0%, transparent 30%)' }} />
        <div className="relative flex flex-col gap-4 p-6 lg:flex-row lg:items-end lg:justify-between lg:p-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-aletis-dourado/40 bg-aletis-dourado/10 px-3 py-1">
              <DollarSign className="h-3 w-3 text-aletis-dourado" />
              <span className="text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-aletis-dourado">
                Gestão Financeira Interna
              </span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white lg:text-[2.5rem]">
              Financeiro
            </h1>
            <p className="mt-2 max-w-2xl font-body text-sm text-white/75 lg:text-base">
              Receitas, despesas, impostos e extratos do negócio — com fechamento mensal
              pronto pra enviar ao contador em 1 clique.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur">
              <Calendar className="h-4 w-4 text-aletis-dourado" />
              <input
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className="bg-transparent text-sm text-white focus:outline-none"
              />
            </label>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-aletis-borda/60 bg-white p-1 shadow-sm">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-display font-medium transition ${
                active
                  ? 'bg-aletis-verde text-white shadow-sm'
                  : 'text-aletis-grafite-medio hover:bg-aletis-bege/50 hover:text-aletis-grafite-escuro'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Conteúdo */}
      <div>
        {tab === 'dashboard' && <DashboardSection showToast={showToast} />}
        {tab === 'receitas' && <ReceitasSection competencia={competencia} showToast={showToast} />}
        {tab === 'despesas' && <DespesasSection competencia={competencia} showToast={showToast} />}
        {tab === 'impostos' && <ImpostosSection competencia={competencia} showToast={showToast} />}
        {tab === 'extratos' && <ExtratosSection competencia={competencia} showToast={showToast} />}
        {tab === 'fechamento' && <FechamentoSection competencia={competencia} showToast={showToast} />}
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

function DashboardSection({ showToast }: { showToast: (t: 'sucesso' | 'erro', m: string) => void }) {
  const { data, loading, refetch } = useApi<DashboardData | null>('/financeiro/dashboard', null)

  if (loading) return <LoadingCard />
  if (!data) return <EmptyCard icon={BarChart3} titulo="Sem dados no dashboard" detalhe="Cadastre receitas e despesas para ver os KPIs." />

  const { dreAtual, fluxoCaixa12m, topCategoriasDespesa, topClientes, contasReceber, contasPagar, dasProximo, rbt12, alertas } = data

  const maxFluxo = Math.max(...fluxoCaixa12m.map((f) => Math.max(f.receita, f.despesa)), 1)

  return (
    <div className="space-y-5">
      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((a, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-xl border p-3 ${
                a.severidade === 'critico' ? 'border-rose-200 bg-rose-50'
                : a.severidade === 'atencao' ? 'border-amber-200 bg-amber-50'
                : 'border-blue-200 bg-blue-50'
              }`}
            >
              {a.severidade === 'critico' ? <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                : a.severidade === 'atencao' ? <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                : <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />}
              <div className="flex-1">
                <div className="text-sm font-display font-semibold text-aletis-grafite-escuro">{a.titulo}</div>
                <div className="text-xs text-aletis-grafite-medio mt-0.5">{a.detalhe}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Receita do mês"
          value={fmtBRL(dreAtual.receitaBruta)}
          subtitle={`${dreAtual.contagens.receitas} receita(s)`}
          icon={TrendingUp}
          color="emerald"
        />
        <KpiCard
          label="Despesas do mês"
          value={fmtBRL(dreAtual.totalDespesas + dreAtual.impostosApurados)}
          subtitle={`${dreAtual.contagens.despesas} desp. + ${dreAtual.contagens.impostos} imp.`}
          icon={TrendingDown}
          color="rose"
        />
        <KpiCard
          label="Resultado líquido"
          value={fmtBRL(dreAtual.resultadoLiquido)}
          subtitle={`Margem: ${fmtPct(dreAtual.margemLiquida)}`}
          icon={dreAtual.resultadoLiquido >= 0 ? ArrowUpRight : ArrowDownRight}
          color={dreAtual.resultadoLiquido >= 0 ? 'emerald' : 'rose'}
        />
        <KpiCard
          label="RBT12 (Simples)"
          value={fmtBRL(rbt12)}
          subtitle={`${fmtPct((rbt12 / 4_800_000) * 100)} do limite`}
          icon={Landmark}
          color="blue"
        />
      </div>

      {/* DAS previsto + Contas a Receber/Pagar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* DAS */}
        <div className="rounded-xl border border-aletis-verde/20 bg-gradient-to-br from-white to-aletis-bege p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-aletis-verde" />
              <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro">DAS previsto do mês</h3>
            </div>
          </div>
          {dasProximo ? (
            <div>
              <div className="text-2xl font-display font-bold text-aletis-verde">{fmtBRL(dasProximo.valorDAS)}</div>
              <div className="text-xs text-aletis-grafite-medio mt-1">
                Faixa {dasProximo.faixa} — {fmtPct(dasProximo.aliquotaEfetiva)} efetiva
              </div>
              <div className="text-xs text-aletis-grafite-medio mt-1">
                Vencimento: <strong>{fmtDate(dasProximo.vencimento)}</strong>
              </div>
            </div>
          ) : (
            <div className="text-xs text-aletis-grafite-claro italic">Sem receita no mês atual — DAS dispensado.</div>
          )}
        </div>

        {/* A receber */}
        <div className="rounded-xl border border-aletis-borda/60 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownRight className="h-4 w-4 text-emerald-600" />
            <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro">A receber</h3>
          </div>
          <div className="text-2xl font-display font-bold text-emerald-700">{fmtBRL(contasReceber.total)}</div>
          {contasReceber.atrasadas > 0 && (
            <div className="text-xs text-rose-600 mt-1">
              <AlertCircle className="inline h-3 w-3 mr-1" />
              {fmtBRL(contasReceber.atrasadas)} em atraso
            </div>
          )}
          <ul className="mt-3 space-y-1.5 text-xs">
            {contasReceber.proximosVencimentos.slice(0, 4).map((v) => (
              <li key={v.id} className="flex justify-between gap-2">
                <span className="truncate text-aletis-grafite-medio">{v.cliente}</span>
                <span className={`font-medium ${v.diasAtraso > 0 ? 'text-rose-600' : 'text-aletis-grafite-escuro'}`}>
                  {fmtBRL(v.valor)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* A pagar */}
        <div className="rounded-xl border border-aletis-borda/60 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpRight className="h-4 w-4 text-rose-600" />
            <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro">A pagar</h3>
          </div>
          <div className="text-2xl font-display font-bold text-rose-700">{fmtBRL(contasPagar.total)}</div>
          {contasPagar.atrasadas > 0 && (
            <div className="text-xs text-rose-600 mt-1">
              <AlertCircle className="inline h-3 w-3 mr-1" />
              {fmtBRL(contasPagar.atrasadas)} em atraso
            </div>
          )}
          <ul className="mt-3 space-y-1.5 text-xs">
            {contasPagar.proximosVencimentos.slice(0, 4).map((v) => (
              <li key={v.id} className="flex justify-between gap-2">
                <span className="truncate text-aletis-grafite-medio">{v.descricao}</span>
                <span className={`font-medium ${v.diasAtraso > 0 ? 'text-rose-600' : 'text-aletis-grafite-escuro'}`}>
                  {fmtBRL(v.valor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Aging de recebíveis */}
      <AgingRecebiveis aging={contasReceber.aging} total={contasReceber.total} />

      {/* Fluxo de caixa 12m */}
      <div className="rounded-xl border border-aletis-borda/60 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-aletis-verde" />
            Fluxo de caixa (últimos 12 meses)
          </h3>
          <button onClick={refetch} className="text-xs text-aletis-verde hover:underline flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        </div>
        <div className="flex items-end gap-1 h-40 overflow-x-auto pb-1">
          {fluxoCaixa12m.map((f) => (
            <div key={f.mes} className="flex flex-col items-center gap-1 min-w-[48px]" title={`${fmtCompetencia(f.mes)}: R+ ${fmtBRL(f.receita)} / D- ${fmtBRL(f.despesa)} / = ${fmtBRL(f.resultado)}`}>
              <div className="flex items-end gap-0.5 h-32">
                <div className="w-3 bg-emerald-400 rounded-t" style={{ height: `${(f.receita / maxFluxo) * 100}%` }} />
                <div className="w-3 bg-rose-400 rounded-t" style={{ height: `${(f.despesa / maxFluxo) * 100}%` }} />
              </div>
              <div className="text-[10px] text-aletis-grafite-claro">{fmtCompetencia(f.mes).slice(0, 3)}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-2 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-400" />Receita</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-rose-400" />Despesa</span>
        </div>
      </div>

      {/* Top categorias + top clientes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-aletis-borda/60 bg-white p-4 shadow-sm">
          <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro flex items-center gap-2 mb-3">
            <PieChart className="h-4 w-4 text-aletis-verde" />
            Top categorias de despesa (3 meses)
          </h3>
          {topCategoriasDespesa.length > 0 ? (
            <div className="space-y-2">
              {topCategoriasDespesa.map((c, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-aletis-grafite-medio">{c.nome}</span>
                    <span className="font-medium text-aletis-grafite-escuro">{fmtBRL(c.valor)} · {fmtPct(c.pct)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-aletis-bege">
                    <div className="h-full rounded-full bg-aletis-verde" style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-aletis-grafite-claro italic">Sem despesas nos últimos 3 meses.</p>
          )}
        </div>

        <div className="rounded-xl border border-aletis-borda/60 bg-white p-4 shadow-sm">
          <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-aletis-verde" />
            Top clientes do ano
          </h3>
          {topClientes.length > 0 ? (
            <div className="space-y-2">
              {topClientes.map((c, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-aletis-grafite-medio truncate">{c.cliente}</span>
                    <span className="font-medium text-aletis-grafite-escuro">{fmtBRL(c.valor)} · {fmtPct(c.pct)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-aletis-bege">
                    <div className="h-full rounded-full bg-aletis-dourado" style={{ width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-aletis-grafite-claro italic">Sem receitas registradas este ano.</p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ================= Aging de Recebíveis ================= */

type AgingData = DashboardData['contasReceber']['aging']
type AgingBucketKey = 'emDia' | 'atraso_1_30' | 'atraso_31_60' | 'atraso_61_90' | 'atraso_90plus'

function AgingRecebiveis({
  aging,
  total,
}: {
  aging: AgingData
  total: number
}) {
  const buckets: Array<{
    id: AgingBucketKey
    label: string
    color: string
    barColor: string
  }> = [
    { id: 'emDia', label: 'Em dia', color: 'text-emerald-700', barColor: 'bg-emerald-500' },
    { id: 'atraso_1_30', label: '1–30 d', color: 'text-amber-700', barColor: 'bg-amber-400' },
    { id: 'atraso_31_60', label: '31–60 d', color: 'text-orange-700', barColor: 'bg-orange-500' },
    { id: 'atraso_61_90', label: '61–90 d', color: 'text-rose-700', barColor: 'bg-rose-500' },
    { id: 'atraso_90plus', label: '90+ d', color: 'text-red-800', barColor: 'bg-red-700' },
  ]

  const saudeCor =
    aging.indiceSaude >= 85 ? 'text-emerald-700' :
    aging.indiceSaude >= 65 ? 'text-amber-700' :
    aging.indiceSaude >= 45 ? 'text-orange-700' : 'text-rose-700'

  const saudeBgCor =
    aging.indiceSaude >= 85 ? 'bg-emerald-500' :
    aging.indiceSaude >= 65 ? 'bg-amber-400' :
    aging.indiceSaude >= 45 ? 'bg-orange-500' : 'bg-rose-500'

  if (total === 0) {
    return (
      <div className="rounded-xl border border-aletis-borda/60 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <ArrowDownRight className="h-4 w-4 text-emerald-600" />
          <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro">Aging de recebíveis</h3>
        </div>
        <p className="text-xs text-aletis-grafite-claro italic">Nenhum recebível em aberto no momento.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-aletis-borda/60 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ArrowDownRight className="h-4 w-4 text-emerald-600" />
          <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro">
            Aging de recebíveis
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-aletis-grafite-claro">
            carteira em aberto
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className="text-aletis-grafite-claro">DSO</span>{' '}
            <strong className="text-aletis-grafite-escuro">
              {aging.dso.toFixed(0)}{' '}
              <span className="text-aletis-grafite-claro font-normal">dias</span>
            </strong>
          </div>
          <div>
            <span className="text-aletis-grafite-claro">Saúde</span>{' '}
            <strong className={saudeCor}>{aging.indiceSaude.toFixed(0)}/100</strong>
            <span className="inline-block align-middle ml-1.5 w-16 h-1.5 rounded-full bg-aletis-borda/40 overflow-hidden">
              <span
                className={`block h-full ${saudeBgCor} transition-all`}
                style={{ width: `${Math.max(0, Math.min(100, aging.indiceSaude))}%` }}
              />
            </span>
          </div>
        </div>
      </div>

      {/* Barra de distribuição (stacked) */}
      <div className="flex h-3 rounded-full overflow-hidden border border-aletis-borda/40 mb-3">
        {buckets.map((b) => {
          const bucket = aging[b.id]
          const pct = total > 0 ? (bucket.total / total) * 100 : 0
          if (pct === 0) return null
          return (
            <div
              key={b.id}
              className={b.barColor}
              style={{ width: `${pct}%` }}
              title={`${b.label}: ${bucket.count} recebíveis, ${fmtBRL(bucket.total)} (${pct.toFixed(1)}%)`}
            />
          )
        })}
      </div>

      {/* Grid dos buckets */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {buckets.map((b) => {
          const bucket = aging[b.id]
          const pct = total > 0 ? (bucket.total / total) * 100 : 0
          return (
            <div
              key={b.id}
              className="rounded-lg border border-aletis-borda/50 bg-aletis-bege/40 p-2.5"
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-display font-semibold uppercase tracking-wider ${b.color}`}>
                  {b.label}
                </span>
                <span className="text-[10px] text-aletis-grafite-claro">{pct.toFixed(0)}%</span>
              </div>
              <div className={`mt-1 font-display text-sm font-bold ${b.color}`}>
                {fmtBRL(bucket.total)}
              </div>
              <div className="text-[11px] text-aletis-grafite-medio">
                {bucket.count} {bucket.count === 1 ? 'recebível' : 'recebíveis'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ================= Receitas ================= */

function ReceitasSection({ competencia, showToast }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void }) {
  const { data: receitas, loading, refetch } = useApi<Receita[]>(`/financeiro/receitas?competencia=${competencia}`, [])
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
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-display font-medium text-white hover:bg-aletis-verde-escuro">
          <Plus className="h-4 w-4" /> Nova receita
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 rounded-lg border border-aletis-verde/40 bg-white px-3 py-2 text-sm font-display font-medium text-aletis-verde hover:bg-aletis-bege disabled:opacity-50">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar NFS-e (XML) / NF (PDF)
        </button>
        <input ref={fileRef} type="file" accept=".xml,.pdf" multiple className="hidden" onChange={(e) => e.target.files && handleUploadNf(e.target.files)} />
      </div>

      <div className="rounded-xl border border-aletis-borda/60 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-aletis-bege/50 text-xs uppercase tracking-wide text-aletis-grafite-medio">
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
            {loading && <tr><td colSpan={8} className="p-6 text-center text-aletis-grafite-claro">Carregando…</td></tr>}
            {!loading && receitas.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-aletis-grafite-claro italic">Sem receitas em {fmtCompetencia(competencia)}</td></tr>
            )}
            {receitas.map((r) => (
              <tr key={r.id} className="border-t border-aletis-borda/40">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.dataEmissao)}</td>
                <td className="px-3 py-2">{r.descricao}</td>
                <td className="px-3 py-2 text-aletis-grafite-medio">{r.cliente?.nome ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-aletis-grafite-medio">{r.nfse?.numero ?? '—'}</td>
                <td className="px-3 py-2 text-right">{fmtBRL(r.valorBruto)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtBRL(r.valorLiquido)}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {r.anexos.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-aletis-grafite-medio mr-2" title={`${r.anexos.length} anexo(s)`}>
                      <Paperclip className="h-3 w-3" />{r.anexos.length}
                    </span>
                  )}
                  {r.status !== 'recebida' && r.status !== 'cancelada' && (
                    <button onClick={() => marcarRecebida(r)} className="text-xs text-emerald-600 hover:underline mr-2" title="Marcar como recebida">
                      Receber
                    </button>
                  )}
                  <button onClick={() => handleDelete(r.id)} className="text-xs text-rose-600 hover:underline">
                    <Trash2 className="inline h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NovaReceitaModal competencia={competencia} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refetch(); showToast('sucesso', 'Receita cadastrada') }} onError={(m) => showToast('erro', m)} />}
    </div>
  )
}

/* ================= Despesas ================= */

function DespesasSection({ competencia, showToast }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void }) {
  const { data: despesas, loading, refetch } = useApi<Despesa[]>(`/financeiro/despesas?competencia=${competencia}`, [])
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
        <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-display font-medium text-white hover:bg-aletis-verde-escuro">
          <Plus className="h-4 w-4" /> Nova despesa
        </button>
      </div>

      <div className="rounded-xl border border-aletis-borda/60 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-aletis-bege/50 text-xs uppercase tracking-wide text-aletis-grafite-medio">
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
            {loading && <tr><td colSpan={7} className="p-6 text-center text-aletis-grafite-claro">Carregando…</td></tr>}
            {!loading && despesas.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-aletis-grafite-claro italic">Sem despesas em {fmtCompetencia(competencia)}</td></tr>
            )}
            {despesas.map((d) => (
              <tr key={d.id} className="border-t border-aletis-borda/40">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(d.dataVencimento)}</td>
                <td className="px-3 py-2">{d.descricao}</td>
                <td className="px-3 py-2 text-aletis-grafite-medio">{d.fornecedor?.nome ?? '—'}</td>
                <td className="px-3 py-2 text-xs"><span className="rounded-full bg-aletis-bege px-2 py-0.5 text-aletis-grafite-escuro">{catMap[d.categoria] ?? d.categoria}</span></td>
                <td className="px-3 py-2 text-right">{fmtBRL(d.valor)}</td>
                <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {d.anexos.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-aletis-grafite-medio mr-2">
                      <Paperclip className="h-3 w-3" />{d.anexos.length}
                    </span>
                  )}
                  {d.status !== 'paga' && d.status !== 'cancelada' && (
                    <button onClick={() => marcarPaga(d)} className="text-xs text-emerald-600 hover:underline mr-2">Pagar</button>
                  )}
                  <button onClick={() => handleDelete(d.id)} className="text-xs text-rose-600 hover:underline">
                    <Trash2 className="inline h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && <NovaDespesaModal competencia={competencia} categorias={categorias} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); refetch(); showToast('sucesso', 'Despesa cadastrada') }} onError={(m) => showToast('erro', m)} />}
    </div>
  )
}

/* ================= Impostos ================= */

function ImpostosSection({ competencia, showToast }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void }) {
  const { data: impostos, loading, refetch } = useApi<Imposto[]>(`/financeiro/impostos?competencia=${competencia}`, [])
  const [calculating, setCalculating] = useState(false)
  const [calcResult, setCalcResult] = useState<any>(null)

  const calcularDAS = async (criar: boolean) => {
    setCalculating(true)
    try {
      const res = await apiFetch<any>('/financeiro/impostos/calcular-das', {
        method: 'POST',
        body: JSON.stringify({ competencia, criar }),
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
      <div className="rounded-xl border border-aletis-verde/30 bg-gradient-to-br from-white to-aletis-bege p-4">
        <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro mb-2 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-aletis-verde" />
          Calculadora de DAS — Simples Nacional (Anexo III)
        </h3>
        <p className="text-xs text-aletis-grafite-medio mb-3">
          Calcula automaticamente o DAS do mês usando a receita bruta do mês e o RBT12
          (últimos 12 meses), aplicando a fórmula{' '}
          <code className="bg-white px-1.5 py-0.5 rounded">((RBT12 × alíquota) − PD) / RBT12</code>.
        </p>
        <div className="flex gap-2">
          <button onClick={() => calcularDAS(false)} disabled={calculating} className="inline-flex items-center gap-2 rounded-lg border border-aletis-verde/40 bg-white px-3 py-2 text-sm font-display font-medium text-aletis-verde hover:bg-aletis-bege disabled:opacity-50">
            {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Calcular
          </button>
          <button onClick={() => calcularDAS(true)} disabled={calculating} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-display font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50">
            <Plus className="h-4 w-4" />
            Calcular e registrar
          </button>
        </div>
        {calcResult && (
          <div className="mt-3 rounded-lg bg-white p-3 border border-aletis-verde/20">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><span className="text-aletis-grafite-medio">Receita</span><div className="font-semibold">{fmtBRL(calcResult.receitaBrutaMes)}</div></div>
              <div><span className="text-aletis-grafite-medio">RBT12</span><div className="font-semibold">{fmtBRL(calcResult.rbt12)}</div></div>
              <div><span className="text-aletis-grafite-medio">Alíq. efetiva</span><div className="font-semibold">{fmtPct(calcResult.aliquotaEfetiva)}</div></div>
              <div><span className="text-aletis-grafite-medio">DAS</span><div className="font-bold text-aletis-verde">{fmtBRL(calcResult.valorDAS)}</div></div>
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-[11px] font-mono text-aletis-grafite-medio">{calcResult.memoriaCalculo}</pre>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-aletis-borda/60 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-aletis-bege/50 text-xs uppercase tracking-wide text-aletis-grafite-medio">
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
            {loading && <tr><td colSpan={6} className="p-6 text-center text-aletis-grafite-claro">Carregando…</td></tr>}
            {!loading && impostos.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-aletis-grafite-claro italic">Sem impostos em {fmtCompetencia(competencia)}</td></tr>
            )}
            {impostos.map((i) => (
              <tr key={i.id} className="border-t border-aletis-borda/40">
                <td className="px-3 py-2 uppercase text-xs font-semibold text-aletis-verde">{i.tipo.replace('_', ' ')}</td>
                <td className="px-3 py-2">{i.descricao}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(i.dataVencimento)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmtBRL(i.valor)}</td>
                <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {i.status !== 'pago' && (
                    <button onClick={() => marcarPago(i)} className="text-xs text-emerald-600 hover:underline mr-2">Pagar</button>
                  )}
                  <button onClick={() => handleDelete(i.id)} className="text-xs text-rose-600 hover:underline">
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

function ExtratosSection({ competencia, showToast }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void }) {
  const [ano, mes] = competencia.split('-').map(Number)
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const inicio = `${competencia}-01`
  const fim = `${competencia}-${String(ultimoDia).padStart(2, '0')}`
  const { data: lancamentos, loading, refetch } = useApi<Lancamento[]>(
    `/financeiro/lancamentos?dataInicio=${inicio}&dataFim=${fim}`, []
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
        <button onClick={() => fileRef.current?.click()} disabled={importing} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-3 py-2 text-sm font-display font-medium text-white hover:bg-aletis-verde-escuro disabled:opacity-50">
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

      <div className="rounded-xl border border-aletis-borda/60 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-aletis-bege/50 text-xs uppercase tracking-wide text-aletis-grafite-medio">
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
            {loading && <tr><td colSpan={6} className="p-6 text-center text-aletis-grafite-claro">Carregando…</td></tr>}
            {!loading && lancamentos.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-aletis-grafite-claro italic">Sem lançamentos no período</td></tr>
            )}
            {lancamentos.map((l) => (
              <tr key={l.id} className="border-t border-aletis-borda/40">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.data)}</td>
                <td className="px-3 py-2">{l.descricao}</td>
                <td className="px-3 py-2 text-xs text-aletis-grafite-medio">{l.categoria ?? 'não classificado'}</td>
                <td className={`px-3 py-2 text-right font-medium ${l.tipo === 'credito' ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtBRL(l.valor)}</td>
                <td className="px-3 py-2 text-xs uppercase text-aletis-grafite-claro">{l.origem}</td>
                <td className="px-3 py-2 text-right">
                  {l.vinculadoA && (
                    <Link2 className="inline h-3.5 w-3.5 text-aletis-verde mr-1" />
                  )}
                  <button onClick={() => handleDelete(l.id)} className="text-xs text-rose-600 hover:underline">
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

function FechamentoSection({ competencia, showToast }: { competencia: string; showToast: (t: 'sucesso' | 'erro', m: string) => void }) {
  const { data: checklist, loading, refetch } = useApi<Checklist | null>(`/financeiro/fechamento/${competencia}/checklist`, null)
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
      <div className="rounded-xl border border-aletis-verde/30 bg-gradient-to-br from-white to-aletis-bege p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-aletis-verde/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-aletis-verde">
              <Package className="h-3 w-3" />
              Pacote para o contador
            </div>
            <h3 className="font-display text-xl font-bold text-aletis-grafite-escuro">
              Fechamento de {fmtCompetencia(competencia)}
            </h3>
            <p className="text-sm text-aletis-grafite-medio mt-1 max-w-xl">
              Gera um ZIP com todos os anexos organizados (NFS-e, comprovantes, extrato OFX),
              CSVs para importação contábil e um PDF formal com DRE, memória de cálculo do DAS
              e checklist — pronto pra anexar num e-mail ao contador.
            </p>
          </div>
          <button onClick={refetch} className="text-xs text-aletis-grafite-medio hover:text-aletis-verde">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => download('zip')} disabled={generating} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-4 py-2 text-sm font-display font-semibold text-white hover:bg-aletis-verde-escuro disabled:opacity-50">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Baixar ZIP completo
          </button>
          <button onClick={() => download('pdf')} disabled={generating} className="inline-flex items-center gap-2 rounded-lg border border-aletis-verde/40 bg-white px-4 py-2 text-sm font-display font-semibold text-aletis-verde hover:bg-aletis-bege disabled:opacity-50">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Baixar apenas PDF resumo
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-aletis-borda/60 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-aletis-verde" />
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

        {loading && <p className="text-xs text-aletis-grafite-claro italic">Carregando…</p>}
        {checklist && (
          <ul className="space-y-2">
            {checklist.itens.map((item, i) => (
              <li key={i} className={`flex items-start gap-3 rounded-lg border p-3 ${item.ok ? 'border-emerald-100 bg-emerald-50/30' : 'border-amber-100 bg-amber-50/30'}`}>
                <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${item.ok ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                  {item.ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                </div>
                <div>
                  <div className="text-sm font-display font-medium text-aletis-grafite-escuro">{item.titulo}</div>
                  <div className="text-xs text-aletis-grafite-medio mt-0.5">{item.detalhe}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
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
      <div className="rounded-xl border border-aletis-borda/60 bg-white p-5 shadow-sm">
        <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-aletis-verde" /> Dados da empresa
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

      <div className="rounded-xl border border-aletis-borda/60 bg-white p-5 shadow-sm">
        <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro mb-3 flex items-center gap-2">
          <Landmark className="h-4 w-4 text-aletis-verde" /> Regime tributário
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-aletis-grafite-medio mb-1">Regime</label>
            <select value={form.regime} onChange={(e) => setForm({ ...form, regime: e.target.value })} className="w-full rounded-lg border border-aletis-borda px-3 py-2 text-sm">
              <option value="simples_nacional">Simples Nacional</option>
              <option value="lucro_presumido">Lucro Presumido</option>
              <option value="mei">MEI</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-aletis-grafite-medio mb-1">Anexo Simples</label>
            <select value={form.anexoSimples} onChange={(e) => setForm({ ...form, anexoSimples: e.target.value })} className="w-full rounded-lg border border-aletis-borda px-3 py-2 text-sm">
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

      <div className="rounded-xl border border-aletis-borda/60 bg-white p-5 shadow-sm">
        <h3 className="font-display text-sm font-semibold text-aletis-grafite-escuro mb-3 flex items-center gap-2">
          <Mail className="h-4 w-4 text-aletis-verde" /> Contador (destinatário do pacote mensal)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nome" value={form.contador.nome} onChange={(v) => setForm({ ...form, contador: { ...form.contador, nome: v } })} />
          <Field label="Escritório" value={form.contador.escritorio ?? ''} onChange={(v) => setForm({ ...form, contador: { ...form.contador, escritorio: v } })} />
          <Field label="E-mail" value={form.contador.email} onChange={(v) => setForm({ ...form, contador: { ...form.contador, email: v } })} />
          <Field label="Telefone" value={form.contador.telefone ?? ''} onChange={(v) => setForm({ ...form, contador: { ...form.contador, telefone: v } })} />
          <Field label="CRC" value={form.contador.crcRegional ?? ''} onChange={(v) => setForm({ ...form, contador: { ...form.contador, crcRegional: v } })} />
        </div>
      </div>

      <button onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-aletis-verde px-4 py-2 text-sm font-display font-semibold text-white hover:bg-aletis-verde-escuro">
        <CheckCircle2 className="h-4 w-4" /> Salvar configurações
      </button>
    </div>
  )
}

/* ================= Modais ================= */

function NovaReceitaModal({ competencia, onClose, onSaved, onError }: { competencia: string; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
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
      const payload = {
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
      await apiFetch('/financeiro/receitas', { method: 'POST', body: JSON.stringify(payload) })
      onSaved()
    } catch (err: any) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal titulo="Nova receita" onClose={onClose}>
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
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-aletis-borda px-4 py-2 text-sm">Cancelar</button>
        <button onClick={handleSubmit} disabled={saving} className="rounded-lg bg-aletis-verde px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  )
}

function NovaDespesaModal({ competencia, categorias, onClose, onSaved, onError }: { competencia: string; categorias: CategoriaMeta[]; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
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
      const payload = {
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
      await apiFetch('/financeiro/despesas', { method: 'POST', body: JSON.stringify(payload) })
      onSaved()
    } catch (err: any) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal titulo="Nova despesa" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Competência" type="month" value={form.competencia} onChange={(v) => setForm({ ...form, competencia: v })} />
        <div>
          <label className="block text-xs text-aletis-grafite-medio mb-1">Categoria</label>
          <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="w-full rounded-lg border border-aletis-borda px-3 py-2 text-sm">
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
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-aletis-borda px-4 py-2 text-sm">Cancelar</button>
        <button onClick={handleSubmit} disabled={saving} className="rounded-lg bg-aletis-verde px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </Modal>
  )
}

/* ================= UI Building blocks ================= */

function KpiCard({ label, value, subtitle, icon: Icon, color }: { label: string; value: string; subtitle?: string; icon: React.ElementType; color: 'emerald' | 'rose' | 'blue' | 'amber' }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  return (
    <div className="rounded-xl border border-aletis-borda/60 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-display font-medium text-aletis-grafite-medio uppercase tracking-wide">{label}</span>
        <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="text-2xl font-display font-bold text-aletis-grafite-escuro">{value}</div>
      {subtitle && <div className="text-xs text-aletis-grafite-medio mt-1">{subtitle}</div>}
    </div>
  )
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: 'emerald' | 'rose' | 'blue' | 'amber' }) {
  return <KpiCard label={label} value={value} icon={Icon} color={color} />
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    recebida: 'bg-emerald-100 text-emerald-700',
    paga: 'bg-emerald-100 text-emerald-700',
    pago: 'bg-emerald-100 text-emerald-700',
    emitida: 'bg-amber-100 text-amber-700',
    pendente: 'bg-amber-100 text-amber-700',
    a_pagar: 'bg-amber-100 text-amber-700',
    atrasada: 'bg-rose-100 text-rose-700',
    atrasado: 'bg-rose-100 text-rose-700',
    cancelada: 'bg-gray-100 text-gray-500 line-through',
  }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-xs text-aletis-grafite-medio mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-aletis-borda px-3 py-2 text-sm focus:border-aletis-verde focus:outline-none"
      />
    </div>
  )
}

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-aletis-borda/50 px-5 py-3 sticky top-0 bg-white z-10">
          <h3 className="font-display text-lg font-semibold text-aletis-grafite-escuro">{titulo}</h3>
          <button onClick={onClose} className="text-aletis-grafite-medio hover:text-aletis-grafite-escuro">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function LoadingCard() {
  return (
    <div className="rounded-xl border border-aletis-borda/60 bg-white p-10 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-aletis-verde mx-auto mb-3" />
      <p className="text-sm text-aletis-grafite-medio">Carregando…</p>
    </div>
  )
}

function EmptyCard({ icon: Icon, titulo, detalhe }: { icon: React.ElementType; titulo: string; detalhe: string }) {
  return (
    <div className="rounded-xl border border-aletis-borda/60 bg-white p-10 text-center">
      <Icon className="h-8 w-8 text-aletis-grafite-claro mx-auto mb-3" />
      <h4 className="font-display text-sm font-semibold text-aletis-grafite-escuro">{titulo}</h4>
      <p className="text-xs text-aletis-grafite-medio mt-1">{detalhe}</p>
    </div>
  )
}
