/**
 * Calculadoras Agro — UI interativa para 3 calculadoras nativas:
 *   - Diagnóstico financeiro (Dupont + Fleuriet)
 *   - Formação de Preço de Venda 3.0
 *   - FARMS — Viabilidade Agrícola
 *
 * Reimplementam planilhas em /ALETIS2/novos/sistema agro/.
 * Toda lógica está no `@aletis/financial-calc/src/agro`.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, BarChart3, Calculator, TrendingUp } from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

type Tab = 'dupont' | 'preco' | 'farms'

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
const formatPct = (v: number) => `${(v * 100).toFixed(2)}%`

export default function CalculadorasAgro() {
  const [tab, setTab] = useState<Tab>('dupont')

  const TABS: { id: Tab; label: string; icon: typeof Calculator; subtitle: string }[] = [
    { id: 'dupont', label: 'Dupont / Fleuriet', icon: BarChart3, subtitle: 'Diagnóstico financeiro completo' },
    { id: 'preco', label: 'Preço de Venda 3.0', icon: Calculator, subtitle: 'Formação de preço com 4 modelos' },
    { id: 'farms', label: 'FARMS Viabilidade', icon: TrendingUp, subtitle: 'Análise por cultura + sensibilidade' },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/ferramentas"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-aletis-verde-medio/70 hover:text-aletis-verde"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Ferramentas
          </Link>
          <h1 className="mt-1 font-display text-2xl font-bold text-aletis-verde">Calculadoras Agro</h1>
          <p className="text-sm text-aletis-verde-medio">
            Reimplementação nativa das planilhas legadas. Sem Excel, com testes automatizados.
          </p>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
                active ? 'bg-aletis-verde text-aletis-cream shadow-brand' : 'bg-white text-aletis-verde-medio hover:bg-aletis-cream',
              ].join(' ')}
            >
              <Icon className="h-4 w-4" />
              <span className="flex flex-col items-start leading-tight">
                <span>{t.label}</span>
                <span className={['text-[10px]', active ? 'text-aletis-cream/70' : 'text-aletis-verde-medio/60'].join(' ')}>{t.subtitle}</span>
              </span>
            </button>
          )
        })}
      </nav>

      {tab === 'dupont' && <DupontCard />}
      {tab === 'preco' && <PrecoCard />}
      {tab === 'farms' && <FarmsCard />}
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
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  suffix?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-aletis-verde-medio">{label}</span>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full rounded-lg border border-aletis-cinza bg-white px-3 py-2 font-mono text-sm text-aletis-verde focus:border-aletis-gold focus:outline-none"
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

function StatCard({ title, value, hint, tone = 'default' }: { title: string; value: string; hint?: string; tone?: 'default' | 'good' | 'bad' }) {
  const toneClass =
    tone === 'good' ? 'text-positivo' : tone === 'bad' ? 'text-alerta' : 'text-aletis-verde'
  return (
    <div className="rounded-xl bg-white p-4 shadow-brand-sm ring-1 ring-aletis-cinza">
      <p className="text-[10px] uppercase tracking-wider text-aletis-verde-medio/70">{title}</p>
      <p className={`mt-1 font-display text-xl font-bold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-aletis-verde-medio/80">{hint}</p>}
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
      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
        <h2 className="font-display text-base font-bold text-aletis-verde">DRE</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Receita líquida" value={dre.receitaLiquida} onChange={(v) => setDre({ ...dre, receitaLiquida: v })} suffix="R$" />
          <Field label="CMV" value={dre.cogs} onChange={(v) => setDre({ ...dre, cogs: v })} suffix="R$" />
          <Field label="Despesas op." value={dre.despesasOperacionais} onChange={(v) => setDre({ ...dre, despesasOperacionais: v })} suffix="R$" />
          <Field label="Despesas fin." value={dre.despesasFinanceiras} onChange={(v) => setDre({ ...dre, despesasFinanceiras: v })} suffix="R$" />
          <Field label="Receitas fin." value={dre.receitasFinanceiras} onChange={(v) => setDre({ ...dre, receitasFinanceiras: v })} suffix="R$" />
          <Field label="IR + CSLL" value={dre.impostoDeRenda} onChange={(v) => setDre({ ...dre, impostoDeRenda: v })} suffix="R$" />
        </div>

        <h2 className="mt-4 font-display text-base font-bold text-aletis-verde">Balanço</h2>
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
          <div className="rounded-2xl bg-white p-6 text-sm text-aletis-verde-medio shadow-brand-sm ring-1 ring-aletis-cinza">
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
            <div className="rounded-2xl bg-white p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
              <h3 className="font-display text-sm font-bold text-aletis-verde">Decomposição Dupont</h3>
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                <div>Margem líquida: <strong>{formatPct(result.dupont.margemLiquida)}</strong></div>
                <div>Giro do ativo: <strong>{result.dupont.giroDoAtivo.toFixed(3)}×</strong></div>
                <div>Alavancagem: <strong>{result.dupont.alavancagem.toFixed(3)}×</strong></div>
              </div>
            </div>
            <div className="rounded-2xl bg-aletis-verde p-5 text-aletis-cream shadow-brand">
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
              <div className="rounded-2xl bg-white p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
                <h3 className="font-display text-sm font-bold text-aletis-verde">Liquidez</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>Corrente: <strong>{result.liquidez.corrente.toFixed(2)}</strong></li>
                  <li>Seca: <strong>{result.liquidez.seca.toFixed(2)}</strong></li>
                  <li>Geral: <strong>{result.liquidez.geral.toFixed(2)}</strong></li>
                  <li>Imediata: <strong>{result.liquidez.imediata.toFixed(2)}</strong></li>
                </ul>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
                <h3 className="font-display text-sm font-bold text-aletis-verde">Endividamento</h3>
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
      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
        <h2 className="font-display text-base font-bold text-aletis-verde">Insumos</h2>
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
          <span className="text-aletis-verde-medio">Modelo</span>
          <select
            value={input.modelo}
            onChange={(e) => setInput({ ...input, modelo: e.target.value as typeof input.modelo })}
            className="rounded-lg border border-aletis-cinza bg-white px-3 py-2 text-sm"
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
          <div className="rounded-2xl bg-white p-6 text-sm text-aletis-verde-medio shadow-brand-sm ring-1 ring-aletis-cinza">
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
            <div className="rounded-2xl bg-white p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
              <h3 className="font-display text-sm font-bold text-aletis-verde">Decomposição</h3>
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
              <div className="rounded-2xl bg-aletis-cream p-5 ring-1 ring-aletis-cinza">
                <h3 className="font-display text-sm font-bold text-aletis-verde">Ponto de equilíbrio</h3>
                <p className="mt-1 text-sm text-aletis-verde-medio">
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
  const [input, setInput] = useState({
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
  const [result, setResult] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)

  async function calcular() {
    setErr(null)
    try {
      const data = await apiFetch<any>('/calculadoras-agro/farms-viabilidade', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      setResult(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'erro')
    }
  }

  function setCusto<K extends keyof typeof input.custosPorHa>(k: K, v: number) {
    setInput({ ...input, custosPorHa: { ...input.custosPorHa, [k]: v } })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
        <h2 className="font-display text-base font-bold text-aletis-verde">Cultura & operação</h2>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-aletis-verde-medio">Cultura</span>
          <select
            value={input.cultura}
            onChange={(e) => setInput({ ...input, cultura: e.target.value as typeof input.cultura })}
            className="rounded-lg border border-aletis-cinza bg-white px-3 py-2 text-sm"
          >
            {['soja', 'milho', 'arroz', 'trigo', 'cafe', 'algodao', 'outra'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Área (ha)" value={input.areaHa} onChange={(v) => setInput({ ...input, areaHa: v })} />
          <Field label="Rend. (sc/ha)" value={input.rendimentoScHa} onChange={(v) => setInput({ ...input, rendimentoScHa: v })} />
          <Field label="Preço (R$/sc)" value={input.precoRSporSc} onChange={(v) => setInput({ ...input, precoRSporSc: v })} suffix="R$" />
          <Field label="Custos fixos" value={input.custosFixosTotais} onChange={(v) => setInput({ ...input, custosFixosTotais: v })} suffix="R$" />
        </div>

        <h2 className="font-display text-base font-bold text-aletis-verde">Custo por ha</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sementes" value={input.custosPorHa.sementes} onChange={(v) => setCusto('sementes', v)} suffix="R$" />
          <Field label="Defensivos" value={input.custosPorHa.defensivos} onChange={(v) => setCusto('defensivos', v)} suffix="R$" />
          <Field label="Fertilizantes" value={input.custosPorHa.fertilizantes} onChange={(v) => setCusto('fertilizantes', v)} suffix="R$" />
          <Field label="Mecanização" value={input.custosPorHa.mecanizacao} onChange={(v) => setCusto('mecanizacao', v)} suffix="R$" />
          <Field label="Mão de obra" value={input.custosPorHa.maoDeObra} onChange={(v) => setCusto('maoDeObra', v)} suffix="R$" />
          <Field label="Arrendamento" value={input.custosPorHa.arrendamento} onChange={(v) => setCusto('arrendamento', v)} suffix="R$" />
          <Field label="Irrigação" value={input.custosPorHa.irrigacao} onChange={(v) => setCusto('irrigacao', v)} suffix="R$" />
          <Field label="Outros" value={input.custosPorHa.outros} onChange={(v) => setCusto('outros', v)} suffix="R$" />
        </div>

        <h2 className="font-display text-base font-bold text-aletis-verde">Capital</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Juros safra (a.a.)" value={input.taxaJurosSafraAA} step={0.01} onChange={(v) => setInput({ ...input, taxaJurosSafraAA: v })} suffix="%dec" />
          <Field label="Duração (dias)" value={input.duracaoSafraDias} onChange={(v) => setInput({ ...input, duracaoSafraDias: v })} />
          <Field label="% cap. próprio" value={input.capitalProprioPct} step={0.05} onChange={(v) => setInput({ ...input, capitalProprioPct: v })} suffix="%dec" />
          <Field label="Custo CP a.a." value={input.custoCapitalProprioAA} step={0.01} onChange={(v) => setInput({ ...input, custoCapitalProprioAA: v })} suffix="%dec" />
        </div>

        <button
          type="button"
          onClick={calcular}
          className="w-full rounded-xl bg-aletis-verde py-2.5 font-display text-sm font-bold text-aletis-cream transition hover:bg-aletis-verde-escuro"
        >
          Avaliar viabilidade
        </button>
        {err && <p className="text-xs text-alerta">{err}</p>}
      </section>

      <section className="space-y-4">
        {!result && (
          <div className="rounded-2xl bg-white p-6 text-sm text-aletis-verde-medio shadow-brand-sm ring-1 ring-aletis-cinza">
            Saídas: receita bruta, custo total (com financeiro e oportunidade), margem,
            ponto de equilíbrio em sc/ha e em R$/sc, sensibilidade a ±10% no preço e ±15%
            no rendimento, veredito viável/marginal/inviável.
          </div>
        )}
        {result && (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <StatCard title="Receita bruta" value={formatBRL(result.receitaBruta)} />
              <StatCard title="Custo total" value={formatBRL(result.custoTotal)} hint={`R$ ${result.custoTotalPorHa.toFixed(0)}/ha`} />
              <StatCard
                title="Margem bruta"
                value={formatBRL(result.margemBruta)}
                hint={formatPct(result.margemBrutaPct)}
                tone={result.veredicto === 'viavel' ? 'good' : result.veredicto === 'inviavel' ? 'bad' : 'default'}
              />
              <StatCard title="Veredito" value={result.veredicto.toUpperCase()} tone={result.veredicto === 'viavel' ? 'good' : result.veredicto === 'inviavel' ? 'bad' : 'default'} />
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-brand-sm ring-1 ring-aletis-cinza">
              <h3 className="font-display text-sm font-bold text-aletis-verde">Ponto de equilíbrio</h3>
              <p className="mt-2 text-sm text-aletis-verde-medio">
                Mantendo o preço, é necessário <strong>{result.pontoEquilibrioScHa.toFixed(2)} sc/ha</strong>.
                Mantendo o rendimento, o preço mínimo é <strong>R$ {result.pontoEquilibrioPrecoSc.toFixed(2)}/sc</strong>.
              </p>
            </div>
            <div className="rounded-2xl bg-aletis-cream p-5 ring-1 ring-aletis-cinza">
              <h3 className="font-display text-sm font-bold text-aletis-verde">Sensibilidade</h3>
              <ul className="mt-2 grid gap-1 text-sm md:grid-cols-2">
                <li>Preço −10%: <strong>{formatBRL(result.sensibilidade.precoMenos10)}</strong></li>
                <li>Preço +10%: <strong>{formatBRL(result.sensibilidade.precoMais10)}</strong></li>
                <li>Rend. −15%: <strong>{formatBRL(result.sensibilidade.rendimentoMenos15)}</strong></li>
                <li>Rend. +15%: <strong>{formatBRL(result.sensibilidade.rendimentoMais15)}</strong></li>
              </ul>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
