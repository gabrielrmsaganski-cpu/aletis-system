import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { resolveInternalSession } from '../lib/internal-auth.js'
import { clientes } from './clientes.js'
import { simulationDraftSchema } from '../services/simulations/SimulationSchemas.js'
import {
  getSimulationWorkspaceService,
  SimulationDomainError,
  type SimulationDraft,
} from '../services/simulations/SimulationWorkspaceService.js'

const draftSchema = simulationDraftSchema

const createSchema = z.object({
  title: z.string().trim().min(1).max(200).default('Simulação financeira'),
  clientId: z.string().trim().optional(),
  caseId: z.string().trim().optional(),
  creditorId: z.string().trim().optional(),
  debtId: z.string().trim().optional(),
  officeId: z.string().trim().optional(),
  draft: draftSchema,
}).strict()

const updateSchema = createSchema.omit({ officeId: true }).partial().extend({ draft: draftSchema, expectedUpdatedAt: z.string().datetime() })
const registerSchema = z.object({ expectedUpdatedAt: z.string().datetime() }).strict()

function organizationId(request: FastifyRequest): string {
  // A sessão interna atual pertence à ALETIS; cabeçalhos do navegador não
  // concedem acesso a outra organização.
  void request
  return 'org-aletis'
}

function actor(fastify: FastifyInstance, request: FastifyRequest): string {
  return resolveInternalSession(fastify, request)?.id ?? 'system'
}

function ensureClient(clientId?: string): void {
  if (clientId && !clientes.has(clientId)) {
    throw new SimulationDomainError('Selecione um cliente existente no CRM.', 404, 'CLIENT_NOT_FOUND')
  }
}

function sendError(reply: any, error: unknown) {
  const domain = error instanceof SimulationDomainError
    ? error
    : new SimulationDomainError((error as Error).message || 'Falha ao persistir a simulação.', 500, 'SIMULATION_PERSISTENCE_ERROR')
  return reply.status(domain.statusCode).send({ success: false, error: domain.message, code: domain.code })
}

export default async function simulationRoutes(fastify: FastifyInstance): Promise<void> {
  const service = getSimulationWorkspaceService()

  fastify.get<{ Querystring: { clientId?: string; caseId?: string } }>('/api/simulations', async (request, reply) => {
    try {
      const data = await service.list(organizationId(request), request.query)
      return reply.send({ success: true, data })
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post<{ Body: unknown }>('/api/simulations', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.issues.map((item) => item.message).join('; '), code: 'INVALID_INPUT' })
    try {
      ensureClient(parsed.data.clientId)
      const userId = actor(fastify, request)
      const result = await service.create({
        ...parsed.data,
        draft: parsed.data.draft as unknown as SimulationDraft,
        organizationId: organizationId(request),
        userId: userId === 'system' ? undefined : userId,
        idempotencyKey: String(request.headers['idempotency-key'] ?? '').trim() || undefined,
      })
      return reply.status(result.reused ? 200 : 201).send({ success: true, data: result.record, reused: result.reused })
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get<{ Params: { id: string } }>('/api/simulations/:id', async (request, reply) => {
    try {
      const data = await service.get(request.params.id, organizationId(request))
      return data
        ? reply.send({ success: true, data })
        : reply.status(404).send({ success: false, error: 'Simulação não encontrada.', code: 'SIMULATION_NOT_FOUND' })
    } catch (error) { return sendError(reply, error) }
  })

  fastify.put<{ Params: { id: string }; Body: unknown }>('/api/simulations/:id/draft', async (request, reply) => {
    if (!(request.body as any)?.expectedUpdatedAt) return reply.status(428).send({ success: false, error: 'Recarregue a simulação antes de salvar.', code: 'SIMULATION_VERSION_REQUIRED' })
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.issues.map((item) => item.message).join('; '), code: 'INVALID_INPUT' })
    try {
      ensureClient(parsed.data.clientId)
      const data = await service.updateDraft(
        request.params.id,
        organizationId(request),
        { ...parsed.data, draft: parsed.data.draft as unknown as SimulationDraft },
        actor(fastify, request),
      )
      return reply.send({ success: true, data })
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post<{ Params: { id: string }; Body: unknown }>('/api/simulations/:id/register', async (request, reply) => {
    if (!(request.body as any)?.expectedUpdatedAt) return reply.status(428).send({ success: false, error: 'Recarregue a simulação antes de registrar.', code: 'SIMULATION_VERSION_REQUIRED' })
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ success: false, error: 'Versão de origem inválida.', code: 'INVALID_INPUT' })
    try {
      const result = await service.register(request.params.id, organizationId(request), actor(fastify, request), parsed.data.expectedUpdatedAt)
      return reply.status(201).send({
        success: true,
        data: {
          workspace: result.workspace,
          snapshot: { id: result.snapshot.id, version: result.snapshot.version, createdAt: result.snapshot.createdAt, sourceSnapshot: result.snapshot.sourceSnapshot, blocos: result.snapshot.output.blocos },
        },
      })
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get<{ Params: { id: string } }>('/api/simulations/:id/snapshots', async (request, reply) => {
    try {
      const data = await service.listSnapshots(request.params.id, organizationId(request))
      return reply.send({ success: true, data })
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post<{ Params: { id: string } }>('/api/simulations/:id/duplicate', async (request, reply) => {
    try {
      const data = await service.duplicate(request.params.id, organizationId(request), actor(fastify, request))
      return reply.status(201).send({ success: true, data })
    } catch (error) { return sendError(reply, error) }
  })
}
