import { createHash } from 'node:crypto'
import { z } from 'zod'
import { AlignmentType, Document, ExternalHyperlink, Footer, Header, HeadingLevel, PageNumber, Packer, Paragraph, TextRun } from 'docx'

// Verificação estrutural não equivale a certificação dos fatos ou parecer jurídico.
export const DOCUMENT_REVIEW_LIMIT = 'Rascunho com verificações automáticas. As fontes podem conter erros ou estar incompletas; conclusões e cálculos exigem validação do responsável antes do uso.'
const placeholder = /\b(undefined|null|lorem ipsum|TBD)\b|\{\{[^}]+\}\}|\[(?:inserir|preencher|nome do cliente|valor|data)\b[^\]]*\]/i
export const documentText = z.string().trim().min(1).max(12_000).refine(value => !placeholder.test(value) && !/\bTODO\b/.test(value), 'Remova campos vazios ou marcadores de preenchimento do documento.')
const reference = z.string().regex(/^F\d+$/)
export const groundedParagraphSchema = z.object({
  tipo: z.enum(['fato', 'analise', 'premissa']),
  texto: documentText,
  fontes: z.array(reference).max(12),
}).strict()
export const groundedDraftSchema = z.object({
  briefingId: z.string().uuid(),
  tipo: z.enum(['parecer', 'relatorio', 'dossie']),
  formato: z.enum(['pdf', 'docx']),
  titulo: documentText.pipe(z.string().max(180)),
  resumo: z.array(groundedParagraphSchema).min(1).max(5),
  secoes: z.array(z.object({ titulo: documentText.pipe(z.string().max(180)), paragrafos: z.array(groundedParagraphSchema).min(1).max(12) }).strict()).min(3).max(14),
  conclusao: z.array(groundedParagraphSchema).min(1).max(5),
  recomendacoes: z.array(z.object({
    prioridade: z.enum(['alta', 'media', 'baixa']),
    acao: documentText.pipe(z.string().max(1000)),
    justificativa: documentText.pipe(z.string().max(2000)),
    condicao: documentText.pipe(z.string().max(1000)),
    fontes: z.array(reference).min(1).max(12),
  }).strict()).min(1).max(15),
  lacunas: z.array(documentText.pipe(z.string().max(1000))).max(30),
}).strict()
export type GroundedDraft = z.infer<typeof groundedDraftSchema>
export type GroundedParagraph = z.infer<typeof groundedParagraphSchema>
export interface GroundedSource {
  id: string
  tipo: 'crm' | 'documento' | 'drive'
  documentoId?: string
  trechoId?: string
  nome: string
  trecho: string
  pagina?: number
  paginaFinal?: number
  aba?: string
  confidence?: number
  fileId?: string
  url?: string
  revision?: string
  quoteHash?: string
  sourceSha256?: string | null
  modifiedAt?: string | Date | null
  clienteId?: string | null
  readStatus?: 'complete' | 'partial'
  coverage?: Record<string, unknown>
  vinculo?: string
  hash: string
}
export interface GroundedBriefing {
  id: string
  sessionId: string
  clienteId?: string
  clienteNome: string
  objetivo: string
  createdAt: string
  expiresAt: string
  fontes: GroundedSource[]
  lacunas: string[]
  documentosNaoSelecionados: string[]
  coverage: Record<string, unknown>
  hash: string
}
export interface GroundedReview {
  status: 'verificado_automaticamente' | 'requer_correcao'
  observacoes: Array<{ paragrafo: string; motivo: string }>
  model?: string
  reviewedAt: string
  limitacao: string
}
export const hashDocumentValue = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export function draftParagraphs(draft: GroundedDraft): Array<{ id: string; tipo: string; texto: string; fontes: string[] }> {
  const cited = [...new Set([...draft.resumo, ...draft.secoes.flatMap(s => s.paragrafos), ...draft.conclusao, ...draft.recomendacoes].flatMap(p => p.fontes))]
  return [
    { id: 'titulo', tipo: 'editorial', texto: draft.titulo, fontes: cited },
    ...draft.secoes.map((s, index) => ({ id: `secoes.${index}.titulo`, tipo: 'editorial', texto: s.titulo, fontes: [...new Set(s.paragrafos.flatMap(p => p.fontes))] })),
    ...draft.resumo.map((p, index) => ({ id: `resumo.${index}`, ...p })),
    ...draft.secoes.flatMap((s, si) => s.paragrafos.map((p, pi) => ({ id: `secoes.${si}.${pi}`, ...p }))),
    ...draft.conclusao.map((p, index) => ({ id: `conclusao.${index}`, ...p })),
    ...draft.recomendacoes.map((r, index) => ({ id: `recomendacoes.${index}`, tipo: 'recomendacao', texto: `${r.acao}\n${r.justificativa}\nCondição: ${r.condicao}`, fontes: r.fontes })),
    ...draft.lacunas.map((gap, index) => ({ id: `lacunas.${index}`, tipo: 'lacuna', texto: gap, fontes: cited })),
  ]
}

