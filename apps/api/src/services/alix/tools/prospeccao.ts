// ============================================================
// ALETIS — Alix tools: Prospecção (6 tools)
// Expõe ProspeccaoService como tool-use do LLM.
// Métodos reais do serviço: buscar, getLead, enrichLead, stats, etc.
// ============================================================

import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js';
import type { ProspeccaoFilters, ContactOutcomeTipo } from '../../prospeccao/types.js';

type ToolSpec = { spec: ClaudeTool; handler: (input: Record<string, unknown>) => Promise<unknown> | unknown };

function buildSpecs(): ToolSpec[] {
  const svc = getProspeccaoService();

  return [
    {
      spec: {
        name: 'buscar_lead',
        description: 'Busca um lead da aba Prospecção pelo CPF ou CNPJ (só dígitos). Retorna dados do PGFN, enriquecimento BrasilAPI, SICAR, scoring.',
        input_schema: {
          type: 'object',
          properties: {
            cpfCnpj: { type: 'string', description: 'CPF (11) ou CNPJ (14) apenas dígitos' },
          },
          required: ['cpfCnpj'],
        },
      },
      handler: (i) => {
        const cpfCnpj = String(i.cpfCnpj || '').replace(/\D/g, '');
        if (!cpfCnpj) return { ok: false, error: 'cpfCnpj obrigatório' };
        const lead = svc.getLead(cpfCnpj);
        if (!lead) return { ok: false, error: 'Lead não encontrado', cpfCnpj };
        return { ok: true, lead };
      },
    },
    {
      spec: {
        name: 'listar_leads_filtrados',
        description: 'Lista leads da Prospecção com filtros. Suporta UF, área (ha), valor de dívida, flag de ajuizamento, CNAE agro. Retorna paginado com stats.',
        input_schema: {
          type: 'object',
          properties: {
            uf: { type: 'string' },
            ufs: { type: 'array', items: { type: 'string' } },
            minHa: { type: 'number' },
            maxHa: { type: 'number' },
            minDivida: { type: 'number' },
            maxDivida: { type: 'number' },
            temAjuizada: { type: 'boolean' },
            cnaeAgro: { type: 'boolean', description: 'Filtra CNAE agrícola' },
            page: { type: 'number' },
            limit: { type: 'number', description: 'Máx 50. Default 20.' },
            sortBy: { type: 'string', enum: ['score', 'divida', 'hectares', 'recencia'] },
          },
        },
      },
      handler: (i) => {
        const filters: ProspeccaoFilters = { ...(i as any), limit: Math.min(Number(i.limit ?? 20), 50) };
        return svc.buscar(filters);
      },
    },
    {
      spec: {
        name: 'enriquecer_lead',
        description: 'Dispara enriquecimento remoto de um lead (BrasilAPI CNPJ, ViaCEP, IBGE, SICAR, NASA clima). Retorna lead atualizado. Pode levar 5-30s.',
        input_schema: {
          type: 'object',
          properties: {
            cpfCnpj: { type: 'string' },
            codImovel: { type: 'string', description: 'Opcional — código SICAR específico' },
          },
          required: ['cpfCnpj'],
        },
      },
      handler: async (i) => {
        const cpfCnpj = String(i.cpfCnpj || '').replace(/\D/g, '');
        if (!cpfCnpj) return { ok: false, error: 'cpfCnpj obrigatório' };
        try {
          const lead = await svc.enrichLead(cpfCnpj, (i.codImovel as string | undefined));
          if (!lead) return { ok: false, error: 'Enriquecimento retornou null', cpfCnpj };
          return { ok: true, lead };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
    },
    {
      spec: {
        name: 'stats_prospeccao',
        description: 'Agregados da base de leads: contagem por UF, faixas de dívida, sinais agro, total.',
        input_schema: {
          type: 'object',
          properties: {},
        },
      },
      handler: () => svc.stats(),
    },
    {
      spec: {
        name: 'top_leads_by_score',
        description: 'Top N leads ordenados por critério. Útil para priorizar prospecção.',
        input_schema: {
          type: 'object',
          properties: {
            n: { type: 'number', description: 'Qtd (1-50). Default 10.' },
            criterio: { type: 'string', enum: ['score', 'divida', 'hectares'], description: 'Default score' },
            uf: { type: 'string' },
          },
        },
      },
      handler: (i) => {
        const n = Math.min(Math.max(Number(i.n ?? 10), 1), 50);
        const criterio = String(i.criterio ?? 'score');
        const sortMap: Record<string, ProspeccaoFilters['sortBy']> = {
          score: 'score' as any,
          divida: 'divida' as any,
          hectares: 'hectares' as any,
        };
        const result = svc.buscar({
          uf: i.uf as string | undefined,
          limit: n,
          sortBy: sortMap[criterio] ?? ('score' as any),
        } as ProspeccaoFilters);
        return { criterio, n, leads: result.leads };
      },
    },
    {
      spec: {
        name: 'registrar_contato_lead',
        description: 'Registra o resultado de um contato feito com um lead (sucesso, interessado, recusou, etc). Fica no histórico do lead para priorizar próximos follow-ups.',
        input_schema: {
          type: 'object',
          properties: {
            cpfCnpj: { type: 'string' },
            tipo: { type: 'string', enum: ['sucesso', 'interessado', 'retornar', 'recusou', 'ja_regularizou', 'nao_agro', 'fora_target'] },
            canal: { type: 'string', enum: ['whatsapp', 'telefone', 'email', 'presencial', 'outro'] },
            notas: { type: 'string' },
          },
          required: ['cpfCnpj', 'tipo'],
        },
      },
      handler: (i) => {
        const cpfCnpj = String(i.cpfCnpj || '').replace(/\D/g, '');
        if (!cpfCnpj) return { ok: false, error: 'cpfCnpj obrigatório' };
        const tipo = i.tipo as ContactOutcomeTipo;
        try {
          const result = svc.registrarContato(cpfCnpj, {
            tipo,
            canal: (i.canal as any) ?? undefined,
            notas: (i.notas as string | undefined) ?? undefined,
            registradoPor: 'alix',
          });
          if (!result) return { ok: false, error: 'Lead não encontrado' };
          return { ok: true, outcome: result.outcome, blacklisted: Boolean(result.excluido) };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
    },
  ];
}

export function buildProspeccaoTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const specs = buildSpecs();
  const tools = specs.map(s => s.spec);
  const registry: ClaudeToolRegistry = {};
  for (const s of specs) {
    registry[s.spec.name] = { spec: s.spec, handler: s.handler };
  }
  return { tools, registry };
}
