/**
 * Minimal streaming parser for dBase III/IV (.dbf) files.
 *
 * SICAR shapefiles ship `.shp` + `.dbf` per município; só os atributos do
 * `.dbf` nos interessam (CPF/CNPJ, NOME, COD_IMOVEL, NUM_AREA, ...).
 *
 * Formato:
 *  - 32-byte header (version, record count, header size, record size)
 *  - sequência de descritores de campo (32 bytes cada) até sentinela 0x0D
 *  - N registros; cada um começa com um byte de "deletion flag" (0x20 ativo)
 *  - encoding default = latin1 (ISO-8859-1) — SICAR usa este
 */
import { openSync, readSync, closeSync, statSync } from 'fs'

export interface DbfField {
  name: string
  type: string // 'C'|'N'|'D'|'L'|'F'|'M'|'T'
  length: number
  decimals: number
  offset: number // cumulative offset within record
}

export interface DbfHeader {
  version: number
  recordCount: number
  headerSize: number
  recordSize: number
  fields: DbfField[]
}

export type DbfValue = string | number | boolean | Date | null

/**
 * Lê o header do DBF — retorna metadados e a posição do primeiro registro.
 */
export function readDbfHeader(fd: number): DbfHeader {
  const head = Buffer.alloc(32)
  readSync(fd, head, 0, 32, 0)
  const version = head[0]
  const recordCount = head.readUInt32LE(4)
  const headerSize = head.readUInt16LE(8)
  const recordSize = head.readUInt16LE(10)

  const fields: DbfField[] = []
  let offset = 1 // byte 0 do registro = flag de deleção
  let pos = 32

  const fieldBuf = Buffer.alloc(32)
  while (pos < headerSize - 1) {
    readSync(fd, fieldBuf, 0, 32, pos)
    if (fieldBuf[0] === 0x0d) break // terminador
    const name = fieldBuf.toString('ascii', 0, 11).replace(/\0.*$/, '').trim()
    const type = String.fromCharCode(fieldBuf[11])
    const length = fieldBuf[16]
    const decimals = fieldBuf[17]
    fields.push({ name, type, length, decimals, offset })
    offset += length
    pos += 32
  }

  return { version, recordCount, headerSize, recordSize, fields }
}

/**
 * Itera pelos registros em um DBF. Usa leitura em chunks para não carregar
 * arquivos grandes inteiros em memória.
 */
export function* iterateDbf(
  filePath: string,
  options: { encoding?: BufferEncoding; batchSize?: number } = {}
): Generator<Record<string, DbfValue>> {
  const encoding = options.encoding ?? 'latin1'
  const batchSize = options.batchSize ?? 1000

  const fd = openSync(filePath, 'r')
  try {
    const header = readDbfHeader(fd)
    const fileSize = statSync(filePath).size
    const maxRecords = Math.min(
      header.recordCount,
      Math.floor((fileSize - header.headerSize) / header.recordSize)
    )

    const chunkBytes = header.recordSize * batchSize
    const buf = Buffer.alloc(chunkBytes)
    let recordsRead = 0

    while (recordsRead < maxRecords) {
      const toRead = Math.min(batchSize, maxRecords - recordsRead)
      const bytes = toRead * header.recordSize
      const pos = header.headerSize + recordsRead * header.recordSize
      const read = readSync(fd, buf, 0, bytes, pos)
      if (read === 0) break

      for (let i = 0; i < toRead; i++) {
        const start = i * header.recordSize
        const flag = buf[start]
        if (flag === 0x2a) continue // registro marcado como deletado
        const rec: Record<string, DbfValue> = {}
        for (const f of header.fields) {
          const raw = buf.toString(encoding, start + f.offset, start + f.offset + f.length)
          rec[f.name] = parseField(raw, f)
        }
        yield rec
      }
      recordsRead += toRead
    }
  } finally {
    closeSync(fd)
  }
}

function parseField(raw: string, field: DbfField): DbfValue {
  const v = raw.replace(/\0+$/g, '').trim()
  if (v === '') return null
  switch (field.type) {
    case 'C':
    case 'M':
      return v
    case 'N':
    case 'F': {
      const n = Number(v)
      return isFinite(n) ? n : null
    }
    case 'L': {
      const c = v.toUpperCase()
      if ('TY'.includes(c)) return true
      if ('FN'.includes(c)) return false
      return null
    }
    case 'D': {
      if (v.length !== 8) return null
      const y = Number(v.slice(0, 4))
      const m = Number(v.slice(4, 6)) - 1
      const d = Number(v.slice(6, 8))
      const dt = new Date(Date.UTC(y, m, d))
      return isNaN(dt.getTime()) ? null : dt
    }
    default:
      return v
  }
}
