import { createHash, createHmac } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

import { getPool, isPgEnabled } from '../src/db/client.js'

interface PipelineRow {
  id: string
  document_id: string
  status: 'needs_review' | 'awaiting_registration' | 'registered'
  specialized_type: string | null
  classifier_method: string | null
  classification_confidence: string | null
  extraction: Record<string, unknown>
  fields: Array<{ key: string; confidence: string; hasPage: boolean; hasSheet: boolean }>
  findings: Array<{ severity: string; total: number }>
}

interface GoldenCase {
  id: string
  sourceKind: 'document_pipeline'
  sourceIdHash: string
  caseType: 'document_grounding'
  anonymizedInput: Record<string, unknown>
  expectedOutput: Record<string, unknown>
  correctSources: Array<Record<string, unknown>>
  tags: string[]
  reviewStatus: 'candidate' | 'baseline' | 'approved'
  datasetVersion: 1
  contentHash: string
}

const TARGET_SIZE = 100
const outputPath = join(process.cwd(), 'evals', 'alix', 'golden', 'alix-golden-100.jsonl')
const salt = process.env.ALIX_EVAL_ANONYMIZATION_SALT || 'aletis-alix-golden-v1'

function anonymize(value: string): string {
  return createHmac('sha256', salt).update(value).digest('hex')
}

function hashContent(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function confidenceBand(value: string | number | null | undefined): 'unknown' | 'low' | 'moderate' | 'high' {
  const confidence = Number(value)
  if (!Number.isFinite(confidence)) return 'unknown'
  if (confidence < 0.65) return 'low'
  if (confidence < 0.85) return 'moderate'
  return 'high'
}

function missingRequiredFields(extraction: Record<string, unknown>): string[] {
  const values = extraction.missingRequiredFields
  return Array.isArray(values)
    ? [...new Set(values.map(String).filter((value) => /^[a-zA-Z0-9_.-]{1,80}$/.test(value)))].sort()
    : []
}

function selectDiverse(rows: PipelineRow[], limit: number): PipelineRow[] {
  const buckets = new Map<string, PipelineRow[]>()
  for (const row of rows) {
    const key = row.specialized_type || 'unknown'
    const bucket = buckets.get(key) || []
    bucket.push(row)
    buckets.set(key, bucket)
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => anonymize(a.document_id).localeCompare(anonymize(b.document_id)))
  }
  const selected: PipelineRow[] = []
  const names = [...buckets.keys()].sort()
  while (selected.length < limit) {
    let added = false
    for (const name of names) {
      const item = buckets.get(name)?.shift()
      if (!item) continue
      selected.push(item)
      added = true
      if (selected.length === limit) break
    }
    if (!added) break
  }
  return selected
}

function toGoldenCase(row: PipelineRow): GoldenCase {
  const sourceIdHash = anonymize(`${row.document_id}:${row.id}`).slice(0, 32)
  const sourceRef = `SRC-${sourceIdHash.slice(0, 16)}`
  const fields = Array.isArray(row.fields) ? row.fields : []
  const fieldKeys = [...new Set(fields.map((field) => field.key).filter(Boolean))].sort()
  const evidenceKinds = [...new Set(fields.flatMap((field) => [
    field.hasPage ? 'page' : '',
    field.hasSheet ? 'sheet' : '',
    !field.hasPage && !field.hasSheet ? 'document' : '',
  ]).filter(Boolean))].sort()
  const missingFields = missingRequiredFields(row.extraction || {})
  const findingCounts = Object.fromEntries((row.findings || []).map((finding) => [finding.severity, Number(finding.total || 0)]))
  const reviewStatus = row.status === 'registered'
    ? 'approved'
    : row.status === 'awaiting_registration' ? 'baseline' : 'candidate'
  const core = {
    sourceKind: 'document_pipeline' as const,
    sourceIdHash,
    caseType: 'document_grounding' as const,
    anonymizedInput: {
      sourceRef,
      observable: {
        pipelineStatus: row.status,
        specializedType: row.specialized_type || 'unknown',
        classifierMethod: row.classifier_method || 'unknown',
        classificationConfidenceBand: confidenceBand(row.classification_confidence),
        fieldKeys,
        fieldCount: fieldKeys.length,
        evidenceKinds,
        missingRequiredFields: missingFields,
        findingCounts,
      },
    },
    expectedOutput: {
      documentType: row.specialized_type || 'unknown',
      pipelineDecision: row.status,
      requiresHumanReview: row.status !== 'registered',
      requiresCitation: true,
      expectedFieldKeys: fieldKeys,
      expectedMissingRequiredFields: missingFields,
      sourceRef,
    },
    correctSources: [{ sourceRef, fieldKeys, evidenceKinds }],
    tags: [row.specialized_type || 'unknown', row.status, 'real-anonymized', 'document-grounding'],
    reviewStatus,
    datasetVersion: 1 as const,
  }
  return {
    id: `golden_document_${sourceIdHash.slice(0, 20)}`,
    ...core,
    contentHash: hashContent(core),
  }
}

