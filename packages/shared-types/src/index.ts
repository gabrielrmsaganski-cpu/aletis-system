// ============================================================
// ALETIS SHARED TYPES — Domain Models
// ============================================================

// ── Dossiê Agro (padrão Daycoval 2025) ────────────────────
export * from './dossie-agro';

// ── Auth & Users ──────────────────────────────────────────
export type UserRole = 'admin' | 'consultor_senior' | 'consultor_junior' | 'cliente';

export interface User {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  avatar?: string;
  telefone?: string;
  ativo: boolean;
  criadoEm: string;
  ultimoAcesso?: string;
}

// ── Cliente / Produtor Rural ──────────────────────────────
export type EstagioCliente =
  | 'lead'
  | 'qualificacao'
  | 'analise'
  | 'proposta'
  | 'negociacao'
  | 'acordo'
  | 'acompanhamento'
  | 'concluido';

export interface Endereco {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  codigoIbge?: string;
  latitude?: number;
  longitude?: number;
}

export interface PropriedadeRural {
  id: string;
  nome: string;
  areaTotal: number; // hectares
  areaAgricultavel: number;
  culturas: string[];
  municipio: string;
  estado: string;
  codigoIbge: string;
  matricula?: string;
  car?: string; // Cadastro Ambiental Rural
  condicao: 'proprietario' | 'arrendatario' | 'parceiro' | 'comodatario';
  custoArrendamento?: number; // por hectare/safra
  latitude?: number;
  longitude?: number;
}

export interface Cliente {
  id: string;
  tipo: 'pessoa_fisica' | 'pessoa_juridica';
  nome: string;
  cpfCnpj: string;
  email?: string;
  telefone: string;
  whatsapp?: string;
  endereco: Endereco;
  propriedades: PropriedadeRural[];
  estagio: EstagioCliente;
  consultorId: string;
  tags: string[];
  observacoes?: string;
  documentos: Documento[];
  dividas: Divida[];
  criadoEm: string;
  atualizadoEm: string;
  saudeFinanceira?: number; // 0-100
}

// ── Dívidas e Contratos ───────────────────────────────────
export type ModalidadeCredito =
  | 'custeio_rural'
  | 'investimento_rural'
  | 'credito_pessoal'
  | 'capital_giro'
  | 'fornecedor_insumos'
  | 'cpr'
  | 'outro';

export type StatusDivida =
  | 'adimplente'
  | 'inadimplente'
  | 'renegociada'
  | 'em_negociacao'
  | 'quitada'
  | 'judicial';

export interface Divida {
  id: string;
  clienteId: string;
  credor: string;
  tipoCredor: 'banco' | 'cooperativa' | 'fornecedor' | 'pessoa_fisica' | 'outro';
  modalidade: ModalidadeCredito;
  numeroContrato: string;
  valorOriginal: number;
  valorAtual: number;
  taxaContratada: number; // % ao ano
  taxaPraticada?: number; // CET real % ao ano
  dataContratacao: string;
  dataVencimento: string;
  status: StatusDivida;
  garantias: string[];
  pagamentos: Pagamento[];
  observacoes?: string;
}

export interface Pagamento {
  id: string;
  data: string;
  valor: number;
  tipo: 'amortizacao' | 'juros' | 'parcela' | 'quitacao' | 'sinal';
  comprovante?: string;
  descricao?: string;
}

// ── Propostas ─────────────────────────────────────────────
export type StatusProposta =
  | 'rascunho'
  | 'gerando'
  | 'revisao'
  | 'enviada'
  | 'visualizada'
  | 'aceita'
  | 'rejeitada'
  | 'expirada';

export interface Proposta {
  id: string;
  clienteId: string;
  dividaIds: string[];
  consultorId: string;
  titulo: string;
  status: StatusProposta;
  versao: number;
  resumoExecutivo: string;
  valorPropostoPagamento: number;
  condicoesPropostas: string;
  memoriaCalculo: MemoriaCalculo;
  fluxoCaixaProjetado: FluxoCaixaProjecao;
  pdfUrl?: string;
  criadoEm: string;
  atualizadoEm: string;
  enviadoEm?: string;
  visualizadoEm?: string;
}

// ── Cálculos Financeiros ──────────────────────────────────
export interface MemoriaCalculo {
  valorOriginal: number;
  taxaOriginal: number;
  taxaRecalculo: number;
  dataInicio: string;
  dataCorte: string;
  pagamentosRealizados: Pagamento[];
  saldoRecalculado: number;
  cetOriginal: number;
  cetRecalculado: number;
  diferencaEncargos: number;
  tabelaAmortizacao: LinhaAmortizacao[];
}

export interface LinhaAmortizacao {
  parcela: number;
  data: string;
  saldoInicial: number;
  juros: number;
  amortizacao: number;
  pagamento: number;
  saldoFinal: number;
}

export interface FluxoCaixaProjecao {
  periodo: string; // ex: "2026-2031"
  anos: FluxoCaixaAnual[];
  cenario: 'otimista' | 'realista' | 'pessimista';
}

export interface FluxoCaixaAnual {
  ano: number;
  receitasOperacionais: number;
  custosProducao: number;
  custosOperacao: number;
  custosAdministrativos: number;
  obrigacoesDividas: number;
  resultadoCaixa: number;
  saldoAcumulado: number;
}

// ── Mercado ───────────────────────────────────────────────
export type Commodity = 'soja' | 'milho' | 'boi_gordo' | 'cafe' | 'algodao' | 'acucar' | 'trigo';

export interface CotacaoMercado {
  commodity: Commodity;
  preco: number;
  unidade: string;
  variacao: number; // %
  data: string;
  fonte: string;
  historico?: { data: string; valor: number }[];
}

export interface IndicadorFinanceiro {
  nome: string;
  valor: number;
  variacao?: number;
  unidade: string;
  data: string;
  fonte: string;
}

// ── Documentos ────────────────────────────────────────────
export interface Documento {
  id: string;
  nome: string;
  tipo: 'contrato' | 'comprovante' | 'proposta' | 'laudo' | 'procuracao' | 'outro';
  url: string;
  tamanho: number;
  mimeType: string;
  uploadEm: string;
  ocrProcessado?: boolean;
  dadosExtraidos?: Record<string, unknown>;
}

// ── Dashboard KPIs ────────────────────────────────────────
export interface DashboardKPIs {
  totalClientes: number;
  clientesAtivos: number;
  propostasGeradas: number;
  propostasAceitas: number;
  volumeNegociado: number;
  volumeEconomizado: number;
  ticketMedio: number;
  taxaConversao: number;
}

// ── Notificações ──────────────────────────────────────────
export type TipoNotificacao = 'info' | 'alerta' | 'sucesso' | 'erro' | 'proposta' | 'mercado';

export interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  lida: boolean;
  criadoEm: string;
  link?: string;
}

// ── Eventos do Cliente (Timeline) ─────────────────────────
export type TipoEvento =
  | 'contato_inicial'
  | 'documento_recebido'
  | 'proposta_gerada'
  | 'proposta_enviada'
  | 'reuniao'
  | 'pagamento'
  | 'acordo_fechado'
  | 'observacao';

export interface EventoCliente {
  id: string;
  clienteId: string;
  tipo: TipoEvento;
  titulo: string;
  descricao: string;
  data: string;
  usuarioId: string;
  dados?: Record<string, unknown>;
}
