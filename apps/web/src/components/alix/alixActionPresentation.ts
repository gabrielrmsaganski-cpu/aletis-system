export interface AlixActionScope { sessionId?: string | null; clienteId?: string | null }
export interface AlixScopedAction { sessionId?: string; clienteId?: string | null; contextClienteId?: string | null }
export interface AlixActionReceipt {
  id: string
  toolName?: string
  executionStatus?: 'running' | 'completed' | 'failed' | 'unknown'
  outcome?: 'read' | 'prepared' | 'executed' | 'failed' | 'unknown'
  executed?: boolean
  prepared?: boolean
}

export function actionMatchesScope(action: AlixScopedAction, scope: AlixActionScope): boolean {
  if (!scope.sessionId || action.sessionId !== scope.sessionId) return false
  const sourceClient = Object.prototype.hasOwnProperty.call(action, 'contextClienteId') ? action.contextClienteId : action.clienteId
  return (sourceClient || null) === (scope.clienteId || null)
}

export function actionReceiptLabel(receipt: AlixActionReceipt): string {
  if (receipt.executionStatus === 'running') return 'Execução em andamento'
  if (receipt.executionStatus === 'failed' || receipt.outcome === 'failed') return 'Ação não concluída'
  if (receipt.executionStatus !== 'completed') return 'Resultado ainda não confirmado'
  if (receipt.outcome === 'prepared' || receipt.prepared === true) return 'Preparado · execução final pendente'
  if (receipt.outcome === 'executed' && receipt.executed === true) return 'Ação concluída'
  if (receipt.outcome === 'read') return 'Consulta concluída'
  return 'Resultado ainda não confirmado'
}
