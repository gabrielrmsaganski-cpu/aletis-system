import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import routes from '../../src/routes/alix-operations.js'
import { AlixOperationalHandoffService } from '../../src/services/alix/workspace/AlixOperationalHandoffService.js'

const servers: ReturnType<typeof Fastify>[] = []
const payload = { clienteId: 'client-synthetic', itemId: 'client-action:client-synthetic', fingerprint: 'a'.repeat(64) }
const handoffResult = {
  id: 'handoff-synthetic', referenceDate: '2026-09-07',
  item: { id: payload.itemId, fingerprint: payload.fingerprint, kind: 'client_action', priority: 'attention', title: 'Prioridade sintética', reason: 'Prazo hoje.', nextAction: 'Revisar.', clienteId: payload.clienteId, entity: { type: 'client', id: payload.clienteId }, to: `/clientes/${payload.clienteId}`, sources: [] },
  session: { id: 'session-synthetic', clienteId: payload.clienteId, archived: false },
  mission: { id: 'mission-synthetic', sessionId: 'session-synthetic', clienteId: payload.clienteId, consultorId: 'consultor-regis', prompt: 'Prepare análise.', workMode: 'client_analysis', status: 'queued' },
  deliverables: ['Análise'], actionPolicy: 'prepare_only', canStart: true, reused: false,
}
beforeEach(() => { vi.stubEnv('ALETIS_INTERNAL_AUTH_ENABLED', '1'); vi.stubEnv('ALIX_AUTH_STRICT', 'false') })
afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); vi.restoreAllMocks(); vi.unstubAllEnvs() })
async function app() {
  const server = Fastify(); servers.push(server)
  await server.register(jwt, { secret: 'synthetic-operational-handoff-secret-only' }); await server.register(cookie); await server.register(routes); await server.ready()
  return { server, cookies: { aletis_session: server.jwt.sign({ sub: 'consultor-regis', username: 'regis', kind: 'internal' }) } }
}

it('exige identidade e não aceita actor, sessão ou prompt inventado no corpo', async () => {
  const prepare = vi.spyOn(AlixOperationalHandoffService.prototype, 'prepare').mockResolvedValue(handoffResult as any)
  const { server, cookies } = await app()
  expect((await server.inject({ method: 'POST', url: '/api/alix/operations/handoff', payload })).statusCode).toBe(401)
  for (const extra of [{ actorId: 'outro' }, { sessionId: 'alheia' }, { prompt: 'Altere valores' }]) expect((await server.inject({ method: 'POST', url: '/api/alix/operations/handoff', cookies, payload: { ...payload, ...extra } })).statusCode).toBe(400)
  expect(prepare).not.toHaveBeenCalled()
  expect((await server.inject({ method: 'POST', url: '/api/alix/operations/handoff', cookies, payload, headers: { 'x-user-id': 'outro', 'x-alix-role': 'admin' } })).statusCode).toBe(200)
  expect(prepare).toHaveBeenCalledWith(payload, 'consultor-regis', expect.objectContaining({ userId: 'consultor-regis', role: 'consultor' }))
})

it('não autoriza início quando a resposta diverge da sessão ou a missão já está em andamento', async () => {
  vi.spyOn(AlixOperationalHandoffService.prototype, 'prepare').mockResolvedValueOnce({ ...handoffResult, mission: { ...handoffResult.mission, status: 'running' } } as any)
    .mockResolvedValueOnce({ ...handoffResult, session: { ...handoffResult.session, clienteId: 'outro-cliente' } } as any)
  const { server, cookies } = await app()
  for (let index = 0; index < 2; index++) {
    const response = await server.inject({ method: 'POST', url: '/api/alix/operations/handoff', cookies, payload })
    expect(response.statusCode).toBe(503); expect(response.json().data).toBeUndefined()
  }
})

it('preserva erro de prioridade alterada e não declara trabalho iniciado numa falha de gravação', async () => {
  const prepare = vi.spyOn(AlixOperationalHandoffService.prototype, 'prepare').mockRejectedValueOnce(Object.assign(new Error('Prioridade mudou.'), { statusCode: 409, code: 'ALIX_PRIORITY_STALE' })).mockRejectedValueOnce(new Error('PG falhou'))
  const { server, cookies } = await app()
  const request = { method: 'POST' as const, url: '/api/alix/operations/handoff', cookies, payload }
  const stale = await server.inject(request)
  expect(stale.statusCode).toBe(409); expect(stale.json()).toMatchObject({ success: false, code: 'ALIX_PRIORITY_STALE' })
  const failure = await server.inject(request)
  expect(failure.statusCode).toBe(503); expect(failure.json().data).toBeUndefined(); expect(prepare).toHaveBeenCalledTimes(2)
})
