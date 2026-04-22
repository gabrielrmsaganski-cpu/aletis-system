// ============================================================
// ALETIS — Rotas SICOR (Bacen OLINDA OData) — Wave 8c
// ============================================================
//
// GET /api/sicor/custeio?ano=&uf=&produto=&top=&skip=
// GET /api/sicor/investimento?ano=&uf=&produto=&top=&skip=
// GET /api/sicor/comercializacao?ano=&uf=&produto=&top=&skip=
// GET /api/sicor/resumo/:uf/:ano
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DataSourceManager } from '../services/DataSourceManager.js';
import type { ParametrosConsultaSicor } from '@aletis/shared-types/src/sicor.js';

interface SicorQuery {
  ano?: string;
  anoMesInicial?: string;
  anoMesFinal?: string;
  uf?: string;
  produto?: string;
  top?: string;
  skip?: string;
}

function parseQuery(q: SicorQuery): ParametrosConsultaSicor {
  const out: ParametrosConsultaSicor = {};
  if (q.uf) out.uf = q.uf;
  if (q.produto) out.produto = q.produto;

  // Se ano for fornecido, converte para intervalo anoMesInicial..anoMesFinal
  // (a menos que os anoMes estejam explícitos).
  if (q.ano && /^\d{4}$/.test(q.ano)) {
    out.anoMesInicial = `${q.ano}01`;
    out.anoMesFinal = `${q.ano}12`;
  }
  if (q.anoMesInicial) out.anoMesInicial = q.anoMesInicial;
  if (q.anoMesFinal) out.anoMesFinal = q.anoMesFinal;

  if (q.top) {
    const t = parseInt(q.top, 10);
    if (Number.isFinite(t)) out.top = t;
  }
  if (q.skip) {
    const s = parseInt(q.skip, 10);
    if (Number.isFinite(s)) out.skip = s;
  }
  return out;
}

export async function sicorRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = DataSourceManager.getInstance();
  const sicor = manager.getSicorService();

  // ── GET /api/sicor/custeio ─────────────────────────────
  fastify.get(
    '/api/sicor/custeio',
    async (
      request: FastifyRequest<{ Querystring: SicorQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const params = parseQuery(request.query);
        const dados = await sicor.buscarContratosCusteio(params);
        return reply.status(200).send({ sucesso: true, dados });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[SICOR] Erro custeio: ${msg}`);
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao consultar SICOR custeio',
          detalhes: msg,
        });
      }
    }
  );

  // ── GET /api/sicor/investimento ────────────────────────
  fastify.get(
    '/api/sicor/investimento',
    async (
      request: FastifyRequest<{ Querystring: SicorQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const params = parseQuery(request.query);
        const dados = await sicor.buscarContratosInvestimento(params);
        return reply.status(200).send({ sucesso: true, dados });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[SICOR] Erro investimento: ${msg}`);
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao consultar SICOR investimento',
          detalhes: msg,
        });
      }
    }
  );

  // ── GET /api/sicor/comercializacao ─────────────────────
  fastify.get(
    '/api/sicor/comercializacao',
    async (
      request: FastifyRequest<{ Querystring: SicorQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const params = parseQuery(request.query);
        const dados = await sicor.buscarContratosComercializacao(params);
        return reply.status(200).send({ sucesso: true, dados });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[SICOR] Erro comercialização: ${msg}`);
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao consultar SICOR comercialização',
          detalhes: msg,
        });
      }
    }
  );

  // ── GET /api/sicor/resumo/:uf/:ano ─────────────────────
  fastify.get(
    '/api/sicor/resumo/:uf/:ano',
    async (
      request: FastifyRequest<{ Params: { uf: string; ano: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { uf, ano } = request.params;
        const anoNum = parseInt(ano, 10);
        if (!Number.isInteger(anoNum)) {
          return reply.status(400).send({
            sucesso: false,
            erro: 'Parâmetro "ano" deve ser um inteiro (ex: 2025).',
          });
        }
        const dados = await sicor.resumoUfAno(uf, anoNum);
        return reply.status(200).send({ sucesso: true, dados });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[SICOR] Erro resumo: ${msg}`);
        const status = /inválid/i.test(msg) ? 400 : 500;
        return reply.status(status).send({
          sucesso: false,
          erro: 'Erro ao gerar resumo SICOR',
          detalhes: msg,
        });
      }
    }
  );

  console.log('[SICOR] Rotas SICOR Bacen registradas');
}

export default sicorRoutes;
