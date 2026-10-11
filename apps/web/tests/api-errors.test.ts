import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, apiFetchFull } from '../src/hooks/useApi'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('Erros HTTP preservam a causa para revisão e nova tentativa', () => {
  it.each([409, 503])('preserva status %s, código e mensagem do servidor', async status => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Mensagem para o consultor', code: status === 409 ? 'REVISION_CONFLICT' : 'PERSISTENCE_ERROR' }), { status })))
    const request = apiFetch('/propostas/offline', { method: 'PATCH', body: '{}' })
    await expect(request).rejects.toBeInstanceOf(ApiError)
    await expect(request).rejects.toMatchObject({ message: 'Mensagem para o consultor', status, code: status === 409 ? 'REVISION_CONFLICT' : 'PERSISTENCE_ERROR' })
  })

  it('aceita a mensagem humana no campo message quando error não existe', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, message: 'Compare a versão atual.' }), { status: 409 })))
    await expect(apiFetch('/propostas/offline', { method: 'PATCH', body: '{}' })).rejects.toThrow('Compare a versão atual.')
  })

  it('preserva revisão e metadados de vínculo no envelope completo', async () => {
    const response = { success: true, data: { id: 'offline', status: 'aceita', revision: 3 }, meta: { contratoId: 'contract-one', negociacaoId: 'deal-one' } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response))))
    expect(await apiFetchFull('/propostas/offline', { method: 'PATCH', body: '{}' })).toEqual(response)
  })

  it('timeout de gravação pede verificar o registro antes de repetir', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('Abortado', 'AbortError'))))))
    const request = apiFetch('/propostas/offline', { method: 'PATCH', body: '{}', timeoutMs: 5000 })
    const assertion = expect(request).rejects.toMatchObject({ code: 'request_timeout', message: expect.stringContaining('Atualize o registro') })
    await vi.advanceTimersByTimeAsync(5000)
    await assertion
  })
})
