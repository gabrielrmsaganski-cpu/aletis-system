import { z } from 'zod'
import { moneyToCents } from '../../lib/parseMoneyPtBr.js'
import { contractOriginSchema, generatedContractTypeSchema } from './GeneratedContractCatalog.js'

// Limite conservador abaixo de 2^45 reais. A representação number legada
// ainda distingue centavos nessa faixa; todas as verificações monetárias usam BigInt.
export const CONTRACT_INPUT_MAX_CENTS = 3518437208883199n
export const contractInputMoneySchema = z.number({ invalid_type_error: 'Informe um valor monetário numérico.' })
  .finite().refine(value => {
    const cents = moneyToCents(String(value))
    return cents !== null && cents <= CONTRACT_INPUT_MAX_CENTS
  }, 'Use um valor não negativo, com até 2 casas decimais e no máximo R$ 35.184.372.088.831,99.')

const text = z.string()
const optionalText = text.optional()
const quantity = z.number().finite().nonnegative()
const count = z.number().int().nonnegative().safe()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Data inválida.')
const optionalDate = z.union([z.literal('').transform(() => undefined), date]).optional()
const party = z.object({
  nomeCompleto: z.string().trim().min(1),
  // Os rascunhos mínimos continuam válidos. O gerador exige strings para estes campos.
  cpfCnpj: text.default(''), enderecoCompleto: text.default(''), cidade: text.default(''), uf: text.default(''),
  rgOuIe: optionalText, estadoCivil: optionalText, profissao: optionalText, cep: optionalText,
  email: optionalText, telefone: optionalText,
  representanteLegal: z.object({ nome: text.default(''), cpf: text.default(''), cargo: text.default('') }).optional(),
})
const scope = z.object({
  diagnosticoFinanceiro: z.boolean().default(false), memoriaCalculoAuditavel: z.boolean().default(false),
  deteccaoAbusividadeEAnatocismo: z.boolean().default(false), deteccaoDescaracterizacaoCreditoRural: z.boolean().default(false),
  projecaoFluxoCaixaEStressTest: z.boolean().default(false), propostaEstruturadaReestruturacao: z.boolean().default(false),
  negociacaoCredoresMulti: z.boolean().default(false), estruturacaoGarantiasDacao: z.boolean().default(false),
  minutasContratuais: z.boolean().default(false), suportePericialRevisional: z.boolean().default(false),
  acompanhamentoExecucao: z.boolean().default(false),
})
const money = contractInputMoneySchema

