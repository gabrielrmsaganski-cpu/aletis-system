// ============================================================
// ALETIS — Calculadora Funrural 2026
// ============================================================
//
// Tipos canonicos para o módulo Funrural (contribuição
// previdenciária rural). Base legal:
//   - Lei 8.212/91 art. 25 (contribuição sobre receita bruta da
//     comercialização rural)
//   - Lei 10.256/2001 (empregador rural PJ)
//   - Lei 13.606/2018 (reduz alíquota do produtor rural PF de 2,0%
//     para 1,2% previdência — atualmente consolidada em 1,5%)
//   - STF Tema 916 (pacificou a constitucionalidade da contribuição
//     sobre a receita bruta para o produtor rural PF)
//
// Regra geral:
//   - Produtor PF pode optar anualmente entre recolher sobre:
//       (a) receita bruta da comercialização  → 1,8% total
//       (b) folha de pagamento                 → 20% + RAT + 0,25% SENAR
//   - Agroindústria: sempre sobre receita bruta (2,05% total).
//   - Adquirente (frigorífico, cooperativa, laticínio) retém 1,8%
//     na fonte ao pagar o produtor PF.
//
// Convenções:
//   - Alíquotas expressas em fração (0.015 = 1,5%).
//   - Valores monetários em BRL.
// ============================================================

/**
 * Tipo de contribuinte para Funrural.
 *
 * - `PF`                 → produtor rural pessoa física.
 * - `PJ_empregador_rural`→ empregador rural PJ (Lei 10.256/2001).
 * - `agroindustria`      → industrializa produção própria / de
 *                          terceiros. Não pode optar folha.
 * - `adquirente`         → responsável tributário que retém na
 *                          fonte ao pagar o produtor PF.
 */
export type TipoContribuinte =
  | 'PF'
  | 'PJ_empregador_rural'
  | 'agroindustria'
  | 'adquirente';

/** Cenário de entrada para cálculo do Funrural. */
export interface CenarioFunrural {
  tipo: TipoContribuinte;
  /** Receita bruta anual de comercialização rural (BRL). */
  receitaBrutaAnual: number;
  /** Folha de pagamento anual (salários + encargos). (BRL). */
  folhaPagamentoAnual: number;
  /**
   * Grau de risco para fins de RAT / SAT. Multiplica a alíquota
   * base de 1% sobre folha (1=leve, 2=médio, 3=grave).
   */
  ratMultiplicador: 1 | 2 | 3;
  /**
   * Só relevante para PF: se true, força opção por folha
   * mesmo quando a receita for mais vantajosa (PF pode optar
   * anualmente, inclusive de forma subótima).
   */
  optouFolha?: boolean;
}

/**
 * Detalhe do cálculo por caminho (receita vs folha).
 *
 * `aliquotaDetalhe` reproduz as 3 componentes legais que somam
 * a alíquota efetiva:
 *   - previdência (SS/INSS)
 *   - RAT (riscos ambientais do trabalho)
 *   - SENAR (Serviço Nacional de Aprendizagem Rural)
 */
export interface OpcaoFunrural {
  /** Base de cálculo (receita ou folha). */
  base: number;
  /** Alíquota total efetiva (fração). */
  aliquotaTotal: number;
  aliquotaDetalhe: {
    previdencia: number;
    rat: number;
    senar: number;
  };
  /** Valor devido (base × aliquotaTotal). */
  total: number;
}

/** Resultado do cálculo com comparativo e recomendação. */
export interface ResultadoFunrural {
  tipo: TipoContribuinte;
  ano: number;
  opcaoReceita: OpcaoFunrural;
  opcaoFolha: OpcaoFunrural;
  /**
   * Qual caminho sai mais barato.
   * Para `agroindustria` e `adquirente`, sempre `receita`.
   */
  melhorOpcao: 'receita' | 'folha';
  /** Diferença absoluta entre a pior e a melhor opção (BRL). */
  economia: number;
  observacoes: string[];
  baseLegal: string[];
}
