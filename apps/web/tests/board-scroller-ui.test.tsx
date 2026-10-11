import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BoardScroller from '../src/components/ui/BoardScroller'

let host: HTMLDivElement, root: Root
let resize: () => void
beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

const sections = [{ id: 'lead', label: 'Lead', count: 1 }, { id: 'concluido', label: 'Concluído', count: 0 }]
async function render() {
  await act(async () => root.render(<BoardScroller label="Funil de clientes" sections={sections}><div data-board-section="lead">Cliente real</div><div data-board-section="concluido">Nenhum cliente</div></BoardScroller>))
  const body = host.querySelector<HTMLDivElement>('.board-viewport')!, top = host.querySelector<HTMLDivElement>('.board-top-scroll')!
  Object.defineProperty(body, 'scrollWidth', { configurable: true, value: 1000 })
  Object.defineProperty(body, 'clientWidth', { configurable: true, value: 400 })
  await act(async () => resize())
  return { body, top }
}
describe('Rolagem do funil', () => {
  it('mostra a barra superior com a mesma extensão do conteúdo', async () => {
    const { top } = await render()
    expect(top.hidden).toBe(false)
    expect(top.querySelector('input')!.max).toBe('600')
    expect(top.querySelector('input')!.getAttribute('aria-label')).toBe('Rolagem superior do funil')
    expect(host.querySelectorAll('[data-board-section]')).toHaveLength(2)
  })
  it('sincroniza nos dois sentidos, inclusive após reposicionamento pelo teclado', async () => {
    const { body, top } = await render()
    const range = top.querySelector('input')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '220'); range.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(body.scrollLeft).toBe(220)
    await act(async () => { body.scrollLeft = 410; body.dispatchEvent(new Event('scroll')) })
    expect(range.value).toBe('410')
  })
  it('recalcula a extensão e recolhe a barra quando as colunas cabem', async () => {
    const { body, top } = await render()
    Object.defineProperty(body, 'scrollWidth', { value: 400 })
    await act(async () => resize())
    expect(top.hidden).toBe(true)
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Rolar funil para a direita"]')!.disabled).toBe(true)
  })
  it('localiza a última etapa sem filtrar clientes ou disparar alterações de cadastro', async () => {
    const { body } = await render()
    const move = vi.fn(); body.scrollTo = move
    const column = host.querySelector<HTMLElement>('[data-board-section="concluido"]')!
    column.getBoundingClientRect = () => ({ left: 700 } as DOMRect)
    body.getBoundingClientRect = () => ({ left: 100 } as DOMRect)
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Localizar etapa Concluído: 0 clientes"]')!.click())
    expect(move).toHaveBeenCalledWith({ left: 600, behavior: 'auto' })
    expect(host.textContent).toContain('Cliente real')
  })
})
