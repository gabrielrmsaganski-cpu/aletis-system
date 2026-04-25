// ============================================================
// safe-handler — envelope universal para handlers de tools
// ============================================================
// Padroniza tratamento de erro/timeout em TODOS os tool handlers da
// ALIX. Garante que:
//
//   1. Handler nunca faz throw — sempre retorna estrutura consumível
//   2. Timeout por tool (default 20s, configurável)
//   3. Log estruturado de toda invocação (tool, duração, ok/erro)
//   4. Erro vira objeto { error, code, tool, latencyMs } auditável
//   5. LLM vê a falha e pode reagir, em vez do loop quebrar
//
// Filosofia: melhor a tool responder "deu ruim X" que o loop inteiro
// do Claude morrer silenciosamente.
// ============================================================
import type { ClaudeToolRegistry } from '../../llm/ClaudeFoundryClient.js'

export interface SafeHandlerOpts {
  /** Timeout em ms (default 20s; 60s para tools lentas como enriquecimento). */
  timeoutMs?: number
  /** Nome lógico da tool — usado em logs. */
  name: string
}

const DEFAULT_TIMEOUT_MS = 20_000

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/**
 * Envolve um handler async com timeout + catch universal.
 * Se `result.error` já vier do próprio handler, preserva.
 * Se throw, captura e transforma em objeto serializável.
 */
export function safeHandler<T>(
  handler: (input: Record<string, unknown>) => Promise<T>,
  opts: SafeHandlerOpts,
): (input: Record<string, unknown>) => Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return async (input) => {
    const t0 = Date.now()
    const toolName = opts.name
    try {
      // Race com timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error(`timeout após ${timeoutMs}ms`)), timeoutMs)
        if (typeof t.unref === 'function') t.unref()
      })
      const result = await Promise.race([handler(input), timeoutPromise])
      const latencyMs = Date.now() - t0
      // Log mínimo — habilita observability futuro (Fase E)
      if (process.env.ALIX_TOOL_LOG === 'true') {
        console.log(`[tool:${toolName}] ok em ${latencyMs}ms`)
      }
      // Se o handler já sinalizou erro via { error: ... }, propaga puro
      if (isPlainObject(result) && typeof (result as any).error === 'string') {
        return { ...(result as any), tool: toolName, latencyMs }
      }
      return result
    } catch (err) {
      const latencyMs = Date.now() - t0
      const message = (err as Error)?.message || 'erro desconhecido'
      const code = (err as any)?.code || 'TOOL_UNCAUGHT'
      console.warn(`[tool:${toolName}] FALHOU em ${latencyMs}ms: ${message}`)
      return {
        error: message,
        code,
        tool: toolName,
        latencyMs,
        // Pistas para o LLM saber como reagir
        orientacao: isTimeoutLike(message)
          ? 'A ferramenta demorou demais. Tente novamente sem ela ou com parâmetros mais restritos.'
          : 'Handler falhou. Informe o usuário do erro e ofereça alternativas quando possível — NÃO invente dados.',
      }
    }
  }
}

function isTimeoutLike(msg: string): boolean {
  return /timeout|abort|deadline/i.test(msg)
}

/**
 * Aplica safeHandler em todos os entries de um registry de tools.
 * Uso: `safeWrapRegistry(registry, { defaultTimeoutMs: 30000 })`
 */
export function safeWrapRegistry(
  registry: ClaudeToolRegistry,
  opts: { defaultTimeoutMs?: number; overrides?: Record<string, number> } = {},
): ClaudeToolRegistry {
  const wrapped: ClaudeToolRegistry = {}
  for (const [name, entry] of Object.entries(registry)) {
    const timeoutMs = opts.overrides?.[name] ?? opts.defaultTimeoutMs
    wrapped[name] = {
      spec: entry.spec,
      handler: safeHandler(entry.handler as any, { name, timeoutMs }),
    }
  }
  return wrapped
}
