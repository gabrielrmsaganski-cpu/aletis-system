export interface ProposalDraftRecord {
  id: string
  status: string
  revision?: number
}

export const proposalEditableFields = [
  'clienteNome', 'demandaId', 'demandaTitulo', 'assunto', 'credor', 'titulo', 'tipo',
  'status', 'valorDivida', 'valorProposta', 'itens', 'condicoes', 'fundamentacao',
  'observacoes', 'dataCriacao', 'dataValidade',
] as const

export const proposalTransitions: Record<string, readonly string[]> = {
  rascunho: ['em_analise'], em_analise: ['rascunho', 'enviada'],
  enviada: ['em_analise', 'aceita', 'rejeitada', 'expirada'],
  aceita: [], rejeitada: [], expirada: [],
}

const same = (left: unknown, right: unknown) => JSON.stringify(left ?? '') === JSON.stringify(right ?? '')

export function proposalChanges<T extends ProposalDraftRecord>(before: T, after: T): Record<string, unknown> {
  const previous = before as unknown as Record<string, unknown>
  const current = after as unknown as Record<string, unknown>
  return Object.fromEntries(proposalEditableFields.filter(key => !same(previous[key], current[key])).map(key => [key, current[key]]))
}

export function proposalRevision(proposal: ProposalDraftRecord): number {
  return Number.isSafeInteger(proposal.revision) && proposal.revision! >= 0 ? proposal.revision! : 0
}

export function cannotReapplyProposal<T extends ProposalDraftRecord>(before: T, draft: T, latest: T): boolean {
  const changes = proposalChanges(before, draft)
  if (latest.status === 'aceita' && Object.keys(changes).some(key => key !== 'observacoes')) return true
  const status = changes.status
  return typeof status === 'string' && status !== latest.status && !proposalTransitions[latest.status]?.includes(status)
}

export interface ProposalSaveResult<T> {
  data: T
  meta?: { negociacaoId?: string; contratoId?: string; demandaId?: string }
}

/** Uma fila por proposta; respostas anteriores nunca substituem a edição posterior. */
export class ProposalDraftEditor<T extends ProposalDraftRecord> {
  confirmed: T
  draft: T
  error: unknown = null
  paused = false
  private pending: Promise<ProposalSaveResult<T> | null> | null = null
  private readonly listeners = new Set<() => void>()

  constructor(proposal: T) {
    this.confirmed = structuredClone(proposal)
    this.draft = structuredClone(proposal)
  }

  get saving(): boolean { return this.pending !== null }
  get dirty(): boolean { return Object.keys(proposalChanges(this.confirmed, this.draft)).length > 0 }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit(): void { for (const listener of this.listeners) listener() }

  edit(draft: T): void { this.draft = structuredClone(draft); this.emit() }

  receive(proposal: T): void {
    if (this.saving || this.dirty || this.paused || proposalRevision(proposal) < proposalRevision(this.confirmed)) return
    this.confirmed = structuredClone(proposal)
    this.draft = structuredClone(proposal)
    this.emit()
  }

  reconcile(latest: T, keepChanges: boolean): void {
    if (this.saving) return
    if (keepChanges && cannotReapplyProposal(this.confirmed, this.draft, latest)) throw new Error('A situação atual não permite reaplicar estes termos. Use a versão atual para continuar.')
    const changes = keepChanges ? proposalChanges(this.confirmed, this.draft) : {}
    this.confirmed = structuredClone(latest)
    this.draft = { ...structuredClone(latest), ...changes }
    this.error = null
    // Após um conflito, a revisão deve ser conferida e salva explicitamente.
    this.paused = keepChanges && this.dirty
    this.emit()
  }

  save(transport: (id: string, patch: Record<string, unknown>) => Promise<ProposalSaveResult<T>>): Promise<ProposalSaveResult<T> | null> {
    if (this.pending) return this.pending
    const submitted = structuredClone(this.draft)
    const changes = proposalChanges(this.confirmed, submitted)
    if (!Object.keys(changes).length) return Promise.resolve(null)
    const patch = { ...changes, expectedRevision: proposalRevision(this.confirmed) }
    this.error = null
    this.pending = Promise.resolve().then(() => transport(submitted.id, patch)).then(result => {
      const newerEdits = proposalChanges(submitted, this.draft)
      this.confirmed = structuredClone(result.data)
      this.draft = { ...structuredClone(result.data), ...newerEdits }
      this.paused = false
      return result
    }).catch(error => {
      this.error = error
      this.paused = true
      throw error
    }).finally(() => {
      this.pending = null
      this.emit()
    })
    this.emit()
    return this.pending
  }
}
