export class SimulationContextChanged extends Error {
  constructor() { super('A operação em edição mudou.'); this.name = 'SimulationContextChanged' }
}

/** Registro rejeitado por validação; o servidor confirmou que não criou snapshot. */
export class SimulationRegistrationRejected extends Error {
  constructor(message: string) { super(message); this.name = 'SimulationRegistrationRejected' }
}

/** Serializa gravações e registra exatamente a versão confirmada pelo servidor. */
export class SimulationSaveQueue {
  private generation = 0
  private context: { id: string; updatedAt: string; blocked: boolean } | null = null
  private tail: Promise<unknown> = Promise.resolve()

  activate(id: string, updatedAt: string): void {
    this.generation += 1
    this.context = { id, updatedAt, blocked: false }
  }

  invalidate(): void { this.generation += 1; this.context = null }

  async run<T>(work: (context: { id: string; updatedAt: string }, confirmRevision: (updatedAt: string) => void) => Promise<{ value: T; updatedAt: string }>): Promise<T> {
    const generation = this.generation
    const queued = this.tail.catch(() => undefined).then(async () => {
      if (generation !== this.generation || !this.context) throw new SimulationContextChanged()
      const context = this.context
      if (context.blocked) throw new Error('Reabra a versão do servidor antes de gravar novamente; a última gravação não foi confirmada.')
      let confirmedIntermediateRevision = false
      try {
        const result = await work({ id: context.id, updatedAt: context.updatedAt }, updatedAt => {
          if (generation !== this.generation) throw new SimulationContextChanged()
          if (typeof updatedAt !== 'string' || !updatedAt) throw new Error('O servidor não informou a revisão salva.')
          context.updatedAt = updatedAt
          confirmedIntermediateRevision = true
        })
        if (generation !== this.generation) throw new SimulationContextChanged()
        context.updatedAt = result.updatedAt
        return result.value
      } catch (error) {
        // Após timeout ou conflito, repetir cegamente pode sobrescrever outra edição.
        if (generation === this.generation) context.blocked = !(error instanceof SimulationRegistrationRejected && confirmedIntermediateRevision)
        throw error
      }
    })
    this.tail = queued
    return queued
  }
}

export function simulationStorageKey(userId: string, workspaceId: string): string {
  return `aletis:simulador:v2:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceId)}:draft`
}

/** JSONB pode reordenar chaves; identidade do rascunho depende dos dados, não da ordem delas. */
export function simulationDraftFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
    }
    return item
  })
}

export function shiftCalendarMonths(iso: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isInteger(months)) return ''
  const date = new Date(`${iso}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return ''
  const day = date.getUTCDate()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() + months)
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
  date.setUTCDate(Math.min(day, end))
  return date.toISOString().slice(0, 10)
}

export function safeSimulationCalculation<T>(calculate: () => T): { result: T | null; errors: string[] } {
  try {
    const result = calculate()
    const validation = (result as { validacao?: { valido: boolean; erros: Array<{ mensagem: string }> } }).validacao
    if (validation && !validation.valido) return { result: null, errors: validation.erros.map(item => item.mensagem) }
    return { result, errors: [] }
  } catch (error) {
    const candidate = error as { validacao?: { erros?: Array<{ mensagem: string }> }; message?: string }
    const errors = candidate.validacao?.erros?.map(item => item.mensagem).filter(Boolean)
    return { result: null, errors: errors?.length ? errors : [candidate.message || 'Revise os dados antes de calcular.'] }
  }
}
