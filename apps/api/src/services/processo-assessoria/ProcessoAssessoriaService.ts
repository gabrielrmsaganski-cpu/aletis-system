// ============================================================
// ProcessoAssessoriaService — render multi-formato dos 25 docs
// do Processo de Assessoria TEX CAPITAL.
// ============================================================
//
// Estratégia por formato:
//   docx → docxtemplater (substitui {placeholders} preservando
//          fontes/headers/footers/imagens; tolera docs sem tags).
//   xlsx → exceljs       (substitui valor de célula específica
//          via tpl.placeholders[].cell preservando fórmulas + estilos).
//   xlsm → pizzip + replace direto no XML (preserva VBA macros).
//   pdf  → estático (download direto).
//   pptx → pizzip + substituição texto-âncora (preserva animações/layout).
//
// Resolve placeholders a partir de:
//   - cliente CRM (clientePath dot-notation)
//   - inputs do request
//   - default do manifest
// ============================================================
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import ExcelJS from 'exceljs'
import {
  PROCESSO_TEMPLATES,
  getProcessoTemplateBySlug,
  type ProcessoTemplate,
  type PlaceholderSpec,
  type DocFormato,
  CATEGORIA_META,
} from './manifest.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATES_DIR = join(__dirname, 'templates')

export interface ProcessoClienteData {
  id: string
  nome: string
  cpfCnpj?: string | null
  cidade?: string | null
  uf?: string | null
  endereco?: string | null
  email?: string | null
  telefone?: string | null
  estagio?: string | null
}

export interface ProcessoRenderInput {
  templateSlug: string
  cliente: ProcessoClienteData
  /** valores manuais para placeholders (vencem clientePath/default) */
  inputs?: Record<string, string>
}

export interface ProcessoRenderResult {
  buffer: Buffer
  filename: string
  contentType: string
  template: ProcessoTemplate
  resolvedData: Record<string, string>
}

// ── Helpers de transformação ────────────────────────────────
function maskCpf(s: string): string {
  const d = (s || '').replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return s
}
function maskCnpj(s: string): string {
  const d = (s || '').replace(/\D/g, '')
  if (d.length !== 14) return s
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
function dateBR(d: Date | string = new Date()): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
}
function dateYYYYMM(d: Date | string = new Date()): string {
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

function applyTransform(value: string, transform?: PlaceholderSpec['transform']): string {
  if (!transform || !value) return value
  switch (transform) {
    case 'upper':
      return value.toUpperCase()
    case 'cpf-mask':
      return maskCpf(value)
    case 'cnpj-mask':
      return maskCnpj(value)
    case 'date-br':
      return dateBR(value)
    case 'date-yyyy-mm':
      return dateYYYYMM(value)
    default:
      return value
  }
}

function getFromPath(obj: any, path: string | undefined): string {
  if (!path) return ''
  const parts = path.split('.')
  let v: any = obj
  for (const p of parts) {
    if (v == null) return ''
    v = v[p]
  }
  return v == null ? '' : String(v)
}

function resolvePlaceholderValue(spec: PlaceholderSpec, ctx: ProcessoRenderInput): string {
  const inputs = ctx.inputs ?? {}
  // override do request sempre vence
  if (Object.prototype.hasOwnProperty.call(inputs, spec.name)) {
    return applyTransform(String(inputs[spec.name] ?? ''), spec.transform)
  }
  // valor do cliente
  if (spec.clientePath) {
    const v = getFromPath(ctx.cliente, spec.clientePath)
    if (v) return applyTransform(v, spec.transform)
  }
  // computado para data_hoje
  if (spec.transform === 'date-br' && (!spec.clientePath || !inputs[spec.name])) {
    if (spec.name === 'data_hoje' || spec.name === 'data_emissao') {
      return dateBR()
    }
  }
  return spec.default ?? ''
}

export interface ResolveResult {
  data: Record<string, string>
  missing: string[]
}

export function resolveAllPlaceholders(
  tpl: ProcessoTemplate,
  ctx: ProcessoRenderInput,
): ResolveResult {
  const data: Record<string, string> = {}
  const missing: string[] = []
  for (const spec of tpl.placeholders ?? []) {
    const v = resolvePlaceholderValue(spec, ctx)
    data[spec.name] = v
    if (spec.required && (!v || v.trim().length === 0)) missing.push(spec.name)
  }
  return { data, missing }
}

// ── Renderers por formato ────────────────────────────────────

function renderDocx(buf: Buffer, data: Record<string, string>): Buffer {
  const zip = new PizZip(buf)
  // Tolerante: se docx não tem tags {x}, doc.render() roda sem erro e devolve o original.
  // Usamos delimiters distintos pra evitar conflito com texto literal.
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
    nullGetter: () => '',
  })
  // Primeira passagem com {{}} (não destrutivo).
  try {
    doc.render(data)
  } catch {
    // Se docx tem tags malformadas, ignora e devolve cópia.
    return buf
  }
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
}

