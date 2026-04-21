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
import { DataSourceManager } from '../services/DataSourceManager.js';
import { AlixService } from '../services/AlixService.js';
import { getAlixConfirmationStore } from '../services/alix/AlixConfirmationStore.js';

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

export default async function alixConfirmationsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const store = getAlixConfirmationStore();

  // ── GET /api/alix/confirmations ─────────────────────────
  fastify.get(
    '/api/alix/confirmations',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const items = store.listActive().map((c) => ({
        id: c.id,
        toolName: c.toolName,
        description: c.description,
        createdAt: new Date(c.createdAt).toISOString(),
        expiresAt: new Date(c.expiresAt).toISOString(),
      }));
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
        },
      });
    },
  );

  // ── POST /api/alix/confirmations/:id/approve ────────────
  fastify.post(
    '/api/alix/confirmations/:id/approve',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const entry = store.consume(id);
      if (!entry) {
        return reply.status(404).send({
          success: false,
          error: 'Confirmação não encontrada, expirada ou já consumida',
        });
      }
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
        const result = await executor(entry.payload);
        return reply.status(200).send({
          success: true,
          data: {
            id: entry.id,
            toolName: entry.toolName,
            description: entry.description,
            result,
            executedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'erro desconhecido';
        request.log.error(
          { err, toolName: entry.toolName, id: entry.id },
          '[AlixConfirmations] execução falhou',
        );
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
      return reply.status(204).send();
    },
  );

  console.log(
    '[ALIX] Confirmations rotas registradas: GET /api/alix/confirmations(/:id), POST /api/alix/confirmations/:id/{approve,reject}',
  );
}
