/**
 * Simulador v16 — motor nativo da planilha `Simulador v16 (1).xlsm`.
 *
 * Reimplementa os blocos centrais do arquivo:
 * - PAINEL DE DADOS: agenda, taxas, despesas, seguro e IOF
 * - PRICE / SAC / SACRE: tabelas de amortizacao
 * - RESUMO DA OPERACAO / ANALISE COMPARATIVA: indicadores e CET
 * - RECALCULO DE OPERACOES / FICHA GRAFICA BANCARIA: fluxos auxiliares
 * A reprodução do cenário salvo não certifica todas as fórmulas da planilha.
 * Valores monetários são calculados em Decimal; number é apenas o contrato legado de saída.
 */

import Decimal from 'decimal.js';

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type Dinheiro = Decimal;
const VERSAO_MOTOR = 'v16-auditado-2026-09-10';

export class ErroSimuladorOperacao extends Error {
  constructor(
    public readonly codigo: string,
    mensagem: string,
    public readonly validacao?: ResultadoValidacaoSimulador,
  ) {
    super(mensagem);
    this.name = 'ErroSimuladorOperacao';
  }
}

export type PeriodicidadeSimulador =
  | 'UNICA'
  | 'MENSAL'
  | 'BIMESTRAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL'
  | 'JUNTO_PRINCIPAL';

export type SistemaSimulador = 'PRICE' | 'SAC' | 'SACRE';
export type PessoaIof = 'PF' | 'PJ';
export type FormaSeguro = 'PERCENTUAL_SALDO' | 'VALOR_FIXO';

export interface DespesaAcessoriaInput {
  id: string;
  descricao: string;
  valor: number;
  financiar: boolean;
}

export interface AmortizacaoAvulsaInput {
  id: string;
  data: string;
  valor: number;
  descricao?: string;
}

export interface SimuladorOperacaoInput {
  agente: string;
  tomador: string;
  contrato: string;
  valorOperacao: number;
  dataCredito: string;
  primeiroVencimentoPrincipal: string;
  primeiroVencimentoJuros?: string;
  periodicidadePrincipal: PeriodicidadeSimulador;
  periodicidadeJuros: PeriodicidadeSimulador;
  jurosAte: 'PRIMEIRA_PRINCIPAL' | 'FINAL';
  numeroParcelas: number;
  taxaPreAnual: number;
  taxaPosAnual: number;
  indexador?: string;
  despesas: DespesaAcessoriaInput[];
  seguroVidaAtivo: boolean;
  seguroFinanciado: boolean;
  seguroForma: FormaSeguro;
  seguroPercentualMensal: number;
  seguroValor: number;
  iofAtivo: boolean;
  iofDiarioAtivo?: boolean;
  iofPessoa: PessoaIof;
  iofAdicionalAtivo: boolean;
  iofFinanciado: boolean;
  amortizacoesAvulsas?: AmortizacaoAvulsaInput[];
}

export interface LinhaSimulador {
  n: number;
  data: string;
  descricao: 'Liberacao' | 'Juros' | 'Princ.+Juros' | 'Amortizacao avulsa';
  dias: number;
  saldoInicial: number;
  juros: number;
  amortizacao: number;
  seguro: number;
  iof: number;
  prestacao: number;
  saldoDevedor: number;
  fluxoCaixa: number;
  amortizacaoAvulsaAplicada: number;
  amortizacaoAvulsaNaoAplicada: number;
}

export interface CustosOperacao {
  despesasTotal: number;
  despesasFinanciadas: number;
  despesasDebito: number;
  seguroTotal: number;
  seguroFinanciado: number;
  seguroDebito: number;
  iofDiario: number;
  iofAdicional: number;
  iofTotal: number;
  iofFinanciado: number;
  iofDebito: number;
  valoresDebitados: number;
  valorLiquidoCreditado: number;
  valorFinanciado: number;
}

export interface IndicadoresSistema {
  sistema: SistemaSimulador;
  valorOperacao: number;
  valorFinanciado: number;
  valorLiquidoCreditado: number;
  primeiraPrestacao: number;
  maiorPrestacao: number;
  menorPrestacao: number;
  totalPrestacoes: number;
  totalJuros: number;
  totalAmortizado: number;
  saldoFinal: number;
  cetMensal: number;
  cetAnual: number;
  /** XIRR anual em dias corridos/365; campos legados cetAnual/cetMensal usam 360/30. */
  cetAnual365: number;
  cetMensal365: number;
  convencaoCet: '365_DIAS';
  dataQuitacao: string;
  totalAmortizacaoAvulsa: number;
  amortizacaoAvulsaNaoAplicada: number;
  custos: CustosOperacao;
}

export interface ResultadoSistema {
  sistema: SistemaSimulador;
  linhas: LinhaSimulador[];
  indicadores: IndicadoresSistema;
}

export interface ResultadoSimuladorOperacao {
  versaoMotor: string;
  premissas: string[];
  parametros: SimuladorOperacaoInput;
  validacao: ResultadoValidacaoSimulador;
  taxaFinalAnual: number;
  taxaFinalMensal: number;
  taxaFinalDiaria: number;
  sistemas: Record<SistemaSimulador, ResultadoSistema>;
  comparativo: Array<{
    n: number;
    data: string;
    descricao: string;
    price: number;
    sac: number;
    sacre: number;
  }>;
  resumo: IndicadoresSistema[];
}

export interface ItemValidacaoSimulador {
  campo: string;
  codigo: string;
  mensagem: string;
  nivel: 'ERRO' | 'AVISO';
}

export interface ResultadoValidacaoSimulador {
  valido: boolean;
  erros: ItemValidacaoSimulador[];
  avisos: ItemValidacaoSimulador[];
}

export interface RecalculoParcelaInput {
  id: string;
  data: string;
  valor: number;
}

export interface RecalculoOperacaoInput {
  dataInicial: string;
  valorCredito: number;
  entrada: number;
  custosAcessorios: number;
  taxaMensal: number;
  periodicidade: Exclude<PeriodicidadeSimulador, 'UNICA' | 'JUNTO_PRINCIPAL'>;
  parcelas: RecalculoParcelaInput[];
}

