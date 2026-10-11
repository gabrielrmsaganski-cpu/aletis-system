import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { SQL } from 'drizzle-orm'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { cliente, proposta, alixSession, alixMessage } from '../../src/db/schema.js'
import { insertClienteStrict } from '../../src/db/ClienteRepository.js'
import { upsertPropostaStrict } from '../../src/db/PropostaRepository.js'
import { upsertSession, getSessionAccess } from '../../src/db/AlixSessionRepository.js'
import { closeDb } from '../../src/db/client.js'

const outputs = vi.hoisted(() => ({ index: vi.fn(), knowledge: vi.fn(), pipeline: vi.fn() }))
vi.mock('../../src/services/alix/intake/DocumentIndexService.js', () => ({ getDocumentIndexService: () => ({ indexDocument: outputs.index, buildIndex: () => ({ chunks: [], evidences: [] }), persist: vi.fn() }) }))
vi.mock('../../src/services/alix/jobs/AiJobQueueService.js', () => ({ getAiJobQueueService: () => ({ ready: () => true, enqueueDocumentKnowledge: outputs.knowledge, enqueueDocumentPipeline: outputs.pipeline }) }))
vi.mock('../../src/services/alix/extraction/SmartExtractor.js', () => ({ smartExtract: async () => ({ timingMs: 1, classification: {}, result: null }) }))
vi.mock('../../src/services/alix/intake/DoclingParser.js', () => ({ parseWithDocling: async () => null }))
vi.mock('../../src/services/alix/intake/LlmDocExtractor.js', () => ({ extractDocViaLlm: async () => null }))
vi.mock('../../src/services/alix/intake/DocEntityExtractor.js', () => ({ extractEntitiesFromDocument: async () => null }))
vi.mock('../../src/services/alix/jobs/DocumentDeepAnalysisRunner.js', () => ({ runDocumentDeepAnalysis: vi.fn() }))
import { DocumentIntakeService } from '../../src/services/alix/intake/DocumentIntakeService.js'

