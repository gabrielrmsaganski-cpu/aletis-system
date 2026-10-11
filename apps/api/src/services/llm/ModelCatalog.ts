import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { MODEL_REGISTRY } from './LLMConfig.js'
import { getLLMProviderConfig, providerConfigKey, type LLMProviderConfig } from './ProviderConfig.js'
import type { LLMProviderName, ModelCapability } from './types.js'

export type ModelAvailability = 'available' | 'unavailable' | 'unknown'
export interface RuntimeModel {
  id: string
  deployment: string
  provider: LLMProviderName
  availability: ModelAvailability
  capabilities: ModelCapability[]
  label: string
  protocols: Array<'responses' | 'chat_completions'>
  verifiedAt?: string
  verificationSource?: 'azure_arm_deployments' | 'openai_models'
}
export interface RuntimeModelCatalog {
  checkedAt: string
  verifiedAt?: string
  provider: LLMProviderName
  configured: boolean
  stale: boolean
  models: RuntimeModel[]
  error?: string
}

const MODEL_LABELS: Record<string, string> = {
  'gpt-6-astra': 'GPT-6 Astra',
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-5.6-luna': 'GPT-5.6 Luna',
}
const deploymentSchema = z.array(z.object({
  name: z.string(),
  properties: z.object({
    provisioningState: z.string(),
    model: z.object({ name: z.string() }),
    capabilities: z.record(z.unknown()).optional(),
  }),
}))
const openAIModelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) })
const execFileAsync = promisify(execFile)

