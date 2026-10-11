import { test } from 'vitest'
import assert from 'node:assert'
import { buildDocumentOnboardingCandidate } from '../../src/services/alix/intake/DocumentOnboardingReviewService.ts'
import type { IngestedDocument } from '../../src/services/alix/intake/types.ts'
import type { DocumentExtractionResult } from '@aletis/shared-types'

function doc(entities: unknown[]): IngestedDocument {
  return {
    id: 'doc-1',
    sessionId: 'sess-1',
    filename: 'proposta.pdf',
    mimetype: 'application/pdf',
    sizeBytes: 1000,
    uploadedAt: '2026-05-13T00:00:00.000Z',
    kind: 'pdf',
    extractedText: 'Proposta de renegociação com saldo devedor.',
    metadata: { entities },
    evidences: [
      {
        id: 'ev-1',
        kind: 'ocr',
        source: 'pdf:page:2:ocr',
        page: 2,
        text: 'Cliente João da Silva CPF 123.456.789-01. Saldo devedor total R$ 250.000,00.',
        confidence: 0.91,
      },
    ],
  }
}

test('pré-cadastro documental fica pronto só com nome, CPF/CNPJ e dívida com evidência', () => {
  const candidate = buildDocumentOnboardingCandidate(doc([
    {
      tipo: 'pessoa',
      categoria: 'devedor',
      nome: 'João da Silva',
      cpfCnpj: '123.456.789-01',
      fonte: 'Cliente João da Silva CPF 123.456.789-01',
      confianca: 0.92,
    },
    {
      tipo: 'valor',
      categoria: 'saldo devedor',
      valor: 250000,
      moeda: 'BRL',
      fonte: 'Saldo devedor total R$ 250.000,00',
      confianca: 0.9,
    },
  ]))

  assert.ok(candidate)
  assert.strictEqual(candidate.ready, true)
  assert.deepStrictEqual(candidate.missingFields, [])
  assert.strictEqual(candidate.candidate.cpfCnpj, '12345678901')
  assert.strictEqual(candidate.candidate.dividaTotal, '250000.00')
  assert.strictEqual(candidate.evidence.some((ev) => ev.field === 'dividaTotal' && ev.page === 2), true)
})

test('pré-cadastro documental não usa valor genérico como dívida', () => {
  const candidate = buildDocumentOnboardingCandidate(doc([
    {
      tipo: 'pessoa',
      categoria: 'devedor',
      nome: 'João da Silva',
      cpfCnpj: '12345678901',
      fonte: 'Cliente João da Silva CPF 123.456.789-01',
      confianca: 0.92,
    },
    {
      tipo: 'valor',
      categoria: 'honorários',
      valor: 250000,
      moeda: 'BRL',
      fonte: 'Honorários R$ 250.000,00',
      confianca: 0.9,
    },
  ]))

  assert.ok(candidate)
  assert.strictEqual(candidate.ready, false)
  assert.strictEqual(candidate.missingFields.includes('dividaTotal'), true)
  assert.strictEqual(candidate.candidate.dividaTotal, undefined)
})

test('pré-cadastro documental prioriza smartExtraction quando disponível', () => {
  const base = doc([])
  const extraction: DocumentExtractionResult = {
    documentoId: base.id,
    sessionId: base.sessionId,
    tipoDocumento: 'contrato_credito_rural',
    confianca: 0.88,
    entidades: [],
    clienteData: {
      nome: 'Maria Produtora',
      cpfCnpj: '12345678901',
      tipoPessoa: 'PF',
      cidade: 'Toledo',
      uf: 'PR',
      telefone: '(45) 99999-9999',
    },
    dividas: [
      { numeroContrato: 'CCR-001', credor: 'Banco Alfa', valorAtualizado: 200000 },
      { numeroContrato: 'CCR-002', credor: 'Banco Beta', valorOriginal: 100000 },
    ],
    propriedades: [],
    riscos: [],
    lacunas: [],
    acoesSugeridas: ['Renegociar contratos rurais com evidências documentais'],
    evidencias: [
      {
        field: 'nome',
        value: 'Maria Produtora',
        fonte: 'página 1',
        trecho: 'Contratante Maria Produtora',
        page: 1,
        confianca: 0.9,
      },
      {
        field: 'dividaTotal',
        value: 300000,
        fonte: 'página 2',
        trecho: 'Saldo atualizado total de R$ 300.000,00',
        page: 2,
        confianca: 0.87,
      },
    ],
  }
  base.metadata.smartExtraction = extraction

  const candidate = buildDocumentOnboardingCandidate(base)

  assert.ok(candidate)
  assert.strictEqual(candidate.ready, true)
  assert.strictEqual(candidate.confidence, 0.88)
  assert.strictEqual(candidate.candidate.nome, 'Maria Produtora')
  assert.strictEqual(candidate.candidate.dividaTotal, '300000.00')
  assert.deepStrictEqual(candidate.candidate.bancos, ['Banco Alfa', 'Banco Beta'])
  assert.strictEqual(candidate.evidence.some((ev) => ev.field === 'dividaTotal' && ev.page === 2), true)
})
