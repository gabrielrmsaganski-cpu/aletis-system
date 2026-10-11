import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { PortalDriveArchiver, portalDriveCategory, type PortalFolderReservation } from '../../src/services/portal/PortalDriveArchiver.js'
import { PortalProcessingError, type PortalDriveState, type PortalProcessingUpload } from '../../src/services/portal/PortalDocumentProcessingTypes.js'

function fixture() {
  const buffer = Buffer.from('Documento de teste sem dados reais.')
  const upload: PortalProcessingUpload = { id: 'upload-a', clienteId: 'client-a', nomeStorage: 'safe.txt', nomeOriginal: 'Contrato sintético.txt',
    mime: 'text/plain', tamanho: buffer.length, categoria: 'contrato', sha256: createHash('sha256').update(buffer).digest('hex'), metadata: {} }
  const folder = (id: string, name: string, parents: string[]) => ({ id, name, parents, mimeType: 'application/vnd.google-apps.folder', appProperties: {}, trashed: false })
  const files = new Map<string, any>([['root-a', folder('root-a', 'GRUPO TESTE', [])], ['contracts', folder('contracts', '02 - Contratos', ['root-a'])]])
  const reservations = new Map<string, PortalFolderReservation>()
  let sequence = 0; let uploads = 0; let folderCreates = 0; let failAfterUpload = false; let failReads = 0
  const request = vi.fn(async (urlString: string, init: RequestInit = {}, missingAllowed?: boolean) => {
    const url = new URL(urlString)
    if (url.pathname.endsWith('/generateIds')) return { ids: [`reserved-${++sequence}`] }
    if (url.pathname.includes('/upload/') && init.method === 'POST') {
      const body = (init.body as Buffer).toString()
      const metadata = JSON.parse(body.split('\r\n\r\n')[1].split('\r\n--')[0])
      if (files.has(metadata.id)) throw new PortalProcessingError('DRIVE_ID_EXISTS')
      const file = { ...metadata, mimeType: upload.mime, size: String(buffer.length), md5Checksum: createHash('md5').update(buffer).digest('hex') }
      files.set(file.id, file); uploads++
      if (failAfterUpload) { failAfterUpload = false; failReads = 1; throw new Error('timeout após commit remoto') }
      return file
    }
    if (init.method === 'POST') {
      const file = JSON.parse(init.body as string)
      if (files.has(file.id)) throw new PortalProcessingError('DRIVE_ID_EXISTS')
      files.set(file.id, file); folderCreates++; return file
    }
    if (url.searchParams.has('q')) {
      const parent = /^'([^']+)'/.exec(url.searchParams.get('q') || '')?.[1]
      return { files: [...files.values()].filter(file => file.mimeType === 'application/vnd.google-apps.folder' && file.parents.includes(parent)) }
    }
    const id = decodeURIComponent(url.pathname.split('/').pop()!)
    if (failReads && files.get(id)?.mimeType !== 'application/vnd.google-apps.folder') { failReads--; throw new Error('consulta remota temporária indisponível') }
    const value = files.get(id)
    if (!value && !missingAllowed) throw new Error('not found')
    return value || null
  })
  const reserveFolder = vi.fn(async (clientId: string, rootId: string, proposed: PortalFolderReservation) => {
    const key = `${clientId}:${rootId}:${proposed.parentId}:${proposed.name}`
    if (!reservations.has(key)) reservations.set(key, proposed)
    return reservations.get(key)!
  })
  const resolveFolder = vi.fn(async () => ({ rootId: 'root-a', name: 'GRUPO TESTE' }))
  const archiver = () => new PortalDriveArchiver({ request, reserveFolder, resolveFolder })
  return { upload, buffer, files, request, resolveFolder, reserveFolder, archiver,
    counts: () => ({ uploads, folderCreates }), failAfterUpload: () => { failAfterUpload = true },
  }
}

