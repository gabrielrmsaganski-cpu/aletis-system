// ============================================================
// ALETIS — Alix Document Generators Routes (Wave 9-GENERATE)
// Download endpoint for documents produced by the
// DocumentGeneratorService.
//
// Contract:
//   GET  /api/alix/documents/generated/:id
//        → streams the binary file with Content-Disposition
//          "attachment; filename=<original>"
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

import { loadGeneratedDocumentMeta } from '../services/alix/generators/DocumentGeneratorService.js';
import { applyAlixAuth } from '../middleware/alixAuth.js';
import { assertAlixSessionAccess } from '../services/alix/AlixAccessService.js';
import type { GeneratedDocument } from '../services/alix/generators/types.js';

async function assertGeneratedAccess(request: FastifyRequest, meta: GeneratedDocument): Promise<void> {
  const sessionId = meta.metadata?.sessionId;
  if (meta.metadata?.tipo === 'documento-fundamentado' && typeof sessionId !== 'string') throw Object.assign(new Error('Documento indisponível.'), { statusCode: 404 });
  if (typeof sessionId === 'string') await assertAlixSessionAccess(request.alixUser, sessionId);
}

export default async function alixGeneratorsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  applyAlixAuth(fastify);
  fastify.get(
    '/api/alix/documents/generated/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const meta = await loadGeneratedDocumentMeta(id);
      if (!meta) {
        return reply.status(404).send({
          success: false,
          error: 'Documento não encontrado',
          code: 'GENERATED_DOC_NOT_FOUND',
        });
      }

      try { await assertGeneratedAccess(request, meta); } catch (err) {
        return reply.status((err as { statusCode?: number }).statusCode || 503).send({ success: false, error: 'Documento não encontrado ou indisponível.', code: 'GENERATED_DOC_NOT_FOUND' });
      }

      try {
        const info = await stat(meta.path);
        reply
          .header('Content-Type', meta.mimetype)
          .header(
            'Content-Disposition',
            `attachment; filename="${encodeURIComponent(meta.filename)}"`,
          )
          .header('Content-Length', String(info.size))
          .header('Cache-Control', 'private, no-store');
        return reply.send(createReadStream(meta.path));
      } catch (err) {
        request.log.error({ err, id }, '[alix-generators] file read error');
        return reply.status(500).send({
          success: false,
          error: 'Falha ao ler arquivo gerado',
          code: 'GENERATED_DOC_READ_ERROR',
        });
      }
    },
  );

  fastify.get(
    '/api/alix/documents/generated/:id/meta',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const meta = await loadGeneratedDocumentMeta(request.params.id);
      if (!meta) {
        return reply.status(404).send({
          success: false,
          error: 'Documento não encontrado',
          code: 'GENERATED_DOC_NOT_FOUND',
        });
      }
      try { await assertGeneratedAccess(request, meta); } catch (err) {
        return reply.status((err as { statusCode?: number }).statusCode || 503).send({ success: false, error: 'Documento não encontrado ou indisponível.', code: 'GENERATED_DOC_NOT_FOUND' });
      }
      const { path: _path, ...publicMeta } = meta;
      return reply.header('Cache-Control', 'private, no-store').send({ success: true, data: publicMeta });
    },
  );
}