export interface ResultadoRecalculoOperacao {
  valorFinanciado: number;
  valorLiquidoCreditado: number;
  totalParcelas: number;
  totalComEstruturacao: number;
  diferenca: number;
  cetMensal: number;
  cetAnual: number;
  cetAnual365: number;
  cetMensal365: number;
  cetLiquidoAnual365: number;
  cetLiquidoMensal365: number;
  convencaoCet: '365_DIAS';
  valorPresenteParcelas: number;
  diferencaValorPresente: number;
  diferencaTaxaMensal: number;
  custosAcessoriosCompativeisTaxaInformada: number;
  creditoCompativelTaxaInformada: number;
  ajusteParaTaxaInformadaRequerDesconto: boolean;
  linhas: Array<RecalculoParcelaInput & { fluxo: number }>;
}

export interface FichaBancariaEventoInput {
  id: string;
  data: string;
  evento: string;
  amortizacao: number;
}

export interface FichaBancariaInput {
  taxaMensal: number;
  valorOperacao: number;
  dataInicio: string;
  eventos: FichaBancariaEventoInput[];
}

export interface FichaBancariaLinha {
  id: string;
  data: string;
  dias: number;
  evento: string;
  valorNominal: number;
  jurosPeriodo: number;
  amortizacao: number;
  saldoAtualizado: number;
  amortizacaoInformada: number;
  excedente: number;
}

export interface ResultadoFichaBancaria {
  taxaDiaria: number;
  totalJuros: number;
  totalAmortizacoes: number;
  saldoAtual: number;
  totalPagamentosInformados: number;
  totalExcedente: number;
  linhas: FichaBancariaLinha[];
}

const MESES_POR_PERIODICIDADE: Record<PeriodicidadeSimulador, number> = {
  UNICA: 0,
  MENSAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
  JUNTO_PRINCIPAL: 0,
};

const SISTEMAS: SistemaSimulador[] = ['PRICE', 'SAC', 'SACRE'];

export function simularOperacaoCompleta(parametros: SimuladorOperacaoInput): ResultadoSimuladorOperacao {
  const validacao = validarSimuladorOperacao(parametros);
  exigirValido(validacao);
  const input: SimuladorOperacaoInput = {
    ...parametros,
    numeroParcelas: parametros.periodicidadePrincipal === 'UNICA' ? 1 : parametros.numeroParcelas,
    despesas: parametros.despesas.map((item) => ({ ...item })),
    amortizacoesAvulsas: (parametros.amortizacoesAvulsas ?? []).map((item) => ({ ...item })),
  };
  const fatorAnual = new D(1).add(input.taxaPreAnual).mul(new D(1).add(input.taxaPosAnual));
  const fatorDiario = fatorAnual.pow(new D(1).div(360));
  const sistemas = Object.fromEntries(SISTEMAS.map((sistema) => [
    sistema, simularSistema(input, sistema, fatorDiario),
  ])) as Record<SistemaSimulador, ResultadoSistema>;
  if (SISTEMAS.some((sistema) => sistemas[sistema].linhas.some((linha) => linha.amortizacao < 0))) {
    validacao.avisos.push({ campo: 'primeiroVencimentoPrincipal', codigo: 'AMORTIZACAO_NEGATIVA',
      mensagem: 'Há prestação PRICE inferior aos juros do período; a diferença aumenta o saldo devedor.', nivel: 'AVISO' });
  }
  return {
    versaoMotor: VERSAO_MOTOR,
    premissas: [
      'Juros compostos por dias corridos, com taxa anual contratual em base 360 e mês de 30 dias.',
      'CET anual de 365 dias calculado pelos fluxos efetivos; CET legado de 360 dias mantido para comparação com a v16.',
      'Vencimentos mantêm o dia originalmente escolhido, limitado ao último dia de cada mês. Não há ajuste automático por feriados.',
      'Amortização avulsa liquida juros até sua data e reduz saldo/prazo, preservando a prestação PRICE ou a quota SAC originalmente calculada.',
      'SACRE segue a modalidade da v16: juros acumulados sobre cada quota amortizada. Não equivale a todo contrato comercial denominado SACRE.',
      'Despesas, seguro e IOF não financiados são debitados na liberação; valores financiados entram no principal uma única vez.',
      ...(input.seguroVidaAtivo && input.seguroForma === 'PERCENTUAL_SALDO' ? ['O prêmio percentual é estimado pela equivalência composta da taxa mensal em dias/30 sobre o saldo inicial do período; confirme o regime e a cobrança na apólice.'] : []),
      ...(input.taxaPosAnual !== 0 ? ['A taxa pós-fixada informada é uma projeção constante; não representa série histórica de CDI, IPCA ou outro índice.'] : []),
      ...(input.iofAtivo ? ['IOF usa exclusivamente os parâmetros históricos da v16: teto diário PF 3%/PJ 1,5% em 365 dias e adicional 0,38%. Confirme o enquadramento e a legislação da operação.'] : []),
    ],
    parametros: input, validacao,
    taxaFinalAnual: numero(fatorAnual.sub(1), 10),
    taxaFinalMensal: numero(fatorAnual.pow(new D(1).div(12)).sub(1), 10),
    taxaFinalDiaria: numero(fatorDiario.sub(1), 12),
    sistemas, comparativo: montarComparativo(sistemas),
    resumo: SISTEMAS.map((sistema) => sistemas[sistema].indicadores),
  };
}

