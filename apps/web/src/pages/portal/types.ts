// ============================================================
// Portal — DTOs e tipos compartilhados entre componentes.
// ============================================================
// Espelho dos schemas backend (apps/api/src/routes/portal.ts).
// Mantém o portal como o consumidor dos endpoints REST/SSE.
// ============================================================

export const TOKEN_KEY = 'aletis.portal.token'

export interface ClienteMe {
  id: string
  nome: string
  cpfCnpj: string
  cidade: string
  uf: string
  email: string
  telefone: string
  atividade: string
  areaTotalHa: number
  culturas: string[]
  estagio: string
  consultor: string
  credor: string
  dataCadastro: string
  forcaTrocaSenha: boolean
}

export interface ContratoDivida {
  contrato: string
  valorOriginal: number
  valorAtualizado: number
  vencimento: string
  status: string
  credor: string
}

export interface ContratoPagamento {
  data: string
  valor: number
  descricao: string
  tipo: string
}

export interface Contrato {
  credor: string
  valorTotalDivida: number
  valorTotalPago: number
  saldoEmAberto: number
  economia: number
  dividas: ContratoDivida[]
  pagamentos: ContratoPagamento[]
}

export interface StepperItem {
  id: string
  label: string
  done: boolean
  current: boolean
}

export interface TimelineEventoDTO {
  data: string
  tipo: string
  descricao: string
  detalhes?: string
}

export interface DocumentoDTO {
  id: string
  nome: string
  data: string
  tipo: 'proposta' | 'contrato' | 'comprovante'
  url?: string
  canView: boolean
}

export interface MensagemDTO {
  id: string
  de: 'cliente' | 'consultor' | 'sistema'
  autorNome: string
  texto: string
  criadoEm: string
  lidaEm?: string
}

export interface PulseDTO {
  clienteId: string
  nome: string
  estagioAtual: { id: string; label: string; estagioRaw: string }
  proximoPasso: string
  pendencias: { total: number; pendentes: number; aguardandoRevisao: number }
  mensagensNaoLidas: number
  ultimaAtualizacao: string
  healthScore: number
  consultor: string | null
  economiaEstimada: number
}

export interface PendenciaDTO {
  id: string
  clienteId: string
  titulo: string
  descricao?: string
  categoria: 'fiscal' | 'contrato' | 'identidade' | 'patrimonio' | 'agro' | 'outros'
  obrigatorio: boolean
  status: 'pendente' | 'enviado' | 'aprovado' | 'rejeitado' | 'cancelado'
  prioridade?: 'normal' | 'alta' | 'urgente'
  prazo?: string | null
  tipoDocumento?: string | null
  updatedAt?: string
  uploadId?: string
  solicitadoPor?: string
  solicitadoEm: string
  enviadoEm?: string
  observacao?: string
  revisadoEm?: string
}

export interface UploadDTO {
  id: string
  clienteId: string
  pendenciaId?: string
  nomeOriginal: string
  mime: string
  tamanho: number
  categoria?: string
  enviadoPor: 'cliente' | 'consultor'
  enviadoEm: string
  url?: string
  analiseStatus?: 'aguardando' | 'processando' | 'concluida' | 'revisao' | 'erro'
  driveStatus?: 'aguardando' | 'processando' | 'arquivado' | 'erro' | 'indisponivel'
  review?: { status: 'aprovado' | 'rejeitado'; observacao?: string; revisadoEm?: string }
  versao?: number
}

export interface ParcelaDTO {
  numero: number
  vencimento: string
  valor: number
  status: 'futuro' | 'proximo' | 'pago' | 'atrasado'
  pagoEm?: string
}

export interface CronogramaDTO {
  situacao?: 'nao_definido' | 'definido'
  mensagem?: string
  totalAberto: number
  parcelaPadrao: number
  totalParcelas: number
  parcelas: ParcelaDTO[]
}

