import { z } from 'zod'
import { moneyToCents } from './parseMoneyPtBr.js'

const text = (max = 240) => z.string().trim().max(max)
const nonempty = (max = 240) => text(max).min(1)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Data inválida')
// Mantém strings decimais intactas. Números são aceitos apenas para compatibilidade
// com os formulários legados; não são usados em cálculos monetários neste guard.
export const crmMoneySchema = z.union([z.number().finite().nonnegative(), z.string().regex(/^\d{1,16}(?:\.\d{1,2})?$/)])
  .refine(value => { const cents = moneyToCents(String(value)); return cents !== null && cents <= 999999999999999999n }, 'Use um valor decimal não negativo com até duas casas decimais')
export const crmStageSchema = z.enum(['lead', 'prospeccao', 'qualificacao', 'analise', 'proposta', 'negociacao', 'acordo', 'acompanhamento', 'concluido', 'encerrado'])
const timelineEvent = z.object({
  data: date.optional(),
  tipo: z.enum(['contato', 'proposta', 'pagamento', 'reuniao', 'documento', 'analise', 'acordo', 'vencimento', 'estagio', 'acao']),
  descricao: nonempty(2000), detalhes: text(4000).optional(),
})
const office = nonempty(120).refine(value => ['aletis', 'canarana'].includes(value.toLowerCase()), 'Escritório inválido. Use Aletis ou Canarana.')
  .transform(value => value.toLowerCase() === 'canarana' ? 'Canarana' : 'Aletis')
const optionalDate = z.union([z.literal(''), date]).optional()
const additionalInfo = z.array(z.object({ campo: nonempty(160), valor: text(4000) })).max(100).optional()
const clientDebt = z.object({
  id: text(180).optional(),
  contrato: nonempty(),
  credor: text(220),
  emitente: text(220).optional(),
  tomador: text(220).optional(),
  modalidade: text(180).optional(),
  finalidade: text(500).optional(),
  enquadramento: text(240).optional(),
  numeroCedula: text(180).optional(),
  valorOriginal: crmMoneySchema,
  valorAtualizado: crmMoneySchema,
  valorAtual: crmMoneySchema.optional(),
  valorParcela: crmMoneySchema.optional(),
  vencimento: optionalDate,
  dataContratacao: optionalDate,
  primeiraParcela: optionalDate,
  ultimaParcela: optionalDate,
  status: z.enum(['ativa', 'renegociada', 'paga', 'em_acordo', 'em_dia', 'atrasada', 'quitada', 'nao_informado']).optional(),
  parcelasTotal: z.number().int().nonnegative().max(10000).optional(),
  parcelasPagas: z.number().int().nonnegative().max(10000).optional(),
  prazoMeses: z.number().int().nonnegative().max(10000).optional(),
  carenciaMeses: z.number().int().nonnegative().max(10000).optional(),
  diasAtraso: z.number().int().nonnegative().max(100000).optional(),
  taxa: text(80).optional(),
  taxaNominalAa: text(80).optional(),
  taxaEfetivaAa: text(80).optional(),
  cetAa: text(80).optional(),
  indexador: text(120).optional(),
  periodicidade: text(120).optional(),
  metodoCalculo: text(120).optional(),
  garantias: z.array(text(1000)).max(200).optional(),
  observacoes: text(10000).optional(),
  informacoesAdicionais: additionalInfo,
}).passthrough()
const clientPayment = z.object({
  id: text(180).optional(),
  data: date,
  valor: crmMoneySchema,
  descricao: text(2000),
  tipo: z.enum(['pagamento', 'dacao', 'deposito_judicial']),
  status: z.enum(['previsto', 'realizado', 'compensado', 'cancelado']).optional(),
  credor: text(220).optional(),
  contrato: text(240).optional(),
  formaPagamento: text(180).optional(),
  comprovante: text(2000).optional(),
  observacoes: text(10000).optional(),
  informacoesAdicionais: additionalInfo,
}).passthrough()
const clientFields = z.object({
  nome: nonempty(220), cpfCnpj: text(32), tipo: z.enum(['pessoa_fisica', 'pessoa_juridica']),
  cidade: nonempty(180), uf: z.string().regex(/^[A-Za-z]{2}$/).transform(value => value.toUpperCase()),
  telefone: text(60), whatsapp: text(60), email: z.union([z.literal(''), z.string().trim().email().max(254)]), atividade: text(500),
  areaTotalHa: z.number().finite().nonnegative(), culturas: z.array(nonempty(120)).max(100), estagio: crmStageSchema,
  consultor: text(180), escritorio: office, credor: text(220), modalidadeCredito: text(180),
  valorTotalDivida: crmMoneySchema, valorTotalPago: crmMoneySchema,
  dividas: z.array(clientDebt).max(2000),
  pagamentos: z.array(clientPayment).max(2000),
  observacoes: text(20000), carCodigoImovel: text(160), cep: text(16),
  endereco: z.object({ cep: text(16).optional(), logradouro: text(240).optional(), numero: text(40).optional(),
    complemento: text(120).optional(), bairro: text(120).optional(), cidade: text(180).optional(), uf: text(2).optional(),
  }).passthrough(),
  proximaAcao: z.object({ data: date, descricao: nonempty(1000), criadoEm: text(60).optional(), criadoPor: text(180).optional() }).nullable(),
  tags: z.array(nonempty(160)).max(100),
  grupoFamiliar: z.array(z.object({ nome: nonempty(220), id: text(180).optional(), cpfCnpj: text(32).optional(), telefone: text(60).optional(), email: text(254).optional(),
    parentesco: text(80).optional(), papel: text(80).optional(), atuaAtividade: z.boolean().optional(), principal: z.boolean().optional(),
    vinculoCliente: text(120).optional(), observacoes: text(1200).optional(), criadoEm: text(60).optional(), atualizadoEm: text(60).optional(),
  })).max(200),
})
export const clientePatchSchema = clientFields.partial().extend({ timelineEvent: timelineEvent.optional() })
  .refine(value => Object.keys(value).length > 0, 'Informe ao menos um campo válido para atualizar')
