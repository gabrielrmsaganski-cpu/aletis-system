import { z } from 'zod'
import { createHash } from 'node:crypto'
import { driveCorpusEntry, driveCorpusTimestamp, type DriveCorpusEntry } from './DriveCorpusTypes.js'

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)
export const driveChangesScopeSchema = z.object({
  tenantId: z.string().min(1).max(200),
  corporateRootIds: z.array(id),
  clientFolders: z.array(z.object({ folderId: id, clientId: z.string().min(1).max(200) })),
})
export type DriveChangesScope = z.infer<typeof driveChangesScopeSchema>

export const driveMetadataEventSchema = z.object({
  version: z.literal(1), eventId: z.string().regex(/^[a-f0-9]{64}$/), observedAt: driveCorpusTimestamp,
  kind: z.enum(['upsert', 'unavailable']), fileId: id,
  entry: driveCorpusEntry.optional(), reason: z.string().regex(/^[a-z_]{1,80}$/).optional(),
}).strict().superRefine((event, context) => {
  if (event.kind === 'upsert' && (!event.entry || event.entry.id !== event.fileId)) context.addIssue({ code: 'custom', message: 'Metadados não correspondem ao arquivo.' })
  if (event.kind === 'unavailable' && (event.entry || !event.reason)) context.addIssue({ code: 'custom', message: 'Indisponibilidade exige motivo e não publica fonte.' })
})
export type DriveMetadataEvent = z.infer<typeof driveMetadataEventSchema>

/** Congela a hierarquia publicada; replay parcial de uma pasta não altera o estado antigo dos filhos. */
export function driveChangesHierarchyFingerprint(entry: Pick<DriveCorpusEntry, 'id' | 'name' | 'ancestorPaths'>, name: (id: string) => string | undefined): string {
  const paths = [...entry.ancestorPaths].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return createHash('sha256').update(JSON.stringify(paths.map(chain => chain.map(id => [id, id === entry.id ? entry.name : name(id) || null])))).digest('hex')
}

export const driveChangesFileSchema = z.object({
  id, name: z.string().max(2000), mimeType: z.string().max(250),
  parents: z.array(id).default([]), driveId: id.optional(), size: z.string().optional(),
  version: z.string().optional(), md5Checksum: z.string().optional(), modifiedTime: driveCorpusTimestamp.optional(),
  trashed: z.boolean().optional(),
  // Arquivo ainda acessível que saiu de um corpus: exige consulta direta nos próximos scans.
  directAccessOnly: z.boolean().optional(),
})
export type DriveChangesFile = z.infer<typeof driveChangesFileSchema>
export interface DriveChangesCorpus { driveId?: string }
export interface DriveChangesPage {
  changes: Array<{ fileId?: string; driveId?: string; changeType?: 'file' | 'drive'; removed?: boolean; file?: DriveChangesFile }>
  nextPageToken?: string
  newStartPageToken?: string
}
export interface DriveChangesSource {
  listDrives(pageToken?: string): Promise<{ drives: Array<{ id: string }>; nextPageToken?: string }>
  getStartPageToken(corpus: DriveChangesCorpus): Promise<string>
  listFiles(corpus: DriveChangesCorpus, pageToken?: string): Promise<{ files: DriveChangesFile[]; nextPageToken?: string; incompleteSearch?: boolean }>
  listChanges(corpus: DriveChangesCorpus, pageToken: string): Promise<DriveChangesPage>
  getFile(fileId: string): Promise<DriveChangesFile>
}

export type DriveChangesFailureCode = 'AUTH_REQUIRED' | 'ACCOUNT_MISMATCH' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'CURSOR_EXPIRED' | 'QUOTA' | 'TEMPORARILY_UNAVAILABLE' | 'SERVER_CONFIGURATION' | 'INCOMPLETE_SEARCH' | 'INVALID_SOURCE' | 'REPEATED_PAGE' | 'CORPORA_CHANGED' | 'STATE_INVALID' | 'BUSY' | 'IO_ERROR'
export class DriveChangesError extends Error {
  constructor(public readonly code: DriveChangesFailureCode) { super(code) }
}
export interface DriveChangesProgress {
  version: 1
  status: 'awaiting_authorization' | 'reconciling' | 'watching' | 'retry'
  updatedAt: string
  lastSuccessfulSyncAt: string | null
  counts: { knownEntries: number; availableEntries: number; journalEvents: number; pagesRead: number; sharedDrives: number }
  errorCode?: DriveChangesFailureCode
}
export interface DriveChangesRecord {
  entry: DriveCorpusEntry
  available: boolean
  reason?: string
  lastEventId?: string
}
export const driveChangesCheckpointSchema = z.object({
  version: z.literal(1), tenantId: z.string(), mode: z.enum(['reconciling', 'watching']),
  cursors: z.array(z.object({ driveId: id.optional(), pageToken: z.string().min(1).max(20000) })),
  scope: driveChangesScopeSchema,
  journalBytes: z.number().int().nonnegative(), journalEvents: z.number().int().nonnegative(),
  lastObservedAt: driveCorpusTimestamp,
  lastSuccessfulSyncAt: driveCorpusTimestamp.nullable(), lastReconciledAt: driveCorpusTimestamp.nullable(),
  baseline: z.object({ size: z.number().nonnegative(), mtimeMs: z.number().nonnegative() }),
})
export type DriveChangesCheckpoint = z.infer<typeof driveChangesCheckpointSchema>
