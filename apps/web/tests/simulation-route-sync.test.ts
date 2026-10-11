import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SimulationRouteSync } from '../src/lib/SimulationRouteSync.ts'

const A = { clientId: 'synthetic-a' }
const B = { clientId: 'synthetic-b' }
const C = { clientId: 'synthetic-c' }

test('A → B → A ignora renders de busy=false anteriores ao commit da rota por startTransition', () => {
  const sync = new SimulationRouteSync('location-a-1', A)
  sync.beginLoad(B)
  assert.equal(sync.observe('location-a-1', A, true), null)
  assert.equal(sync.finishLoad(B), true)
  // Regressão: o componente já liberou a ação, mas React Router ainda mostra A.
  assert.equal(sync.observe('location-a-1', A, false), null)
  assert.equal(sync.observe('location-a-1', A, false), null)
  assert.equal(sync.observe('location-b-1', B, false), null)
  sync.beginLoad(A)
  assert.equal(sync.observe('location-b-1', B, true), null)
  assert.equal(sync.finishLoad(A), true)
  assert.equal(sync.observe('location-b-1', B, false), null)
  assert.equal(sync.observe('location-a-2', A, false), null)
})

test('URL externa durante carregamento prevalece e é aberta quando a ação termina', () => {
  const sync = new SimulationRouteSync('location-a', A)
  sync.beginLoad(B)
  assert.equal(sync.observe('external-c', C, true), null)
  assert.equal(sync.finishLoad(B), false)
  assert.deepEqual(sync.observe('external-c', C, false), C)
  sync.beginLoad(C)
  assert.equal(sync.finishLoad(C), true)
  assert.equal(sync.observe('internal-c', C, false), null)
})

test('Voltar para A durante leitura de B é navegação real mesmo com os mesmos parâmetros anteriores', () => {
  const sync = new SimulationRouteSync('location-a-1', A)
  sync.beginLoad(B)
  assert.equal(sync.observe('location-a-back', A, true), null)
  assert.equal(sync.finishLoad(B), false)
  assert.deepEqual(sync.observe('location-a-back', A, false), A)
  sync.beginLoad(A)
  assert.equal(sync.finishLoad(A), true)
  assert.equal(sync.observe('location-a-confirmed', A, false), null)
})

test('troca externa de operação no mesmo cliente é preservada enquanto registra', () => {
  const first = { ...A, workspaceId: 'operation-1' }
  const second = { ...A, workspaceId: 'operation-2' }
  const sync = new SimulationRouteSync('operation-1-route', first)
  assert.equal(sync.observe('operation-2-route', second, true), null)
  assert.deepEqual(sync.observe('operation-2-route', second, false), second)
  assert.equal(sync.observe('operation-2-route', second, false), null)
})

test('mudança de aba ou sistema na mesma operação não reabre o contexto', () => {
  const sync = new SimulationRouteSync('dados-route', A)
  assert.equal(sync.observe('resumo-route', A, false), null)
  assert.equal(sync.observe('sac-route', A, false), null)
})

test('falha de carregamento não impede uma nova tentativa ou navegação externa', () => {
  const sync = new SimulationRouteSync('location-a', A)
  sync.beginLoad(B)
  sync.cancelLoad()
  assert.equal(sync.observe('location-a', A, false), null)
  assert.deepEqual(sync.observe('external-c', C, false), C)
  sync.beginLoad(C)
  assert.equal(sync.finishLoad(C), true)
  assert.equal(sync.observe('internal-c', C, false), null)
})
