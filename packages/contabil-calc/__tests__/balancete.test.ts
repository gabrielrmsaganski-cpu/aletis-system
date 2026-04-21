import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { balancete, type DadosContabeis } from '../src/index.js';
import { PLANO_CONTAS_FIXTURE } from '../src/__fixtures__/planoContas.js';
import { LANCAMENTOS_FIXTURE } from '../src/__fixtures__/lancamentos.js';

const DADOS: DadosContabeis = {
  planoContas: PLANO_CONTAS_FIXTURE,
  lancamentos: LANCAMENTOS_FIXTURE,
};

describe('balancete', () => {
  it('retorna cabeçalho com 6 colunas na ordem canônica', () => {
    const rel = balancete(DADOS, '2026-01-01', '2026-03-31');
    assert.deepEqual(rel.cabecalho, [
      'Conta',
      'Descrição',
      'Saldo Inicial',
      'Débito',
      'Crédito',
      'Saldo Final',
    ]);
  });

  it('retorna uma linha para cada conta visível', () => {
    const rel = balancete(DADOS, '2026-01-01', '2026-03-31');
    const visíveis = PLANO_CONTAS_FIXTURE.filter((c) => c.balancete);
    assert.equal(rel.corpo.length, visíveis.length);
  });

  it('calcula saldo inicial correto para Capital Subscrito (2.3.1.01.0001)', () => {
    const rel = balancete(DADOS, '2026-01-01', '2026-03-31');
    const capital = rel.corpo.find((l) => l.conta === '2.3.1.01.0001')!;
    // Capital subscrito é passivo/PL: saldo = créditos − débitos antes de 2026-01-01
    // Créditos antes: 500.000 + 200.000 = 700.000
    assert.equal(capital.valores[0], 700_000);
    // Sem débito ou crédito novo no período
    assert.equal(capital.valores[1], 0);
    assert.equal(capital.valores[2], 0);
    assert.equal(capital.valores[3], 700_000);
  });

  it('calcula saldo inicial correto para Bancos (1.1.1.01.0002)', () => {
    const rel = balancete(DADOS, '2026-01-01', '2026-03-31');
    const bancos = rel.corpo.find((l) => l.conta === '1.1.1.01.0002')!;
    // Saldo inicial = débitos − créditos antes de 2026-01-01 = 500.000
    assert.equal(bancos.valores[0], 500_000);
    // Débitos no período: 3.203,93 (recebimento cliente)
    assert.ok(Math.abs((bancos.valores[1] as number) - 3_203.93) < 0.01);
    // Créditos no período: 3.745,40 * 3 (amortizações)
    assert.ok(Math.abs((bancos.valores[2] as number) - 11_236.2) < 0.01);
    // Saldo final = 500.000 + 3.203,93 − 11.236,20 = 491.967,73
    assert.ok(Math.abs((bancos.valores[3] as number) - 491_967.73) < 0.01);
  });

  it('rodapé TOTAL (Ativo - Passivo) é zero (contas-raiz em balanço)', () => {
    const rel = balancete(DADOS, '2026-01-01', '2026-03-31');
    assert.ok(rel.rodape, 'rodape presente');
    assert.equal(rel.rodape!.conta, 'TOTAL');
    // O fixture tem contas-raiz "1" e "2" que agregam todos os lançamentos.
    // O total débito do período = total crédito do período (partidas dobradas).
    const totDebito = rel.rodape!.valores[1] as number;
    const totCredito = rel.rodape!.valores[2] as number;
    assert.ok(
      Math.abs(totDebito - totCredito) < 0.01,
      `débito ${totDebito} != crédito ${totCredito}`,
    );
  });
});