/** Validação separada permite editar a tela sem fabricar uma prévia financeira. */
export function validarSimuladorOperacao(input: SimuladorOperacaoInput): ResultadoValidacaoSimulador {
  const itens: ItemValidacaoSimulador[] = [];
  const erro = (campo: string, codigo: string, mensagem: string) => itens.push({ campo, codigo, mensagem, nivel: 'ERRO' });
  const aviso = (campo: string, codigo: string, mensagem: string) => itens.push({ campo, codigo, mensagem, nivel: 'AVISO' });
  if (!valorValido(input.valorOperacao, true)) erro('valorOperacao', 'VALOR_OPERACAO_INVALIDO', 'Informe um valor de operação finito e maior que zero.');
  if (!isISODate(input.dataCredito)) erro('dataCredito', 'DATA_CREDITO_INVALIDA', 'Informe uma data de crédito válida no formato AAAA-MM-DD.');
  if (!isISODate(input.primeiroVencimentoPrincipal)) erro('primeiroVencimentoPrincipal', 'VENCIMENTO_PRINCIPAL_INVALIDO', 'Informe o primeiro vencimento do principal.');
  else if (isISODate(input.dataCredito) && input.primeiroVencimentoPrincipal <= input.dataCredito) erro('primeiroVencimentoPrincipal', 'VENCIMENTO_ANTES_CREDITO', 'O primeiro vencimento do principal deve ser posterior ao crédito.');
  if (!Object.prototype.hasOwnProperty.call(MESES_POR_PERIODICIDADE, input.periodicidadePrincipal) || input.periodicidadePrincipal === 'JUNTO_PRINCIPAL') erro('periodicidadePrincipal', 'FREQUENCIA_PRINCIPAL_INVALIDA', 'Selecione uma frequência válida para o principal.');
  if (!Object.prototype.hasOwnProperty.call(MESES_POR_PERIODICIDADE, input.periodicidadeJuros)) erro('periodicidadeJuros', 'FREQUENCIA_JUROS_INVALIDA', 'Selecione uma frequência válida para os juros.');
  if (!['PRIMEIRA_PRINCIPAL', 'FINAL'].includes(input.jurosAte)) erro('jurosAte', 'LIMITE_JUROS_INVALIDO', 'Selecione até quando haverá pagamentos separados de juros.');
  if (input.periodicidadeJuros !== 'JUNTO_PRINCIPAL') {
    if (!isISODate(input.primeiroVencimentoJuros)) erro('primeiroVencimentoJuros', 'VENCIMENTO_JUROS_INVALIDO', 'Informe o primeiro vencimento dos juros.');
    else if (isISODate(input.dataCredito) && input.primeiroVencimentoJuros <= input.dataCredito) erro('primeiroVencimentoJuros', 'JUROS_ANTES_CREDITO', 'O primeiro vencimento dos juros deve ser posterior ao crédito.');
  }
  if (!Number.isInteger(input.numeroParcelas) || input.numeroParcelas < 1 || input.numeroParcelas > 500) erro('numeroParcelas', 'NUMERO_PARCELAS_INVALIDO', 'O número de parcelas deve ser um inteiro entre 1 e 500.');
  if (input.periodicidadePrincipal === 'UNICA' && input.numeroParcelas !== 1) aviso('numeroParcelas', 'PARCELA_UNICA_NORMALIZADA', 'Na frequência única, o motor considera somente uma parcela principal.');
  if (!taxaValida(input.taxaPreAnual) || !taxaValida(input.taxaPosAnual)) erro('taxas', 'TAXA_INVALIDA', 'As taxas precisam ser finitas e maiores que -100%.');
  else if (new D(1).add(input.taxaPreAnual).mul(new D(1).add(input.taxaPosAnual)).sub(1).gt(2)) aviso('taxas', 'TAXA_ELEVADA', 'A taxa final supera 200% a.a.; confira a unidade do percentual.');
  if (!['PF', 'PJ'].includes(input.iofPessoa)) erro('iofPessoa', 'PESSOA_IOF_INVALIDA', 'Selecione PF ou PJ para o parâmetro de IOF.');
  for (const campo of ['seguroVidaAtivo', 'seguroFinanciado', 'iofAtivo', 'iofAdicionalAtivo', 'iofFinanciado'] as const) {
    if (typeof input[campo] !== 'boolean') erro(campo, 'OPCAO_INVALIDA', 'As opções de seguro e IOF precisam ser booleanas explícitas.');
  }
  if (input.iofDiarioAtivo !== undefined && typeof input.iofDiarioAtivo !== 'boolean') erro('iofDiarioAtivo', 'OPCAO_INVALIDA', 'Informe se o IOF diário está ativo.');
  if (!['PERCENTUAL_SALDO', 'VALOR_FIXO'].includes(input.seguroForma)) erro('seguroForma', 'FORMA_SEGURO_INVALIDA', 'Selecione uma forma válida para o seguro.');
  if (!valorValido(input.seguroPercentualMensal) || !valorValido(input.seguroValor)) erro('seguro', 'SEGURO_INVALIDO', 'O valor e o percentual do seguro devem ser finitos e não negativos.');
  if (!Array.isArray(input.despesas)) erro('despesas', 'DESPESAS_INVALIDAS', 'Informe uma lista válida de despesas.');
  const despesas = Array.isArray(input.despesas) ? input.despesas : [];
  validarIds(despesas, 'despesas', itens);
  for (const despesa of despesas) {
    if (!valorValido(despesa.valor)) erro(`despesas.${despesa.id}`, 'DESPESA_INVALIDA', `A despesa “${despesa.descricao || despesa.id}” deve ser finita e não negativa.`);
    if (typeof despesa.financiar !== 'boolean') erro(`despesas.${despesa.id}.financiar`, 'OPCAO_INVALIDA', 'Informe explicitamente se a despesa será financiada.');
  }
  if (input.amortizacoesAvulsas !== undefined && !Array.isArray(input.amortizacoesAvulsas)) erro('amortizacoesAvulsas', 'AMORTIZACOES_INVALIDAS', 'Informe uma lista válida de amortizações avulsas.');
  const avulsas = Array.isArray(input.amortizacoesAvulsas) ? input.amortizacoesAvulsas : [];
  validarIds(avulsas, 'amortizacoesAvulsas', itens);
  let ultimaData: string | undefined;
  if (isISODate(input.primeiroVencimentoPrincipal) && Number.isInteger(input.numeroParcelas) && input.numeroParcelas > 0 && input.numeroParcelas <= 500 && Object.prototype.hasOwnProperty.call(MESES_POR_PERIODICIDADE, input.periodicidadePrincipal)) {
    ultimaData = addMeses(input.primeiroVencimentoPrincipal, input.periodicidadePrincipal === 'UNICA' ? 0 : (input.numeroParcelas - 1) * MESES_POR_PERIODICIDADE[input.periodicidadePrincipal]);
    if (!isISODate(ultimaData)) erro('numeroParcelas', 'HORIZONTE_INVALIDO', 'A agenda ultrapassa o intervalo de datas suportado.');
  }
  if (input.periodicidadeJuros !== 'JUNTO_PRINCIPAL' && isISODate(input.primeiroVencimentoJuros) && ultimaData) {
    const limite = input.jurosAte === 'FINAL' ? ultimaData : input.primeiroVencimentoPrincipal;
    if (input.primeiroVencimentoJuros > limite) erro('primeiroVencimentoJuros', 'JUROS_FORA_DO_PERIODO', 'O primeiro vencimento dos juros não pode ultrapassar o limite escolhido.');
  }
  for (const amortizacao of avulsas) {
    if (!isISODate(amortizacao.data)) erro(`amortizacoesAvulsas.${amortizacao.id}`, 'DATA_AMORTIZACAO_INVALIDA', 'Há uma amortização avulsa sem data válida.');
    else if (isISODate(input.dataCredito) && amortizacao.data <= input.dataCredito) erro(`amortizacoesAvulsas.${amortizacao.id}`, 'AMORTIZACAO_ANTES_CREDITO', 'A amortização avulsa deve ocorrer depois do crédito.');
    else if (ultimaData && amortizacao.data > ultimaData) erro(`amortizacoesAvulsas.${amortizacao.id}`, 'AMORTIZACAO_APOS_PRAZO', 'A amortização avulsa não pode ocorrer depois do vencimento final previsto.');
    if (!valorValido(amortizacao.valor, true)) erro(`amortizacoesAvulsas.${amortizacao.id}`, 'VALOR_AMORTIZACAO_INVALIDO', 'Toda amortização avulsa deve ter valor finito maior que zero.');
  }
  if (despesas.length > 500 || avulsas.length > 500) erro('itens', 'LIMITE_ITENS', 'O limite é de 500 despesas e 500 amortizações avulsas por simulação.');
  if (input.iofAtivo) aviso('iof', 'IOF_PARAMETROS_HISTORICOS', 'As alíquotas são parâmetros históricos da v16; confirme a tributação aplicável antes de usar a simulação em uma proposta.');
  if (input.taxaPosAnual !== 0) aviso('taxaPosAnual', 'POS_FIXADO_PROJETADO', 'A parcela pós-fixada é uma projeção constante, sem atualização por série histórica do indexador.');
  return concluirValidacao(itens);
}

