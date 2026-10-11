import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import type { PoolClient, Pool } from 'pg'
import { simulationDraftSchema, serializeSimulationMoney } from './SimulationSchemas.js'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  calcularFichaBancaria,
  calcularRecalculoOperacao,
  simularOperacaoCompleta,
  type FichaBancariaInput,
  type RecalculoOperacaoInput,
  type SimuladorOperacaoInput,
} from '@aletis/financial-calc'
import { auditAsync } from '../../db/AuditLog.js'
import { getPool, isPgEnabled } from '../../db/client.js'

export interface SimulationDraft {
  input: SimuladorOperacaoInput
  recalculo: RecalculoOperacaoInput
  ficha: FichaBancariaInput
}

export interface SimulationWorkspaceRecord {
  id: string
  organizationId: string
  officeId?: string
  userId?: string
  clientId?: string
  caseId?: string
  creditorId?: string
  debtId?: string
  kind: 'simulador_v16'
  title: string
  status: 'draft' | 'registered' | 'archived'
  draft: SimulationDraft
  registeredVersion: number
  idempotencyKey?: string
  createdAt: string
  updatedAt: string
}

export interface CalculationSnapshotRecord {
  id: string
  workspaceId: string
  version: number
  calculationType: 'simulador_v16_complete'
  input: SimulationDraft
  output: {
    simulacao: ReturnType<typeof simularOperacaoCompleta>
    recalculo: ReturnType<typeof calcularRecalculoOperacao> | null
    ficha: ReturnType<typeof calcularFichaBancaria> | null
    blocos?: { operacao: 'calculado'; recalculo: 'calculado' | 'nao_preenchido'; ficha: 'calculado' | 'nao_preenchido' }
  }
  sourceSnapshot: Array<{ source: string; version: string; capturedAt: string }>
  createdBy?: string
  createdAt: string
}

export class SimulationDomainError extends Error {
  constructor(message: string, readonly statusCode = 422, readonly code = 'SIMULATION_INVALID') {
    super(message)
  }
}

interface PersistedState {
  workspaces: SimulationWorkspaceRecord[]
  snapshots: CalculationSnapshotRecord[]
}


function optionalText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim()
  return normalized || undefined
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function fromPg(row: Record<string, any>): SimulationWorkspaceRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    officeId: optionalText(row.office_id),
    userId: optionalText(row.user_id),
    clientId: optionalText(row.client_id),
    caseId: optionalText(row.case_id),
    creditorId: optionalText(row.creditor_id),
    debtId: optionalText(row.debt_id),
    kind: 'simulador_v16',
    title: row.title,
    status: row.status,
    draft: row.draft,
    registeredVersion: Number(row.registered_version ?? 0),
    idempotencyKey: optionalText(row.idempotency_key),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function snapshotFromPg(row: Record<string, any>): CalculationSnapshotRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    version: Number(row.version),
    calculationType: 'simulador_v16_complete',
    input: row.input,
    output: row.output,
    sourceSnapshot: row.source_snapshot ?? [],
    createdBy: optionalText(row.created_by),
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function assertDraft(value: unknown): asserts value is SimulationDraft {
  const parsed = simulationDraftSchema.safeParse(value)
  if (!parsed.success) throw new SimulationDomainError(
    `Rascunho inválido: ${parsed.error.issues.map(item => `${item.path.join('.')}: ${item.message}`).join('; ')}`,
    400, 'INVALID_DRAFT',
  )
}

