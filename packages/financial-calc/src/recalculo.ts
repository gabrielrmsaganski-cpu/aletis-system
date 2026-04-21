/**
 * Recálculo de dívida com taxa justa — engine central das propostas
 * ALETIS. Aplica juros compostos e deduz pagamentos cronologicamente.
 */

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export interface PagamentoRealizado {
  data: string;
  valor: number;
}

export interface ParamsRecalculo {
  valorOriginal: number;
  dataInicio: string;
  taxaMensalJusta: number; // % ao mês (ex: 1 = 1% a.m.)
  pagamentos: PagamentoRealizado[];
  dataCorte: string;
  multa?: number; // %
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

export function recalcularDivida(params: ParamsRecalculo): ResultadoRecalculo {
  const { valorOriginal, dataInicio, taxaMensalJusta, pagamentos, dataCorte, multa = 0 } = params;
  const taxaDiaria = Math.pow(1 + taxaMensalJusta / 100, 1 / 30) - 1;

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
      (new Date(evento.data).getTime() - new Date(dataAnterior).getTime()) /
        (1000 * 60 * 60 * 24),
    );

    const jurosAcumulados =
      diasDecorridos > 0 ? round(saldo * (Math.pow(1 + taxaDiaria, diasDecorridos) - 1), 2) : 0;

    totalJuros += jurosAcumulados;
    saldo = round(saldo + jurosAcumulados, 2);

    const valorAtualizado = round(
      Math.abs(evento.valor) * (diasDecorridos > 0 ? Math.pow(1 + taxaDiaria, diasDecorridos) : 1),
      2,
    );

    if (evento.valor > 0) {
      saldo = round(saldo + evento.valor, 2);
    } else {
      saldo = round(saldo + evento.valor, 2);
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

  const diasFinais = Math.round(
    (new Date(dataCorte).getTime() - new Date(dataAnterior).getTime()) / (1000 * 60 * 60 * 24),
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
