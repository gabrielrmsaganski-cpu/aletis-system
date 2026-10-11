import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GoogleDriveService } from '../../src/services/google-workspace/drive.js'
import { getGoogleWorkspaceClient } from '../../src/services/google-workspace/client.js'

const actor = { userId: 'test', userName: 'Teste', role: 'consultor', tenantId: 'test' }
const fetchMock = vi.fn()
beforeEach(() => {
  vi.spyOn(getGoogleWorkspaceClient(), 'getAccessToken').mockResolvedValue('synthetic')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Leitura limitada de arquivos Drive', () => {
  it('usa endpoint export e mantém bytes reais do arquivo', async () => {
    fetchMock.mockResolvedValue(new Response('dados teste'))
    const result = await new GoogleDriveService().downloadClientFile({ actor, fileId: 'id/doc', exportMimeType: 'text/plain' })
    expect(result.toString()).toBe('dados teste')
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.googleapis.com/drive/v3/files/id%2Fdoc/export?mimeType=text%2Fplain')
  })
  it('interrompe download que declara tamanho acima do limite', async () => {
    fetchMock.mockResolvedValue(new Response('conteudo', { headers: { 'content-length': '99999' } }))
    await expect(new GoogleDriveService().downloadClientFile({ actor, fileId: 'doc', maxBytes: 4 })).rejects.toThrow('excede o limite')
  })
  it('limita bytes recebidos mesmo sem content-length confiável', async () => {
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('123')); controller.enqueue(new TextEncoder().encode('456')); controller.close() } })))
    await expect(new GoogleDriveService().downloadClientFile({ actor, fileId: 'doc', maxBytes: 4 })).rejects.toThrow('excede o limite')
  })
  it('propaga cancelamento do usuário à requisição', async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(async (_url, options) => {
      controller.abort()
      options.signal.throwIfAborted()
    })
    await expect(new GoogleDriveService().downloadClientFile({ actor, fileId: 'doc', signal: controller.signal })).rejects.toThrow()
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })
  it('não inicia credencial nem rede quando a leitura já foi cancelada', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(new GoogleDriveService().downloadClientFile({ actor, fileId: 'doc', signal: controller.signal })).rejects.toThrow()
    expect(getGoogleWorkspaceClient().getAccessToken).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('recusa ascendência de outro cliente, arquivos na lixeira e pastas', async () => {
    const service = new GoogleDriveService()
    vi.spyOn(service, 'getClientFolder').mockResolvedValue({ googleFolderId: 'client-root' } as Awaited<ReturnType<GoogleDriveService['getClientFolder']>>)
    const google = vi.spyOn(getGoogleWorkspaceClient(), 'googleFetch')
    const metadata = { id: 'file-a', name: 'Fixture.pdf', mimeType: 'application/pdf', parents: ['foreign-root'] }
    google.mockResolvedValueOnce(metadata).mockResolvedValueOnce({ id: 'foreign-root', name: 'Outro cliente', mimeType: 'application/vnd.google-apps.folder', parents: [] })
    expect(await service.getClientFile({ actor, clientId: 'client-fixture', fileId: 'file-a' })).toBeNull()
    google.mockResolvedValueOnce({ ...metadata, parents: ['client-root'], trashed: true })
    expect(await service.getClientFile({ actor, clientId: 'client-fixture', fileId: 'file-a' })).toBeNull()
    google.mockResolvedValueOnce({ ...metadata, parents: ['client-root'], mimeType: 'application/vnd.google-apps.folder' })
    expect(await service.getClientFile({ actor, clientId: 'client-fixture', fileId: 'file-a' })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
