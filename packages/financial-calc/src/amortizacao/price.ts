/**
 * Tabela Price — pré e pós-fixado.
 *
 * Portado da aba `Tabela Price` de `MÉTODOS DE CÁLCULO.xlsm`:
 *
 *   G(n)  = 1 / (1 + taxaMensal)^((dataVenc(n) - dataOp) / 30)      -- fator desconto parcela n
 *   B36   = Σ G(n)                                                  -- fator operação
 *   J(n)  = valorOp / B36                                           -- PMT constante
 *   F(n)  = dias corridos entre parcela anterior e atual
 *            (primeira: dataOp → dataVenc1)
 *   I(n)  = saldo(n-1) * ((1 + taxaMensal)^(F(n)/30) - 1)           -- juros pré da parcela
 *   H(n)  = J - I                                                    -- amortização
 *   K(n)  = saldo(n-1) - H                                           -- novo saldo
 *
 * Para operações pós-fixadas, usamos a variante de `Tabela Price MIX`, onde
 * além da taxa pré-fixada o saldo recebe a remuneração básica pós-fixada:
 *
 *   fatorPos(n)   = (1 + taxaPosAnual)^(1/252) arredondado 8 casas (O30)
 *   saldoCorrig   = saldo(n-1) * fatorPos^diasUteis                 -- P
 *   jurosPos      = saldoCorrig - saldo(n-1)                         -- Q
 *
 * Nesse caso, o PMT constante é calculado sobre o principal original, e os
 * juros pós são somados como adicional da parcela — mantendo o caráter
 * "quase-constante" em cenário pré, mas com variação mensal em pós.
 */

import { FERIADOS_NACIONAIS, diasCorridos, networkDays, toISODate } from '../feriados/index.js';
import { fatorPosSimples } from '../indices/pos-fixado.js';
import {
  type LinhaAmortizacao,
  type ParametrosOperacao,
  round,
} from './types.js';
import { gerarVencimentos, primeiroVencimentoPadrao } from './_agenda.js';

export function simularPrice(params: ParametrosOperacao): LinhaAmortizacao[] {
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

  // Passo 1: fator operação (soma dos fatores de desconto).
  //   G(n) = 1 / (1+i)^((dataVenc(n) - dataOp)/30)
  //   B36  = Σ G(n)
  let fatorOperacao = 0;
  const fatorDesconto: number[] = [];
  for (let i = 0; i < numeroParcelas; i++) {
    const dc = diasCorridos(dataOp, datas[i]);
    const g = 1 / Math.pow(1 + taxaMensal, dc / 30);
    // Planilha arredonda G a 16 casas — usamos toda a precisão double e
    // somamos; drift fica abaixo de 1 centavo.
    fatorDesconto.push(g);
    fatorOperacao += g;
  }
  const pmtPre = valor / fatorOperacao;

  const tabela: LinhaAmortizacao[] = [];
  let saldoAnterior = valor;

  for (let i = 0; i < numeroParcelas; i++) {
    const dataParc = datas[i];
    const dataAnt = i === 0 ? dataOp : datas[i - 1];
    const diasEntre = diasCorridos(dataAnt, dataParc);

    // Juros pré da parcela
    const jurosPre = saldoAnterior * (Math.pow(1 + taxaMensal, diasEntre / 30) - 1);

    // Componente pós (se houver): capitalização básica sobre saldo
    let jurosPos = 0;
    let saldoCorrigido = saldoAnterior;
    let diasUteis = 0;
    if (taxaPosAnual > 0) {
      diasUteis = networkDays(addOneDay(dataAnt), dataParc, feriados);
      // (1 + taxa_anual)^(diasUteis/252), ROUND 9 — fator pós do período.
      const fatorPos = fatorPosSimples(taxaPosAnual, diasUteis, 9);
      saldoCorrigido = saldoAnterior * fatorPos;
      jurosPos = saldoCorrigido - saldoAnterior;
    }

    // Amortização: PMT pré - juros pré; última parcela fecha resíduo.
    let amortizacao: number;
    if (i === numeroParcelas - 1) {
      amortizacao = saldoAnterior;
    } else {
      amortizacao = pmtPre - jurosPre;
    }

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
