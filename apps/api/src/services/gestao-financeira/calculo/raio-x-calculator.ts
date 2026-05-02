// ============================================================
// RaioXCalculator — diagnóstico financeiro consolidado
// Replica "16 - Raio X" + "17 - DRE FCL" + "12 - Fluxo de Caixa"
// ============================================================
import type { GfCustoSafra, GfAtivoFazenda } from '../../../db/schema.js'
import type { SafraConsolidado } from './safra-calculator.js'
import type { EndividamentoConsolidado } from './endividamento-calculator.js'

export interface AnoFinanceiroRow {
  ano: number
  receitas: {
    safra: number
    contratosFixar: number
    outras: number
    total: number
  }
  debitos: {
    arrendamento: number
    dividaBancaria: number
    custoOperacional: number
    custoFixo: number
    fornecedores: number
    total: number
  }
  saldoNaoAcumulado: number
  saldoAcumulado: number
  juroEstimado: number
  saldoFinal: number
}

export interface RaioXOutput {
  dataBase: Date | string
  taxaCustoFinanceiroAa: number
  taxaPoupancaAa: number
  anos: AnoFinanceiroRow[]
  indicadores: {
    ebitdaTotal: number
    receitaTotal: number
    custoTotal: number
    margemEbitda: number
    saldoFinalAcumulado: number
    fclMedio: number
    diviPorEbitda: number          // dívida atual / EBITDA anual médio
    grauEndividamento: number       // dívida / ativo
    liquidezImediata: number        // ativosFinanceiros / dividaCurtoPrazo
  }
  resumoAtivos: {
    valorMercado: number
    valorForcado: number
    areaTotalHa: number
    fazendas: number
  }
}

export interface RaioXInputs {
  dataBase: Date | string
  taxaCustoFinanceiroAa?: number      // default 0.20 (20% a.a.)
  taxaPoupancaAa?: number              // default 0.12
  anosProjecao?: number                // default 10
  safrasConsolidadas: SafraConsolidado[]
  endividamento: EndividamentoConsolidado
  custos: GfCustoSafra[]
  ativos: GfAtivoFazenda[]
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : 0
}

