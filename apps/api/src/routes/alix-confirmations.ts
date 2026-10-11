import { withAlixTurnContext } from '../services/alix/AlixTurnContext.js';
import { confirmationMatchesScope, confirmationReceiptView } from '../services/alix/ConfirmationChat.js';
// ============================================================
// ALETIS — Alix Confirmations Routes (Wave 6 — HITL)
// Endpoints para aprovar/rejeitar/listar intents de executor
// registrados pelos handlers mutation-capable do AlixService.
//
// Contrato
// ────────
//   GET    /api/alix/confirmations            → lista pendentes
//   GET    /api/alix/confirmations/:id        → detalhe
//   POST   /api/alix/confirmations/:id/approve → executa e devolve resultado
//   POST   /api/alix/confirmations/:id/reject  → descarta (204)
//
// Segurança
// ─────────
// O executor real é resolvido via `AlixService.getExecutor(toolName)`.
// Se não houver executor registrado, responde 500 com
// `executor_not_registered`. O intent é `consume()`-ido (removido)
// ANTES da execução para evitar double-fire.
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { join } from 'path';
import { applyAlixAuth } from '../middleware/alixAuth.js';
import { alixAccessError, assertAlixSessionAccess, filterAlixSessionResources, isAlixAccessEnforced, isAlixAdmin } from '../services/alix/AlixAccessService.js';
import { DataSourceManager } from '../services/DataSourceManager.js';
import { AlixService } from '../services/AlixService.js';
import {
  getAlixConfirmationStore,
  type ConfirmationBatch,
  type PendingConfirmationWithDeps,
} from '../services/alix/AlixConfirmationStore.js';

// ── Singleton auxiliar ───────────────────────────────────────
// Precisamos de uma referência à AlixService para chamar
// `getExecutor(...)`. Como `routes/alix.ts` mantém seu próprio
// singleton interno (sem export), instanciamos aqui nosso próprio
// objeto. Os executors delegam para serviços que JÁ são singletons
// globais (CusteioService.getInstance(), DossieRepository, storage
// de arquivo) — então múltiplas instâncias de AlixService compartilham
// o mesmo estado persistido.

let _alixForExecutors: AlixService | null = null;

function getAlixServiceForExecutors(): AlixService {
  if (_alixForExecutors) return _alixForExecutors;
  const dsm = DataSourceManager.getInstance();
  const storageDir = join(process.cwd(), 'storage', 'alix-sessions');
  _alixForExecutors = new AlixService(dsm, storageDir);
  return _alixForExecutors;
}

type PublicPendingStatus = 'pending' | 'applying' | 'applied' | 'failed' | 'skipped';

interface PublicPendingConfirmation {
  id: string;
  toolName: string;
  description: string;
  createdAt: string;
  expiresAt: string;
  sessionId?: string;
  clienteId?: string;
  contextClienteId?: string | null;
  batchId?: string;
  dependsOn?: string[];
  status: PublicPendingStatus;
  error?: string;
  riskLevel: 'standard' | 'high' | 'critical';
  approvalsRequired: 1 | 2;
  approvalStep: 0 | 1;
}

interface PublicConfirmationBatch {
  batchId: string;
  sessionId: string;
  title: string;
  status: ConfirmationBatch['status'];
  createdAt: string;
  updatedAt: string;
  pendingCount: number;
  pendings: PublicPendingConfirmation[];
  approvalStep: 0 | 1;
}

function publicPending(
  p: PendingConfirmationWithDeps,
  status: PublicPendingStatus = 'pending',
  error?: string,
): PublicPendingConfirmation {
  return {
    id: p.id,
    toolName: p.toolName,
    description: p.description,
    createdAt: new Date(p.createdAt).toISOString(),
    expiresAt: new Date(p.expiresAt).toISOString(),
    sessionId: p.sessionId,
    clienteId: typeof p.payload.clienteId === 'string' ? p.payload.clienteId : p.contextClienteId || undefined,
    contextClienteId: p.contextClienteId,
    batchId: p.batchId,
    dependsOn: p.dependsOn,
    status,
    error,
    riskLevel: p.riskLevel,
    approvalsRequired: p.approvalsRequired,
    approvalStep: p.approvalStep,
  };
}