export interface MemoriaBlocoDTO {
  chave: 'origem' | 'descoberta' | 'plano' | 'pago'
  titulo: string
  valor: number
  descricao: string
}

export interface MemoriaSimplificadaDTO {
  economia: number
  original: number
  atual: number
  pago: number
  blocos: MemoriaBlocoDTO[]
}

export interface AuditoriaEventoDTO {
  id: number
  tipo: string
  canal?: string
  criadoEm: string
  ip?: string
  detalhes?: Record<string, unknown>
}

export const CATEGORIA_LABEL: Record<PendenciaDTO['categoria'], string> = {
  fiscal: 'Fiscal',
  contrato: 'Contrato',
  identidade: 'Identidade',
  patrimonio: 'Patrimônio',
  agro: 'Agro',
  outros: 'Outros',
}

export type ModeloHonorarios =
  | 'fixo'
  | 'mensal'
  | 'exito'
  | 'hibrido_fixo_exito'
  | 'hibrido_mensal_exito'

export type StatusParcelaHonorario = 'aberto' | 'pago' | 'atrasado' | 'cancelado'
export type TipoParcelaHonorario = 'fixo' | 'mensalidade' | 'sucesso'

export interface HonorarioParcelaDTO {
  id: string
  tipo: TipoParcelaHonorario
  valor: number
  vencimento: string
  status: StatusParcelaHonorario
  pagoEm?: string
  meioPagamento?: string
  descricao?: string
  observacao?: string
}

export interface SuccessFeeDTO {
  pct: number
  baseCalculo: 'economia_total' | 'reducao_saldo' | 'valor_renegociado'
  baseValor: number
  estimado: number
  piso?: number
  teto?: number
  ajustado: boolean
}

export interface ProximaCobrancaDTO {
  parcelaId: string
  tipo: TipoParcelaHonorario
  valor: number
  vencimento: string
  diasParaVencer: number
  atrasada: boolean
  descricao?: string
}

export interface HonorariosProjecaoDTO {
  modelo: ModeloHonorarios
  descricaoHumana: string
  vigencia: { inicio: string; fim?: string }
  valorTotal: number
  valorPago: number
  valorAberto: number
  pctPago: number
  proximaCobranca: ProximaCobrancaDTO | null
  successFee: SuccessFeeDTO | null
  parcelas: HonorarioParcelaDTO[]
  alertas: string[]
}

export interface BreakdownCredorDTO {
  credor: string
  original: number
  atual: number
  economia: number
  pct: number
}

export interface MarcoNegociacaoDTO {
  data: string
  tipo: string
  descricao: string
}

export interface PortalCaseIntelligenceDTO {
  score: number
  nivel: 'excelente' | 'boa' | 'atencao' | 'critica' | string
  resumo: string
  atualizadoEm: string
  documentos: {
    total: number
    porGrupo: Record<string, number>
    faltantes: string[]
    revisao: Array<{ id: string; nome: string; motivo: string }>
  }
  proximasAcoes: Array<{ titulo: string; detalhe: string; prioridade: string }>
  pendencias: Array<{ id: string; prioridade: string; titulo: string; detalhe: string; acao: string }>
  alix: {
    resumo: string
    perguntasSugeridas: string[]
  }
}

export interface PortalDashboardDTO {
  pulse: PulseDTO | null
  contrato: Contrato | null
  stepper: StepperItem[]
  timeline: TimelineEventoDTO[]
  documentos: DocumentoDTO[]
  inteligencia: PortalCaseIntelligenceDTO | null
  honorarios: HonorariosProjecaoDTO | null
  economiaSerie: Array<{ mes: string; economia: number; pago: number }>
  breakdownCredor: BreakdownCredorDTO[]
  marcosNegociacao: MarcoNegociacaoDTO[]
}

export interface PortalAlixSessionMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: number
}

export interface PortalAlixSessionDTO {
  id: string
  clienteId: string
  criadoEm: number
  atualizadoEm: number
  titulo: string
  messages: PortalAlixSessionMessage[]
}
