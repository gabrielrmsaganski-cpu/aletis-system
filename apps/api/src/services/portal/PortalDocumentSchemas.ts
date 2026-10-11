import { z } from 'zod'

export const portalDocumentCategorySchema = z.enum(['fiscal', 'contrato', 'identidade', 'patrimonio', 'agro', 'outros'])
export const portalDocumentPrioritySchema = z.enum(['normal', 'alta', 'urgente'])
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Prazo deve ser uma data válida no formato YYYY-MM-DD.')
const fields = {
  titulo: z.string().trim().min(2).max(200),
  descricao: z.string().trim().max(4000).nullable(),
  categoria: portalDocumentCategorySchema,
  obrigatorio: z.boolean(),
  prioridade: portalDocumentPrioritySchema,
  prazo: dateOnly.nullable(),
  tipoDocumento: z.string().trim().min(1).max(150).nullable(),
}
export const portalDocumentCreateSchema = z.object({
  titulo: fields.titulo,
  descricao: fields.descricao.optional(),
  categoria: fields.categoria.default('outros'),
  obrigatorio: fields.obrigatorio.default(true),
  prioridade: fields.prioridade.default('normal'),
  prazo: fields.prazo.optional(),
  tipoDocumento: fields.tipoDocumento.optional(),
  solicitadoPor: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).strict()

export const portalDocumentPatchSchema = z.object({
  titulo: fields.titulo.optional(), descricao: fields.descricao.optional(), categoria: fields.categoria.optional(),
  obrigatorio: fields.obrigatorio.optional(), prioridade: fields.prioridade.optional(), prazo: fields.prazo.optional(),
  tipoDocumento: fields.tipoDocumento.optional(),
  status: z.enum(['pendente', 'enviado', 'aprovado', 'rejeitado', 'cancelado']).optional(),
  observacao: z.string().trim().max(4000).nullable().optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === 'rejeitado' && !value.observacao?.trim()) context.addIssue({ code: 'custom', path: ['observacao'], message: 'Explique ao cliente o que precisa corrigir no documento.' })
})

export const portalDocumentUploadSchema = z.object({
  id: z.string().trim().min(1).max(100),
  clienteId: z.string().trim().min(1).max(100),
  pendenciaId: z.string().trim().min(1).max(100).optional(),
  nomeOriginal: z.string().trim().min(1).max(255),
  nomeStorage: z.string().min(1).max(255).refine(value => !/[\\/\u0000]/.test(value) && value !== '.' && value !== '..', 'Nome de armazenamento inválido.'),
  mime: z.string().trim().min(1).max(200),
  tamanho: z.number().int().positive().max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).transform(value => value.toLowerCase()),
  categoria: portalDocumentCategorySchema.optional(),
  enviadoPor: z.enum(['cliente', 'consultor']),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
}).strict()

// Todos os documentos JSONB produzidos pelo serviço passam por validação antes da transação.
export const portalDocumentMetadataSchema = z.object({
  version: z.literal(1),
  requestVersion: z.number().int().positive().nullable(),
  source: z.literal('portal'),
  processing: z.object({
    analysis: z.object({ status: z.literal('pending') }),
    drive: z.object({ status: z.literal('pending') }),
  }),
}).strict()

export const portalDocumentReviewSchema = z.object({
  status: z.enum(['aprovado', 'rejeitado']),
  observacao: z.string().max(4000).nullable(),
  revisadoEm: z.string().datetime(),
  revisadoPor: z.string().max(200).nullable(),
}).strict()

export type PortalDocumentCreateInput = z.input<typeof portalDocumentCreateSchema>
export type PortalDocumentPatchInput = z.input<typeof portalDocumentPatchSchema>
export type PortalDocumentUploadInput = z.input<typeof portalDocumentUploadSchema>
