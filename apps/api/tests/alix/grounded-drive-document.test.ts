import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile, rm } from 'node:fs/promises'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import PizZip from 'pizzip'
import { extractText } from 'unpdf'
import { buildGroundedDocumentTools, type GroundedToolDependencies } from '../../src/services/alix/docs/grounded-document-tools.js'
import { corpusHash } from '../../src/services/google-workspace/DriveCorpusTypes.js'
import { DOCUMENT_REVIEW_LIMIT, renderGroundedDocumentHtml, type GroundedBriefing, type GroundedDraft, type GroundedReview } from '../../src/services/alix/generators/GroundedDocument.js'
import { DocumentGeneratorService, ALIX_OUTPUTS_META_DIR, loadGeneratedDocumentMeta } from '../../src/services/alix/generators/DocumentGeneratorService.js'
import { closeBrowser } from '../../src/services/alix/generators/PdfGenerator.js'
import type { GeneratedDocument } from '../../src/services/alix/generators/types.js'
import type { GoogleWorkspaceActor } from '../../src/services/google-workspace/schemas.js'

const actor: GoogleWorkspaceActor = { userId: 'owner-fixture', userName: 'Consultor sintético', role: 'consultor', tenantId: 'tenant-fixture' }
const client = { id: 'client-fixture', nome: 'Cliente sintético', valorTotalDivida: '1200.00' }
const text = 'A certidão de 02/06/2025 registra garantia histórica. Saldo bancário atual não foi demonstrado.'
const ref = { fileId: 'drive-file-fixture', chunkId: 'drive-chunk-fixture', revision: 'revision-fixture', quoteHash: corpusHash(text) }
const fixtureChunk = () => ({ ...ref, text, name: 'Certidão sintética.pdf', url: `https://drive.google.com/file/d/${ref.fileId}/view`, page: 3, sheet: undefined, clienteId: client.id as string | null, readStatus: 'partial' as 'complete' | 'partial', coverage: { status: 'partial', totalPages: 5, readablePages: [1, 3], pendingPages: [2, 4, 5], limitations: ['Páginas sem OCR ainda pendentes.'] }, modifiedAt: '2026-09-01T00:00:00Z', sourceSha256: 'a'.repeat(64) })
const review: GroundedReview = { status: 'verificado_automaticamente', observacoes: [], reviewedAt: '2026-09-07T00:00:00Z', limitacao: DOCUMENT_REVIEW_LIMIT }
const draft = (briefing: GroundedBriefing): GroundedDraft => {
  const id = briefing.fontes.find(source => source.tipo === 'drive')!.id
  return { briefingId: briefing.id, tipo: 'relatorio', formato: 'docx', titulo: 'Revisão documental das garantias', resumo: [{ tipo: 'fato', texto: 'A certidão registra garantia histórica.', fontes: [id] }],
    secoes: [{ titulo: 'Registro consultado', paragrafos: [{ tipo: 'fato', texto: 'A certidão se refere a 02/06/2025.', fontes: [id] }] }, { titulo: 'Posição financeira', paragrafos: [{ tipo: 'analise', texto: 'O registro não permite apurar o saldo atual.', fontes: [id] }] }, { titulo: 'Condições para decidir', paragrafos: [{ tipo: 'analise', texto: 'A posição bancária deve ser confirmada antes de decidir.', fontes: [id] }] }],
    conclusao: [{ tipo: 'analise', texto: 'É necessário conciliar a garantia histórica com documentos atuais.', fontes: [id] }], recomendacoes: [{ prioridade: 'alta', acao: 'Conferir posição bancária e eventual baixa da garantia', justificativa: 'O documento registra condição histórica.', condicao: 'Obter certidão e extrato atuais antes de formalizar proposta.', fontes: [id] }], lacunas: ['Saldo atual não apurado.'] }
}

