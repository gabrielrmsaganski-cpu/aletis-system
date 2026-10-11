import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { analysisHash, groundDriveAnalysis, type AnalysisChunk } from '../../src/services/alix/intake/DriveCorpusAnalysisTypes.js'
import { enqueueDriveAnalysisForCurrentFile } from '../../src/services/alix/intake/DriveCorpusAnalysisStore.js'
import { DriveCorpusAnalysisService } from '../../src/services/alix/intake/DriveCorpusAnalysisService.js'

vi.mock('../../src/services/llm/OpenAIClient.js', () => ({
  generateStructured: vi.fn(() => { throw new Error('Provider real proibido nesta fixture') }),
  isOpenAIEnabled: () => false,
}))

const modelCandidate = (value: string, evidenceText: string, extra: Record<string, unknown> = {}) => ({
  documentType: 'contrato_preliminar',
  candidates: [{ label: 'Dado para conferir', category: 'finance' as const, value, evidenceText, subject: '', context: '', ...extra }],
})
const chunk = (text: string): AnalysisChunk => ({ id: 'chunk-fixture', text, ordinal: 2, page: 3, sheet: 'Operações' })

describe('lastro literal dos candidatos do Drive', () => {
  it('localiza trecho com espaços/quebras reais e mantém hashes, página e pendência de revisão', () => {
    const source = chunk('Cliente: Maria Silva.\nSaldo devedor\n R$ 0,00. Contrato A-123.')
    const output = groundDriveAnalysis(modelCandidate('R$ 0,00', 'Saldo devedor R$ 0,00.', { subject: 'Maria Silva', context: 'A-123' }), source)
    expect(output.rejected).toBe(0)
    expect(output.candidates[0]).toMatchObject({ value: 'R$ 0,00', status: 'pending_review', subject: 'Maria Silva', context: 'A-123',
      evidence: { chunkId: source.id, ordinal: 2, page: 3, sheet: 'Operações', excerpt: 'Saldo devedor\n R$ 0,00.', quoteHash: analysisHash(source.text), excerptHash: analysisHash('Saldo devedor\n R$ 0,00.') } })
  })
  it('rejeita citação inventada, valor fora da citação e remove titular/operação inexistentes', () => {
    const source = chunk('Maria Silva. Contrato A-123. Principal R$ 500,00. Saldo R$ 80,00.')
    expect(groundDriveAnalysis(modelCandidate('R$ 900,00', 'Saldo R$ 900,00.'), source).candidates).toEqual([])
    expect(groundDriveAnalysis(modelCandidate('R$ 500,00', 'Saldo R$ 80,00.'), source).candidates).toEqual([])
    expect(groundDriveAnalysis(modelCandidate('R$ 80,00', 'Saldo R$ 80,00.', { subject: 'Titular Inventado', context: 'CONTRATO-FALSO' }), source).candidates[0]).toMatchObject({ subject: '', context: '' })
  })
  it.each([
    ['1', 'Saldo R$ 1000.'], ['1.000', 'Saldo R$ 1.000,00.'], ['0,00', 'Saldo R$ 100,00.'],
    ['10', 'Saldo R$ -10.'], ['0,5', 'Variação -0,5%.'], ['09-08', 'Vencimento 2026-09-08.'],
    ['Maria', 'Titular Mariana.'],
  ])('não aceita valor fragmentado %s dentro de %s', (value, quote) => {
    expect(groundDriveAnalysis(modelCandidate(value, quote), chunk(quote)).candidates).toEqual([])
  })
  it.each([['0,00', 'Saldo R$ 0,00.'], ['-10', 'Saldo R$ -10.'], ['Maria', 'Titular Maria, CPF registrado.'], ['2026-09-08', 'Vencimento 2026-09-08.']])('preserva o literal completo %s', (value, quote) => {
    expect(groundDriveAnalysis(modelCandidate(value, quote), chunk(quote)).candidates[0].value).toBe(value)
  })
})

