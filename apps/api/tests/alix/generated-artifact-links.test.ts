import { describe, expect, it } from 'vitest'
import { normalizeGeneratedArtifactLinks } from '../../src/services/alix/reliability/generatedArtifactLinks.js'
import type { ExecutionEvidence } from '../../src/services/alix/reliability/executionGrounding.js'

const id = '5887ed2c-660e-40ad-8969-ecd6676dcfba'
const url = `/api/alix/documents/generated/${id}`
const document = { id, kind: 'pdf', filename: 'relatorio-fixture.pdf', sizeBytes: 75846, downloadUrl: url }
const generated = (result: unknown = { ok: true, status: 'rascunho', document }): ExecutionEvidence => ({ tool: 'gerar_documento_fundamentado', result })
const evidence: ExecutionEvidence[] = [{ tool: 'delegate_doc_generator', result: { status: 'completed', toolEvidence: [generated()] } }]

describe('links de arquivos comprovadamente emitidos', () => {
  it('converte sandbox cru em Markdown e preserva todo o texto restante', () => {
    expect(normalizeGeneratedArtifactLinks(`Rascunho disponível.\n\nDownload: sandbox:${url}\n\nConfira as fontes.`, evidence))
      .toBe(`Rascunho disponível.\n\nDownload: [Baixar PDF](${url})\n\nConfira as fontes.`)
  })
  it('corrige somente destino sandbox do Markdown e preserva label, título e formatação', () => {
    expect(normalizeGeneratedArtifactLinks(`**Download:** [Relatório — conferência](sandbox:${url} "Rascunho")`, evidence))
      .toBe(`**Download:** [Relatório — conferência](${url} "Rascunho")`)
    expect(normalizeGeneratedArtifactLinks(`[sandbox:${url}](sandbox:${url})`, evidence)).toBe(`[sandbox:${url}](${url})`)
  })
  it('mantém Markdown já válido e a transformação é idempotente', () => {
    const text = `**Arquivo:** [Baixar o relatório](${url}).`
    expect(normalizeGeneratedArtifactLinks(text, evidence)).toBe(text)
    const normalized = normalizeGeneratedArtifactLinks(`Arquivo: ${url}.`, evidence)
    expect(normalized).toBe(`Arquivo: [Baixar PDF](${url}).`)
    expect(normalizeGeneratedArtifactLinks(normalized, evidence)).toBe(normalized)
  })
  it.each([`\`sandbox:${url}\``, `<sandbox:${url}>`])('remove invólucro não clicável de URL comprovada: %s', token => {
    expect(normalizeGeneratedArtifactLinks(token, evidence)).toBe(`[Baixar PDF](${url})`)
  })
  it('não cria link por ID inventado, resumo, parâmetros, artefatos do agente ou fonte documental', () => {
    const text = `sandbox:${url}`
    for (const unverified of [
      [],
      [{ tool: 'delegate_doc_generator', result: { summary: text, artifacts: [{ url }], input: { document } } }],
      [{ tool: 'pesquisar_conteudo_drive', result: { ok: true, document } }],
      [generated({ document })],
      [generated({ ok: true, status: 'rascunho', document: { id, downloadUrl: url } })],
      [generated({ ok: true, status: 'rascunho', document: { ...document, id: 'different-id' } })],
    ]) expect(normalizeGeneratedArtifactLinks(text, unverified)).toBe(text)
    expect(normalizeGeneratedArtifactLinks('sandbox:/api/alix/documents/generated/invented-id', evidence))
      .toBe('sandbox:/api/alix/documents/generated/invented-id')
  })
  it.each([
    { ok: false, document }, { ok: true, pendingConfirmation: true, document },
    { ok: true, documentGenerated: false, document }, { ok: true, queued: true, document },
    { ok: true, document: { ...document, sizeBytes: 0 } },
    { ok: true, document: { ...document, downloadUrl: `https://example.org${url}` } },
  ])('falha, preparo ou documento incoerente não comprovam emissão', result => {
    expect(normalizeGeneratedArtifactLinks(`sandbox:${url}`, [generated({ status: 'rascunho', ...result })])).toBe(`sandbox:${url}`)
  })
  it('aceita o recibo legado em metadata.document e ignora erro nesse envelope', () => {
    const legacy = { tool: 'gerar_memoria_calculo_docx', result: { metadata: { document: { ...document, kind: 'docx' } } } }
    expect(normalizeGeneratedArtifactLinks(url, [legacy])).toBe(`[Baixar DOCX](${url})`)
    expect(normalizeGeneratedArtifactLinks(url, [{ ...legacy, result: { metadata: { error: true, document } } }])).toBe(url)
  })
  it.each([`https://example.org${url}`, `sandbox:${url}/outro`, `sandbox:${url}?id=outro`, `sandbox:${url}.pdf`, `sandbox:${url}-inventado`])('não normaliza prefixo de outra URL: %s', text => {
    expect(normalizeGeneratedArtifactLinks(text, evidence)).toBe(text)
  })
})
