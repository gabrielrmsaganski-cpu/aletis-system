import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as db from '../../src/db/client.js'
import { AlixMissionService } from '../../src/services/alix/workspace/AlixMissionService.js'
import { AlixOperationalPlanService, operationalDate, projectOperationalPlan, readOperationalSource, type OperationalCoverageSource, type OperationalRecords, type OperationalSourceKey } from '../../src/services/alix/workspace/AlixOperationalPlanService.js'

const now = new Date('2026-09-06T15:00:00Z')
const coverage: OperationalCoverageSource[] = (['clients', 'demands', 'proposals'] as const).map(key => ({ key, label: key, status: 'available', origin: 'postgres', records: 1 }))
const client = { id: 'c1', nome: 'Cliente A', estagio: 'negociacao', consultor: 'Ana', proximaAcao: { descricao: 'Revisar contrato', data: '2026-09-06' } }
const demand = { id: 'd1', clienteId: 'c1', titulo: 'Renegociação', status: 'em_analise', responsavel: 'Ana', proximaAcao: 'Conferir anexos', proximaAcaoEm: '2026-09-05', prazoAlvo: '2026-09-10', checklist: [{ id: 'check1', titulo: 'Conferir documento', prazo: '2026-09-06', concluido: false }] }
const proposal = { id: 'p1', clienteId: 'c1', titulo: 'Proposta de crédito', status: 'enviada', dataValidade: '2026-09-08' }
const input = () => ({ records: { clients: [client], demands: [demand], proposals: [proposal] }, coverage, now })
let storageDir: string | undefined
beforeEach(() => vi.stubEnv('ALETIS_PG_ENABLED', '0'))
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (storageDir) await rm(storageDir, { recursive: true, force: true })
  storageDir = undefined
})

