/**
 * ALETIS Financial Calculation Engine
 *
 * Biblioteca de cálculo financeiro para consultoria agro — reproduz os
 * métodos de cálculo da planilha Sisbr 2.0 / Sicredi
 * (`MÉTODOS DE CÁLCULO.xlsm`) em TypeScript puro, sem side effects.
 *
 * Wave 3 trouxe:
 *   - 8 sistemas de amortização (SAC pré/pós, Price pré/pós, SAC Especial,
 *     Americano, Alemão, Misto)
 *   - tabela completa de 597 feriados nacionais + WORKDAY/NETWORKDAYS
 *   - capitalização pós-fixada por dias úteis (base 252)
 *   - facade `simular()` com indicadores (CET implícito, duração, prazo médio)
 *
 * Para docs da paridade com a planilha, ver `__fixtures__/validacao-planilha.ts`.
 */

// ── Amortização (Wave 3) ────────────────────────────────────
export * from './amortizacao/index.js';

// ── Feriados / dias úteis ──────────────────────────────────
export {
  FERIADOS_NACIONAIS,
  FERIADOS_NACIONAIS_SET,
  networkDays,
  workDay,
  diasCorridos,
  ehDiaUtil,
  toISODate,
} from './feriados/index.js';

// ── Índices pós-fixados ────────────────────────────────────
export type { IndiceDiario } from './indices/pos-fixado.js';
export { fatorPosSimples, fatorPosAcumulado } from './indices/pos-fixado.js';
export type { PontoCDI, ProvedorCDI } from './indices/cdi.js';

// ── Módulos mantidos ───────────────────────────────────────
export * from './cet.js';
export * from './spread.js';
export * from './recalculo.js';
export * from './projecao.js';
export * from './taxas.js';

// ── Compatibilidade retroativa (API Wave 2) ────────────────
// A `simularAmortizacao` antiga e seus tipos são mantidos como re-export
// para não quebrar consumidores. Novos callers devem usar `simular()`.

import type { ParametrosOperacao, SistemaAmortizacao } from './amortizacao/types.js';
import { simular } from './amortizacao/simular.js';

/**
 * @deprecated Use `simular()` com `ParametrosOperacao`. Esta função mantém
 * a assinatura original (Wave 2) apenas para compatibilidade. Ela NÃO
 * considera feriados nem componente pós-fixado. Para cálculo correto com
 * paridade Sisbr 2.0, migre para `simular`.
 */
export interface ParamsAmortizacao {
  valorFinanciado: number;
  taxaMensal: number; // % ao mês (ex: 0.35)
  prazoMeses: number;
  sistema: 'SAC' | 'PRICE' | 'SAC_AJUSTADO';
  dataInicio: string;
  carenciaMeses?: number;
}

/** Linha do formato antigo — não recomendado para novos códigos. */
export interface LinhaAmortizacaoLegacy {
  parcela: number;
  data: string;
  saldoInicial: number;
  juros: number;
  amortizacao: number;
  pagamento: number;
  saldoFinal: number;
}

/**
 * @deprecated Use `simular()` em novos códigos.
 */
export function simularAmortizacao(params: ParamsAmortizacao): LinhaAmortizacaoLegacy[] {
  const sistema: SistemaAmortizacao =
    params.sistema === 'PRICE'
      ? 'PRICE_PRE'
      : params.sistema === 'SAC_AJUSTADO'
      ? 'SAC_PRE'
      : 'SAC_PRE';

  const p: ParametrosOperacao = {
    valor: params.valorFinanciado,
    dataOperacao: params.dataInicio,
    numeroParcelas: params.prazoMeses - (params.carenciaMeses ?? 0),
    periodicidade: 'MENSAL',
    taxaMensal: params.taxaMensal / 100,
    diaVencimento: Number(params.dataInicio.slice(8, 10)) || 1,
    sistema,
  };

  const { tabela } = simular(p);
  return tabela.map((l) => ({
    parcela: l.parcela,
    data: l.data,
    saldoInicial: l.saldoInicial,
    juros: l.jurosPre + l.jurosPos,
    amortizacao: l.amortizacao,
    pagamento: l.pagamento,
    saldoFinal: l.saldoFinal,
  }));
}
