// ============================================================
// ALETIS SHARED TYPES — Smart Document Extraction (Wave 11)
// Tipagens para o pipeline de extração inteligente da ALIX:
// classificação → extração especializada → mapeamento CRM
// ============================================================

export type DocumentType =
  | 'contrato_credito_rural'
  | 'proposta_comercial'
  | 'extrato_bancario'
  | 'documento_pessoal'
  | 'laudo_tecnico'
  | 'planilha_gestao'
  | 'outro';

export type EntityTipo =
  | 'pessoa'
  | 'empresa'
  | 'endereco'
  | 'imovel_rural'
  | 'divida'
  | 'banco'
  | 'valor'
  | 'data'
  | 'clausula'
  | 'outro';

export interface ExtractedEntity {
  tipo: EntityTipo;
  /** Sub-tipo descritivo: 'devedor', 'avalista', 'credor', 'garantia_real', etc. */
  categoria: string;
  nome?: string;
  cpfCnpj?: string;
  endereco?: string;
  telefone?: string;
  email?: string;
  valor?: number;
  moeda?: string;
  /** ISO-8601 quando possível */
  data?: string;
  descricao?: string;
  /** Trecho exato do documento que originou esta entidade */
  fonte: string;
  confianca: number;
  page?: number;
  /** Identificador da cláusula/seção (ex: "CLÁUSULA 12") */
  clause?: string;
}

export type ContratoTipoCreditoRural =
  | 'credito_rural_pronaf'
  | 'credito_rural_pronamp'
  | 'credito_rural_mcr'
  | 'custeio'
  | 'investimento'
  | 'outro';

export type GarantiaTipo =
  | 'hipoteca'
  | 'penhor'
  | 'aval'
  | 'fianca'
  | 'alienacao_fiduciaria'
  | 'cedula_credito_rural'
  | 'outro';

export type ClausulaRiscoTipo =
  | 'aceleracao'
  | 'anatocismo'
  | 'descaracterizacao'
  | 'multa'
  | 'mora'
  | 'penalidade'
  | 'outro';

export interface ContratoExtractedData {
  tipoContrato: ContratoTipoCreditoRural;
  numeroContrato?: string;
  dataContratacao?: string;
  dataVencimento?: string;
  carenciaMeses?: number;
  prazoMeses?: number;
  valorLiberado?: number;
  valorAtualizado?: number;
  taxaContratadaAa?: number;
  taxaCetAa?: number;
  indexadorCorrecao?: string; // ex: "IPCA", "TR", "CDI", "TJLP"
  partes: {
    devedor: ExtractedEntity;
    conjuge?: ExtractedEntity;
    avalistas?: ExtractedEntity[];
    fiadores?: ExtractedEntity[];
  };
  credor: ExtractedEntity;
  garantias: Array<{
    tipo: GarantiaTipo;
    descricao: string;
    imovel?: ExtractedEntity;
    valor?: number;
  }>;
  imoveisVinculados: ExtractedEntity[];
  clausulasRisco: Array<{
    tipo: ClausulaRiscoTipo;
    texto: string;
    severidade: 'baixa' | 'media' | 'alta' | 'critica';
    confianca: number;
  }>;
  cronogramaAmortizacao?: Array<{
    parcela: number;
    dataVencimento: string;
    valor: number;
    tipo: 'amortizacao' | 'juros' | 'parcela';
  }>;
}

export interface EnderecoExtractionData {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}

export interface PropriedadeExtractionData {
  nome?: string;
  municipio?: string;
  uf?: string;
  areaHa?: number;
  car?: string;
  ccir?: string;
  matricula?: string;
  condicao?: 'proprietario' | 'arrendatario' | 'parceiro';
}

export interface ClienteExtractionData {
  nome?: string;
  cpfCnpj?: string;
  tipoPessoa?: 'PF' | 'PJ';
  cidade?: string;
  uf?: string;
  telefone?: string;
  email?: string;
  endereco?: EnderecoExtractionData;
  atividade?: string;
  areaTotalHa?: number;
  culturas?: string[];
  carCodigoImovel?: string;
  propriedades?: PropriedadeExtractionData[];
}

export interface DividaExtractionData {
  contrato?: string;
  valorOriginal?: number;
  valorAtualizado?: number;
  vencimento?: string;
  status?: 'ativa' | 'renegociada' | 'paga' | 'em_acordo';
  credor?: string;
  /** Campos enriquecidos da extração */
  numeroContrato?: string;
  taxaContratadaAa?: number;
  garantias?: string[];
  modalidade?: string; // ex: "Pronamp", "Pronaf", "MCR 6"
}

export interface DocumentEvidence {
  field: string;
  value?: unknown;
  fonte: string;
  trecho: string;
  page?: number;
  confianca: number;
}

export interface DocumentExtractionResult {
  documentoId: string;
  sessionId: string;
  tipoDocumento: DocumentType;
  confianca: number;
  entidades: ExtractedEntity[];
  clienteData: ClienteExtractionData;
  dividas: DividaExtractionData[];
  propriedades: PropriedadeExtractionData[];
  contrato?: ContratoExtractedData;
  riscos: string[];
  lacunas: string[];
  acoesSugeridas: string[];
  evidencias: DocumentEvidence[];
}

/** Saída monetária exata para a revisão CRM; entrada legada de extração permanece compatível. */
export type CrmDocumentDebt = Omit<DividaExtractionData, 'valorOriginal' | 'valorAtualizado'> & {
  valorOriginal?: string;
  valorAtualizado?: string;
};

export interface DocumentFinancialReview {
  contratosAnalisados: number;
  contratosComPrincipal: number;
  contratosComSaldo: number;
  principalDocumentado?: string;
  saldoAtualDocumentado?: string;
  saldoAtualTotalComprovado?: string;
  coberturaSaldos: 'ausente' | 'parcial' | 'completa_nos_contratos_extraidos';
  pendencias: Array<{ campo: string; motivo: 'nao_informado' | 'valor_invalido' | 'nao_comprovado' | 'conflito'; orientacao: string }>;
  exigeRevisao: true;
  observacao: string;
}

/** Payload de enriquecimento para o CRMWriter decidir criar vs atualizar */
export interface CrmEnrichmentPayload {
  operation: 'create' | 'update';
  clienteId?: string;
  cpfCnpj?: string;
  nome?: string;
  cliente: Partial<{
    id: string;
    nome: string;
    cpfCnpj: string;
    tipoPessoa: 'PF' | 'PJ';
    cidade: string;
    uf: string;
    telefone: string;
    email: string;
    atividade: string;
    areaTotalHa: number;
    culturas: string[];
    estagio: string;
    consultor: string;
    credor: string;
    valorTotalDivida: string;
    valorTotalPago: string;
    endereco: unknown;
    carCodigoImovel: string;
    observacoes: string;
    origem: string;
    dividas: unknown[];
    propriedades: unknown[];
    timeline: unknown[];
  }>;
  dividas: CrmDocumentDebt[];
  propriedades: PropriedadeExtractionData[];
  documentoId: string;
  evidencias: DocumentEvidence[];
  confiancaDocumento: number;
  lacunas: string[];
  riscos: string[];
  revisaoFinanceira: DocumentFinancialReview;
}
