// ============================================================
// Exportações profissionais do ALIX Notebook em PDF e DOCX.
// ============================================================

import {
  AlignmentType,
  BorderStyle,
  Bookmark,
  Document,
  Footer,
  Header,
  HeadingLevel,
  InternalHyperlink,
  ExternalHyperlink,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

import { renderHtmlToPdfBuffer } from '../generators/PdfGenerator.js'
import { renderNotebookArtifactHtml } from './AlixNotebookHtmlRenderer.js'
import type { AlixNotebook, NotebookArtifact } from './AlixNotebookService.js'
import { NOTEBOOK_EXPORT_NOTICE, notebookCitationAnchor, notebookCitationUrl, verifiedNotebookCitations } from './NotebookCitationIntegrity.js'

export type NotebookExportFormat = 'pdf' | 'docx'

export interface NotebookExportDocument {
  buffer: Buffer
  filename: string
  mimetype: string
}

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72) || 'documento_alix'
}

function cleanMarkdownText(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .trim()
}

function citationRuns(value: string, style: { bold?: boolean; color?: string } = {}): Array<TextRun | InternalHyperlink> {
  const text = cleanMarkdownText(value)
  const runs: Array<TextRun | InternalHyperlink> = []
  let offset = 0
  for (const match of text.matchAll(/`([^`]+)`|\[S(\d+)\]/gi)) {
    if (match.index! > offset) runs.push(new TextRun({ text: text.slice(offset, match.index), ...style }))
    if (match[1] !== undefined) runs.push(new TextRun({ text: match[1], font: 'Consolas', ...style }))
    else {
      const id = `S${match[2]}`
      runs.push(new InternalHyperlink({ anchor: notebookCitationAnchor(id), children: [new TextRun({ text: `[${id}]`, style: 'Hyperlink' })] }))
    }
    offset = match.index! + match[0].length
  }
  if (offset < text.length || !runs.length) runs.push(new TextRun({ text: text.slice(offset), ...style }))
  return runs
}

function markdownParagraphs(markdown: string): Paragraph[] {
  const output: Paragraph[] = []
  let inCodeBlock = false
  for (const rawLine of markdown.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim()
    if (/^```/.test(line)) { inCodeBlock = !inCodeBlock; continue }
    if (inCodeBlock) {
      output.push(new Paragraph({ children: [new TextRun({ text: rawLine, font: 'Consolas' })] }))
      continue
    }
    if (!line) {
      output.push(new Paragraph({ children: [new TextRun('')] }))
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length === 1
        ? HeadingLevel.HEADING_1
        : heading[1].length === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3
      output.push(new Paragraph({
        heading: level,
        spacing: { before: heading[1].length === 1 ? 320 : 240, after: 120 },
        children: citationRuns(heading[2], { bold: true, color: '17251B' }),
      }))
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    const ordered = line.match(/^\d+[.)]\s+(.+)$/)
    if (bullet || ordered) {
      output.push(new Paragraph({
        ...(bullet ? { bullet: { level: 0 } } : { numbering: { reference: 'aletis-numbering', level: 0 } }),
        spacing: { after: 100 },
        children: citationRuns((bullet || ordered)![1], { color: '253A2B' }),
      }))
      continue
    }
    output.push(new Paragraph({
      spacing: { after: 180, line: 330 },
      children: citationRuns(line, { color: '253A2B' }),
    }))
  }
  return output
}

