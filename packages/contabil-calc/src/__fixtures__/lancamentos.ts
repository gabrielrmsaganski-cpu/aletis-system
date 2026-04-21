/**
 * Lançamentos de exemplo — Q1 2026 com saldos iniciais em 2025-12.
 * Inspirado no BD_Lancamento da planilha v5 (primeiras 15 linhas).
 *
 * Cada par débito/crédito representa uma operação contábil
 * balanceada (partidas dobradas).
 */

import type { Lancamento } from '../types.js';

export const LANCAMENTOS_FIXTURE: Lancamento[] = [
  // Integralização de capital (2025-12-01)
  { data: '2025-12-01', contaCodigo: '1.1.1.01.0002', debito: 500_000, credito: 0, historico: 'Integralização Capital' },
  { data: '2025-12-01', contaCodigo: '2.3.1.01.0001', debito: 0, credito: 500_000, historico: 'Integralização Capital' },

  // Aporte estoque inicial (2025-12-01)
  { data: '2025-12-01', contaCodigo: '1.1.3.01.0001', debito: 200_000, credito: 0, historico: 'Saldo Inicial Estoque' },
  { data: '2025-12-01', contaCodigo: '2.3.1.01.0001', debito: 0, credito: 200_000, historico: 'Aporte Estoque Inicial' },

  // Venda NF 72689 (2026-01-01) — 3.203,93
  { data: '2026-01-01', contaCodigo: '1.1.2.01.0001', debito: 3_203.93, credito: 0, historico: 'Venda NF 72689' },
  { data: '2026-01-01', contaCodigo: '3.1.1.01.0001', debito: 0, credito: 3_203.93, historico: 'Venda NF 72689' },
  { data: '2026-01-01', contaCodigo: '3.2.1.01.0001', debito: 576.71, credito: 0, historico: 'ICMS s/ Venda NF 72689' },
  { data: '2026-01-01', contaCodigo: '2.1.3.01.0001', debito: 0, credito: 576.71, historico: 'ICMS s/ Venda NF 72689' },

  // Custo da mercadoria vendida
  { data: '2026-01-01', contaCodigo: '4.1.1.01.0001', debito: 1_768.48, credito: 0, historico: 'CMV NF 72689' },
  { data: '2026-01-01', contaCodigo: '1.1.3.01.0001', debito: 0, credito: 1_768.48, historico: 'Baixa Estoque' },

  // Recebimento cliente
  { data: '2026-01-10', contaCodigo: '1.1.1.01.0002', debito: 3_203.93, credito: 0, historico: 'Rec. Cliente' },
  { data: '2026-01-10', contaCodigo: '1.1.2.01.0001', debito: 0, credito: 3_203.93, historico: 'Rec. Cliente' },

  // Amortização software (janeiro)
  { data: '2026-01-31', contaCodigo: '4.2.4.01.0004', debito: 3_745.40, credito: 0, historico: 'Amortização' },
  { data: '2026-01-31', contaCodigo: '1.1.1.01.0002', debito: 0, credito: 3_745.40, historico: 'Amortização' },

  // Venda NF 72690 (fev) — 5.000
  { data: '2026-02-05', contaCodigo: '1.1.2.01.0001', debito: 5_000, credito: 0, historico: 'Venda NF 72690' },
  { data: '2026-02-05', contaCodigo: '3.1.1.01.0001', debito: 0, credito: 5_000, historico: 'Venda NF 72690' },
  { data: '2026-02-05', contaCodigo: '3.2.1.01.0001', debito: 900, credito: 0, historico: 'ICMS NF 72690' },
  { data: '2026-02-05', contaCodigo: '2.1.3.01.0001', debito: 0, credito: 900, historico: 'ICMS NF 72690' },
  { data: '2026-02-05', contaCodigo: '4.1.1.01.0001', debito: 2_800, credito: 0, historico: 'CMV NF 72690' },
  { data: '2026-02-05', contaCodigo: '1.1.3.01.0001', debito: 0, credito: 2_800, historico: 'Baixa Estoque' },

  // Amortização fev
  { data: '2026-02-28', contaCodigo: '4.2.4.01.0004', debito: 3_745.40, credito: 0, historico: 'Amortização' },
  { data: '2026-02-28', contaCodigo: '1.1.1.01.0002', debito: 0, credito: 3_745.40, historico: 'Amortização' },

  // Venda NF 72691 (março) — 7.500
  { data: '2026-03-12', contaCodigo: '1.1.2.01.0001', debito: 7_500, credito: 0, historico: 'Venda NF 72691' },
  { data: '2026-03-12', contaCodigo: '3.1.1.01.0001', debito: 0, credito: 7_500, historico: 'Venda NF 72691' },
  { data: '2026-03-12', contaCodigo: '3.2.1.01.0001', debito: 1_350, credito: 0, historico: 'ICMS NF 72691' },
  { data: '2026-03-12', contaCodigo: '2.1.3.01.0001', debito: 0, credito: 1_350, historico: 'ICMS NF 72691' },
  { data: '2026-03-12', contaCodigo: '4.1.1.01.0001', debito: 4_200, credito: 0, historico: 'CMV NF 72691' },
  { data: '2026-03-12', contaCodigo: '1.1.3.01.0001', debito: 0, credito: 4_200, historico: 'Baixa Estoque' },

  // Amortização mar
  { data: '2026-03-31', contaCodigo: '4.2.4.01.0004', debito: 3_745.40, credito: 0, historico: 'Amortização' },
  { data: '2026-03-31', contaCodigo: '1.1.1.01.0002', debito: 0, credito: 3_745.40, historico: 'Amortização' },
];
