import type { NotebookArtifact } from './AlixNotebookService.js'

export type NotebookCitation = NotebookArtifact['citations'][number]

export const NOTEBOOK_EXPORT_NOTICE = 'Rascunho para revisão. As referências reproduzem os trechos utilizados nesta versão; não comprovam leitura integral do acervo nem conferência atual das fontes.'

export class NotebookCitationError extends Error {
  readonly statusCode = 422
  readonly code = 'NOTEBOOK_CITATION_INVALID'
}

function citationIds(markdown: string): string[] {
  // Exemplos entre crases são texto literal, não afirmações com referência.
  const prose = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
  return [...new Set(Array.from(prose.matchAll(/\[S(\d+)\]/gi), match => `S${match[1]}`))]
}

/** Uma exportação não pode esconder referência ausente ou dar dois sentidos ao mesmo marcador. */
export function verifiedNotebookCitations(artifact: NotebookArtifact): NotebookCitation[] {
  if (/\[fonte não disponível\]/i.test(artifact.markdown)) throw new NotebookCitationError('O documento contém referência não disponível. Recupere a fonte ou revise o trecho antes de exportar.')
  const citations = new Map<string, NotebookCitation>()
  for (const item of artifact.citations || []) {
    const id = String(item?.id || '').toUpperCase()
    if (!/^S[1-9]\d*$/.test(id) || !String(item?.documentId || '').trim() || !String(item?.filename || '').trim() || !String(item?.quote || '').trim()) {
      throw new NotebookCitationError('A referência documental está incompleta. Revise as fontes do Notebook antes de exportar.')
    }
    const citation = { ...item, id }
    const previous = citations.get(id)
    const fingerprint = (value: NotebookCitation) => JSON.stringify([value.documentId, value.filename, value.source, value.page, value.sheet, value.quote])
    if (previous && fingerprint(previous) !== fingerprint(citation)) throw new NotebookCitationError(`A referência [${id}] aponta para fontes diferentes. Revise o documento antes de exportar.`)
    citations.set(id, citation)
  }
  const missing = citationIds(artifact.markdown).filter(id => !citations.has(id))
  if (missing.length) throw new NotebookCitationError(`Não foi possível conferir ${missing.map(id => `[${id}]`).join(', ')}. Recupere as fontes ou revise essas citações antes de exportar.`)
  return [...citations.values()]
}

export function notebookCitationAnchor(id: string): string {
  if (!/^S[1-9]\d*$/i.test(id)) throw new Error('Identificador de referência inválido.')
  return `fonte_${id.toUpperCase()}`
}

export function notebookCitationUrl(citation: NotebookCitation): string | undefined {
  const raw = citation.source?.trim()
  if (!raw || !/^https?:\/\//i.test(raw)) return undefined
  try {
    const url = new URL(raw)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined
  } catch { return undefined }
}
