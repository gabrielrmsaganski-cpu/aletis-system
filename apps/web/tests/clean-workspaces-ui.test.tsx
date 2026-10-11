// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { SectionNav, WorkspaceDeck } from '../src/components/ui/SectionNav'
import MetricCard from '../src/components/ui/MetricCard'

let host: HTMLDivElement, root: Root
beforeEach(() => { (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('Navegação e componentes operacionais clean', () => {
  it('identifica a área ativa e delega a troca sem alterar os identificadores do módulo', async () => {
    const change = vi.fn()
    await act(async () => root.render(<SectionNav label="Financeiro" items={[{ id: 'receitas', label: 'Receitas' }, { id: 'despesas', label: 'Despesas' }]} active="receitas" onChange={change} />))
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Receitas')
    await act(async () => host.querySelectorAll<HTMLButtonElement>('button')[1].click())
    expect(change).toHaveBeenCalledWith('despesas')
  })
  it('carrega a ferramenta ao selecioná-la e preserva os valores quando o usuário volta', async () => {
    function Draft() { const [value, setValue] = useState(''); return <input aria-label="Valor" value={value} onChange={event => setValue(event.target.value)} /> }
    await act(async () => root.render(<WorkspaceDeck label="Análises" items={[{ id: 'a', label: 'Primeira', content: <Draft /> }, { id: 'b', label: 'Segunda', content: <p>Outra análise</p> }]} />))
    expect(host.textContent).not.toContain('Outra análise')
    const input = host.querySelector('input')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '1500'); input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => host.querySelectorAll<HTMLButtonElement>('nav button')[1].click())
    expect(host.querySelector('section[hidden] input')).toBe(input)
    await act(async () => host.querySelectorAll<HTMLButtonElement>('nav button')[0].click())
    expect((host.querySelector('section:not([hidden]) input') as HTMLInputElement).value).toBe('1500')
  })
  it('mantém números e contexto sem truncar nem inventar variações', async () => {
    await act(async () => root.render(<MetricCard label="Receitas" value="R$ 123.456.789,00" detail="Competência selecionada" />))
    expect(host.textContent).toContain('R$ 123.456.789,00')
    expect(host.textContent).toContain('Competência selecionada')
    expect(host.querySelector('button')).toBeNull()
  })
  it('usa botão nativo para indicador acionável e anuncia carregamento', async () => {
    const click = vi.fn()
    await act(async () => root.render(<MetricCard label="Clientes" value="8" loading onClick={click} />))
    expect(host.querySelector('button')?.type).toBe('button')
    expect(host.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Carregando indicador')
    await act(async () => host.querySelector('button')!.click())
    expect(click).toHaveBeenCalledOnce()
  })
})
