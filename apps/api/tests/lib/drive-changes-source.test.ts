import { describe, expect, it, vi } from 'vitest'
vi.mock('../../src/services/google-workspace/CorporateDriveCredentials.js', () => ({ getCorporateDriveCredentials: () => { throw new Error('Real credentials must not be used in this fixture') } }))
import { DriveChangesGoogleSource } from '../../src/services/google-workspace/DriveChangesSource.js'
import { GoogleConnectionError } from '../../src/services/google-workspace/connectionErrors.js'

function fixture(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: URL; request: RequestInit }> = []
  const credentials = { getAccessToken: vi.fn(async () => 'private-expired'), refreshAccessToken: vi.fn(async () => 'private-refreshed') }
  const source = new DriveChangesGoogleSource({ credentials, fetch: (async (url: string | URL | Request, request: RequestInit) => {
    calls.push({ url: new URL(String(url)), request })
    const response = responses.shift()
    if (!response) throw new Error('Unexpected HTTP request')
    return new Response(JSON.stringify(response.body), { status: response.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch })
  return { source, credentials, calls }
}

describe('transporte Google Changes somente leitura', () => {
  it('renova token uma vez no 401 e mantém GET e parâmetros de corpus', async () => {
    const { source, credentials, calls } = fixture([{ status: 401, body: { error: { message: 'secret-body' } } }, { status: 200, body: { changes: [], newStartPageToken: 'private-cursor' } }])
    expect(await source.listChanges({ driveId: 'shared-one' }, 'old-cursor')).toEqual({ changes: [], newStartPageToken: 'private-cursor' })
    expect(credentials.refreshAccessToken).toHaveBeenCalledExactlyOnceWith('private-expired')
    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.request.method).toBe('GET')
      expect(call.request.redirect).toBe('error')
      expect(call.url.origin).toBe('https://www.googleapis.com')
      expect(call.url.searchParams.get('driveId')).toBe('shared-one')
      expect(call.url.searchParams.get('includeRemoved')).toBe('true')
      expect(call.url.searchParams.get('includeCorpusRemovals')).toBe('true')
    }
    expect(calls[1].request.headers).toMatchObject({ Authorization: 'Bearer private-refreshed' })
  })

  it('segundo 401 pausa autorização, sem ciclos ou vazamento do corpo', async () => {
    const { source, credentials, calls } = fixture([{ status: 401, body: {} }, { status: 401, body: { error: { message: 'private-token-and-account' } } }])
    await expect(source.listDrives()).rejects.toMatchObject({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' })
    expect(calls).toHaveLength(2)
    expect(credentials.refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('403 de permissão não dispara renovação nem é confundido com quota', async () => {
    const { source, credentials, calls } = fixture([{ status: 403, body: { error: { errors: [{ reason: 'insufficientFilePermissions' }], message: 'private' } } }])
    await expect(source.listFiles({ driveId: 'shared-one' })).rejects.toMatchObject({ code: 'PERMISSION_DENIED', message: 'PERMISSION_DENIED' })
    expect(calls).toHaveLength(1)
    expect(credentials.refreshAccessToken).not.toHaveBeenCalled()
  })

  it.each([429, 403])('quota HTTP %s fica distinguível para backoff do daemon', async status => {
    const { source, credentials } = fixture([{ status, body: { error: { errors: [{ reason: 'rateLimitExceeded' }] } } }])
    await expect(source.listDrives()).rejects.toMatchObject({ code: 'QUOTA' })
    expect(credentials.refreshAccessToken).not.toHaveBeenCalled()
  })

  it('410 exige novo bootstrap e 404 não vira uma página vazia completa', async () => {
    const expired = fixture([{ status: 410, body: {} }])
    await expect(expired.source.listChanges({}, 'expired')).rejects.toMatchObject({ code: 'CURSOR_EXPIRED' })
    const denied = fixture([{ status: 404, body: {} }])
    await expect(denied.source.getFile('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('usa startPageToken por shared drive e a consulta de inventário explicita todas as páginas', async () => {
    const { source, calls } = fixture([{ status: 200, body: { startPageToken: 'start' } }, { status: 200, body: { files: [], nextPageToken: 'more', incompleteSearch: true } }])
    expect(await source.getStartPageToken({ driveId: 'drive-1' })).toBe('start')
    expect(await source.listFiles({ driveId: 'drive-1' }, 'page-2')).toMatchObject({ nextPageToken: 'more', incompleteSearch: true })
    expect(calls[0].url.pathname).toBe('/drive/v3/changes/startPageToken')
    expect(calls[0].url.searchParams.get('driveId')).toBe('drive-1')
    expect(calls[1].url.searchParams.get('corpora')).toBe('drive')
    expect(calls[1].url.searchParams.get('pageToken')).toBe('page-2')
    expect(calls[1].url.searchParams.get('fields')).toContain('incompleteSearch')
    expect(calls.every(call => call.request.method === 'GET')).toBe(true)
  })

  it('valida campos estruturais e ISO com offset antes de publicar', async () => {
    const valid = fixture([{ status: 200, body: { id: 'file-1', name: 'Guia', mimeType: 'application/pdf', modifiedTime: '2026-09-08T10:00:00+00:00', owners: [{ emailAddress: 'private@example.invalid' }] } }])
    const file = await valid.source.getFile('file-1')
    expect(file).toMatchObject({ modifiedTime: '2026-09-08T10:00:00+00:00', parents: [] })
    expect(file).not.toHaveProperty('owners')
    const invalid = fixture([{ status: 200, body: { id: 'file-1', name: 'Guia', mimeType: 'application/pdf', modifiedTime: 'yesterday' } }])
    await expect(invalid.source.getFile('file-1')).rejects.toMatchObject({ code: 'INVALID_SOURCE' })
  })

  it('falha de autorização do provider não chama Google nem imprime segredo', async () => {
    const { source, credentials, calls } = fixture([])
    credentials.getAccessToken.mockRejectedValueOnce(new GoogleConnectionError('AUTH_REQUIRED', 'private-account'))
    await expect(source.listDrives()).rejects.toMatchObject({ code: 'AUTH_REQUIRED', message: 'AUTH_REQUIRED' })
    expect(calls).toEqual([])
  })

  it('recusa identificador com traversal antes da rede', async () => {
    const { source, calls } = fixture([])
    await expect(source.getFile('../other')).rejects.toMatchObject({ code: 'INVALID_SOURCE' })
    expect(calls).toEqual([])
  })
})
