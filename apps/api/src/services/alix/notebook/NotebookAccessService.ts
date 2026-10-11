import type { AlixUser } from '../../../middleware/alixAuth.js'
import { resolveClienteId } from '../../../db/ClienteRepository.js'
import { alixAccessError, assertAlixSessionAccess, filterAlixSessionResources, isAlixAccessEnforced, isAlixAdmin } from '../AlixAccessService.js'
import type { AlixNotebook, NotebookSourceRef } from './AlixNotebookService.js'

export const NOTEBOOK_UNAVAILABLE = 'Notebook não encontrado ou indisponível para este usuário.'
type NotebookScope = Pick<AlixNotebook, 'sessionId' | 'clienteId' | 'sources'>

/** Sessões e fontes seguem a autoridade existente da ALIX, inclusive legados compartilhados. */
export async function assertNotebookScopeAccess(user: AlixUser | undefined, scope: NotebookScope): Promise<void> {
  if (!isAlixAccessEnforced(user) || isAlixAdmin(user)) return
  if (!scope.sessionId) throw alixAccessError(404, NOTEBOOK_UNAVAILABLE)
  const session = await assertAlixSessionAccess(user, scope.sessionId)
  if (session.clienteId && scope.clienteId) {
    const [sessionClient, notebookClient] = await Promise.all([resolveClienteId(session.clienteId), resolveClienteId(scope.clienteId)])
    if (sessionClient !== notebookClient) throw alixAccessError(404, NOTEBOOK_UNAVAILABLE)
  }
  await assertNotebookSourcesAccess(user, scope.sources)
}

export async function assertNotebookSourcesAccess(user: AlixUser | undefined, sources: Pick<NotebookSourceRef, 'sessionId'>[]): Promise<void> {
  if (!isAlixAccessEnforced(user) || isAlixAdmin(user)) return
  const ids = [...new Set(sources.map(source => source.sessionId))]
  for (const sessionId of ids) await assertAlixSessionAccess(user, sessionId)
}

export async function filterNotebookScopeAccess(user: AlixUser | undefined, notebooks: AlixNotebook[]): Promise<AlixNotebook[]> {
  const visible = await filterAlixSessionResources(user, notebooks)
  if (!isAlixAccessEnforced(user) || isAlixAdmin(user)) return visible
  const result: AlixNotebook[] = []
  for (const notebook of visible) {
    try { await assertNotebookScopeAccess(user, notebook); result.push(notebook) }
    catch (error) {
      // Negação não revela o caso na lista. Falha da autoridade interrompe a operação.
      if ((error as { statusCode?: number }).statusCode !== 404) throw error
    }
  }
  return result
}