async function renderXlsx(
  buf: Buffer,
  tpl: ProcessoTemplate,
  data: Record<string, string>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  // exceljs aceita ArrayBuffer/Uint8Array; passamos via subarray para evitar cast
  await wb.xlsx.load(buf as unknown as ArrayBuffer)
  for (const spec of tpl.placeholders ?? []) {
    if (!spec.cell) continue
    const val = data[spec.name]
    if (val === undefined || val === '') continue
    const [sheetName, addr] = spec.cell.split('!')
    if (!sheetName || !addr) continue
    const ws = wb.getWorksheet(sheetName)
    if (!ws) continue
    const cell = ws.getCell(addr)
    cell.value = val
  }
  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out)
}

/**
 * XLSM (planilha com VBA) — não usamos exceljs porque ele não preserva
 * macros. Usamos pizzip para abrir o pacote OOXML diretamente, e
 * substituímos as células-alvo no XML do worksheet.
 *
 * Estratégia conservadora: para cada placeholder com `cell="Sheet!Addr"`,
 * encontramos o XML do sheet correspondente em `xl/worksheets/sheetN.xml`
 * (via mapping em xl/workbook.xml + xl/_rels/workbook.xml.rels), e
 * sobrescrevemos a célula. Se a planilha não tem a célula ou o sheet,
 * apenas log e prosseguimos.
 *
 * Isso preserva 100% do VBA (vbaProject.bin), styles, conditional
 * formatting, named ranges, e fórmulas das demais células.
 */