export function computeRaioX(input: RaioXInputs): RaioXOutput {
  const dataBase = input.dataBase instanceof Date ? input.dataBase : new Date(input.dataBase as any)
  let anoBaseCal = isFinite(dataBase.getFullYear()) ? dataBase.getFullYear() : new Date().getFullYear()
  // Se a primeira safra cadastrada é anterior ao anoBase, projeta a partir dela
  // para que receitas históricas/realizadas apareçam.
  let menorSafraAno = Infinity
  for (const s of input.safrasConsolidadas) {
    const m = s.safra.match(/^(\d{2})\/(\d{2})$/)
    if (m) menorSafraAno = Math.min(menorSafraAno, 2000 + parseInt(m[2], 10))
  }
  if (menorSafraAno !== Infinity && menorSafraAno < anoBaseCal) anoBaseCal = menorSafraAno
  const anoBase = anoBaseCal
  const horizonte = input.anosProjecao ?? 10
  const txCusto = input.taxaCustoFinanceiroAa ?? 0.2
  const txPoupanca = input.taxaPoupancaAa ?? 0.12

  // ── Receita por ano (safras)
  // Cada safra YY/YY+1 entrega receita no ano YY+1 (default — meses julho..junho)
  const receitaPorAno = new Map<number, number>()
  for (const s of input.safrasConsolidadas) {
    if (s.cenario !== 'planejado') continue // usa só planejado para Raio X
    const m = s.safra.match(/^(\d{2})\/(\d{2})$/)
    if (!m) continue
    const yearEnd = 2000 + parseInt(m[2], 10)
    receitaPorAno.set(yearEnd, (receitaPorAno.get(yearEnd) ?? 0) + s.receitaTotal)
  }

  // ── Débitos por ano (do consolidado de endividamento)
  const dividaPorAno = new Map<number, number>()
  for (const y of input.endividamento.evolucaoAnual) {
    dividaPorAno.set(y.ano, y.parcelaAno)
  }

  // ── Custos: separa operacional, fixo, arrendamento (assume custos anuais — replica em todos os anos do horizonte)
  let custoOperacionalAnual = 0
  let custoFixoAnual = 0
  let custoArrendamentoAnual = 0
  for (const c of input.custos) {
    const v = n(c.valorAnual)
    switch ((c.tipo || '').toLowerCase()) {
      case 'operacional':
        custoOperacionalAnual += v
        break
      case 'fixo':
        custoFixoAnual += v
        break
      case 'arrendamento':
        custoArrendamentoAnual += v
        break
    }
  }

  // ── Construção das linhas anuais
  const anos: AnoFinanceiroRow[] = []
  let saldoAcum = 0
  for (let i = 0; i < horizonte; i++) {
    const ano = anoBase + i
    const receitaSafra = receitaPorAno.get(ano) ?? 0
    const debitoBancario = dividaPorAno.get(ano) ?? 0
    const debitoTotal =
      custoArrendamentoAnual + debitoBancario + custoOperacionalAnual + custoFixoAnual
    const receitaTotalAno = receitaSafra
    const saldoNao = receitaTotalAno - debitoTotal
    saldoAcum += saldoNao
    const juroEstimado =
      saldoAcum < 0 ? saldoAcum * txCusto * -1 * -1 : saldoAcum * txPoupanca
    // se saldoAcum < 0 → cobra juros (negativo agrava); se > 0 → rende poupança
    const saldoFinal = saldoAcum + (saldoAcum < 0 ? saldoAcum * txCusto : saldoAcum * txPoupanca)
    anos.push({
      ano,
      receitas: {
        safra: receitaSafra,
        contratosFixar: 0,
        outras: 0,
        total: receitaTotalAno,
      },
      debitos: {
        arrendamento: custoArrendamentoAnual,
        dividaBancaria: debitoBancario,
        custoOperacional: custoOperacionalAnual,
        custoFixo: custoFixoAnual,
        fornecedores: 0,
        total: debitoTotal,
      },
      saldoNaoAcumulado: saldoNao,
      saldoAcumulado: saldoAcum,
      juroEstimado: saldoAcum < 0 ? saldoAcum * txCusto : saldoAcum * txPoupanca,
      saldoFinal,
    })
  }

  // ── Indicadores
  const receitaTotal = anos.reduce((a, x) => a + x.receitas.total, 0)
  const custoTotal = anos.reduce((a, x) => a + x.debitos.total, 0)
  const ebitdaTotal = receitaTotal - custoTotal // simplificação (sem dívida bancária)
  const ebitdaAnual = horizonte > 0 ? ebitdaTotal / horizonte : 0
  const fclMedio =
    horizonte > 0 ? anos.reduce((a, x) => a + x.saldoNaoAcumulado, 0) / horizonte : 0

  const valorMercado = input.ativos.reduce((a, f) => {
    const area = n(f.areaTotalHa)
    const valorHa = n(f.valorHaMercado)
    return a + area * valorHa
  }, 0)
  const valorForcado = input.ativos.reduce((a, f) => {
    const area = n(f.areaTotalHa)
    const valorHa = n(f.valorHaForcado)
    return a + area * valorHa
  }, 0)
  const areaTotalHa = input.ativos.reduce((a, f) => a + n(f.areaTotalHa), 0)

  const diviPorEbitda = ebitdaAnual > 0 ? input.endividamento.saldoTotalAtual / ebitdaAnual : 0
  const ativoBase = valorMercado || 1
  const grauEndividamento = input.endividamento.saldoTotalAtual / ativoBase
  // Liquidez imediata = ativos financeiros / dívida ano corrente — sem ativos financeiros no MVP
  const liquidezImediata = 0

  return {
    dataBase,
    taxaCustoFinanceiroAa: txCusto,
    taxaPoupancaAa: txPoupanca,
    anos,
    indicadores: {
      ebitdaTotal,
      receitaTotal,
      custoTotal,
      margemEbitda: receitaTotal > 0 ? ebitdaTotal / receitaTotal : 0,
      saldoFinalAcumulado: saldoAcum,
      fclMedio,
      diviPorEbitda,
      grauEndividamento,
      liquidezImediata,
    },
    resumoAtivos: {
      valorMercado,
      valorForcado,
      areaTotalHa,
      fazendas: input.ativos.length,
    },
  }
}
