// ============================================================
// ALETIS — Alix Document Intake: Image Processor
// Reencoda imagens grandes via sharp (lado máx 2048 px, qualidade
// 85) e prepara base64 + media type para blocos "image" do Claude.
// ============================================================

import type { ImageMediaType, ParserResult } from './types.js'

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

  return {
    kind: 'image',
    extractedText: description,
    imageBase64: base64,
    imageMediaType: outMime,
    metadata: {
      width,
      height,
      reencoded: outBuf !== buffer,
      originalBytes: buffer.byteLength,
      finalBytes: outBuf.byteLength,
    },
  }
}
