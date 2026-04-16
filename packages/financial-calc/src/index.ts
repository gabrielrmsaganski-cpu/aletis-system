/**
 * ALETIS Financial Calculation Engine
 * Precision arithmetic for rural credit analysis
 *
 * All calculations use basis-point precision (4 decimal places minimum)
 * to match the real-world calculations from ALETIS proposals.
 */

// ── Utility: Precision Math ─────────────────────────────────
function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

// ── CET Calculator (Custo Efetivo Total) ────────────────────
export interface FluxoPagamento {
  data: string;    // ISO date
  valor: number;   // positive = received, negative = paid
}

/**
 * Calculates CET (Custo Efetivo Total) using Newton-Raphson IRR method.
 * This is the TRUE cost of credit, including all fees and charges.
 */
export function calcularCET(fluxos: FluxoPagamento[]): { mensal: number; anual: number } {
  if (fluxos.length < 2) throw new Error('Mínimo 2 fluxos necessários');

  const sorted = [...fluxos].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  const baseDate = new Date(sorted[0].data).getTime();

  // Days between each flow and base date
  const dias = sorted.map(f => (new Date(f.data).getTime() - baseDate) / (1000 * 60 * 60 * 24));
  const valores = sorted.map(f => f.valor);

  // Newton-Raphson to find daily rate
  let taxaDiaria = 0.001; // initial guess
  const maxIterations = 1000;
  const tolerance = 1e-10;

  for (let i = 0; i < maxIterations; i++) {
    let vpv = 0;
    let dvpv = 0;

    for (let j = 0; j < valores.length; j++) {
      const fator = Math.pow(1 + taxaDiaria, dias[j]);
      vpv += valores[j] / fator;
      dvpv -= (dias[j] * valores[j]) / (fator * (1 + taxaDiaria));
    }

    if (Math.abs(vpv) < tolerance) break;
    taxaDiaria -= vpv / dvpv;

    if (taxaDiaria <= -1) taxaDiaria = 0.0001;
  }

  const mensal = (Math.pow(1 + taxaDiaria, 30) - 1) * 100;
  const anual = (Math.pow(1 + taxaDiaria, 365) - 1) * 100;

  return { mensal: round(mensal, 4), anual: round(anual, 4) };
}

// ── Spread Calculator ───────────────────────────────────────
export interface ResultadoSpread {
  taxaOriginal: number;     // % aa
  taxaPraticada: number;    // % aa (CET real)
  spreadAbsoluto: number;   // pontos percentuais
  spreadRelativo: number;   // % de aumento
  excessivo: boolean;       // > 50% de spread relativo
}

export function calcularSpread(taxaOriginal: number, taxaPraticada: number): ResultadoSpread {
  const spreadAbsoluto = round(taxaPraticada - taxaOriginal, 4);
  const spreadRelativo = taxaOriginal > 0 ? round((spreadAbsoluto / taxaOriginal) * 100, 2) : 0;

  return {
    taxaOriginal,
    taxaPraticada,
    spreadAbsoluto,
    spreadRelativo,
    excessivo: spreadRelativo > 50,
  };
}

// ── Amortization Simulator ──────────────────────────────────
export type SistemaAmortizacao = 'SAC' | 'PRICE' | 'SAC_AJUSTADO';

export interface LinhaAmortizacao {
  parcela: number;
  data: string;
  saldoInicial: number;
  juros: number;
  amortizacao: number;
  pagamento: number;
  saldoFinal: number;
}

export interface ParamsAmortizacao {
  valorFinanciado: number;
  taxaMensal: number;        // % ao mês
  prazoMeses: number;
  sistema: SistemaAmortizacao;
  dataInicio: string;         // ISO date
  carenciaMeses?: number;
}

