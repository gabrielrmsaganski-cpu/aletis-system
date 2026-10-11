// ============================================================
// ALETIS — Plano Simples de Custeio Agrícola 2026
// ============================================================
//
// Schema canonico baseado na planilha oficial
//   "P. Simples - Custeio Agrícola V. 1.1_2026.xlsm"
// usada por bancos (BNDES/Sicredi/cooperativas) para pleito de
// crédito de custeio rural de uma safra.
//
// Referência de extração:
//   /home/azureai/ALETIS/inbox/_extracted/
//     P. Simples - Custeio Agrícola V. 1.1_2026.xlsm.md
//
// A planilha tem 3 abas visíveis (1-Empreendimento,
// 2-Perímetro(s)_Imóvel(s), 3-Glebas_Coord.) + 5 ocultas
// (Importação, Hortaliças, Croqui, Coordenadas, Controle).
// Este schema cobre as três visíveis e o subset de Importação
// necessário para a submissão bancária.
//
// Convenções:
//  - CPF/CNPJ sem máscara (apenas dígitos).
//  - Área em hectares (ha). Valores monetários em BRL.
//  - Datas ISO-8601 (YYYY-MM-DD). Timestamps ISO completos.
//  - Coordenadas em graus decimais (WGS84).
// ============================================================

// ── Tipos base ────────────────────────────────────────────

/** Safra agrícola no formato consagrado: "2025/26" ou curto "25/26". */
export type Safra = string;

/** Status do plano no fluxo ALETIS (rascunho → banco). */
export type StatusPlanoCusteio =
  | 'rascunho'
  | 'em_analise'
  | 'aprovado'
  | 'rejeitado';

/** Ciclo de cultivo — `1-Empreendimento!B87` (dropdown da planilha). */
export type CicloCultivo = 'Temporário' | 'Permanente';

/** Tipo de pessoa — `1-Empreendimento!N6`. */
export type TipoPessoa = 'PF' | 'PJ';

/** Serviço prestado pela empresa de ATER — `1-Empreendimento!S8`. */
export type ServicoAter =
  | 'Elaboração PS'
  | 'Elaboração PS + orientação'
  | 'Nenhum'
  | string; // livre para cobrir variações regionais

/** Finalidade da gleba — `3-Glebas_Coord.` / fase de utilização. */
export type FinalidadeGleba =
  | 'custeio'
  | 'investimento'
  | 'comercializacao';

/** Fase da despesa no cronograma (campo `F96..F215`). */
export type FaseDespesa =
  | 'Insumo pré-plantio/ plantio'
  | 'Insumo tratos culturais'
  | 'Insumo colheita'
  | 'Serviço pré-plantio/ plantio'
  | 'Serviço tratos culturais'
  | 'Serviço colheita'
  | 'ATER - Elaboração PS'
  | 'ATER - Elaboração PS + orientação';

/** Categoria macro — agrega itens para resumo financeiro. */
export type CategoriaItem =
  | 'sementes'
  | 'fertilizantes'
  | 'defensivos'
  | 'combustivel'
  | 'arrendamento'
  | 'servicos_maquinas'
  | 'mao_obra'
  | 'seguros'
  | 'financeiras'
  | 'ater'
  | 'outros';

/** Fonte de recurso — `Lista_Fonte_Recurso` da planilha (AW4:AW6). */
export type FonteRecurso =
  | 'Próprio'
  | 'Financiado'
  | 'Outro';

/** Regime de exploração da área — `1-Empreendimento!R16`. */
export type RegimeExploracao =
  | 'proprietario'
  | 'arrendatario'
  | 'parceiro'
  | 'comodatario'
  | 'posseiro';

// ── Proponente ─────────────────────────────────────────────

/**
 * Dados do produtor/grupo solicitante do crédito.
 * Mapeia `1-Empreendimento!B6..S10` (bloco superior).
 */
