// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePortalSession } from '../src/pages/portal/usePortalSession'
import { PortalSupport } from '../src/pages/portal/PortalSupport'
import { PortalGuide } from '../src/pages/portal/PortalHome'
import { Field, LoginScreen } from '../src/pages/portal/Auth'
import { PendenciasInbox } from '../src/pages/portal/Pendencias'
import { apiCall } from '../src/pages/portal/utils'
import { User } from 'lucide-react'
import type { ClienteMe, PendenciaDTO } from '../src/pages/portal/types'
vi.mock('../src/pages/portal/utils', async original => ({ ...await original<typeof import('../src/pages/portal/utils')>(), apiCall: vi.fn() }))
vi.mock('../src/components/ui/BrandMark', () => ({ default: () => <span>ALETIS</span> }))
const cliente: ClienteMe = { id: 'cliente-a', nome: 'Cliente Sintético', cpfCnpj: '', cidade: 'Canarana', uf: 'MT', email: 'cliente@example.test', telefone: '66999999999', atividade: '', areaTotalHa: 0, culturas: [], estagio: 'analise', consultor: 'Equipe', credor: '', dataCadastro: '2026-09-11', forcaTrocaSenha: false }
let host: HTMLDivElement, root: Root
const button = (text: string) => [...document.querySelectorAll('button')].find(item => item.textContent?.includes(text))!
const input = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => { await act(async () => { Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })) }) }
const submissions = () => vi.mocked(apiCall).mock.calls.filter(([, init]) => init?.method === 'POST')
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true; vi.mocked(apiCall).mockResolvedValue({ ok: true, data: [] }); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })
describe('Experiência do cliente: ajuda, continuidade e acessibilidade', () => {
  it('não consulta nem envia solicitações enquanto a aba está inativa', async () => {
    await act(async () => root.render(<PortalSupport cliente={cliente} token="sintetico" active={false} onContact={vi.fn()} onProfileRefresh={vi.fn()} />))
    expect(apiCall).not.toHaveBeenCalled()
  })
  it('reutiliza chave de idempotência após falha e impede envio duplicado durante confirmação', async () => {
    let resolve!: (value: never) => void
    vi.mocked(apiCall).mockImplementation(async (_path, init) => init?.method === 'POST' ? new Promise(done => { resolve = done }) : { ok: true, data: [] } as never)
    await act(async () => root.render(<PortalSupport cliente={cliente} token="sintetico" active onContact={vi.fn()} onProfileRefresh={vi.fn()} />))
    await act(async () => button('Tirar uma dúvida').click())
    await input(document.querySelector('textarea')!, 'Preciso conferir o andamento do meu pedido.')
    const form = document.querySelector('form')!
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(submissions()).toHaveLength(1)
    const key = (submissions()[0][1]?.headers as Record<string, string>)['Idempotency-Key']
    await act(async () => resolve({ ok: false, error: 'Conexão interrompida', status: 0 } as never))
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Conexão interrompida')
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect((submissions()[1][1]?.headers as Record<string, string>)['Idempotency-Key']).toBe(key)
    await act(async () => resolve({ ok: true, data: { id: 'sol-1', tipo: 'duvida', assunto: 'Tirar uma dúvida', mensagem: 'Preciso conferir o andamento do meu pedido.', status: 'aberta', criadoEm: '2026-09-11T12:00:00Z', updatedAt: '2026-09-11T12:00:00Z' } } as never))
    expect(document.querySelector('[role=status]')?.textContent).toContain('sol-1')
  })
  it('escopa a dispensa do guia por cliente', async () => {
    await act(async () => root.render(<PortalGuide key="a" clienteId="cliente-a" onNavigate={vi.fn()} />))
    await act(async () => (document.querySelector('[aria-label="Dispensar guia do portal"]') as HTMLButtonElement).click())
    expect(host.textContent).toBe('')
    await act(async () => root.render(<PortalGuide key="b" clienteId="cliente-b" onNavigate={vi.fn()} />))
    expect(host.textContent).toContain('Seu portal em três passos')
    expect(localStorage.getItem('aletis.portal.guia.v1:cliente-a')).toBe('dismissed')
    expect(localStorage.getItem('aletis.portal.guia.v1:cliente-b')).toBeNull()
  })
  it('associa o label ao campo e mantém o valor ao mostrar/ocultar senha', async () => {
    await act(async () => root.render(<Field icon={User} label="Senha" type="password" value="sintetica" onChange={vi.fn()} />))
    const label = document.querySelector('label')!, field = document.querySelector('input')!
    expect(label.control).toBe(field)
    await act(async () => (document.querySelector('[aria-label="Mostrar senha"]') as HTMLButtonElement).click())
    expect(field.type).toBe('text'); expect(field.value).toBe('sintetica')
  })
  it('não anuncia entrega de link quando a solicitação falha', async () => {
    vi.mocked(apiCall).mockResolvedValue({ ok: false, error: 'rede', status: 0 })
    await act(async () => root.render(<LoginScreen onLogin={vi.fn()} />))
    await act(async () => button('Link de acesso').click())
    await input(document.querySelector('input')!, 'cliente@example.test')
    await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(document.querySelector('[role=alert]')?.textContent).toContain('Não foi possível solicitar')
    expect(document.querySelector('[role=status]')).toBeNull()
  })
  it('deep link abre o filtro correto e coloca foco no pedido concluído', async () => {
    const p: PendenciaDTO = { id: 'pd-1', clienteId: cliente.id, titulo: 'Contrato conferido', status: 'aprovado', categoria: 'contrato', obrigatorio: true, solicitadoEm: '2026-09-11T12:00:00Z' }
    const queue = { items: [], notice: null, busy: false, enqueue: vi.fn(), retry: vi.fn(), remove: vi.fn(), clearReceived: vi.fn() }
    await act(async () => root.render(<PendenciasInbox pendencias={[p]} uploads={[]} queue={queue} selectedRequestId="pd-1" />))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    expect(document.activeElement?.id).toBe('portal-pedido-pd-1')
    expect(button('Concluídos').getAttribute('aria-pressed')).toBe('true')
    expect(host.textContent).toContain('Contrato conferido')
  })
})


