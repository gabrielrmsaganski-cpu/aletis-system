// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { PORTAL_PUSH_SCOPE, usePortalPush, waitForPortalWorker } from '../../../web/src/hooks/usePortalPush.ts'

class WorkerStub extends EventTarget {
  state: ServiceWorkerState = 'installing'
  scriptURL = new URL('/sw-portal.js', window.location.origin).href
}

class RegistrationStub extends EventTarget {
  scope = new URL(PORTAL_PUSH_SCOPE, window.location.origin).href
  active: WorkerStub | null = null
  installing: WorkerStub | null = null
  waiting: WorkerStub | null = null
  pushManager = { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() }
  unregister = vi.fn()
}

const asRegistration = (registration: RegistrationStub) => registration as unknown as ServiceWorkerRegistration
let root: ReturnType<typeof createRoot> | undefined
let element: HTMLDivElement | undefined
let hook: ReturnType<typeof usePortalPush>
let workerDescriptor: PropertyDescriptor | undefined
let pushDescriptor: PropertyDescriptor | undefined
let notificationDescriptor: PropertyDescriptor | undefined

function View() {
  hook = usePortalPush({ token: 'teste-local' })
  return React.createElement('output', null, hook.state)
}

async function mount(registration: RegistrationStub) {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const serviceWorker = {
    getRegistration: vi.fn().mockResolvedValue(asRegistration(registration)),
    register: vi.fn().mockResolvedValue(asRegistration(registration)),
    get ready(): never { throw new Error('O registro principal não pode determinar a ativação do portal') },
  }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') } })
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  await act(async () => root!.render(React.createElement(View)))
  return serviceWorker
}

beforeEach(() => {
  workerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
  pushDescriptor = Object.getOwnPropertyDescriptor(window, 'PushManager')
  notificationDescriptor = Object.getOwnPropertyDescriptor(window, 'Notification')
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  element?.remove()
  for (const [target, key, descriptor] of [
    [navigator, 'serviceWorker', workerDescriptor],
    [window, 'PushManager', pushDescriptor],
    [window, 'Notification', notificationDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(target, key, descriptor)
    else Reflect.deleteProperty(target, key)
  }
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('notificações com registro exclusivo do portal', () => {
  it('não interpreta o worker raiz como inscrição do portal nem remove inscrições legadas', async () => {
    const main = new RegistrationStub()
    main.scope = new URL('/', window.location.origin).href
    const legacy = { unsubscribe: vi.fn(), endpoint: 'https://push.example/antiga' }
    main.pushManager.getSubscription.mockResolvedValue(legacy)
    const serviceWorker = await mount(main)
    expect(serviceWorker.getRegistration).toHaveBeenCalledWith('/portal-cliente')
    expect(element!.textContent).toBe('idle')
    expect(main.pushManager.getSubscription).not.toHaveBeenCalled()
    await act(async () => hook.unsubscribe())
    expect(main.pushManager.getSubscription).not.toHaveBeenCalled()
    expect(legacy.unsubscribe).not.toHaveBeenCalled()
    expect(main.unregister).not.toHaveBeenCalled()
  })

  it('aguarda a ativação do próprio worker e reutiliza uma inscrição existente nesse escopo', async () => {
    const portal = new RegistrationStub()
    const worker = new WorkerStub()
    portal.installing = worker
    const subscription = {
      endpoint: 'https://push.example/portal',
      toJSON: () => ({ endpoint: 'https://push.example/portal', keys: { p256dh: 'teste', auth: 'teste' } }),
      unsubscribe: vi.fn(),
    }
    portal.pushManager.getSubscription.mockResolvedValue(subscription)
    const serviceWorker = await mount(portal)
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { publicKey: 'AA' } })))
      .mockResolvedValueOnce(new Response('{}'))
    vi.stubGlobal('fetch', fetcher)
    let pending: Promise<void>
    await act(async () => { pending = hook.subscribe() })
    expect(serviceWorker.register).toHaveBeenCalledWith('/sw-portal.js', { scope: '/portal-cliente' })
    expect(fetcher).not.toHaveBeenCalled()
    expect(element!.textContent).toBe('pending')
    await act(async () => {
      portal.active = worker
      portal.installing = null
      worker.state = 'activated'
      worker.dispatchEvent(new Event('statechange'))
      await pending!
    })
    expect(element!.textContent).toBe('subscribed')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1][0]).toBe('/api/portal/push/subscribe')
    expect(portal.pushManager.subscribe).not.toHaveBeenCalled()
    expect(subscription.unsubscribe).not.toHaveBeenCalled()
    expect(portal.unregister).not.toHaveBeenCalled()
  })

  it('relata falha de ativação antes de tentar criar ou publicar uma inscrição', async () => {
    const portal = new RegistrationStub()
    const worker = new WorkerStub()
    portal.installing = worker
    await mount(portal)
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    let pending: Promise<void>
    await act(async () => { pending = hook.subscribe() })
    await act(async () => {
      worker.state = 'redundant'
      worker.dispatchEvent(new Event('statechange'))
      await pending!
    })
    expect(element!.textContent).toBe('error')
    expect(hook.errorMsg).toContain('Não foi possível ativar')
    expect(fetcher).not.toHaveBeenCalled()
    expect(portal.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('encerra uma ativação que nunca termina e rejeita um registro de outro escopo', async () => {
    vi.useFakeTimers()
    const portal = new RegistrationStub()
    portal.installing = new WorkerStub()
    const waiting = expect(waitForPortalWorker(asRegistration(portal), '/sw-portal.js')).rejects.toThrow('demorou')
    await vi.advanceTimersByTimeAsync(30000)
    await waiting
    const main = new RegistrationStub()
    main.scope = new URL('/', window.location.origin).href
    await expect(waitForPortalWorker(asRegistration(main), '/sw-portal.js')).rejects.toThrow('não pertence ao portal')
  })
})
