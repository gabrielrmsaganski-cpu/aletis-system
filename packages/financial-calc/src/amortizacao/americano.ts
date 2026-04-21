/**
 * Sistema Americano (bullet).
 *
 * Durante todo o prazo o tomador paga apenas os juros do período;
 * na última parcela, paga os juros + todo o principal de uma vez.
 *
 * Usado em contratos balão (ex: bullets agrícolas pós-safra).
 * Não está numa aba dedicada da planilha de referência — a definição aqui
 * segue o padrão clássico de matemática financeira:
 *
 *   parcela(n)  = saldo * taxa_periodo   (para n < N)
 *   parcela(N)  = saldo * taxa_periodo + saldo
 *
 * Para pós-fixado, `taxa_periodo` é composta por (pré) e capitalização
 * diária pela taxa anual pós × dias úteis / 252.
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

export function simularAmericano(params: ParametrosOperacao): LinhaAmortizacao[] {
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

    const ehUltima = i === numeroParcelas - 1;
    const amortizacao = ehUltima ? saldoAnterior : 0;
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
