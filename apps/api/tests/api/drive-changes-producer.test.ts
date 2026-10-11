import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DriveChangesService } from '../../src/services/google-workspace/DriveChangesService.js'
import { DriveChangesStore } from '../../src/services/google-workspace/DriveChangesStore.js'
import { DriveChangesError, type DriveChangesCheckpoint, type DriveChangesCorpus, type DriveChangesFile, type DriveChangesPage, type DriveChangesScope, type DriveChangesSource, type DriveMetadataEvent } from '../../src/services/google-workspace/DriveChangesTypes.js'
import { DRIVE_FOLDER_MIME, type DriveCorpusEntry } from '../../src/services/google-workspace/DriveCorpusTypes.js'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }) })
const scope: DriveChangesScope = { tenantId: 'tenant-a', corporateRootIds: ['root'], clientFolders: [{ folderId: 'a', clientId: 'client-a' }, { folderId: 'b', clientId: 'client-b' }] }
const file = (id: string, parents: string[] = [], name = id, mimeType = 'application/pdf'): DriveChangesFile => ({ id, name, mimeType, parents, version: '1', modifiedTime: '2026-09-07T20:00:00Z' })
const folder = (id: string, parents: string[] = [], name = id) => file(id, parents, name, DRIVE_FOLDER_MIME)
const originals = () => [folder('root'), folder('a', ['root']), folder('b', ['root']), folder('project', ['a']), file('document', ['project'])]

function entries(files: DriveChangesFile[], configured = scope): DriveCorpusEntry[] {
  const byId = new Map(files.map(file => [file.id, file]))
  const ancestry = (id: string): string[][] => byId.get(id)?.parents.length ? byId.get(id)!.parents.flatMap(parent => ancestry(parent).map(chain => [...chain, id])) : [[id]]
  return files.map(file => {
    const paths = ancestry(file.id), ids = new Set(paths.flat())
    return { ...file, ancestorPaths: paths, corporateScope: configured.corporateRootIds.some(id => ids.has(id)), linkedClientIds: configured.clientFolders.filter(folder => ids.has(folder.folderId)).map(folder => folder.clientId) }
  })
}

class Source implements DriveChangesSource {
  files = new Map(originals().map(file => [file.id, file]))
  driveIds: string[] = []
  unavailableIds = new Map<string, 'NOT_FOUND' | 'PERMISSION_DENIED'>()
  calls: string[] = []
  changes?: (corpus: DriveChangesCorpus, token: string) => Promise<DriveChangesPage>
  listing?: (corpus: DriveChangesCorpus, token?: string) => Promise<Awaited<ReturnType<DriveChangesSource['listFiles']>>>
  driveListing?: (token?: string) => Promise<Awaited<ReturnType<DriveChangesSource['listDrives']>>>
  key(corpus: DriveChangesCorpus) { return corpus.driveId || 'user' }
  async listDrives(token?: string) { this.calls.push('drives:' + (token || 'first')); return this.driveListing ? this.driveListing(token) : { drives: this.driveIds.map(id => ({ id })) } }
  async getStartPageToken(corpus: DriveChangesCorpus) { this.calls.push('start:' + this.key(corpus)); return this.key(corpus) + '-start' }
  async listFiles(corpus: DriveChangesCorpus, token?: string) { this.calls.push('files:' + this.key(corpus) + ':' + (token || 'first')); return this.listing ? this.listing(corpus, token) : { files: [...this.files.values()].filter(file => !corpus.driveId || file.driveId === corpus.driveId) } }
  async listChanges(corpus: DriveChangesCorpus, token: string) { this.calls.push('changes:' + this.key(corpus) + ':' + token); return this.changes ? this.changes(corpus, token) : { changes: [], newStartPageToken: this.key(corpus) + '-current' } }
  async getFile(id: string) { this.calls.push('file:' + id); if (this.unavailableIds.has(id)) throw new DriveChangesError(this.unavailableIds.get(id)!); const file = this.files.get(id); if (!file) throw new DriveChangesError('NOT_FOUND'); return file }
}

