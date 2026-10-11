import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calcularFichaBancaria,
  calcularRecalculoOperacao,
  simularOperacaoCompleta,
  validarSimuladorOperacao,
  type SimuladorOperacaoInput,
} from '../src/index.ts';

const baseInput: SimuladorOperacaoInput = {
  agente: 'Agente',
  tomador: 'Tomador',
  contrato: 'Contrato',
  valorOperacao: 378_380.2,
  dataCredito: '2026-04-30',
  primeiroVencimentoPrincipal: '2032-08-30',
  primeiroVencimentoJuros: '2027-04-30',
  periodicidadePrincipal: 'SEMESTRAL',
  periodicidadeJuros: 'SEMESTRAL',
  jurosAte: 'PRIMEIRA_PRINCIPAL',
  numeroParcelas: 10,
  taxaPreAnual: 0.15,
  taxaPosAnual: 0,
  despesas: [],
  seguroVidaAtivo: false,
  seguroFinanciado: false,
  seguroForma: 'PERCENTUAL_SALDO',
  seguroPercentualMensal: 0,
  seguroValor: 0,
  iofAtivo: false,
  iofDiarioAtivo: true,
  iofPessoa: 'PF',
  iofAdicionalAtivo: true,
  iofFinanciado: false,
};

test('simula PRICE, SAC e SACRE com saldo final quitado', () => {
  const result = simularOperacaoCompleta(baseInput);

  assert.deepEqual(Object.keys(result.sistemas), ['PRICE', 'SAC', 'SACRE']);
  for (const sistema of Object.values(result.sistemas)) {
    assert.equal(sistema.indicadores.valorOperacao, baseInput.valorOperacao);
    assert.ok(sistema.indicadores.primeiraPrestacao > 0);
    assert.ok(Math.abs(sistema.indicadores.saldoFinal) < 0.02);
    assert.ok(sistema.indicadores.cetMensal > 0);
  }
});

test('mantem paridade com o cenario padrao do Simulador v16', () => {
  const result = simularOperacaoCompleta(baseInput);

  const esperado = {
    PRICE: { primeira: 53_457.407218014734, juros: 491_925.58507658355 },
    SAC: { primeira: 56_190.72845005858, juros: 479_108.5311764784 },
    SACRE: { primeira: 39_673.29084500586, juros: 514_460.91624589707 },
  };

  for (const sistema of ['PRICE', 'SAC', 'SACRE'] as const) {
    const linha = result.sistemas[sistema].linhas.find((l) => l.descricao === 'Princ.+Juros');
    assert.ok(linha);
    assert.ok(Math.abs(linha.prestacao - esperado[sistema].primeira) < 0.02);
    assert.ok(Math.abs(result.sistemas[sistema].indicadores.totalJuros - esperado[sistema].juros) < 0.05);
    assert.ok(Math.abs(result.sistemas[sistema].indicadores.cetMensal - 0.011714916865398939) < 0.00000005);
    assert.ok(Math.abs(result.sistemas[sistema].indicadores.cetAnual - 0.14999999925723162) < 0.0000002);
  }
});

test('incorpora despesas, seguro e IOF no valor financiado quando marcados', () => {
  const result = simularOperacaoCompleta({
    ...baseInput,
    despesas: [{ id: 'tac', descricao: 'TAC', valor: 10_000, financiar: true }],
    seguroVidaAtivo: true,
    seguroFinanciado: true,
    seguroForma: 'VALOR_FIXO',
    seguroValor: 5_000,
    iofAtivo: true,
    iofFinanciado: true,
  });

  const price = result.sistemas.PRICE.indicadores;
  assert.ok(price.valorFinanciado > baseInput.valorOperacao + 15_000);
  assert.ok(price.custos.iofTotal > 0);
  assert.equal(price.custos.seguroFinanciado, 5_000);
});

test('credito rural permite financiar somente IOF adicional de 0,38% sem IOF diario', () => {
  const result = simularOperacaoCompleta({
    ...baseInput,
    valorOperacao: 1_500_000,
    despesas: [
      { id: 'honorarios', descricao: 'Honorarios', valor: 30_000, financiar: false },
      { id: 'projeto', descricao: 'Projeto tecnico', valor: 15_000, financiar: false },
    ],
    iofAtivo: true,
    iofDiarioAtivo: false,
    iofAdicionalAtivo: true,
    iofFinanciado: true,
  });

  const price = result.sistemas.PRICE.indicadores;
  assert.equal(price.custos.iofDiario, 0);
  assert.equal(price.custos.iofAdicional, 5_700);
  assert.equal(price.custos.iofFinanciado, 5_700);
  assert.equal(price.valorFinanciado, 1_505_700);
  assert.equal(price.valorLiquidoCreditado, 1_455_000);
});

