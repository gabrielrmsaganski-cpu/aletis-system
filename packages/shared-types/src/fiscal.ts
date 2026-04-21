// ============================================================
// ALETIS — Situação Fiscal / CND Checklist
// ============================================================
//
// Tipos canonicos para o módulo de Certidões Negativas de Débito
// (CNDs). Cobre as principais esferas exigidas para o produtor
// agro tomar crédito rural, participar de licitações ou cumprir
// covenants bancários.
//
// Persistido em `apps/api/storage/fiscal/{clienteId}.json`
// contendo um array de `CertidaoCND`.
//
// Convenções:
//  - Datas em ISO-8601 (YYYY-MM-DD) para campos de emissão/validade.
//  - Timestamps em ISO completo (criadoEm, atualizadoEm,
//    ultimaAtualizacao).
// ============================================================

/** Tipo da certidão / esfera emissora. */
export type TipoCND =
  | 'federal_receita' // CND/CPEN Receita Federal
  | 'estadual' // SEFAZ
  | 'municipal' // prefeitura
  | 'trabalhista' // CNDT
  | 'fgts' // CRF-FGTS
  | 'inss' // previdenciária
  | 'ambiental'; // CAR ativo, IBAMA

/** Status possível de uma certidão. */
export type StatusCND =
  | 'negativa' // tudo ok
  | 'positiva_com_efeitos' // tem pendência mas suspensa (equivale a negativa)
  | 'positiva' // devedor ativo
  | 'vencida' // validade expirou
  | 'ausente'; // ainda não emitida

/**
 * Certidão individual anexada ao dossiê fiscal do cliente.
 * O array de CertidaoCND é persistido por clienteId.
 */
export interface CertidaoCND {
  id: string;
  clienteId: string;
  tipo: TipoCND;
  /** Número da certidão (opcional — preenchido quando disponível). */
  numero?: string;
  /** Data de emissão (ISO YYYY-MM-DD). */
  dataEmissao?: string;
  /** Data limite de validade (ISO YYYY-MM-DD). */
  dataValidade?: string;
  status: StatusCND;
  /** URL para o PDF original (S3, drive, etc.). */
  url?: string;
  observacoes?: string;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Agregado gerado sob demanda a partir do array de CNDs do cliente.
 * Serve para dashboards, briefing de proposta e avisos automáticos.
 */
export interface ChecklistFiscal {
  clienteId: string;
  totalCertidoes: number;
  /** Negativa ou positiva_com_efeitos com validade futura. */
  validas: number;
  vencidas: number;
  /** Tipos obrigatórios faltando no dossiê. */
  ausentes: number;
  /** Com débito ativo (status = 'positiva'). */
  positivas: number;
  tiposObrigatorios: TipoCND[];
  tiposFaltando: TipoCND[];
  /** Score 0-100 — ver `FiscalService.calcularChecklist` para fórmula. */
  scoreFiscal: number;
  ultimaAtualizacao: string;
  /** Alertas gerados quando validade <= 15 dias ou status crítico. */
  alertas: string[];
}

/** Payload aceito por `POST /api/fiscal/:clienteId/cnds`. */
export interface CertidaoCNDCreatePayload {
  tipo: TipoCND;
  numero?: string;
  dataEmissao?: string;
  dataValidade?: string;
  status?: StatusCND;
  url?: string;
  observacoes?: string;
}

/** Payload aceito por `PATCH /api/fiscal/:clienteId/cnds/:cndId`. */
export type CertidaoCNDUpdatePayload = Partial<CertidaoCNDCreatePayload>;