export function validarRecalculoOperacao(input: RecalculoOperacaoInput): ResultadoValidacaoSimulador {
  const itens: ItemValidacaoSimulador[] = [];
  const erro = (campo: string, codigo: string, mensagem: string) => itens.push({ campo, codigo, mensagem, nivel: 'ERRO' });
  if (!isISODate(input.dataInicial)) erro('dataInicial', 'DATA_INICIAL_INVALIDA', 'Informe uma data inicial válida.');
  if (!valorValido(input.valorCredito, true)) erro('valorCredito', 'CREDITO_INVALIDO', 'Informe um crédito finito maior que zero.');
  if (!valorValido(input.entrada) || !valorValido(input.custosAcessorios)) erro('custos', 'CUSTOS_INVALIDOS', 'Entrada e custos acessórios devem ser finitos e não negativos.');
  if (valorValido(input.valorCredito, true) && valorValido(input.entrada) && input.entrada >= input.valorCredito) erro('entrada', 'ENTRADA_SUPERA_CREDITO', 'A entrada deve ser menor que o crédito; custos não constituem novo crédito líquido.');
  if (!taxaValida(input.taxaMensal)) erro('taxaMensal', 'TAXA_INVALIDA', 'A taxa mensal precisa ser finita e maior que -100%.');
  if (!['MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'].includes(input.periodicidade)) erro('periodicidade', 'PERIODICIDADE_INVALIDA', 'Selecione uma periodicidade válida.');
  const parcelas = Array.isArray(input.parcelas) ? input.parcelas : [];
  if (!Array.isArray(input.parcelas) || parcelas.length < 1 || parcelas.length > 500) erro('parcelas', 'PARCELAS_INVALIDAS', 'Informe entre 1 e 500 parcelas para recalcular o fluxo.');
  validarIds(parcelas, 'parcelas', itens);
  for (const parcela of parcelas) {
    if (!isISODate(parcela.data) || (isISODate(input.dataInicial) && parcela.data <= input.dataInicial)) erro(`parcelas.${parcela.id}.data`, 'DATA_PARCELA_INVALIDA', 'Cada parcela deve ter uma data válida posterior à liberação.');
    if (!valorValido(parcela.valor, true)) erro(`parcelas.${parcela.id}.valor`, 'VALOR_PARCELA_INVALIDO', 'Cada parcela deve ter um valor finito maior que zero.');
  }
  return concluirValidacao(itens);
}

export function calcularRecalculoOperacao(input: RecalculoOperacaoInput): ResultadoRecalculoOperacao {
  exigirValido(validarRecalculoOperacao(input));
  const parcelas = input.parcelas.map((p) => ({ ...p })).sort((a, b) => a.data.localeCompare(b.data));
  const valorFinanciado = moeda(new D(input.valorCredito).sub(input.entrada).add(input.custosAcessorios));
  const valorLiquidoCreditado = moeda(new D(input.valorCredito).sub(input.entrada));
  const totalParcelas = somar(parcelas.map((p) => moeda(p.valor)));
  const custos = moeda(input.custosAcessorios);
  const cet = calcularCet([{ data: input.dataInicial, valor: valorFinanciado }, ...parcelas.map((p) => ({ data: p.data, valor: moeda(p.valor).neg() }))]);
  const cetLiquido = calcularCet([{ data: input.dataInicial, valor: valorLiquidoCreditado }, ...parcelas.map((p) => ({ data: p.data, valor: moeda(p.valor).neg() }))]);
  const fatorDiario = new D(1).add(input.taxaMensal).pow(new D(1).div(30));
  const valorPresenteParcelas = somar(parcelas.map((p) => moeda(p.valor).div(fatorDiario.pow(diasEntre(input.dataInicial, p.data)))));
  const custosCompativeis = valorPresenteParcelas.sub(input.valorCredito).add(input.entrada);
  return {
    valorFinanciado: numero(valorFinanciado), valorLiquidoCreditado: numero(valorLiquidoCreditado), totalParcelas: numero(totalParcelas),
    // RECÁLCULO!G10=G9+G5; G5 é negativo no arquivo original.
    totalComEstruturacao: numero(totalParcelas.sub(custos)), diferenca: numero(custos.neg()),
    cetMensal: cet.mensal, cetAnual: cet.anual, cetAnual365: cet.anual365, cetMensal365: cet.mensal365, convencaoCet: '365_DIAS',
    cetLiquidoAnual365: cetLiquido.anual365, cetLiquidoMensal365: cetLiquido.mensal365,
    valorPresenteParcelas: numero(valorPresenteParcelas),
    diferencaValorPresente: numero(valorPresenteParcelas.sub(valorFinanciado)),
    diferencaTaxaMensal: numero(new D(cet.mensal).sub(input.taxaMensal), 10),
    custosAcessoriosCompativeisTaxaInformada: numero(custosCompativeis),
    creditoCompativelTaxaInformada: numero(valorPresenteParcelas.add(input.entrada).sub(custos)),
    ajusteParaTaxaInformadaRequerDesconto: custosCompativeis.lt(0),
    linhas: parcelas.map((p) => ({ ...p, valor: numero(moeda(p.valor)), fluxo: numero(moeda(p.valor).neg()) })),
  };
}

