// ============================================================
// feedback — tool learnings_recentes para o Orchestrator
// ============================================================
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { getFeedbackService } from '../learning/FeedbackService.js'

export function buildFeedbackTools(): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}

  tools.push({
    name: 'learnings_recentes',
    description:
      'Retorna feedbacks recentes do consultor + ranking de ferramentas. Destaca respostas úteis, incompletas, incorretas e com tom inadequado para evitar reincidências.',
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
          motivo: f.motivo,
          categoria: f.category,
          notas: (f.notas || '').slice(0, 160),
          correcaoEsperada: (f.expectedCorrection || '').slice(0, 240),
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
