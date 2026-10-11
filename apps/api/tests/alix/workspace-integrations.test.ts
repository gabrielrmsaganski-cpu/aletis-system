import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  clients: vi.fn(), list: vi.fn(), file: vi.fn(), download: vi.fn(), enqueue: vi.fn(), get: vi.fn(), google: vi.fn(), whatsapp: vi.fn(), inspect: vi.fn(),
}))
vi.mock('../../src/services/AlixService.js', () => ({ alixGetClientes: mocks.clients }))
vi.mock('../../src/services/google-workspace/drive.js', () => ({ getGoogleDriveService: () => ({ listClientFiles: mocks.list, getClientFile: mocks.file, downloadClientFile: mocks.download }) }))
vi.mock('../../src/services/google-workspace/services.js', () => ({ getGoogleWorkspaceService: () => ({ status: mocks.google }) }))
vi.mock('../../src/services/whatsapp/evolution/EvolutionClient.js', () => ({ getEvolutionClient: () => ({ getRuntimeStatus: mocks.whatsapp }) }))
vi.mock('../../src/services/alix/intake/DocumentIntakeService.js', () => ({ getDocumentIntakeService: () => ({ enqueue: mocks.enqueue, get: mocks.get }) }))
vi.mock('../../src/services/google-workspace/DriveKnowledgeService.js', () => ({ getDriveKnowledgeService: () => ({ inspect: mocks.inspect }) }))
import { buildWorkspaceIntegrationTools } from '../../src/services/alix/tools/workspace-integrations.js'

const actor = { userId: 'user-test', userName: 'Teste', role: 'consultor', tenantId: 'test' }
const file = { id: 'drive-doc', name: 'Contrato agrícola', mimeType: 'application/vnd.google-apps.document', sizeBytes: null, modifiedAt: '2026-09-01T00:00:00Z', url: 'https://docs.google.com/document/d/drive-doc/edit', path: 'Contratos' }
const handler = (name: string, overrides = {}) => buildWorkspaceIntegrationTools({ sessionId: 'test-session', clienteId: 'client-a', actor, ...overrides }).registry[name].handler
beforeEach(() => {
  vi.resetAllMocks()
  mocks.clients.mockReturnValue([{ id: 'client-a' }, { id: 'client-b' }])
  mocks.file.mockResolvedValue(file)
  mocks.download.mockResolvedValue(Buffer.from('Contrato de teste'))
  mocks.get.mockResolvedValue(null)
  mocks.inspect.mockResolvedValue({ source: 'postgresql', checkedAt: '2026-09-07', totals: { notImported: 1 }, files: [] })
  mocks.enqueue.mockResolvedValue({ id: 'document-real', sessionId: 'test-session', filename: 'Contrato agrícola.txt', metadata: { processingState: 'queued' }, extractedText: '' })
})