export function validarFichaBancaria(input: FichaBancariaInput): ResultadoValidacaoSimulador {
  const itens: ItemValidacaoSimulador[] = [];
  const erro = (campo: string, codigo: string, mensagem: string) => itens.push({ campo, codigo, mensagem, nivel: 'ERRO' });
  if (!isISODate(input.dataInicio)) erro('dataInicio', 'DATA_INICIAL_INVALIDA', 'Informe uma data inicial válida.');
  if (!valorValido(input.valorOperacao, true)) erro('valorOperacao', 'VALOR_OPERACAO_INVALIDO', 'Informe um valor finito maior que zero.');
  if (!taxaValida(input.taxaMensal)) erro('taxaMensal', 'TAXA_INVALIDA', 'A taxa mensal precisa ser finita e maior que -100%.');
  const eventos = Array.isArray(input.eventos) ? input.eventos : [];
  if (!Array.isArray(input.eventos) || eventos.length > 500) erro('eventos', 'EVENTOS_INVALIDOS', 'Informe uma lista de até 500 eventos.');
  validarIds(eventos, 'eventos', itens);
  for (const evento of eventos) {
    if (!isISODate(evento.data) || (isISODate(input.dataInicio) && evento.data < input.dataInicio)) erro(`eventos.${evento.id}.data`, 'DATA_EVENTO_INVALIDA', 'Todo evento precisa de uma data válida igual ou posterior ao início da operação.');
    if (!valorValido(evento.amortizacao)) erro(`eventos.${evento.id}.amortizacao`, 'AMORTIZACAO_INVALIDA', 'O pagamento deve ser finito e não negativo.');
  }
  return concluirValidacao(itens);
}

export function calcularFichaBancaria(input: FichaBancariaInput): ResultadoFichaBancaria {
  exigirValido(validarFichaBancaria(input));
  const fatorDiario = new D(1).add(input.taxaMensal).pow(new D(1).div(30));
  const eventos = input.eventos.map((e) => ({ ...e })).sort((a, b) => a.data.localeCompare(b.data));
  let saldo = moeda(input.valorOperacao);
  let dataAnterior = input.dataInicio;
  const linhas: FichaBancariaLinha[] = [{ id: 'inicio', data: input.dataInicio, dias: 0,
    evento: 'Inicio da Operacao', valorNominal: numero(saldo), jurosPeriodo: 0,
    amortizacao: 0, saldoAtualizado: numero(saldo), amortizacaoInformada: 0, excedente: 0 }];
  for (const evento of eventos) {
    const dias = diasEntre(dataAnterior, evento.data);
    const juros = moeda(saldo.mul(fatorDiario.pow(dias).sub(1)));
    const devido = saldo.add(juros);
    const informado = moeda(evento.amortizacao);
    const aplicado = D.min(devido, informado);
    linhas.push({ id: evento.id, data: evento.data, dias,
      evento: evento.evento || 'Juros/Amortizacao', valorNominal: numero(saldo),
      jurosPeriodo: numero(juros), amortizacao: numero(aplicado),
      saldoAtualizado: numero(devido.sub(aplicado)), amortizacaoInformada: numero(informado),
      excedente: numero(informado.sub(aplicado)) });
    saldo = devido.sub(aplicado);
    dataAnterior = evento.data;
  }
  return { taxaDiaria: numero(fatorDiario.sub(1), 12), totalJuros: numero(somar(linhas.map((l) => l.jurosPeriodo))),
    totalAmortizacoes: numero(somar(linhas.map((l) => l.amortizacao))), saldoAtual: numero(saldo),
    totalPagamentosInformados: numero(somar(linhas.map((l) => l.amortizacaoInformada))),
    totalExcedente: numero(somar(linhas.map((l) => l.excedente))), linhas };
}

type Evento = { data: string; principal: boolean; juros: boolean; amortizacaoAvulsa: Dinheiro };

function simularSistema(input: SimuladorOperacaoInput, sistema: SistemaSimulador, fatorDiario: Dinheiro): ResultadoSistema {
  const baseFinanciada = moeda(new D(input.valorOperacao).add(somaDespesas(input, true)));
  let valorFinanciado = baseFinanciada;
  let linhas: LinhaSimulador[] = [];
  let custos: CustosOperacao | undefined;
  let convergiu = false;
  const vistos = new Set<string>();
  for (let tentativa = 0; tentativa < 150; tentativa++) {
    numero(valorFinanciado); // Interrompe crescimento que exceda a precisão do contrato legado.
    linhas = simularTabelaBase(input, sistema, fatorDiario, valorFinanciado);
    custos = calcularCustos(input, linhas, valorFinanciado);
    const proximo = baseFinanciada.add(custos.seguroFinanciado).add(custos.iofFinanciado);
    if (proximo.eq(valorFinanciado)) { convergiu = true; break; }
    if (vistos.has(proximo.toFixed(2))) break;
    vistos.add(valorFinanciado.toFixed(2));
    valorFinanciado = proximo;
  }
  if (!convergiu || !custos) throw new ErroSimuladorOperacao('CUSTOS_NAO_CONVERGEM', `Os custos financiados de ${sistema} não convergiram em centavos. Revise prazo, seguro e IOF.`);
  if (custos.valorLiquidoCreditado <= 0) throw new ErroSimuladorOperacao('CREDITO_LIQUIDO_NAO_POSITIVO', 'As despesas debitadas consomem todo o crédito; não existe fluxo líquido válido para calcular o CET.');
  linhas = linhas.map((linha) => ({ ...linha,
    seguro: numero(linha.n === 0 && input.seguroVidaAtivo && input.seguroForma === 'VALOR_FIXO' ? moeda(input.seguroValor) : seguroDaLinha(input, linha)),
    iof: linha.n === 0 ? custos!.iofAdicional : numero(iofDaLinha(input, linha)),
    fluxoCaixa: linha.n === 0 ? custos!.valorLiquidoCreditado : linha.fluxoCaixa,
  }));
  return { sistema, linhas, indicadores: calcularIndicadores(input, sistema, linhas, custos) };
}

