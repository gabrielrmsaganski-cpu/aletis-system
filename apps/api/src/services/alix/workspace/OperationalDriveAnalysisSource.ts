import type { Pool } from 'pg'
import { getPool } from '../../../db/client.js'
import { getDriveCorpusAnalysisService } from '../intake/DriveCorpusAnalysisService.js'
import { analysisHash, driveAnalysisCandidate, driveExcerptContainsValue, type DriveAnalysisCandidate } from '../intake/DriveCorpusAnalysisTypes.js'
import type { OperationalDocumentaryRecord } from './OperationalDocumentarySource.js'

type CurrentAnalysis = Awaited<ReturnType<ReturnType<typeof getDriveCorpusAnalysisService>['listCurrent']>>[number]
type AnalysisListOptions = NonNullable<Parameters<ReturnType<typeof getDriveCorpusAnalysisService>['listCurrent']>[2]>
interface Dependencies {
  listCurrent: (tenantId: string, clienteIds: string[], options: AnalysisListOptions) => Promise<CurrentAnalysis[]>
  pool: Pick<Pool, 'query'>
}
const text = (value: unknown, max = 240) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const time = (value: unknown): string | undefined => {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
const statuses = new Set(['queued', 'scheduled', 'processing', 'review_ready', 'waiting_budget', 'paused', 'failed'])
const statusLabel: Record<string, string> = {
  queued: 'Análise aguardando continuação.', scheduled: 'Continuação na fila.', processing: 'Análise em andamento.',
  review_ready: 'Análise dos trechos disponíveis pronta para revisão.', waiting_budget: 'Continuação aguardando a próxima cota de processamento.',
  paused: 'Análise pausada; há trechos ou limites que precisam de revisão.', failed: 'A continuação encontrou uma falha; os candidatos já extraídos ainda exigem conferência.',
}

async function readAnalysisBatch(raw: CurrentAnalysis[], tenantId: string, clienteIds: string[], dependencies: Dependencies): Promise<OperationalDocumentaryRecord[]> {
  const allowed = new Set(clienteIds)
  const analyses = new Map<string, { row: CurrentAnalysis; candidates: DriveAnalysisCandidate[] }>()
  for (const row of raw) {
    if (!allowed.has(row.clienteId) || !statuses.has(row.status) || !['complete', 'partial'].includes(row.readingStatus)
      || !hash(row.id) || !hash(row.revision) || !hash(row.contentHash) || !/^[A-Za-z0-9_-]{1,200}$/.test(row.fileId)) continue
    const candidates = [...new Map((Array.isArray(row.candidates) ? row.candidates : []).flatMap(candidate => {
      const parsed = driveAnalysisCandidate.safeParse(candidate)
      if (!parsed.success || parsed.data.evidence.excerptHash !== analysisHash(parsed.data.evidence.excerpt)
        || !driveExcerptContainsValue(parsed.data.evidence.excerpt, parsed.data.value)) return []
      return [[parsed.data.id, parsed.data] as const]
    })).values()]
    if (!candidates.length) continue
    const key = analysisHash(JSON.stringify([tenantId, row.clienteId, row.fileId]))
    const previous = analyses.get(key)
    if (!previous || (time(row.updatedAt) || '') > (time(previous.row.updatedAt) || '')) analyses.set(key, { row, candidates })
  }
  const requests = [...analyses.values()].flatMap(({ row, candidates }) => candidates.map(candidate => ({ analysis_id: row.id, candidate_id: candidate.id,
    chunk_id: candidate.evidence.chunkId, revision: row.revision, content_hash: row.contentHash, quote_hash: candidate.evidence.quoteHash, excerpt: candidate.evidence.excerpt })))
  const proofs = new Map<string, { page?: number; sheet?: string }>()
  // Confere no banco somente os trechos candidatos, sem trazer o acervo inteiro
  // para a API. Cada lote limita o tamanho do parâmetro e da resposta.
  for (let offset = 0; offset < requests.length; offset += 250) {
    const verified = await dependencies.pool.query(`with requested as (
      select * from jsonb_to_recordset($3::jsonb) as item(analysis_id text, candidate_id text, chunk_id text, revision text, content_hash text, quote_hash text, excerpt text)
    ) select requested.analysis_id, requested.candidate_id, chunk.page, chunk.sheet
      from requested join alix_drive_analysis a on a.id = requested.analysis_id
      join alix_drive_corpus f on f.tenant_id = a.tenant_id and f.file_id = a.file_id
      join cliente client on client.id = a.cliente_id
      join alix_drive_corpus_chunk chunk on chunk.tenant_id = a.tenant_id and chunk.file_id = a.file_id and chunk.revision_key = a.revision_key and chunk.id = requested.chunk_id
      where a.tenant_id = $1 and a.cliente_id = any($2::text[]) and a.status <> 'superseded'
        and a.revision_key = requested.revision and a.content_hash = requested.content_hash
        and f.revision_key = a.revision_key and f.content_hash = a.content_hash and f.cliente_id = a.cliente_id
        and f.read_status in ('complete','partial') and coalesce(f.metadata->'availability'->>'status','available') = 'available'
        and coalesce(client.payload->'identityMerge'->>'status','') <> 'merged'
        and encode(sha256(convert_to(chunk.text, 'UTF8')), 'hex') = requested.quote_hash
        and position(requested.excerpt in chunk.text) > 0`, [tenantId, clienteIds, JSON.stringify(requests.slice(offset, offset + 250))])
    for (const proof of verified.rows) proofs.set(`${proof.analysis_id}:${proof.candidate_id}`, { page: Number.isInteger(proof.page) && proof.page > 0 ? proof.page : undefined, sheet: text(proof.sheet, 160) || undefined })
  }
  const records: OperationalDocumentaryRecord[] = []
  for (const [id, { row, candidates }] of analyses) {
    const valid = candidates.filter(candidate => proofs.has(`${row.id}:${candidate.id}`)).sort((a, b) => a.evidence.ordinal - b.evidence.ordinal || a.id.localeCompare(b.id))
    if (!valid.length) continue
    const first = valid[0]
    const proof = proofs.get(`${row.id}:${first.id}`)!
    const processed = Number.isInteger(row.processedChunks) && row.processedChunks >= 0 ? row.processedChunks : 0
    const total = Number.isInteger(row.totalChunks) && row.totalChunks > 0 ? row.totalChunks : null
    const availableCoverage = row.sourceCoverage && typeof row.sourceCoverage === 'object' ? row.sourceCoverage as Record<string, unknown> : {}
    const incomplete = row.readingStatus === 'partial' || availableCoverage.status !== 'complete' || !total || processed < total
    const description = [
      `${valid.length} candidato(s) com trecho conferido; ${processed} de ${total ?? '?'} trechos do texto disponível analisados.`,
      statusLabel[row.status], incomplete ? 'Cobertura parcial: ainda podem faltar trechos, páginas sem OCR ou conteúdo ilegível.' : 'A análise cobre o texto extraído disponível; a conferência dos dados pelo responsável continua pendente.',
      'A localização na pasta não confirma titularidade nem autoriza alteração no CRM.',
    ].join(' ')
    records.push({
      id: `drive:${id}`, clienteId: row.clienteId, kind: 'fact_review', status: 'open', severity: 'important',
      title: `Conferir dados · ${text(row.name, 195) || 'Documento do Drive'}`, description,
      nextAction: 'Conferir os candidatos deste documento: comparar titular e CPF/CNPJ, operação, natureza de cada valor e data-base com o CRM; preparar a revisão com fontes e apontar as lacunas antes de propor atualização.',
      source: { kind: 'drive_analysis', id: row.id, label: text(row.name) || 'Análise de documento do Drive', documentId: row.fileId,
        revision: row.revision, contentHash: row.contentHash, chunkId: first.evidence.chunkId, quoteHash: first.evidence.quoteHash,
        excerptHash: first.evidence.excerptHash, excerpt: first.evidence.excerpt, page: proof.page, sheet: proof.sheet, updatedAt: time(row.updatedAt) },
    })
  }
  return records
}

/** Uma prioridade por documento; o conteúdo continua sendo candidato até revisão explícita. */
export async function readOperationalDriveAnalysisSource(tenantId: string, clienteIds: string[], overrides: Partial<Dependencies> = {}): Promise<OperationalDocumentaryRecord[]> {
  if (!tenantId?.trim() || !clienteIds.length) return []
  const dependencies: Dependencies = { listCurrent: overrides.listCurrent || ((tenant, ids, options) => getDriveCorpusAnalysisService().listCurrent(tenant, ids, options)), pool: overrides.pool || getPool() }
  const records = new Map<string, OperationalDocumentaryRecord>()
  const batchSize = 100
  let afterId: string | undefined
  while (true) {
    const raw = await dependencies.listCurrent(tenantId, clienteIds, { limit: batchSize, reviewQueue: { afterId } })
    // Confere e descarta os payloads de cada lote antes da próxima consulta;
    // só os cartões projetados permanecem em memória até a resposta.
    for (const record of await readAnalysisBatch(raw, tenantId, clienteIds, dependencies)) {
      const previous = records.get(record.id)
      if (!previous || (record.source.updatedAt || '') > (previous.source.updatedAt || '')) records.set(record.id, record)
    }
    if (raw.length < batchSize) break
    const next = raw.at(-1)?.id
    if (!hash(next) || (afterId && next <= afterId)) throw new Error('DRIVE_REVIEW_CURSOR_NOT_ADVANCING')
    afterId = next
  }
  return [...records.values()]
}