function sourceParagraphs(artifact: NotebookArtifact): Paragraph[] {
  const citations = verifiedNotebookCitations(artifact)
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
      children: [new TextRun({ text: 'Fontes e rastreabilidade', bold: true, color: '17251B' })],
    }),
    new Paragraph({
      children: [new TextRun({
        text: citations.length ? 'As citações no texto levam aos trechos utilizados abaixo.' : 'Nenhuma referência documental foi registrada nesta versão.',
        italics: true,
        color: '5C6D5E',
      })],
    }),
    ...citations.flatMap(citation => {
      const url = notebookCitationUrl(citation)
      return [new Paragraph({ spacing: { before: 200, after: 100 }, keepNext: true, children: [
        new Bookmark({ id: notebookCitationAnchor(citation.id), children: [new TextRun({ text: `[${citation.id}] ${citation.filename}`, bold: true, color: '436249' })] }),
        new TextRun({ text: [citation.page ? `página ${citation.page}` : '', citation.sheet ? `aba ${citation.sheet}` : '', citation.source].filter(Boolean).map(value => ` · ${value}`).join(''), color: '667468' }),
      ] }),
      ...(url ? [new Paragraph({ children: [new ExternalHyperlink({ link: url, children: [new TextRun({ text: 'Abrir fonte original', style: 'Hyperlink' })] })] })] : []),
      ...citation.quote.replace(/\r/g, '').split('\n').map(line => new Paragraph({ spacing: { after: 100 }, indent: { left: 250 }, children: [new TextRun({ text: line, italics: true, color: '536357' })] })),
      ]
    }),
  ]
}

async function renderDocx(notebook: AlixNotebook, artifact: NotebookArtifact): Promise<Buffer> {
  const brandHeader = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: 'CB9D52' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [new TableRow({
      children: [new TableCell({
        shading: { fill: '17251B' },
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'ALETIS', bold: true, color: 'E3BD80', size: 28 }),
            new TextRun({ text: '  ·  ALIX Notebook', color: 'FFFFFF', size: 18 }),
          ],
        })],
      })],
    })],
  })
  const emittedAt = new Date(artifact.createdAt).toLocaleDateString('pt-BR')
  const doc = new Document({
    creator: 'ALETIS Finanças Estratégicas & Agrobusiness',
    title: artifact.title,
    subject: notebook.title,
    description: `${artifact.kind} · versão ${artifact.version} · ALIX Notebook`,
    numbering: {
      config: [{
        reference: 'aletis-numbering',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT }],
      }],
    },
    styles: {
      default: { document: { run: { font: 'Aptos', size: 22, color: '253A2B' } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Georgia', size: 34, bold: true, color: '17251B' } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Georgia', size: 28, bold: true, color: '2D4732' } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, color: '436249' } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1_100, right: 1_200, bottom: 1_100, left: 1_200 } } },
      headers: { default: new Header({ children: [brandHeader] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `Confidencial · ${notebook.title} · v${artifact.version} · Página `, size: 16, color: '6B7D6F' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '6B7D6F' }),
          new TextRun({ text: ' de ', size: 16, color: '6B7D6F' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '6B7D6F' }),
        ],
      })] }) },
      children: [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { before: 500, after: 180 },
          children: [new TextRun({ text: artifact.title, bold: true, color: '17251B', size: 42 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 420 },
          children: [new TextRun({ text: `${notebook.title} · ${emittedAt} · versão ${artifact.version}`, italics: true, color: '667468' })],
        }),
        new Paragraph({ spacing: { after: 260 }, children: [new TextRun({ text: NOTEBOOK_EXPORT_NOTICE, italics: true, color: '667468' })] }),
        ...markdownParagraphs(artifact.markdown),
        ...sourceParagraphs(artifact),
      ],
    }],
  })
  return Buffer.from(await Packer.toBuffer(doc))
}

export async function exportNotebookArtifact(
  notebook: AlixNotebook,
  artifact: NotebookArtifact,
  format: NotebookExportFormat,
): Promise<NotebookExportDocument> {
  verifiedNotebookCitations(artifact)
  const base = `${safeFilename(artifact.title)}_v${artifact.version}_aletis`
  if (format === 'pdf') {
    const rendered = renderNotebookArtifactHtml(notebook, artifact)
    return {
      buffer: await renderHtmlToPdfBuffer(rendered.html),
      filename: `${base}.pdf`,
      mimetype: 'application/pdf',
    }
  }
  return {
    buffer: await renderDocx(notebook, artifact),
    filename: `${base}.docx`,
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
}
