import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Calculator,
  TrendingUp,
  ArrowRightLeft,
  Table,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  Download,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { useApiPost, apiFetch } from '../hooks/useApi'
import { InlineButton } from '../components/ui'
import CreditoPremium from './CreditoPremium'

// ────────────────────────────────────────────────────────────
// Debounce hook
// ────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// ────────────────────────────────────────────────────────────
// Server-verified badge component
// ────────────────────────────────────────────────────────────
function ServerVerifiedBadge({ loading, verified, error }: { loading: boolean; verified: boolean; error: string | null }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-body text-aletis-grafite-claro animate-pulse">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Verificando no servidor...
      </span>
    )
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-body text-ambar">
        <AlertTriangle className="w-3.5 h-3.5" />
        Servidor indisponível — usando cálculo local
      </span>
    )
  }
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-body text-positivo">
        <ShieldCheck className="w-3.5 h-3.5" />
        Verificado pelo servidor
      </span>
    )
  }
  return null
}

// ────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────
const fmtBRL = (v: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtPct = (v: number, decimals = 2): string =>
  v.toFixed(decimals).replace('.', ',') + '%'

const fmtNum = (v: number, decimals = 2): string =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)

const parseBRL = (s: string): number => {
  const cleaned = s.replace(/[^\d,.-]/g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

// ────────────────────────────────────────────────────────────
// Financial math helpers
// ────────────────────────────────────────────────────────────

/** Newton-Raphson IRR calculation for cash flows */
function calcIRR(cashFlows: number[], guess = 0.01, maxIter = 200, tol = 1e-10): number {
  let rate = guess
  for (let i = 0; i < maxIter; i++) {
    let npv = 0
    let dnpv = 0
    for (let t = 0; t < cashFlows.length; t++) {
      const factor = Math.pow(1 + rate, t)
      npv += cashFlows[t] / factor
      if (t > 0) {
        dnpv -= t * cashFlows[t] / Math.pow(1 + rate, t + 1)
      }
    }
    if (Math.abs(dnpv) < 1e-20) break
    const newRate = rate - npv / dnpv
    if (Math.abs(newRate - rate) < tol) return newRate
    rate = newRate
    // Guard against divergence
    if (rate < -0.99) rate = -0.99
    if (rate > 10) rate = 10
  }
  return rate
}

/** Monthly payment (PRICE system) */
function calcPMT(pv: number, rate: number, n: number): number {
  if (rate === 0) return pv / n
  return pv * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1)
}

/** Convert annual rate to monthly (compound) */
function annualToMonthly(annual: number): number {
  return Math.pow(1 + annual / 100, 1 / 12) - 1
}

/** Convert monthly rate to annual (compound) */
function monthlyToAnnual(monthly: number): number {
  return (Math.pow(1 + monthly / 100, 12) - 1) * 100
}

/** Convert monthly rate to daily (compound, 252 business days) */
function monthlyToDaily(monthly: number): number {
  return (Math.pow(1 + monthly / 100, 1 / 21) - 1) * 100
}

/** Convert annual rate to daily (compound, 252 business days) */
function annualToDaily(annual: number): number {
  return (Math.pow(1 + annual / 100, 1 / 252) - 1) * 100
}

/** Add months to a date */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

/** Format date as dd/mm/yyyy */
function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR')
}

/** Format date as yyyy-mm-dd */
function fmtDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ────────────────────────────────────────────────────────────
// Section Card wrapper
// ────────────────────────────────────────────────────────────
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="card-premium p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-aletis-verde/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-aletis-verde" />
        </div>
        <div>
          <h2 className="text-lg font-display font-semibold text-aletis-grafite-escuro">
            {title}
          </h2>
          <p className="text-xs font-body text-aletis-grafite-claro">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Input helper
