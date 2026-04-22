// ============================================================
// ALETIS — Alix Document Generators — Types
// Wave 9-GENERATE
// ============================================================

export type DocumentKind = 'pdf' | 'docx' | 'xlsx';

export interface GeneratedDocument {
  id: string;
  kind: DocumentKind;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  /** Absolute path within `apps/api/storage/alix-outputs/…` */
  path: string;
  /** Relative URL that can be served by the Fastify route plugin. */
  downloadUrl: string;
  mimetype: string;
  clienteId?: string;
  metadata: Record<string, unknown>;
}

// ── Inputs ────────────────────────────────────────────────────

export interface PropostaInput {
  clienteId: string;
  clienteNome: string;
  credorNome: string;
  dividaAtualBRL: number;
  parcelasMeses: number;
  taxaMensalPct: number;
  carenciaMeses: number;
  observacoes?: string;
  dataEmissao?: string;
  consultor?: string;
}

export interface ParecerInput {
  clienteId: string;
  clienteNome: string;
  assunto: string;
  diagnostico: string;
  viabilidade: string;
  recomendacao: string;
  anexos?: string[];
  dataEmissao?: string;
  consultor?: string;
}

export type SemaforoStatus = 'verde' | 'amarelo' | 'vermelho';

export interface BscKpi {
  nome: string;
  valorAtual: number | string;
  meta: number | string;
  unidade?: string;
  status: SemaforoStatus;
}

export interface BscPerspectiva {
  nome: 'Financeira' | 'Cliente' | 'Processos' | 'Aprendizado';
  resumo?: string;
  kpis: BscKpi[];
}

export interface RelatorioBscInput {
  clienteId: string;
  clienteNome: string;
  periodo: string;
  perspectivas: BscPerspectiva[];
  observacoes?: string;
  dataEmissao?: string;
  consultor?: string;
}

export interface FluxoCaixaMes {
  mes: string;
  receitaProducao: number;
  custoOperacional: number;
  parcelaCredito: number;
}

export interface FluxoCaixaInput {
  clienteId: string;
  clienteNome: string;
  periodoReferencia: string;
  meses: FluxoCaixaMes[];
  observacoes?: string;
}

export interface MemoriaCalculoItem {
  titulo: string;
  descricao: string;
  formula?: string;
  resultado?: string;
}

export interface MemoriaInput {
  clienteId: string;
  clienteNome: string;
  titulo: string;
  premissas: string[];
  itens: MemoriaCalculoItem[];
  conclusao?: string;
  dataEmissao?: string;
  consultor?: string;
}
