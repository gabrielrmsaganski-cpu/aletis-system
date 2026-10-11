// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FISCAL_UFS, type FiscalConnectionData, type FiscalCredentialDTO } from '@aletis/shared-types'
import { PortalFiscalConnection } from '../src/pages/portal/PortalFiscalConnection'
import { apiCall } from '../src/pages/portal/utils'
import { ApiError, apiFetch } from '../src/hooks/useApi'

vi.mock('../src/pages/portal/utils', async original => ({ ...await original<typeof import('../src/pages/portal/utils')>(), apiCall: vi.fn() }))
vi.mock('../src/hooks/useApi', async original => ({ ...await original<typeof import('../src/hooks/useApi')>(), apiFetch: vi.fn() }))

const credential = (patch: Partial<FiscalCredentialDTO> = {}): FiscalCredentialDTO => ({
  id: 'certificado-a', titular: 'Titular sintético', documentoMascarado: '12.***.***/0001-**', uf: 'MT',
  status: 'ativa', validadeInicio: '2026-01-01T00:00:00Z', validadeFim: '2099-01-01T00:00:00Z',
  automacaoAtiva: false, verificadaNoOrgao: false, atualizadoEm: '2026-09-13T10:00:00.123Z', ...patch,
})
const workspace = (patch: Partial<FiscalConnectionData> = {}): FiscalConnectionData => ({
  configurado: true, atualizadoEm: '2026-09-13T10:00:00Z', avisos: [], credenciais: [], consultas: [], documentos: [],
  cobertura: FISCAL_UFS.map(uf => ({ uf, nome: `Estado ${uf}`, portalUrl: `https://${uf.toLowerCase()}.example.test`, servicos: [
    { id: 'nfe', nome: 'Distribuição nacional de NF-e', status: 'disponivel', descricao: 'Documentos NF-e disponibilizados ao titular.' },
    { id: 'debitos', nome: 'Débitos e regularidade', status: 'portal_oficial', descricao: 'Integração específica necessária.' },
  ] })), ...patch,
})
let host: HTMLDivElement, root: Root, current: FiscalConnectionData
const render = async (props: { token?: string; clienteId?: string } = { token: 'token-a' }) => { await act(async () => root.render(<PortalFiscalConnection {...props} />)) }
const form = () => host.querySelector('form[aria-label="Conectar certificado A1"]') as HTMLFormElement
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.includes(name))!
const field = (name: string) => [...host.querySelectorAll('label')].find(item => item.textContent?.startsWith(name))!.querySelector('input,select') as HTMLInputElement | HTMLSelectElement
const edit = async (name: string, value: string) => {
  const element = field(name)
  await act(async () => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
const check = async () => { await act(async () => (field('Sou o titular') as HTMLInputElement).click()) }
const chooseFile = async (file = new File(['material sintético para teste'], 'certificado.pfx', { type: 'application/x-pkcs12' })) => {
  await act(async () => {
    const element = field('Arquivo do certificado')
    Object.defineProperty(element, 'files', { configurable: true, value: [file] })
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
const submit = async () => { await act(async () => form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
const click = async (name: string) => { await act(async () => button(name).click()) }
const prepare = async () => { await render(); await edit('CPF ou CNPJ', 'aB.123.456/0001-80'); await edit('Estado do titular', 'MT'); await chooseFile(); await edit('Senha do certificado', 'senha-sintetica'); await check() }
const posts = () => vi.mocked(apiCall).mock.calls.filter(([, init]) => init?.method === 'POST')
const patches = () => vi.mocked(apiCall).mock.calls.filter(([, init]) => init?.method === 'PATCH')

beforeEach(() => {
  vi.clearAllMocks(); (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  current = workspace()
  vi.mocked(apiCall).mockImplementation(async (_path, init) => ({ ok: true, data: init?.method ? { success: true } : current }) as never)
  vi.mocked(apiFetch).mockImplementation(async (_path, init) => (init?.method ? { success: true } : current) as never)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: credential() }) }))
  // JSDOM não reproduz a seleção nativa que satisfaz required em input[type=file].
  vi.spyOn(HTMLFormElement.prototype, 'reportValidity').mockReturnValue(true)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Conexão A1 pelo cliente', () => {
  it('mostra as 27 UFs sem afirmar acesso já conectado ou ausência de débitos', async () => {
    await render()
    expect([...((field('Estado do titular') as HTMLSelectElement).options)].map(option => option.value)).toEqual(['', ...FISCAL_UFS])
    expect(host.textContent).toContain('Certificado necessário')
    expect(host.textContent).toContain('Isso não informa se existem débitos')
    expect(host.textContent).toContain('Disponível para conectar')
    expect(host.textContent).toContain('Acesso pelo portal oficial')
    expect(host.textContent).not.toContain('Conexão NF-e confirmada')
  })
  it('não oferece coleta de chave e senha quando a infraestrutura não estiver configurada', async () => {
    current = workspace({ configurado: false })
    await render()
    expect(host.querySelector('input[type=password]')).toBeNull()
    expect(host.querySelector('input[type=file]')).toBeNull()
    expect(host.textContent).toContain('precisa ser preparada pela administração')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('exige arquivo, dados do titular e consentimento inclusive em envio direto do formulário', async () => {
    await render(); await submit()
    expect(fetch).not.toHaveBeenCalled()
    await chooseFile(); await submit()
    expect(fetch).not.toHaveBeenCalled()
    expect(host.querySelector('[role=alert]')?.textContent).toContain('confirme a autorização')
  })
  it('envia somente ao cofre dedicado com titular alfanumérico, consentimento, autenticação e idempotência', async () => {
    const stored = vi.spyOn(Storage.prototype, 'setItem')
    await prepare(); await submit()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [path, request] = vi.mocked(fetch).mock.calls[0]
    expect(path).toBe('/api/portal/fiscal/conexao/certificado')
    expect(request?.method).toBe('POST')
    expect(request?.credentials).toBe('same-origin')
    expect(request?.headers).toMatchObject({ Authorization: 'Bearer token-a', 'Idempotency-Key': expect.any(String) })
    expect(request?.headers).not.toHaveProperty('Content-Type')
    const body = request?.body as FormData
    expect([...body.keys()].sort()).toEqual(['consentimento', 'documento', 'file', 'senha', 'uf'])
    expect(body.get('documento')).toBe('AB123456000180')
    expect(body.get('senha')).toBe('senha-sintetica')
    expect(body.get('consentimento')).toBe('true')
    expect(stored).not.toHaveBeenCalled()
    expect(posts()).toHaveLength(0)
  })
  it('limpa a senha, a seleção do arquivo e o consentimento após confirmação', async () => {
    await prepare(); await submit()
    expect((field('Senha do certificado') as HTMLInputElement).value).toBe('')
    expect((field('Arquivo do certificado') as HTMLInputElement).files?.length).toBe(0)
    expect((field('Sou o titular') as HTMLInputElement).checked).toBe(false)
    expect(host.textContent).not.toContain('Selecionado: certificado.pfx')
    expect(host.textContent).toContain('Faça a primeira consulta')
  })
  it.each(['CPF ou CNPJ', 'Estado do titular', 'Senha do certificado'])('alterar %s exige novo consentimento', async name => {
    await prepare()
    await edit(name, name === 'Estado do titular' ? 'SP' : 'outro-valor')
    expect((field('Sou o titular') as HTMLInputElement).checked).toBe(false)
    await submit(); expect(fetch).not.toHaveBeenCalled()
  })
  it('trocar o arquivo também renova o consentimento', async () => {
    await prepare(); await chooseFile(new File(['novo sintético'], 'renovado.p12'))
    expect((field('Sou o titular') as HTMLInputElement).checked).toBe(false)
    await submit(); expect(fetch).not.toHaveBeenCalled()
  })
  it.each([
    new File(['%PDF-1.7'], 'assinatura.pdf'),
    new File([new Uint8Array(256 * 1024 + 1)], 'grande.pfx'),
    new File([], 'vazio.p12'),
  ])('bloqueia formato ou tamanho inadequado antes do transporte: $name', async invalid => {
    await prepare(); await chooseFile(invalid); await check(); await submit()
    expect(fetch).not.toHaveBeenCalled()
    expect(host.querySelector('[role=alert]')?.textContent).toContain('até 256 KB')
  })
  it('mantém a mesma idempotência na repetição de um envio não confirmado sem editar os dados', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'Não foi possível confirmar o recebimento.' }) } as Response)
    await prepare(); await submit(); await submit()
    expect(fetch).toHaveBeenCalledTimes(2)
    const first = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>
    const second = vi.mocked(fetch).mock.calls[1][1]?.headers as Record<string, string>
    expect(second['Idempotency-Key']).toBe(first['Idempotency-Key'])
    expect(host.textContent).not.toContain('Certificado recebido e validado')
  })
  it('não aceita envelope de sucesso sem confirmação explícita', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ data: credential() }) } as Response)
    await prepare(); await submit()
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Não foi possível confirmar')
    expect(host.textContent).not.toContain('Certificado recebido e validado')
  })
  it('bloqueia envios duplicados enquanto espera a resposta', async () => {
    let resolve!: (response: Response) => void
    vi.mocked(fetch).mockImplementation(() => new Promise(done => { resolve = done }))
    await prepare()
    await act(async () => { form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ ok: true, json: async () => ({ success: true, data: credential() }) } as Response))
  })
  it('aborta envio e remove credenciais da tela ao trocar a sessão; resposta atrasada não confirma o cliente seguinte', async () => {
    let resolve!: (response: Response) => void
    vi.mocked(fetch).mockImplementation(() => new Promise(done => { resolve = done }))
    await prepare(); await submit()
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal
    await render({ token: 'token-b' })
    expect(signal?.aborted).toBe(true)
    expect((field('Senha do certificado') as HTMLInputElement).value).toBe('')
    expect(host.textContent).not.toContain('certificado.pfx')
    const calls = vi.mocked(apiCall).mock.calls.length
    await act(async () => resolve({ ok: true, json: async () => ({ success: true, data: credential() }) } as Response))
    expect(vi.mocked(apiCall).mock.calls).toHaveLength(calls)
    expect(host.textContent).not.toContain('Certificado recebido e validado')
  })
  it.each([200, 403])('uma leitura antiga (%s) não contamina os dados de outra sessão', async status => {
    let resolve!: (response: never) => void
    vi.mocked(apiCall).mockImplementation(async (_path, init) => init?.token === 'token-a' ? new Promise(done => { resolve = done }) : { ok: true, data: workspace({ avisos: ['Dados exclusivos do cliente B'] }) } as never)
    await render(); const signal = vi.mocked(apiCall).mock.calls[0][1]?.signal
    await render({ token: 'token-b' }); expect(signal?.aborted).toBe(true)
    await act(async () => resolve((status === 200 ? { ok: true, data: workspace({ credenciais: [credential()] }) } : { ok: false, status, error: 'Sessão antiga expirada' }) as never))
    expect(host.textContent).toContain('Dados exclusivos do cliente B')
    expect(host.textContent).not.toContain('Titular sintético')
    expect(host.textContent).not.toContain('Sessão antiga expirada')
  })
})