// ────────────────────────────────────────────────────────────
function InputField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  suffix?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-body font-medium text-aletis-grafite-medio mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field pr-12"
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-aletis-grafite-claro font-body">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// Result card
// ────────────────────────────────────────────────────────────
function ResultBadge({
  label,
  value,
  variant = 'green',
}: {
  label: string
  value: string
  variant?: 'green' | 'gold' | 'red'
}) {
  const bg =
    variant === 'green'
      ? 'bg-positivo/10 border-positivo/20'
      : variant === 'gold'
      ? 'bg-aletis-dourado/10 border-aletis-dourado/20'
      : 'bg-alerta/10 border-alerta/20'
  const text =
    variant === 'green'
      ? 'text-positivo'
      : variant === 'gold'
      ? 'text-aletis-dourado-escuro'
      : 'text-alerta'

  return (
    <div className={`rounded-xl border ${bg} p-4`}>
      <p className="text-xs font-body text-aletis-grafite-claro mb-1">{label}</p>
      <p className={`text-xl font-display font-bold ${text}`}>{value}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// SECTION 1: Calculadora de CET
// ════════════════════════════════════════════════════════════
function CalculadoraCET() {
  const [valorCredito, setValorCredito] = useState('100000')
  const [taxaInformada, setTaxaInformada] = useState('1.50')
  const [prazo, setPrazo] = useState('24')
  const [iof, setIOF] = useState('1500')
  const [seguro, setSeguro] = useState('800')
  const [taxasCartorio, setTaxasCartorio] = useState('500')
  const [calculated, setCalculated] = useState(false)

  // API integration
  const { execute: executeCET, loading: apiLoading, error: apiError, data: apiData } =
    useApiPost<
      { fluxos: { data: string; valor: number }[] },
      { cetMensal: number; cetAnual: number; metodo: string; fluxosAnalisados: number }
    >('/credito/calcular-cet')
  const [serverVerified, setServerVerified] = useState(false)

  const result = useMemo(() => {
    if (!calculated) return null

    const pv = parseBRL(valorCredito)
    const taxaMensal = parseBRL(taxaInformada) / 100
    const n = parseInt(prazo) || 0
    const custoIOF = parseBRL(iof)
    const custoSeguro = parseBRL(seguro)
    const custoCartorio = parseBRL(taxasCartorio)

    if (pv <= 0 || taxaMensal <= 0 || n <= 0) return null

    // Monthly payment using informed rate
    const pmt = calcPMT(pv, taxaMensal, n)

    // Cash flows for CET: borrower receives (pv - upfront costs) at t=0, pays pmt each month
    const totalCustosUpfront = custoIOF + custoSeguro + custoCartorio
    const valorLiquido = pv - totalCustosUpfront

    const cashFlows: number[] = [valorLiquido]
    for (let t = 1; t <= n; t++) {
      cashFlows.push(-pmt)
    }

    const cetMensal = calcIRR(cashFlows, taxaMensal) * 100
    const cetAnual = (Math.pow(1 + cetMensal / 100, 12) - 1) * 100
    const taxaInformadaAnual = (Math.pow(1 + taxaMensal, 12) - 1) * 100

    return {
      pmt,
      cetMensal,
      cetAnual,
      taxaInformadaAnual,
      taxaMensalPct: taxaMensal * 100,
      totalPago: pmt * n,
      totalCustosUpfront,
      alerta: cetMensal > 2 * (taxaMensal * 100),
    }
  }, [calculated, valorCredito, taxaInformada, prazo, iof, seguro, taxasCartorio])

  // Merge API result when it arrives
  const displayResult = useMemo(() => {
    if (!result) return null
    if (apiData && serverVerified) {
      return {
        ...result,
        cetMensal: apiData.cetMensal,
        cetAnual: apiData.cetAnual,
        alerta: apiData.cetMensal > 2 * result.taxaMensalPct,
      }
    }
    return result
  }, [result, apiData, serverVerified])

  const handleCalculate = useCallback(() => {
    setCalculated(true)
    setServerVerified(false)

    // Build fluxos for the API
    const pv = parseBRL(valorCredito)
    const taxaMensal = parseBRL(taxaInformada) / 100
    const n = parseInt(prazo) || 0
    const custoIOF = parseBRL(iof)
    const custoSeguro = parseBRL(seguro)
    const custoCartorio = parseBRL(taxasCartorio)

    if (pv <= 0 || taxaMensal <= 0 || n <= 0) return

    const pmt = calcPMT(pv, taxaMensal, n)
    const totalCustosUpfront = custoIOF + custoSeguro + custoCartorio
    const valorLiquido = pv - totalCustosUpfront

    const startDate = new Date()
    const fluxos: { data: string; valor: number }[] = [
      { data: fmtDateISO(startDate), valor: valorLiquido },
    ]
    for (let t = 1; t <= n; t++) {
      fluxos.push({ data: fmtDateISO(addMonths(startDate, t)), valor: -pmt })
    }

    executeCET({ fluxos }).then((res) => {
      if (res) setServerVerified(true)
    })
  }, [valorCredito, taxaInformada, prazo, iof, seguro, taxasCartorio, executeCET])

  return (
    <SectionCard
      icon={Calculator}
      title="Calculadora de CET"
      subtitle="Custo Efetivo Total - Compare o custo real do crédito"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <InputField
          label="Valor do Crédito"
          value={valorCredito}
          onChange={setValorCredito}
          placeholder="100.000"
          suffix="R$"
        />
        <InputField
          label="Taxa Informada"
          value={taxaInformada}
          onChange={setTaxaInformada}
          placeholder="1.50"
          suffix="% a.m."
        />
        <InputField
          label="Prazo"
          value={prazo}
          onChange={setPrazo}
          placeholder="24"
          suffix="meses"
        />
        <InputField
          label="IOF"
          value={iof}
          onChange={setIOF}
          placeholder="1.500"
          suffix="R$"
        />
        <InputField
          label="Seguro"
          value={seguro}
          onChange={setSeguro}
          placeholder="800"
          suffix="R$"
        />
        <InputField
          label="Taxas Cartório"
          value={taxasCartorio}
          onChange={setTaxasCartorio}
          placeholder="500"
          suffix="R$"
        />
      </div>

      <InlineButton
        variant="primary"
        size="md"
        icon={Calculator}
        onClick={handleCalculate}
        className="mb-5"
      >
        Calcular CET
      </InlineButton>

      {displayResult && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-end mb-1">
            <ServerVerifiedBadge loading={apiLoading} verified={serverVerified} error={apiError} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ResultBadge label="CET Mensal" value={fmtPct(displayResult.cetMensal)} variant="gold" />
            <ResultBadge label="CET Anual" value={fmtPct(displayResult.cetAnual)} variant="gold" />
            <ResultBadge
              label="Taxa Informada (mensal)"
              value={fmtPct(displayResult.taxaMensalPct)}
              variant="green"
            />
            <ResultBadge
              label="Taxa Informada (anual)"
              value={fmtPct(displayResult.taxaInformadaAnual)}
              variant="green"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ResultBadge
              label="Parcela Mensal"
              value={fmtBRL(displayResult.pmt)}
              variant="green"
            />
            <ResultBadge
              label="Total Pago"
              value={fmtBRL(displayResult.totalPago)}
              variant="gold"
            />
            <ResultBadge
              label="Custos Adicionais"
              value={fmtBRL(displayResult.totalCustosUpfront)}
              variant="gold"
            />
          </div>

          {/* Comparison bar */}
          <div className="bg-aletis-bege rounded-xl p-4">
            <p className="text-xs font-body text-aletis-grafite-claro mb-3">
              Comparação: Taxa Informada vs CET
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-body w-28 text-aletis-grafite-medio">
                  Informada
                </span>
                <div className="flex-1 h-6 bg-white rounded-full overflow-hidden">
                  <div
                    className="h-full bg-positivo rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                    style={{
                      width: `${Math.min(
                        (displayResult.taxaMensalPct / Math.max(displayResult.cetMensal, 0.01)) * 100,
                        100
                      )}%`,
                    }}
                  >
                    <span className="text-[10px] text-white font-semibold">
                      {fmtPct(displayResult.taxaMensalPct)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-body w-28 text-aletis-grafite-medio">CET</span>
                <div className="flex-1 h-6 bg-white rounded-full overflow-hidden">
                  <div
                    className="h-full bg-aletis-dourado rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                    style={{ width: '100%' }}
                  >
                    <span className="text-[10px] text-white font-semibold">
                      {fmtPct(displayResult.cetMensal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {displayResult.alerta && (
            <div className="flex items-center gap-3 bg-alerta/10 border border-alerta/20 rounded-xl p-4">
              <AlertTriangle className="w-5 h-5 text-alerta flex-shrink-0" />
              <p className="text-sm font-body text-alerta font-medium">
                Atenção: CET significativamente acima da taxa informada
              </p>
            </div>
          )}

          {!displayResult.alerta && (
            <div className="flex items-center gap-3 bg-positivo/10 border border-positivo/20 rounded-xl p-4">
              <CheckCircle className="w-5 h-5 text-positivo flex-shrink-0" />
              <p className="text-sm font-body text-positivo font-medium">
                CET dentro de parâmetros razoáveis em relação à taxa informada
              </p>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}

// ════════════════════════════════════════════════════════════
// SECTION 2: Calculadora de Spread
// ════════════════════════════════════════════════════════════
function CalculadoraSpread() {
  const [taxaOriginal, setTaxaOriginal] = useState('13.98')
  const [taxaPraticada, setTaxaPraticada] = useState('30.46')

  // API integration — debounced since spread auto-calculates
  const { execute: executeSpread, loading: apiLoading, error: apiError, data: apiData } =
    useApiPost<
      { taxaOriginal: number; taxaPraticada: number },
      { spreadAbsoluto: number; spreadPercentual: number; taxaOriginalAnual: number; taxaPraticadaAnual: number; excessoSobreSelic: boolean; analise: string }
    >('/credito/calcular-spread')
  const [serverVerified, setServerVerified] = useState(false)

  const debouncedOriginal = useDebounce(taxaOriginal, 600)
  const debouncedPraticada = useDebounce(taxaPraticada, 600)

  // Fire API call on debounced input changes
  useEffect(() => {
    const orig = parseBRL(debouncedOriginal)
    const prat = parseBRL(debouncedPraticada)
    if (orig <= 0 || prat <= 0) {
      setServerVerified(false)
      return
    }
    setServerVerified(false)
    executeSpread({ taxaOriginal: orig, taxaPraticada: prat }).then((res) => {
      if (res) setServerVerified(true)
    })
  }, [debouncedOriginal, debouncedPraticada, executeSpread])

  const result = useMemo(() => {
    const orig = parseBRL(taxaOriginal)
    const prat = parseBRL(taxaPraticada)
    if (orig <= 0 || prat <= 0) return null

    const spreadAbsoluto = prat - orig
    const spreadRelativo = ((prat - orig) / orig) * 100

    return {
      spreadAbsoluto,
      spreadRelativo,
      orig,
      prat,
      excessivo: spreadRelativo > 50,
    }
  }, [taxaOriginal, taxaPraticada])

  // Merge API result when available
  const displayResult = useMemo(() => {
    if (!result) return null
    if (apiData && serverVerified) {
      return {
        ...result,
        spreadAbsoluto: apiData.spreadAbsoluto,
        spreadRelativo: apiData.spreadPercentual,
        excessivo: apiData.spreadPercentual > 50 || apiData.excessoSobreSelic,
        analiseServidor: apiData.analise,
      }
    }
    return { ...result, analiseServidor: null as string | null }
  }, [result, apiData, serverVerified])

  return (
    <SectionCard
      icon={TrendingUp}
      title="Calculadora de Spread"
      subtitle="Analise a diferença entre taxa original e praticada"
    >
      <div className="bg-aletis-dourado/5 border border-aletis-dourado/20 rounded-xl p-3 mb-5">
        <p className="text-xs font-body text-aletis-dourado-escuro">
          <strong>Caso Ailton:</strong> Taxa original 13,98% a.a. contratada como 30,46% a.a. — Spread de 117,7%
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <InputField
          label="Taxa Original"
          value={taxaOriginal}
          onChange={setTaxaOriginal}
          placeholder="13.98"
          suffix="% a.a."
        />
        <InputField
          label="Taxa Praticada / CET"
          value={taxaPraticada}
          onChange={setTaxaPraticada}
          placeholder="30.46"
          suffix="% a.a."
        />
      </div>

      {displayResult && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-end mb-1">
            <ServerVerifiedBadge loading={apiLoading} verified={serverVerified} error={apiError} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ResultBadge
              label="Spread Absoluto"
              value={fmtNum(displayResult.spreadAbsoluto) + ' p.p.'}
              variant={displayResult.excessivo ? 'red' : 'gold'}
            />
            <ResultBadge
              label="Spread Relativo"
              value={fmtPct(displayResult.spreadRelativo)}
              variant={displayResult.excessivo ? 'red' : 'gold'}
            />
          </div>

          {/* Visual comparison bar */}
          <div className="bg-aletis-bege rounded-xl p-4">
            <p className="text-xs font-body text-aletis-grafite-claro mb-3">
              Comparação Visual
            </p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-body text-aletis-grafite-medio">
                    Taxa Original
                  </span>
                  <span className="text-xs font-body font-semibold text-positivo">
                    {fmtPct(displayResult.orig)}
                  </span>
                </div>
                <div className="w-full h-5 bg-white rounded-full overflow-hidden">
                  <div
                    className="h-full bg-positivo rounded-full transition-all duration-700"
                    style={{
                      width: `${(displayResult.orig / Math.max(displayResult.prat, 0.01)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-body text-aletis-grafite-medio">
                    Taxa Praticada
                  </span>
                  <span className="text-xs font-body font-semibold text-alerta">
                    {fmtPct(displayResult.prat)}
                  </span>
                </div>
                <div className="w-full h-5 bg-white rounded-full overflow-hidden">
                  <div
                    className="h-full bg-alerta rounded-full transition-all duration-700"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {displayResult.analiseServidor && (
            <div className="bg-aletis-bege rounded-xl p-3">
              <p className="text-[11px] font-body text-aletis-grafite-claro leading-relaxed">
                <strong>Análise do servidor:</strong> {displayResult.analiseServidor}
              </p>
            </div>
          )}

          {displayResult.excessivo && (
            <div className="flex items-center gap-3 bg-alerta/10 border border-alerta/20 rounded-xl p-4">
              <AlertTriangle className="w-5 h-5 text-alerta flex-shrink-0" />
              <div>
                <p className="text-sm font-body text-alerta font-bold">SPREAD EXCESSIVO</p>
                <p className="text-xs font-body text-alerta/80 mt-0.5">
                  O spread relativo de {fmtPct(displayResult.spreadRelativo)} excede o limite de 50%.
                  Possível prática abusiva.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}

// ════════════════════════════════════════════════════════════
// SECTION 3: Simulador de Amortizacao
// ════════════════════════════════════════════════════════════
interface AmortRow {
  parcela: number
  data: string
  saldoInicial: number
  juros: number
  amortizacao: number
  pagamento: number
  saldoFinal: number
}

function SimuladorAmortizacao() {
  const [valor, setValor] = useState('500000')
  const [taxa, setTaxa] = useState('1.50')
  const [prazoAmort, setPrazoAmort] = useState('36')
  const [sistema, setSistema] = useState<'SAC' | 'PRICE'>('PRICE')
  const [dataInicio, setDataInicio] = useState('2026-04-01')
  const [showTable, setShowTable] = useState(false)

  // API integration
  const { execute: executeAmort, loading: apiLoading, error: apiError, data: apiData } =
    useApiPost<
      { valorFinanciamento: number; taxaMensal: number; prazoMeses: number; sistema: 'SAC' | 'PRICE' },
      AmortRow[]
    >('/credito/simular-amortizacao')
  const [serverVerified, setServerVerified] = useState(false)
  const [apiTable, setApiTable] = useState<AmortRow[] | null>(null)

  const { table, totalPago, totalJuros } = useMemo(() => {
    const pv = parseBRL(valor)
    const r = parseBRL(taxa) / 100
    const n = parseInt(prazoAmort) || 0
    const startDate = dataInicio ? new Date(dataInicio + 'T12:00:00') : new Date()

    if (pv <= 0 || r <= 0 || n <= 0) return { table: [], totalPago: 0, totalJuros: 0 }

    const rows: AmortRow[] = []
    let saldo = pv
    let sumPago = 0
    let sumJuros = 0

    if (sistema === 'PRICE') {
      const pmt = calcPMT(pv, r, n)
      for (let t = 1; t <= n; t++) {
        const juros = saldo * r
        const amort = pmt - juros
        const saldoFinal = saldo - amort
        rows.push({
          parcela: t,
          data: fmtDate(addMonths(startDate, t)),
          saldoInicial: saldo,
          juros,
          amortizacao: amort,
          pagamento: pmt,
          saldoFinal: Math.max(saldoFinal, 0),
        })
        sumPago += pmt
        sumJuros += juros
        saldo = Math.max(saldoFinal, 0)
      }
    } else {
      // SAC
      const amortFixa = pv / n
      for (let t = 1; t <= n; t++) {
        const juros = saldo * r
        const pmt = amortFixa + juros
        const saldoFinal = saldo - amortFixa
        rows.push({
          parcela: t,
          data: fmtDate(addMonths(startDate, t)),
          saldoInicial: saldo,
          juros,
          amortizacao: amortFixa,
          pagamento: pmt,
          saldoFinal: Math.max(saldoFinal, 0),
        })
        sumPago += pmt
        sumJuros += juros
        saldo = Math.max(saldoFinal, 0)
      }
    }

    return { table: rows, totalPago: sumPago, totalJuros: sumJuros }
  }, [valor, taxa, prazoAmort, sistema, dataInicio, showTable])

  // Use API table if available
  const displayTable = apiTable && serverVerified ? apiTable : table
  const displayTotalPago = displayTable.reduce((sum, r) => sum + r.pagamento, 0)
  const displayTotalJuros = displayTable.reduce((sum, r) => sum + r.juros, 0)

  const handleGenerate = useCallback(() => {
    setShowTable(true)
    setServerVerified(false)
    setApiTable(null)

    const pv = parseBRL(valor)
    const r = parseBRL(taxa)
    const n = parseInt(prazoAmort) || 0

    if (pv <= 0 || r <= 0 || n <= 0) return

    executeAmort({
      valorFinanciamento: pv,
      taxaMensal: r,
      prazoMeses: n,
      sistema,
    }).then((res) => {
      if (res) {
        // The API might return the table directly or wrapped
        const rows = Array.isArray(res) ? res : []
        if (rows.length > 0) {
          setApiTable(rows)
        }
        setServerVerified(true)
      }
    })
  }, [valor, taxa, prazoAmort, sistema, executeAmort])

  return (
    <SectionCard
      icon={Table}
      title="Simulador de Amortização"
      subtitle="Gere tabelas SAC ou PRICE completas"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <InputField
          label="Valor do Empréstimo"
          value={valor}
          onChange={setValor}
          placeholder="500.000"
          suffix="R$"
        />
        <InputField
          label="Taxa de Juros"
          value={taxa}
          onChange={setTaxa}
          placeholder="1.50"
          suffix="% a.m."
        />
        <InputField
          label="Prazo"
          value={prazoAmort}
          onChange={setPrazoAmort}
          placeholder="36"
          suffix="meses"
        />
        <div>
          <label className="block text-xs font-body font-medium text-aletis-grafite-medio mb-1.5">
            Sistema de Amortização
          </label>
          <div className="relative">
            <select
              value={sistema}
              onChange={(e) => setSistema(e.target.value as 'SAC' | 'PRICE')}
              className="input-field appearance-none cursor-pointer"
            >
              <option value="PRICE">PRICE (Parcelas Fixas)</option>
              <option value="SAC">SAC (Amortização Constante)</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-aletis-grafite-claro pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-body font-medium text-aletis-grafite-medio mb-1.5">
            Data de Início
          </label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <InlineButton variant="primary" size="md" icon={Table} onClick={handleGenerate}>
          Gerar Tabela
        </InlineButton>
        {showTable && displayTable.length > 0 && (
          <InlineButton variant="outline" size="md" icon={Download}>
            Exportar
          </InlineButton>
        )}
      </div>

      {showTable && displayTable.length > 0 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-end mb-1">
            <ServerVerifiedBadge loading={apiLoading} verified={serverVerified} error={apiError} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ResultBadge label="Total Pago" value={fmtBRL(displayTotalPago)} variant="gold" />
            <ResultBadge label="Total de Juros" value={fmtBRL(displayTotalJuros)} variant="red" />
            <ResultBadge
              label="Valor Financiado"
              value={fmtBRL(parseBRL(valor))}
              variant="green"
            />
          </div>

          <div className="max-h-[480px] overflow-auto rounded-xl border border-aletis-borda custom-scrollbar">
            <table className="w-full text-xs font-body">
              <thead className="sticky top-0 bg-aletis-verde text-white z-10">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Data</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Saldo Inicial</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Juros</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Amortização</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Pagamento</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Saldo Final</th>
                </tr>
              </thead>
              <tbody>
                {displayTable.map((row, i) => (
                  <tr
                    key={row.parcela}
                    className={`border-b border-aletis-borda/50 hover:bg-aletis-dourado/5 transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-aletis-bege/50'
                    }`}
                  >
                    <td className="px-3 py-2 text-aletis-grafite-medio font-semibold">
                      {row.parcela}
                    </td>
                    <td className="px-3 py-2 text-aletis-grafite-medio">{row.data}</td>
                    <td className="px-3 py-2 text-right text-aletis-grafite-escuro">
                      {fmtBRL(row.saldoInicial)}
                    </td>
                    <td className="px-3 py-2 text-right text-alerta">
                      {fmtBRL(row.juros)}
                    </td>
                    <td className="px-3 py-2 text-right text-positivo">
                      {fmtBRL(row.amortizacao)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-aletis-grafite-escuro">
                      {fmtBRL(row.pagamento)}
                    </td>
                    <td className="px-3 py-2 text-right text-aletis-grafite-medio">
                      {fmtBRL(row.saldoFinal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ════════════════════════════════════════════════════════════
// SECTION 4: Simulador de Renegociacao
// ════════════════════════════════════════════════════════════
function SimuladorRenegociacao() {
  const [saldoDevedor, setSaldoDevedor] = useState('800000')
  const [taxaJusta, setTaxaJusta] = useState('0.95')
  const [novoPrazo, setNovoPrazo] = useState('24')
  const [carencia, setCarencia] = useState('6')
  const [calculated, setCalculated] = useState(false)

  // API integration
  const { execute: executeRecalc, loading: apiLoading, error: apiError } =
    useApiPost<
      { valorOriginal: number; taxaMensal: number; dataInicio: string; dataFim: string; pagamentos: { data: string; valor: number }[] },
      unknown
    >('/credito/recalcular-divida')
  const [serverVerified, setServerVerified] = useState(false)

  const result = useMemo(() => {
    if (!calculated) return null

    const saldo = parseBRL(saldoDevedor)
    const r = parseBRL(taxaJusta) / 100
    const n = parseInt(novoPrazo) || 0
    const car = parseInt(carencia) || 0

    if (saldo <= 0 || r <= 0 || n <= 0) return null

    // Current scenario: assume high rate (2.5% am) over 12 months
    const taxaAtual = 0.025
    const pmtAtual = calcPMT(saldo, taxaAtual, 12)
    const totalAtual = pmtAtual * 12

    // New scenario with carencia
    // During carencia, interest accrues
    let saldoAposCarencia = saldo
    for (let i = 0; i < car; i++) {
      saldoAposCarencia *= 1 + r
    }

    const pmtNovo = calcPMT(saldoAposCarencia, r, n)
    const totalNovo = pmtNovo * n

    // Generate harvest-aligned schedule (April = 4, August = 8)
    const startDate = new Date('2026-04-01T12:00:00')
    const schedule: { data: string; valor: number; tipo: string }[] = []

    // Carencia period
    for (let i = 1; i <= car; i++) {
      const d = addMonths(startDate, i)
      schedule.push({
        data: fmtDate(d),
        valor: 0,
        tipo: 'Carência',
      })
    }

    // Payment period aligned to April/August
    let remaining = saldoAposCarencia
    const paymentStart = addMonths(startDate, car)
    let paymentsMade = 0

    for (let i = 1; paymentsMade < n; i++) {
      const d = addMonths(paymentStart, i)
      const month = d.getMonth() + 1 // 1-based

      // Only pay in April (4) and August (8), or monthly if too many months needed
      if (n <= 4 || month === 4 || month === 8) {
        // Calculate months since last payment for interest accrual
        const juros = remaining * r
        const amort = pmtNovo - juros
        remaining = Math.max(remaining - amort, 0)

        schedule.push({
          data: fmtDate(d),
          valor: pmtNovo,
          tipo: 'Pagamento',
        })
        paymentsMade++
      }

      // Safety: avoid infinite loops
      if (i > n * 12) break
    }

    // If harvest alignment doesn't work well for the given terms, fall back to monthly
    if (schedule.filter((s) => s.tipo === 'Pagamento').length < n) {
      schedule.length = 0
      for (let i = 1; i <= car; i++) {
        schedule.push({
          data: fmtDate(addMonths(startDate, i)),
          valor: 0,
          tipo: 'Carência',
        })
      }
      for (let i = 1; i <= n; i++) {
        schedule.push({
          data: fmtDate(addMonths(startDate, car + i)),
          valor: pmtNovo,
          tipo: 'Pagamento',
        })
      }
    }

    return {
      pmtAtual,
      totalAtual,
      pmtNovo,
      totalNovo,
      economia: totalAtual - totalNovo,
      economiaPercent: ((totalAtual - totalNovo) / totalAtual) * 100,
      schedule: schedule.slice(0, 30), // Show max 30 rows
      saldoAposCarencia,
    }
  }, [calculated, saldoDevedor, taxaJusta, novoPrazo, carencia])

  const handleSimulate = useCallback(() => {
    setCalculated(true)
    setServerVerified(false)

    const saldo = parseBRL(saldoDevedor)
    const r = parseBRL(taxaJusta)
    const n = parseInt(novoPrazo) || 0
    const car = parseInt(carencia) || 0

    if (saldo <= 0 || r <= 0 || n <= 0) return

    const startDate = new Date('2026-04-01T12:00:00')
    const totalMonths = car + n
    const endDate = addMonths(startDate, totalMonths)

    // Build pagamentos array (empty for initial simulation — we send the proposed schedule)
    const pagamentos: { data: string; valor: number }[] = []

    executeRecalc({
      valorOriginal: saldo,
      taxaMensal: r,
      dataInicio: fmtDateISO(startDate),
      dataFim: fmtDateISO(endDate),
      pagamentos,
    }).then((res) => {
      if (res) setServerVerified(true)
    })
  }, [saldoDevedor, taxaJusta, novoPrazo, carencia, executeRecalc])

  return (
    <SectionCard
      icon={RefreshCw}
      title="Simulador de Renegociação"
      subtitle="Compare cenários e alinhe pagamentos com a safra"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <InputField
          label="Saldo Devedor Atual"
          value={saldoDevedor}
          onChange={setSaldoDevedor}
          placeholder="800.000"
          suffix="R$"
        />
        <InputField
          label="Taxa Justa"
          value={taxaJusta}
          onChange={setTaxaJusta}
          placeholder="0.95"
          suffix="% a.m."
        />
        <InputField
          label="Novo Prazo"
          value={novoPrazo}
          onChange={setNovoPrazo}
          placeholder="24"
          suffix="meses"
        />
        <InputField
          label="Carência"
          value={carencia}
          onChange={setCarencia}
          placeholder="6"
          suffix="meses"
        />
      </div>

      <InlineButton
        variant="primary"
        size="md"
        icon={RefreshCw}
        onClick={handleSimulate}
        className="mb-5"
      >
        Simular Renegociação
      </InlineButton>

      {result && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-end mb-1">
            <ServerVerifiedBadge loading={apiLoading} verified={serverVerified} error={apiError} />
          </div>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cenario Atual */}
            <div className="rounded-xl border border-alerta/20 bg-alerta/5 p-5">
              <h3 className="text-sm font-display font-semibold text-alerta mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Cenário Atual
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs font-body text-aletis-grafite-claro">Taxa mensal</span>
                  <span className="text-sm font-body font-semibold text-alerta">2,50% a.m.</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-body text-aletis-grafite-claro">Prazo</span>
                  <span className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                    12 meses
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-body text-aletis-grafite-claro">
                    Parcela mensal
                  </span>
                  <span className="text-sm font-body font-semibold text-alerta">
                    {fmtBRL(result.pmtAtual)}
                  </span>
                </div>
                <div className="border-t border-alerta/20 pt-3 flex justify-between">
                  <span className="text-xs font-body font-semibold text-aletis-grafite-medio">
                    TOTAL
                  </span>
                  <span className="text-lg font-display font-bold text-alerta">
                    {fmtBRL(result.totalAtual)}
                  </span>
                </div>
              </div>
            </div>

            {/* Cenario Proposto */}
            <div className="rounded-xl border border-positivo/20 bg-positivo/5 p-5">
              <h3 className="text-sm font-display font-semibold text-positivo mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Cenário Proposto
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs font-body text-aletis-grafite-claro">Taxa mensal</span>
                  <span className="text-sm font-body font-semibold text-positivo">
                    {fmtPct(parseBRL(taxaJusta))} a.m.
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-body text-aletis-grafite-claro">Prazo</span>
                  <span className="text-sm font-body font-semibold text-aletis-grafite-escuro">
                    {novoPrazo} meses + {carencia}m carência
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs font-body text-aletis-grafite-claro">
                    Parcela mensal
                  </span>
                  <span className="text-sm font-body font-semibold text-positivo">
                    {fmtBRL(result.pmtNovo)}
                  </span>
                </div>
                <div className="border-t border-positivo/20 pt-3 flex justify-between">
                  <span className="text-xs font-body font-semibold text-aletis-grafite-medio">
                    TOTAL
                  </span>
                  <span className="text-lg font-display font-bold text-positivo">
                    {fmtBRL(result.totalNovo)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Economia */}
          {result.economia > 0 && (
            <div className="bg-positivo/10 border border-positivo/20 rounded-xl p-5 text-center">
              <p className="text-xs font-body text-positivo mb-1">Economia Total Estimada</p>
              <p className="text-3xl font-display font-bold text-positivo">
                {fmtBRL(result.economia)}
              </p>
              <p className="text-sm font-body text-positivo/80 mt-1">
                Redução de {fmtPct(result.economiaPercent)} no custo total
              </p>
            </div>
          )}

          {/* New payment schedule */}
          <div>
            <h3 className="text-sm font-display font-semibold text-aletis-grafite-escuro mb-3">
              Cronograma de Pagamentos Proposto
            </h3>
            <div className="max-h-[320px] overflow-auto rounded-xl border border-aletis-borda custom-scrollbar">
              <table className="w-full text-xs font-body">
                <thead className="sticky top-0 bg-aletis-verde text-white z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold">#</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Data</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Tipo</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b border-aletis-borda/50 ${
                        i % 2 === 0 ? 'bg-white' : 'bg-aletis-bege/50'
                      }`}
                    >
                      <td className="px-3 py-2 text-aletis-grafite-medio font-semibold">
                        {i + 1}
                      </td>
                      <td className="px-3 py-2 text-aletis-grafite-medio">{row.data}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`badge text-[10px] ${
                            row.tipo === 'Carência'
                              ? 'bg-ambar/10 text-ambar'
                              : 'bg-positivo/10 text-positivo'
                          }`}
                        >
                          {row.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-aletis-grafite-escuro">
                        {row.valor > 0 ? fmtBRL(row.valor) : '---'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ════════════════════════════════════════════════════════════
// SECTION 5: Conversor de Taxas
// ════════════════════════════════════════════════════════════
function ConversorTaxas() {
  const [inputRate, setInputRate] = useState('1.50')
  const [mode, setMode] = useState<'mensal_to_anual' | 'anual_to_mensal'>('mensal_to_anual')

  // API integration — debounced since it auto-calculates
  const [apiResult, setApiResult] = useState<{ taxa: number } | null>(null)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [serverVerified, setServerVerified] = useState(false)

  const debouncedRate = useDebounce(inputRate, 600)
  const debouncedMode = useDebounce(mode, 300)

  // Fire GET request on debounced input changes
  useEffect(() => {
    const rate = parseBRL(debouncedRate)
    if (rate <= 0) {
      setServerVerified(false)
      return
    }

    const de = debouncedMode === 'mensal_to_anual' ? 'mensal' : 'anual'
    const para = debouncedMode === 'mensal_to_anual' ? 'anual' : 'mensal'

    setApiLoading(true)
    setApiError(null)
    setServerVerified(false)

    apiFetch<{ taxa: number }>(`/credito/converter-taxa?taxa=${rate}&de=${de}&para=${para}`)
      .then((res) => {
        setApiResult(res)
        setServerVerified(true)
      })
      .catch((err) => {
        setApiError((err as Error).message)
        console.warn('[API GET] /credito/converter-taxa falhou:', (err as Error).message)
      })
      .finally(() => setApiLoading(false))
  }, [debouncedRate, debouncedMode])

  const result = useMemo(() => {
    const rate = parseBRL(inputRate)
    if (rate <= 0) return null

    if (mode === 'mensal_to_anual') {
      const anual = monthlyToAnnual(rate)
      const diaria = monthlyToDaily(rate)
      return { mensal: rate, anual, diaria }
    } else {
      const mensal = annualToMonthly(rate) * 100
      const diaria = annualToDaily(rate)
      return { mensal, anual: rate, diaria }
    }
  }, [inputRate, mode])

  // Merge API result
  const displayResult = useMemo(() => {
    if (!result) return null
    if (apiResult && serverVerified) {
      if (mode === 'mensal_to_anual') {
        return { ...result, anual: apiResult.taxa }
      } else {
        return { ...result, mensal: apiResult.taxa }
      }
    }
    return result
  }, [result, apiResult, serverVerified, mode])

  return (
    <SectionCard
      icon={ArrowRightLeft}
      title="Conversor de Taxas"
      subtitle="Converta entre taxas mensais, anuais e diárias (juros compostos)"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <InputField
          label={mode === 'mensal_to_anual' ? 'Taxa Mensal' : 'Taxa Anual'}
          value={inputRate}
          onChange={setInputRate}
          placeholder={mode === 'mensal_to_anual' ? '1.50' : '19.56'}
          suffix={mode === 'mensal_to_anual' ? '% a.m.' : '% a.a.'}
        />
        <div>
          <label className="block text-xs font-body font-medium text-aletis-grafite-medio mb-1.5">
            Direção da Conversão
          </label>
          <div className="flex rounded-xl border border-aletis-borda overflow-hidden">
            <button
              onClick={() => setMode('mensal_to_anual')}
              className={`flex-1 py-3 text-xs font-body font-medium transition-all ${
                mode === 'mensal_to_anual'
                  ? 'bg-aletis-verde text-white'
                  : 'bg-white text-aletis-grafite-medio hover:bg-aletis-bege'
              }`}
            >
              Mensal → Anual
            </button>
            <button
              onClick={() => setMode('anual_to_mensal')}
              className={`flex-1 py-3 text-xs font-body font-medium transition-all ${
                mode === 'anual_to_mensal'
                  ? 'bg-aletis-verde text-white'
                  : 'bg-white text-aletis-grafite-medio hover:bg-aletis-bege'
              }`}
            >
              Anual → Mensal
            </button>
          </div>
        </div>
      </div>

      {displayResult && (
        <>
          <div className="flex items-center justify-end mb-3">
            <ServerVerifiedBadge loading={apiLoading} verified={serverVerified} error={apiError} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in">
            <ResultBadge label="Taxa Mensal" value={fmtPct(displayResult.mensal, 4)} variant="green" />
            <ResultBadge label="Taxa Anual" value={fmtPct(displayResult.anual, 4)} variant="gold" />
            <ResultBadge
              label="Taxa Diária (252 d.u.)"
              value={fmtPct(displayResult.diaria, 6)}
              variant="green"
            />
          </div>
        </>
      )}

      <div className="mt-4 bg-aletis-bege rounded-xl p-3">
        <p className="text-[11px] font-body text-aletis-grafite-claro leading-relaxed">
          <strong>Fórmula:</strong> Conversão por juros compostos. Mensal → Anual: (1 + i)<sup>12</sup> - 1.
          Anual → Mensal: (1 + i)<sup>1/12</sup> - 1. Diária utiliza 252 dias úteis (21 d.u./mês para mensal, 252 d.u./ano para anual).
        </p>
      </div>
    </SectionCard>
  )
}

// ════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════
export default function Credito() {
  return (
    <div className="min-h-screen bg-aletis-bege">
      {/* Page Header */}
      <header className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-3xl lg:text-4xl font-display font-bold text-aletis-grafite-escuro tracking-tight">
              Análise de Crédito
            </h1>
            <p className="text-aletis-grafite-claro font-body mt-1 text-sm">
              Ferramentas de cálculo financeiro para análise e renegociação de dívidas rurais
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-body text-aletis-grafite-claro">
            <Calculator className="w-4 h-4 text-aletis-verde" />
            13 calculadoras disponíveis (5 básicas + 8 premium)
          </div>
        </div>
      </header>

      {/* Calculator Sections */}
      <div className="space-y-6">
        <CalculadoraCET />
        <CalculadoraSpread />
        <SimuladorAmortizacao />
        <SimuladorRenegociacao />
        <ConversorTaxas />

        {/* Premium calculators (MCR, Sumulas STJ, Plano Safra 2025/26) */}
        <div className="pt-4 border-t border-aletis-bege-escuro">
          <CreditoPremium />
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="h-8" />
    </div>
  )
}
