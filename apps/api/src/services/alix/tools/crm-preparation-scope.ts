import type { LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { getAlixTurnContext } from '../AlixTurnContext.js'

type CrmClient = Record<string, unknown> & { id?: unknown }
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '')

/** A consulta de carteira durante um preparo também fica no cliente ativo. */
export function preparationCrmClients<T extends CrmClient>(clients: T[]): T[] {
  const context = getAlixTurnContext()
  return context?.actionPolicy === 'prepare_only'
    ? clients.filter(client => client.id === context.clienteId)
    : clients
}

/** IDs, nome ou CPF informados pelo modelo não ampliam o escopo da missão. */
export function scopePreparationCrmRegistry(registry: LLMToolRegistry, clients: () => CrmClient[]): LLMToolRegistry {
  return Object.fromEntries(Object.entries(registry).map(([name, entry]) => [name, { ...entry, handler: async (input: Record<string, unknown>) => {
    const context = getAlixTurnContext()
    if (context?.actionPolicy !== 'prepare_only') return entry.handler(input)
    const active = context.clienteId && clients().find(client => client.id === context.clienteId)
    const conflict = !active || [input.clienteId, input.id].some(value => value != null && String(value).trim() !== context.clienteId)
      || (input.cpfCnpj != null && digits(input.cpfCnpj) !== digits(active.cpfCnpj ?? active.cpfcnpj ?? active.cpf ?? active.cnpj))
      || (input.nome != null && !String(active.nome || '').toLocaleLowerCase('pt-BR').includes(String(input.nome).toLocaleLowerCase('pt-BR')))
    if (conflict) return { ok: false, code: 'ALIX_PREPARATION_CLIENT_SCOPE', error: 'Esta preparação consulta somente o cliente ativo. Use o cadastro e os documentos desse cliente.' }
    return entry.handler({ ...input, clienteId: context.clienteId, ...(name === 'buscar_cliente' ? { id: context.clienteId } : {}) })
  } }]))
}
