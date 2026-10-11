// ============================================================
// ALETIS - modelos lógicos; disponibilidade resolvida pelo catálogo do provedor.
// ============================================================

import type { LLMUsage, ModelInfo } from './types.js'

export const OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

export const ALIX_USE_LLM = (process.env.ALIX_USE_LLM || 'true').toLowerCase() !== 'false'
export const ALIX_STREAMING_ENABLED = (process.env.ALIX_STREAMING_ENABLED || 'true').toLowerCase() !== 'false'
export const ALIX_MULTIAGENT_ENABLED = (process.env.ALIX_MULTIAGENT_ENABLED || 'true').toLowerCase() !== 'false'
export const HISTORY_WINDOW = Math.max(6, Number(process.env.ALIX_HISTORY_WINDOW || 30))

const COMMON: ModelInfo['capabilities'] = [
  'chat',
  'streaming',
  'tool_calling',
  'structured_outputs',
  'reasoning',
  'vision',
  'web_search',
  'file_search',
]

export const MODEL_REGISTRY: Record<string, ModelInfo> = {
  'gpt-6-astra': {
    id: 'gpt-6-astra',
    provider: 'openai-responses',
    capabilities: COMMON,
    inputUsdPerM: 10,
    cachedInputUsdPerM: 1,
    outputUsdPerM: 50,
    longContextPricing: { thresholdInputTokens: 272_000, inputUsdPerM: 20, cachedInputUsdPerM: 2, outputUsdPerM: 75 },
    description: 'Raciocínio aprofundado para tarefas de maior complexidade',
  },
  'gpt-5.6-sol': {
    id: 'gpt-5.6-sol',
    provider: 'openai-responses',
    capabilities: COMMON,
    inputUsdPerM: 4,
    cachedInputUsdPerM: 0.4,
    outputUsdPerM: 20,
    longContextPricing: { thresholdInputTokens: 272_000, inputUsdPerM: 8, cachedInputUsdPerM: 0.8, outputUsdPerM: 30 },
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    description: 'Analises profissionais de maior complexidade e impacto',
  },
  'gpt-5.6-terra': {
    id: 'gpt-5.6-terra',
    provider: 'openai-responses',
    capabilities: COMMON,
    inputUsdPerM: 2,
    cachedInputUsdPerM: 0.2,
    outputUsdPerM: 12,
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    description: 'Modelo principal, equilibrando inteligencia, latencia e custo',
  },
  'gpt-5.6-luna': {
    id: 'gpt-5.6-luna',
    provider: 'openai-responses',
    capabilities: COMMON,
    inputUsdPerM: 0.2,
    cachedInputUsdPerM: 0.02,
    outputUsdPerM: 1.2,
    contextWindow: 1_050_000,
    maxOutputTokens: 128_000,
    description: 'Classificacao, extracao e tarefas de alto volume',
  },
  'text-embedding-3-small': {
    id: 'text-embedding-3-small',
    provider: 'openai-embeddings',
    capabilities: ['embeddings'],
    inputUsdPerM: 0.02,
    description: 'Embeddings para busca semantica e RAG',
  },
  'text-embedding-3-large': {
    id: 'text-embedding-3-large',
    provider: 'openai-embeddings',
    capabilities: ['embeddings'],
    inputUsdPerM: 0.13,
    description: 'Embeddings de maior qualidade para recuperacao critica',
  },
  'gpt-4o-transcribe': {
    id: 'gpt-4o-transcribe',
    provider: 'openai-audio',
    capabilities: ['transcription'],
    description: 'Transcricao de audio',
  },
  'tts-1-hd': {
    id: 'tts-1-hd',
    provider: 'openai-audio',
    capabilities: ['speech'],
    description: 'Sintese de voz de alta qualidade',
  },
}

