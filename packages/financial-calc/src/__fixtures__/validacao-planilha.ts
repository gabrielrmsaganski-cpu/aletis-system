/**
 * Fixtures de validação contra a planilha `MÉTODOS DE CÁLCULO.xlsm`.
 *
 * Cada entrada captura:
 *   - os parâmetros de entrada (iguais aos das abas da planilha)
 *   - o resultado esperado (extraído diretamente das células calculadas)
 *
 * Serve como documentação viva: "nossa lib bate com a planilha do Sisbr".
 * Não há framework de testes neste package — a verificação é manual via
 * `tsx` ou é feita do lado do consumidor (`apps/api`).
 *
 * Tolerâncias: centavos (R$ 0,01) nas colunas em BRL.
 */

import type { ParametrosOperacao } from '../amortizacao/types.js';

export interface FixtureValidacao {
  /** Identificador único do cenário. */
  id: string;
  /** Aba da planilha que originou o caso. */
  abaPlanilha: string;
  /** Descrição curta. */
  descricao: string;
  params: ParametrosOperacao;
  esperado: {
    /** Linhas da tabela (subset dos campos que a planilha expõe). */
    tabela: Array<{
      parcela: number;
      data: string;
      diasCorridos: number;
      diasUteis: number;
      jurosPos: number;
      jurosPre: number;
      amortizacao: number;
      pagamento: number;
      saldoFinal: number;
    }>;
  };
  /** Notas sobre divergências ou tolerâncias conhecidas. */
  notas?: string;
}

// ── Fixture 1: SAC Decrescente pós-fixado (caso "BASE DE CÁLCULO") ──────────
// Cenário da planilha: 1M, 4 parcelas anuais, taxa 0,35% a.m., pós CDI 14,15% a.a.,
// data op 2024-06-15, primeiro venc 2025-05-30, dia venc 30.
export const FIXTURE_SAC_POS_4PARCELAS: FixtureValidacao = {
  id: 'sac-pos-4x-anual-0.35am-14.15aa',
  abaPlanilha: 'SAC Decrescente Pré e Pós',
  descricao: 'SAC pós-fixado — 1M, 4x anuais, 0.35% a.m. + 14.15% a.a.',
  params: {
    valor: 1_000_000,
    dataOperacao: '2024-06-15',
    numeroParcelas: 4,
    periodicidade: 'ANUAL',
    taxaMensal: 0.0035,
    taxaPosAnual: 0.1415,
    diaVencimento: 30,
    primeiroVencimento: '2025-05-30',
    sistema: 'SAC_POS',
  },
  esperado: {
    tabela: [
      { parcela: 1, data: '2025-05-30', diasCorridos: 349, diasUteis: 242,
        jurosPos: 135520.88, jurosPre: 47100.69, amortizacao: 250000.0,
        pagamento: 432621.57, saldoFinal: 750000.0 },
      { parcela: 2, data: '2026-06-01', diasCorridos: 367, diasUteis: 253,
        jurosPos: 106574.73, jurosPre: 37402.13, amortizacao: 250000.0,
        pagamento: 393976.86, saldoFinal: 500000.0 },
      { parcela: 3, data: '2027-06-30', diasCorridos: 394, diasUteis: 271,
        jurosPos: 76473.60, jurosPre: 27066.28, amortizacao: 250000.0,
        pagamento: 353539.87, saldoFinal: 250000.0 },
      { parcela: 4, data: '2028-06-30', diasCorridos: 366, diasUteis: 252,
        jurosPos: 35375.00, jurosPre: 12426.15, amortizacao: 250000.0,
        pagamento: 297801.15, saldoFinal: 0 },
    ],
  },
  notas:
    'Cenário idêntico à planilha. Divergência esperada ≤ 0,01 em cada célula ' +
    'devido a arredondamentos intermediários.',
};

