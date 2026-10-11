import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fx = vi.hoisted(() => ({
  sessions: new Map<string, any>(), notebooks: new Map<string, any>(), databaseError: false,
  access: vi.fn(), get: vi.fn(), list: vi.fn(), create: vi.fn(), addSources: vi.fn(), search: vi.fn(), ask: vi.fn(), synthesize: vi.fn(), sourceMap: vi.fn(), updateArtifact: vi.fn(), convertArtifact: vi.fn(),
}))
vi.mock('../../src/db/AlixSessionRepository.js', () => ({ getSessionAccess: fx.access, getSessionsAccess: async (ids: string[]) => (await Promise.all(ids.map(id => fx.access(id)))).filter(Boolean) }))
vi.mock('../../src/db/ClienteRepository.js', () => ({ resolveClienteId: async (id: string) => id === 'old-client-a' ? 'client-a' : id }))
vi.mock('../../src/services/alix/notebook/AlixNotebookService.js', () => ({ getAlixNotebookService: () => fx }))
import { buildNotebookTools } from '../../src/services/alix/tools/notebooks.js'
import { withAlixTurnContext, type AlixTurnContext } from '../../src/services/alix/AlixTurnContext.js'

const names = ['listar_notebooks_documentais', 'criar_notebook_documental', 'adicionar_fontes_notebook', 'pesquisar_notebook_documental', 'perguntar_ao_notebook', 'gerar_documento_notebook', 'mapear_fontes_notebook', 'atualizar_documento_notebook', 'converter_resposta_notebook']
const notebookNames = names.slice(2)
const source = (sessionId: string) => ({ sessionId, documentId: `doc-${sessionId}`, filename: `Fonte ${sessionId}`, addedAt: '2026-09-13T00:00:00Z' })
const notebook = (id: string, sessionId?: string, sources: any[] = []) => ({ id, title: `Caso ${id}`, sessionId, clienteId: 'client-a', sources, artifacts: [], sourceScope: {}, notes: [], comments: [], actions: [], updatedAt: '2026-09-13T00:00:00Z' })
const turn = (actorId = 'consultor-regis', sessionId = 'session-own', clienteId: string | undefined = 'client-a'): AlixTurnContext => ({ sessionId, clienteId, actor: { id: actorId, nome: 'Nome informado no contexto' } })
const fixtureInput = { notebookId: 'other', artifactId: 'artifact-other', titulo: 'Novo', query: 'Contrato', pergunta: 'Conferir contrato', tipo: 'parecer', destino: 'note', documentos: [] }
const run = (name: string, input: Record<string, unknown> = {}, context = turn(), boundSessionId = 'session-own', boundClienteId: string | undefined = 'client-a') => withAlixTurnContext(context, () => buildNotebookTools(boundSessionId, boundClienteId).registry[name].handler(input))
const actions = () => [fx.create, fx.addSources, fx.search, fx.ask, fx.synthesize, fx.sourceMap, fx.updateArtifact, fx.convertArtifact]

