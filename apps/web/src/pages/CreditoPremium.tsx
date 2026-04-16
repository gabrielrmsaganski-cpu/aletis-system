import React, { useState } from 'react'
import {
  Sprout,
  ShieldAlert,
  Layers,
  CalendarClock,
  Gauge,
  Users,
  BadgeCheck,
  HandCoins,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

// ────────────────────────────────────────────────────────────
// Formatters (shared style with Credito.tsx)
// ────────────────────────────────────────────────────────────
const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtPct = (v: number, d = 2): string =>
  v.toFixed(d).replace('.', ',') + '%'

const fmtNum = (v: number, d = 2): string =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)

// ────────────────────────────────────────────────────────────
// Generic premium card with collapse / execute state
// ────────────────────────────────────────────────────────────
function PremiumCalculatorCard({
  icon: Icon,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
  badge?: string
  children: (params: {
    loading: boolean
    error: string | null
    execute: <T,>(path: string, body: unknown) => Promise<T | null>
  }) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function execute<T>(path: string, body: unknown): Promise<T | null> {
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch<T>(path, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      return r
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card-premium p-5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 w-full text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-aletis-dourado/10 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-aletis-dourado-escuro" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-display font-semibold text-aletis-grafite-escuro">
              {title}
            </h3>
            {badge && (
              <span className="text-[10px] font-body font-semibold px-2 py-0.5 rounded-full bg-aletis-verde/10 text-aletis-verde">
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs font-body text-aletis-grafite-claro truncate">{subtitle}</p>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-aletis-grafite-claro" />
        ) : (
          <ChevronDown className="w-4 h-4 text-aletis-grafite-claro" />
        )}
      </button>

      {open && (
        <div className="mt-5 pt-5 border-t border-aletis-grafite-claro/10">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-alerta/10 border border-alerta/20 text-xs font-body text-alerta flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
          {children({ loading, error, execute })}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Reusable input
// ────────────────────────────────────────────────────────────
function Input({
  label,
  value,
  onChange,
  suffix,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  suffix?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-body font-medium text-aletis-grafite-medio mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="input-field pr-10 text-sm"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-aletis-grafite-claro font-body">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div>
      <label className="block text-[11px] font-body font-medium text-aletis-grafite-medio mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-field text-sm"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function RunButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="btn-primary w-full text-sm flex items-center justify-center gap-2"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
      {loading ? 'Calculando...' : label}
    </button>
  )
}

function Metric({
  label,
  value,
  variant = 'neutral',
}: {
  label: string
  value: string
  variant?: 'neutral' | 'positive' | 'gold' | 'alert'
}) {
  const bg =
    variant === 'positive' ? 'bg-positivo/10 border-positivo/20' :
    variant === 'gold' ? 'bg-aletis-dourado/10 border-aletis-dourado/20' :
    variant === 'alert' ? 'bg-alerta/10 border-alerta/20' :
    'bg-aletis-bege border-aletis-grafite-claro/10'
  const color =
    variant === 'positive' ? 'text-positivo' :
    variant === 'gold' ? 'text-aletis-dourado-escuro' :
    variant === 'alert' ? 'text-alerta' :
    'text-aletis-grafite-escuro'
  return (
    <div className={`rounded-lg border ${bg} p-3`}>
      <p className="text-[10px] font-body text-aletis-grafite-claro uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-base font-display font-bold ${color}`}>{value}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// 1. Alongamento (Sumula 298)
// ════════════════════════════════════════════════════════════
type AlongamentoResult = {
  valorAlongavel: number
  valorMantidoCondicoesOriginais: number
  novaTaxaAA: number
  prazoAlongadoMeses: number
  parcelasAnuais: Array<{ safra: string; vencimento: string; principal: number; juros: number; total: number }>
  economiaFinanceira: number
  fundamentacaoJuridica: string
  viabilidade: 'alta' | 'media' | 'baixa'
}

function CardAlongamento() {
  const [saldo, setSaldo] = useState('277380')
  const [taxa, setTaxa] = useState('14')
  const [prazo, setPrazo] = useState('24')
  const [perda, setPerda] = useState('25')
  const [tipo, setTipo] = useState<'custeio' | 'investimento' | 'comercializacao'>('custeio')
  const [safras, setSafras] = useState('4')
  const [result, setResult] = useState<AlongamentoResult | null>(null)

  return (
    <PremiumCalculatorCard
      icon={Sprout}
      title="Alongamento - Sumula 298 STJ"
      subtitle="Proporcional a perda declarada. MCR 2-6-4 e TRF-4 Apelacao 5008203-86.2016."
      badge="PREMIUM"
    >
      {({ loading, execute }) => (
        <>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const r = await execute<AlongamentoResult>('/credito/alongamento', {
                saldoDevedor: Number(saldo),
                taxaOriginalAA: Number(taxa),
                prazoOriginalMeses: Number(prazo),
                percentualPerdaSafra: Number(perda),
                tipoCredito: tipo,
                dataVencimentoOriginal: new Date().toISOString().slice(0, 10),
                numeroSafras: Number(safras),
              })
              if (r) setResult(r)
            }}
            className="grid grid-cols-2 lg:grid-cols-3 gap-3"
          >
            <Input label="Saldo devedor" value={saldo} onChange={setSaldo} suffix="R$" />
            <Input label="Taxa original" value={taxa} onChange={setTaxa} suffix="% a.a." />
            <Input label="Prazo original" value={prazo} onChange={setPrazo} suffix="meses" />
            <Input label="% perda da safra" value={perda} onChange={setPerda} suffix="%" />
            <Select
              label="Tipo credito"
              value={tipo}
              onChange={v => setTipo(v as typeof tipo)}
              options={[
                { value: 'custeio', label: 'Custeio' },
                { value: 'investimento', label: 'Investimento' },
                { value: 'comercializacao', label: 'Comercializacao' },
              ]}
            />
            <Input label="Numero de safras" value={safras} onChange={setSafras} suffix="safras" />
            <div className="col-span-2 lg:col-span-3">
              <RunButton loading={loading} label="Simular alongamento" />
            </div>
          </form>

          {result && (
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric label="Valor alongavel" value={fmtBRL(result.valorAlongavel)} variant="gold" />
              <Metric label="Prazo novo" value={`${result.prazoAlongadoMeses} meses`} />
              <Metric label="Economia" value={fmtBRL(result.economiaFinanceira)} variant="positive" />
              <Metric
                label="Viabilidade"
                value={result.viabilidade.toUpperCase()}
                variant={result.viabilidade === 'alta' ? 'positive' : result.viabilidade === 'media' ? 'gold' : 'alert'}
              />
              {result.parcelasAnuais.length > 0 && (
                <div className="col-span-2 lg:col-span-4 rounded-lg bg-aletis-bege p-3 border border-aletis-grafite-claro/10">
                  <p className="text-[10px] uppercase tracking-wide text-aletis-grafite-claro mb-2">Parcelas por safra</p>
                  <div className="space-y-1 text-xs font-body">
                    {result.parcelasAnuais.map(p => (
                      <div key={p.safra} className="flex justify-between">
                        <span>{p.safra}</span>
                        <span className="font-semibold">{fmtBRL(p.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="col-span-2 lg:col-span-4 rounded-lg bg-aletis-verde/5 border border-aletis-verde/20 p-3">
                <p className="text-[10px] uppercase tracking-wide text-aletis-verde mb-1">Fundamentacao juridica</p>
                <p className="text-xs font-body text-aletis-grafite-escuro">{result.fundamentacaoJuridica}</p>
              </div>
            </div>
          )}
        </>
      )}
    </PremiumCalculatorCard>
  )
}

// ════════════════════════════════════════════════════════════
// 2. Descaracterizacao Credito Rural
// ════════════════════════════════════════════════════════════
type DescResult = {
  houveDescaracterizacao: boolean
  taxaMediaOriginal: number
  spreadCobrado: number
  excessoSobreOriginal: number
  valorRestituicaoEstimada: number
  indicios: string[]
  basesLegais: string[]
  proximosPassos: string[]
}

function CardDescaracterizacao() {
  const [valorOrig, setValorOrig] = useState('277380')
  const [taxaOrig, setTaxaOrig] = useState('14')
  const [valorReneg, setValorReneg] = useState('350000')
  const [taxaReneg, setTaxaReneg] = useState('68')
  const [cetReneg, setCetReneg] = useState('72')
  const [finalidade, setFinalidade] = useState('pessoal')
  const [result, setResult] = useState<DescResult | null>(null)

  return (
    <PremiumCalculatorCard
      icon={ShieldAlert}
      title="Descaracterizacao de Credito Rural"
      subtitle="Detecta migracao de custeio rural para credito pessoal. CDC art. 42, Sumula 322 STJ."
      badge="JUDICIAL"
    >
      {({ loading, execute }) => (
        <>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const r = await execute<DescResult>('/credito/descaracterizacao', {
                contratosOriginais: [
                  {
                    numero: 'CONTRATO-ORIG',
                    finalidade: 'custeio',
                    valorOriginal: Number(valorOrig),
                    taxaAA: Number(taxaOrig),
                    dataContratacao: new Date().toISOString().slice(0, 10),
                  },
                ],
                contratoRenegociacao: {
                  numero: 'CONTRATO-RENEG',
                  finalidadeInformada: finalidade,
                  valor: Number(valorReneg),
                  taxaAA: Number(taxaReneg),
                  cet: Number(cetReneg),
                  dataRenegociacao: new Date().toISOString().slice(0, 10),
                },
              })
              if (r) setResult(r)
            }}
            className="grid grid-cols-2 lg:grid-cols-3 gap-3"
          >
            <Input label="Valor original custeio" value={valorOrig} onChange={setValorOrig} suffix="R$" />
            <Input label="Taxa original" value={taxaOrig} onChange={setTaxaOrig} suffix="% a.a." />
            <Input label="Valor renegociacao" value={valorReneg} onChange={setValorReneg} suffix="R$" />
            <Input label="Taxa renegociada" value={taxaReneg} onChange={setTaxaReneg} suffix="% a.a." />
            <Input label="CET atual" value={cetReneg} onChange={setCetReneg} suffix="% a.a." />
            <Select
              label="Finalidade informada"
              value={finalidade}
              onChange={setFinalidade}
              options={[
                { value: 'pessoal', label: 'Credito pessoal' },
                { value: 'capital_giro', label: 'Capital de giro' },
                { value: 'consolidacao', label: 'Consolidacao de dividas' },
                { value: 'custeio', label: 'Custeio rural' },
              ]}
            />
            <div className="col-span-2 lg:col-span-3">
              <RunButton loading={loading} label="Detectar descaracterizacao" />
            </div>
          </form>

          {result && (
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric
                label="Descaracterizacao"
                value={result.houveDescaracterizacao ? 'SIM' : 'NAO'}
                variant={result.houveDescaracterizacao ? 'alert' : 'positive'}
              />
              <Metric label="Spread cobrado" value={fmtPct(result.spreadCobrado)} variant="alert" />
              <Metric label="Excesso sobre original" value={fmtPct(result.excessoSobreOriginal)} variant="gold" />
              <Metric
                label="Restituicao estimada"
                value={fmtBRL(result.valorRestituicaoEstimada)}
                variant="positive"
              />
              {result.indicios.length > 0 && (
                <div className="col-span-2 lg:col-span-4 rounded-lg bg-alerta/5 border border-alerta/20 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-alerta mb-1">Indicios detectados</p>
                  <ul className="text-xs font-body text-aletis-grafite-escuro list-disc list-inside space-y-0.5">
                    {result.indicios.map((i, idx) => <li key={idx}>{i}</li>)}
                  </ul>
                </div>
              )}
              {result.basesLegais.length > 0 && (
                <div className="col-span-2 lg:col-span-4 rounded-lg bg-aletis-verde/5 border border-aletis-verde/20 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-aletis-verde mb-1">Bases legais</p>
                  <ul className="text-xs font-body text-aletis-grafite-escuro list-disc list-inside space-y-0.5">
                    {result.basesLegais.map((b, idx) => <li key={idx}>{b}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </PremiumCalculatorCard>
  )
}

// ════════════════════════════════════════════════════════════
// 3. Capitalizacao de Despesas
// ════════════════════════════════════════════════════════════
type CapResult = {
  valorRecebidoPeloCliente: number
  totalDespesas: number
  percentualDespesas: number
  multiplicadorFinal: number
  impactoTotalNoSaldo: number
  economiaSeExcluirDespesas: number
  abusividadeDetectada: boolean
  fundamentosContestacao: string[]
  recomendacaoAletis: string
}

function CardCapitalizacao() {
  const [valor, setValor] = useState('300000')
  const [iof, setIof] = useState('8500')
  const [seguro, setSeguro] = useState('12000')
  const [cartorio, setCartorio] = useState('2500')
  const [estrutura, setEstrutura] = useState('6000')
  const [avaliacao, setAvaliacao] = useState('3500')
  const [taxaMensal, setTaxaMensal] = useState('1.2')
  const [prazo, setPrazo] = useState('60')
  const [result, setResult] = useState<CapResult | null>(null)

  return (
    <PremiumCalculatorCard
      icon={Layers}
      title="Capitalizacao de Despesas"
      subtitle="Detecta abuso quando IOF, seguro, tarifas inflam saldo. Multiplicador e CDC art. 51."
      badge="REVISIONAL"
    >
      {({ loading, execute }) => (
        <>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const r = await execute<CapResult>('/credito/capitalizacao-despesas', {
                valorSolicitado: Number(valor),
                despesasCapitalizadas: {
                  iof: Number(iof),
                  seguroPrestamista: Number(seguro),
                  cartorio: Number(cartorio),
                  tarifaEstruturacao: Number(estrutura),
                  tarifaAvaliacaoGarantia: Number(avaliacao),
                },
                taxaContratualMensal: Number(taxaMensal),
                prazoMeses: Number(prazo),
              })
              if (r) setResult(r)
            }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <Input label="Valor solicitado" value={valor} onChange={setValor} suffix="R$" />
            <Input label="IOF" value={iof} onChange={setIof} suffix="R$" />
            <Input label="Seguro prestamista" value={seguro} onChange={setSeguro} suffix="R$" />
            <Input label="Cartorio" value={cartorio} onChange={setCartorio} suffix="R$" />
            <Input label="Tarifa estruturacao" value={estrutura} onChange={setEstrutura} suffix="R$" />
            <Input label="Avaliacao garantia" value={avaliacao} onChange={setAvaliacao} suffix="R$" />
            <Input label="Taxa mensal" value={taxaMensal} onChange={setTaxaMensal} suffix="% a.m." />
            <Input label="Prazo" value={prazo} onChange={setPrazo} suffix="meses" />
            <div className="col-span-2 lg:col-span-4">
              <RunButton loading={loading} label="Analisar capitalizacao" />
            </div>
          </form>

          {result && (
            <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric
                label="Abusividade"
                value={result.abusividadeDetectada ? 'DETECTADA' : 'NAO'}
                variant={result.abusividadeDetectada ? 'alert' : 'positive'}
              />
              <Metric label="Multiplicador" value={`${fmtNum(result.multiplicadorFinal)}x`} variant="gold" />
              <Metric label="% despesas" value={fmtPct(result.percentualDespesas)} variant="gold" />
              <Metric
                label="Economia se excluir"
                value={fmtBRL(result.economiaSeExcluirDespesas)}
                variant="positive"
              />
              <Metric
                label="Valor recebido efetivo"
                value={fmtBRL(result.valorRecebidoPeloCliente)}
              />
              <Metric
                label="Total despesas"
                value={fmtBRL(result.totalDespesas)}
                variant="alert"
              />
              <Metric
                label="Impacto total no saldo"
                value={fmtBRL(result.impactoTotalNoSaldo)}
                variant="alert"
              />
              {result.fundamentosContestacao.length > 0 && (
                <div className="col-span-2 lg:col-span-4 rounded-lg bg-aletis-verde/5 border border-aletis-verde/20 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-aletis-verde mb-1">Fundamentos para contestacao</p>
                  <ul className="text-xs font-body text-aletis-grafite-escuro list-disc list-inside space-y-0.5">
                    {result.fundamentosContestacao.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
              <div className="col-span-2 lg:col-span-4 rounded-lg bg-aletis-dourado/5 border border-aletis-dourado/20 p-3">
                <p className="text-[10px] uppercase tracking-wide text-aletis-dourado-escuro mb-1">Recomendacao ALETIS</p>
                <p className="text-xs font-body text-aletis-grafite-escuro">{result.recomendacaoAletis}</p>
              </div>
            </div>
          )}
        </>
      )}
    </PremiumCalculatorCard>
  )
}

// ════════════════════════════════════════════════════════════
// 4. Parcelamento por Safra
// ════════════════════════════════════════════════════════════
type ParcResult = {
  valorEntrada: number
  saldoAposEntrada: number
  parcelas: Array<{
    safra: string
    numero: number
    dataPagamento: string
    juros: number
    amortizacao: number
    valorTotal: number
    saldoRemanescente: number
  }>
  totalPago: number
  totalJuros: number
  economiaVsConvencional: number
  fundamentacao: string
}

function CardParcelamentoSafra() {
  const [saldo, setSaldo] = useState('277380')
  const [taxa, setTaxa] = useState('14')
  const [safras, setSafras] = useState('4')
  const [entrada, setEntrada] = useState('21.63')
  const [inicio, setInicio] = useState('2026-07-01')
  const [mes, setMes] = useState('4')
  const [result, setResult] = useState<ParcResult | null>(null)

  return (
    <PremiumCalculatorCard
      icon={CalendarClock}
      title="Parcelamento por Safra"
      subtitle="Estrutura similar ao caso Paulo Luciano: entrada + N safras alinhadas a colheita."
      badge="CASO REAL"
    >
      {({ loading, execute }) => (
        <>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const r = await execute<ParcResult>('/credito/parcelamento-safra', {
                saldoDevedor: Number(saldo),
                taxaAA: Number(taxa),
                numeroSafras: Number(safras),
                dataInicioSafra: inicio,
                mesColheita: Number(mes),
                percentualEntrada: Number(entrada),
              })
              if (r) setResult(r)
            }}
            className="grid grid-cols-2 lg:grid-cols-3 gap-3"
          >
            <Input label="Saldo devedor" value={saldo} onChange={setSaldo} suffix="R$" />
            <Input label="Taxa" value={taxa} onChange={setTaxa} suffix="% a.a." />
            <Input label="Numero de safras" value={safras} onChange={setSafras} suffix="safras" />
            <Input label="% entrada" value={entrada} onChange={setEntrada} suffix="%" />
            <Input label="Inicio da safra" value={inicio} onChange={setInicio} type="date" />
            <Input label="Mes da colheita" value={mes} onChange={setMes} suffix="1-12" />
            <div className="col-span-2 lg:col-span-3">
              <RunButton loading={loading} label="Simular parcelamento" />
            </div>
          </form>

          {result && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Metric label="Entrada" value={fmtBRL(result.valorEntrada)} variant="gold" />
                <Metric label="Saldo apos entrada" value={fmtBRL(result.saldoAposEntrada)} />
                <Metric label="Total pago" value={fmtBRL(result.totalPago)} />
                <Metric label="Economia" value={fmtBRL(result.economiaVsConvencional)} variant="positive" />
              </div>
              <div className="rounded-lg bg-aletis-bege p-3 border border-aletis-grafite-claro/10 overflow-x-auto">
                <p className="text-[10px] uppercase tracking-wide text-aletis-grafite-claro mb-2">Cronograma de parcelas</p>
                <table className="w-full text-xs font-body">
                  <thead>
                    <tr className="text-aletis-grafite-claro">
                      <th className="text-left py-1">Safra</th>
                      <th className="text-left py-1">Data</th>
                      <th className="text-right py-1">Amortizacao</th>
                      <th className="text-right py-1">Juros</th>
                      <th className="text-right py-1">Total</th>
                      <th className="text-right py-1">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.parcelas.map((p, i) => (
                      <tr key={i} className="border-t border-aletis-grafite-claro/10">
                        <td className="py-1">{p.safra}</td>
                        <td className="py-1">{p.dataPagamento}</td>
                        <td className="text-right py-1">{fmtBRL(p.amortizacao)}</td>
                        <td className="text-right py-1">{fmtBRL(p.juros)}</td>
                        <td className="text-right py-1 font-semibold">{fmtBRL(p.valorTotal)}</td>
                        <td className="text-right py-1 text-aletis-grafite-claro">{fmtBRL(p.saldoRemanescente)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg bg-aletis-verde/5 border border-aletis-verde/20 p-3">
                <p className="text-[10px] uppercase tracking-wide text-aletis-verde mb-1">Fundamentacao</p>
                <p className="text-xs font-body text-aletis-grafite-escuro">{result.fundamentacao}</p>
              </div>
            </div>
          )}
        </>
      )}
    </PremiumCalculatorCard>
  )
}

// ════════════════════════════════════════════════════════════
// 5. Stress Test de Preco
// ════════════════════════════════════════════════════════════
type StressResult = {
  cenarios: Array<{
    queda: number
    precoStress: number
    receita: number
    margem: number
    saldoAposDividas: number
    statusDivida: 'QUITA' | 'PARCIAL' | 'INVIAVEL'
    gapDivida: number
  }>
  precoBreakEvenPara: { custeio: number; divida: number }
  recomendacao: string
}

function CardStressTest() {
  const [producao, setProducao] = useState('11000')
  const [preco, setPreco] = useState('120')
  const [custo, setCusto] = useState('1440000')
  const [divida, setDivida] = useState('277380')
  const [result, setResult] = useState<StressResult | null>(null)

  return (
    <PremiumCalculatorCard
      icon={Gauge}
      title="Stress Test de Preco"
      subtitle="Testa quedas de 10-50% na commodity. Identifica breakeven de custeio e divida."
      badge="RISCO"
    >
      {({ loading, execute }) => (
        <>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const r = await execute<StressResult>('/credito/stress-test-preco', {
                producaoSacas: Number(producao),
                precoBaseHoje: Number(preco),
                custoTotal: Number(custo),
                dividaAtual: Number(divida),
              })
              if (r) setResult(r)
            }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <Input label="Producao" value={producao} onChange={setProducao} suffix="sacas" />
            <Input label="Preco base" value={preco} onChange={setPreco} suffix="R$/saca" />
            <Input label="Custo total" value={custo} onChange={setCusto} suffix="R$" />
            <Input label="Divida atual" value={divida} onChange={setDivida} suffix="R$" />
            <div className="col-span-2 lg:col-span-4">
              <RunButton loading={loading} label="Executar stress test" />
            </div>
          </form>

          {result && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Metric
                  label="Preco breakeven custeio"
                  value={fmtBRL(result.precoBreakEvenPara.custeio) + '/saca'}
                  variant="gold"
                />
                <Metric
                  label="Preco breakeven divida"
                  value={fmtBRL(result.precoBreakEvenPara.divida) + '/saca'}
                  variant="gold"
                />
              </div>
              <div className="rounded-lg bg-aletis-bege p-3 border border-aletis-grafite-claro/10 overflow-x-auto">
                <table className="w-full text-xs font-body">
                  <thead>
                    <tr className="text-aletis-grafite-claro">
                      <th className="text-left py-1">Queda</th>
                      <th className="text-right py-1">Preco stress</th>
                      <th className="text-right py-1">Receita</th>
                      <th className="text-right py-1">Margem</th>
                      <th className="text-right py-1">Saldo p/divida</th>
                      <th className="text-center py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.cenarios.map((c, i) => {
                      const color = c.statusDivida === 'QUITA' ? 'text-positivo' :
                                    c.statusDivida === 'PARCIAL' ? 'text-aletis-dourado-escuro' : 'text-alerta'
                      return (
                        <tr key={i} className="border-t border-aletis-grafite-claro/10">
                          <td className="py-1">-{c.queda}%</td>
                          <td className="text-right py-1">{fmtBRL(c.precoStress)}</td>
                          <td className="text-right py-1">{fmtBRL(c.receita)}</td>
                          <td className="text-right py-1">{fmtBRL(c.margem)}</td>
                          <td className="text-right py-1">{fmtBRL(c.saldoAposDividas)}</td>
                          <td className={`text-center py-1 font-semibold ${color}`}>{c.statusDivida}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg bg-aletis-verde/5 border border-aletis-verde/20 p-3">
                <p className="text-[10px] uppercase tracking-wide text-aletis-verde mb-1">Recomendacao</p>
                <p className="text-xs font-body text-aletis-grafite-escuro">{result.recomendacao}</p>
              </div>
            </div>
          )}
        </>
      )}
    </PremiumCalculatorCard>
  )
}

// ════════════════════════════════════════════════════════════
// 6. Multi-Credor
// ════════════════════════════════════════════════════════════
type MultiResult = {
  totalDivida: number
  custoAnualTotal: number
  prioridadeRenegociacao: Array<{
    credor: string
    score: number
    justificativa: string
    valorEconomiaPotencial: number
    estrategiaSugerida: string
  }>
  planoSugerido: string
}

type CredorRow = {
  nome: string
  tipo: 'bancario' | 'cooperativa' | 'insumos' | 'tradings' | 'particular'
  saldoDevedor: string
  taxaAA: string
  garantia: 'real' | 'fiduciaria' | 'pessoal' | 'sem_garantia'
}

function CardMultiCredor() {
  const [credores, setCredores] = useState<CredorRow[]>([
    { nome: 'Sicoob', tipo: 'cooperativa', saldoDevedor: '2148495', taxaAA: '16.5', garantia: 'real' },
    { nome: 'Fertiflora', tipo: 'insumos', saldoDevedor: '277380', taxaAA: '14', garantia: 'pessoal' },
  ])
  const [capacidade, setCapacidade] = useState('800000')
  const [result, setResult] = useState<MultiResult | null>(null)

  return (
    <PremiumCalculatorCard
      icon={Users}
      title="Comparador Multi-Credor"
      subtitle="Score de prioridade waterfall. Estrategia por credor, economia potencial."
      badge="ESTRATEGIA"
    >
      {({ loading, execute }) => (
        <>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const r = await execute<MultiResult>('/credito/multi-credor', {
                credores: credores.map(c => ({
                  nome: c.nome,
                  tipo: c.tipo,
                  saldoDevedor: Number(c.saldoDevedor),
                  taxaAA: Number(c.taxaAA),
                  garantia: c.garantia,
                })),
                capacidadePagamentoAnual: Number(capacidade),
              })
              if (r) setResult(r)
            }}
            className="space-y-3"
          >
            <Input label="Capacidade pagamento anual" value={capacidade} onChange={setCapacidade} suffix="R$/ano" />
            <div className="space-y-2">
              {credores.map((c, i) => (
                <div key={i} className="grid grid-cols-2 lg:grid-cols-5 gap-2 items-end">
                  <Input
                    label="Credor"
                    value={c.nome}
                    onChange={v => setCredores(cs => cs.map((x, j) => j === i ? { ...x, nome: v } : x))}
                  />
                  <Select
                    label="Tipo"
                    value={c.tipo}
                    onChange={v => setCredores(cs => cs.map((x, j) => j === i ? { ...x, tipo: v as CredorRow['tipo'] } : x))}
                    options={[
                      { value: 'bancario', label: 'Banco' },
                      { value: 'cooperativa', label: 'Cooperativa' },
                      { value: 'insumos', label: 'Insumos' },
                      { value: 'tradings', label: 'Trading' },
                      { value: 'particular', label: 'Particular' },
                    ]}
                  />
                  <Input
                    label="Saldo"
                    value={c.saldoDevedor}
                    onChange={v => setCredores(cs => cs.map((x, j) => j === i ? { ...x, saldoDevedor: v } : x))}
                    suffix="R$"
                  />
                  <Input
                    label="Taxa"
                    value={c.taxaAA}
                    onChange={v => setCredores(cs => cs.map((x, j) => j === i ? { ...x, taxaAA: v } : x))}
                    suffix="% a.a."
                  />
                  <Select
                    label="Garantia"
                    value={c.garantia}
                    onChange={v => setCredores(cs => cs.map((x, j) => j === i ? { ...x, garantia: v as CredorRow['garantia'] } : x))}
                    options={[
                      { value: 'real', label: 'Real' },
                      { value: 'fiduciaria', label: 'Fiduciaria' },
                      { value: 'pessoal', label: 'Pessoal' },
                      { value: 'sem_garantia', label: 'Sem garantia' },
                    ]}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCredores(cs => [...cs, {
                  nome: '', tipo: 'bancario', saldoDevedor: '0', taxaAA: '14', garantia: 'pessoal',
                }])}
                className="text-xs font-body text-aletis-verde hover:underline"
              >
                + Adicionar credor
              </button>
              {credores.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCredores(cs => cs.slice(0, -1))}
                  className="text-xs font-body text-alerta hover:underline"
                >
                  - Remover ultimo
                </button>
              )}
            </div>
            <RunButton loading={loading} label="Calcular prioridade" />
          </form>

          {result && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Divida total" value={fmtBRL(result.totalDivida)} variant="gold" />
                <Metric label="Custo anual" value={fmtBRL(result.custoAnualTotal)} variant="alert" />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-aletis-grafite-claro">Prioridade de renegociacao</p>
                {result.prioridadeRenegociacao.map((p, i) => (
                  <div key={i} className="rounded-lg bg-aletis-bege p-3 border border-aletis-grafite-claro/10">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-aletis-dourado text-white flex items-center justify-center text-xs font-bold">
                            {i + 1}
                          </span>
                          <span className="font-display font-semibold text-aletis-grafite-escuro">{p.credor}</span>
                          <span className="text-[10px] font-body text-aletis-grafite-claro">score: {fmtNum(p.score, 0)}</span>
                        </div>
                        <p className="text-xs font-body text-aletis-grafite-medio mt-1">{p.justificativa}</p>
                        <p className="text-xs font-body text-aletis-verde mt-1">Estrategia: {p.estrategiaSugerida}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-aletis-grafite-claro">Economia potencial</p>
                        <p className="text-sm font-display font-bold text-positivo">{fmtBRL(p.valorEconomiaPotencial)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-lg bg-aletis-verde/5 border border-aletis-verde/20 p-3">
                <p className="text-[10px] uppercase tracking-wide text-aletis-verde mb-1">Plano sugerido</p>
                <p className="text-xs font-body text-aletis-grafite-escuro">{result.planoSugerido}</p>
              </div>
            </div>
          )}
        </>
      )}
    </PremiumCalculatorCard>
  )
}

// ════════════════════════════════════════════════════════════
// 7. Enquadramento Pronaf
// ════════════════════════════════════════════════════════════
type EnquadramentoResult = {
  programaSugerido: string
  taxaSugeridaAA: number
  limiteSugerido: number
  requisitos: string[]
  documentacaoNecessaria: string[]
  proximosPassos: string[]
}

function CardEnquadramento() {
  const [renda, setRenda] = useState('500000')
  const [area, setArea] = useState('200')
  const [atividade, setAtividade] = useState('soja')
  const [possuiCaf, setPossuiCaf] = useState(true)
  const [possuiDap, setPossuiDap] = useState(false)
  const [result, setResult] = useState<EnquadramentoResult | null>(null)

  return (
    <PremiumCalculatorCard
      icon={CheckCircle}
      title="Enquadramento Pronaf / Pronamp / Empresarial"
      subtitle="Identifica o programa correto e taxa subsidiada elegivel. Plano Safra 2025/26."
      badge="SUBSIDIO"
    >
      {({ loading, execute }) => (
        <>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const r = await execute<EnquadramentoResult>('/credito/enquadramento-pronaf', {
                rendaBrutaAnual: Number(renda),
                possuiCaf,
                possuiDap,
                areaHa: Number(area),
                atividadePrincipal: atividade,
              })
              if (r) setResult(r)
            }}
            className="grid grid-cols-2 lg:grid-cols-3 gap-3"
          >
            <Input label="Renda bruta anual" value={renda} onChange={setRenda} suffix="R$" />
            <Input label="Area explorada" value={area} onChange={setArea} suffix="ha" />
            <Input label="Atividade principal" value={atividade} onChange={setAtividade} />
            <label className="flex items-center gap-2 text-xs font-body text-aletis-grafite-medio">
              <input type="checkbox" checked={possuiCaf} onChange={e => setPossuiCaf(e.target.checked)} />
              Possui CAF
            </label>
            <label className="flex items-center gap-2 text-xs font-body text-aletis-grafite-medio">
              <input type="checkbox" checked={possuiDap} onChange={e => setPossuiDap(e.target.checked)} />
              Possui DAP
            </label>
            <div className="col-span-2 lg:col-span-3">
              <RunButton loading={loading} label="Enquadrar produtor" />
            </div>
          </form>

          {result && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Metric label="Programa" value={result.programaSugerido} variant="positive" />
                <Metric label="Taxa elegivel" value={fmtPct(result.taxaSugeridaAA)} variant="gold" />
                <Metric label="Limite" value={fmtBRL(result.limiteSugerido)} variant="gold" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-lg bg-aletis-bege p-3 border border-aletis-grafite-claro/10">
                  <p className="text-[10px] uppercase tracking-wide text-aletis-grafite-claro mb-1">Requisitos</p>
                  <ul className="text-xs font-body text-aletis-grafite-escuro list-disc list-inside space-y-0.5">
                    {result.requisitos.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
                <div className="rounded-lg bg-aletis-bege p-3 border border-aletis-grafite-claro/10">
                  <p className="text-[10px] uppercase tracking-wide text-aletis-grafite-claro mb-1">Documentacao</p>
                  <ul className="text-xs font-body text-aletis-grafite-escuro list-disc list-inside space-y-0.5">
                    {result.documentacaoNecessaria.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
                <div className="rounded-lg bg-aletis-verde/5 border border-aletis-verde/20 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-aletis-verde mb-1">Proximos passos</p>
                  <ul className="text-xs font-body text-aletis-grafite-escuro list-disc list-inside space-y-0.5">
                    {result.proximosPassos.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </PremiumCalculatorCard>
  )
}

// ════════════════════════════════════════════════════════════
// 8. Dacao em Pagamento
// ════════════════════════════════════════════════════════════
type DacaoResult = {
  valorAvaliacaoBem: number
  desagioAplicado: number
  valorAceito: number
  custosTransferencia: number
  economiaFinanceira: number
  prazoEstimadoConclusao: string
  viabilidadeJuridica: 'alta' | 'media' | 'baixa'
  requisitos: string[]
  fundamentacao: string
}

function CardDacao() {
  const [divida, setDivida] = useState('521285')
  const [valorBem, setValorBem] = useState('521285')
  const [tipo, setTipo] = useState<'imovel_rural' | 'imovel_urbano' | 'maquinario' | 'semovente' | 'cota_cooperativa'>('imovel_rural')
  const [liquidez, setLiquidez] = useState<'alta' | 'media' | 'baixa'>('alta')
  const [aceitaDacao, setAceitaDacao] = useState(true)
  const [result, setResult] = useState<DacaoResult | null>(null)

  return (
    <PremiumCalculatorCard
      icon={HandCoins}
      title="Dacao em Pagamento"
      subtitle="Quita divida transferindo bem (matricula, maquina, semoventes). Art. 356-359 CC."
      badge="CASO REAL"
    >
      {({ loading, execute }) => (
        <>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const r = await execute<DacaoResult>('/credito/dacao-pagamento', {
                dividaAtual: Number(divida),
                bem: {
                  tipo,
                  valorAvaliacao: Number(valorBem),
                  liquidezDeMercado: liquidez,
                },
                credorAceitaDacao: aceitaDacao,
              })
              if (r) setResult(r)
            }}
            className="grid grid-cols-2 lg:grid-cols-3 gap-3"
          >
            <Input label="Divida atual" value={divida} onChange={setDivida} suffix="R$" />
            <Input label="Valor avaliacao bem" value={valorBem} onChange={setValorBem} suffix="R$" />
            <Select
              label="Tipo do bem"
              value={tipo}
              onChange={v => setTipo(v as typeof tipo)}
              options={[
                { value: 'imovel_rural', label: 'Imovel rural' },
                { value: 'imovel_urbano', label: 'Imovel urbano' },
                { value: 'maquinario', label: 'Maquinario' },
                { value: 'semovente', label: 'Semovente' },
                { value: 'cota_cooperativa', label: 'Cota cooperativa' },
              ]}
            />
            <Select
              label="Liquidez de mercado"
              value={liquidez}
              onChange={v => setLiquidez(v as typeof liquidez)}
              options={[
                { value: 'alta', label: 'Alta' },
                { value: 'media', label: 'Media' },
                { value: 'baixa', label: 'Baixa' },
              ]}
            />
            <label className="flex items-center gap-2 text-xs font-body text-aletis-grafite-medio col-span-2 lg:col-span-1">
              <input type="checkbox" checked={aceitaDacao} onChange={e => setAceitaDacao(e.target.checked)} />
              Credor sinalizou abertura
            </label>
            <div className="col-span-2 lg:col-span-3">
              <RunButton loading={loading} label="Simular dacao" />
            </div>
          </form>

          {result && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Metric label="Valor aceito" value={fmtBRL(result.valorAceito)} variant="gold" />
                <Metric label="Desagio aplicado" value={fmtPct(result.desagioAplicado)} variant="alert" />
                <Metric label="Custos transferencia" value={fmtBRL(result.custosTransferencia)} />
                <Metric label="Economia financeira" value={fmtBRL(result.economiaFinanceira)} variant="positive" />
                <Metric label="Prazo conclusao" value={result.prazoEstimadoConclusao} />
                <Metric
                  label="Viabilidade juridica"
                  value={result.viabilidadeJuridica.toUpperCase()}
                  variant={result.viabilidadeJuridica === 'alta' ? 'positive' : result.viabilidadeJuridica === 'media' ? 'gold' : 'alert'}
                />
              </div>
              {result.requisitos.length > 0 && (
                <div className="rounded-lg bg-aletis-bege p-3 border border-aletis-grafite-claro/10">
                  <p className="text-[10px] uppercase tracking-wide text-aletis-grafite-claro mb-1">Requisitos</p>
                  <ul className="text-xs font-body text-aletis-grafite-escuro list-disc list-inside space-y-0.5">
                    {result.requisitos.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              <div className="rounded-lg bg-aletis-verde/5 border border-aletis-verde/20 p-3">
                <p className="text-[10px] uppercase tracking-wide text-aletis-verde mb-1">Fundamentacao</p>
                <p className="text-xs font-body text-aletis-grafite-escuro">{result.fundamentacao}</p>
              </div>
            </div>
          )}
        </>
      )}
    </PremiumCalculatorCard>
  )
}

// ════════════════════════════════════════════════════════════
// MAIN — Premium section container
// ════════════════════════════════════════════════════════════
export default function CreditoPremium() {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
            Calculadoras Premium
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro mt-0.5">
            Analises avancadas para reestruturacao com base em MCR, Sumulas STJ e Plano Safra 2025/26
          </p>
        </div>
        <div className="text-[11px] font-body text-aletis-grafite-claro hidden sm:block">
          8 calculadoras juridico-financeiras
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <CardAlongamento />
        <CardDescaracterizacao />
        <CardCapitalizacao />
        <CardParcelamentoSafra />
        <CardStressTest />
        <CardMultiCredor />
        <CardEnquadramento />
        <CardDacao />
      </div>
    </section>
  )
}