function publicBatch(batch: ConfirmationBatch): PublicConfirmationBatch {
  const statusById = new Map<string, { status: PublicPendingStatus; error?: string }>();

  for (const r of batch.results?.applied ?? []) {
    statusById.set(r.confirmationId, { status: 'applied' });
  }
  for (const r of batch.results?.failed ?? []) {
    statusById.set(r.confirmationId, { status: 'failed', error: r.error });
  }
  for (const r of batch.results?.skipped ?? []) {
    statusById.set(r.confirmationId, { status: 'skipped', error: r.reason });
  }

  return {
    batchId: batch.batchId,
    sessionId: batch.sessionId,
    title: batch.title,
    status: batch.status,
    createdAt: new Date(batch.createdAt).toISOString(),
    updatedAt: new Date(batch.updatedAt).toISOString(),
    pendingCount: batch.pendings.length,
    approvalStep: batch.approvalStep ?? 0,
    pendings: batch.pendings.map((p) => {
      const resolved = statusById.get(p.id);
      return publicPending(
        p,
        resolved?.status ?? (batch.status === 'applying' ? 'applying' : 'pending'),
        resolved?.error,
      );
    }),
  };
}

export default async function alixConfirmationsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  applyAlixAuth(fastify);
  const store = getAlixConfirmationStore();

  // Resolve o dono e o contexto no servidor antes de consumir autorizações.
  fastify.addHook('preHandler', async (request) => {
    if (!isAlixAccessEnforced(request.alixUser)) return;
    const params = request.params as { id?: string; batchId?: string };
    const path = request.routeOptions.url || '';
    const batch = params.batchId ? store.getBatch(params.batchId) : undefined;
    const pending = params.id ? store.getExecution(params.id)?.confirmation || store.get(params.id) : undefined;
    const resources = batch ? batch.pendings : pending ? [pending] : [];
    if ((params.batchId && !batch) || (params.id && !pending)) return; // O handler mantém seu 404 habitual.
    const sessionId = batch?.sessionId || pending?.sessionId;
    if (!sessionId) {
      if ((params.id || params.batchId) && !isAlixAdmin(request.alixUser)) {
        throw alixAccessError(404, 'Confirmação não encontrada ou indisponível para este usuário.');
      }
      return;
    }
    const session = await assertAlixSessionAccess(request.alixUser, sessionId);
    if (path.endsWith('/approve') || path.endsWith('/apply')) {
      const body = request.body as { sessionId?: unknown; clienteId?: unknown } | undefined;
      if ((body?.sessionId !== undefined && body.sessionId !== session.id) || (body?.clienteId !== undefined && body.clienteId !== session.clienteId)) {
        throw alixAccessError(409, 'O contexto informado não corresponde à conversa atual.');
      }
      if (resources.some(resource => !confirmationMatchesScope(resource, { sessionId: session.id, clienteId: session.clienteId }))) {
        throw alixAccessError(409, 'A conversa mudou de contexto desde o preparo. Revise a ação antes de executá-la.');
      }
    }
  });

  const actorId = (request: FastifyRequest): string =>
    request.alixUser?.id || request.alixUser?.sub || 'anonymous';

  // ── GET /api/alix/confirmations ─────────────────────────
  fastify.get(
    '/api/alix/confirmations',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const visible = await filterAlixSessionResources(request.alixUser, store.listActive());
      const items = visible.map((c) =>
        publicPending(c as PendingConfirmationWithDeps),
      );
      return reply
        .status(200)
        .send({ success: true, data: items, total: items.length });
    },
  );

  // ── GET /api/alix/confirmations/:id ─────────────────────
  fastify.get(
    '/api/alix/confirmations/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const entry = store.get(id);
      if (!entry) {
        const execution = store.getExecution(id);
        if (execution) {
          const view = confirmationReceiptView(execution);
          return reply.send({ success: true, data: { ...execution.confirmation, ...view.metadata, message: view.reply } });
        }
        return reply
          .status(404)
          .send({ success: false, error: 'Confirmação não encontrada ou expirada' });
      }
      return reply.status(200).send({
        success: true,
        data: {
          id: entry.id,
          toolName: entry.toolName,
          description: entry.description,
          payload: entry.payload,
          createdAt: new Date(entry.createdAt).toISOString(),
          expiresAt: new Date(entry.expiresAt).toISOString(),
          sessionId: entry.sessionId,
          riskLevel: entry.riskLevel,
          approvalsRequired: entry.approvalsRequired,
          approvalStep: entry.approvalStep,
        },
      });
    },
  );

  // ── POST /api/alix/confirmations/:id/approve ────────────
  fastify.post(
    '/api/alix/confirmations/:id/approve',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { challenge?: string; sessionId?: string; clienteId?: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const previous = store.getExecution(id);
      const pending = previous?.confirmation || store.get(id);
      if (pending && request.body?.sessionId && !confirmationMatchesScope(pending, { sessionId: request.body.sessionId, clienteId: request.body.clienteId })) {
        return reply.status(409).send({ success: false, error: 'A confirmação pertence a outro contexto de conversa ou cliente.' });
      }
      if (previous) {
        const view = confirmationReceiptView(previous);
        return reply.status(previous.status === 'running' ? 202 : previous.status === 'completed' ? 200 : 409).send({
          success: previous.status === 'completed' || previous.status === 'running',
          data: { id, toolName: pending?.toolName, description: pending?.description, ...view.metadata, message: view.reply, replay: true },
          ...(previous.error ? { error: previous.error } : {}),
        });
      }
      const availableExecutor = pending ? getAlixServiceForExecutors().getExecutor(pending.toolName) : null;
      if (pending && !availableExecutor) return reply.status(503).send({ success: false, error: 'Executor indisponível; a confirmação continua pendente.', code: 'executor_not_registered' });
      const authorization = store.authorize(id, {
        actorId: actorId(request),
        challenge: request.body?.challenge,
        deferConsumption: true,
      });
      if (authorization.status === 'not_found') {
        return reply.status(404).send({
          success: false,
          error: 'Confirmação não encontrada, expirada ou já consumida',
        });
      }
      if (authorization.status === 'invalid_challenge') {
        return reply.status(409).send({
          success: false,
          error: 'A segunda confirmação não corresponde ao desafio ativo.',
          code: 'SECOND_APPROVAL_INVALID',
        });
      }
      if (authorization.status === 'awaiting_second_approval') {
        const { getAlixGovernanceService } = await import('../services/alix/governance/AlixGovernanceService.js');
        await getAlixGovernanceService().recordApproval({
          confirmationId: id,
          actorId: actorId(request),
          approvalStep: 1,
          decision: 'approved',
          riskLevel: authorization.confirmation.riskLevel,
          toolName: authorization.confirmation.toolName,
          details: { awaitingSecondApproval: true },
        }).catch(() => undefined);
        return reply.status(202).send({
          success: true,
          data: {
            id,
            toolName: authorization.confirmation.toolName,
            status: 'awaiting_second_approval',
            challenge: authorization.challenge,
            riskLevel: authorization.confirmation.riskLevel,
            approvalsRequired: 2,
            message: 'Revise novamente o impacto e confirme uma segunda vez para executar.',
          },
        });
      }
      const entry = authorization.confirmation;
      const governance = (await import('../services/alix/governance/AlixGovernanceService.js')).getAlixGovernanceService();
      await governance.recordApproval({
        confirmationId: entry.id,
        actorId: actorId(request),
        approvalStep: entry.approvalsRequired,
        decision: 'approved',
        riskLevel: entry.riskLevel,
        toolName: entry.toolName,
      }).catch(() => undefined);
      const alix = getAlixServiceForExecutors();
      const executor = alix.getExecutor(entry.toolName);
      if (!executor) {
        request.log.error(
          { toolName: entry.toolName, id: entry.id },
          '[AlixConfirmations] executor não registrado',
        );
        return reply.status(500).send({
          success: false,
          error: 'Executor não registrado para esta tool',
          code: 'executor_not_registered',
          toolName: entry.toolName,
        });
      }
      try {
        const execution = await withAlixTurnContext({ sessionId: entry.sessionId || '', clienteId: entry.contextClienteId || undefined, actor: { id: actorId(request), nome: request.alixUser?.nome } }, () => store.executeOnce(entry, executor));
        const receipt = confirmationReceiptView(execution);
        if (execution.status !== 'completed') return reply.status(execution.status === 'running' ? 202 : 409).send({
          success: execution.status === 'running',
          error: execution.error,
          data: { id: entry.id, toolName: entry.toolName, description: entry.description, ...receipt.metadata, message: receipt.reply },
        });
        const result = execution.result;
        await governance.recordApproval({
          confirmationId: entry.id,
          actorId: actorId(request),
          approvalStep: entry.approvalsRequired,
          decision: 'executed',
          riskLevel: entry.riskLevel,
          toolName: entry.toolName,
          details: { executedAt: new Date().toISOString() },
        }).catch(() => undefined);
        const suggestionId = typeof entry.payload._governanceSuggestionId === 'string'
          ? entry.payload._governanceSuggestionId
          : undefined;
        if (suggestionId) {
          await governance.markSuggestionExecuted(suggestionId, {
            actorId: actorId(request),
            status: 'executed',
            details: { confirmationId: entry.id, toolName: entry.toolName },
          });
        }
        return reply.status(200).send({
          success: true,
          data: {
            id: entry.id,
            toolName: entry.toolName,
            description: entry.description,
            result,
            executedAt: execution.finishedAt,
            ...receipt.metadata,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido';
        request.log.error(
          { err, toolName: entry.toolName, id: entry.id },
          '[AlixConfirmations] execução falhou',
        );
        await governance.recordApproval({
          confirmationId: entry.id,
          actorId: actorId(request),
          approvalStep: entry.approvalsRequired,
          decision: 'failed',
          riskLevel: entry.riskLevel,
          toolName: entry.toolName,
          details: { error: msg },
        }).catch(() => undefined);
        if (typeof entry.payload._governanceSuggestionId === 'string') {
          await governance.markSuggestionExecuted(entry.payload._governanceSuggestionId, {
            actorId: actorId(request), status: 'failed', details: { confirmationId: entry.id, error: msg },
          });
        }
        return reply.status(500).send({
          success: false,
          error: 'Falha ao executar confirmação',
          detalhes: msg,
          toolName: entry.toolName,
        });
      }
    },
  );

  // ── POST /api/alix/confirmations/:id/reject ─────────────
  fastify.post(
    '/api/alix/confirmations/:id/reject',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const entry = store.consume(id);
      if (!entry) {
        return reply.status(404).send({
          success: false,
          error: 'Confirmação não encontrada ou já consumida',
        });
      }
      const { getAlixGovernanceService } = await import('../services/alix/governance/AlixGovernanceService.js');
      await getAlixGovernanceService().recordApproval({
        confirmationId: entry.id,
        actorId: actorId(request),
        approvalStep: Math.max(1, entry.approvalStep),
        decision: 'rejected',
        riskLevel: entry.riskLevel,
        toolName: entry.toolName,
      }).catch(() => undefined);
      return reply.status(200).send({
        success: true,
        data: { id: entry.id, toolName: entry.toolName, status: 'rejected' },
      });
    },
  );

  // ── Alix Insano F4 — batch endpoints ─────────────────────

  // GET /batches
  fastify.get('/api/alix/confirmations/batches', async (req: FastifyRequest, reply: FastifyReply) => {
    const items = (await filterAlixSessionResources(req.alixUser, store.listBatches())).map(publicBatch);
    return reply.send({ success: true, data: items, total: items.length });
  });

  // GET /batch/:batchId
  fastify.get(
    '/api/alix/confirmations/batch/:batchId',
    async (req: FastifyRequest<{ Params: { batchId: string } }>, reply: FastifyReply) => {
      const batch = store.getBatch(req.params.batchId);
      if (!batch) return reply.status(404).send({ success: false, error: 'Batch não encontrado' });
      return reply.send({ success: true, data: publicBatch(batch) });
    },
  );

  // POST /batch/:batchId/apply
  fastify.post(
    '/api/alix/confirmations/batch/:batchId/apply',
    async (
      req: FastifyRequest<{ Params: { batchId: string }; Body: { only?: string[]; challenge?: string; sessionId?: string; clienteId?: string } }>,
      reply: FastifyReply,
    ) => {
      const batch = store.getBatch(req.params.batchId);
      if (!batch) return reply.status(404).send({ success: false, error: 'Batch não encontrado' });
      if (req.body?.sessionId && batch.pendings.some((pending) => !confirmationMatchesScope(pending, { sessionId: req.body.sessionId!, clienteId: req.body.clienteId }))) {
        return reply.status(409).send({ success: false, error: 'O lote contém ações de outro contexto de conversa ou cliente.' });
      }
      const authorization = store.authorizeBatch(req.params.batchId, {
        actorId: actorId(req),
        challenge: req.body?.challenge,
      });
      if (authorization.status === 'invalid_challenge') {
        return reply.status(409).send({ success: false, error: 'A segunda confirmação do batch é inválida.', code: 'SECOND_APPROVAL_INVALID' });
      }
      if (authorization.status === 'awaiting_second_approval') {
        const { getAlixGovernanceService } = await import('../services/alix/governance/AlixGovernanceService.js');
        const governance = getAlixGovernanceService();
        for (const pending of authorization.batch.pendings.filter((item) => item.approvalsRequired === 2)) {
          await governance.recordApproval({
            confirmationId: pending.id, batchId: authorization.batch.batchId,
            actorId: actorId(req), approvalStep: 1, decision: 'approved',
            riskLevel: pending.riskLevel, toolName: pending.toolName,
            details: { awaitingSecondApproval: true },
          }).catch(() => undefined);
        }
        return reply.status(202).send({
          success: true,
          data: {
            batchId: authorization.batch.batchId,
            status: 'awaiting_second_approval',
            challenge: authorization.challenge,
            message: 'O batch contém ações de alto impacto. Confirme uma segunda vez para executar.',
          },
        });
      }
      const alix = getAlixServiceForExecutors();
      try {
        const { getAlixGovernanceService } = await import('../services/alix/governance/AlixGovernanceService.js');
        const governance = getAlixGovernanceService();
        for (const pending of batch.pendings) {
          await governance.recordApproval({
            confirmationId: pending.id, batchId: batch.batchId, actorId: actorId(req),
            approvalStep: pending.approvalsRequired, decision: 'approved',
            riskLevel: pending.riskLevel, toolName: pending.toolName,
          }).catch(() => undefined);
        }
        const results = await store.applyBatch(req.params.batchId, async (p) => {
          const run = alix.getExecutor(p.toolName);
          if (!run) throw new Error(`Executor não registrado: ${p.toolName}`);
          return withAlixTurnContext({ sessionId: p.sessionId || batch.sessionId, clienteId: p.contextClienteId || undefined, actor: { id: actorId(req), nome: req.alixUser?.nome } }, () => run(p.payload));
        }, { only: req.body?.only });
        for (const applied of results.applied) {
          const pending = batch.pendings.find((item) => item.id === applied.confirmationId);
          if (!pending) continue;
          await governance.recordApproval({
            confirmationId: pending.id, batchId: batch.batchId, actorId: actorId(req),
            approvalStep: pending.approvalsRequired, decision: 'executed',
            riskLevel: pending.riskLevel, toolName: pending.toolName,
          }).catch(() => undefined);
          if (typeof pending.payload._governanceSuggestionId === 'string') {
            await governance.markSuggestionExecuted(pending.payload._governanceSuggestionId, {
              actorId: actorId(req), status: 'executed',
              details: { confirmationId: pending.id, batchId: batch.batchId, toolName: pending.toolName },
            });
          }
        }
        const updated = store.getBatch(req.params.batchId);
        return reply.send({
          success: true,
          data: {
            batchId: req.params.batchId,
            ...results,
            applied: results.applied.map((item) => {
              const receipt = store.getExecution(item.confirmationId);
              return { ...item, ...(receipt ? confirmationReceiptView(receipt).metadata : {}) };
            }),
            status: updated?.status,
            batch: updated ? publicBatch(updated) : undefined,
          },
        });
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message });
      }
    },
  );

  // POST /batch/:batchId/cancel
  fastify.post(
    '/api/alix/confirmations/batch/:batchId/cancel',
    async (req: FastifyRequest<{ Params: { batchId: string } }>, reply: FastifyReply) => {
      const batch = store.cancelBatch(req.params.batchId);
      if (!batch) return reply.status(404).send({ success: false, error: 'Batch não encontrado' });
      return reply.send({ success: true, data: { batchId: batch.batchId, status: batch.status, batch: publicBatch(batch) } });
    },
  );

  // GET /stream (SSE)
  fastify.get('/api/alix/confirmations/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const write = (ev: unknown) => reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
    write({ type: 'hello', ts: new Date().toISOString() });
    let closed = false;
    let delivery = Promise.resolve();
    const unsub = store.on((ev) => {
      // Mantém ordem dos eventos e filtra no servidor, inclusive após reconexão.
      delivery = delivery.then(async () => {
        if (closed) return;
        const resource = ev.type === 'pending:created' ? ev.confirmation
          : ev.type === 'batch:created' || ev.type === 'batch:done' ? ev.batch : store.getBatch(ev.batchId);
        if (resource && (await filterAlixSessionResources(request.alixUser, [resource])).length && !closed) write(ev);
      }).catch((error) => request.log.warn({ err: error }, 'Não foi possível autorizar evento de confirmação.'));
    });
    const keepalive = setInterval(() => reply.raw.write(': keepalive\n\n'), 25_000);
    request.raw.on('close', () => { closed = true; clearInterval(keepalive); unsub(); });
  });

  console.log(
    '[ALIX] Confirmations rotas registradas: GET /api/alix/confirmations(/:id), POST /api/alix/confirmations/:id/{approve,reject}, batch endpoints + /stream',
  );
}