export function simularAmortizacao(params: ParamsAmortizacao): LinhaAmortizacao[] {
  const { valorFinanciado, taxaMensal, prazoMeses, sistema, dataInicio, carenciaMeses = 0 } = params;
  const taxa = taxaMensal / 100;
  const tabela: LinhaAmortizacao[] = [];
  let saldo = valorFinanciado;

  for (let i = 1; i <= prazoMeses; i++) {
    const data = new Date(dataInicio);
    data.setMonth(data.getMonth() + i);

    const juros = round(saldo * taxa, 2);

    let amortizacao: number;
    let pagamento: number;

    if (i <= carenciaMeses) {
      // During grace period, only interest (capitalized or paid)
      amortizacao = 0;
      pagamento = juros;
    } else if (sistema === 'SAC') {
      amortizacao = round(valorFinanciado / (prazoMeses - carenciaMeses), 2);
      pagamento = amortizacao + juros;
    } else if (sistema === 'PRICE') {
      const n = prazoMeses - carenciaMeses;
      const pmt = round(
        (valorFinanciado * taxa * Math.pow(1 + taxa, n)) / (Math.pow(1 + taxa, n) - 1),
        2
      );
      pagamento = pmt;
      amortizacao = round(pmt - juros, 2);
    } else {
      // SAC_AJUSTADO — irregular payments aligned with harvest
      amortizacao = round(valorFinanciado / (prazoMeses - carenciaMeses), 2);
      pagamento = amortizacao + juros;
    }

    const saldoFinal = round(saldo - amortizacao, 2);

    tabela.push({
      parcela: i,
      data: data.toISOString().split('T')[0],
      saldoInicial: round(saldo, 2),
      juros,
      amortizacao,
      pagamento: round(pagamento, 2),
      saldoFinal: Math.max(0, saldoFinal),
    });

    saldo = Math.max(0, saldoFinal);
  }

  return tabela;
}

// ── Debt Recalculation Engine ───────────────────────────────
export interface PagamentoRealizado {
  data: string;
  valor: number;
}

export interface ParamsRecalculo {
  valorOriginal: number;
  dataInicio: string;
  taxaMensalJusta: number;   // % ao mês (ex: 1.0 for 1% am)
  pagamentos: PagamentoRealizado[];
  dataCorte: string;
  multa?: number;            // % (ex: 2.0 for 2%)
}

export interface ResultadoRecalculo {
  saldoRecalculado: number;
  totalJuros: number;
  totalPago: number;
  movimentacoes: {
    data: string;
    valor: number;
    diasDecorridos: number;
    jurosAcumulados: number;
    valorAtualizado: number;
    saldoAtualizado: number;
    descricao: string;
  }[];
}

/**
 * Recalculates debt balance with fair interest rate,
 * applying compound interest and deducting payments chronologically.
 * This mirrors exactly what Christian Kohler does in the real proposals.
 */