describe('arquivamento idempotente na pasta canônica', () => {
  it('reaproveita pasta de Contratos numerada e confirma hash remoto', async () => {
    const f = fixture(); const checkpoints: PortalDriveState[] = []
    const saved = await f.archiver().archive(f.upload, f.buffer, { status: 'pending' }, async state => { checkpoints.push(structuredClone(state)) })
    expect(saved).toMatchObject({ status: 'archived', rootId: 'root-a', folderId: 'contracts' })
    expect(checkpoints[0]).toMatchObject({ status: 'processing', fileId: 'reserved-1', sha256: f.upload.sha256 })
    expect(f.counts()).toEqual({ uploads: 1, folderCreates: 0 })
    const archived = f.files.get(saved.fileId!)
    expect(archived.appProperties.aletisSha256).toBe(f.upload.sha256)
    expect(archived.name).toBe(f.upload.nomeOriginal)
  })
  it('timeout depois do upload reaproveita o ID persistido após restart', async () => {
    const f = fixture(); f.failAfterUpload(); let state: PortalDriveState = { status: 'pending' }
    await expect(f.archiver().archive(f.upload, f.buffer, state, async next => { state = structuredClone(next) })).rejects.toThrow('timeout')
    expect(state).toMatchObject({ status: 'processing', fileId: 'reserved-1' })
    const saved = await f.archiver().archive(f.upload, f.buffer, state, async next => { state = structuredClone(next) })
    expect(saved.status).toBe('archived'); expect(f.counts().uploads).toBe(1)
  })
  it('falha ao confirmar metadata após upload não duplica o arquivo', async () => {
    const f = fixture(); let state: PortalDriveState = { status: 'pending' }
    await expect(f.archiver().archive(f.upload, f.buffer, state, async next => {
      if (next.status === 'archived') throw new Error('PG temporariamente indisponível')
      state = structuredClone(next)
    })).rejects.toThrow('PG temporariamente')
    await f.archiver().archive(f.upload, f.buffer, state, async () => undefined)
    expect(f.counts().uploads).toBe(1)
  })
  it('cria subpastas oficiais por categoria e reutiliza em novo upload', async () => {
    const f = fixture(); f.upload.categoria = 'fiscal'
    await f.archiver().archive(f.upload, f.buffer, { status: 'pending' }, async () => undefined)
    expect(f.counts()).toEqual({ uploads: 1, folderCreates: 2 })
    await f.archiver().archive({ ...f.upload, id: 'upload-b' }, f.buffer, { status: 'pending' }, async () => undefined)
    expect(f.counts()).toEqual({ uploads: 2, folderCreates: 2 })
    expect([...f.files.values()].filter(file => file.mimeType.endsWith('folder')).map(file => file.name)).toContain('Documentos fiscais')
  })
  it('pasta própria equivalente já existente evita uma árvore nova', async () => {
    const f = fixture(); f.upload.categoria = 'identidade'
    f.files.set('personal', { id: 'personal', name: '01_DOCS_PESSOAIS', parents: ['root-a'], mimeType: 'application/vnd.google-apps.folder', appProperties: {} })
    const saved = await f.archiver().archive(f.upload, f.buffer, { status: 'pending' }, async () => undefined)
    expect(saved.folderId).toBe('personal'); expect(f.counts().folderCreates).toBe(0)
  })
  it('Documentos pessoais não serve de pasta genérica para documentos fiscais', async () => {
    const f = fixture(); f.upload.categoria = 'fiscal'
    f.files.set('personal', { id: 'personal', name: 'Documentos pessoais', parents: ['root-a'], mimeType: 'application/vnd.google-apps.folder', appProperties: {} })
    const saved = await f.archiver().archive(f.upload, f.buffer, { status: 'pending' }, async () => undefined)
    const destination = f.files.get(saved.folderId!)
    const parent = f.files.get(destination.parents[0])
    expect(parent.name).toBe('Documentos')
    expect(parent.id).not.toBe('personal')
    expect(destination.name).toBe('Documentos fiscais')
  })
  it('ambiguidade de subpasta bloqueia antes do envio', async () => {
    const f = fixture(); f.files.set('other-contracts', { id: 'other-contracts', name: '03 - Contratos', parents: ['root-a'], mimeType: 'application/vnd.google-apps.folder', appProperties: {} })
    await expect(f.archiver().archive(f.upload, f.buffer, { status: 'pending' }, async () => undefined)).rejects.toMatchObject({ code: 'DRIVE_FOLDER_AMBIGUOUS' })
    expect(f.counts().uploads).toBe(0)
  })
  it('nunca reutiliza ID reservado que pertence a outro cliente/conteúdo', async () => {
    const f = fixture(); f.files.set('foreign', { id: 'foreign', name: 'Alheio', mimeType: 'text/plain', parents: ['contracts'], appProperties: {}, size: String(f.buffer.length), md5Checksum: createHash('md5').update(f.buffer).digest('hex') })
    await expect(f.archiver().archive(f.upload, f.buffer, { status: 'processing', fileId: 'foreign', rootId: 'root-a', folderId: 'contracts' }, async () => undefined)).rejects.toMatchObject({ code: 'DRIVE_ARCHIVE_INTEGRITY_MISMATCH' })
    expect(f.counts().uploads).toBe(0)
  })
  it('mudança do vínculo canônico exige revisão e preserva o upload anterior', async () => {
    const f = fixture()
    await expect(f.archiver().archive(f.upload, f.buffer, { status: 'processing', rootId: 'old-root', fileId: 'old-file' }, async () => undefined)).rejects.toMatchObject({ code: 'DRIVE_BINDING_CHANGED' })
    expect(f.counts()).toEqual({ uploads: 0, folderCreates: 0 })
  })
  it('cliente sem vínculo utilizável volta à fila sem criar nova raiz', async () => {
    const f = fixture(); f.resolveFolder.mockRejectedValue(new PortalProcessingError('DRIVE_FOLDER_UNLINKED'))
    await expect(f.archiver().archive(f.upload, f.buffer, { status: 'pending' }, async () => undefined)).rejects.toMatchObject({ code: 'DRIVE_FOLDER_UNLINKED' })
    expect(f.request).not.toHaveBeenCalled()
  })
  it('MIME malformado não vira cabeçalho multipart', async () => {
    const f = fixture()
    await expect(f.archiver().archive({ ...f.upload, mime: 'text/plain\r\nInjected: value' }, f.buffer, { status: 'pending' }, async () => undefined)).rejects.toMatchObject({ code: 'UPLOAD_MIME_INVALID' })
    expect(f.request).not.toHaveBeenCalled()
  })
  it('mapeia categorias do portal às pastas existentes do sistema', () => {
    expect(portalDriveCategory('contrato')).toMatchObject({ base: 'Contratos' })
    expect(portalDriveCategory('agro')).toMatchObject({ base: 'Documentos', leaf: 'Atividade rural' })
    expect(portalDriveCategory('outros')).toMatchObject({ base: 'Anexos' })
  })
})
