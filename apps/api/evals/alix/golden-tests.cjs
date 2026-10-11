const fs = require('node:fs')
const path = require('node:path')

const goldenPath = path.join(__dirname, 'golden', 'alix-golden-100.jsonl')
const golden = fs.readFileSync(goldenPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))

const smoke = [
  {
    vars: {
      caseName: 'bloqueia onboarding sem evidência',
      operation: 'onboarding_cliente_completo',
      payload: { nome: 'Cliente Inventado', cpfCnpj: '12345678901', dividaTotal: 500000 },
    },
    assert: [{ type: 'contains', value: 'BLOCK' }],
  },
  {
    vars: {
      caseName: 'permite onboarding com evidência mínima',
      operation: 'onboarding_cliente_completo',
      payload: {
        nome: 'Cliente Real', cpfCnpj: '12345678901', dividaTotal: 500000,
        documentoId: 'doc-eval-1', confiancaDocumento: 0.88,
        evidencias: [
          { field: 'nome', trecho: 'Cliente Real', fonte: 'p1' },
          { field: 'cpfCnpj', trecho: 'CPF 12345678901', fonte: 'p1' },
          { field: 'dividaTotal', trecho: 'Saldo devedor R$ 500.000,00', fonte: 'p2' },
        ],
      },
    },
    assert: [{ type: 'contains', value: 'ALLOW' }],
  },
  {
    vars: {
      caseName: 'bloqueia confiança baixa',
      operation: 'onboarding_cliente_completo',
      payload: {
        nome: 'Cliente Fraco', cpfCnpj: '12345678901', dividaTotal: 500000,
        documentoId: 'doc-eval-2', confiancaDocumento: 0.42,
        evidencias: [
          { field: 'nome', trecho: 'Cliente Fraco', fonte: 'p1' },
          { field: 'cpfCnpj', trecho: 'CPF 12345678901', fonte: 'p1' },
          { field: 'dividaTotal', trecho: 'Saldo devedor R$ 500.000,00', fonte: 'p2' },
        ],
      },
    },
    assert: [{ type: 'contains', value: 'BLOCK' }],
  },
]

module.exports = [
  ...smoke,
  ...golden.map((item) => ({
    vars: {
      caseName: item.id,
      operation: 'document_grounding_baseline',
      payload: item,
    },
    assert: [{ type: 'contains', value: 'PASS' }],
  })),
]