export interface DadosProponente {
  nome: string;                 // B6
  tipo: TipoPessoa;             // N6
  cpfCnpj?: string;             // S6 (opcional; dígitos apenas quando disponível)
  email?: string;               // E7
  telefone1?: string;           // L7
  telefone2?: string;           // Q7
  /** Empresa de Assistência Técnica e Extensão Rural — B8..Q8. */
  ater?: {
    nomeEmpresa?: string;       // B8
    cnpj?: string;              // L8
    servicoPrestado?: ServicoAter; // S8
    /** CPF do técnico responsável (Importação.C7). */
    cpfTecnico?: string;
  };
  /**
   * Grupo econômico/cooperativa ao qual o produtor pertence.
   * Campo livre — a planilha original não o expõe diretamente, mas
   * bancos e cooperativas rotineiramente exigem essa rastreabilidade.
   */
  grupo?: string;
}

// ── Imóvel ─────────────────────────────────────────────────

/**
 * Imóvel rural onde o recurso será aplicado.
 * A planilha aceita múltiplos imóveis (linhas `1-Empreendimento!16..35`).
 * Aqui cada `PlanoCusteio` referencia N imóveis.
 */
export interface ImovelRural {
  id: string;
  /** Nome informal do imóvel — B16. */
  nome: string;
  /** Matrícula do Registro de Imóveis — F16. */
  matricula?: string;
  /** NIRF/CIB — H16 (8 caracteres). */
  nirfCib?: string;
  /** CAR — Cadastro Ambiental Rural (C68..C87 do mapping Importação). */
  car?: string;
  /** SNCR — N16. */
  sncr?: string;
  /** Área total do imóvel, em hectares — T16. */
  areaTotalHa: number;
  /** Área beneficiada (declarada pela planilha) — U16. */
  areaBeneficiadaHa?: number;
  /** Regime de exploração — R16. */
  regimeExploracao: RegimeExploracao;
  municipio: string;            // (Cód_município — VLOOKUP)
  uf: string;                   // 2 letras
  codigoIbge?: string;
  /** Altitude média do imóvel — `2-Perímetro!A4`. */
  altitudeMedia?: number;
  /** Pontos do perímetro (polígono) — lat/lon WGS84. */
  perimetro?: PontoCoordenada[];
}

export interface PontoCoordenada {
  /** Número do ponto no polígono (1..N). */
  ponto: number;
  latitude: number;
  longitude: number;
  /** Altitude em metros (opcional — `3-Glebas_Coord.` colunas D/G/J/...). */
  altitude?: number;
}

// ── Gleba ──────────────────────────────────────────────────

/**
 * Gleba — unidade de área dentro do imóvel onde a cultura é plantada.
 * Mapeia `3-Glebas_Coord.` (até 15 glebas, colunas B/E/H/K/N/Q/T/W/Z/AC/AF/AI/AL/AO/AR).
 *
 * A planilha original pede 4 a 57 pontos de coordenadas por gleba.
 * Aqui armazenamos opcionalmente os pontos; o centróide é computado
 * no cálculo de indicadores.
 */
export interface Gleba {
  id: string;
  nomeGleba: string;            // Ex: "Gleba 1"
  imovelId: string;             // FK para ImovelRural.id
  /** Cultura — `1-Empreendimento!D87` (lista longa: soja, milho 1a/2a, algodão, etc). */
  cultura: string;
  /** Variedade/cultivar, quando informado (ZARC). */
  cultivar?: string;
  /** Área da gleba em ha — `1-Empreendimento!T16` por linha. */
  areaHa: number;
  /** Finalidade — normalmente 'custeio' para esta planilha. */
  finalidade: FinalidadeGleba;
  /** Pontos da gleba (4..57 pontos). */
  coordenadas?: PontoCoordenada[];
  /** Centróide pré-calculado (lat/lon + raio aprox.). */
  centroide?: {
    lat: number;
    lon: number;
    raioKm?: number;
  };
  /**
   * Ciclo de produção (ex: "2025-10 a 2026-03"). Derivado de
   * `1-Empreendimento!B221/D221` (datas de plantio/colheita).
   */
  cicloProducao?: string;
  /** Data de início de plantio/tratos — B221. */
  dataInicio?: string;
  /** Data de fim de plantio/colheita — D221 / H221. */
  dataFim?: string;
  /** Sistema de plantio — E89 (direto, convencional, mínimo, etc). */
  sistemaPlantio?: string;
  /** Irrigação — M87. */
  irrigacao?: string;
  /** Mecanização — K89. */
  mecanizacao?: string;
  /** Textura do solo — N89. */
  texturaSolo?: string;
}

