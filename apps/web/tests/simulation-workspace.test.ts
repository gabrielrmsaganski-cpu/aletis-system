import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SimulationSaveQueue, SimulationContextChanged, SimulationRegistrationRejected, simulationStorageKey, simulationDraftFingerprint, shiftCalendarMonths, safeSimulationCalculation } from '../src/lib/SimulationSaveQueue.ts'
import { simulationBalanceComparison, simulationCashAnalysis } from '../src/lib/SimulationCashAnalysis.ts'
import type { ResultadoSimuladorOperacao } from '@aletis/financial-calc'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test('autosaves serializados recebem a revisão anterior confirmada e não respondem fora de ordem', async () => {
  const queue = new SimulationSaveQueue()
  queue.activate('cliente-a-operacao-1', 'revision-1')
  const firstReply = deferred<{ value: string; updatedAt: string }>()
  const entered = deferred<void>()
  const sent: string[] = []
  const first = queue.run(async context => { sent.push(context.updatedAt); entered.resolve(); return firstReply.promise })
  await entered.promise
  const second = queue.run(async context => { sent.push(context.updatedAt); return { value: 'segunda edição', updatedAt: 'revision-3' } })
  assert.deepEqual(sent, ['revision-1'])
  firstReply.resolve({ value: 'primeira edição', updatedAt: 'revision-2' })
  assert.deepEqual(await Promise.all([first, second]), ['primeira edição', 'segunda edição'])
  assert.deepEqual(sent, ['revision-1', 'revision-2'])
})

test('registro atômico não intercala salvamento posterior entre draft confirmado e snapshot', async () => {
  const queue = new SimulationSaveQueue()
  queue.activate('operation', 'v1')
  const entered = deferred<void>()
  const registration = deferred<void>()
  const steps: string[] = []
  const register = queue.run(async context => {
    steps.push(`save:${context.updatedAt}`)
    entered.resolve()
    await registration.promise
    steps.push('register:v2')
    return { value: 'snapshot', updatedAt: 'v3' }
  })
  await entered.promise
  const autoSave = queue.run(async context => { steps.push(`autosave:${context.updatedAt}`); return { value: 'saved', updatedAt: 'v4' } })
  registration.resolve()
  await Promise.all([register, autoSave])
  assert.deepEqual(steps, ['save:v1', 'register:v2', 'autosave:v3'])
})

test('troca de cliente ignora resposta anterior e cancela autosave antigo ainda na fila', async () => {
  const queue = new SimulationSaveQueue()
  queue.activate('cliente-a', 'a1')
  const firstReply = deferred<{ value: string; updatedAt: string }>()
  const entered = deferred<void>()
  const first = queue.run(async () => { entered.resolve(); return firstReply.promise })
  const firstRejected = assert.rejects(first, SimulationContextChanged)
  await entered.promise
  let obsoleteWrites = 0
  const oldQueued = queue.run(async () => { obsoleteWrites += 1; return { value: 'obsolete', updatedAt: 'a3' } })
  const oldRejected = assert.rejects(oldQueued, SimulationContextChanged)
  queue.activate('cliente-b', 'b1')
  const next = queue.run(async context => { assert.deepEqual(context, { id: 'cliente-b', updatedAt: 'b1' }); return { value: 'novo cliente', updatedAt: 'b2' } })
  firstReply.resolve({ value: 'antigo cliente', updatedAt: 'a2' })
  await Promise.all([firstRejected, oldRejected])
  assert.equal(await next, 'novo cliente')
  assert.equal(obsoleteWrites, 0)
})

test('conflito ou timeout interrompe escritas até reabrir revisão oficial', async () => {
  const queue = new SimulationSaveQueue()
  queue.activate('operation', 'v1')
  await assert.rejects(queue.run(async () => { throw new Error('409') }), /409/)
  let writes = 0
  await assert.rejects(queue.run(async () => { writes += 1; return { value: 1, updatedAt: 'v2' } }), /Reabra/)
  assert.equal(writes, 0)
  queue.activate('operation', 'v2')
  assert.equal(await queue.run(async context => { assert.equal(context.updatedAt, 'v2'); return { value: 'recuperado', updatedAt: 'v3' } }), 'recuperado')
})

test('rejeição 422 do registro permite corrigir a partir do PUT confirmado, sem recarregar', async () => {
  const queue = new SimulationSaveQueue()
  queue.activate('operation', 'v1')
  await assert.rejects(queue.run(async (_context, confirmRevision) => {
    confirmRevision('v2')
    throw new SimulationRegistrationRejected('Ficha bancária: data inválida')
  }), SimulationRegistrationRejected)
  const corrected = await queue.run(async context => {
    assert.equal(context.updatedAt, 'v2')
    return { value: 'corrigido', updatedAt: 'v3' }
  })
  assert.equal(corrected, 'corrigido')
})

test('timeout do registro após PUT confirmado continua bloqueando nova escrita', async () => {
  const queue = new SimulationSaveQueue()
  queue.activate('operation', 'v1')
  await assert.rejects(queue.run(async (_context, confirmRevision) => {
    confirmRevision('v2')
    throw new Error('timeout: resultado do registro desconhecido')
  }), /timeout/)
  let writes = 0
  await assert.rejects(queue.run(async () => { writes += 1; return { value: true, updatedAt: 'v3' } }), /Reabra/)
  assert.equal(writes, 0)
})

