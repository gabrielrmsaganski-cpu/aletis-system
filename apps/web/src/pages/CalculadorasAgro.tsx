import { SectionNav } from '../components/ui/SectionNav'
import PageHeader from '../components/ui/PageHeader'
/**
 * Calculadoras Agro — UI interativa para 3 calculadoras nativas:
 *   - Diagnóstico financeiro (Dupont + Fleuriet)
 *   - Formação de Preço de Venda 3.0
 *   - FARMS — Viabilidade Agrícola
 *
 * Reimplementam planilhas em /ALETIS2/novos/sistema agro/.
 * Toda lógica está no `@aletis/financial-calc/src/agro`.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Gauge,
  Leaf,
  RefreshCw,
  Scale,
  Target,
  TrendingUp,
  Trophy,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import {
  calcularFarms,
  calcularFechamentoGeralEmbarque,
  FECHAMENTO_ARI_PRADO_2024_INPUT,
  type FechamentoEmbarqueInput,
  type FechamentoGeralEmbarqueInput,
  type FarmsInput,
  type FarmsResult,
} from '@aletis/financial-calc'

type Tab = 'dupont' | 'preco' | 'farms' | 'fechamento'

function parseTab(raw: string | null): Tab {
  if (raw === 'preco' || raw === 'farms' || raw === 'fechamento') return raw
  return 'dupont'
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
const formatPct = (v: number) => `${(v * 100).toFixed(2)}%`
const formatNumber = (v: number, digits = 2) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export default function CalculadorasAgro() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')))

  useEffect(() => {
    const next = parseTab(searchParams.get('tab'))
    setTab((prev) => (prev === next ? prev : next))
  }, [searchParams])

  function selectTab(next: Tab) {
    setTab(next)
    if (next === 'dupont') setSearchParams({}, { replace: true })
    else setSearchParams({ tab: next }, { replace: true })
  }

  const TABS: { id: Tab; label: string; icon: typeof Calculator; subtitle: string }[] = [
    { id: 'dupont', label: 'Dupont / Fleuriet', icon: BarChart3, subtitle: 'Diagnóstico financeiro completo' },
    { id: 'preco', label: 'Preço de Venda 3.0', icon: Calculator, subtitle: 'Formação de preço com 4 modelos' },
    { id: 'farms', label: 'FARMS Viabilidade', icon: TrendingUp, subtitle: 'Análise por cultura + sensibilidade' },
    { id: 'fechamento', label: 'Fechamento Embarque', icon: ClipboardList, subtitle: 'Baias, arrobas e lucro por cabeça' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title={<>Calculadoras Agro</>} eyebrow={<> <Link
            to="/ferramentas"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-aletis-verde-medio/70 hover:text-aletis-verde"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Ferramentas
          </Link> </>} description={<> <p className="text-sm text-muted-foreground">
            Escolha a análise, informe os dados e consulte o resultado.
          </p> </>} />

      <SectionNav label="Calculadoras agro" items={TABS} active={tab} onChange={selectTab} />

      {tab === 'dupont' && <DupontCard />}
      {tab === 'preco' && <PrecoCard />}
      {tab === 'farms' && <FarmsCard />}
      {tab === 'fechamento' && <FechamentoEmbarqueCard />}
    </div>
  )
}

/* ──────────────────────────────────────────────────────── */
/* Reusable bits                                            */
/* ──────────────────────────────────────────────────────── */
function Field({
  label,
  value,
  onChange,
  step = 1,
  suffix,
  readOnly = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  suffix?: string
  readOnly?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          readOnly={readOnly}
          onChange={(e) => onChange(Number(e.target.value))}
          className={[
            'w-full rounded-lg border border-aletis-cinza px-3 py-2 font-mono text-sm text-foreground focus:border-aletis-gold focus:outline-none',
            readOnly ? 'bg-aletis-cream/70 text-muted-foreground' : 'bg-card',
          ].join(' ')}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-aletis-verde-medio/60">
            {suffix}
          </span>
        )}
      </div>
    </label>
  )
}

