/**
 * Validação de uploads — whitelist de MIME types por categoria.
 *
 * Use no handler para checar `part.mimetype` antes de salvar/processar.
 * Em paralelo, cada handler deve validar magic-bytes do conteúdo (lib
 * `file-type`) quando o destino é processamento crítico (NF/OFX/PDF).
 */

export const MIME_GROUPS = {
  pdf: ['application/pdf'],
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  spreadsheet: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv',
  ],
  doc: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  xml: ['application/xml', 'text/xml'],
  ofx: [
    'application/x-ofx',
    'application/x-quicken-ofx',
    'text/plain',
    // OFX antigos vêm como application/octet-stream
    'application/octet-stream',
  ],
  json: ['application/json'],
} as const

export type MimeGroup = keyof typeof MIME_GROUPS

/**
 * Constrói uma whitelist a partir de grupos. Ex: `mimeWhitelist('pdf','image')`.
 * Sempre retorna um Set para checagem O(1).
 */
export function mimeWhitelist(...groups: MimeGroup[]): Set<string> {
  const set = new Set<string>()
  for (const g of groups) {
    for (const m of MIME_GROUPS[g]) set.add(m)
  }
  return set
}

/**
 * Whitelist padrão para uploads do ALETIS (financeiro + dossie + intake ALIX).
 */
export const DEFAULT_UPLOAD_WHITELIST = mimeWhitelist(
  'pdf', 'image', 'spreadsheet', 'doc', 'xml', 'ofx', 'json',
)

/**
 * Verifica se um MIME type está na whitelist. Normaliza casing.
 */
export function isMimeAllowed(mime: string | undefined, whitelist: Set<string> = DEFAULT_UPLOAD_WHITELIST): boolean {
  if (!mime) return false
  return whitelist.has(mime.toLowerCase().split(';')[0].trim())
}
