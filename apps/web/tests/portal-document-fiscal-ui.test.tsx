// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FISCAL_SERVICES, FISCAL_UFS, type FiscalAuthorization, type FiscalPortalData } from '@aletis/shared-types'
import { PortalFiscal } from '../src/pages/portal/PortalFiscal'
import ClientePortalFiscalPanel from '../src/components/cliente/ClientePortalFiscalPanel'
import { apiCall } from '../src/pages/portal/utils'
import { ApiError, apiFetch } from '../src/hooks/useApi'
import type { UploadDTO } from '../src/pages/portal/types'

vi.mock('../src/pages/portal/utils', async original => ({ ...await original<typeof import('../src/pages/portal/utils')>(), apiCall: vi.fn() }))
vi.mock('../src/hooks/useApi', async original => ({ ...await original<typeof import('../src/hooks/useApi')>(), apiFetch: vi.fn() }))
// A conexão A1 tem sua própria suíte; esta suíte acompanha o fluxo de procuração.
vi.mock('../src/pages/portal/PortalFiscalConnection', () => ({ PortalFiscalConnection: () => null }))

const authorization: FiscalAuthorization = {
  id: 'fiscal-sintetica-a', clienteId: 'cliente-a', uf: 'MT', servicos: ['debitos', 'notas'], modalidade: 'procuracao_eletronica',
  referencia: 'PROC-SINTETICA-MT', comprovanteDisponivel: false, validadeAte: '2027-01-31', status: 'solicitada', statusRegistrado: 'solicitada', servicosConferidos: [], criadoEm: '2026-09-13T10:00:00Z', atualizadoEm: '2026-09-13T10:00:00.123Z', consultaAutomatica: false,
}
const data = (items: FiscalAuthorization[] = []): FiscalPortalData => ({
  catalogo: FISCAL_UFS.map(uf => ({ uf, nome: `Estado ${uf}`, portalUrl: `https://${uf.toLowerCase()}.example.test`, orientacao: `Orientação pública de ${uf}.`, verificacao: '2026-09-13' })),
  autorizacoes: items, eventos: [], consultaAutomatica: false, atualizadoEm: '2026-09-13T10:00:00Z',
})
const upload = (patch: Partial<UploadDTO> = {}): UploadDTO => ({ id: 'up-pdf', clienteId: 'cliente-a', nomeOriginal: 'procuracao-sintetica.pdf', mime: 'application/pdf', tamanho: 100, enviadoPor: 'cliente', enviadoEm: '2026-09-13T09:00:00Z', ...patch })
let host: HTMLDivElement, root: Root
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.includes(name))!
const form = () => host.querySelector('form')!
const field = (name: string) => [...form().querySelectorAll('label')].find(item => item.textContent?.startsWith(name))!.querySelector('input,textarea,select') as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
const edit = async (name: string, value: string) => {
  const element = field(name)
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
const check = async (name: string) => { await act(async () => (field(name) as HTMLInputElement).click()) }
const submit = async () => { await act(async () => form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
const requests = () => vi.mocked(apiCall).mock.calls.filter(([, init]) => init?.method === 'POST')
const patches = () => vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === 'PATCH')
const file = async (value: File) => { await act(async () => { const element = host.querySelector('input[type=file]')!; Object.defineProperty(element, 'files', { configurable: true, value: [value] }); element.dispatchEvent(new Event('change', { bubbles: true })) }) }
const render = async (token = 'token-a', uploads: UploadDTO[] = []) => { await act(async () => root.render(<PortalFiscal token={token} uploads={uploads} onNavigate={vi.fn()} />)) }
const prepare = async () => { await render(); await edit('Estado', 'MT'); await check(FISCAL_SERVICES.debitos) }

beforeEach(() => {
  vi.clearAllMocks(); (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(apiCall).mockImplementation(async (_path, init) => ({ ok: true, data: init?.method ? authorization : data() }) as never)
  vi.mocked(apiFetch).mockImplementation(async (_path, init) => (init?.method ? authorization : data([authorization])) as never)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { id: 'up-confirmada' } }) }))
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Autorizações fiscais do cliente', () => {
  it('oferece as 27 UFs e só encaminha estado e consultas efetivamente escolhidos após consentimento', async () => {
    await render()
    expect([...((field('Estado') as HTMLSelectElement).options)].map(option => option.value)).toEqual(['', ...FISCAL_UFS])
    await submit(); expect(requests()).toHaveLength(0)
    await edit('Estado', 'SP'); await check(FISCAL_SERVICES.debitos); await check(FISCAL_SERVICES.cadastro)
    expect(button('Encaminhar para conferência').disabled).toBe(true)
    await check('Solicito à equipe'); await submit()
    expect(requests()[0][0]).toBe('/api/portal/fiscal/autorizacoes')
    expect(JSON.parse(requests()[0][1]!.body as string)).toEqual({ uf: 'SP', modalidade: 'procuracao_eletronica', servicos: ['debitos', 'cadastro'], consentimento: true })
    expect(host.textContent).toContain('as consultas dependem do serviço e das regras de cada SEFAZ')
  })
  it('mudança de estado ou de serviços exige renovar o consentimento', async () => {
    await prepare(); await check('Solicito à equipe')
    await edit('Estado', 'DF')
    expect((field('Solicito à equipe') as HTMLInputElement).checked).toBe(false)
    await check('Solicito à equipe'); await check(FISCAL_SERVICES.processos)
    expect((field('Solicito à equipe') as HTMLInputElement).checked).toBe(false)
    await submit(); expect(requests()).toHaveLength(0)
  })
  it.each(['certificado_a1', 'certificado_a3', 'acesso_assistido'])('modalidade %s registra a necessidade sem campo para certificado, chave ou senha', async method => {
    await prepare(); await edit('Forma de autorização', method)
    expect(host.querySelector('input[type=file]')).toBeNull()
    expect(host.querySelector('input[type=password]')).toBeNull()
    expect(host.textContent).not.toContain('Comprovante PDF já enviado')
    await check('Solicito à equipe'); await submit()
    expect(JSON.parse(requests()[0][1]!.body as string)).toMatchObject({ modalidade: method, servicos: ['debitos'], consentimento: true })
    expect(JSON.parse(requests()[0][1]!.body as string)).not.toHaveProperty('comprovanteId')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('usa apenas PDFs existentes na escolha de comprovantes', async () => {
    await render('token-a', [upload(), upload({ id: 'up-imagem', nomeOriginal: 'imagem.jpg', mime: 'image/jpeg' })])
    const options = [...((field('Comprovante PDF já enviado') as HTMLSelectElement).options)]
    expect(options.map(option => option.value)).toEqual(['', 'up-pdf'])
    await edit('Estado', 'MT'); await check(FISCAL_SERVICES.debitos); await edit('Comprovante PDF já enviado', 'up-pdf'); await check('Solicito à equipe'); await submit()
    expect(JSON.parse(requests()[0][1]!.body as string).comprovanteId).toBe('up-pdf')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('após upload confirmado e falha no cadastro reutiliza comprovante e idempotência sem reenviar o PDF', async () => {
    vi.mocked(apiCall).mockImplementation(async (_path, init) => init?.method === 'POST' ? { ok: false, status: 503, error: 'Conferência temporariamente indisponível.' } : { ok: true, data: data() } as never)
    await prepare(); await file(new File(['%PDF-1.7 sintético'], 'procuracao.pdf', { type: 'application/pdf' })); await check('Solicito à equipe')
    await submit()
    expect(host.querySelector('[role=alert]')?.textContent).toContain('temporariamente indisponível')
    expect(JSON.parse(requests()[0][1]!.body as string).comprovanteId).toBe('up-confirmada')
    const firstKey = (requests()[0][1]!.headers as Record<string, string>)['Idempotency-Key']
    await submit()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(requests()).toHaveLength(2)
    expect((requests()[1][1]!.headers as Record<string, string>)['Idempotency-Key']).toBe(firstKey)
    expect((vi.mocked(fetch).mock.calls[0][1]?.body as FormData).get('categoria')).toBe('fiscal')
  })
  it('não registra autorização se o envio não retornar o identificador confirmado do PDF', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) } as Response)
    await prepare(); await file(new File(['%PDF-1.7'], 'procuracao.pdf')); await check('Solicito à equipe'); await submit()
    expect(requests()).toHaveLength(0)
    expect(host.querySelector('[role=alert]')?.textContent).toContain('não retornou a confirmação')
  })
  it('bloqueia arquivo de certificado privado antes de qualquer envio', async () => {
    await prepare(); await file(new File(['material sintético'], 'certificado.pfx')); await check('Solicito à equipe'); await submit()
    expect(fetch).not.toHaveBeenCalled(); expect(requests()).toHaveLength(0)
    expect(host.querySelector('[role=alert]')?.textContent).toContain('somente o comprovante da procuração em PDF')
  })
  it('aborta upload ao trocar de sessão e ignora a confirmação atrasada sem cadastrar autorização antiga', async () => {
    let resolve!: (response: Response) => void
    vi.mocked(fetch).mockImplementation(async () => new Promise(done => { resolve = done }))
    await prepare(); await file(new File(['%PDF-1.7'], 'procuracao-a.pdf')); await check('Solicito à equipe'); await submit()
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
    await render('token-b'); expect(signal?.aborted).toBe(true)
    await act(async () => resolve({ ok: true, json: async () => ({ success: true, data: { id: 'up-antigo-a' } }) } as Response))
    expect(requests()).toHaveLength(0)
    expect(host.textContent).not.toContain('Solicitação registrada')
    expect(host.textContent).not.toContain('procuracao-a.pdf')
  })
  it.each([200, 403])('consulta antiga do cliente A (%s) não substitui nem encerra o portal do cliente B', async status => {
    let resolve!: (response: never) => void
    vi.mocked(apiCall).mockImplementation(async (_path, init) => init?.token === 'token-a' ? new Promise(done => { resolve = done }) : { ok: true, data: data([{ ...authorization, id: 'fiscal-b', clienteId: 'cliente-b', referencia: 'AUTORIZACAO-CLIENTE-B' }]) } as never)
    await render('token-a'); const signal = vi.mocked(apiCall).mock.calls[0][1]?.signal
    await render('token-b'); expect(signal?.aborted).toBe(true)
    await act(async () => resolve((status === 200 ? { ok: true, data: data([authorization]) } : { ok: false, status, error: 'Acesso antigo expirado' }) as never))
    expect(host.textContent).toContain('AUTORIZACAO-CLIENTE-B')
    expect(host.textContent).not.toContain(authorization.referencia)
    expect(host.textContent).not.toContain('Acesso antigo expirado')
  })
  it('impede dois cadastros concorrentes enquanto aguarda a confirmação', async () => {
    let resolve!: (response: never) => void
    vi.mocked(apiCall).mockImplementation(async (_path, init) => init?.method === 'POST' ? new Promise(done => { resolve = done }) : { ok: true, data: data() } as never)
    await prepare(); await check('Solicito à equipe')
    await act(async () => { form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(requests()).toHaveLength(1)
    await act(async () => resolve({ ok: true, data: authorization } as never))
  })
})

