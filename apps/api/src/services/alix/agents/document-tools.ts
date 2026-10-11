import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { getDocumentIntakeService } from '../intake/DocumentIntakeService.js'
import { createDocumentReader } from '../intake/DocumentReadService.js'
import type { SubAgentContext } from './types.js'

export function buildSubAgentDocumentTools(
  ctx: SubAgentContext,
): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const intake = getDocumentIntakeService()
  const allowed = new Set(ctx.documentIds || [])
  const read = createDocumentReader()
  const tools: LLMTool[] = [{
    name: 'ver_documento_anexado',
    description: 'Lê trechos de um documento anexado com origem e cobertura. Continue com nextCursor até terminar; para localizar um dado em arquivo longo, leia as partes necessárias. Use antes de copiar dados para CRM ou artefato.',
    input_schema: {
      type: 'object',
      properties: { documentoId: { type: 'string' }, cursor: { type: 'string' }, maxChars: { type: 'integer', minimum: 1000, maximum: 16000 } },
      required: ['documentoId'],
    },
  }]
  const registry: LLMToolRegistry = {
    ver_documento_anexado: {
      spec: tools[0],
      handler: async (input) => {
        const documentoId = String(input.documentoId || '')
        if (!allowed.has(documentoId)) {
          return { ok: false, error: 'Documento não pertence aos anexos desta delegação.' }
        }
        const doc = await intake.get(ctx.sessionId, documentoId)
        if (!doc) return { ok: false, error: 'Documento não encontrado nesta sessão.' }
        if (ctx.clienteId && doc.clienteId && doc.clienteId !== ctx.clienteId) {
          return { ok: false, code: 'DOCUMENT_CLIENT_MISMATCH', error: 'Documento vinculado a outro cliente nesta delegação.' }
        }
        const page = read(doc, { cursor: typeof input.cursor === 'string' ? input.cursor : undefined,
          maxChars: typeof input.maxChars === 'number' ? input.maxChars : undefined })
        return {
          ok: true,
          documento: {
            ...page,
            textoExtraido: page.extractedText,
          },
        }
      },
    },
  }
  return { tools, registry }
}