describe('Documentos do Drive no contexto ALIX', () => {
  it('recusa cliente diferente e arquivo fora da pasta antes de baixar/importar', async () => {
    const importFile = handler('importar_documento_drive_para_alix')
    expect(await importFile({ clienteId: 'client-b', fileId: file.id })).toMatchObject({ success: false, completed: false })
    expect(mocks.file).not.toHaveBeenCalled()
    mocks.file.mockResolvedValue(null)
    expect(await importFile({ fileId: file.id })).toMatchObject({ success: false })
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it('exporta Google Docs e preserva origem sem anunciar cadastro ou análise concluída', async () => {
    const result = await handler('importar_documento_drive_para_alix')({ fileId: file.id })
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({ actor, fileId: file.id, exportMimeType: 'text/plain', maxBytes: 20 * 1024 * 1024 }))
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'test-session', mimetype: 'text/plain', filename: 'Contrato agrícola.txt', source: expect.objectContaining({ type: 'google_drive', fileId: file.id, url: file.url, modifiedAt: file.modifiedAt }) }), { requestedBy: actor.userId, requestedClienteId: 'client-a' })
    expect(mocks.enqueue.mock.calls[0][0]).not.toHaveProperty('clienteId')
    expect(result).toMatchObject({ success: true, imported: true, registeredInCrm: false, documentId: 'document-real', processingState: 'queued', extractedTextAvailable: false })
  })
  it('preserva inventário parcial e pagina apenas os resultados atuais da busca', async () => {
    mocks.list.mockResolvedValue({ files: [file, { ...file, id: 'outro', name: 'CONTRATO 2' }, { ...file, id: 'sem', name: 'Foto', path: 'Fotos' }], status: 'scanning', truncated: true, pendingFolders: 3, updatedAt: '2026-09-06T00:00:00Z' })
    const search = handler('buscar_arquivos_drive_cliente')
    expect(await search({ busca: 'contrato', limite: 1 })).toMatchObject({ matchesInCurrentInventory: 2, nextOffset: 1, inventoryComplete: false, inventoryStatus: 'scanning', files: [{ id: 'drive-doc' }] })
    expect(await search({ busca: 'inexistente' })).toMatchObject({ files: [], inventoryComplete: false })
    expect(mocks.list).toHaveBeenCalledWith({ actor, clientId: 'client-a', limit: 500, refresh: false })
  })
  it('retorna estado real de serviços e não expõe configuração privada', async () => {
    mocks.google.mockResolvedValue({ status: 'error', configured: true, enabled: true, features: { drive: 'Autorização necessária' }, apiKey: 'private' })
    mocks.whatsapp.mockResolvedValue({ provider: 'evolution', status: 'disconnected', configurado: true, reachable: true, checkedAt: 'now', apiKey: 'private', baseUrl: 'private-url' })
    const result = await handler('consultar_integracoes_alix')({})
    expect(result).toMatchObject({ google: { status: 'error' }, whatsapp: { status: 'disconnected', reachable: true } })
    expect(JSON.stringify(result)).not.toContain('private')
  })
  it('não importa depois que a conversa foi cancelada durante o download', async () => {
    const controller = new AbortController()
    mocks.download.mockImplementation(async () => { controller.abort(); return Buffer.from('dados') })
    await expect(handler('importar_documento_drive_para_alix', { signal: controller.signal })({ fileId: file.id })).rejects.toThrow()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it('não baixa arquivo excedente e não afirma sucesso se intake falhar', async () => {
    mocks.file.mockResolvedValue({ ...file, sizeBytes: String(21 * 1024 * 1024) })
    expect(await handler('importar_documento_drive_para_alix')({ fileId: file.id })).toMatchObject({ success: false })
    expect(mocks.download).not.toHaveBeenCalled()
    mocks.file.mockResolvedValue(file)
    mocks.enqueue.mockRejectedValue(new Error('Falha ao persistir documento'))
    expect(await handler('importar_documento_drive_para_alix')({ fileId: file.id })).toMatchObject({ success: false, completed: false, error: 'Falha ao persistir documento' })
  })
  it('reimportação da mesma versão usa identidade estável e alteração gera uma nova identidade', async () => {
    const importFile = handler('importar_documento_drive_para_alix')
    await importFile({ fileId: file.id })
    await importFile({ fileId: file.id })
    expect(mocks.enqueue.mock.calls[0][0].documentId).toBe(mocks.enqueue.mock.calls[1][0].documentId)
    mocks.file.mockResolvedValue({ ...file, modifiedAt: '2026-09-07T12:00:00Z' })
    await importFile({ fileId: file.id })
    expect(mocks.enqueue.mock.calls[2][0].documentId).not.toBe(mocks.enqueue.mock.calls[0][0].documentId)
  })
  it('expõe lacunas de leitura sem dizer que inventário parcial está completo', async () => {
    mocks.list.mockResolvedValue({ files: [file], status: 'scanning', truncated: true, pendingFolders: 3 })
    mocks.inspect.mockResolvedValue({ source: 'postgresql', checkedAt: '2026-09-07', totals: { outdated: 1 }, files: [{ fileId: file.id, freshness: 'outdated', extractionStatus: 'complete' }] })
    expect(await handler('consultar_cobertura_drive_cliente')({})).toMatchObject({ success: true, inventoryComplete: false, pendingFolders: 3, totals: { outdated: 1 }, pending: [{ fileId: file.id, freshness: 'outdated' }] })
  })
  it('erro de persistência não se transforma em ausência de documentos', async () => {
    mocks.list.mockResolvedValue({ files: [file], status: 'complete', truncated: false })
    mocks.inspect.mockRejectedValue(new Error('PostgreSQL indisponível'))
    expect(await handler('consultar_cobertura_drive_cliente')({})).toMatchObject({ success: false, completed: false, error: 'PostgreSQL indisponível' })
  })
})
