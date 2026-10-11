// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import AppDialog from '../src/components/ui/AppDialog'
import AnimatedTabs from '../src/components/ui/AnimatedTabs'
import FilterBar from '../src/components/ui/FilterBar'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

describe('Interações do Design System', () => {
  it('mantém o foco na janela, fecha por Escape e devolve o foco ao acionador', async () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus()
    const close = vi.fn()
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 100, height: 40 }] as unknown as DOMRectList)
    await act(async () => root.render(<AppDialog title="Editar" onClose={close}><input aria-label="Nome" /><button>Salvar</button></AppDialog>))
    const dialog = document.querySelector('[role="dialog"]')!
    const buttons = dialog.querySelectorAll('button')
    const last = buttons[buttons.length - 1]
    last.focus()
    await act(async () => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(buttons[0])
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })))
    expect(close).toHaveBeenCalledOnce()
    await act(async () => root.render(null))
    expect(document.activeElement).toBe(trigger)
    expect(document.body.style.overflow).toBe('')
    trigger.remove()
  })

  it('navega por abas com teclado e ignora abas desabilitadas', async () => {
    function Tabs() { const [active, setActive] = useState('a'); return <AnimatedTabs active={active} onChange={setActive} tabs={[{ id: 'a', label: 'Resumo' }, { id: 'b', label: 'Bloqueada', disabled: true }, { id: 'c', label: 'Documentos' }]} /> }
    await act(async () => root.render(<Tabs />))
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs[0].focus()
    await act(async () => tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    expect(tabs[2].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[2])
    expect(tabs[0].tabIndex).toBe(-1)
  })

  it('informa filtros ativos e aciona a limpeza sem submeter formulário', async () => {
    const clear = vi.fn()
    await act(async () => root.render(<FilterBar activeCount={2} onClear={clear}><input aria-label="Busca" /></FilterBar>))
    expect(host.textContent).toContain('2 ativos')
    const button = host.querySelector('button')!
    expect(button.type).toBe('button')
    await act(async () => button.click())
    expect(clear).toHaveBeenCalledOnce()
  })
})
