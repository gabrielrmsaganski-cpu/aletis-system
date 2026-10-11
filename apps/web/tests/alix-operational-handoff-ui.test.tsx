import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AlixOperationsPanel from '../src/components/alix/AlixOperationsPanel'
import { ApiError, apiFetch, useApi } from '../src/hooks/useApi'
import { useAlixOperationalLaunch, type AlixOperationalHandoff } from '../src/hooks/alix/useAlixOperationalLaunch'

vi.mock('../src/hooks/useApi', async original => ({ ...await original<typeof import('../src/hooks/useApi')>(), apiFetch: vi.fn(), useApi: vi.fn() }))
const item = { id: 'client-action:client-synthetic', fingerprint: 'a'.repeat(64), kind: 'client_action', priority: 'attention', title: 'Revisar proposta sintética', reason: 'Prazo hoje.', nextAction: 'Conferir proposta', clienteId: 'client-synthetic', clienteName: 'Cliente sintético', dueDate: '2026-09-07', to: '/clientes/client-synthetic', sources: [{ kind: 'client', id: 'client-synthetic', label: 'Cadastro sintético' }] }
const fixturePlan = () => ({ generatedAt: '2026-09-07T14:00:00Z', referenceDate: '2026-09-07', timeZone: 'America/Cuiaba', fingerprint: 'b'.repeat(64), scope: {}, coverage: { status: 'complete', sources: [] }, counts: { clients: 1, activeClients: 1, activeDemands: 0, openProposals: 0, priorities: 1, overdue: 0, dueToday: 1, missingNextAction: 0, missingOwner: 0 }, items: [item] })
const handoff = (): AlixOperationalHandoff => ({ id: 'handoff-synthetic', session: { id: 'session-synthetic', clienteId: item.clienteId, archived: false }, mission: { id: 'mission-synthetic', sessionId: 'session-synthetic', clienteId: item.clienteId, title: item.title, prompt: 'Prepare a análise sintética.', workMode: 'client_analysis', status: 'queued', progress: 0, costUsd: '0', cancellable: true, createdAt: '', updatedAt: '', steps: [], sources: [] }, deliverables: ['Análise com evidências'], actionPolicy: 'prepare_only', canStart: true, reused: false })
let host: HTMLDivElement
let root: Root
let resource: { data: unknown; loading: boolean; error: string | null; refetch: ReturnType<typeof vi.fn> }
beforeEach(() => {
  vi.clearAllMocks(); (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  resource = { data: fixturePlan(), loading: false, error: null, refetch: vi.fn() }
  vi.mocked(useApi).mockImplementation(() => resource as never)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })
const clickWork = () => [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Trabalhar com a ALIX'))!
async function renderPanel(props: Partial<ComponentProps<typeof AlixOperationsPanel>> = {}) {
  await act(async () => root.render(<MemoryRouter><AlixOperationsPanel clientes={[{ id: item.clienteId, nome: item.clienteName }]} onScopeChange={vi.fn()} onHandoff={vi.fn()} {...props} /></MemoryRouter>))
}

describe('Botão operacional da ALIX', () => {
  it('envia somente cliente, prioridade e versão; duplo clique não cria trabalho duplicado', async () => {
    let resolve!: (value: AlixOperationalHandoff) => void
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const received = vi.fn()
    await renderPanel({ onHandoff: received })
    await act(async () => { clickWork().click(); clickWork().click() })
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string)).toEqual({ clienteId: item.clienteId, itemId: item.id, fingerprint: item.fingerprint })
    await act(async () => resolve(handoff()))
    expect(received).toHaveBeenCalledWith(handoff())
    expect(received).toHaveBeenCalledTimes(1)
  })

  it('resposta atrasada não abre trabalho depois de trocar de cliente', async () => {
    let resolve!: (value: AlixOperationalHandoff) => void
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const received = vi.fn()
    await renderPanel({ clienteId: item.clienteId, onHandoff: received })
    await act(async () => clickWork().click())
    const signal = vi.mocked(apiFetch).mock.calls[0][1]!.signal!
    await renderPanel({ clienteId: 'another-synthetic', onHandoff: received })
    expect(signal.aborted).toBe(true)
    await act(async () => resolve(handoff()))
    expect(received).not.toHaveBeenCalled()
  })

  it('prioridade alterada atualiza a leitura, mostra motivo e não abre a conversa', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiError('Os dados da prioridade mudaram.', 409, 'ALIX_PRIORITY_STALE'))
    const received = vi.fn()
    await renderPanel({ onHandoff: received })
    await act(async () => clickWork().click())
    expect(resource.refetch).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain('Os dados da prioridade mudaram.')
    expect(received).not.toHaveBeenCalled()
  })

  it('preserva o rascunho atual e impede preparar com leitura indisponível', async () => {
    await renderPanel({ handoffDisabledReason: 'Sua conversa tem um rascunho.' })
    expect(clickWork().disabled).toBe(true)
    await act(async () => clickWork().click())
    expect(apiFetch).not.toHaveBeenCalled()
    resource.error = 'Fonte indisponível'
    await renderPanel()
    expect(clickWork().disabled).toBe(true)
  })
})

