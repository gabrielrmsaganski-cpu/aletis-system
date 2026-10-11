// ============================================================
// ALETIS — Docling adapter
//
// Parser opcional para PDFs/imagens/documentos difíceis. Só roda
// quando ALIX_DOCLING_ENABLED=1 para evitar custo alto no caminho comum.
// ============================================================

import { execFile } from 'child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { promisify } from 'util'
import type { IntakeInput, ParserResult, DocumentKind } from './types.js'

const execFileAsync = promisify(execFile)

function enabled(): boolean {
  const flag = String(process.env.ALIX_DOCLING_ENABLED || '').toLowerCase()
  return flag === '1' || flag === 'true' || flag === 'yes'
}

function doclingBin(): string {
  return process.env.ALIX_DOCLING_BIN || '/root/.cache/aletis-docling-venv/bin/docling'
}

function extFromName(filename: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename || '')
  return m ? m[1].toLowerCase() : 'bin'
}

function doclingInputFormat(kind: DocumentKind): string | null {
  if (kind === 'pdf') return 'pdf'
  if (kind === 'docx') return 'docx'
  if (kind === 'xlsx') return 'xlsx'
  if (kind === 'csv') return 'csv'
  if (kind === 'image') return 'image'
  return null
}

function shouldUseDocling(kind: DocumentKind): boolean {
  return ['pdf', 'docx', 'xlsx', 'csv', 'image'].includes(kind)
}

async function readFirstMarkdownOrText(dir: string): Promise<string> {
  const files = await readdir(dir)
  const preferred = files.find((f) => f.endsWith('.md'))
    ?? files.find((f) => f.endsWith('.txt'))
    ?? files.find((f) => f.endsWith('.json'))
  if (!preferred) return ''
  return readFile(join(dir, preferred), 'utf-8')
}

export async function parseWithDocling(kind: DocumentKind, file: IntakeInput): Promise<ParserResult | null> {
  if (!enabled() || !shouldUseDocling(kind)) return null

  const inputFormat = doclingInputFormat(kind)
  if (!inputFormat) return null

  const workDir = await mkdtemp(join(tmpdir(), 'aletis-docling-'))
  const outDir = join(workDir, 'out')
  const inputPath = join(workDir, `input.${extFromName(file.filename)}`)
  const timeoutMs = Number(process.env.ALIX_DOCLING_TIMEOUT_MS ?? 120_000)
  const device = process.env.ALIX_DOCLING_DEVICE || 'cpu'

  try {
    await writeFile(inputPath, file.buffer)
    const args = [
      inputPath,
      '--from', inputFormat,
      '--to', 'md',
      '--output', outDir,
      '--ocr',
      '--tables',
      '--table-mode', 'accurate',
      '--device', device,
    ]
    const { stderr } = await execFileAsync(doclingBin(), args, {
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : 120_000,
      maxBuffer: 20 * 1024 * 1024,
    })
    const extractedText = (await readFirstMarkdownOrText(outDir)).trim()
    if (!extractedText) return null
    return {
      kind,
      extractedText,
      metadata: {
        docling: {
          enabled: true,
          version: process.env.ALIX_DOCLING_VERSION || '2.94.0',
          device,
          stderr: stderr ? stderr.slice(0, 2000) : undefined,
        },
      },
    }
  } catch (err) {
    console.warn('[DoclingParser] falhou:', (err as Error).message)
    return null
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
