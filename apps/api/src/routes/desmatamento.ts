// ============================================================
// ALETIS — Rotas de Desmatamento (INPE/DETER + PRODES + MapBiomas)
// ============================================================
//
// GET /api/desmatamento/municipio/:codigoIbge?de=&ate=
// GET /api/desmatamento/nacional?bioma=Amazonia
// GET /api/desmatamento/car/:numeroCAR       (501 no momento)
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DataSourceManager } from '../services/DataSourceManager.js';

export async function desmatamentoRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = DataSourceManager.getInstance();
  const deter = manager.getDeterService();

  // ── GET /api/desmatamento/municipio/:codigoIbge ──────────
  fastify.get(
    '/api/desmatamento/municipio/:codigoIbge',
    async (
      request: FastifyRequest<{
        Params: { codigoIbge: string };
        Querystring: { de?: string; ate?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { codigoIbge } = request.params;
        const { de, ate } = request.query;

        if (!/^\d{6,7}$/.test(codigoIbge)) {
          return reply.status(400).send({
            sucesso: false,
            erro: 'codigoIbge deve ter 6 ou 7 dígitos',
          });
        }

        const alertas = await deter.buscarAlertasPorMunicipio(codigoIbge, de, ate);
        return reply.status(200).send({
          sucesso: true,
          codigoIbge,
          periodo: { de: de ?? null, ate: ate ?? null },
          dados: alertas,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[Desmatamento] Erro municipio: ${msg}`);
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao buscar alertas de desmatamento',
          detalhes: msg,
        });
      }
    }
  );

  // ── GET /api/desmatamento/nacional ──────────────────────
  fastify.get(
    '/api/desmatamento/nacional',
    async (
      request: FastifyRequest<{ Querystring: { bioma?: string; periodo?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { bioma, periodo } = request.query;
        const resumo = await deter.resumoNacional(periodo);

        const filtrado = bioma
          ? {
              ...resumo,
              porBioma: resumo.porBioma.filter(
                (b) => b.bioma.toLowerCase() === bioma.toLowerCase()
              ),
            }
          : resumo;

        return reply.status(200).send({
          sucesso: true,
          filtro: { bioma: bioma ?? null, periodo: periodo ?? null },
          dados: filtrado,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[Desmatamento] Erro nacional: ${msg}`);
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao buscar resumo nacional de desmatamento',
          detalhes: msg,
        });
      }
    }
  );

  // ── GET /api/desmatamento/car/:numeroCAR ────────────────
  fastify.get(
    '/api/desmatamento/car/:numeroCAR',
    async (
      request: FastifyRequest<{ Params: { numeroCAR: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { numeroCAR } = request.params;
        const alertas = await deter.buscarAlertasPorImovelCAR(numeroCAR);

        // A integração CAR x DETER ainda não está completa; devolvemos 501
        // para deixar claro ao consumidor que isto é um placeholder documentado.
        return reply.status(501).send({
          sucesso: false,
          erro: 'Integração CAR x DETER ainda não implementada',
          numeroCAR,
          placeholder: alertas,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao consultar CAR',
          detalhes: msg,
        });
      }
    }
  );

  console.log('[Desmatamento] Rotas de desmatamento registradas');
}

export default desmatamentoRoutes;
