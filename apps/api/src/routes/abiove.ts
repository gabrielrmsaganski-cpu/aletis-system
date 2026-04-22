// ============================================================
// ALETIS — Rotas ABIOVE (Moratoria da Soja)
// ============================================================
//
// GET /api/abiove/moratoria/status
// GET /api/abiove/moratoria/elegibilidade/:codigoIbge?dataDesmatamento=
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DataSourceManager } from '../services/DataSourceManager.js';

export async function abioveRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = DataSourceManager.getInstance();
  const abiove = manager.getAbioveService();

  // ── GET /api/abiove/moratoria/status ───────────────────
  fastify.get('/api/abiove/moratoria/status', async (_request, reply: FastifyReply) => {
    try {
      const status = abiove.statusMoratoriaSoja();
      return reply.status(200).send({
        sucesso: true,
        dados: status,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[ABIOVE] Erro status: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao obter status da Moratória da Soja',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/abiove/moratoria/elegibilidade/:codigoIbge ──
  fastify.get(
    '/api/abiove/moratoria/elegibilidade/:codigoIbge',
    async (
      request: FastifyRequest<{
        Params: { codigoIbge: string };
        Querystring: { dataDesmatamento?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { codigoIbge } = request.params;
        const { dataDesmatamento } = request.query;

        if (!/^\d{6,7}$/.test(codigoIbge)) {
          return reply.status(400).send({
            sucesso: false,
            erro: 'codigoIbge deve ter 6 ou 7 dígitos',
          });
        }

        const elegibilidade = abiove.elegibilidadeImovel(codigoIbge, dataDesmatamento);
        return reply.status(200).send({
          sucesso: true,
          dados: elegibilidade,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[ABIOVE] Erro elegibilidade: ${msg}`);
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao avaliar elegibilidade',
          detalhes: msg,
        });
      }
    }
  );

  console.log('[ABIOVE] Rotas ABIOVE registradas');
}

export default abioveRoutes;