function calculate(draft: SimulationDraft): CalculationSnapshotRecord['output'] {
  assertDraft(draft)
  try {
    const simulacao = simularOperacaoCompleta(draft.input)
    if (!simulacao.validacao.valido) throw new Error(simulacao.validacao.erros.map(item => item.mensagem).join(' '))
    const empty = (value: unknown) => value === 0 || value == null
    const emptyRecalculo = draft.recalculo.parcelas.length === 0 && [draft.recalculo.valorCredito, draft.recalculo.entrada, draft.recalculo.custosAcessorios, draft.recalculo.taxaMensal].every(empty)
    const emptyFicha = draft.ficha.eventos.length === 0 && [draft.ficha.valorOperacao, draft.ficha.taxaMensal].every(empty)
    let recalculo: ReturnType<typeof calcularRecalculoOperacao> | null = null
    let ficha: ReturnType<typeof calcularFichaBancaria> | null = null
    try { if (!emptyRecalculo) recalculo = calcularRecalculoOperacao(draft.recalculo) }
    catch (error) { throw new Error(`Recálculo: ${(error as Error).message}`) }
    try { if (!emptyFicha) ficha = calcularFichaBancaria(draft.ficha) }
    catch (error) { throw new Error(`Ficha bancária: ${(error as Error).message}`) }
    return serializeSimulationMoney({ simulacao, recalculo, ficha,
      blocos: { operacao: 'calculado', recalculo: emptyRecalculo ? 'nao_preenchido' : 'calculado', ficha: emptyFicha ? 'nao_preenchido' : 'calculado' },
    })
  } catch (error) {
    throw new SimulationDomainError((error as Error).message, 422, 'CALCULATION_VALIDATION_FAILED')
  }
}

function assertVersion(current: SimulationWorkspaceRecord, expected?: string): void {
  if (!expected || !Number.isFinite(Date.parse(expected))) throw new SimulationDomainError(
    'Recarregue a simulação antes de salvar: a versão de origem é obrigatória.', 428, 'SIMULATION_VERSION_REQUIRED',
  )
  if (new Date(expected).toISOString() !== current.updatedAt) throw new SimulationDomainError(
    'Esta simulação foi alterada em outra aba ou por outra pessoa. Recarregue a versão atual antes de salvar.',
    409, 'SIMULATION_CONFLICT',
  )
}

function nextTimestamp(previous?: string): string {
  return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString()
}

function notFound(): never {
  throw new SimulationDomainError('Simulação não encontrada.', 404, 'SIMULATION_NOT_FOUND')
}

async function assertLinks(record: SimulationWorkspaceRecord, db: Pool | PoolClient): Promise<void> {
  const invalid = () => { throw new SimulationDomainError('A demanda, dívida ou escritório não pertence ao contexto desta simulação.', 422, 'SIMULATION_LINK_MISMATCH') }
  if (record.caseId) {
    const found = (await db.query('SELECT cliente_id FROM cliente_demanda WHERE id=$1', [record.caseId])).rows[0]
    if (!record.clientId || found?.cliente_id !== record.clientId) invalid()
  }
  if (record.debtId) {
    const found = (await db.query('SELECT client_id, case_id, creditor_id FROM client_debt WHERE id=$1', [record.debtId])).rows[0]
    if (!record.clientId || found?.client_id !== record.clientId ||
      (record.caseId && found.case_id !== record.caseId) || (record.creditorId && found.creditor_id !== record.creditorId)) invalid()
  }
  if (record.officeId) {
    const found = (await db.query('SELECT organization_id FROM office WHERE id=$1', [record.officeId])).rows[0]
    if (found?.organization_id !== record.organizationId) invalid()
  }
}

export class SimulationWorkspaceService {
  private hydration?: Promise<void>
  private readonly workspaces = new Map<string, SimulationWorkspaceRecord>()
  private readonly snapshots = new Map<string, CalculationSnapshotRecord[]>()
  private writeTail: Promise<unknown> = Promise.resolve()

  constructor(private readonly storageFile = join(process.cwd(), 'storage', 'simulations', 'workspaces.json')) {}