function renderXlsm(
  buf: Buffer,
  tpl: ProcessoTemplate,
  data: Record<string, string>,
): Buffer {
  if (!tpl.placeholders || tpl.placeholders.length === 0) return buf
  const zip = new PizZip(buf)

  // 1) Carregar workbook.xml + rels para descobrir sheetN.xml por nome
  const workbookXmlFile = zip.file('xl/workbook.xml')
  const workbookRelsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (!workbookXmlFile || !workbookRelsFile) return buf
  const workbookXml = workbookXmlFile.asText()
  const workbookRels = workbookRelsFile.asText()

  // mapeia sheetName → r:id
  const sheetIdRe = /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g
  const nameToRid = new Map<string, string>()
  let m: RegExpExecArray | null
  while ((m = sheetIdRe.exec(workbookXml)) !== null) {
    nameToRid.set(m[1], m[2])
  }
  // mapeia rId → target (worksheets/sheetN.xml)
  const relRe = /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g
  const ridToTarget = new Map<string, string>()
  while ((m = relRe.exec(workbookRels)) !== null) {
    ridToTarget.set(m[1], m[2])
  }

  for (const spec of tpl.placeholders) {
    if (!spec.cell) continue
    const val = data[spec.name]
    if (val === undefined || val === '') continue
    const idx = spec.cell.indexOf('!')
    if (idx < 0) continue
    const sheetName = spec.cell.slice(0, idx).replace(/^['"]|['"]$/g, '')
    const addr = spec.cell.slice(idx + 1)
    const rId = nameToRid.get(sheetName)
    if (!rId) continue
    const target = ridToTarget.get(rId)
    if (!target) continue
    // target é tipo "worksheets/sheet1.xml" — relativo a xl/
    const sheetPath = `xl/${target.replace(/^\/?xl\//, '')}`
    const sheetFile = zip.file(sheetPath)
    if (!sheetFile) continue
    let sheetXml = sheetFile.asText()
    // strip-replace na célula <c r="C18" ...><v>...</v></c> ou <c r="C18"><is><t>...</t></is></c>
    // Para o nosso caso (templates), simplificamos: inserimos como inlineStr.
    const escVal = String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const cellRe = new RegExp(`<c[^>]*\\sr="${addr}"(?:[^>]*?)\\/?\\s*(?:>([\\s\\S]*?)<\\/c>)?`, 'g')
    let replaced = false
    sheetXml = sheetXml.replace(cellRe, (match, _inner: string | undefined) => {
      replaced = true
      // Verifica se é self-closing (sem conteúdo) ou tem inner
      // Substitui por inlineStr para evitar precisar registrar sharedStrings
      return `<c r="${addr}" t="inlineStr"><is><t xml:space="preserve">${escVal}</t></is></c>`
    })
    if (!replaced) {
      // Não existia a célula no XML — adicionar antes do </sheetData>
      // (raro em templates pré-existentes; só inseri se a row já existir)
      const rowMatch = addr.match(/^([A-Z]+)(\d+)$/)
      if (rowMatch) {
        const rowNum = rowMatch[2]
        const rowOpenRe = new RegExp(`<row r="${rowNum}"[^>]*>`)
        if (rowOpenRe.test(sheetXml)) {
          sheetXml = sheetXml.replace(rowOpenRe, (rowOpen) => `${rowOpen}<c r="${addr}" t="inlineStr"><is><t xml:space="preserve">${escVal}</t></is></c>`)
        }
      }
    }
    zip.file(sheetPath, sheetXml)
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
}

/**
 * PPTX — substituição de texto literal nos slides.
 * Procura por placeholders {{key}} no XML dos slides (que ppt/slideN.xml
 * frequentemente tem em formato texto puro entre tags <a:t>).
 * Se não encontrar, retorna intacto (apenas serve original).
 */
function renderPptx(buf: Buffer, data: Record<string, string>): Buffer {
  if (Object.keys(data).length === 0) return buf
  const zip = new PizZip(buf)
  // listar todos os slides
  const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
  for (const sf of slideFiles) {
    const file = zip.file(sf)
    if (!file) continue
    let xml = file.asText()
    let changed = false
    for (const [k, v] of Object.entries(data)) {
      const tag = `{{${k}}}`
      if (xml.includes(tag)) {
        const escVal = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        xml = xml.split(tag).join(escVal)
        changed = true
      }
    }
    if (changed) zip.file(sf, xml)
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
}

// ── Service ─────────────────────────────────────────────────
const CONTENT_TYPES: Record<DocFormato, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf',
}

export class ProcessoAssessoriaService {
  listTemplates(): ProcessoTemplate[] {
    return PROCESSO_TEMPLATES.slice()
  }

  getCategoriaMeta() {
    return CATEGORIA_META
  }

  getTemplate(slug: string): ProcessoTemplate | null {
    return getProcessoTemplateBySlug(slug)
  }

  preview(input: ProcessoRenderInput): {
    template: ProcessoTemplate
    resolved: Record<string, string>
    missing: string[]
  } {
    const tpl = this.getTemplate(input.templateSlug)
    if (!tpl) throw new Error(`Template "${input.templateSlug}" não existe`)
    const { data, missing } = resolveAllPlaceholders(tpl, input)
    return { template: tpl, resolved: data, missing }
  }

  async render(input: ProcessoRenderInput): Promise<ProcessoRenderResult> {
    const tpl = this.getTemplate(input.templateSlug)
    if (!tpl) throw new Error(`Template "${input.templateSlug}" não existe`)

    const filePath = join(TEMPLATES_DIR, tpl.templateFile)
    if (!existsSync(filePath)) {
      throw new Error(
        `Arquivo de template não encontrado: ${filePath}. ` +
          `Rode: pnpm --filter @aletis/api exec tsx scripts/build-processo-assessoria-templates.ts`,
      )
    }

    const { data, missing } = resolveAllPlaceholders(tpl, input)
    if (missing.length > 0) {
      throw new Error(`Campos obrigatórios faltando: ${missing.join(', ')}`)
    }

    const srcBuf = readFileSync(filePath)
    let outBuf: Buffer
    switch (tpl.formato) {
      case 'docx':
        outBuf = renderDocx(srcBuf, data)
        break
      case 'xlsx':
        outBuf = await renderXlsx(srcBuf, tpl, data)
        break
      case 'xlsm':
        outBuf = renderXlsm(srcBuf, tpl, data)
        break
      case 'pptx':
        outBuf = renderPptx(srcBuf, data)
        break
      case 'pdf':
        outBuf = srcBuf
        break
    }

    const dia = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const cliSafe = (input.cliente.id || 'sem-id').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32)
    const cliNomeSafe = (input.cliente.nome || cliSafe).replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 40).trim().replace(/\s+/g, '_')
    const filename = `${tpl.codigo}__${tpl.slug}__${cliNomeSafe}__${dia}.${tpl.formato}`

    return {
      buffer: outBuf,
      filename,
      contentType: CONTENT_TYPES[tpl.formato],
      template: tpl,
      resolvedData: data,
    }
  }
}

let _instance: ProcessoAssessoriaService | null = null
export function getProcessoAssessoriaService(): ProcessoAssessoriaService {
  if (!_instance) _instance = new ProcessoAssessoriaService()
  return _instance
}
