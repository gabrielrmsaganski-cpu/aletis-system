import { closeDb } from '../src/db/client.js'
import { AI_JOB_QUEUES, getAiJobQueueService } from '../src/services/alix/jobs/AiJobQueueService.js'
import { getFactLedgerStats } from '../src/services/alix/knowledge/FactLedgerService.js'
import { getRagKnowledgeStats } from '../src/services/alix/knowledge/RagKnowledgeService.js'
import { getDocumentPipelineService } from '../src/services/alix/intake/DocumentPipelineService.js'

const includeSessionDocuments = process.argv.includes('--include-session-documents')
const force = process.argv.includes('--force')
const monitorOnly = process.argv.includes('--monitor-only')
const timeoutMinutesArg = process.argv.find((arg) => arg.startsWith('--timeout-minutes='))
const timeoutMinutes = Math.max(5, Number(timeoutMinutesArg?.split('=')[1] || 90))

const logger = {
  info(data: unknown, message?: string) { console.log(message || '[info]', JSON.stringify(data)) },
  warn(data: unknown, message?: string) { console.warn(message || '[warn]', JSON.stringify(data)) },
  error(data: unknown, message?: string) { console.error(message || '[error]', JSON.stringify(data)) },
}

async function main(): Promise<void> {
  const queue = getAiJobQueueService()
  await queue.start(logger)
  if (!monitorOnly) {
    const backfill = await queue.enqueueBackfill({ includeSessionDocuments, force })
    console.log(JSON.stringify({ event: 'backfill_enqueued', ...backfill, includeSessionDocuments, force }))
  } else {
    console.log(JSON.stringify({ event: 'backfill_monitor_started', includeSessionDocuments }))
  }

  const deadline = Date.now() + timeoutMinutes * 60_000
  let settledCycles = 0
  while (Date.now() < deadline) {
    const status = await queue.status() as {
      ready?: boolean
      queues?: Array<{ name: string; ready: number; active: number; failed: number; total: number }>
    }
    const tracked = (status.queues || []).filter((item) => [
      AI_JOB_QUEUES.backfill,
      AI_JOB_QUEUES.ragIndex,
      AI_JOB_QUEUES.factExtract,
      AI_JOB_QUEUES.documentPipeline,
    ].includes(item.name as typeof AI_JOB_QUEUES.backfill))
    const pending = tracked.reduce((sum, item) => sum + item.ready + item.active, 0)
    const failed = tracked.reduce((sum, item) => sum + item.failed, 0)
    const [rag, facts] = await Promise.all([getRagKnowledgeStats(), getFactLedgerStats()])
    console.log(JSON.stringify({ event: 'backfill_progress', pending, failed, queues: tracked, rag, facts }))
    if (pending === 0) settledCycles += 1
    else settledCycles = 0
    if (settledCycles >= 3) {
      if (failed > 0 || Number(rag.failedDocuments || 0) > 0) {
        throw new Error(`Backfill terminou com falhas (jobs=${failed}, documentos=${rag.failedDocuments || 0})`)
      }
      const expectedDocuments = includeSessionDocuments
        ? Number(rag.sourceDocuments || 0)
        : Number(rag.clientDocuments || 0)
      if (Number(rag.indexedDocuments || 0) < expectedDocuments) {
        throw new Error(`Backfill incompleto (${rag.indexedDocuments || 0}/${expectedDocuments} documentos indexados)`)
      }
      const pipeline = await getDocumentPipelineService().stats()
      if (Number(pipeline.completedDocuments || 0) < expectedDocuments) {
        throw new Error(`Esteira documental incompleta (${pipeline.completedDocuments || 0}/${expectedDocuments} documentos processados)`)
      }
      console.log(JSON.stringify({ event: 'backfill_complete', rag, facts, pipeline }))
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000))
  }
  throw new Error(`Backfill excedeu o limite de ${timeoutMinutes} minutos`)
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ event: 'backfill_failed', error: (error as Error).message }))
    process.exitCode = 1
  })
  .finally(async () => {
    await getAiJobQueueService().stop().catch(() => undefined)
    await closeDb().catch(() => undefined)
  })
