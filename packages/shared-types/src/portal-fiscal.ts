export const FISCAL_UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const
export type FiscalUF = typeof FISCAL_UFS[number]
export const FISCAL_SERVICES = {
  debitos: 'Débitos e situação fiscal', notas: 'Notas e documentos fiscais', cadastro: 'Cadastro e inscrições',
  certidoes: 'Certidões e regularidade', processos: 'Processos e protocolos', parcelamentos: 'Parcelamentos',
  declaracoes: 'Declarações e obrigações', pagamentos: 'Guias e pagamentos registrados',
} as const
export type FiscalService = keyof typeof FISCAL_SERVICES
export const FISCAL_METHODS = {
  procuracao_eletronica: 'Procuração eletrônica no órgão', procuracao_documental: 'Procuração ou termo aceito pelo órgão',
  certificado_a1: 'Certificado A1 (.pfx / .p12)', certificado_a3: 'Certificado A3, token ou nuvem', acesso_assistido: 'Preciso de orientação para autorizar',
} as const
export type FiscalMethod = keyof typeof FISCAL_METHODS
export const FISCAL_STATUS = {
  solicitada: 'Aguardando conferência', em_conferencia: 'Em conferência pela equipe', pendencia: 'Precisa de ajuste',
  conferida: 'Documentação conferida', recusada: 'Não aprovada', revogada: 'Uso suspenso no ALETIS', expirada: 'Validade encerrada',
} as const
export type FiscalAuthorizationStatus = keyof typeof FISCAL_STATUS
export interface FiscalPortal {
  uf: FiscalUF; nome: string; portalUrl: string; autorizacaoUrl?: string; orientacao: string; verificacao: string
}
export interface FiscalAuthorization {
  id: string; clienteId: string; uf: FiscalUF; servicos: FiscalService[]; modalidade: FiscalMethod;
  representante?: string; referencia?: string; comprovanteId?: string; comprovanteNome?: string; comprovanteDisponivel: boolean;
  validadeAte?: string; status: FiscalAuthorizationStatus; statusRegistrado: Exclude<FiscalAuthorizationStatus, 'expirada'>;
  servicosConferidos: FiscalService[]; orientacao?: string; criadoEm: string; atualizadoEm: string;
  consultaAutomatica: false;
}
export interface FiscalAuthorizationEvent {
  id: string; autorizacaoId: string; data: string; status: Exclude<FiscalAuthorizationStatus, 'expirada'>; descricao: string
}
export interface FiscalPortalData {
  catalogo: FiscalPortal[]; autorizacoes: FiscalAuthorization[]; eventos: FiscalAuthorizationEvent[];
  consultaAutomatica: false; atualizadoEm: string
}
