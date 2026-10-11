import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlixMissionService } from '../../src/services/alix/workspace/AlixMissionService.js'
import { AlixOperationalHandoffService, buildOperationalHandoffPrompt } from '../../src/services/alix/workspace/AlixOperationalHandoffService.js'
import { projectOperationalPlan, type OperationalSourceKey } from '../../src/services/alix/workspace/AlixOperationalPlanService.js'

const now = new Date('2026-09-07T14:00:00Z')
const client = { id: 'client-synthetic-a', nome: 'Cliente sintético', estagio: 'negociacao', proximaAcao: { descricao: 'Preparar revisão da proposta', data: '2026-09-07' } }
const demand = { id: 'demand-synthetic', clienteId: client.id, titulo: 'Revisão sintética', status: 'em_analise', responsavel: 'Consultor teste', proximaAcao: 'Conferir anexos', proximaAcaoEm: '2026-09-07', checklist: [] }
const proposal = { id: 'proposal-synthetic', clienteId: client.id, titulo: 'Proposta sintética', status: 'enviada', dataValidade: '2026-09-08' }
const records = () => ({ clients: [client], demands: [demand], proposals: [proposal] })
const plan = (clienteId?: string, input = records()) => projectOperationalPlan({ clienteId, now, records: input, coverage: (['clients', 'demands', 'proposals'] as const).map(key => ({ key, label: key, status: 'available', origin: 'memory', records: input[key].length })) })
let dir: string
beforeEach(async () => { vi.stubEnv('ALETIS_PG_ENABLED', '0'); dir = await mkdtemp(join(tmpdir(), 'aletis-operational-handoff-')) })
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }) })

function setup() {
  const missions = new AlixMissionService(dir)
  const sessions = new Map<string, { id: string; clienteId: string; consultorId: string; archivedAt?: number }>()
  const ensureSession = vi.fn(async (id: string, _title: string, actorId: string, clienteId: string) => {
    if (!sessions.has(id)) sessions.set(id, { id, clienteId, consultorId: actorId })
    return sessions.get(id)!
  })
  const overview = vi.fn(async ({ clienteId }: { clienteId: string }) => plan(clienteId))
  const service = new AlixOperationalHandoffService({ missions, overview, ensureSession })
  const item = plan().items.find(item => item.kind === 'client_action')!
  const input = { clienteId: client.id, itemId: item.id, fingerprint: item.fingerprint! }
  return { service, missions, ensureSession, sessions, overview, input }
}

