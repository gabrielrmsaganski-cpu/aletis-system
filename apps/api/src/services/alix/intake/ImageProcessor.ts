// ============================================================
// ALETIS — Alix Document Intake: Image Processor
// Reencoda imagens grandes via sharp (lado máx 2048 px, qualidade
// 85) e prepara base64 + media type para a entrada multimodal da OpenAI.
// ============================================================

import type { ImageMediaType, ParserResult } from './types.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { boundedReadingNumber } from './DocumentReadingPlan.js'

const execFileAsync = promisify(execFile)

const LARGE_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_DIMENSION = 2048
const JPEG_QUALITY = 85

function mimeFromFilename(filename: string): ImageMediaType {
  const f = filename.toLowerCase()
  if (f.endsWith('.png')) return 'image/png'
  if (f.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function normalizeMime(
  mimetype: string,
  filename: string,
): ImageMediaType {
  const m = mimetype.toLowerCase()
  if (m === 'image/png') return 'image/png'
  if (m === 'image/webp') return 'image/webp'
  if (m === 'image/jpeg' || m === 'image/jpg') return 'image/jpeg'
  return mimeFromFilename(filename)
}

export async function processImage(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  options: { ocr?: boolean } = {},
): Promise<ParserResult> {
  const sharpMod = await import('sharp')
  const sharp = sharpMod.default

  let outBuf: Buffer = buffer
  let outMime: ImageMediaType = normalizeMime(mimetype, filename)
  let width = 0
  let height = 0

  try {
    const meta = await sharp(buffer).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0

    const needsResize =
      (width && width > MAX_DIMENSION) || (height && height > MAX_DIMENSION)
    const isLarge = buffer.byteLength > LARGE_IMAGE_BYTES

    if (needsResize || isLarge) {
      let pipe = sharp(buffer).rotate()
      if (needsResize) {
        pipe = pipe.resize({
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: 'inside',
          withoutEnlargement: true,
        })
      }
      if (outMime === 'image/png') {
        outBuf = await pipe.png({ compressionLevel: 9 }).toBuffer()
      } else if (outMime === 'image/webp') {
        outBuf = await pipe.webp({ quality: JPEG_QUALITY }).toBuffer()
      } else {
        outBuf = await pipe.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()
        outMime = 'image/jpeg'
      }

      const finalMeta = await sharp(outBuf).metadata()
      width = finalMeta.width ?? width
      height = finalMeta.height ?? height
    }
  } catch {
    // Se sharp falhar (arquivo corrompido / formato raro), mantemos
    // o buffer original e seguimos com a melhor informação possível.
    outBuf = buffer
  }

  const base64 = outBuf.toString('base64')
  const dims = width && height ? `${width}x${height}px` : 'dimensões desconhecidas'
  const description = `[Imagem: ${filename}, ${dims}]`
  let ocrText = ''
  let ocrError: string | undefined
  if (options.ocr && process.env.ALIX_IMAGE_OCR !== '0') {
    const workDir = await mkdtemp(join(tmpdir(), 'alix-image-ocr-'))
    try {
      const path = join(workDir, 'image.png')
      await writeFile(path, await sharp(buffer).rotate().png().toBuffer())
      const result = await execFileAsync('tesseract', [path, 'stdout', '-l', process.env.ALIX_TESSERACT_LANG || 'por+eng', '--psm', process.env.ALIX_TESSERACT_PSM || '6'], {
        timeout: boundedReadingNumber(process.env.ALIX_IMAGE_OCR_TIMEOUT_MS, 45_000, 1_000, 90_000), maxBuffer: 8 * 1024 * 1024,
      })
      ocrText = result.stdout.replace(/\r/g, '').trim()
      if (!ocrText) ocrError = 'OCR não encontrou texto legível na imagem.'
    } catch { ocrError = 'OCR local da imagem falhou ou excedeu o tempo disponível.' }
    finally { await rm(workDir, { recursive: true, force: true }) }
  }
  const id = createHash('sha256').update(ocrText).digest('hex').slice(0, 32)
  const source = 'image:p1:ocr:tesseract'
  const enoughText = ocrText.length >= 80

  return {
    kind: 'image',
    extractedText: ocrText || description,
    pageCount: 1,
    ...(ocrText ? {
      evidences: [{ id: `image-evidence-${id}`, kind: 'ocr' as const, source, text: ocrText, page: 1, confidence: .72 }],
      chunks: [{ id: `image-chunk-${id}`, ordinal: 0, kind: 'ocr' as const, source, text: ocrText, pageStart: 1, pageEnd: 1, confidence: .72, evidenceIds: [`image-evidence-${id}`] }],
    } : {}),
    imageBase64: base64,
    imageMediaType: outMime,
    metadata: {
      width,
      height,
      reencoded: outBuf !== buffer,
      originalBytes: buffer.byteLength,
      finalBytes: outBuf.byteLength,
      ocr: { engine: 'tesseract', attempted: Boolean(options.ocr && process.env.ALIX_IMAGE_OCR !== '0'), succeeded: Boolean(ocrText), error: ocrError },
      extractionCoverage: { status: enoughText ? 'complete' : 'partial', totalPages: 1, readablePages: enoughText ? [1] : [], pendingPages: enoughText ? [] : [1],
        limitations: enoughText ? [] : [ocrError || (options.ocr ? 'Texto insuficiente para confirmar a leitura da imagem; confira o original.' : 'Imagem recebida; OCR será realizado no processamento profundo.')] },
    },
  }
}