describe('Conferência fiscal pela equipe', () => {
  const renderStaff = async (clienteId = 'cliente-a') => { await act(async () => root.render(<ClientePortalFiscalPanel clienteId={clienteId} />)) }
  const startReview = async () => { await renderStaff(); await act(async () => button('Conferir autorização').click()); await edit('Resultado', 'conferida'); await edit('Representante autorizado', 'Representante sintético'); await edit('Orientação visível ao cliente', 'Poderes de consulta conferidos no órgão emissor.') }
  it('usa caminhos do cliente sem duplicar /api e só permite conferir poderes solicitados', async () => {
    await startReview()
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/clientes/cliente-a/portal/fiscal')
    const powers = [...form().querySelectorAll('legend')].find(item => item.textContent === 'Poderes efetivamente conferidos')!.parentElement!
    expect([...powers.querySelectorAll('label')].map(item => item.textContent)).toEqual([FISCAL_SERVICES.debitos, FISCAL_SERVICES.notas])
    expect(button('Registrar conferência').disabled).toBe(true)
    await check(FISCAL_SERVICES.debitos); await check('Conferi titular'); await submit()
    expect(patches()[0][0]).toBe('/clientes/cliente-a/portal/fiscal/autorizacoes/fiscal-sintetica-a')
    expect(JSON.parse(patches()[0][1]!.body as string)).toMatchObject({ expectedUpdatedAt: authorization.atualizadoEm, status: 'conferida', servicosConferidos: ['debitos'], conferenciaConfirmada: true })
  })
  it('editar validade ou poderes renova a conferência explícita; trocar resultado não conserva a confirmação', async () => {
    await startReview(); await check(FISCAL_SERVICES.debitos); await check('Conferi titular')
    await edit('Validade conferida', '2026-12-31')
    expect((field('Conferi titular') as HTMLInputElement).checked).toBe(false)
    await check('Conferi titular'); await check(FISCAL_SERVICES.notas)
    expect((field('Conferi titular') as HTMLInputElement).checked).toBe(false)
    await check('Conferi titular'); await edit('Resultado', 'pendencia'); await submit()
    expect(JSON.parse(patches()[0][1]!.body as string)).toMatchObject({ status: 'pendencia', servicosConferidos: [], conferenciaConfirmada: false })
  })
  it('preserva orientação, poderes e versão vista ao receber conflito', async () => {
    vi.mocked(apiFetch).mockImplementation(async (_path, init) => { if (init?.method === 'PATCH') throw new ApiError('A autorização mudou. Atualize antes de continuar.', 409); return data([authorization]) as never })
    await startReview(); await check(FISCAL_SERVICES.debitos); await check('Conferi titular'); await submit()
    expect(host.querySelector('[role=alert]')?.textContent).toContain('A autorização mudou')
    expect(field('Orientação visível ao cliente').value).toBe('Poderes de consulta conferidos no órgão emissor.')
    expect((field(FISCAL_SERVICES.debitos) as HTMLInputElement).checked).toBe(true)
    expect(JSON.parse(patches()[0][1]!.body as string).expectedUpdatedAt).toBe(authorization.atualizadoEm)
  })
  it('descarta confirmação pendente ao trocar o cliente do CRM', async () => {
    let resolve!: (response: never) => void
    vi.mocked(apiFetch).mockImplementation(async (path, init) => init?.method === 'PATCH' ? new Promise(done => { resolve = done }) : data(path.includes('cliente-b') ? [{ ...authorization, id: 'fiscal-b', clienteId: 'cliente-b', referencia: 'AUTORIZACAO-CLIENTE-B' }] : [authorization]) as never)
    await startReview(); await check(FISCAL_SERVICES.debitos); await check('Conferi titular'); await submit()
    const signal = patches()[0][1]!.signal
    await renderStaff('cliente-b'); expect(signal?.aborted).toBe(true)
    const calls = vi.mocked(apiFetch).mock.calls.length
    await act(async () => resolve(authorization as never))
    expect(vi.mocked(apiFetch).mock.calls).toHaveLength(calls)
    expect(host.textContent).toContain('AUTORIZACAO-CLIENTE-B')
    expect(host.textContent).not.toContain('Conferência registrada')
  })
})
