// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import React, { act } from '../../../web/node_modules/react/index.js'
import { createRoot } from '../../../web/node_modules/react-dom/client.js'
import { MemoryRouter, useLocation } from '../../../web/node_modules/react-router-dom/dist/index.js'
import ClienteDemandasTab, { type ClientDemand } from '../../../web/src/components/cliente/ClienteDemandasTab'

const requests = vi.hoisted(() => ({ apiFetch: vi.fn(), apiFetchFull: vi.fn() }))
vi.mock('../../../web/src/hooks/useApi', () => requests)
const demand = (id: string, status: ClientDemand['status']): ClientDemand => ({
  id, clienteId: 'cliente-a', numero: 1, codigo: id, titulo: `Demanda ${id}`, assunto: 'Crédito', categoria: 'credito', status,
  prioridade: 'normal', probabilidade: 10, origem: 'manual', propostaIds: [], documentoIds: [], eventos: [], checklist: [], tags: [], metadata: {},
  criadoEm: '2026-09-01T12:00:00Z', atualizadoEm: '2026-09-01T12:00:00Z', atrasada: false, proximaAcaoAtrasada: false,
  checklistResumo: { total: 0, concluidos: 0, pendentes: 0, percentual: 0 }, totalPropostas: 0, propostasAtivas: 0, propostas: [],
})
let root: ReturnType<typeof createRoot>
let element: HTMLDivElement
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  requests.apiFetch.mockReset().mockResolvedValue([])
  requests.apiFetchFull.mockReset().mockResolvedValue({ success: true, data: [demand('aberta', 'nova'), demand('encerrada', 'concluida')], resumo: { ativas: 1, atrasadas: 0, proximasAcoesHoje: 0, checklistPendentes: 0, totalPropostas: 0, valorPretendido: '0' } })
})
afterEach(async () => { await act(async () => root.unmount()); element.remove() })

function Location() { return React.createElement('output', { 'data-location': true }, useLocation().search) }
async function renderDemand(query: string) {
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [`/clientes/cliente-a?area=negociacao&dealTab=demandas${query}`], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
    React.createElement(Location), React.createElement(ClienteDemandasTab, { clienteId: 'cliente-a', clienteNome: 'Cliente A', onOpenProposals: vi.fn() }),
  )))
}

it('abre exatamente a demanda encerrada do link, mesmo com demandas ativas disponíveis', async () => {
  await renderDemand('&demanda=encerrada')
  expect(element.querySelector('button[aria-pressed="true"]')?.textContent).toContain('Demanda encerrada')
  expect(element.querySelector('main h3')?.textContent).toBe('Demanda encerrada')
})

it('avisa sobre link inexistente sem selecionar outra demanda nem sugerir um cadastro vazio', async () => {
  await renderDemand('&demanda=inexistente')
  expect(element.querySelector('[role="status"]')?.textContent).toContain('não foi encontrada')
  expect(element.querySelector('button[aria-pressed="true"]')).toBeNull()
  expect(element.textContent).not.toContain('Crie a primeira demanda')
})

it('selecionar uma demanda mantém área e subaba na URL compartilhável', async () => {
  await renderDemand('&demanda=encerrada')
  const target = [...element.querySelectorAll('button[aria-pressed]')].find((button) => button.textContent?.includes('Demanda aberta'))!
  await act(async () => target.click())
  const params = new URLSearchParams(element.querySelector('output')?.textContent || '')
  expect(params.get('demanda')).toBe('aberta')
  expect(params.get('area')).toBe('negociacao')
  expect(params.get('dealTab')).toBe('demandas')
})

it('falha de consulta apresenta indisponibilidade em vez de carteira de demandas zerada', async () => {
  requests.apiFetchFull.mockRejectedValue(new Error('Consulta indisponível'))
  await renderDemand('')
  expect(element.querySelector('[role="alert"]')?.textContent).toContain('Consulta indisponível')
  expect(element.textContent).toContain('Não foi possível carregar as demandas')
  expect(element.textContent).not.toContain('Crie a primeira demanda')
})
