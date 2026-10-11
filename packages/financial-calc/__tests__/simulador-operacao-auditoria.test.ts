import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Decimal from 'decimal.js';
import {
  ErroSimuladorOperacao, calcularFichaBancaria, calcularRecalculoOperacao,
  simularOperacaoCompleta, validarFichaBancaria, validarRecalculoOperacao, validarSimuladorOperacao,
  type SimuladorOperacaoInput,
} from '../src/simulador-operacao.ts';

const base: SimuladorOperacaoInput = {
  agente: 'Teste', tomador: 'Teste', contrato: 'Teste', valorOperacao: 1000,
  dataCredito: '2026-01-01', primeiroVencimentoPrincipal: '2026-01-31',
  periodicidadePrincipal: 'MENSAL', periodicidadeJuros: 'JUNTO_PRINCIPAL', jurosAte: 'FINAL',
  numeroParcelas: 3, taxaPreAnual: 1.01 ** 12 - 1, taxaPosAnual: 0, despesas: [],
  seguroVidaAtivo: false, seguroFinanciado: false, seguroForma: 'VALOR_FIXO',
  seguroPercentualMensal: 0, seguroValor: 0, iofAtivo: false, iofPessoa: 'PF',
  iofAdicionalAtivo: false, iofFinanciado: false,
};
const cents = (value: number) => new Decimal(value).times(100).toDecimalPlaces(0).toNumber();
const close = (actual: number, expected: number, tolerance = 0.011) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('63 linhas do cenário salvo conferem com caches das colunas auditadas da planilha', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/simulador-v16-cached-reference.json', import.meta.url), 'utf8'));
  const resultado = simularOperacaoCompleta({ ...base, valorOperacao: 378380.2, dataCredito: '2026-04-30',
    primeiroVencimentoPrincipal: '2032-08-30', primeiroVencimentoJuros: '2027-04-30',
    periodicidadePrincipal: 'SEMESTRAL', periodicidadeJuros: 'SEMESTRAL', jurosAte: 'PRIMEIRA_PRINCIPAL',
    numeroParcelas: 10, taxaPreAnual: 0.15 });
  let conferidas = 0;
  for (const sistema of ['PRICE', 'SAC', 'SACRE'] as const) {
    const linhas = resultado.sistemas[sistema].linhas.slice(1);
    assert.equal(linhas.length, fixture.systems[sistema].length);
    for (const [index, esperado] of fixture.systems[sistema].entries()) {
      const atual = linhas[index];
      assert.equal(atual.data, esperado.data, esperado.sourceRange);
      for (const campo of ['juros', 'amortizacao', 'prestacao', 'saldoDevedor'] as const) close(atual[campo], esperado[campo], 0.051);
      conferidas++;
    }
  }
  assert.equal(conferidas, 63);
});

test('erros, datas impossíveis e números não finitos nunca produzem simulação de zero', () => {
  for (const patch of [
    { valorOperacao: NaN }, { valorOperacao: Infinity }, { valorOperacao: 0 },
    { taxaPreAnual: NaN }, { taxaPosAnual: Infinity }, { taxaPreAnual: -1 },
    { seguroValor: NaN }, { seguroPercentualMensal: -0.01 },
    { iofAtivo: 'false' as unknown as boolean },
    { despesas: [{ id: 'd', descricao: 'x', valor: 10, financiar: 'false' as unknown as boolean }] },
    { dataCredito: '2026-02-30' }, { dataCredito: '2026-01-01IGNORAR' },
    { numeroParcelas: 3.5 }, { despesas: [{ id: 'd', descricao: 'x', valor: Infinity, financiar: false }] },
  ]) {
    assert.equal(validarSimuladorOperacao({ ...base, ...patch }).valido, false);
    assert.throws(() => simularOperacaoCompleta({ ...base, ...patch }), (e: unknown) => e instanceof ErroSimuladorOperacao && e.codigo === 'ENTRADA_INVALIDA');
  }
});

test('juros mensais recuperam o dia 31 depois de fevereiro e respeitam ano bissexto', () => {
  for (const ano of [2026, 2028]) {
    const r = simularOperacaoCompleta({ ...base, dataCredito: `${ano}-01-01`, primeiroVencimentoPrincipal: `${ano}-05-31`,
      primeiroVencimentoJuros: `${ano}-01-31`, periodicidadePrincipal: 'UNICA', periodicidadeJuros: 'MENSAL', numeroParcelas: 1 });
    assert.deepEqual(r.sistemas.PRICE.linhas.slice(1).map((l) => l.data),
      [`${ano}-01-31`, `${ano}-02-${ano === 2028 ? 29 : 28}`, `${ano}-03-31`, `${ano}-04-30`, `${ano}-05-31`]);
  }
});