describe('Prioridade → trabalho ALIX com fontes e autoria', () => {
  it('leva uma prioridade da carteira ao mesmo cliente, com missão de análise e fontes', async () => {
    const { service, input } = setup()
    const result = await service.prepare(input, 'actor-synthetic-a')
    expect(result).toMatchObject({ canStart: true, reused: false, actionPolicy: 'prepare_only', session: { clienteId: client.id, archived: false }, mission: { status: 'queued', clienteId: client.id, consultorId: 'actor-synthetic-a', analysisMode: 'deep' } })
    expect(result.mission.sources.find(source => source.kind === 'operational_handoff')?.evidence).toMatchObject({ itemId: input.itemId, fingerprint: input.fingerprint, actionPolicy: 'prepare_only' })
    expect(result.mission.prompt).toContain('Não envie mensagens')
    expect(result.deliverables).toHaveLength(3)
  })

  it('clique repetido e duas instâncias preparam a mesma missão e recuperam após reinício', async () => {
    const { service, missions, input, overview, ensureSession } = setup()
    const second = new AlixOperationalHandoffService({ missions: new AlixMissionService(dir), overview, ensureSession })
    const [a, b] = await Promise.all([service.prepare(input, 'owner-a'), second.prepare(input, 'owner-a')])
    expect(a.id).toBe(b.id)
    expect([a.reused, b.reused].sort()).toEqual([false, true])
    expect((await readdir(dir)).filter(name => name.endsWith('.json'))).toHaveLength(1)
    expect((await missions.get(a.mission.id))?.sources).toHaveLength(a.mission.sources.length)
    expect((await second.prepare(input, 'owner-a')).mission.id).toBe(a.mission.id)
  })

  it('cada proprietário possui sessão e missão próprias', async () => {
    const { service, input } = setup()
    const a = await service.prepare(input, 'owner-a')
    const b = await service.prepare(input, 'owner-b')
    expect(a.session.id).not.toBe(b.session.id)
    expect(a.mission.id).not.toBe(b.mission.id)
    expect(b.mission.consultorId).toBe('owner-b')
  })

  it.each(['anonymous', 'unknown', ''])('não cria trabalho sem identidade verificada: %s', async actor => {
    const { service, input, ensureSession } = setup()
    await expect(service.prepare(input, actor)).rejects.toMatchObject({ statusCode: 401 })
    expect(ensureSession).not.toHaveBeenCalled()
  })

  it('recusa versão alterada e pendência resolvida sem criar sessão', async () => {
    const { service, input, ensureSession, overview } = setup()
    const changed = records(); changed.clients = [{ ...client, proximaAcao: { ...client.proximaAcao, descricao: 'Outra decisão' } }]
    overview.mockResolvedValueOnce(plan(client.id, changed))
    await expect(service.prepare(input, 'owner-a')).rejects.toMatchObject({ statusCode: 409, code: 'ALIX_PRIORITY_STALE' })
    overview.mockResolvedValueOnce(plan(client.id, { ...records(), clients: [{ ...client, estagio: 'encerrado' }] }))
    await expect(service.prepare(input, 'owner-a')).rejects.toMatchObject({ statusCode: 409, code: 'ALIX_PRIORITY_RESOLVED' })
    expect(ensureSession).not.toHaveBeenCalled()
  })

  it('recusa tentativa de usar a prioridade de um cliente no escopo de outro', async () => {
    const { service, input, ensureSession } = setup()
    await expect(service.prepare({ ...input, clienteId: 'client-synthetic-b' }, 'owner-a')).rejects.toMatchObject({ statusCode: 409 })
    expect(ensureSession).not.toHaveBeenCalled()
  })

  it('não usa fonte ausente como se a prioridade estivesse conferida', async () => {
    const { service, input, ensureSession, overview } = setup()
    const partial = plan(client.id)
    partial.coverage.sources[0].status = 'unavailable'
    partial.coverage.status = 'partial'
    overview.mockResolvedValueOnce(partial)
    await expect(service.prepare(input, 'owner-a')).rejects.toMatchObject({ statusCode: 503, code: 'ALIX_PRIORITY_SOURCE_UNAVAILABLE' })
    expect(ensureSession).not.toHaveBeenCalled()
  })

  it('falha ao salvar fontes permite retry na mesma missão ainda não executada', async () => {
    const { service, input, missions } = setup()
    const save = vi.spyOn(missions, 'addSources').mockRejectedValueOnce(new Error('Persistência temporariamente indisponível'))
    await expect(service.prepare(input, 'owner-a')).rejects.toThrow('Persistência')
    const recovered = await service.prepare(input, 'owner-a')
    expect(recovered.reused).toBe(true)
    expect(recovered.canStart).toBe(true)
    expect(recovered.mission.sources.some(source => source.kind === 'operational_handoff')).toBe(true)
    expect((await readdir(dir)).filter(name => name.endsWith('.json'))).toHaveLength(1)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('não retoma nem reexecuta missão concluída, cancelada ou em andamento no retry', async () => {
    const { service, input, missions } = setup()
    const created = await service.prepare(input, 'owner-a')
    await missions.start(created.mission.id, { exclusive: true })
    expect((await service.prepare(input, 'owner-a')).canStart).toBe(false)
    await missions.complete(created.mission.id, { response: 'Conclusão: análise sintética pronta.\nPróxima ação: revisar.' })
    const repeated = await service.prepare(input, 'owner-a')
    expect(repeated.canStart).toBe(false)
    expect(repeated.mission.result?.rawResponse).toContain('análise sintética pronta')
  })

  it('a posse exclusiva tem um vencedor entre instâncias e não muda running para failed', async () => {
    const { service, input, missions } = setup()
    const prepared = await service.prepare(input, 'owner-a')
    const another = new AlixMissionService(dir)
    const results = await Promise.allSettled([missions.start(prepared.mission.id, { exclusive: true }), another.start(prepared.mission.id, { exclusive: true })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'ALIX_MISSION_ALREADY_STARTED', statusCode: 409 } })
    expect((await missions.get(prepared.mission.id))?.status).toBe('running')
  })

  it('sessão com escopo alterado não é apropriada no retry', async () => {
    const { service, input, sessions } = setup()
    const result = await service.prepare(input, 'owner-a')
    sessions.get(result.session.id)!.clienteId = 'client-synthetic-b'
    await expect(service.prepare(input, 'owner-a')).rejects.toMatchObject({ statusCode: 409, code: 'ALIX_HANDOFF_SCOPE_CONFLICT' })
  })

  it('negociação e checklist recebem entregas específicas sem inventar ação executada', () => {
    const current = plan()
    const proposalItem = current.items.find(item => item.entity.type === 'proposal')!
    expect(buildOperationalHandoffPrompt(proposalItem, current)).toMatchObject({ workMode: 'negotiation' })
    const documentary = buildOperationalHandoffPrompt({ ...proposalItem, entity: { type: 'checklist', id: 'checklist-synthetic' } }, current)
    expect(documentary.workMode).toBe('documentary')
    expect(documentary.deliverables.join(' ')).toContain('lista exata')
    expect(documentary.prompt).toContain('não registre contato como realizado')
  })

  it('revalida a fonte documental e leva prova e revisão à missão sem concluir a pendência', async () => {
    const { service, overview, ensureSession } = setup()
    const actor = { userId: 'owner-a', userName: 'Responsável', role: 'consultor', tenantId: 'tenant-test' }
    const current = projectOperationalPlan({ clienteId: client.id, now, records: { ...records(), documentary: [{
      id: 'finding:current', clienteId: client.id, status: 'open', kind: 'missing_field', title: 'Conferir identificação', description: 'Campo ausente.', nextAction: 'Preparar a conferência do titular.', severity: 'important',
      source: { kind: 'drive_analysis', id: 'finding-original', documentId: 'doc1', label: 'Identificação', revision: 'sha-current', excerpt: 'Trecho de teste.', page: 3,
        contentHash: 'a'.repeat(64), chunkId: 'chunk-current', quoteHash: 'b'.repeat(64), excerptHash: 'c'.repeat(64) },
    }] }, coverage: [...plan().coverage.sources, { key: 'documentary', label: 'Documentos', status: 'available', origin: 'postgres', records: 1 }] })
    const item = current.items.find(item => item.kind.startsWith('documentary_'))!
    const input = { clienteId: client.id, itemId: item.id, fingerprint: item.fingerprint! }
    overview.mockResolvedValueOnce(current)
    const prepared = await service.prepare(input, actor.userId, actor)
    expect(overview).toHaveBeenCalledWith({ clienteId: client.id, actor })
    expect(prepared.mission).toMatchObject({ status: 'queued', workMode: 'documentary' })
    expect(prepared.mission.sources.find(source => source.kind === 'drive_analysis')?.evidence).toMatchObject({ documentId: 'doc1', revision: 'sha-current', excerpt: 'Trecho de teste.', page: 3,
      contentHash: 'a'.repeat(64), chunkId: 'chunk-current', quoteHash: 'b'.repeat(64), excerptHash: 'c'.repeat(64) })
    expect(prepared.mission.prompt).toContain('confirmar um candidato não significa executar a tarefa')
    const unavailable = structuredClone(current)
    unavailable.coverage.sources.find(source => source.key === 'documentary')!.status = 'unavailable'
    overview.mockResolvedValueOnce(unavailable)
    await expect(service.prepare(input, actor.userId, actor)).rejects.toMatchObject({ code: 'ALIX_PRIORITY_SOURCE_UNAVAILABLE' })
    overview.mockResolvedValueOnce({ ...current, items: current.items.filter(candidate => candidate.id !== item.id) })
    await expect(service.prepare(input, actor.userId, actor)).rejects.toMatchObject({ code: 'ALIX_PRIORITY_RESOLVED' })
    expect(ensureSession).toHaveBeenCalledTimes(1)
  })
})
