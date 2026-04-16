// ============================================================
// ALETIS — Fontes de Dados Routes
// Dashboard and data access endpoints for all external sources
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DataSourceManager, type DataSourceCategory } from '../services/DataSourceManager.js';

// ── Route Registration ───────────────────────────────────────

export async function fontesRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = DataSourceManager.getInstance();

  // ── GET /api/fontes/status ─────────────────────────────
  // Returns health and status of all registered data sources
  fastify.get('/api/fontes/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const dashboardStatus = manager.getDashboardStatus();

      return reply.status(200).send({
        sucesso: true,
        dados: dashboardStatus,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao obter status: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao obter status das fontes de dados',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/:nome/dados ────────────────────────
  // Returns latest data from a specific named source
  fastify.get('/api/fontes/:nome/dados', async (
    request: FastifyRequest<{ Params: { nome: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { nome } = request.params;

      // Validate source exists
      const sourceStatus = manager.getSourceStatusByName(nome);
      if (!sourceStatus) {
        return reply.status(404).send({
          sucesso: false,
          erro: `Fonte '${nome}' nao encontrada`,
          fontesDisponiveis: manager.getSourceStatus().map((s) => s.nome),
        });
      }

      console.log(`[Fontes] Buscando dados de '${nome}'`);
      const result = await manager.fetchSource(nome);

      return reply.status(200).send({
        sucesso: true,
        fonte: sourceStatus,
        resultado: result,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar dados: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar dados da fonte',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/categoria/:categoria ───────────────
  // Returns all data for a given category
  fastify.get('/api/fontes/categoria/:categoria', async (
    request: FastifyRequest<{ Params: { categoria: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { categoria } = request.params;

      const validCategories: DataSourceCategory[] = [
        'PRECOS', 'PRODUCAO', 'CLIMA', 'CREDITO',
        'MERCADO_EXTERNO', 'TERRA', 'INFRAESTRUTURA', 'JURIDICO',
      ];

      if (!validCategories.includes(categoria as DataSourceCategory)) {
        return reply.status(400).send({
          sucesso: false,
          erro: `Categoria '${categoria}' invalida`,
          categoriasValidas: validCategories,
        });
      }

      console.log(`[Fontes] Buscando todos dados da categoria '${categoria}'`);
      const results = await manager.getAllData(categoria as DataSourceCategory);

      return reply.status(200).send({
        sucesso: true,
        categoria,
        fontes: Object.keys(results).length,
        dados: results,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar categoria: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar dados da categoria',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/indicadores ────────────────────────
  // Quick access to all BCB financial indicators
  fastify.get('/api/fontes/indicadores', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('[Fontes] Buscando todos indicadores financeiros');
      const indicadores = await manager.bancoCentral.getAllIndicators();

      return reply.status(200).send({
        sucesso: true,
        dados: indicadores,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar indicadores: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar indicadores financeiros',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/cotacoes ───────────────────────────
  // Quick access to all commodity quotes
  fastify.get('/api/fontes/cotacoes', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('[Fontes] Buscando todas cotacoes de commodities');
      const cotacoes = await manager.precos.getAllCotacoes();

      return reply.status(200).send({
        sucesso: true,
        dados: cotacoes,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar cotacoes: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar cotacoes',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/clima/:codigoCidade ────────────────
  // Weather forecast for a city
  fastify.get('/api/fontes/clima/:codigoCidade', async (
    request: FastifyRequest<{
      Params: { codigoCidade: string };
      Querystring: { dias?: string };
    }>,
    reply: FastifyReply
  ) => {
    try {
      const { codigoCidade } = request.params;
      const dias = parseInt(request.query.dias || '4', 10);

      console.log(`[Fontes] Buscando clima para cidade ${codigoCidade}, ${dias} dias`);
      const previsao = await manager.clima.getPrevisao(codigoCidade, dias);

      return reply.status(200).send({
        sucesso: true,
        dados: previsao,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar clima: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar previsao do tempo',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/municipios/:uf ─────────────────────
  // List municipalities by state
  fastify.get('/api/fontes/municipios/:uf', async (
    request: FastifyRequest<{ Params: { uf: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { uf } = request.params;

      console.log(`[Fontes] Buscando municipios de ${uf}`);
      const municipios = await manager.ibge.getMunicipios(uf);

      return reply.status(200).send({
        sucesso: true,
        estado: uf.toUpperCase(),
        total: municipios.length,
        dados: municipios,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar municipios: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar municipios',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/combustiveis/:estado ───────────────
  // Fuel prices by state
  fastify.get('/api/fontes/combustiveis/:estado', async (
    request: FastifyRequest<{ Params: { estado: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const { estado } = request.params;

      console.log(`[Fontes] Buscando precos combustiveis ${estado}`);
      const precos = await manager.anp.getPrecosCombustiveis(estado);

      return reply.status(200).send({
        sucesso: true,
        estado: estado.toUpperCase(),
        dados: precos,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar combustiveis: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar precos de combustiveis',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/safra ──────────────────────────────
  // CONAB crop forecast
  fastify.get('/api/fontes/safra', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('[Fontes] Buscando previsao de safra');
      const safra = await manager.precos.getPrevisaoSafra();

      return reply.status(200).send({
        sucesso: true,
        dados: safra,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar safra: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar previsao de safra',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/health ─────────────────────────────
  // Quick health check summary
  fastify.get('/api/fontes/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await manager.healthCheck();

      return reply.status(200).send({
        sucesso: true,
        saude: health,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      return reply.status(500).send({
        sucesso: false,
        erro: msg,
      });
    }
  });

  console.log('[Fontes] Rotas de fontes de dados registradas');
}

export default fontesRoutes;