export const clienteCreateSchema = clientFields.partial().extend({
  nome: nonempty(220), cidade: nonempty(180), uf: clientFields.shape.uf, escritorio: office,
  endereco: text(240).optional(), numero: text(40).optional(), complemento: text(120).optional(), bairro: text(120).optional(),
  dividaTotal: crmMoneySchema.optional(), codImovel: text(160).optional(),
})

export const propostaPatchSchema = z.object({
  clienteNome: nonempty(220), credor: nonempty(220), titulo: nonempty(300),
  tipo: z.enum(['liquidacao', 'renegociacao', 'memoria_calculo', 'parcelamento', 'acordo_judicial']),
  status: z.enum(['rascunho', 'em_analise', 'enviada', 'aceita', 'rejeitada', 'expirada']),
  valorDivida: crmMoneySchema, valorProposta: crmMoneySchema, descontoPercentual: z.number().finite(),
  itens: z.array(z.object({ descricao: nonempty(1000), valor: crmMoneySchema, tipo: z.enum(['pagamento', 'dacao', 'compensacao', 'desconto', 'parcela']), data: date.optional() })).max(2000),
  condicoes: z.array(text(4000)).max(200), fundamentacao: text(30000), observacoes: text(30000),
  dataCriacao: date, dataValidade: date, pdfUrl: text(2000).nullable(),
  arquivoOrigem: z.object({ alixDocumentId: text().optional(), alixSessionId: text().optional(), filename: text(500).optional(),
    mimetype: text(180).optional(), sizeBytes: z.number().int().nonnegative().optional(), cofreUploadId: text().optional(), cofreDownloadUrl: text(2000).optional() }),
  extracaoIa: z.object({ origem: z.enum(['openai', 'fallback', 'manual']), estado: z.enum(['queued', 'processing', 'completed', 'completed_basic', 'failed']).optional(),
    modelo: text().optional(), resumo: text(10000).optional(), confianca: z.number().min(0).max(1).optional(), camposAusentes: z.array(text()).optional(),
    textoExtraidoChars: z.number().int().nonnegative().optional(), erro: text(4000).optional(), atualizadoEm: text(60).optional() }),
  demandaId: text(120), demandaTitulo: text(180), versaoDemanda: z.number().int().positive(), assunto: text(180),
}).partial().extend({ expectedRevision: z.number().int().min(0).max(2147483647).optional() })
  .refine(value => Object.keys(value).some(key => key !== 'expectedRevision'), 'Informe ao menos um campo válido para atualizar')

/** Percentual é adimensional; dívida e oferta são calculadas em centavos exatos. */
export function crmDiscountPercent(debt: unknown, offer: unknown): number {
  const base = moneyToCents(String(debt))
  const proposed = moneyToCents(String(offer))
  if (base === null || proposed === null) throw new Error('Valor monetário inválido para calcular desconto')
  if (base === 0n) return 0
  const numerator = (base - proposed) * 10000n
  const rounded = numerator >= 0n ? (numerator + base / 2n) / base : -((-numerator + base / 2n) / base)
  return Number(rounded) / 100
}
