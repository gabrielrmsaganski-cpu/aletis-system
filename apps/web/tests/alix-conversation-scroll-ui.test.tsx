import { act, useLayoutEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAlixConversationScroll } from '../src/hooks/alix/useAlixConversationScroll'

type Options = Parameters<typeof useAlixConversationScroll>[0]
let host: HTMLDivElement
let root: Root
let state: ReturnType<typeof useAlixConversationScroll>
let height: number
let contentHeight: number
let position: number
const observers = new Set<ResizeObserverFixture>()

class ResizeObserverFixture {
  observed = new Set<Element>()
  constructor(private callback: ResizeObserverCallback) { observers.add(this) }
  observe(element: Element) { this.observed.add(element) }
  unobserve(element: Element) { this.observed.delete(element) }
  disconnect() { this.observed.clear(); observers.delete(this) }
  trigger() { this.callback([], this as unknown as ResizeObserver) }
}

function Harness({ options }: { options: Options }) {
  state = useAlixConversationScroll(options)
  useLayoutEffect(() => {
    const viewport = state.scrollRef.current!
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, get: () => height },
      scrollHeight: { configurable: true, get: () => contentHeight },
      scrollTop: { configurable: true, get: () => position, set: value => { position = Math.max(0, Math.min(value, contentHeight - height)) } },
    })
  }, [])
  return <div ref={state.scrollRef} onScroll={state.onScroll}><div ref={state.contentRef}>Resposta sintética</div></div>
}

const initial = (): Options => ({ conversationKey: 'session-a', contentVersion: 0, isTyping: false, active: true })
async function render(options: Options) { await act(async () => root.render(<Harness options={options} />)) }
async function resize() { await act(async () => { for (const observer of observers) observer.trigger() }) }
async function userScroll(top: number) {
  await act(async () => {
    state.scrollRef.current!.scrollTop = top
    state.scrollRef.current!.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
}
async function mount(options = initial()) { await render(options); await resize() }

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', ResizeObserverFixture)
  height = 400; contentHeight = 1400; position = 0
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); observers.clear(); vi.unstubAllGlobals() })

