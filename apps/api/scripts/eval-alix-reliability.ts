import assert from 'node:assert'
import { validateDocumentGrounding } from '../src/services/alix/reliability/AlixGroundingGuardService.js'

const cases = [
  {
    name: 'bloqueia onboarding sem documento/evidência',
    operation: 'onboarding_cliente_completo' as const,
    payload: {
      nome: 'Cliente Inventado',
      cpfCnpj: '12345678901',
      dividaTotal: 500000,
      origem: 'alix-documento',
    },
    expectOk: false,
  },
  {
    name: 'permite onboarding com lastro mínimo',
    operation: 'onboarding_cliente_completo' as const,
    payload: {
      nome: 'Cliente Real',
      cpfCnpj: '12345678901',
      dividaTotal: 500000,
      origem: 'alix-documento',
      documentoId: 'doc-eval-1',
      confiancaDocumento: 0.88,
      evidencias: [
        { field: 'nome', trecho: 'Cliente Real', fonte: 'p1', confianca: 0.91 },
        { field: 'cpfCnpj', trecho: 'CPF 12345678901', fonte: 'p1', confianca: 0.88 },
        { field: 'dividaTotal', trecho: 'Saldo devedor R$ 500.000,00', fonte: 'p2', confianca: 0.86 },
      ],
    },
    expectOk: true,
  },
  {
    name: 'bloqueia confiança baixa',
    operation: 'onboarding_cliente_completo' as const,
    payload: {
      nome: 'Cliente Fraco',
      cpfCnpj: '12345678901',
      dividaTotal: 500000,
      origem: 'alix-documento',
      documentoId: 'doc-eval-2',
      confiancaDocumento: 0.42,
      evidencias: [
        { field: 'nome', trecho: 'Cliente Fraco', fonte: 'p1', confianca: 0.4 },
        { field: 'cpfCnpj', trecho: 'CPF 12345678901', fonte: 'p1', confianca: 0.4 },
        { field: 'dividaTotal', trecho: 'Saldo devedor R$ 500.000,00', fonte: 'p2', confianca: 0.4 },
      ],
    },
    expectOk: false,
  },
  {
    name: 'bloqueia atualização de dívida sem evidência de contrato/valor',
    operation: 'atualizar_cliente_completo' as const,
    payload: {
      clienteId: 'cli-1',
      documentoId: 'doc-eval-3',
      confiancaDocumento: 0.9,
      dividas: [{ numeroContrato: 'CCR-123', valorAtualizado: 100000 }],
      evidencias: [{ field: 'nome', trecho: 'Cliente', fonte: 'p1', confianca: 0.9 }],
    },
    expectOk: false,
  },
]

const results = cases.map((c) => {
  const decision = validateDocumentGrounding(c.operation, c.payload)
  assert.strictEqual(decision.ok, c.expectOk, `${c.name}: esperado ok=${c.expectOk}, recebido ${decision.ok} (${decision.reasons.join(' ')})`)
  return { name: c.name, ok: decision.ok, score: decision.score, severity: decision.severity }
})

console.log(JSON.stringify({ success: true, total: results.length, results }, null, 2))
