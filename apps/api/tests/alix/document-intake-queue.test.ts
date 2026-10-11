import assert from 'node:assert'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { DocumentIntakeService } from '../../src/services/alix/intake/DocumentIntakeService.ts'

let storage = ''
let previousPg: string | undefined
let previousLlm: string | undefined

beforeEach(async () => {
  storage = await mkdtemp(join(tmpdir(), 'aletis-intake-queue-test-'))
  previousPg = process.env.ALETIS_PG_ENABLED
  previousLlm = process.env.ALIX_USE_LLM
  process.env.ALETIS_PG_ENABLED = '0'
  process.env.ALIX_USE_LLM = 'false'
})

afterEach(async () => {
  if (previousPg === undefined) delete process.env.ALETIS_PG_ENABLED
  else process.env.ALETIS_PG_ENABLED = previousPg
  if (previousLlm === undefined) delete process.env.ALIX_USE_LLM
  else process.env.ALIX_USE_LLM = previousLlm
  await rm(storage, { recursive: true, force: true })
})

test('aceita arquivo imediatamente e conclui extração em segundo plano', async () => {
  const service = new DocumentIntakeService(storage)
  const queued = await service.enqueue({
    buffer: Buffer.from('CONTRATO DE CRÉDITO RURAL\nDevedor: João da Silva\nCPF: 123.456.789-09\nUF: MT'),
    filename: 'contrato.txt',
    mimetype: 'text/plain',
    sessionId: 'crm-intake-queue-test-1234',
    clienteId: 'client-original',
    processingMode: 'fast',
    source: { type: 'google_drive', fileId: 'test-file', url: 'https://drive.google.com/file/d/test-file/view', path: 'Contratos', modifiedAt: null, importedAt: new Date().toISOString() },
  })

  assert.strictEqual(queued.metadata.processingState, 'queued')
  assert.ok(queued.id)

  let processed = await service.get(queued.sessionId, queued.id)
  for (let attempt = 0; attempt < 100 && ['queued', 'processing', 'extracting'].includes(String(processed?.metadata.processingState)); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    processed = await service.get(queued.sessionId, queued.id)
  }

  assert.ok(processed?.extractedText.includes('João da Silva'))
  assert.ok(['completed', 'completed_basic'].includes(String(processed?.metadata.processingState)))
  assert.deepStrictEqual(processed?.metadata.source, queued.metadata.source)
  await assert.rejects(service.enqueue({
    buffer: Buffer.from('CONTRATO DE CRÉDITO RURAL\nDevedor: João da Silva\nCPF: 123.456.789-09\nUF: MT'),
    filename: 'contrato.txt', mimetype: 'text/plain', sessionId: queued.sessionId, clienteId: 'client-other',
  }), /outro cliente/)
})

test('leitores mantêm a versão anterior completa enquanto a nova gravação está em andamento', async () => {
  const service = new DocumentIntakeService(storage)
  const doc = await service.ingest({
    buffer: Buffer.from('Documento de teste para persistência consistente.'),
    filename: 'documento.txt', mimetype: 'text/plain', sessionId: 'atomic-intake', processingMode: 'fast',
  })
  let continueWrite!: () => void
  let notifyPartial!: () => void
  const partialWritten = new Promise<void>(resolve => { notifyPartial = resolve })
  const gate = new Promise<void>(resolve => { continueWrite = resolve })
  const originalWrite = fs.writeFile.bind(fs)
  const spy = vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
    const text = String(data)
    if (String(file).includes(doc.id) && text.includes('version-new')) {
      await originalWrite(file, text.slice(0, Math.floor(text.length / 2)), options)
      notifyPartial()
      await gate
    }
    await originalWrite(file, data, options)
  })
  const saving = service.saveMetadata(doc.sessionId, doc.id, { atomicTest: 'version-new' })
  try {
    await partialWritten
    const previous = await service.get(doc.sessionId, doc.id)
    assert.strictEqual(previous?.id, doc.id)
    assert.strictEqual(previous?.metadata.atomicTest, undefined)
  } finally {
    continueWrite()
    await saving
    spy.mockRestore()
  }
  const updated = await service.get(doc.sessionId, doc.id)
  assert.strictEqual(updated?.metadata.atomicTest, 'version-new')
})
