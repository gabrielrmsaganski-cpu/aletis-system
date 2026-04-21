/**
 * SAC Especial (Parcelado Decrescente com amortização por parcela).
 *
 * Portado da aba `Parcelado Decrescente Pré e Pós` de
 * `MÉTODOS DE CÁLCULO.xlsm`. A única diferença em relação ao SAC canônico é
 * que o valor de amortização por parcela vem de uma tabela customizada
 * (útil para operações rurais onde o fluxo de caixa é sazonal — pagamentos
 * maiores após a colheita, menores fora de safra).
 *
 * Requer `params.amortizacoesCustomizadas` com `numeroParcelas` entradas;
 * a soma deve ser igual (ou muito próxima) ao `valor` da operação. A última
 * parcela é ajustada para zerar o saldo e absorver qualquer resíduo.
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

export function simularSACEspecial(params: ParametrosOperacao): LinhaAmortizacao[] {
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
    amortizacoesCustomizadas,
  } = params;

  if (!amortizacoesCustomizadas || amortizacoesCustomizadas.length !== numeroParcelas) {
    throw new Error(
      `SAC_ESPECIAL requer amortizacoesCustomizadas com exatamente ${numeroParcelas} valores`,
    );
  }

  const dataOp = toISODate(dataOperacao);
  const primeiro =
    primeiroVencimento
      ? toISODate(primeiroVencimento)
      : primeiroVencimentoPadrao(dataOp, periodicidade, diaVencimento, feriados);

  const datas = gerarVencimentos(primeiro, numeroParcelas, periodicidade, diaVencimento, feriados);

  // Parcelado Decrescente usa IF(periodicidade=ANUAL, /365, /30) para o
  // fator pré-fixado diário. Reproduzimos esse condicional aqui.
  const denominadorFatorPre = periodicidade === 'ANUAL' ? 365 : 30;
  const fatorDiarioPre = trunc(Math.pow(1 + taxaMensal, 1 / denominadorFatorPre), 8);

  const tabela: LinhaAmortizacao[] = [];
  let saldoAnterior = valor;

  for (let i = 0; i < numeroParcelas; i++) {
    const dataParc = datas[i];
    const dataAnt = i === 0 ? dataOp : datas[i - 1];
    const diasEntre = diasCorridos(dataAnt, dataParc);
    const diasUteis = networkDays(addOneDay(dataAnt), dataParc, feriados);

    const fatorPos = taxaPosAnual > 0 ? fatorPosSimples(taxaPosAnual, diasUteis, 9) : 1;
    const saldoCorrigido = saldoAnterior * fatorPos;
    const jurosPos = saldoCorrigido - saldoAnterior;
    const jurosPre = saldoCorrigido * (Math.pow(fatorDiarioPre, diasEntre) - 1);

    const amortizacao =
      i === numeroParcelas - 1 ? saldoAnterior : amortizacoesCustomizadas[i];
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
