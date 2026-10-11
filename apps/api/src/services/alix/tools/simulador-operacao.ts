// Ferramentas determinísticas: dados ausentes são devolvidos à ALIX, não
// substituídos silenciosamente pelos valores de uma planilha demonstrativa.
import Decimal from 'decimal.js'
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import {
  calcularFichaBancaria, calcularRecalculoOperacao, simularOperacaoCompleta, ErroSimuladorOperacao,
  type SimuladorOperacaoInput, type RecalculoOperacaoInput, type FichaBancariaInput,
} from '@aletis/financial-calc'
import { simulationInputSchema, recalculoInputSchema, fichaInputSchema, serializeSimulationMoney } from '../../simulations/SimulationSchemas.js'

const EXEMPLO_INPUT: SimuladorOperacaoInput = {
  agente: 'Agente financeiro',
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
  indexador: '',
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
  amortizacoesAvulsas: [],
}


class InputPendente extends Error {
  constructor(readonly campos: string[], message = 'Recupere estes dados no documento/CRM e solicite apenas os que continuarem ausentes.') { super(message) }
}
const PRESENTE = (value: unknown) => value !== undefined && value !== null && value !== ''
const REQUIRED_OPERATION = [
  'valorOperacao', 'dataCredito', 'primeiroVencimentoPrincipal', 'periodicidadePrincipal',
  'numeroParcelas', 'taxaPreAnual', 'despesas', 'iofAtivo', 'seguroVidaAtivo',
]
const OPTIONAL_DEFAULTS = {
  agente: '', tomador: '', contrato: '', taxaPosAnual: 0, indexador: '',
  periodicidadeJuros: 'JUNTO_PRINCIPAL', jurosAte: 'FINAL',
  seguroFinanciado: false, seguroForma: 'PERCENTUAL_SALDO', seguroPercentualMensal: 0, seguroValor: 0,
  iofDiarioAtivo: true, iofPessoa: 'PF', iofAdicionalAtivo: true, iofFinanciado: false, amortizacoesAvulsas: [],
}
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputPendente(['input'])
  return value as Record<string, any>
}
function rate(value: unknown, unit: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InputPendente([field], 'Informe uma taxa numérica finita e a unidade explicitamente.')
  if (unit !== 'decimal' && unit !== 'percentual') throw new InputPendente(['unidadeTaxas'], 'Especifique decimal (0.01 = 1%) ou percentual (1 = 1%). A unidade não é inferida pela magnitude.')
  return new Decimal(value).div(unit === 'percentual' ? 100 : 1).toNumber()
}
function parseSchema<T>(schema: { safeParse: (value: unknown) => any }, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new InputPendente(parsed.error.issues.map((item: any) => item.path.join('.')), parsed.error.issues.map((item: any) => `${item.path.join('.')}: ${item.message}`).join('; '))
  return parsed.data as T
}
function normalizedOperation(payload: Record<string, any>) {
  const demo = payload.modo === 'demonstracao'
  const source = payload.input !== undefined ? object(payload.input) : Object.fromEntries(Object.entries(payload).filter(([key]) =>
    !['modo', 'unidadeTaxas', 'incluirLinhas', 'offsetLinhas', 'limiteLinhas'].includes(key)))
  // O exemplo é isolado e identificado; nunca preenche dados de uma operação real.
  if (demo) {
    if (Object.keys(source).length) throw new InputPendente(['modo'], 'O exemplo não aceita dados de cliente. Use modo real e informe as condições da operação.')
    return { input: structuredClone(EXEMPLO_INPUT), demonstracao: true, premissasAdotadas: ['Exemplo fictício v16, sem vínculo com cliente.'] }
  }
  const missing = REQUIRED_OPERATION.filter(key => !PRESENTE(source[key]))
  if (source.taxaPosAnual === null || (String(source.indexador || '').trim() && !PRESENTE(source.taxaPosAnual))) missing.push('taxaPosAnual')
  if (source.seguroPercentualMensal === null) missing.push('seguroPercentualMensal')
  const unit = payload.unidadeTaxas
  if (!['decimal', 'percentual'].includes(unit)) missing.push('unidadeTaxas')
  if (source.iofAtivo === true) for (const key of ['iofDiarioAtivo', 'iofAdicionalAtivo', 'iofPessoa', 'iofFinanciado']) if (!PRESENTE(source[key])) missing.push(key)
  if (source.seguroVidaAtivo === true) {
    for (const key of ['seguroForma', 'seguroFinanciado']) if (!PRESENTE(source[key])) missing.push(key)
    const amount = source.seguroForma === 'VALOR_FIXO' ? 'seguroValor' : 'seguroPercentualMensal'
    if (!PRESENTE(source[amount])) missing.push(amount)
  }
  if (missing.length) throw new InputPendente(missing)
  const input: Record<string, any> = { ...OPTIONAL_DEFAULTS, ...source }
  input.taxaPreAnual = rate(source.taxaPreAnual, unit, 'taxaPreAnual')
  input.taxaPosAnual = rate(source.taxaPosAnual ?? 0, unit, 'taxaPosAnual')
  input.seguroPercentualMensal = rate(source.seguroPercentualMensal ?? 0, unit, 'seguroPercentualMensal')
  const premissasAdotadas = [
    ...(source.periodicidadeJuros === undefined ? ['Juros pagos junto com o principal.'] : []),
    ...(source.jurosAte === undefined ? ['Agenda de juros separada, quando informada, até o vencimento final.'] : []),
    ...(source.taxaPosAnual === undefined ? ['Sem componente pós-fixado informado: taxa pós considerada zero.'] : []),
    'Datas são as informadas; nenhum vencimento ou taxa foi retirado do exemplo v16.',
  ]
  return { input: parseSchema<SimuladorOperacaoInput>(simulationInputSchema, input), demonstracao: false, premissasAdotadas }
}