  async hydrate(): Promise<void> {
    // PG é a fonte atual: não reutiliza um retrato do início do processo.
    if (isPgEnabled()) return
    this.hydration ??= (async () => {
      if (process.env.NODE_ENV === 'test') return
      try {
        const state = JSON.parse(await readFile(this.storageFile, 'utf8')) as PersistedState
        for (const item of state.workspaces ?? []) this.workspaces.set(item.id, item)
        for (const item of state.snapshots ?? []) this.snapshots.set(item.workspaceId, [...(this.snapshots.get(item.workspaceId) ?? []), item])
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    })()
    try { await this.hydration } catch (error) { this.hydration = undefined; throw error }
  }

  private async persistFile(): Promise<void> {
    if (isPgEnabled() || process.env.NODE_ENV === 'test') return
    await mkdir(dirname(this.storageFile), { recursive: true })
    const temporary = `${this.storageFile}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify({ workspaces: [...this.workspaces.values()], snapshots: [...this.snapshots.values()].flat() }), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.storageFile)
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writeTail.then(operation, operation)
    this.writeTail = pending.catch(() => {})
    return pending
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await getPool().connect()
    try {
      await client.query('BEGIN')
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }

  async list(organizationId: string, filters: { clientId?: string; caseId?: string } = {}): Promise<SimulationWorkspaceRecord[]> {
    await this.hydrate()
    if (isPgEnabled()) {
      const result = await getPool().query(
        `SELECT * FROM simulation_workspace WHERE organization_id=$1 AND status <> 'archived'
          AND ($2::text IS NULL OR client_id=$2) AND ($3::text IS NULL OR case_id=$3) ORDER BY updated_at DESC`,
        [organizationId, filters.clientId || null, filters.caseId || null],
      )
      const records = result.rows.map(fromPg)
      for (const record of records) this.workspaces.set(record.id, record)
      return records.map(clone)
    }
    return [...this.workspaces.values()].filter(item => item.organizationId === organizationId && item.status !== 'archived')
      .filter(item => !filters.clientId || item.clientId === filters.clientId)
      .filter(item => !filters.caseId || item.caseId === filters.caseId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone)
  }

  async get(id: string, organizationId: string): Promise<SimulationWorkspaceRecord | null> {
    await this.hydrate()
    if (isPgEnabled()) {
      const result = await getPool().query("SELECT * FROM simulation_workspace WHERE id=$1 AND organization_id=$2 AND status <> 'archived'", [id, organizationId])
      if (!result.rows[0]) return null
      const record = fromPg(result.rows[0]); this.workspaces.set(id, record)
      return clone(record)
    }
    const record = this.workspaces.get(id)
    return record && record.organizationId === organizationId && record.status !== 'archived' ? clone(record) : null
  }

  async create(input: {
    organizationId: string; officeId?: string; userId?: string; clientId?: string; caseId?: string
    creditorId?: string; debtId?: string; title: string; draft: SimulationDraft; idempotencyKey?: string
  }): Promise<{ record: SimulationWorkspaceRecord; reused: boolean }> {
    return this.serialize(async () => {
      await this.hydrate()
      assertDraft(input.draft)
      const now = nextTimestamp()
      const record: SimulationWorkspaceRecord = {
        id: randomUUID(), organizationId: input.organizationId, officeId: optionalText(input.officeId), userId: optionalText(input.userId),
        clientId: optionalText(input.clientId), caseId: optionalText(input.caseId), creditorId: optionalText(input.creditorId), debtId: optionalText(input.debtId),
        kind: 'simulador_v16', title: input.title.trim() || 'Simulação sem título', status: 'draft', draft: clone(input.draft),
        registeredVersion: 0, idempotencyKey: optionalText(input.idempotencyKey), createdAt: now, updatedAt: now,
      }
      const reuse = (existing: SimulationWorkspaceRecord) => {
        if (existing.status === 'archived' || existing.clientId !== record.clientId || existing.caseId !== record.caseId ||
            existing.userId !== record.userId || existing.creditorId !== record.creditorId || existing.debtId !== record.debtId ||
            existing.officeId !== record.officeId || existing.title !== record.title || !isDeepStrictEqual(existing.draft, record.draft)) {
          throw new SimulationDomainError('A chave de criação já foi usada para outro cenário.', 409, 'SIMULATION_IDEMPOTENCY_CONFLICT')
        }
        this.workspaces.set(existing.id, existing)
        return { record: clone(existing), reused: true }
      }
      if (isPgEnabled()) {
        try {
          await assertLinks(record, getPool())
          await getPool().query(
            `INSERT INTO simulation_workspace
              (id,organization_id,office_id,user_id,client_id,case_id,creditor_id,debt_id,kind,title,status,draft,registered_version,idempotency_key,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$15)`,
            [record.id, record.organizationId, record.officeId ?? null, record.userId ?? null, record.clientId ?? null,
              record.caseId ?? null, record.creditorId ?? null, record.debtId ?? null, record.kind, record.title, record.status,
              JSON.stringify(record.draft), 0, record.idempotencyKey ?? null, now],
          )
        } catch (error: any) {
          if (error?.code === '23505' && record.idempotencyKey) {
            const existing = await getPool().query('SELECT * FROM simulation_workspace WHERE organization_id=$1 AND idempotency_key=$2', [record.organizationId, record.idempotencyKey])
            if (existing.rows[0]) return reuse(fromPg(existing.rows[0]))
          }
          throw error
        }
      } else if (record.idempotencyKey) {
        const existing = [...this.workspaces.values()].find(item => item.organizationId === record.organizationId && item.idempotencyKey === record.idempotencyKey)
        if (existing) return reuse(existing)
      }
      this.workspaces.set(record.id, record)
      await this.persistFile()
      auditAsync({ ator: record.userId ?? 'system', acao: 'create', recurso: `simulation_workspace:${record.id}`, dadosDepois: { clientId: record.clientId, caseId: record.caseId } })
      return { record: clone(record), reused: false }
    })
  }

  async updateDraft(id: string, organizationId: string,
    patch: Partial<Pick<SimulationWorkspaceRecord, 'title' | 'clientId' | 'caseId' | 'creditorId' | 'debtId'>> & { draft: SimulationDraft; expectedUpdatedAt?: string },
    actor = 'system',
  ): Promise<SimulationWorkspaceRecord> {
    return this.serialize(async () => {
      await this.hydrate()
      assertDraft(patch.draft)
      const apply = (current: SimulationWorkspaceRecord | null): SimulationWorkspaceRecord => {
        if (!current) return notFound()
        assertVersion(current, patch.expectedUpdatedAt)
        if (patch.clientId !== undefined && optionalText(patch.clientId) !== current.clientId) throw new SimulationDomainError(
          'Abra uma nova simulação para outro cliente. O vínculo deste cenário e de suas versões deve ser preservado.', 409, 'SIMULATION_CLIENT_IMMUTABLE',
        )
        return { ...current, title: optionalText(patch.title) ?? current.title,
          caseId: patch.caseId === undefined ? current.caseId : optionalText(patch.caseId),
          creditorId: patch.creditorId === undefined ? current.creditorId : optionalText(patch.creditorId),
          debtId: patch.debtId === undefined ? current.debtId : optionalText(patch.debtId),
          draft: clone(patch.draft), status: 'draft', updatedAt: nextTimestamp(current.updatedAt) }
      }
      const updated = isPgEnabled() ? await this.transaction(async client => {
        const locked = await client.query("SELECT * FROM simulation_workspace WHERE id=$1 AND organization_id=$2 AND status <> 'archived' FOR UPDATE", [id, organizationId])
        const value = apply(locked.rows[0] ? fromPg(locked.rows[0]) : null)
        await assertLinks(value, client)
        await client.query(`UPDATE simulation_workspace SET title=$1,case_id=$2,creditor_id=$3,debt_id=$4,draft=$5::jsonb,status='draft',updated_at=$6 WHERE id=$7 AND organization_id=$8`,
          [value.title, value.caseId ?? null, value.creditorId ?? null, value.debtId ?? null, JSON.stringify(value.draft), value.updatedAt, id, organizationId])
        return value
      }) : apply(await this.get(id, organizationId))
      this.workspaces.set(id, updated)
      await this.persistFile()
      auditAsync({ ator: actor, acao: 'update', recurso: `simulation_workspace:${id}`, dadosDepois: { clientId: updated.clientId, updatedAt: updated.updatedAt } })
      return clone(updated)
    })
  }

  async register(id: string, organizationId: string, actor = 'system', expectedUpdatedAt?: string): Promise<{ workspace: SimulationWorkspaceRecord; snapshot: CalculationSnapshotRecord }> {
    return this.serialize(async () => {
      await this.hydrate()
      const prepare = (current: SimulationWorkspaceRecord | null) => {
        if (!current) return notFound()
        assertVersion(current, expectedUpdatedAt)
        // A entrada vem da linha bloqueada, nunca do cache anterior ao lock.
        const output = calculate(current.draft)
        const now = nextTimestamp(current.updatedAt)
        const version = current.registeredVersion + 1
        const snapshot: CalculationSnapshotRecord = {
          id: randomUUID(), workspaceId: id, version, calculationType: 'simulador_v16_complete', input: clone(current.draft), output,
          sourceSnapshot: [{ source: '@aletis/financial-calc', version: output.simulacao.versaoMotor, capturedAt: now }], createdBy: actor, createdAt: now,
        }
        const workspace: SimulationWorkspaceRecord = { ...current, status: 'registered', registeredVersion: version, updatedAt: now }
        return { workspace, snapshot }
      }
      const result = isPgEnabled() ? await this.transaction(async client => {
        const locked = await client.query("SELECT * FROM simulation_workspace WHERE id=$1 AND organization_id=$2 AND status <> 'archived' FOR UPDATE", [id, organizationId])
        const value = prepare(locked.rows[0] ? fromPg(locked.rows[0]) : null)
        const s = value.snapshot
        await client.query(`INSERT INTO calculation_snapshot (id,workspace_id,version,calculation_type,input,output,source_snapshot,created_by,created_at)
          VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9)`,
          [s.id,id,s.version,s.calculationType,JSON.stringify(s.input),JSON.stringify(s.output),JSON.stringify(s.sourceSnapshot),actor,s.createdAt])
        await client.query("UPDATE simulation_workspace SET status='registered',registered_version=$1,updated_at=$2 WHERE id=$3 AND organization_id=$4",
          [s.version,value.workspace.updatedAt,id,organizationId])
        return value
      }) : prepare(await this.get(id, organizationId))
      this.workspaces.set(id, result.workspace)
      this.snapshots.set(id, [...(this.snapshots.get(id) ?? []), result.snapshot])
      await this.persistFile()
      auditAsync({ ator: actor, acao: 'register', recurso: `simulation_workspace:${id}`, dadosDepois: { version: result.snapshot.version, snapshotId: result.snapshot.id } })
      return clone(result)
    })
  }

  async listSnapshots(id: string, organizationId: string): Promise<CalculationSnapshotRecord[]> {
    if (!await this.get(id, organizationId)) return notFound()
    if (isPgEnabled()) {
      const result = await getPool().query('SELECT * FROM calculation_snapshot WHERE workspace_id=$1 ORDER BY version DESC', [id])
      const records = result.rows.map(snapshotFromPg)
      this.snapshots.set(id, records)
      return records.map(clone)
    }
    return [...(this.snapshots.get(id) ?? [])].sort((a, b) => b.version - a.version).map(clone)
  }

  async duplicate(id: string, organizationId: string, actor = 'system'): Promise<SimulationWorkspaceRecord> {
    const source = await this.get(id, organizationId)
    if (!source) return notFound()
    const { record } = await this.create({ organizationId, officeId: source.officeId, userId: actor,
      clientId: source.clientId, caseId: source.caseId, creditorId: source.creditorId, debtId: source.debtId,
      title: `${source.title} (cópia)`, draft: source.draft })
    return record
  }

  clearForTests(): void { this.workspaces.clear(); this.snapshots.clear(); this.hydration = undefined }
}

let singleton: SimulationWorkspaceService | undefined
export function getSimulationWorkspaceService(): SimulationWorkspaceService {
  singleton ??= new SimulationWorkspaceService()
  return singleton
}