describe('Plano operacional baseado em registros', () => {
  it('prioriza os prazos registrados e aponta os registros exatos', () => {
    const plan = projectOperationalPlan(input())
    expect(plan.coverage.status).toBe('complete')
    expect(plan.items[0]).toMatchObject({ kind: 'demand_action', priority: 'critical', dueDate: '2026-09-05', owner: 'Ana' })
    expect(plan.items.find(item => item.kind === 'checklist_due')).toMatchObject({ entity: { type: 'checklist', id: 'check1', parentId: 'd1' }, to: '/clientes/c1?area=negociacao&dealTab=demandas&demanda=d1' })
    expect(plan.items.find(item => item.kind === 'proposal_expiring')?.to).toBe('/propostas?proposta=p1')
    expect(plan.counts).toMatchObject({ overdue: 1, dueToday: 2, priorities: 5 })
  })

  it('exclui clientes encerrados, demandas concluídas e propostas resolvidas', () => {
    const plan = projectOperationalPlan({ ...input(), records: {
      clients: [client, { ...client, id: 'c2', estagio: 'encerrado' }],
      demands: [{ ...demand, status: 'concluida' }, { ...demand, id: 'd2', clienteId: 'c2' }],
      proposals: ['aceita', 'rejeitada', 'expirada', 'cancelada'].map(status => ({ ...proposal, id: status, status })),
    } })
    expect(plan.items.map(item => item.kind)).toEqual(['client_action'])
    expect(plan.counts.activeDemands).toBe(0)
    expect(plan.counts.openProposals).toBe(0)
  })

  it('usa o dia de Cuiabá e não inventa um prazo para datas inválidas', () => {
    expect(operationalDate(new Date('2026-09-06T02:30:00Z'))).toBe('2026-09-05')
    const plan = projectOperationalPlan({ ...input(), now: new Date('2026-09-06T02:30:00Z'), records: { clients: [{ ...client, proximaAcao: { descricao: 'Revisar', data: '2026-02-30' } }], demands: [], proposals: [] } })
    expect(plan.referenceDate).toBe('2026-09-05')
    expect(plan.items[0]).toMatchObject({ kind: 'client_missing_action', nextAction: 'Definir prazo para: Revisar' })
    expect(plan.items[0].dueDate).toBeUndefined()
  })

  it('converte timestamps com fuso para o dia operacional', () => {
    const plan = projectOperationalPlan({ ...input(), records: { clients: [{ ...client, proximaAcao: { descricao: 'Revisar', data: '2026-09-06T02:30:00Z' } }], demands: [], proposals: [] } })
    expect(plan.items[0]).toMatchObject({ dueDate: '2026-09-05', priority: 'critical' })
  })

  it('preserva pendências de responsável e próximo passo sem gerar compromissos', () => {
    const plan = projectOperationalPlan({ ...input(), records: { clients: [client], demands: [{ ...demand, proximaAcao: '', proximaAcaoEm: undefined, responsavel: '' }], proposals: [] } })
    expect(plan.counts.missingOwner).toBe(plan.items.filter(item => !item.owner).length)
    expect(plan.counts.missingNextAction).toBe(1)
    expect(plan.items.find(item => item.kind === 'demand_missing_owner')?.owner).toBeUndefined()
    expect(plan.items.find(item => item.kind === 'demand_missing_action')?.dueDate).toBeUndefined()
  })

  it('deduplica a mesma entidade e mantém fingerprint independente da ordem e hora da consulta', () => {
    const first = projectOperationalPlan({ ...input(), records: { clients: [client], demands: [demand, demand], proposals: [proposal, { ...proposal, id: 'p2' }] } })
    const second = projectOperationalPlan({ ...input(), now: new Date('2026-09-06T20:00:00Z'), records: { clients: [client], demands: [demand], proposals: [{ ...proposal, id: 'p2' }, proposal] } })
    expect(new Set(first.items.map(item => item.id)).size).toBe(first.items.length)
    expect(first.fingerprint).toBe(second.fingerprint)
    const changed = projectOperationalPlan({ ...input(), records: { ...input().records, demands: [{ ...demand, responsavel: 'Bruno' }] } })
    expect(changed.fingerprint).not.toBe(projectOperationalPlan(input()).fingerprint)
  })

  it('restringe a consulta ao cliente solicitado', () => {
    const plan = projectOperationalPlan({ ...input(), clienteId: 'c2', records: { clients: [client, { ...client, id: 'c2' }], demands: [demand], proposals: [proposal] } })
    expect(plan.items).toHaveLength(1)
    expect(plan.items[0].clienteId).toBe('c2')
  })

  it('mostra proposta ainda aberta com validade vencida como pendência de atualização', () => {
    const plan = projectOperationalPlan({ ...input(), records: { clients: [client], demands: [], proposals: [{ ...proposal, dataValidade: '2026-09-04' }] } })
    expect(plan.items.find(item => item.entity.id === 'p1')).toMatchObject({ kind: 'proposal_overdue', priority: 'critical' })
  })

  it('inclui documento inteligente gerado sem inventar envio e preserva status explícito', () => {
    const intelligent = { id: 'pi1', cliente: { id: 'c1', nome: 'Cliente A' }, secoes: { capa: { titulo: 'Proposta inteligente' } }, dataGeracao: '2026-09-01', dataValidade: '2026-09-08' }
    const plan = projectOperationalPlan({ ...input(), records: { clients: [client], demands: [], proposals: [intelligent, { ...intelligent, id: 'pi2', status: 'aceita' }, { ...intelligent, id: 'pi3', dataGeracao: undefined }] } })
    expect(plan.counts.openProposals).toBe(1)
    const item = plan.items.find(item => item.entity.id === 'pi1')!
    expect(item.title).toContain('Proposta inteligente')
    expect(item.reason).toContain('Situação registrada: gerada')
    expect(item.to).toBe('/clientes/c1?area=negociacao&dealTab=propostas')
  })

  it('mantém os resultados disponíveis quando uma fonte falha, com contagem desconhecida', async () => {
    const service = new AlixOperationalPlanService({ now: () => now, read: async key => {
      if (key === 'demands') throw new Error('Fonte temporariamente indisponível')
      return { records: key === 'clients' ? [client] : [proposal], origin: 'postgres' }
    } })
    const plan = await service.overview()
    expect(plan.coverage.status).toBe('partial')
    expect(plan.counts.activeDemands).toBeNull()
    expect(plan.items.map(item => item.kind)).toEqual(['client_action', 'proposal_expiring'])
    expect(plan.coverage.sources.find(source => source.key === 'demands')?.records).toBeNull()
  })

  it('prefere colunas atuais do PostgreSQL ao payload antigo', async () => {
    vi.stubEnv('ALETIS_PG_ENABLED', '1')
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'c1', nome: 'Nome atual', estagio: 'encerrado', consultor: 'Ana', payload: { ...client, nome: 'Nome antigo' } }] })
    vi.spyOn(db, 'getPool').mockReturnValue({ query } as any)
    const source = await readOperationalSource('clients', 'c1')
    expect(source.origin).toBe('postgres')
    expect(source.records[0]).toMatchObject({ nome: 'Nome atual', estagio: 'encerrado' })
    expect(query).toHaveBeenCalledWith('select * from cliente where id = $1 order by id', ['c1'])
  })

  it('não usa cache em memória para disfarçar erro de PostgreSQL', async () => {
    vi.stubEnv('ALETIS_PG_ENABLED', '1')
    vi.spyOn(db, 'getPool').mockReturnValue({ query: vi.fn().mockRejectedValue(new Error('PG indisponível')) } as any)
    const plan = await new AlixOperationalPlanService().overview()
    expect(plan.coverage.status).toBe('unavailable')
    expect(plan.counts).toMatchObject({ clients: null, activeClients: null, activeDemands: null, openProposals: null })
    await expect(new AlixOperationalPlanService().prepare()).rejects.toThrow('fontes operacionais')
  })

  it('consulta inteligente legada pelo cliente no payload e usa atualização efetiva da linha', async () => {
    vi.stubEnv('ALETIS_PG_ENABLED', '1')
    const updatedAt = new Date('2026-09-06T13:00:00Z')
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'pi1', cliente_id: null, titulo: null, status: null, atualizado_em: updatedAt, payload: { cliente: { id: 'c1' }, secoes: { capa: { titulo: 'Plano inteligente' } }, dataGeracao: '2026-09-01', dataValidade: '2026-09-08', ultimaAtualizacao: '2020-01-01' } }] })
    vi.spyOn(db, 'getPool').mockReturnValue({ query } as any)
    const result = await readOperationalSource('proposals', 'c1')
    expect(query).toHaveBeenCalledWith(expect.stringContaining("coalesce(nullif(cliente_id, ''), nullif(payload->>'clienteId', ''), payload->'cliente'->>'id') = $1"), ['c1'])
    expect(result.records[0]).toMatchObject({ clienteId: 'c1', status: 'gerada', kind: 'inteligente', titulo: 'Plano inteligente', ultimaAtualizacao: updatedAt.toISOString() })
  })

  it('prepara uma única missão em concorrência e reaproveita após recriar o serviço', async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'aletis-operations-'))
    const records: Record<OperationalSourceKey, OperationalRecords> = { ...input().records, documentary: [] }
    const read = async (key: OperationalSourceKey) => ({ records: records[key], origin: 'memory' as const })
    const missions = new AlixMissionService(storageDir)
    const create = vi.spyOn(missions, 'create')
    const service = new AlixOperationalPlanService({ missions, read, now: () => now })
    const [first, concurrent] = await Promise.all([service.prepare({ actorId: 'ana' }), service.prepare({ actorId: 'ana' })])
    expect(first.mission.id).toBe(concurrent.mission.id)
    expect(create).toHaveBeenCalledTimes(1)
    expect([first.reused, concurrent.reused].sort()).toEqual([false, true])
    expect(first.mission.status).toBe('completed')
    expect(first.mission.sources.some(source => source.kind === 'operational_plan')).toBe(true)
    expect(first.mission.result?.rawResponse).toContain('/propostas?proposta=p1')
    const restarted = new AlixOperationalPlanService({ missions: new AlixMissionService(storageDir), read, now: () => now })
    expect((await restarted.prepare({ actorId: 'ana' })).reused).toBe(true)
    records.demands = [{ ...demand, responsavel: 'Bruno' }]
    const updated = await restarted.prepare({ actorId: 'ana' })
    expect(updated.reused).toBe(false)
    expect(updated.mission.id).not.toBe(first.mission.id)
    expect((await readdir(storageDir)).filter(file => file.endsWith('.json'))).toHaveLength(2)
  })
})
