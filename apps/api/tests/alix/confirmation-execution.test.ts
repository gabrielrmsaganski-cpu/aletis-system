import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AlixConfirmationStore } from '../../src/services/alix/AlixConfirmationStore.js'
import { confirmationMatchesScope, resolveConfirmationChat } from '../../src/services/alix/ConfirmationChat.js'
import { getAlixTurnContext, withAlixTurnContext } from '../../src/services/alix/AlixTurnContext.js'

vi.mock('../../src/db/AlixConfirmationFeedbackRepository.js', () => ({ dumpConfirmations: vi.fn(async () => ({ written: 0 })) }))
let directory: string
let store: AlixConfirmationStore
const instances: AlixConfirmationStore[] = []
const scope = { sessionId: 'sessao-a', clienteId: 'cliente-a' }
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'alix-execution-'))
  vi.stubEnv('ALIX_STORAGE_DIR', directory)
  store = new AlixConfirmationStore()
  instances.push(store)
})
afterEach(async () => {
  instances.splice(0).forEach((instance) => instance.dispose())
  await new Promise<void>((resolve) => setImmediate(resolve))
  await rm(directory, { recursive: true, force: true })
  vi.unstubAllEnvs()
})
const create = (clienteId = scope.clienteId, sessionId = scope.sessionId) => store.create('definir_proxima_acao_cliente', 'Definir próxima ação', { clienteId, descricao: 'Revisar contrato' }, sessionId)

it('confirmação genérica nunca recorre a pendências de outra sessão ou cliente', async () => {
  const other = create('cliente-b', 'sessao-b')
  const execute = vi.fn(async () => ({ ok: true }))
  const reply = await resolveConfirmationChat('confirmo', scope, store, () => execute)
  expect(reply?.metadata).toMatchObject({ executed: false, reason: 'no_pending_in_context' })
  expect(await resolveConfirmationChat(`confirmo ${other.id}`, scope, store, () => execute)).toMatchObject({ metadata: { executed: false } })
  const wrongClient = create('cliente-b')
  expect(confirmationMatchesScope(wrongClient, scope)).toBe(false)
  expect(execute).not.toHaveBeenCalled()
})

it('consulta ao ID não aprova ação e confirmação ambígua não escolhe uma ao acaso', async () => {
  const a = create()
  create()
  const execute = vi.fn(async () => ({ ok: true }))
  expect(await resolveConfirmationChat(`quero ver ${a.id}`, scope, store, () => execute)).toBeNull()
  expect(await resolveConfirmationChat('confirmo', scope, store, () => execute)).toMatchObject({ metadata: { reason: 'ambiguous_confirmation' } })
  expect(execute).not.toHaveBeenCalled()
})

it('executor ausente preserva a pendência para execução posterior', async () => {
  const pending = create()
  expect(await resolveConfirmationChat(`confirmo ${pending.id}`, scope, store, () => null)).toMatchObject({ metadata: { executed: false, reason: 'executor_not_registered' } })
  expect(store.get(pending.id)).toEqual(pending)
})

it('erro retornado não vira sucesso e repetição consulta o mesmo recibo', async () => {
  const pending = create()
  const execute = vi.fn(async () => ({ success: false, error: 'Cliente não encontrado' }))
  const first = await resolveConfirmationChat(`confirmo ${pending.id}`, scope, store, () => execute)
  const again = await resolveConfirmationChat(`confirmo ${pending.id}`, scope, store, () => execute)
  expect(first?.metadata).toMatchObject({ executed: false, executionStatus: 'failed', error: 'Cliente não encontrado' })
  expect(again?.metadata).toEqual(first?.metadata)
  expect(execute).toHaveBeenCalledTimes(1)
  expect(store.getExecution(pending.id)?.confirmation.payload).toEqual(pending.payload)
})

it('conserva IDs reais do resultado, executa lote textual inteiro e não repete', async () => {
  create(); create()
  const execute = vi.fn(async () => ({ ok: true, demanda: { id: `demanda-${execute.mock.calls.length}` } }))
  const result = await resolveConfirmationChat('executa tudo', scope, store, () => execute)
  expect(result?.metadata).toMatchObject({ executed: 2, total: 2, results: [{ result: { demanda: { id: 'demanda-1' } } }, { result: { demanda: { id: 'demanda-2' } } }] })
  expect(execute).toHaveBeenCalledTimes(2)
})

it('duas aprovações existentes continuam obrigatórias e fila manual não é envio', async () => {
  const pending = store.create('criar_cliente', 'Criar cliente', {}, scope.sessionId)
  const execute = vi.fn(async () => ({ ok: true }))
  expect(await resolveConfirmationChat(`confirmo ${pending.id}`, scope, store, () => execute)).toMatchObject({ metadata: { reason: 'double_approval_required', executed: false } })
  expect(execute).not.toHaveBeenCalled()
  const queued = create()
  const reply = await resolveConfirmationChat(`confirmo ${queued.id}`, scope, store, () => async () => ({ ok: true, queued: true, mensagem: { id: 'msg-1' } }))
  expect(reply?.metadata).toMatchObject({ prepared: true, executed: false, outcome: 'prepared' })
})