export function validateGroundedDraft(draft: GroundedDraft, briefing: GroundedBriefing): void {
  if (draft.briefingId !== briefing.id) throw new Error('O rascunho pertence a outro briefing.')
  const ids = new Set(briefing.fontes.map(source => source.id))
  const paragraphs = draftParagraphs(draft)
  if (paragraphs.reduce((n, p) => n + p.texto.length, 0) > 60_000) throw new Error('Divida a entrega em documentos menores: limite de 60 mil caracteres por revisão.')
  for (const paragraph of paragraphs) {
    if (!['premissa', 'editorial', 'lacuna'].includes(paragraph.tipo) && !paragraph.fontes.length) throw new Error(`Informe a fonte de ${paragraph.id}; fatos, análises e recomendações precisam de evidência.`)
    if (paragraph.fontes.some(id => !ids.has(id))) throw new Error(`Fonte inexistente em ${paragraph.id}. Use somente os IDs do briefing.`)
    if (paragraph.tipo === 'premissa' && paragraph.fontes.length) throw new Error(`Separe premissa a validar de fatos documentados em ${paragraph.id}.`)
  }
  if (!paragraphs.some(p => p.tipo === 'fato')) throw new Error('Inclua pelo menos um fato documentado que sustente a análise.')
}

function e(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
const labels = { fato: 'Fato documentado', analise: 'Análise', premissa: 'Premissa a validar' }
// O modelo pode citar no próprio texto. Acrescente somente as referências que
// ainda faltam, sem retirar nem deslocar as citações já associadas às frases.
function markers(ids: string[], ...texts: string[]): string {
  const cited = new Set<string>()
  for (const text of texts) {
    for (const match of text.matchAll(/\[\s*F\d+(?:\s*[,;]?\s*F\d+)*\s*\]/g)) {
      for (const id of match[0].match(/F\d+/g) || []) cited.add(id)
    }
  }
  return [...new Set(ids)].filter(id => !cited.has(id)).map(id => `[${id}]`).join(' ')
}
const location = (source: GroundedSource) => source.pagina ? `página ${source.pagina}${source.paginaFinal && source.paginaFinal !== source.pagina ? ` a ${source.paginaFinal}` : ''}` : source.aba ? `aba ${source.aba}` : 'cadastro/trecho'
// Links de fontes Drive são derivados do ID verificado, nunca de HTML ou texto fornecido pelo modelo.
function driveSourceUrl(source: GroundedSource): string | undefined {
  return source.tipo === 'drive' && source.fileId && /^[A-Za-z0-9_-]{1,200}$/.test(source.fileId)
    ? `https://drive.google.com/file/d/${source.fileId}/view` : undefined
}
function sourceDetails(source: GroundedSource): string[] {
  if (source.tipo !== 'drive') return []
  const coverage = source.coverage || {}
  const details = [source.readStatus === 'partial' ? 'Extração parcial; há conteúdo pendente.' : 'Texto extraído disponível; esta entrega utiliza apenas os trechos selecionados.']
  if (typeof coverage.totalPages === 'number') details.push(`Páginas extraídas: ${Array.isArray(coverage.readablePages) ? coverage.readablePages.length : 'não informado'} de ${coverage.totalPages}.`)
  if (typeof coverage.totalRows === 'number') details.push(`Linhas extraídas: ${typeof coverage.extractedRows === 'number' ? coverage.extractedRows : 'não informado'} de ${coverage.totalRows}.`)
  for (const [key, label] of [['pendingPages', 'Páginas pendentes'], ['failedPages', 'Páginas com falha']] as const) {
    if (Array.isArray(coverage[key]) && coverage[key].length) details.push(`${label}: ${coverage[key].join(', ')}.`)
  }
  if (Array.isArray(coverage.limitations)) details.push(...coverage.limitations.filter((item): item is string => typeof item === 'string'))
  if (source.modifiedAt) {
    const date = new Date(source.modifiedAt)
    if (!Number.isNaN(date.getTime())) details.push(`Arquivo modificado em ${date.toISOString()}.`)
  }
  details.push(source.vinculo || 'Vínculo organizacional por pasta; titularidade e validade não confirmadas.')
  return details
}

export function renderGroundedDocumentHtml(draft: GroundedDraft, briefing: GroundedBriefing, review: GroundedReview): string {
  const citations = (ids: string[], ...texts: string[]) => { const missing = markers(ids, ...texts); return missing ? ` <sup>${missing}</sup>` : '' }
  const citedText = (text: string) => e(text).replace(/\[\s*F\d+(?:\s*[,;]?\s*F\d+)*\s*\]/g, '<span class="citation">$&</span>').replace(/\n/g, '<br>')
  const paragraph = (p: GroundedParagraph) => `<p><span class="label">${labels[p.tipo]}</span> ${citedText(p.texto)}${citations(p.fontes, p.texto)}</p>`
  const gaps = [...new Set([...briefing.lacunas, ...draft.lacunas])]
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${e(draft.titulo)}</title><style>
    @page { size:A4; margin:18mm 17mm 20mm; }
    body{font:11pt/1.4 Arial,sans-serif;color:#20352c;margin:0}
    header{border-bottom:3px solid #bb9558;padding-bottom:12px;margin-bottom:18px}.brand{letter-spacing:3px;font-weight:bold;font-size:20pt;color:#173a2b}
    h1{font:24pt/1.15 Georgia,serif;margin:12px 0}h2{font:16pt/1.3 Georgia,serif;border-bottom:1px solid #ddd4bf;padding-bottom:5px;margin:18px 0 9px;break-after:avoid-page}h3{font-size:11pt;margin:8px 0 4px;break-after:avoid-page}
    p{margin:0 0 9px;white-space:normal;overflow-wrap:anywhere;orphans:3;widows:3}sup{color:#725829;font-weight:bold}.citation{white-space:nowrap}.label{font-size:8pt;text-transform:uppercase;color:#6c755f;margin-right:6px}
    .summary{padding:12px;background:#f3f4ec;border-left:4px solid #bb9558}.summary p:last-child{margin-bottom:0}.draft{font-size:9pt;color:#63532f}
    .action{border-left:3px solid #bb9558;padding-left:12px;margin:12px 0;break-inside:avoid-page}.action p:last-child{margin-bottom:0}
    .limitations{break-inside:avoid-page}.limitations ul{margin:6px 0 0;padding-left:20px}.limitations li{margin:3px 0;break-inside:avoid-page}
    .sources{break-before:page;font-size:9pt;line-height:1.35}.source{padding:8px 0;border-bottom:1px solid #ddd;break-inside:avoid-page}.source-heading{font-size:9.5pt;margin:0 0 4px;break-after:avoid-page}.source-link{margin:3px 0}.source-details{margin:3px 0 5px}.quote{font-size:9pt;color:#4c5d52;white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}
    footer{font-size:8pt;line-height:1.35;margin-top:14px;border-top:1px solid #ddd;padding-top:8px;color:#687163;break-inside:avoid-page}
  </style></head><body><header><div class="brand">ALETIS</div><div>Finanças Estratégicas &amp; Agrobusiness</div><h1>${e(draft.titulo)}</h1><p>${e(briefing.clienteNome)} · ${new Date(briefing.createdAt).toLocaleDateString('pt-BR')} · versão 1</p><div class="draft">RASCUNHO · ${e(DOCUMENT_REVIEW_LIMIT)}</div></header>
  <p><strong>Objetivo:</strong> ${e(briefing.objetivo)}</p><h2>Síntese executiva</h2><div class="summary">${draft.resumo.map(paragraph).join('')}</div>
  ${draft.secoes.map((section, index) => `<h2>${index + 1}. ${e(section.titulo)}</h2>${section.paragrafos.map(paragraph).join('')}`).join('')}
  <h2>Conclusão</h2>${draft.conclusao.map(paragraph).join('')}<h2>Plano de ação recomendado</h2>${draft.recomendacoes.map((r, index) => `<div class="action"><h3>${index + 1}. ${citedText(r.acao)} <span class="label">Prioridade ${r.prioridade}</span></h3><p>${citedText(r.justificativa)}${citations(r.fontes, r.acao, r.justificativa, r.condicao)}</p><p><strong>Condição para avançar:</strong> ${citedText(r.condicao)}</p></div>`).join('')}
  <section class="limitations"><h2>Lacunas e limites da análise</h2>${gaps.length ? `<ul>${gaps.map(gap => `<li>${e(gap)}</li>`).join('')}</ul>` : '<p>Não foram declaradas lacunas adicionais. Isso não certifica a completude do acervo.</p>'}</section>
  <section class="sources"><h2>Fontes e rastreabilidade</h2><p>Foram utilizados os trechos abaixo. A seleção não equivale à leitura integral de todos os documentos.</p>${briefing.fontes.map(source => `<div class="source"><p class="source-heading"><strong>[${source.id}] ${e(source.nome)}</strong> · ${e(location(source))}${source.confidence !== undefined ? ` · confiança da extração ${Math.round(source.confidence * 100)}%` : ''}</p>${driveSourceUrl(source) ? `<p class="source-link"><a href="${e(driveSourceUrl(source)!)}">${e(driveSourceUrl(source)!)}</a></p>` : ''}${sourceDetails(source).length ? `<p class="draft source-details">${sourceDetails(source).map(e).join(' ')}</p>` : ''}<div class="quote">${e(source.trecho)}</div></div>`).join('')}</section>
  <footer>Rascunho ALIX · Revisão automática em ${e(review.reviewedAt)} · Briefing ${briefing.hash.slice(0, 16)}<br>${e(review.limitacao)}</footer></body></html>`
}

export async function renderGroundedDocumentDocx(draft: GroundedDraft, briefing: GroundedBriefing, review: GroundedReview): Promise<Buffer> {
  const heading = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 150 }, children: [new TextRun({ text, bold: true, color: '173A2B' })] })
  const text = (value: string) => new Paragraph({ spacing: { after: 140, line: 320 }, children: value.split('\n').flatMap((line, index) => [new TextRun({ text: line, ...(index ? { break: 1 } : {}) })]) })
  const paragraph = (p: GroundedParagraph) => text(`${labels[p.tipo]}: ${p.texto} ${markers(p.fontes, p.texto)}`.trimEnd())
  const gaps = [...new Set([...briefing.lacunas, ...draft.lacunas])]
  const doc = new Document({
    creator: 'ALETIS', title: draft.titulo, description: 'Rascunho ALIX com fontes e revisão automática',
    styles: { default: { document: { run: { font: 'Calibri', size: 22, color: '20352C' } } } },
    sections: [{
      properties: { page: { margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } },
      headers: { default: new Header({ children: [text('ALETIS · Finanças Estratégicas & Agrobusiness')] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'RASCUNHO · ALIX · Página ', size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16 })] })] }) },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: draft.titulo, bold: true, color: '173A2B', size: 38 })] }),
        text(`${briefing.clienteNome} · ${new Date(briefing.createdAt).toLocaleDateString('pt-BR')} · versão 1`),
        text(`RASCUNHO. ${DOCUMENT_REVIEW_LIMIT}`), text(`Objetivo: ${briefing.objetivo}`),
        heading('Síntese executiva'), ...draft.resumo.map(paragraph),
        ...draft.secoes.flatMap((s, index) => [heading(`${index + 1}. ${s.titulo}`), ...s.paragrafos.map(paragraph)]),
        heading('Conclusão'), ...draft.conclusao.map(paragraph), heading('Plano de ação recomendado'),
        ...draft.recomendacoes.flatMap((r, index) => [text(`${index + 1}. ${r.acao} — prioridade ${r.prioridade}`), text(`${r.justificativa} ${markers(r.fontes, r.acao, r.justificativa, r.condicao)}`.trimEnd()), text(`Condição para avançar: ${r.condicao}`)]),
        heading('Lacunas e limites da análise'), ...(gaps.length ? gaps : ['Não foram declaradas lacunas adicionais. Isso não certifica a completude do acervo.']).map(text),
        new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun('Fontes e rastreabilidade')] }),
        text('Foram utilizados os trechos abaixo. A seleção não equivale à leitura integral de todos os documentos.'),
        ...briefing.fontes.flatMap(source => [text(`[${source.id}] ${source.nome} · ${location(source)}`),
          ...(driveSourceUrl(source) ? [new Paragraph({ spacing: { after: 140 }, children: [new ExternalHyperlink({ link: driveSourceUrl(source)!, children: [new TextRun({ text: driveSourceUrl(source)!, style: 'Hyperlink' })] })] })] : []),
          ...sourceDetails(source).map(text), text(source.trecho)]),
        heading('Verificações automáticas'), text(`Revisão em ${review.reviewedAt}. ${review.limitacao}`), text(`Identificador do briefing: ${briefing.hash}`),
      ],
    }],
  })
  return Buffer.from(await Packer.toBuffer(doc))
}
