/**
 * Types contábeis compartilhados entre `@aletis/contabil-calc`, a API e o
 * frontend. Eles devem ser re-exportados a partir de
 * `packages/shared-types/src/index.ts`.
 *
 * Pareados com `@aletis/contabil-calc/src/types.ts` — mantenha em sincronia
 * quando adicionar flags ou campos.
 */

/**
 * Uma linha do Plano de Contas.
 *
 * `caracteres` = profundidade hierárquica (1, 3, 5, 7, 9, 11, 13).
 */
export interface PlanoContasDTO {
  codigo: string;
  descricao: string;
  caracteres: number;
  balancete: boolean;
  balanco: boolean;
  ebitda: boolean;
  ebit: boolean;
  lucroLiquido: boolean;
  netIncome?: boolean;
}

/** Uma partida do livro-razão. */
export interface LancamentoDTO {
  data: string; // ISO YYYY-MM-DD
  contaCodigo: string;
  debito: number;
  credito: number;
  centroCusto?: string;
  historico?: string;
}

/** Classificação de uma conta no Fluxo de Caixa Indireto. */
export interface FCClassificacaoDTO {
  conta: string;
  secao: 'Operacional' | 'Investimento' | 'Financiamento' | 'Caixa' | 'Excluir' | string;
  grupo: string;
  ordem: number;
}

/** Ajuste ao Lucro Líquido (ex: reverter depreciação). */
export interface FCAjusteLLDTO {
  conta: string;
  grupo: string;
  ordem: number;
}

/** Dados agregados — payload completo para chamar qualquer relatório. */
export interface DadosContabeisDTO {
  planoContas: PlanoContasDTO[];
  lancamentos: LancamentoDTO[];
  lancamentosBudget?: LancamentoDTO[];
  fcClassificacao?: FCClassificacaoDTO[];
  fcAjustesLL?: FCAjusteLLDTO[];
  minCharsAnalitica?: number;
}

/** Linha de um relatório tabular. */
export interface LinhaRelatorioDTO {
  conta: string;
  descricao: string;
  valores: Array<number | string>;
}

/** Relatório tabular (Balancete, DRE, Balanço, etc.). */
export interface RelatorioDTO {
  cabecalho: string[];
  corpo: LinhaRelatorioDTO[];
  rodape?: LinhaRelatorioDTO;
}

/**
 * Enumeração dos relatórios contábeis expostos pela API. Útil para o
 * backend decidir qual função de `@aletis/contabil-calc` chamar a partir
 * de um endpoint genérico `POST /contabil/relatorio`.
 */
export type CategoriaRelatorioContabil =
  | 'balancete'
  | 'balanco'
  | 'dre_lucro_liquido'
  | 'ebitda_dre'
  | 'ebitda_dre_completo'
  | 'comparativo_lucro_liquido'
  | 'comparativo_ebitda'
  | 'comparativo_anual'
  | 'comparativo_anual_cc'
  | 'fluxo_caixa_indireto'
  | 'ebit'
  | 'ebitda'
  | 'net_income';

/** Requisição genérica de relatório. */
export interface PedidoRelatorioContabil {
  categoria: CategoriaRelatorioContabil;
  dtIni?: string;
  dtFim?: string;
  dtIni2?: string;
  dtFim2?: string;
  ano?: number;
  centroCusto?: string;
  /** Para `ebitda_dre` (Ncarac_conta_contabil). */
  nCaracMin?: number;
}

/** Resultado — relatório (padrão) ou número (EBIT, EBITDA, Net Income). */
export type ResultadoRelatorioContabil = RelatorioDTO | { valor: number };