function simularTabelaBase(input: SimuladorOperacaoInput, sistema: SistemaSimulador, fatorDiario: Dinheiro, valorFinanciado: Dinheiro): LinhaSimulador[] {
  const eventos = gerarEventos(input);
  const amortizacaoConstante = moeda(valorFinanciado.div(input.numeroParcelas));
  const prestacaoPrice = calcularPrestacaoPrice(valorFinanciado, fatorDiario, eventos, input.dataCredito);
  let saldo = valorFinanciado;
  let dataAnterior = input.dataCredito;
  let nPrincipal = 0;
  let fatorSacre = new D(1);
  const linhas: LinhaSimulador[] = [{ n: 0, data: input.dataCredito, descricao: 'Liberacao', dias: 0,
    saldoInicial: numero(saldo), juros: 0, amortizacao: 0, seguro: 0, iof: 0,
    prestacao: 0, saldoDevedor: numero(saldo), fluxoCaixa: numero(saldo),
    amortizacaoAvulsaAplicada: 0, amortizacaoAvulsaNaoAplicada: 0 }];
  for (const evento of eventos) {
    if (evento.principal) nPrincipal++;
    const dias = diasEntre(dataAnterior, evento.data);
    const fator = fatorDiario.pow(dias);
    const saldoInicial = saldo;
    let juros = moeda(saldo.mul(fator.sub(1)));
    let amortizacao = new D(0);
    if (evento.principal) {
      if (sistema === 'PRICE') {
        const pagamento = nPrincipal === input.numeroParcelas ? saldo.add(juros) : D.min(saldo.add(juros), prestacaoPrice);
        amortizacao = pagamento.sub(juros);
      } else amortizacao = nPrincipal === input.numeroParcelas ? saldo : D.min(saldo, amortizacaoConstante);
    }
    const avulsa = D.min(saldo.sub(amortizacao), evento.amortizacaoAvulsa);
    const excesso = evento.amortizacaoAvulsa.sub(avulsa);
    amortizacao = amortizacao.add(avulsa);
    if (sistema === 'SACRE') {
      fatorSacre = fatorSacre.mul(fator);
      if (!evento.principal && evento.juros) {
        // Liquida todos os juros acumulados, inclusive entre parcelas do principal.
        juros = moeda(saldo.mul(fatorSacre.sub(1)));
        fatorSacre = new D(1);
      } else {
        // Cada quota, inclusive avulsa, paga os juros referentes ao período em aberto.
        juros = moeda(amortizacao.mul(fatorSacre.sub(1)));
      }
    }
    const prestacao = juros.add(amortizacao);
    saldo = saldo.sub(amortizacao);
    if (saldo.lt(0) || prestacao.lt(0)) throw new ErroSimuladorOperacao('FLUXO_INCONSISTENTE', 'O fluxo calculado contém saldo ou pagamento negativo não suportado.');
    if (!saldoInicial.isZero() || !evento.amortizacaoAvulsa.isZero()) linhas.push({
      n: linhas.length, data: evento.data,
      descricao: evento.principal ? 'Princ.+Juros' : evento.amortizacaoAvulsa.gt(0) ? 'Amortizacao avulsa' : 'Juros',
      dias, saldoInicial: numero(saldoInicial), juros: numero(juros), amortizacao: numero(amortizacao),
      seguro: 0, iof: 0, prestacao: numero(prestacao), saldoDevedor: numero(saldo), fluxoCaixa: numero(prestacao.neg()),
      amortizacaoAvulsaAplicada: numero(avulsa), amortizacaoAvulsaNaoAplicada: numero(excesso),
    });
    dataAnterior = evento.data;
  }
  if (!saldo.isZero()) throw new ErroSimuladorOperacao('SALDO_RESIDUAL', 'A agenda terminou com saldo devedor residual.');
  return linhas;
}

/** Resolve a recorrência linear do saldo respeitando pagamentos intermediários de juros. */
function calcularPrestacaoPrice(valor: Dinheiro, fatorDiario: Dinheiro, eventos: Evento[], dataCredito: string): Dinheiro {
  let coeficiente = new D(1);
  let pagamentos = new D(0);
  let anterior = dataCredito;
  for (const evento of eventos) {
    if (!evento.principal && !evento.juros) continue; // Avulsas reduzem prazo; não alteram a prestação contratada.
    if (evento.principal) {
      const fator = fatorDiario.pow(diasEntre(anterior, evento.data));
      coeficiente = coeficiente.mul(fator);
      pagamentos = pagamentos.mul(fator).add(1);
    }
    anterior = evento.data;
  }
  if (pagamentos.lte(0)) throw new ErroSimuladorOperacao('AGENDA_SEM_PRINCIPAL', 'Não existe vencimento de principal válido.');
  return moeda(valor.mul(coeficiente).div(pagamentos));
}

function calcularCustos(input: SimuladorOperacaoInput, linhas: LinhaSimulador[], valorFinanciado: Dinheiro): CustosOperacao {
  const despesasTotal = somaDespesas(input, null);
  const despesasFinanciadas = somaDespesas(input, true);
  const despesasDebito = despesasTotal.sub(despesasFinanciadas);
  const seguroTotal = !input.seguroVidaAtivo ? new D(0) : input.seguroForma === 'VALOR_FIXO' ? moeda(input.seguroValor) : somar(linhas.map((linha) => seguroDaLinha(input, linha)));
  const seguroFinanciado = input.seguroFinanciado ? seguroTotal : new D(0);
  const seguroDebito = seguroTotal.sub(seguroFinanciado);
  const iofDiario = somar(linhas.map((linha) => iofDaLinha(input, linha)));
  const iofAdicional = input.iofAtivo && input.iofAdicionalAtivo ? moeda(new D(input.valorOperacao).add(despesasFinanciadas).add(seguroFinanciado).mul('0.0038')) : new D(0);
  const iofTotal = iofDiario.add(iofAdicional);
  const iofFinanciado = input.iofFinanciado ? iofTotal : new D(0);
  const iofDebito = iofTotal.sub(iofFinanciado);
  const valoresDebitados = despesasDebito.add(seguroDebito).add(iofDebito);
  return { despesasTotal: numero(despesasTotal), despesasFinanciadas: numero(despesasFinanciadas), despesasDebito: numero(despesasDebito),
    seguroTotal: numero(seguroTotal), seguroFinanciado: numero(seguroFinanciado), seguroDebito: numero(seguroDebito),
    iofDiario: numero(iofDiario), iofAdicional: numero(iofAdicional), iofTotal: numero(iofTotal),
    iofFinanciado: numero(iofFinanciado), iofDebito: numero(iofDebito), valoresDebitados: numero(valoresDebitados),
    valorLiquidoCreditado: numero(new D(input.valorOperacao).sub(valoresDebitados)), valorFinanciado: numero(valorFinanciado) };
}