function safe(handler: (payload: Record<string, any>) => unknown) {
  return async (value: unknown) => {
    try { return serializeSimulationMoney(handler(object(value))) }
    catch (error) {
      if (error instanceof InputPendente) return { ok: false, code: 'DADOS_SIMULACAO_PENDENTES', camposPendentes: [...new Set(error.campos)], mensagem: error.message, orientacao: 'Não calcule com valores presumidos. Consulte fontes existentes e peça somente o que faltar.' }
      if (error instanceof ErroSimuladorOperacao) return { ok: false, code: error.codigo, mensagem: error.message, validacao: error.validacao }
      throw error
    }
  }
}

export function buildSimuladorOperacaoTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}
  function add(spec: LLMTool, handler: (payload: Record<string, any>) => unknown) {
    tools.push(spec); registry[spec.name] = { spec, handler: safe(handler) }
  }
  add({
    name: 'simular_operacao_v16',
    description: 'Compara PRICE, SAC e SACRE com calendário, despesas, seguro, IOF, CET anual365 e custo total. Recupere dados do CRM/documento primeiro. Não inventa valores/datas. Unidade de TODAS as taxas obrigatória: decimal(0.01=1%) ou percentual(1=1%). Condições ausentes devolvem camposPendentes. modo demonstracao exige ausência de dados reais.',
    input_schema: {
      type: 'object', properties: {
        input: { type: 'object', description: 'Campos: valorOperacao, dataCredito AAAA-MM-DD, primeiroVencimentoPrincipal, periodicidadePrincipal (MENSAL/BIMESTRAL/TRIMESTRAL/SEMESTRAL/ANUAL/UNICA), numeroParcelas, taxaPreAnual, despesas[{id,descricao,valor,financiar}], iofAtivo e seguroVidaAtivo obrigatórios. Opcionais: agente,tomador,contrato,taxaPosAnual,indexador,periodicidadeJuros,primeiroVencimentoJuros,jurosAte,amortizacoesAvulsas[{id,data,valor}]. Se IOF ativo informe iofPessoa(PF/PJ),iofDiarioAtivo,iofAdicionalAtivo,iofFinanciado. Se seguro ativo informe seguroFinanciado,seguroForma(VALOR_FIXO/PERCENTUAL_SALDO) e seguroValor ou seguroPercentualMensal. Valores monetários em reais numéricos, sem separador de milhares.' },
        modo: { type: 'string', enum: ['real', 'demonstracao'] },
        unidadeTaxas: { type: 'string', enum: ['decimal', 'percentual'] },
        incluirLinhas: { type: 'boolean' },
        offsetLinhas: { type: 'integer', minimum: 0 }, limiteLinhas: { type: 'integer', minimum: 1, maximum: 100 },
      },
    },
  }, payload => {
    const normalized = normalizedOperation(payload)
    const result = simularOperacaoCompleta(normalized.input)
    const offset = Number.isInteger(payload.offsetLinhas) && payload.offsetLinhas >= 0 ? payload.offsetLinhas : 0
    const limit = Number.isInteger(payload.limiteLinhas) ? Math.min(100, Math.max(1, payload.limiteLinhas)) : 40
    const by = (field: 'totalPrestacoes' | 'maiorPrestacao' | 'cetAnual365') => [...result.resumo].sort((a, b) => new Decimal(a[field]).cmp(b[field]))[0].sistema
    return {
      ok: true, demonstracao: normalized.demonstracao, versaoMotor: result.versaoMotor,
      inputNormalizado: result.parametros, premissasAdotadas: normalized.premissasAdotadas,
      premissasMotor: result.premissas, validacao: result.validacao,
      resumo: { taxaFinalAnual: result.taxaFinalAnual, taxaFinalMensal: result.taxaFinalMensal, sistemas: result.resumo,
        comparativo: result.comparativo.slice(offset, offset + limit) },
      criterios: { menorTotalPrestacoes: by('totalPrestacoes'), menorPicoParcela: by('maiorPrestacao'), menorCetAnual365: by('cetAnual365'),
        orientacao: 'Compare custo total, pico das parcelas, datas de recebimento da safra e capacidade de pagamento. Uma taxa menor sozinha não define a melhor operação.' },
      linhas: payload.incluirLinhas ? Object.fromEntries(Object.entries(result.sistemas).map(([name, value]) => [name, value.linhas.slice(offset, offset + limit)])) : undefined,
      cobertura: { offset, limite: limit, comparativoTotal: result.comparativo.length,
        comparativoRetornado: result.comparativo.slice(offset, offset + limit).length,
        sistemas: Object.fromEntries(Object.entries(result.sistemas).map(([name, value]) => [name, { total: value.linhas.length, retornadas: payload.incluirLinhas ? value.linhas.slice(offset, offset + limit).length : 0, proximoOffset: offset + limit < value.linhas.length ? offset + limit : null }])) },
    }
  })
  add({ name: 'recalcular_operacao_v16', description: 'Recalcula fluxo recebido com CET365, valor presente pela taxa informada e diferença de custo. Informe unidadeTaxas explicitamente; datas/valores ausentes não são completados.',
    input_schema: { type: 'object', properties: {
      dataInicial: { type: 'string' }, valorCredito: { type: 'number' }, entrada: { type: 'number' }, custosAcessorios: { type: 'number' },
      taxaMensal: { type: 'number' }, unidadeTaxas: { type: 'string', enum: ['decimal', 'percentual'] },
      periodicidade: { type: 'string', enum: ['MENSAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL'] },
      parcelas: { type: 'array', maxItems: 500, items: { type: 'object', properties: { id: { type: 'string' }, data: { type: 'string' }, valor: { type: 'number' } }, required: ['id','data','valor'] } },
    }, required: ['dataInicial','valorCredito','entrada','custosAcessorios','taxaMensal','unidadeTaxas','periodicidade','parcelas'] },
  }, payload => {
    const { unidadeTaxas, ...raw } = payload
    const input = parseSchema<RecalculoOperacaoInput>(recalculoInputSchema, { ...raw, taxaMensal: rate(raw.taxaMensal, unidadeTaxas, 'taxaMensal') })
    return { ok: true, inputNormalizado: input, resultado: calcularRecalculoOperacao(input), premissas: ['Taxa mensal contratual em mês de 30 dias.', 'CET líquido365 considera o crédito efetivamente recebido (crédito menos entrada), incluindo custos financiados nas parcelas. Use cetLiquidoAnual365 para comparar o custo ao tomador.', 'Os campos cetAnual/cetMensal e cetAnual365/cetMensal365 conservam a base financiada da planilha e servem para conferir o fluxo-base e o cálculo inverso.', 'Custos acessórios informados são financiados neste bloco; use a simulação completa para despesas debitadas na liberação.'] }
  })
  add({ name: 'ficha_bancaria_v16', description: 'Atualiza saldo bancário por eventos reais, juros e amortizações. Rejeita datas anteriores à liberação; evidencia pagamentos excedentes. Informe unidadeTaxas explicitamente.',
    input_schema: { type: 'object', properties: {
      taxaMensal: { type: 'number' }, unidadeTaxas: { type: 'string', enum: ['decimal', 'percentual'] }, valorOperacao: { type: 'number' }, dataInicio: { type: 'string' },
      eventos: { type: 'array', maxItems: 500, items: { type: 'object', properties: { id: { type: 'string' }, data: { type: 'string' }, evento: { type: 'string' }, amortizacao: { type: 'number' } }, required: ['id','data','evento','amortizacao'] } },
    }, required: ['taxaMensal','unidadeTaxas','valorOperacao','dataInicio','eventos'] },
  }, payload => {
    const { unidadeTaxas, ...raw } = payload
    const input = parseSchema<FichaBancariaInput>(fichaInputSchema, { ...raw, taxaMensal: rate(raw.taxaMensal, unidadeTaxas, 'taxaMensal') })
    return { ok: true, inputNormalizado: input, resultado: calcularFichaBancaria(input), premissas: ['Juros compostos por dias corridos em mês contratual de 30 dias.', 'Não aplica multas, mora ou indexador histórico não informados.'] }
  })
  return { tools, registry }
}
