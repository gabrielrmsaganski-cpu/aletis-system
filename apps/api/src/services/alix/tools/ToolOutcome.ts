import { randomUUID } from 'node:crypto'
import type { LLMToolRegistry } from '../../llm/types.js'

export type ToolOutcome = 'read' | 'prepared' | 'executed' | 'failed' | 'unknown'
export interface AlixToolProgress {
  id: string
  tool: string
  phase: 'started' | 'completed' | 'failed'
  agent?: string
  durationMs?: number
  outcome?: ToolOutcome
}

export function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined
}

/** Avalia somente o envelope operacional; texto gerado pelo modelo não é recibo. */
export function toolFailure(result: unknown): string | undefined {
  const value = objectValue(result)
  if (!value) return undefined
  const meta = objectValue(value.metadata)
  const error = value.error || meta?.error
  if (error) return typeof error === 'string' ? error : 'A ferramenta retornou erro.'
  if (value.ok === false || value.success === false || value.executed === false) {
    return typeof value.message === 'string' ? value.message : 'A ferramenta não confirmou a execução.'
  }
  return undefined
}

export function toolOutcome(name: string, result: unknown): ToolOutcome {
  if (toolFailure(result)) return 'failed'
  const value = objectValue(result)
  const meta = objectValue(value?.metadata)
  if (value?.pendingConfirmation === true || meta?.pendingConfirmation === true ||
    value?.queued === true || value?.modo === 'previa' || value?.dryRun === true ||
    (value?.imported === true && ['queued', 'processing'].includes(String(value.processingState))) ||
    (Array.isArray(value?.pendingConfirmations) && value.pendingConfirmations.length > 0)) return 'prepared'
  if (value?.executed === true || meta?.executed === true) return 'executed'
  if (/^(buscar|listar|consultar|ler_|ver_|contexto_|memoria_|briefing_|cotacoes_|pesquisar_|catalogo_|descobrir_)/.test(name)) return 'read'
  // ok:true também ocorre em previews e em chamadas sem persistência comprovada.
  return 'unknown'
}

export function observeToolRegistry(registry: LLMToolRegistry, opts: {
  onProgress?: (event: AlixToolProgress) => void
  onResult?: (name: string, input: Record<string, unknown>, result: unknown, durationMs: number) => void
  agent?: string
  signal?: AbortSignal
}): LLMToolRegistry {
  const observed: LLMToolRegistry = {}
  const emit = (event: AlixToolProgress) => { try { opts.onProgress?.(event) } catch { /* Transporte encerrado. */ } }
  for (const [name, entry] of Object.entries(registry)) {
    observed[name] = {
      spec: entry.spec,
      handler: async (input) => {
        opts.signal?.throwIfAborted()
        const id = randomUUID()
        const start = Date.now()
        emit({ id, tool: name, phase: 'started', agent: opts.agent })
        try {
          const result = await entry.handler(input)
          const durationMs = Date.now() - start
          const outcome = toolOutcome(name, result)
          opts.onResult?.(name, input, result, durationMs)
          emit({ id, tool: name, phase: outcome === 'failed' ? 'failed' : 'completed', agent: opts.agent, durationMs, outcome })
          return result
        } catch (error) {
          try { opts.onResult?.(name, input, { ok: false, error: error instanceof Error ? error.message : 'A ferramenta falhou.' }, Date.now() - start) } catch { /* Registro best-effort. */ }
          emit({ id, tool: name, phase: 'failed', agent: opts.agent, durationMs: Date.now() - start, outcome: 'failed' })
          throw error
        }
      },
    }
  }
  return observed
}
