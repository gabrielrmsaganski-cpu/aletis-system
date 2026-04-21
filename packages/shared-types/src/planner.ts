// ============================================================
// ALETIS — Planner Financeiro Anual (orçado vs realizado)
// ============================================================
//
// Tabela mensal por categoria usada pelo consultor para acompanhar
// o plano financeiro do produtor ao longo do ano-safra. Cada linha
// representa uma categoria (receita ou custo) e contém 12 valores
// orçados e 12 realizados — jan..dez.
//
// Persistido em `apps/api/storage/planner/{clienteId}_{ano}.json`
// (um arquivo por cliente-ano). Cálculos agregados são feitos em
// `PlannerService.calcularResumo` a partir desses números.
// ============================================================

/**
 * Categoria financeira do planner. Inclui receitas (agrícola,
 * pecuária, outras) e custos/despesas do produtor rural.
 */
export type CategoriaPlanner =
  | 'receita_agricola'
  | 'receita_pecuaria'
  | 'receita_outras'
  | 'custo_insumos'
  | 'custo_mao_obra'
  | 'custo_servicos'
  | 'custo_combustivel'
  | 'despesa_administrativa'
  | 'despesa_financeira'
  | 'impostos_taxas'
  | 'investimento';

/**
 * Linha individual do planner.
 * - `orcado` e `realizado` têm length fixa = 12 (jan..dez).
 * - Valores em BRL.
 */
export interface LinhaPlanner {
  categoria: CategoriaPlanner;
  /** Descrição livre (ex: "Soja safra 2025/26", "Fertilizantes"). */
  descricao: string;
  /** Valores orçados — length 12, jan..dez. */
  orcado: number[];
  /** Valores realizados — length 12, jan..dez. */
  realizado: number[];
}

/**
 * Documento completo do planner anual.
 */
export interface PlannerFinanceiroAnual {
  id: string;
  clienteId: string;
  ano: number;
  linhas: LinhaPlanner[];
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Resumo calculado sob demanda pelo serviço.
 * Contém totais anuais + vetor mensal de resultado + variação e
 * índice de cumprimento do orçamento.
 */
export interface ResumoPlanner {
  ano: number;
  totalReceitaOrcada: number;
  totalReceitaRealizada: number;
  totalCustoOrcado: number;
  totalCustoRealizado: number;
  /** Resultado orçado por mês (receita - custo) — length 12. */
  resultadoOrcado: number[];
  /** Resultado realizado por mês — length 12. */
  resultadoRealizado: number[];
  /** Variação percentual da receita realizada vs orçada (100 * (R - O) / O). */
  variacaoReceitaPct: number;
  /** Variação percentual do custo realizado vs orçado. */
  variacaoCustoPct: number;
  /** Meses em que o resultadoRealizado[i] < 0. */
  mesesCriticos: number[];
  /** 0-100 — quanto % do orçamento foi batido/cumprido. */
  indiceCumprimento: number;
}

/** Payload aceito por `PUT /api/planner/:clienteId/:ano`. */
export interface PlannerPutPayload {
  linhas: LinhaPlanner[];
  observacoes?: string;
}

/**
 * Payload do PATCH célula-única.
 * `PATCH /api/planner/:clienteId/:ano/linha/:categoria/:mes`.
 * `mes` é 1..12 (humano) — o service converte pra índice 0..11.
 */
export interface PlannerCellPatchPayload {
  valor: number;
  tipo: 'orcado' | 'realizado';
}