async function fixture(source = new Source(), baseline = [...source.files.values()]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aletis-drive-changes-'))
  roots.push(root)
  await fs.writeFile(path.join(root, 'inventory-entries.jsonl'), entries(baseline).map(entry => JSON.stringify(entry)).join('\n') + (baseline.length ? '\n' : ''))
  await fs.writeFile(path.join(root, 'inventory-aggregate.json'), JSON.stringify({ completedAt: '2026-09-07T21:00:00Z' }))
  const options = { privateRoot: root, tenantId: scope.tenantId, source, getScope: async () => structuredClone(scope), now: () => Date.parse('2026-09-08T10:00:00Z') }
  return { root, source, options, service: new DriveChangesService(options) }
}
const events = async (root: string): Promise<DriveMetadataEvent[]> => (await fs.readFile(path.join(root, 'metadata-events.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const checkpoint = async (root: string) => JSON.parse(await fs.readFile(path.join(root, 'metadata-checkpoint.json'), 'utf8')) as DriveChangesCheckpoint

describe('produtor contínuo Drive: metadados e retomada', () => {
  it('captura todos os tokens antes do scan paginado, sem republicar o inventário idêntico', async () => {
    const { source, root, service } = await fixture()
    source.driveIds = ['shared-1', 'shared-2']
    source.driveListing = async token => token ? { drives: [{ id: 'shared-2' }] } : { drives: [{ id: 'shared-1' }], nextPageToken: 'drives-page-2' }
    source.listing = async (corpus, token) => corpus.driveId ? { files: [] } : token ? { files: [...source.files.values()].slice(2) } : { files: [...source.files.values()].slice(0, 2), nextPageToken: 'files-page-2' }
    const result = await service.syncOnce()
    expect(result).toMatchObject({ status: 'watching', remaining: false })
    expect(await events(root)).toEqual([])
    expect(source.calls.filter(call => call.startsWith('start:'))).toEqual(['start:user', 'start:shared-1', 'start:shared-2'])
    expect(source.calls.findIndex(call => call.startsWith('files:'))).toBeGreaterThan(source.calls.lastIndexOf('start:shared-2'))
    expect((await checkpoint(root)).cursors).toHaveLength(3)
    const progress = await fs.readFile(path.join(root, 'incremental-progress.json'), 'utf8')
    expect(progress).not.toMatch(/pageToken|startPageToken|user-current|shared-1-current/)
  })

  it('drena Changes após o scan e inclui arquivo criado na janela do bootstrap', async () => {
    const { source, root, service, options } = await fixture()
    const late = file('late', ['a'], 'Novo documento.pdf')
    source.changes = async () => ({ changes: [{ fileId: late.id, file: late }], newStartPageToken: 'after-gap' })
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    expect((await events(root)).map(event => event.fileId)).toEqual(['late'])
    expect((await events(root))[0].entry?.linkedClientIds).toEqual(['client-a'])
    expect(await new DriveChangesService(options).syncOnce()).toMatchObject({ status: 'watching' })
    expect(await events(root)).toHaveLength(1)
  })

  it('não declara ausência se incompleteSearch surgir em qualquer página', async () => {
    const { source, root, service } = await fixture()
    source.files.delete('document')
    source.listing = async () => ({ files: [...source.files.values()], incompleteSearch: true })
    expect(await service.syncOnce()).toMatchObject({ status: 'retry', errorCode: 'INCOMPLETE_SEARCH' })
    expect(await events(root)).toEqual([])
    source.listing = undefined
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    expect(await events(root)).toMatchObject([{ kind: 'unavailable', fileId: 'document', reason: 'absent_after_complete_reconciliation' }])
  })

  it('não publica diffs ou ausências de scan parcial quando outra corpora falha', async () => {
    const { source, root, service } = await fixture()
    source.driveIds = ['shared-1']
    source.files.delete('document')
    source.files.set('new', file('new'))
    source.listing = async corpus => { if (corpus.driveId) throw new DriveChangesError('TEMPORARILY_UNAVAILABLE'); return { files: [...source.files.values()] } }
    expect(await service.syncOnce()).toMatchObject({ status: 'retry' })
    expect(await events(root)).toEqual([])
    expect((await checkpoint(root)).mode).toBe('reconciling')
  })

  it('recusa paginação repetida sem avançar cobertura', async () => {
    const { source, root, service } = await fixture()
    source.listing = async () => ({ files: [], nextPageToken: 'repeated' })
    expect(await service.syncOnce()).toMatchObject({ errorCode: 'REPEATED_PAGE' })
    expect(await events(root)).toEqual([])
  })

  it('grava journal antes do checkpoint e repete com idempotência após queda', async () => {
    const { source, root, options } = await fixture()
    let crash = true
    const store = new DriveChangesStore(root, async () => { if (crash) { crash = false; throw new Error('simulated_crash') } })
    const service = new DriveChangesService({ ...options, store })
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    const before = await checkpoint(root)
    const updated = { ...source.files.get('document')!, version: '2' }
    source.changes = async () => ({ changes: [{ fileId: updated.id, file: updated }], newStartPageToken: 'after-change' })
    expect(await service.syncOnce()).toMatchObject({ status: 'retry' })
    expect(await events(root)).toHaveLength(1)
    expect((await checkpoint(root)).cursors).toEqual(before.cursors)
    expect(await new DriveChangesService(options).syncOnce()).toMatchObject({ status: 'watching' })
    expect(await events(root)).toHaveLength(1)
    expect((await checkpoint(root)).cursors[0].pageToken).toBe('after-change')
  })

  it('retoma renomeio quando só a pasta chegou ao journal e o filho ainda não', async () => {
    const { source, root, options } = await fixture()
    let crash = true
    class PartialStore extends DriveChangesStore {
      override async commit(batch: DriveMetadataEvent[], next: DriveChangesCheckpoint) {
        return super.commit(crash && batch.length > 1 ? batch.slice(0, 1) : batch, next)
      }
    }
    const store = new PartialStore(root, async () => { if (crash) { crash = false; throw new Error('after_folder_only') } })
    const service = new DriveChangesService({ ...options, store })
    await service.syncOnce()
    const updated = { ...source.files.get('project')!, name: 'Projeto renomeado', version: '2' }
    source.changes = async () => ({ changes: [{ fileId: 'project', file: updated }], newStartPageToken: 'renamed' })
    expect(await service.syncOnce()).toMatchObject({ status: 'retry' })
    expect((await events(root)).map(event => event.fileId)).toEqual(['project'])
    expect(await new DriveChangesService(options).syncOnce()).toMatchObject({ status: 'watching' })
    expect((await events(root)).map(event => event.fileId)).toEqual(['project', 'document'])
    expect((await events(root))[1].entry?.hierarchyFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it('pasta movida muda descendentes para o cliente correto, ancestral antes do filho', async () => {
    const { source, root, service } = await fixture()
    await service.syncOnce()
    const moved = { ...source.files.get('project')!, parents: ['b'], version: '2' }
    source.changes = async () => ({ changes: [{ fileId: 'project', file: moved }], newStartPageToken: 'moved' })
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    const batch = await events(root)
    expect(batch.map(event => event.fileId)).toEqual(['project', 'document'])
    expect(batch[1].entry).toMatchObject({ version: '1', linkedClientIds: ['client-b'], ancestorPaths: [['root', 'b', 'project', 'document']] })
  })

  it('remoção de pasta suspende filhos e mudança isolada do filho não os restaura', async () => {
    const { source, root, service } = await fixture()
    await service.syncOnce()
    source.unavailableIds.set('project', 'NOT_FOUND')
    source.changes = async () => ({ changes: [{ fileId: 'project', removed: true }], newStartPageToken: 'removed' })
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    expect((await events(root)).map(event => [event.fileId, event.kind])).toEqual([['project', 'unavailable'], ['document', 'unavailable']])
    source.changes = async () => ({ changes: [{ fileId: 'document', file: { ...source.files.get('document')!, version: '2' } }], newStartPageToken: 'child-only' })
    await service.syncOnce()
    expect(await events(root)).toHaveLength(2)
  })

  it('restaura descendentes revogados só depois de reconciliação atual acessível', async () => {
    const { source, root, service } = await fixture()
    await service.syncOnce()
    source.unavailableIds.set('project', 'NOT_FOUND')
    source.changes = async () => ({ changes: [{ fileId: 'project', removed: true }], newStartPageToken: 'removed' })
    await service.syncOnce()
    source.unavailableIds.delete('project')
    source.changes = async () => ({ changes: [{ fileId: 'project', file: source.files.get('project')! }], newStartPageToken: 'restored' })
    expect(await service.syncOnce()).toMatchObject({ status: 'reconciling' })
    expect((await events(root)).filter(event => event.kind === 'upsert').map(event => event.fileId)).toEqual(['project'])
    source.changes = undefined
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    expect((await events(root)).filter(event => event.kind === 'upsert').map(event => event.fileId)).toEqual(['project', 'document'])
  })

  it('revogação 403 de um shared drive suspende as fontes também inacessíveis individualmente', async () => {
    const source = new Source()
    source.driveIds = ['shared-1']
    source.files.set('shared-folder', { ...folder('shared-folder'), driveId: 'shared-1' })
    source.files.set('shared-file', { ...file('shared-file', ['shared-folder']), driveId: 'shared-1' })
    const { service, root } = await fixture(source)
    await service.syncOnce()
    source.unavailableIds.set('shared-folder', 'PERMISSION_DENIED')
    source.unavailableIds.set('shared-file', 'PERMISSION_DENIED')
    source.changes = async corpus => { if (corpus.driveId) throw new DriveChangesError('PERMISSION_DENIED'); return { changes: [], newStartPageToken: 'user-current' } }
    expect(await service.syncOnce()).toMatchObject({ errorCode: 'PERMISSION_DENIED' })
    expect((await events(root)).map(event => [event.fileId, event.kind])).toEqual([['shared-folder', 'unavailable'], ['shared-file', 'unavailable']])
  })

  it('remoção do corpus com acesso confirmado conserva a fonte e reconcilia o conjunto', async () => {
    const { source, root, service } = await fixture()
    await service.syncOnce()
    source.changes = async () => ({ changes: [{ fileId: 'document', removed: true, file: source.files.get('document')! }], newStartPageToken: 'corpus-removed' })
    expect(await service.syncOnce()).toMatchObject({ status: 'reconciling' })
    expect(source.calls).toContain('file:document')
    expect(await events(root)).toMatchObject([{ kind: 'upsert', fileId: 'document', entry: { directAccessOnly: true } }])
    source.changes = undefined
    source.listing = async () => ({ files: [...source.files.values()].filter(file => file.id !== 'document') })
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    expect(await events(root)).toHaveLength(1)
    expect((await events(root)).some(event => event.kind === 'unavailable')).toBe(false)
  })

  it.each(['NOT_FOUND', 'PERMISSION_DENIED'] as const)('remoção do corpus confirmada por %s suspende a fonte', async code => {
    const { source, root, service } = await fixture()
    await service.syncOnce()
    source.unavailableIds.set('document', code)
    source.changes = async () => ({ changes: [{ fileId: 'document', removed: true, file: source.files.get('document')! }], newStartPageToken: 'corpus-removed' })
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    expect(await events(root)).toMatchObject([{ fileId: 'document', kind: 'unavailable' }])
  })

  it('drive omitido confirmado como inacessível suspende antes de scan que falha', async () => {
    const source = new Source()
    source.driveIds = ['shared-1']
    source.files.set('shared-1', { ...folder('shared-1'), driveId: 'shared-1' })
    source.files.set('shared-file', { ...file('shared-file', ['shared-1']), driveId: 'shared-1' })
    const { service, root } = await fixture(source)
    await service.syncOnce()
    source.driveIds = []
    source.unavailableIds.set('shared-1', 'PERMISSION_DENIED')
    source.unavailableIds.set('shared-file', 'PERMISSION_DENIED')
    source.listing = async () => { throw new DriveChangesError('TEMPORARILY_UNAVAILABLE') }
    expect(await service.syncOnce()).toMatchObject({ status: 'retry' })
    expect((await events(root)).map(event => [event.fileId, event.kind])).toEqual([['shared-1', 'unavailable'], ['shared-file', 'unavailable']])
  })

  it('raiz de drive 404 preserva pasta acessível no corpus do usuário sem novo scan em dois ciclos e reinício', async () => {
    const source = new Source()
    source.files.set('shared-folder', { ...folder('shared-folder', [], 'Pasta compartilhada diretamente'), driveId: 'hidden-drive' })
    source.unavailableIds.set('hidden-drive', 'NOT_FOUND')
    const { service, root, options } = await fixture(source)
    expect(await service.syncOnce()).toMatchObject({ status: 'watching', remaining: false })
    const first = await events(root)
    expect(first).toMatchObject([{ kind: 'upsert', fileId: 'shared-folder', entry: { directAccessOnly: true } }])
    expect(source.calls).toContain('file:shared-folder')
    const cursors = (await checkpoint(root)).cursors
    source.calls = []
    expect(await service.syncOnce()).toMatchObject({ status: 'watching', remaining: false })
    expect(await new DriveChangesService(options).syncOnce()).toMatchObject({ status: 'watching', remaining: false })
    expect(source.calls.filter(call => call.startsWith('files:') || call.startsWith('start:'))).toEqual([])
    expect(source.calls.filter(call => call.startsWith('file:'))).toEqual([])
    expect(await events(root)).toEqual(first)
    expect((await checkpoint(root)).cursors).toEqual(cursors)
  })

  it('restaura um tombstone de drive sem repetir a suspensão nem invalidar o cursor', async () => {
    const source = new Source()
    source.files.set('shared-folder', { ...folder('shared-folder'), driveId: 'hidden-drive' })
    const { root, options, service } = await fixture(source)
    await service.syncOnce()
    await fs.appendFile(path.join(root, 'metadata-events.jsonl'), JSON.stringify({ version: 1, eventId: '1'.repeat(64), observedAt: '2026-09-08T10:00:01Z', kind: 'unavailable', fileId: 'shared-folder', reason: 'drive_unavailable' }) + '\n')
    await fs.writeFile(path.join(root, 'metadata-checkpoint.json'), JSON.stringify({ ...await checkpoint(root), mode: 'reconciling', cursors: [] }))
    source.calls = []
    const restarted = new DriveChangesService(options)
    expect(await restarted.syncOnce()).toMatchObject({ status: 'watching' })
    expect(source.calls.filter(call => call.startsWith('files:'))).toEqual(['files:user:first'])
    source.calls = []
    expect(await restarted.syncOnce()).toMatchObject({ status: 'watching' })
    expect((await events(root)).map(event => event.kind)).toEqual(['upsert', 'unavailable', 'upsert'])
    expect(source.calls.filter(call => call.startsWith('files:') || call.startsWith('start:'))).toEqual([])
  })

  it('GET individual 200 preserva a fonte mesmo com pai 404, sem herdar o vínculo CRM desse pai', async () => {
    const source = new Source()
    source.files.set('a', { ...source.files.get('a')!, driveId: 'hidden-drive' })
    source.files.set('project', { ...source.files.get('project')!, driveId: 'hidden-drive' })
    source.files.set('document', { ...source.files.get('document')!, driveId: 'hidden-drive' })
    const { root, options, service } = await fixture(source)
    source.unavailableIds.set('a', 'NOT_FOUND')
    source.listing = async () => ({ files: [...source.files.values()].filter(file => file.id !== 'a') })
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    const first = await events(root)
    expect(first.find(event => event.fileId === 'a')).toMatchObject({ kind: 'unavailable' })
    expect(first.find(event => event.fileId === 'project')).toMatchObject({ kind: 'upsert', entry: { parents: ['a'], ancestorPaths: [['project']], linkedClientIds: [], corporateScope: false } })
    expect(first.find(event => event.fileId === 'document')).toMatchObject({ kind: 'upsert', entry: { ancestorPaths: [['project', 'document']], linkedClientIds: [], corporateScope: false } })
    source.calls = []
    expect(await new DriveChangesService(options).syncOnce()).toMatchObject({ status: 'watching' })
    expect(await events(root)).toEqual(first)
    expect(source.calls.filter(call => call.startsWith('files:'))).toEqual([])
  })

  it('reconciliação e reinício mantêm acesso direto ausente da listagem e detectam revogação individual', async () => {
    const source = new Source()
    source.files.set('shared-folder', { ...folder('shared-folder'), driveId: 'hidden-drive' })
    const { root, options, service } = await fixture(source)
    await service.syncOnce()
    source.listing = async () => ({ files: [...source.files.values()].filter(file => file.id !== 'shared-folder') })
    const later = new DriveChangesService({ ...options, now: () => Date.parse('2026-09-08T17:00:00Z') })
    expect(await later.syncOnce()).toMatchObject({ status: 'watching' })
    expect(await events(root)).toHaveLength(1)
    source.unavailableIds.set('shared-folder', 'NOT_FOUND')
    source.changes = async () => ({ changes: [{ fileId: 'shared-folder', removed: true }], newStartPageToken: 'direct-file-removed' })
    expect(await later.syncOnce()).toMatchObject({ status: 'watching' })
    expect((await events(root)).map(event => event.kind)).toEqual(['upsert', 'unavailable'])
    source.changes = undefined
    expect(await new DriveChangesService({ ...options, now: () => Date.parse('2026-09-08T17:01:00Z') }).syncOnce()).toMatchObject({ status: 'watching' })
    expect(await events(root)).toHaveLength(2)
  })

  it.each(['NOT_FOUND', 'PERMISSION_DENIED'] as const)('falha %s no feed e na listagem preserva os arquivos com GET individual 200', async code => {
    const source = new Source()
    source.driveIds = ['shared-1']
    source.files.set('shared-folder', { ...folder('shared-folder'), driveId: 'shared-1' })
    source.files.set('shared-file', { ...file('shared-file', ['shared-folder']), driveId: 'shared-1' })
    const { root, service } = await fixture(source)
    await service.syncOnce()
    source.changes = async corpus => { if (corpus.driveId) throw new DriveChangesError(code); return { changes: [], newStartPageToken: 'user-current' } }
    expect(await service.syncOnce()).toMatchObject({ errorCode: code })
    expect((await events(root)).map(event => [event.fileId, event.kind])).toEqual([['shared-folder', 'upsert'], ['shared-file', 'upsert']])
    source.changes = undefined
    source.listing = async corpus => { if (corpus.driveId) throw new DriveChangesError(code); return { files: [...source.files.values()] } }
    expect(await service.syncOnce()).toMatchObject({ errorCode: code })
    expect(await events(root)).toHaveLength(2)
    expect((await events(root)).every(event => event.entry?.directAccessOnly === true)).toBe(true)
  })

  it('evento drive removed confirma cada fonte e preserva acessos diretos em ciclos seguintes', async () => {
    const source = new Source()
    source.driveIds = ['shared-1']
    source.files.set('shared-folder', { ...folder('shared-folder'), driveId: 'shared-1' })
    source.files.set('shared-file', { ...file('shared-file', ['shared-folder']), driveId: 'shared-1' })
    source.files.set('shared-lost', { ...file('shared-lost'), driveId: 'shared-1' })
    const { root, service, options } = await fixture(source)
    await service.syncOnce()
    source.unavailableIds.set('shared-lost', 'PERMISSION_DENIED')
    source.changes = async corpus => ({ changes: corpus.driveId ? [] : [{ changeType: 'drive', driveId: 'shared-1', removed: true }, { fileId: 'shared-file', file: source.files.get('shared-file')! }], newStartPageToken: source.key(corpus) + '-removed' })
    expect(await service.syncOnce()).toMatchObject({ status: 'reconciling' })
    expect((await events(root)).map(event => [event.fileId, event.kind])).toEqual(expect.arrayContaining([['shared-folder', 'upsert'], ['shared-file', 'upsert'], ['shared-lost', 'unavailable']]))
    source.changes = undefined; source.driveIds = []
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    source.calls = []
    expect(await new DriveChangesService(options).syncOnce()).toMatchObject({ status: 'watching' })
    expect(source.calls.filter(call => call.startsWith('files:') || call.startsWith('start:'))).toEqual([])
    expect(await events(root)).toHaveLength(3)
  })

  it('autorização pendente e quota têm backoff e nenhum segredo no progresso', async () => {
    const { source, service, root } = await fixture()
    source.driveListing = async () => { throw new DriveChangesError('AUTH_REQUIRED') }
    expect(await service.syncOnce()).toMatchObject({ status: 'awaiting_authorization', errorCode: 'AUTH_REQUIRED', retryAfterMs: 60000 })
    source.driveListing = async () => { throw new DriveChangesError('QUOTA') }
    const first = await service.syncOnce(), second = await service.syncOnce()
    expect(second.retryAfterMs).toBeGreaterThan(first.retryAfterMs)
    expect(await events(root)).toEqual([])
    expect(await fs.readFile(path.join(root, 'incremental-progress.json'), 'utf8')).not.toMatch(/pageToken|credential|Bearer/)
  })

  it('cursor expirado inicia reconciliação nova, com token anterior ao scan', async () => {
    const { source, root, service } = await fixture()
    await service.syncOnce()
    source.changes = async () => { throw new DriveChangesError('CURSOR_EXPIRED') }
    expect(await service.syncOnce()).toMatchObject({ errorCode: 'CURSOR_EXPIRED', retryAfterMs: 1000 })
    expect((await checkpoint(root)).cursors).toEqual([])
    source.calls = []; source.changes = undefined
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    expect(source.calls.indexOf('start:user')).toBeLessThan(source.calls.indexOf('files:user:first'))
    expect(await events(root)).toEqual([])
  })

  it('novo shared drive é reconciliado e apenas fontes novas são publicadas', async () => {
    const { source, root, service } = await fixture()
    await service.syncOnce()
    source.driveIds = ['new-drive']
    source.files.set('new-drive', { ...folder('new-drive'), driveId: 'new-drive' })
    source.files.set('new-sheet', { ...file('new-sheet', ['new-drive'], 'Planilha', 'application/vnd.google-apps.spreadsheet'), driveId: 'new-drive' })
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    expect((await events(root)).map(event => event.fileId)).toEqual(['new-drive', 'new-sheet'])
  })

  it('troca de vínculo por ID recalcula o escopo; nomes não inferem cliente', async () => {
    const { root, options } = await fixture()
    let configured = structuredClone(scope)
    const service = new DriveChangesService({ ...options, getScope: async () => structuredClone(configured) })
    await service.syncOnce()
    configured = { ...configured, clientFolders: [{ folderId: 'a', clientId: 'client-new' }] }
    await service.syncOnce()
    const batch = await events(root)
    expect(batch.find(event => event.fileId === 'document')?.entry?.linkedClientIds).toEqual(['client-new'])
    expect(batch.find(event => event.fileId === 'b')?.entry?.linkedClientIds).toEqual([])
  })

  it('lock único impede dois produtores e é liberado ao encerrar', async () => {
    const { root, service } = await fixture()
    const unlock = await new DriveChangesStore(root).lock()
    try { expect(await service.syncOnce()).toMatchObject({ busy: true }) } finally { await unlock() }
    expect(await service.syncOnce()).toMatchObject({ busy: false, status: 'watching' })
  })

  it('rejeita reutilização do journal em outro tenant', async () => {
    const { options, service, root } = await fixture()
    await service.syncOnce()
    const other = new DriveChangesService({ ...options, tenantId: 'other', getScope: async () => ({ ...scope, tenantId: 'other' }) })
    expect(await other.syncOnce()).toMatchObject({ status: 'retry', errorCode: 'STATE_INVALID' })
    expect((await checkpoint(root)).tenantId).toBe('tenant-a')
    expect(await events(root)).toEqual([])
  })

  it('remove apenas fragmento final incompleto e mantém todas as linhas confirmadas', async () => {
    const { source, options, service, root } = await fixture()
    await service.syncOnce()
    const updated = { ...source.files.get('document')!, version: '2', name: 'Relatório 🌱' }
    source.changes = async () => ({ changes: [{ fileId: 'document', file: updated }], newStartPageToken: 'after' })
    await service.syncOnce()
    const before = await events(root)
    await fs.appendFile(path.join(root, 'metadata-events.jsonl'), '{"partial":"🌱')
    expect(await new DriveChangesService(options).syncOnce()).toMatchObject({ status: 'watching' })
    expect(await events(root)).toEqual(before)
  })

  it('tempo observado nunca antecede o inventário, mesmo se o relógio recuar', async () => {
    const { source, options, root } = await fixture()
    source.files.set('new', file('new'))
    const service = new DriveChangesService({ ...options, now: () => Date.parse('2026-09-01T00:00:00Z') })
    expect(await service.syncOnce()).toMatchObject({ status: 'watching' })
    expect(Date.parse((await events(root))[0].observedAt)).toBeGreaterThanOrEqual(Date.parse('2026-09-07T21:00:00Z'))
  })
})
