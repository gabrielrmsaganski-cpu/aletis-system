import type { SubAgentResult } from '../agents/types.js'

export interface ResearchSource {
  tool: string
  url?: string
  title?: string
  kind: 'link' | 'search_summary' | 'page_content' | 'structured'
  excerpt?: string
  contentChars?: number
}
export interface ResearchEvidence {
  level: 'none' | 'links_only' | 'search_summary' | 'page_content' | 'structured'
  status: 'verified' | 'partial'
  sources: ResearchSource[]
  failedSources: Array<{ tool: string; url?: string; reason: string }>
  checkedAt: string
}

function object(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : undefined
}
function url(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : undefined } catch { return undefined }
}

/** Só resultados dos executores são evidência; summary do modelo não comprova consulta. */
export function assessResearchEvidence(evidence: unknown[] = []): ResearchEvidence {
  const sources = new Map<string, ResearchSource>()
  const failedSources: ResearchEvidence['failedSources'] = []
  const add = (source: ResearchSource) => {
    const key = source.url || source.tool
    const previous = sources.get(key)
    const rank = { link: 0, search_summary: 1, page_content: 2, structured: 3 }
    if (!previous || rank[source.kind] >= rank[previous.kind]) sources.set(key, source)
  }
  for (const raw of evidence) {
    const item = object(raw)
    const result = object(item?.result)
    if (!item || !result) continue
    const tool = String(item.tool || '')
    const sourceUrl = url(result.url || object(item.input)?.url)
    if (result.error || result.ok === false || result.success === false) {
      failedSources.push({ tool, url: sourceUrl, reason: String(result.error || result.message || 'Consulta não concluída').slice(0, 240) })
      continue
    }
    if (tool === 'web_search') {
      for (const rawSource of Array.isArray(result.results) ? result.results : []) {
        const source = object(rawSource)
        const link = url(source?.url)
        if (!source || !link) continue
        const snippet = typeof source.snippet === 'string' ? source.snippet.trim() : ''
        add({ tool, url: link, title: typeof source.title === 'string' ? source.title : undefined,
          kind: snippet ? 'search_summary' : 'link', ...(snippet ? { excerpt: snippet.slice(0, 700) } : {}) })
      }
      if ((!Array.isArray(result.results) || !result.results.length) && result.note) {
        failedSources.push({ tool, reason: String(result.note).slice(0, 240) })
      }
    } else if (tool === 'fetch_url') {
      const content = typeof result.content === 'string' ? result.content.trim() : ''
      if (result.ok === true && sourceUrl && content) add({ tool, url: sourceUrl, title: result.title,
        kind: 'page_content', contentChars: content.length, excerpt: content.slice(0, 700) })
      else failedSources.push({ tool, url: sourceUrl, reason: 'A ferramenta não retornou conteúdo de página verificável' })
    } else if (tool.startsWith('consultar_') && result.ok === true && result.data
      && typeof result.data === 'object' && Object.keys(result.data).length > 0) {
      // Ex.: BrasilAPI retorna data estruturado. Queries sugeridas por scrapers não entram aqui.
      add({ tool, url: sourceUrl, kind: 'structured', excerpt: JSON.stringify(result.data).slice(0, 700) })
    }
  }
  const values = [...sources.values()]
  const level: ResearchEvidence['level'] = values.some((source) => source.kind === 'structured') ? 'structured'
    : values.some((source) => source.kind === 'page_content') ? 'page_content'
    : values.some((source) => source.kind === 'search_summary') ? 'search_summary'
    : values.length ? 'links_only' : 'none'
  return { level, status: ['page_content', 'structured'].includes(level) && !failedSources.length ? 'verified' : 'partial',
    sources: values, failedSources, checkedAt: new Date().toISOString() }
}

export function renderPartialResearch(research: ResearchEvidence): string {
  const read = research.sources.filter((source) => source.kind === 'page_content' || source.kind === 'structured')
  const links = research.sources.filter((source) => source.kind === 'link' || source.kind === 'search_summary')
  const facts = read.length
    ? read.slice(0, 4).map((source) => `- Conteúdo recuperado de ${source.url || source.tool}: ${source.excerpt || 'dados estruturados retornados pela ferramenta'}`).join('\n')
    : 'Nenhuma afirmação das páginas foi confirmada por conteúdo recuperado nesta consulta.'
  const references = links.length ? `\n\nLinks localizados, sem leitura confirmada:\n${links.slice(0, 6).map((source) => `- ${source.url}${source.kind === 'search_summary' ? ` — resumo da busca: ${source.excerpt}` : ''}`).join('\n')}` : ''
  const failures = research.failedSources.slice(0, 4).map((failure) => `- ${failure.url || failure.tool}: ${failure.reason}`).join('\n')
  return `**Conclusão**\nPesquisa parcial: ${read.length ? 'parte das fontes retornou conteúdo, mas há consultas não concluídas.' : 'não foi possível obter conteúdo suficiente para confirmar os fatos solicitados.'}\n\n**Fatos**\n${facts}${references}\n\n**Riscos**\nLinks e resumos de busca não comprovam leitura das páginas.\n\n**Lacunas**\n${failures || 'Falta conteúdo verificável das fontes para concluir a pesquisa.'}\n\n**Próxima ação**\nConsultar uma fonte acessível ou fornecer o documento para análise. Consulta registrada em ${research.checkedAt.slice(0, 10)}.`
}

export function groundResearchResult(result: SubAgentResult): SubAgentResult & { research: ResearchEvidence } {
  const research = assessResearchEvidence(result.toolEvidence)
  if (research.status === 'partial') return { ...result, research, status: 'incomplete', stopReason: 'insufficient_research_evidence', summary: renderPartialResearch(research) }
  return { ...result, research }
}

/** A síntese principal também conserva os limites comprovados da delegação. */
export function partialResearchFromDelegations(evidence: Array<{ tool: string; result: unknown }>): ResearchEvidence | undefined {
  const results: ResearchEvidence[] = []
  const direct = evidence.filter((entry) => entry.tool === 'web_search' || entry.tool === 'fetch_url')
  if (direct.length) results.push(assessResearchEvidence(direct))
  for (const entry of evidence) {
    if (entry.tool !== 'delegate_web_researcher') continue
    const value = object(entry.result)
    if (!value) {
      results.push(assessResearchEvidence([{ tool: entry.tool, result: { error: 'A delegação não retornou evidências de pesquisa' } }]))
      continue
    }
    results.push(assessResearchEvidence(Array.isArray(value.toolEvidence) ? value.toolEvidence
      : [{ tool: entry.tool, result: { error: value.error || 'A delegação não retornou evidências de pesquisa' } }]))
  }
  if (!results.some((result) => result.status === 'partial')) return undefined
  const rank = { none: 0, links_only: 1, search_summary: 2, page_content: 3, structured: 4 }
  const level = results.reduce<ResearchEvidence['level']>((best, result) => rank[result.level] > rank[best] ? result.level : best, 'none')
  return { level, status: 'partial', sources: results.flatMap((result) => result.sources),
    failedSources: results.flatMap((result) => result.failedSources), checkedAt: new Date().toISOString() }
}