async function discover(config: LLMProviderConfig): Promise<unknown> {
  if (config.provider === 'openai') {
    const response = await fetch(`${config.baseURL}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) throw new Error(`Catálogo OpenAI respondeu HTTP ${response.status}`)
    return response.json()
  }
  // /openai/v1/models lista o catálogo global, e NÃO comprova deployment neste recurso.
  if (!config.resourceGroup || !config.resourceName) throw new Error('Defina AZURE_OPENAI_RESOURCE_GROUP para verificar os deployments Foundry')
  const args = ['cognitiveservices', 'account', 'deployment', 'list', '--resource-group', config.resourceGroup,
    '--name', config.resourceName, '--output', 'json', '--only-show-errors']
  if (config.subscriptionId) args.push('--subscription', config.subscriptionId)
  try {
    const result = await execFileAsync('az', args, { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 })
    return JSON.parse(result.stdout) as unknown
  } catch {
    // stderr do CLI pode incluir dados de conta; apenas contexto operacional é público.
    throw new Error('Não foi possível verificar deployments Foundry pelo Azure CLI; confira sessão Azure e recurso configurado')
  }
}

function initialModels(config: LLMProviderConfig): RuntimeModel[] {
  return Object.entries(MODEL_LABELS).map(([id, label]) => ({
    id, label, provider: config.provider, deployment: config.deploymentMap[id] || id,
    availability: 'unknown', protocols: [],
    // Ferramentas web/file nativas precisam de verificação própria por provedor.
    capabilities: MODEL_REGISTRY[id].capabilities.filter((cap) => config.provider !== 'foundry' || !['web_search', 'file_search'].includes(cap)),
  }))
}

export function parseDiscoveredModels(config: LLMProviderConfig, raw: unknown, verifiedAt: string): RuntimeModel[] {
  const models = initialModels(config)
  if (config.provider === 'openai') {
    const ids = new Set(openAIModelsSchema.parse(raw).data.map((item) => item.id))
    return models.map((model) => ({ ...model,
      availability: ids.has(model.id) ? 'available' : 'unavailable',
      protocols: ['responses'], verifiedAt, verificationSource: 'openai_models',
    }))
  }
  const deployments = deploymentSchema.parse(raw)
  return models.map((model): RuntimeModel => {
    const requested = config.deploymentMap[model.id]
    const matches = deployments.filter((item) => item.properties.model.name === model.id && (!requested || item.name === requested))
    const deployment = matches.find((item) => item.properties.provisioningState === 'Succeeded'
      && String(item.properties.capabilities?.responses).toLowerCase() === 'true') || matches[0]
    const capabilities = deployment?.properties.capabilities
    const protocols: RuntimeModel['protocols'] = []
    if (String(capabilities?.responses).toLowerCase() === 'true') protocols.push('responses')
    if (String(capabilities?.chatCompletion).toLowerCase() === 'true') protocols.push('chat_completions')
    return { ...model, deployment: deployment?.name || model.deployment,
      availability: deployment?.properties.provisioningState === 'Succeeded' && protocols.includes('responses') ? 'available' : 'unavailable',
      protocols, verifiedAt, verificationSource: 'azure_arm_deployments',
    }
  })
}

/** Cache coalescente: nenhum subprocesso por chat; falhas não renovam a evidência. */
export class RuntimeModelCatalogService {
  private cache?: { key: string; expiresAt: number; value: RuntimeModelCatalog }
  private pending?: { key: string; promise: Promise<RuntimeModelCatalog> }

  constructor(private readonly deps: {
    config?: () => LLMProviderConfig
    discover?: (config: LLMProviderConfig) => Promise<unknown>
    now?: () => number
    ttlMs?: number
    failureTtlMs?: number
  } = {}) {}

  async get(): Promise<RuntimeModelCatalog> {
    const config = (this.deps.config || getLLMProviderConfig)()
    const now = this.deps.now || Date.now
    const key = providerConfigKey(config)
    if (this.cache?.key === key && this.cache.expiresAt > now()) return structuredClone(this.cache.value)
    if (this.pending?.key === key) return structuredClone(await this.pending.promise)
    const previous = this.cache?.key === key ? this.cache.value : undefined
    const refresh = async (): Promise<RuntimeModelCatalog> => {
      let value: RuntimeModelCatalog
      try {
        if (!config.configured) throw new Error(`Provedor não configurado: ${config.missing.join(', ')}`)
        const raw = await (this.deps.discover || discover)(config)
        const checkedAt = new Date(now()).toISOString()
        value = { checkedAt, verifiedAt: checkedAt, provider: config.provider, configured: true, stale: false,
          models: parseDiscoveredModels(config, raw, checkedAt) }
      } catch (error) {
        value = { checkedAt: new Date(now()).toISOString(), provider: config.provider, configured: config.configured,
          stale: Boolean(previous?.verifiedAt), verifiedAt: previous?.verifiedAt,
          models: (previous?.models || initialModels(config)).map((model) => ({ ...model, availability: 'unknown' })),
          error: error instanceof z.ZodError ? 'Catálogo retornou um formato inesperado' : (error as Error).message }
      }
      this.cache = { key, value, expiresAt: now() + (value.error ? this.deps.failureTtlMs ?? 10_000 : this.deps.ttlMs ?? 120_000) }
      return value
    }
    const promise = refresh()
    this.pending = { key, promise }
    try { return structuredClone(await promise) }
    finally { if (this.pending?.promise === promise) this.pending = undefined }
  }
}

const runtimeCatalog = new RuntimeModelCatalogService()
export async function getRuntimeModelCatalog(): Promise<RuntimeModelCatalog> {
  return runtimeCatalog.get()
}

export async function resolveRuntimeModel(id: string, required: ModelCapability[] = []): Promise<RuntimeModel> {
  const catalog = await getRuntimeModelCatalog()
  const model = catalog.models.find((item) => item.id === id)
  if (!model || model.availability !== 'available') throw new Error(`Modelo ${id} não disponível no provedor ${catalog.provider}. ${catalog.error || 'Confira os deployments e o catálogo.'}`)
  const missing = required.filter((capability) => !model.capabilities.includes(capability))
  if (missing.length) throw new Error(`Modelo ${id} sem capacidade validada: ${missing.join(', ')}`)
  return model
}
