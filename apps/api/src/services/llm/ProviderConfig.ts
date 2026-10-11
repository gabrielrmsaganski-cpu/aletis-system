import { createHash } from 'node:crypto'
import type { LLMProviderName } from './types.js'

/** Configuração interna: nunca serializar apiKey em rotas ou telemetria. */
export interface LLMProviderConfig {
  provider: LLMProviderName
  configured: boolean
  apiKey: string
  baseURL: string
  missing: string[]
  resourceName?: string
  resourceGroup?: string
  subscriptionId?: string
  deploymentMap: Record<string, string>
}

function normalizeFoundryEndpoint(raw: string): string {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return ''
    // O endpoint é do recurso; URLs de projetos ou deployments não são intercambiáveis.
    if (!['/', '', '/openai/v1', '/openai/v1/'].includes(url.pathname)) return ''
    return `${url.origin}/openai/v1`
  } catch {
    return ''
  }
}

export function getLLMProviderConfig(env: NodeJS.ProcessEnv = process.env): LLMProviderConfig {
  const selected = (env.ALIX_LLM_PROVIDER || 'openai').trim().toLowerCase()
  const provider: LLMProviderName = ['foundry', 'azure', 'azure-openai'].includes(selected) ? 'foundry' : 'openai'
  const missing: string[] = []
  if (!['openai', 'foundry', 'azure', 'azure-openai'].includes(selected)) missing.push('ALIX_LLM_PROVIDER válido')
  const apiKey = (provider === 'foundry' ? env.AZURE_OPENAI_API_KEY : env.OPENAI_API_KEY)?.trim() || ''
  if (!apiKey) missing.push(provider === 'foundry' ? 'AZURE_OPENAI_API_KEY' : 'OPENAI_API_KEY')
  const baseURL = provider === 'foundry'
    ? normalizeFoundryEndpoint(env.AZURE_OPENAI_ENDPOINT?.trim() || '')
    : 'https://api.openai.com/v1'
  if (!baseURL) missing.push('AZURE_OPENAI_ENDPOINT válido (URL do recurso)')
  let deploymentMap: Record<string, string> = {}
  if (env.ALIX_FOUNDRY_DEPLOYMENTS?.trim()) {
    try {
      const parsed: unknown = JSON.parse(env.ALIX_FOUNDRY_DEPLOYMENTS)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || Object.values(parsed).some((value) => typeof value !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(value))) throw new Error('invalid')
      deploymentMap = parsed as Record<string, string>
    } catch {
      missing.push('ALIX_FOUNDRY_DEPLOYMENTS válido (objeto modelo:deployment)')
    }
  }
  const derivedName = baseURL && provider === 'foundry' ? new URL(baseURL).hostname.split('.')[0] : undefined
  return {
    provider, apiKey, baseURL, missing, configured: missing.length === 0,
    resourceName: env.AZURE_OPENAI_RESOURCE_NAME?.trim() || derivedName,
    resourceGroup: env.AZURE_OPENAI_RESOURCE_GROUP?.trim() || undefined,
    subscriptionId: env.AZURE_SUBSCRIPTION_ID?.trim() || undefined,
    deploymentMap,
  }
}

export function providerConfigKey(config: LLMProviderConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex')
}

export function isPrimaryLLMEnabled(): boolean {
  return !['false', '0', 'off'].includes((process.env.ALIX_USE_LLM || 'true').toLowerCase())
    && getLLMProviderConfig().configured
}

export function isOpenAIAuxiliaryEnabled(): boolean {
  return !['false', '0', 'off'].includes((process.env.ALIX_USE_LLM || 'true').toLowerCase())
    && Boolean(process.env.OPENAI_API_KEY?.trim())
}
