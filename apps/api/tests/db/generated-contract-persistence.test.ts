import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import pg from 'pg'
import { generatedContractPersistence } from '../../src/db/GeneratedContractRepository.js'
import { closeDb } from '../../src/db/client.js'
import contractsRoutes from '../../src/routes/contratos.js'

const pdf = vi.hoisted(() => vi.fn(async () => Buffer.from('%PDF-1.7 fixture sintética')))
vi.mock('../../src/services/PdfGenerator.js', () => ({ generateContratoPdf: pdf }))

const fixtureUrl = process.env.ALETIS_IMPLEMENTATION_PG_URL
const suite = fixtureUrl ? describe : describe.skip
const fixturePrefix = `contract-fixture-${randomUUID()}`
const body = {
  tipo: 'confissao_divida',
  devedor: { nomeCompleto: 'Devedor sintético', cpfCnpj: '00000000000', enderecoCompleto: 'Endereço de teste', cidade: 'Teste', uf: 'MT' },
  credor: { nomeCompleto: 'Credor sintético', cpfCnpj: '00000000000', enderecoCompleto: 'Endereço de teste', cidade: 'Teste', uf: 'MT' },
  divida: { valorAtualizado: 100.01 }, local: 'Teste', uf: 'MT',
}

suite('contratos em PostgreSQL isolado e recarga do processo', () => {
  let pool: pg.Pool
  let app: FastifyInstance
  let second: FastifyInstance
  const createdIds = new Set<string>()

  beforeAll(async () => {
    const url = new URL(fixtureUrl!)
    if (url.hostname !== '127.0.0.1' || url.port !== '55436' || url.pathname !== '/aletis_implementation_fixture') throw new Error('Somente fixture local da implementação, porta 55436.')
    await closeDb()
    vi.stubEnv('DATABASE_URL', fixtureUrl!)
    vi.stubEnv('ALETIS_PG_ENABLED', '1')
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede externa proibida na fixture') }))
    pool = new pg.Pool({ connectionString: fixtureUrl, max: 3 })
    await pool.query(await readFile(new URL('../../src/db/migrations/0041_generated_contract_catalog.sql', import.meta.url), 'utf8'))
    await pool.query('INSERT INTO cliente (id,nome,cpf_cnpj,estagio,payload) VALUES ($1,$2,$3,$4,$5),($6,$2,$3,$4,$5)', [
      `${fixturePrefix}-client-a`, 'Pessoa sintética', '00000000000', 'analise', {}, `${fixturePrefix}-client-b`,
    ])
    await pool.query('INSERT INTO proposta(id,cliente_id,payload) VALUES($1,$2,$3)', [`${fixturePrefix}-proposal`, `${fixturePrefix}-client-a`, {}])
    app = Fastify()
    await app.register(contractsRoutes)
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    await second?.close()
    if (pool) {
      await pool.query('DELETE FROM generated_contract WHERE id=ANY($1::text[])', [[...createdIds]])
      await pool.query('DELETE FROM proposta WHERE id=$1', [`${fixturePrefix}-proposal`])
      await pool.query('DELETE FROM cliente WHERE id=ANY($1::text[])', [[`${fixturePrefix}-client-a`, `${fixturePrefix}-client-b`]])
      await pool.end()
    }
    await closeDb()
    vi.unstubAllEnvs(); vi.unstubAllGlobals()
  })

  async function create(extra: Record<string, unknown> = {}) {
    const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: { ...body, ...extra } })
    expect(response.statusCode).toBe(201)
    const result = response.json().data
    createdIds.add(result.id)
    return result
  }

  it('aplica a migração aditiva duas vezes e mantém os registros', async () => {
    const record = await create()
    await pool.query(await readFile(new URL('../../src/db/migrations/0041_generated_contract_catalog.sql', import.meta.url), 'utf8'))
    expect((await generatedContractPersistence.get(record.id))?.documento).toEqual(record.documento)
  })

  it('preserva Markdown, metadados e referência em nova instância e outro processo sem arquivo local', async () => {
    const record = await create()
    second = Fastify()
    await second.register(contractsRoutes)
    await second.ready()
    const detail = await second.inject(`/api/contratos/${record.id}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json().data).toEqual(record)
    const markdown = await second.inject(record.documento.markdownUrl)
    expect(markdown.statusCode).toBe(200)
    expect(markdown.body).toBe(record.conteudoMarkdown)
    const generatedPdf = await second.inject(record.documento.pdfUrl)
    expect(generatedPdf.statusCode).toBe(200)
    expect(generatedPdf.headers['content-type']).toBe('application/pdf')
    expect(pdf).toHaveBeenLastCalledWith(expect.objectContaining({ conteudoMarkdown: record.conteudoMarkdown, valorTotal: '100.01' }))
    const child = await promisify(execFile)(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../fixtures/generated-contract-reload.ts', import.meta.url)), record.id], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      env: { PATH: process.env.PATH, DATABASE_URL: fixtureUrl!, ALETIS_PG_ENABLED: '1', NODE_ENV: 'test' },
      timeout: 15000,
    })
    expect(JSON.parse(child.stdout)).toEqual({ id: record.id, valorTotal: '100.01', sha256: record.documento.sha256, documento: record.documento })
  })

  it('falha na gravação retorna 503 sem inventar registro confirmado', async () => {
    const before = await pool.query('SELECT count(*)::int AS count FROM generated_contract')
    const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: { ...body, observacoes: 'Marcador sintético\u0000 rejeitado pelo PostgreSQL JSONB' } })
    expect(response.statusCode).toBe(503)
    expect(response.json().success).toBe(false)
    expect((await pool.query('SELECT count(*)::int AS count FROM generated_contract')).rows).toEqual(before.rows)
  })

  it('liga a origem à proposta e rejeita outro cliente ou uma origem inexistente', async () => {
    const record = await create({ propostaId: `${fixturePrefix}-proposal` })
    expect(record.clienteId).toBe(`${fixturePrefix}-client-a`)
    for (const extra of [
      { propostaId: `${fixturePrefix}-proposal`, clienteId: `${fixturePrefix}-client-b` },
      { clienteId: `${fixturePrefix}-missing` },
      { propostaId: `${fixturePrefix}-missing` },
    ]) {
      const response = await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: { ...body, ...extra } })
      expect(response.statusCode).toBe(400)
    }
  })

  it('inserção repetida de ID falha sem sobrescrever o contrato', async () => {
    const record = await create()
    await expect(generatedContractPersistence.insert({ ...record, titulo: 'Tentativa de sobrescrever' })).rejects.toThrow()
    expect((await generatedContractPersistence.get(record.id))?.titulo).toBe(record.titulo)
  })

  it('numeric e JSONB preservam dinheiro exato acima do limite de inteiros seguros', async () => {
    const first = await create()
    const id = `ctr-conf-${randomUUID()}`
    const record = { ...first, id, valorTotal: '90071992547409.99', documento: { ...first.documento, markdownUrl: `/api/contratos/${id}/markdown`, pdfUrl: `/api/contratos/${id}/pdf` } }
    const inserted = await generatedContractPersistence.insert(record)
    createdIds.add(inserted.id)
    const [row] = (await pool.query('SELECT valor_total,payload FROM generated_contract WHERE id=$1', [id])).rows
    expect(row.valor_total).toBe('90071992547409.99')
    expect(row.payload.valorTotal).toBe('90071992547409.99')
  })

  it('PDF indisponível mantém o original e uma tentativa posterior funciona', async () => {
    const record = await create()
    pdf.mockRejectedValueOnce(new Error('Renderizador sintético indisponível'))
    expect((await app.inject(record.documento.pdfUrl)).statusCode).toBe(500)
    expect((await app.inject(record.documento.markdownUrl)).body).toBe(record.conteudoMarkdown)
    expect((await app.inject(record.documento.pdfUrl)).statusCode).toBe(200)
  })

  it('exclusão confirmada é refletida em outra instância e downloads retornam 404', async () => {
    const record = await create()
    expect((await app.inject({ method: 'DELETE', url: `/api/contratos/${record.id}` })).statusCode).toBe(200)
    for (const suffix of ['', '/markdown', '/pdf']) {
      expect((await second.inject(`/api/contratos/${record.id}${suffix}`)).statusCode).toBe(404)
    }
    expect((await app.inject({ method: 'DELETE', url: `/api/contratos/${record.id}` })).statusCode).toBe(404)
  })

  it('corrupção de conteúdo é detectada pelo hash sem substituir pelo cache antigo', async () => {
    const record = await create()
    await pool.query("UPDATE generated_contract SET payload=jsonb_set(payload,'{conteudoMarkdown}',to_jsonb($2::text)) WHERE id=$1", [record.id, 'Conteúdo divergente sintético'])
    const response = await app.inject(`/api/contratos/${record.id}`)
    expect(response.statusCode).toBe(503)
  })

  it('corpo ausente ou inválido é recusado antes de gerar ou persistir', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: {} })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/contratos/gerar', payload: { ...body, devedor: null } })).statusCode).toBe(400)
  })
})