describe('Rolagem da conversa ALIX', () => {
  it('abre no fim e acompanha sucessivos trechos de uma resposta', async () => {
    await mount()
    expect(position).toBe(1000)
    contentHeight = 1500
    await render({ ...initial(), contentVersion: 1, isTyping: true })
    expect(position).toBe(1100)
    contentHeight = 1650
    await render({ ...initial(), contentVersion: 2, isTyping: true })
    expect(position).toBe(1250)
    expect(state.hasNewContent).toBe(false)
  })

  it('mantém o histórico em leitura durante o stream e retoma pelo botão de novas respostas', async () => {
    await mount(); await userScroll(220)
    expect(state.isFollowing).toBe(false)
    expect(state.hasNewContent).toBe(false)
    contentHeight = 1550
    await render({ ...initial(), contentVersion: 1, isTyping: true })
    await resize()
    expect(position).toBe(220)
    expect(state.hasNewContent).toBe(true)
    await act(async () => state.scrollToLatest())
    expect(position).toBe(1150)
    expect(state.hasNewContent).toBe(false)
    expect(state.isFollowing).toBe(true)
    contentHeight = 1600
    await render({ ...initial(), contentVersion: 2, isTyping: true })
    expect(position).toBe(1200)
  })

  it('voltar manualmente ao fim limpa o aviso e volta a seguir a resposta', async () => {
    await mount(); await userScroll(300)
    contentHeight = 1500
    await render({ ...initial(), contentVersion: 1 })
    expect(state.hasNewContent).toBe(true)
    await userScroll(1080)
    expect(state.hasNewContent).toBe(false)
    contentHeight = 1600
    await render({ ...initial(), contentVersion: 2 })
    expect(position).toBe(1200)
  })

  it('crescer o composer ou o conteúdo mantém o fim visível sem inventar mensagens novas', async () => {
    await mount()
    height = 260; await resize()
    expect(position).toBe(1140)
    expect(state.hasNewContent).toBe(false)
    contentHeight = 1600; await resize()
    expect(position).toBe(1340)
    expect(state.hasNewContent).toBe(false)
  })

  it('resize e início/fim do indicador de digitação preservam a leitura sem marcar resposta nova', async () => {
    await mount(); await userScroll(200)
    height = 260; contentHeight = 1500; await resize()
    await render({ ...initial(), isTyping: true })
    expect(position).toBe(200)
    expect(state.hasNewContent).toBe(false)
    await render(initial())
    height = 420; await resize()
    expect(position).toBe(200)
    expect(state.hasNewContent).toBe(false)
  })

  it('trocar de conversa descarta o aviso e abre o novo histórico no fim', async () => {
    await mount(); await userScroll(200)
    await render({ ...initial(), contentVersion: 1 })
    expect(state.hasNewContent).toBe(true)
    contentHeight = 700
    await render({ conversationKey: 'session-b', contentVersion: 2, isTyping: false })
    expect(position).toBe(300)
    expect(state.hasNewContent).toBe(false)
    contentHeight = 1200
    await render({ conversationKey: 'session-b', contentVersion: 3, isTyping: false })
    expect(position).toBe(800)
  })

  it('conversa nova e vazia começa no topo, sem herdar posição ou aviso', async () => {
    await mount(); await userScroll(200)
    contentHeight = height
    await render({ conversationKey: null, contentVersion: 1, isTyping: false })
    expect(position).toBe(0)
    expect(state.hasNewContent).toBe(false)
  })

  it('boas-vindas altas começam no topo e continuam legíveis após resize', async () => {
    await mount({ ...initial(), conversationKey: null, isEmpty: true })
    expect(position).toBe(0)
    await userScroll(300)
    height = 280; await resize()
    expect(position).toBe(300)
    expect(state.hasNewContent).toBe(false)
    contentHeight = 1600
    await render({ ...initial(), conversationKey: null, isEmpty: false, contentVersion: 1, isTyping: true })
    expect(position).toBe(1320)
  })

  it('a aba oculta guarda a leitura e sinaliza conteúdo recebido durante a ausência', async () => {
    await mount(); await userScroll(240)
    await render({ ...initial(), active: false })
    height = 0; contentHeight = 0; position = 0
    await resize(); await userScroll(0)
    await render({ ...initial(), active: false, contentVersion: 1, isTyping: true })
    height = 400; contentHeight = 1700
    await render({ ...initial(), active: true, contentVersion: 1, isTyping: false })
    expect(position).toBe(240)
    expect(state.hasNewContent).toBe(true)
  })

  it('voltar à aba que estava no fim exibe a resposta recebida enquanto oculta', async () => {
    await mount()
    await render({ ...initial(), active: false })
    height = 0; contentHeight = 0; position = 0
    await render({ ...initial(), active: false, contentVersion: 1, isTyping: true })
    height = 400; contentHeight = 1700
    await render({ ...initial(), active: true, contentVersion: 1, isTyping: false })
    expect(position).toBe(1300)
    expect(state.hasNewContent).toBe(false)
  })

  it('sessão trocada com aba oculta abre o novo histórico no fim, sem restaurar offset antigo', async () => {
    await mount(); await userScroll(240)
    await render({ ...initial(), active: false })
    height = 0; contentHeight = 0; position = 0
    await render({ conversationKey: 'session-b', active: false, contentVersion: 1, isTyping: false })
    height = 400; contentHeight = 1100
    await render({ conversationKey: 'session-b', active: true, contentVersion: 1, isTyping: false })
    expect(position).toBe(700)
    expect(state.hasNewContent).toBe(false)
  })

  it('observa viewport e conteúdo e remove observadores ao desmontar', async () => {
    await mount()
    expect([...observers][0].observed.has(state.scrollRef.current!)).toBe(true)
    expect([...observers][0].observed.has(state.contentRef.current!)).toBe(true)
    await act(async () => root.render(null))
    expect(observers.size).toBe(0)
  })

  it('mantém fallback de resize em navegadores sem ResizeObserver', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    await render(initial())
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect(position).toBe(1000)
    await userScroll(240)
    height = 280
    await act(async () => window.dispatchEvent(new Event('resize')))
    expect(position).toBe(240)
    expect(state.hasNewContent).toBe(false)
  })
})
