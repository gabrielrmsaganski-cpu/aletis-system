/**
 * ALETIS - Knowledge Base / RAG
 * Wrapper sobre pdf-parse@^2 para extrair texto por pagina.
 *
 * pdf-parse 2.x expoe a classe PDFParse; chamamos via import dinamico para
 * evitar qualquer conflito entre CJS/ESM durante o build TypeScript.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface PdfPage {
  page: number
  text: string
}

export interface PdfDocument {
  source: string
  sourcePath: string
  pages: PdfPage[]
}

/**
 * Le um unico PDF e retorna texto por pagina. Se o parse falhar em alguma
 * pagina, retornamos o texto concatenado como pagina 1 fallback.
 */
export async function loadPdf(filePath: string, sourceName?: string): Promise<PdfDocument> {
  const mod: any = await import('pdf-parse')
  const PDFParse = mod?.PDFParse ?? mod?.default?.PDFParse ?? mod?.default
  if (!PDFParse) {
    throw new Error('pdf-parse: PDFParse export nao encontrado')
  }
  const buf = await readFile(filePath)
  // PDFParse assume ArrayBuffer/Uint8Array; passamos o Buffer cru (aceito pela lib).
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  try {
    const result = await parser.getText()
    const pages: PdfPage[] = []
    if (Array.isArray(result?.pages) && result.pages.length > 0) {
      for (const p of result.pages) {
        const num = typeof p?.num === 'number' ? p.num : pages.length + 1
        const text = typeof p?.text === 'string' ? p.text : ''
        pages.push({ page: num, text })
      }
    } else if (typeof result?.text === 'string') {
      pages.push({ page: 1, text: result.text })
    }
    return {
      source: sourceName ?? filePath.split('/').pop() ?? filePath,
      sourcePath: filePath,
      pages,
    }
  } finally {
    // libera recursos do pdfjs worker
    try {
      await parser.destroy?.()
    } catch {
      /* noop */
    }
  }
}

/**
 * Lista PDFs em um diretorio (nao recursivo por padrao).
 */
export async function listPdfs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase().endsWith('.pdf')) {
      out.push(join(dir, e.name))
    }
  }
  out.sort()
  return out
}
