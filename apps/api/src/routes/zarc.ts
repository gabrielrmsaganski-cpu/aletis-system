// ============================================================
// ALETIS — Rotas ZARC (Zoneamento Agricola de Risco Climatico)
// ============================================================
//
// GET  /api/zarc/janelas?cultura=&uf=&municipio=&solo=&ciclo=
// POST /api/zarc/validar  { cultura, uf, codigoIbge, dataPlantio, solo, ciclo }
// GET  /api/zarc/culturas?uf=
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DataSourceManager } from '../services/DataSourceManager.js';
import type { TipoSoloZarc, CicloVariedade } from '@aletis/shared-types/src/zarc.js';

const SOLOS_VALIDOS: TipoSoloZarc[] = ['I', 'II', 'III'];
const CICLOS_VALIDOS: CicloVariedade[] = ['precoce', 'medio', 'tardio'];

export async function zarcRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = DataSourceManager.getInstance();
  const zarc = manager.getZarcService();

  // ── GET /api/zarc/janelas ──────────────────────────────
  fastify.get(
    '/api/zarc/janelas',
    async (
      request: FastifyRequest<{
        Querystring: {
          cultura?: string;
          uf?: string;
          municipio?: string;
          solo?: string;
          ciclo?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { cultura, uf, municipio, solo, ciclo } = request.query;

        if (!cultura || !uf) {
          return reply.status(400).send({
            sucesso: false,
            erro: 'Parâmetros obrigatórios: cultura, uf',
          });
        }

        const soloTipo: TipoSoloZarc = SOLOS_VALIDOS.includes(solo as TipoSoloZarc)
          ? (solo as TipoSoloZarc)
          : 'I';
        const cicloVar: CicloVariedade = CICLOS_VALIDOS.includes(ciclo as CicloVariedade)
          ? (ciclo as CicloVariedade)
          : 'medio';

        const janelas = await zarc.buscarJanelasPlantio(
          cultura,
          uf,
          municipio,
          soloTipo,
          cicloVar
        );

        return reply.status(200).send({
          sucesso: true,
          dados: janelas,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[ZARC] Erro janelas: ${msg}`);
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao buscar janelas ZARC',
          detalhes: msg,
        });
      }
    }
  );

  // ── POST /api/zarc/validar ─────────────────────────────
  fastify.post(
    '/api/zarc/validar',
    async (
      request: FastifyRequest<{
        Body: {
          cultura?: string;
          uf?: string;
          codigoIbge?: string;
          dataPlantio?: string;
          solo?: string;
          ciclo?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const body = request.body ?? {};
        const { cultura, uf, codigoIbge, dataPlantio, solo, ciclo } = body;

        if (!cultura || !uf || !codigoIbge || !dataPlantio) {
          return reply.status(400).send({
            sucesso: false,
            erro: 'Campos obrigatórios: cultura, uf, codigoIbge, dataPlantio',
          });
        }

        const soloTipo: TipoSoloZarc = SOLOS_VALIDOS.includes(solo as TipoSoloZarc)
          ? (solo as TipoSoloZarc)
          : 'I';
        const cicloVar: CicloVariedade = CICLOS_VALIDOS.includes(ciclo as CicloVariedade)
          ? (ciclo as CicloVariedade)
          : 'medio';

        const validacao = await zarc.validarPlano(
          cultura,
          uf,
          codigoIbge,
          dataPlantio,
          soloTipo,
          cicloVar
        );

        return reply.status(200).send({
          sucesso: true,
          dados: validacao,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[ZARC] Erro validar: ${msg}`);
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao validar plano ZARC',
          detalhes: msg,
        });
      }
    }
  );

  // ── GET /api/zarc/culturas ─────────────────────────────
  fastify.get(
    '/api/zarc/culturas',
    async (
      request: FastifyRequest<{ Querystring: { uf?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { uf } = request.query;
        if (!uf) {
          return reply.status(400).send({
            sucesso: false,
            erro: 'Parâmetro obrigatório: uf',
          });
        }
        const culturas = zarc.culturasDisponiveis(uf);
        return reply.status(200).send({
          sucesso: true,
          uf: uf.toUpperCase(),
          total: culturas.length,
          culturas,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        return reply.status(500).send({
          sucesso: false,
          erro: 'Erro ao listar culturas',
          detalhes: msg,
        });
      }
    }
  );

  console.log('[ZARC] Rotas ZARC registradas');
}

export default zarcRoutes;
