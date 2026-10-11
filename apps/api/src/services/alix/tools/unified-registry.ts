// ============================================================
// ALETIS — ALIX Unified Tool Registry
// Camada tipada única para tools do Orchestrator e executores
// legados do AlixService. O objetivo é tirar tools de mapas soltos
// e centralizar risco, dono e confirmação humana.
// ============================================================

import type {
  LLMTool,
  LLMToolHandler,
  LLMToolRegistry,
} from '../../llm/OpenAIClient.js'

export type AlixToolOwner =
  | 'orchestrator'
  | 'legacy-alix'
  | 'crm-writer'
  | 'doc-generator'
  | 'power-tool'

export type AlixToolRisk = 'read' | 'compute' | 'generate' | 'write' | 'external'

export interface AlixToolMeta {
  owner: AlixToolOwner
  risk: AlixToolRisk
  requiresConfirmation?: boolean
  tags?: string[]
}

export interface AlixToolEntry<Input extends Record<string, unknown> = Record<string, unknown>, Output = unknown> {
  spec: LLMTool
  handler: (input: Input) => Promise<Output> | Output
  meta: AlixToolMeta
}

export interface AlixExecutorEntry<Input = unknown, Output = unknown> {
  handler: (payload: Input) => Promise<Output> | Output
  meta: AlixToolMeta & { requiresConfirmation: true }
}

export type AlixExecutorRegistry = Record<string, AlixExecutorEntry>

export function defineAlixTool<Input extends Record<string, unknown>, Output>(
  entry: AlixToolEntry<Input, Output>,
): AlixToolEntry<Input, Output> {
  return entry
}

export function createLLMRegistry(
  entries: AlixToolEntry[],
): { tools: LLMTool[]; registry: LLMToolRegistry; meta: Record<string, AlixToolMeta> } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}
  const meta: Record<string, AlixToolMeta> = {}

  for (const entry of entries) {
    tools.push(entry.spec)
    registry[entry.spec.name] = {
      spec: entry.spec,
      handler: entry.handler as LLMToolHandler,
    }
    meta[entry.spec.name] = entry.meta
  }

  return { tools, registry, meta }
}

export function mountLLMRegistry(
  targetTools: LLMTool[],
  targetRegistry: LLMToolRegistry,
  entries: AlixToolEntry[],
): Record<string, AlixToolMeta> {
  const built = createLLMRegistry(entries)
  for (const tool of built.tools) targetTools.push(tool)
  for (const [name, entry] of Object.entries(built.registry)) targetRegistry[name] = entry
  return built.meta
}

export function createExecutorRegistry(entries: AlixExecutorRegistry): AlixExecutorRegistry {
  return entries
}

export function getExecutorFromRegistry(
  registry: AlixExecutorRegistry,
  toolName: string,
): ((payload: unknown) => Promise<unknown>) | null {
  const entry = registry[toolName]
  if (!entry) return null
  return async (payload: unknown) => entry.handler(payload)
}
