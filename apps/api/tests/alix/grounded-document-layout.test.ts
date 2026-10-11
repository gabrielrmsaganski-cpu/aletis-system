import { afterAll, describe, expect, it } from 'vitest'
import PizZip from 'pizzip'
import { extractText } from 'unpdf'
import { closeBrowser, renderHtmlToPdfBuffer } from '../../src/services/alix/generators/PdfGenerator.js'
import { DOCUMENT_REVIEW_LIMIT, hashDocumentValue, renderGroundedDocumentDocx, renderGroundedDocumentHtml, type GroundedBriefing, type GroundedDraft, type GroundedReview } from '../../src/services/alix/generators/GroundedDocument.js'

const review: GroundedReview = { status: 'verificado_automaticamente', observacoes: [], reviewedAt: '2026-09-07T12:00:00Z', limitacao: DOCUMENT_REVIEW_LIMIT }
const quote = (id: number, repetitions: number) => `INICIO_FONTE_${id}. ${'O projeto sintético requer conciliar valores, áreas e cronograma com documentos vigentes antes de formalizar uma decisão. '.repeat(repetitions)}FIM_FONTE_${id}.`

function fixture(): { draft: GroundedDraft; briefing: GroundedBriefing } {
  const briefing: GroundedBriefing = {
    id: '11111111-1111-4111-8111-111111111111', sessionId: 'layout-fixture', clienteId: 'cliente-fixture', clienteNome: 'Cliente sintético',
    objetivo: 'Conferir orçamento, área e cronograma do projeto de custeio, sem afirmar contratação, aprovação ou liberação de crédito.',
    createdAt: '2026-09-07T11:00:00Z', expiresAt: '2026-09-07T11:30:00Z', hash: 'a'.repeat(64), documentosNaoSelecionados: [], coverage: {},
    fontes: [{ id: 'F1', tipo: 'crm', nome: 'Cadastro sintético do CRM', trecho: JSON.stringify({ id: 'cliente-fixture', nome: 'Cliente sintético', cidade: 'Cidade de teste', uf: 'TS', estagio: 'conferencia', consultor: 'Consultor sintético', credor: 'Instituição de teste', valorTotalDivida: '100.00', areaTotalHa: '20.00', culturas: [] }, null, 2), hash: 'b'.repeat(64) }, ...[2, 3].map(id => ({
      id: `F${id}`, tipo: 'drive' as const, nome: 'Projeto técnico sintético — conferência do custeio.pdf', trecho: quote(id, id === 2 ? 7 : 8), hash: 'c'.repeat(64),
      fileId: 'drive-layout-fixture', pagina: 1, readStatus: 'complete' as const, modifiedAt: '2026-08-25T12:00:00Z',
      coverage: { totalPages: 1, readablePages: [1], limitations: ['Cobertura textual e OCR não equivalem a interpretação visual de mapas, gráficos, fotografias ou assinaturas.'] },
      vinculo: 'Vínculo organizacional por pasta; titularidade e validade não confirmadas.',
    }))],
    lacunas: [
      'O cadastro do CRM é uma fonte operacional; não substitui os documentos comprobatórios.',
      'Projeto sintético: cobertura textual e OCR não equivalem a interpretação visual de mapas, gráficos, fotografias ou assinaturas.',
      'Vínculos de arquivos por pasta são organização, não prova de titularidade, autoria, assinatura válida ou situação financeira atual. Confirme o sujeito de cada trecho.',
      'A cobertura desta entrega corresponde aos trechos selecionados, sem certificação de leitura integral do acervo.',
    ],
  }
  const draft: GroundedDraft = {
    briefingId: briefing.id, tipo: 'relatorio', formato: 'pdf', titulo: 'Cliente sintético — conferência do custeio',
    resumo: [
      { tipo: 'fato', texto: 'O projeto técnico informa solicitação de R$ 100,00, orçamento de R$ 80,00 e área de 20 hectares. [F1, F2, F3]', fontes: ['F1', 'F2', 'F3'] },
      { tipo: 'analise', texto: 'A conferência aponta diferença aritmética de R$ 20,00 entre solicitação e orçamento, além de divergência entre a área do cabeçalho e o quadro de imóveis; ambas dependem de conciliação documental. [F2, F3]', fontes: ['F2', 'F3'] },
    ],
    secoes: [
      { titulo: 'Orçamento a conciliar', paragrafos: [{ tipo: 'analise', texto: 'O valor solicitado excede o orçamento do projeto. Essa diferença requer explicação e não demonstra prejuízo, saldo devedor ou desembolso comprovado; deve-se confrontar a versão do projeto e a composição das parcelas. [F2, F3]', fontes: ['F2', 'F3'] }] },
      { titulo: 'Área a confirmar', paragrafos: [{ tipo: 'analise', texto: 'O cabeçalho e o quadro imobiliário apresentam áreas distintas. A diferença exige conciliação de escopo e geometrias, sem concluir área efetivamente financiada, sobreposição ou titularidade. [F2, F3]', fontes: ['F2', 'F3'] }] },
      { titulo: 'Conferência antes do plantio', paragrafos: [
        { tipo: 'fato', texto: 'O projeto apresenta datas planejadas de plantio e colheita, que devem ser conferidas na documentação vigente. [F2]', fontes: ['F2'] },
        { tipo: 'analise', texto: 'Antes do início previsto, a decisão operacional depende de confirmar a versão do projeto, o enquadramento das áreas e a situação do crédito. Os trechos não comprovam aprovação bancária, contratação ou liberação de recursos. [F2, F3]', fontes: ['F2', 'F3'] },
      ] },
    ],
    conclusao: [{ tipo: 'analise', texto: 'O custeio deve permanecer em conferência até que orçamento, áreas e situação do crédito sejam conciliados em documentação vigente. [F2, F3]', fontes: ['F2', 'F3'] }],
    recomendacoes: [
      { prioridade: 'alta', acao: 'Conciliar a diferença de orçamento.', justificativa: 'O solicitado e o orçamento total divergem no projeto. [F2, F3]', condicao: 'Avançar somente após identificar a versão aplicável e justificar documentalmente a diferença. [F2, F3]', fontes: ['F2', 'F3'] },
      { prioridade: 'alta', acao: 'Validar o escopo geográfico das áreas.', justificativa: 'As áreas do cabeçalho e do quadro de imóveis divergem. [F2, F3]', condicao: 'Avançar somente após conferir polígonos, imóveis e enquadramento das áreas. [F2, F3]', fontes: ['F2', 'F3'] },
      { prioridade: 'alta', acao: 'Verificar a situação do crédito antes do plantio.', justificativa: 'Os trechos não comprovam contratação ou liberação de recursos. [F2]', condicao: 'Avançar somente após obter comprovação atual da versão enviada e da situação do crédito. [F2, F3]', fontes: ['F2', 'F3'] },
    ],
    lacunas: ['Versão efetivamente enviada e situação atual do crédito não comprovadas pelos trechos.'],
  }
  return { draft, briefing }
}