const ROLE_DEFAULTS: Record<string, string> = {
  orchestrator: 'gpt-5.6-terra',
  deal_analyzer: 'gpt-5.6-sol',
  onboarding_dossier: 'gpt-5.6-sol',
  crm_writer: 'gpt-5.6-terra',
  client_intelligence: 'gpt-5.6-terra',
  doc_generator: 'gpt-5.6-terra',
  web_researcher: 'gpt-5.6-terra',
  doc_analyzer: 'gpt-5.6-sol',
  doc_extractor: 'gpt-5.6-luna',
  classifier: 'gpt-5.6-luna',
  summarizer: 'gpt-5.6-luna',
  memory: 'gpt-5.6-luna',
  whatsapp: 'gpt-5.6-luna',
  default: 'gpt-5.6-terra',
}

const ROLE_ENV: Record<string, string> = {
  orchestrator: 'ALIX_ORCHESTRATOR_MODEL',
  deal_analyzer: 'ALIX_DEAL_ANALYZER_MODEL',
  onboarding_dossier: 'ALIX_ONBOARDING_DOSSIER_MODEL',
  crm_writer: 'ALIX_CRM_WRITER_MODEL',
  client_intelligence: 'ALIX_CLIENT_INTELLIGENCE_MODEL',
  doc_generator: 'ALIX_DOC_GENERATOR_MODEL',
  web_researcher: 'ALIX_WEB_RESEARCHER_MODEL',
  doc_analyzer: 'ALIX_DOC_ANALYZER_MODEL',
  doc_extractor: 'ALIX_DOC_EXTRACTOR_MODEL',
  classifier: 'ALIX_DOC_CLASSIFIER_MODEL',
  summarizer: 'ALIX_SUMMARIZER_MODEL',
  memory: 'ALIX_MEMORY_MODEL',
  whatsapp: 'WHATSAPP_IA_MODEL',
  default: 'ALIX_DEFAULT_MODEL',
}

export function getModelForRole(role: string): string {
  const normalizedRole = role in ROLE_DEFAULTS ? role : 'default'
  const envName = ROLE_ENV[normalizedRole]
  const configured = envName ? process.env[envName]?.trim() : undefined
  return configured && MODEL_REGISTRY[configured] ? configured : ROLE_DEFAULTS[normalizedRole]
}

export const OPENAI_MODEL_PRIMARY = getModelForRole('default')
export const OPENAI_MODEL_FAST = getModelForRole('doc_extractor')
export const OPENAI_MODEL_DEEP = getModelForRole('deal_analyzer')

export function validateModel(model: string): { valid: boolean; error?: string } {
  const normalized = model.trim().toLowerCase()
  if (!normalized) return { valid: false, error: 'Modelo não informado' }
  if (!MODEL_REGISTRY[normalized]) {
    return { valid: false, error: `Modelo fora do catálogo lógico ALETIS: ${model}` }
  }
  return { valid: true }
}

export function estimateCost(model: string, usage: LLMUsage): number {
  // Referência pública OpenAI por chamada; não representa a cobrança de Foundry.
  const modelInfo = MODEL_REGISTRY[model] || Object.values(MODEL_REGISTRY).find((item) => model.startsWith(`${item.id}-`))
  const price = modelInfo?.longContextPricing && usage.input_tokens > modelInfo.longContextPricing.thresholdInputTokens
    ? modelInfo.longContextPricing : modelInfo
  if (!price?.inputUsdPerM) return 0
  const cached = Math.min(usage.cached_tokens || usage.cache_read_input_tokens || 0, usage.input_tokens)
  const cacheWrite = Math.min(usage.cache_creation_input_tokens || 0, usage.input_tokens - cached)
  const uncached = Math.max(0, usage.input_tokens - cached - cacheWrite)
  const input = (uncached / 1_000_000) * price.inputUsdPerM
  const cacheWriteInput = (cacheWrite / 1_000_000) * price.inputUsdPerM * 1.25
  const cachedInput = (cached / 1_000_000) * (price.cachedInputUsdPerM ?? price.inputUsdPerM)
  const output = (usage.output_tokens / 1_000_000) * (price.outputUsdPerM || 0)
  return Number((input + cacheWriteInput + cachedInput + output).toFixed(6))
}

export const RETRY_CONFIG = {
  maxRetries: Math.max(0, Number(process.env.OPENAI_MAX_RETRIES || 3)),
  timeoutMs: Math.max(5_000, Number(process.env.OPENAI_TIMEOUT_MS || 120_000)),
}
