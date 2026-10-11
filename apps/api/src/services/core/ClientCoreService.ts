import { randomUUID } from 'crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import {
  clientContact,
  clientContract,
  cliente,
  clienteDemanda,
  negociacaoCredor,
  proposta,
  clientMeeting,
  clientTask,
  clientTimelineEvent,
  type ClientContact,
  type ClientContract,
  type ClientMeeting,
  type ClientTask,
  type ClientTimelineEvent,
} from '../../db/schema.js'
import { auditAsync } from '../../db/AuditLog.js'
import { cleanText, toDateOrNull } from './CoreTypes.js'
import { getAutomationEventService } from './AutomationEventService.js'

type Entity = 'contact' | 'task' | 'meeting' | 'contract' | 'timeline'

const memory = {
  contacts: new Map<string, ClientContact[]>(),
  tasks: new Map<string, ClientTask[]>(),
  meetings: new Map<string, ClientMeeting[]>(),
  contracts: new Map<string, ClientContract[]>(),
  timeline: new Map<string, ClientTimelineEvent[]>(),
}

const proposalDraftsInFlight = new Map<string, Promise<ContractDraftResult>>()

function mapPush<T extends { clienteId: string }>(map: Map<string, T[]>, row: T): T {
  const list = map.get(row.clienteId) || []
  map.set(row.clienteId, [row, ...list])
  return row
}

function isoDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString()
}

function publicRow<T extends Record<string, any>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value
  }
  return out
}

export interface ClientCoreSummary {
  clienteId: string
  contacts: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
  meetings: Record<string, unknown>[]
  contracts: Record<string, unknown>[]
  timeline: Record<string, unknown>[]
  metrics: {
    contatos: number
    tarefasPendentes: number
    tarefasAtrasadas: number
    reunioesFuturas: number
    contratosAtivos: number
    eventosTimeline: number
  }
}

export interface AcceptedProposalContractInput {
  clienteId: string
  propostaId: string
  negociacaoId: string
  demandaId: string
  titulo: string
  credor: string
  tipo: string
  valorDivida: string | null
  valorProposta: string | null
}

export interface ContractDraftResult {
  contract: ClientContract
  created: boolean
}

export class ClientCoreService {
  async getSummary(clienteId: string, legacyTimeline: Array<Record<string, unknown>> = []): Promise<ClientCoreSummary> {
    const [contacts, tasks, meetings, contracts, events] = await Promise.all([
      this.listContacts(clienteId),
      this.listTasks(clienteId),
      this.listMeetings(clienteId),
      this.listContracts(clienteId),
      this.listTimeline(clienteId),
    ])

    const now = Date.now()
    const publicTimeline = [
      ...events.map(publicRow),
      ...legacyTimeline.map((event, index) => ({
        id: `legacy-${index}`,
        clienteId,
        eventType: event.tipo ?? 'historico',
        title: event.descricao ?? 'Evento do histórico',
        description: event.detalhes,
        source: 'cliente_payload',
        createdAt: event.data,
        metadata: event,
      })),
    ].sort((a, b) => new Date(String(b.createdAt ?? 0)).getTime() - new Date(String(a.createdAt ?? 0)).getTime())

    return {
      clienteId,
      contacts: contacts.map(publicRow),
      tasks: tasks.map(publicRow),
      meetings: meetings.map(publicRow),
      contracts: contracts.map(publicRow),
      timeline: publicTimeline,
      metrics: {
        contatos: contacts.length,
        tarefasPendentes: tasks.filter((t) => !['concluida', 'cancelada'].includes(t.status)).length,
        tarefasAtrasadas: tasks.filter((t) => t.dueAt && !['concluida', 'cancelada'].includes(t.status) && new Date(t.dueAt).getTime() < now).length,
        reunioesFuturas: meetings.filter((m) => new Date(m.startAt).getTime() >= now && m.status !== 'cancelada').length,
        contratosAtivos: contracts.filter((c) => c.status === 'ativo').length,
        eventosTimeline: publicTimeline.length,
      },
    }
  }

  async listContacts(clienteId: string): Promise<ClientContact[]> {
    if (isPgEnabled()) {
      try {
        return await getDb().select().from(clientContact).where(eq(clientContact.clienteId, clienteId)).orderBy(desc(clientContact.atualizadoEm)).limit(200)
      } catch { /* fallback */ }
    }
    return memory.contacts.get(clienteId) || []
  }

