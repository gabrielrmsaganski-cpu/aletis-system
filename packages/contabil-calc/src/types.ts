/**
 * ALETIS — Contábil Calc — Types
 *
 * Domain types for bookkeeping reports derived from a chart-of-accounts
 * (Plano de Contas) + general ledger (BD_Lancamento).
 *
 * Ported from `99_98 - Formulas Lambda-EBITDA_v5.xlsx` (24 LAMBDAs).
 */

/**
 * A chart-of-accounts row.
 *
 * In the source spreadsheet:
 *   A=Código, B=Descrição, C=Cod+Descrição, D=Caracteres,
 *   E=EBITDA, F=EBIT, G=NET INCOME,
 *   H=BALANCETE, I=BALANÇO, J=LUCROLIQUIDO
 *
 * `caracteres` = hierarchical depth (1, 3, 5, 7, 9, 11, 13).
 */
export interface PlanoContas {
  codigo: string; // e.g. "1.1.1.01.0002"
  descricao: string;
  caracteres: number;
  balancete: boolean;
  balanco: boolean;
  ebitda: boolean;
  ebit: boolean;
  lucroLiquido: boolean;
  /** Optional — only present in some of the source sheets. */
  netIncome?: boolean;
}

/**
 * A ledger entry (partida simples). Every row carries a single
 * debit OR credit amount (the other side is 0).
 */
export interface Lancamento {
  /** ISO `YYYY-MM-DD`. */
  data: string;
  /** Conta2 — the account code only (no description suffix). */
  contaCodigo: string;
  debito: number;
  credito: number;
  centroCusto?: string;
  historico?: string;
}

/**
 * Classification row used by the indirect cash flow engine
 * (table `FC_Classificacao`).
 *
 * Sections:
 *   - "Operacional"   — operating cash flow (CFO)
 *   - "Investimento"  — investing (CFI)
 *   - "Financiamento" — financing (CFF)
 *   - "Caixa"         — cash / cash equivalents
 *   - "Excluir"       — explicit exclusion (e.g. P&L accounts already in LL)
 */
export interface FCClassificacao {
  conta: string; // account code or prefix
  secao: 'Operacional' | 'Investimento' | 'Financiamento' | 'Caixa' | 'Excluir' | string;
  grupo: string;
  ordem: number;
}

/**
 * Ajuste ao Lucro Líquido (e.g. depreciation reversal).
 */
export interface FCAjusteLL {
  conta: string;
  grupo: string;
  ordem: number;
}

/**
 * Dataset grouping the three operational tables. All exported
 * functions accept this as their first argument.
 */
export interface DadosContabeis {
  planoContas: PlanoContas[];
  lancamentos: Lancamento[];
  /** Opcional — `Razao_Budget` no source. */
  lancamentosBudget?: Lancamento[];
  /** Opcional — necessário para fluxo de caixa indireto. */
  fcClassificacao?: FCClassificacao[];
  /** Opcional — ajustes ao LL em fluxo de caixa indireto. */
  fcAjustesLL?: FCAjusteLL[];
  /**
   * Minimum caracteres for a `Plano_Contas` row to be treated
   * as analytical (folha). Default 13.
   */
  minCharsAnalitica?: number;
}

/**
 * A single output row of a report. `valores` length varies by
 * report (balancete=4, DRE=1, balanço=27, comparativos=7…).
 */
export interface LinhaRelatorio {
  /** Account code, OR "TOTAL"/"EBITDA"/"LUCRO LÍQUIDO" for footer rows. */
  conta: string;
  /** Already indented (`REPT("  ", n)` applied). */
  descricao: string;
  valores: Array<number | string>;
}

/**
 * A 2D tabular report with a header + body + optional footer.
 */
export interface Relatorio {
  cabecalho: string[];
  corpo: LinhaRelatorio[];
  rodape?: LinhaRelatorio;
}

/**
 * A simpler spreadsheet-style result (raw 2D matrix) — used by
 * engines that compose reports (AA_ENGINE_BLOCO_ANUAL etc.).
 */
export type Matriz = Array<Array<number | string>>;