afterAll(async () => { await closeBrowser() })

describe('Apresentação dos documentos fundamentados', () => {
  it('não repete referências já escritas e acrescenta somente as que faltam, sem alterar o rascunho', () => {
    const { draft, briefing } = fixture()
    draft.resumo = [
      { tipo: 'fato', texto: 'Trecho com citação completa [F1, F2].', fontes: ['F1', 'F2', 'F2'] },
      { tipo: 'analise', texto: 'Trecho com citação parcial [F1].', fontes: ['F1', 'F2'] },
      { tipo: 'analise', texto: 'Texto literal [F10] e [F1A] <script>exemplo</script>.', fontes: ['F1'] },
    ]
    const original = hashDocumentValue(draft)
    const html = renderGroundedDocumentHtml(draft, briefing, review)
    const summary = html.match(/<div class="summary">([\s\S]*?)<\/div>/)![1]
    expect(summary).toContain('Trecho com citação completa <span class="citation">[F1, F2]</span>.</p>')
    expect(summary).toContain('Trecho com citação parcial <span class="citation">[F1]</span>. <sup>[F2]</sup>')
    expect(summary).toContain('&lt;script&gt;exemplo&lt;/script&gt;. <sup>[F1]</sup>')
    expect(summary).not.toContain('<script>')
    expect(summary).not.toContain('<sup>[F1] [F2]')
    expect(hashDocumentValue(draft)).toBe(original)
  })

  it('mantém citações de recomendações e DOCX sem criar uma segunda cópia da mesma referência', async () => {
    const { draft, briefing } = fixture()
    draft.resumo[0] = { tipo: 'fato', texto: 'Citação já registrada [F1; F2].', fontes: ['F1', 'F2'] }
    const html = renderGroundedDocumentHtml(draft, briefing, review)
    const actions = html.match(/<h2>Plano de ação recomendado<\/h2>([\s\S]*?)<section class="limitations">/)![1]
    expect(actions).not.toContain('<sup>')
    expect(actions).toContain('documentalmente a diferença. <span class="citation">[F2, F3]</span>')
    const zip = new PizZip(await renderGroundedDocumentDocx(draft, briefing, review))
    const xml = zip.file('word/document.xml')!.asText()
    const runs = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(match => match[1])
    expect(runs).toContain('Fato documentado: Citação já registrada [F1; F2].')
    expect(runs).toContain(draft.recomendacoes[0].justificativa)
    expect(xml).toContain('FIM_FONTE_3')
  })

  it('gera PDF executivo de até três páginas com limites juntos e cada fonte curta inteira', async () => {
    const { draft, briefing } = fixture()
    const pdf = await renderHtmlToPdfBuffer(renderGroundedDocumentHtml(draft, briefing, review))
    const result = await extractText(new Uint8Array(pdf), { mergePages: false })
    const pages = result.text
    expect(result.totalPages).toBeLessThanOrEqual(3)
    expect(result.totalPages).toBeGreaterThan(1)
    for (const id of [2, 3]) {
      expect(pages.filter(page => page.includes(`INICIO_FONTE_${id}`) && page.includes(`FIM_FONTE_${id}`))).toHaveLength(1)
    }
    const limits = pages.find(page => page.includes('Lacunas e limites da análise'))!
    expect(limits).toContain(draft.lacunas[0])
    expect(pages.join(' ')).toContain('Revisão automática')
    expect(pages.join(' ')).toContain('https://drive.google.com/file/d/drive-layout-fixture/view')
  }, 30_000)

  it('permite que evidência maior que uma página continue até o fim, sem corte para cumprir a meta', async () => {
    const { draft, briefing } = fixture()
    briefing.fontes[2].trecho = quote(3, 100)
    const pdf = await renderHtmlToPdfBuffer(renderGroundedDocumentHtml(draft, briefing, review))
    const result = await extractText(new Uint8Array(pdf), { mergePages: false })
    expect(result.totalPages).toBeGreaterThan(3)
    expect(result.text.join(' ')).toContain('FIM_FONTE_3')
    expect(result.text.at(-1)).toContain('Revisão automática')
  }, 30_000)
})
