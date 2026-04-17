/**
 * Prospecção — tipos do sistema de busca cirúrgica de leads agro com dívida.
 *
 * Arquitetura OODA:
 *  OBSERVE  — PGFN Dívida Ativa + CNPJ + IBGE + sinais de área rural
 *  ORIENT   — Scoring multi-dimensional (hectares, dívida, ajuizamento, recência)
 *  DECIDE   — Filtragem por corte (min. hectares, UF, CNAE, valor)
 *  ACT      — Exportação/CSV, handoff para Alix (proposta personalizada)
 */

export type TipoPessoa = 'PF' | 'PJ'

export interface DebtRecord {
  fonte: 'PREV' | 'FGTS' | 'NAOPREV'
  inscricao: string
  tipoSituacao: string
  situacao: string
  tipoCredito: string
  dataInscricao: string
  ajuizado: boolean
  valor: number
}

/** Formato bruto extraído do PGFN (após ingestão offline). */
export interface LeadRaw {
  cpfCnpj: string
  cpfCnpjClean: string
  tipoPessoa: TipoPessoa
  nome: string
  uf: string
  agroSignals: string[]
  debts: DebtRecord[]
  totalDivida: number
  qtdInscricoes: number
  primeiraInscricao: string
  ultimaInscricao: string
  temAjuizada: boolean
}

/** Enriquecimento via BrasilAPI (CNPJ → sócios, CNAE, endereço). */
export interface CnpjEnrichment {
  razaoSocial: string
  nomeFantasia?: string
  cnaeFiscal: string
  cnaeFiscalDescricao: string
  cnaesSecundarios: Array<{ codigo: string; descricao: string }>
  situacaoCadastral: string
  dataAbertura: string
  capitalSocial: number
  porte?: string
  naturezaJuridica?: string
  endereco: {
    logradouro: string
    numero: string
    bairro: string
    municipio: string
    uf: string
    cep: string
  }
  socios: Array<{
    nome: string
    qualificacao: string
    dataEntrada?: string
    faixaEtaria?: string
  }>
  enriquecidoEm: string
}

/** Estimativa de área rural — dado "hectares" que o PGFN não fornece diretamente. */
export interface AreaEstimation {
  hectaresEstimados: number
  confidence: 'baixa' | 'media' | 'alta'
  metodo: 'capital-social' | 'tipo-pessoa' | 'cnae' | 'razao-social' | 'composto' | 'sicar'
  explicacao: string
  /** Se >0, indica consulta feita ao CAR/SICAR (quando disponível). */
  hectaresSicar?: number
}

/**
 * Resultado de consulta ao SICAR (Cadastro Ambiental Rural) — Serviço Florestal.
 * Fonte pública em https://consultapublica.car.gov.br/ — protegida por reCAPTCHA
 * resolvido via 2captcha.
 */
export interface CarConsultaResult {
  codImovel: string
  areaImovel: number // hectares
  municipio: string
  uf: string
  modulosFiscais?: number
  areaAntropizada?: number // hectares
  areaReservaLegal?: number // hectares
  areaPreservacaoPermanente?: number // hectares
  areaVegetacaoNativa?: number // hectares
  condicaoCadastro: string // "Ativo", "Pendente", "Cancelado", etc.
  statusAnalise?: string
  dataCadastro?: string
  tipoImovel?: 'IRU' | 'AST' | 'PCT' // IRU=rural, AST=assentamento, PCT=povos/comunidades tradicionais
  consultadoEm: string
  /** taskId do 2captcha — útil para reportBad se o resultado vier quebrado. */
  captchaTaskId?: string
}

/** Score composto 0-100 — prioriza leads com alto potencial de honorários. */
export interface LeadScore {
  total: number
  breakdown: {
    divida: number // 0-40 — tamanho da dívida
    ajuizamento: number // 0-20 — urgência
    recencia: number // 0-15 — há quanto tempo inscrito
    agroMatch: number // 0-15 — qualidade do sinal agro
    hectares: number // 0-10 — área estimada
  }
  classificacao: 'quente' | 'morno' | 'frio' | 'reativo'
  honorariosEstimados: number // R$ — 1% da dívida, modelo ALETIS
}

/** Status do lead no pipeline de prospecção. */
export type LeadStatus = 'pendente' | 'completa' | 'excluido'

/** Lead enriquecido — o objeto que a UI consome. */
export interface LeadFull {
  cpfCnpj: string
  cpfCnpjClean: string
  tipoPessoa: TipoPessoa
  nome: string
  uf: string
  agroSignals: string[]
  totalDivida: number
  qtdInscricoes: number
  temAjuizada: boolean
  primeiraInscricao: string
  ultimaInscricao: string
  debts: DebtRecord[]
  cnpj?: CnpjEnrichment
  area: AreaEstimation
  car?: CarConsultaResult
  carSource?: 'offline' | 'live'
  carOutrosImoveis?: CarConsultaResult[]
  score: LeadScore
  /** Flags derivadas — calculadas a cada `buscar`, não persistidas. */
  status?: LeadStatus
  enriquecido?: boolean
  enriquecidoEm?: string
  excluidoMotivo?: string
  excluidoEm?: string
  /** Resumo estratégico gerado pela IA (gerado sob demanda). */
  ai?: {
    resumo: string
    abordagem: string
    pontosChave: string[]
    geradoEm: string
  }
}

export interface ProspeccaoFilters {
  uf?: string | string[]
  minDivida?: number
  maxDivida?: number
  minHectares?: number
  tipoPessoa?: TipoPessoa
  apenasAjuizadas?: boolean
  cnaeAgro?: boolean
  termo?: string // busca por nome
  status?: LeadStatus | 'todos' // default: todos não-excluídos
  sortBy?: 'score' | 'divida' | 'hectares' | 'recencia'
  page?: number
  pageSize?: number
}

export interface ProspeccaoStats {
  totalLeads: number
  totalDivida: number
  honorariosPotenciaisTotal: number
  leadsQuentes: number
  leadsComAjuizamento: number
  leadsCompletos: number
  leadsExcluidos: number
  porUf: Array<{ uf: string; count: number; divida: number }>
  porFaixaDivida: Array<{ faixa: string; count: number }>
  topSignals: Array<{ signal: string; count: number }>
  manifest: {
    fonte: string
    atualizadoEm: string
  }
}
