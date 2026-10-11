import { z } from 'zod'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
const jsonValue: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(),
  z.array(jsonValue), z.record(jsonValue),
]))

export const AlixMessageExtrasSchema = z.object({
  metadata: z.record(jsonValue).optional(),
  toolsUsed: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  audit: z.record(jsonValue).nullable().optional(),
  intent: z.string().optional(),
}).strip()

export type AlixMessageExtras = z.infer<typeof AlixMessageExtrasSchema>

/** Cada campo é validado separadamente: um extra legado inválido não apaga os demais. */
export function parseAlixMessageExtras(input: unknown): AlixMessageExtras {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const source = input as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries(AlixMessageExtrasSchema.shape)) {
    if (source[key] === undefined) continue
    try {
      // A representação JSON remove propriedades opcionais undefined antes da validação.
      const parsed = schema.safeParse(JSON.parse(JSON.stringify(source[key])))
      if (parsed.success && parsed.data !== undefined) result[key] = parsed.data
    } catch {
      // Valores não serializáveis não entram no JSONB.
    }
  }
  return AlixMessageExtrasSchema.parse(result)
}

export function alixMessageModel(extras: AlixMessageExtras): string | null {
  const routing = extras.metadata?.routing
  if (!routing || typeof routing !== 'object' || Array.isArray(routing)) return null
  return typeof routing.model === 'string' && routing.model.trim() ? routing.model : null
}

/** Backfill só preenche ausências; valores atuais, inclusive null/arrays vazios, prevalecem. */
export function fillMissingAlixMessageExtras(current: unknown, incoming: AlixMessageExtras): Record<string, JsonValue> {
  const parsed = z.record(jsonValue).safeParse(current)
  const existing = parsed.success ? parsed.data : {}
  const fill = (oldValue: JsonValue | undefined, newValue: JsonValue): JsonValue => {
    if (oldValue === undefined) return newValue
    if (oldValue && newValue && typeof oldValue === 'object' && typeof newValue === 'object'
      && !Array.isArray(oldValue) && !Array.isArray(newValue)) {
      const merged = { ...oldValue }
      for (const [key, value] of Object.entries(newValue)) merged[key] = fill(merged[key], value)
      return merged
    }
    return oldValue
  }
  return fill(existing, JSON.parse(JSON.stringify(incoming)) as JsonValue) as Record<string, JsonValue>
}
