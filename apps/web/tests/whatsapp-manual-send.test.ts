import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { confirmedManualSend, resolveManualSendAttempt } from '../src/pages/WhatsApp'

test('mesmo texto e conversa repetem a tentativa, inclusive após recarregar o estado', () => {
  const attempt = resolveManualSendAttempt([], 'conversa-a', ' Olá ', () => 'uuid-original')
  const restored = JSON.parse(JSON.stringify([attempt]))
  const replay = resolveManualSendAttempt(restored, 'conversa-a', 'Olá', () => { throw new Error('Não deve criar outra chave') })
  assert.equal(replay.idempotencyKey, 'uuid-original')
  assert.equal(replay.text, 'Olá')
})

test('outra conversa ou outro texto representam mensagens distintas', () => {
  const existing = [resolveManualSendAttempt([], 'conversa-a', 'Olá', () => 'uuid-1')]
  assert.equal(resolveManualSendAttempt(existing, 'conversa-b', 'Olá', () => 'uuid-2').idempotencyKey, 'uuid-2')
  assert.equal(resolveManualSendAttempt(existing, 'conversa-a', 'Bom dia', () => 'uuid-3').idempotencyKey, 'uuid-3')
  assert.equal(resolveManualSendAttempt(existing, 'conversa-a', 'Olá', () => 'uuid-4').idempotencyKey, 'uuid-1')
})

test('uma nova mensagem após sucesso recebe chave nova, mesmo com texto igual', () => {
  const attempt = resolveManualSendAttempt([], 'conversa-a', 'Olá', () => 'uuid-1')
  const pending = [attempt].filter((item) => item.idempotencyKey !== attempt.idempotencyKey)
  assert.equal(resolveManualSendAttempt(pending, 'conversa-a', 'Olá', () => 'uuid-2').idempotencyKey, 'uuid-2')
})

test('falha, incerteza, simulação e fila não confirmam um envio', () => {
  for (const status of ['failed', 'uncertain', 'dry_run', 'sending', 'queued', 'cancelled', undefined]) {
    assert.equal(confirmedManualSend(status), false, status)
  }
  for (const status of ['sent', 'delivered', 'read']) assert.equal(confirmedManualSend(status), true)
})