const fixtureUrl = process.env.ALETIS_IMPLEMENTATION_PG_URL
const suite = fixtureUrl ? describe : describe.skip
suite('persistência real em PostgreSQL descartável', () => {
  let pool: pg.Pool
  let directory: string
  beforeAll(async () => {
    const url = new URL(fixtureUrl!)
    if (url.hostname !== '127.0.0.1' || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') throw new Error('Exige banco local descartável da implementação, porta 55436.')
    await closeDb()
    const bootstrap = new pg.Pool({ connectionString: fixtureUrl, max: 1 })
    try { await bootstrap.query('DROP SCHEMA IF EXISTS aletis_impl_root_tests CASCADE; CREATE SCHEMA aletis_impl_root_tests') } finally { await bootstrap.end() }
    url.searchParams.set('options', '-csearch_path=aletis_impl_root_tests')
    vi.stubEnv('DATABASE_URL', url.toString())
    vi.stubEnv('ALETIS_PG_ENABLED', '1')
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede externa proibida na fixture') }))
    pool = new pg.Pool({ connectionString: url.toString(), max: 4 })
    outputs.index.mockResolvedValue(undefined)
    outputs.knowledge.mockResolvedValue(undefined)
    outputs.pipeline.mockResolvedValue(undefined)
    const dialect = new PgDialect()
    const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"'
    // Cria somente tabelas desta prova, com tipos/defaults do schema real.
    for (const table of [cliente, proposta, alixSession, alixMessage]) {
      const config = getTableConfig(table)
      const columns = config.columns.map(column => {
        let value = ''
        if (column.default instanceof SQL) value = dialect.sqlToQuery(column.default).sql
        else if (typeof column.default === 'string') value = "'" + column.default.replaceAll("'", "''") + "'"
        else if (typeof column.default === 'number' || typeof column.default === 'boolean') value = String(column.default)
        return `${quote(column.name)} ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : column.notNull ? ' NOT NULL' : ''}${value ? ' DEFAULT ' + value : ''}`
      })
      await pool.query(`CREATE TABLE ${quote(config.name)} (${columns.join(',')})`)
    }
    directory = await mkdtemp(join(tmpdir(), 'aletis-impl-pg-documents-'))
  })
  afterAll(async () => {
    await closeDb()
    if (pool) await pool.end()
    if (directory) await rm(directory, { recursive: true, force: true })
    vi.unstubAllEnvs(); vi.unstubAllGlobals()
  })

  it('duas criações com o mesmo ID não sobrescrevem o vencedor', async () => {
    const clients = ['Primeiro', 'Segundo'].map(nome => ({ id: 'fixture-collision', nome, cpfCnpj: '12345678909', estagio: 'analise' }))
    const results = await Promise.allSettled(clients.map(insertClienteStrict))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const saved = (await pool.query('SELECT nome FROM cliente WHERE id=$1', [clients[0].id])).rows
    expect(saved).toEqual([{ nome: clients[results.findIndex(result => result.status === 'fulfilled')].nome }])
  })

  it('preserva dinheiro exato e permite cadastros independentes com o mesmo CPF', async () => {
    await Promise.all(['fixture-a', 'fixture-b'].map(id => insertClienteStrict({ id, nome: 'Pessoa sintética', cpfCnpj: '12345678909', estagio: 'analise', valorTotalDivida: '90071992547409.99' })))
    const rows = (await pool.query("SELECT valor_total_divida, payload FROM cliente WHERE id IN ('fixture-a','fixture-b')")).rows
    expect(rows).toHaveLength(2)
    for (const row of rows) { expect(row.valor_total_divida).toBe('90071992547409.99'); expect(row.payload.valorTotalDivida).toBe('90071992547409.99') }
  })

  it('propaga erro de proposta e conserva a versão anterior no banco', async () => {
    await upsertPropostaStrict({ id: 'fixture-proposal', titulo: 'Original', valorProposta: '100.01' })
    await expect(upsertPropostaStrict({ id: 'fixture-proposal', titulo: 'Inválida', valorProposta: '100000000000000000000.00' })).rejects.toThrow()
    expect((await pool.query('SELECT titulo, valor_proposto FROM proposta WHERE id=$1', ['fixture-proposal'])).rows).toEqual([{ titulo: 'Original', valor_proposto: '100.01' }])
  })

  it('persiste proprietário e contexto da sessão', async () => {
    await upsertSession({ id: 'fixture-session', consultorId: 'fixture-owner', clienteId: 'fixture-a', messages: [] }, { strict: true })
    expect(await getSessionAccess('fixture-session')).toMatchObject({ consultorId: 'fixture-owner', clienteId: 'fixture-a' })
  })

  it('escrita legada preserva proprietário; outro consultor não assume a sessão', async () => {
    await upsertSession({ id: 'fixture-session', clienteId: 'fixture-a', messages: [] }, { strict: true })
    expect(await getSessionAccess('fixture-session')).toMatchObject({ consultorId: 'fixture-owner' })
    await expect(upsertSession({ id: 'fixture-session', consultorId: 'other-owner', clienteId: 'fixture-b', messages: [] }, { strict: true })).rejects.toMatchObject({ code: 'ALIX_SESSION_OWNER_CONFLICT' })
    expect(await getSessionAccess('fixture-session')).toMatchObject({ consultorId: 'fixture-owner', clienteId: 'fixture-a' })
  })

  it('quarentena não publica conhecimento; confirmações em duas instâncias só aceitam um cliente', async () => {
    outputs.index.mockClear(); outputs.knowledge.mockClear(); outputs.pipeline.mockClear()
    const first = new DocumentIntakeService(directory)
    const second = new DocumentIntakeService(directory)
    const document = await first.ingest({ buffer: Buffer.from('Documento sintético sem identificação.'), filename: 'fixture.txt', mimetype: 'text/plain', sessionId: 'fixture-session', processingMode: 'fast' }, { requestedBy: 'fixture-owner', requestedClienteId: 'fixture-a' })
    expect((await pool.query('SELECT cliente_id FROM alix_document WHERE id=$1', [document.id])).rows[0].cliente_id).toBeNull()
    expect(outputs.index).not.toHaveBeenCalled(); expect(outputs.knowledge).not.toHaveBeenCalled()
    const review = { reviewedBy: 'fixture-owner', reason: 'Conferência humana sintética para teste.', verification: 'human' as const }
    const results = await Promise.allSettled([
      first.confirmClientScope(document.sessionId, document.id, { ...review, clienteId: 'fixture-a' }),
      second.confirmClientScope(document.sessionId, document.id, { ...review, clienteId: 'fixture-b' }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const winner = (results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>).value.clienteId
    expect((await first.get(document.sessionId, document.id))?.clienteId).toBe(winner)
    expect(outputs.index).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ clienteId: winner }))
  })

  it('restrição do banco na promoção mantém documento sem cliente e sem derivados', async () => {
    outputs.index.mockClear(); outputs.knowledge.mockClear()
    const service = new DocumentIntakeService(directory)
    const document = await service.ingest({ buffer: Buffer.from('Outro documento sintético sem identificação.'), filename: 'fixture2.txt', mimetype: 'text/plain', sessionId: 'fixture-session', processingMode: 'fast' }, { requestedBy: 'fixture-owner', requestedClienteId: 'fixture-blocked' })
    await pool.query("ALTER TABLE alix_document ADD CONSTRAINT fixture_client_denied CHECK(cliente_id IS DISTINCT FROM 'fixture-blocked')")
    await expect(service.confirmClientScope(document.sessionId, document.id, { clienteId: 'fixture-blocked', reviewedBy: 'fixture-owner', reason: 'Conferência sintética com falha no banco.', verification: 'human' })).rejects.toThrow()
    expect((await service.get(document.sessionId, document.id))?.clienteId).toBeUndefined()
    expect(outputs.index).not.toHaveBeenCalled(); expect(outputs.knowledge).not.toHaveBeenCalled()
  })
})
