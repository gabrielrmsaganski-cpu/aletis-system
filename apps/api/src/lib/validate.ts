/**
 * validate.ts — helper de validação Zod para handlers Fastify.
 *
 * Padrão de uso:
 *   const body = parseBody(BodySchema, request, reply)
 *   if (!body) return // reply.send já foi chamado com 422
 *
 * Mantém o envelope `{ success: false, error, code, issues }` consistente
 * com o restante das rotas. Nunca lança — sempre devolve null em falha
 * para que o handler decida o fluxo.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError, type ZodSchema } from 'zod'

export interface ValidationFailure {
  success: false
  error: string
  code: 'VALIDATION_ERROR'
  issues: Array<{ path: (string | number)[]; message: string; code: string }>
}

function formatZodError(err: ZodError): ValidationFailure {
  const issues = err.errors.map((i) => ({
    path: i.path,
    message: i.message,
    code: i.code,
  }))
  const summary = issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join(' · ')
  return {
    success: false,
    error: `Dados inválidos — ${summary}`,
    code: 'VALIDATION_ERROR',
    issues,
  }
}

/** Parse body com schema Zod. Retorna T em sucesso ou null e responde 422. */
export function parseBody<T>(
  schema: ZodSchema<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | null {
  const result = schema.safeParse(request.body)
  if (!result.success) {
    reply.status(422).send(formatZodError(result.error))
    return null
  }
  return result.data
}

/** Parse params (req.params) com schema Zod. */
export function parseParams<T>(
  schema: ZodSchema<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | null {
  const result = schema.safeParse(request.params)
  if (!result.success) {
    reply.status(400).send(formatZodError(result.error))
    return null
  }
  return result.data
}

/** Parse querystring (req.query) com schema Zod. */
export function parseQuery<T>(
  schema: ZodSchema<T>,
  request: FastifyRequest,
  reply: FastifyReply,
): T | null {
  const result = schema.safeParse(request.query)
  if (!result.success) {
    reply.status(400).send(formatZodError(result.error))
    return null
  }
  return result.data
}
