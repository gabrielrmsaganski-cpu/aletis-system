import { z } from 'zod'

const finite = z.number().finite().nullable()
const text = z.string().max(2000)
// Um rascunho pode ficar incompleto durante a edição. A validação financeira
// ocorre no motor ao calcular/registrar; esta camada protege o JSON persistido.
const dateDraft = z.string().max(10)
const periodicidade = z.enum(['UNICA', 'MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'JUNTO_PRINCIPAL'])
export const simulationInputSchema = z.object({
  agente: text, tomador: text, contrato: text,
  valorOperacao: finite, dataCredito: dateDraft,
  primeiroVencimentoPrincipal: dateDraft, primeiroVencimentoJuros: dateDraft.optional(),
  periodicidadePrincipal: periodicidade, periodicidadeJuros: periodicidade,
  jurosAte: z.enum(['PRIMEIRA_PRINCIPAL', 'FINAL']),
  numeroParcelas: z.number().finite().int().min(0).max(1200).nullable(),
  taxaPreAnual: finite, taxaPosAnual: finite, indexador: text.optional(),
  despesas: z.array(z.object({ id: text, descricao: text, valor: finite, financiar: z.boolean() }).strict()).max(500),
  seguroVidaAtivo: z.boolean(), seguroFinanciado: z.boolean(),
  seguroForma: z.enum(['PERCENTUAL_SALDO', 'VALOR_FIXO']),
  seguroPercentualMensal: finite, seguroValor: finite,
  iofAtivo: z.boolean(), iofDiarioAtivo: z.boolean().optional(), iofPessoa: z.enum(['PF', 'PJ']),
  iofAdicionalAtivo: z.boolean(), iofFinanciado: z.boolean(),
  amortizacoesAvulsas: z.array(z.object({ id: text, data: dateDraft, valor: finite, descricao: text.optional() }).strict()).max(1200).optional(),
}).strict()

export const recalculoInputSchema = z.object({
  dataInicial: dateDraft, valorCredito: finite, entrada: finite, custosAcessorios: finite,
  taxaMensal: finite,
  periodicidade: z.enum(['MENSAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL']),
  parcelas: z.array(z.object({ id: text, data: dateDraft, valor: finite }).strict()).max(1200),
}).strict()

export const fichaInputSchema = z.object({
  taxaMensal: finite, valorOperacao: finite, dataInicio: dateDraft,
  eventos: z.array(z.object({ id: text, data: dateDraft, evento: text, amortizacao: finite }).strict()).max(1200),
}).strict()

export const simulationDraftSchema = z.object({
  input: simulationInputSchema, recalculo: recalculoInputSchema, ficha: fichaInputSchema,
}).strict()

// O contrato do motor com o navegador é numérico. No limite da API, valores
// monetários são strings; taxas, contadores e dias conservam suas unidades.
const moneyKeys = new Set([
  'valor', 'valorOperacao', 'valorCredito', 'entrada', 'custosAcessorios',
  'seguroValor', 'saldoInicial', 'juros', 'amortizacao', 'seguro', 'iof', 'prestacao',
  'saldoDevedor', 'fluxoCaixa', 'fluxo', 'amortizacaoAvulsaAplicada', 'amortizacaoAvulsaNaoAplicada',
  'despesasTotal', 'despesasFinanciadas', 'despesasDebito', 'seguroTotal', 'seguroFinanciado',
  'seguroDebito', 'iofDiario', 'iofAdicional', 'iofTotal', 'iofFinanciado', 'iofDebito',
  'valoresDebitados', 'valorLiquidoCreditado', 'valorFinanciado', 'primeiraPrestacao',
  'maiorPrestacao', 'menorPrestacao', 'totalPrestacoes', 'totalJuros', 'totalAmortizado',
  'saldoFinal', 'totalAmortizacaoAvulsa', 'price', 'sac', 'sacre', 'totalParcelas',
  'totalComEstruturacao', 'diferenca', 'valorPresenteParcelas', 'diferencaValorPresente',
  'custosAcessoriosCompativeisTaxaInformada', 'creditoCompativelTaxaInformada',
  'valorNominal', 'jurosPeriodo', 'saldoAtualizado', 'amortizacaoInformada', 'excedente',
  'totalAmortizacoes', 'saldoAtual', 'totalPagamentosInformados', 'totalExcedente',
])

export function serializeSimulationMoney(value: unknown, key = ''): any {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('O cálculo gerou um número não finito.')
    return moneyKeys.has(key) ? String(value) : value
  }
  if (Array.isArray(value)) return value.map(item => serializeSimulationMoney(item))
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([name, item]) => [name, serializeSimulationMoney(item, name)]),
  )
  return value
}
