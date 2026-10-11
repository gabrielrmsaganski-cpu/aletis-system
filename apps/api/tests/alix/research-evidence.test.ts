import { describe, expect, it } from 'vitest'
import { assessResearchEvidence, groundResearchResult, partialResearchFromDelegations } from '../../src/services/alix/reliability/ResearchEvidence.js'
import type { SubAgentResult } from '../../src/services/alix/agents/types.js'

const link = { tool: 'web_search', result: { results: [{ url: 'https://example.test/reference', title: 'Referência', snippet: '' }] } }
const page = { tool: 'fetch_url', result: { ok: true, url: 'https://example.test/reference', content: 'Conteúdo efetivamente retornado pela página.', title: 'Referência' } }
const response = (toolEvidence: unknown[]): SubAgentResult => ({ agent: 'WebResearcher', summary: 'Pesquisa concluída. A documentação afirma um fato não recuperado.', toolCalls: [], toolEvidence, status: 'completed', stopReason: 'completed', usage: { inputTokens: 1, outputTokens: 1, iterations: 1 } })

describe('pesquisa baseada em resultados de ferramentas', () => {
  it('links sem snippet e leituras com erro não comprovam páginas lidas', () => {
    const result = groundResearchResult(response([link, { tool: 'fetch_url', result: { error: 'HTTP 403', url: 'https://example.test/reference' } }]))
    expect(result).toMatchObject({ status: 'incomplete', stopReason: 'insufficient_research_evidence', research: { status: 'partial', level: 'links_only' } })
    expect(result.summary).toContain('Pesquisa parcial')
    expect(result.summary).toContain('HTTP 403')
    expect(result.summary).not.toContain('fato não recuperado')
    expect(result.summary).not.toContain('Pesquisa concluída')
  })

  it('resumo de busca permanece distinto de conteúdo efetivamente recuperado', () => {
    const evidence = assessResearchEvidence([{ tool: 'web_search', result: { results: [{ url: 'https://example.test', snippet: 'Resumo retornado pela busca' }] } }])
    expect(evidence).toMatchObject({ level: 'search_summary', status: 'partial', sources: [{ kind: 'search_summary' }] })
  })

  it('conteúdo lido substitui o link e permite síntese quando não há falhas', () => {
    const result = groundResearchResult(response([link, page]))
    expect(result.research).toMatchObject({ level: 'page_content', status: 'verified' })
    expect(result.research.sources).toHaveLength(1)
    expect(result.research.sources[0].kind).toBe('page_content')
    expect(result.status).toBe('completed')
  })

  it('preserva trechos lidos e explicita fontes que falharam em pesquisa parcial', () => {
    const result = groundResearchResult(response([page, { tool: 'fetch_url', result: { url: 'https://example.test/other', error: 'Página muito grande (>1MB)' } }]))
    expect(result.status).toBe('incomplete')
    expect(result.summary).toContain('Conteúdo efetivamente retornado')
    expect(result.summary).toContain('Página muito grande')
  })

  it('queries sugeridas não são dados de uma consulta estruturada', () => {
    expect(assessResearchEvidence([{ tool: 'consultar_cvm', result: { ok: true, queries: ['teste'] } }]).level).toBe('none')
    expect(assessResearchEvidence([{ tool: 'consultar_cnpj_detalhado', result: { ok: true, data: { razao_social: 'Empresa Sintética' } } }])).toMatchObject({ level: 'structured', status: 'verified' })
  })

  it('o orquestrador não aceita summary sem evidência nem delegação que só falhou', () => {
    expect(partialResearchFromDelegations([{ tool: 'delegate_web_researcher', result: { summary: 'Li tudo', status: 'completed' } }])?.status).toBe('partial')
    expect(partialResearchFromDelegations([{ tool: 'delegate_web_researcher', result: { error: 'Timeout' } }])?.failedSources[0].reason).toBe('Timeout')
    expect(partialResearchFromDelegations([{ tool: 'delegate_web_researcher', result: response([page]) }])).toBeUndefined()
  })

  it('aplica o mesmo critério quando o orquestrador pesquisa sem delegação', () => {
    expect(partialResearchFromDelegations([link, { tool: 'fetch_url', result: { error: 'HTTP 403', url: 'https://example.test/reference' } }])).toMatchObject({ status: 'partial', level: 'links_only' })
    expect(partialResearchFromDelegations([link, page])).toBeUndefined()
  })
})
