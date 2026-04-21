/**
 * Tipos compartilhados entre os sistemas de amortização.
 *
 * Portados da planilha `MÉTODOS DE CÁLCULO.xlsm` (Sisbr 2.0 / Sicredi).
 */

export type Periodicidade =
  | 'MENSAL'
  | 'BIMESTRAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL';

/** Quantidade de meses a avançar entre parcelas para cada periodicidade. */
export const MESES_POR_PERIODICIDADE: Readonly<Record<Periodicidade, number>> = {
  MENSAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
};

export type SistemaAmortizacao =
  | 'SAC_PRE'
  | 'SAC_POS'
  | 'PRICE_PRE'
  | 'PRICE_POS'
  | 'SAC_ESPECIAL'
  | 'AMERICANO'
  | 'ALEMAO'
  | 'MISTO';

/**
 * Linha canônica de uma tabela de amortização.
 *
 * - `jurosPos` só é diferente de zero quando o sistema é pós-fixado.
 * - `saldoCorrigido` = saldo após aplicação da remuneração básica (pós-fixado).
 *   Para operações 100% pré-fixadas, é igual a `saldoInicial`.
 */
export interface LinhaAmortizacao {
  parcela: number;
  data: string; // YYYY-MM-DD
  diasCorridos: number; // entre parcela anterior e esta
  diasUteis: number; // desde a data da operação
  saldoInicial: number;
  saldoCorrigido: number;
  jurosPos: number;
  jurosPre: number;
  amortizacao: number;
  pagamento: number;
  saldoFinal: number;
}

/**
 * Parâmetros de entrada unificados para `simular()`.
 *
 * Campos pós-fixados (`taxaPosAnual`, `indiceDiario`) são opcionais e só
 * relevantes para sistemas `*_POS` / `MISTO`. Injeção de dependência pura —
 * nenhuma chamada HTTP neste package.
 */
export interface ParametrosOperacao {
  /** Valor principal em BRL. */
  valor: number;
  /** Data da operação (ISO `YYYY-MM-DD`). */
  dataOperacao: string;
  /** Número de parcelas. */
  numeroParcelas: number;
  /** Periodicidade das parcelas (default `MENSAL`). */
  periodicidade?: Periodicidade;
  /** Taxa pré-fixada ao mês, em decimal (ex: 0.0035 = 0.35% a.m.). */
  taxaMensal: number;
  /** Taxa pós-fixada ao ano em decimal (ex: 0.1415 = 14.15% a.a.). Opcional. */
  taxaPosAnual?: number;
  /** Dia do mês de pagamento (1..31). Ajustado para próximo dia útil. */
  diaVencimento: number;
  /** Data do primeiro vencimento. Se omitida, calculada a partir da data da operação. */
  primeiroVencimento?: string;
  /** Sistema de amortização. */
  sistema: SistemaAmortizacao;
  /** Feriados (default: FERIADOS_NACIONAIS). */
  feriados?: readonly string[];
  /**
   * Tabela de amortizações customizadas por parcela (SAC_ESPECIAL / MISTO).
   * O tamanho deve ser igual a `numeroParcelas`. Soma deve bater com `valor`.
   */
  amortizacoesCustomizadas?: readonly number[];
  /** Carência de amortização em meses (durante, só juros). */
  carenciaMeses?: number;
}

/** Indicadores agregados de uma simulação. */
export interface IndicadoresAmortizacao {
  totalPago: number;
  totalJuros: number;
  totalJurosPos: number;
  totalJurosPre: number;
  totalAmortizado: number;
  /** Prazo médio ponderado pela amortização (meses). */
  prazoMedio: number;
  /** Duração (duration) — média ponderada pelo valor presente das parcelas. */
  duracao: number;
  /** Taxa efetiva mensal implícita (IRR mensal, em decimal). */
  taxaEfetivaMensal: number;
  /** Taxa efetiva anual implícita (em decimal). */
  taxaEfetivaAnual: number;
}

export interface ResultadoSimulacao {
  sistema: SistemaAmortizacao;
  parametros: ParametrosOperacao;
  tabela: LinhaAmortizacao[];
  indicadores: IndicadoresAmortizacao;
}

// ── Utilitários de precisão ─────────────────────────────────

/** Arredonda para `decimals` casas — evita drift de ponto flutuante. */
export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * TRUNC do Excel: trunca (não arredonda) para `decimals` casas.
 * Usado para reproduzir `=TRUNC((1+taxa)^(1/30),8)` da planilha.
 */
export function trunc(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) return value;
  const factor = Math.pow(10, decimals);
  return Math.trunc(value * factor) / factor;
}
