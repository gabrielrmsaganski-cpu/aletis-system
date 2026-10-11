import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: true, limit: vi.fn(), returning: vi.fn(), write: vi.fn(), fetch: vi.fn() }))
vi.mock('../../src/db/client.js', () => ({
  isPgEnabled: () => mocks.enabled,
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: mocks.returning }) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: mocks.write }) }) }),
  }),
}))
vi.mock('../../src/services/google-workspace/client.js', () => ({ getGoogleWorkspaceClient: () => ({ googleFetch: mocks.fetch }) }))
vi.mock('../../src/services/google-workspace/audit.js', () => ({ getGoogleWorkspaceAuditService: () => ({ record: vi.fn() }) }))
vi.mock('../../src/services/core/ClientCoreService.js', () => ({ getClientCoreService: () => ({ addTimelineEvent: vi.fn() }) }))
import { GoogleDriveService } from '../../src/services/google-workspace/drive.js'
import { startDriveInventory } from '../../src/services/google-workspace/DriveInventory.js'

const actor = { userId: 'owner', tenantId: 'fixture', userName: 'Teste', role: 'admin' }
let directory = ''
beforeEach(async () => {
  vi.resetAllMocks(); mocks.enabled = true
  directory = await mkdtemp(join(tmpdir(), 'aletis-drive-persistence-'))
  vi.stubEnv('GOOGLE_DRIVE_INVENTORY_DIR', directory)
  vi.stubEnv('GOOGLE_DRIVE_ROOT_FOLDER_ID', '')
  vi.stubEnv('GOOGLE_DRIVE_SHARED_DRIVE_ID', '')
  mocks.limit.mockResolvedValue([])
  mocks.fetch.mockResolvedValue({ id: 'synthetic-folder' })
})
afterEach(async () => { vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }) })

describe('Drive usa persistência canônica sem sucesso falso', () => {
  it('erro de leitura PG não retorna vínculo da memória', async () => {
    mocks.limit.mockRejectedValue(new Error('PG indisponível'))
    await expect(new GoogleDriveService().getClientFolder(actor, 'client')).rejects.toThrow('PG indisponível')
  })
  it('falha ao salvar vínculo não contamina o cache nem informa criação persistida', async () => {
    const service = new GoogleDriveService()
    const clientId = randomUUID()
    mocks.returning.mockRejectedValue(new Error('Gravação PG falhou'))
    await expect(service.createClientFolder({ actor, clientId, clientName: 'Cliente Sintético' })).rejects.toThrow('Gravação PG falhou')
    mocks.enabled = false
    expect(await service.getClientFolder(actor, clientId)).toBeNull()
  })
  it('inventário ausente em PG não é ressuscitado do cache de disco', async () => {
    const service = new GoogleDriveService()
    const clientId = 'client-legacy'
    const path = join(directory, `${createHash('sha256').update(`${actor.tenantId}:${clientId}`).digest('hex')}.json`)
    await writeFile(path, JSON.stringify(startDriveInventory('stale-root')))
    mocks.limit.mockResolvedValue([{ metadata: {} }])
    expect(await (service as any).loadInventory(actor, clientId)).toBeNull()
    mocks.enabled = false
    expect(await (service as any).loadInventory(actor, clientId)).toMatchObject({ rootFolderId: 'stale-root' })
  })
  it('vínculo removido/trocado impede checkpoint e escrita no disco', async () => {
    const service = new GoogleDriveService()
    const clientId = 'client-removed'
    mocks.write.mockResolvedValue([])
    await expect((service as any).saveInventory(actor, clientId, startDriveInventory('root'))).rejects.toThrow('vínculo do cliente')
    const path = join(directory, `${createHash('sha256').update(`${actor.tenantId}:${clientId}`).digest('hex')}.json`)
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
