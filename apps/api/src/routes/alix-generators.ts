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

export default async function alixGeneratorsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
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

      try {
        const info = await stat(meta.path);
        reply
          .header('Content-Type', meta.mimetype)
          .header(
            'Content-Disposition',
            `attachment; filename="${encodeURIComponent(meta.filename)}"`,
          )
          .header('Content-Length', String(info.size))
          .header('Cache-Control', 'private, max-age=60');
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
      return reply.send({ success: true, data: meta });
    },
  );
}