test('agenda não trunca juros mensais no antigo limite silencioso de 600 eventos', () => {
  const r = simularOperacaoCompleta({ ...base, numeroParcelas: 1, taxaPreAnual: 0,
    primeiroVencimentoPrincipal: '2077-01-31', primeiroVencimentoJuros: '2026-01-31',
    periodicidadePrincipal: 'UNICA', periodicidadeJuros: 'MENSAL' });
  assert.equal(r.sistemas.SAC.linhas.at(-1)?.data, '2077-01-31');
  assert.equal(r.sistemas.SAC.linhas.length, 614);
});

test('PRICE com juros intermediários usa o fluxo real e mantém prestações principais constantes', () => {
  const r = simularOperacaoCompleta({ ...base, primeiroVencimentoPrincipal: '2026-03-01',
    primeiroVencimentoJuros: '2026-02-01', periodicidadePrincipal: 'BIMESTRAL', periodicidadeJuros: 'MENSAL', numeroParcelas: 2 });
  const linhas = r.sistemas.PRICE.linhas.filter((l) => l.descricao === 'Princ.+Juros');
  // Crédito 1.000; juros pagos em fevereiro e abril. Nos vencimentos principais,
  // g1=1,01^(28/30), g2=1,01^(30/30), P=1000*g1*g2/(1+g2).
  const esperado = 1000 * 1.01 ** (28 / 30) * 1.01 / (1 + 1.01);
  close(linhas[0].prestacao, esperado);
  close(linhas[1].prestacao, esperado, 0.021);
  assert.equal(linhas[1].saldoDevedor, 0);
});

test('avulsa antes da primeira prestação preserva a prestação contratada e reduz juros', () => {
  const original = simularOperacaoCompleta({ ...base, numeroParcelas: 12 });
  const antecipado = simularOperacaoCompleta({ ...base, numeroParcelas: 12,
    amortizacoesAvulsas: [{ id: 'extra', data: '2026-01-15', valor: 200 }] });
  assert.equal(antecipado.sistemas.PRICE.indicadores.primeiraPrestacao, original.sistemas.PRICE.indicadores.primeiraPrestacao);
  assert.ok(antecipado.sistemas.PRICE.indicadores.totalJuros < original.sistemas.PRICE.indicadores.totalJuros);
  assert.ok(antecipado.sistemas.PRICE.indicadores.dataQuitacao < original.sistemas.PRICE.indicadores.dataQuitacao);
  assert.equal(antecipado.sistemas.PRICE.indicadores.totalAmortizacaoAvulsa, 200);
});

test('avulsa excessiva é auditada e comparação alinha cada sistema pela data', () => {
  const r = simularOperacaoCompleta({ ...base, numeroParcelas: 12,
    amortizacoesAvulsas: [{ id: 'extra', data: '2026-02-15', valor: 2000 }] });
  for (const sistema of Object.values(r.sistemas)) {
    assert.equal(sistema.indicadores.saldoFinal, 0);
    assert.ok(sistema.indicadores.amortizacaoAvulsaNaoAplicada > 1000);
    assert.equal(sistema.linhas.at(-1)?.data, '2026-02-15');
    assert.equal(sistema.indicadores.totalAmortizado, 1000);
  }
  for (const row of r.comparativo) for (const sistema of ['PRICE', 'SAC', 'SACRE'] as const) {
    const esperado = r.sistemas[sistema].linhas.find((l) => l.data === row.data)?.fluxoCaixa ?? 0;
    assert.equal(row[sistema.toLowerCase() as 'price' | 'sac' | 'sacre'], esperado);
  }
});

test('avulsas no mesmo dia são somadas uma vez e não geram juros repetidos', () => {
  const parcelas = [{ id: 'a', data: '2026-01-15', valor: 50.1 }, { id: 'b', data: '2026-01-15', valor: 100.2 }];
  const r = simularOperacaoCompleta({ ...base, amortizacoesAvulsas: parcelas });
  const unico = simularOperacaoCompleta({ ...base, amortizacoesAvulsas: [{ id: 'c', data: '2026-01-15', valor: 150.3 }] });
  assert.deepEqual(r.sistemas, unico.sistemas);
});

