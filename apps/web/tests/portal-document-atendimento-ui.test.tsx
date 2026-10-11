// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClientePortalAtendimentoPanel from '../src/components/cliente/ClientePortalAtendimentoPanel'
import { ApiError, apiFetch } from '../src/hooks/useApi'

vi.mock('../src/hooks/useApi', async original => ({ ...await original<typeof import('../src/hooks/useApi')>(), apiFetch: vi.fn() }))

const request = {
  id: 'solicitacao-sintetica', tipo: 'atualizacao_cadastral', assunto: 'Conferir telefone solicitado',
  mensagem: 'Solicito conferir meu telefone de contato.', alteracoes: { telefone: '66999999999' },
  status: 'aberta', criadoEm: '2026-09-11T12:00:00.000Z', updatedAt: '2026-09-11T13:30:00.123Z', cadastroAtualizado: false,
}
let host: HTMLDivElement, root: Root
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.includes(name))!
const mutationCalls = () => vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'PATCH')
const payload = (index = 0) => JSON.parse(mutationCalls()[index][1]!.body as string)
const render = async (clienteId = 'cliente-a') => { await act(async () => root.render(<ClientePortalAtendimentoPanel clienteId={clienteId} />)) }
const open = async () => { await render(); await act(async () => button('Atender pedido').click()) }
const text = async (value: string) => {
  const element = host.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const status = async (value: string) => {
  const element = host.querySelector('select')!
  await act(async () => { element.value = value; element.dispatchEvent(new Event('change', { bubbles: true })) })
}
const submit = async () => { await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(apiFetch).mockImplementation(async (_path, init) => (init?.method === 'PATCH' ? {} : [request]) as never)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

describe('Atendimento do portal: conferência cadastral e concorrência', () => {
  it('concluir sem confirmação explícita responde com a versão vista, sem aplicar cadastro', async () => {
    await open()
    expect(host.querySelector('input[type=checkbox]')).toBeNull()
    await status('concluida')
    expect((host.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false)
    expect(button('Registrar resposta').disabled).toBe(true)
    await text('  Conferência registrada; mantenha o telefone atual.  ')
    await submit()
    expect(mutationCalls()[0][0]).toBe('/clientes/cliente-a/portal/solicitacoes/solicitacao-sintetica')
    expect(payload()).toEqual({ expectedUpdatedAt: request.updatedAt, status: 'concluida', resposta: 'Conferência registrada; mantenha o telefone atual.', aplicarAlteracoes: false })
    expect(host.querySelector('form')).toBeNull()
    expect(host.querySelector('[role=status]')?.textContent).toContain('Resposta registrada')
  })

  it('aplica os dados somente ao concluir e marcar a confirmação de conferência', async () => {
    await open(); await status('concluida'); await text('Telefone conferido com o cliente.')
    await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
    await submit()
    expect(payload()).toMatchObject({ status: 'concluida', aplicarAlteracoes: true, expectedUpdatedAt: request.updatedAt })
  })

  it('trocar de situação descarta a autorização cadastral anterior e exige nova confirmação', async () => {
    await open(); await status('concluida'); await text('Continuamos conferindo os dados.')
    await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
    await status('em_atendimento')
    expect(host.querySelector('input[type=checkbox]')).toBeNull()
    await status('concluida')
    expect((host.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false)
    await status('cancelada'); await submit()
    expect(payload()).toMatchObject({ status: 'cancelada', aplicarAlteracoes: false })
  })

  it('pedido de dúvida não disponibiliza alteração cadastral mesmo concluído', async () => {
    vi.mocked(apiFetch).mockImplementation(async (_path, init) => (init?.method === 'PATCH' ? {} : [{ ...request, tipo: 'duvida', alteracoes: {} }]) as never)
    await open(); await status('concluida'); await text('Sua dúvida foi esclarecida.')
    expect(host.querySelector('input[type=checkbox]')).toBeNull()
    await submit()
    expect(payload()).toMatchObject({ aplicarAlteracoes: false, status: 'concluida' })
  })

  it('conflito exibe erro e mantém formulário, resposta e versão para conferência', async () => {
    vi.mocked(apiFetch).mockImplementation(async (_path, init) => {
      if (init?.method === 'PATCH') throw new ApiError('Este pedido foi alterado por outra pessoa.', 409, 'PORTAL_CONFLICT')
      return [request] as never
    })
    await open(); await status('concluida'); await text('Resposta preparada pela equipe.')
    await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
    await submit()
    expect(host.querySelector('form')).not.toBeNull()
    expect(host.querySelector('[role=alert]')?.textContent).toContain('alterado por outra pessoa')
    expect(host.querySelector('textarea')?.value).toBe('Resposta preparada pela equipe.')
    expect(host.querySelector('select')?.value).toBe('concluida')
    expect((host.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(true)
    expect(button('Registrar resposta').disabled).toBe(false)
    expect(payload().expectedUpdatedAt).toBe(request.updatedAt)
    expect(host.querySelector('[role=status]')).toBeNull()
  })

  it('GET atrasado do cliente anterior é abortado e não aparece no novo cliente', async () => {
    let oldResolve!: (value: unknown) => void
    vi.mocked(apiFetch).mockImplementation(async path => path.includes('cliente-a')
      ? new Promise(done => { oldResolve = done })
      : [{ ...request, id: 'pedido-b', assunto: 'Pedido exclusivo do cliente B' }] as never)
    await render('cliente-a')
    const oldSignal = vi.mocked(apiFetch).mock.calls[0][1]?.signal
    await render('cliente-b')
    expect(oldSignal?.aborted).toBe(true)
    await act(async () => oldResolve([request]))
    expect(host.textContent).toContain('Pedido exclusivo do cliente B')
    expect(host.textContent).not.toContain(request.assunto)
  })

  it('bloqueia envio repetido e ignora confirmação pendente após trocar de cliente', async () => {
    let saveResolve!: (value: unknown) => void
    vi.mocked(apiFetch).mockImplementation(async (path, init) => init?.method === 'PATCH'
      ? new Promise(done => { saveResolve = done })
      : path.includes('cliente-b') ? [{ ...request, id: 'pedido-b', assunto: 'Pedido exclusivo do cliente B' }] as never : [request] as never)
    await open(); await text('Resposta ainda pendente de confirmação.')
    const form = host.querySelector('form')!
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(mutationCalls()).toHaveLength(1)
    const pendingSignal = mutationCalls()[0][1]?.signal
    await render('cliente-b')
    expect(pendingSignal?.aborted).toBe(true)
    const before = vi.mocked(apiFetch).mock.calls.length
    await act(async () => saveResolve({ status: 'em_atendimento' }))
    expect(vi.mocked(apiFetch).mock.calls).toHaveLength(before)
    expect(host.querySelector('form')).toBeNull()
    expect(host.textContent).toContain('Pedido exclusivo do cliente B')
    expect(host.textContent).not.toContain('Resposta registrada')
    expect(host.textContent).not.toContain('Resposta ainda pendente')
  })
})
