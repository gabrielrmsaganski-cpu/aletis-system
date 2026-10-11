import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { DataSourceManager } from '../../src/services/DataSourceManager.js'
const fixture = vi.hoisted(() => ({ store: null as unknown, llm: vi.fn() }))
vi.mock('../../src/services/alix/AlixConfirmationStore.js', async importOriginal => ({
  ...await importOriginal<object>(), getAlixConfirmationStore: () => fixture.store,
}))
vi.mock('../../src/db/AlixConfirmationFeedbackRepository.js', () => ({ dumpConfirmations: async () => ({ written: 0 }) }))
vi.mock('../../src/services/llm/OpenAIClient.js', () => ({ isOpenAIEnabled: () => true, generateWithTools: fixture.llm, generateStructured: vi.fn(), generateText: vi.fn() }))
import { AlixConfirmationStore } from '../../src/services/alix/AlixConfirmationStore.js'
import { AlixService } from '../../src/services/AlixService.js'
import { getAlixTurnContext } from '../../src/services/alix/AlixTurnContext.js'
let directory: string
let store: AlixConfirmationStore
let service: AlixService
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'aletis-legacy-confirm-'))
  vi.stubEnv('ALIX_STORAGE_DIR', directory)
  vi.stubEnv('ALETIS_PG_ENABLED', '0')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rede proibida neste teste') }))
  store = new AlixConfirmationStore(); fixture.store = store
  service = new AlixService({} as DataSourceManager, join(directory, 'sessions'))
  fixture.llm.mockClear()
})
afterEach(async () => {
  store.dispose()
  await new Promise(resolve => setImmediate(resolve))
  await rm(directory, { recursive: true, force: true })
  vi.unstubAllEnvs(); vi.unstubAllGlobals()
})
it('chat legado não executa confirmação de outra sessão nem interpreta confirmação com LLM', async () => {
  const session = await service.createSession('Fixture', 'consultor-fixture')
  const pending = store.create('atualizar_proposta', 'Atualizar proposta', { id: 'prop-fixture' }, 'outra-sessao')
  const execute = vi.fn(async () => ({ atualizado: true }))
  vi.spyOn(service, 'getExecutor').mockReturnValue(execute)
  const generic = await service.chat(session.id, 'confirmo', { clienteId: 'cliente-fixture' })
  const explicit = await service.chat(session.id, `confirmo ${pending.id}`, { clienteId: 'cliente-fixture' })
  expect(generic.reply.metadata).toMatchObject({ executed: false, reason: 'no_pending_in_context' })
  expect(explicit.reply.metadata).toMatchObject({ executed: false })
  expect(execute).not.toHaveBeenCalled(); expect(fixture.llm).not.toHaveBeenCalled()
  expect(store.get(pending.id)).toBeTruthy()
})
it('chat legado conserva recibo, ator verificado e IDs do fechamento no retry', async () => {
  const session = await service.createSession('Fixture', 'consultor-fixture')
  const pending = store.create('atualizar_proposta', 'Aceitar proposta', { id: 'prop-fixture' }, session.id)
  const execute = vi.fn(async () => {
    expect(getAlixTurnContext()?.actor).toEqual({ id: 'consultor-fixture', nome: 'Consultor teste' })
    return { atualizado: true, vinculos: { contratoId: 'ctr-fixture', negociacaoId: 'neg-fixture' } }
  })
  vi.spyOn(service, 'getExecutor').mockReturnValue(execute)
  const options = { clienteId: 'cliente-fixture', actor: { id: 'consultor-fixture', nome: 'Consultor teste' } }
  const first = await service.chat(session.id, `confirmo ${pending.id}`, options)
  const second = await service.chat(session.id, `confirmo ${pending.id}`, options)
  expect(first.reply.metadata).toMatchObject({ executed: true, result: { vinculos: { contratoId: 'ctr-fixture' } } })
  expect(second.reply.metadata).toEqual(first.reply.metadata)
  expect(execute).toHaveBeenCalledOnce(); expect(fixture.llm).not.toHaveBeenCalled()
})