describe('análise retomável em PostgreSQL isolado', () => {
  const schema = `drive_analysis_${randomUUID().replaceAll('-', '')}`
  const tenantId = `tenant-${randomUUID()}`
  let pool: pg.Pool
  let schemaCreated = false
  const defaultText = 'Titular Cliente Sintético. Saldo devedor R$ 0,00.'
  const noFacts = () => ({ documentType: 'documento_preliminar', candidates: [] })
  const analyze = vi.fn(async ({ chunk: source }: { filename: string; chunk: AnalysisChunk }) => modelCandidate('R$ 0,00', source.text))
  const service = (limit = 64, model = analyze) => new DriveCorpusAnalysisService({ pool, dailyLimit: limit, analyze: model })
  const row = async (id: string) => (await pool.query('SELECT * FROM alix_drive_analysis WHERE id=$1', [id])).rows[0]
  const budget = async () => Number((await pool.query("SELECT COALESCE(sum(calls),0)::int AS calls FROM alix_drive_analysis_budget WHERE tenant_id=$1 AND day=(now() AT TIME ZONE 'UTC')::date", [tenantId])).rows[0].calls)
  const job = (id: string, pass = 0, clienteId = 'client-a') => ({ analysisId: id, tenantId, clienteId, pass, jobId: `job-${id}-${pass}` })
  async function enqueue(fileId = 'file-a', priority = 0, tenant = tenantId) {
    const client = await pool.connect()
    try { await client.query('BEGIN'); const id = await enqueueDriveAnalysisForCurrentFile(client, tenant, fileId, priority); await client.query('COMMIT'); return id }
    catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  }
  async function seed(options: { fileId?: string; clienteId?: string | null; tenant?: string; texts?: string[]; ordinals?: number[]; status?: string; metadata?: unknown; revision?: string } = {}) {
    const fileId = options.fileId ?? 'file-a'; const tenant = options.tenant ?? tenantId
    const texts = options.texts ?? [defaultText]; const revision = options.revision ?? analysisHash('revision-1')
    const clienteId = options.clienteId === undefined ? 'client-a' : options.clienteId
    const hash = analysisHash(texts.join('\n'))
    await pool.query(`INSERT INTO alix_drive_corpus(tenant_id,file_id,revision_key,name,mime_type,path,cliente_id,category,read_status,coverage,extracted_text,content_hash,scanned_at,metadata)
      VALUES($1,$2,$3,$4,'text/plain','Central/Cliente/Arquivo.txt',$5,'documento',$6,'{"status":"partial","limitations":["OCR pendente em uma página"]}'::jsonb,$7,$8,now(),$9::jsonb)`,
      [tenant,fileId,revision,`${fileId}.txt`,clienteId,options.status ?? 'partial',texts.join('\n'),hash,JSON.stringify(options.metadata ?? {})])
    for (const [index, text] of texts.entries()) await pool.query(`INSERT INTO alix_drive_corpus_chunk(id,tenant_id,file_id,revision_key,ordinal,text,source,page)
      VALUES($1,$2,$3,$4,$5,$6,'fixture:pagina', $7)`, [analysisHash(JSON.stringify([tenant,fileId,revision,index])),tenant,fileId,revision,options.ordinals?.[index] ?? index,text,index+1])
    return { fileId, tenant, revision, hash }
  }

  beforeAll(async () => {
    const fixturePath = process.env.ALETIS_DRIVE_ANALYSIS_FIXTURE_FILE || '/tmp/aletis-drive-corpus-fixture-url'
    const url = new URL((await readFile(fixturePath, 'utf8')).trim())
    if (!['127.0.0.1','localhost'].includes(url.hostname) || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') throw new Error('Somente fixture PostgreSQL local explícita é permitida')
    url.searchParams.delete('options')
    pool = new pg.Pool({ connectionString: url.toString(), max: 8, options: `-c search_path=${schema},public` })
    await pool.query(`CREATE SCHEMA ${schema}`); schemaCreated = true
    if ((await pool.query('SELECT current_schema() AS schema')).rows[0].schema !== schema) throw new Error('Schema isolado não foi ativado')
    await pool.query('CREATE TABLE cliente(id text PRIMARY KEY,payload jsonb NOT NULL)')
    await pool.query(await readFile(new URL('../../src/db/migrations/0043_alix_drive_corpus.sql', import.meta.url), 'utf8'))
    await pool.query(await readFile(new URL('../../src/db/migrations/0044_alix_drive_analysis.sql', import.meta.url), 'utf8'))
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE alix_drive_analysis_budget,alix_drive_analysis,alix_drive_corpus_chunk,alix_drive_corpus,alix_drive_corpus_run,cliente CASCADE')
    await pool.query(`INSERT INTO cliente VALUES('client-a','{}'),('client-b','{}'),('merged-client','{"identityMerge":{"status":"merged","canonicalId":"client-a"}}')`)
    analyze.mockReset().mockImplementation(async ({ chunk: source }) => modelCandidate('R$ 0,00', source.text))
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede externa proibida no teste') }))
  })
  afterEach(() => { vi.unstubAllGlobals() })
  afterAll(async () => { if (pool) { if (schemaCreated) await pool.query(`DROP SCHEMA ${schema} CASCADE`); await pool.end() } })

  it('cria uma análise por versão e cliente mesmo com enfileiramento concorrente repetido', async () => {
    await seed()
    const ids = await Promise.all([enqueue(), enqueue(), enqueue()])
    expect(new Set(ids).size).toBe(1)
    expect((await pool.query('SELECT count(*)::int AS count FROM alix_drive_analysis')).rows[0].count).toBe(1)
    expect(await row(ids[0]!)).toMatchObject({ status: 'queued', processed_chunks: 0, total_chunks: 1 })
  })
  it('rollback da transação de ingestão não deixa análise pendente sem seu commit', async () => {
    await seed()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      expect(await enqueueDriveAnalysisForCurrentFile(client, tenantId, 'file-a')).toBeTruthy()
      expect((await client.query('SELECT count(*)::int AS count FROM alix_drive_analysis')).rows[0].count).toBe(1)
      await client.query('ROLLBACK')
    } finally { client.release() }
    expect((await pool.query('SELECT count(*)::int AS count FROM alix_drive_analysis')).rows[0].count).toBe(0)
  })
  it.each(['folder','pending','changed','unsupported','failed','deferred'])('não agenda fonte com estado %s', async status => {
    await seed({ status }); expect(await enqueue()).toBeNull(); expect(analyze).not.toHaveBeenCalled()
  })
  it('não agenda arquivo sem cliente, de cliente consolidado ou com acesso removido', async () => {
    await seed({ fileId: 'sem-cliente', clienteId: null }); await seed({ fileId: 'merged', clienteId: 'merged-client' })
    await seed({ fileId: 'removed', metadata: { availability: { status: 'unavailable' } } })
    expect(await enqueue('sem-cliente')).toBeNull(); expect(await enqueue('merged')).toBeNull(); expect(await enqueue('removed')).toBeNull()
  })
  it('confirma um chunk por passagem e retoma em outra instância sem repetir trecho confirmado', async () => {
    await seed({ texts: [defaultText, defaultText, defaultText], ordinals: [2,7,9] })
    const id = (await enqueue())!
    expect(await service().run(job(id))).toMatchObject({ status: 'queued', processedChunks: 1, totalChunks: 3 })
    expect((await row(id)).next_ordinal).toBe(3)
    expect(await service().run(job(id, 0))).toMatchObject({ processedChunks: 1 })
    expect(analyze).toHaveBeenCalledTimes(1)
    expect(await service().run(job(id, 1))).toMatchObject({ status: 'queued', processedChunks: 2 })
    expect(await service().run(job(id, 2))).toMatchObject({ status: 'review_ready', processedChunks: 3 })
    expect(analyze.mock.calls.map(([input]) => input.chunk.ordinal)).toEqual([2,7,9])
    expect(await budget()).toBe(3)
    const current = await service().listCurrent(tenantId, ['client-a'])
    expect(current[0]).toMatchObject({ status: 'review_ready', readingStatus: 'partial', sourceCoverage: { status: 'partial' }, candidates: expect.any(Array) })
    expect(current[0].candidates).toHaveLength(3)
    expect(current[0].candidates.every(item => item.status === 'pending_review')).toBe(true)
  })
  it('não repete modelo após conclusão nem duplica candidato idêntico numa resposta', async () => {
    await seed(); const id = (await enqueue())!
    analyze.mockImplementationOnce(async ({ chunk: source }) => { const output = modelCandidate('R$ 0,00', source.text); output.candidates.push(output.candidates[0]); return output })
    await service().run(job(id))
    expect((await row(id)).payload.candidates).toHaveLength(1)
    await service().run(job(id, 1)); await service().run(job(id, 0))
    expect(analyze).toHaveBeenCalledTimes(1); expect(await budget()).toBe(1)
  })
  it('orçamento zero impede modelo e registra retomada futura sem reservar chamada', async () => {
    await seed(); const id = (await enqueue())!
    expect(await service(0).run(job(id))).toMatchObject({ status: 'waiting_budget', processedChunks: 0 })
    expect(await budget()).toBe(0); expect(analyze).not.toHaveBeenCalled()
    expect((await row(id)).available_at.getTime()).toBeGreaterThan(Date.now())
    const push = vi.fn(async () => ({ jobId: 'não-deveria-enviar' }))
    expect(await service(0).dispatch(push)).toEqual({ scheduled: 0 }); expect(push).not.toHaveBeenCalled()
  })
  it('duas análises concorrentes compartilham o limite diário de uma chamada', async () => {
    await seed(); await seed({ fileId: 'file-b' })
    const first = (await enqueue())!; const second = (await enqueue('file-b'))!
    const outputs = await Promise.all([service(1).run(job(first)), service(1).run(job(second))])
    expect(outputs.map(output => output.status).sort()).toEqual(['review_ready','waiting_budget'])
    expect(await budget()).toBe(1); expect(analyze).toHaveBeenCalledTimes(1)
  })
  it('advisory lock impede chamadas duplicadas enquanto a passagem está em execução', async () => {
    await seed(); const id = (await enqueue())!
    let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve })
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve })
    analyze.mockImplementationOnce(async () => { entered(); await gate; return noFacts() })
    const running = service().run(job(id))
    await started
    try { expect(await service().run(job(id))).toMatchObject({ status: 'busy' }); expect(analyze).toHaveBeenCalledTimes(1) }
    finally { release() }
    expect(await running).toMatchObject({ status: 'review_ready', processedChunks: 1 })
  })
  it('mudança de hash durante o modelo descarta todos os candidatos da fonte antiga', async () => {
    await seed(); const id = (await enqueue())!
    analyze.mockImplementationOnce(async ({ chunk: source }) => {
      await pool.query('UPDATE alix_drive_corpus SET content_hash=$1 WHERE tenant_id=$2 AND file_id=$3', [analysisHash('novo conteúdo'),tenantId,'file-a'])
      return modelCandidate('R$ 0,00', source.text)
    })
    expect(await service().run(job(id))).toMatchObject({ status: 'superseded', processedChunks: 0 })
    expect((await row(id)).payload.candidates).toEqual([])
    expect(await service().listCurrent(tenantId)).toEqual([])
  })
  it('remoção durante o modelo descarta resultado e impede listagem e novo despacho', async () => {
    await seed(); const id = (await enqueue())!
    analyze.mockImplementationOnce(async ({ chunk: source }) => {
      await pool.query(`UPDATE alix_drive_corpus SET metadata='{"availability":{"status":"unavailable"}}' WHERE tenant_id=$1`, [tenantId])
      return modelCandidate('R$ 0,00', source.text)
    })
    expect(await service().run(job(id))).toMatchObject({ status: 'superseded', processedChunks: 0 })
    expect(await service().listCurrent(tenantId)).toEqual([])
    expect(await service().dispatch(async () => ({ jobId: 'não-enviar' }))).toEqual({ scheduled: 0 })
  })
  it('cliente participa do ID, e vínculos anteriores/tenants diferentes não recebem dados', async () => {
    await seed(); const old = (await enqueue())!
    await pool.query("UPDATE alix_drive_corpus SET cliente_id='client-b' WHERE tenant_id=$1", [tenantId])
    const current = (await enqueue())!
    expect(current).not.toBe(old); expect((await row(old)).status).toBe('superseded')
    expect(await service().run(job(current, 0, 'client-a'))).toMatchObject({ status: 'unavailable' })
    expect(await service().run({ ...job(current, 0, 'client-b'), tenantId: 'outro-tenant' })).toMatchObject({ status: 'unavailable' })
    expect(await service().listCurrent(tenantId, ['client-a'])).toEqual([])
    expect(await service().listCurrent('outro-tenant', ['client-b'])).toEqual([])
    expect(await service().listCurrent(tenantId, [])).toEqual([])
    expect(await budget()).toBe(0); expect(analyze).not.toHaveBeenCalled()
  })
  it('fonte já obsoleta é descartada antes de consumir orçamento ou chamar modelo', async () => {
    await seed(); const id = (await enqueue())!
    await pool.query("UPDATE alix_drive_corpus SET read_status='changed',revision_key=$1 WHERE tenant_id=$2", [analysisHash('nova revisão'),tenantId])
    expect(await service().run(job(id))).toMatchObject({ status: 'superseded' })
    expect(await budget()).toBe(0); expect(analyze).not.toHaveBeenCalled()
  })
  it('restore da mesma fonte retoma o cursor sem perder nem repetir o trecho já confirmado', async () => {
    await seed({ texts: [defaultText,defaultText] }); const id = (await enqueue())!
    await service().run(job(id))
    await pool.query(`UPDATE alix_drive_corpus SET metadata='{"availability":{"status":"unavailable"}}' WHERE tenant_id=$1`, [tenantId])
    expect(await service().run(job(id, 1))).toMatchObject({ status: 'superseded' })
    await pool.query(`UPDATE alix_drive_corpus SET metadata='{"availability":{"status":"available"}}' WHERE tenant_id=$1`, [tenantId])
    expect(await enqueue()).toBe(id)
    expect(await service().run(job(id, 1))).toMatchObject({ status: 'review_ready', processedChunks: 2 })
    expect(analyze.mock.calls.map(([input]) => input.chunk.ordinal)).toEqual([0,1])
  })
  it('restore de análise completa reutiliza revisão e evidências sem nova chamada', async () => {
    await seed(); const id = (await enqueue())!; await service().run(job(id))
    const payload = (await row(id)).payload
    await pool.query(`UPDATE alix_drive_corpus SET metadata='{"availability":{"status":"unavailable"}}' WHERE tenant_id=$1`, [tenantId])
    await service().run(job(id, 1))
    await pool.query(`UPDATE alix_drive_corpus SET metadata='{}' WHERE tenant_id=$1`, [tenantId]); await enqueue()
    expect((await service().listCurrent(tenantId))[0]).toMatchObject({ status: 'review_ready', processedChunks: 1 })
    expect((await row(id)).payload).toEqual(payload); expect(analyze).toHaveBeenCalledTimes(1)
  })
  it('falha de enqueue volta à fila e novo despacho recupera a reserva abandonada', async () => {
    await seed(); const id = (await enqueue())!
    expect(await service().dispatch(async () => { throw new Error('Fila indisponível') })).toEqual({ scheduled: 1 })
    expect(await row(id)).toMatchObject({ status: 'queued', error_code: 'QUEUE_UNAVAILABLE', processed_chunks: 0 })
    const push = vi.fn(async () => ({ jobId: 'job-recuperado' }))
    expect(await service().dispatch(push)).toEqual({ scheduled: 0 })
    await pool.query("UPDATE alix_drive_analysis SET available_at=now()-interval '1 second' WHERE id=$1", [id])
    expect(await service().dispatch(push)).toEqual({ scheduled: 1 })
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ analysisId: id, pass: 0, clienteId: 'client-a' }))
    expect(await row(id)).toMatchObject({ status: 'scheduled', job_id: 'job-recuperado' })
  })
  it('despachos concorrentes não enviam a mesma análise duas vezes e recuperam scheduled expirado', async () => {
    await seed(); const id = (await enqueue())!
    const push = vi.fn(async () => ({ jobId: 'job-fixture' }))
    await Promise.all([service().dispatch(push),service().dispatch(push)])
    expect(push).toHaveBeenCalledTimes(1)
    await pool.query("UPDATE alix_drive_analysis SET dispatched_at=now()-interval '11 minutes' WHERE id=$1", [id])
    expect(await service().dispatch(push)).toEqual({ scheduled: 1 })
    expect(push).toHaveBeenCalledTimes(2)
  })
  it('chunk grande pausa sem truncar conteúdo nem gastar orçamento', async () => {
    await seed({ texts: ['x'.repeat(32001)] }); const id = (await enqueue())!
    expect(await service().run(job(id))).toMatchObject({ status: 'paused', processedChunks: 0 })
    expect(await row(id)).toMatchObject({ error_code: 'CHUNK_TOO_LARGE' }); expect(await budget()).toBe(0)
    expect(analyze).not.toHaveBeenCalled()
  })
  it('capacidade de revisão cheia pausa antes de chamar o modelo e preserva evidências existentes', async () => {
    await seed(); const id = (await enqueue())!
    const source = (await pool.query('SELECT id,text,ordinal,page FROM alix_drive_corpus_chunk LIMIT 1')).rows[0] as AnalysisChunk
    const candidate = groundDriveAnalysis(modelCandidate('R$ 0,00', source.text), source).candidates[0]
    const candidates = Array.from({ length: 256 }, (_, index) => ({ ...candidate, id: analysisHash(`candidate-${index}`) }))
    await pool.query('UPDATE alix_drive_analysis SET payload=$2::jsonb WHERE id=$1', [id,JSON.stringify({ candidates })])
    expect(await service().run(job(id))).toMatchObject({ status: 'paused', processedChunks: 0 })
    expect(await row(id)).toMatchObject({ error_code: 'REVIEW_CAPACITY', payload: { candidates } })
    expect(await budget()).toBe(0); expect(analyze).not.toHaveBeenCalled()
  })
  it('falha de modelo conserva cursor, orçamento por tentativa e encerra após três falhas', async () => {
    await seed(); const id = (await enqueue())!
    analyze.mockRejectedValue(new Error('Falha sintética'))
    for (let attempt = 1; attempt <= 3; attempt++) {
      await pool.query("UPDATE alix_drive_analysis SET available_at=now()-interval '1 second' WHERE id=$1", [id])
      await service().run(job(id))
      expect(await row(id)).toMatchObject({ attempts: attempt, processed_chunks: 0, next_ordinal: 0, payload: { candidates: [] } })
    }
    expect((await row(id)).status).toBe('failed'); expect(await budget()).toBe(3)
    await service().run(job(id)); expect(analyze).toHaveBeenCalledTimes(3)
  })
})
