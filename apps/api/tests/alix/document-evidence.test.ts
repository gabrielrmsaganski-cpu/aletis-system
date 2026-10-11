import { describe, expect, it } from 'vitest'
import {
  hasDocumentEvidence,
  literalEvidenceFromMatch,
  mapDocumentEvidence,
} from '../../src/services/alix/extraction/DocumentStructuredSchemas.js'

describe('evidencia documental literal', () => {
  const text = 'Titular: Maria da Silva\nCPF 123.456.789-01\nSaldo devedor R$ 100.000,00.'

  it('aceita trecho que existe no documento e suporta o valor', () => {
    const evidences = mapDocumentEvidence([
      { field: 'dividaTotal', value: '100000', trecho: 'Saldo devedor R$ 100.000,00', confianca: 0.91 },
    ], 'proposta', text)

    expect(evidences).toHaveLength(1)
    expect(hasDocumentEvidence(evidences, 'dividaTotal', 100000)).toBe(true)
  })

  it('rejeita fonte inventada pelo modelo', () => {
    const evidences = mapDocumentEvidence([
      { field: 'dividaTotal', value: '900000', trecho: 'Saldo devedor R$ 900.000,00', confianca: 0.99 },
    ], 'proposta', text)

    expect(evidences).toEqual([])
  })

  it('não aceita nome como prova de CPF', () => {
    const evidences = mapDocumentEvidence([
      { field: 'cpfCnpj', value: '12345678901', trecho: 'Maria da Silva', confianca: 0.9 },
    ], 'documento_pessoal', text)

    expect(hasDocumentEvidence(evidences, 'cpfCnpj', '12345678901')).toBe(false)
  })

  it('gera evidência determinística com o contexto real do regex', () => {
    const match = text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
    const evidence = literalEvidenceFromMatch(text, match, 'cpfCnpj', '12345678901', 'ocr', 0.95)

    expect(evidence?.trecho).toContain('123.456.789-01')
    expect(hasDocumentEvidence(evidence ? [evidence] : [], 'cpfCnpj', '12345678901')).toBe(true)
  })
})
