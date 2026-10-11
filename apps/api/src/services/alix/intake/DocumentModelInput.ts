import { promises as fs } from 'node:fs'
import type { LLMMessage } from '../../llm/OpenAIClient.js'
import type { IngestedDocument } from './types.js'

const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024

function enabled(): boolean {
  return !['false', '0', 'off'].includes(String(process.env.ALIX_NATIVE_FILE_INPUTS || 'true').toLowerCase())
}

function configuredMaxBytes(): number {
  const value = Number(process.env.ALIX_NATIVE_FILE_MAX_BYTES || DEFAULT_MAX_FILE_BYTES)
  return Number.isFinite(value) ? Math.max(1, Math.min(value, DEFAULT_MAX_FILE_BYTES)) : DEFAULT_MAX_FILE_BYTES
}

function documentDetail(): 'auto' | 'low' | 'high' {
  const value = String(process.env.ALIX_PDF_DETAIL || 'high').toLowerCase()
  return value === 'auto' || value === 'low' ? value : 'high'
}

function rawPath(doc: IngestedDocument): string | undefined {
  const rawFile = doc.metadata?.rawFile as Record<string, unknown> | undefined
  return typeof rawFile?.path === 'string' ? rawFile.path : undefined
}

export async function buildNativeDocumentBlock(
  doc: IngestedDocument,
): Promise<Record<string, unknown> | null> {
  if (!enabled() || doc.sizeBytes > configuredMaxBytes()) return null
  if (!['pdf', 'docx', 'xlsx', 'csv', 'text'].includes(doc.kind)) return null
  const mime = String(doc.mimetype || '').toLowerCase().split(';')[0].trim()
  // XML/KML e XLSM já chegam com texto extraído. A API de modelos não aceita
  // esses MIME types como file_data nativo, então enviamos apenas o texto.
  if (mime.includes('xml') || mime.includes('macroenabled') || /\.(?:kml|xlsm)$/i.test(doc.filename)) return null
  const path = rawPath(doc)
  if (!path) return null
  try {
    const buffer = await fs.readFile(path)
    if (!buffer.length || buffer.byteLength > configuredMaxBytes()) return null
    return {
      type: 'file',
      filename: doc.filename,
      detail: documentDetail(),
      source: {
        type: 'base64',
        media_type: doc.mimetype || 'application/pdf',
        data: buffer.toString('base64'),
      },
    }
  } catch {
    return null
  }
}

async function buildNativeImageBlock(doc: IngestedDocument): Promise<Record<string, unknown> | null> {
  if (!enabled() || doc.kind !== 'image' || doc.sizeBytes > configuredMaxBytes()) return null
  const path = rawPath(doc)
  if (!path) return null
  try {
    const buffer = await fs.readFile(path)
    if (!buffer.length || buffer.byteLength > configuredMaxBytes()) return null
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: doc.mimetype || 'image/jpeg',
        data: buffer.toString('base64'),
      },
    }
  } catch {
    return null
  }
}

export async function buildDocumentModelContent(
  doc: IngestedDocument,
  prompt: string,
): Promise<LLMMessage['content']> {
  const [nativeFile, nativeImage] = await Promise.all([
    buildNativeDocumentBlock(doc),
    buildNativeImageBlock(doc),
  ])
  if (!nativeFile && !nativeImage) return prompt
  return [
    ...(nativeFile ? [nativeFile] : []),
    ...(nativeImage ? [nativeImage] : []),
    { type: 'input_text', text: prompt },
  ]
}
