import type { LLMTool, LLMToolRegistry } from '../../../../llm/OpenAIClient.js';

export function buildCnpjTool(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tool: LLMTool = {
    name: 'consultar_cnpj_detalhado',
    description: 'Consulta BrasilAPI para dados públicos da Receita Federal: razão social, CNAE, situação cadastral, sócios, endereço, porte, situação especial (falida, RJ, etc).',
    input_schema: {
      type: 'object',
      properties: { cnpj: { type: 'string', description: '14 dígitos, só números' } },
      required: ['cnpj'],
    },
  };
  return {
    tools: [tool],
    registry: {
      consultar_cnpj_detalhado: {
        spec: tool,
        handler: async (i) => {
          const cnpj = String(i.cnpj || '').replace(/\D/g, '');
          if (cnpj.length !== 14) return { error: 'CNPJ deve ter 14 dígitos' };
          try {
            const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            if (!r.ok) return { error: `BrasilAPI HTTP ${r.status}` };
            const data = await r.json();
            return { ok: true, data };
          } catch (err) {
            return { error: (err as Error).message };
          }
        },
      },
    },
  };
}
