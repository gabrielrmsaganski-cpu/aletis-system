// ============================================================
// ALETIS — Fontes de Dados Routes
// Dashboard and data access endpoints for all external sources
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DataSourceManager, type DataSourceCategory } from '../services/DataSourceManager.js';

// ── Route Registration ───────────────────────────────────────

export async function fontesRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = DataSourceManager.getInstance();

  // Dispara uma sondagem leve na primeira consulta de status quando
  // nenhuma fonte foi ainda verificada. Isso elimina o estado "desconhecido"
  // inicial sem bloquear a resposta do endpoint.
  let sondagemInicialDisparada = false;
  const dispararSondagemSeNecessario = () => {
    if (sondagemInicialDisparada) return;
    const fontes = manager.getSourceStatus();
    const algumaVerificada = fontes.some((f) => f.ultimaAtualizacao !== null);
    if (algumaVerificada) {
      sondagemInicialDisparada = true;
      return;
    }
    sondagemInicialDisparada = true;
    manager.probeAllSources().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Fontes] Falha na sondagem inicial: ${msg}`);
    });
  };

  // ── GET /api/fontes/status ─────────────────────────────
  // Returns health and status of all registered data sources
  fastify.get('/api/fontes/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      dispararSondagemSeNecessario();
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

  // ── POST /api/fontes/probe ─────────────────────────────
  // Executa uma sondagem completa em todas as fontes registradas.
  fastify.post('/api/fontes/probe', async (
    request: FastifyRequest<{ Querystring: { timeoutMs?: string; concurrency?: string } }>,
    reply: FastifyReply
  ) => {
    try {
      const timeoutMs = request.query.timeoutMs ? parseInt(request.query.timeoutMs, 10) : undefined;
      const concurrency = request.query.concurrency ? parseInt(request.query.concurrency, 10) : undefined;

      console.log('[Fontes] Sondagem manual disparada');
      const resumo = await manager.probeAllSources({
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
        concurrency: Number.isFinite(concurrency) ? concurrency : undefined,
      });

      return reply.status(200).send({
        sucesso: true,
        resumo,
        dashboard: manager.getDashboardStatus(),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro na sondagem: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao executar sondagem nas fontes',
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
          erro: `Fonte '${nome}' não encontrada`,
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
          erro: `Categoria '${categoria}' inválida`,
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
      console.log('[Fontes] Buscando todas cotações de commodities');
      const cotacoes = await manager.precos.getAllCotacoes();

      return reply.status(200).send({
        sucesso: true,
        dados: cotacoes,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar cotações: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar cotações',
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
        erro: 'Erro ao buscar previsão do tempo',
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

      console.log(`[Fontes] Buscando municípios de ${uf}`);
      const municipios = await manager.ibge.getMunicipios(uf);

      return reply.status(200).send({
        sucesso: true,
        estado: uf.toUpperCase(),
        total: municipios.length,
        dados: municipios,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar municípios: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar municípios',
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

      console.log(`[Fontes] Buscando preços combustíveis ${estado}`);
      const precos = await manager.anp.getPrecosCombustiveis(estado);

      return reply.status(200).send({
        sucesso: true,
        estado: estado.toUpperCase(),
        dados: precos,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      console.error(`[Fontes] Erro ao buscar combustíveis: ${msg}`);
      return reply.status(500).send({
        sucesso: false,
        erro: 'Erro ao buscar preços de combustíveis',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/safra ──────────────────────────────
  // CONAB crop forecast
  fastify.get('/api/fontes/safra', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('[Fontes] Buscando previsão de safra');
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
        erro: 'Erro ao buscar previsão de safra',
        detalhes: msg,
      });
    }
  });

  // ── GET /api/fontes/historico ─────────────────────────────
  // Wave-PG-11 — timeline de transições de status das fontes (audit_log).
  // Query params:
  //   - fonte=cepea_soja   filtra por uma fonte específica
  //   - desde=ISO          recorta a partir de uma data (default: 7 dias)
  //   - limit=N            máximo de eventos (default: 100, max 500)
  fastify.get('/api/fontes/historico', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const q = request.query as { fonte?: string; desde?: string; limit?: string }
      const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500)
      const desde = q.desde ? new Date(q.desde) : new Date(Date.now() - 7 * 24 * 3600 * 1000)
      if (isNaN(desde.getTime())) {
        return reply.status(400).send({ sucesso: false, erro: '`desde` deve ser ISO 8601 válido' })
      }

      const { isPgEnabled, getDb } = await import('../db/client.js')
      if (!isPgEnabled()) {
        return reply.status(200).send({
          sucesso: true,
          aviso: 'PG desligado — sem histórico persistido. Habilite ALETIS_PG_ENABLED=1.',
          desde: desde.toISOString(),
          total: 0,
          eventos: [],
        })
      }

      const { auditLog } = await import('../db/schema.js')
      const { eq, and, gte, like, desc } = await import('drizzle-orm')
      const db = getDb()
      const filtros = [
        eq(auditLog.acao, 'fonte_state_transition'),
        gte(auditLog.criadoEm, desde),
      ]
      if (q.fonte) {
        filtros.push(like(auditLog.recurso, `fonte:${q.fonte}`))
      } else {
        filtros.push(like(auditLog.recurso, 'fonte:%'))
      }
      const rows = await db
        .select()
        .from(auditLog)
        .where(and(...filtros))
        .orderBy(desc(auditLog.criadoEm))
        .limit(limit)

      const eventos = rows.map((r) => ({
        id: Number(r.id),
        criadoEm: r.criadoEm,
        fonte: (r.recurso ?? '').replace(/^fonte:/, ''),
        de: (r.dadosAntes as { status?: string } | null)?.status ?? null,
        para: (r.dadosDepois as { status?: string } | null)?.status ?? null,
        latenciaMs: (r.dadosDepois as { latenciaMs?: number } | null)?.latenciaMs ?? null,
        ultimoErro: (r.dadosDepois as { ultimoErro?: string } | null)?.ultimoErro ?? null,
      }))

      return reply.status(200).send({
        sucesso: true,
        desde: desde.toISOString(),
        total: eventos.length,
        eventos,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      return reply.status(500).send({ sucesso: false, erro: msg })
    }
  })

  // ── GET /api/fontes/uptime ─────────────────────────────
  // Wave-PG-11 — uptime % nas últimas N horas. Calcula a partir de
  // (snapshot atual no fonte_status) + (transitions no audit_log).
  // Heurística: a fonte está no estado atual desde a última transition
  // ou desde a primeira observação (se não houver transition no período).
  fastify.get('/api/fontes/uptime', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const q = request.query as { horas?: string }
      const horas = Math.min(Math.max(Number(q.horas) || 24, 1), 720)
      const desde = new Date(Date.now() - horas * 3600 * 1000)

      const { isPgEnabled, getDb } = await import('../db/client.js')
      if (!isPgEnabled()) {
        return reply.status(200).send({
          sucesso: true,
          aviso: 'PG desligado — uptime indisponível.',
          janelaHoras: horas,
          desde: desde.toISOString(),
          media: 0,
          fontes: [],
        })
      }

      const { listFonteStatus } = await import('../db/FonteStatusRepository.js')
      const { auditLog } = await import('../db/schema.js')
      const { eq, and, gte, like, asc } = await import('drizzle-orm')
      const db = getDb()
      const transitions = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.acao, 'fonte_state_transition'),
            like(auditLog.recurso, 'fonte:%'),
            gte(auditLog.criadoEm, desde),
          ),
        )
        .orderBy(asc(auditLog.criadoEm))

      // Agrupa por fonte
      const byFonte = new Map<string, Array<{ at: Date; status: string }>>()
      for (const t of transitions) {
        const fonte = (t.recurso ?? '').replace(/^fonte:/, '')
        const status = (t.dadosDepois as { status?: string } | null)?.status ?? 'unknown'
        if (!byFonte.has(fonte)) byFonte.set(fonte, [])
        byFonte.get(fonte)!.push({ at: t.criadoEm!, status })
      }

      // Estado atual do snapshot
      const atuais = await listFonteStatus()
      const totalMs = horas * 3600 * 1000

      const fontes = atuais.map((f) => {
        const ts = byFonte.get(f.nome) ?? []
        // Constrói segmentos: cada segmento [t_inicio, t_fim, status]
        // Se não há transitions, a fonte estava no status atual o tempo todo.
        if (ts.length === 0) {
          return {
            nome: f.nome,
            statusAtual: f.status,
            transitions: 0,
            uptimePct: f.status === 'online' ? 100 : f.status === 'degraded' ? 50 : 0,
          }
        }
        let cursorMs = desde.getTime()
        // Estado no início do período = inverso da primeira transição
        let statusAtualSeg = ts[0].status === 'online' ? 'offline' : 'online'
        let onlineMs = 0
        for (const trans of ts) {
          const tMs = trans.at.getTime()
          const dur = Math.max(0, tMs - cursorMs)
          if (statusAtualSeg === 'online') onlineMs += dur
          else if (statusAtualSeg === 'degraded') onlineMs += dur * 0.5
          cursorMs = tMs
          statusAtualSeg = trans.status
        }
        // Último segmento até "agora"
        const dur = Math.max(0, Date.now() - cursorMs)
        if (statusAtualSeg === 'online') onlineMs += dur
        else if (statusAtualSeg === 'degraded') onlineMs += dur * 0.5

        return {
          nome: f.nome,
          statusAtual: f.status,
          transitions: ts.length,
          uptimePct: Number(((onlineMs / totalMs) * 100).toFixed(1)),
        }
      })

      const mediaUptime =
        fontes.length === 0 ? 0 : Number((fontes.reduce((s, f) => s + f.uptimePct, 0) / fontes.length).toFixed(1))

      return reply.status(200).send({
        sucesso: true,
        janelaHoras: horas,
        desde: desde.toISOString(),
        media: mediaUptime,
        fontes: fontes.sort((a, b) => a.uptimePct - b.uptimePct),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      return reply.status(500).send({ sucesso: false, erro: msg })
    }
  })

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
