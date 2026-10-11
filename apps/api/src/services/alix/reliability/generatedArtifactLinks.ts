import { objectValue, toolFailure, toolOutcome } from '../tools/ToolOutcome.js'
import type { ExecutionEvidence } from './executionGrounding.js'

const GENERATORS = new Set([
  'gerar_documento_fundamentado', 'gerar_proposta_reestruturacao', 'gerar_parecer_tecnico',
  'gerar_relatorio_bsc', 'gerar_fluxo_caixa_xlsx', 'gerar_memoria_calculo_docx', 'gerar_plano_custeio_pdf',
])
const KINDS = new Set(['pdf', 'docx', 'xlsx'])
const TARGET = String.raw`(?:sandbox:)?/api/alix/documents/generated/[A-Za-z0-9_-]{1,200}`
const MARKDOWN_LINK = String.raw`\[(?:\\.|[^\]\\\n])*\]\([^\n)]*\)`
const LINK_TOKEN = new RegExp(`${MARKDOWN_LINK}|\x60${TARGET}\x60|<${TARGET}>|(?<![\\w/:.-])${TARGET}(?![\\w/?#%=&-]|\\.[A-Za-z0-9])`, 'g')
const MARKDOWN_TARGET = /\]\(\s*<?((?:sandbox:)?\/api\/alix\/documents\/generated\/[A-Za-z0-9_-]{1,200})>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)$/

function generatedArtifacts(evidence: ExecutionEvidence[]) {
  const artifacts = new Map<string, { url: string; kind: string }>()
  const seen = new Set<object>()
  const visit = (entries: ExecutionEvidence[], depth: number) => {
    if (depth > 4) return
    for (const entry of entries) {
      if (!entry || typeof entry.tool !== 'string') continue
      const output = objectValue(entry.result)
      if (!output) continue
      if (entry.tool.startsWith('delegate_')) {
        if (seen.has(output)) continue
        seen.add(output)
        // Somente recibos estruturados das ferramentas; summary/artifacts/input do modelo não comprovam emissão.
        const nested = Array.isArray(output.toolEvidence) ? output.toolEvidence.filter((item): item is ExecutionEvidence => {
          const value = objectValue(item)
          return typeof value?.tool === 'string' && Object.hasOwn(value, 'result')
        }) : []
        visit(nested, depth + 1)
        continue
      }
      if (!GENERATORS.has(entry.tool) || toolFailure(output) || toolOutcome(entry.tool, output) === 'prepared' || output.documentGenerated === false) continue
      if (entry.tool === 'gerar_documento_fundamentado' && (output.ok !== true || output.status !== 'rascunho')) continue
      const document = objectValue(output.document) || objectValue(objectValue(output.metadata)?.document)
      if (!document || typeof document.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(document.id)
        || typeof document.kind !== 'string' || !KINDS.has(document.kind)
        || typeof document.filename !== 'string' || !document.filename.trim()
        || typeof document.sizeBytes !== 'number' || !Number.isSafeInteger(document.sizeBytes) || document.sizeBytes <= 0) continue
      const url = `/api/alix/documents/generated/${document.id}`
      if (document.downloadUrl !== url) continue
      artifacts.set(url, { url, kind: document.kind })
    }
  }
  visit(evidence, 0)
  return artifacts
}

/** Corrige apresentação de arquivos comprovados neste turno, sem transformar IDs sugeridos em emissão real. */
export function normalizeGeneratedArtifactLinks(text: string, evidence: ExecutionEvidence[]): string {
  const artifacts = generatedArtifacts(evidence)
  if (!artifacts.size) return text
  return text.replace(LINK_TOKEN, token => {
    if (token.startsWith('[')) {
      const match = MARKDOWN_TARGET.exec(token)
      if (!match) return token
      const target = match[1]
      const artifact = artifacts.get(target.replace(/^sandbox:/, ''))
      if (!artifact) return token
      const start = match.index + match[0].indexOf(target)
      return token.slice(0, start) + artifact.url + token.slice(start + target.length)
    }
    const target = token.replace(/^[`<]|[`>]$/g, '').replace(/^sandbox:/, '')
    const artifact = artifacts.get(target)
    return artifact ? `[Baixar ${artifact.kind.toUpperCase()}](${artifact.url})` : token
  })
}
