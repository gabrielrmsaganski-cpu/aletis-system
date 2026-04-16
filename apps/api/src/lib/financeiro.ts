/**
 * ALETIS - Motor de Calculo Financeiro
 *
 * Implementa matematica financeira real:
 * - Juros compostos
 * - TIR via Newton-Raphson
 * - Amortizacao SAC e PRICE
 * - Conversao de taxas equivalentes
 * - Recalculo de divida com pagamentos parciais
 */

/* ---------- helpers ---------- */

/** Diferenca em dias entre duas datas (UTC, sem horario) */
export function diffDias(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.round(ms / 86_400_000)
}

/** Parse yyyy-mm-dd ou Date */
export function toDate(v: string | Date): Date {
  if (v instanceof Date) return v
  const d = new Date(v + 'T00:00:00Z')
  if (isNaN(d.getTime())) throw new Error(`Data invalida: ${v}`)
  return d
}

/* ---------- conversao de taxas ---------- */

export interface TaxasEquivalentes {
  mensal: number
  anual: number
  diaria: number
}

/** Converte entre taxas equivalentes (compostas) */
export function converterTaxa(taxa: number, tipo: 'mensal' | 'anual' | 'diaria'): TaxasEquivalentes {
  let mensal: number
  if (tipo === 'mensal') {
    mensal = taxa / 100
  } else if (tipo === 'anual') {
    mensal = Math.pow(1 + taxa / 100, 1 / 12) - 1
  } else {
    mensal = Math.pow(1 + taxa / 100, 30) - 1
  }

  return {
    mensal: Number((mensal * 100).toFixed(6)),
    anual: Number(((Math.pow(1 + mensal, 12) - 1) * 100).toFixed(6)),
    diaria: Number(((Math.pow(1 + mensal, 1 / 30) - 1) * 100).toFixed(8)),
  }
}

/* ---------- TIR (IRR) via Newton-Raphson ---------- */

export interface Fluxo {
  data: string
  valor: number
}

/** Valor Presente Liquido dado taxa mensal */
function vpl(fluxos: Fluxo[], taxaMensal: number): number {
  const base = toDate(fluxos[0].data)
  let soma = 0
  for (const f of fluxos) {
    const dias = diffDias(base, toDate(f.data))
    const meses = dias / 30
    soma += f.valor / Math.pow(1 + taxaMensal, meses)
  }
  return soma
}

/** Derivada do VPL em relacao a taxa */
function dvpl(fluxos: Fluxo[], taxaMensal: number): number {
  const base = toDate(fluxos[0].data)
  let soma = 0
  for (const f of fluxos) {
    const dias = diffDias(base, toDate(f.data))
    const meses = dias / 30
    soma += (-meses * f.valor) / Math.pow(1 + taxaMensal, meses + 1)
  }
  return soma
}

/**
 * Calcula a TIR (CET) mensal e anual via Newton-Raphson.
 * fluxos: array de { data, valor } onde saidas sao negativas e entradas positivas.
 */
export function calcularCET(fluxos: Fluxo[], maxIter = 200, tol = 1e-10): { mensal: number; anual: number } {
  if (fluxos.length < 2) throw new Error('Minimo 2 fluxos necessarios')

  let taxa = 0.01 // chute inicial 1% a.m.

  for (let i = 0; i < maxIter; i++) {
    const v = vpl(fluxos, taxa)
    const dv = dvpl(fluxos, taxa)
    if (Math.abs(dv) < 1e-20) break
    const novaTaxa = taxa - v / dv
    if (Math.abs(novaTaxa - taxa) < tol) {
      taxa = novaTaxa
      break
    }
    taxa = novaTaxa
  }

  const mensal = taxa * 100
  const anual = (Math.pow(1 + taxa, 12) - 1) * 100

  return {
    mensal: Number(mensal.toFixed(6)),
    anual: Number(anual.toFixed(4)),
  }
}

/* ---------- spread ---------- */

export interface SpreadAnalysis {
  spreadAbsoluto: number
  spreadPercentual: number
  taxaOriginalAnual: number
  taxaPraticadaAnual: number
  excessoSobreSelic: number
}

export function calcularSpread(taxaOriginal: number, taxaPraticada: number, selicAnual = 14.25): SpreadAnalysis {
  const origAnual = (Math.pow(1 + taxaOriginal / 100, 12) - 1) * 100
  const pratAnual = (Math.pow(1 + taxaPraticada / 100, 12) - 1) * 100

  return {
    spreadAbsoluto: Number((taxaPraticada - taxaOriginal).toFixed(4)),
    spreadPercentual: Number((((taxaPraticada - taxaOriginal) / taxaOriginal) * 100).toFixed(2)),
    taxaOriginalAnual: Number(origAnual.toFixed(4)),
    taxaPraticadaAnual: Number(pratAnual.toFixed(4)),
    excessoSobreSelic: Number((pratAnual - selicAnual).toFixed(4)),
  }
}