export const contractGenerationRequestSchema = z.object({
  tipo: generatedContractTypeSchema,
  devedor: party, credor: party,
  local: z.string().trim().min(1), uf: z.string().trim().min(1),
  cpr: z.object({
    produto: optionalText, quantidade: quantity.optional(), unidade: optionalText, localEntrega: optionalText,
    precoUnitario: money.optional(), valorTotal: money.optional(), dataVencimento: optionalDate, safra: optionalText,
    imovel: z.object({
      denominacao: optionalText, matricula: optionalText, cartorio: optionalText, areaTotalHa: quantity,
      municipio: optionalText, uf: optionalText, nirfCar: optionalText, ccir: optionalText, itr: optionalText,
    }).optional(),
  }).optional(),
  divida: z.object({
    valorOriginal: money.optional(), valorAtualizado: money.default(0), fundamento: optionalText,
    contratosOriginais: z.array(z.object({ numero: text.default(''), dataAssinatura: optionalDate, valor: money })).optional(),
  }).optional(),
  parcelas: z.array(z.object({
    numero: count, valor: money, vencimento: optionalDate,
    formaPagamento: z.enum(['boleto', 'ted', 'pix', 'dinheiro', 'produto_fisico']).optional(),
  })).optional(),
  dacoes: z.array(z.object({ descricao: text.default(''), valor: money, matricula: optionalText, localizacao: optionalText })).optional(),
  garantias: z.array(z.object({
    tipo: z.enum(['penhor_agricola', 'hipoteca', 'alienacao_fiduciaria', 'aval', 'fianca', 'cpr_fisica']),
    descricao: text.default(''), valorAvaliado: money.optional(),
  })).optional(),
  servicos: z.object({
    escopo: scope.optional(),
    modeloHonorarios: z.enum(['fixo', 'mensal', 'exito', 'hibrido_fixo_exito', 'hibrido_mensal_exito']).optional(),
    honorarioFixo: money.optional(), mensalidade: money.optional(), pisoExito: money.optional(), tetoExito: money.optional(),
    mesesRetainer: count.optional(), percentualExito: z.number().finite().min(0).max(100).optional(),
    baseCalculoExito: z.enum(['economia_total', 'reducao_saldo', 'valor_renegociado']).optional(),
    prazoVigenciaMeses: z.number().int().min(1).max(1200).optional(),
    operacao: z.object({
      saldoDevedorAtualizado: money.default(0), numeroCredores: count.optional(),
      credoresListados: z.array(text).optional(), descricaoSituacao: optionalText,
    }).optional(),
    condicaoPagamentoExito: z.enum(['a_vista_liquidacao', 'pro_rata_parcelas_credor', 'parcelado_ate_180d']).optional(),
    aplicaCdc: z.boolean().optional(), aplicaSuperendividamento: z.boolean().optional(),
    contatoAletis: z.object({ consultorResponsavel: text.default(''), email: text.default(''), telefone: optionalText }).optional(),
    plataformaAssinaturaEletronica: optionalText,
    arbitragem: z.object({ adotar: z.boolean(), camara: optionalText, idioma: optionalText, sede: optionalText, tipo: z.enum(['ad_hoc', 'institucional']).optional() }).optional(),
  }).optional(),
  dataAssinatura: optionalDate, testemunhas: z.array(z.object({ nome: text.default(''), cpf: text.default('') })).optional(),
  foro: optionalText, observacoes: optionalText,
  ...contractOriginSchema.shape,
}).superRefine((data, ctx) => {
  const add = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message })
  if (data.tipo === 'prestacao_servicos_aletis') {
    if (!data.servicos) add(['servicos'], 'servicos é obrigatório para este tipo de contrato.')
    else {
      if (!data.servicos.modeloHonorarios) add(['servicos', 'modeloHonorarios'], 'modeloHonorarios é obrigatório.')
      if (!data.servicos.prazoVigenciaMeses) add(['servicos', 'prazoVigenciaMeses'], 'prazoVigenciaMeses deve ser informado.')
      if (!data.servicos.escopo) add(['servicos', 'escopo'], 'escopo é obrigatório.')
    }
  }
  const cents = (value: number | undefined) => moneyToCents(String(value ?? 0)) ?? 0n
  for (const field of ['parcelas', 'dacoes'] as const) {
    const total = (data[field] ?? []).reduce((sum, item) => sum + cents(item.valor), 0n)
    if (total > CONTRACT_INPUT_MAX_CENTS) add([field], 'O total ultrapassa o limite monetário seguro do gerador.')
  }
  const s = data.servicos
  if (s) {
    const fixed = cents(s.honorarioFixo)
    const monthly = cents(s.mensalidade) * BigInt(Number.isSafeInteger(s.mesesRetainer ?? 0) ? s.mesesRetainer ?? 0 : 0)
    // Limite superior exato da estimativa, sem executar o cálculo legado em number.
    const rawPct = String(s.percentualExito ?? 0).match(/^(\d+)(?:\.(\d+))?(?:e-(\d+))?$/i)
    let successFee = 0n
    if (rawPct) {
      const denominator = 100n * 10n ** BigInt((rawPct[2]?.length ?? 0) + parseInt(rawPct[3] ?? '0', 10))
      const numerator = cents(s.operacao?.saldoDevedorAtualizado) * BigInt(rawPct[1] + (rawPct[2] ?? ''))
      successFee = (numerator + denominator - 1n) / denominator
    }
    if (s.pisoExito && successFee < cents(s.pisoExito)) successFee = cents(s.pisoExito)
    if (s.tetoExito && successFee > cents(s.tetoExito)) successFee = cents(s.tetoExito)
    if (fixed + monthly + successFee > CONTRACT_INPUT_MAX_CENTS) add(['servicos'], 'O total estimado ultrapassa o limite monetário seguro do gerador.')
    if (s.pisoExito !== undefined && s.tetoExito !== undefined && cents(s.pisoExito) > cents(s.tetoExito)) {
      add(['servicos', 'tetoExito'], 'O teto de êxito não pode ser inferior ao piso.')
    }
  }
})