test('avulsa posterior ao prazo, identificador duplicado e juros fora do período são rejeitados', () => {
  for (const patch of [
    { amortizacoesAvulsas: [{ id: 'a', data: '2027-01-01', valor: 1 }] },
    { amortizacoesAvulsas: [{ id: 'a', data: '2026-01-15', valor: 1 }, { id: 'a', data: '2026-01-15', valor: 1 }] },
    { periodicidadeJuros: 'MENSAL' as const, primeiroVencimentoJuros: '2027-01-01' },
  ]) assert.equal(validarSimuladorOperacao({ ...base, ...patch }).valido, false);
});

test('todas as linhas e totais conciliam em centavos com custos mistos', () => {
  const r = simularOperacaoCompleta({ ...base, valorOperacao: 1234567.89, numeroParcelas: 36,
    despesas: [{ id: 'a', descricao: 'financiada', valor: 100.1, financiar: true }, { id: 'b', descricao: 'à vista', valor: 200.2, financiar: false }],
    seguroVidaAtivo: true, seguroForma: 'PERCENTUAL_SALDO', seguroPercentualMensal: 0.0001, seguroFinanciado: true,
    iofAtivo: true, iofAdicionalAtivo: true, iofFinanciado: false,
    amortizacoesAvulsas: [{ id: 'e', data: '2026-05-15', valor: 12345.67 }] });
  for (const sistema of Object.values(r.sistemas)) {
    const ind = sistema.indicadores;
    assert.equal(cents(ind.valorFinanciado), cents(ind.valorOperacao) + cents(ind.custos.despesasFinanciadas) + cents(ind.custos.seguroFinanciado) + cents(ind.custos.iofFinanciado));
    assert.equal(cents(ind.totalAmortizado), cents(ind.valorFinanciado));
    assert.equal(cents(ind.totalPrestacoes), cents(ind.totalAmortizado) + cents(ind.totalJuros));
    assert.equal(sistema.linhas[0].fluxoCaixa, ind.valorLiquidoCreditado);
    for (const linha of sistema.linhas.slice(1)) {
      assert.equal(cents(linha.prestacao), cents(linha.juros) + cents(linha.amortizacao));
      assert.equal(cents(linha.saldoDevedor), cents(linha.saldoInicial) - cents(linha.amortizacao));
    }
    assert.equal(cents(ind.custos.iofTotal), sistema.linhas.reduce((s, l) => s + cents(l.iof), 0));
    assert.equal(cents(ind.custos.seguroTotal), sistema.linhas.reduce((s, l) => s + cents(l.seguro), 0));
  }
});

test('seguro fixo, despesas e IOF financiados não são cobrados duas vezes', () => {
  const r = simularOperacaoCompleta({ ...base, taxaPreAnual: 0, despesas: [{ id: 'd', descricao: 'despesa', valor: 100, financiar: true }],
    seguroVidaAtivo: true, seguroValor: 50, seguroFinanciado: true,
    iofAtivo: true, iofDiarioAtivo: false, iofAdicionalAtivo: true, iofFinanciado: true });
  for (const s of Object.values(r.sistemas)) {
    assert.equal(s.indicadores.valorFinanciado, 1154.37); // 1.000 + 100 + 50 + 0,38% de 1.150.
    assert.equal(s.indicadores.valorLiquidoCreditado, 1000);
    assert.equal(s.indicadores.totalPrestacoes, 1154.37);
    assert.equal(s.linhas[0].seguro, 50);
    assert.equal(s.linhas[0].iof, 4.37);
  }
});

test('IOF histórico tem teto de 365 dias e a seleção desligada prevalece', () => {
  const r = simularOperacaoCompleta({ ...base, valorOperacao: 100000, taxaPreAnual: 0, numeroParcelas: 1,
    primeiroVencimentoPrincipal: '2028-01-01', iofAtivo: true, iofFinanciado: false });
  assert.equal(r.sistemas.SAC.indicadores.custos.iofDiario, 3000);
  const pj = simularOperacaoCompleta({ ...r.parametros, iofPessoa: 'PJ' });
  assert.equal(pj.sistemas.SAC.indicadores.custos.iofDiario, 1500);
  assert.ok(r.validacao.avisos.some((a) => a.codigo === 'IOF_PARAMETROS_HISTORICOS'));
});

