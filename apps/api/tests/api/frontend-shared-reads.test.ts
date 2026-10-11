import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, apiFetchFull } from '../../../web/src/hooks/useApi.ts'

const deferred = () => {
  let resolve!: (value: Response) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const response = () => new Response(JSON.stringify({ success: true, data: { rows: ['original'] } }))
afterEach(() => vi.unstubAllGlobals())

describe('leituras simultâneas no frontend', () => {
  it('compartilha o transporte entre consumidores, preserva envelopes e isola suas cópias', async () => {
    const pending = deferred()
    const fetch = vi.fn(() => pending.promise)
    vi.stubGlobal('fetch', fetch)
    const first = apiFetch<{ rows: string[] }>('/shared')
    const second = apiFetchFull<{ success: boolean; data: { rows: string[] } }>('/shared')
    expect(fetch).toHaveBeenCalledTimes(1)
    pending.resolve(response())
    const [a, b] = await Promise.all([first, second])
    a.rows.push('local')
    expect(b).toEqual({ success: true, data: { rows: ['original'] } })
    fetch.mockImplementationOnce(async () => response())
    await apiFetch('/shared')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('cancelar um componente não cancela a leitura de outro', async () => {
    const pending = deferred()
    let transportSignal: AbortSignal | null | undefined
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => { transportSignal = init.signal; return pending.promise }))
    const controller = new AbortController()
    const first = apiFetch('/one-cancel', { signal: controller.signal })
    const second = apiFetch('/one-cancel')
    controller.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(transportSignal?.aborted).toBe(false)
    pending.resolve(response())
    await expect(second).resolves.toEqual({ rows: ['original'] })
  })
  it('cancelar todos encerra o transporte e uma nova visita recebe nova leitura', async () => {
    const a = deferred()
    const b = deferred()
    const signals: Array<AbortSignal | null | undefined> = []
    const fetch = vi.fn((_url, init: RequestInit) => { signals.push(init.signal); return signals.length === 1 ? a.promise : b.promise })
    vi.stubGlobal('fetch', fetch)
    const controller = new AbortController()
    const cancelled = apiFetch('/all-cancel', { signal: controller.signal })
    controller.abort()
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
    expect(signals[0]?.aborted).toBe(true)
    const fresh = apiFetch('/all-cancel')
    expect(fetch).toHaveBeenCalledTimes(2)
    a.resolve(response())
    b.resolve(response())
    await fresh
  })
  it('gravação impede que uma leitura posterior reutilize resposta anterior à mudança', async () => {
    const before = deferred()
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      if (init.method === 'POST') return response()
      calls += 1
      return calls === 1 ? before.promise : response()
    }))
    const old = apiFetch('/after-write')
    await apiFetch('/after-write', { method: 'POST', body: '{}' })
    await apiFetch('/after-write')
    expect(calls).toBe(2)
    before.resolve(response())
    await old
  })
  it('não mistura cabeçalhos de identidade e aceita todas as formas de HeadersInit', async () => {
    const requests = [deferred(), deferred()]
    const headers: Headers[] = []
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => { headers.push(new Headers(init.headers)); return requests[headers.length - 1].promise }))
    const first = apiFetch('/headers', { headers: new Headers({ 'X-Context': 'a' }) })
    const second = apiFetch('/headers', { headers: [['X-Context', 'b']] })
    expect(headers.map(value => value.get('x-context'))).toEqual(['a', 'b'])
    requests.forEach(value => value.resolve(response()))
    await Promise.all([first, second])
  })
  it('após concluir a gravação também descarta leituras iniciadas durante a gravação', async () => {
    const mutation = deferred()
    const during = deferred()
    let gets = 0
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => {
      if (init.method === 'POST') return mutation.promise
      gets += 1
      return gets === 1 ? during.promise : Promise.resolve(response())
    }))
    const writing = apiFetch('/writing', { method: 'POST', body: '{}' })
    const oldRead = apiFetch('/writing')
    mutation.resolve(response())
    await writing
    await apiFetch('/writing')
    expect(gets).toBe(2)
    during.resolve(response())
    await oldRead
  })
})
