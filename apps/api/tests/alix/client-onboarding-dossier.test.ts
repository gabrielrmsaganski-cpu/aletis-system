import assert from 'node:assert'
import { test } from 'vitest'

import type { DocumentExtractionResult, DocumentType } from '@aletis/shared-types'
import { buildClientOnboardingDossier } from '../../src/services/alix/intake/ClientOnboardingDossierService.ts'
import type { IngestedDocument } from '../../src/services/alix/intake/types.ts'

function documentWithExtraction(params: {
  id: string
  filename: string
  type: DocumentType
  name: string
  cpfCnpj?: string
  confidence: number
  debts?: DocumentExtractionResult['dividas']
}): IngestedDocument {
  const extraction: DocumentExtractionResult = {
    documentoId: params.id,
    sessionId: 'crm-intake-test-001',
    tipoDocumento: params.type,
    confianca: params.confidence,
    entidades: [],
    clienteData: {
      nome: params.name,
      cpfCnpj: params.cpfCnpj,
      tipoPessoa: 'PF',
      cidade: 'Sorriso',
      uf: 'MT',
    },
    dividas: params.debts || [],
    propriedades: [],
    riscos: [],
    lacunas: [],
    acoesSugeridas: [],
    evidencias: [
      {
        field: 'nome',
        value: params.name,
        fonte: `${params.filename}:página 1`,
        trecho: `Titular ${params.name}`,
        page: 1,
        confianca: params.confidence,
      },
    ],
  }
  return {
    id: params.id,
    sessionId: extraction.sessionId,
    filename: params.filename,
    mimetype: 'application/pdf',
    sizeBytes: 2_048,
    uploadedAt: '2026-07-30T10:00:00.000Z',
    kind: 'pdf',
    extractedText: `Titular ${params.name}`,
    summary: `Documento de ${params.name}`,
    metadata: { smartExtraction: extraction },
  }
}

test('dossiê prioriza documento de identidade e mantém conflito com evidências', async () => {
  const previous = process.env.ALIX_USE_LLM
  process.env.ALIX_USE_LLM = 'false'
  try {
    const identity = documentWithExtraction({
      id: 'doc-identidade',
      filename: 'cnh.pdf',
      type: 'documento_pessoal',
      name: 'Maria Aparecida Souza',
      cpfCnpj: '123.456.789-01',
      confidence: 0.96,
    })
    const proposalA = documentWithExtraction({
      id: 'doc-proposta-a',
      filename: 'proposta-a.pdf',
      type: 'proposta_comercial',
      name: 'Maria A. de Souza',
      confidence: 0.84,
    })
    const proposalB = documentWithExtraction({
      id: 'doc-proposta-b',
      filename: 'proposta-b.pdf',
      type: 'proposta_comercial',
      name: 'Maria A. de Souza',
      confidence: 0.84,
    })

    const dossier = await buildClientOnboardingDossier([proposalA, proposalB, identity])

    assert.strictEqual(dossier.campos.nome, 'Maria Aparecida Souza')
    assert.strictEqual(dossier.campos.cpfCnpj, '12345678901')
    const conflict = dossier.conflitos.find((item) => item.campo === 'nome')
    assert.ok(conflict)
    assert.strictEqual(conflict.opcoes.length, 2)
    assert.strictEqual(conflict.opcoes.every((option) => option.evidencias.length > 0), true)
    assert.strictEqual(dossier.evidenciasPorCampo.nome[0].documentoId, 'doc-identidade')
  } finally {
    if (previous === undefined) delete process.env.ALIX_USE_LLM
    else process.env.ALIX_USE_LLM = previous
  }
})

