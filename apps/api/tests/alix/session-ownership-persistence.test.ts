import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), ensure: vi.fn() }))
vi.mock('../../src/db/AlixSessionRepository.js', () => ({ upsertSession: mocks.upsert, ensureSession: mocks.ensure, getSession: async () => null, listSessions: async () => [] }))
import { AlixService } from '../../src/services/AlixService.js'

let directory: string
let service: AlixService
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'alix-owned-session-'))
  service = new AlixService({} as any, directory)
  mocks.upsert.mockReset().mockResolvedValue(undefined)
  mocks.ensure.mockReset().mockResolvedValue(undefined)
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

it('sessão nova espera confirmação PG forte antes de publicar cache e dono', async () => {
  let release!: () => void
  mocks.upsert.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  const creating = service.createSession('Revisão Drive', 'consultor-fixture')
  await vi.waitFor(() => expect(mocks.upsert).toHaveBeenCalled())
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ consultorId: 'consultor-fixture' }), { strict: true })
  expect(await readdir(directory)).toEqual([])
  expect(await service.listSessions()).toEqual([])
  release()
  const created = await creating
  expect(JSON.parse(await readFile(join(directory, `${created.id}.json`), 'utf8')).consultorId).toBe('consultor-fixture')
})

it('falha na criação não retorna sucesso nem deixa sessão nova somente no cache', async () => {
  mocks.upsert.mockRejectedValueOnce(new Error('PG indisponível'))
  await expect(service.createSession('Teste', 'consultor-fixture')).rejects.toThrow('PG indisponível')
  expect(await service.listSessions()).toEqual([])
  expect(await readdir(directory)).toEqual([])
})

it('contexto estrito que falha conserva cliente anterior no cache e em disco', async () => {
  const created = await service.createSession('Revisão Drive', 'consultor-fixture')
  await service.updateSession(created.id, { clienteId: 'cliente-a' }, { strict: true })
  mocks.upsert.mockRejectedValueOnce(new Error('PG indisponível'))
  await expect(service.updateSession(created.id, { clienteId: 'cliente-b' }, { strict: true })).rejects.toThrow('PG indisponível')
  expect((await service.getSession(created.id))?.clienteId).toBe('cliente-a')
  expect(JSON.parse(await readFile(join(directory, `${created.id}.json`), 'utf8')).clienteId).toBe('cliente-a')
})

it('dono devolvido pelo PG é preservado também no JSON de escritor antigo', async () => {
  mocks.upsert.mockResolvedValueOnce({ id: 'ignored', consultorId: 'owner-from-pg' })
  const created = await service.createSession('Histórico')
  expect(created.consultorId).toBe('owner-from-pg')
  expect(JSON.parse(await readFile(join(directory, `${created.id}.json`), 'utf8')).consultorId).toBe('owner-from-pg')
})

it('retry idempotente conserva o histórico existente sem reaplicar título ou contexto', async () => {
  const created = await service.ensureSession('drive-retry', 'Título inicial', 'owner-a', 'cliente-a')
  await service.updateSession(created.id, { title: 'Título revisado' }, { strict: true })
  const retry = await service.ensureSession(created.id, 'Título inicial', 'owner-a', 'cliente-a')
  expect(retry.title).toBe('Título revisado')
  expect(retry.createdAt).toBe(created.createdAt)
  expect((await readdir(directory)).filter(file => file.endsWith('.json'))).toEqual(['drive-retry.json'])
})

it('sessão idempotente não se apropria de dono/cliente diferente em arquivo existente', async () => {
  await service.ensureSession('drive-scope', 'Original', 'owner-a', 'cliente-a')
  await expect(service.ensureSession('drive-scope', 'Outro', 'owner-b', 'cliente-a')).rejects.toMatchObject({ statusCode: 409 })
  await expect(service.ensureSession('drive-scope', 'Outro', 'owner-a', 'cliente-b')).rejects.toMatchObject({ statusCode: 409 })
  expect(JSON.parse(await readFile(join(directory, 'drive-scope.json'), 'utf8'))).toMatchObject({ title: 'Original', consultorId: 'owner-a', clienteId: 'cliente-a' })
})

it('retry idempotente usa histórico PG autoritativo sem retornar cache divergente', async () => {
  await service.ensureSession('drive-authoritative', 'Cache antigo', 'owner-a', 'cliente-a')
  const saved = { id: 'drive-authoritative', title: 'Título do banco', consultorId: 'owner-a', clienteId: 'cliente-a', createdAt: 1, updatedAt: 2,
    messages: [{ id: 'message-existing', role: 'assistant', content: 'Evidência já produzida.', timestamp: 2 }] }
  mocks.ensure.mockResolvedValueOnce(saved)
  expect(await service.ensureSession(saved.id, 'Novo título', 'owner-a', 'cliente-a')).toEqual(saved)
  expect(mocks.upsert).not.toHaveBeenCalled()
})

it('falha PG na criação idempotente não cria fallback local nem expõe sessão', async () => {
  mocks.ensure.mockRejectedValueOnce(new Error('PG indisponível'))
  await expect(service.ensureSession('drive-failed', 'Teste', 'owner-a', 'cliente-a')).rejects.toThrow('PG indisponível')
  expect(await readdir(directory)).toEqual([])
  expect(await service.listSessions()).toEqual([])
})