/* ---------- amortizacao ---------- */

export interface LinhaAmortizacao {
  parcela: number
  data: string
  prestacao: number
  juros: number
  amortizacao: number
  saldoDevedor: number
}

export function simularAmortizacao(
  valor: number,
  taxaMensal: number,
  prazo: number,
  sistema: 'SAC' | 'PRICE',
  dataInicio: string,
): LinhaAmortizacao[] {
  const taxa = taxaMensal / 100
  const tabela: LinhaAmortizacao[] = []
  let saldo = valor
  const inicio = toDate(dataInicio)

  if (sistema === 'SAC') {
    const amortConst = valor / prazo
    for (let p = 1; p <= prazo; p++) {
      const juros = saldo * taxa
      const prestacao = amortConst + juros
      saldo -= amortConst
      if (saldo < 0.005) saldo = 0

      const dt = new Date(inicio)
      dt.setUTCMonth(dt.getUTCMonth() + p)

      tabela.push({
        parcela: p,
        data: dt.toISOString().slice(0, 10),
        prestacao: Number(prestacao.toFixed(2)),
        juros: Number(juros.toFixed(2)),
        amortizacao: Number(amortConst.toFixed(2)),
        saldoDevedor: Number(saldo.toFixed(2)),
      })
    }
  } else {
    // PRICE: prestacao fixa
    const pmt = (valor * taxa * Math.pow(1 + taxa, prazo)) / (Math.pow(1 + taxa, prazo) - 1)

    for (let p = 1; p <= prazo; p++) {
      const juros = saldo * taxa
      const amort = pmt - juros
      saldo -= amort
      if (saldo < 0.005) saldo = 0

      const dt = new Date(inicio)
      dt.setUTCMonth(dt.getUTCMonth() + p)

      tabela.push({
        parcela: p,
        data: dt.toISOString().slice(0, 10),
        prestacao: Number(pmt.toFixed(2)),
        juros: Number(juros.toFixed(2)),
        amortizacao: Number(amort.toFixed(2)),
        saldoDevedor: Number(saldo.toFixed(2)),
      })
    }
  }

  return tabela
}

/* ---------- recalculo de divida ---------- */

export interface Pagamento {
  data: string
  valor: number
}

export interface ResultadoRecalculo {
  saldoOriginal: number
  totalJuros: number
  totalPago: number
  saldoAtualizado: number
  dataCorte: string
  detalhamento: Array<{
    periodo: string
    saldoInicial: number
    juros: number
    pagamento: number
    saldoFinal: number
  }>
}

export function recalcularDivida(
  valorOriginal: number,
  dataInicio: string,
  taxaMensal: number,
  pagamentos: Pagamento[],
  dataCorte: string,
): ResultadoRecalculo {
  const taxa = taxaMensal / 100
  const inicio = toDate(dataInicio)
  const corte = toDate(dataCorte)

  // Ordena pagamentos por data
  const pgtos = [...pagamentos].sort((a, b) => toDate(a.data).getTime() - toDate(b.data).getTime())

  let saldo = valorOriginal
  let totalJuros = 0
  let totalPago = 0
  const detalhamento: ResultadoRecalculo['detalhamento'] = []

  // Cria timeline de eventos: inicio, cada pagamento, corte
  const datas: Date[] = [inicio]
  for (const p of pgtos) {
    const d = toDate(p.data)
    if (d > inicio && d <= corte) datas.push(d)
  }
  if (corte > inicio) datas.push(corte)

  // Remove duplicatas e ordena
  const unique = Array.from(new Set(datas.map(d => d.toISOString().slice(0, 10))))
    .sort()
    .map(s => toDate(s))

  for (let i = 0; i < unique.length - 1; i++) {
    const de = unique[i]
    const ate = unique[i + 1]
    const dias = diffDias(de, ate)
    const meses = dias / 30

    const juros = saldo * (Math.pow(1 + taxa, meses) - 1)
    const saldoComJuros = saldo + juros

    // Verifica pagamento nesta data
    const pgto = pgtos.find(p => toDate(p.data).toISOString().slice(0, 10) === ate.toISOString().slice(0, 10))
    const valorPgto = pgto?.valor ?? 0

    totalJuros += juros
    totalPago += valorPgto

    const saldoFinal = saldoComJuros - valorPgto

    detalhamento.push({
      periodo: `${de.toISOString().slice(0, 10)} a ${ate.toISOString().slice(0, 10)}`,
      saldoInicial: Number(saldo.toFixed(2)),
      juros: Number(juros.toFixed(2)),
      pagamento: Number(valorPgto.toFixed(2)),
      saldoFinal: Number(saldoFinal.toFixed(2)),
    })

    saldo = saldoFinal
  }

  return {
    saldoOriginal: valorOriginal,
    totalJuros: Number(totalJuros.toFixed(2)),
    totalPago: Number(totalPago.toFixed(2)),
    saldoAtualizado: Number(saldo.toFixed(2)),
    dataCorte: dataCorte,
    detalhamento,
  }
}