it('concorrência painel/chat inicia o efeito uma vez e deixa recibo em andamento', async () => {
  const pending = create()
  let finish!: (value: unknown) => void
  const effect = vi.fn(() => new Promise((resolve) => { finish = resolve }))
  const panelAuthorization = store.authorize(pending.id, { actorId: 'consultor', deferConsumption: true })
  expect(panelAuthorization.status).toBe('ready')
  const panel = store.executeOnce(pending, effect)
  expect(await resolveConfirmationChat(`confirmo ${pending.id}`, scope, store, () => effect)).toMatchObject({ metadata: { executionStatus: 'running', executed: false } })
  expect(effect).toHaveBeenCalledTimes(1)
  finish({ ok: true, id: 'registro-1' })
  await panel
  expect(await resolveConfirmationChat(`confirmo ${pending.id}`, scope, store, () => effect)).toMatchObject({ metadata: { executed: true, result: { id: 'registro-1' } } })
  expect(effect).toHaveBeenCalledTimes(1)
})

it('recibo completo sobrevive reinício e não executa o mesmo ID de novo', async () => {
  const pending = create()
  const effect = vi.fn(async () => ({ ok: true, id: 'cliente-1' }))
  await store.executeOnce(pending, effect)
  store.dispose()
  const restored = new AlixConfirmationStore()
  instances.push(restored)
  expect(await restored.executeOnce(pending, effect)).toMatchObject({ status: 'completed', result: { id: 'cliente-1' } })
  expect(effect).toHaveBeenCalledTimes(1)
})

it('reinício durante efeito e exceção após início ficam indeterminados sem repetição automática', async () => {
  const pending = create()
  let finish!: (value: unknown) => void
  const effect = vi.fn(() => new Promise((resolve) => { finish = resolve }))
  const started = store.executeOnce(pending, effect)
  const restored = new AlixConfirmationStore()
  instances.push(restored)
  expect(await restored.executeOnce(pending, effect)).toMatchObject({ status: 'unknown' })
  expect(effect).toHaveBeenCalledTimes(1)
  finish({ ok: true }); await started
  const next = create()
  const fail = vi.fn(async () => { throw new Error('Falha após chamada ao CRM') })
  expect(await store.executeOnce(next, fail)).toMatchObject({ status: 'unknown' })
  await store.executeOnce(next, fail)
  expect(fail).toHaveBeenCalledTimes(1)
})

it('contexto de sessão, cliente e auditoria permanece isolado em chamadas intercaladas', async () => {
  let release!: () => void
  const barrier = new Promise<void>((resolve) => { release = resolve })
  const a = withAlixTurnContext({ ...scope, auditTrailKey: 'audit-a' }, async () => {
    await barrier
    return { context: getAlixTurnContext(), pending: store.create('definir_proxima_acao_cliente', 'A', { clienteId: 'cliente-a' }) }
  })
  const b = await withAlixTurnContext({ sessionId: 'sessao-b', clienteId: 'cliente-b', auditTrailKey: 'audit-b' }, async () => ({ context: getAlixTurnContext(), pending: store.create('definir_proxima_acao_cliente', 'B', { clienteId: 'cliente-b' }) }))
  release()
  const resultA = await a
  expect(resultA.context?.auditTrailKey).toBe('audit-a')
  expect(resultA.pending).toMatchObject({ sessionId: 'sessao-a', contextClienteId: 'cliente-a' })
  expect(b.pending).toMatchObject({ sessionId: 'sessao-b', contextClienteId: 'cliente-b' })
  expect(b.context?.auditTrailKey).toBe('audit-b')
  expect(getAlixTurnContext()).toBeUndefined()
})

it('retomada de lote parcial preserva resultado anterior sem reaplicar ações', async () => {
  const batch = store.createBatch(scope.sessionId, 'Teste', [
    { toolName: 'primeira', description: 'primeira', payload: {} },
    { toolName: 'segunda', description: 'segunda', payload: {}, dependsOn: 0 },
  ])
  const runner = vi.fn(async (pending: { toolName: string }) => pending.toolName === 'primeira' ? { ok: true, id: 'a' } : { ok: false, error: 'Não aplicado' })
  const first = await store.applyBatch(batch.batchId, runner)
  expect(first.applied).toHaveLength(1)
  expect(first.failed).toHaveLength(1)
  await store.applyBatch(batch.batchId, runner)
  expect(runner).toHaveBeenCalledTimes(2)
})
