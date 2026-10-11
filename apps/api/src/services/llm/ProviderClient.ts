import OpenAI from 'openai'
import { RETRY_CONFIG } from './LLMConfig.js'
import { resolveRuntimeModel, type RuntimeModel } from './ModelCatalog.js'
import { getLLMProviderConfig, providerConfigKey } from './ProviderConfig.js'
import type { ModelCapability } from './types.js'

let cached: { key: string; client: OpenAI } | undefined

export interface ResponsesContext {
  client: OpenAI
  model: RuntimeModel
}

export async function getPrimaryResponsesContext(id: string, required: ModelCapability[] = ['chat']): Promise<ResponsesContext> {
  const config = getLLMProviderConfig()
  if (!config.configured) throw new Error(`Provedor não configurado: ${config.missing.join(', ')}`)
  const model = await resolveRuntimeModel(id, required)
  if (model.provider !== config.provider) throw new Error('O provedor mudou durante a seleção; tente novamente')
  const key = providerConfigKey(config)
  if (cached?.key !== key) {
    cached = { key, client: new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      ...(config.provider === 'foundry' ? { defaultHeaders: { 'api-key': config.apiKey, Authorization: null } } : {}),
      timeout: RETRY_CONFIG.timeoutMs,
      maxRetries: RETRY_CONFIG.maxRetries,
    }) }
  }
  return { client: cached.client, model }
}
