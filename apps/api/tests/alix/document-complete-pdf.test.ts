import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ pages: [] as string[], emptyPage: 0, failedPage: 0 }))
vi.mock('unpdf', () => ({
  getDocumentProxy: async () => ({}),
  extractText: async () => ({ totalPages: fixture.pages.length, text: fixture.pages }),
  renderPageAsImage: async () => new Uint8Array([1, 2, 3]),
}))
vi.mock('child_process', () => ({
  execFile: (_file: string, args: string[], _options: unknown, callback: (error: Error | null, value?: unknown) => void) => {
    const page = Number(args[0].match(/page-(\d+)\.png/)?.[1])
    if (page === fixture.failedPage) callback(new Error('OCR sintético indisponível'))
    else callback(null, { stdout: page === fixture.emptyPage ? '' : `OCR comprovado da página ${page}: garantia rural detalhada.` })
  },
}))
import { parsePdf } from '../../src/services/alix/intake/PdfParser.js'

beforeEach(() => { fixture.pages = []; fixture.emptyPage = 0; fixture.failedPage = 0; vi.stubEnv('ALIX_PDF_OCR', '1'); vi.stubEnv('ALIX_PDF_OCR_MAX_PAGES', '20') })
afterEach(() => vi.unstubAllEnvs())

describe('OCR com cobertura por página', () => {
  it('registra explicitamente páginas21–140 ainda não lidas após limite padrão', async () => {
    fixture.pages = Array(140).fill('')
    const parsed = await parsePdf(Buffer.from('synthetic'))
    expect(parsed.metadata?.extractionCoverage).toMatchObject({ status: 'partial', totalPages: 140, pendingPages: Array.from({ length: 120 }, (_, i) => i + 21) })
    expect((parsed.metadata?.ocr as { pendingPages: number[] }).pendingPages).toEqual(Array.from({ length: 120 }, (_, i) => i + 21))
    expect(parsed.extractedText).toContain('OCR comprovado da página 20')
  })
  it('distingue OCR vazio, erro e limite e ordena conteúdo por página', async () => {
    fixture.pages = ['', 'Texto nativo completo. '.repeat(15), '', '']
    fixture.emptyPage = 3; fixture.failedPage = 4
    const parsed = await parsePdf(Buffer.from('synthetic'))
    expect(parsed.metadata?.extractionCoverage).toMatchObject({ status: 'partial', readablePages: [1, 2], pendingPages: [3, 4], failedPages: [3, 4] })
    expect(parsed.extractedText.indexOf('OCR Página 1')).toBeLessThan(parsed.extractedText.indexOf('Página 2'))
  })
  it('PDF digital completo dispensa OCR e informa cobertura total', async () => {
    fixture.pages = ['Primeira página íntegra. '.repeat(30), 'Página final íntegra. '.repeat(30)]
    const parsed = await parsePdf(Buffer.from('synthetic'))
    expect(parsed.metadata?.extractionCoverage).toMatchObject({ status: 'complete', readablePages: [1, 2], pendingPages: [] })
    expect((parsed.metadata?.ocr as { attemptedPages: number[] }).attemptedPages).toEqual([])
  })
  it('OCR desabilitado não torna uma página vazia completa', async () => {
    vi.stubEnv('ALIX_PDF_OCR', '0')
    fixture.pages = ['']
    const parsed = await parsePdf(Buffer.from('synthetic'))
    expect(parsed.metadata?.extractionCoverage).toMatchObject({ status: 'partial', pendingPages: [1] })
  })
})
