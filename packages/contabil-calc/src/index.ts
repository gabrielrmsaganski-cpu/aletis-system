/**
 * ALETIS Contábil Calc
 *
 * Port TypeScript das 24 LAMBDAs contábeis de
 * `99_98 - Formulas Lambda-EBITDA_v5.xlsx`.
 *
 * Geram os seguintes relatórios a partir de um Plano de Contas
 * + BD_Lancamento (livro-razão):
 *   - Balancete
 *   - Balanço Patrimonial (com variações Ano/Trim/Mês e AV)
 *   - DRE / Lucro Líquido
 *   - EBIT / EBITDA
 *   - EBITDA DRE (resumido por nível)
 *   - EBITDA DRE Completo (hierárquico, com redutores)
 *   - Comparativos Real × Budget × Real₂ (LL e EBITDA)
 *   - Comparativo Anual (mês a mês + trimestral + total)
 *   - Fluxo de Caixa Indireto (DFC)
 *
 * ## Uso
 * ```ts
 * import { ebitda, balancete, type DadosContabeis } from '@aletis/contabil-calc';
 *
 * const dados: DadosContabeis = { planoContas, lancamentos };
 * const rel = balancete(dados, '2026-01-01', '2026-03-31');
 * const ebitdaVal = ebitda(dados, '2026-01-01', '2026-03-31');
 * ```
 */

// Types (dominio)
export type {
  DadosContabeis,
  FCAjusteLL,
  FCClassificacao,
  Lancamento,
  LinhaRelatorio,
  Matriz,
  PlanoContas,
  Relatorio,
} from './types.js';

// Low-level engine
export {
  agregarConta,
  analiseVertical,
  calcularRedutor,
  edate,
  ehAtivo,
  filtrarContas,
  firstMonthOfQuarter,
  firstOfMonth,
  flagFilhosVisuais,
  indentarDescricao,
  isChildOf,
  lastOfMonth,
  matchCodeOrChild,
  particionarContas,
  saldoBrutoPeriodo,
  somaPorConta,
  toISO,
  varPerc,
} from './engine.js';
export type { FiltroPeriodo, FlagRelatorio } from './engine.js';

// Relatórios
export { balancete } from './balancete.js';
export { balanco, engineBalanco } from './balanco.js';
export { dreLucroLiquido, engineAnualLL, engineAnualLLCC, netIncome } from './dre.js';
export {
  comparativoEBITDA,
  contasEBIT,
  contasEBITDA,
  ebit,
  ebitda,
  ebitdaDRE,
  ebitdaDRECompleto,
  engineComparativoEBITDA,
} from './ebit.js';
export {
  comparativoAnual,
  comparativoAnualCC,
  comparativoLucroLiquido,
  engineComparativoLL,
} from './comparativos.js';
export {
  engineFCIndireto,
  engineFCMes,
  fcClassificar,
  fcSaldo,
  fluxoCaixaIndireto,
} from './fluxoCaixa.js';
export type { LinhaFCIndireto } from './fluxoCaixa.js';

// Balanced Scorecard Agro (Wave 8a)
export { BSC_KPIS, calcularBSC, listarKpis, listarPorPerspectiva } from './bsc.js';
