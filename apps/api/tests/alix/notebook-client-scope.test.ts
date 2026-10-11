import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AlixNotebook } from '../../src/services/alix/notebook/AlixNotebookService.js'

const fixture = vi.hoisted(() => ({
  pg: false, pgError: false,
  clients: new Map<string, Record<string, unknown>>(), aliases: new Map<string, string>(),
  indexes: new Map<string, Record<string, unknown>>(), hits: [] as Array<Record<string, unknown>>,
  query: vi.fn(), consolidate: vi.fn(), proposals: vi.fn(), deals: vi.fn(), ledger: vi.fn(), llm: vi.fn(), search: vi.fn(),
  sessions: new Map<string, Record<string, unknown>>(),
}))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => fixture.pg, getPool: () => ({ query: fixture.query }) }))
vi.mock('../../src/db/AuditLog.js', () => ({ auditAsync: vi.fn() }))
vi.mock('../../src/routes/clientes.js', () => ({ clientes: { get: (id: string) => fixture.clients.get(fixture.aliases.get(id) || id), values: () => fixture.clients.values() } }))
vi.mock('../../src/db/ClienteRepository.js', () => ({ resolveClienteId: async (id: string) => { if (fixture.pgError) throw new Error('PG indisponível'); return fixture.aliases.get(id) || id } }))
vi.mock('../../src/db/AlixSessionRepository.js', () => ({ getSessionAccess: async (id: string) => fixture.sessions.get(id) || null, getSessionsAccess: async (ids: string[]) => ids.map(id => fixture.sessions.get(id)).filter(Boolean) }))
vi.mock('../../src/db/PropostaRepository.js', () => ({ listPropostas: fixture.proposals }))
vi.mock('../../src/services/dealRoom/DealRoomService.js', () => ({ getDealRoomService: () => ({ listByCliente: fixture.deals }) }))
vi.mock('../../src/services/dossies-bancarios/DossieDataConsolidator.js', () => ({ consolidarDadosDossie: fixture.consolidate }))
vi.mock('../../src/services/alix/knowledge/FactLedgerService.js', () => ({ listLedgerFacts: fixture.ledger }))
vi.mock('../../src/services/alix/intake/DocumentIndexService.js', () => ({ getDocumentIndexService: () => ({ get: async (_session: string, id: string) => fixture.indexes.get(id) || null, search: fixture.search }) }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({ runOpenAI: fixture.llm, generateStructured: fixture.llm, searchOpenAIWeb: vi.fn() }))
vi.mock('../../src/services/llm/LLMConfig.js', () => ({ getModelForRole: () => 'fixture' }))

import { AlixNotebookService } from '../../src/services/alix/notebook/AlixNotebookService.js'
import { authorizeNotebookToolInput } from '../../src/services/alix/notebook/NotebookToolAccess.js'
import { withAlixTurnContext } from '../../src/services/alix/AlixTurnContext.js'

describe('Notebook usa apenas identidade explícita e fontes do mesmo caso', () => {
  let directory: string
  let service: AlixNotebookService
  beforeEach(async () => {
    vi.clearAllMocks()
    fixture.pg = false; fixture.pgError = false; fixture.clients.clear(); fixture.aliases.clear(); fixture.indexes.clear(); fixture.sessions.clear(); fixture.hits = []
    fixture.clients.set('client-a', { id: 'client-a', nome: 'Silva Agro Sintético', cpfCnpj: '00000000000' })
    fixture.clients.set('client-b', { id: 'client-b', nome: 'Silva Patrimonial Sintético', cpfCnpj: '11111111111' })
    fixture.proposals.mockResolvedValue([]); fixture.deals.mockResolvedValue([]); fixture.ledger.mockResolvedValue([])
    fixture.consolidate.mockImplementation(async ({ clienteId }) => ({ cliente: fixture.clients.get(clienteId), dados: {}, fontes: [] }))
    fixture.query.mockImplementation(async (_sql, params) => { if (fixture.pgError) throw new Error('PG indisponível'); const client = fixture.clients.get(params[0]); return { rows: client ? [{ ...client, payload: client }] : [] } })
    fixture.search.mockImplementation(async () => fixture.hits)
    fixture.llm.mockResolvedValue({ text: 'Resposta sintética baseada apenas nas notas.', model: 'fixture', usage: {} })
    directory = await mkdtemp(join(tmpdir(), 'aletis-notebook-scope-'))
    service = new AlixNotebookService(directory)
  })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); vi.restoreAllMocks() })

  it.each(['Dossiê Silva', 'Silva Agro Sintético'])('título "%s" não seleciona cliente nem consulta suas bases', async title => {
    const notebook = await service.create({ title, objective: 'Silva Patrimonial Sintético', sourceScope: { includeWeb: false } })
    await service.addNote(notebook.id, 'Conferir documentação enviada pelo consultor.')
    const map = await service.sourceMap(notebook.id)
    expect(map.sources.find(source => source.kind === 'crm')).toMatchObject({ status: 'missing', selected: false })
    await service.ask(notebook.id, 'Organize as pendências.', 10, false)
    expect(fixture.consolidate).not.toHaveBeenCalled(); expect(fixture.proposals).not.toHaveBeenCalled(); expect(fixture.deals).not.toHaveBeenCalled(); expect(fixture.ledger).not.toHaveBeenCalled()
    expect(JSON.stringify(fixture.llm.mock.calls)).not.toContain('00000000000')
  })
  it('cliente explícito prevalece mesmo quando título e objetivo citam outro cliente', async () => {
    const notebook = await service.create({ title: 'Silva Patrimonial Sintético', clienteId: 'client-a', objective: 'Comparar Silva Patrimonial Sintético', sourceScope: { includeWeb: false } })
    await service.ask(notebook.id, 'Preparar a síntese.', 10, false)
    expect(fixture.consolidate).toHaveBeenCalledWith({ banco: 'geral', clienteId: 'client-a' })
    expect(JSON.stringify(fixture.llm.mock.calls)).toContain('00000000000')
    expect(JSON.stringify(fixture.llm.mock.calls)).not.toContain('11111111111')
  })
  it('vínculo inexistente falha sem recuperar outro cliente pelo nome', async () => {
    await expect(service.create({ title: 'Silva Agro Sintético', clienteId: 'missing' })).rejects.toThrow('não foi encontrado')
    expect(fixture.consolidate).not.toHaveBeenCalled()
  })
  it('conserva referências antigas por alias canônico', async () => {
    fixture.aliases.set('old-a', 'client-a')
    fixture.indexes.set('doc-a', { documentId: 'doc-a', sessionId: 'session-a', clienteId: 'old-a', filename: 'Contrato sintético', kind: 'pdf' })
    const notebook = await service.create({ title: 'Caso consolidado', clienteId: 'old-a', sources: [{ sessionId: 'session-a', documentId: 'doc-a' }] })
    fixture.hits = [{ documentId: 'doc-a', sessionId: 'session-a', clienteId: 'old-a', text: 'Cláusula verificada', score: 1 }]
    expect(notebook.clienteId).toBe('client-a')
    expect(await service.search(notebook.id, 'Cláusula')).toHaveLength(1)
    expect(fixture.search).toHaveBeenCalledWith(expect.objectContaining({ clienteId: 'old-a', documentId: 'doc-a' }))
  })
  it('recusa fonte de outro cliente na inclusão e revalida mudanças posteriores', async () => {
    fixture.indexes.set('doc-a', { documentId: 'doc-a', sessionId: 'session-a', clienteId: 'client-b', filename: 'Contrato sintético', kind: 'pdf' })
    await expect(service.create({ title: 'Caso A', clienteId: 'client-a', sources: [{ sessionId: 'session-a', documentId: 'doc-a' }] })).rejects.toThrow('outro cliente')
    fixture.indexes.get('doc-a')!.clienteId = 'client-a'
    const notebook = await service.create({ title: 'Caso A', clienteId: 'client-a', sources: [{ sessionId: 'session-a', documentId: 'doc-a' }] })
    fixture.indexes.get('doc-a')!.clienteId = 'client-b'
    await expect(service.search(notebook.id, 'contrato')).rejects.toThrow('outro cliente')
    expect(fixture.search).not.toHaveBeenCalled()
  })
  it('recusa resultado do índice de outra sessão ou documento', async () => {
    fixture.indexes.set('doc-a', { documentId: 'doc-a', sessionId: 'session-a', clienteId: 'client-a', filename: 'Contrato sintético', kind: 'pdf' })
    const notebook = await service.create({ title: 'Caso A', clienteId: 'client-a', sources: [{ sessionId: 'session-a', documentId: 'doc-a' }] })
    fixture.hits = [{ documentId: 'doc-b', sessionId: 'session-a', clienteId: 'client-a', text: 'conteúdo indevido', score: 1 }]
    await expect(service.search(notebook.id, 'contrato')).rejects.toThrow('fora do escopo')
  })
  it('recusa metadado de outra sessão mesmo quando o cliente coincide', async () => {
    fixture.indexes.set('doc-a', { documentId: 'doc-a', sessionId: 'session-b', clienteId: 'client-a', filename: 'Outro documento', kind: 'pdf' })
    await expect(service.create({ title: 'Caso A', clienteId: 'client-a', sources: [{ sessionId: 'session-a', documentId: 'doc-a' }] })).rejects.toThrow('escopo selecionado')
  })
  it('filtra sessões autorizadas antes do limite para não ocultar o trabalho próprio', async () => {
    fixture.sessions.set('session-a', { id: 'session-a', consultorId: 'consultor-a' })
    fixture.sessions.set('session-b', { id: 'session-b', consultorId: 'consultor-b' })
    await service.create({ title: 'Meu caso', sessionId: 'session-a' })
    for (let index = 0; index < 4; index++) await service.create({ title: `Outro caso ${index}`, sessionId: 'session-b' })
    const list = await service.list({ limit: 1 }, { strict: true, ownerIds: ['consultor-a'] })
    expect(list).toHaveLength(1); expect(list[0].title).toBe('Meu caso')
  })
  it('artefato ou comentário de outro Notebook não é recuperado por troca de ID', async () => {
    const first = await service.create({ title: 'Caso A' }), second = await service.create({ title: 'Caso B' })
    second.artifacts = [{ id: 'artifact-b', lineageId: 'artifact-b', version: 1, title: 'Parecer B', kind: 'parecer', markdown: 'Conteúdo do outro caso', citations: [], createdAt: second.createdAt }]
    await writeFile(join(directory, `${second.id}.json`), JSON.stringify(second))
    expect(await service.getArtifact(first.id, 'artifact-b')).toBeNull()
    await expect(service.addComment(first.id, { artifactId: 'artifact-b', text: 'Não deve associar' })).rejects.toThrow('não pertence')
    await expect(service.convertArtifact(first.id, 'artifact-b', { target: 'note' })).rejects.toThrow()
  })
  it.each([undefined, { strict: true }, { strict: false }])('PG nunca usa JSON antigo após erro ou ausência, inclusive com opções %j', async options => {
    const notebook = await service.create({ title: 'Caso antigo' })
    vi.spyOn(service as any, 'ensurePg').mockResolvedValue(undefined)
    fixture.pg = true; fixture.pgError = true
    await expect(service.get(notebook.id, options)).rejects.toMatchObject({ statusCode: 503, code: 'NOTEBOOK_STORAGE_UNAVAILABLE' })
    await expect(service.list({}, options)).rejects.toMatchObject({ statusCode: 503, code: 'NOTEBOOK_STORAGE_UNAVAILABLE' })
    fixture.pgError = false; fixture.query.mockResolvedValue({ rows: [] })
    expect(await service.get(notebook.id, options)).toBeNull()
    expect(await service.list({}, options)).toEqual([])
  })
  it('queda do PG entre autorização e segunda leitura não recupera JSON nem alimenta o modelo', async () => {
    const created = await service.create({ title: 'Caso previamente autorizado', sessionId: 'session-a' })
    const notebook = await service.addNote(created.id, 'Conteúdo antigo que não pode servir de fallback.')
    fixture.sessions.set('session-a', { id: 'session-a', consultorId: 'consultor-regis' })
    vi.spyOn(service as any, 'ensurePg').mockResolvedValue(undefined)
    fixture.pg = true
    fixture.query.mockImplementation(async () => {
      if (fixture.pgError) throw new Error('postgresql://private-user:private-token@db /root/private.sql')
      return { rows: [{ payload: notebook }] }
    })
    await withAlixTurnContext({ sessionId: 'session-a', actor: { id: 'consultor-regis', nome: 'Regis' } }, async () => {
      await authorizeNotebookToolInput(service, 'session-a', undefined, { notebookId: notebook.id }, [])
      fixture.pgError = true
      await expect(service.ask(notebook.id, 'Resuma o caso.', 10, false)).rejects.toMatchObject({ statusCode: 503, code: 'NOTEBOOK_STORAGE_UNAVAILABLE' })
    })
    expect(fixture.llm).not.toHaveBeenCalled()
  })
  it('PG indisponível não libera os dados antigos do Map', async () => {
    const notebook = await service.create({ title: 'Caso A', clienteId: 'client-a' })
    vi.spyOn(service, 'get').mockResolvedValue(notebook)
    fixture.pg = true; fixture.pgError = true
    await expect(service.sourceMap(notebook.id)).rejects.toThrow('PG indisponível')
    expect(fixture.consolidate).not.toHaveBeenCalled()
  })
  it('usa ID canônico retornado pelo PG em todas as consultas do mapa', async () => {
    const notebook = await service.create({ title: 'Caso A', clienteId: 'client-a' })
    const legacy = { ...notebook, clienteId: 'old-a' } as AlixNotebook
    vi.spyOn(service, 'get').mockResolvedValue(legacy)
    fixture.aliases.set('old-a', 'client-a'); fixture.pg = true
    const map = await service.sourceMap(notebook.id)
    expect(fixture.query).toHaveBeenCalledWith(expect.stringContaining('select id, nome'), ['client-a'])
    expect(map.sources.find(source => source.kind === 'crm')?.id).toBe('crm:client-a')
    expect(fixture.deals).toHaveBeenCalledWith('client-a')
  })
})
