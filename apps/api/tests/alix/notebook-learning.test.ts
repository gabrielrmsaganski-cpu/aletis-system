import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AlixNotebookService, type AlixNotebook, type NotebookArtifact } from '../../src/services/alix/notebook/AlixNotebookService.js'
import { exportNotebookArtifact } from '../../src/services/alix/notebook/AlixNotebookExportService.js'
import { FeedbackService } from '../../src/services/alix/learning/FeedbackService.js'
import { qualityCategory, qualitySeverity } from '../../src/services/alix/learning/QualityReviewService.js'

describe('ALIX Notebook vivo e aprendizado contínuo', () => {
  let storageDir: string
  let previousPg: string | undefined

  beforeEach(async () => {
    previousPg = process.env.ALETIS_PG_ENABLED
    process.env.ALETIS_PG_ENABLED = '0'
    storageDir = await mkdtemp(join(tmpdir(), 'aletis-notebook-learning-'))
  })

  afterEach(async () => {
    if (previousPg == null) delete process.env.ALETIS_PG_ENABLED
    else process.env.ALETIS_PG_ENABLED = previousPg
    await rm(storageDir, { recursive: true, force: true })
  })

  it('persiste seleção de fontes e comentários sem promovê-los a fatos', async () => {
    const service = new AlixNotebookService(storageDir)
    const created = await service.create({ title: 'Caso rural', objective: 'Preparar renegociação' })
    const scoped = await service.updateSourceScope(created.id, { includeWeb: false, includeProposals: false })
    const commented = await service.addComment(created.id, { text: 'Preservar a estrutura executiva.' })

    expect(scoped.sourceScope.includeWeb).toBe(false)
    expect(scoped.sourceScope.includeProposals).toBe(false)
    expect(commented.comments[0]).toMatchObject({ status: 'open', text: 'Preservar a estrutura executiva.' })
    const disk = JSON.parse(await readFile(join(storageDir, `${created.id}.json`), 'utf8')) as AlixNotebook
    expect(disk.sourceScope.includeWeb).toBe(false)
    expect(disk.comments[0].status).toBe('open')
  })

  it('exporta documento editável DOCX com versão e rastreabilidade', async () => {
    const artifact: NotebookArtifact = {
      id: 'artifact-1',
      lineageId: 'artifact-1',
      version: 1,
      kind: 'dossie',
      title: 'Dossiê executivo',
      markdown: '# Dossiê executivo\n\nSíntese [S1]\n\n## Próximas ações\n\n- Validar garantias [S1]',
      citations: [{ id: 'S1', documentId: 'doc-1', filename: 'Contrato', source: 'documento', quote: 'Trecho' }],
      createdAt: new Date().toISOString(),
    }
    const notebook: AlixNotebook = {
      id: 'notebook-1', title: 'Caso teste', objective: 'Teste',
      sourceScope: { includeCrm: true, includeDocuments: true, includeProposals: true, includeNegotiations: true, includeWeb: false, proposalIds: [], negotiationIds: [] },
      sources: [], notes: [], artifacts: [artifact], comments: [], actions: [],
      createdAt: artifact.createdAt, updatedAt: artifact.createdAt,
    }
    const output = await exportNotebookArtifact(notebook, artifact, 'docx')
    expect(output.mimetype).toContain('wordprocessingml')
    expect(output.filename).toContain('_v1_aletis.docx')
    expect(output.buffer.subarray(0, 2).toString()).toBe('PK')
  })

  it('registra feedback canônico e prioriza erros de cálculo', async () => {
    const feedback = new FeedbackService(storageDir)
    const recorded = await feedback.record({
      msgId: 'msg-1', sessionId: 'session-1', rating: 'incorreto', motivo: 'calculo',
      notas: 'O cálculo precisa ser refeito.', expectedCorrection: 'Recalcular com a taxa contratual.',
    })
    expect(recorded.feedbackId).toBeNull()
    expect(recorded.entry.rating).toBe('incorreto')
    expect(qualityCategory(recorded.entry)).toBe('calculo')
    expect(qualitySeverity(recorded.entry.motivo, recorded.entry.rating)).toBe('critical')
    expect(qualitySeverity('dado_ausente', 'incompleta')).toBe('high')
  })
})