/* ---------- projecao fluxo de caixa agricola ---------- */

export interface FluxoCaixaParams {
  cultura: string
  areaTotalHa: number
  produtividadeSacasHa: number
  precoSacaAtual: number
  custoHa: number
  dataPlantio: string
  dataColheita: string
  dividas: Array<{ descricao: string; valor: number; vencimento: string }>
  recebiveis?: Array<{ descricao: string; valor: number; data: string }>
}

export interface ProjecaoFluxoCaixa {
  receitaBruta: number
  custoTotal: number
  margemBruta: number
  totalDividas: number
  saldoLivre: number
  capacidadePagamento: number
  fluxoMensal: Array<{
    mes: string
    receita: number
    despesa: number
    saldo: number
    saldoAcumulado: number
  }>
}

export function projetarFluxoCaixa(params: FluxoCaixaParams): ProjecaoFluxoCaixa {
  const producaoTotal = params.areaTotalHa * params.produtividadeSacasHa
  const receitaBruta = producaoTotal * params.precoSacaAtual
  const custoTotal = params.areaTotalHa * params.custoHa
  const margemBruta = receitaBruta - custoTotal
  const totalDividas = params.dividas.reduce((s, d) => s + d.valor, 0)
  const saldoLivre = margemBruta - totalDividas
  const capacidadePagamento = margemBruta > 0 ? (totalDividas / margemBruta) * 100 : 0

  // Gera fluxo mensal do plantio a 6 meses apos colheita
  const plantio = toDate(params.dataPlantio)
  const colheita = toDate(params.dataColheita)
  const fim = new Date(colheita)
  fim.setUTCMonth(fim.getUTCMonth() + 6)

  const fluxoMensal: ProjecaoFluxoCaixa['fluxoMensal'] = []
  let saldoAcumulado = 0
  const cursor = new Date(plantio)
  cursor.setUTCDate(1)

  const mesesPlantioColheita = diffDias(plantio, colheita) / 30
  const custoPorMes = custoTotal / Math.max(mesesPlantioColheita, 1)

  while (cursor <= fim) {
    const mesStr = cursor.toISOString().slice(0, 7)

    // Receita: vendas concentradas em 3 meses apos colheita
    let receita = 0
    const mesesAposColheita = diffDias(colheita, cursor) / 30
    if (mesesAposColheita >= 0 && mesesAposColheita < 3) {
      receita = receitaBruta / 3
    }

    // Recebiveis
    if (params.recebiveis) {
      for (const r of params.recebiveis) {
        if (r.data.startsWith(mesStr)) receita += r.valor
      }
    }

    // Despesas: custo producao + dividas no mes
    let despesa = 0
    if (cursor >= plantio && cursor <= colheita) {
      despesa += custoPorMes
    }
    for (const d of params.dividas) {
      if (d.vencimento.startsWith(mesStr)) despesa += d.valor
    }

    const saldo = receita - despesa
    saldoAcumulado += saldo

    fluxoMensal.push({
      mes: mesStr,
      receita: Number(receita.toFixed(2)),
      despesa: Number(despesa.toFixed(2)),
      saldo: Number(saldo.toFixed(2)),
      saldoAcumulado: Number(saldoAcumulado.toFixed(2)),
    })

    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return {
    receitaBruta: Number(receitaBruta.toFixed(2)),
    custoTotal: Number(custoTotal.toFixed(2)),
    margemBruta: Number(margemBruta.toFixed(2)),
    totalDividas: Number(totalDividas.toFixed(2)),
    saldoLivre: Number(saldoLivre.toFixed(2)),
    capacidadePagamento: Number(capacidadePagamento.toFixed(2)),
    fluxoMensal,
  }
}