function calcularIndicadores(input: SimuladorOperacaoInput, sistema: SistemaSimulador, linhas: LinhaSimulador[], custos: CustosOperacao): IndicadoresSistema {
  const pagas = linhas.filter((l) => l.n > 0);
  const prestacoes = pagas.filter((l) => l.prestacao > 0).map((l) => new D(l.prestacao));
  const cet = calcularCet([{ data: input.dataCredito, valor: new D(custos.valorLiquidoCreditado) }, ...pagas.map((l) => ({ data: l.data, valor: new D(l.prestacao).neg() }))]);
  return { sistema, valorOperacao: numero(new D(input.valorOperacao)), valorFinanciado: custos.valorFinanciado,
    valorLiquidoCreditado: custos.valorLiquidoCreditado,
    primeiraPrestacao: pagas.find((l) => l.descricao === 'Princ.+Juros' && l.prestacao > 0)?.prestacao ?? numero(prestacoes[0] ?? new D(0)),
    maiorPrestacao: numero(prestacoes.length ? D.max(...prestacoes) : new D(0)), menorPrestacao: numero(prestacoes.length ? D.min(...prestacoes) : new D(0)),
    totalPrestacoes: numero(somar(pagas.map((l) => l.prestacao))), totalJuros: numero(somar(pagas.map((l) => l.juros))),
    totalAmortizado: numero(somar(pagas.map((l) => l.amortizacao))), saldoFinal: linhas.at(-1)!.saldoDevedor,
    cetMensal: cet.mensal, cetAnual: cet.anual, cetAnual365: cet.anual365, cetMensal365: cet.mensal365, convencaoCet: '365_DIAS',
    dataQuitacao: pagas.find((l) => l.saldoDevedor === 0)?.data ?? '',
    totalAmortizacaoAvulsa: numero(somar(pagas.map((l) => l.amortizacaoAvulsaAplicada))),
    amortizacaoAvulsaNaoAplicada: numero(somar(pagas.map((l) => l.amortizacaoAvulsaNaoAplicada))), custos };
}

function gerarEventos(input: SimuladorOperacaoInput): Evento[] {
  const eventos = new Map<string, Evento>();
  const obter = (data: string): Evento => {
    const evento = eventos.get(data) ?? { data, principal: false, juros: false, amortizacaoAvulsa: new D(0) };
    eventos.set(data, evento);
    return evento;
  };
  const passo = MESES_POR_PERIODICIDADE[input.periodicidadePrincipal];
  for (let i = 0; i < input.numeroParcelas; i++) {
    const evento = obter(addMeses(input.primeiroVencimentoPrincipal, i * passo));
    evento.principal = true;
    evento.juros = true;
  }
  const final = addMeses(input.primeiroVencimentoPrincipal, (input.numeroParcelas - 1) * passo);
  if (input.periodicidadeJuros !== 'JUNTO_PRINCIPAL') {
    const primeira = input.primeiroVencimentoJuros!;
    const limite = input.jurosAte === 'FINAL' ? final : input.primeiroVencimentoPrincipal;
    const passoJuros = MESES_POR_PERIODICIDADE[input.periodicidadeJuros];
    for (let i = 0; ; i++) {
      const data = addMeses(primeira, i * passoJuros);
      if (data > limite) break;
      obter(data).juros = true;
      if (passoJuros === 0 || data === limite) break;
      if (i >= 6500) throw new ErroSimuladorOperacao('LIMITE_AGENDA', 'A agenda excede 6.500 vencimentos de juros; reduza o horizonte.');
    }
  }
  for (const avulsa of input.amortizacoesAvulsas ?? []) {
    const evento = obter(avulsa.data);
    evento.amortizacaoAvulsa = evento.amortizacaoAvulsa.add(moeda(avulsa.valor));
  }
  return [...eventos.values()].sort((a, b) => a.data.localeCompare(b.data));
}

function seguroDaLinha(input: SimuladorOperacaoInput, linha: LinhaSimulador): Dinheiro {
  if (!input.seguroVidaAtivo || linha.n === 0 || input.seguroForma === 'VALOR_FIXO') return new D(0);
  return moeda(new D(linha.saldoInicial).mul(new D(1).add(input.seguroPercentualMensal).pow(new D(linha.dias).div(30)).sub(1)));
}

function iofDaLinha(input: SimuladorOperacaoInput, linha: LinhaSimulador): Dinheiro {
  if (!input.iofAtivo || input.iofDiarioAtivo === false || linha.amortizacao <= 0) return new D(0);
  const dias = Math.min(365, diasEntre(input.dataCredito, linha.data));
  return moeda(new D(linha.amortizacao).mul(input.iofPessoa === 'PF' ? '0.03' : '0.015').mul(dias).div(365));
}