describe('Drive como fonte direta de documentos fundamentados', () => {
  let chunk: ReturnType<typeof fixtureChunk>
  let loadDriveChunk: ReturnType<typeof vi.fn<GroundedToolDependencies['loadDriveChunk']>>
  let reviewFn: ReturnType<typeof vi.fn<GroundedToolDependencies['review']>>
  let persist: ReturnType<typeof vi.fn<GroundedToolDependencies['persist']>>
  const artifacts: GeneratedDocument[] = []
  beforeEach(() => {
    chunk = fixtureChunk()
    loadDriveChunk = vi.fn(async () => structuredClone(chunk))
    reviewFn = vi.fn(async () => structuredClone(review))
    persist = vi.fn(async () => ({ id: 'artifact-fixture', kind: 'docx', filename: 'revisao.docx', sizeBytes: 100, createdAt: '2026-09-07T00:00:00Z', path: '/private/fixture', downloadUrl: '/api/alix/documents/generated/artifact-fixture', mimetype: 'application/docx', clienteId: client.id, metadata: {} }))
  })
  afterEach(async () => {
    for (const artifact of artifacts.splice(0)) { await rm(artifact.path, { force: true }); await rm(join(ALIX_OUTPUTS_META_DIR, `${artifact.id}.json`), { force: true }) }
    await closeBrowser()
  })
  function setup(options: { actor?: GoogleWorkspaceActor; clienteId?: string } = { actor, clienteId: client.id }) {
    return buildGroundedDocumentTools({ sessionId: 'session-fixture', ...options }, { loadClient: async () => structuredClone(client), loadDocument: async () => null, loadDriveChunk, review: reviewFn, persist, now: () => new Date('2026-09-07T00:00:00Z') })
  }
  async function prepare(registry = setup().registry, trechosDrive = [ref]) {
    const result = await registry.preparar_briefing_documental.handler({ objetivo: 'Revisar garantias documentadas', trechosDrive }) as { ok: boolean; briefing: GroundedBriefing }
    expect(result.ok).toBe(true)
    return result.briefing
  }
  it('preserva texto, referência verificável e cobertura sem importar dados ao CRM', async () => {
    const briefing = await prepare()
    expect(loadDriveChunk).toHaveBeenCalledWith(actor, { ...ref, clienteId: client.id })
    expect(briefing.fontes[1]).toMatchObject({ tipo: 'drive', fileId: ref.fileId, trechoId: ref.chunkId, revision: ref.revision, quoteHash: ref.quoteHash, trecho: text, pagina: 3, readStatus: 'partial', url: chunk.url })
    expect(briefing.coverage[`drive:${ref.fileId}`]).toMatchObject({ selectedChunks: 1, selectedTextOnly: true, readStatus: 'partial' })
    expect(briefing.lacunas.join(' ')).toContain('Páginas sem OCR')
    expect(briefing.lacunas.join(' ')).toContain('titularidade')
    expect(briefing.lacunas.join(' ')).not.toContain('apenas no cadastro')
  })
  it('permite minuta só com Drive para ator autorizado sem inventar vínculo no CRM', async () => {
    chunk.clienteId = null
    const briefing = await prepare(setup({ actor }).registry)
    expect(briefing.fontes).toHaveLength(1); expect(briefing.clienteId).toBeUndefined()
    expect(briefing.fontes[0].tipo).toBe('drive')
  })
  it('nega falta de ator e rejeita identidade fornecida nos argumentos da ferramenta', async () => {
    expect(await setup({ clienteId: client.id }).registry.preparar_briefing_documental.handler({ objetivo: 'Análise', trechosDrive: [ref] })).toMatchObject({ ok: false })
    expect(loadDriveChunk).not.toHaveBeenCalled()
    expect(await setup().registry.preparar_briefing_documental.handler({ objetivo: 'Análise', trechosDrive: [ref], actor: { ...actor, role: 'admin' } })).toMatchObject({ ok: false })
    expect(loadDriveChunk).not.toHaveBeenCalled()
  })
  it('fixa identidade e tenant ao criar a delegação, sem permitir mutação externa', async () => {
    const mutableActor = { ...actor }; const { registry } = setup({ actor: mutableActor, clienteId: client.id })
    mutableActor.tenantId = 'other-tenant'; mutableActor.role = 'admin'
    await prepare(registry)
    expect(loadDriveChunk).toHaveBeenCalledWith(actor, expect.any(Object))
    expect(Object.isFrozen(loadDriveChunk.mock.calls[0][0])).toBe(true)
  })
  it.each(['other-client', null])('nega fonte de outro cliente ou sem vínculo no briefing ativo: %s', async clienteId => {
    chunk.clienteId = clienteId
    expect(await setup().registry.preparar_briefing_documental.handler({ objetivo: 'Análise', trechosDrive: [ref] })).toMatchObject({ ok: false, error: expect.stringContaining('cliente ativo') })
  })
  it.each(['text', 'revision', 'quoteHash', 'fileId', 'chunkId'])('rejeita retorno inconsistente mesmo que acesso seja autorizado: %s', async key => {
    Object.assign(chunk, { [key]: 'alterado' })
    expect(await setup().registry.preparar_briefing_documental.handler({ objetivo: 'Análise', trechosDrive: [ref] })).toMatchObject({ ok: false })
  })
  it('deduplica referências idênticas e rejeita versões concorrentes do mesmo trecho', async () => {
    const briefing = await prepare(setup().registry, [ref, ref])
    expect(briefing.fontes.filter(s => s.tipo === 'drive')).toHaveLength(1)
    expect(briefing.coverage[`drive:${ref.fileId}`]).toMatchObject({ selectedChunks: 1 })
    expect(await setup().registry.preparar_briefing_documental.handler({ objetivo: 'Análise', trechosDrive: [ref, { ...ref, revision: 'other' }] })).toMatchObject({ ok: false })
  })
  it('revalida permissão antes da revisão e recusa revogação', async () => {
    const { registry } = setup(); const briefing = await prepare(registry)
    loadDriveChunk.mockRejectedValue(new Error('Acesso ao acervo revogado'))
    expect(await registry.gerar_documento_fundamentado.handler(draft(briefing))).toMatchObject({ ok: false })
    expect(reviewFn).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled()
  })
  it('interrompe geração se a permissão mudar durante a revisão', async () => {
    const { registry } = setup(); const briefing = await prepare(registry)
    reviewFn.mockImplementation(async () => { loadDriveChunk.mockRejectedValue(new Error('Acesso revogado')); return review })
    expect(await registry.gerar_documento_fundamentado.handler(draft(briefing))).toMatchObject({ ok: false })
    expect(persist).not.toHaveBeenCalled()
  })
  it('interrompe geração se revisão/trecho mudarem durante a revisão', async () => {
    const { registry } = setup(); const briefing = await prepare(registry)
    reviewFn.mockImplementation(async () => { chunk.text += ' Novo aditivo.'; return review })
    expect(await registry.gerar_documento_fundamentado.handler(draft(briefing))).toMatchObject({ ok: false })
    expect(persist).not.toHaveBeenCalled()
  })
  it('não entrega resultado em cache quando a fonte ou permissão mudou', async () => {
    const { registry } = setup(); const briefing = await prepare(registry); const payload = draft(briefing)
    expect(await registry.gerar_documento_fundamentado.handler(payload)).toMatchObject({ ok: true })
    loadDriveChunk.mockRejectedValue(new Error('Permissão revogada após geração'))
    const result = await registry.gerar_documento_fundamentado.handler(payload)
    expect(result).toMatchObject({ ok: false, documentGenerated: false })
    expect(JSON.stringify(result)).not.toContain('downloadUrl'); expect(persist).toHaveBeenCalledTimes(1)
  })
  it('alteração da cobertura invalida briefing mesmo mantendo revisão e texto', async () => {
    const { registry } = setup(); const briefing = await prepare(registry)
    chunk.coverage.pendingPages = [2]
    expect(await registry.gerar_documento_fundamentado.handler(draft(briefing))).toMatchObject({ ok: false, error: expect.stringContaining('fontes mudaram') })
    expect(reviewFn).not.toHaveBeenCalled()
  })
  it('escapa HTML da fonte e deriva hyperlink apenas do fileId verificado', async () => {
    const briefing = await prepare(); briefing.fontes[1].url = 'javascript:alert(1)'; briefing.fontes[1].nome = '<img src="https://invalid.test">'
    const html = renderGroundedDocumentHtml(draft(briefing), briefing, review)
    expect(html).toContain(`href="${chunk.url}"`); expect(html).not.toContain('javascript:'); expect(html).not.toContain('<img')
    expect(html).toContain('Extração parcial'); expect(html).toContain('Páginas pendentes: 2, 4, 5')
  })
  it('gera DOCX real com hyperlink, fonte, cobertura e revisão persistidos', async () => {
    const briefing = await prepare(); const artifact = await DocumentGeneratorService.getInstance().generateGroundedDocument(draft(briefing), briefing, review, async () => { await loadDriveChunk(actor, { ...ref, clienteId: client.id }) }); artifacts.push(artifact)
    const zip = new PizZip(await readFile(artifact.path)); const xml = zip.file('word/document.xml')!.asText(); const rels = zip.file('word/_rels/document.xml.rels')!.asText()
    expect(xml).toContain('w:hyperlink'); expect(xml).toContain(chunk.url); expect(rels).toContain(chunk.url)
    expect(xml).toContain('Extração parcial'); expect(xml).toContain(text); expect(xml).toContain('página 3')
    const saved = await loadGeneratedDocumentMeta(artifact.id)
    expect(saved?.metadata.sources).toEqual(briefing.fontes)
    expect(saved?.metadata.coverage).toEqual(briefing.coverage)
  })
  it('gera PDF real com URL completa e limite de cobertura legíveis', async () => {
    const briefing = await prepare(); const payload = draft(briefing); payload.formato = 'pdf'
    const artifact = await DocumentGeneratorService.getInstance().generateGroundedDocument(payload, briefing, review, async () => { await loadDriveChunk(actor, { ...ref, clienteId: client.id }) }); artifacts.push(artifact)
    const pdf = await extractText(new Uint8Array(await readFile(artifact.path)), { mergePages: true })
    expect(pdf.text).toContain(chunk.url); expect(pdf.text).toContain('Extração parcial'); expect(pdf.text).toContain('Saldo bancário atual não foi demonstrado')
  })
  it('recusa emissão direta com fonte Drive sem guarda de revalidação', async () => {
    const briefing = await prepare()
    await expect(DocumentGeneratorService.getInstance().generateGroundedDocument(draft(briefing), briefing, review)).rejects.toThrow('revalidação')
  })
  it('a guarda após renderização pode impedir toda gravação do artefato e metadados', async () => {
    const briefing = await prepare(); const writes = vi.spyOn(fs, 'writeFile')
    const guard = vi.fn(async () => { throw new Error('Fonte revogada durante a renderização') })
    try {
      await expect(DocumentGeneratorService.getInstance().generateGroundedDocument(draft(briefing), briefing, review, guard)).rejects.toThrow('revogada')
      expect(guard).toHaveBeenCalledTimes(1); expect(writes).not.toHaveBeenCalled()
    } finally { writes.mockRestore() }
  })
  it('a ferramenta passa guarda que detecta revogação entre chamada do gerador e gravação', async () => {
    const { registry } = setup(); const briefing = await prepare(registry)
    persist.mockImplementation(async (_draft, _briefing, _review, beforePersist) => {
      loadDriveChunk.mockRejectedValue(new Error('Acesso revogado durante renderização'))
      await beforePersist!()
      throw new Error('Não deveria chegar à persistência')
    })
    expect(await registry.gerar_documento_fundamentado.handler(draft(briefing))).toMatchObject({ ok: false, error: expect.stringContaining('revogado durante renderização') })
  })

})
