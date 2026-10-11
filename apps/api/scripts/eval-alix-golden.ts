import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

interface GoldenCase {
  id: string
  sourceKind: string
  sourceIdHash: string
  caseType: string
  anonymizedInput: {
    sourceRef: string
    observable: { fieldKeys: string[]; fieldCount: number; pipelineStatus: string }
  }
  expectedOutput: {
    documentType: string
    pipelineDecision: string
    requiresHumanReview: boolean
    requiresCitation: boolean
    expectedFieldKeys: string[]
    sourceRef: string
  }
  correctSources: Array<{ sourceRef: string; fieldKeys: string[] }>
  tags: string[]
  reviewStatus: string
  datasetVersion: number
  contentHash: string
}

const file = join(process.cwd(), 'evals', 'alix', 'golden', 'alix-golden-100.jsonl')

function assertNoSensitiveShape(value: unknown, path = 'root'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveShape(item, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  const forbiddenKeys = /^(clienteId|documentId|sessionId|runId|sourceSha256|valueText|normalizedValue|evidenceText|filename|cpf|cnpj|email|telefone)$/i
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    assert.ok(!forbiddenKeys.test(key), `${path}.${key}: campo sensível não pode entrar no golden set`)
    assertNoSensitiveShape(item, `${path}.${key}`)
  }
}

async function main(): Promise<void> {
  const raw = await fs.readFile(file, 'utf8')
  const cases = raw.split('\n').filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) as GoldenCase } catch { throw new Error(`JSONL inválido na linha ${index + 1}`) }
  })
  assert.ok(cases.length >= 100, `esperados ao menos 100 casos; encontrados ${cases.length}`)
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length, 'IDs duplicados')
  assert.equal(new Set(cases.map((item) => item.sourceIdHash)).size, cases.length, 'fontes anonimizadas duplicadas')
  assert.equal(new Set(cases.map((item) => item.contentHash)).size, cases.length, 'conteúdos duplicados')

  for (const item of cases) {
    assert.equal(item.sourceKind, 'document_pipeline', `${item.id}: sourceKind`)
    assert.equal(item.caseType, 'document_grounding', `${item.id}: caseType`)
    assert.match(item.sourceIdHash, /^[a-f0-9]{32}$/, `${item.id}: hash de fonte inválido`)
    assert.match(item.contentHash, /^[a-f0-9]{64}$/, `${item.id}: hash de conteúdo inválido`)
    assert.match(item.anonymizedInput.sourceRef, /^SRC-[a-f0-9]{16}$/, `${item.id}: sourceRef inválida`)
    assert.equal(item.expectedOutput.sourceRef, item.anonymizedInput.sourceRef, `${item.id}: fonte esperada divergente`)
    assert.equal(item.expectedOutput.pipelineDecision, item.anonymizedInput.observable.pipelineStatus, `${item.id}: decisão divergente`)
    assert.equal(item.expectedOutput.requiresCitation, true, `${item.id}: citação obrigatória`)
    assert.equal(item.anonymizedInput.observable.fieldCount, item.anonymizedInput.observable.fieldKeys.length, `${item.id}: fieldCount divergente`)
    assert.deepEqual(item.expectedOutput.expectedFieldKeys, item.anonymizedInput.observable.fieldKeys, `${item.id}: campos esperados divergentes`)
    assert.ok(item.correctSources.some((source) => source.sourceRef === item.anonymizedInput.sourceRef), `${item.id}: fonte correta ausente`)
    assert.ok(['candidate', 'baseline', 'approved'].includes(item.reviewStatus), `${item.id}: reviewStatus inválido`)
    assert.equal(item.datasetVersion, 1, `${item.id}: versão do dataset`)
    assertNoSensitiveShape(item)
  }

  const statuses = Object.fromEntries([...new Set(cases.map((item) => item.reviewStatus))].map((status) => [
    status,
    cases.filter((item) => item.reviewStatus === status).length,
  ]))
  process.stdout.write(`${JSON.stringify({ success: true, total: cases.length, reviewStatus: statuses }, null, 2)}\n`)
}

main().catch((err) => {
  process.stderr.write(`[eval-alix-golden] ${(err as Error).message}\n`)
  process.exitCode = 1
})