// ── Orçamento ──────────────────────────────────────────────

/**
 * Item do orçamento — cada linha de `1-Empreendimento!96..215`.
 * Um plano tem até 120 itens (planilha limita nessa faixa).
 */
export interface ItemOrcamento {
  id: string;
  categoria: CategoriaItem;
  /** Fase no cronograma (Insumo pré-plantio, Serviço tratos, ATER, etc). */
  fase: FaseDespesa;
  descricao: string;            // B96..B215
  unidade: string;              // I96..I215 (kg, l, ha, h/m, sc, etc)
  quantidade: number;           // J96..J215
  /** Preço unitário bruto — K96..K215. */
  precoUnitario: number;
  /** Total bruto = quantidade * precoUnitario (L = K*J). */
  valorTotal: number;
  /** Parcela financiada (Q = O - S) — valor solicitado ao banco. */
  valorFinanciado?: number;
  /** Contrapartida/recursos próprios (S). */
  valorProprio?: number;
  /** Gleba à qual se refere (opcional — se global, deixar vazio). */
  glebaId?: string;
  observacao?: string;
}

// ── Cronograma de desembolso ──────────────────────────────

/**
 * Cronograma de liberação dos recursos pelo banco.
 * Mapeia `1-Empreendimento!G226..Q228` (Imediata / pré-plantio /
 * tratos / colheita) e `Importação!C247..C252`.
 */
export interface DesembolsoParcela {
  id: string;
  fase: 'Pré-plantio/plantio' | 'Tratos culturais' | 'Colheita' | 'Outra';
  /** Data prevista (ou "Imediata" convertida por regra da planilha). */
  dataPrevista: string;
  valor: number;
  descricao?: string;
}

// ── Projeto: fontes de recurso e totais ───────────────────

/**
 * Dados gerais do projeto — fontes, valor solicitado, contrapartida.
 * Mapeia `1-Empreendimento!L221/N221/R221/T221` (receita bruta,
 * produtividade, preço) e bloco de fontes `3-Glebas_Coord.!AW4:AW6`.
 */
export interface OrcamentoProjeto {
  safra: Safra;
  ciclo: CicloCultivo;
  /** Valor total solicitado em custeio (R$). */
  valorSolicitado: number;
  /** Recursos próprios / contrapartida (R$). */
  valorContrapartida: number;
  /** Valor total do projeto (solicitado + contrapartida). */
  valorTotal: number;
  /** Fontes de recurso (até 3 — Próprio / Financiado / Outro). */
  fontes: Array<{
    fonte: FonteRecurso;
    valor: number;
    instituicao?: string;
  }>;
  /** Finalidade declarada do crédito (texto livre). */
  finalidade?: string;
  /** Produtividade esperada em sacas/ha (ou unidade da cultura). */
  produtividadeEsperada?: number;
  /** Unidade da produtividade (sc/ha, arrobas/ha, etc). */
  unidadeProdutividade?: string;
  /** Preço unitário projetado de comercialização (R$/unid). */
  precoProjetado?: number;
  /** Receita bruta projetada (produtividade * área * preço). */
  receitaBrutaProjetada?: number;
}

// ── Comercialização ───────────────────────────────────────

export interface PlanoComercializacao {
  canalVenda: 'cooperativa' | 'trading' | 'mercado_spot' | 'contrato_futuro' | 'outro';
  compradorPrincipal?: string;
  /** % já travada via CPR / contrato futuro. */
  percentualTravado?: number;
  /** Preço médio de referência usado no plano (R$/unid). */
  precoReferencia?: number;
  /** Fonte da cotação (CEPEA, DSM, ESALQ, etc). */
  fontePreco?: string;
  observacoes?: string;
}

// ── Avalistas e garantias ─────────────────────────────────

export interface AvalistaInfo {
  id: string;
  nome: string;
  cpfCnpj?: string;
  tipo: TipoPessoa;
  /** Tipo de garantia (aval, penhor agrícola, hipoteca, alienação fiduciária). */
  tipoGarantia: 'aval' | 'penhor_agricola' | 'hipoteca' | 'alienacao_fiduciaria' | 'outro';
  valorGarantia?: number;
  descricaoGarantia?: string;
  parentesco?: string;
}