test('calcula recalculo de operacao por fluxo de pagamento', () => {
  const result = calcularRecalculoOperacao({
    dataInicial: '2026-05-15',
    valorCredito: 1_025_787.55,
    entrada: 115_000,
    custosAcessorios: 14_249.98,
    taxaMensal: 0.0153,
    periodicidade: 'SEMESTRAL',
    parcelas: [
      { id: '1', data: '2027-05-15', valor: 184_577.6 },
      { id: '2', data: '2027-08-30', valor: 184_577.6 },
    ],
  });

  assert.equal(result.valorFinanciado, 925_037.53);
  assert.equal(result.totalParcelas, 369_155.2);
  assert.equal(result.totalComEstruturacao, 354_905.22);
  assert.equal(result.diferenca, -14_249.98);
  assert.ok(Number.isFinite(result.cetAnual));
});

test('mantem o sinal do custo de estruturacao da aba de recalculo da planilha v16', () => {
  const result = calcularRecalculoOperacao({
    dataInicial: '2026-05-15',
    valorCredito: 1_025_787.55,
    entrada: 115_000,
    custosAcessorios: 14_249.97749,
    taxaMensal: 0.0153,
    periodicidade: 'SEMESTRAL',
    parcelas: Array.from({ length: 8 }, (_, index) => ({
      id: String(index + 1),
      data: index % 2 === 0
        ? `${2027 + Math.floor(index / 2)}-05-15`
        : `${2027 + Math.floor(index / 2)}-08-30`,
      valor: 184_577.6,
    })),
  });

  assert.equal(result.valorFinanciado, 925_037.53);
  assert.equal(result.totalParcelas, 1_476_620.8);
  assert.equal(result.totalComEstruturacao, 1_462_370.82);
  assert.equal(result.diferenca, -14_249.98);
});

test('frequencia unica gera exatamente uma parcela principal', () => {
  const result = simularOperacaoCompleta({
    ...baseInput,
    periodicidadePrincipal: 'UNICA',
    periodicidadeJuros: 'JUNTO_PRINCIPAL',
    numeroParcelas: 12,
  });

  assert.equal(result.parametros.numeroParcelas, 1);
  assert.equal(
    result.sistemas.PRICE.linhas.filter((linha) => linha.descricao === 'Princ.+Juros').length,
    1,
  );
  assert.equal(result.validacao.avisos[0]?.codigo, 'PARCELA_UNICA_NORMALIZADA');
});

test('valida datas, valor, parcelas e amortizacoes antes de avancar', () => {
  const validacao = validarSimuladorOperacao({
    ...baseInput,
    valorOperacao: 0,
    dataCredito: '2026-04-30',
    primeiroVencimentoPrincipal: '2026-04-01',
    primeiroVencimentoJuros: '',
    numeroParcelas: 0,
    amortizacoesAvulsas: [
      { id: 'invalida', data: '2026-01-01', valor: 0 },
    ],
  });

  assert.equal(validacao.valido, false);
  assert.ok(validacao.erros.some((item) => item.codigo === 'VALOR_OPERACAO_INVALIDO'));
  assert.ok(validacao.erros.some((item) => item.codigo === 'VENCIMENTO_ANTES_CREDITO'));
  assert.ok(validacao.erros.some((item) => item.codigo === 'VENCIMENTO_JUROS_INVALIDO'));
  assert.ok(validacao.erros.some((item) => item.codigo === 'NUMERO_PARCELAS_INVALIDO'));
  assert.ok(validacao.erros.some((item) => item.codigo === 'AMORTIZACAO_ANTES_CREDITO'));
});

test('calcula ficha bancaria com juros por evento', () => {
  const result = calcularFichaBancaria({
    taxaMensal: 0.01,
    valorOperacao: 100_000,
    dataInicio: '2026-01-01',
    eventos: [
      { id: 'a', data: '2026-02-01', evento: 'Amortizacao', amortizacao: 10_000 },
      { id: 'b', data: '2026-03-01', evento: 'Amortizacao', amortizacao: 10_000 },
    ],
  });

  assert.equal(result.linhas.length, 3);
  assert.ok(result.totalJuros > 0);
  assert.ok(result.saldoAtual < 82_500);
});
