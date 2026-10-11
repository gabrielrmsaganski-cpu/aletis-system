import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, apiFetchFull } from '../../../web/src/hooks/useApi.ts'

afterEach(() => vi.unstubAllGlobals())

describe('contrato HTTP compartilhado pelo frontend', () => {
  it('retorna diretamente a nota persistida, sem um segundo envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { id: 'nota-1', texto: 'Conversa registrada' } }))))
    expect(await apiFetch('/clientes/exemplo/notas')).toEqual({ id: 'nota-1', texto: 'Conversa registrada' })
  })
  it('preserva null como ausência de recurso', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"success":true,"data":null}')))
    expect(await apiFetch('/ausente')).toBeNull()
  })
  it('mantém o envelope completo quando solicitado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"success":true,"data":[],"total":0}')))
    expect(await apiFetchFull('/lista')).toEqual({ success: true, data: [], total: 0 })
  })
  it('não transforma cancelamento em erro de timeout', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const controller = new AbortController()
    const request = apiFetchFull('/lento', { signal: controller.signal })
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('não apresenta falha de aplicação como sucesso por ter HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"success":false,"error":"Não foi possível persistir"}')))
    await expect(apiFetch('/falha')).rejects.toThrow('Não foi possível persistir')
  })
})