test('custos inviáveis e crédito líquido não positivo falham explicitamente', () => {
  assert.throws(() => simularOperacaoCompleta({ ...base, despesas: [{ id: 'd', descricao: 'custo', valor: 1000, financiar: false }] }), (e: unknown) => e instanceof ErroSimuladorOperacao && e.codigo === 'CREDITO_LIQUIDO_NAO_POSITIVO');
  assert.throws(() => simularOperacaoCompleta({ ...base, numeroParcelas: 2, seguroVidaAtivo: true,
    seguroForma: 'PERCENTUAL_SALDO', seguroPercentualMensal: 1, seguroFinanciado: true }), ErroSimuladorOperacao);
});

test('CET distingue 365 dias da convenção histórica de 360 e mede custo efetivo à vista', () => {
  const r = simularOperacaoCompleta({ ...base, dataCredito: '2026-01-01', primeiroVencimentoPrincipal: '2027-01-01', numeroParcelas: 1,
    taxaPreAnual: 0.1, despesas: [{ id: 'd', descricao: 'custo', valor: 100, financiar: false }] });
  const ind = r.sistemas.PRICE.indicadores;
  const esperado365 = ind.totalPrestacoes / 900 - 1;
  close(ind.cetAnual365, esperado365, 1e-9);
  close(ind.cetAnual, (1 + esperado365) ** (360 / 365) - 1, 1e-9);
  assert.ok(ind.cetAnual365 > ind.cetAnual);
  assert.equal(ind.convencaoCet, '365_DIAS');
});

test('CET resolve zero, taxas negativas extremas e altas sem devolver zero por falha de Newton', () => {
  for (const [pago, esperado] of [[1000, 0], [100, -0.9], [1, -0.999], [25000, 24]]) {
    const r = calcularRecalculoOperacao({ dataInicial: '2026-01-01', valorCredito: 1000, entrada: 0, custosAcessorios: 0,
      taxaMensal: 0, periodicidade: 'ANUAL', parcelas: [{ id: 'p', data: '2027-01-01', valor: pago }] });
    close(r.cetAnual365, esperado, 1e-9);
  }
});

test('recálculo confere taxa informada e resolve inversamente crédito/custos como o GoalSeek', () => {
  const r = calcularRecalculoOperacao({ dataInicial: '2026-01-01', valorCredito: 900, entrada: 0, custosAcessorios: 0,
    taxaMensal: 0.01, periodicidade: 'MENSAL', parcelas: [{ id: 'p', data: '2026-01-31', valor: 1010 }] });
  assert.equal(r.valorPresenteParcelas, 1000);
  assert.equal(r.diferencaValorPresente, 100);
  assert.equal(r.custosAcessoriosCompativeisTaxaInformada, 100);
  assert.equal(r.creditoCompativelTaxaInformada, 1000);
  assert.equal(r.ajusteParaTaxaInformadaRequerDesconto, false);
  const ajuste = calcularRecalculoOperacao({ dataInicial: '2026-01-01', valorCredito: 1100, entrada: 0, custosAcessorios: 0,
    taxaMensal: 0.01, periodicidade: 'MENSAL', parcelas: [{ id: 'p', data: '2026-01-31', valor: 1010 }] });
  assert.equal(ajuste.custosAcessoriosCompativeisTaxaInformada, -100);
  assert.equal(ajuste.ajusteParaTaxaInformadaRequerDesconto, true);
});

test('recálculo separa a taxa da base financiada do CET sobre crédito líquido', () => {
  const r = calcularRecalculoOperacao({ dataInicial: '2026-01-01', valorCredito: 1000, entrada: 100, custosAcessorios: 100,
    taxaMensal: 0, periodicidade: 'ANUAL', parcelas: [{ id: 'p', data: '2027-01-01', valor: 1100 }] });
  assert.equal(r.valorFinanciado, 1000);
  assert.equal(r.valorLiquidoCreditado, 900);
  close(r.cetAnual365, 0.1, 1e-9);
  close(r.cetLiquidoAnual365, 1100 / 900 - 1, 1e-9);
  assert.ok(r.cetLiquidoAnual365 > r.cetAnual365);
});

test('recálculo rejeita parcelas vazias ou corrompidas em vez de filtrá-las silenciosamente', () => {
  const input = { dataInicial: '2026-01-01', valorCredito: 1000, entrada: 0, custosAcessorios: 0, taxaMensal: 0, periodicidade: 'MENSAL' as const,
    parcelas: [{ id: 'p', data: '2026-02-01', valor: 1000 }] };
  for (const patch of [{ parcelas: [] }, { entrada: 1001 }, { taxaMensal: NaN },
    { parcelas: [{ id: 'p', data: '2025-01-01', valor: 1000 }] },
    { parcelas: [{ id: 'p', data: '2026-02-01', valor: 0 }] }]) {
    assert.equal(validarRecalculoOperacao({ ...input, ...patch }).valido, false);
    assert.throws(() => calcularRecalculoOperacao({ ...input, ...patch }), ErroSimuladorOperacao);
  }
});

