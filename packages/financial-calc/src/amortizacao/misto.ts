/**
 * Sistema Misto — metade SAC, metade Price.
 *
 * Cada parcela é a média aritmética da parcela SAC e da parcela Price
 * no mesmo período. Não aparece explicitamente em aba isolada da planilha
 * de referência, mas é um sistema clássico pedido por clientes Sicredi
 * que querem equilibrar parcelas grandes no começo (SAC) com parcelas
 * suaves no fim (Price).
 *
 * Implementação: simulamos os dois sistemas com os mesmos parâmetros e
 * combinamos linha a linha (média das amortizações; os juros são
 * recalculados coerentemente sobre o novo saldo).
 *
 * Aceita `amortizacoesCustomizadas` opcional — quando presente, sobrescreve
 * a média (útil para fluxos sazonais).
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
import { simularSAC } from './sac.js';
import { simularPrice } from './price.js';

export function simularMisto(params: ParametrosOperacao): LinhaAmortizacao[] {
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

  if (numeroParcelas <= 0) return [];

  const dataOp = toISODate(dataOperacao);
  const primeiro =
    primeiroVencimento
      ? toISODate(primeiroVencimento)
      : primeiroVencimentoPadrao(dataOp, periodicidade, diaVencimento, feriados);
  const datas = gerarVencimentos(primeiro, numeroParcelas, periodicidade, diaVencimento, feriados);
  const fatorDiarioPre = trunc(Math.pow(1 + taxaMensal, 1 / 30), 8);

  // Define amortizações-alvo: média SAC/Price ou override customizado.
  let amortsAlvo: number[];
  if (amortizacoesCustomizadas && amortizacoesCustomizadas.length === numeroParcelas) {
    amortsAlvo = [...amortizacoesCustomizadas];
  } else {
    const sacRows = simularSAC(params);
    const priceRows = simularPrice(params);
    amortsAlvo = sacRows.map((r, i) =>
      (r.amortizacao + (priceRows[i]?.amortizacao ?? 0)) / 2,
    );
  }

  // Normaliza a soma para bater com `valor` (a última parcela absorve resíduo).
  const soma = amortsAlvo.reduce((a, b) => a + b, 0);
  if (soma !== valor && amortsAlvo.length > 0) {
    amortsAlvo[amortsAlvo.length - 1] += valor - soma;
  }

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

    const amortizacao = i === numeroParcelas - 1 ? saldoAnterior : amortsAlvo[i];
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
