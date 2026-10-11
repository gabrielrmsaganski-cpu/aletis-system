import { AsyncLocalStorage } from 'node:async_hooks'

export interface AlixTurnContext {
  sessionId: string
  clienteId?: string
  auditTrailKey?: string
  actor?: { id?: string; nome?: string }
  actionPolicy?: 'prepare_only'
}

const turnContext = new AsyncLocalStorage<AlixTurnContext>()
export const getAlixTurnContext = (): AlixTurnContext | undefined => turnContext.getStore()
export function withAlixTurnContext<T>(context: AlixTurnContext, callback: () => T): T {
  return turnContext.run({ ...context, actor: context.actor ?? turnContext.getStore()?.actor,
    actionPolicy: context.actionPolicy ?? turnContext.getStore()?.actionPolicy }, callback)
}
