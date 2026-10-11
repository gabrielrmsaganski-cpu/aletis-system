import type { LLMTool, LLMToolRegistry } from '../../../../llm/OpenAIClient.js';

/**
 * Consulta protestos em cartórios — cruza CENPROT (IEPTB) + bancos de
 * dados privados (CNPJá, ConsultaPublica) via web_search.
 *
 * Retorna query otimizada que o WebResearcher executa via web_search nativa.
 */
export function buildProtestosTool(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tool: LLMTool = {
    name: 'consultar_protestos',
    description: 'Verifica se um CPF/CNPJ tem protestos públicos em cartórios. Cruza CENPROT (IEPTB), CNPJá e consultas públicas. Essencial em due-diligence pré-proposta.',
    input_schema: {
      type: 'object',
      properties: {
        cpfCnpj: { type: 'string', description: 'CPF ou CNPJ (só dígitos)' },
        nome: { type: 'string', description: 'Opcional, melhora precisão' },
      },
      required: ['cpfCnpj'],
    },
  };

  return {
    tools: [tool],
    registry: {
      consultar_protestos: {
        spec: tool,
        handler: async (i) => {
          const cpfCnpj = String(i.cpfCnpj || '').replace(/\D/g, '');
          if (!cpfCnpj) return { error: 'cpfCnpj obrigatório' };
          const nome = String(i.nome || '').trim();
          const queries = [
            `"${cpfCnpj}" site:cenprot.org.br OR site:ieptb.com.br`,
            `"${cpfCnpj}" protesto cartório`,
            nome ? `"${nome}" protesto cartório "${cpfCnpj.slice(0, 6)}"` : null,
          ].filter(Boolean);
          return {
            ok: true,
            hint: 'Execute web_search com cada query abaixo e consolide',
            queries,
            fontesRecomendadas: ['cenprot.org.br', 'ieptb.com.br', 'protesto.com.br', 'cnpja.com.br'],
          };
        },
      },
    },
  };
}