test('desmontagem invalida escrita ainda não iniciada', async () => {
  const queue = new SimulationSaveQueue()
  queue.activate('operation', 'v1')
  let writes = 0
  const pending = queue.run(async () => { writes += 1; return { value: true, updatedAt: 'v2' } })
  queue.invalidate()
  await assert.rejects(pending, SimulationContextChanged)
  assert.equal(writes, 0)
})

test('backup é específico para usuário e operação sem colisão de separadores', () => {
  assert.notEqual(simulationStorageKey('ana', 'cliente-a'), simulationStorageKey('bruno', 'cliente-a'))
  assert.notEqual(simulationStorageKey('ana', 'cliente-a'), simulationStorageKey('ana', 'cliente-b'))
  assert.notEqual(simulationStorageKey('a:b', 'c'), simulationStorageKey('a', 'b:c'))
})

test('ordem de chaves do JSONB não transforma versão registrada em alteração ou autosave', () => {
  const ui = { input: { tomador: 'Cliente A', valorOperacao: 100, despesas: [{ id: '1', valor: 0 }] }, recalculo: { taxaMensal: Number.NaN }, ficha: { eventos: [] } }
  const postgres = { ficha: { eventos: [] }, input: { despesas: [{ valor: 0, id: '1' }], valorOperacao: 100, tomador: 'Cliente A' }, recalculo: { taxaMensal: null } }
  assert.equal(simulationDraftFingerprint(ui), simulationDraftFingerprint(postgres))
  assert.notEqual(simulationDraftFingerprint(ui), simulationDraftFingerprint({ ...postgres, input: { ...postgres.input, valorOperacao: 101 } }))
  assert.notEqual(simulationDraftFingerprint([1, 2]), simulationDraftFingerprint([2, 1]))
})

test('agenda mantém fim do mês em fevereiro e datas inválidas não são normalizadas', () => {
  assert.equal(shiftCalendarMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(shiftCalendarMonths('2024-01-31', 1), '2024-02-29')
  assert.equal(shiftCalendarMonths('2026-08-31', 1), '2026-09-30')
  assert.equal(shiftCalendarMonths('', 1), '')
  assert.equal(shiftCalendarMonths('2026-02-30', 1), '')
})

test('cálculo inválido não apresenta zeros ou último resultado como resultado atual', () => {
  assert.equal(safeSimulationCalculation(() => ({ validacao: { valido: false, erros: [{ mensagem: 'Taxa ausente' }] }, cet: 0 })).result, null)
  const thrown = safeSimulationCalculation(() => { throw Object.assign(new Error('Entrada inválida'), { validacao: { erros: [{ mensagem: 'Data inválida' }] } }) })
  assert.deepEqual(thrown, { result: null, errors: ['Data inválida'] })
  assert.deepEqual(safeSimulationCalculation(() => ({ taxa: 0 })), { result: { taxa: 0 }, errors: [] })
})

const cashFixture = {
  sistemas: {
    PRICE: { linhas: [{ n: 0, data: '2026-01-01', prestacao: 0, saldoDevedor: 1000 }, { n: 1, data: '2026-02-01', prestacao: 100, saldoDevedor: 900 }, { n: 2, data: '2026-02-20', prestacao: 900, saldoDevedor: 0 }] },
    SAC: { linhas: [{ n: 0, data: '2026-01-01', prestacao: 0, saldoDevedor: 1000 }, { n: 1, data: '2026-03-01', prestacao: 600, saldoDevedor: 500 }, { n: 2, data: '2026-04-01', prestacao: 550, saldoDevedor: 0 }] },
    SACRE: { linhas: [{ n: 0, data: '2026-01-01', prestacao: 0, saldoDevedor: 1000 }, { n: 1, data: '2026-02-01', prestacao: 200, saldoDevedor: 800 }, { n: 2, data: '2027-02-01', prestacao: 900, saldoDevedor: 0 }] },
  },
} as unknown as ResultadoSimuladorOperacao

test('capacidade de caixa soma eventos do mês e separa anos e sistemas', () => {
  const cash = simulationCashAnalysis(cashFixture)
  assert.deepEqual(cash[0].peakMonth, { period: '2026-02', amount: 1000 })
  assert.deepEqual(cash[1].peakMonth, { period: '2026-03', amount: 600 })
  assert.deepEqual(cash[2].peakYear, { period: '2027', amount: 900 })
  assert.equal(cash[0].lastPaymentDate, '2026-02-20')
})

test('gráfico une datas reais, carrega saldo anterior e mantém quitado em zero', () => {
  const result = simulationBalanceComparison(cashFixture)
  assert.deepEqual(result.find(row => row.data === '2026-02-20'), { data: '2026-02-20', PRICE: 0, SAC: 1000, SACRE: 800 })
  assert.deepEqual(result.find(row => row.data === '2026-04-01'), { data: '2026-04-01', PRICE: 0, SAC: 0, SACRE: 800 })
})