// ── Fixture 2: Tabela Price pré-fixado (4 parcelas anuais) ──────────────────
export const FIXTURE_PRICE_PRE_4PARCELAS: FixtureValidacao = {
  id: 'price-pre-4x-anual-0.35am',
  abaPlanilha: 'Tabela Price',
  descricao: 'Price pré-fixado — 1M, 4x anuais, 0.35% a.m.',
  params: {
    valor: 1_000_000,
    dataOperacao: '2024-06-15',
    numeroParcelas: 4,
    periodicidade: 'ANUAL',
    taxaMensal: 0.0035,
    diaVencimento: 30,
    primeiroVencimento: '2025-05-30',
    sistema: 'PRICE_PRE',
  },
  esperado: {
    tabela: [
      { parcela: 1, data: '2025-05-30', diasCorridos: 349, diasUteis: 0,
        jurosPos: 0, jurosPre: 41482.92, amortizacao: 236220.72,
        pagamento: 277703.64, saldoFinal: 763779.28 },
      { parcela: 2, data: '2026-06-01', diasCorridos: 367, diasUteis: 0,
        jurosPos: 0, jurosPre: 33353.10, amortizacao: 244350.54,
        pagamento: 277703.64, saldoFinal: 519428.74 },
      { parcela: 3, data: '2027-06-30', diasCorridos: 394, diasUteis: 0,
        jurosPos: 0, jurosPre: 24390.03, amortizacao: 253313.61,
        pagamento: 277703.64, saldoFinal: 266115.13 },
      { parcela: 4, data: '2028-06-30', diasCorridos: 366, diasUteis: 0,
        jurosPos: 0, jurosPre: 11588.50, amortizacao: 266115.13,
        pagamento: 277703.64, saldoFinal: 0 },
    ],
  },
  notas:
    'Para PRICE_PRE a coluna `diasUteis` é zero (não há remuneração pós). ' +
    'Tolerância: 1 centavo por linha. PMT teórico = R$ 277.703,64.',
};

// ── Fixture 3: SAC Especial (Parcelado Decrescente) ─────────────────────────
export const FIXTURE_SAC_ESPECIAL_4PARCELAS: FixtureValidacao = {
  id: 'sac-especial-4x-anual-0.35am-14.15aa',
  abaPlanilha: 'Parcelado Decrescente Pré e Pós',
  descricao: 'SAC Especial pós-fixado — amortizações custom [2500, 2500, 2500, resto]',
  params: {
    valor: 1_000_000,
    dataOperacao: '2024-06-15',
    numeroParcelas: 4,
    periodicidade: 'ANUAL',
    taxaMensal: 0.0035,
    taxaPosAnual: 0.1415,
    diaVencimento: 30,
    primeiroVencimento: '2025-05-30',
    sistema: 'SAC_ESPECIAL',
    amortizacoesCustomizadas: [2500, 2500, 2500, 992500],
  },
  esperado: {
    tabela: [
      { parcela: 1, data: '2025-05-30', diasCorridos: 349, diasUteis: 242,
        jurosPos: 135520.88, jurosPre: 3798.88, amortizacao: 2500,
        pagamento: 141819.77, saldoFinal: 997500 },
      { parcela: 2, data: '2026-06-01', diasCorridos: 367, diasUteis: 253,
        jurosPos: 141744.39, jurosPre: 4008.26, amortizacao: 2500,
        pagamento: 148252.65, saldoFinal: 995000 },
      { parcela: 3, data: '2027-06-30', diasCorridos: 394, diasUteis: 271,
        jurosPos: 152182.46, jurosPre: 4333.69, amortizacao: 2500,
        pagamento: 159016.15, saldoFinal: 992500 },
      { parcela: 4, data: '2028-06-30', diasCorridos: 366, diasUteis: 252,
        jurosPos: 140438.75, jurosPre: 3975.19, amortizacao: 992500,
        pagamento: 1136913.94, saldoFinal: 0 },
    ],
  },
  notas:
    'Soma das amortizações custom = 1.000.000. Última parcela absorve ' +
    'qualquer resíduo de centavos.',
};

export const FIXTURES_VALIDACAO: readonly FixtureValidacao[] = [
  FIXTURE_SAC_POS_4PARCELAS,
  FIXTURE_PRICE_PRE_4PARCELAS,
  FIXTURE_SAC_ESPECIAL_4PARCELAS,
];
