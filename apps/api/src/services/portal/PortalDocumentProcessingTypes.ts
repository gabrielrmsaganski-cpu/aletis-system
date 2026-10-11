import { z } from 'zod'

const jobRef = z.object({ queue: z.string(), jobId: z.string(), statusUrl: z.string().optional() })
export const portalRequestContextSchema = z.object({
  id: z.string().min(1), clienteId: z.string().min(1), titulo: z.string().max(300),
  descricao: z.string().max(8_000).nullable().optional(), tipoDocumento: z.string().max(150).nullable().optional(),
  categoria: z.string().max(100).nullable().optional(),
}).strict()
export type PortalRequestContext = z.infer<typeof portalRequestContextSchema>
export const portalAnalysisSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'needs_review', 'failed']).default('pending'),
  documentId: z.string().optional(), sessionId: z.string().optional(),
  pipelineRunId: z.string().optional(), pipelineJob: jobRef.optional(), deepJob: jobRef.optional(),
  progress: z.number().min(0).max(100).optional(), errorCode: z.string().optional(),
  attempts: z.number().int().nonnegative().optional(),
  pipelineAttempts: z.number().int().nonnegative().optional(), deepAttempts: z.number().int().nonnegative().optional(),
  startedAt: z.string().optional(), completedAt: z.string().optional(), updatedAt: z.string().optional(),
  nextAttemptAt: z.string().datetime().optional(),
  coverage: z.record(z.unknown()).optional(),
  requestContext: portalRequestContextSchema.optional(), focusHash: z.string().optional(),
  requestAssessment: z.object({ status: z.enum(['compatible', 'mismatch', 'not_confirmed']), expected: z.string(), detected: z.string().optional(), reason: z.string() }).optional(),
}).passthrough()
export const portalDriveSchema = z.object({
  status: z.enum(['pending', 'processing', 'archived', 'retry', 'blocked']).default('pending'),
  fileId: z.string().optional(), url: z.string().optional(), folderId: z.string().optional(),
  folderName: z.string().optional(), rootId: z.string().optional(), sha256: z.string().optional(),
  errorCode: z.string().optional(), attempts: z.number().int().nonnegative().optional(),
  updatedAt: z.string().optional(), archivedAt: z.string().optional(),
  nextAttemptAt: z.string().datetime().optional(),
}).passthrough()
export const portalProcessingSchema = z.object({
  analysis: portalAnalysisSchema.default({ status: 'pending' }),
  drive: portalDriveSchema.default({ status: 'pending' }),
}).passthrough()

export type PortalAnalysisState = z.infer<typeof portalAnalysisSchema>
export type PortalDriveState = z.infer<typeof portalDriveSchema>
export type PortalProcessingState = z.infer<typeof portalProcessingSchema>
export interface PortalProcessingInput { uploadId: string; clienteId: string }
export interface PortalProcessingUpload {
  id: string; clienteId: string; nomeOriginal: string; nomeStorage: string; mime: string
  tamanho: number; sha256: string | null; categoria?: string | null; metadata: Record<string, unknown>
  pendenciaId?: string | null; request?: PortalRequestContext
}
export interface PortalProcessingLease extends PortalProcessingInput { token: string; attempts: number }
export interface PortalDocumentJobStore {
  enabled(): boolean
  enqueue(input: PortalProcessingInput, resetFailed?: boolean, stage?: 'analise' | 'drive' | 'todas'): Promise<void>
  claim(): Promise<PortalProcessingLease | null>
  heartbeat(lease: PortalProcessingLease): Promise<boolean>
  load(input: PortalProcessingInput): Promise<PortalProcessingUpload | null>
  checkpoint(lease: PortalProcessingLease, patch: Record<string, unknown>): Promise<PortalProcessingUpload>
  finish(lease: PortalProcessingLease, outcome: { status: 'retry' | 'completed' | 'failed'; delayMs?: number; errorCode?: string }): Promise<void>
}

export class PortalProcessingError extends Error {
  readonly statusCode: number
  constructor(readonly code: string, readonly retryable = true) {
    super(code === 'UPLOAD_NOT_FOUND' ? 'Arquivo não encontrado para este cliente.'
      : code.includes('SCOPE_MISMATCH') ? 'O documento não corresponde ao contexto autorizado.'
        : code === 'LEASE_LOST' ? 'O processamento foi retomado por outro trabalhador. Atualize o status.'
          : !retryable ? 'O arquivo ou seu registro precisa de revisão antes de continuar.'
            : 'A etapa está temporariamente indisponível; o arquivo permanece preservado para nova tentativa.')
    this.name = 'PortalProcessingError'
    this.statusCode = code === 'UPLOAD_NOT_FOUND' ? 404
      : code.includes('SCOPE_MISMATCH') || code === 'LEASE_LOST' || code === 'JOB_SCOPE_MISMATCH' ? 409
        : !retryable ? 422 : 503
  }
}
export function processingState(metadata: Record<string, unknown>): PortalProcessingState {
  const parsed = portalProcessingSchema.safeParse(metadata.processing || {})
  if (!parsed.success) throw new PortalProcessingError('PROCESSING_METADATA_INVALID', false)
  return parsed.data
}
export function processingErrorCode(error: unknown, fallback: string): string {
  if (error instanceof PortalProcessingError) return error.code
  const known = new Set(['AUTH_REQUIRED', 'ACCOUNT_MISMATCH', 'SERVER_CONFIGURATION', 'PERMISSION_DENIED', 'TEMPORARILY_UNAVAILABLE'])
  const code = (error as { code?: string } | null)?.code
  return code && known.has(code) ? code : fallback
}
export function retryDelay(attempt: number): number { return Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.min(10, Math.max(0, attempt - 1))) }
