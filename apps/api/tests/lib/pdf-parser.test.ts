/**
 * P2-13 — Migração de pdf-parse → pdfjs-dist.
 * Verifica que o parser ainda extrai texto e contagem de páginas
 * corretamente usando um PDF sintético gerado via pdf-lib (já dep da API).
 */
import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { parsePdf } from '../../src/services/alix/intake/PdfParser.js'

async function buildSyntheticPdf(text: string, pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([300, 200])
    page.drawText(`${text} — pg ${i + 1}`, { x: 30, y: 100, size: 14, font, color: rgb(0, 0, 0) })
  }
  const bytes = await doc.save()
  return Buffer.from(bytes)
}

describe('parsePdf (pdfjs-dist)', () => {
  it('extrai texto de PDF de 1 página', async () => {
    const buf = await buildSyntheticPdf('aletis demo')
    const r = await parsePdf(buf)
    expect(r.kind).toBe('pdf')
    expect(r.pageCount).toBe(1)
    expect(r.extractedText.toLowerCase()).toContain('aletis demo')
  })

  it('conta páginas corretamente em PDF de 3 páginas', async () => {
    const buf = await buildSyntheticPdf('multi-page', 3)
    const r = await parsePdf(buf)
    expect(r.pageCount).toBe(3)
    expect(r.extractedText.toLowerCase()).toContain('pg 1')
    expect(r.extractedText.toLowerCase()).toContain('pg 3')
  })
})
