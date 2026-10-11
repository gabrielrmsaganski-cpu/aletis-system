// ============================================================
// ALETIS — Alix tools: Prospecção (6 tools)
// Expõe ProspeccaoService como tool-use do LLM.
// Métodos reais do serviço: buscar, getLead, enrichLead, stats, etc.
// ============================================================

import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js';
import { getProspeccaoService } from '../../prospeccao/ProspeccaoService.js';
import type { ProspeccaoFilters, ContactOutcomeTipo } from '../../prospeccao/types.js';

type ToolSpec = { spec: LLMTool; handler: (input: Record<string, unknown>) => Promise<unknown> | unknown };

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
        description: 'Lista leads da Prospecção com filtros. Suporta UF, tipoPessoa (PF/PJ), área (ha), valor de dívida, flag de ajuizamento, CNAE agro, termo de busca por nome. Retorna paginado com stats. Fontes atuais: PGFN (PJ agro com dívida ativa), SocioExpansion (sócios PF das PJs agro via BrasilAPI), DOU (futuro — RJ/falências).',
        input_schema: {
          type: 'object',
          properties: {
            uf: { type: 'string', description: 'UF (ex: MT, SP, PR)' },
            tipoPessoa: { type: 'string', enum: ['PF', 'PJ'], description: 'PF = sócios PF de PJ agro; PJ = empresa direta com dívida PGFN' },
            termo: { type: 'string', description: 'Busca por nome (case-insensitive)' },
            minHa: { type: 'number' },
            minDivida: { type: 'number' },
            temAjuizada: { type: 'boolean', description: 'Alias: apenasAjuizadas' },
            apenasAjuizadas: { type: 'boolean' },
            cnaeAgro: { type: 'boolean' },
            page: { type: 'number' },
            pageSize: { type: 'number', description: 'Máx 200. Default 50.' },
            sortBy: { type: 'string', enum: ['score', 'divida', 'hectares', 'recencia'] },
          },
        },
      },
      handler: (i) => {
        const filters: ProspeccaoFilters = { ...(i as any), pageSize: Math.min(Number(i.pageSize ?? i.limit ?? 50), 200) };
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

export function buildProspeccaoTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const specs = buildSpecs();
  const tools = specs.map(s => s.spec);
  const registry: LLMToolRegistry = {};
  for (const s of specs) {
    registry[s.spec.name] = { spec: s.spec, handler: s.handler };
  }
  return { tools, registry };
}
