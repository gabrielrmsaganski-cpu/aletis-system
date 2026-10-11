import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
const mocks = vi.hoisted(() => ({ file: vi.fn(), download: vi.fn() }))
vi.mock('../../src/services/google-workspace/drive.js', () => ({ getGoogleDriveService: () => ({ getClientFile: mocks.file, downloadClientFile: mocks.download }) }))
import { readDriveFileForImport, MAX_DRIVE_IMPORT_BYTES } from '../../src/services/google-workspace/DriveImportReader.js'
const actor = { userId: 'owner', userName: 'Owner', role: 'consultor', tenantId: 'test' }
const base = { id: 'file-123', name: 'Arquivo', mimeType: 'application/pdf', sizeBytes: '10', modifiedAt: '2026-09-01T00:00:00Z', url: 'https://drive.google.com/file/d/file-123/view', path: 'Documentos' }
const input = { actor, clientId: 'client-1', fileId: base.id }
beforeEach(() => { vi.clearAllMocks(); mocks.file.mockResolvedValue(base); mocks.download.mockResolvedValue(Buffer.from('documento de teste')) })
describe('leitor de importação compartilhado CRM/ALIX', () => {
  it.each([
    ['application/vnd.google-apps.document', 'text/plain', '.txt'],
    ['application/vnd.google-apps.spreadsheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
    ['application/vnd.google-apps.presentation', 'application/pdf', '.pdf'],
  ])('exporta %s com limite e origem verificável', async (mimeType, mimetype, extension) => {
    mocks.file.mockResolvedValue({ ...base, mimeType, sizeBytes: null })
    const result = await readDriveFileForImport(input)
    expect(result).toMatchObject({ filename: `Arquivo${extension}`, mimetype, source: { type: 'google_drive', fileId: base.id, modifiedAt: base.modifiedAt, url: base.url, originalName: base.name, originalMimeType: mimeType, exportMimeType: mimetype, sizeBytes: null } })
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ actor, fileId: base.id, exportMimeType: mimetype, maxBytes: MAX_DRIVE_IMPORT_BYTES }))
  })
  it('não baixa arquivo fora do cliente, formato inválido ou tamanho excessivo', async () => {
    for (const file of [null, { ...base, mimeType: 'application/x-msdownload' }, { ...base, sizeBytes: String(MAX_DRIVE_IMPORT_BYTES + 1) }, { ...base, sizeBytes: 'desconhecido' }]) {
      mocks.file.mockResolvedValue(file)
      await expect(readDriveFileForImport(input)).rejects.toThrow()
    }
    expect(mocks.download).not.toHaveBeenCalled()
  })
  it('valida o tamanho real e interrompe após cancelamento', async () => {
    mocks.download.mockResolvedValueOnce(Buffer.alloc(MAX_DRIVE_IMPORT_BYTES + 1))
    await expect(readDriveFileForImport(input)).rejects.toThrow('20 MB')
    const controller = new AbortController()
    mocks.download.mockImplementationOnce(async () => { controller.abort(); return Buffer.from('ok') })
    await expect(readDriveFileForImport({ ...input, signal: controller.signal })).rejects.toThrow()
  })
  it('propaga o deadline para metadata, ascendência e conteúdo', async () => {
    const signal = AbortSignal.timeout(1000)
    await readDriveFileForImport({ ...input, signal })
    expect(mocks.file).toHaveBeenCalledWith(expect.objectContaining({ signal }))
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ signal }))
    const controller = new AbortController()
    controller.abort()
    mocks.file.mockClear(); mocks.download.mockClear()
    await expect(readDriveFileForImport({ ...input, signal: controller.signal })).rejects.toThrow()
    expect(mocks.file).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled()
  })
  it('registra revisão, origem, escopo e hash real dos bytes recebidos', async () => {
    const buffer = Buffer.from('documento íntegro')
    const md5Checksum = createHash('md5').update(buffer).digest('hex')
    mocks.file.mockResolvedValue({ ...base, version: '21', md5Checksum })
    mocks.download.mockResolvedValue(buffer)
    const result = await readDriveFileForImport(input)
    expect(result.source).toMatchObject({ version: '21', md5Checksum, contentSha256: createHash('sha256').update(buffer).digest('hex'), tenantId: actor.tenantId, requestedClienteId: input.clientId })
    expect(result.source.revisionKey).toMatch(/^[a-f0-9]{64}$/)
    expect(result.source.verifiedAt).toBe(result.source.importedAt)
    expect(mocks.file).toHaveBeenCalledTimes(2)
  })
  it('recusa revisão alterada ou pasta perdida durante o download', async () => {
    for (const after of [{ ...base, version: '2' }, null]) {
      mocks.file.mockReset().mockResolvedValueOnce({ ...base, version: '1' }).mockResolvedValueOnce(after)
      await expect(readDriveFileForImport(input)).rejects.toThrow('alterado ou saiu da pasta')
    }
  })
  it('recusa bytes corrompidos mesmo quando o Drive declara a mesma revisão', async () => {
    mocks.file.mockResolvedValue({ ...base, md5Checksum: createHash('md5').update('outro conteúdo').digest('hex') })
    await expect(readDriveFileForImport(input)).rejects.toThrow('integridade')
  })
  it('não registra arquivo vazio como leitura concluída', async () => {
    mocks.download.mockResolvedValue(Buffer.alloc(0))
    await expect(readDriveFileForImport(input)).rejects.toThrow('vazio')
  })
})