  async listTasks(clienteId: string): Promise<ClientTask[]> {
    if (isPgEnabled()) {
      try {
        return await getDb().select().from(clientTask).where(eq(clientTask.clienteId, clienteId)).orderBy(desc(clientTask.atualizadoEm)).limit(300)
      } catch { /* fallback */ }
    }
    return memory.tasks.get(clienteId) || []
  }

  async listMeetings(clienteId: string): Promise<ClientMeeting[]> {
    if (isPgEnabled()) {
      try {
        return await getDb().select().from(clientMeeting).where(eq(clientMeeting.clienteId, clienteId)).orderBy(desc(clientMeeting.startAt)).limit(200)
      } catch { /* fallback */ }
    }
    return memory.meetings.get(clienteId) || []
  }

  async listContracts(clienteId: string): Promise<ClientContract[]> {
    if (isPgEnabled()) {
      return getDb().select().from(clientContract).where(eq(clientContract.clienteId, clienteId)).orderBy(desc(clientContract.atualizadoEm)).limit(200)
    }
    return memory.contracts.get(clienteId) || []
  }

  async findContractByProposal(propostaId: string): Promise<ClientContract | null> {
    const normalizedProposalId = cleanText(propostaId, 180)
    if (!normalizedProposalId) return null
    if (isPgEnabled()) {
      const [contract] = await getDb()
        .select()
        .from(clientContract)
        .where(eq(clientContract.propostaId, normalizedProposalId))
        .limit(1)
      return contract ?? null
    }
    for (const contracts of memory.contracts.values()) {
      const contract = contracts.find((item) => item.propostaId === normalizedProposalId)
      if (contract) return contract
    }
    return null
  }

  async ensureContractDraftForAcceptedProposal(
    input: AcceptedProposalContractInput,
    actor = 'system',
  ): Promise<ContractDraftResult> {
    const propostaId = cleanText(input.propostaId, 180)
    const clienteId = cleanText(input.clienteId, 180)
    const negociacaoId = cleanText(input.negociacaoId, 180)
    const demandaId = cleanText(input.demandaId, 180)
    const credor = cleanText(input.credor, 180)
    if (!propostaId || !clienteId || !negociacaoId || !demandaId || !credor) {
      throw new Error('Contrato exige proposta, negociação, demanda, cliente e credor vinculados.')
    }

    const inFlight = proposalDraftsInFlight.get(propostaId)
    if (inFlight) {
      return inFlight.then((result) => {
        if (result.contract.clienteId !== clienteId || result.contract.demandaId !== demandaId || result.contract.negociacaoId !== negociacaoId) {
          throw Object.assign(new Error('O contrato possui outro cliente, demanda ou negociação.'), { statusCode: 409, code: 'LINK_CONFLICT' })
        }
        return { contract: result.contract, created: false }
      })
    }
    const task = this.ensureContractDraftForAcceptedProposalUnlocked({
      ...input,
      propostaId,
      clienteId,
      negociacaoId,
      demandaId,
      credor,
    }, actor)
    proposalDraftsInFlight.set(propostaId, task)
    try {
      return await task
    } finally {
      proposalDraftsInFlight.delete(propostaId)
    }
  }

  private async ensureContractDraftForAcceptedProposalUnlocked(
    input: AcceptedProposalContractInput,
    actor: string,
  ): Promise<ContractDraftResult> {
    const existing = await this.findContractByProposal(input.propostaId)
    if (existing) {
      if (existing.clienteId !== input.clienteId) {
        throw new Error('O contrato vinculado à proposta pertence a outro cliente.')
      }
      if (existing.negociacaoId !== input.negociacaoId || existing.demandaId !== input.demandaId) {
        throw new Error('O contrato vinculado à proposta possui outra demanda ou negociação.')
      }
      return { contract: existing, created: false }
    }

    const metadata = {
      origem: 'proposta_aceita',
      propostaId: input.propostaId,
      negociacaoId: input.negociacaoId,
      demandaId: input.demandaId,
      propostaTitulo: input.titulo,
      statusGeracao: 'pendente_revisao_juridica',
    }
    const row = this.contractRow(input.clienteId, {
      titulo: input.titulo || `Contrato decorrente da proposta ${input.propostaId}`,
      credor: input.credor,
      tipo: input.tipo || 'termo_renegociacao',
      status: 'rascunho',
      valorOriginal: input.valorDivida,
      valorAtual: input.valorProposta,
      propostaId: input.propostaId,
      negociacaoId: input.negociacaoId,
      demandaId: input.demandaId,
      metadata,
    })

    if (isPgEnabled()) {
      return this.persistContractPg(row)
    }

    const memoryExisting = await this.findContractByProposal(input.propostaId)
    if (memoryExisting) return { contract: memoryExisting, created: false }
    const created = mapPush(memory.contracts, row as ClientContract)
    this.auditAndTimeline(input.clienteId, actor, 'client_contract_created', `Rascunho contratual criado: ${created.titulo}`, created.id)
    return { contract: created, created: true }
  }

