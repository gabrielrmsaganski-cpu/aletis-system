// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalMatters } from '../src/pages/portal/PortalMatters'
import ClientePortalAssuntosPanel from '../src/components/cliente/ClientePortalAssuntosPanel'
import { apiCall } from '../src/pages/portal/utils'
import { ApiError, apiFetch } from '../src/hooks/useApi'
import type { PortalMatter } from '../src/pages/portal/PortalMattersModel'

vi.mock('../src/pages/portal/utils', async original => ({ ...await original<typeof import('../src/pages/portal/utils')>(), apiCall: vi.fn() }))
vi.mock('../src/hooks/useApi', async original => ({ ...await original<typeof import('../src/hooks/useApi')>(), apiFetch: vi.fn() }))
vi.mock('recharts', () => ({ ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>, BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>, Bar: () => null, Cell: () => null, CartesianGrid: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null }))

const matter: PortalMatter = { id: 'assunto-a', clienteId: 'cliente-a', titulo: 'Revisão sintética do crédito', resumo: 'Conferência dos documentos apresentados.', status: 'em_andamento', dependeDe: 'equipe', visibilidade: 'publicado', proximoPasso: 'A equipe prepara a análise.', marcos: [], criadoEm: '2026-09-13T10:00:00Z', atualizadoEm: '2026-09-13T11:00:00.123Z' }
const data = (items: PortalMatter[] = [matter]) => ({ assuntos: items, eventos: [], resumo: {}, atualizadoEm: matter.atualizadoEm, paginacaoEventos: { proximoCursor: null } })
let host: HTMLDivElement, root: Root
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.includes(name))!
const field = (name: string) => [...host.querySelectorAll('label')].find(item => item.textContent?.startsWith(name))!.querySelector('input, textarea, select') as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
const input = async (name: string, value: string) => {
  const element = field(name)
  await act(async () => {
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}
const mutations = () => vi.mocked(apiFetch).mock.calls.filter(([, init]) => ['POST', 'PATCH'].includes(init?.method || ''))
beforeEach(() => {
  vi.clearAllMocks(); (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  vi.mocked(apiCall).mockImplementation(async path => ({ ok: true, data: path.includes('/historico') ? { eventos: [], proximoCursor: null } : data() }) as never)
  vi.mocked(apiFetch).mockImplementation(async (_path, init) => (init?.method ? matter : data()) as never)
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

describe('Portal: planos, histórico completo e limites de sessão', () => {
  it('não mostra rascunhos nem progresso fictício e mantém alternativa textual dos gráficos', async () => {
    vi.mocked(apiCall).mockImplementation(async path => ({ ok: true, data: path.includes('/historico') ? { eventos: [], proximoCursor: null } : data([matter, { ...matter, id: 'privado', visibilidade: 'rascunho', titulo: 'Rascunho sigiloso' }]) }) as never)
    await act(async () => root.render(<PortalMatters token="token-a" onNavigate={vi.fn()} />))
    expect(host.textContent).toContain(matter.titulo)
    expect(host.textContent).not.toContain('Rascunho sigiloso')
    expect(host.querySelector('[role=progressbar]')).toBeNull()
    expect(host.textContent).toContain('As etapas ainda não foram detalhadas')
    expect(host.querySelector('table caption')?.textContent).toContain('Quantidade de assuntos')
  })
  it('consulta e pagina somente o histórico do assunto escolhido, sem repetir eventos', async () => {
    const event = { id: 'e1', assuntoId: matter.id, titulo: 'Plano publicado', descricao: 'Início sintético do acompanhamento.', data: '2026-09-13T10:00:00Z', tipo: 'publicacao', versao: 1 }
    vi.mocked(apiCall).mockImplementation(async path => ({ ok: true, data: path.includes('/historico') ? { eventos: path.includes('cursor=page2') ? [event, { ...event, id: 'e0', titulo: 'Análise anterior', data: '2026-09-12T10:00:00Z' }, { ...event, id: 'other', assuntoId: 'outro', titulo: 'Evento de outro assunto' }] : [event], proximoCursor: path.includes('cursor=page2') ? null : 'page2' } : data() }) as never)
    await act(async () => root.render(<PortalMatters token="token-a" onNavigate={vi.fn()} />))
    await act(async () => button('Carregar atualizações anteriores').click())
    expect(vi.mocked(apiCall).mock.calls.some(([path]) => path.includes('assuntoId=assunto-a&cursor=page2'))).toBe(true)
    expect(host.textContent?.match(/Plano publicado/g)).toHaveLength(1)
    expect(host.textContent).toContain('13/09/2026')
    expect(host.textContent).toContain('Análise anterior')
    expect(host.textContent).not.toContain('Evento de outro assunto')
    expect(button('Carregar atualizações anteriores')).toBeUndefined()
  })
  it.each([200, 403])('descarta resposta atrasada do acesso A com status %s depois de entrar no B', async status => {
    let resolve!: (result: never) => void
    vi.mocked(apiCall).mockImplementation(async (path, init) => init?.token === 'token-a' ? new Promise(done => { resolve = done }) : ({ ok: true, data: path.includes('/historico') ? { eventos: [], proximoCursor: null } : data([{ ...matter, id: 'assunto-b', clienteId: 'cliente-b', titulo: 'Acompanhamento exclusivo B' }]) }) as never)
    await act(async () => root.render(<PortalMatters token="token-a" onNavigate={vi.fn()} />))
    const oldSignal = vi.mocked(apiCall).mock.calls[0][1]?.signal
    await act(async () => root.render(<PortalMatters token="token-b" onNavigate={vi.fn()} />))
    expect(oldSignal?.aborted).toBe(true)
    await act(async () => resolve((status === 200 ? { ok: true, data: data() } : { ok: false, status, error: 'Acesso antigo' }) as never))
    expect(host.textContent).toContain('Acompanhamento exclusivo B')
    expect(host.textContent).not.toContain(matter.titulo)
    expect(host.textContent).not.toContain('Seu acesso precisa ser atualizado')
  })
  it('mantém assunto solicitado no link e direciona a conversa com contexto', async () => {
    const navigate = vi.fn(), ask = vi.fn()
    vi.mocked(apiCall).mockImplementation(async path => ({ ok: true, data: path.includes('/historico') ? { eventos: [], proximoCursor: null } : data([matter, { ...matter, id: 'encerrado', titulo: 'Assunto já entregue', status: 'concluido', dependeDe: 'nenhum' }]) }) as never)
    await act(async () => root.render(<PortalMatters token="token-a" selectedMatterId="encerrado" onNavigate={navigate} onAskAlix={ask} />))
    expect(host.querySelector('#portal-matter-detail-title')?.textContent).toBe('Assunto já entregue')
    await act(async () => button('Falar sobre este assunto').click())
    expect(navigate).toHaveBeenCalledWith({ view: 'mensagens', draft: 'Gostaria de falar sobre o assunto “Assunto já entregue”.' })
    await act(async () => button('ALIX, explique').click())
    expect(ask.mock.calls[0][0]).toContain('referência encerrado')
  })
})

describe('Equipe: publicação consciente, conclusão real e concorrência', () => {
  const render = async (clienteId = 'cliente-a') => { await act(async () => root.render(<ClientePortalAssuntosPanel clienteId={clienteId} />)) }
  const create = async () => { await render(); await act(async () => button('Novo assunto').click()); await input('Título do assunto', 'Novo acompanhamento'); await input('Resumo para o cliente', 'Conferência sintética do caso.'); await input('Próximo passo que o cliente verá', 'A equipe fará a análise documental.') }
  it('salva rascunho sem publicar e mantém chave idempotente ao repetir confirmação incerta', async () => {
    vi.mocked(apiFetch).mockImplementation(async (_path, init) => { if (init?.method === 'POST') throw new ApiError('Confirmação interrompida.', 0); return data() as never })
    await create()
    expect(button('Publicar no portal').disabled).toBe(true)
    await act(async () => button('Salvar rascunho').click())
    expect(JSON.parse(mutations()[0][1]!.body as string).visibilidade).toBe('rascunho')
    await act(async () => button('Salvar rascunho').click())
    expect(mutations()).toHaveLength(2)
    expect((mutations()[0][1]!.headers as Record<string, string>)['Idempotency-Key']).toBe((mutations()[1][1]!.headers as Record<string, string>)['Idempotency-Key'])
    expect(host.textContent).toContain('Confirmação interrompida')
  })
  it('publicação exige revisão e qualquer mudança no texto exige nova conferência', async () => {
    await create()
    await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
    expect(button('Publicar no portal').disabled).toBe(false)
    await input('Resumo para o cliente', 'Resumo revisado com novas informações.')
    expect(button('Publicar no portal').disabled).toBe(true)
    await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
    await act(async () => button('Publicar no portal').click())
    expect(JSON.parse(mutations()[0][1]!.body as string)).toMatchObject({ titulo: 'Novo acompanhamento', visibilidade: 'publicado', marcos: [] })
  })
  it('nova etapa concluída exige data real, sem completar automaticamente com a data do cadastro', async () => {
    await create(); await act(async () => button('Adicionar etapa').click())
    await input('Nome da etapa 1', 'Conferência realizada'); await input('Situação da etapa 1', 'concluido')
    expect(field('Data e hora reais da conclusão da etapa 1').value).toBe('')
    await act(async () => button('Salvar rascunho').click())
    expect(mutations()).toHaveLength(0)
    await input('Data e hora reais da conclusão da etapa 1', '2026-09-10T14:30')
    await act(async () => button('Conferir prévia do cliente').click())
    expect(host.textContent).toContain('Concluída em 10/09/2026')
    await act(async () => button('Salvar rascunho').click())
    expect(JSON.parse(mutations()[0][1]!.body as string).marcos[0]).toMatchObject({ status: 'concluido', concluidoEm: new Date('2026-09-10T14:30').toISOString() })
  })
  it('mantém marco publicado cancelado no plano e preserva conclusão já registrada', async () => {
    const item = { ...matter, marcos: [{ id: 'done', titulo: 'Leitura concluída', status: 'concluido' as const, concluidoEm: '2026-09-10T15:00:00Z' }, { id: 'pending', titulo: 'Etapa dispensada', status: 'pendente' as const }] }
    vi.mocked(apiFetch).mockImplementation(async (_path, init) => (init?.method ? item : data([item])) as never)
    await render(); await act(async () => button('Atualizar').click())
    expect((field('Situação da etapa 1') as HTMLSelectElement).disabled).toBe(true)
    expect(host.querySelector('[aria-label="Cancelar etapa 1"]')).toBeNull()
    await act(async () => (host.querySelector('[aria-label="Cancelar etapa 2"]') as HTMLButtonElement).click())
    await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
    await act(async () => button('Publicar atualização').click())
    const body = JSON.parse(mutations()[0][1]!.body as string)
    expect(body.expectedUpdatedAt).toBe(matter.atualizadoEm)
    expect(body.marcos).toHaveLength(2)
    expect(body.marcos[0].concluidoEm).toBe('2026-09-10T15:00:00Z')
    expect(body.marcos[1].status).toBe('cancelado')
  })
  it('não substitui versão vista ao receber conflito e mantém a edição para conferência', async () => {
    vi.mocked(apiFetch).mockImplementation(async (_path, init) => { if (init?.method === 'PATCH') throw new ApiError('Outro consultor atualizou este assunto.', 409, 'PORTAL_MATTER_CONFLICT'); return data() as never })
    await render(); await act(async () => button('Atualizar').click()); await input('Resumo para o cliente', 'Minha revisão permanece preparada.')
    await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click()); await act(async () => button('Publicar atualização').click())
    expect(field('Resumo para o cliente').value).toBe('Minha revisão permanece preparada.')
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Outro consultor')
    expect(JSON.parse(mutations()[0][1]!.body as string).expectedUpdatedAt).toBe(matter.atualizadoEm)
    expect(button('Recarregar e descartar')).toBeDefined()
  })
  it('ignora confirmação de publicação e aborta a requisição ao trocar de cliente', async () => {
    let resolve!: (result: never) => void
    vi.mocked(apiFetch).mockImplementation(async (path, init) => init?.method === 'PATCH' ? new Promise(done => { resolve = done }) : data(path.includes('cliente-b') ? [{ ...matter, id: 'b', titulo: 'Assunto exclusivo B' }] : [matter]) as never)
    await render(); await act(async () => button('Atualizar').click()); await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
    await act(async () => button('Publicar atualização').click())
    const signal = mutations()[0][1]!.signal
    await render('cliente-b'); expect(signal?.aborted).toBe(true)
    const calls = vi.mocked(apiFetch).mock.calls.length
    await act(async () => resolve(matter as never))
    expect(vi.mocked(apiFetch).mock.calls).toHaveLength(calls)
    expect(host.textContent).toContain('Assunto exclusivo B')
    expect(host.textContent).not.toContain('Assunto publicado.')
  })

  it('vincula rascunho ao CRM sem transportar descrição interna, ações ou conclusões antigas', async () => {
    const title = 'Assunto de renegociação sintético '.repeat(6)
    const source = { id: 'demanda-1', titulo: title, descricao: 'Estratégia interna sigilosa', proximaAcao: 'Instrução reservada da equipe', checklist: [{ id: 'old-step', titulo: 'Etapa interna privada', concluido: true }] }
    vi.mocked(apiFetch).mockImplementation(async (path, init) => path.endsWith('/demandas') ? [source] : init?.method ? { ...matter, visibilidade: 'rascunho' } : data() as never)
    await render(); await act(async () => button('Usar assunto do CRM').click()); await input('Assunto do CRM', 'demanda-1')
    await act(async () => button('Preparar rascunho vinculado').click())
    expect(field('Título do assunto').value).toBe(title.slice(0, 160))
    expect(field('Resumo para o cliente').value).toBe('')
    expect(field('Próximo passo que o cliente verá').value).toBe('')
    expect(host.textContent).not.toContain('Estratégia interna sigilosa')
    expect(host.textContent).not.toContain('Etapa interna privada')
    expect(host.querySelector('input[type=datetime-local]')).toBeNull()
    await input('Resumo para o cliente', 'Resumo preparado para o acompanhamento público.')
    await act(async () => button('Salvar rascunho').click())
    const body = JSON.parse(mutations()[0][1]!.body as string)
    expect(body).toMatchObject({ demandaId: 'demanda-1', titulo: title.slice(0, 160).trim(), visibilidade: 'rascunho', status: 'nao_iniciado', marcos: [] })
    expect(body).not.toHaveProperty('descricao')
    expect(body).not.toHaveProperty('proximoPasso')
  })

  it('abre plano existente ao escolher demanda já vinculada, preservando o texto preparado para o cliente', async () => {
    vi.mocked(apiFetch).mockImplementation(async path => path.endsWith('/demandas') ? [{ id: 'demanda-1', titulo: 'Título original do CRM' }] : data([{ ...matter, demandaId: 'demanda-1' }]) as never)
    await render(); await act(async () => button('Usar assunto do CRM').click()); await input('Assunto do CRM', 'demanda-1')
    await act(async () => button('Abrir plano existente').click())
    expect(field('Título do assunto').value).toBe(matter.titulo)
    expect(field('Resumo para o cliente').value).toBe(matter.resumo)
    expect(host.querySelector('form')?.getAttribute('aria-label')).toBe('Editar assunto do portal')
    expect(mutations()).toHaveLength(0)
  })

  it('descarta seleção de demanda em trânsito ao trocar de cliente no CRM', async () => {
    let resolve!: (value: never) => void
    vi.mocked(apiFetch).mockImplementation(async path => path === '/clientes/cliente-a/demandas' ? new Promise(done => { resolve = done }) : path.endsWith('/demandas') ? [{ id: 'demanda-b', titulo: 'Demanda exclusiva do cliente B' }] : data() as never)
    await render('cliente-a'); await act(async () => button('Usar assunto do CRM').click())
    const signal = vi.mocked(apiFetch).mock.calls.find(([path]) => path === '/clientes/cliente-a/demandas')![1]?.signal
    await render('cliente-b'); expect(signal?.aborted).toBe(true)
    await act(async () => button('Usar assunto do CRM').click())
    await act(async () => resolve([{ id: 'demanda-a', titulo: 'Demanda privada do cliente A' }] as never))
    expect(host.textContent).toContain('Demanda exclusiva do cliente B')
    expect(host.textContent).not.toContain('Demanda privada do cliente A')
  })
})
