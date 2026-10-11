import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withAlixTurnContext } from '../../src/services/alix/AlixTurnContext.js'

const fixture = vi.hoisted(() => {
  const clients = [{ id: 'client-a', nome: 'Cliente Alfa sintético', cpfCnpj: '00000000000', estagio: 'negociacao', valorTotalDivida: '1000.00' }, { id: 'client-b', nome: 'Cliente Beta sintético', cpfCnpj: '11111111111', estagio: 'analise', valorTotalDivida: '9000.00' }]
  return { clients, list: vi.fn(), organize: vi.fn(), dossier: vi.fn(), getDb: vi.fn() }
})
vi.mock('../../src/services/AlixService.js', () => ({ alixGetClientes: () => fixture.clients, alixGetPropostas: () => [{ id: 'proposal-a', clienteId: 'client-a' }, { id: 'proposal-b', clienteId: 'client-b' }], alixGetPropostasInteligentes: () => [] }))
vi.mock('../../src/services/cliente/ClienteDemandaService.js', () => ({ getClienteDemandaService: () => ({ list: fixture.list, organizeProposals: fixture.organize }) }))
vi.mock('../../src/services/cliente/ClienteOperationalDossierService.js', () => ({ buildClienteOperationalDossier: fixture.dossier }))
vi.mock('../../src/services/farms/FarmsService.js', () => ({ getFarmsService: () => ({ listarPorCliente: () => [] }) }))
vi.mock('../../src/services/gestao-financeira/GestaoFinanceiraService.js', () => ({ getGestaoFinanceiraService: () => ({ listarGruposPorCliente: async () => [] }) }))
vi.mock('../../src/services/documentos/ClienteDocumentoIntelligence.js', () => ({ buildClienteDocumentoDossie: () => ({}), classificarDocumentoCliente: () => ({}) }))
vi.mock('../../src/db/client.js', () => ({ getDb: fixture.getDb }))
import { buildCrmReadTools } from '../../src/services/alix/tools/crm-read.js'
import { buildCrmContextTools } from '../../src/services/alix/tools/crm-context.js'

beforeEach(() => {
  vi.clearAllMocks()
  fixture.list.mockResolvedValue([{ id: 'demand-a', numero: 1, titulo: 'Demanda sintética', status: 'em_analise', checklist: [], eventos: [], propostaIds: [] }])
  fixture.organize.mockImplementation(() => { throw new Error('Leitura não pode reconciliar nem criar vínculos') })
  fixture.dossier.mockResolvedValue({ clienteId: 'client-a' })
  const query = { select: () => query, from: () => query, where: () => query, orderBy: () => query, limit: async () => [] }
  fixture.getDb.mockReturnValue(query)
})
const prepare = <T>(run: () => T, clienteId = 'client-a') => withAlixTurnContext({ sessionId: 'session-synthetic', clienteId, actionPolicy: 'prepare_only' }, run)

describe('Leituras CRM sem reconciliação ou ampliação de escopo', () => {
  it.each([false, true])('listar demandas e contexto são leitura pura, prepare_only=%s', async scoped => {
    const read = buildCrmReadTools().registry
    const context = buildCrmContextTools().registry
    const run = async () => {
      const demands = await read.listar_demandas_cliente.handler({ clienteId: 'client-a' }) as any
      const result = await context.contexto_cliente_operacional.handler({ clienteId: 'client-a' }) as any
      expect(demands.ok).toBe(true); expect(result.ok).toBe(true)
    }
    await (scoped ? prepare(run) : run())
    expect(fixture.list).toHaveBeenCalledTimes(2)
    expect(fixture.list).toHaveBeenCalledWith('client-a')
    expect(fixture.organize).not.toHaveBeenCalled()
  })

  it.each([{ clienteId: 'client-b' }, { id: 'client-b' }, { cpfCnpj: '11111111111' }, { nome: 'Beta' }, { id: 'client-a', clienteId: 'client-b' }])('nega alias que tenta sair do cliente da missão: %j', async input => {
    const registries = [buildCrmReadTools().registry, buildCrmContextTools().registry]
    for (const registry of registries) for (const name of Object.keys(registry)) {
      const result = await prepare(() => registry[name].handler(input))
      expect(result).toMatchObject({ ok: false, code: 'ALIX_PREPARATION_CLIENT_SCOPE' })
    }
    expect(fixture.list).not.toHaveBeenCalled(); expect(fixture.getDb).not.toHaveBeenCalled(); expect(fixture.dossier).not.toHaveBeenCalled()
  })

  it('preenche ID omitido com o cliente ativo e não expõe o restante da carteira', async () => {
    const registry = buildCrmReadTools().registry
    const found = await prepare(() => registry.buscar_cliente.handler({})) as any
    const list = await prepare(() => registry.listar_clientes.handler({})) as any
    const total = await prepare(() => registry.resumo_portfolio_crm.handler({})) as any
    expect(found.clientes.map((item: any) => item.id)).toEqual(['client-a'])
    expect(list.clientes.map((item: any) => item.id)).toEqual(['client-a'])
    expect(total.totalClientes).toBe(1); expect(total.topPorDivida[0].id).toBe('client-a')
    const proposals = await prepare(() => registry.listar_propostas_cliente.handler({})) as any
    expect(proposals.padrao.map((item: any) => item.id)).toEqual(['proposal-a'])
  })

  it('fora do preparo permite a consulta intencional da carteira e de outro cliente', async () => {
    const registry = buildCrmReadTools().registry
    const list = await registry.listar_clientes.handler({}) as any
    expect(list.totalFiltrado).toBe(2)
    const found = await registry.buscar_cliente.handler({ id: 'client-b' }) as any
    expect(found.clientes[0].id).toBe('client-b')
  })

  it('falha de leitura da demanda não vira zero nem chama reconciliação como fallback', async () => {
    fixture.list.mockRejectedValue(new Error('Leitura PG indisponível'))
    await expect(prepare(() => buildCrmReadTools().registry.listar_demandas_cliente.handler({ clienteId: 'client-a' }))).rejects.toThrow('PG indisponível')
    expect(fixture.organize).not.toHaveBeenCalled()
  })
})
