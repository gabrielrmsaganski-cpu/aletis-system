import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConversationStateService } from '../../src/services/whatsapp/ConversationStateService.js'
import { WhatsAppOutboxService } from '../../src/services/whatsapp/WhatsAppOutboxService.js'

describe('WhatsAppOutboxService', () => {
  let dir: string
  let previousPg: string | undefined

  beforeEach(() => {
    previousPg = process.env.ALETIS_PG_ENABLED
    process.env.ALETIS_PG_ENABLED = '0'
    dir = mkdtempSync(join(tmpdir(), 'aletis-wa-outbox-'))
  })

  afterEach(() => {
    process.env.ALETIS_PG_ENABLED = previousPg
    rmSync(dir, { recursive: true, force: true })
  })

  it('registra envio dry-run quando Evolution nao esta configurada', async () => {
    const state = new ConversationStateService(join(dir, 'state.json'))
    const fakeEvolution = { isConfigured: () => false } as any
    const svc = new WhatsAppOutboxService(state, fakeEvolution)

    const sent = await svc.send({
      instanceName: 'aletis-principal',
      toNumber: '556699999999',
      type: 'text',
      text: 'Teste',
    })

    expect(sent.status).toBe('dry_run')
    expect(sent.outboxId).toMatch(/^wa_out_/)
  })
})

describe('resultado e idempotência de saída', () => {
  let dir: string
  let state: ConversationStateService
  const input = { instanceName: 'teste', toNumber: '5599000000000', text: 'Mensagem sintética', idempotencyKey: 'operacao-1' }
  beforeEach(() => {
    process.env.ALETIS_PG_ENABLED = '0'
    dir = mkdtempSync(join(tmpdir(), 'aletis-wa-delivery-')); state = new ConversationStateService(join(dir, 'state.json'))
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('mesma operação confirmada retorna resultado persistido sem reenvio', async () => {
    let calls = 0
    const transport = { isConfigured: () => true, sendText: async () => { calls++; return { key: { id: 'confirmada' } } } } as any
    const svc = new WhatsAppOutboxService(state, transport)
    const results = await Promise.all([svc.send(input), svc.send(input)])
    expect(results[0].outboxId).toBe(results[1].outboxId)
    expect((await new WhatsAppOutboxService(state, transport).send(input)).status).toBe('sent')
    expect(calls).toBe(1)
  })
  it('duas instâncias disputando a mesma saída não chamam o provedor duas vezes', async () => {
    let calls = 0
    const transport = { isConfigured: () => true, sendText: async () => { calls++; await Promise.resolve(); return { key: { id: 'confirmada' } } } } as any
    await Promise.all([new WhatsAppOutboxService(state, transport).send(input), new WhatsAppOutboxService(state, transport).send(input)])
    expect(calls).toBe(1)
  })
  it('não confirma outro texto concorrente com a chave de uma tentativa em andamento', async () => {
    let finish!: (value: unknown) => void
    const transport = { isConfigured: () => true, sendText: async () => new Promise(resolve => { finish = resolve }) } as any
    const service = new WhatsAppOutboxService(state, transport)
    const first = service.send(input)
    await expect(service.send({ ...input, text: 'Outro conteúdo' })).rejects.toThrow('outro conteúdo')
    while (!finish) await Promise.resolve()
    finish({ key: { id: 'original-confirmada' } })
    expect((await first).status).toBe('sent')
  })
  it('identifica a mídia efetivamente enviada ao reutilizar uma tentativa', async () => {
    let calls = 0
    const transport = { isConfigured: () => true, sendMedia: async () => { calls++; return { key: { id: 'midia-confirmada' } } } } as any
    const media = { ...input, type: 'document' as const, mediaBase64: 'cHJpbWVpcm8=', mediaMime: 'application/pdf', fileName: 'documento.pdf' }
    await new WhatsAppOutboxService(state, transport).send(media)
    await expect(new WhatsAppOutboxService(state, transport).send({ ...media, mediaBase64: 'b3V0cm8=' })).rejects.toThrow('outro conteúdo')
    expect(calls).toBe(1)
  })
  it('repete falha comprovada de conexão, no máximo três tentativas', async () => {
    let calls = 0
    const transport = { isConfigured: () => true, sendText: async () => {
      calls++; if (calls < 3) throw Object.assign(new Error('Conexão recusada'), { cause: { code: 'ECONNREFUSED' } })
      return { key: { id: 'terceira-confirmada' } }
    } } as any
    const svc = new WhatsAppOutboxService(state, transport, async () => undefined)
    const result = await svc.send(input)
    expect(result.status).toBe('sent'); expect(calls).toBe(3)
    expect((await state.getOutbox(result.outboxId))?.attempt).toBe(3)
  })
  it('não ultrapassa o limite após reiniciar em falha de DNS', async () => {
    let calls = 0
    const transport = { isConfigured: () => true, sendText: async () => { calls++; throw Object.assign(new Error('DNS'), { cause: { code: 'ENOTFOUND' } }) } } as any
    expect((await new WhatsAppOutboxService(state, transport, async () => undefined).send(input)).status).toBe('failed')
    expect((await new WhatsAppOutboxService(state, transport, async () => undefined).send(input)).status).toBe('failed')
    expect(calls).toBe(3)
  })
  it.each(['timeout', 'http500', 'sem_identificador'])('não repete resultado incerto: %s', async (failure) => {
    let calls = 0
    const transport = { isConfigured: () => true, sendText: async () => {
      calls++
      if (failure === 'sem_identificador') return { accepted: true }
      throw Object.assign(new Error('Resposta incerta'), failure === 'http500' ? { status: 500 } : {})
    } } as any
    const svc = new WhatsAppOutboxService(state, transport, async () => undefined)
    expect((await svc.send(input)).status).toBe('uncertain')
    expect((await new WhatsAppOutboxService(state, transport).send(input)).status).toBe('uncertain')
    expect(calls).toBe(1)
  })
  it('rejeição explícita não é sucesso nem retentativa automática', async () => {
    let calls = 0
    const transport = { isConfigured: () => true, sendText: async () => { calls++; throw Object.assign(new Error('Número inválido'), { status: 400 }) } } as any
    const result = await new WhatsAppOutboxService(state, transport).send(input)
    expect(result.status).toBe('failed'); expect(calls).toBe(1)
  })
})