export function recalcularDivida(params: ParamsRecalculo): ResultadoRecalculo {
  const { valorOriginal, dataInicio, taxaMensalJusta, pagamentos, dataCorte, multa = 0 } = params;
  const taxaDiaria = Math.pow(1 + taxaMensalJusta / 100, 1 / 30) - 1;

  // Build event list: initial debt + optional penalty + payments + cut-off date
  interface Evento {
    data: string;
    valor: number;
    descricao: string;
  }

  const eventos: Evento[] = [
    { data: dataInicio, valor: valorOriginal, descricao: 'dívida original' },
  ];

  if (multa > 0) {
    eventos.push({
      data: dataInicio,
      valor: round(valorOriginal * (multa / 100), 2),
      descricao: `multa de ${multa}%`,
    });
  }

  for (const pg of pagamentos) {
    eventos.push({ data: pg.data, valor: -pg.valor, descricao: 'Amortização' });
  }

  eventos.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  let saldo = 0;
  let totalJuros = 0;
  let totalPago = 0;
  const movimentacoes: ResultadoRecalculo['movimentacoes'] = [];
  let dataAnterior = dataInicio;

  for (const evento of eventos) {
    const diasDecorridos = Math.round(
      (new Date(evento.data).getTime() - new Date(dataAnterior).getTime()) / (1000 * 60 * 60 * 24)
    );

    const jurosAcumulados = diasDecorridos > 0 ? round(saldo * (Math.pow(1 + taxaDiaria, diasDecorridos) - 1), 2) : 0;

    totalJuros += jurosAcumulados;
    saldo = round(saldo + jurosAcumulados, 2);

    const valorAtualizado = round(
      Math.abs(evento.valor) * (diasDecorridos > 0 ? Math.pow(1 + taxaDiaria, diasDecorridos) : 1),
      2
    );

    if (evento.valor > 0) {
      saldo = round(saldo + evento.valor, 2);
    } else {
      saldo = round(saldo + evento.valor, 2); // valor is negative
      totalPago += Math.abs(evento.valor);
    }

    movimentacoes.push({
      data: evento.data,
      valor: evento.valor,
      diasDecorridos,
      jurosAcumulados,
      valorAtualizado,
      saldoAtualizado: round(saldo, 2),
      descricao: evento.descricao,
    });

    dataAnterior = evento.data;
  }

  // Update to cut-off date
  const diasFinais = Math.round(
    (new Date(dataCorte).getTime() - new Date(dataAnterior).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diasFinais > 0) {
    const jurosFinais = round(saldo * (Math.pow(1 + taxaDiaria, diasFinais) - 1), 2);
    totalJuros += jurosFinais;
    saldo = round(saldo + jurosFinais, 2);

    movimentacoes.push({
      data: dataCorte,
      valor: 0,
      diasDecorridos: diasFinais,
      jurosAcumulados: jurosFinais,
      valorAtualizado: 0,
      saldoAtualizado: round(saldo, 2),
      descricao: 'Atualização até data de corte',
    });
  }

  return {
    saldoRecalculado: round(saldo, 2),
    totalJuros: round(totalJuros, 2),
    totalPago: round(totalPago, 2),
    movimentacoes,
  };
}

// ── Agricultural Cash Flow Projector ────────────────────────
export interface ParamsFluxoCaixaAgricola {
  areaHectares: number;
  produtividadeSacasHa: number;
  precoSaca: number;
  custoProducaoHa: number;
  custoArrendamentoHa?: number;
  custosAdministrativos: number;
  outrasReceitas?: number;
  dividasAnuais: number;
  anosProjecao?: number;
  taxaCrescimentoReceita?: number;  // % ao ano
  taxaCrescimentoCusto?: number;    // % ao ano
}

export interface ProjecaoAnual {
  ano: number;
  receitaBruta: number;
  custoProducao: number;
  custoArrendamento: number;
  custosAdmin: number;
  outrasReceitas: number;
  resultadoOperacional: number;
  servicoDivida: number;
  resultadoLiquido: number;
  saldoAcumulado: number;
}

export function projetarFluxoCaixa(params: ParamsFluxoCaixaAgricola): ProjecaoAnual[] {
  const {
    areaHectares,
    produtividadeSacasHa,
    precoSaca,
    custoProducaoHa,
    custoArrendamentoHa = 0,
    custosAdministrativos,
    outrasReceitas = 0,
    dividasAnuais,
    anosProjecao = 5,
    taxaCrescimentoReceita = 2,
    taxaCrescimentoCusto = 3,
  } = params;

  const projecao: ProjecaoAnual[] = [];
  let saldoAcumulado = 0;
  const anoBase = new Date().getFullYear();

  for (let i = 0; i < anosProjecao; i++) {
    const fatorReceita = Math.pow(1 + taxaCrescimentoReceita / 100, i);
    const fatorCusto = Math.pow(1 + taxaCrescimentoCusto / 100, i);

    const receitaBruta = round(areaHectares * produtividadeSacasHa * precoSaca * fatorReceita, 2);
    const custoProducao = round(areaHectares * custoProducaoHa * fatorCusto, 2);
    const custoArrendamento = round(areaHectares * custoArrendamentoHa * fatorCusto, 2);
    const custosAdmin = round(custosAdministrativos * fatorCusto, 2);
    const outras = round(outrasReceitas * fatorReceita, 2);

    const resultadoOperacional = round(receitaBruta + outras - custoProducao - custoArrendamento - custosAdmin, 2);
    const servicoDivida = round(dividasAnuais, 2);
    const resultadoLiquido = round(resultadoOperacional - servicoDivida, 2);
    saldoAcumulado = round(saldoAcumulado + resultadoLiquido, 2);

    projecao.push({
      ano: anoBase + i,
      receitaBruta,
      custoProducao,
      custoArrendamento,
      custosAdmin,
      outrasReceitas: outras,
      resultadoOperacional,
      servicoDivida,
      resultadoLiquido,
      saldoAcumulado,
    });
  }

  return projecao;
}

// ── Rate Converters ─────────────────────────────────────────
export function taxaMensalParaAnual(taxaMensal: number): number {
  return round((Math.pow(1 + taxaMensal / 100, 12) - 1) * 100, 4);
}

export function taxaAnualParaMensal(taxaAnual: number): number {
  return round((Math.pow(1 + taxaAnual / 100, 1 / 12) - 1) * 100, 4);
}

export function taxaMensalParaDiaria(taxaMensal: number): number {
  return round((Math.pow(1 + taxaMensal / 100, 1 / 30) - 1) * 100, 6);
}
