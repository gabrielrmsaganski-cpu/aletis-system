// Serializa os comandos locais por entidade. Não substitui controle de versão
// transacional entre réplicas nem a futura transação de fechamento comercial.
const pending = new Map<string, Promise<void>>()

export async function withCrmWriteLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = pending.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  pending.set(key, current)
  await previous
  try {
    return await action()
  } finally {
    release()
    if (pending.get(key) === current) pending.delete(key)
  }
}