test('dossiê mantém principal e saldo parcial separados sem inventar total do cliente', async () => {
  const previous = process.env.ALIX_USE_LLM
  process.env.ALIX_USE_LLM = 'false'
  try {
    const contract = documentWithExtraction({
      id: 'doc-contrato',
      filename: 'contrato.pdf',
      type: 'contrato_credito_rural',
      name: 'João Produtor',
      cpfCnpj: '98765432100',
      confidence: 0.92,
      debts: [
        { credor: 'Banco A', valorAtualizado: 100.1, modalidade: 'Custeio' },
        { credor: 'Banco B', valorOriginal: 200.2, modalidade: 'Investimento' },
      ],
    })

    const dossier = await buildClientOnboardingDossier([contract])

    assert.strictEqual(dossier.campos.valorTotalDivida, undefined)
    assert.strictEqual(dossier.documentos[0].revisaoFinanceira?.principalDocumentado, '200.20')
    assert.strictEqual(dossier.documentos[0].revisaoFinanceira?.saldoAtualDocumentado, '100.10')
    assert.strictEqual(dossier.documentos[0].revisaoFinanceira?.coberturaSaldos, 'parcial')
    assert.strictEqual(dossier.campos.credor, 'Banco A, Banco B')
    assert.strictEqual(dossier.contratoDetectado, true)
    assert.ok(dossier.completude > 0)
  } finally {
    if (previous === undefined) delete process.env.ALIX_USE_LLM
    else process.env.ALIX_USE_LLM = previous
  }
})

test('totais divergentes entre documentos geram revisão, sem eleger saldo pela confiança', async () => {
  const documents = [0, 100].map((value, index) => {
    const doc = documentWithExtraction({ id: `saldo-${index}`, filename: `extrato-${index}.pdf`, type: 'extrato_bancario', name: 'Cliente Sintético', confidence: index ? 0.98 : 0.8 })
    const extraction = doc.metadata.smartExtraction as DocumentExtractionResult
    extraction.evidencias.push({ field: 'dividaTotal', value, fonte: 'Página 3', trecho: `Saldo devedor total R$ ${value},00`, page: 3, confianca: extraction.confianca })
    return doc
  })
  const dossier = await buildClientOnboardingDossier(documents)
  assert.strictEqual(dossier.campos.valorTotalDivida, undefined)
  const conflict = dossier.conflitos.find(item => item.campo === 'valorTotalDivida')
  assert.deepStrictEqual(conflict?.opcoes.map(option => option.value).sort(), ['0.00', '100.00'])
  assert.strictEqual(conflict?.opcoes.every(option => option.evidencias.every(ev => ev.trecho.includes('Saldo devedor total'))), true)
})

test('saldo textual recebe trecho real como evidência, preservando zero e omitindo principal', async () => {
  const doc = documentWithExtraction({ id: 'texto-saldo', filename: 'extrato.pdf', type: 'outro', name: 'Cliente Sintético', confidence: 0.9 })
  doc.metadata = {}
  doc.summary = 'Resumo genérico sem valor financeiro.'
  doc.extractedText = 'Nome: Cliente Sintético; CPF 12345678901. Saldo devedor total R$ 0,00.'
  const dossier = await buildClientOnboardingDossier([doc])
  assert.strictEqual(dossier.campos.valorTotalDivida, '0.00')
  assert.strictEqual(dossier.evidenciasPorCampo.valorTotalDivida[0].trecho, 'Saldo devedor total R$ 0,00.')
  doc.extractedText = 'Nome: Cliente Sintético; CPF 12345678901. Valor original R$ 500,00.'
  assert.strictEqual((await buildClientOnboardingDossier([doc])).campos.valorTotalDivida, undefined)
  doc.extractedText = 'Nome: Cliente Sintético; CPF 12345678901. Saldo devedor R$ 500,00.'
  assert.strictEqual((await buildClientOnboardingDossier([doc])).campos.valorTotalDivida, undefined)
  doc.extractedText = 'Nome: Cliente Sintético; CPF 12345678901. Saldo total do contrato R$ 500,00.'
  assert.strictEqual((await buildClientOnboardingDossier([doc])).campos.valorTotalDivida, undefined)
})
