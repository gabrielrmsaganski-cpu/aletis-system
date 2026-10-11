/** Identidade consolidada: o cadastro anterior continua arquivado no PostgreSQL. */
export interface ClientIdentityMerge {
  status: 'merged'
  canonicalId: string
  mergedAt: string
  operationId: string
}

export function mergedClientIdentity(value: unknown): ClientIdentityMerge | null {
  if (!value || typeof value !== 'object') return null
  const item = (value as Record<string, unknown>).identityMerge
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  if (record.status !== 'merged' || typeof record.canonicalId !== 'string' || !record.canonicalId.trim()) return null
  return record as unknown as ClientIdentityMerge
}

export function clientMergedError(canonicalId: string): Error & { code: string; statusCode: number; canonicalId: string } {
  return Object.assign(new Error('Este cadastro foi consolidado. Utilize o cliente canônico.'), {
    code: 'CLIENTE_MERGED', statusCode: 409, canonicalId,
  })
}

/** Aliases não entram em values()/size, logo não duplicam carteira nem indicadores. */
export class CanonicalClientMap<T extends { id: string }> extends Map<string, T> {
  private aliases = new Map<string, string>()

  canonicalId(id: string): string {
    const visited = new Set<string>()
    while (this.aliases.has(id)) {
      if (visited.has(id)) throw new Error('Ciclo inválido de identidades de cliente.')
      visited.add(id)
      id = this.aliases.get(id)!
    }
    return id
  }

  registerAlias(id: string, canonicalId: string): void {
    if (id === canonicalId || this.canonicalId(canonicalId) === id) throw new Error('Alias circular de cliente.')
    this.aliases.set(id, canonicalId)
    super.delete(id)
  }

  override get(id: string): T | undefined { return super.get(this.canonicalId(id)) }
  override has(id: string): boolean { return super.has(this.canonicalId(id)) }
  override set(id: string, value: T): this {
    const merged = mergedClientIdentity(value)
    if (merged) { this.registerAlias(id, merged.canonicalId); return this }
    const canonicalId = this.canonicalId(id)
    if (canonicalId !== id) throw clientMergedError(canonicalId)
    if (value.id !== id) throw new Error('ID do cliente difere da chave do cache.')
    return super.set(id, value)
  }
  override delete(id: string): boolean {
    const canonicalId = this.canonicalId(id)
    if (canonicalId !== id) throw clientMergedError(canonicalId)
    return super.delete(id)
  }
  override clear(): void { this.aliases.clear(); super.clear() }
}
