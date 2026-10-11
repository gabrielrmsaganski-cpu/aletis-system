// ============================================================
// FARMS - Calculadora de Viabilidade Agricola v6
// ============================================================

export type FarmsCultura = 'soja' | 'arroz' | 'milho' | 'trigo';

export type FarmsStatus = 'rascunho' | 'pronto' | 'arquivado';

export type FarmsGrupoItem = 'variavel' | 'fixo';

export type FarmsFormulaItem =
  | 'insumo'
  | 'mensal'
  | 'percentual_variavel'
  | 'sacas_ha'
  | 'valor_ha'
  | 'valor_total';

export type FarmsCenarioId = 'pessimista' | 'normal' | 'otimista' | 'excelente';

export interface FarmsItem {
  id: string;
  grupo: FarmsGrupoItem;
  ordem: number;
  centroCusto: string;
  descricao?: string;
  formula: FarmsFormulaItem;
  areaHa?: number;
  coeficiente?: number;
  quantidadePorHa?: number;
  unidade?: string;
  valorUnitario?: number;
  percentual?: number;
  valorTotalManual?: number;
  observacoes?: string;
}

export interface FarmsItemResultado extends FarmsItem {
  areaBaseHa: number;
  quantidadeTotal: number;
  valorPorHa: number;
  valorTotal: number;
  sacasPorHa: number;
}

export interface FarmsCenarioInput {
  id: FarmsCenarioId;
  nome: string;
  produtividadeKgHa: number;
  umidadeImpurezasPct: number;
  secagemPct: number;
  arrendamentoPct: number;
  freteRsSc: number;
  colaboradoresPct: number;
  assistenciaPct: number;
}

export interface FarmsCenarioResultado extends FarmsCenarioInput {
  produtividadeScHa: number;
  producaoBrutaSc: number;
  descontoUmidadeSc: number;
  producaoSecaSc: number;
  secagemSc: number;
  arrendamentoSc: number;
  freteSc: number;
  colaboradoresSc: number;
  assistenciaSc: number;
  disponivelSc: number;
  disponivelRs: number;
  desembolsoSc: number;
  desembolsoRs: number;
  lucroLiquidoSc: number;
  lucroLiquidoRs: number;
  custoTotalScHa: number;
  producaoLiquidaScHa: number;
  lucroScHa: number;
  custoTotalRsHa: number;
  producaoLiquidaRsHa: number;
  lucroRsHa: number;
  custoRsSc: number;
  margemPct: number;
  veredicto: 'viavel' | 'atencao' | 'inviavel';
}

export interface FarmsResultado {
  calculadoEm: string;
  itens: FarmsItemResultado[];
  totalVariavel: number;
  totalFixo: number;
  desembolsoTotal: number;
  desembolsoPorHa: number;
  desembolsoSc: number;
  desembolsoScHa: number;
  pontoEquilibrioScHa: number;
  precoEquilibrioRsSc: number;
  cenarios: FarmsCenarioResultado[];
  melhorCenarioId?: FarmsCenarioId;
  piorCenarioId?: FarmsCenarioId;
  avisos: string[];
}

export interface FarmsPlano {
  id: string;
  clienteId: string;
  nome: string;
  cultura: FarmsCultura;
  safra: string;
  status: FarmsStatus;
  criadoEm: string;
  atualizadoEm: string;
  atualizadoPor?: string;
  origemPlanilha: string;
  areaAplicadaHa: number;
  areaProdutivaHa: number;
  precoBaseRsSc: number;
  unidadeSacaKg: number;
  conversaoSacaParaQq?: number;
  itens: FarmsItem[];
  cenarios: FarmsCenarioInput[];
  observacoes?: string;
  resultado: FarmsResultado;
}

export interface FarmsCreatePayload {
  cultura: FarmsCultura;
  clienteId?: string;
  nome?: string;
  safra?: string;
  areaAplicadaHa?: number;
  areaProdutivaHa?: number;
  precoBaseRsSc?: number;
}

export type FarmsUpdatePayload = Partial<
  Omit<FarmsPlano, 'id' | 'clienteId' | 'criadoEm' | 'origemPlanilha' | 'resultado'>
>;

export interface FarmsListResponse {
  total: number;
  planos: FarmsPlano[];
}
