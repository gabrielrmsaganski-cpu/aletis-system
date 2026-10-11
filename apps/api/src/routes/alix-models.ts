import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getRuntimeModelCatalog } from '../services/llm/ModelCatalog.js'

const catalogSchema = z.object({
  checkedAt: z.string().datetime(), verifiedAt: z.string().datetime().optional(),
  provider: z.enum(['foundry', 'openai']), configured: z.boolean(), stale: z.boolean(), error: z.string().optional(),
  models: z.array(z.object({
    id: z.string(), deployment: z.string(), label: z.string(), provider: z.enum(['foundry', 'openai']),
    availability: z.enum(['available', 'unavailable', 'unknown']), capabilities: z.array(z.string()),
    protocols: z.array(z.enum(['responses', 'chat_completions'])), verifiedAt: z.string().datetime().optional(),
    verificationSource: z.enum(['azure_arm_deployments', 'openai_models']).optional(),
  })),
})

export default async function alixModelsRoutes(app: FastifyInstance) {
  app.get('/api/alix/models', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return catalogSchema.parse(await getRuntimeModelCatalog())
  })
}
