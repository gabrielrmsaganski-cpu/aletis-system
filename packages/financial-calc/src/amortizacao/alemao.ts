/**
 * Sistema Alemão (Hamburguês).
 *
 * Característica: juros são pagos antecipadamente — calculados sobre o
 * saldo INICIAL de cada período (antes da amortização daquele período),
 * e amortização constante como no SAC.
 *
 * Na prática, é uma variação do SAC em que o fluxo é reordenado:
 *
 *   amort constante = valor / numParcelas
 *   juros(n) computado sobre saldo(n-1) ANTES de amortizar
 *   no momento do desembolso, já desconta o primeiro juros
 *
 * Aqui implementamos a forma "pós-paga" equivalente: os juros da parcela
 * incidem sobre o saldo ANTES da amortização (igual ao SAC), mas a
 * diferença é mantida em `parcela(N) = amort` (sem juros na última — já
 * foram cobrados antecipadamente na parcela N-1).
 *
 * Essa forma é menos comum em operações Sisbr, mas está documentada
 * aqui para completude.
 */

import { FERIADOS_NACIONAIS, diasCorridos, networkDays, toISODate } from '../feriados/index.js';
import { fatorPosSimples } from '../indices/pos-fixado.js';
import {
  type LinhaAmortizacao,
  type ParametrosOperacao,
  round,
  trunc,
} from './types.js';
import { gerarVencimentos, primeiroVencimentoPadrao } from './_agenda.js';

export function simularAlemao(params: ParametrosOperacao): LinhaAmortizacao[] {
  const {
    valor,
    dataOperacao,
    numeroParcelas,
    periodicidade = 'MENSAL',
    taxaMensal,
    taxaPosAnual = 0,
    diaVencimento,
    primeiroVencimento,
    feriados = FERIADOS_NACIONAIS,
  } = params;

  if (numeroParcelas <= 0) return [];

  const dataOp = toISODate(dataOperacao);
  const primeiro =
    primeiroVencimento
      ? toISODate(primeiroVencimento)
      : primeiroVencimentoPadrao(dataOp, periodicidade, diaVencimento, feriados);

  const datas = gerarVencimentos(primeiro, numeroParcelas, periodicidade, diaVencimento, feriados);
  const fatorDiarioPre = trunc(Math.pow(1 + taxaMensal, 1 / 30), 8);
  const amortConstante = valor / numeroParcelas;

  const tabela: LinhaAmortizacao[] = [];
  let saldoAnterior = valor;

  for (let i = 0; i < numeroParcelas; i++) {
    const dataParc = datas[i];
    const dataAnt = i === 0 ? dataOp : datas[i - 1];
    const diasEntre = diasCorridos(dataAnt, dataParc);
    const diasUteis = networkDays(addOneDay(dataAnt), dataParc, feriados);

    const ehUltima = i === numeroParcelas - 1;

    const fatorPos = taxaPosAnual > 0 ? fatorPosSimples(taxaPosAnual, diasUteis, 9) : 1;
    const saldoCorrigido = saldoAnterior * fatorPos;
    const jurosPos = ehUltima ? 0 : saldoCorrigido - saldoAnterior;
    const jurosPre = ehUltima
      ? 0
      : saldoCorrigido * (Math.pow(fatorDiarioPre, diasEntre) - 1);

    const amortizacao = ehUltima ? saldoAnterior : amortConstante;
    const pagamento = amortizacao + jurosPre + jurosPos;
    const saldoFinal = saldoAnterior - amortizacao;

    tabela.push({
      parcela: i + 1,
      data: dataParc,
      diasCorridos: diasEntre,
      diasUteis,
      saldoInicial: round(saldoAnterior, 2),
      saldoCorrigido: round(saldoCorrigido, 2),
      jurosPos: round(jurosPos, 2),
      jurosPre: round(jurosPre, 2),
      amortizacao: round(amortizacao, 2),
      pagamento: round(pagamento, 2),
      saldoFinal: round(Math.max(0, saldoFinal), 2),
    });

    saldoAnterior = saldoFinal;
  }

  return tabela;
}

function addOneDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return toISODate(dt);
}