describe('Transição para execução com o contexto carregado', () => {
  type LaunchInput = Parameters<typeof useAlixOperationalLaunch>[0]
  let state: ReturnType<typeof useAlixOperationalLaunch>
  function Harness({ input }: { input: LaunchInput }) { state = useAlixOperationalLaunch(input); return null }
  async function render(input: LaunchInput) { await act(async () => root.render(<Harness input={input} />)) }
  const ready = (send = vi.fn(async () => undefined)): LaunchInput => ({ sessionId: 'session-synthetic', clienteId: item.clienteId, loadedSessionId: 'session-synthetic', missionId: 'mission-synthetic', busy: false, ready: true, contextVersion: 2, send })

  it('espera o GET do histórico e envia uma única vez com a missão preparada', async () => {
    const input = ready()
    await render({ ...input, loadedSessionId: null, ready: false })
    await act(async () => state.schedule(handoff(), 2))
    expect(input.send).not.toHaveBeenCalled()
    await render(input)
    expect(input.send).toHaveBeenCalledWith('Prepare a análise sintética.')
    await render({ ...input })
    expect(input.send).toHaveBeenCalledTimes(1)
  })

  it('troca de conversa cancela o início pendente mesmo voltando à sessão depois', async () => {
    const input = ready()
    await render({ ...input, loadedSessionId: null, ready: false })
    await act(async () => state.schedule(handoff(), 2))
    await render({ ...input, sessionId: 'another-session', contextVersion: 3 })
    await render({ ...input, contextVersion: 4 })
    expect(input.send).not.toHaveBeenCalled()
  })

  it('cliente carregado divergente cancela a execução e não transfere a pendência', async () => {
    const input = ready()
    await render({ ...input, loadedSessionId: null })
    await act(async () => state.schedule(handoff(), 2))
    await render({ ...input, clienteId: 'another-client' })
    await render(input)
    expect(input.send).not.toHaveBeenCalled()
  })

  it.each(['running', 'completed', 'cancelled'] as const)('reabrir trabalho %s não dispara nova chamada ao modelo', async status => {
    const input = ready(); await render(input)
    const existing = handoff(); existing.canStart = false; existing.mission.status = status; existing.reused = true
    await act(async () => state.schedule(existing, 2))
    expect(input.send).not.toHaveBeenCalled()
  })

  it('aguarda o trabalho anterior e não envia sem a missão correspondente', async () => {
    const input = ready(); await render({ ...input, busy: true })
    await act(async () => state.schedule(handoff(), 2))
    expect(input.send).not.toHaveBeenCalled()
    await render({ ...input, missionId: null })
    expect(input.send).not.toHaveBeenCalled()
    await render(input)
    expect(input.send).toHaveBeenCalledTimes(1)
  })
})