/** XIRR convencional em domínio logarítmico: convergência limitada e resíduo verificado. */
function calcularCet(fluxos: Array<{ data: string; valor: Dinheiro }>): { mensal: number; anual: number; mensal365: number; anual365: number } {
  const porData = new Map<string, Dinheiro>();
  for (const fluxo of fluxos) {
    if (!isISODate(fluxo.data) || !fluxo.valor.isFinite()) throw new ErroSimuladorOperacao('CET_FLUXO_INVALIDO', 'O CET recebeu data ou valor inválido.');
    porData.set(fluxo.data, (porData.get(fluxo.data) ?? new D(0)).add(fluxo.valor));
  }
  const validos = [...porData].filter(([, valor]) => !valor.isZero()).sort(([a], [b]) => a.localeCompare(b));
  if (validos.length < 2 || validos[0][1].lte(0) || validos.slice(1).some(([, valor]) => valor.gte(0))) throw new ErroSimuladorOperacao('CET_FLUXO_SEM_SOLUCAO_UNICA', 'O CET exige crédito líquido positivo e pagamentos posteriores. Este fluxo não permite uma taxa única.');
  const [base, credito] = validos[0];
  // Após normalização por crédito, o solver trabalha apenas com razões sem unidade monetária.
  const pagamentos = validos.slice(1).map(([data, valor]) => ({ tempo: diasEntre(base, data) / 365, razao: valor.neg().div(credito).toNumber() }));
  if (pagamentos.some((p) => !Number.isFinite(p.razao) || p.tempo <= 0)) throw new ErroSimuladorOperacao('CET_FLUXO_INVALIDO', 'O fluxo não pode ser representado com precisão para o CET.');
  const vpNormalizado = (logFator: number) => 1 - pagamentos.reduce((soma, p) => soma + p.razao * Math.exp(-logFator * p.tempo), 0);
  let inferior = -40;
  let superior = 40;
  if (!(vpNormalizado(inferior) <= 0 && vpNormalizado(superior) >= 0)) throw new ErroSimuladorOperacao('CET_FORA_DO_DOMINIO', 'A taxa implícita está fora do domínio numérico suportado.');
  let logFator = 0;
  for (let i = 0; i < 160; i++) {
    logFator = (inferior + superior) / 2;
    const residuo = vpNormalizado(logFator);
    if (Math.abs(residuo) < 1e-13) break;
    if (residuo > 0) superior = logFator;
    else inferior = logFator;
  }
  if (Math.abs(vpNormalizado(logFator)) > 1e-10) throw new ErroSimuladorOperacao('CET_NAO_CONVERGE', 'Não foi possível conferir o resíduo do cálculo do CET.');
  const fatorAnual = new D(logFator).exp();
  const fatorAnual360 = fatorAnual.pow(new D(360).div(365));
  return { anual365: numero(fatorAnual.sub(1), 10), mensal365: numero(fatorAnual.pow(new D(1).div(12)).sub(1), 10),
    anual: numero(fatorAnual360.sub(1), 10), mensal: numero(fatorAnual360.pow(new D(1).div(12)).sub(1), 10) };
}

function montarComparativo(sistemas: Record<SistemaSimulador, ResultadoSistema>): ResultadoSimuladorOperacao['comparativo'] {
  const datas = [...new Set(SISTEMAS.flatMap((s) => sistemas[s].linhas.map((l) => l.data)))].sort();
  const mapas = Object.fromEntries(SISTEMAS.map((s) => [s, new Map(sistemas[s].linhas.map((l) => [l.data, l]))])) as Record<SistemaSimulador, Map<string, LinhaSimulador>>;
  return datas.map((data, n) => ({ n, data,
    descricao: SISTEMAS.map((s) => mapas[s].get(data)).find((l) => l?.descricao === 'Princ.+Juros')?.descricao ?? SISTEMAS.map((s) => mapas[s].get(data)).find(Boolean)!.descricao,
    price: mapas.PRICE.get(data)?.fluxoCaixa ?? 0, sac: mapas.SAC.get(data)?.fluxoCaixa ?? 0, sacre: mapas.SACRE.get(data)?.fluxoCaixa ?? 0 }));
}

function somaDespesas(input: SimuladorOperacaoInput, financiar: boolean | null): Dinheiro {
  return somar(input.despesas.filter((item) => financiar === null || item.financiar === financiar).map((item) => moeda(item.valor)));
}
function somar(valores: Array<Decimal.Value>): Dinheiro { return valores.reduce<Dinheiro>((total, valor) => total.add(valor), new D(0)); }
function moeda(valor: Decimal.Value): Dinheiro {
  const decimal = new D(valor);
  if (!decimal.isFinite()) throw new ErroSimuladorOperacao('VALOR_NAO_FINITO', 'O cálculo financeiro produziu um valor não finito.');
  return decimal.toDecimalPlaces(2);
}
function numero(valor: Decimal.Value, casas = 2): number {
  const decimal = new D(valor).toDecimalPlaces(casas);
  const numero = decimal.toNumber();
  if (!decimal.isFinite() || !Number.isFinite(numero) || !new D(numero).eq(decimal)) throw new ErroSimuladorOperacao('PRECISAO_NUMERICA_INSUFICIENTE', 'O resultado excede a precisão suportada; não foi arredondado para um valor financeiro incorreto.');
  return Object.is(numero, -0) ? 0 : numero;
}
function valorValido(valor: number, positivo = false): boolean { return Number.isFinite(valor) && (positivo ? valor > 0 : valor >= 0); }
function taxaValida(valor: number): boolean { return Number.isFinite(valor) && valor > -1; }
function concluirValidacao(itens: ItemValidacaoSimulador[]): ResultadoValidacaoSimulador {
  const erros = itens.filter((i) => i.nivel === 'ERRO');
  return { valido: erros.length === 0, erros, avisos: itens.filter((i) => i.nivel === 'AVISO') };
}
function exigirValido(validacao: ResultadoValidacaoSimulador): void {
  if (!validacao.valido) throw new ErroSimuladorOperacao('ENTRADA_INVALIDA', validacao.erros.map((e) => e.mensagem).join(' '), validacao);
}
function validarIds(itens: Array<{ id: string }>, campo: string, validacao: ItemValidacaoSimulador[]): void {
  const ids = new Set<string>();
  for (const item of itens) {
    if (typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id) || item.id === 'inicio') validacao.push({ campo, codigo: 'IDENTIFICADOR_INVALIDO', mensagem: 'Cada item precisa de identificador único e não reservado.', nivel: 'ERRO' });
    ids.add(item.id);
  }
}
function isISODate(value: string | undefined): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [ano, mes, dia] = value.split('-').map(Number);
  return ano >= 1900 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes);
}
function addMeses(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const total = mes - 1 + meses;
  const alvoAno = ano + Math.floor(total / 12);
  const alvoMes = ((total % 12) + 12) % 12 + 1;
  return `${alvoAno}-${String(alvoMes).padStart(2, '0')}-${String(Math.min(dia, diasNoMes(alvoAno, alvoMes))).padStart(2, '0')}`;
}
function diasEntre(inicio: string, fim: string): number {
  const timestamp = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((timestamp(fim) - timestamp(inicio)) / 86_400_000);
}
function diasNoMes(ano: number, mes: number): number { return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); }
