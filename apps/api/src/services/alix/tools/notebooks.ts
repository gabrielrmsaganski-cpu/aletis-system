// ============================================================
// notebooks - ferramentas ALIX para workspaces documentais
// ============================================================

import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { accessibleLegacySharedSessionIds, alixOwnerIds, isAlixAdmin } from '../AlixAccessService.js'
import { filterNotebookScopeAccess } from '../notebook/NotebookAccessService.js'
import { authorizeNotebookToolInput, notebookToolError, notebookToolUser } from '../notebook/NotebookToolAccess.js'
import {
  getAlixNotebookService,
  type NotebookArtifactKind,
} from '../notebook/AlixNotebookService.js'

const artifactKinds = new Set<NotebookArtifactKind>([
  'dossie',
  'briefing',
  'outline',
  'parecer',
  'proposta',
  'checklist',
  'relatorio',
  'memoria',
])

function sourcesFrom(input: unknown, defaultSessionId: string): Array<{ sessionId: string; documentId: string }> {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (typeof item === 'string') return { sessionId: defaultSessionId, documentId: item.trim() }
      const rec = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        sessionId: String(rec.sessionId || defaultSessionId).trim(),
        documentId: String(rec.documentId || '').trim(),
      }
    })
    .filter((item) => item.sessionId && item.documentId)
}

