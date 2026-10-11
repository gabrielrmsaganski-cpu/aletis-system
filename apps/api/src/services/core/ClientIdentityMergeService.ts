import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import { mergedClientIdentity } from './ClientIdentity.js'

const ClientEnvelope = z.object({ id: z.string().min(1), nome: z.string().min(1), cpfCnpj: z.string(), estagio: z.string().min(1) }).passthrough()
type JsonObject = Record<string, any>
export interface IdentityMergePlan {
  version: 1
  operationId: string
  createdAt: string
  sourceId: string
  canonicalId: string
  reason: string
  identityEvidence: { matchingContracts: string[]; validCanonicalDocument: boolean; matchingDocument: boolean; sourceDocumentIsPlaceholder: boolean }
  source: JsonObject
  canonical: JsonObject
  references: Array<{ table: string; columns: string[]; rows: Array<{ hash: string; data: JsonObject }> }>
  memories: Array<{ hash: string; data: JsonObject }>
  schemaSignature: string
  fingerprint: string
}

function quote(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) throw new Error('Identificador PostgreSQL não permitido.')
  return `"${identifier}"`
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`
  return JSON.stringify(value)
}
export function identityPlanFingerprint(plan: Omit<IdentityMergePlan, 'fingerprint'> | IdentityMergePlan): string {
  const { fingerprint: _, ...data } = plan as IdentityMergePlan
  return createHash('sha256').update(stable(data)).digest('hex')
}
const normalizedName = (value: unknown) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '')

export function isVerifiedBrazilianDocument(value: unknown): boolean {
  const raw = digits(value)
  if (!/^(?:\d{11}|\d{14})$/.test(raw) || /^(.)\1+$/.test(raw)) return false
  if (raw.length === 11) {
    for (let size = 9; size < 11; size++) {
      let verifier = [...raw.slice(0, size)].reduce((sum, digit, index) => sum + Number(digit) * (size + 1 - index), 0) * 10 % 11
      if (verifier === 10) verifier = 0
      if (verifier !== Number(raw[size])) return false
    }
    return true
  }
  for (let size = 12; size <= 13; size++) {
    const weights = size === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const remainder = [...raw.slice(0, size)].reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11
    if ((remainder < 2 ? 0 : 11 - remainder) !== Number(raw[size])) return false
  }
  return true
}
function contracts(client: JsonObject): Set<string> {
  const result = new Set<string>()
  for (const debt of client.payload?.dividas ?? []) if (debt?.contrato) result.add(String(debt.contrato).trim())
  // Somente a lista explicitamente rotulada; valores monetários e CPF não contam como contratos.
  const list = String(client.payload?.observacoes ?? '').match(/contrato(?:\(s\)|s)?\s*:\s*([\d,\s.-]+)/i)?.[1]
  for (const match of list?.match(/\d{4,}(?:-\d+)?/g) ?? []) result.add(match)
  return result
}
export function confirmMergeIdentity(source: JsonObject, canonical: JsonObject): IdentityMergePlan['identityEvidence'] {
  if (source.id === canonical.id) throw new Error('Os cadastros precisam ser diferentes.')
  if (source.organization_id !== canonical.organization_id) throw new Error('Não é permitido consolidar organizações diferentes.')
  if (mergedClientIdentity(source.payload) || mergedClientIdentity(canonical.payload)) throw new Error('Cadastro já consolidado; gere outro plano com a identidade atual.')
  if (normalizedName(source.nome) !== normalizedName(canonical.nome)) throw new Error('Os nomes completos divergem; a consolidação exige revisão de identidade.')
  const sourceCpf = digits(source.cpf_cnpj), canonicalCpf = digits(canonical.cpf_cnpj)
  const sourceValid = isVerifiedBrazilianDocument(sourceCpf), canonicalValid = isVerifiedBrazilianDocument(canonicalCpf)
  const matchingDocument = sourceValid && canonicalValid && sourceCpf === canonicalCpf
  const sourcePlaceholder = !sourceCpf || /^(.)\1+$/.test(sourceCpf)
  const sourceContracts = contracts(source), canonicalContracts = contracts(canonical)
  const matchingContracts = [...sourceContracts].filter(contract => canonicalContracts.has(contract)).sort()
  if (!canonicalValid || (sourceValid && sourceCpf !== canonicalCpf) || (!matchingDocument && !(sourcePlaceholder && matchingContracts.length >= 2))) {
    throw new Error('Identidade insuficiente: exige documento válido coincidente ou documento canônico válido, origem provisória e ao menos dois contratos comuns.')
  }
  return { matchingContracts, validCanonicalDocument: canonicalValid, matchingDocument, sourceDocumentIsPlaceholder: sourcePlaceholder }
}

async function referenceSchema(connection: PoolClient): Promise<Array<{ table: string; columns: string[] }>> {
  const { rows } = await connection.query(`select table_name, column_name from information_schema.columns where table_schema=current_schema() and column_name in ('cliente_id','client_id') and data_type in ('text','character varying') order by table_name,column_name`)
  const grouped = new Map<string, string[]>()
  for (const row of rows) grouped.set(row.table_name, [...(grouped.get(row.table_name) ?? []), row.column_name])
  return [...grouped].map(([table, columns]) => ({ table, columns }))
}
async function referencedRows(connection: PoolClient, table: string, columns: string[], ids: string[]): Promise<Array<{ hash: string; data: JsonObject }>> {
  const where = columns.map(column => `t.${quote(column)}=any($1::text[])`).join(' or ')
  const { rows } = await connection.query(`select md5(row_to_json(t)::text) hash, row_to_json(t) data from ${quote(table)} t where ${where} order by row_to_json(t)::text`, [ids])
  return rows
}
async function snapshot(connection: PoolClient, sourceId: string, canonicalId: string) {
  const clients = await referencedRows(connection, 'cliente', ['id'], [sourceId, canonicalId])
  const source = clients.find(row => row.data.id === sourceId)?.data, canonical = clients.find(row => row.data.id === canonicalId)?.data
  if (!source || !canonical) throw new Error('Um dos cadastros não existe.')
  const schema = await referenceSchema(connection)
  const references: IdentityMergePlan['references'] = []
  for (const { table, columns } of schema) {
    if (table === 'alix_memory') continue
    const rows = await referencedRows(connection, table, columns, [sourceId])
    if (rows.length) references.push({ table, columns, rows })
  }
  const memories = schema.some(item => item.table === 'alix_memory') ? await referencedRows(connection, 'alix_memory', ['cliente_id'], [sourceId, canonicalId]) : []
  return { source, canonical, references, memories, schemaSignature: createHash('sha256').update(stable(schema)).digest('hex') }
}

async function assertNoActiveSourceJobs(connection: PoolClient, sourceId: string): Promise<void> {
  const queueSchema = process.env.ALETIS_AI_QUEUE_SCHEMA || 'pgboss'
  quote(queueSchema)
  const exists = (await connection.query('select to_regclass($1) relation', [`${queueSchema}.job`])).rows[0]?.relation
  if (!exists) return
  const { rows } = await connection.query(`select count(*)::int count from ${quote(queueSchema)}.job where state in ('created','retry','active') and (data->>'clienteId'=$1 or data->>'clientId'=$1 or group_id=$1)`, [sourceId])
  if (rows[0].count) throw new Error('Existem jobs ativos do cadastro anterior; conclua a execução antes de consolidar.')
}

export async function prepareIdentityMerge(pool: Pool, input: { sourceId: string; canonicalId: string; reason: string }): Promise<IdentityMergePlan> {
  if (input.reason.trim().length < 15) throw new Error('Informe a fundamentação da consolidação.')
  const connection = await pool.connect()
  try {
    await connection.query('begin isolation level repeatable read read only')
    await assertNoActiveSourceJobs(connection, input.sourceId)
    const current = await snapshot(connection, input.sourceId, input.canonicalId)
    const identityEvidence = confirmMergeIdentity(current.source, current.canonical)
    const data = { version: 1 as const, operationId: `client-merge-${randomUUID()}`, createdAt: new Date().toISOString(), ...input, identityEvidence, ...current }
    await connection.query('commit')
    return { ...data, fingerprint: identityPlanFingerprint(data) }
  } catch (error) { await connection.query('rollback'); throw error } finally { connection.release() }
}

/** Só referências estruturadas de identidade mudam; texto, fontes e IDs de registros não são reescritos. */
export function replaceOperationalClientReferences(value: unknown, sourceId: string, canonicalId: string, parentKey = ''): unknown {
  if (Array.isArray(value)) return value.map(item => replaceOperationalClientReferences(item, sourceId, canonicalId, parentKey))
  if (!value || typeof value !== 'object') return value
  const output: JsonObject = {}
  for (const [key, item] of Object.entries(value)) {
    if ((['clienteId', 'clientId', 'cliente_id', 'client_id'].includes(key) || (key === 'id' && ['cliente', 'client'].includes(parentKey))) && item === sourceId) output[key] = canonicalId
    else output[key] = replaceOperationalClientReferences(item, sourceId, canonicalId, key)
  }
  return output
}
const CURRENT_JSON_COLUMNS: Record<string, string[]> = {
  alix_automation_suggestion: ['proposed_action'], proposta: ['payload'], dossie: ['payload'],
  alix_document: ['payload'], alix_document_index: ['payload'], core_document: ['metadata'],
  google_drive_import_batch: ['payload'], ai_workflow_run: ['input'],
}
function uniqueValues<T>(values: T[]): T[] {
  const seen = new Set<string>()
  return values.filter(value => { const key = stable(value); if (seen.has(key)) return false; seen.add(key); return true })
}
export function consolidatedClientPayload(plan: IdentityMergePlan, mergedAt: string): JsonObject {
  const source = ClientEnvelope.parse(plan.source.payload), canonical = ClientEnvelope.parse(plan.canonical.payload)
  const original = structuredClone(canonical) as JsonObject
  const timeline = Array.isArray(original.timeline) ? original.timeline : []
  const archivedTimeline = (Array.isArray(source.timeline) ? source.timeline : []).map(event => ({ ...(event as JsonObject), origemCadastroId: plan.sourceId, fonteHistoricaPreservada: true }))
  original.timeline = uniqueValues([...timeline, ...archivedTimeline, { data: mergedAt.slice(0, 10), tipo: 'analise', descricao: 'Duplicidade cadastral resolvida: identidade documental e vínculos consolidados.', detalhes: plan.reason, operationId: plan.operationId }])
  original.tags = uniqueValues([...(Array.isArray(original.tags) ? original.tags : []).filter(tag => !['duplicidade_potencial', 'identidade_em_revisao'].includes(String(tag))), 'identidade_consolidada', 'revisao_financeira_documental'])
  if (!original.googleDriveInventory && source.googleDriveInventory) original.googleDriveInventory = source.googleDriveInventory
  original.proximaAcao = { descricao: 'Conferir saldos, amortizações e garantias nos documentos do Drive, com evidências e datas-base.', data: mergedAt.slice(0, 10), criadoEm: mergedAt, criadoPor: 'Consolidação cadastral autorizada' }
  original.ultimaAtualizacao = mergedAt.slice(0, 10)
  original.atualizadoEm = mergedAt
  original.identityConsolidation = {
    ...(original.identityConsolidation ?? {}), status: 'canonical', updatedAt: mergedAt,
    aliases: uniqueValues([...(original.identityConsolidation?.aliases ?? []), plan.sourceId]),
    operations: [...(original.identityConsolidation?.operations ?? []), {
      operationId: plan.operationId, sourceId: plan.sourceId, mergedAt, evidence: plan.identityEvidence,
      originalSourcePreserved: true, financialValuesPromoted: false,
      pendingReview: ['Dívidas e pagamentos do cadastro anterior precisam de conferência documental antes de alterar os valores atuais.', 'Contato, endereço, área e localização do cadastro anterior são provisórios e não foram promovidos.'],
    }],
  }
  return ClientEnvelope.parse(original)
}

export async function applyIdentityMerge(pool: Pool, plan: IdentityMergePlan, options: { actor: string; maintenanceMode: boolean }): Promise<JsonObject> {
  if (!options.maintenanceMode || !options.actor.trim()) throw new Error('A aplicação exige janela de manutenção e ator identificado.')
  if (plan.version !== 1 || identityPlanFingerprint(plan) !== plan.fingerprint) throw new Error('O plano foi modificado ou é inválido.')
  const connection = await pool.connect()
  try {
    await connection.query('begin isolation level serializable')
    await connection.query("set local lock_timeout='5s'")
    await connection.query("set local statement_timeout='30s'")
    await connection.query('select pg_advisory_xact_lock(hashtext($1))', [[plan.sourceId, plan.canonicalId].sort().join(':')])
    const schema = await referenceSchema(connection)
    await assertNoActiveSourceJobs(connection, plan.sourceId)
    const lockTables = uniqueValues(['cliente', ...schema.map(item => item.table), 'audit_log']).sort()
    for (const table of lockTables) await connection.query(`lock table ${quote(table)} in share row exclusive mode`)
    const current = await snapshot(connection, plan.sourceId, plan.canonicalId)
    for (const field of ['source', 'canonical', 'references', 'memories', 'schemaSignature'] as const) {
      if (stable(current[field]) !== stable(plan[field])) throw new Error(`Plano desatualizado (${field}); gere novamente antes de aplicar.`)
    }
    confirmMergeIdentity(current.source, current.canonical)
    const mergedAt = new Date().toISOString()
    const counts: Array<{ table: string; rows: number }> = []
    for (const reference of current.references) {
      const columns = (await connection.query('select column_name from information_schema.columns where table_schema=current_schema() and table_name=$1', [reference.table])).rows.map(row => row.column_name)
      for (const row of reference.rows) {
        const setters: string[] = [], values: unknown[] = []
        for (const column of reference.columns) if (row.data[column] === plan.sourceId) { values.push(plan.canonicalId); setters.push(`${quote(column)}=$${values.length}`) }
        for (const column of CURRENT_JSON_COLUMNS[reference.table] ?? []) {
          if (!columns.includes(column) || row.data[column] == null) continue
          const replacement = replaceOperationalClientReferences(row.data[column], plan.sourceId, plan.canonicalId)
          if (stable(replacement) !== stable(row.data[column])) { values.push(JSON.stringify(replacement)); setters.push(`${quote(column)}=$${values.length}::jsonb`) }
        }
        values.push(row.hash)
        const result = await connection.query(`update ${quote(reference.table)} t set ${setters.join(',')} where md5(row_to_json(t)::text)=$${values.length}`, values)
        if (result.rowCount !== 1) throw new Error('Uma referência mudou durante a consolidação.')
      }
      counts.push({ table: reference.table, rows: reference.rows.length })
    }
    const canonicalMemory = current.memories.find(row => row.data.cliente_id === plan.canonicalId)?.data
    const sourceMemory = current.memories.find(row => row.data.cliente_id === plan.sourceId)?.data
    let mergedMemory: JsonObject | null = null
    if (sourceMemory) {
      const base = canonicalMemory?.payload ?? { clienteId: plan.canonicalId, clienteNome: plan.canonical.nome, perfil: [], alertas: [], decisoes: [], historico: [], dividasAtivas: [], proximasAcoes: [] }
      mergedMemory = {
        ...base, clienteId: plan.canonicalId, clienteNome: plan.canonical.nome, atualizadoEm: mergedAt,
        historico: uniqueValues([...(base.historico ?? []), ...(sourceMemory.payload.historico ?? []), { data: mergedAt, texto: `Cadastro anterior ${plan.sourceId} consolidado por identidade documental. Perfil sintético e saldos anteriores não promovidos como fatos atuais.` }]),
        alertas: uniqueValues([...(base.alertas ?? []), 'Conferir saldos e amortizações nos documentos originais; consolidação cadastral não valida posição financeira.']),
        identityMergeArchives: [...(base.identityMergeArchives ?? []), { operationId: plan.operationId, sourceId: plan.sourceId, original: sourceMemory, archivedAt: mergedAt, authoritative: false }],
      }
      await connection.query('insert into alix_memory(cliente_id,cliente_nome,atualizado_em,payload) values($1,$2,$3,$4::jsonb) on conflict(cliente_id) do update set cliente_nome=excluded.cliente_nome,atualizado_em=excluded.atualizado_em,payload=excluded.payload', [plan.canonicalId, plan.canonical.nome, mergedAt, JSON.stringify(mergedMemory)])
      await connection.query('delete from alix_memory where cliente_id=$1', [plan.sourceId])
    }
    const payload = consolidatedClientPayload(plan, mergedAt)
    await connection.query('update cliente set payload=$2::jsonb,ultima_atualizacao=$3,atualizado_em=$3 where id=$1', [plan.canonicalId, JSON.stringify(payload), mergedAt])
    const sourcePayload = { ...plan.source.payload, identityMerge: { status: 'merged', canonicalId: plan.canonicalId, mergedAt, operationId: plan.operationId, reason: plan.reason, originalPayloadSha256: createHash('sha256').update(stable(plan.source.payload)).digest('hex') } }
    await connection.query('update cliente set payload=$2::jsonb,atualizado_em=$3 where id=$1', [plan.sourceId, JSON.stringify(ClientEnvelope.parse(sourcePayload)), mergedAt])
    // Auditoria obrigatória integra a mesma transação; snapshots financeiros permanecem inalterados.
    await connection.query('insert into audit_log(ator,acao,recurso,dados_antes,dados_depois) values($1,$2,$3,$4::jsonb,$5::jsonb)', [options.actor, 'client_identity_merge', `cliente:${plan.canonicalId}`, JSON.stringify({ source: plan.source, canonical: plan.canonical, memories: plan.memories }), JSON.stringify({ operationId: plan.operationId, sourceId: plan.sourceId, canonicalId: plan.canonicalId, fingerprint: plan.fingerprint, identityEvidence: plan.identityEvidence, references: counts, financialValuesPromoted: false })])
    for (const { table, columns } of schema) {
      if (table === 'alix_memory') continue
      if ((await referencedRows(connection, table, columns, [plan.sourceId])).length) throw new Error(`Referência operacional residual em ${table}.`)
    }
    await connection.query('commit')
    return { operationId: plan.operationId, mergedAt, sourceId: plan.sourceId, canonicalId: plan.canonicalId, references: counts, financialValuesPromoted: false, historicalClientPreserved: true, mergedMemory, canonicalPayload: payload }
  } catch (error) { await connection.query('rollback'); throw error } finally { connection.release() }
}
