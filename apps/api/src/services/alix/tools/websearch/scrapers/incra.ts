import type { LLMTool, LLMToolRegistry } from '../../../../llm/OpenAIClient.js';

/**
 * Busca imóvel rural via INCRA/CAR/SICAR por nome do proprietário.
 * Hoje não existe API pública com busca reversa PF→CAR — delegamos para
 * web_search filtrado em car.gov.br + incra.gov.br + sigef.
 */
export function buildIncraSicarTool(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tool: LLMTool = {
    name: 'consultar_incra_sicar',
    description: 'Busca imóvel rural por nome/CPF/CNPJ no INCRA (SICAR, SIGEF, CCIR). Útil para descobrir área total, localização e CAR associado a um proprietário.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        cpfCnpj: { type: 'string' },
        uf: { type: 'string' },
        municipio: { type: 'string' },
      },
    },
  };

  return {
    tools: [tool],
    registry: {
      consultar_incra_sicar: {
        spec: tool,
        handler: async (i) => {
          const nome = String(i.nome || '').trim();
          const doc = String(i.cpfCnpj || '').replace(/\D/g, '');
          const uf = String(i.uf || '').toUpperCase();
          const municipio = String(i.municipio || '').trim();
          if (!nome && !doc) return { error: 'nome ou cpfCnpj obrigatório' };
          const termo = nome || doc;
          const queries = [
            `"${termo}" CAR cadastro ambiental rural site:car.gov.br OR site:sfb.gov.br`,
            `"${termo}" CCIR site:incra.gov.br`,
            `"${termo}" matrícula imóvel rural${municipio ? ` ${municipio}` : ''}${uf ? ` ${uf}` : ''}`,
          ];
          return {
            ok: true,
            hint: 'Execute web_search com cada query. Resultado típico inclui código CAR, área total e localização.',
            queries,
          };
        },
      },
    },
  };
}
