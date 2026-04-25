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
  judicialEvents?: JudicialEvent[]
  /**
   * Procedência — preenchido pelo `LeadSourceRegistry` quando o lead é
   * consolidado a partir de múltiplas fontes. Pode estar ausente em dados
   * legados (gravados antes da multi-fonte). Ordem = ordem de entrada.
   */
  sources?: Array<{ fonte: string; ingestedAt: string }>
}

export type AgroProfileNivel = 'forte' | 'medio' | 'fraco'
export type PfProfileNivel = 'forte' | 'medio' | 'fraco' | 'nenhum'
export type JudicialSeverity = 'alta' | 'media' | 'baixa' | 'nenhuma'
export type JudicialTipo =
  | 'recuperacao_judicial'
  | 'falencia'
  | 'insolvencia'
  | 'leilao'
  | 'penhora'
  | 'liquidacao_judicial'
  | 'situacao_especial'

export interface AgroProfile {
  nivel: AgroProfileNivel
  provavel: boolean
  score: number
  explicacao: string
  evidencias: string[]
}

export interface PfProfile {
  relevante: boolean
  nivel: PfProfileNivel
  score: number
  explicacao: string
  evidencias: string[]
}

export interface JudicialProfile {
  ativo: boolean
  severidade: JudicialSeverity
  tipos: JudicialTipo[]
  explicacao: string
  evidencias: string[]
}

export interface JudicialEvent {
  tipo: JudicialTipo
  fonte: string
  data: string
  resumo: string
  url?: string
  severidade: Exclude<JudicialSeverity, 'nenhuma'>
}

/** Enriquecimento via BrasilAPI (CNPJ → sócios, CNAE, endereço). */
export interface CnpjEnrichment {
  razaoSocial: string
  nomeFantasia?: string
  cnaeFiscal: string
  cnaeFiscalDescricao: string
  cnaesSecundarios: Array<{ codigo: string; descricao: string }>
  situacaoCadastral: string
  /** Motivo da situação cadastral (SEM MOTIVO, BAIXADA, INAPTA, etc). */
  motivoSituacaoCadastral?: string
  /** Situação especial (FALIDA, LIQUIDAÇÃO JUDICIAL, RECUPERAÇÃO JUDICIAL etc). */
  situacaoEspecial?: string
  dataAbertura: string
  capitalSocial: number
  porte?: string
  naturezaJuridica?: string
  /** Ente federativo (p/ órgãos públicos). */
  enteFederativoResponsavel?: string
  /** true = optou pelo Simples Nacional (útil p/ restrições tributárias de custeio). */
  optantePeloSimples?: boolean | null
  /** true = MEI (limites específicos no Crédito Rural). */
  optantePeloMei?: boolean | null
  endereco: {
    logradouro: string
    numero: string
    complemento?: string
    bairro: string
    municipio: string
    uf: string
    cep: string
    /** Código IBGE do município (7 dígitos) — chave p/ cruzar com CONAB/PAM. */
    codigoMunicipioIbge?: number
  }
  /** Telefone principal (somente dígitos, com DDD). */
  telefone1?: string
  /** Telefone secundário. */
  telefone2?: string
  /** Fax (ainda aparece em muitos CNPJs agro). */
  fax?: string
  /** Email da RFB (quando declarado). */
  email?: string
  socios: Array<{
    nome: string
    qualificacao: string
    dataEntrada?: string
    faixaEtaria?: string
  }>
  enriquecidoEm: string
}

/**
 * Endereço validado + geocodificado.
 * - Dados textuais vêm do ViaCEP (fonte oficial Correios).
 * - Coordenadas vêm do Nominatim (OpenStreetMap) — útil p/ mapa na UI e para
 *   cruzar com clima/safra na região do imóvel.
 */
export interface GeoEnrichment {
  cep: string
  logradouro?: string
  complemento?: string
  bairro?: string
  cidade: string
  uf: string
  /** Código IBGE do município (7 dígitos). */
  codigoIbge?: number
  /** Região do município (Norte, Nordeste, Sul etc.). */
  regiao?: string
  /** DDD principal do município (quando ViaCEP retorna). */
  ddd?: string
  /** Coordenadas geográficas (Nominatim). null se não encontrou. */
  coordenadas?: { lat: number; lng: number; source: 'nominatim' | 'ibge' } | null
  /** Endereço formatado pronto para exibir. */
  enderecoFormatado?: string
  enriquecidoEm: string
}

/**
 * Dados agroclimáticos anuais de um ponto (NASA POWER).
 * Médias dos últimos 12 meses. Permite dimensionar risco climático
 * real da propriedade (seca, excesso de chuva, radiação p/ fotossíntese).
 */
export interface ClimaAgro {
  lat: number
  lng: number
  periodo: { inicio: string; fim: string }
  /** Temperatura média anual em °C (pode ser null se NASA POWER faltar). */
  tempMediaAnualC: number | null
  /** Precipitação acumulada no período em mm. */
  chuvaAcumuladaAnualMm: number | null
  /** Radiação solar média diária em MJ/m². */
  radiacaoMediaDiariaMjM2: number | null
  /** Umidade relativa média em %. */
  umidadeRelativaMediaPct: number | null
  /** Resumo mensal — útil para gráfico sazonal no CRM. */
  mensais: Array<{
    anoMes: string // YYYY-MM
    tempMediaC: number | null
    chuvaMmTotal: number | null
  }>
  fonte: string
  enriquecidoEm: string
}

/**
 * Produção agrícola + rebanho do município (IBGE SIDRA PAM/PPM).
 * Serve para comparar o cliente com o perfil produtivo dominante
 * da região — base de argumentação para reestruturação.
 */
