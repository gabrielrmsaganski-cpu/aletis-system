import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlixWorkComposer from '../src/components/alix/AlixWorkComposer'
import AlixResponseReader from '../src/components/alix/AlixResponseReader'
import { renderAlixContent } from '../src/components/alix/AlixMessageContent'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const props = () => ({ value: '', disabled: false, sendDisabled: false, replying: false, archived: false, hasAttachments: false, onChange: vi.fn(), onSend: vi.fn(), onCancel: vi.fn(), onAttach: vi.fn(), modelControl: null, quickActions: <span>Preparar parecer</span> })
async function enter(options: KeyboardEventInit = {}) { await act(async () => host.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...options }))) }

describe('composição sem envio acidental', () => {
  it('Enter respeita bloqueio de envio e IME; Shift+Enter mantém a escrita', async () => {
    const data = props()
    await act(async () => root.render(<AlixWorkComposer {...data} sendDisabled />))
    await enter(); expect(data.onSend).not.toHaveBeenCalled()
    await act(async () => root.render(<AlixWorkComposer {...data} />))
    await enter({ shiftKey: true }); await enter({ isComposing: true })
    expect(data.onSend).not.toHaveBeenCalled()
    await enter(); expect(data.onSend).toHaveBeenCalledTimes(1)
  })
  it('teclado de toque usa Enter para escrever e Ctrl+Enter para enviar', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const data = props(); await act(async () => root.render(<AlixWorkComposer {...data} />))
    await enter(); expect(data.onSend).not.toHaveBeenCalled()
    await enter({ ctrlKey: true }); expect(data.onSend).toHaveBeenCalledTimes(1)
  })
  it('atalhos só ocupam espaço quando abertos e abrir não envia trabalho', async () => {
    const data = props(); await act(async () => root.render(<AlixWorkComposer {...data} />))
    expect(host.textContent).not.toContain('Preparar parecer')
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Pedidos rápidos"]')!.click())
    expect(host.textContent).toContain('Preparar parecer')
    expect(data.onSend).not.toHaveBeenCalled()
  })
})

describe('leitura completa da resposta', () => {
  it('tabela longa mantém início, fim e links das fontes', async () => {
    const rows = Array.from({ length: 80 }, (_, i) => `| Documento ${i} | [Fonte ${i}](/api/documentos/${i}) |`)
    await act(async () => root.render(<>{renderAlixContent(['## Evidências', '| Documento | Origem |', '| --- | --- |', ...rows].join('\n'))}</>))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(80)
    expect(host.textContent).toContain('Documento 79')
    expect(host.querySelectorAll('a')[79].getAttribute('href')).toBe('/api/documentos/79')
    expect(host.querySelector('[aria-label="Tabela da resposta"]')?.getAttribute('tabindex')).toBe('0')
  })
  it('código, inclusive incompleto durante transmissão, é literal e não executa links/HTML', async () => {
    await act(async () => root.render(<>{renderAlixContent('```xml\n<script>erro()</script>\n[Documento](javascript:alert(1))\n**literal**')}</>))
    expect(host.querySelector('pre')?.textContent).toContain('**literal**')
    expect(host.querySelector('script')).toBeNull()
    expect(host.querySelector('a')).toBeNull()
  })
  it('leitura ampliada conserva o texto, ajusta tamanho e fecha sem alterar conversa', async () => {
    const close = vi.fn()
    await act(async () => root.render(<AlixResponseReader content="Conclusão com fonte preservada." onClose={close} />))
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Conclusão com fonte preservada.')
    await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="Aumentar texto"]')!.click())
    expect(dialog.querySelector('article')?.style.fontSize).toBe('18px')
    await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="Fechar leitura ampliada"]')!.click())
    expect(close).toHaveBeenCalledTimes(1)
  })
})
