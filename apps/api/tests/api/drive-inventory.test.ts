import { describe, expect, it, vi, afterEach } from 'vitest'
import { advanceDriveInventory, startDriveInventory, type DriveInventoryState, type DrivePage } from '../../src/services/google-workspace/DriveInventory.js'
import { GoogleDriveService } from '../../src/services/google-workspace/drive.js'
import { getGoogleWorkspaceClient } from '../../src/services/google-workspace/client.js'

const file = (id: string) => ({ id, name: `${id}.pdf`, mimeType: 'application/pdf' })
const folder = (id: string) => ({ id, name: id, mimeType: 'application/vnd.google-apps.folder' })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('Inventário retomável do Drive', () => {
  it('retoma na página exata após interrupção, sem perder subpastas nem duplicar arquivos', async () => {
    let persisted = startDriveInventory('root')
    const save = async (state: DriveInventoryState) => { persisted = structuredClone(state) }
    const fetchPage = vi.fn(async (id: string, page?: string): Promise<DrivePage> => {
      if (id === 'root' && !page) return { files: [file('a'), folder('contratos')], nextPageToken: 'p2' }
      if (id === 'root') return { files: [file('a'), file('b'), folder('contratos')] }
      return { files: [file('c')] }
    })
    await advanceDriveInventory({ state: persisted, save, fetchPage, maxPages: 1 })
    expect(persisted.completedAt).toBeNull()
    expect(persisted.pending[0]).toMatchObject({ id: 'root', pageToken: 'p2' })
    const restored = JSON.parse(JSON.stringify(persisted))
    const result = await advanceDriveInventory({ state: restored, save, fetchPage })
    expect(result.completedAt).toBeTruthy()
    expect(result.files.map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(result.files.find(item => item.id === 'c')?.path).toBe('contratos')
    expect(fetchPage.mock.calls.map(([id, page]) => [id, page])).toEqual([
      ['root', undefined], ['root', 'p2'], ['contratos', undefined],
    ])
  })

  it('preserva cursor e resultado parcial quando Google falha', async () => {
    let persisted = startDriveInventory('root')
    persisted.pending[0].pageToken = 'p2'
    const failed = await advanceDriveInventory({
      state: persisted, save: async value => { persisted = structuredClone(value) },
      fetchPage: async () => { throw new Error('Google indisponível') },
    })
    expect(failed.lastError).toBe('Google indisponível')
    expect(persisted.pending[0].pageToken).toBe('p2')
    expect(persisted.completedAt).toBeNull()
    const done = await advanceDriveInventory({ state: persisted, save: async () => {}, fetchPage: async () => ({ files: [file('final')] }) })
    expect(done.lastError).toBeNull()
    expect(done.completedAt).toBeTruthy()
  })

  it('persiste a página inteira mesmo quando o provedor ultrapassa o tamanho solicitado', async () => {
    const state = await advanceDriveInventory({
      state: startDriveInventory('root'), maxFiles: 1, save: async () => {},
      fetchPage: async () => ({ files: [file('a'), file('b'), folder('extra')] }),
    })
    expect(state.files.map(item => item.id)).toEqual(['a', 'b'])
    expect(state.pending.map(item => item.id)).toEqual(['extra'])
    expect(state.completedAt).toBeNull()
  })

  it('não conclui inventário vazio quando o orçamento expira antes da leitura', async () => {
    const fetchPage = vi.fn()
    const result = await advanceDriveInventory({ state: startDriveInventory('root'), durationMs: 0, save: async () => {}, fetchPage })
    expect(fetchPage).not.toHaveBeenCalled()
    expect(result.completedAt).toBeNull()
    expect(result.pending).toHaveLength(1)
  })

  it('não avança para outra página se o checkpoint não for salvo', async () => {
    const fetchPage = vi.fn(async () => ({ files: [file('a')], nextPageToken: 'p2' }))
    await expect(advanceDriveInventory({
      state: startDriveInventory('root'), fetchPage, save: async () => { throw new Error('disco indisponível') },
    })).rejects.toThrow('disco indisponível')
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('consulta o arquivo selecionado pela ascendência, sem depender de inventário incompleto', async () => {
    const service = new GoogleDriveService()
    vi.spyOn(service, 'getClientFolder').mockResolvedValue({ googleFolderId: 'root' } as any)
    const googleFetch = vi.spyOn(getGoogleWorkspaceClient(), 'googleFetch').mockImplementation(async (_actor, url) => {
      if (url.includes('/chosen?')) return { ...file('chosen'), parents: ['deep'] }
      if (url.includes('/deep?')) return { ...folder('deep'), name: 'Contratos', parents: ['root'] }
      throw new Error(`Consulta inesperada: ${url}`)
    })
    const result = await service.getClientFile({
      actor: { tenantId: 'test', userId: 'test', userName: 'Teste', role: 'admin' }, clientId: 'cli-test', fileId: 'chosen',
    })
    expect(result).toMatchObject({ id: 'chosen', path: 'Contratos' })
    expect(googleFetch).toHaveBeenCalledTimes(2)
  })
  it('preserva revisão e atalhos no inventário para indicar limites reais de leitura', async () => {
    const result = await advanceDriveInventory({
      state: startDriveInventory('root'), save: async () => {},
      fetchPage: async () => ({ files: [{ ...file('a'), version: '15', md5Checksum: 'abc' }, { id: 'link', name: 'Atalho', mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: 'original' } }] }),
    })
    expect(result.files[0]).toMatchObject({ version: '15', md5Checksum: 'abc' })
    expect(result.files[1]).toMatchObject({ shortcutTargetId: 'original' })
  })
  it('descobre pasta existente após a primeira página sem criar duplicata', async () => {
    vi.stubEnv('GOOGLE_DRIVE_ROOT_FOLDER_ID', 'root')
    const service = new GoogleDriveService()
    const fetch = vi.spyOn(getGoogleWorkspaceClient(), 'googleFetch').mockResolvedValueOnce({ files: [{ id: 'other', name: 'GRUPO OUTRO' }], nextPageToken: 'next' })
      .mockResolvedValueOnce({ files: [{ id: 'matched', name: 'GRUPO MARIA OLIVEIRA' }] })
      .mockResolvedValueOnce({ files: [{ id: 'child', name: 'CONTRATOS' }] })
    const result = await (service as any).findExistingDriveFolder({ tenantId: 'test', userId: 'test', userName: 'Teste', role: 'admin' }, 'Maria Oliveira')
    expect(result).toMatchObject({ id: 'matched', subfolders: [{ id: 'child' }] })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(new URL(fetch.mock.calls[1][1]).searchParams.get('pageToken')).toBe('next')
    expect(fetch.mock.calls.every(call => call[2]?.method !== 'POST')).toBe(true)
  })
  it('repetição de cursor na descoberta de pastas não é tratada como ausência', async () => {
    vi.stubEnv('GOOGLE_DRIVE_ROOT_FOLDER_ID', 'root')
    vi.spyOn(getGoogleWorkspaceClient(), 'googleFetch').mockResolvedValue({ files: [], nextPageToken: 'same' })
    await expect((new GoogleDriveService() as any).findExistingDriveFolder({ tenantId: 'test', userId: 'test', userName: 'Teste', role: 'admin' }, 'Cliente')).rejects.toThrow('não foi concluída')
  })
})
