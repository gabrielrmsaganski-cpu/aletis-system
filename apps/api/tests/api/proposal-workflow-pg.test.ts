import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

type WorkflowModule = typeof import('../../src/services/propostas/ProposalWorkflowService.js')
type DatabaseModule = typeof import('../../src/db/client.js')
type ProposalRoutesModule = typeof import('../../src/routes/propostas.js')
type CachedProposal = ProposalRoutesModule['propostas'] extends Map<string, infer P> ? P : never
const n8n = vi.hoisted(() => ({ dispatch: vi.fn() }))
const routeEdges = vi.hoisted(() => ({
  remember: vi.fn(),
  unused: vi.fn(() => { throw new Error('Integração fora do escopo desta regressão') }),
}))
vi.mock('../../src/services/integrations/N8nAutomationService.js', () => ({ getN8nAutomationService: () => n8n }))
vi.mock('../../src/services/PdfGenerator.js', () => ({ generatePropostaPdf: routeEdges.unused }))
vi.mock('../../src/services/PropostaGeneratorInteligente.js', () => ({ gerarPropostaInteligente: routeEdges.unused }))
vi.mock('../../src/services/alix/intake/DocumentIntakeService.js', () => ({ getDocumentIntakeService: routeEdges.unused }))
vi.mock('../../src/services/alix/intake/DocumentVaultBridgeService.js', () => ({ attachAlixDocumentToCliente: routeEdges.unused }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({ generateStructured: routeEdges.unused }))
vi.mock('../../src/services/alix/memory/AlixMemoryEvents.js', () => ({ rememberPropostaCliente: routeEdges.remember }))
type ProposalSeed = {
  id: string
  clienteId: string
  status: string
  titulo: string
  credor: string
  valorDivida: string
  valorProposta: string
  revision: number
  [key: string]: unknown
}

const FIXTURE_URL = 'postgresql://postgres:aletis-fixture-only@127.0.0.1:55436/aletis_implementation_fixture'
const TABLES = ['cliente', 'proposta', 'cliente_demanda', 'negociacao_credor', 'client_contract', 'client_timeline_event', 'audit_log', 'automation_event'] as const
const MUTATED_TABLES = TABLES.filter(table => table !== 'cliente')

// Nenhum import da aplicação acontece antes do guard da fixture e do search_path.
describe.skipIf(process.env.ALETIS_PROPOSAL_WORKFLOW_FIXTURE !== '1')('fechamento transacional no PostgreSQL descartável', () => {
  const schema = `proposal_workflow_${randomUUID().replaceAll('-', '')}`
  const databaseModules: DatabaseModule[] = []
  let admin: pg.Pool
  let pool: pg.Pool
  let workflow: WorkflowModule
  const actor = { id: 'fixture-consultor', nome: 'Consultor sintético' }

  async function migration(name: string): Promise<string> {
    return readFile(new URL(`../../src/db/migrations/${name}`, import.meta.url), 'utf8')
  }

  async function createTablesFromMigration(name: string, tables: readonly string[]): Promise<void> {
    const source = await migration(name)
    for (const table of tables) {
      const statement = source.match(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? "?${table}"? \\([\\s\\S]*?\\n\\);`))?.[0]
      if (!statement) throw new Error(`DDL ausente na migração da fixture: ${table}`)
      await pool.query(statement)
    }
  }

  async function freshWorkflow(): Promise<WorkflowModule> {
    vi.resetModules()
    const db = await import('../../src/db/client.js')
    databaseModules.push(db)
    return import('../../src/services/propostas/ProposalWorkflowService.js')
  }

  beforeAll(async () => {
    if (process.env.DATABASE_URL !== FIXTURE_URL) throw new Error('Esta suíte exige exatamente a URL PostgreSQL da fixture local')
    admin = new pg.Pool({ connectionString: FIXTURE_URL, max: 1 })
    const identity = (await admin.query('select current_database() as database, inet_server_addr()::text as address')).rows[0]
    expect(identity.database).toBe('aletis_implementation_fixture')
    await admin.query(`create schema "${schema}"`)
    const fixtureUrl = new URL(FIXTURE_URL)
    fixtureUrl.searchParams.set('options', `-c search_path=${schema}`)
    vi.stubEnv('DATABASE_URL', fixtureUrl.toString())
    vi.stubEnv('ALETIS_PG_ENABLED', '1')
    pool = new pg.Pool({ connectionString: fixtureUrl.toString(), max: 4 })

    // DDL real, reduzido às entidades exercitadas. Nenhuma tabela pública é usada.
    await createTablesFromMigration('0000_mysterious_phalanx.sql', ['cliente', 'proposta', 'audit_log'])
    await pool.query(await migration('0009_deal_room.sql'))
    await pool.query(await migration('0010_negociacao_proposta_link.sql'))
    await pool.query(await migration('0015_expand_cliente_estagios.sql'))
    await createTablesFromMigration('0022_aletis_core_ai.sql', ['client_contract', 'client_timeline_event', 'automation_event'])
    await pool.query(await migration('0025_cliente_demandas.sql'))
    await pool.query(await migration('0026_cliente_demanda_operacional.sql'))
    const operational = await migration('0035_operational_core.sql')
    for (const alter of operational.match(/^ALTER TABLE (?:cliente|proposta) ADD COLUMN[^;]+;/gm) ?? []) await pool.query(alter)
    await pool.query("alter table cliente add column escritorio text; alter table cliente alter column organization_id set default 'org-aletis'")
    await pool.query(await migration('0037_client_contract_proposal_links.sql'))
    await pool.query(await migration('0038_negociacao_proposta_active_unique.sql'))
    const files = await readdir(new URL('../../src/db/migrations/', import.meta.url))
    const revisionMigration = files.filter(name => /^0042_.*\.sql$/.test(name))
    expect(revisionMigration).toHaveLength(1)
    await pool.query(await migration(revisionMigration[0]))
    await pool.query(`create function fixture_fail_mutation() returns trigger language plpgsql as $$ begin raise exception 'fixture_failure_%', TG_TABLE_NAME; end $$`)
    workflow = await freshWorkflow()
  })

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede externa proibida nesta suíte') }))
    n8n.dispatch.mockReset().mockResolvedValue({ configured: true, ok: true })
    routeEdges.remember.mockReset()
    routeEdges.unused.mockClear()
    await pool.query(`truncate ${TABLES.map(table => `"${table}"`).join(', ')} restart identity`)
  })

  afterEach(async () => {
    for (const table of MUTATED_TABLES) await pool.query(`drop trigger if exists fixture_fail on "${table}"`)
    await pool.query('drop trigger if exists fixture_deferred on proposta')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(routeEdges.unused).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    for (const db of databaseModules) await db.closeDb()
    await pool?.end()
    if (admin) {
      await admin.query(`drop schema if exists "${schema}" cascade`)
      await admin.end()
    }
    vi.unstubAllEnvs()
  })

  async function seedClient(id = randomUUID()): Promise<string> {
    await pool.query(`insert into cliente(id,nome,cpf_cnpj,estagio,payload) values($1,'Cliente sintético','00000000000','proposta',$2) on conflict(id) do nothing`, [id, { id, nome: 'Cliente sintético', estagio: 'proposta' }])
    return id
  }

  async function seedProposal(overrides: Partial<ProposalSeed> = {}): Promise<ProposalSeed> {
    const clienteId = await seedClient(overrides.clienteId)
    const proposal: ProposalSeed = {
      id: randomUUID(), clienteId, clienteNome: 'Cliente sintético', status: 'enviada', tipo: 'renegociacao',
      titulo: 'Renegociação sintética', credor: 'Banco sintético', valorDivida: '100000.13', valorProposta: '70000.09',
      descontoPercentual: 30, itens: [{ descricao: 'Pagamento sintético', valor: '70000.09', tipo: 'pagamento' }],
      condicoes: ['Condição sintética original'], fundamentacao: 'Fundamentação sintética', observacoes: '',
      dataCriacao: '2026-09-01', dataValidade: '2026-12-31', ultimaAtualizacao: '2026-09-01', pdfUrl: null,
      revision: 0, ...overrides,
    }
    await pool.query(`insert into proposta(id,cliente_id,demanda_id,tipo,status,valor_proposto,titulo,payload,revision) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [proposal.id, clienteId, proposal.demandaId ?? null, proposal.tipo, proposal.status, proposal.valorProposta, proposal.titulo, proposal, proposal.revision])
    return proposal
  }

  async function snapshot(): Promise<Record<string, unknown[]>> {
    return Object.fromEntries(await Promise.all(TABLES.map(async table => [table, (await pool.query(`select * from "${table}" order by id`)).rows])))
  }

  async function accept(proposal: ProposalSeed, expectedRevision?: number) {
    return workflow.updateProposalWorkflow({ id: proposal.id, patch: { status: 'aceita' }, actor, expectedRevision })
  }

  async function expectClosed(proposal: ProposalSeed, result: Awaited<ReturnType<WorkflowModule['updateProposalWorkflow']>>) {
    const persisted = (await pool.query('select * from proposta where id=$1', [proposal.id])).rows[0]
    const demands = (await pool.query('select * from cliente_demanda where cliente_id=$1', [proposal.clienteId])).rows
    const contracts = (await pool.query('select * from client_contract where proposta_id=$1', [proposal.id])).rows
    const deals = (await pool.query('select * from negociacao_credor where proposta_id=$1', [proposal.id])).rows
    expect(persisted.status).toBe('aceita')
    expect(persisted.payload.status).toBe('aceita')
    expect(persisted.payload.revision).toBe(persisted.revision)
    expect(result.proposta.revision).toBe(persisted.revision)
    expect(contracts).toHaveLength(1)
    expect(deals).toHaveLength(1)
    expect(contracts[0]).toMatchObject({
      id: result.contratoId, cliente_id: proposal.clienteId, proposta_id: proposal.id,
      negociacao_id: result.negociacaoId, demanda_id: persisted.demanda_id,
      valor_original: proposal.valorDivida, valor_atual: proposal.valorProposta,
    })
    expect(deals[0]).toMatchObject({ id: result.negociacaoId, cliente_id: proposal.clienteId, valor_atual: proposal.valorDivida, valor_proposto: proposal.valorProposta })
    expect(demands.find(demand => demand.id === persisted.demanda_id)).toMatchObject({ cliente_id: proposal.clienteId, status: 'aprovada' })
    expect(demands.find(demand => demand.id === persisted.demanda_id)?.proposta_ids).toContain(proposal.id)
    return { persisted, contracts, deals, demands }
  }

  it('aceita proposta e grava os vínculos, valores exatos, autoria e eventos em uma transação', async () => {
    const proposal = await seedProposal()
    const result = await accept(proposal, 0)
    const { contracts, deals } = await expectClosed(proposal, result)
    expect(result.changed).toBe(true)
    expect(result.proposta.revision).toBe(1)
    expect(result.createdNegociacao).toBe(true)
    expect(result.createdContrato).toBe(true)
    expect(contracts[0]).toMatchObject({ status: 'rascunho', metadata: { statusGeracao: 'pendente_revisao_juridica' } })
    expect(deals[0].status).toBe('aprovado')
    const audit = (await pool.query('select * from audit_log')).rows
    const timeline = (await pool.query('select * from client_timeline_event')).rows
    const events = (await pool.query('select * from automation_event')).rows
    expect(audit.length).toBeGreaterThan(0)
    expect(audit.every(row => row.ator === actor.id)).toBe(true)
    expect(timeline.length).toBeGreaterThan(0)
    expect(timeline.every(row => row.created_by === actor.id && row.cliente_id === proposal.clienteId)).toBe(true)
    expect(events.length).toBeGreaterThan(0)
    expect(new Set(result.eventIds)).toEqual(new Set(events.map(row => row.id)))
  })

  for (const table of MUTATED_TABLES) {
    it(`falha PostgreSQL em ${table} desfaz todo o fechamento e permite tentar novamente`, async () => {
      const proposal = await seedProposal()
      const before = await snapshot()
      await pool.query(`create trigger fixture_fail before insert or update or delete on "${table}" for each row execute function fixture_fail_mutation()`)
      await expect(accept(proposal, 0)).rejects.toThrow()
      expect(await snapshot()).toEqual(before)
      await pool.query(`drop trigger fixture_fail on "${table}"`)
      await expectClosed(proposal, await accept(proposal, 0))
    })
  }

  it('falha adiada até COMMIT desfaz o banco antes de publicar qualquer demanda em cache', async () => {
    const proposal = await seedProposal()
    workflow = await freshWorkflow()
    const { getClienteDemandaService } = await import('../../src/services/cliente/ClienteDemandaService.js')
    const publish = vi.spyOn(getClienteDemandaService(), 'publishCommittedRows')
    const before = await snapshot()
    await pool.query('create constraint trigger fixture_deferred after update on proposta deferrable initially deferred for each row execute function fixture_fail_mutation()')
    await expect(accept(proposal)).rejects.toThrow()
    expect(publish).not.toHaveBeenCalled()
    expect(await snapshot()).toEqual(before)
  })

  it('repetição após resposta perdida devolve os mesmos vínculos sem duplicar registros ou eventos', async () => {
    const proposal = await seedProposal()
    const first = await accept(proposal, 0)
    const beforeRetry = await snapshot()
    const retry = await accept(proposal, 0)
    expect(retry).toMatchObject({ changed: false, createdNegociacao: false, createdContrato: false, negociacaoId: first.negociacaoId, contratoId: first.contratoId, eventIds: [] })
    expect(await snapshot()).toEqual(beforeRetry)
  })

  it('outra instância sem caches recupera os vínculos persistidos e não repete os eventos', async () => {
    const proposal = await seedProposal()
    const first = await accept(proposal)
    const beforeRestart = await snapshot()
    const restarted = await freshWorkflow()
    const retry = await restarted.updateProposalWorkflow({ id: proposal.id, patch: { status: 'aceita' }, actor })
    expect(retry).toMatchObject({ changed: false, negociacaoId: first.negociacaoId, contratoId: first.contratoId, eventIds: [] })
    expect(await snapshot()).toEqual(beforeRestart)
  })

  it('duas instâncias aceitando a mesma proposta produzem somente um contrato e uma negociação', async () => {
    const proposal = await seedProposal()
    const otherInstance = await freshWorkflow()
    const [first, second] = await Promise.all([
      accept(proposal, 0),
      otherInstance.updateProposalWorkflow({ id: proposal.id, patch: { status: 'aceita' }, expectedRevision: 0, actor }),
    ])
    expect(first.contratoId).toBe(second.contratoId)
    expect(first.negociacaoId).toBe(second.negociacaoId)
    expect([first.changed, second.changed].filter(Boolean)).toHaveLength(1)
    await expectClosed(proposal, first)
  })

  it('duas propostas simultâneas do mesmo cliente preservam demandas e contratos próprios', async () => {
    const clienteId = await seedClient()
    const proposals = await Promise.all([
      seedProposal({ clienteId, titulo: 'Liquidação de custeio', tipo: 'liquidacao', credor: 'Banco A' }),
      seedProposal({ clienteId, titulo: 'Renegociação de investimento', credor: 'Banco B' }),
    ])
    const results = await Promise.all(proposals.map(proposal => accept(proposal, 0)))
    for (let i = 0; i < proposals.length; i++) await expectClosed(proposals[i], results[i])
    expect(new Set(results.map(result => result.contratoId)).size).toBe(2)
    expect(new Set(results.map(result => result.negociacaoId)).size).toBe(2)
    expect(new Set(results.map(result => result.proposta.demandaId)).size).toBe(2)
    const demands = (await pool.query('select numero from cliente_demanda where cliente_id=$1', [clienteId])).rows
    expect(new Set(demands.map(row => row.numero)).size).toBe(2)
  })

  it('alterações parciais simultâneas de duas instâncias preservam ambos os campos', async () => {
    const proposal = await seedProposal({ status: 'em_analise' })
    const otherInstance = await freshWorkflow()
    const results = await Promise.all([
      workflow.updateProposalWorkflow({ id: proposal.id, patch: { titulo: 'Título da primeira aba' }, actor }),
      otherInstance.updateProposalWorkflow({ id: proposal.id, patch: { observacoes: 'Nota da segunda aba' }, actor }),
    ])
    const stored = (await pool.query('select payload,revision from proposta where id=$1', [proposal.id])).rows[0]
    expect(stored.payload).toMatchObject({ titulo: 'Título da primeira aba', observacoes: 'Nota da segunda aba' })
    expect(stored.revision).toBe(2)
    expect(results.map(result => result.proposta.revision).sort()).toEqual([1, 2])
  })

  it('payload completo legado com valores equivalentes não altera os termos já aceitos', async () => {
    const proposal = await seedProposal()
    const first = await accept(proposal)
    const before = await snapshot()
    const repeated = await workflow.updateProposalWorkflow({
      id: proposal.id,
      patch: { ...first.proposta, valorDivida: 100000.13, valorProposta: 70000.09,
        itens: [{ descricao: 'Pagamento sintético', valor: 70000.09, tipo: 'pagamento' }] },
      expectedRevision: 0,
      actor,
    })
    expect(repeated).toMatchObject({ changed: false, contratoId: first.contratoId, negociacaoId: first.negociacaoId, eventIds: [] })
    expect(await snapshot()).toEqual(before)
  })

  it('edição com revisão antiga é recusada e preserva a edição já confirmada', async () => {
    const proposal = await seedProposal({ status: 'em_analise' })
    const first = await workflow.updateProposalWorkflow({ id: proposal.id, patch: { titulo: 'Título atualizado por outra aba' }, expectedRevision: 0, actor })
    expect(first.proposta.revision).toBe(1)
    const before = await snapshot()
    await expect(workflow.updateProposalWorkflow({ id: proposal.id, patch: { titulo: 'Título obsoleto' }, expectedRevision: 0, actor }))
      .rejects.toMatchObject({ statusCode: 409, code: 'REVISION_CONFLICT' })
    expect(await snapshot()).toEqual(before)
  })

  it('consulta o estado atual PostgreSQL antes de aplicar a próxima alteração parcial', async () => {
    const proposal = await seedProposal({ status: 'em_analise' })
    await workflow.updateProposalWorkflow({ id: proposal.id, patch: { titulo: 'Título persistido' }, actor })
    const result = await workflow.updateProposalWorkflow({ id: proposal.id, patch: { observacoes: 'Nota de outra instância' }, actor })
    expect(result.proposta).toMatchObject({ titulo: 'Título persistido', observacoes: 'Nota de outra instância', revision: 2 })
    expect(result.previous.titulo).toBe('Título persistido')
  })

  it('proposta já aceita sem vínculos é reparada uma vez e passa a ser idempotente', async () => {
    const proposal = await seedProposal({ status: 'aceita' })
    const repaired = await accept(proposal)
    await expectClosed(proposal, repaired)
    expect(repaired.createdContrato).toBe(true)
    const before = await snapshot()
    const retry = await accept(proposal)
    expect(retry).toMatchObject({ changed: false, contratoId: repaired.contratoId, negociacaoId: repaired.negociacaoId })
    expect(await snapshot()).toEqual(before)
  })

  it('contrato existente conserva sua negociação encerrada sem criar ou reabrir outra', async () => {
    const proposal = await seedProposal()
    const first = await accept(proposal)
    await pool.query("update negociacao_credor set status='encerrado' where id=$1", [first.negociacaoId])
    const before = await snapshot()
    const retry = await accept(proposal)
    expect(retry).toMatchObject({ changed: false, contratoId: first.contratoId, negociacaoId: first.negociacaoId })
    expect(await snapshot()).toEqual(before)
  })

  it('aceite usa os termos atuais da proposta também na negociação que já existia', async () => {
    const proposal = await seedProposal()
    const linked = await workflow.updateProposalWorkflow({ id: proposal.id, patch: {}, actor })
    const edited = await workflow.updateProposalWorkflow({ id: proposal.id,
      patch: { credor: 'Novo banco sintético', valorDivida: '120000.37', valorProposta: '80000.23' },
      expectedRevision: linked.proposta.revision, actor })
    const current = { ...proposal, credor: 'Novo banco sintético', valorDivida: '120000.37', valorProposta: '80000.23' }
    const accepted = await accept(current, edited.proposta.revision)
    const { deals, contracts } = await expectClosed(current, accepted)
    expect(accepted.negociacaoId).toBe(linked.negociacaoId)
    expect(deals[0].credor).toBe(current.credor)
    expect(contracts[0].credor).toBe(current.credor)
  })

  it('contrato ligado a uma negociação encerrada com outra ativa exige conciliar os vínculos', async () => {
    const proposal = await seedProposal()
    const first = await accept(proposal)
    await pool.query("update negociacao_credor set status='encerrado' where id=$1", [first.negociacaoId])
    await pool.query("insert into negociacao_credor(id,cliente_id,credor,status,proposta_id) values($1,$2,$3,'negociando',$4)", [randomUUID(), proposal.clienteId, proposal.credor, proposal.id])
    const before = await snapshot()
    await expect(accept(proposal)).rejects.toMatchObject({ statusCode: 409, code: 'LINK_CONFLICT' })
    expect(await snapshot()).toEqual(before)
  })

  it('contrato com negociação inexistente é recusado sem substituir o vínculo silenciosamente', async () => {
    const proposal = await seedProposal()
    const first = await accept(proposal)
    await pool.query('update client_contract set negociacao_id=$1 where id=$2', [randomUUID(), first.contratoId])
    const before = await snapshot()
    await expect(accept(proposal)).rejects.toMatchObject({ statusCode: 409, code: 'LINK_CONFLICT' })
    expect(await snapshot()).toEqual(before)
  })

  it('não troca a demanda vinculada ao contrato durante uma repetição', async () => {
    const proposal = await seedProposal()
    const first = await accept(proposal)
    const otherDemand = randomUUID()
    await pool.query("insert into cliente_demanda(id,cliente_id,titulo) values($1,$2,'Outra demanda sintética')", [otherDemand, proposal.clienteId])
    await pool.query('update client_contract set demanda_id=$1 where id=$2', [otherDemand, first.contratoId])
    const before = await snapshot()
    await expect(accept(proposal)).rejects.toMatchObject({ statusCode: 409, code: 'LINK_CONFLICT' })
    expect(await snapshot()).toEqual(before)
  })

  for (const table of ['client_contract', 'negociacao_credor', 'cliente_demanda'] as const) {
    it(`recusa ${table} pertencente a outro cliente e preserva os dados`, async () => {
      const proposal = await seedProposal()
      const first = await accept(proposal)
      const foreignClient = await seedClient()
      const id = table === 'client_contract' ? first.contratoId : table === 'negociacao_credor' ? first.negociacaoId : first.proposta.demandaId
      await pool.query(`update "${table}" set cliente_id=$1 where id=$2`, [foreignClient, id])
      const before = await snapshot()
      await expect(accept(proposal)).rejects.toMatchObject({ statusCode: 409, code: 'LINK_CONFLICT' })
      expect(await snapshot()).toEqual(before)
    })
  }

  const materialEdits = [
    ['valorDivida', '100001.13'], ['valorProposta', '70001.09'], ['credor', 'Outro banco'], ['titulo', 'Outro acordo'],
    ['tipo', 'liquidacao'], ['condicoes', ['Condição material alterada']], ['itens', [{ descricao: 'Outro pagamento', valor: '1.00', tipo: 'pagamento' }]],
    ['dataValidade', '2027-01-01'], ['fundamentacao', 'Outra fundamentação'],
    ['arquivoOrigem', { filename: 'Outra fonte.pdf' }], ['extracaoIa', { origem: 'manual', resumo: 'Outra extração' }],
  ] as const
  for (const [field, value] of materialEdits) {
    it(`preserva o acordo aceito ao recusar alteração material de ${field}`, async () => {
      const proposal = await seedProposal()
      const first = await accept(proposal)
      const before = await snapshot()
      await expect(workflow.updateProposalWorkflow({ id: proposal.id, patch: { [field]: value }, expectedRevision: first.proposta.revision, actor }))
        .rejects.toMatchObject({ statusCode: 409, code: 'ACCEPTED_TERMS_IMMUTABLE' })
      expect(await snapshot()).toEqual(before)
    })
  }

  it('permite observações após aceite sem recriar contrato ou mudar seus valores', async () => {
    const proposal = await seedProposal()
    const first = await accept(proposal)
    const contractBefore = (await pool.query('select * from client_contract where id=$1', [first.contratoId])).rows[0]
    const result = await workflow.updateProposalWorkflow({ id: proposal.id, patch: { observacoes: 'Conferência jurídica agendada' }, expectedRevision: first.proposta.revision, actor })
    expect(result.proposta).toMatchObject({ status: 'aceita', observacoes: 'Conferência jurídica agendada', revision: 2 })
    expect(result).toMatchObject({ contratoId: first.contratoId, negociacaoId: first.negociacaoId, createdContrato: false, createdNegociacao: false })
    expect((await pool.query('select * from client_contract where id=$1', [first.contratoId])).rows[0]).toEqual(contractBefore)
    await expectClosed(proposal, result)
  })

  it('mantém centavos exatos próximos do limite numeric(18,2)', async () => {
    const proposal = await seedProposal({ valorDivida: '9999999999999999.99', valorProposta: '9999999999999999.97', itens: [{ descricao: 'Pagamento sintético', valor: '9999999999999999.97', tipo: 'pagamento' }] })
    await expectClosed(proposal, await accept(proposal))
  })

  it('cliente inexistente e proposta inexistente falham sem criar entidades derivadas', async () => {
    const proposal = await seedProposal()
    await pool.query('delete from cliente where id=$1', [proposal.clienteId])
    const before = await snapshot()
    await expect(accept(proposal)).rejects.toMatchObject({ statusCode: 404, code: 'CLIENT_NOT_FOUND' })
    await expect(workflow.updateProposalWorkflow({ id: randomUUID(), patch: { status: 'aceita' }, actor }))
      .rejects.toMatchObject({ statusCode: 404, code: 'PROPOSAL_NOT_FOUND' })
    expect(await snapshot()).toEqual(before)
  })

  for (const status of ['rascunho', 'em_analise']) {
    it(`exclui ${status}, remove somente seus vínculos de demanda e registra a autoria`, async () => {
      const proposal = await seedProposal({ status })
      const linked = await workflow.updateProposalWorkflow({ id: proposal.id, patch: {}, actor })
      const other = await seedProposal({ status, clienteId: proposal.clienteId, demandaId: linked.proposta.demandaId })
      await workflow.updateProposalWorkflow({ id: other.id, patch: {}, actor })
      await pool.query('update cliente_demanda set proposta_principal_id=$1 where id=$2', [proposal.id, linked.proposta.demandaId])
      const otherBefore = (await pool.query('select * from proposta where id=$1', [other.id])).rows[0]
      const result = await workflow.deleteProposalWorkflow({ id: proposal.id, actor, expectedRevision: linked.proposta.revision })
      expect(result).toMatchObject({ id: proposal.id, deleted: true, previous: { id: proposal.id, status } })
      expect((await pool.query('select * from proposta where id=$1', [proposal.id])).rows).toHaveLength(0)
      const demand = (await pool.query('select * from cliente_demanda where id=$1', [linked.proposta.demandaId])).rows[0]
      expect(demand.proposta_ids).toEqual([other.id])
      expect(demand.proposta_principal_id).not.toBe(proposal.id)
      expect((await pool.query('select * from proposta where id=$1', [other.id])).rows[0]).toEqual(otherBefore)
      const audit = (await pool.query('select * from audit_log order by id desc limit 1')).rows[0]
      expect(audit.ator).toBe(actor.id)
      expect(audit.recurso).toContain(proposal.id)
    })
  }

  for (const status of ['enviada', 'aceita', 'rejeitada', 'expirada']) {
    it(`preserva proposta ${status} quando a exclusão é solicitada`, async () => {
      const proposal = await seedProposal({ status })
      const before = await snapshot()
      await expect(workflow.deleteProposalWorkflow({ id: proposal.id, actor }))
        .rejects.toMatchObject({ statusCode: 409, code: 'PROPOSAL_DELETE_FORBIDDEN' })
      expect(await snapshot()).toEqual(before)
    })
  }

  for (const table of ['proposta', 'cliente_demanda', 'audit_log']) {
    it(`falha PostgreSQL em ${table} reverte a exclusão e a remoção de vínculos`, async () => {
      const proposal = await seedProposal({ status: 'rascunho' })
      const linked = await workflow.updateProposalWorkflow({ id: proposal.id, patch: {}, actor })
      const before = await snapshot()
      await pool.query(`create trigger fixture_fail before insert or update or delete on "${table}" for each row execute function fixture_fail_mutation()`)
      await expect(workflow.deleteProposalWorkflow({ id: proposal.id, actor, expectedRevision: linked.proposta.revision })).rejects.toThrow()
      expect(await snapshot()).toEqual(before)
      await pool.query(`drop trigger fixture_fail on "${table}"`)
      expect(await workflow.deleteProposalWorkflow({ id: proposal.id, actor, expectedRevision: linked.proposta.revision })).toMatchObject({ deleted: true })
      expect((await pool.query('select * from proposta where id=$1', [proposal.id])).rows).toHaveLength(0)
    })
  }

  it('rascunho ligado a negociação encerrada não pode ser excluído', async () => {
    const proposal = await seedProposal({ status: 'rascunho' })
    await pool.query("insert into negociacao_credor(id,cliente_id,credor,status,proposta_id) values($1,$2,$3,'encerrado',$4)", [randomUUID(), proposal.clienteId, proposal.credor, proposal.id])
    const before = await snapshot()
    await expect(workflow.deleteProposalWorkflow({ id: proposal.id, actor }))
      .rejects.toMatchObject({ statusCode: 409, code: 'PROPOSAL_DELETE_FORBIDDEN' })
    expect(await snapshot()).toEqual(before)
  })

  it('rascunho ligado a contrato legado não pode ser excluído', async () => {
    const proposal = await seedProposal({ status: 'rascunho' })
    await pool.query("insert into client_contract(id,cliente_id,titulo,proposta_id) values($1,$2,'Contrato sintético',$3)", [randomUUID(), proposal.clienteId, proposal.id])
    const before = await snapshot()
    await expect(workflow.deleteProposalWorkflow({ id: proposal.id, actor }))
      .rejects.toMatchObject({ statusCode: 409, code: 'PROPOSAL_DELETE_FORBIDDEN' })
    expect(await snapshot()).toEqual(before)
  })

  it('revisão antiga impede excluir a proposta editada por outra operação', async () => {
    const proposal = await seedProposal({ status: 'em_analise' })
    await workflow.updateProposalWorkflow({ id: proposal.id, patch: { titulo: 'Título mais recente' }, actor, expectedRevision: 0 })
    const before = await snapshot()
    await expect(workflow.deleteProposalWorkflow({ id: proposal.id, actor, expectedRevision: 0 }))
      .rejects.toMatchObject({ statusCode: 409, code: 'REVISION_CONFLICT' })
    expect(await snapshot()).toEqual(before)
  })

  it('envio e exclusão concorrentes em duas instâncias permitem apenas uma operação', async () => {
    const proposal = await seedProposal({ status: 'em_analise' })
    const otherInstance = await freshWorkflow()
    const [sent, deleted] = await Promise.allSettled([
      workflow.updateProposalWorkflow({ id: proposal.id, patch: { status: 'enviada' }, actor }),
      otherInstance.deleteProposalWorkflow({ id: proposal.id, actor }),
    ])
    expect([sent.status, deleted.status].filter(status => status === 'fulfilled')).toHaveLength(1)
    const persisted = (await pool.query('select * from proposta where id=$1', [proposal.id])).rows
    const deals = (await pool.query('select * from negociacao_credor where proposta_id=$1', [proposal.id])).rows
    expect((await pool.query('select * from client_contract where proposta_id=$1', [proposal.id])).rows).toHaveLength(0)
    if (deleted.status === 'fulfilled') {
      expect(persisted).toHaveLength(0)
      expect(deals).toHaveLength(0)
    } else {
      expect(persisted[0].status).toBe('enviada')
      expect(deals).toHaveLength(1)
      expect(deleted.reason).toMatchObject({ statusCode: 409, code: 'PROPOSAL_DELETE_FORBIDDEN' })
    }
  })

  it('aceite concorrente à exclusão conserva a proposta aceita e todos os vínculos', async () => {
    const proposal = await seedProposal()
    const otherInstance = await freshWorkflow()
    const [accepted, deleted] = await Promise.allSettled([
      accept(proposal), otherInstance.deleteProposalWorkflow({ id: proposal.id, actor }),
    ])
    expect(accepted.status).toBe('fulfilled')
    expect(deleted.status).toBe('rejected')
    if (accepted.status === 'fulfilled') await expectClosed(proposal, accepted.value)
    if (deleted.status === 'rejected') expect(deleted.reason).toMatchObject({ statusCode: 409, code: 'PROPOSAL_DELETE_FORBIDDEN' })
  })

  it('edição direta de negociação contratada protege os termos e permite notas e encerramento', async () => {
    const proposal = await seedProposal()
    const accepted = await accept(proposal)
    const { DealRoomService } = await import('../../src/services/dealRoom/DealRoomService.js')
    const service = new DealRoomService()
    const before = await snapshot()
    for (const patch of [{ valorProposto: '1.00' }, { propostaId: null }, { credor: 'Outro banco sintético' }]) {
      await expect(service.update(accepted.negociacaoId!, patch)).rejects.toMatchObject({ statusCode: 409 })
      expect(await snapshot()).toEqual(before)
    }
    expect(await service.update(accepted.negociacaoId!, { observacoes: 'Nota após revisão jurídica' }))
      .toMatchObject({ observacoes: 'Nota após revisão jurídica', valorAtual: proposal.valorDivida, valorProposto: proposal.valorProposta })
    expect(await service.update(accepted.negociacaoId!, { status: 'encerrado' })).toMatchObject({ status: 'encerrado' })
    const retry = await accept(proposal)
    expect(retry).toMatchObject({ changed: false, contratoId: accepted.contratoId, negociacaoId: accepted.negociacaoId })
  })

  it('criação direta de negociação e exclusão concorrentes não deixam negociação órfã', async () => {
    const proposal = await seedProposal({ status: 'em_analise' })
    const { DealRoomService } = await import('../../src/services/dealRoom/DealRoomService.js')
    const service = new DealRoomService()
    const otherInstance = await freshWorkflow()
    const [created, deleted] = await Promise.allSettled([
      service.create({ clienteId: proposal.clienteId, credor: proposal.credor, propostaId: proposal.id,
        valorAtual: proposal.valorDivida, valorProposto: proposal.valorProposta, usuarioId: actor.id }),
      otherInstance.deleteProposalWorkflow({ id: proposal.id, actor }),
    ])
    expect([created.status, deleted.status].filter(status => status === 'fulfilled')).toHaveLength(1)
    const rows = (await pool.query('select * from proposta where id=$1', [proposal.id])).rows
    const deals = (await pool.query('select * from negociacao_credor where proposta_id=$1', [proposal.id])).rows
    if (deleted.status === 'fulfilled') { expect(rows).toHaveLength(0); expect(deals).toHaveLength(0) }
    else { expect(rows).toHaveLength(1); expect(deals).toHaveLength(1) }
  })

  it('criação direta para proposta aceita reutiliza sua negociação encerrada sem duplicar', async () => {
    const proposal = await seedProposal()
    const accepted = await accept(proposal)
    await pool.query("update negociacao_credor set status='encerrado' where id=$1", [accepted.negociacaoId])
    const before = await snapshot()
    const { DealRoomService } = await import('../../src/services/dealRoom/DealRoomService.js')
    const deal = await new DealRoomService().create({ clienteId: proposal.clienteId, credor: proposal.credor, propostaId: proposal.id })
    expect(deal).toMatchObject({ id: accepted.negociacaoId, status: 'encerrado' })
    expect(await snapshot()).toEqual(before)
  })

  it('serviço de demandas não remove nem troca diretamente o vínculo da proposta aceita', async () => {
    const proposal = await seedProposal()
    await accept(proposal)
    const otherDemand = randomUUID()
    await pool.query("insert into cliente_demanda(id,cliente_id,titulo) values($1,$2,'Outra demanda sintética')", [otherDemand, proposal.clienteId])
    const before = await snapshot()
    const { ClienteDemandaService } = await import('../../src/services/cliente/ClienteDemandaService.js')
    const service = new ClienteDemandaService()
    await expect(service.unlinkProposal(proposal.clienteId, proposal.id)).rejects.toMatchObject({ statusCode: 409, code: 'LINK_CONFLICT' })
    await expect(service.linkProposal(proposal.clienteId, otherDemand, proposal.id)).rejects.toMatchObject({ statusCode: 409 })
    expect(await snapshot()).toEqual(before)
  })

  it('exclusão de demanda consulta vínculos PG mesmo quando o array legado está vazio', async () => {
    const proposal = await seedProposal()
    const accepted = await accept(proposal)
    await pool.query("update cliente_demanda set proposta_ids='[]',proposta_principal_id=null where id=$1", [accepted.proposta.demandaId])
    const before = await snapshot()
    const { ClienteDemandaService } = await import('../../src/services/cliente/ClienteDemandaService.js')
    expect(await new ClienteDemandaService().remove(proposal.clienteId, accepted.proposta.demandaId!)).toBe(false)
    expect(await snapshot()).toEqual(before)
  })

  it('serviço de contratos exige o coordenador e reaproveita somente o contrato canônico existente', async () => {
    const proposal = await seedProposal({ status: 'aceita' })
    const { ClientCoreService } = await import('../../src/services/core/ClientCoreService.js')
    const service = new ClientCoreService()
    const before = await snapshot()
    await expect(service.addContract(proposal.clienteId, { titulo: 'Contrato fora do fluxo', propostaId: proposal.id }, actor.id))
      .rejects.toMatchObject({ statusCode: 409, code: 'LINK_CONFLICT' })
    expect(await snapshot()).toEqual(before)
    const accepted = await accept(proposal)
    const confirmed = await snapshot()
    const contract = await service.addContract(proposal.clienteId, { titulo: 'Tentativa de substituir termos', propostaId: proposal.id,
      demandaId: accepted.proposta.demandaId, negociacaoId: accepted.negociacaoId, valorOriginal: '1.00', valorAtual: '1.00' }, actor.id)
    expect(contract).toMatchObject({ id: accepted.contratoId, valorOriginal: proposal.valorDivida, valorAtual: proposal.valorProposta })
    expect(await snapshot()).toEqual(confirmed)
  })

  async function withProposalRoutes(run: (app: FastifyInstance, routes: ProposalRoutesModule) => Promise<void>) {
    await freshWorkflow()
    const { default: Fastify } = await import('fastify')
    const routes = await import('../../src/routes/propostas.js')
    routes.propostas.clear()
    routes.propostasInteligentes.clear()
    const app = Fastify({ logger: false })
    try {
      await app.register(routes.default)
      await app.ready()
      await run(app, routes)
    } finally {
      await app.close()
      routes.propostas.clear()
      routes.propostasInteligentes.clear()
    }
  }

  async function holdProposalClient(clienteId: string) {
    const connection = await pool.connect()
    await connection.query('begin')
    await connection.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`proposal-workflow:${clienteId}`])
    return connection
  }

  async function waitForBlockedWorkflow() {
    await vi.waitFor(async () => {
      const state = await pool.query("select exists(select 1 from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and wait_event='advisory' and pid<>pg_backend_pid()) as blocked")
      expect(state.rows[0].blocked).toBe(true)
    }, { timeout: 2_000, interval: 10 })
  }

  it('rota PATCH real responde com revisão/vínculos e publica Map somente após commit PG', async () => {
    const proposal = await seedProposal()
    await withProposalRoutes(async (app, routes) => {
      const cached = structuredClone(proposal) as unknown as CachedProposal
      routes.propostas.set(proposal.id, cached)
      const lock = await holdProposalClient(proposal.clienteId)
      const request = app.inject({ method: 'PATCH', url: `/api/propostas/${proposal.id}`, payload: { status: 'aceita', expectedRevision: 0 } })
      try {
        await waitForBlockedWorkflow()
        expect(routes.propostas.get(proposal.id)).toBe(cached)
        expect(cached.status).toBe('enviada')
        expect(routeEdges.remember).not.toHaveBeenCalled()
      } finally { await lock.query('commit'); lock.release() }
      const response = await request
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toMatchObject({ success: true, data: { id: proposal.id, status: 'aceita', revision: 1 }, meta: { negociacaoId: expect.any(String), contratoId: expect.any(String) } })
      expect(routes.propostas.get(proposal.id)).toEqual(body.data)
      expect(routeEdges.remember).toHaveBeenCalledOnce()
      const stored = (await pool.query('select payload from proposta where id=$1', [proposal.id])).rows[0]
      expect(stored.payload).toEqual(body.data)
      expect((await pool.query('select id,negociacao_id from client_contract where proposta_id=$1', [proposal.id])).rows[0])
        .toEqual({ id: body.meta.contratoId, negociacao_id: body.meta.negociacaoId })
    })
  })

  it('rota PATCH real retorna503 se COMMIT falhar e preserva banco, Map e memória auxiliar', async () => {
    const proposal = await seedProposal()
    await withProposalRoutes(async (app, routes) => {
      const cached = structuredClone(proposal) as unknown as CachedProposal
      routes.propostas.set(proposal.id, cached)
      const before = await snapshot()
      await pool.query('create constraint trigger fixture_deferred after update on proposta deferrable initially deferred for each row execute function fixture_fail_mutation()')
      const response = await app.inject({ method: 'PATCH', url: `/api/propostas/${proposal.id}`, payload: { status: 'aceita', expectedRevision: 0 } })
      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({ success: false, code: 'proposal_persistence_unavailable' })
      expect(routes.propostas.get(proposal.id)).toBe(cached)
      expect(cached).toEqual(proposal)
      expect(await snapshot()).toEqual(before)
      expect(routeEdges.remember).not.toHaveBeenCalled()
    })
  })

  it('rota DELETE real conserva Map quando COMMIT falha e o remove somente após exclusão confirmada', async () => {
    const proposal = await seedProposal({ status: 'rascunho' })
    await withProposalRoutes(async (app, routes) => {
      const cached = structuredClone(proposal) as unknown as CachedProposal
      routes.propostas.set(proposal.id, cached)
      const before = await snapshot()
      await pool.query('create constraint trigger fixture_deferred after delete on proposta deferrable initially deferred for each row execute function fixture_fail_mutation()')
      const failed = await app.inject({ method: 'DELETE', url: `/api/propostas/${proposal.id}?expectedRevision=0` })
      expect(failed.statusCode).toBe(503)
      expect(routes.propostas.get(proposal.id)).toBe(cached)
      expect(await snapshot()).toEqual(before)
      await pool.query('drop trigger fixture_deferred on proposta')
      const lock = await holdProposalClient(proposal.clienteId)
      const request = app.inject({ method: 'DELETE', url: `/api/propostas/${proposal.id}?expectedRevision=0` })
      try {
        await waitForBlockedWorkflow()
        expect(routes.propostas.get(proposal.id)).toBe(cached)
      } finally { await lock.query('commit'); lock.release() }
      const response = await request
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ success: true, data: { id: proposal.id, deleted: true } })
      expect(routes.propostas.has(proposal.id)).toBe(false)
      expect((await pool.query('select * from proposta where id=$1', [proposal.id])).rows).toHaveLength(0)
    })
  })

  async function automationService() {
    const { AutomationEventService } = await import('../../src/services/core/AutomationEventService.js')
    return new AutomationEventService()
  }

  async function seedAutomationEvent(overrides: Record<string, unknown> = {}) {
    const row = { id: randomUUID(), event_type: 'proposal.updated', payload: {}, status: 'queued', attempts: 0,
      target_provider: 'internal', metadata: { source: 'proposal_workflow' }, ...overrides }
    await pool.query('insert into automation_event(id,event_type,payload,status,attempts,target_provider,metadata) values($1,$2,$3,$4,$5,$6,$7)',
      [row.id, row.event_type, row.payload, row.status, row.attempts, row.target_provider, row.metadata])
    return row.id
  }

  it('falha ao persistir evento rejeita record antes de chamar o N8n', async () => {
    const service = await automationService()
    await pool.query('create trigger fixture_fail before insert on automation_event for each row execute function fixture_fail_mutation()')
    await expect(service.record({ eventType: 'fixture.event', targetProvider: 'n8n', dispatch: true })).rejects.toThrow()
    expect(n8n.dispatch).not.toHaveBeenCalled()
    expect((await pool.query('select * from automation_event')).rows).toHaveLength(0)
  })

  it('dispatch recusa evento ausente no PostgreSQL sem chamar o provedor', async () => {
    const service = await automationService()
    const record = await service.record({ eventType: 'fixture.event', targetProvider: 'n8n' })
    await pool.query('delete from automation_event where id=$1', [record.id])
    await expect(service.dispatch(record)).rejects.toThrow('não persistido')
    expect(n8n.dispatch).not.toHaveBeenCalled()
  })

  it('dispatch envia somente os dados persistidos do evento', async () => {
    const service = await automationService()
    const record = await service.record({ eventType: 'fixture.persisted', payload: { source: 'persisted' }, targetProvider: 'n8n' })
    n8n.dispatch.mockImplementationOnce(async (input: unknown) => {
      expect(input).toEqual({ id: record.id, eventType: 'fixture.persisted', payload: { source: 'persisted' } })
      expect((await pool.query('select status,attempts from automation_event where id=$1', [record.id])).rows[0]).toEqual({ status: 'processing', attempts: 1 })
      return { configured: true, ok: true }
    })
    const result = await service.dispatch({ ...record, eventType: 'fixture.forged', payload: { source: 'caller' } })
    expect(result).toMatchObject({ status: 'succeeded', attempts: 1, eventType: 'fixture.persisted' })
    expect(n8n.dispatch).toHaveBeenCalledOnce()
  })

  it('duas instâncias disputando dispatch fazem uma única chamada ao N8n', async () => {
    const firstService = await automationService()
    const record = await firstService.record({ eventType: 'fixture.event', targetProvider: 'n8n' })
    await freshWorkflow()
    const secondService = await automationService()
    let entered!: () => void
    let release!: () => void
    const claimed = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    n8n.dispatch.mockImplementationOnce(async () => { entered(); await gate; return { configured: true, ok: true } })
    const first = firstService.dispatch(record)
    await claimed
    try {
      const concurrent = await secondService.dispatch(record)
      expect(concurrent).toMatchObject({ status: 'processing', attempts: 1 })
      expect(n8n.dispatch).toHaveBeenCalledOnce()
    } finally { release() }
    expect(await first).toMatchObject({ status: 'succeeded', attempts: 1 })
    expect(await secondService.dispatch(record)).toMatchObject({ status: 'succeeded', attempts: 1 })
    expect(n8n.dispatch).toHaveBeenCalledOnce()
  })

  it('falha no provedor respeita o intervalo antes de permitir nova tentativa', async () => {
    const service = await automationService()
    const record = await service.record({ eventType: 'fixture.event', targetProvider: 'n8n' })
    n8n.dispatch.mockRejectedValueOnce(new Error('Falha sintética do provedor'))
    expect(await service.dispatch(record)).toMatchObject({ status: 'failed', attempts: 1 })
    expect(await service.dispatch(record)).toMatchObject({ status: 'failed', attempts: 1 })
    expect(n8n.dispatch).toHaveBeenCalledOnce()
    await pool.query("update automation_event set next_attempt_at=now()-interval '1 second' where id=$1", [record.id])
    expect(await service.dispatch(record)).toMatchObject({ status: 'succeeded', attempts: 2 })
    expect(n8n.dispatch).toHaveBeenCalledTimes(2)
  })

  it('resultado externo sem confirmação no banco não é reenviado automaticamente', async () => {
    const service = await automationService()
    const record = await service.record({ eventType: 'fixture.event', targetProvider: 'n8n' })
    await pool.query("create trigger fixture_fail before update on automation_event for each row when (NEW.status = 'succeeded') execute function fixture_fail_mutation()")
    await expect(service.dispatch(record)).rejects.toThrow()
    expect(n8n.dispatch).toHaveBeenCalledOnce()
    expect((await pool.query('select status,attempts from automation_event where id=$1', [record.id])).rows[0]).toEqual({ status: 'processing', attempts: 1 })
    await pool.query('drop trigger fixture_fail on automation_event')
    expect(await service.dispatch(record)).toMatchObject({ status: 'processing', attempts: 1 })
    expect(n8n.dispatch).toHaveBeenCalledOnce()
  })

  it('consumidor interno conclui somente eventos novos do fechamento e preserva os demais', async () => {
    const own = await seedAutomationEvent()
    const untouched = await Promise.all([
      seedAutomationEvent({ metadata: {} }), seedAutomationEvent({ metadata: { source: 'legacy' } }),
      seedAutomationEvent({ target_provider: 'n8n' }), seedAutomationEvent({ status: 'processing' }),
      seedAutomationEvent({ status: 'failed' }), seedAutomationEvent({ status: 'succeeded', attempts: 1 }),
    ])
    const before = (await pool.query('select * from automation_event where id=any($1) order by id', [untouched])).rows
    const service = await automationService()
    expect(await service.processInternalWorkflowEvents()).toBe(1)
    expect((await pool.query('select status,attempts,processed_at from automation_event where id=$1', [own])).rows[0])
      .toMatchObject({ status: 'succeeded', attempts: 1, processed_at: expect.any(Date) })
    expect((await pool.query('select * from automation_event where id=any($1) order by id', [untouched])).rows).toEqual(before)
    expect(n8n.dispatch).not.toHaveBeenCalled()
  })

  it('consumidores concorrentes e reinício concluem cada recibo interno apenas uma vez', async () => {
    await Promise.all(Array.from({ length: 103 }, () => seedAutomationEvent()))
    const first = await automationService()
    await freshWorkflow()
    const second = await automationService()
    const counts = await Promise.all([first.processInternalWorkflowEvents(), second.processInternalWorkflowEvents()])
    expect(counts.reduce((total, count) => total + count, 0)).toBe(103)
    expect((await pool.query("select count(*)::int as count from automation_event where status='succeeded' and attempts=1")).rows[0].count).toBe(103)
    await freshWorkflow()
    expect(await (await automationService()).processInternalWorkflowEvents()).toBe(0)
    expect(n8n.dispatch).not.toHaveBeenCalled()
  })

  it('falha no consumidor interno reverte o lote inteiro e conserva os recibos queued', async () => {
    await Promise.all(Array.from({ length: 4 }, () => seedAutomationEvent()))
    const service = await automationService()
    const before = (await pool.query('select * from automation_event order by id')).rows
    await pool.query('create trigger fixture_fail before update on automation_event for each row execute function fixture_fail_mutation()')
    await expect(service.processInternalWorkflowEvents()).rejects.toThrow()
    expect((await pool.query('select * from automation_event order by id')).rows).toEqual(before)
    await pool.query('drop trigger fixture_fail on automation_event')
    expect(await service.processInternalWorkflowEvents()).toBe(4)
    expect(n8n.dispatch).not.toHaveBeenCalled()
  })
})
