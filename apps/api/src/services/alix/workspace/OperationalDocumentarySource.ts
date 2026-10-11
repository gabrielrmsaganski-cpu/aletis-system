import { createHash } from 'node:crypto'
import { z } from 'zod'

import { getPool, isPgEnabled } from '../../../db/client.js'
import { getAccessControlService } from '../../core/AccessControlService.js'
import { isDriveCorpusAdministrator } from '../../google-workspace/DriveCorpusService.js'
import type { GoogleWorkspaceActor } from '../../google-workspace/schemas.js'
import { readOperationalDriveAnalysisSource } from './OperationalDriveAnalysisSource.js'

export type OperationalActor = GoogleWorkspaceActor
export const OPERATIONAL_ACTIVE_CLIENT_STAGES = ['lead', 'prospeccao', 'qualificacao', 'analise', 'diagnostico_em_analise', 'coleta_documentos', 'proposta', 'proposta_enviada', 'negociacao', 'acordo', 'acompanhamento']
export const operationalEvidenceSchema = z.object({
  kind: z.string().trim().min(1).max(80), id: z.string().trim().min(1).max(220),
  label: z.string().trim().min(1).max(240), documentId: z.string().max(220).optional(),
  revision: z.string().max(220).optional(), excerpt: z.string().max(2_200).optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), chunkId: z.string().max(220).optional(),
  quoteHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), excerptHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  page: z.number().int().positive().optional(), sheet: z.string().max(160).optional(), updatedAt: z.string().optional(),
})
export const operationalDocumentaryRecordSchema = z.object({
  id: z.string().trim().min(1).max(400), clienteId: z.string().trim().min(1).max(180),
  kind: z.enum(['missing_field', 'divergence', 'duplicate', 'expired', 'low_confidence', 'fact_divergence', 'fact_review', 'field_expiry']),
  status: z.literal('open'), title: z.string().trim().min(1).max(240), description: z.string().max(4_000),
  nextAction: z.string().trim().min(1).max(2_000), severity: z.enum(['info', 'important', 'critical']),
  source: operationalEvidenceSchema, relatedSources: z.array(operationalEvidenceSchema).max(12).optional(),
})
export type OperationalDocumentaryRecord = z.infer<typeof operationalDocumentaryRecordSchema>

const text = (value: unknown, max = 240) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const instant = (value: unknown) => {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}
const stable = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const severity = (value: unknown): OperationalDocumentaryRecord['severity'] => value === 'critical' ? 'critical' : ['high', 'warning', 'important'].includes(String(value)) ? 'important' : 'info'
const nextActions: Record<string, string> = {
  missing_field: 'Conferir o campo ausente no documento e no cadastro; preparar a lista exata do dado ou comprovante que falta.',
  divergence: 'Comparar os valores conflitantes nas fontes atuais e no CRM; preparar a correção proposta com evidências para revisão.',
  duplicate: 'Comparar titular, identificação e versão dos documentos; indicar qual registro deve ser usado, preservando os originais.',
  expired: 'Conferir a natureza da data e a versão atual da fonte; preparar a atualização necessária sem presumir inadimplência.',
  low_confidence: 'Ler o trecho e conferir o valor candidato com a fonte original; preparar a correção ou indicar a informação ilegível.',
}

/** A carteira documental exige vínculo efetivo; o modo de compatibilidade não concede acesso. */
export async function authorizedDocumentaryClientIds(actor: OperationalActor | undefined, clienteId?: string): Promise<string[]> {
  if (!actor?.userId || ['anonymous', 'unknown'].includes(actor.userId)) throw new Error('Identidade necessária para consultar as pendências documentais.')
  const rows = await getPool().query("select id, nome, consultor, payload from cliente where coalesce(payload->'identityMerge'->>'status','') <> 'merged' and ($1::text is null or id = $1) and estagio = any($2::text[]) order by id", [clienteId || null, OPERATIONAL_ACTIVE_CLIENT_STAGES])
  if (isDriveCorpusAdministrator(actor)) return rows.rows.map(row => String(row.id))
  const allowed: string[] = []
  for (const row of rows.rows) {
    const decision = await getAccessControlService().canAccessCliente({ actor: { id: actor.userId, nome: actor.userName, role: actor.role as any, consultorId: actor.userId }, clienteId: String(row.id), cliente: { ...object(row.payload), id: row.id, nome: row.nome, consultor: row.consultor }, action: 'document:read' })
    if (decision.allowed && decision.source !== 'compat') allowed.push(String(row.id))
  }
  return allowed
}