function ComputedField({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex min-h-[38px] items-center justify-between gap-2 rounded-lg border border-aletis-cinza bg-aletis-cream/70 px-3 py-2">
        <span className="break-words font-mono text-sm font-semibold text-foreground">{value}</span>
        {suffix && <span className="shrink-0 text-xs text-aletis-verde-medio/60">{suffix}</span>}
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  hint,
  tone = 'default',
  icon: Icon,
  featured = false,
}: {
  title: string
  value: string
  hint?: string
  tone?: 'default' | 'good' | 'bad'
  icon?: LucideIcon
  featured?: boolean
}) {
  const toneClass =
    tone === 'good' ? 'text-positivo' : tone === 'bad' ? 'text-alerta' : 'text-foreground'
  return (
    <div
      className={[
        'min-w-0 rounded-lg p-4 shadow-brand-sm ring-1',
        featured ? 'bg-aletis-verde text-aletis-cream ring-aletis-verde' : 'bg-card ring-aletis-cinza',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={['text-[11px] uppercase tracking-wider', featured ? 'text-aletis-cream/70' : 'text-aletis-verde-medio/70'].join(' ')}>
          {title}
        </p>
        {Icon && (
          <span className={['rounded-xl p-1.5', featured ? 'bg-white/10 text-aletis-gold' : 'bg-aletis-cream text-foreground'].join(' ')}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={['mt-1 break-words font-display text-xl font-bold leading-tight', featured ? 'text-white' : toneClass].join(' ')}>
        {value}
      </p>
      {hint && <p className={['mt-0.5 text-[11px]', featured ? 'text-aletis-cream/70' : 'text-aletis-verde-medio/80'].join(' ')}>{hint}</p>}
    </div>
  )
}

function PanelHeading({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow?: string
  title: string
  description?: string
  icon?: LucideIcon
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {Icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-aletis-cinza bg-aletis-cream text-foreground">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aletis-verde-medio/65">{eyebrow}</p>}
        <h2 className="font-display text-base font-bold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 border-t border-aletis-cinza pt-4 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aletis-verde-medio/65">{title}</p>
      {children}
    </div>
  )
}

function ProgressRow({
  label,
  value,
  detail,
  tone = 'default',
  width,
}: {
  label: string
  value: string
  detail?: string
  tone?: 'default' | 'good' | 'bad' | 'gold'
  width: number
}) {
  const barClass =
    tone === 'good' ? 'bg-positivo' : tone === 'bad' ? 'bg-alerta' : tone === 'gold' ? 'bg-aletis-gold' : 'bg-aletis-verde'
  const valueClass =
    tone === 'good' ? 'text-positivo' : tone === 'bad' ? 'text-alerta' : tone === 'gold' ? 'text-aletis-gold-escuro' : 'text-foreground'
  return (
    <div className="rounded-xl border border-aletis-cinza bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-3 text-sm">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{label}</p>
          {detail && <p className="mt-0.5 text-[11px] text-aletis-verde-medio/70">{detail}</p>}
        </div>
        <p className={`shrink-0 font-mono text-sm font-bold ${valueClass}`}>{value}</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-aletis-cream">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(2, Math.min(100, width))}%` }} />
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────── */
/* Dupont / Fleuriet                                        */
/* ──────────────────────────────────────────────────────── */
function DupontCard() {
  const [dre, setDre] = useState({
    receitaLiquida: 10_000_000,
    cogs: 6_000_000,
    despesasOperacionais: 2_000_000,
    receitasFinanceiras: 50_000,
    despesasFinanceiras: 600_000,
    impostoDeRenda: 400_000,
  })
  const [bp, setBp] = useState({
    caixaEDisponibilidades: 800_000,
    ativoFinanceiroCirculante: 200_000,
    contasAReceber: 1_500_000,
    estoques: 1_000_000,
    outroAtivoCirculante: 100_000,
    ativoNaoCirculante: 6_400_000,
    fornecedores: 1_200_000,
    obrigacoesTrabalhistas: 200_000,
    obrigacoesTributarias: 100_000,
    outroPassivoCirculanteOperacional: 0,
    emprestimosCurtoPrazo: 700_000,
    emprestimosLongoPrazo: 1_300_000,
    outroPassivoNaoCirculante: 500_000,
    patrimonioLiquido: 6_000_000,
  })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function calcular() {
    setLoading(true)
    setErr(null)
    try {
      const data = await apiFetch<any>('/calculadoras-agro/dupont-fleuriet', {
        method: 'POST',
        body: JSON.stringify({ dre, bp }),
      })
      setResult(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'erro')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <section className="space-y-4 rounded-lg bg-card p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
        <h2 className="font-display text-base font-bold text-foreground">DRE</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Receita líquida" value={dre.receitaLiquida} onChange={(v) => setDre({ ...dre, receitaLiquida: v })} suffix="R$" />
          <Field label="CMV" value={dre.cogs} onChange={(v) => setDre({ ...dre, cogs: v })} suffix="R$" />
          <Field label="Despesas op." value={dre.despesasOperacionais} onChange={(v) => setDre({ ...dre, despesasOperacionais: v })} suffix="R$" />
          <Field label="Despesas fin." value={dre.despesasFinanceiras} onChange={(v) => setDre({ ...dre, despesasFinanceiras: v })} suffix="R$" />
          <Field label="Receitas fin." value={dre.receitasFinanceiras} onChange={(v) => setDre({ ...dre, receitasFinanceiras: v })} suffix="R$" />
          <Field label="IR + CSLL" value={dre.impostoDeRenda} onChange={(v) => setDre({ ...dre, impostoDeRenda: v })} suffix="R$" />
        </div>

        <h2 className="mt-4 font-display text-base font-bold text-foreground">Balanço</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Caixa" value={bp.caixaEDisponibilidades} onChange={(v) => setBp({ ...bp, caixaEDisponibilidades: v })} suffix="R$" />
          <Field label="Aplicações fin." value={bp.ativoFinanceiroCirculante} onChange={(v) => setBp({ ...bp, ativoFinanceiroCirculante: v })} suffix="R$" />
          <Field label="A receber" value={bp.contasAReceber} onChange={(v) => setBp({ ...bp, contasAReceber: v })} suffix="R$" />
          <Field label="Estoques" value={bp.estoques} onChange={(v) => setBp({ ...bp, estoques: v })} suffix="R$" />
          <Field label="Ativo não circ." value={bp.ativoNaoCirculante} onChange={(v) => setBp({ ...bp, ativoNaoCirculante: v })} suffix="R$" />
          <Field label="Fornecedores" value={bp.fornecedores} onChange={(v) => setBp({ ...bp, fornecedores: v })} suffix="R$" />
          <Field label="Empréstimos CP" value={bp.emprestimosCurtoPrazo} onChange={(v) => setBp({ ...bp, emprestimosCurtoPrazo: v })} suffix="R$" />
          <Field label="Empréstimos LP" value={bp.emprestimosLongoPrazo} onChange={(v) => setBp({ ...bp, emprestimosLongoPrazo: v })} suffix="R$" />
          <Field label="PL" value={bp.patrimonioLiquido} onChange={(v) => setBp({ ...bp, patrimonioLiquido: v })} suffix="R$" />
        </div>

        <button
          type="button"
          onClick={calcular}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-aletis-verde py-2.5 font-display text-sm font-bold text-aletis-cream transition hover:bg-aletis-verde-escuro disabled:opacity-60"
        >
          {loading ? 'Calculando…' : 'Diagnosticar'}
        </button>
        {err && <p className="text-xs text-alerta">{err}</p>}
      </section>

      <section className="space-y-4">
        {!result && (
          <div className="rounded-lg bg-card p-6 text-sm text-muted-foreground shadow-brand-sm ring-1 ring-aletis-cinza">
            Edite o DRE e o Balanço, depois clique em "Diagnosticar". O cálculo combina a
            decomposição Dupont (3 e 5 fatores), a tipologia dinâmica Fleuriet e os
            principais índices de liquidez e endividamento.
          </div>
        )}
        {result && (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard title="ROE Dupont" value={formatPct(result.dupont.roe)} hint="Margem × Giro × Alavancagem" tone={result.dupont.roe >= 0.15 ? 'good' : result.dupont.roe < 0 ? 'bad' : 'default'} />
              <StatCard title="ROA" value={formatPct(result.dupont.roa)} hint="Lucro líquido / Ativo" />
              <StatCard title="EBIT" value={formatBRL(result.dupont.ebit)} hint={`Margem EBIT ${formatPct(result.dupont.margemEbit)}`} />
            </div>
            <div className="rounded-lg bg-card p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
              <h3 className="font-display text-sm font-bold text-foreground">Decomposição Dupont</h3>
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                <div>Margem líquida: <strong>{formatPct(result.dupont.margemLiquida)}</strong></div>
                <div>Giro do ativo: <strong>{result.dupont.giroDoAtivo.toFixed(3)}×</strong></div>
                <div>Alavancagem: <strong>{result.dupont.alavancagem.toFixed(3)}×</strong></div>
              </div>
            </div>
            <div className="rounded-lg bg-aletis-verde p-5 text-aletis-cream shadow-brand">
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-aletis-gold">Fleuriet — Tipologia {result.fleuriet.tipo}</h3>
              <p className="mt-2 text-sm leading-relaxed">{result.fleuriet.diagnostico}</p>
              <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                <div>NCG: <strong>{formatBRL(result.fleuriet.necessidadeCapitalGiro)}</strong></div>
                <div>CDG: <strong>{formatBRL(result.fleuriet.capitalGiro)}</strong></div>
                <div>Tesouraria: <strong>{formatBRL(result.fleuriet.tesouraria)}</strong></div>
              </div>
              {result.fleuriet.efeitoTesoura && (
                <p className="mt-3 rounded-md bg-alerta/30 px-3 py-1.5 text-xs">
                  ⚠ Efeito tesoura: NCG cresce mais rápido que o CDG.
                </p>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-card p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
                <h3 className="font-display text-sm font-bold text-foreground">Liquidez</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>Corrente: <strong>{result.liquidez.corrente.toFixed(2)}</strong></li>
                  <li>Seca: <strong>{result.liquidez.seca.toFixed(2)}</strong></li>
                  <li>Geral: <strong>{result.liquidez.geral.toFixed(2)}</strong></li>
                  <li>Imediata: <strong>{result.liquidez.imediata.toFixed(2)}</strong></li>
                </ul>
              </div>
              <div className="rounded-lg bg-card p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
                <h3 className="font-display text-sm font-bold text-foreground">Endividamento</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>Geral: <strong>{formatPct(result.endividamento.geral)}</strong></li>
                  <li>Composição CP: <strong>{formatPct(result.endividamento.composicao)}</strong></li>
                  <li>Oneroso/PL: <strong>{result.endividamento.onerosoSobrePL.toFixed(2)}×</strong></li>
                  <li>Cobertura juros: <strong>{result.endividamento.coberturaJuros.toFixed(2)}×</strong></li>
                </ul>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/* ──────────────────────────────────────────────────────── */
/* Preço de Venda 3.0                                       */
/* ──────────────────────────────────────────────────────── */
function PrecoCard() {
  const [input, setInput] = useState({
    custoUnitario: 100,
    qtd: 1,
    impostosSobreVenda: 0.18,
    comissoes: 0.05,
    fretesEDespesasVendaVar: 0.02,
    despesasFixasUnit: 10,
    margemAlvo: 0.15,
    modelo: 'markup-divisor' as const,
  })
  const [result, setResult] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  async function calcular() {
    setErr(null)
    try {
      const data = await apiFetch<any>('/calculadoras-agro/preco-venda', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      setResult(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'erro')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <section className="space-y-4 rounded-lg bg-card p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
        <h2 className="font-display text-base font-bold text-foreground">Insumos</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Custo unit." value={input.custoUnitario} onChange={(v) => setInput({ ...input, custoUnitario: v })} suffix="R$" />
          <Field label="Qtd" value={input.qtd} onChange={(v) => setInput({ ...input, qtd: v })} />
          <Field label="Impostos venda" value={input.impostosSobreVenda} step={0.01} onChange={(v) => setInput({ ...input, impostosSobreVenda: v })} suffix="%dec" />
          <Field label="Comissões" value={input.comissoes} step={0.01} onChange={(v) => setInput({ ...input, comissoes: v })} suffix="%dec" />
          <Field label="Frete/var." value={input.fretesEDespesasVendaVar} step={0.01} onChange={(v) => setInput({ ...input, fretesEDespesasVendaVar: v })} suffix="%dec" />
          <Field label="Desp. fixas" value={input.despesasFixasUnit} onChange={(v) => setInput({ ...input, despesasFixasUnit: v })} suffix="R$" />
          <Field label="Margem alvo" value={input.margemAlvo} step={0.01} onChange={(v) => setInput({ ...input, margemAlvo: v })} suffix="%dec" />
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Modelo</span>
          <select
            value={input.modelo}
            onChange={(e) => setInput({ ...input, modelo: e.target.value as typeof input.modelo })}
            className="rounded-lg border border-aletis-cinza bg-card px-3 py-2 text-sm"
          >
            <option value="markup-divisor">Mark-up divisor (clássico)</option>
            <option value="markup-multiplicador">Mark-up multiplicador</option>
            <option value="margem-contribuicao">Margem de contribuição alvo</option>
            <option value="margem-liquida">Margem líquida alvo</option>
          </select>
        </label>
        <button
          type="button"
          onClick={calcular}
          className="w-full rounded-xl bg-aletis-verde py-2.5 font-display text-sm font-bold text-aletis-cream transition hover:bg-aletis-verde-escuro"
        >
          Calcular preço
        </button>
        {err && <p className="text-xs text-alerta">{err}</p>}
      </section>

      <section className="space-y-3">
        {!result && (
          <div className="rounded-lg bg-card p-6 text-sm text-muted-foreground shadow-brand-sm ring-1 ring-aletis-cinza">
            Modelos disponíveis: mark-up divisor (cost-plus tradicional), mark-up multiplicador,
            margem de contribuição e margem líquida alvo. Insira percentuais em decimal (0,18 = 18%).
          </div>
        )}
        {result && (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard title="Preço de venda" value={formatBRL(result.precoVenda)} tone="good" />
              <StatCard title="Mark-up" value={`${result.markupPct.toFixed(2)}%`} hint="sobre o custo" />
              <StatCard title="Margem líquida" value={formatBRL(result.margemLiquidaUnit)} hint="por unidade" />
            </div>
            <div className="rounded-lg bg-card p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
              <h3 className="font-display text-sm font-bold text-foreground">Decomposição</h3>
              <ul className="mt-2 grid gap-1 text-sm md:grid-cols-2">
                <li>Custo direto: <strong>{formatBRL(result.detalhamento.custoDireto)}</strong></li>
                <li>Impostos: <strong>{formatBRL(result.detalhamento.impostosSobreVenda)}</strong></li>
                <li>Comissões: <strong>{formatBRL(result.detalhamento.comissoes)}</strong></li>
                <li>Frete: <strong>{formatBRL(result.detalhamento.frete)}</strong></li>
                <li>Outros impostos: <strong>{formatBRL(result.detalhamento.outrosImpostos)}</strong></li>
                <li>Desp. fixas: <strong>{formatBRL(result.detalhamento.despesasFixas)}</strong></li>
                <li>Lucro alvo: <strong>{formatBRL(result.detalhamento.lucroAlvo)}</strong></li>
                <li>Margem contrib.: <strong>{formatBRL(result.margemContribuicaoUnit)}</strong></li>
              </ul>
            </div>
            {result.pontoEquilibrioUnitQtd > 0 && (
              <div className="rounded-lg bg-aletis-cream p-5 ring-1 ring-aletis-cinza">
                <h3 className="font-display text-sm font-bold text-foreground">Ponto de equilíbrio</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Unidades para zerar lucro: <strong>{result.pontoEquilibrioUnitQtd.toFixed(2)}</strong> · receita
                  equivalente: <strong>{formatBRL(result.pontoEquilibrioUnitMonet)}</strong>
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/* ──────────────────────────────────────────────────────── */
/* FARMS Viabilidade Agrícola                               */
/* ──────────────────────────────────────────────────────── */
function FarmsCard() {
  const [input, setInput] = useState<FarmsInput>({
    cultura: 'soja' as 'soja' | 'milho' | 'arroz' | 'trigo' | 'cafe' | 'algodao' | 'outra',
    areaHa: 100,
    rendimentoScHa: 60,
    precoRSporSc: 120,
    custosPorHa: { sementes: 600, defensivos: 1200, fertilizantes: 1400, mecanizacao: 800, maoDeObra: 300, arrendamento: 0, irrigacao: 0, outros: 0 },
    custosFixosTotais: 0,
    taxaJurosSafraAA: 0.10,
    duracaoSafraDias: 240,
    capitalProprioPct: 0.4,
    custoCapitalProprioAA: 0.10,
  })
  const result = useMemo<FarmsResult>(() => calcularFarms(input), [input])

  function setCusto<K extends keyof FarmsInput['custosPorHa']>(k: K, v: number) {
    setInput({ ...input, custosPorHa: { ...input.custosPorHa, [k]: v } })
  }

  const culturas: Array<{ id: FarmsInput['cultura']; label: string }> = [
    { id: 'soja', label: 'Soja' },
    { id: 'milho', label: 'Milho' },
    { id: 'arroz', label: 'Arroz' },
    { id: 'trigo', label: 'Trigo' },
    { id: 'cafe', label: 'Café' },
    { id: 'algodao', label: 'Algodão' },
    { id: 'outra', label: 'Outra' },
  ]

  const veredicto = {
    viavel: {
      label: 'VIÁVEL',
      tone: 'good' as const,
      description: 'Margem saudável para a operação no cenário informado.',
    },
    marginal: {
      label: 'MARGINAL',
      tone: 'default' as const,
      description: 'Resultado positivo, mas sensível a preço, produtividade ou custo.',
    },
    inviavel: {
      label: 'INVIÁVEL',
      tone: 'bad' as const,
      description: 'A margem não cobre o custo total na configuração atual.',
    },
  }[result.veredicto]

  const custosRows = [
    { label: 'Sementes', value: input.custosPorHa.sementes * input.areaHa, detail: `${formatBRL(input.custosPorHa.sementes)}/ha` },
    { label: 'Defensivos', value: input.custosPorHa.defensivos * input.areaHa, detail: `${formatBRL(input.custosPorHa.defensivos)}/ha` },
    { label: 'Fertilizantes', value: input.custosPorHa.fertilizantes * input.areaHa, detail: `${formatBRL(input.custosPorHa.fertilizantes)}/ha` },
    { label: 'Mecanização', value: input.custosPorHa.mecanizacao * input.areaHa, detail: `${formatBRL(input.custosPorHa.mecanizacao)}/ha` },
    { label: 'Mão de obra', value: input.custosPorHa.maoDeObra * input.areaHa, detail: `${formatBRL(input.custosPorHa.maoDeObra)}/ha` },
    { label: 'Arrendamento', value: (input.custosPorHa.arrendamento ?? 0) * input.areaHa, detail: `${formatBRL(input.custosPorHa.arrendamento ?? 0)}/ha` },
    { label: 'Irrigação', value: (input.custosPorHa.irrigacao ?? 0) * input.areaHa, detail: `${formatBRL(input.custosPorHa.irrigacao ?? 0)}/ha` },
    { label: 'Outros', value: (input.custosPorHa.outros ?? 0) * input.areaHa, detail: `${formatBRL(input.custosPorHa.outros ?? 0)}/ha` },
    { label: 'Custos fixos', value: input.custosFixosTotais ?? 0, detail: 'Total da safra', tone: 'gold' as const },
    { label: 'Custo financeiro', value: result.custoFinanceiro, detail: 'Capital financiado', tone: 'gold' as const },
    { label: 'Custo oportunidade', value: result.custoOportunidade, detail: 'Capital próprio', tone: 'gold' as const },
  ].filter((item) => item.value > 0)
  const maxCusto = Math.max(...custosRows.map((item) => item.value), 1)

  const sensibilidadeRows = [
    { label: 'Preço -10%', value: result.sensibilidade.precoMenos10 },
    { label: 'Preço +10%', value: result.sensibilidade.precoMais10 },
    { label: 'Rendimento -15%', value: result.sensibilidade.rendimentoMenos15 },
    { label: 'Rendimento +15%', value: result.sensibilidade.rendimentoMais15 },
  ]
  const maxSensibilidade = Math.max(...sensibilidadeRows.map((item) => Math.abs(item.value)), 1)
  const breakEvenScPct = input.rendimentoScHa > 0 ? (result.pontoEquilibrioScHa / input.rendimentoScHa) * 100 : 0
  const breakEvenPrecoPct = input.precoRSporSc > 0 ? (result.pontoEquilibrioPrecoSc / input.precoRSporSc) * 100 : 0

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-aletis-cinza bg-card shadow-brand-sm">
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_430px]">
          <PanelHeading
            eyebrow="Planilha FARMS v6"
            title="Viabilidade agrícola por cultura"
            description="Resultado recalculado em tempo real, com custo financeiro, custo de oportunidade, ponto de equilíbrio e stress de preço/produtividade."
            icon={Leaf}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <StatCard title="Receita" value={formatBRL(result.receitaBruta)} icon={TrendingUp} />
            <StatCard title="Custo total" value={formatBRL(result.custoTotal)} hint={`${formatBRL(result.custoTotalPorHa)}/ha`} icon={Wallet} />
            <StatCard
              title="Margem"
              value={formatBRL(result.margemBruta)}
              hint={`${formatBRL(result.margemBrutaPorHa)}/ha · ${formatPct(result.margemBrutaPct)}`}
              tone={veredicto.tone}
              icon={Target}
            />
            <StatCard title="Veredito" value={veredicto.label} hint={veredicto.description} tone={veredicto.tone} featured icon={CheckCircle2} />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-5 rounded-lg border border-aletis-cinza bg-card p-5 shadow-brand-sm">
          <PanelHeading
            eyebrow="Premissas editáveis"
            title="Entrada da operação"
            description="Campos principais da planilha, organizados por decisão operacional."
            icon={FileSpreadsheet}
          />

          <FieldGroup title="Cultura e produção">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Cultura</span>
              <select
                value={input.cultura}
                onChange={(e) => setInput({ ...input, cultura: e.target.value as FarmsInput['cultura'] })}
                className="rounded-lg border border-aletis-cinza bg-card px-3 py-2 text-sm text-foreground"
              >
                {culturas.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Área" value={input.areaHa} onChange={(v) => setInput({ ...input, areaHa: v })} suffix="ha" />
              <Field label="Rendimento" value={input.rendimentoScHa} onChange={(v) => setInput({ ...input, rendimentoScHa: v })} suffix="sc/ha" />
              <Field label="Preço venda" value={input.precoRSporSc} onChange={(v) => setInput({ ...input, precoRSporSc: v })} suffix="R$/sc" />
              <Field label="Custos fixos" value={input.custosFixosTotais ?? 0} onChange={(v) => setInput({ ...input, custosFixosTotais: v })} suffix="R$" />
            </div>
          </FieldGroup>

          <FieldGroup title="Custo direto por hectare">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sementes" value={input.custosPorHa.sementes} onChange={(v) => setCusto('sementes', v)} suffix="R$/ha" />
              <Field label="Defensivos" value={input.custosPorHa.defensivos} onChange={(v) => setCusto('defensivos', v)} suffix="R$/ha" />
              <Field label="Fertilizantes" value={input.custosPorHa.fertilizantes} onChange={(v) => setCusto('fertilizantes', v)} suffix="R$/ha" />
              <Field label="Mecanização" value={input.custosPorHa.mecanizacao} onChange={(v) => setCusto('mecanizacao', v)} suffix="R$/ha" />
              <Field label="Mão de obra" value={input.custosPorHa.maoDeObra} onChange={(v) => setCusto('maoDeObra', v)} suffix="R$/ha" />
              <Field label="Arrendamento" value={input.custosPorHa.arrendamento ?? 0} onChange={(v) => setCusto('arrendamento', v)} suffix="R$/ha" />
              <Field label="Irrigação" value={input.custosPorHa.irrigacao ?? 0} onChange={(v) => setCusto('irrigacao', v)} suffix="R$/ha" />
              <Field label="Outros" value={input.custosPorHa.outros ?? 0} onChange={(v) => setCusto('outros', v)} suffix="R$/ha" />
            </div>
          </FieldGroup>

          <FieldGroup title="Capital e ciclo">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Juros safra" value={input.taxaJurosSafraAA ?? 0} step={0.01} onChange={(v) => setInput({ ...input, taxaJurosSafraAA: v })} suffix="a.a." />
              <Field label="Duração" value={input.duracaoSafraDias ?? 240} onChange={(v) => setInput({ ...input, duracaoSafraDias: v })} suffix="dias" />
              <Field label="Capital próprio" value={input.capitalProprioPct ?? 0} step={0.05} onChange={(v) => setInput({ ...input, capitalProprioPct: v })} suffix="decimal" />
              <Field label="Custo cap. próprio" value={input.custoCapitalProprioAA ?? 0} step={0.01} onChange={(v) => setInput({ ...input, custoCapitalProprioAA: v })} suffix="a.a." />
            </div>
          </FieldGroup>

          <div className="flex items-center gap-2 rounded-xl border border-positivo/20 bg-positivo/10 px-3 py-2 text-xs font-semibold text-positivo">
            <CheckCircle2 className="h-4 w-4" />
            Cálculo atualizado automaticamente ao editar qualquer premissa.
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            <StatCard title="Área analisada" value={`${formatNumber(result.area, 0)} ha`} hint={`${formatNumber(input.rendimentoScHa, 2)} sc/ha`} icon={Scale} />
            <StatCard title="Ponto equilíbrio" value={`${formatNumber(result.pontoEquilibrioScHa, 2)} sc/ha`} hint={`${formatBRL(result.pontoEquilibrioPrecoSc)}/sc`} icon={Gauge} />
            <StatCard title="Payback" value={result.payback.viavel ? `${formatNumber(result.payback.meses, 1)} meses` : 'Sem payback'} tone={result.payback.viavel ? 'good' : 'bad'} icon={Activity} />
            <StatCard title="Custo financeiro" value={formatBRL(result.custoFinanceiro + result.custoOportunidade)} hint="financeiro + oportunidade" icon={Wallet} />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 rounded-lg border border-aletis-cinza bg-card p-5 shadow-brand-sm">
              <PanelHeading
                eyebrow="Composição"
                title="Onde o custo está concentrado"
                description="Valores totais da safra, convertidos a partir dos custos por hectare."
                icon={BarChart3}
              />
              <div className="mt-4 space-y-2">
                {custosRows.map((item) => (
                  <ProgressRow
                    key={item.label}
                    label={item.label}
                    detail={item.detail}
                    value={formatBRL(item.value)}
                    tone={item.tone}
                    width={(item.value / maxCusto) * 100}
                  />
                ))}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-lg border border-aletis-cinza bg-card p-5 shadow-brand-sm">
                <PanelHeading eyebrow="Equilíbrio" title="Pressão do cenário" icon={Target} />
                <div className="mt-4 space-y-3">
                  <ProgressRow
                    label="Produtividade mínima"
                    detail={`Atual: ${formatNumber(input.rendimentoScHa, 2)} sc/ha`}
                    value={`${formatNumber(result.pontoEquilibrioScHa, 2)} sc/ha`}
                    tone={breakEvenScPct <= 85 ? 'good' : breakEvenScPct > 100 ? 'bad' : 'gold'}
                    width={breakEvenScPct}
                  />
                  <ProgressRow
                    label="Preço mínimo"
                    detail={`Atual: ${formatBRL(input.precoRSporSc)}/sc`}
                    value={`${formatBRL(result.pontoEquilibrioPrecoSc)}/sc`}
                    tone={breakEvenPrecoPct <= 85 ? 'good' : breakEvenPrecoPct > 100 ? 'bad' : 'gold'}
                    width={breakEvenPrecoPct}
                  />
                </div>
              </section>

              <section className="rounded-lg border border-aletis-cinza bg-aletis-cream p-5 shadow-brand-sm">
                <PanelHeading eyebrow="Stress" title="Sensibilidade da margem" icon={TrendingUp} />
                <div className="mt-4 space-y-2">
                  {sensibilidadeRows.map((item) => (
                    <ProgressRow
                      key={item.label}
                      label={item.label}
                      value={formatBRL(item.value)}
                      tone={item.value >= 0 ? 'good' : 'bad'}
                      width={(Math.abs(item.value) / maxSensibilidade) * 100}
                    />
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────── */
/* Fechamento por Embarque                                  */
/* ──────────────────────────────────────────────────────── */
function cloneFechamentoDefault(): FechamentoGeralEmbarqueInput {
  return JSON.parse(JSON.stringify(FECHAMENTO_ARI_PRADO_2024_INPUT)) as FechamentoGeralEmbarqueInput
}

function FechamentoEmbarqueCard() {
  const [input, setInput] = useState<FechamentoGeralEmbarqueInput>(() => cloneFechamentoDefault())
  const [selectedId, setSelectedId] = useState(FECHAMENTO_ARI_PRADO_2024_INPUT.embarques[0]?.id ?? '')
  const result = useMemo(() => calcularFechamentoGeralEmbarque(input), [input])
  const selected = input.embarques.find((item) => item.id === selectedId) ?? input.embarques[0]
  const selectedResult = result.embarques.find((item) => item.id === selected?.id) ?? result.embarques[0]
  const maxLucro = Math.max(...result.embarques.map((item) => Math.max(item.lucroLiquidoRsCab, 0)), 1)
  const selectedCostRows = selectedResult
    ? [
        { label: 'Animal de entrada', value: selectedResult.precoEntradaRsCab },
        { label: 'Alimentação', value: selectedResult.custoAlimentarRsCab },
        { label: 'Operacional período', value: selectedResult.custoOperacionalPeriodoRsCab },
        { label: 'Perdas alimentos', value: selectedResult.perdasAlimentosRsCab },
        { label: 'Sanidade', value: selectedResult.custoSanidadeRsCab },
        { label: 'Frete', value: selectedResult.freteRsCab },
        { label: 'Taxas abate', value: selectedResult.taxasAbateRastreabilidadeRsCab },
      ].filter((item) => item.value > 0)
    : []
  const maxSelectedCost = Math.max(...selectedCostRows.map((item) => item.value), 1)

  function updateSelected<K extends keyof FechamentoEmbarqueInput>(key: K, value: FechamentoEmbarqueInput[K]) {
    if (!selected) return
    setInput((prev) => ({
      ...prev,
      embarques: prev.embarques.map((item) => (item.id === selected.id ? { ...item, [key]: value } : item)),
    }))
  }

  function resetar() {
    const next = cloneFechamentoDefault()
    setInput(next)
    setSelectedId(next.embarques[0]?.id ?? '')
  }

  function exportarCsv() {
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Embarque', 'Data', 'Animais', 'Dias', 'Peso entrada kg', 'Peso saida kg', 'GMD kg/dia', 'Arrobas produzidas', 'Venda por cabeca', 'Custo operacional por cabeca', 'Lucro por cabeca', 'Rentabilidade a.m.', 'Lucro total'],
      ...result.embarques.map((item) => [
        item.rotulo,
        item.dataEmbarque ?? '',
        item.numeroAnimais,
        item.periodoEngordaDias,
        item.pesoEntradaKg,
        item.pesoSaidaKg,
        item.gmdKgDia,
        item.arrobasProduzidas,
        item.precoVendaRsCab,
        item.custoOperacionalTotalRsCab,
        item.lucroLiquidoRsCab,
        item.rentabilidadeMensalPct,
        item.lucroLiquidoTotalRs,
      ]),
      ['GERAL', '', result.geral.totalAnimais, result.geral.periodoEngordaDias, result.geral.pesoEntradaKg, result.geral.pesoSaidaKg, result.geral.gmdKgDia, result.geral.arrobasProduzidas, result.geral.precoVendaRsCab, result.geral.custoOperacionalTotalRsCab, result.geral.lucroLiquidoRsCab, result.geral.rentabilidadeMensalPct, result.geral.lucroLiquidoTotalRs],
    ]
    const csv = rows.map((row) => row.map(quote).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'fechamento-embarque-ari-prado-2024.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!selected || !selectedResult) return null

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-aletis-cinza bg-card shadow-brand-sm">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <PanelHeading
            eyebrow={result.origemPlanilha ?? 'Fechamento Geral 2024'}
            title={result.nome}
            description="Matriz nativa da planilha enviada, com edição por embarque, ranking por baia, alertas operacionais e exportação em CSV."
            icon={ClipboardList}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportarCsv}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-aletis-cinza bg-card px-3 text-sm font-semibold text-foreground transition hover:bg-aletis-cream"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={resetar}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-aletis-cinza bg-aletis-cream px-3 text-sm font-semibold text-foreground transition hover:bg-white"
            >
              <RefreshCw className="h-4 w-4" />
              Restaurar planilha
            </button>
          </div>
        </div>

        <div className="grid gap-3 border-t border-aletis-cinza bg-aletis-cream/60 p-4 md:grid-cols-3 2xl:grid-cols-6">
          <StatCard title="Animais" value={formatNumber(result.geral.totalAnimais, 0)} hint="cabeças fechadas" icon={Scale} />
          <StatCard title="Lucro total" value={formatBRL(result.geral.lucroLiquidoTotalRs)} tone={result.geral.lucroLiquidoTotalRs >= 0 ? 'good' : 'bad'} icon={TrendingUp} />
          <StatCard title="Lucro/cab." value={formatBRL(result.geral.lucroLiquidoRsCab)} tone={result.geral.lucroLiquidoRsCab >= 0 ? 'good' : 'bad'} icon={Wallet} />
          <StatCard title="Rentabilidade" value={formatPct(result.geral.rentabilidadeMensalPct)} hint="média ponderada a.m." icon={Activity} />
          <StatCard title="GMD médio" value={`${formatNumber(result.geral.gmdKgDia, 2)} kg/d`} icon={Gauge} />
          <StatCard title="Custo @ prod." value={formatBRL(result.geral.custoArrobaProduzidaRs)} icon={Target} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(360px,450px)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-5 rounded-lg border border-aletis-cinza bg-card p-5 shadow-brand-sm">
          <PanelHeading
            eyebrow="Embarque em edição"
            title={selected.rotulo}
            description={selected.dataEmbarque || 'Sem data informada'}
            icon={FileSpreadsheet}
          />

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Selecionar embarque</span>
            <select
              value={selected.id}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-lg border border-aletis-cinza bg-card px-3 py-2 text-sm text-foreground"
            >
              {input.embarques.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {String(index + 1).padStart(2, '0')} · {item.rotulo} · {item.numeroAnimais} cab.
                </option>
              ))}
            </select>
          </label>

          <FieldGroup title="Identificação e lote">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Data</span>
              <input
                value={selected.dataEmbarque ?? ''}
                onChange={(e) => updateSelected('dataEmbarque', e.target.value)}
                className="rounded-lg border border-aletis-cinza bg-card px-3 py-2 text-sm text-foreground"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Animais" value={selected.numeroAnimais} onChange={(v) => updateSelected('numeroAnimais', v)} suffix="cab." />
              <Field label="Dias engorda" value={selected.periodoEngordaDias} onChange={(v) => updateSelected('periodoEngordaDias', v)} suffix="dias" />
            </div>
          </FieldGroup>

          <FieldGroup title="Compra e entrada">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Peso entrada" value={selected.pesoEntradaKg} onChange={(v) => updateSelected('pesoEntradaKg', v)} suffix="kg" />
              <Field label="R$/@ entrada" value={selected.precoEntradaRsArroba} onChange={(v) => updateSelected('precoEntradaRsArroba', v)} suffix="R$" />
              <Field label="Rend. entrada" value={selected.rendimentoCarcacaEntradaPct} step={0.001} onChange={(v) => updateSelected('rendimentoCarcacaEntradaPct', v)} suffix="decimal" />
              <ComputedField label="Custo animal" value={formatBRL(selectedResult.precoEntradaRsCab)} suffix="cab." />
            </div>
          </FieldGroup>

          <FieldGroup title="Saída e venda">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Peso saída" value={selected.pesoSaidaKg} onChange={(v) => updateSelected('pesoSaidaKg', v)} suffix="kg" />
              <Field label="R$/@ saída" value={selected.precoSaidaRsArroba} onChange={(v) => updateSelected('precoSaidaRsArroba', v)} suffix="R$" />
              <Field label="Rend. abate" value={selected.rendimentoCarcacaAbatePct} step={0.001} onChange={(v) => updateSelected('rendimentoCarcacaAbatePct', v)} suffix="decimal" />
              <ComputedField label="Venda/cab." value={formatBRL(selectedResult.precoVendaRsCab)} />
            </div>
          </FieldGroup>

          <FieldGroup title="Alimentação e despesas">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Consumo MS" value={Number(selected.consumoMedioKgMs.toFixed(2))} step={0.01} onChange={(v) => updateSelected('consumoMedioKgMs', v)} suffix="kg" />
              <Field label="Dieta kg/MS" value={selected.custoDietaRsKgMs} step={0.01} onChange={(v) => updateSelected('custoDietaRsKgMs', v)} suffix="R$" />
              <Field label="Oper. cab/dia" value={selected.custoOperacionalAnimalDia} step={0.01} onChange={(v) => updateSelected('custoOperacionalAnimalDia', v)} suffix="R$" />
              <Field label="Perdas alim." value={selected.perdasAlimentosRsCab} onChange={(v) => updateSelected('perdasAlimentosRsCab', v)} suffix="R$" />
              <Field label="Sanidade" value={selected.custoSanidadeRsCab} onChange={(v) => updateSelected('custoSanidadeRsCab', v)} suffix="R$" />
              <Field label="Frete" value={selected.freteRsCab} onChange={(v) => updateSelected('freteRsCab', v)} suffix="R$" />
              <Field label="Taxas abate" value={selected.taxasAbateRastreabilidadeRsCab} onChange={(v) => updateSelected('taxasAbateRastreabilidadeRsCab', v)} suffix="R$" />
            </div>
          </FieldGroup>

          <div className="grid grid-cols-2 gap-3 rounded-xl bg-aletis-cream p-3 ring-1 ring-aletis-cinza">
            <StatMini label="Lucro/cab." value={formatBRL(selectedResult.lucroLiquidoRsCab)} tone={selectedResult.lucroLiquidoRsCab >= 0 ? 'good' : 'bad'} />
            <StatMini label="Rent. a.m." value={formatPct(selectedResult.rentabilidadeMensalPct)} tone={selectedResult.rentabilidadeMensalPct >= 0 ? 'good' : 'bad'} />
            <StatMini label="GMD" value={`${formatNumber(selectedResult.gmdKgDia, 2)} kg/d`} />
            <StatMini label="Custo @ prod." value={formatBRL(selectedResult.custoArrobaProduzidaRs)} />
          </div>
        </section>

        <section className="min-w-0 space-y-4">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-lg border border-aletis-verde bg-aletis-verde p-5 text-aletis-cream shadow-brand">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aletis-cream/65">Leitura do embarque selecionado</p>
              <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-display text-2xl font-bold text-white">{selected.rotulo}</h3>
                  <p className="text-sm text-aletis-cream/75">
                    {formatNumber(selectedResult.numeroAnimais, 0)} cabeças · {formatNumber(selectedResult.periodoEngordaDias, 0)} dias · {selectedResult.dataEmbarque || 'sem data'}
                  </p>
                </div>
                <p className={['font-display text-2xl font-bold', selectedResult.lucroLiquidoRsCab >= 0 ? 'text-aletis-gold' : 'text-alerta'].join(' ')}>
                  {formatBRL(selectedResult.lucroLiquidoRsCab)}
                </p>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white/10 p-3">
                  <StatMini label="Venda/cab." value={formatBRL(selectedResult.precoVendaRsCab)} inverse />
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <StatMini label="Custo op." value={formatBRL(selectedResult.custoOperacionalTotalRsCab)} inverse />
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <StatMini label="@ produzidas" value={formatNumber(selectedResult.arrobasProduzidas, 2)} inverse />
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <StatMini label="Conv. biológica" value={`${formatNumber(selectedResult.conversaoBiologicaKgMsArroba, 1)} kg MS/@`} inverse />
                </div>
              </div>
            </section>

            <aside className="rounded-lg border border-aletis-cinza bg-card p-5 shadow-brand-sm">
              <PanelHeading eyebrow="Custo por cabeça" title="Composição do embarque" icon={BarChart3} />
              <div className="mt-4 space-y-2">
                {selectedCostRows.map((item) => (
                  <ProgressRow
                    key={item.label}
                    label={item.label}
                    value={formatBRL(item.value)}
                    width={(item.value / maxSelectedCost) * 100}
                    tone={item.label === 'Animal de entrada' ? 'gold' : 'default'}
                  />
                ))}
              </div>
            </aside>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0 rounded-lg border border-aletis-cinza bg-card p-5 shadow-brand-sm">
              <div className="flex items-center justify-between gap-3">
                <PanelHeading eyebrow="Ranking" title="Lucro por cabeça" icon={Trophy} />
                <Trophy className="h-5 w-5 text-aletis-gold" />
              </div>
              <div className="mt-4 space-y-2">
                {result.rankingLucro.slice(0, 8).map((item) => {
                  const width = `${Math.max(3, Math.min(100, (Math.max(item.lucroLiquidoRsCab, 0) / maxLucro) * 100)).toFixed(1)}%`
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={[
                        'w-full rounded-xl border p-3 text-left transition',
                        item.id === selected.id
                          ? 'border-aletis-verde bg-aletis-verde text-white shadow-brand-sm'
                          : 'border-aletis-cinza bg-aletis-cream/50 text-muted-foreground hover:bg-white',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold">{item.rotulo}</span>
                        <span className={item.lucroLiquidoRsCab >= 0 ? 'font-mono text-positivo' : 'font-mono text-alerta'}>
                          {formatBRL(item.lucroLiquidoRsCab)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
                        <div className="h-full rounded-full bg-aletis-gold" style={{ width }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>

            <aside className="rounded-lg border border-aletis-cinza bg-card p-5 shadow-brand-sm">
              <PanelHeading eyebrow="Controle" title="Pontos de atenção" icon={AlertTriangle} />
              <div className="mt-3 space-y-2">
                {result.alertas.length === 0 ? (
                  <p className="rounded-lg bg-positivo/10 px-3 py-2 text-xs font-medium text-positivo">
                    Sem alertas críticos.
                  </p>
                ) : (
                  result.alertas.slice(0, 7).map((alerta) => (
                    <p key={alerta} className="rounded-lg bg-alerta/10 px-3 py-2 text-xs leading-relaxed text-alerta">
                      {alerta}
                    </p>
                  ))
                )}
              </div>
            </aside>
          </div>

          <section className="min-w-0 overflow-hidden rounded-lg border border-aletis-cinza bg-card shadow-brand-sm">
            <div className="flex flex-col gap-1 border-b border-aletis-cinza px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-aletis-verde-medio/65">Matriz operacional</p>
                <h3 className="font-display text-base font-bold text-foreground">Todos os embarques</h3>
              </div>
              <p className="text-xs text-muted-foreground">{result.embarques.length} linhas recalculadas em tempo real</p>
            </div>
            <div className="max-h-[620px] overflow-auto">
              <table className="ui-table w-full min-w-[1040px] text-sm">
                <thead className="sticky top-0 z-10 bg-aletis-cream text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Embarque</th>
                    <th className="px-4 py-3 text-right">Cab.</th>
                    <th className="px-4 py-3 text-right">Dias</th>
                    <th className="px-4 py-3 text-right">GMD</th>
                    <th className="px-4 py-3 text-right">@ prod.</th>
                    <th className="px-4 py-3 text-right">Venda/cab.</th>
                    <th className="px-4 py-3 text-right">Custo op.</th>
                    <th className="px-4 py-3 text-right">Lucro/cab.</th>
                    <th className="px-4 py-3 text-right">Rent. a.m.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-aletis-cinza">
                  {result.embarques.map((item) => (
                    <tr
                      key={item.id}
                      className={item.id === selected.id ? 'bg-aletis-gold/10 text-foreground' : 'text-muted-foreground'}
                    >
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => setSelectedId(item.id)} className="font-semibold hover:text-aletis-verde">
                          {item.rotulo}
                        </button>
                        <p className="text-[11px] text-aletis-verde-medio/70">{item.dataEmbarque}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatNumber(item.numeroAnimais, 0)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatNumber(item.periodoEngordaDias, 0)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatNumber(item.gmdKgDia, 2)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatNumber(item.arrobasProduzidas, 2)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatBRL(item.precoVendaRsCab)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatBRL(item.custoOperacionalTotalRsCab)}</td>
                      <td className={['px-4 py-3 text-right font-mono font-semibold', item.lucroLiquidoRsCab >= 0 ? 'text-positivo' : 'text-alerta'].join(' ')}>
                        {formatBRL(item.lucroLiquidoRsCab)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{formatPct(item.rentabilidadeMensalPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </div>
  )
}

function StatMini({
  label,
  value,
  tone = 'default',
  inverse = false,
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'bad'
  inverse?: boolean
}) {
  const toneClass = tone === 'good' ? 'text-positivo' : tone === 'bad' ? 'text-alerta' : inverse ? 'text-white' : 'text-foreground'
  return (
    <div>
      <p className={['text-[11px] uppercase tracking-wide', inverse ? 'text-aletis-cream/65' : 'text-aletis-verde-medio/70'].join(' ')}>{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-bold ${toneClass}`}>{value}</p>
    </div>
  )
}
