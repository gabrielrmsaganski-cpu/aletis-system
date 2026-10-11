import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const shared = readFileSync(new URL('../../../web/public/portal-push-handlers.js', import.meta.url), 'utf8')
const portal = readFileSync(new URL('../../../web/public/sw-portal.js', import.meta.url), 'utf8')

function loadWorker(entry: string) {
  const listeners = new Map<string, (event: any) => void>()
  const worker = {
    addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: { claim: vi.fn(), matchAll: vi.fn().mockResolvedValue([]), openWindow: vi.fn().mockResolvedValue(undefined) },
  }
  const context = createContext({ self: worker, importScripts: (path: string) => {
    if (path !== '/portal-push-handlers.js') throw new Error('Import inesperado')
    runInContext(shared, context)
  } })
  runInContext(entry, context)
  return { worker, listeners }
}

describe('recebimento de push nos registros do portal e legado', () => {
  it.each([['raiz legado', shared], ['portal dedicado', portal]])('conserva conteúdo e destino no worker %s sem ativar uma versão por efeito colateral', async (_name, entry) => {
    const { worker, listeners } = loadWorker(entry)
    expect(worker.skipWaiting).not.toHaveBeenCalled()
    expect(worker.clients.claim).not.toHaveBeenCalled()
    let pending: Promise<unknown>
    listeners.get('push')!({
      data: { json: () => ({ title: 'Documento disponível', body: 'Seu documento foi atualizado.', url: '/portal-cliente?aba=documentos', tag: 'documento-1' }) },
      waitUntil: (promise: Promise<unknown>) => { pending = promise },
    })
    await pending!
    expect(worker.registration.showNotification).toHaveBeenCalledWith('Documento disponível', expect.objectContaining({
      body: 'Seu documento foi atualizado.', data: { url: '/portal-cliente?aba=documentos' }, tag: 'documento-1',
    }))
    if (entry === shared) expect([...listeners.keys()]).toEqual(['push', 'notificationclick'])
  })

  it('reutiliza a janela do portal ao abrir uma notificação preservada', async () => {
    const { worker, listeners } = loadWorker(shared)
    const client = { url: 'https://aletis.example/portal-cliente', navigate: vi.fn().mockResolvedValue(undefined), focus: vi.fn().mockResolvedValue(undefined) }
    worker.clients.matchAll.mockResolvedValue([client])
    let pending: Promise<unknown>
    const close = vi.fn()
    listeners.get('notificationclick')!({ notification: { close, data: { url: '/portal-cliente?aba=documentos' } }, waitUntil: (promise: Promise<unknown>) => { pending = promise } })
    await pending!
    expect(close).toHaveBeenCalledOnce()
    expect(client.navigate).toHaveBeenCalledWith('/portal-cliente?aba=documentos')
    expect(client.focus).toHaveBeenCalledOnce()
    expect(worker.clients.openWindow).not.toHaveBeenCalled()
  })
})