export interface ProducaoMunicipal {
  codigoMunicipioIbge: number
  anoReferencia: string
  culturas: Array<{
    cultura: string
    tipo: 'temporaria' | 'permanente'
    valorMilReais: number
    anoReferencia: string
  }>
  rebanho: Array<{
    especie: string
    cabecas: number
    anoReferencia: string
  }>
  valorTotalLavouraMilReais: number
  fonte: string
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
    divida: number // 0-30 — tamanho da dívida
    ajuizamento: number // 0-15 — urgência
    recencia: number // 0-10 — há quanto tempo inscrito
    agroMatch: number // 0-10 — qualidade do sinal agro
    hectares: number // 0-10 — área estimada
    velocity: number // 0-10 — aceleração do passivo (janela curta + muitas inscrições)
    fitRegional: number // 0-15 — proximidade operacional da mesa ALETIS (UFs core)
    multiSource: number
    douCrise: number
  }
  /** Contexto textual derivado do scoring — para UI e handoff ao consultor. */
  motivos?: {
    velocity?: string // ex: "5 inscrições em 8 meses — passivo acelerando"
    fitRegional?: string // ex: "PR — região sede, mesa local"
    multiSource?: string
    douCrise?: string
  }
  classificacao: 'quente' | 'morno' | 'frio' | 'reativo'
  honorariosEstimados: number // R$ — 1% da dívida, modelo ALETIS
}

/** Status do lead no pipeline de prospecção. */
export type LeadStatus = 'pendente' | 'completa' | 'excluido'

/**
 * Resultado de um contato realizado com o lead. Alimenta o feedback loop do
 * scoring — leads respondidos positivamente são priorizados; os que fecham
 * porta entram na blacklist automaticamente.
 */
export type ContactOutcomeTipo =
  | 'sucesso' // agendou reunião / avançou na conversa
  | 'interessado' // pediu mais tempo / mandou info pra avaliar
  | 'retornar' // não atendeu / deixar para reagendar
  | 'recusou' // disse não explicitamente
  | 'ja_regularizou' // já quitou/renegociou com outra mesa
  | 'nao_agro' // perfil não é agro — falso positivo
  | 'fora_target' // agro, mas fora do perfil ALETIS

export interface ContactOutcome {
  cpfCnpj: string
  cpfCnpjClean: string
  tipo: ContactOutcomeTipo
  canal?: 'whatsapp' | 'telefone' | 'email' | 'presencial' | 'outro'
  notas?: string
  registradoPor?: string
  registradoEm: string
}

/**
 * Métrica resumida do feedback loop para um lead — derivada dos outcomes
 * registrados. Alimenta o componente HotLead e prioriza a agenda.
 */
export interface LeadFeedback {
  totalContatos: number
  ultimoOutcome?: ContactOutcomeTipo
  ultimoContatoEm?: string
  /** Ajuste ao score base derivado do histórico de contatos (-30 a +20). */
  ajusteScore: number
  /** Sinalizador UI — true se o lead merece retomar contato. */
  reengajar: boolean
}

/** Rota de hot-lead — lead quente sem contato recente. */
export interface HotLeadAlert {
  cpfCnpj: string
  cpfCnpjClean: string
  nome: string
  uf: string
  scoreTotal: number
  classificacao: LeadScore['classificacao']
  honorariosEstimados: number
  totalDivida: number
  ultimoContatoEm?: string
  diasSemContato: number
  urgencia: 'imediata' | 'alta' | 'media'
  motivo: string
}

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
  judicialEvents?: JudicialEvent[]
  sources?: Array<{ fonte: string; ingestedAt: string }>
  cnpj?: CnpjEnrichment
  area: AreaEstimation
  car?: CarConsultaResult
  carSource?: 'offline' | 'live'
  carOutrosImoveis?: CarConsultaResult[]
  score: LeadScore
  agroProfile: AgroProfile
  pfProfile: PfProfile
  judicialProfile: JudicialProfile
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
  /** Histórico consolidado de contatos (feedback loop). */
  feedback?: LeadFeedback
  /** Lista completa de outcomes — útil para auditoria e UI de histórico. */
  contatos?: ContactOutcome[]
}

export interface ProspeccaoFilters {
  uf?: string | string[]
  minDivida?: number
  maxDivida?: number
  minHectares?: number
  tipoPessoa?: TipoPessoa
  apenasAjuizadas?: boolean
  cnaeAgro?: boolean
  apenasAgroProvavel?: boolean
  apenasPfRural?: boolean
  apenasJudicialAgro?: boolean
  judicialTipos?: JudicialTipo[]
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
  leadsAgroProvavel: number
  leadsPfRural: number
  leadsJudicialAgro: number
  /** Hot-leads pendentes de ação — quente + sem contato nos últimos 14d. */
  hotLeadsPendentes: number
  /** Leads com outcome "retornar" prontos para re-engajamento (cooldown passou). */
  leadsParaReengajar: number
  porUf: Array<{ uf: string; count: number; divida: number }>
  porFaixaDivida: Array<{ faixa: string; count: number }>
  porJudicialTipo: Array<{ tipo: JudicialTipo; count: number }>
  topSignals: Array<{ signal: string; count: number }>
  manifest: {
    fonte: string
    atualizadoEm: string
  }
  /** Todas as fontes ativas — útil p/ mostrar "Fontes: PGFN (N), CAR (M)". */
  fontes?: Array<{
    fonte: string
    descricao: string
    contagem: number
    lastIngestAt: string | null
  }>
}