describe('Consultas e acompanhamento NF-e', () => {
  it('distingue certificado validado de acesso confirmado no órgão', async () => {
    current = workspace({ credenciais: [credential()] })
    await render()
    expect(host.textContent).toContain('Aguardando primeira consulta')
    expect(host.textContent).not.toContain('Conexão NF-e confirmada')
    expect(button('Consultar NF-e agora').disabled).toBe(false)
    current = workspace({ credenciais: [credential({ verificadaNoOrgao: true, ultimoSucessoEm: '2026-09-13T10:05:00Z' })] })
    await click('Atualizar')
    expect(host.textContent).toContain('Acesso confirmado pelo serviço')
    expect(host.textContent).toContain('Conexão NF-e confirmada')
  })
  it('faz uma consulta autenticada com credencial e chave de idempotência', async () => {
    current = workspace({ credenciais: [credential()] })
    await render(); await click('Consultar NF-e agora')
    expect(posts()).toHaveLength(1)
    expect(posts()[0][0]).toBe('/api/portal/fiscal/conexao/consultar')
    expect(posts()[0][1]?.token).toBe('token-a')
    expect(JSON.parse(posts()[0][1]?.body as string)).toEqual({ credencialId: 'certificado-a' })
    expect(posts()[0][1]?.headers).toMatchObject({ 'Idempotency-Key': expect.any(String) })
  })
  it('respeita a espera do órgão e impede consultas concorrentes ou indisponíveis', async () => {
    current = workspace({ credenciais: [credential({ proximaConsultaEm: '2098-01-01T00:00:00Z' })] })
    await render(); expect(button('Consultar NF-e agora').disabled).toBe(true)
    await click('Consultar NF-e agora'); expect(posts()).toHaveLength(0)
    current = workspace({ configurado: false, credenciais: [credential()] })
    await click('Atualizar'); expect(button('Consultar NF-e agora').disabled).toBe(true)
  })
  it('não oferece consulta de certificado vencido ou suspenso', async () => {
    current = workspace({ credenciais: [credential({ status: 'expirada', validadeFim: '2000-01-01T00:00:00Z' }), credential({ id: 'suspenso', status: 'suspensa' })] })
    await render()
    expect(button('Consultar NF-e agora')).toBeUndefined()
    expect(host.textContent).toContain('Certificado vencido')
    expect(host.textContent).toContain('Uso suspenso')
  })
  it('avisa a renovação próxima com base na validade real', async () => {
    current = workspace({ credenciais: [credential({ validadeFim: new Date(Date.now() + 10 * 86400_000).toISOString() })] })
    await render()
    expect(host.textContent).toContain('Renovação próxima')
  })
  it('ativa a automação por ação explícita usando a versão conferida', async () => {
    current = workspace({ credenciais: [credential()] })
    await render(); expect(patches()).toHaveLength(0)
    await click('Ativar acompanhamento automático')
    expect(patches()[0][0]).toBe('/api/portal/fiscal/conexao/credenciais/certificado-a/automacao')
    expect(JSON.parse(patches()[0][1]?.body as string)).toEqual({ ativa: true, expectedUpdatedAt: credential().atualizadoEm })
  })
  it('exige confirmação da suspensão e explica a diferença para revogação na certificadora', async () => {
    current = workspace({ credenciais: [credential({ automacaoAtiva: true })] })
    await render(); await click('Suspender certificado')
    expect(posts()).toHaveLength(0)
    expect(host.textContent).toContain('não revoga o certificado na certificadora')
    await click('Manter certificado'); expect(posts()).toHaveLength(0)
    await click('Suspender certificado'); await click('Confirmar suspensão do certificado')
    expect(posts()[0][0]).toBe('/api/portal/fiscal/conexao/credenciais/certificado-a/suspender')
    expect(JSON.parse(posts()[0][1]?.body as string)).toEqual({ expectedUpdatedAt: credential().atualizadoEm })
  })
  it('uma falha da consulta recarrega a situação e mantém a mensagem sem inventar sucesso', async () => {
    current = workspace({ credenciais: [credential()] })
    vi.mocked(apiCall).mockImplementation(async (_path, init) => init?.method ? { ok: false, error: 'Aguarde o intervalo informado pelo órgão.', status: 429 } : { ok: true, data: current } as never)
    await render(); await click('Consultar NF-e agora')
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Aguarde o intervalo')
    expect(host.textContent).not.toContain('Consulta processada')
    expect(vi.mocked(apiCall).mock.calls.filter(([, init]) => !init?.method)).toHaveLength(2)
  })
  it('não inicia outra consulta enquanto a primeira ainda aguarda confirmação', async () => {
    let resolve!: (response: never) => void
    current = workspace({ credenciais: [credential()] })
    vi.mocked(apiCall).mockImplementation(async (_path, init) => init?.method ? new Promise(done => { resolve = done }) : { ok: true, data: current } as never)
    await render()
    await act(async () => { button('Consultar NF-e agora').click(); button('Consultar NF-e agora').click() })
    expect(posts()).toHaveLength(1)
    await act(async () => resolve({ ok: true, data: {} } as never))
  })
  it('exibe retornos reais e não trata retorno sem documentos como regularidade fiscal', async () => {
    current = workspace({ consultas: [{ id: 'query-a', credencialId: 'certificado-a', status: 'sem_documentos', mensagem: 'Nenhum documento localizado para esta distribuição.', iniciadaEm: '2026-09-13T10:00:00Z', codigo: '137', documentosRecebidos: 0 }] })
    await render()
    expect(host.textContent).toContain('Sem novos documentos')
    expect(host.textContent).toContain('Retorno do órgão: 137')
    expect(host.textContent).toContain('Isso não informa se existem débitos')
  })
})

