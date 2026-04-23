import type { ClaudeTool, ClaudeToolRegistry } from '../../../../llm/ClaudeFoundryClient.js';

export function buildJusbrasilTool(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tool: ClaudeTool = {
    name: 'consultar_jusbrasil',
    description: 'Busca processos públicos no Jusbrasil. Implementação F2 retorna query otimizada para web_search (site:jusbrasil.com.br). Use para descobrir ações judiciais envolvendo CPF/CNPJ/nome.',
    input_schema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Nome, CPF, CNPJ ou número de processo' },
      },
      required: ['termo'],
    },
  };

  return {
    tools: [tool],
    registry: {
      consultar_jusbrasil: {
        spec: tool,
        handler: async (i) => {
          const termo = String(i.termo || '');
          if (!termo) return { error: 'termo obrigatório' };
          return {
            ok: true,
            hint: 'Use web_search com a query abaixo',
            suggestedQuery: `"${termo}" site:jusbrasil.com.br`,
          };
        },
      },
    },
  };
}
