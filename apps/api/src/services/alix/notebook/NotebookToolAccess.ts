import type { AlixUser } from '../../../middleware/alixAuth.js'
import { findInternalUserById } from '../../../lib/internal-auth.js'
import { resolveClienteId } from '../../../db/ClienteRepository.js'
import { getAlixTurnContext } from '../AlixTurnContext.js'
import { alixAccessError, assertAlixSessionAccess } from '../AlixAccessService.js'
import { assertNotebookScopeAccess, assertNotebookSourcesAccess, NOTEBOOK_UNAVAILABLE } from './NotebookAccessService.js'
import type { AlixNotebookService } from './AlixNotebookService.js'

/** Identidade vem exclusivamente do turno criado pelo servidor, nunca do JSON da ferramenta. */
export function notebookToolUser(sessionId: string): AlixUser {
  const turn = getAlixTurnContext()
  const actorId = turn?.actor?.id?.trim()
  if (!turn || turn.sessionId !== sessionId || !actorId || ['anonymous', 'unknown'].includes(actorId)) {
    throw alixAccessError(401, 'A identidade autenticada deste turno não está disponível. Retome a operação na conversa autorizada.')
  }
  const internal = findInternalUserById(actorId)
  const administrators = new Set((process.env.ALIX_ADMIN_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean))
  return {
    id: actorId, sub: actorId, consultorId: internal?.consultorId || actorId,
    nome: internal?.nome || turn.actor?.nome || 'Consultor',
    role: administrators.has(actorId) ? 'admin_master' : 'consultor',
    authSource: internal ? 'internal' : 'legacy_jwt',
  }
}

export async function authorizeNotebookToolInput(
  service: AlixNotebookService,
  sessionId: string,
  contextClienteId: string | undefined,
  input: Record<string, unknown>,
  sources: Array<{ sessionId: string; documentId: string }>,
): Promise<Record<string, unknown>> {
  const user = notebookToolUser(sessionId)
  await assertAlixSessionAccess(user, sessionId)
  const activeClient = getAlixTurnContext()?.clienteId || contextClienteId
  const suppliedClient = String(input.clienteId || '').trim() || undefined
  const [canonicalActive, canonicalSupplied] = await Promise.all([
    activeClient ? resolveClienteId(activeClient) : undefined,
    suppliedClient ? resolveClienteId(suppliedClient) : undefined,
  ])
  if (canonicalActive && canonicalSupplied && canonicalActive !== canonicalSupplied) {
    throw alixAccessError(403, 'O cliente solicitado difere do cliente desta conversa. Use o contexto correto.')
  }
  const clienteId = canonicalActive || canonicalSupplied
  await assertNotebookScopeAccess(user, { sessionId, clienteId, sources: [] })
  if (input.sessionId !== undefined) await assertAlixSessionAccess(user, String(input.sessionId).trim())
  if (sources.length) await assertNotebookSourcesAccess(user, sources)
  if (input.notebookId !== undefined) {
    const notebook = await service.get(String(input.notebookId), { strict: true })
    if (!notebook) throw alixAccessError(404, NOTEBOOK_UNAVAILABLE)
    await assertNotebookScopeAccess(user, notebook)
    if (clienteId && notebook.clienteId && await resolveClienteId(notebook.clienteId) !== clienteId) {
      throw alixAccessError(404, NOTEBOOK_UNAVAILABLE)
    }
  }
  return { ...input, clienteId }
}

export function notebookToolError(error: unknown): { ok: false; success: false; completed: false; code: string; error: string } {
  const status = (error as { statusCode?: number } | undefined)?.statusCode
  const denied = Boolean(status && status >= 400 && status < 500)
  return {
    ok: false, success: false, completed: false,
    code: denied ? 'NOTEBOOK_ACCESS_DENIED' : 'NOTEBOOK_ACCESS_UNAVAILABLE',
    error: denied ? status === 404 ? NOTEBOOK_UNAVAILABLE : (error as Error).message : 'Não foi possível conferir o acesso ou concluir a operação no Notebook. Não considere o trabalho concluído.',
  }
}