describe('Documentos fiscais e uso pela equipe', () => {
  const documents = (): FiscalConnectionData['documentos'] => [
    { id: 'xml-resumo', chave: '35260912345678000123550010000000011234567890', nsu: '000000000000001', tipo: 'resumo', emitente: 'Emitente sintético A', valor: '12345.67', emissao: '2026-09-12T12:00:00Z', recebidoEm: '2026-09-13T10:00:00Z', arquivoNome: 'resumo.xml' },
    { id: 'xml-completa', chave: '35260912345678000123550010000000021234567890', nsu: '000000000000002', tipo: 'nfe', emitente: 'Emitente sintético B', valor: '0.00', recebidoEm: '2026-09-13T10:00:00Z', arquivoNome: 'nota.xml' },
  ]
  it.each([
    ['pendente', 'Aguardando encaminhamento'],
    ['encaminhado', 'Acompanhe a análise da ALIX'],
    ['erro', 'A equipe precisa revisar'],
  ] as const)('apresenta o estado real do encaminhamento documental: %s', async (processamento, message) => {
    current = workspace({ documentos: [{ ...documents()[0], processamento }] })
    await render()
    expect(host.textContent).toContain(message)
    expect(host.textContent).not.toContain('Análise concluída')
  })
  it('distingue resumo de XML completo, formata valores como moeda e filtra documentos reais', async () => {
    current = workspace({ documentos: documents() })
    await render()
    expect(host.textContent).toContain('Resumo de NF-e')
    expect(host.textContent).toContain('NF-e completa')
    expect(host.textContent?.replace(/\s/g, '')).toContain('R$12.345,67')
    await edit('Tipo de documento', 'resumo')
    expect(host.textContent).toContain('Emitente sintético A')
    expect(host.textContent).not.toContain('Emitente sintético B')
    await edit('Buscar documento fiscal', 'inexistente')
    expect(host.textContent).toContain('Nenhum documento corresponde aos filtros')
  })
  it('baixa XML pelo endpoint autenticado sem colocar token em URL', async () => {
    current = workspace({ documentos: documents() })
    vi.mocked(fetch).mockResolvedValue({ ok: true, blob: async () => new Blob(['<resNFe/>'], { type: 'application/xml' }) } as Response)
    const create = vi.fn().mockReturnValue('blob:synthetic-download')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await render(); await click('Baixar XML do resumo')
    const [path, init] = vi.mocked(fetch).mock.calls[0]
    expect(path).toBe('/api/portal/fiscal/conexao/documentos/xml-resumo/download')
    expect(init?.headers).toEqual({ Authorization: 'Bearer token-a' })
    expect(anchorClick).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
  })
  it('a equipe consulta pelo cliente correto e nunca recebe campo de senha ou arquivo privado', async () => {
    current = workspace({ credenciais: [credential()] })
    await render({ clienteId: 'cliente/a' })
    expect(host.querySelector('input[type=password]')).toBeNull()
    expect(host.querySelector('input[type=file]')).toBeNull()
    expect(vi.mocked(apiFetch).mock.calls[0][0]).toBe('/clientes/cliente%2Fa/portal/fiscal/conexao')
    await click('Consultar NF-e agora')
    const request = vi.mocked(apiFetch).mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(request[0]).toBe('/clientes/cliente%2Fa/portal/fiscal/conexao/consultar')
    expect(JSON.parse(request[1]?.body as string)).toEqual({ credencialId: 'certificado-a' })
  })
  it('uma sessão da equipe revogada remove imediatamente dados fiscais da tela', async () => {
    current = workspace({ credenciais: [credential()], documentos: documents() })
    await render({ clienteId: 'cliente-a' })
    vi.mocked(apiFetch).mockRejectedValue(new ApiError('Sessão encerrada.', 401))
    await click('Atualizar')
    expect(host.textContent).not.toContain('Titular sintético')
    expect(host.textContent).not.toContain('Emitente sintético A')
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Sessão encerrada')
  })
})
