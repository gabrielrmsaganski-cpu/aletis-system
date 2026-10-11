/** Homologação reproduzível em banco temporário com a estrutura real do ALETIS. */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getPool, closeDb } from '../src/db/client.js'
import { ConversationStateService } from '../src/services/whatsapp/ConversationStateService.js'
import { WhatsAppOutboxService } from '../src/services/whatsapp/WhatsAppOutboxService.js'
import { GoogleDriveService } from '../src/services/google-workspace/drive.js'
import { getGoogleWorkspaceClient } from '../src/services/google-workspace/client.js'

const database = new URL(process.env.DATABASE_URL || 'postgres://invalid/').pathname.slice(1)
if (!database.startsWith('aletis_evolution_validation_') || process.env.ALETIS_PG_ENABLED !== '1') {
  throw new Error('Esta verificação exige um banco temporário aletis_evolution_validation_ e PG habilitado.')
}
const directory = await mkdtemp(join(tmpdir(), 'aletis-evolution-pg-'))
const first = new ConversationStateService(join(directory, 'first.json'))
const restored = new ConversationStateService(join(directory, 'restored.json'))
const id = `evolution-${randomUUID()}`
const results: Array<{ name: string; passed: boolean; error?: string }> = []
async function check(name: string, run: () => Promise<void>) {
  try { await run(); results.push({ name, passed: true }) }
  catch (error) { results.push({ name, passed: false, error: error instanceof Error ? error.message : String(error) }) }
}
try {
  await check('Webhook concorrente é persistido uma única vez no PostgreSQL', async () => {
    const input = { id, instanceName: 'validation', eventType: 'TEST', payload: {
      __aletisQueue: { version: 1, provider: 'evolution', receivedAt: new Date().toISOString(), items: [] },
    } }
    const saved = await Promise.all([first.recordWebhookEvent(input), restored.recordWebhookEvent(input)])
    assert.equal(saved.filter(result => result.inserted).length, 1)
    assert.equal((await getPool().query('SELECT count(*)::int AS total FROM whatsapp_webhook_event WHERE id = $1', [id])).rows[0].total, 1)
  })
  await check('Checkpoint preparado reaparece sem o arquivo local e estado terminal prevalece', async () => {
    const work = { version: 1, provider: 'evolution', receivedAt: new Date().toISOString(), items: [{ phase: 'prepared', replies: ['Teste'] }] }
    await first.saveWebhookWork(id, work, 'prepared')
    assert.equal((await restored.getWebhookEvent(id))?.status, 'prepared')
    assert.ok((await restored.listPendingWebhookEvents()).some(event => event.id === id))
    await restored.saveWebhookWork(id, work, 'processed')
    assert.ok(!(await first.listPendingWebhookEvents()).some(event => event.id === id))
  })
  await check('Lock PostgreSQL impede dois processadores simultâneos e libera ao terminar', async () => {
    let release!: () => void
    let entered!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    let calls = 0
    const running = first.withWebhookWorkerLock(async () => { calls++; entered(); await new Promise<void>(resolve => { release = resolve }) })
    await ready
    await restored.withWebhookWorkerLock(async () => { calls++ })
    assert.equal(calls, 1)
    release(); await running
    await restored.withWebhookWorkerLock(async () => { calls++ })
    assert.equal(calls, 2)
  })
  await check('Outbox concorrente confirma um único envio simulado e recupera o comprovante', async () => {
    let calls = 0
    const transport = { isConfigured: () => true, sendText: async () => {
      calls++
      await new Promise(resolve => setTimeout(resolve, 80))
      return { key: { id: `${id}-provider` } }
    } } as any
    const input = { instanceName: 'validation', toNumber: '5500000000000', text: 'Mensagem sintética, transporte simulado', idempotencyKey: id }
    await Promise.all([new WhatsAppOutboxService(first, transport).send(input), new WhatsAppOutboxService(restored, transport).send(input)])
    const result = await new WhatsAppOutboxService(restored, transport).send(input)
    assert.equal(result.status, 'sent'); assert.equal(calls, 1)
    assert.equal((await restored.getOutbox(result.outboxId))?.attempt, 1)
    assert.equal(result.providerMessageId, `${id}-provider`)
  })
  await check('Ofertas da agenda mantêm ordem, vínculo e renovação em transação PostgreSQL', async () => {
    const a = await first.upsertConversation({ instanceName: id, telefone: '5500000000001' })
    const b = await first.upsertConversation({ instanceName: id, telefone: '5500000000002' })
    const slots = [{ id: 'source-one', start: '2027-06-01T13:00:00.000Z', end: '2027-06-01T13:50:00.000Z', label: 'Primeira opção' },
      { id: 'source-two', start: '2027-06-02T13:00:00.000Z', end: '2027-06-02T13:50:00.000Z', label: 'Segunda opção' }]
    const firstOffer = await first.saveBookingOptions(a.id, slots)
    const secondOffer = await first.saveBookingOptions(b.id, slots)
    assert.notEqual(firstOffer[0].id, secondOffer[0].id)
    assert.deepEqual((await restored.getBookingOptions(a.id)).map(slot => slot.id), firstOffer.map(slot => slot.id))
    const renewed = await first.saveBookingOptions(a.id, [slots[1]])
    assert.deepEqual((await restored.getBookingOptions(a.id)).map(slot => slot.id), renewed.map(slot => slot.id))
    assert.equal((await restored.getBookingOptions(b.id)).length, 2)
    await first.saveBookingOptions(a.id, [])
    assert.equal((await restored.getBookingOptions(a.id)).length, 0)
  })
  await check('Drive retoma cursor do PostgreSQL e preserva os demais metadados da pasta', async () => {
    const tenant = id
    await getPool().query(`INSERT INTO client_google_drive_folder (id,tenant_id,client_id,google_folder_id,folder_url,folder_name,metadata)
      VALUES ($1,$2,$3,'root-validation','https://drive.google.com/drive/folders/root-validation','Pasta de teste','{"preservar":"original"}')`, [id, tenant, id])
    process.env.GOOGLE_DRIVE_INVENTORY_DIR = join(directory, 'inventory')
    const client = getGoogleWorkspaceClient()
    const originalFetch = client.googleFetch
    const calls: string[] = []
    client.googleFetch = (async (_actor: unknown, url: string) => {
      const page = new URL(url).searchParams.get('pageToken') || 'first'
      calls.push(page)
      return page === 'first'
        ? { files: [{ id: 'file-a', name: 'a.pdf', mimeType: 'application/pdf' }], nextPageToken: 'second' }
        : { files: [{ id: 'file-b', name: 'b.pdf', mimeType: 'application/pdf' }] }
    }) as typeof client.googleFetch
    const actor = { tenantId: tenant, userId: 'test', userName: 'Teste', role: 'admin' }
    try {
      const partial = await new GoogleDriveService().listClientFiles({ actor, clientId: id, limit: 1 })
      assert.equal(partial.truncated, true)
      await rm(process.env.GOOGLE_DRIVE_INVENTORY_DIR, { recursive: true, force: true })
      const complete = await new GoogleDriveService().listClientFiles({ actor, clientId: id })
      assert.equal(complete.status, 'complete'); assert.equal(complete.files.length, 2)
      assert.deepEqual(calls, ['first', 'second'])
      assert.equal((await new GoogleDriveService().listClientFiles({ actor, clientId: id })).cached, true)
      assert.equal(calls.length, 2)
      const metadata = (await getPool().query('SELECT metadata FROM client_google_drive_folder WHERE id = $1', [id])).rows[0].metadata
      assert.equal(metadata.preservar, 'original')
      assert.equal(metadata.inventory.files.length, 2)
    } finally { client.googleFetch = originalFetch }
  })
} finally {
  await closeDb()
  await rm(directory, { recursive: true, force: true })
}
const report = { database, generatedAt: new Date().toISOString(), externalMessagesSent: 0, results }
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2))
console.info(JSON.stringify(report, null, 2))
if (results.some(result => !result.passed)) process.exitCode = 1
