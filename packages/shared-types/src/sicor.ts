// ============================================================
// ALETIS — SICOR (BCB OLINDA OData v2) — Tipos canônicos
// ============================================================
//
// Sistema de Operações do Crédito Rural (SICOR) — Bacen.
// Cobre três modalidades expostas via OData no portal OLINDA:
//   • Custeio         (EntitySet: CusteioRegiaoUFProduto)
//   • Investimento    (EntitySet: InvestRegiaoUFProduto)
//   • Comercialização (EntitySet: ComercRegiaoUFProduto)
//
// Os registros já são agregados por (ano, mês, UF, produto,
// programa, subprograma, fonte de recurso, modalidade, atividade)
// — NÃO contêm dados identificáveis do produtor.
//
// Docs: https://olinda.bcb.gov.br/olinda/servico/SICOR/versao/v2
// ============================================================

/** Modalidade do contrato de crédito rural. */
export type ModalidadeSicor = 'custeio' | 'investimento' | 'comercializacao';

/** Origem dos dados retornados (telemetria). */
export type FonteDadosSicor = 'api' | 'cache' | 'fallback';

/**
 * Registro agregado de contratos SICOR por UF/produto/mês.
 * Moeda sempre em BRL. Qtd representa nº de contratos.
 */
export interface ContratoSicor {
  modalidade: ModalidadeSicor;
  nomeProduto: string;
  nomeRegiao: string;
  /** UF em 2 letras (ex: "MT", "PR"). */
  nomeUF: string;
  /** Ano de emissão (ex: "2025"). */
  anoEmissao: string;
  /** Mês de emissão (01..12, zero-padded). */
  mesEmissao: string;
  /** Código do programa (ex: Pronaf, Pronamp, etc). */
  cdPrograma: string;
  cdSubPrograma: string;
  /** Código da fonte de recursos (ex: 0300 = poupança rural). */
  cdFonteRecurso: string;
  /** Tipo de seguro (PROAGRO, SEAF, etc). */
  cdTipoSeguro: string;
  /** Quantidade de contratos no agregado. */
  qtdContratos: number;
  /** Valor total emitido em BRL. */
  valorContratado: number;
  /** Área financiada em hectares (quando aplicável — custeio). */
  areaFinanciada: number | null;
  /** Atividade (1 = agrícola, 2 = pecuária, ...). */
  atividade: string;
  cdModalidade: string;
}

/** Parâmetros comuns de consulta às modalidades SICOR. */
export interface ParametrosConsultaSicor {
  /** Filtro >= AAAAMM. Ex: "202501". */
  anoMesInicial?: string;
  /** Filtro <= AAAAMM. Ex: "202512". */
  anoMesFinal?: string;
  /** Sigla da UF (ex: "MT"). */
  uf?: string;
  /** Nome do produto (ex: "SOJA"). Case-insensitive. */
  produto?: string;
  /** Limite de registros (default 500, máx 5000). */
  top?: number;
  /** Paginação: skip N registros. */
  skip?: number;
}

/** Envelope padrão de resposta para consultas SICOR. */
export interface RespostaConsultaSicor {
  modalidade: ModalidadeSicor;
  contratos: ContratoSicor[];
  total: number;
  valorTotal: number;
  areaTotalHa: number;
  ticketMedio: number;
  filtros: ParametrosConsultaSicor;
  fonte: FonteDadosSicor;
  atualizadoEm: string;
}

/** Resumo consolidado por UF/ano em todas as modalidades. */
export interface ResumoSicorUfAno {
  uf: string;
  ano: number;
  /** Volume total (soma das 3 modalidades) em BRL. */
  valorTotalBRL: number;
  /** Nº total de contratos. */
  totalContratos: number;
  /** Ticket médio por contrato em BRL. */
  ticketMedioBRL: number;
  /** Quebra por modalidade. */
  porModalidade: {
    modalidade: ModalidadeSicor;
    valorBRL: number;
    contratos: number;
    participacaoPercentual: number;
  }[];
  /** Top produtos por valor (até 10). */
  topProdutos: {
    produto: string;
    valorBRL: number;
    contratos: number;
    participacaoPercentual: number;
  }[];
  fonte: FonteDadosSicor;
  atualizadoEm: string;
  observacoes?: string;
}
