import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFetchUrlTool } from '../../src/services/alix/tools/websearch/fetchUrl.js'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
const call = (input = {}) => buildFetchUrlTool().registry.fetch_url.handler({ url: 'https://example.test/article', ...input }) as Promise<any>

describe('leitura progressiva de páginas', () => {
  it('aceita HTML legítimo acima de 2 MB e preserva o limite do conteúdo retornado', async () => {
    const content = 'Este artigo explica as regras de uma consulta documental com evidências verificáveis. '.repeat(80)
    const html = `<html><head><title>Documentação de teste</title></head><body><main><article><h1>Documentação de teste</h1><p>${content}</p></article></main><script type="application/json">${JSON.stringify({ payload: 'x'.repeat(2 * 1024 * 1024) })}</script></body></html>`
    vi.stubGlobal('fetch', vi.fn(async () => new Response(html, { headers: { 'content-type': 'text/html' } })))
    const result = await call({ max_chars: 200 })
    expect(result).toMatchObject({ ok: true, truncated: true, title: 'Documentação de teste' })
    expect(result.content).toContain('evidências verificáveis')
    expect(result.content.length).toBe(201)
    expect(result.contentChars).toBeGreaterThan(200)
  })

  it('interrompe o stream ao atingir o limite e limita configuração excessiva a 16 MB', async () => {
    vi.stubEnv('ALIX_WEB_FETCH_MAX_BYTES', '1024')
    let sent = 0
    const cancelled = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { sent++; controller.enqueue(new Uint8Array(512)) }, cancel: cancelled })
    const fetchMock = vi.fn(async () => new Response(stream))
    vi.stubGlobal('fetch', fetchMock)
    expect(await call()).toMatchObject({ code: 'page_too_large', limitBytes: 1024 })
    expect(cancelled).toHaveBeenCalledTimes(1)
    expect(sent).toBeLessThanOrEqual(4)
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    vi.stubEnv('ALIX_WEB_FETCH_MAX_BYTES', '999999999')
    const cancelDeclared = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel: cancelDeclared }), { headers: { 'content-length': String(17 * 1024 * 1024) } })))
    expect(await call()).toMatchObject({ code: 'page_too_large', limitBytes: 16 * 1024 * 1024 })
    expect(cancelDeclared).toHaveBeenCalledTimes(1)
  })

  it('preserva HTTP 403 sem tentar interpretar o corpo como artigo', async () => {
    const cancelled = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel: cancelled }), { status: 403 })))
    expect(await call()).toEqual({ error: 'HTTP 403', url: 'https://example.test/article' })
    expect(cancelled).toHaveBeenCalledTimes(1)
  })
})
