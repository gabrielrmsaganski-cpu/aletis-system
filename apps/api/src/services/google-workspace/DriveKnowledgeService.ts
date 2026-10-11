import { z } from 'zod'
import { getPool, isPgEnabled } from '../../db/client.js'
import { isMimeAllowed } from '../../lib/upload-validation.js'
import type { GoogleDriveClientFile } from './drive.js'
import type { GoogleWorkspaceActor } from './schemas.js'
import { MAX_DRIVE_IMPORT_BYTES } from './DriveImportReader.js'

const recordSchema = z.object({
  id: z.string(), session_id: z.string(), cliente_id: z.string().nullable(),
  filename: z.string(), source: z.record(z.unknown()),
  text_characters: z.coerce.number().int().nonnegative(),
  processing_state: z.string().nullable(), review_status: z.string().nullable(),
  extraction: z.unknown().nullable(), analysis: z.unknown().nullable(),
  updated_at: z.union([z.string(), z.date()]),
})
type KnowledgeRecord = z.infer<typeof recordSchema>
export interface DriveKnowledgeFile {
  fileId: string
  importability: 'supported' | 'unsupported' | 'too_large' | 'shortcut'
  freshness: 'not_imported' | 'current' | 'outdated' | 'unverified'
  documentId?: string
  sessionId?: string
  processingState?: string
  extractedCharacters: number
  extractionStatus: 'complete' | 'partial' | 'unknown' | 'unavailable'
  pendingPages?: number
  pendingRows?: number
  needsClientReview: boolean
  analysisRecorded: boolean
  analysisPendingSegments?: number
  instruction: string
}

export function driveFileImportability(file: GoogleDriveClientFile): DriveKnowledgeFile['importability'] {
  if (file.mimeType === 'application/vnd.google-apps.shortcut') return 'shortcut'
  if (file.sizeBytes && !/^\d+$/.test(file.sizeBytes)) return 'unsupported'
  if (file.sizeBytes && /^\d+$/.test(file.sizeBytes) && BigInt(file.sizeBytes) > BigInt(MAX_DRIVE_IMPORT_BYTES)) return 'too_large'
  if (['application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.presentation'].includes(file.mimeType) || isMimeAllowed(file.mimeType)) return 'supported'
  return 'unsupported'
}

function freshness(file: GoogleDriveClientFile, source: KnowledgeRecord['source']): DriveKnowledgeFile['freshness'] {
  if (source.originalMimeType && source.originalMimeType !== file.mimeType) return 'outdated'
  if (file.version && source.version) return file.version === source.version ? 'current' : 'outdated'
  if (file.md5Checksum && source.md5Checksum) return file.md5Checksum === source.md5Checksum ? 'current' : 'outdated'
  if (file.modifiedAt && source.modifiedAt) return Date.parse(file.modifiedAt) === Date.parse(String(source.modifiedAt)) ? 'current' : 'outdated'
  return 'unverified'
}

/** Diagnóstico separa presença no Drive, importação, extração e revisão por IA. Não lê conteúdo nem promove dados ao CRM. */
export function projectDriveKnowledge(file: GoogleDriveClientFile, records: KnowledgeRecord[]): DriveKnowledgeFile {
  const importability = driveFileImportability(file)
  const selected = records.find(record => freshness(file, record.source) === 'current') || records[0]
  const base = { fileId: file.id, importability, extractedCharacters: 0, extractionStatus: 'unavailable' as const, needsClientReview: false, analysisRecorded: false }
  if (!selected) return { ...base, freshness: 'not_imported', instruction: importability === 'supported' ? 'Importar para leitura. A existência do arquivo no Drive não comprova que seu conteúdo foi lido.' : 'Este formato ou tamanho requer conversão/processamento específico. Atalhos não comprovam acesso ao destino.' }
  const current = freshness(file, selected.source)
  const extraction = z.object({ status: z.enum(['complete', 'partial', 'unknown']), pendingPages: z.array(z.unknown()).optional(), totalRows: z.number().optional(), extractedRows: z.number().optional() }).safeParse(selected.extraction)
  const analysis = z.object({ pendingSegments: z.array(z.unknown()) }).safeParse(selected.analysis)
  const extractionStatus = selected.text_characters ? (extraction.success ? extraction.data.status : 'unknown') : 'unavailable'
  return {
    ...base, freshness: current, documentId: selected.id, sessionId: selected.session_id,
    processingState: selected.processing_state || 'unknown', extractedCharacters: selected.text_characters,
    extractionStatus, needsClientReview: selected.review_status !== 'verified', analysisRecorded: analysis.success,
    ...(extraction.success && extraction.data.pendingPages ? { pendingPages: extraction.data.pendingPages.length } : {}),
    ...(extraction.success && extraction.data.totalRows != null && extraction.data.extractedRows != null ? { pendingRows: Math.max(0, extraction.data.totalRows - extraction.data.extractedRows) } : {}),
    ...(analysis.success && analysis.data.pendingSegments ? { analysisPendingSegments: analysis.data.pendingSegments.length } : {}),
    instruction: current === 'outdated' ? 'O Drive mudou. Importar a nova revisão preservando a anterior antes de usar estes dados.'
      : current === 'unverified' ? 'Não há revisão suficiente para comprovar atualização. Importar e conferir a versão atual.'
        : selected.review_status !== 'verified' ? 'Documento recebido; vínculo com o cliente aguarda revisão. Ler na sessão indicada sem promover fatos ao CRM.'
          : extractionStatus !== 'complete' ? 'Extração incompleta ou sem comprovante de cobertura. Concluir OCR/extração antes de concluir sobre o arquivo integral.'
            : 'Texto extraído disponível. Use leitura paginada e análise profunda com fontes; extração completa não comprova compreensão integral pela IA.',
  }
}

