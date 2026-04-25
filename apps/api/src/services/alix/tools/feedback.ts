// ============================================================
// feedback — tool learnings_recentes para o Orchestrator
// ============================================================
import type { ClaudeTool, ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'
import { getFeedbackService } from '../learning/FeedbackService.js'

export function buildFeedbackTools(): { tools: ClaudeTool[]; registry: ClaudeToolRegistry } {
  const tools: ClaudeTool[] = []
  const registry: ClaudeToolRegistry = {}

  tools.push({
    name: 'learnings_recentes',
    description:
      'Retorna feedbacks recentes do Christian (últimos 50) + ranking de tools por "score de utilidade" calculado a partir de "útil - incorreto*2 - irrelevante*0.5 - off-tom*0.3". Use antes de responder quando estiver em dúvida sobre abordagem — evita repetir erros marcados como incorreto.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'quantos feedbacks individuais retornar (default 30)' },
      },
    },
  })
  registry['learnings_recentes'] = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const svc = getFeedbackService()
      const limit = Number(input.limit) || 30
      const [feedbacks, ranking] = await Promise.all([
        svc.recent(limit),
        svc.toolRanking(),
      ])
      return {
        totalFeedbacksRecentes: feedbacks.length,
        feedbacks: feedbacks.slice(-limit).map((f) => ({
          rating: f.rating,
          notas: (f.notas || '').slice(0, 160),
          quando: f.ts.slice(0, 10),
          agent: f.agent,
          tools: f.tools,
        })),
        rankingTools: ranking.slice(0, 15),
      }
    },
  }

  return { tools, registry }
}
