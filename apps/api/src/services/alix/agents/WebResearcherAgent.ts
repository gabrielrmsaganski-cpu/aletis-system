// ============================================================
// WebResearcherAgent — due-diligence externa
// ============================================================

import { BaseAgent } from './BaseAgent.js';
import type { SubAgentContext } from './types.js';
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js';
import { buildFetchUrlTool } from '../tools/websearch/fetchUrl.js';
import { buildCnpjTool } from '../tools/websearch/scrapers/cnpj.js';
import { buildCvmTool } from '../tools/websearch/scrapers/cvm.js';
import { buildJusbrasilTool } from '../tools/websearch/scrapers/jusbrasil.js';
import { buildProtestosTool } from '../tools/websearch/scrapers/protestos.js';
import { buildProcessosTJsTool } from '../tools/websearch/scrapers/processos.js';
import { buildIncraSicarTool } from '../tools/websearch/scrapers/incra.js';
import { WebSearchProviderFactory } from '../tools/websearch/WebSearchProviderFactory.js';

export class WebResearcherAgent extends BaseAgent {
  name = 'WebResearcher';
  model = process.env.ALIX_WEB_RESEARCHER_MODEL || 'claude-sonnet-4-6';
  maxTokens = 8000;
  maxIterations = 15;

  buildSystemPrompt(ctx: SubAgentContext): string {
    return `Você é o WebResearcher da ALETIS, sub-agente do Alix.

Missão: buscar informação pública externa e retornar resultados objetivos.

Regras:
1. Priorize fontes oficiais (Receita, CVM, PGFN, INPE, Jusbrasil, TJs, INCRA) antes de notícias.
2. SEMPRE retorne URLs das fontes que consultou.
3. Se não achou, diga "não encontrado" — jamais invente.
4. Toolkit de due-diligence (use conforme o caso):
   - consultar_cnpj_detalhado: dados Receita (QSA, CNAE, situação)
   - consultar_cvm: empresas listadas B3/RJ
   - consultar_jusbrasil: processos genéricos
   - consultar_protestos: cartórios CENPROT (cheque protestado, títulos)
   - consultar_processos_tjs: TJMT/TJGO/TJMS/TJBA/TJMG (execuções fiscais, RJ, penhoras)
   - consultar_incra_sicar: imóveis rurais, CAR, CCIR
5. Para cada scraper que retorna "queries", execute web_search com cada uma delas e consolide.
6. Use fetch_url nas páginas mais relevantes para extrair texto completo.
7. Responda em markdown com bullets e URLs. Cite a origem de cada fato.

Contexto da sessão pai:
- sessionId: ${ctx.sessionId}
${ctx.clienteId ? `- clienteId alvo: ${ctx.clienteId}` : ''}
${ctx.leadCpfCnpj ? `- leadCpfCnpj alvo: ${ctx.leadCpfCnpj}` : ''}
`;
  }

  buildTools(_ctx: SubAgentContext): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
    const tools: ClaudeTool[] = [];
    const registry: ClaudeToolRegistry = {};

    const kits = [
      buildFetchUrlTool(),
      buildCnpjTool(),
      buildCvmTool(),
      buildJusbrasilTool(),
      buildProtestosTool(),
      buildProcessosTJsTool(),
      buildIncraSicarTool(),
    ];
    for (const k of kits) {
      tools.push(...k.tools);
      Object.assign(registry, k.registry);
    }

    // web_search via provider cached (se warmUp rodou antes)
    const provider = WebSearchProviderFactory.getSync();
    if (provider) {
      const nativeTool = provider.asClaudeTool();
      if (nativeTool) {
        tools.push(nativeTool);
        if (provider.name === 'tavily') {
          registry['web_search'] = {
            spec: nativeTool,
            handler: async (i) => provider.search(String(i.query || ''), i as any),
          };
        } else {
          registry['web_search'] = {
            spec: nativeTool,
            handler: async () => ({ note: 'web_search nativa executada pelo LLM' }),
          };
        }
      }
    }

    return { tools, registry };
  }
}