const latestSql = `with latest as (
  select distinct on (document_id) * from alix_document_pipeline_run
  where cliente_id = any($1::text[])
  order by document_id, pipeline_version desc, created_at desc
), current_runs as (
  select r.* from latest r join alix_document d on d.id = r.document_id
    and d.cliente_id = r.cliente_id and d.session_id = r.session_id and d.sha256 = r.source_sha256
  where r.status in ('needs_review','awaiting_registration','registered')
)`

/** Leitura atual das fontes existentes, sem cadastrar tarefa nem aprovar achado. */
export async function readOperationalDocumentarySource(clienteId?: string, actor?: OperationalActor): Promise<{ records: OperationalDocumentaryRecord[]; origin: 'postgres' | 'memory' }> {
  if (!isPgEnabled()) return { records: [], origin: 'memory' }
  const clientIds = await authorizedDocumentaryClientIds(actor, clienteId)
  const [documents, drive] = await Promise.all([
    readOperationalDocumentaryRecords(clientIds), readOperationalDriveAnalysisSource(actor!.tenantId, clientIds),
  ])
  return { records: [...documents, ...drive].map(record => operationalDocumentaryRecordSchema.parse(record)), origin: 'postgres' }
}

/** Entrada interna compartilhada pela projeção autorizada e pela varredura de manutenção. */
export async function readOperationalDocumentaryRecords(clientIds: string[]): Promise<OperationalDocumentaryRecord[]> {
  if (!clientIds.length) return []
  const [findings, fields, facts] = await Promise.all([
    getPool().query(`${latestSql}
      select f.*, r.source_sha256, r.specialized_type from alix_document_finding f
      join current_runs r on r.id = f.run_id and r.cliente_id = f.cliente_id
      where f.status = 'open' and f.kind in ('missing_field','divergence','duplicate','expired','low_confidence') order by f.id`, [clientIds]),
    getPool().query(`${latestSql}
      select f.*, r.source_sha256, r.specialized_type from alix_document_field f
      join current_runs r on r.id = f.run_id and r.cliente_id = f.cliente_id
      where f.expires_at <= now() + interval '30 days' and f.status not in ('rejected','expired')
        and not exists (select 1 from alix_document_finding finding where finding.run_id = f.run_id
          and finding.kind = 'expired' and finding.status = 'open' and finding.field_key = f.field_key)
      order by f.id`, [clientIds]),
    getPool().query(`select fact.id, fact.cliente_id, fact.fact_key, fact.canonical_key, fact.status, fact.evidence, fact.atualizado_em, fact.version
      from alix_memory_fact fact where fact.cliente_id = any($1::text[]) and fact.status in ('contested','pending_review')
        and (fact.status = 'contested' or exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(fact.evidence) = 'array' then fact.evidence else '[]'::jsonb end) source_evidence(item)
          join alix_document d on d.id = coalesce(nullif(source_evidence.item->>'documentId',''), source_evidence.item->>'sourceId') and d.cliente_id = fact.cliente_id
          where source_evidence.item->>'source' = 'documento' and length(trim(coalesce(source_evidence.item->>'excerpt',''))) > 0
        )) order by fact.id`, [clientIds]),
  ])
  const records: OperationalDocumentaryRecord[] = []
  for (const row of findings.rows) {
    const evidence: Record<string, unknown>[] = Array.isArray(row.evidence) ? row.evidence.map(object) : []
    const excerpt = evidence.map(item => text(item.excerpt || item.current || item.evidence, 2_000)).find(Boolean)
    records.push(operationalDocumentaryRecordSchema.parse({
      id: `finding:${stable([row.cliente_id, row.document_id, row.kind, row.field_key || row.title])}`,
      clienteId: row.cliente_id, kind: row.kind, status: 'open', title: text(row.title), description: text(row.description, 4_000),
      nextAction: nextActions[String(row.kind)], severity: severity(row.severity),
      source: { kind: 'document_finding', id: String(row.id), label: text(row.field_key) || 'Achado da leitura documental', documentId: row.document_id,
        revision: row.source_sha256, excerpt, updatedAt: instant(row.updated_at) },
    }))
  }
  for (const row of fields.rows) {
    const calendarDate = instant(row.expires_at)?.slice(0, 10)
    const nature = row.field_key === 'data_vencimento' ? 'Vencimento contratual' : row.field_key === 'validade' ? 'Validade indicada no documento' : 'Atualidade da informação documental'
    records.push(operationalDocumentaryRecordSchema.parse({
      id: `field:${stable([row.cliente_id, row.document_id, row.field_key])}`, clienteId: row.cliente_id, kind: 'field_expiry', status: 'open',
      title: `${nature} · conferir ${text(row.field_key)}`.slice(0, 240),
      description: `${nature}: ${calendarDate || 'data a conferir'}. ${row.status === 'confirmed' ? 'Campo revisado.' : 'Data extraída ainda sujeita a conferência.'} Esta data não comprova atraso de pagamento nem cria um prazo para a equipe.`,
      nextAction: 'Conferir a data, sua finalidade e o documento mais recente; preparar a atualização ou a decisão necessária com a fonte citada.', severity: 'important',
      source: { kind: 'document_field', id: String(row.id), label: text(row.field_key) || 'Campo documental', documentId: row.document_id,
        revision: row.source_sha256, excerpt: text(row.evidence_text, 2_000) || undefined, page: row.page || undefined, sheet: text(row.sheet, 160) || undefined, updatedAt: instant(row.updated_at) },
    }))
  }
  for (const row of facts.rows) {
    const evidence: Record<string, unknown>[] = Array.isArray(row.evidence) ? row.evidence.map(object) : []
    const traceable = evidence.filter(item => (text(item.documentId) || text(item.sourceId)) && text(item.excerpt, 2_000))
    if (row.status === 'pending_review' && !traceable.length) continue
    const contested = row.status === 'contested'
    records.push(operationalDocumentaryRecordSchema.parse({
      id: `fact:${row.id}`, clienteId: row.cliente_id, kind: contested ? 'fact_divergence' : 'fact_review', status: 'open',
      title: `${contested ? 'Revisar divergência' : 'Conferir candidato'} · ${text(row.fact_key)}`.slice(0, 240),
      description: contested ? 'Há informações conflitantes no Livro de Fatos. A revisão precisa comparar o valor confirmado e a nova evidência.' : 'Conferir candidato extraído antes de usar a informação como dado confirmado ou alterar o CRM.',
      nextAction: contested ? 'Ler as fontes conflitantes e preparar a comparação com o cadastro atual; indicar a decisão de revisão necessária.' : 'Conferir candidato, titular e trecho original; preparar a comparação com o CRM e indicar se o dado pode ser confirmado.', severity: 'important',
      source: { kind: 'fact_ledger', id: String(row.id), label: text(row.fact_key), revision: String(row.version), updatedAt: instant(row.atualizado_em) },
      // O registro do Livro de Fatos identifica a pendência; os excertos são
      // carregados no handoff por ferramentas que revalidam a fonte original.
    }))
  }
  return [...new Map(records.map(row => [row.id, row])).values()]
}