export class DriveKnowledgeService {
  constructor(private readonly dependencies?: { query: (sql: string, values: unknown[]) => Promise<{ rows: unknown[] }> }) {}

  async inspect(input: { actor: GoogleWorkspaceActor; clientId: string; files: GoogleDriveClientFile[] }) {
    const checkedAt = new Date().toISOString()
    if (!this.dependencies && !isPgEnabled()) return { source: 'unavailable' as const, checkedAt, files: [] as DriveKnowledgeFile[], totals: null, error: 'PostgreSQL indisponível; o estado da leitura não pôde ser confirmado.' }
    const groups = new Map<string, KnowledgeRecord[]>()
    const ids = [...new Set(input.files.map(file => file.id))]
    const admin = ['admin_master', 'admin', 'master'].includes(input.actor.role.toLowerCase())
    const query = this.dependencies?.query || ((sql: string, values: unknown[]) => getPool().query(sql, values))
    for (let offset = 0; offset < ids.length; offset += 300) {
      const result = await query(`
        select * from (
          select d.id, d.session_id, d.cliente_id, d.filename,
            d.payload->'metadata'->'source' as source,
            length(coalesce(d.payload->>'extractedText','')) as text_characters,
            d.payload->'metadata'->>'processingState' as processing_state,
            d.payload->'metadata'->'clientScopeReview'->>'status' as review_status,
            d.payload->'metadata'->'extractionCoverage' as extraction,
            d.payload->'metadata'->'deepAnalysis'->'analysis'->'readingCoverage' as analysis,
            d.updated_at,
            row_number() over (partition by d.payload->'metadata'->'source'->>'fileId' order by d.updated_at desc, d.id) as position
          from alix_document d join alix_session s on s.id=d.session_id
          where d.payload->'metadata'->'source'->>'type'='google_drive'
            and d.payload->'metadata'->'source'->>'fileId'=any($1::text[])
            and (d.cliente_id=$2 or (d.cliente_id is null and d.payload->'metadata'->'clientScopeReview'->>'requestedClienteId'=$2))
            and (s.cliente_id is null or s.cliente_id=$2)
            and ($4::boolean or s.consultor_id=$3)
            and (d.payload->'metadata'->'source'->>'tenantId' is null or d.payload->'metadata'->'source'->>'tenantId'=$5)
        ) scoped where position<=10 order by updated_at desc, id`, [ids.slice(offset, offset + 300), input.clientId, input.actor.userId, admin, input.actor.tenantId])
      for (const row of result.rows) {
        const record = recordSchema.parse(row)
        const fileId = String(record.source.fileId || '')
        groups.set(fileId, [...(groups.get(fileId) || []), record])
      }
    }
    const files = input.files.map(file => projectDriveKnowledge(file, groups.get(file.id) || []))
    return {
      source: 'postgresql' as const, checkedAt, files,
      totals: {
        inventoried: files.length, supported: files.filter(file => file.importability === 'supported').length,
        notImported: files.filter(file => file.freshness === 'not_imported').length,
        outdated: files.filter(file => file.freshness === 'outdated').length,
        unverified: files.filter(file => file.freshness === 'unverified').length,
        current: files.filter(file => file.freshness === 'current').length,
        extractionComplete: files.filter(file => file.freshness === 'current' && file.extractionStatus === 'complete').length,
        extractionPending: files.filter(file => file.documentId && file.extractionStatus !== 'complete').length,
        clientReviewPending: files.filter(file => file.needsClientReview).length,
      },
      instruction: 'Os totais se referem aos arquivos deste inventário. Inventário completo, texto extraído e compreensão por IA são estados diferentes; consultar cada cobertura antes de concluir.',
    }
  }
}

let singleton: DriveKnowledgeService | undefined
export function getDriveKnowledgeService() { return singleton ??= new DriveKnowledgeService() }
