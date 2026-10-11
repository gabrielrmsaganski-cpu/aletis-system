import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { completeDocumentChunks } from '../../src/services/alix/intake/DocumentCorpus.js'
import { createDocumentReader, readDocumentPage } from '../../src/services/alix/intake/DocumentReadService.js'
import { DocumentIndexService } from '../../src/services/alix/intake/DocumentIndexService.js'
import { buildCanonicalRagChunks } from '../../src/services/alix/knowledge/RagKnowledgeService.js'
import { chooseBestParsed } from '../../src/services/alix/intake/DocumentIntakeService.js'
import type { IngestedDocument } from '../../src/services/alix/intake/types.js'
import { preparationRegistry } from '../../src/services/alix/tools/PreparationPolicy.js'
import { buildToolDiscovery } from '../../src/services/alix/tools/ToolDiscovery.js'

const document = (overrides: Partial<IngestedDocument> = {}): IngestedDocument => ({
  id: 'document-fixture', sessionId: 'session-fixture', filename: 'documento-sintetico.txt', kind: 'text',
  mimetype: 'text/plain', sizeBytes: 100, uploadedAt: '2026-09-07T00:00:00Z', extractedText: 'Fonte sintética.', metadata: {}, ...overrides,
})

describe('Leitura sem perda de trechos', () => {
  it('complementa chunks do parser com texto adicional recuperado e mantém página', () => {
    const doc = document({ extractedText: 'Trecho original. Aditivo recuperado por OCR: vencimento 2031.',
      chunks: [{ id: 'page-1', ordinal: 0, text: 'Trecho original.', kind: 'text', source: 'pdf:p1', pageStart: 1, evidenceIds: [] }] })
    const chunks = completeDocumentChunks(doc)
    expect(chunks[0]).toMatchObject({ id: 'page-1', pageStart: 1 })
    expect(chunks.map(c => c.text).join(' ')).toContain('vencimento 2031')
    expect(completeDocumentChunks(doc)).toEqual(chunks)
    expect(buildCanonicalRagChunks(doc as unknown as Record<string, unknown>).map(c => c.text).join(' ')).toContain('vencimento 2031')
  })

  it('encontra no índice trecho final que não estava nos chunks antigos', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alix-complete-index-'))
    try {
      const doc = document({ extractedText: 'Início. Cláusula final: seguro extraordinário obrigatório.',
        chunks: [{ id: 'first', ordinal: 0, kind: 'text', text: 'Início.', source: 'text:first', evidenceIds: [] }] })
      const index = new DocumentIndexService(directory)
      await index.indexDocument(doc)
      const hits = await index.search({ sessionId: doc.sessionId, query: 'seguro extraordinário' })
      expect(hits[0].text).toContain('seguro extraordinário obrigatório')
      expect(await index.search({ sessionId: 'outra-sessao', query: 'seguro' })).toEqual([])
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('não usa entidade derivada para cobrir trecho original', () => {
    const chunks = completeDocumentChunks(document({ extractedText: 'Fato confirmado na fonte.', chunks: [
      { id: 'entity', ordinal: 0, kind: 'entity', text: 'Inferência não confirmada.', source: 'entity', evidenceIds: [] },
    ] }))
    expect(chunks.map(c => c.text).join('')).toBe('Fato confirmado na fonte.')
  })

  it('preserva texto nativo que o parser adicional omitiu', () => {
    const parsed = chooseBestParsed({ kind: 'pdf', extractedText: 'Obrigação nativa exclusiva.' },
      { kind: 'pdf', extractedText: 'Texto OCR complementar.'.repeat(80) })
    expect(parsed.extractedText).toContain('Obrigação nativa exclusiva.')
    expect(parsed.extractedText).toContain('Texto OCR complementar.')
  })

  it('percorre documento maior que 100 mil caracteres sem perder o final', () => {
    const doc = document({ extractedText: `${'Cláusula financeira sintética. '.repeat(6000)}SENTINELA_FINAL_2038` })
    const reader = createDocumentReader()
    let page = reader(doc, { maxChars: 16000 })
    const texts = [page.extractedText]
    expect(page.readingProgress.allExtractedTextDelivered).toBe(false)
    expect(JSON.stringify(page).length).toBeLessThan(60000)
    while (page.nextCursor) { page = reader(doc, { cursor: page.nextCursor, maxChars: 16000 }); texts.push(page.extractedText) }
    expect(texts.join('')).toContain('SENTINELA_FINAL_2038')
    expect(page.readingProgress.allExtractedTextDelivered).toBe(true)
    expect(page.readingProgress.deliveredCharacters).toBe(page.coverage.totalCharacters)
  })

  it('cursor antigo não mistura versões e cursor de outro documento é recusado', () => {
    const doc = document({ extractedText: 'conteúdo '.repeat(6000) })
    const cursor = readDocumentPage(doc).nextCursor!
    expect(() => readDocumentPage({ ...doc, extractedText: doc.extractedText + ' alteração' }, { cursor })).toThrow(/leitura mudou/)
    expect(() => readDocumentPage({ ...doc, id: 'outro' }, { cursor })).toThrow(/leitura mudou/)
    expect(() => readDocumentPage(doc, { cursor: 'malformado' })).toThrow(/cursor/)
  })

  it('ir ao fim ou reler o início não declara todas as partes lidas', () => {
    const doc = document({ extractedText: 'texto completo '.repeat(2500) })
    const first = readDocumentPage(doc)
    const reader = createDocumentReader()
    const page = reader(doc, { cursor: first.nextCursor! })
    expect(page.readingProgress.allExtractedTextDelivered).toBe(false)
    const repeated = reader(doc, { cursor: first.nextCursor! })
    expect(repeated.readingProgress.deliveredCharacters).toBe(page.readingProgress.deliveredCharacters)
  })

  it('fim dos trechos não oculta páginas que ainda precisam de OCR', () => {
    const doc = document({ kind: 'pdf', pageCount: 2, metadata: { extractionCoverage: {
      status: 'partial', totalPages: 2, readablePages: [1], pendingPages: [2], failedPages: [], limitations: ['Página 2 pendente de OCR.'],
    } } })
    const page = readDocumentPage(doc)
    expect(page.nextCursor).toBeNull()
    expect(page.coverage.extraction.status).toBe('partial')
    expect(page.coverage.extraction.pendingPages).toEqual([2])
    expect(page.instruction).toContain('não comprova leitura integral')
  })
})

describe('Prioridade operacional: análise e preparo', () => {
  it('recusa delegação para cliente diferente antes de executar a ferramenta', async () => {
    const handler = vi.fn()
    const registry = preparationRegistry({ delegate_deal_analyzer: { spec: { name: 'delegate_deal_analyzer', description: '', input_schema: { type: 'object' } }, handler } }, 'cliente-a')
    expect(await registry.delegate_deal_analyzer.handler({ clienteId: 'cliente-b' })).toMatchObject({ code: 'PREPARATION_CLIENT_MISMATCH' })
    expect(handler).not.toHaveBeenCalled()
  })
  it('catálogo e discovery excluem escrita e envio, mantendo leitura e artefatos', async () => {
    const names = ['buscar_cliente', 'gerar_documento_fundamentado', 'enviar_email', 'atualizar_proposta', 'delegate_crm_writer']
    const catalog = Object.fromEntries(names.map(name => [name, { spec: { name, description: name, input_schema: { type: 'object' } }, handler: vi.fn() }]))
    const filtered = preparationRegistry(catalog)
    expect(Object.keys(filtered)).toEqual(['buscar_cliente', 'gerar_documento_fundamentado'])
    const discovery = buildToolDiscovery(filtered)
    const output = await discovery.registry.executar_ferramenta_descoberta.handler({ nome: 'enviar_email', argumentosJson: '{}' })
    expect(output).toMatchObject({ ok: false })
    expect(catalog.enviar_email.handler).not.toHaveBeenCalled()
  })
})