test('ficha reproduz o exemplo salvo com a data de corte do cache expressa', () => {
  const pagamentos: Array<[string, number]> = [['2023-04-11', 345076.67], ['2023-07-13', 67549.07], ['2023-07-13', 676.19],
    ['2024-02-16', 23985.09], ['2024-06-27', 4.01], ['2024-07-03', 800000], ['2024-07-04', 220000],
    ['2025-05-09', 1143940.72], ['2026-05-14', 0]];
  const r = calcularFichaBancaria({ valorOperacao: 3502216.12, taxaMensal: 0.01, dataInicio: '2023-04-03',
    eventos: pagamentos.map(([data, amortizacao], i) => ({ id: `p${i}`, data, amortizacao, evento: 'Conferência' })) });
  // FICHA GRÁFICA BANCÁRIA!H16 (TODAY cacheado em 14/05/2026), F6 e G6.
  close(r.saldoAtual, 1905742.973065203, 0.031);
  close(r.totalJuros, 1004758.6030652022, 0.031);
  assert.equal(r.totalAmortizacoes, 2601231.75);
});

test('ficha distingue pagamento informado, aplicado e excedente e não inventa crédito negativo', () => {
  const r = calcularFichaBancaria({ valorOperacao: 1000, taxaMensal: 0.01, dataInicio: '2026-01-01',
    eventos: [{ id: 'p', data: '2026-01-31', amortizacao: 1100, evento: 'Quitação' },
      { id: 'q', data: '2026-02-01', amortizacao: 50, evento: 'A conferir' }] });
  assert.equal(r.totalAmortizacoes, 1010);
  assert.equal(r.totalPagamentosInformados, 1150);
  assert.equal(r.totalExcedente, 140);
  assert.equal(r.saldoAtual, 0);
  assert.equal(r.linhas[2].jurosPeriodo, 0);
});

test('ficha rejeita evento retroativo, valor negativo e data inválida', () => {
  const baseFicha = { valorOperacao: 1000, taxaMensal: 0, dataInicio: '2026-01-01', eventos: [] };
  for (const [data, amortizacao] of [['2025-12-31', 1], ['2026-02-30', 1], ['2026-01-02', -1], ['2026-01-02', NaN]] as const) {
    const input = { ...baseFicha, eventos: [{ id: 'p', data, amortizacao, evento: 'Teste' }] };
    assert.equal(validarFichaBancaria(input).valido, false);
    assert.throws(() => calcularFichaBancaria(input), ErroSimuladorOperacao);
  }
});

test('SACRE com juros separados depois do principal liquida os juros acumulados', () => {
  const r = simularOperacaoCompleta({ ...base, primeiroVencimentoPrincipal: '2026-01-31',
    primeiroVencimentoJuros: '2026-02-15', periodicidadePrincipal: 'BIMESTRAL', periodicidadeJuros: 'BIMESTRAL', numeroParcelas: 2 });
  const linhas = r.sistemas.SACRE.linhas;
  assert.equal(linhas[1].juros, 5); // 500 amortizados por 30 dias.
  close(linhas[2].juros, 500 * (1.01 ** (45 / 30) - 1)); // 500 restantes por todos os 45 dias, não só os últimos 15.
  assert.equal(linhas.at(-1)?.saldoDevedor, 0);
});

test('pagamentos posteriores à quitação não alteram o valor já liquidado', () => {
  const r = simularOperacaoCompleta({ ...base, taxaPreAnual: 0,
    amortizacoesAvulsas: [{ id: 'a', data: '2026-01-15', valor: 1000 }, { id: 'b', data: '2026-02-15', valor: 25 }] });
  for (const s of Object.values(r.sistemas)) {
    assert.equal(s.indicadores.totalAmortizado, 1000);
    assert.equal(s.indicadores.dataQuitacao, '2026-01-15');
    assert.equal(s.indicadores.amortizacaoAvulsaNaoAplicada, 25);
    assert.equal(s.linhas.at(-1)?.prestacao, 0);
  }
});

test('tamanhos que excedem a representação monetária legada são bloqueados', () => {
  assert.throws(() => simularOperacaoCompleta({ ...base, valorOperacao: 1e25 }), ErroSimuladorOperacao);
});
