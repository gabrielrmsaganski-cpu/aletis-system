import { getAlixNotebookService } from '../notebook/AlixNotebookService.js'
import { getAlixGovernanceService } from './AlixGovernanceService.js'

export interface DossierRefreshInput {
  clienteId: string
  reason: string
  factIds?: number[]
}

export async function runDossierRefresh(input: DossierRefreshInput): Promise<{
  clienteId: string
  notebooks: number
  updated: number
  skipped: number
  failed: number
}> {
  const notebooks = await getAlixNotebookService().list({ clienteId: input.clienteId, limit: 50 })
  const governance = getAlixGovernanceService()
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const notebook of notebooks) {
    const latestByLineage = new Map<string, typeof notebook.artifacts[number]>()
    for (const artifact of notebook.artifacts.filter((item) => item.kind === 'dossie')) {
      const key = artifact.lineageId || artifact.id
      const current = latestByLineage.get(key)
      if (!current || artifact.version > current.version) latestByLineage.set(key, artifact)
    }
    for (const artifact of [...latestByLineage.values()].slice(0, 5)) {
      try {
        const revision = await getAlixNotebookService().updateArtifact(notebook.id, artifact.id, {
          researchWeb: false,
        })
        updated += 1
        await governance.recordDossierRefresh({
          clienteId: input.clienteId,
          notebookId: notebook.id,
          artifactId: revision.id,
          status: 'auto_executed',
          reason: `Dossiê versionado automaticamente: ${input.reason}`,
          details: {
            previousArtifactId: artifact.id,
            version: revision.version,
            factIds: input.factIds || [],
          },
        })
      } catch (error) {
        const message = (error as Error).message
        if (/Nenhuma fonte, comentário ou instrução nova/i.test(message)) {
          skipped += 1
          continue
        }
        failed += 1
        await governance.recordDossierRefresh({
          clienteId: input.clienteId,
          notebookId: notebook.id,
          status: 'failed',
          reason: `Falha ao atualizar dossiê: ${message}`,
          details: { baseArtifactId: artifact.id },
        })
      }
    }
  }
  return { clienteId: input.clienteId, notebooks: notebooks.length, updated, skipped, failed }
}
