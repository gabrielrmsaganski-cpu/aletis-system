import { z } from 'zod'
import { driveCorpusEntry, driveCorpusTimestamp } from './DriveCorpusTypes.js'

/** Diário privado: não contém comandos, permissões concedidas ou credenciais. */
export const driveCorpusMetadataEvent = z.object({
  version: z.literal(1),
  eventId: z.string().regex(/^[A-Za-z0-9_:-]{1,200}$/),
  observedAt: driveCorpusTimestamp,
  kind: z.enum(['upsert', 'unavailable']),
  fileId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
  entry: driveCorpusEntry.optional(),
  reason: z.string().min(1).max(160).optional(),
}).strict().superRefine((event, context) => {
  if (event.kind === 'upsert' && (!event.entry || event.entry.id !== event.fileId)) {
    context.addIssue({ code: 'custom', message: 'O evento precisa dos metadados do mesmo arquivo.' })
  }
  if (event.kind === 'unavailable' && event.entry) {
    context.addIssue({ code: 'custom', message: 'Um arquivo indisponível não pode publicar conteúdo novo.' })
  }
})
export type DriveCorpusMetadataEvent = z.infer<typeof driveCorpusMetadataEvent>

export const driveIncrementalProgress = z.object({
  status: z.enum(['awaiting_authorization', 'reconciling', 'watching', 'retry']),
  updatedAt: driveCorpusTimestamp,
  lastSuccessfulSyncAt: driveCorpusTimestamp.nullish(),
  counts: z.object({
    knownEntries: z.number().int().nonnegative(),
    availableEntries: z.number().int().nonnegative(),
    journalEvents: z.number().int().nonnegative(),
    pagesRead: z.number().int().nonnegative(),
    sharedDrives: z.number().int().nonnegative(),
  }).partial().optional(),
  errorCode: z.string().regex(/^[A-Z0-9_]{1,100}$/).nullish(),
})
