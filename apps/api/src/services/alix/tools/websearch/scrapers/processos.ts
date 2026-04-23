import type { ClaudeTool, ClaudeToolRegistry } from '../../../../llm/ClaudeFoundryClient.js';

// TJs relevantes para o agro BR
const TJS_AGRO = [
  { uf: 'MT', sigla: 'TJMT', site: 'tjmt.jus.br' },
  { uf: 'MS', sigla: 'TJMS', site: 'tjms.jus.br' },
  { uf: 'GO', sigla: 'TJGO', site: 'tjgo.jus.br' },
  { uf: 'BA', sigla: 'TJBA', site: 'tjba.jus.br' },
  { uf: 'MG', sigla: 'TJMG', site: 'tjmg.jus.br' },
  { uf: 'PR', sigla: 'TJPR', site: 'tjpr.jus.br' },
  { uf: 'RS', sigla: 'TJRS', site: 'tjrs.jus.br' },
  { uf: 'SP', sigla: 'TJSP', site: 'tjsp.jus.br' },
  { uf: 'TO', sigla: 'TJTO', site: 'tjto.jus.br' },
];

/**
 * Consulta processos em Tribunais de Justiça estaduais (consulta pública).
 * Gera queries otimizadas para web_search — cada TJ tem pesquisa pública
 * por nome/CPF/CNPJ, mas a UX varia muito, então delegamos ao web_search.
 */
export function buildProcessosTJsTool(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tool: ClaudeTool = {
    name: 'consultar_processos_tjs',
    description: 'Busca processos em Tribunais de Justiça estaduais (TJMT, TJGO, TJMS, etc). Essencial para detectar execuções fiscais, ações de cobrança, penhoras em curso. Use após identificar a UF principal do cliente/lead.',
    input_schema: {
      type: 'object',
      properties: {
        termo: { type: 'string', description: 'Nome, CPF ou CNPJ' },
        uf: { type: 'string', description: 'UF do tribunal (opcional — se omitido gera queries pra MT/GO/MS/BA)' },
      },
      required: ['termo'],
    },
  };

  return {
    tools: [tool],
    registry: {
      consultar_processos_tjs: {
        spec: tool,
        handler: async (i) => {
          const termo = String(i.termo || '').trim();
          if (!termo) return { error: 'termo obrigatório' };
          const uf = String(i.uf || '').toUpperCase();
          const alvos = uf
            ? TJS_AGRO.filter(t => t.uf === uf)
            : TJS_AGRO.filter(t => ['MT', 'GO', 'MS', 'BA', 'MG'].includes(t.uf));
          if (alvos.length === 0) return { error: `UF ${uf} não coberta`, disponiveis: TJS_AGRO.map(t => t.uf) };
          const queries = alvos.map(t => `"${termo}" site:${t.site} OR "${t.sigla}"`);
          queries.push(`"${termo}" "execução fiscal" site:*.jus.br`);
          queries.push(`"${termo}" "recuperação judicial" site:*.jus.br`);
          return {
            ok: true,
            hint: 'Execute web_search com cada query; procure por números de processo e decisões.',
            queries,
            tribunaisAlvo: alvos,
          };
        },
      },
    },
  };
}
