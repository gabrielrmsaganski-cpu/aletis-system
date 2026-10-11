import type { FiscalUF } from './portal-fiscal'

export interface FiscalCredentialDTO {
  id: string; titular: string; documentoMascarado: string; uf: FiscalUF;
  status: 'ativa' | 'suspensa' | 'expirada'; validadeInicio: string; validadeFim: string;
  automacaoAtiva: boolean; verificadaNoOrgao: boolean; atualizadoEm: string;
  ultimaConsultaEm?: string; ultimoSucessoEm?: string; proximaConsultaEm?: string;
  proximaConsultaPontualEm?: string;
}
export interface FiscalQueryDTO {
  id: string; credencialId: string; status: 'executando' | 'sucesso' | 'sem_documentos' | 'bloqueada' | 'erro';
  mensagem: string; iniciadaEm: string; concluidaEm?: string; documentosRecebidos: number; codigo?: string;
  modalidade?: 'distribuicao' | 'chave' | 'nsu'; alvo?: string;
}
export interface FiscalDocumentDTO {
  id: string; chave?: string; nsu: string; tipo: 'nfe' | 'resumo' | 'evento';
  emitente?: string; destinatario?: string; emissao?: string; valor?: string; recebidoEm: string;
  arquivoNome: string; portalUploadId?: string; processamento?: 'pendente' | 'encaminhado' | 'erro';
  emitenteDocumento?: string; destinatarioDocumento?: string; numero?: string; serie?: string;
  direcao?: FiscalDirection; situacao?: FiscalSituation; resumo?: string;
  detalhes?: FiscalDocumentDetails; relacionadoCompletoId?: string;
  analiseStatus?: string; driveStatus?: string; driveUrl?: string;
}
export type FiscalDirection = 'emitida' | 'recebida' | 'interesse' | 'indefinida'
export type FiscalSituation = 'autorizada' | 'cancelada' | 'denegada' | 'nao_informada'
export interface FiscalDocumentDetails {
  versao: 1; numero?: string; serie?: string; natureza?: string; finalidade?: string; tipoOperacao?: string;
  situacao: FiscalSituation; protocolo?: string; codigoStatus?: string; eventoTipo?: string; eventoDescricao?: string;
  emitenteUF?: string; destinatarioUF?: string; emitenteIE?: string; destinatarioIE?: string;
  totais: Record<string, string>;
  itens: { numero: string; codigo?: string; descricao?: string; ncm?: string; cfop?: string; unidade?: string; quantidade?: string; valorUnitario?: string; total?: string }[];
  parcelas: { numero?: string; vencimento?: string; valor?: string }[];
  transporte?: { modalidade?: string; nome?: string; documento?: string; placa?: string; uf?: string; pesoBruto?: string; pesoLiquido?: string };
  informacoes?: string;
}
export interface FiscalDocumentSearch {
  documentos: FiscalDocumentDTO[]; pagina: number; limite: number; total: number; paginas: number;
  resumo: {
    registros: number; completas: number; resumos: number; eventos: number; notasUnicas: number;
    semXml: number; canceladas: number; pendentesCrm: number; falhasCrm: number;
    emitidas: number; recebidas: number; valorEmitidas: string; valorRecebidas: string;
    primeiraEmissao?: string; ultimaEmissao?: string;
    meses: { mes: string; emitidas: string; recebidas: string; quantidade: number }[];
    contrapartes: { nome: string; documento: string; direcao: FiscalDirection; quantidade: number; valor: string }[];
  };
}
export interface FiscalDocumentDetail {
  documento: FiscalDocumentDTO; relacionados: FiscalDocumentDTO[];
  origem: { fonte: string; consultaId: string; recebidoEm: string; sha256: string; schema: string };
}
export interface FiscalQueryPage { consultas: FiscalQueryDTO[]; total: number; pagina: number; paginas: number }
export interface FiscalConnectionData {
  configurado: boolean; atualizadoEm: string; avisos: string[];
  credenciais: FiscalCredentialDTO[]; consultas: FiscalQueryDTO[]; documentos: FiscalDocumentDTO[];
  totalDocumentos?: number;
  sincronizacao?: { ultimoNsu: string; maiorNsu: string; emDia: boolean; emAndamento?: boolean; proximaConsultaEm: string };
  cobertura: { uf: FiscalUF; nome: string; portalUrl: string; servicos: {
    id: string; nome: string; status: 'disponivel' | 'conectado' | 'portal_oficial'; descricao: string;
  }[] }[];
}