beforeEach(() => {
  vi.clearAllMocks(); fx.sessions.clear(); fx.notebooks.clear(); fx.databaseError = false
  vi.stubEnv('ALETIS_INTERNAL_AUTH_ENABLED', '1'); vi.stubEnv('ALIX_AUTH_STRICT', 'false'); vi.stubEnv('ALIX_ADMIN_USER_IDS', ''); vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', '')
  vi.stubGlobal('fetch', () => { throw new Error('Rede proibida nesta suíte') })
  fx.sessions.set('session-own', { id: 'session-own', consultorId: 'consultor-regis', clienteId: 'client-a' })
  fx.sessions.set('session-other', { id: 'session-other', consultorId: 'consultora-eliandra', clienteId: 'client-a' })
  fx.sessions.set('session-second', { id: 'session-second', consultorId: 'consultor-regis', clienteId: 'client-a' })
  fx.sessions.set('session-admin', { id: 'session-admin', consultorId: 'consultor-christian' })
  fx.sessions.set('session-legacy', { id: 'session-legacy' })
  fx.notebooks.set('own', notebook('own', 'session-own', [source('session-own')]))
  fx.notebooks.set('other', notebook('other', 'session-other', [source('session-other')]))
  fx.notebooks.set('second', notebook('second', 'session-second', [source('session-second')]))
  fx.notebooks.set('mixed', notebook('mixed', 'session-own', [source('session-other')]))
  fx.notebooks.set('legacy', notebook('legacy', 'session-legacy'))
  fx.notebooks.set('no-session', notebook('no-session'))
  fx.access.mockImplementation(async id => { if (fx.databaseError) throw new Error('postgresql://private-user:private-token@db /root/private.sql'); return fx.sessions.get(id) || null })
  fx.get.mockImplementation(async id => fx.notebooks.get(id) || null)
  fx.list.mockImplementation(async () => [...fx.notebooks.values()])
  fx.create.mockImplementation(async input => ({ ...input, id: 'new' }))
  fx.addSources.mockImplementation(async id => fx.notebooks.get(id))
  fx.search.mockResolvedValue([{ text: 'Trecho autorizado', citationId: 'S1' }])
  fx.ask.mockResolvedValue({ id: 'artifact-own', markdown: 'Resposta autorizada' })
  fx.synthesize.mockResolvedValue({ id: 'artifact-own', markdown: 'Síntese autorizada' })
  fx.sourceMap.mockResolvedValue({ sources: [], gaps: [] })
  fx.updateArtifact.mockResolvedValue({ id: 'artifact-updated' })
  fx.convertArtifact.mockResolvedValue({ artifact: { id: 'converted' } })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('ferramentas de Notebook autorizam o ator real antes de consultar ou alterar', () => {
  it.each(names)('%s falha fechada sem ator, mesmo com identidade/admin inventados pelo modelo', async name => {
    const input = { ...fixtureInput, actor: { id: 'consultor-christian' }, userId: 'consultor-christian', role: 'admin_master', authSource: 'internal' }
    const result = await buildNotebookTools('session-own', 'client-a').registry[name].handler(input)
    expect(result).toMatchObject({ ok: false, success: false, completed: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    expect(fx.access).not.toHaveBeenCalled(); expect(fx.get).not.toHaveBeenCalled(); expect(fx.list).not.toHaveBeenCalled()
    for (const action of actions()) expect(action).not.toHaveBeenCalled()
  })
  it.each(notebookNames)('%s não lê nem edita Notebook de outro ator por ID sugerido pelo modelo', async name => {
    const result = await run(name, { ...fixtureInput, role: 'admin_master', actorId: 'consultora-eliandra' })
    expect(result).toMatchObject({ ok: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    expect(JSON.stringify(result)).not.toMatch(/Caso other|Fonte session-other|artifact-other/)
    expect(fx.get).toHaveBeenCalledWith('other', { strict: true })
    for (const action of actions()) expect(action).not.toHaveBeenCalled()
  })
  it('filtra a lista e passa o dono canônico antes do limite', async () => {
    const result = await run('listar_notebooks_documentais', { limit: 1, role: 'admin_master', consultorId: 'consultor-christian' }) as any
    expect(result.notebooks.map((item: any) => item.id)).toEqual(['own', 'second'])
    expect(result.total).toBe(2)
    expect(fx.list).toHaveBeenCalledWith({ clienteId: 'client-a', sessionId: undefined, limit: 1 }, { strict: true, ownerIds: ['consultor-regis'], sharedSessionIds: [] })
    expect(JSON.stringify(result)).not.toMatch(/Caso other|Caso mixed|Caso no-session/)
  })
  it('sessão estrangeira no filtro é negada antes da listagem', async () => {
    expect(await run('listar_notebooks_documentais', { sessionId: 'session-other' })).toMatchObject({ ok: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    expect(fx.list).not.toHaveBeenCalled()
  })
  it.each(['criar_notebook_documental', 'adicionar_fontes_notebook'])('%s nega fontes de outra sessão antes de criar/editar', async name => {
    expect(await run(name, { ...fixtureInput, notebookId: name === 'criar_notebook_documental' ? undefined : 'own', documentos: [source('session-other')] })).toMatchObject({ ok: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    expect(fx.create).not.toHaveBeenCalled(); expect(fx.addSources).not.toHaveBeenCalled()
  })
  it('bloqueia fontes antigas que se tornaram inacessíveis antes de busca e redação', async () => {
    for (const name of ['pesquisar_notebook_documental', 'perguntar_ao_notebook', 'gerar_documento_notebook']) {
      expect(await run(name, { ...fixtureInput, notebookId: 'mixed' })).toMatchObject({ ok: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    }
    expect(fx.search).not.toHaveBeenCalled(); expect(fx.ask).not.toHaveBeenCalled(); expect(fx.synthesize).not.toHaveBeenCalled()
  })
  it('preserva busca, redação e inclusão autorizadas, inclusive outra sessão própria', async () => {
    for (const name of notebookNames) {
      const result = await run(name, { ...fixtureInput, notebookId: 'second', documentos: ['doc-session-own'] }) as any
      expect(result.ok).not.toBe(false)
    }
    expect(fx.search).toHaveBeenCalledWith('second', 'Contrato', 10)
    expect(fx.ask).toHaveBeenCalledWith('second', 'Conferir contrato', 10, true)
    expect(fx.addSources).toHaveBeenCalledWith('second', [{ sessionId: 'session-own', documentId: 'doc-session-own' }])
    const created = await run('criar_notebook_documental', { titulo: 'Novo caso', documentos: ['doc-session-own'], sessionId: 'session-second', actor: { id: 'consultora-eliandra' } })
    expect(created).toMatchObject({ ok: true, notebookId: 'new' })
    expect(fx.create).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-own', clienteId: 'client-a' }))
  })
  it('não troca cliente do turno por argumento do modelo e conserva alias canônico', async () => {
    expect(await run('listar_notebooks_documentais', { clienteId: 'client-b' })).toMatchObject({ ok: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    expect(fx.list).not.toHaveBeenCalled()
    await run('listar_notebooks_documentais', { clienteId: 'old-client-a' })
    expect(fx.list).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'client-a' }), expect.anything())
    fx.notebooks.get('second').clienteId = 'client-b'
    expect(await run('perguntar_ao_notebook', { notebookId: 'second', pergunta: 'Cruzar casos' })).toMatchObject({ ok: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    expect(fx.ask).not.toHaveBeenCalled()
  })
  it('exige correspondência entre a sessão do registro e a do turno', async () => {
    expect(await run('listar_notebooks_documentais', {}, turn('consultor-regis', 'session-second'))).toMatchObject({ ok: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    expect(fx.access).not.toHaveBeenCalled(); expect(fx.list).not.toHaveBeenCalled()
  })
  it('revalida a autoridade em cada chamada mesmo quando o registro é reutilizado', async () => {
    const registry = buildNotebookTools('session-own', 'client-a').registry
    expect(await withAlixTurnContext(turn(), () => registry.pesquisar_notebook_documental.handler({ notebookId: 'own', query: 'Conferir' }))).toMatchObject({ total: 1 })
    fx.sessions.get('session-own').consultorId = 'consultora-eliandra'
    expect(await withAlixTurnContext(turn(), () => registry.pesquisar_notebook_documental.handler({ notebookId: 'own', query: 'Conferir' }))).toMatchObject({ ok: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    expect(fx.search).toHaveBeenCalledTimes(1)
  })
  it('legados sem dono exigem o compartilhamento explícito existente', async () => {
    expect(await run('mapear_fontes_notebook', { notebookId: 'legacy' })).toMatchObject({ ok: false })
    expect(await run('mapear_fontes_notebook', { notebookId: 'no-session' })).toMatchObject({ ok: false })
    vi.stubEnv('ALIX_LEGACY_SHARED_SESSION_IDS', 'session-legacy')
    expect(await run('mapear_fontes_notebook', { notebookId: 'legacy' })).toMatchObject({ ok: true })
    expect(fx.sourceMap).toHaveBeenCalledTimes(1)
  })
  it('papel administrativo vem da configuração do servidor, não dos argumentos ou nome', async () => {
    const context = turn('consultor-christian', 'session-admin')
    expect(await run('mapear_fontes_notebook', { notebookId: 'other', role: 'admin_master' }, context, 'session-admin')).toMatchObject({ ok: false })
    vi.stubEnv('ALIX_ADMIN_USER_IDS', 'consultor-christian')
    expect(await run('mapear_fontes_notebook', { notebookId: 'other' }, context, 'session-admin')).toMatchObject({ ok: true })
    expect(fx.sourceMap).toHaveBeenCalledTimes(1)
  })
  it('contextos assíncronos de dois atores não compartilham autorização', async () => {
    const results = await Promise.all([
      run('pesquisar_notebook_documental', { notebookId: 'own', query: 'Primeiro' }),
      run('pesquisar_notebook_documental', { notebookId: 'own', query: 'Outro ator' }, turn('consultora-eliandra', 'session-other'), 'session-other'),
    ])
    expect(results[0]).toMatchObject({ total: 1 }); expect(results[1]).toMatchObject({ ok: false, code: 'NOTEBOOK_ACCESS_DENIED' })
    expect(fx.search).toHaveBeenCalledTimes(1)
  })
  it('falha da autoridade ou do PG do Notebook não retorna dados nem segredos ao modelo', async () => {
    fx.databaseError = true
    const accessFailure = await run('listar_notebooks_documentais')
    expect(accessFailure).toMatchObject({ ok: false, completed: false, code: 'NOTEBOOK_ACCESS_UNAVAILABLE' })
    expect(fx.list).not.toHaveBeenCalled()
    fx.databaseError = false; fx.get.mockRejectedValue(new Error('postgresql://private-user:private-token@db /root/private.sql'))
    const notebookFailure = await run('perguntar_ao_notebook', { notebookId: 'own', pergunta: 'Conferir' })
    expect(notebookFailure).toMatchObject({ ok: false, completed: false, code: 'NOTEBOOK_ACCESS_UNAVAILABLE' })
    expect(JSON.stringify([accessFailure, notebookFailure])).not.toMatch(/private-user|private-token|postgresql|\/root\/private/)
    expect(fx.ask).not.toHaveBeenCalled()
  })
})
