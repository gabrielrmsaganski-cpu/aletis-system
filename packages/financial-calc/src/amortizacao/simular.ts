/**
 * Facade unificada: escolhe o sistema de amortização, roda a simulação,
 * calcula indicadores agregados (totais, IRR implícita, duração).
 */

import {
  type IndicadoresAmortizacao,
  type LinhaAmortizacao,
  type ParametrosOperacao,
  type ResultadoSimulacao,
  type SistemaAmortizacao,
  round,
} from './types.js';
import { simularSAC } from './sac.js';
import { simularPrice } from './price.js';
import { simularSACEspecial } from './sac-especial.js';
import { simularAmericano } from './americano.js';
import { simularAlemao } from './alemao.js';
import { simularMisto } from './misto.js';
import { toISODate, diasCorridos } from '../feriados/index.js';

/**
 * Roda a simulação de acordo com o sistema escolhido.
 *
 * Retorna a tabela completa e um bloco de indicadores (totais, taxa
 * efetiva, prazo médio e duração).
 */
export function simular(params: ParametrosOperacao): ResultadoSimulacao {
  if (params.numeroParcelas <= 0) throw new Error('numeroParcelas deve ser > 0');
  if (params.valor <= 0) throw new Error('valor deve ser > 0');

  const tabela = executar(params.sistema, params);
  const indicadores = calcularIndicadores(tabela, params);

  return {
    sistema: params.sistema,
    parametros: params,
    tabela,
    indicadores,
  };
}

function executar(sistema: SistemaAmortizacao, params: ParametrosOperacao): LinhaAmortizacao[] {
  switch (sistema) {
    case 'SAC_PRE':
      return simularSAC({ ...params, taxaPosAnual: 0 });
    case 'SAC_POS':
      return simularSAC(params);
    case 'PRICE_PRE':
      return simularPrice({ ...params, taxaPosAnual: 0 });
    case 'PRICE_POS':
      return simularPrice(params);
    case 'SAC_ESPECIAL':
      return simularSACEspecial(params);
    case 'AMERICANO':
      return simularAmericano(params);
    case 'ALEMAO':
      return simularAlemao(params);
    case 'MISTO':
      return simularMisto(params);
    default: {
      const _exhaustive: never = sistema;
      throw new Error(`Sistema desconhecido: ${String(_exhaustive)}`);
    }
  }
}

function calcularIndicadores(
  tabela: LinhaAmortizacao[],
  params: ParametrosOperacao,
): IndicadoresAmortizacao {
  const totalPago = tabela.reduce((a, b) => a + b.pagamento, 0);
  const totalJurosPos = tabela.reduce((a, b) => a + b.jurosPos, 0);
  const totalJurosPre = tabela.reduce((a, b) => a + b.jurosPre, 0);
  const totalJuros = totalJurosPos + totalJurosPre;
  const totalAmortizado = tabela.reduce((a, b) => a + b.amortizacao, 0);

  // Prazo médio: Σ(amort * mes) / Σamort — em meses a partir da data da operação.
  const dataOp = toISODate(params.dataOperacao);
  let somaPonderacao = 0;
  let somaAmort = 0;
  for (const linha of tabela) {
    const meses = diasCorridos(dataOp, linha.data) / 30;
    somaPonderacao += linha.amortizacao * meses;
    somaAmort += linha.amortizacao;
  }
  const prazoMedio = somaAmort > 0 ? somaPonderacao / somaAmort : 0;

  // Duração (Macaulay duration, em meses): Σ(PV(parcela) * mes) / Σ(PV).
  const taxa = params.taxaMensal;
  let somaPV = 0;
  let somaPVxT = 0;
  for (const linha of tabela) {
    const meses = diasCorridos(dataOp, linha.data) / 30;
    const pv = linha.pagamento / Math.pow(1 + taxa, meses);
    somaPV += pv;
    somaPVxT += pv * meses;
  }
  const duracao = somaPV > 0 ? somaPVxT / somaPV : 0;

  // Taxa efetiva: IRR mensal dos fluxos (entrada +valor, saídas -parcelas).
  const irr = calcularIRRmensal(params.valor, tabela, dataOp);
  const taxaEfetivaMensal = irr;
  const taxaEfetivaAnual = Math.pow(1 + irr, 12) - 1;

  return {
    totalPago: round(totalPago, 2),
    totalJuros: round(totalJuros, 2),
    totalJurosPos: round(totalJurosPos, 2),
    totalJurosPre: round(totalJurosPre, 2),
    totalAmortizado: round(totalAmortizado, 2),
    prazoMedio: round(prazoMedio, 4),
    duracao: round(duracao, 4),
    taxaEfetivaMensal: round(taxaEfetivaMensal, 8),
    taxaEfetivaAnual: round(taxaEfetivaAnual, 8),
  };
}

/**
 * IRR mensal via Newton-Raphson sobre os fluxos da tabela de amortização.
 * Tempo expresso em meses (dias_corridos / 30).
 */
function calcularIRRmensal(
  valor: number,
  tabela: LinhaAmortizacao[],
  dataOp: string,
  tentativaInicial = 0.01,
): number {
  if (tabela.length === 0) return 0;
  const fluxos: Array<{ t: number; v: number }> = [
    { t: 0, v: -valor },
    ...tabela.map((l) => ({
      t: diasCorridos(dataOp, l.data) / 30,
      v: l.pagamento,
    })),
  ];

  let r = tentativaInicial;
  for (let i = 0; i < 200; i++) {
    let f = 0;
    let df = 0;
    for (const { t, v } of fluxos) {
      const fator = Math.pow(1 + r, t);
      f += v / fator;
      df -= (t * v) / (fator * (1 + r));
    }
    if (Math.abs(f) < 1e-8) break;
    const delta = f / df;
    r -= delta;
    if (!Number.isFinite(r)) return 0;
    if (r <= -0.999) r = -0.99;
  }
  return r;
}
