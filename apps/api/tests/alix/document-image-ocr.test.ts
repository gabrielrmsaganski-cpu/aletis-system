import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { processImage } from '../../src/services/alix/intake/ImageProcessor.js'

async function syntheticImage(): Promise<Buffer> {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="500"><rect width="100%" height="100%" fill="white"/><g fill="black" font-family="DejaVu Sans" font-size="44"><text x="40" y="80">CONTRATO SINTETICO DE CREDITO RURAL</text><text x="40" y="160">GARANTIA: IMOVEL RURAL MODELO PARA TESTE</text><text x="40" y="240">VENCIMENTO FINAL: 15 DE NOVEMBRO DE 2027</text><text x="40" y="320">DOCUMENTO FICTICIO SEM DADOS PESSOAIS</text><text x="40" y="400">OBRIGACAO: CONFERIR TODAS AS PARCELAS</text></g></svg>'
  return sharp(Buffer.from(svg)).png().toBuffer()
}
afterEach(() => vi.unstubAllEnvs())

describe('OCR local real de imagem sintética', () => {
  it('extrai texto verificável e preserva evidência/visão da imagem', async () => {
    vi.stubEnv('ALIX_TESSERACT_LANG', 'por+eng')
    const result = await processImage(await syntheticImage(), 'fixture.png', 'image/png', { ocr: true })
    expect(result.extractedText.toUpperCase()).toContain('CONTRATO')
    expect(result.extractedText).toContain('2027')
    expect(result.evidences?.[0]).toMatchObject({ kind: 'ocr', page: 1, source: 'image:p1:ocr:tesseract' })
    expect(result.metadata?.extractionCoverage).toMatchObject({ status: 'complete', readablePages: [1] })
    expect(result.imageBase64?.length).toBeGreaterThan(100)
  }, 20_000)
  it('upload rápido não executa OCR e deixa pendência explícita', async () => {
    const result = await processImage(await syntheticImage(), 'fixture.png', 'image/png')
    expect(result.metadata?.ocr).toMatchObject({ attempted: false })
    expect(result.metadata?.extractionCoverage).toMatchObject({ status: 'partial', pendingPages: [1] })
  })
  it('falha do OCR preserva visão e retorna estado parcial sem dados inventados', async () => {
    vi.stubEnv('ALIX_TESSERACT_LANG', 'fixture-language-missing')
    const result = await processImage(await syntheticImage(), 'fixture.png', 'image/png', { ocr: true })
    expect(result.metadata?.extractionCoverage).toMatchObject({ status: 'partial', pendingPages: [1] })
    expect(result.metadata?.ocr).toMatchObject({ attempted: true, succeeded: false })
    expect(result.evidences).toBeUndefined()
    expect(result.imageBase64).toBeTruthy()
  })
})
