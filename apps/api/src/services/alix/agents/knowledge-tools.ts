import type { LLMTool, LLMToolRegistry } from '../../llm/types.js'
import type { SubAgentContext } from './types.js'
import { getAlixMemoryService } from '../memory/AlixMemoryService.js'
import { formatFactsForPrompt, getFactsForCliente } from '../memory/AlixMemoryFactExtractor.js'
import { searchRAG } from '../rag/RagService.js'

/** Conhecimento do cliente delimitado pela delegação; o modelo não escolhe outro escopo. */
export function buildSubAgentKnowledgeTools(ctx: SubAgentContext): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = [{ name: 'memoria_cliente',
    description: 'Lê memória e Livro de Fatos do cliente desta delegação. Fatos contestados ou pendentes não são certezas.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  }, { name: 'buscar_conhecimento_cliente',
    description: 'Busca fontes documentais do cliente desta delegação, inclusive de conversas anteriores, com arquivo, página e trecho.',
    input_schema: { type: 'object', properties: { query: { type: 'string', minLength: 3, maxLength: 1000 } }, required: ['query'], additionalProperties: false },
  }]
  const registry: LLMToolRegistry = {
    memoria_cliente: { spec: tools[0], handler: async () => {
      if (!ctx.clienteId) return { ok: false, error: 'Cliente ainda não definido nesta análise.' }
      const [memory, facts] = await Promise.all([getAlixMemoryService().render(ctx.clienteId), getFactsForCliente(ctx.clienteId, 80)])
      const ledger = formatFactsForPrompt(facts)
      return { clienteId: ctx.clienteId, memoria: memory.slice(0, 16000), fatos: ledger.slice(0, 16000),
        partial: memory.length > 16000 || ledger.length > 16000 }
    } },
    buscar_conhecimento_cliente: { spec: tools[1], handler: async input => {
      if (!ctx.clienteId) return { ok: false, error: 'Cliente ainda não definido nesta análise.' }
      const query = typeof input.query === 'string' ? input.query.trim() : ''
      if (query.length < 3 || query.length > 1000) return { ok: false, error: 'Informe uma pergunta objetiva para pesquisar nas fontes.' }
      const hits = await searchRAG({ clienteId: ctx.clienteId, query, topK: 8 })
      return { clienteId: ctx.clienteId, query, fontes: hits.map(hit => ({ documentId: hit.documentId,
        arquivo: hit.sourceFilename || hit.source, pagina: hit.pageStart, paginaFinal: hit.pageEnd, aba: hit.sheet,
        trecho: hit.chunkText.slice(0, 2400), sessionId: hit.sessionId, source: hit.source })) }
    } },
  }
  return { tools, registry }
}
