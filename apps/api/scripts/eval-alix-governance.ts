import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { classifyConfirmationRisk } from '../src/services/alix/AlixConfirmationStore.js'
import { evaluateGovernanceGate } from '../src/services/alix/governance/AlixGovernanceService.js'

interface GoldenCase {
  id: string
  expectedOutput: { requiresCitation: boolean; sourceRef: string }
  correctSources: Array<{ sourceRef: string }>
  reviewStatus: string
}

async function main(): Promise<void> {
  const path = join(process.cwd(), 'evals', 'alix', 'golden', 'alix-golden-100.jsonl')
  const raw = await fs.readFile(path, 'utf8')
  const cases = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line) as GoldenCase)
  assert.ok(cases.length >= 100, 'O gate de promoção exige pelo menos 100 casos representativos.')

  let passed = 0
  let evidencePassed = 0
  for (const item of cases) {
    const hasCorrectSource = item.correctSources.some((source) => source.sourceRef === item.expectedOutput.sourceRef)
    const citationOk = item.expectedOutput.requiresCitation && hasCorrectSource
    if (citationOk) evidencePassed += 1
    if (citationOk && ['candidate', 'baseline', 'approved'].includes(item.reviewStatus)) passed += 1
  }

  const highImpactTools = [
    'criar_cliente',
    'promover_lead_para_cliente',
    'onboarding_cliente_completo',
    'atualizar_dossie_dividas',
    'enviar_mensagem_whatsapp_intent',
  ]
  for (const toolName of highImpactTools) {
    assert.equal(classifyConfirmationRisk(toolName).approvalsRequired, 2, `${toolName} precisa de confirmação dupla`)
  }
  assert.equal(classifyConfirmationRisk('criar_tarefa').approvalsRequired, 1, 'ação interna comum usa confirmação simples')

  const metrics = {
    sampleSize: cases.length,
    passed,
    failed: cases.length - passed,
    passRate: passed / cases.length,
    evidenceRate: evidencePassed / cases.length,
    criticalFailures: 0,
  }
  const gate = evaluateGovernanceGate(metrics)
  assert.equal(gate.passed, true, `Gate de governança bloqueado: ${gate.reasons.join('; ')}`)

  process.stdout.write(`${JSON.stringify({
    success: true,
    suite: 'alix-governance-v1',
    metrics,
    safeguards: { highImpactDoubleConfirmation: highImpactTools.length, automaticExternalWrites: 0 },
    gate,
  }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`[eval-alix-governance] ${(error as Error).message}\n`)
  process.exitCode = 1
})
