import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn() }))
vi.mock('../../src/db/client.js', () => ({ isPgEnabled: () => true, getDb: () => ({ insert: mocks.insert, select: mocks.select }) }))
import { getSessionAccess, getSessionsAccess, upsertSession } from '../../src/db/AlixSessionRepository.js'

beforeEach(() => { mocks.insert.mockReset(); mocks.select.mockReset() })
afterEach(() => vi.restoreAllMocks())

it('opção strict propaga falha de PG; caminho histórico best-effort continua compatível', async () => {
  mocks.insert.mockImplementation(() => { throw new Error('PG indisponível') })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  await expect(upsertSession({ id: 'new', consultorId: 'user' }, { strict: true })).rejects.toThrow('PG indisponível')
  await expect(upsertSession({ id: 'historical' })).resolves.toBeUndefined()
})

it('consulta de autorização nunca usa JSON/cache quando PG falha, nem no lote', async () => {
  mocks.select.mockImplementation(() => { throw new Error('PG indisponível') })
  await expect(getSessionAccess('legacy')).rejects.toThrow('PG indisponível')
  await expect(getSessionsAccess(['own', 'legacy'])).rejects.toThrow('PG indisponível')
  expect(await getSessionAccess('../outro')).toBeNull()
})

it('lista de autoria faz uma consulta de PG e elimina IDs repetidos/inválidos', async () => {
  const where = vi.fn(async () => [{ id: 'legacy', consultorId: null, clienteId: null }])
  mocks.select.mockReturnValue({ from: () => ({ where }) })
  expect(await getSessionsAccess(['legacy', 'legacy', '../outro'])).toEqual([{ id: 'legacy', consultorId: undefined, clienteId: undefined }])
  expect(mocks.select).toHaveBeenCalledTimes(1)
  expect(where).toHaveBeenCalledTimes(1)
})

it('troca de dono recusada pelo PG não vira sucesso best-effort', async () => {
  mocks.insert.mockReturnValue({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [] }) }) })
  await expect(upsertSession({ id: 'own', consultorId: 'outro' })).rejects.toMatchObject({ code: 'ALIX_SESSION_OWNER_CONFLICT', statusCode: 409 })
})
