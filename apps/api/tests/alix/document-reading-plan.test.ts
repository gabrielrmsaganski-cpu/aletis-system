import { describe, expect, it } from 'vitest'
import { buildDocumentReadingPlan, documentExtractionCoverage, documentReadingCoverage } from '../../src/services/alix/intake/DocumentReadingPlan.js'

const doc = (text: string) => ({ kind: 'text' as const, extractedText: text, metadata: {} })

describe('cobertura verificável de leitura', () => {
  it('cobre cada caractere uma vez e preserva o final em segmentos consecutivos', () => {
    const text = 'Início\n' + 'Cláusula intermediária.\n'.repeat(3200) + 'FIM: obrigação extraordinária.'
    const plan = buildDocumentReadingPlan(doc(text), { segmentCharacters: 1000 })
    expect(plan.segments.map(segment => text.slice(segment.start, segment.end)).join('')).toBe(text)
    expect(plan.segments.at(-1)?.text).toContain('FIM: obrigação extraordinária.')
    expect(documentReadingCoverage(plan, plan.segments.map(segment => segment.index))).toMatchObject({ complete: true, analyzedCharacters: text.length })
  })
  it('contabiliza falhas e pendências sem inflar caracteres por sobreposição', () => {
    const plan = buildDocumentReadingPlan(doc('x'.repeat(8000)), { segmentCharacters: 1000 })
    const coverage = documentReadingCoverage(plan, [0, 2, 2], [1])
    expect(coverage).toMatchObject({ complete: false, status: 'partial', analyzedCharacters: 2000, analyzedSegments: 2, failedSegments: [1] })
    expect(coverage.pendingSegments).toEqual([1, 3, 4, 5, 6, 7])
  })
  it('reconhece páginas e não confunde parser incompleto com análise completa', () => {
    const source = { kind: 'pdf' as const, pageCount: 3, extractedText: '--- Página 1 ---\n' + 'A'.repeat(1000) + '\n--- Página 3 ---\nFINAL', metadata: { extractionCoverage: { status: 'partial', totalPages: 3, readablePages: [1, 3], pendingPages: [2], limitations: ['Página 2 ainda sem OCR.'] } } }
    const plan = buildDocumentReadingPlan(source, { segmentCharacters: 1000 })
    expect(plan.segments.at(-1)?.pageEnd).toBe(3)
    const coverage = documentReadingCoverage(plan, plan.segments.map(segment => segment.index))
    expect(coverage.complete).toBe(false)
    expect(coverage.extraction.pendingPages).toEqual([2])
  })
  it('invalida hash quando texto ou cobertura muda, preserva quando só muda cache', () => {
    const before = buildDocumentReadingPlan(doc('conteúdo'))
    expect(buildDocumentReadingPlan({ ...doc('conteúdo'), metadata: { deepAnalysis: { ignored: true } } }).sourceHash).toBe(before.sourceHash)
    expect(buildDocumentReadingPlan(doc('conteúdo novo')).sourceHash).not.toBe(before.sourceHash)
    expect(buildDocumentReadingPlan({ ...doc('conteúdo'), metadata: { extractionCoverage: { status: 'partial', limitations: ['pendente'] } } }).sourceHash).not.toBe(before.sourceHash)
  })
  it('não classifica planilhas antigas ou páginas sem comprovante como completas', () => {
    expect(documentExtractionCoverage({ kind: 'xlsx', extractedText: 'linhas', metadata: {} }).status).toBe('unknown')
    expect(documentExtractionCoverage({ kind: 'pdf', extractedText: '--- Página 1 ---\ntexto', pageCount: 2, metadata: {} }).pendingPages).toEqual([2])
  })
})
