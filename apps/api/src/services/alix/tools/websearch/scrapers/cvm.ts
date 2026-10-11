import type { LLMTool, LLMToolRegistry } from '../../../../llm/OpenAIClient.js';

// Circuit breaker em memória.
let consecutiveFailures = 0;
const FAIL_THRESHOLD = 3;

export function buildCvmTool(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tool: LLMTool = {
    name: 'consultar_cvm',
    description: 'Consulta CVM (sistema RAD) por fatos relevantes, RJ/RE, documentos de empresas listadas. Em F2, retorna query otimizada para web_search. Não cobre empresas fechadas.',
    input_schema: {
      type: 'object',
      properties: {
        cnpj: { type: 'string' },
        razaoSocial: { type: 'string' },
      },
    },
  };

  return {
    tools: [tool],
    registry: {
      consultar_cvm: {
        spec: tool,
        handler: async (i) => {
          if (consecutiveFailures >= FAIL_THRESHOLD) {
            return { error: 'Circuit breaker ativo — use web_search como alternativa', circuitOpen: true };
          }
          const q = String(i.cnpj || i.razaoSocial || '');
          if (!q) return { error: 'cnpj ou razaoSocial obrigatório' };
          try {
            const fallbackQuery = `${q} site:cvm.gov.br OR site:b3.com.br`;
            consecutiveFailures = 0;
            return {
              ok: true,
              hint: 'Use web_search com esta query para obter resultados CVM/B3',
              suggestedQuery: fallbackQuery,
            };
          } catch (err) {
            consecutiveFailures++;
            return { error: (err as Error).message };
          }
        },
      },
    },
  };
}
