import assert from 'node:assert/strict'
import { test } from 'vitest'

import { AlixConfirmationStore, classifyConfirmationRisk } from '../../src/services/alix/AlixConfirmationStore.ts'
import { evaluateGovernanceGate } from '../../src/services/alix/governance/AlixGovernanceService.ts'

test('gate de promoção exige amostra, evidência e zero falha crítica', () => {
  const approved = evaluateGovernanceGate({
    sampleSize: 103,
    passed: 103,
    failed: 0,
    passRate: 1,
    evidenceRate: 1,
    criticalFailures: 0,
  })
  assert.equal(approved.passed, true)

  const blocked = evaluateGovernanceGate({
    sampleSize: 99,
    passed: 99,
    failed: 0,
    passRate: 1,
    evidenceRate: 0.97,
    criticalFailures: 1,
  })
  assert.equal(blocked.passed, false)
  assert.deepEqual(blocked.reasons.length, 3)
})

test('ações de alto impacto exigem duas confirmações', () => {
  assert.deepEqual(classifyConfirmationRisk('criar_cliente'), { riskLevel: 'high', approvalsRequired: 2 })
  assert.deepEqual(classifyConfirmationRisk('enviar_mensagem_whatsapp_intent'), { riskLevel: 'high', approvalsRequired: 2 })
  assert.deepEqual(classifyConfirmationRisk('criar_tarefa'), { riskLevel: 'standard', approvalsRequired: 1 })
})

test('challenge de confirmação dupla é de uso único', () => {
  const store = new AlixConfirmationStore(60_000)
  const pending = store.create('criar_cliente', 'Criar cliente', { nome: 'Cliente teste' }, 'sessao')
  const first = store.authorize(pending.id, { actorId: 'consultor-1' })
  assert.equal(first.status, 'awaiting_second_approval')
  if (first.status !== 'awaiting_second_approval') throw new Error('Primeira etapa não foi registrada')

  const invalid = store.authorize(pending.id, { actorId: 'consultor-1', challenge: 'invalido' })
  assert.equal(invalid.status, 'invalid_challenge')

  const second = store.authorize(pending.id, { actorId: 'consultor-1', challenge: first.challenge })
  assert.equal(second.status, 'ready')
  assert.equal(store.get(pending.id), null)
})