describe('Sessão: resposta antiga não atravessa logout ou troca de cliente', () => {
  it.each([200, 401])('ignora auth/me de A atrasado com status %s depois do login B', async status => {
    let session!: ReturnType<typeof usePortalSession>
    function Harness() { session = usePortalSession(); return <p>{session.cliente?.id || 'sem cliente'}</p> }
    let resolve!: (value: never) => void
    vi.mocked(apiCall).mockImplementation(async path => path.endsWith('/auth/me') ? new Promise(done => { resolve = done }) : { ok: true, data: {} } as never)
    await act(async () => root.render(<Harness />))
    await act(async () => session.authenticate('token-a', cliente))
    let pending!: Promise<void>
    await act(async () => { pending = session.refreshCliente() })
    const signal = vi.mocked(apiCall).mock.calls.find(([path]) => path.endsWith('/auth/me'))![1]!.signal!
    await act(async () => { session.logout(); session.authenticate('token-b', { ...cliente, id: 'cliente-b', nome: 'Cliente B' }) })
    expect(signal.aborted).toBe(true)
    await act(async () => { resolve((status === 200 ? { ok: true, data: cliente } : { ok: false, error: 'Sessão expirada', status: 401 }) as never); await pending })
    expect(session.cliente?.id).toBe('cliente-b')
    expect(session.token).toBe('token-b')
    expect(localStorage.getItem('aletis.portal.token')).toBe('token-b')
  })
  it('aborta consulta desmontada e mantém sessão em falha transitória', async () => {
    let session!: ReturnType<typeof usePortalSession>
    function Harness() { session = usePortalSession(); return null }
    await act(async () => root.render(<Harness />))
    await act(async () => session.authenticate('token-a', cliente))
    vi.mocked(apiCall).mockResolvedValueOnce({ ok: false, status: 503, error: 'indisponível' })
    await act(async () => session.refreshCliente())
    expect(session.token).toBe('token-a')
    expect(session.sessionError).toContain('Seu acesso foi mantido')
    let resolve!: (value: never) => void
    vi.mocked(apiCall).mockImplementation(async () => new Promise(done => { resolve = done }))
    let pending!: Promise<void>
    await act(async () => { pending = session.refreshCliente() })
    const signal = vi.mocked(apiCall).mock.calls.at(-1)![1]!.signal!
    await act(async () => root.render(<p>Outra tela</p>))
    expect(signal.aborted).toBe(true)
    localStorage.setItem('aletis.portal.token', 'token-outra-tela')
    await act(async () => { resolve({ ok: false, status: 401, error: 'expirado' } as never); await pending })
    expect(localStorage.getItem('aletis.portal.token')).toBe('token-outra-tela')
  })
})
