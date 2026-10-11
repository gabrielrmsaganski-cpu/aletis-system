// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import CrmClientList, { type CrmDirectoryRow } from '../src/components/crm/CrmClientList'
import { readCrmView, patchCrmView } from '../src/components/crm/crmViewState'

let host: HTMLDivElement
let root: Root
const handlers = { onSchedule: vi.fn(), onContact: vi.fn(), onAdvance: vi.fn(), onSuggestedAction: vi.fn(), onClearFilters: vi.fn() }
const row = (id: string): CrmDirectoryRow => ({ id, name: `Cliente ${id}`, initials: 'CL', location: 'Cidade/MT', office: 'Matriz', consultant: 'Consultor', stage: 'Negociação', priority: 'Alta', priorityReasons: ['Contato pendente'], health: '50/100', financialValue: 'R$ 10 mil', financialLabel: 'Dívida documentada', financialContext: 'Credor cadastrado', nextAction: 'Revisar documentos', dueLabel: 'Para hoje', overdue: false, insights: ['Revisar próxima ação'], canAdvance: true })
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent?.trim() === name)!
async function render(rows: CrmDirectoryRow[], hasFilters = false) { await act(async () => root.render(<MemoryRouter><CrmClientList rows={rows} hasFilters={hasFilters} {...handlers} /></MemoryRouter>)) }
beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  Object.values(handlers).forEach(fn => fn.mockReset())
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

describe('Carteira simplificada do CRM', () => {
  it('mantém nome, etapa, próxima ação e posição financeira acessíveis na lista', async () => {
    await render([row('a')])
    expect(host.textContent).toContain('Revisar documentos')
    expect(host.textContent).toContain('R$ 10 mil')
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/clientes/a')
    expect(host.textContent).toContain('Negociação')
  })
  it('pagina sem perder clientes e reinicia a página quando os filtros mudam', async () => {
    await render(Array.from({ length: 28 }, (_, i) => row(String(i))))
    expect(host.querySelectorAll('.crm-directory-row')).toHaveLength(25)
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Próxima página"]')!.click())
    expect(host.querySelectorAll('.crm-directory-row')).toHaveLength(3)
    expect(host.textContent).toContain('26–28 de 28')
    await render([row('filtrado')], true)
    expect(host.textContent).toContain('Cliente filtrado')
    expect(host.textContent).toContain('1–1 de 1')
  })
  it('abre contexto completo na ficha lateral e encaminha contato ao cliente correto', async () => {
    await render([row('a')])
    const trigger = host.querySelector<HTMLButtonElement>('[aria-label="Ações e detalhes de Cliente a"]')!
    await act(async () => trigger.click())
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Consultor')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Contato pendente')
    await act(async () => button('Registrar contato').click())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
    expect(handlers.onContact).toHaveBeenCalledWith('a')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it('oferece limpeza de filtros no estado vazio e agendamento quando falta uma ação', async () => {
    await render([], true)
    await act(async () => button('Limpar filtros').click())
    expect(handlers.onClearFilters).toHaveBeenCalledOnce()
    await render([{ ...row('b'), nextAction: undefined, dueLabel: 'Sem próxima ação' }])
    await act(async () => button('Definir próxima ação').click())
    expect(handlers.onSchedule).toHaveBeenCalledWith('b')
  })
  it('mostra recomendações idênticas uma vez sem descartar recomendações distintas', async () => {
    await render([{ ...row('a'), insights: ['Conferir documentação', 'Conferir documentação', 'Retomar contato'] }])
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Ações e detalhes de Cliente a"]')!.click())
    const items = [...document.querySelectorAll('[role="dialog"] li')].map(item => item.textContent)
    expect(items.filter(text => text === 'Conferir documentação')).toHaveLength(1)
    expect(items).toContain('Retomar contato')
  })
  it('preserva escritório, busca, etapa, ordenação e modo em URLs compartilháveis', () => {
    const initial = new URLSearchParams('escritorio=Canarana&q=Joao&estagio=negociacao&novo=1')
    const next = patchCrmView(initial, { operationalFilter: 'atrasados', viewMode: 'kanban', sortKey: 'nome', sortDir: 'asc' })
    expect(readCrmView(next)).toMatchObject({ officeFilter: 'Canarana', searchQuery: 'Joao', stageFilter: 'negociacao', operationalFilter: 'atrasados', viewMode: 'kanban', sortKey: 'nome', sortDir: 'asc' })
    expect(next.get('novo')).toBe('1')
  })
})
