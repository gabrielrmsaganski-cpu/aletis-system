/** Cobertura de documentos e disponibilidade do worker são estados distintos. */
export function knowledgeReadiness(rag: Record<string, number>, jobs: Record<string, unknown>) {
  const eligible = rag.clientDocuments || 0
  const indexed = rag.indexedClientDocuments || 0
  const withoutText = rag.clientDocumentsWithoutText || 0
  const consistent = eligible >= 0 && indexed >= 0 && indexed <= eligible
  const missing = consistent ? eligible - indexed : eligible
  const coveragePercent = eligible > 0 && consistent ? Math.round(indexed / eligible * 10_000) / 100 : 0
  const queues = Array.isArray(jobs.queues) ? jobs.queues as Array<Record<string, unknown>> : []
  const recoveryJobs = queues.reduce((sum, queue) => sum + (
    String(queue.name).includes('dead-letter')
      ? Number(queue.ready || 0) + Number(queue.active || 0) + Number(queue.failed || 0)
      : 0
  ), 0)
  const coverageState = !consistent ? 'inconsistent'
    : eligible === 0 ? (withoutText > 0 ? 'needs_extraction' : 'empty')
    : missing > 0 || withoutText > 0 ? 'partial' : 'complete'
  return {
    ready: Boolean(jobs.ready) && coverageState === 'complete' && recoveryJobs === 0 && (rag.failedDocuments || 0) === 0,
    infrastructureReady: Boolean(jobs.ready),
    coveragePercent,
    coverageState,
    coverageScope: 'client_documents_with_text',
    indexedClientDocuments: indexed,
    unindexedClientDocuments: missing,
    clientDocumentsWithoutText: withoutText,
    recoveryJobs,
  }
}
