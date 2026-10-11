import { createHash } from 'node:crypto'
import { z } from 'zod'

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'
// Google usa Z; normalizações Python também produzem offsets ISO (+00:00) e microssegundos.
export const driveCorpusTimestamp = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), 'Data e hora ISO inválidas.')
export const driveCorpusCoverage = z.object({
  status: z.enum(['complete', 'partial', 'unknown']),
  totalPages: z.number().int().nonnegative().optional(), readablePages: z.array(z.number().int()).optional(),
  pendingPages: z.array(z.number().int()).optional(), failedPages: z.array(z.number().int()).optional(),
  totalRows: z.number().int().nonnegative().optional(), extractedRows: z.number().int().nonnegative().optional(),
  limitations: z.array(z.string()).default([]),
}).passthrough()

export const driveCorpusEntry = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), name: z.string().max(2000), mimeType: z.string().max(250),
  parents: z.array(z.string()).default([]), driveId: z.string().optional(), size: z.string().optional(),
  version: z.string().optional(), md5Checksum: z.string().optional(), modifiedTime: driveCorpusTimestamp.optional(),
  ancestorPaths: z.array(z.array(z.string())).default([]), corporateScope: z.boolean().default(false),
  linkedClientIds: z.array(z.string()).default([]),
}).passthrough()
export type DriveCorpusEntry = z.infer<typeof driveCorpusEntry>
export const driveCorpusReceipt = z.object({
  version: z.literal(1), fileId: z.string(), fileVersion: z.string().nullish(), modifiedTime: driveCorpusTimestamp.nullish(),
  contentKey: z.string().nullish(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).nullish(),
  metadataRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  status: z.enum(['complete', 'partial', 'unsupported', 'failed', 'deferred']),
  characters: z.number().int().nonnegative().default(0), coverage: driveCorpusCoverage,
  finishedAt: driveCorpusTimestamp,
}).passthrough()
export type DriveCorpusReceipt = z.infer<typeof driveCorpusReceipt>
export type DriveCorpusReadState = 'pending' | 'complete' | 'partial' | 'failed' | 'unsupported' | 'changed' | 'deferred' | 'folder'

export function corpusRevision(entry: DriveCorpusEntry): string {
  return createHash('sha256').update(JSON.stringify([entry.id, entry.version || '', entry.modifiedTime || '', entry.md5Checksum || '', entry.mimeType])).digest('hex')
}
export function corpusHash(text: string): string { return createHash('sha256').update(text).digest('hex') }
export function corpusCategory(name: string, path: string): string {
  const value = `${path}/${name}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\.(pfx|p12|pem|key|exe|msi|dll)$/i.test(name)) return 'Acesso e arquivos técnicos'
  if (/contrat|cedula|aditivo|cpr\b|garantia|hipoteca/.test(value)) return 'Contratos e garantias'
  if (/propost|negociac|acordo|reneg/.test(value)) return 'Propostas e negociação'
  if (/irpf|irpj|fiscal|tribut|receita federal|declarac/.test(value)) return 'Fiscal e tributário'
  if (/extrato|boleto|pagamento|recebimento|fluxo|balanc|financeir|nota fiscal/.test(value)) return 'Financeiro'
  if (/matricula|imovel|propriedad|car\b|itr\b|ccir|safra|plantio|produt|agro/.test(value)) return 'Patrimônio e produção'
  if (/cpf|cnpj|identidade|pessoais|cadast|comprovante.*enderec/.test(value)) return 'Cadastro e identificação'
  if (/relatorio|parecer|laudo|dossie|diagnost/.test(value)) return 'Relatórios e análises'
  if (/modelo|template|instru|manual|procedimento|checklist/.test(value)) return 'Modelos e procedimentos'
  return 'A classificar'
}

/** Um cursor identifica arquivo, revisão e posição; uma fonte nova invalida a continuação. */
export function readCorpusPage(input: { fileId: string; revision: string; text: string; cursor?: string; maxChars?: number }) {
  const hash = corpusHash(input.text)
  const maxChars = Math.max(1000, Math.min(16000, Math.floor(input.maxChars || 12000)))
  let offset = 0
  if (input.cursor) {
    let decoded: unknown
    try { decoded = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) } catch { throw new Error('Cursor de leitura inválido.') }
    const cursor = z.object({ id: z.string(), revision: z.string(), hash: z.string(), offset: z.number().int().nonnegative() }).safeParse(decoded)
    if (!cursor.success || cursor.data.id !== input.fileId || cursor.data.revision !== input.revision || cursor.data.hash !== hash || cursor.data.offset > input.text.length) {
      throw new Error('O arquivo ou sua versão mudou. Reinicie a leitura para usar a fonte atual.')
    }
    offset = cursor.data.offset
  }
  const end = Math.min(input.text.length, offset + maxChars)
  return { text: input.text.slice(offset, end), range: { start: offset, end }, totalCharacters: input.text.length,
    sourceHash: hash, nextCursor: end < input.text.length ? Buffer.from(JSON.stringify({ id: input.fileId, revision: input.revision, hash, offset: end })).toString('base64url') : null,
    instruction: end < input.text.length ? 'Use nextCursor para continuar. Este trecho não representa a leitura integral.' : 'Fim do texto disponível. Confira a cobertura de extração antes de concluir sobre o arquivo completo.' }
}
