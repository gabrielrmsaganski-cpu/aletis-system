import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AlixNotebook, NotebookArtifact } from '../../src/services/alix/notebook/AlixNotebookService.js'

const fixture = vi.hoisted(() => ({ getArtifact: vi.fn(), pdf: vi.fn() }))
vi.mock('../../src/services/alix/notebook/AlixNotebookService.js', () => ({ getAlixNotebookService: () => ({ getArtifact: fixture.getArtifact }) }))
vi.mock('../../src/services/alix/generators/PdfGenerator.js', () => ({ renderHtmlToPdfBuffer: fixture.pdf }))
import routes from '../../src/routes/alix-notebooks.js'

const base = '/api/alix/notebooks/notebook-fixture/artifacts/artifact-fixture'
let app: FastifyInstance
let artifact: NotebookArtifact
beforeEach(async () => {
  fixture.getArtifact.mockReset(); fixture.pdf.mockReset()
  artifact = { id: 'artifact-fixture', lineageId: 'artifact-fixture', version: 1, kind: 'memoria', title: 'Memória sintética', markdown: '# Memória\n\nConferir vencimento [S1].', citations: [{ id: 'S1', documentId: 'doc-fixture', filename: 'Fonte sintética', source: 'pdf:p2:text', page: 2, quote: 'Prazo sintético para conferência.' }], createdAt: '2026-09-13T10:00:00Z' }
  const notebook: AlixNotebook = { id: 'notebook-fixture', title: 'Caso sintético', sourceScope: { includeCrm: false, includeDocuments: true, includeProposals: false, includeNegotiations: false, includeWeb: false, proposalIds: [], negotiationIds: [] }, sources: [], notes: [], artifacts: [artifact], comments: [], actions: [], createdAt: artifact.createdAt, updatedAt: artifact.createdAt }
  fixture.getArtifact.mockResolvedValue({ notebook, artifact })
  fixture.pdf.mockResolvedValue(Buffer.from('%PDF-synthetic'))
  vi.stubGlobal('fetch', () => { throw new Error('Rede proibida nesta suíte') })
  app = Fastify({ logger: false })
  await app.register(routes); await app.ready()
})
afterEach(async () => { await app.close(); vi.unstubAllGlobals() })

// O serviço é isolado para verificar o contrato HTTP dos exportadores reais.
// Esta suíte não registra o middleware de autenticação global do servidor.
describe('contrato de exportação de Notebook com citações verificadas', () => {
  it.each(['/html', '/export/pdf', '/export/docx'])('referência perdida retorna 422 útil em %s sem produzir arquivo', async suffix => {
    artifact.markdown += '\nConclusão sem fonte [S99].'
    const response = await app.inject({ url: base + suffix })
    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ success: false, code: 'NOTEBOOK_CITATION_INVALID', error: expect.stringContaining('[S99]') })
    expect(response.body).not.toContain('doc-fixture')
    expect(response.headers['content-disposition']).toBeUndefined()
    expect(fixture.pdf).not.toHaveBeenCalled()
  })
  it.each(['/html', '/export/pdf', '/export/docx'])('artefato válido responde como arquivo privado em %s', async suffix => {
    const response = await app.inject({ url: base + suffix })
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['content-disposition']).toMatch(/^(inline|attachment); filename=/)
    if (suffix === '/html') expect(response.body).toContain('href="#fonte_S1"')
    if (suffix === '/export/docx') expect(response.rawPayload.subarray(0, 2).toString()).toBe('PK')
    if (suffix === '/export/pdf') expect(fixture.pdf).toHaveBeenCalledWith(expect.stringContaining('Prazo sintético para conferência.'))
  })
  it('preserva 404 e valida formato antes da busca', async () => {
    fixture.getArtifact.mockResolvedValue(null)
    expect((await app.inject({ url: base + '/html' })).statusCode).toBe(404)
    expect((await app.inject({ url: base + '/export/pdf' })).statusCode).toBe(404)
    fixture.getArtifact.mockClear()
    expect((await app.inject({ url: base + '/export/exe' })).statusCode).toBe(400)
    expect(fixture.getArtifact).not.toHaveBeenCalled()
  })
  it('falha operacional permanece genérica sem expor detalhes do serviço', async () => {
    fixture.pdf.mockRejectedValue(new Error('/root/private/documento-cliente-b.pdf token=fixture-private'))
    const response = await app.inject({ url: base + '/export/pdf' })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ success: false, code: 'NOTEBOOK_EXPORT_ERROR', error: 'Não foi possível exportar o documento.' })
    expect(response.body).not.toMatch(/private|cliente-b|token/)
  })
})
