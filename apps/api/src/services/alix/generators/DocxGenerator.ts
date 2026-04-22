// ============================================================
// ALETIS — Alix DOCX Generator (Wave 9-GENERATE)
// Memória de Cálculo editável — biblioteca `docx`
// ============================================================

import {
  Document,
  Paragraph,
  TextRun,
  Packer,
  HeadingLevel,
  AlignmentType,
  Footer,
  Header,
  PageNumber,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';

import type { MemoriaInput } from './types.js';

/** Renders a DOCX buffer for the Memória de Cálculo input. */
export async function renderMemoriaCalculoDocxBuffer(
  input: MemoriaInput,
): Promise<Buffer> {
  const consultor = input.consultor ?? 'Christian Kohler';
  const dataEmissao = input.dataEmissao ?? new Date().toLocaleDateString('pt-BR');

  const premissasParagraphs: Paragraph[] =
    input.premissas.length > 0
      ? input.premissas.map(
          (p) =>
            new Paragraph({
              bullet: { level: 0 },
              children: [new TextRun({ text: p })],
            }),
        )
      : [new Paragraph({ children: [new TextRun({ text: 'Nenhuma premissa informada.' })] })];

  const itensBlocks: Paragraph[] = input.itens.flatMap((item) => {
    const blocks: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [
          new TextRun({ text: item.titulo, bold: true, color: '0B2942' }),
        ],
      }),
      new Paragraph({
        children: [new TextRun({ text: item.descricao })],
      }),
    ];
    if (item.formula) {
      blocks.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Fórmula: ${item.formula}`,
              font: 'Courier New',
              color: '2D6A4F',
            }),
          ],
        }),
      );
    }
    if (item.resultado) {
      blocks.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Resultado: ', bold: true }),
            new TextRun({ text: item.resultado, color: '2D6A4F', bold: true }),
          ],
        }),
      );
    }
    blocks.push(new Paragraph({ children: [new TextRun('')] }));
    return blocks;
  });

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 8, color: '2D6A4F' },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: '2D6A4F' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: '0B2942' },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: 'ALETIS CONSULTORIA AGRO — Christian Kohler',
                    bold: true,
                    color: 'FFFFFF',
                    size: 22,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: 'Memória de Cálculo',
                    italics: true,
                    color: 'FFFFFF',
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: 'ALETIS Consultoria Agro',
    title: input.titulo,
    description: `Memória de cálculo emitida para ${input.clienteNome}`,
    styles: {
      default: {
        document: {
          run: { font: 'Georgia', size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({ children: [headerTable] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `ALETIS Consultoria Agro — Emitido em ${dataEmissao} — Página `,
                    size: 16,
                    color: '666666',
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '666666' }),
                  new TextRun({ text: ' de ', size: 16, color: '666666' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '666666' }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: input.titulo,
                bold: true,
                color: '0B2942',
                size: 36,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${input.clienteNome} — ${dataEmissao}`,
                italics: true,
                color: '2D6A4F',
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun('')] }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: '1. Premissas', color: '0B2942', bold: true })],
          }),
          ...premissasParagraphs,
          new Paragraph({ children: [new TextRun('')] }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: '2. Itens de Cálculo', color: '0B2942', bold: true })],
          }),
          ...itensBlocks,
          new Paragraph({ children: [new TextRun('')] }),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: '3. Conclusão', color: '0B2942', bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: input.conclusao ?? 'Conclusão a ser elaborada pelo consultor responsável.',
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun('')] }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `Consultor responsável: ${consultor}`, italics: true }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
