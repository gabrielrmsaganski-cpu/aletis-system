/**
 * Sistema SAC (Sistema de Amortização Constante) — pré e pós-fixado.
 *
 * Portado da aba `SAC Decrescente Pré e Pós` de `MÉTODOS DE CÁLCULO.xlsm`.
 *
 * Fórmulas equivalentes às da planilha:
 *   fatorDiarioPre = TRUNC((1 + taxaMensal)^(1/30), 8)        -- B38
 *   diasUteis(n)   = NETWORKDAYS(dataOp+1, dataVenc(n))       -- H
 *   fatorPos(n)    = ROUND((1 + taxaPosAnual)^(diasUteis/252), 9) -- I
 *   saldoCorrig(n) = saldoAnterior * fatorPos(n)              -- J
 *   jurosPos(n)    = saldoCorrig(n) - saldoAnterior           -- K
 *   jurosPre(n)    = saldoCorrig(n) * (fatorDiarioPre^G - 1)  -- L   (G = dias corridos entre parcelas)
 *   amort(n)       = valorOp / numParcelas                    -- M
 *   parcela(n)     = amort + jurosPre + jurosPos              -- N
 *   novoSaldo(n)   = saldoAnterior - amort                    -- O
 *
 * Observação: a amortização é calculada sobre o valor da operação ORIGINAL
 * (não sobre saldo corrigido), mantendo constante ao longo das parcelas
 * — exatamente como o Sisbr 2.0 faz.
 */

import { FERIADOS_NACIONAIS, networkDays, toISODate, diasCorridos } from '../feriados/index.js';
import { fatorPosSimples } from '../indices/pos-fixado.js';
import {
  type LinhaAmortizacao,
  type ParametrosOperacao,
  round,
  trunc,
} from './types.js';
import { gerarVencimentos, primeiroVencimentoPadrao } from './_agenda.js';

/**
 * Gera a tabela SAC (Sistema Decrescente) — pré ou pós-fixado.
 *
 * Quando `taxaPosAnual` não for informada (ou for zero), o sistema funciona
 * como SAC 100% pré-fixado (juros pós = 0 em toda linha).
 */
export function simularSAC(params: ParametrosOperacao): LinhaAmortizacao[] {
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

  // Fator diário pré-fixado — TRUNC com 8 casas, exatamente como B38 da planilha.
  const fatorDiarioPre = trunc(Math.pow(1 + taxaMensal, 1 / 30), 8);
  const amortConstante = valor / numeroParcelas;

  const tabela: LinhaAmortizacao[] = [];
  let saldoAnterior = valor;

  for (let i = 0; i < numeroParcelas; i++) {
    const dataParc = datas[i];
    const dataAnterior = i === 0 ? dataOp : datas[i - 1];

    // G: dias corridos entre a parcela anterior e a atual
    const diasEntre = diasCorridos(dataAnterior, dataParc);
    // H: dias úteis incrementais entre parcela anterior e atual
    // (para a 1ª parcela, desde dataOperacao+1 até a data da parcela).
    const diasUteis = networkDays(addOneDay(dataAnterior), dataParc, feriados);

    // Fator pós: (1 + taxaPosAnual)^(diasUteis/252), ROUND 9
    const fatorPos = taxaPosAnual > 0 ? fatorPosSimples(taxaPosAnual, diasUteis, 9) : 1;

    // J: saldo corrigido = saldo anterior * fator pós
    const saldoCorrigido = saldoAnterior * fatorPos;
    // K: juros pós (capitalização básica)
    const jurosPos = saldoCorrigido - saldoAnterior;
    // L: juros pré calculados sobre saldo corrigido pelo fator diário pré
    const jurosPre = saldoCorrigido * (Math.pow(fatorDiarioPre, diasEntre) - 1);

    // Na última parcela, ajusta a amortização para quitar o saldo restante
    // (evita resíduos de arredondamento).
    const amortizacao = i === numeroParcelas - 1 ? saldoAnterior : amortConstante;
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

/** Adiciona 1 dia corrido a uma data ISO. */
function addOneDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return toISODate(dt);
}
