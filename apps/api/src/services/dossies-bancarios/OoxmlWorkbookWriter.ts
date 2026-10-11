import PizZip from 'pizzip'

export type OoxmlCellValue = string | number | boolean | null

export interface OoxmlCellWrite {
  sheet: string
  address: string
  value: OoxmlCellValue
  type?: 'text' | 'number' | 'boolean' | 'formula'
  reason?: 'data' | 'sanitize' | 'formula'
}

export interface OoxmlMutationResult {
  buffer: Buffer
  written: number
  sanitized: number
  formulas: number
  missing: string[]
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function xmlDecode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeSheetPath(target: string): string {
  const clean = target.replace(/\\/g, '/')
  if (clean.startsWith('/xl/')) return clean.slice(1)
  if (clean.startsWith('xl/')) return clean
  return `xl/${clean.replace(/^\/+/, '')}`
}

function cellAttributes(original: string, address: string): string {
  const opening = original.match(/^<c\b([^>]*?)(?:\/>|>)/)?.[1] ?? ''
  const preserved = opening
    .replace(/\s+r="[^"]*"/g, '')
    .replace(/\s+t="[^"]*"/g, '')
    .trim()
  return `r="${address}"${preserved ? ` ${preserved}` : ''}`
}

function renderCell(original: string, write: OoxmlCellWrite): string {
  const attrs = cellAttributes(original, write.address)
  if (write.value === null) return `<c ${attrs}/>`

  const type = write.type
    ?? (typeof write.value === 'number' ? 'number' : typeof write.value === 'boolean' ? 'boolean' : 'text')

  if (type === 'formula') {
    const formula = String(write.value).replace(/^=/, '')
    return `<c ${attrs}><f>${xmlEscape(formula)}</f></c>`
  }
  if (type === 'number') {
    const value = Number(write.value)
    if (!Number.isFinite(value)) return original
    return `<c ${attrs}><v>${value}</v></c>`
  }
  if (type === 'boolean') {
    return `<c ${attrs} t="b"><v>${write.value ? 1 : 0}</v></c>`
  }
  return `<c ${attrs} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(write.value))}</t></is></c>`
}

function ensureRecalculation(zip: PizZip): void {
  const file = zip.file('xl/workbook.xml')
  if (!file) return
  let xml = file.asText()
  if (/<calcPr\b/.test(xml)) {
    xml = xml.replace(/<calcPr\b([^>]*?)(?:\/>|>[\s\S]*?<\/calcPr>)/, (_match, attrs: string) => {
      const clean = attrs
        .replace(/\s+calcId="[^"]*"/g, '')
        .replace(/\s+calcMode="[^"]*"/g, '')
        .replace(/\s+fullCalcOnLoad="[^"]*"/g, '')
        .replace(/\s+forceFullCalc="[^"]*"/g, '')
      return `<calcPr${clean} calcId="0" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`
    })
  } else {
    xml = xml.replace('</workbook>', '<calcPr calcId="0" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>')
  }
  zip.file('xl/workbook.xml', xml)
}

export function mutateOoxmlWorkbook(template: Buffer, rawWrites: OoxmlCellWrite[]): OoxmlMutationResult {
  const zip = new PizZip(template)
  const workbookFile = zip.file('xl/workbook.xml')
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (!workbookFile || !relsFile) {
    throw new Error('Arquivo OOXML inválido: workbook.xml ou relacionamentos ausentes.')
  }

  const workbookXml = workbookFile.asText()
  const relsXml = relsFile.asText()
  const nameToRid = new Map<string, string>()
  const ridToTarget = new Map<string, string>()
  let match: RegExpExecArray | null

  const sheetRegex = /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g
  while ((match = sheetRegex.exec(workbookXml)) !== null) {
    nameToRid.set(xmlDecode(match[1]), match[2])
  }
  const relationshipRegex = /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g
  while ((match = relationshipRegex.exec(relsXml)) !== null) {
    ridToTarget.set(match[1], xmlDecode(match[2]))
  }

  // A última mutação vence. Assim a higienização pode ser seguida pelo preenchimento.
  const deduplicated = new Map<string, OoxmlCellWrite>()
  for (const write of rawWrites) {
    if (!/^[A-Z]{1,3}[1-9]\d*$/.test(write.address)) {
      throw new Error(`Endereço de célula inválido: ${write.sheet}!${write.address}`)
    }
    deduplicated.set(`${write.sheet}!${write.address}`, write)
  }

  const bySheet = new Map<string, OoxmlCellWrite[]>()
  for (const write of deduplicated.values()) {
    const list = bySheet.get(write.sheet) ?? []
    list.push(write)
    bySheet.set(write.sheet, list)
  }

  let written = 0
  let sanitized = 0
  let formulas = 0
  const missing: string[] = []

  for (const [sheetName, writes] of bySheet) {
    const rid = nameToRid.get(sheetName)
    const target = rid ? ridToTarget.get(rid) : undefined
    if (!target) {
      missing.push(...writes.map((write) => `${sheetName}!${write.address}`))
      continue
    }
    const sheetPath = normalizeSheetPath(target)
    const sheetFile = zip.file(sheetPath)
    if (!sheetFile) {
      missing.push(...writes.map((write) => `${sheetName}!${write.address}`))
      continue
    }

    let sheetXml = sheetFile.asText()
    for (const write of writes) {
      const address = escapeRegex(write.address)
      const cellRegex = new RegExp(
        `<c\\b(?=[^>]*\\br="${address}")[^>]*?\\/\\s*>`
        + `|<c\\b(?=[^>]*\\br="${address}")[^>]*>[\\s\\S]*?<\\/c>`,
      )
      const found = sheetXml.match(cellRegex)
      if (!found) {
        missing.push(`${sheetName}!${write.address}`)
        continue
      }
      const rendered = renderCell(found[0], write)
      if (rendered === found[0]) continue
      sheetXml = sheetXml.replace(cellRegex, rendered)
      written++
      if (write.reason === 'sanitize') sanitized++
      if (write.reason === 'formula' || write.type === 'formula') formulas++
    }
    zip.file(sheetPath, sheetXml)
  }

  ensureRecalculation(zip)
  const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer
  return { buffer, written, sanitized, formulas, missing }
}
