export interface ConversationAttachment { uploadId: string; nome: string; mime: string; tamanho: number; disponivel: boolean }
export interface ConversationMessage {
  id: string; de: 'cliente' | 'consultor' | 'sistema'; autorNome: string; texto: string; criadoEm: string; lidaEm?: string
  anexos?: ConversationAttachment[]; solicitacao?: { id: string; titulo: string }
}
export interface ConversationPayload { texto: string; uploadIds: string[]; pendenciaId?: string }
export interface ConversationSendIntent { key: string; payload: ConversationPayload }
export function mergeConversation(previous: ConversationMessage[], incoming: ConversationMessage[]): ConversationMessage[] {
  const rows = new Map(previous.map(row => [row.id, row]))
  for (const row of incoming) rows.set(row.id, { ...row, lidaEm: row.lidaEm || rows.get(row.id)?.lidaEm })
  return [...rows.values()].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id))
}
export function conversationSendIntent(previous: ConversationSendIntent | null, payload: ConversationPayload, createKey: () => string): ConversationSendIntent {
  const normalized = { texto: payload.texto.trim(), uploadIds: [...new Set(payload.uploadIds)].sort(), ...(payload.pendenciaId ? { pendenciaId: payload.pendenciaId } : {}) }
  if (!normalized.texto && !normalized.uploadIds.length) throw new Error('Escreva uma mensagem ou escolha um arquivo.')
  if (normalized.texto.length > 2000 || normalized.uploadIds.length > 10) throw new Error('A mensagem aceita até 2.000 caracteres e 10 arquivos.')
  if (previous) {
    if (JSON.stringify(previous.payload) !== JSON.stringify(normalized)) throw new Error('Confirme o envio anterior antes de alterar a mensagem.')
    return previous
  }
  return { key: createKey(), payload: normalized }
}
export function conversationDownloadPath(mode: 'cliente' | 'equipe', clienteId: string, uploadId: string): string {
  return mode === 'cliente' ? `/api/portal/uploads/${encodeURIComponent(uploadId)}`
    : `/api/clientes/${encodeURIComponent(clienteId)}/portal/uploads/${encodeURIComponent(uploadId)}/download`
}