  /** Cache de registros confirmados, sem auditoria ou automação adicional. */
  publishCommittedContract(contract: ClientContract): void {
    const existing = memory.contracts.get(contract.clienteId) || []
    memory.contracts.set(contract.clienteId, [contract, ...existing.filter(row => row.id !== contract.id)])
  }

  async listTimeline(clienteId: string): Promise<ClientTimelineEvent[]> {
    if (isPgEnabled()) {
      try {
        return await getDb().select().from(clientTimelineEvent).where(eq(clientTimelineEvent.clienteId, clienteId)).orderBy(desc(clientTimelineEvent.createdAt)).limit(500)
      } catch { /* fallback */ }
    }
    return memory.timeline.get(clienteId) || []
  }

  async addContact(clienteId: string, input: Record<string, unknown>, actor = 'system'): Promise<ClientContact> {
    const row = {
      id: `ctc_${randomUUID()}`,
      clienteId,
      nome: cleanText(input.nome, 180) || 'Contato sem nome',
      tipo: cleanText(input.tipo, 60) || 'contato',
      cargo: cleanText(input.cargo, 120) || null,
      telefone: cleanText(input.telefone, 80) || null,
      whatsapp: cleanText(input.whatsapp, 80) || null,
      email: cleanText(input.email, 180) || null,
      principal: Boolean(input.principal),
      origem: cleanText(input.origem, 80) || 'manual',
      status: cleanText(input.status, 60) || 'ativo',
      metadata: (input.metadata && typeof input.metadata === 'object' ? input.metadata : {}) as Record<string, unknown>,
    }
    const inserted = await this.insertOrMemory('contact', clienteId, row)
    this.auditAndTimeline(clienteId, actor, 'client_contact_created', `Contato criado: ${inserted.nome}`, inserted.id)
    return inserted as ClientContact
  }

  async addTask(clienteId: string, input: Record<string, unknown>, actor = 'system'): Promise<ClientTask> {
    const dueAt = toDateOrNull(input.dueAt ?? input.vencimento ?? input.prazo)
    const row = {
      id: `tsk_${randomUUID()}`,
      clienteId,
      titulo: cleanText(input.titulo, 220) || 'Nova tarefa',
      descricao: cleanText(input.descricao, 1200) || null,
      status: cleanText(input.status, 60) || 'pendente',
      prioridade: cleanText(input.prioridade, 60) || 'normal',
      responsavelId: cleanText(input.responsavelId, 120) || null,
      responsavelNome: cleanText(input.responsavelNome, 180) || null,
      dueAt,
      concluidaEm: input.status === 'concluida' ? new Date() : null,
      criadoPor: actor,
      metadata: (input.metadata && typeof input.metadata === 'object' ? input.metadata : {}) as Record<string, unknown>,
    }
    const inserted = await this.insertOrMemory('task', clienteId, row)
    this.auditAndTimeline(clienteId, actor, 'client_task_created', `Tarefa criada: ${inserted.titulo}`, inserted.id)
    return inserted as ClientTask
  }

  async updateTask(clienteId: string, taskId: string, input: Record<string, unknown>, actor = 'system'): Promise<ClientTask | null> {
    const patch: Record<string, unknown> = {}
    for (const key of ['titulo', 'descricao', 'status', 'prioridade', 'responsavelId', 'responsavelNome', 'metadata']) {
      if (input[key] !== undefined) patch[key] = input[key]
    }
    if (input.dueAt !== undefined) patch.dueAt = toDateOrNull(input.dueAt)
    if (input.status === 'concluida') patch.concluidaEm = new Date()
    patch.atualizadoEm = new Date()

    if (isPgEnabled()) {
      try {
        const [updated] = await getDb().update(clientTask).set(patch as any).where(and(eq(clientTask.id, taskId), eq(clientTask.clienteId, clienteId))).returning()
        if (updated) {
          this.auditAndTimeline(clienteId, actor, 'client_task_updated', `Tarefa atualizada: ${updated.titulo}`, updated.id)
          return updated
        }
      } catch { /* fallback */ }
    }
    const list = memory.tasks.get(clienteId) || []
    const idx = list.findIndex((t) => t.id === taskId)
    if (idx < 0) return null
    const updated = { ...list[idx], ...patch } as ClientTask
    list[idx] = updated
    this.auditAndTimeline(clienteId, actor, 'client_task_updated', `Tarefa atualizada: ${updated.titulo}`, updated.id)
    return updated
  }