async function loadRows(): Promise<PipelineRow[]> {
  const result = await getPool().query<PipelineRow>(`
    select distinct on (r.document_id)
      r.id, r.document_id, r.status, r.specialized_type, r.classifier_method,
      r.classification_confidence, r.extraction,
      coalesce(fields.items, '[]'::jsonb) as fields,
      coalesce(findings.items, '[]'::jsonb) as findings
    from alix_document_pipeline_run r
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'key', f.field_key,
        'confidence', f.confidence,
        'hasPage', f.page is not null,
        'hasSheet', f.sheet is not null
      ) order by f.field_key, f.confidence desc) as items
      from alix_document_field f where f.run_id = r.id
    ) fields on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('severity', grouped.severity, 'total', grouped.total)) as items
      from (
        select severity, count(*)::int as total
        from alix_document_finding where run_id = r.id group by severity
      ) grouped
    ) findings on true
    where r.status in ('needs_review', 'awaiting_registration', 'registered')
    order by r.document_id, r.pipeline_version desc, r.updated_at desc
  `)
  return result.rows
}

async function persist(cases: GoldenCase[]): Promise<void> {
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('begin')
    for (const item of cases) {
      await client.query(
        `insert into alix_golden_case (
           id, source_kind, source_id_hash, case_type, anonymized_input,
           expected_output, correct_sources, tags, review_status,
           dataset_version, content_hash, created_at
         ) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,$11,now())
         on conflict (content_hash) do update set
           anonymized_input = excluded.anonymized_input,
           expected_output = excluded.expected_output,
           correct_sources = excluded.correct_sources,
           tags = excluded.tags,
           review_status = excluded.review_status`,
        [
          item.id, item.sourceKind, item.sourceIdHash, item.caseType,
          JSON.stringify(item.anonymizedInput), JSON.stringify(item.expectedOutput),
          JSON.stringify(item.correctSources), item.tags, item.reviewStatus,
          item.datasetVersion, item.contentHash,
        ],
      )
    }
    await client.query('commit')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

async function main(): Promise<void> {
  if (!isPgEnabled()) throw new Error('ALETIS_PG_ENABLED=1 é obrigatório para construir casos reais.')
  const rows = await loadRows()
  const cases = selectDiverse(rows, TARGET_SIZE).map(toGoldenCase)
  if (cases.length < TARGET_SIZE) {
    throw new Error(`Base insuficiente: ${cases.length} documentos elegíveis; mínimo ${TARGET_SIZE}.`)
  }
  await fs.mkdir(dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${cases.map((item) => JSON.stringify(item)).join('\n')}\n`, 'utf8')
  if (process.argv.includes('--persist')) await persist(cases)
  const summary = cases.reduce<Record<string, number>>((acc, item) => {
    const type = String(item.expectedOutput.documentType)
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {})
  process.stdout.write(`${JSON.stringify({ success: true, total: cases.length, persisted: process.argv.includes('--persist'), byType: summary }, null, 2)}\n`)
}

main()
  .catch((err) => {
    process.stderr.write(`[build-alix-golden-set] ${(err as Error).message}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await getPool().end().catch(() => undefined)
  })

