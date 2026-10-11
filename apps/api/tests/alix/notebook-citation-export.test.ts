import { beforeEach, describe, expect, it, vi } from 'vitest'
import PizZip from 'pizzip'
import type { AlixNotebook, NotebookArtifact } from '../../src/services/alix/notebook/AlixNotebookService.js'
const fixture = vi.hoisted(() => ({ pdf: vi.fn() }))
vi.mock('../../src/services/alix/generators/PdfGenerator.js', () => ({ renderHtmlToPdfBuffer: fixture.pdf }))
import { exportNotebookArtifact } from '../../src/services/alix/notebook/AlixNotebookExportService.js'
import { renderNotebookArtifactHtml } from '../../src/services/alix/notebook/AlixNotebookHtmlRenderer.js'
import { verifiedNotebookCitations } from '../../src/services/alix/notebook/NotebookCitationIntegrity.js'

function artifact(): NotebookArtifact {
  return { id: 'artifact-fixture', lineageId: 'artifact-fixture', version: 2, kind: 'parecer', title: 'Parecer sintético', markdown: '# Parecer sintético\n\nSíntese comprovada **[S1]**.\n\n## Obrigações\n\n- Conferir o vencimento [S1]\n- Conferir o regulamento [S2]',
    citations: [
      { id: 'S1', documentId: 'doc-fixture', filename: 'Contrato de exemplo.pdf', source: 'pdf:p12:text', page: 12, quote: 'A obrigação deve ser conferida no prazo descrito.\n' + 'Trecho documental preservado. '.repeat(45) + 'ULTIMA CLAUSULA INTEGRAL.' },
      { id: 'S2', documentId: 'web:fixture', filename: 'Referência pública', source: 'https://example.com/regulamento?versao=2', quote: 'Regulamento público sintético para conferência.' },
    ], createdAt: '2026-09-13T10:00:00Z' }
}
function notebook(source: NotebookArtifact): AlixNotebook {
  return { id: 'notebook-fixture', title: 'Caso sintético', sourceScope: { includeCrm: false, includeDocuments: true, includeProposals: false, includeNegotiations: false, includeWeb: false, proposalIds: [], negotiationIds: [] }, sources: [], notes: [], artifacts: [source], comments: [], actions: [], createdAt: source.createdAt, updatedAt: source.createdAt }
}
beforeEach(() => { fixture.pdf.mockReset(); fixture.pdf.mockResolvedValue(Buffer.from('%PDF-synthetic')) })

describe('exportação preserva e confere referências do Notebook', () => {
  it('HTML mantém ligações entre corpo e apêndice com trecho integral, página e URL', () => {
    const source = artifact()
    const { html } = renderNotebookArtifactHtml(notebook(source), source)
    expect(html).toContain('href="#fonte_S1"')
    expect(html).toContain('id="fonte_S1"')
    expect(html).toContain('página 12')
    expect(html).toContain('ULTIMA CLAUSULA INTEGRAL.')
    expect(html).toContain('href="https://example.com/regulamento?versao=2"')
    expect(html).toContain('Rascunho para revisão')
  })
  it('DOCX conserva marcadores no corpo, bookmarks, trecho final e link da fonte', async () => {
    const source = artifact()
    const output = await exportNotebookArtifact(notebook(source), source, 'docx')
    const zip = new PizZip(output.buffer)
    const xml = zip.file('word/document.xml')!.asText()
    expect(xml).toContain('w:anchor="fonte_S1"')
    expect(xml).toContain('w:name="fonte_S1"')
    expect(xml).toContain('[S1]')
    expect(xml).toContain('ULTIMA CLAUSULA INTEGRAL.')
    expect(xml).toContain('página 12')
    expect(zip.file('word/_rels/document.xml.rels')!.asText()).toContain('https://example.com/regulamento?versao=2')
  })
  it('PDF recebe o mesmo apêndice e marcadores do HTML verificado', async () => {
    const source = artifact()
    const output = await exportNotebookArtifact(notebook(source), source, 'pdf')
    expect(output.mimetype).toBe('application/pdf')
    expect(fixture.pdf).toHaveBeenCalledWith(expect.stringContaining('ULTIMA CLAUSULA INTEGRAL.'))
    expect(fixture.pdf).toHaveBeenCalledWith(expect.stringContaining('href="#fonte_S1"'))
  })
  it.each(['pdf', 'docx'] as const)('não exporta %s com referência inexistente', async format => {
    const source = artifact(); source.markdown += '\nConclusão sem fonte [S99].'
    await expect(exportNotebookArtifact(notebook(source), source, format)).rejects.toThrow('[S99]')
    expect(fixture.pdf).not.toHaveBeenCalled()
  })
  it('recusa também o placeholder explícito de fonte já perdida', () => {
    const source = artifact(); source.markdown += '\nConclusão [fonte não disponível].'
    expect(() => renderNotebookArtifactHtml(notebook(source), source)).toThrow('referência não disponível')
  })
  it('recusa marcador ambíguo e aceita duplicata materialmente idêntica', () => {
    const source = artifact(); source.citations.push({ ...source.citations[0] })
    expect(verifiedNotebookCitations(source)).toHaveLength(2)
    source.citations[2].quote = 'Trecho diferente'
    expect(() => verifiedNotebookCitations(source)).toThrow('fontes diferentes')
  })
  it('preserva fontes legadas sem marcadores no texto, explicitando limite de revisão', async () => {
    const source = artifact(); source.markdown = '# Nota sem citação\n\nConferir o caso.'; source.citations = []
    const { html } = renderNotebookArtifactHtml(notebook(source), source)
    expect(html).toContain('Nenhuma referência documental foi registrada')
    expect(html).not.toContain('O documento não possui conteúdo textual')
    expect((await exportNotebookArtifact(notebook(source), source, 'docx')).buffer.subarray(0, 2).toString()).toBe('PK')
  })
  it('citação literal dentro de código não vira referência nem bloqueia exportação', () => {
    const source = artifact(); source.markdown += '\nExemplo literal `[S999]`.'
    const { html } = renderNotebookArtifactHtml(notebook(source), source)
    expect(html).toContain('<code>[S999]</code>')
    expect(html).not.toContain('href="#fonte_S999"')
  })
  it('bloco de código conserva marcadores literais em HTML e Word', async () => {
    const source = artifact(); source.markdown = '# Exemplo\n\n```text\n[S999]\n```\n\nFonte efetiva [S1].'
    const { html } = renderNotebookArtifactHtml(notebook(source), source)
    expect(html).toContain('<pre><code>[S999]</code></pre>')
    expect(html).not.toContain('href="#fonte_S999"')
    const xml = new PizZip((await exportNotebookArtifact(notebook(source), source, 'docx')).buffer).file('word/document.xml')!.asText()
    expect(xml).toContain('[S999]')
    expect(xml).not.toContain('w:anchor="fonte_S999"')
    expect(xml).toContain('w:anchor="fonte_S1"')
  })
  it('escapa HTML das fontes e não cria link javascript', () => {
    const source = artifact(); source.citations[0].quote = '<img src=x onerror="alert(1)">'; source.citations[0].source = 'javascript:alert(1)'
    const { html } = renderNotebookArtifactHtml(notebook(source), source)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
    expect(html).not.toContain('href="javascript:')
  })
  it('referência sem trecho não ganha aparência de fonte comprovada', () => {
    const source = artifact(); source.citations[0].quote = ''
    expect(() => verifiedNotebookCitations(source)).toThrow('referência documental está incompleta')
  })
})
