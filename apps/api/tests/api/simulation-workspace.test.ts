import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/db/AuditLog.js', () => ({ auditAsync: vi.fn() }))
import { SimulationWorkspaceService } from '../../src/services/simulations/SimulationWorkspaceService.js'
import { syntheticDraft } from '../fixtures/simulation-draft.js'

let service: SimulationWorkspaceService
beforeEach(() => { service = new SimulationWorkspaceService() })
const create = () => service.create({ organizationId: 'org-test', clientId: 'client-a', title: 'Cenário sintético', draft: syntheticDraft() })

it('duas edições simultâneas da mesma versão não apagam uma à outra', async () => {
  const { record } = await create()
  const values = await Promise.allSettled(['A', 'B'].map(title => service.updateDraft(record.id, record.organizationId,
    { draft: record.draft, title, expectedUpdatedAt: record.updatedAt })))
  expect(values.filter(v => v.status === 'fulfilled')).toHaveLength(1)
  expect((values.find(v => v.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('SIMULATION_CONFLICT')
})

it('registro exige origem atual e preserva versão depois de editar', async () => {
  const { record } = await create()
  await expect(service.register(record.id, record.organizationId)).rejects.toMatchObject({ statusCode: 428 })
  const registered = await service.register(record.id, record.organizationId, 'tester', record.updatedAt)
  expect(registered.snapshot.version).toBe(1)
  expect(typeof registered.snapshot.output.simulacao.resumo[0].totalJuros).toBe('string')
  expect(registered.snapshot.sourceSnapshot[0].version).toContain('2026-09-10')
  const changed = structuredClone(record.draft); changed.input.valorOperacao = 20000
  await service.updateDraft(record.id, record.organizationId, { draft: changed, expectedUpdatedAt: registered.workspace.updatedAt })
  expect((await service.get(record.id, record.organizationId))?.status).toBe('draft')
  expect((await service.listSnapshots(record.id, record.organizationId))[0].input.input.valorOperacao).toBe(10000)
  await expect(service.register(record.id, record.organizationId, 'tester', registered.workspace.updatedAt)).rejects.toMatchObject({ code: 'SIMULATION_CONFLICT' })
})

it('cliente/organização e chave idempotente não misturam cenários', async () => {
  const input = { organizationId: 'org-test', clientId: 'a', userId: 'tester', title: 'T', draft: syntheticDraft(), idempotencyKey: 'same-key' }
  const first = await service.create(input)
  expect((await service.create(input)).record.id).toBe(first.record.id)
  await expect(service.create({ ...input, clientId: 'b' })).rejects.toMatchObject({ code: 'SIMULATION_IDEMPOTENCY_CONFLICT' })
  for (const changed of [{ creditorId: 'b' }, { debtId: 'b' }, { officeId: 'b' }, { title: 'Outro cenário' }]) {
    await expect(service.create({ ...input, ...changed })).rejects.toMatchObject({ code: 'SIMULATION_IDEMPOTENCY_CONFLICT' })
  }
  await expect(service.updateDraft(first.record.id, input.organizationId, { clientId: 'b', draft: input.draft, expectedUpdatedAt: first.record.updatedAt })).rejects.toMatchObject({ code: 'SIMULATION_CLIENT_IMMUTABLE' })
  expect(await service.get(first.record.id, 'another-org')).toBeNull()
})

it('rascunho incompleto é preservado, mas não vira cálculo registrado', async () => {
  const { record } = await create()
  const incomplete = structuredClone(record.draft); incomplete.input.taxaPreAnual = null as any
  const saved = await service.updateDraft(record.id, record.organizationId, { draft: incomplete, expectedUpdatedAt: record.updatedAt })
  expect(saved.draft.input.taxaPreAnual).toBeNull()
  await expect(service.register(record.id, record.organizationId, 'tester', saved.updatedAt)).rejects.toMatchObject({ code: 'CALCULATION_VALIDATION_FAILED' })
  expect(await service.listSnapshots(record.id, record.organizationId)).toEqual([])
})

it('não persiste JSON financeiro malformado ou valores não finitos', async () => {
  const draft = syntheticDraft(); draft.input.valorOperacao = Infinity
  await expect(service.create({ organizationId: 'org-test', title: 'x', draft })).rejects.toMatchObject({ code: 'INVALID_DRAFT' })
  expect(await service.list('org-test')).toEqual([])
})

it('registra operação válida sem exigir módulos auxiliares não utilizados', async () => {
  const draft = syntheticDraft()
  draft.recalculo = { ...draft.recalculo, valorCredito: 0, taxaMensal: 0, parcelas: [] }
  draft.ficha = { ...draft.ficha, valorOperacao: 0, taxaMensal: 0, eventos: [] }
  const { record } = await service.create({ organizationId: 'org-test', title: 'Principal', draft })
  const result = await service.register(record.id, record.organizationId, 'tester', record.updatedAt)
  expect(result.snapshot.output.recalculo).toBeNull()
  expect(result.snapshot.output.ficha).toBeNull()
  expect(result.snapshot.output.blocos).toEqual({ operacao: 'calculado', recalculo: 'nao_preenchido', ficha: 'nao_preenchido' })
})
