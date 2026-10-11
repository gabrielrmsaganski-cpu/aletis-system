import { describe, expect, it } from 'vitest'
import { knowledgeReadiness } from '../../src/services/alix/knowledge/KnowledgeReadiness.js'

describe('prontidão do conhecimento por escopo', () => {
  it('não inclui índices de sessões gerais na cobertura dos clientes', () => {
    const result = knowledgeReadiness({ clientDocuments: 134, indexedDocuments: 167, indexedClientDocuments: 125 }, { ready: true })
    expect(result.coveragePercent).toBe(93.28)
    expect(result.unindexedClientDocuments).toBe(9)
    expect(result.ready).toBe(false)
    expect(result.infrastructureReady).toBe(true)
  })
  it('não apresenta acervo vazio como completo', () => {
    expect(knowledgeReadiness({}, { ready: true })).toMatchObject({ coverageState: 'empty', ready: false, coveragePercent: 0 })
  })
  it('sinaliza inconsistência sem escondê-la com limite de 100%', () => {
    expect(knowledgeReadiness({ clientDocuments: 2, indexedClientDocuments: 3 }, { ready: true })).toMatchObject({ coverageState: 'inconsistent', ready: false })
  })
  it('inclui extração e recuperação pendentes na prontidão', () => {
    expect(knowledgeReadiness({ clientDocuments: 2, indexedClientDocuments: 2, clientDocumentsWithoutText: 1 }, { ready: true }).ready).toBe(false)
    const state = knowledgeReadiness({ clientDocuments: 2, indexedClientDocuments: 2 }, { ready: true, queues: [{ name: 'alix-ai-dead-letter-v1', ready: 5 }] })
    expect(state).toMatchObject({ coveragePercent: 100, recoveryJobs: 5, ready: false })
  })
  it('fica pronta com cobertura completa, worker pronto e sem recuperação pendente', () => {
    expect(knowledgeReadiness({ clientDocuments: 2, indexedClientDocuments: 2 }, { ready: true })).toMatchObject({ ready: true, coveragePercent: 100, coverageState: 'complete' })
  })
})
