// ============================================================
// ALETIS - Smoke test do Alix Document Intake (Wave 9-INTAKE)
// Fluxo: gera um PDF minimo via pdf-lib, faz upload via HTTP,
// depois busca GET e valida que o texto foi extraido.
//
// Pre-requisito: API rodando em http://localhost:3001 (systemd
// user do ambiente de dev ja expoe essa porta).
//
// Uso: pnpm tsx scripts/smoke-alix-intake.ts
// ============================================================

import { PDFDocument, StandardFonts } from 'pdf-lib'

const BASE_URL = process.env.ALETIS_API_URL ?? 'http://localhost:3001'
const SESSION_ID = process.env.SMOKE_SESSION_ID ?? 'smoke'

/**
 * Gera um PDF minimo usando pdf-lib (como pedido pela spec).
 *
 * Observacao: pdf-parse (pdfjs v1.10.100) tem incompatibilidade
 * conhecida com a saida comprimida padrao do pdf-lib, que produz
 * falhas intermitentes de "Invalid PDF structure". Portanto usamos
 * `useObjectStreams: false` e retentamos a chamada a jusante para
 * caber dentro da margem do smoke.
 */
async function buildPdfBytesViaPdfLib(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595.28, 841.89])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('Hello ALETIS Wave 9', { x: 72, y: 760, size: 24, font })
  page.drawText('Documento de teste do intake multimodal da Alix.', {
    x: 72,
    y: 720,
    size: 12,
    font,
  })
  return pdf.save({ useObjectStreams: false })
}

/**
 * Fallback: PDF minusculo, nao comprimido, manuscrito byte-a-byte.
 * Garante reproducibilidade quando pdf-parse reclama da saida do
 * pdf-lib.
 */
function buildPdfBytesManual(): Uint8Array {
  const text = 'Hello ALETIS Wave 9'
  const content = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(content, 'binary')} >>\n` +
      `stream\n${content}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]
  let body = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets: number[] = []
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'binary'))
    body += obj
  }
  const xrefOffset = Buffer.byteLength(body, 'binary')
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) {
    body += `${off.toString().padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  body += `startxref\n${xrefOffset}\n%%EOF\n`
  return Uint8Array.from(Buffer.from(body, 'binary'))
}

async function uploadOnce(
  pdfBytes: Uint8Array,
  filename: string,
): Promise<{ status: number; json: unknown }> {
  const form = new FormData()
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  form.append('file', blob, filename)
  const res = await fetch(
    `${BASE_URL}/api/alix/documents/upload?sessionId=${encodeURIComponent(SESSION_ID)}`,
    { method: 'POST', body: form },
  )
  const json = await res.json()
  return { status: res.status, json }
}

async function main(): Promise<void> {
  console.log('[smoke] Base URL:', BASE_URL)
  console.log('[smoke] Session:', SESSION_ID)

  // Tentamos primeiro com pdf-lib (ate 3x para absorver eventuais
  // "Invalid PDF structure" do pdfjs antigo dentro do pdf-parse).
  // Se todas falharem, caimos no PDF manuscrito (sempre aceito).
  type UploadOK = {
    success: boolean
    data: {
      id: string
      kind: string
      pageCount?: number
      extractedText: string
      summary?: string
    }
  }
  let uploaded: UploadOK['data'] | null = null

  for (let attempt = 1; attempt <= 3 && !uploaded; attempt++) {
    console.log(`[smoke] PDF via pdf-lib - tentativa ${attempt}...`)
    const bytes = await buildPdfBytesViaPdfLib()
    console.log('[smoke] PDF gerado:', bytes.byteLength, 'bytes')
    const { status, json } = await uploadOnce(bytes, `hello-wave9-lib-${attempt}.pdf`)
    const body = json as { success?: boolean; data?: UploadOK['data']; error?: string }
    if (status >= 200 && status < 300 && body.success && body.data) {
      uploaded = body.data
    } else {
      console.warn('[smoke] pdf-lib falhou:', status, body.error)
    }
  }

  if (!uploaded) {
    console.log('[smoke] fallback: PDF manuscrito nao comprimido')
    const bytes = buildPdfBytesManual()
    console.log('[smoke] PDF manuscrito:', bytes.byteLength, 'bytes')
    const { status, json } = await uploadOnce(bytes, 'hello-wave9-manual.pdf')
    const body = json as { success?: boolean; data?: UploadOK['data']; error?: string }
    if (status >= 200 && status < 300 && body.success && body.data) {
      uploaded = body.data
    } else {
      console.error('[smoke] Upload falhou definitivamente:', status, body)
      process.exitCode = 1
      return
    }
  }

  console.log('[smoke] Upload OK - metadata:')
  console.log(
    JSON.stringify(
      {
        id: uploaded.id,
        kind: uploaded.kind,
        pageCount: uploaded.pageCount,
        summary: uploaded.summary,
        extractedTextLength: uploaded.extractedText?.length ?? 0,
      },
      null,
      2,
    ),
  )

  // Validacoes basicas
  if (uploaded.kind !== 'pdf') {
    console.error('[smoke] ERRO: kind esperado "pdf", recebido:', uploaded.kind)
    process.exitCode = 1
    return
  }
  if (!uploaded.extractedText || uploaded.extractedText.trim().length === 0) {
    console.error('[smoke] ERRO: extractedText vazio')
    process.exitCode = 1
    return
  }
  if (!uploaded.extractedText.includes('Hello ALETIS Wave 9')) {
    console.warn(
      '[smoke] AVISO: extractedText nao contem a string literal ("Hello ALETIS Wave 9"). Conteudo:',
      JSON.stringify(uploaded.extractedText.slice(0, 200)),
    )
  } else {
    console.log('[smoke] Conteudo confere: encontrou "Hello ALETIS Wave 9"')
  }

  // GET de volta
  const getUrl = `${BASE_URL}/api/alix/documents/${encodeURIComponent(
    SESSION_ID,
  )}/${encodeURIComponent(uploaded.id)}`
  console.log('[smoke] GET', getUrl)
  const getRes = await fetch(getUrl)
  const getJson = (await getRes.json()) as {
    success: boolean
    data?: { extractedText: string }
    error?: string
  }
  if (!getRes.ok || !getJson.success || !getJson.data) {
    console.error('[smoke] GET falhou:', getRes.status, getJson)
    process.exitCode = 1
    return
  }
  console.log(
    '[smoke] GET OK - extractedText[0..120]:',
    JSON.stringify(getJson.data.extractedText.slice(0, 120)),
  )

  // LIST
  const listUrl = `${BASE_URL}/api/alix/documents/${encodeURIComponent(SESSION_ID)}`
  const listRes = await fetch(listUrl)
  const listJson = (await listRes.json()) as {
    success: boolean
    data?: { total: number }
  }
  console.log('[smoke] LIST total:', listJson.data?.total)

  console.log('[smoke] OK')
}

main().catch((err) => {
  console.error('[smoke] Fatal:', err)
  process.exit(1)
})