  async addMeeting(clienteId: string, input: Record<string, unknown>, actor = 'system'): Promise<ClientMeeting> {
    const startAt = toDateOrNull(input.startAt ?? input.data) || new Date()
    const endAt = toDateOrNull(input.endAt)
    const row = {
      id: `mtg_${randomUUID()}`,
      clienteId,
      titulo: cleanText(input.titulo, 220) || 'Reunião com cliente',
      descricao: cleanText(input.descricao, 1200) || null,
      status: cleanText(input.status, 60) || 'agendada',
      startAt,
      endAt,
      consultorId: cleanText(input.consultorId, 120) || null,
      consultorNome: cleanText(input.consultorNome, 180) || null,
      calendarProvider: cleanText(input.calendarProvider, 80) || null,
      externalEventId: cleanText(input.externalEventId, 180) || null,
      metadata: (input.metadata && typeof input.metadata === 'object' ? input.metadata : {}) as Record<string, unknown>,
    }
    const inserted = await this.insertOrMemory('meeting', clienteId, row)
    this.auditAndTimeline(clienteId, actor, 'client_meeting_created', `Reunião registrada: ${inserted.titulo}`, inserted.id)
    return inserted as ClientMeeting
  }

  async addContract(clienteId: string, input: Record<string, unknown>, actor = 'system'): Promise<ClientContract> {
    const row = this.contractRow(clienteId, input)
    if (isPgEnabled()) {
      const result = await this.persistContractPg(row)
      if (result.created) this.auditAndTimeline(clienteId, actor, 'client_contract_created', `Contrato registrado: ${result.contract.titulo}`, result.contract.id)
      return result.contract
    }
    const inserted = await this.insertOrMemory('contract', clienteId, row)
    this.auditAndTimeline(clienteId, actor, 'client_contract_created', `Contrato registrado: ${inserted.titulo}`, inserted.id)
    return inserted as ClientContract
  }

