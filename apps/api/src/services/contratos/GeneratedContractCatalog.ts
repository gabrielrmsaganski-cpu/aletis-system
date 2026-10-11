import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ContratoGerado } from '../ContratoGenerator.js'
import { normalizeContractMoney } from '../../lib/contract-money.js'

export const generatedContractTypeSchema = z.enum([
  'cpr_financeira', 'cpr_fisica', 'confissao_divida', 'termo_renegociacao',
  'acordo_extrajudicial', 'transacao_excepcional', 'prestacao_servicos_aletis',
])

export const contractOriginSchema = z.object({
  clienteId: z.string().trim().min(1).max(160).optional(),
  propostaId: z.string().trim().min(1).max(160).optional(),
})

export const generatedContractSchema = z.object({
  id: z.string().regex(/^ctr-[a-z0-9_-]+$/).max(160),
  tipo: generatedContractTypeSchema,
  titulo: z.string().min(1),
  dataGeracao: z.string().datetime({ offset: true }),
  dataVencimentoOrVigencia: z.string().optional(),
  partes: z.object({ devedor: z.string().min(1), credor: z.string().min(1) }),
  valorTotal: z.string().regex(/^\d{1,16}\.\d{2}$/),
  conteudoMarkdown: z.string().min(1),
  metadados: z.object({
    clausulas: z.number().int().nonnegative(),
    fundamentoLegal: z.array(z.string()),
    necessarioRevisao: z.array(z.string()),
  }),
  clienteId: contractOriginSchema.shape.clienteId,
  propostaId: contractOriginSchema.shape.propostaId,
  documento: z.object({
    versao: z.literal(1),
    formato: z.literal('markdown'),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    markdownUrl: z.string(),
    pdfUrl: z.string(),
  }),
}).superRefine((record, ctx) => {
  const digest = createHash('sha256').update(record.conteudoMarkdown, 'utf8').digest('hex')
  if (record.documento.sha256 !== digest) ctx.addIssue({ code: 'custom', path: ['documento', 'sha256'], message: 'Conteúdo contratual não corresponde ao hash registrado.' })
  if (record.documento.markdownUrl !== `/api/contratos/${record.id}/markdown` || record.documento.pdfUrl !== `/api/contratos/${record.id}/pdf`) {
    ctx.addIssue({ code: 'custom', path: ['documento'], message: 'Referência documental inválida.' })
  }
})

export type GeneratedContractRecord = z.infer<typeof generatedContractSchema>
export type ContractOrigin = z.infer<typeof contractOriginSchema>

export class GeneratedContractOriginError extends Error {}

/** Preparação para importação pontual de acervo legado: mantém ID, conteúdo e URLs originais. */
export function prepareGeneratedContractRecord(
  generated: Omit<ContratoGerado, 'valorTotal'> & { valorTotal: string | number },
  origin: ContractOrigin = {},
): GeneratedContractRecord {
  return generatedContractSchema.parse({
    ...generated,
    ...contractOriginSchema.parse(origin),
    valorTotal: normalizeContractMoney(generated.valorTotal),
    documento: {
      versao: 1,
      formato: 'markdown',
      sha256: createHash('sha256').update(generated.conteudoMarkdown, 'utf8').digest('hex'),
      markdownUrl: `/api/contratos/${generated.id}/markdown`,
      pdfUrl: `/api/contratos/${generated.id}/pdf`,
    },
  })
}

export interface GeneratedContractPersistence {
  enabled(): boolean
  insert(record: GeneratedContractRecord): Promise<GeneratedContractRecord>
  list(): Promise<GeneratedContractRecord[]>
  get(id: string): Promise<GeneratedContractRecord | null>
  delete(id: string): Promise<boolean>
}

/** Cada instância possui cache próprio; PG é a fonte de verdade em todas as leituras. */
export class GeneratedContractCatalog {
  private readonly cache = new Map<string, GeneratedContractRecord>()

  constructor(private readonly persistence: GeneratedContractPersistence) {}

  async create(generated: ContratoGerado, origin: ContractOrigin = {}): Promise<GeneratedContractRecord> {
    if ((origin.clienteId || origin.propostaId) && !this.persistence.enabled()) {
      throw new GeneratedContractOriginError('A vinculação de origem exige PostgreSQL habilitado.')
    }
    const record = prepareGeneratedContractRecord({ ...generated, id: `ctr-${generated.tipo.slice(0, 4)}-${randomUUID()}` }, origin)
    // Publica no cache somente depois de a gravação estrita confirmar sucesso.
    const committed = this.persistence.enabled() ? await this.persistence.insert(record) : record
    this.cache.set(committed.id, structuredClone(committed))
    return structuredClone(committed)
  }

  async list(): Promise<GeneratedContractRecord[]> {
    if (!this.persistence.enabled()) return structuredClone([...this.cache.values()])
    const records = await this.persistence.list()
    this.cache.clear()
    for (const record of records) this.cache.set(record.id, structuredClone(record))
    return structuredClone(records)
  }

  async get(id: string): Promise<GeneratedContractRecord | null> {
    if (!this.persistence.enabled()) return structuredClone(this.cache.get(id) ?? null)
    const record = await this.persistence.get(id)
    if (record) this.cache.set(id, structuredClone(record))
    else this.cache.delete(id)
    return structuredClone(record)
  }

  async delete(id: string): Promise<boolean> {
    if (!this.persistence.enabled()) return this.cache.delete(id)
    const deleted = await this.persistence.delete(id)
    this.cache.delete(id)
    return deleted
  }
}
