import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { ebit, ebitda, type DadosContabeis } from '../src/index.js';
import { PLANO_CONTAS_FIXTURE } from '../src/__fixtures__/planoContas.js';
import { LANCAMENTOS_FIXTURE } from '../src/__fixtures__/lancamentos.js';

const DADOS: DadosContabeis = {
  planoContas: PLANO_CONTAS_FIXTURE,
  lancamentos: LANCAMENTOS_FIXTURE,
};

describe('ebit', () => {
  it('calcula EBIT = Σ créditos − Σ débitos para contas flag EBIT', () => {
    const val = ebit(DADOS, '2026-01-01', '2026-03-31');
    // Receitas brutas: 3.203,93 + 5.000 + 7.500 = 15.703,93 (créditos em 3.1.1)
    // (-) ICMS: 576,71 + 900 + 1.350 = 2.826,71 (débitos em 3.2.1)
    // (-) CMV: 1.768,48 + 2.800 + 4.200 = 8.768,48 (débitos em 4.1.1)
    // (-) Amortização: 3.745,40 * 3 = 11.236,20 (débitos em 4.2.4; EBIT=true)
    // EBIT = 15.703,93 − 2.826,71 − 8.768,48 − 11.236,20 = -7.127,46
    assert.ok(Math.abs(val - -7_127.46) < 0.01, `EBIT ${val} != -7127.46`);
  });

  it('EBIT é 0 quando intervalo sem lançamentos', () => {
    const val = ebit(DADOS, '2027-01-01', '2027-12-31');
    assert.equal(val, 0);
  });
});

describe('EBIT > EBITDA (amortização volta ao lucro)', () => {
  it('EBITDA = EBIT + Amortizações', () => {
    const e = ebit(DADOS, '2026-01-01', '2026-03-31');
    const eb = ebitda(DADOS, '2026-01-01', '2026-03-31');
    const amort = 3_745.4 * 3;
    assert.ok(
      Math.abs(eb - (e + amort)) < 0.01,
      `EBITDA ${eb} != EBIT ${e} + amortização ${amort}`,
    );
  });
});
