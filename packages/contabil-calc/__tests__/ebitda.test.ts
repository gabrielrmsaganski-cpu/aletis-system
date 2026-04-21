import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  dreLucroLiquido,
  ebitda,
  ebitdaDRECompleto,
  type DadosContabeis,
} from '../src/index.js';
import { PLANO_CONTAS_FIXTURE } from '../src/__fixtures__/planoContas.js';
import { LANCAMENTOS_FIXTURE } from '../src/__fixtures__/lancamentos.js';

const DADOS: DadosContabeis = {
  planoContas: PLANO_CONTAS_FIXTURE,
  lancamentos: LANCAMENTOS_FIXTURE,
};

describe('ebitda', () => {
  it('calcula EBITDA para Q1 2026', () => {
    const val = ebitda(DADOS, '2026-01-01', '2026-03-31');
    // Receitas: 15.703,93 (3.1.1)
    // ICMS:     -2.826,71 (3.2.1)
    // CMV:      -8.768,48 (4.1.1)
    // Amortização NÃO entra no EBITDA (flag false)
    // EBITDA = 15.703,93 − 2.826,71 − 8.768,48 = 4.108,74
    assert.ok(Math.abs(val - 4_108.74) < 0.01, `EBITDA ${val} != 4108.74`);
  });

  it('é 0 fora do período', () => {
    assert.equal(ebitda(DADOS, '2020-01-01', '2020-12-31'), 0);
  });
});

describe('ebitdaDRECompleto', () => {
  it('retorna cabeçalho + linhas com indentação + rodapé TOTAL EBITDA', () => {
    const rel = ebitdaDRECompleto(DADOS, '2026-01-01', '2026-03-31');
    assert.deepEqual(rel.cabecalho, ['Descrição', 'R$']);
    assert.ok(rel.corpo.length > 0, 'corpo não vazio');
    assert.ok(rel.rodape, 'rodape presente');
    assert.equal(rel.rodape!.conta, 'TOTAL EBITDA');
    assert.equal(typeof rel.rodape!.valores[0], 'number');
    assert.ok(
      Math.abs((rel.rodape!.valores[0] as number) - 4_108.74) < 0.01,
      `rodape ${rel.rodape!.valores[0]} != 4108.74`,
    );

    // Indentação — contas de nível 13 começam com 26 espaços.
    const filha = rel.corpo.find((l) => l.conta === '3.1.1.01.0001');
    assert.ok(filha, 'conta filha presente');
    assert.ok(filha!.descricao.startsWith('  '), 'descrição indentada');
  });
});

describe('cross-check DRE vs EBITDA', () => {
  it('LL = EBITDA − Amortização (no fixture)', () => {
    const dre = dreLucroLiquido(DADOS, '2026-01-01', '2026-03-31');
    const ll = dre.rodape!.valores[0] as number;
    const eb = ebitda(DADOS, '2026-01-01', '2026-03-31');
    const amort = 3_745.4 * 3;
    assert.ok(
      Math.abs(ll - (eb - amort)) < 0.01,
      `LL ${ll} != EBITDA ${eb} - amort ${amort}`,
    );
  });
});