export function buildNotebookTools(sessionId: string, clienteId?: string): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}
  const svc = getAlixNotebookService()

  tools.push({
    name: 'listar_notebooks_documentais',
    description: 'Lista notebooks documentais da ALIX. Use para localizar workspaces tipo NotebookLM ja criados por cliente ou sessao.',
    input_schema: {
      type: 'object',
      properties: {
        clienteId: { type: 'string', description: 'Opcional. Restringe ao cliente.' },
        sessionId: { type: 'string', description: 'Opcional. Restringe a sessao.' },
        limit: { type: 'number', description: 'Limite de resultados.' },
      },
    },
  })
  registry.listar_notebooks_documentais = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const user = notebookToolUser(sessionId)
      const notebooks = await filterNotebookScopeAccess(user, await svc.list({
        clienteId: String(input.clienteId || clienteId || '').trim() || undefined,
        sessionId: String(input.sessionId || '').trim() || undefined,
        limit: Number(input.limit) || 20,
      }, { strict: true, ...(!isAlixAdmin(user) ? { ownerIds: alixOwnerIds(user), sharedSessionIds: await accessibleLegacySharedSessionIds(user) } : {}) }))
      return {
        total: notebooks.length,
        notebooks: notebooks.map((notebook) => ({
          id: notebook.id,
          title: notebook.title,
          clienteId: notebook.clienteId,
          sources: notebook.sources.length,
          artifacts: notebook.artifacts.length,
          objective: notebook.objective,
          updatedAt: notebook.updatedAt,
        })),
      }
    },
  }

  tools.push({
    name: 'criar_notebook_documental',
    description: 'Cria um workspace documental tipo NotebookLM para organizar documentos, notas, perguntas e geracao de artefatos com citacoes. Use quando o pedido envolver organizar/analisar varios documentos.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Titulo do notebook.' },
        objetivo: { type: 'string', description: 'Objetivo do notebook ou entrega esperada.' },
        clienteId: { type: 'string', description: 'Cliente relacionado, se houver.' },
        documentos: {
          type: 'array',
          description: 'IDs dos documentos da sessao atual ou objetos {sessionId, documentId}.',
          items: { type: 'string' },
        },
      },
      required: ['titulo'],
    },
  })
  registry.criar_notebook_documental = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const notebook = await svc.create({
        title: String(input.titulo || '').trim(),
        objective: String(input.objetivo || '').trim() || undefined,
        clienteId: String(input.clienteId || clienteId || '').trim() || undefined,
        sessionId,
        sources: sourcesFrom(input.documentos, sessionId),
      })
      return {
        ok: true,
        notebookId: notebook.id,
        title: notebook.title,
        sources: notebook.sources,
        objective: notebook.objective,
      }
    },
  }

  tools.push({
    name: 'adicionar_fontes_notebook',
    description: 'Adiciona documentos ja enviados ao notebook documental. Use antes de perguntar ou gerar quando o notebook ainda nao contem todos os anexos.',
    input_schema: {
      type: 'object',
      properties: {
        notebookId: { type: 'string', description: 'ID do notebook.' },
        documentos: {
          type: 'array',
          description: 'IDs dos documentos da sessao atual ou objetos {sessionId, documentId}.',
          items: { type: 'string' },
        },
      },
      required: ['notebookId', 'documentos'],
    },
  })
  registry.adicionar_fontes_notebook = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const notebook = await svc.addSources(
        String(input.notebookId || ''),
        sourcesFrom(input.documentos, sessionId),
      )
      return {
        ok: true,
        notebookId: notebook.id,
        totalSources: notebook.sources.length,
        sources: notebook.sources,
      }
    },
  }

  tools.push({
    name: 'pesquisar_notebook_documental',
    description: 'Busca evidencias dentro do corpus de um notebook documental, retornando trechos citaveis. Use antes de responder sobre fontes ja organizadas.',
    input_schema: {
      type: 'object',
      properties: {
        notebookId: { type: 'string', description: 'ID do notebook.' },
        query: { type: 'string', description: 'Pergunta ou termos para buscar no corpus.' },
        limit: { type: 'number', description: 'Quantidade maxima de trechos.' },
      },
      required: ['notebookId', 'query'],
    },
  })
  registry.pesquisar_notebook_documental = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const hits = await svc.search(
        String(input.notebookId || ''),
        String(input.query || ''),
        Number(input.limit) || 10,
      )
      return {
        total: hits.length,
        hits: hits.map((hit) => ({
          citationId: hit.citationId,
          documentId: hit.documentId,
          filename: hit.filename,
          source: hit.source,
          page: hit.page,
          sheet: hit.sheet,
          confidence: hit.confidence,
          score: hit.score,
          text: hit.text.slice(0, 1_500),
        })),
      }
    },
  }

  tools.push({
    name: 'perguntar_ao_notebook',
    description: 'Responde uma pergunta com base apenas nas fontes de um notebook documental e salva a resposta como artefato citavel.',
    input_schema: {
      type: 'object',
      properties: {
        notebookId: { type: 'string', description: 'ID do notebook.' },
        pergunta: { type: 'string', description: 'Pergunta para responder com base no corpus.' },
        limit: { type: 'number', description: 'Quantidade maxima de trechos recuperados.' },
        pesquisarWeb: { type: 'boolean', description: 'Complementa a resposta com pesquisa web pública.' },
      },
      required: ['notebookId', 'pergunta'],
    },
  })
  registry.perguntar_ao_notebook = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const artifact = await svc.ask(
        String(input.notebookId || ''),
        String(input.pergunta || ''),
        Number(input.limit) || 10,
        input.pesquisarWeb !== false,
      )
      return { ok: true, artifact }
    },
  }

  tools.push({
    name: 'gerar_documento_notebook',
    description: 'Redige síntese intermediária em Markdown no Notebook, com citações [S1], [S2], a partir de CRM, documentos e pesquisa web. Não emite arquivo PDF ou DOCX. Para entregar arquivo baixável, use delegate_doc_generator com os dados e fontes conferidos; um Notebook é opcional quando essa base já existe.',
    input_schema: {
      type: 'object',
      properties: {
        notebookId: { type: 'string', description: 'ID do notebook.' },
        tipo: {
          type: 'string',
          enum: ['dossie', 'briefing', 'outline', 'parecer', 'proposta', 'checklist', 'relatorio', 'memoria'],
          description: 'Tipo de artefato.',
        },
        objetivo: { type: 'string', description: 'Objetivo especifico da geracao.' },
        publico: { type: 'string', description: 'Publico alvo.' },
        limit: { type: 'number', description: 'Quantidade maxima de trechos recuperados.' },
        pesquisarWeb: { type: 'boolean', description: 'Complementa o documento com pesquisa web pública.' },
      },
      required: ['notebookId'],
    },
  })
  registry.gerar_documento_notebook = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const kind = artifactKinds.has(input.tipo as NotebookArtifactKind)
        ? input.tipo as NotebookArtifactKind
        : 'briefing'
      const artifact = await svc.synthesize(String(input.notebookId || ''), {
        kind,
        objective: String(input.objetivo || '').trim() || undefined,
        audience: String(input.publico || '').trim() || undefined,
        limit: Number(input.limit) || undefined,
        researchWeb: input.pesquisarWeb !== false,
      })
      return { ok: true, artifact }
    },
  }

  tools.push({
    name: 'mapear_fontes_notebook',
    description: 'Mostra o mapa das fontes selecionadas e as lacunas do caso antes de gerar ou atualizar um documento.',
    input_schema: {
      type: 'object',
      properties: {
        notebookId: { type: 'string', description: 'ID do notebook.' },
      },
      required: ['notebookId'],
    },
  })
  registry.mapear_fontes_notebook = {
    spec: tools[tools.length - 1],
    handler: async (input) => ({
      ok: true,
      sourceMap: await svc.sourceMap(String(input.notebookId || '')),
    }),
  }

  tools.push({
    name: 'atualizar_documento_notebook',
    description: 'Cria uma nova versão de um documento do Notebook, preservando seções não afetadas e aplicando apenas fontes, comentários e instruções novas.',
    input_schema: {
      type: 'object',
      properties: {
        notebookId: { type: 'string', description: 'ID do notebook.' },
        artifactId: { type: 'string', description: 'ID da versão que será atualizada.' },
        instrucoes: { type: 'string', description: 'Instruções editoriais adicionais.' },
        pesquisarWeb: { type: 'boolean', description: 'Atualiza também as fontes web públicas.' },
      },
      required: ['notebookId', 'artifactId'],
    },
  })
  registry.atualizar_documento_notebook = {
    spec: tools[tools.length - 1],
    handler: async (input) => {
      const artifact = await svc.updateArtifact(
        String(input.notebookId || ''),
        String(input.artifactId || ''),
        {
          instructions: String(input.instrucoes || '').trim() || undefined,
          researchWeb: input.pesquisarWeb !== false,
        },
      )
      return { ok: true, artifact }
    },
  }

  tools.push({
    name: 'converter_resposta_notebook',
    description: 'Converte uma resposta ou documento do Notebook em tarefa, nota, proposta ou checklist rastreável.',
    input_schema: {
      type: 'object',
      properties: {
        notebookId: { type: 'string', description: 'ID do notebook.' },
        artifactId: { type: 'string', description: 'ID da resposta ou documento de origem.' },
        destino: { type: 'string', enum: ['task', 'note', 'proposal', 'checklist'] },
        titulo: { type: 'string', description: 'Título opcional.' },
      },
      required: ['notebookId', 'artifactId', 'destino'],
    },
  })
  registry.converter_resposta_notebook = {
    spec: tools[tools.length - 1],
    handler: async (input) => ({
      ok: true,
      ...await svc.convertArtifact(
        String(input.notebookId || ''),
        String(input.artifactId || ''),
        {
          target: input.destino as 'task' | 'note' | 'proposal' | 'checklist',
          title: String(input.titulo || '').trim() || undefined,
        },
      ),
    }),
  }

  // O modelo escolhe argumentos, mas não escolhe o ator nem amplia sua autorização.
  // O guard único também cobre ferramentas futuras acrescentadas a este registro.
  for (const [name, entry] of Object.entries(registry)) {
    registry[name] = { ...entry, handler: async input => {
      try {
        const authorized = await authorizeNotebookToolInput(svc, sessionId, clienteId, input, sourcesFrom(input.documentos, sessionId))
        return await entry.handler(authorized)
      } catch (error) { return notebookToolError(error) }
    } }
  }
  return { tools, registry }
}