  /** Contratos de proposta são criados exclusivamente pelo coordenador do aceite. */
  private async persistContractPg(row: typeof clientContract.$inferInsert): Promise<ContractDraftResult> {
    const conflict = (message: string): never => {
      throw Object.assign(new Error(message), { statusCode: 409, code: 'LINK_CONFLICT' })
    }
    const result = await getDb().transaction(async tx => {
      await tx.execute(sql`set local lock_timeout = '5s'`)
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`proposal-workflow:${row.clienteId}`}, 0))`)
      const [owner] = await tx.select({ id: cliente.id }).from(cliente).where(eq(cliente.id, row.clienteId)).for('key share')
      if (!owner) return conflict('O cliente do contrato não existe.')
      if (row.propostaId) {
        const [linked] = await tx.select().from(proposta).where(eq(proposta.id, row.propostaId)).for('update')
        if (!linked || linked.clienteId !== row.clienteId || linked.status !== 'aceita') return conflict('O contrato precisa de uma proposta aceita do mesmo cliente.')
        if (row.demandaId && linked.demandaId !== row.demandaId) return conflict('A demanda do contrato diverge da proposta.')
      }
      if (row.demandaId) {
        const [demand] = await tx.select().from(clienteDemanda).where(eq(clienteDemanda.id, row.demandaId)).for('key share')
        if (!demand || demand.clienteId !== row.clienteId) return conflict('A demanda do contrato pertence a outro cliente ou não existe.')
      }
      if (row.negociacaoId) {
        const [deal] = await tx.select().from(negociacaoCredor).where(eq(negociacaoCredor.id, row.negociacaoId)).for('update')
        if (!deal || deal.clienteId !== row.clienteId || (deal.propostaId && deal.propostaId !== row.propostaId)) {
          return conflict('A negociação do contrato não corresponde ao cliente e à proposta.')
        }
      }
      if (row.propostaId) {
        const [existing] = await tx.select().from(clientContract).where(eq(clientContract.propostaId, row.propostaId)).for('update')
        if (!existing) return conflict('Conclua ou reconcilie o aceite da proposta para criar seu contrato.')
        if (existing.clienteId !== row.clienteId || (row.demandaId && existing.demandaId !== row.demandaId) || (row.negociacaoId && existing.negociacaoId !== row.negociacaoId)) {
          return conflict('O contrato existente possui vínculos diferentes dos informados.')
        }
        return { contract: existing, created: false }
      }
      const [contract] = await tx.insert(clientContract).values(row).returning()
      return { contract, created: true }
    })
    this.publishCommittedContract(result.contract)
    return result
  }

  async addTimelineEvent(clienteId: string, input: Record<string, unknown>, actor = 'system'): Promise<ClientTimelineEvent> {
    const row = {
      id: `evt_${randomUUID()}`,
      clienteId,
      eventType: cleanText(input.eventType ?? input.tipo, 80) || 'evento',
      title: cleanText(input.title ?? input.titulo ?? input.descricao, 220) || 'Evento registrado',
      description: cleanText(input.description ?? input.detalhes, 1600) || null,
      source: cleanText(input.source, 80) || 'manual',
      sourceId: cleanText(input.sourceId, 160) || null,
      visibility: cleanText(input.visibility, 40) || 'internal',
      createdBy: actor,
      metadata: (input.metadata && typeof input.metadata === 'object' ? input.metadata : {}) as Record<string, unknown>,
    }
    const inserted = await this.insertOrMemory('timeline', clienteId, row)
    auditAsync({ ator: actor, acao: 'timeline_event', recurso: `cliente:${clienteId}`, dadosDepois: inserted })
    return inserted as ClientTimelineEvent
  }

  private async insertOrMemory(entity: Entity, clienteId: string, row: Record<string, unknown>): Promise<any> {
    if (isPgEnabled()) {
      try {
        const db = getDb()
        if (entity === 'contact') return (await db.insert(clientContact).values(row as any).returning())[0]
        if (entity === 'task') return (await db.insert(clientTask).values(row as any).returning())[0]
        if (entity === 'meeting') return (await db.insert(clientMeeting).values(row as any).returning())[0]
        if (entity === 'contract') return (await db.insert(clientContract).values(row as any).returning())[0]
        if (entity === 'timeline') return (await db.insert(clientTimelineEvent).values(row as any).returning())[0]
      } catch {
        // fallback em memória para não quebrar o fluxo do consultor
      }
    }

    if (entity === 'contact') return mapPush(memory.contacts, row as ClientContact)
    if (entity === 'task') return mapPush(memory.tasks, row as ClientTask)
    if (entity === 'meeting') return mapPush(memory.meetings, row as ClientMeeting)
    if (entity === 'contract') return mapPush(memory.contracts, row as ClientContract)
    return mapPush(memory.timeline, {
      ...row,
      createdAt: new Date(),
    } as ClientTimelineEvent)
  }

  private contractRow(clienteId: string, input: Record<string, unknown>): typeof clientContract.$inferInsert {
    return {
      id: `ctr_${randomUUID()}`,
      clienteId,
      titulo: cleanText(input.titulo, 220) || 'Contrato',
      credor: cleanText(input.credor, 180) || null,
      numeroContrato: cleanText(input.numeroContrato, 180) || null,
      tipo: cleanText(input.tipo, 80) || 'financeiro',
      status: cleanText(input.status, 60) || 'ativo',
      valorOriginal: input.valorOriginal != null ? String(input.valorOriginal) : null,
      valorAtual: input.valorAtual != null ? String(input.valorAtual) : null,
      moeda: cleanText(input.moeda, 12) || 'BRL',
      dataAssinatura: cleanText(input.dataAssinatura, 20) || null,
      dataVencimento: cleanText(input.dataVencimento, 20) || null,
      documentoId: cleanText(input.documentoId, 180) || null,
      propostaId: cleanText(input.propostaId, 180) || null,
      negociacaoId: cleanText(input.negociacaoId, 180) || null,
      demandaId: cleanText(input.demandaId, 180) || null,
      metadata: (input.metadata && typeof input.metadata === 'object' ? input.metadata : {}) as Record<string, unknown>,
    }
  }

  private auditAndTimeline(clienteId: string, actor: string, eventType: string, title: string, sourceId: string): void {
    auditAsync({ ator: actor, acao: eventType, recurso: `cliente:${clienteId}`, dadosDepois: { sourceId, title } })
    void this.addTimelineEvent(clienteId, {
      eventType,
      title,
      source: 'crm_core',
      sourceId,
    }, actor)
    void getAutomationEventService().record({
      eventType,
      payload: { clienteId, sourceId, title },
      targetProvider: 'n8n',
      dispatch: true,
    }).catch(() => {
      // eslint-disable-next-line no-console
      console.warn('[ClientCoreService] Falha ao registrar evento de automação.')
    })
  }
}

let singleton: ClientCoreService | null = null

export function getClientCoreService(): ClientCoreService {
  if (!singleton) singleton = new ClientCoreService()
  return singleton
}