// ── Indicadores / resultado esperado ──────────────────────

/**
 * Indicadores financeiros calculados a partir do orçamento
 * + receita projetada + cronograma.
 */
export interface IndicadoresProjeto {
  /** Valor Presente Líquido do fluxo (desembolsos + receita). */
  vpl: number;
  /** Taxa Interna de Retorno anual (%). */
  tirAnual: number;
  /** Payback em meses (tempo até saldo zerar). */
  paybackMeses: number;
  /** Margem líquida = (receita - custos) / receita. */
  margemLiquida: number;
  /** Necessidade de capital de giro (máx. exposição negativa). */
  necessidadeCapitalGiro: number;
  /** Receita bruta projetada total (R$). */
  receitaBrutaTotal: number;
  /** Custo total de produção (R$). */
  custoTotal: number;
  /** Taxa de desconto usada no cálculo (% a.a.). */
  taxaDescontoAnual: number;
  /** Gerado em. */
  calculadoEm: string;
  /** Avisos (ex: "receita < custo"). */
  avisos?: string[];
}

// ── Plano completo ────────────────────────────────────────

/**
 * Plano Simples de Custeio Agrícola — documento submetido ao banco
 * para pleito de crédito de custeio de uma safra.
 */
export interface PlanoCusteio {
  id: string;
  clienteId: string;
  criadoEm: string;
  atualizadoEm: string;
  criadoPor?: string;           // userId
  safra: Safra;
  versao: number;               // incrementada em cada duplicação

  proponente: DadosProponente;
  imoveis: ImovelRural[];       // 1..N (planilha aceita até 10)
  glebas: Gleba[];              // 1..15
  projeto: OrcamentoProjeto;
  orcamento: ItemOrcamento[];   // até 120
  cronograma: DesembolsoParcela[];
  comercializacao?: PlanoComercializacao;
  avalistas: AvalistaInfo[];
  resultadoEsperado?: IndicadoresProjeto;
  observacoes?: string;

  status: StatusPlanoCusteio;
  /** Referência a planos anteriores (duplicação). */
  planoAnteriorId?: string;
}

// ── Payloads de API ──────────────────────────────────────

/** Campos obrigatórios mínimos para criar um rascunho. */
export interface PlanoCusteioCreatePayload {
  clienteId: string;
  safra: Safra;
  proponente: DadosProponente;
  imoveis?: ImovelRural[];
  glebas?: Gleba[];
  projeto?: Partial<OrcamentoProjeto>;
  orcamento?: ItemOrcamento[];
  cronograma?: DesembolsoParcela[];
  comercializacao?: PlanoComercializacao;
  avalistas?: AvalistaInfo[];
  observacoes?: string;
}

/** PATCH parcial — qualquer subconjunto do plano. */
export type PlanoCusteioUpdatePayload = Partial<Omit<PlanoCusteio, 'id' | 'clienteId' | 'criadoEm' | 'versao'>>;

export interface PlanoCusteioListFilters {
  clienteId?: string;
  safra?: string;
  status?: StatusPlanoCusteio;
}

// ──────────────────────────────────────────────────────────
// Limites e constantes extraídas da planilha
// ──────────────────────────────────────────────────────────

export const LIMITES_CUSTEIO = {
  /** Máximo de imóveis por plano (aba 1-Empreendimento linhas 16..35). */
  MAX_IMOVEIS: 20,
  /** Máximo de glebas por plano (aba 3-Glebas_Coord.). */
  MAX_GLEBAS: 15,
  /** Máximo de pontos por gleba (aba 3-Glebas_Coord., celula A2 instrução). */
  MAX_PONTOS_GLEBA: 57,
  /** Mínimo de pontos por gleba. */
  MIN_PONTOS_GLEBA: 4,
  /** Máximo de itens de orçamento (linhas 96..215). */
  MAX_ITENS_ORCAMENTO: 120,
  /** Janela máx. de plantio em dias (AD221). */
  MAX_JANELA_PLANTIO_DIAS: 62,
  /** Versão de referência da planilha. */
  VERSAO_PLANILHA: '1.1/2026',
} as const;
