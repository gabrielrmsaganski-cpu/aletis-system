import { basename, extname, resolve, sep } from 'node:path'
import JSZip from 'jszip'
import { containsPortalPrivateCredential } from './PortalPrivateCredentialGuard.js'

export const PORTAL_UPLOAD_MAX_BYTES = 20 * 1024 * 1024

export class PortalUploadError extends Error {
  constructor(message: string, public statusCode = 400, public code = 'PORTAL_INVALID_UPLOAD') { super(message) }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xls': 'application/vnd.ms-excel', '.doc': 'application/msword',
  '.csv': 'text/csv', '.txt': 'text/plain', '.xml': 'application/xml',
}

/** O nome original é só apresentação. O caminho físico usa UUID do servidor. */
export function portalFilename(value: string): string {
  const name = basename(value.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!name || name.length > 240 || !MIME_BY_EXTENSION[extname(name).toLowerCase()]) {
    throw new PortalUploadError('Use PDF, imagem, Word, Excel, CSV, TXT ou XML com nome de até 240 caracteres.', 415)
  }
  return name
}

export function portalStoragePath(directory: string, storageName: string): string {
  const root = resolve(directory)
  const target = resolve(root, storageName)
  if (!storageName || target === root || !target.startsWith(root + sep) || basename(storageName) !== storageName) {
    throw new PortalUploadError('Referência de arquivo inválida.', 404)
  }
  return target
}

export function decodePortalBase64(value: string): Buffer {
  if (value.length > Math.ceil(PORTAL_UPLOAD_MAX_BYTES / 3) * 4) throw new PortalUploadError('O arquivo excede 20 MB.', 413)
  if (value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) {
    throw new PortalUploadError('O conteúdo do arquivo não está em base64 válido.')
  }
  const buffer = Buffer.from(value, 'base64')
  if (buffer.length > PORTAL_UPLOAD_MAX_BYTES) throw new PortalUploadError('O arquivo excede 20 MB.', 413)
  if (buffer.toString('base64') !== value) throw new PortalUploadError('O conteúdo do arquivo não está em base64 válido.')
  return buffer
}

/** Confere extensão, assinatura e limites antes de permitir OCR/parsers. Macros nunca são executadas. */
export async function validatePortalFile(buffer: Buffer, filename: string): Promise<{ nome: string; mime: string }> {
  if (!buffer.length) throw new PortalUploadError('O arquivo está vazio.')
  if (buffer.length > PORTAL_UPLOAD_MAX_BYTES) throw new PortalUploadError('O arquivo excede 20 MB.', 413)
  if (containsPortalPrivateCredential(buffer)) {
    throw new PortalUploadError('Este arquivo contém uma credencial digital privada. Envie apenas documentos e comprovantes de autorização, sem certificado privado ou senha.', 415, 'PORTAL_PRIVATE_CREDENTIAL_BLOCKED')
  }
  const nome = portalFilename(filename)
  const extension = extname(nome).toLowerCase()
  const start = buffer.subarray(0, 16)
  let valid = false
  if (extension === '.pdf') valid = start.subarray(0, 5).toString('ascii') === '%PDF-'
  else if (['.jpg', '.jpeg'].includes(extension)) valid = start[0] === 0xff && start[1] === 0xd8 && start[2] === 0xff
  else if (extension === '.png') valid = start.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  else if (extension === '.webp') valid = start.subarray(0, 4).toString() === 'RIFF' && start.subarray(8, 12).toString() === 'WEBP'
  else if (['.doc', '.xls'].includes(extension)) valid = start.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))
  else if (['.docx', '.xlsx', '.xlsm'].includes(extension)) {
    if (start[0] !== 0x50 || start[1] !== 0x4b) throw new PortalUploadError('O conteúdo não corresponde ao documento informado.', 415)
    try {
      const zip = await JSZip.loadAsync(buffer)
      const entries = Object.values(zip.files)
      const expandedBytes = entries.reduce((sum, entry) => sum + Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0), 0)
      if (entries.length > 12_000 || expandedBytes > 160 * 1024 * 1024) throw new PortalUploadError('O documento descompactado é muito grande. Divida-o em arquivos menores.', 413)
      valid = Boolean(zip.file('[Content_Types].xml')) && Boolean(zip.file(extension === '.docx' ? 'word/document.xml' : 'xl/workbook.xml'))
    } catch (error) {
      if (error instanceof PortalUploadError) throw error
      throw new PortalUploadError('O arquivo Office está corrompido ou protegido. Envie uma cópia válida.', 415)
    }
  } else {
    const sample = buffer.subarray(0, 65_536)
    const controls = [...sample].filter(byte => byte < 32 && ![9, 10, 13].includes(byte)).length
    valid = !sample.includes(0) && controls < Math.max(1, sample.length / 100)
    if (extension === '.xml') valid = valid && /^\s*(?:<\?xml\s|<[A-Za-z_:])/.test(sample.toString('utf8').replace(/^\uFEFF/, ''))
  }
  if (!valid) throw new PortalUploadError('O conteúdo não corresponde ao tipo do arquivo. Verifique o documento e tente novamente.', 415)
  return { nome, mime: MIME_BY_EXTENSION[extension] }
}
