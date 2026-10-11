import { z } from 'zod'
import type { LLMTool, LLMToolRegistry } from '../../llm/OpenAIClient.js'
import { alixGetClientes } from '../../AlixService.js'
import { getGoogleDriveService } from '../../google-workspace/drive.js'
import { getGoogleWorkspaceService } from '../../google-workspace/services.js'
import type { GoogleWorkspaceActor } from '../../google-workspace/schemas.js'
import { getEvolutionClient } from '../../whatsapp/evolution/EvolutionClient.js'
import { isWhatsAppAutomationEnabled } from '../../whatsapp/AutomationSafety.js'
import { getDocumentIntakeService } from '../intake/DocumentIntakeService.js'
import { readDriveFileForImport } from '../../google-workspace/DriveImportReader.js'
import { getDriveKnowledgeService } from '../../google-workspace/DriveKnowledgeService.js'
import { driveImportDocumentId } from '../../google-workspace/DriveSourceIdentity.js'

export interface WorkspaceIntegrationContext {
  sessionId: string
  clienteId?: string
  consultorId?: string
  actor?: GoogleWorkspaceActor
  signal?: AbortSignal
}

const clientInput = z.object({ clienteId: z.string().trim().min(1).optional() })
const searchInput = clientInput.extend({
  busca: z.string().trim().max(160).optional(),
  offset: z.number().int().min(0).max(100_000).default(0),
  limite: z.number().int().min(1).max(40).default(20),
  atualizar: z.boolean().default(false),
})
const importInput = clientInput.extend({ fileId: z.string().trim().min(1).max(200) })
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
/** As ferramentas leem as conexões já configuradas e importam para o intake existente. */
export function buildWorkspaceIntegrationTools(context: WorkspaceIntegrationContext): { tools: LLMTool[]; registry: LLMToolRegistry } {
  const tools: LLMTool[] = []
  const registry: LLMToolRegistry = {}
  const actor = context.actor || (context.consultorId ? {
    userId: context.consultorId, userName: 'Consultor ALETIS', role: 'consultor', tenantId: process.env.DEFAULT_TENANT_ID || 'default',
  } : undefined)
  const assertActive = () => context.signal?.throwIfAborted()
  const requireActor = () => {
    if (!actor?.userId) throw new Error('A consulta às integrações precisa do usuário da sessão autenticada.')
    return actor
  }
  const clientIdFor = (supplied?: string) => {
    const id = supplied || context.clienteId
    if (!id) throw new Error('Selecione o cliente ou consulte seu ID no CRM antes de acessar os documentos do Drive.')
    if (context.clienteId && supplied && supplied !== context.clienteId) throw new Error('O cliente solicitado difere do contexto ativo. Troque o contexto antes de consultar seu Drive.')
    if (!alixGetClientes().some(client => client.id === id)) throw new Error('Cliente não encontrado no CRM. Consulte o cadastro antes de continuar.')
    return id
  }
  const add = (tool: LLMTool, handler: (input: Record<string, unknown>) => Promise<unknown>) => {
    tools.push(tool)
    registry[tool.name] = { spec: tool, handler: async input => {
      assertActive()
      try { return await handler(input) }
      catch (error) {
        assertActive()
        return { success: false, error: error instanceof Error ? error.message : 'Não foi possível consultar esta integração.', completed: false }
      }
    } }
  }

  add({
    name: 'consultar_integracoes_alix',
    description: 'Consulta o estado REAL das conexões Google Drive/Docs/Agenda e WhatsApp Evolution. Use antes de prometer leitura do Drive ou envio. Não conecta contas nem envia mensagens.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  }, async () => {
    const checkedAt = new Date().toISOString()
    const [google, whatsapp] = await Promise.allSettled([
      getGoogleWorkspaceService().status(requireActor()), getEvolutionClient().getRuntimeStatus(),
    ])
    assertActive()
    return {
      success: true, checkedAt,
      google: google.status === 'fulfilled' ? {
        status: google.value.status, configured: google.value.configured, enabled: google.value.enabled,
        connectionMode: google.value.connectionMode, features: google.value.features,
      } : { status: 'unknown', error: 'Não foi possível verificar a conexão Google neste momento.' },
      whatsapp: whatsapp.status === 'fulfilled' ? {
        provider: whatsapp.value.provider, status: whatsapp.value.status, configured: whatsapp.value.configurado,
        reachable: whatsapp.value.reachable, checkedAt: whatsapp.value.checkedAt, automationEnabled: isWhatsAppAutomationEnabled(),
      } : { status: 'unknown', error: 'Não foi possível verificar o WhatsApp neste momento.' },
      connectionSettingsUrl: '/configuracoes',
    }
  })

  add({
    name: 'buscar_arquivos_drive_cliente',
    description: 'Localiza documentos na pasta Drive vinculada ao cliente e subpastas, por nome/caminho. Retorna IDs reais, links, data e estado do inventário. Se a varredura estiver parcial, continue consultando; resultado vazio parcial NÃO prova ausência. Busca em nomes, não no conteúdo.',
    input_schema: { type: 'object', properties: {
      clienteId: { type: 'string' }, busca: { type: 'string', description: 'Trecho do nome ou caminho' },
      offset: { type: 'integer', minimum: 0 }, limite: { type: 'integer', minimum: 1, maximum: 40 },
      atualizar: { type: 'boolean', description: 'Reinicia o inventário; use apenas para atualizar arquivos alterados. Para continuar uma varredura, deixe false.' },
    }, additionalProperties: false },
  }, async raw => {
    const input = searchInput.parse(raw)
    const clienteId = clientIdFor(input.clienteId)
    const inventory = await getGoogleDriveService().listClientFiles({ actor: requireActor(), clientId: clienteId, limit: 500, refresh: input.atualizar })
    assertActive()
    const query = normalize(input.busca || '')
    const matches = inventory.files.filter(file => !query || normalize(`${file.name} ${file.path}`).includes(query))
    const files = matches.slice(input.offset, input.offset + input.limite)
    const knowledge = await getDriveKnowledgeService().inspect({ actor: requireActor(), clientId: clienteId, files })
    assertActive()
    const reading = new Map(knowledge.files.map(file => [file.fileId, file]))
    const nextOffset = input.offset + files.length < matches.length ? input.offset + files.length : null
    const complete = inventory.status === 'complete' && !inventory.truncated
    return {
      success: true, clienteId, source: 'google_drive', files: files.map(file => ({ ...file, reading: reading.get(file.id) || null })), nextOffset,
      readingStatusSource: knowledge.source,
      matchesInCurrentInventory: matches.length, filesInCurrentInventory: inventory.files.length,
      inventoryStatus: inventory.status, inventoryComplete: complete, updatedAt: inventory.updatedAt || null,
      pendingFolders: inventory.pendingFolders ?? null, error: inventory.error || null,
      instruction: inventory.status === 'unlinked' ? 'O cliente não tem uma pasta vinculada. Vincule sua pasta na ficha do cliente.'
        : !complete ? 'Inventário parcial. Continue a consulta com atualizar=false antes de concluir que um documento não existe.'
          : nextOffset !== null ? 'Há mais resultados; use nextOffset para continuar.' : 'Inventário concluído na data informada. Conteúdo dos arquivos ainda não lido.',
    }
  })

  add({
    name: 'consultar_cobertura_drive_cliente',
    description: 'Compara o inventário real do Drive com os documentos persistidos no CRM/ALIX: identifica arquivos ainda não importados, versões alteradas, OCR/linhas pendentes e vínculos em revisão. Use para planejar uma leitura completa e priorizar lacunas. Não significa análise semântica de todo o conteúdo nem altera cadastros.',
    input_schema: { type: 'object', properties: { clienteId: { type: 'string' }, atualizar: { type: 'boolean' } }, additionalProperties: false },
  }, async raw => {
    const input = clientInput.extend({ atualizar: z.boolean().default(false) }).parse(raw)
    const clienteId = clientIdFor(input.clienteId)
    const inventory = await getGoogleDriveService().listClientFiles({ actor: requireActor(), clientId: clienteId, limit: 500, refresh: input.atualizar })
    const coverage = await getDriveKnowledgeService().inspect({ actor: requireActor(), clientId: clienteId, files: inventory.files })
    assertActive()
    const pending = coverage.files.filter(file => file.freshness !== 'current' || file.extractionStatus !== 'complete' || file.needsClientReview)
    return {
      success: coverage.source !== 'unavailable', clienteId, inventoryStatus: inventory.status,
      readingStatusSource: coverage.source, error: coverage.source === 'unavailable' ? coverage.error : null,
      inventoryComplete: inventory.status === 'complete' && !inventory.truncated,
      pendingFolders: inventory.pendingFolders || 0, checkedAt: coverage.checkedAt, totals: coverage.totals,
      pending: pending.slice(0, 20), morePending: Math.max(0, pending.length - 20),
      instruction: inventory.status !== 'complete' ? 'Continue o inventário com atualizar=false. Estes totais ainda são parciais.'
        : 'Priorize versões desatualizadas e documentos não importados; conclua extração/OCR e confira o vínculo com o cliente. Para cada documento, use leitura paginada e análise profunda; nenhum total comprova compreensão integral.',
    }
  })

  add({
    name: 'importar_documento_drive_para_alix',
    description: 'Importa um arquivo REAL do Drive do cliente para os documentos desta conversa, com origem recuperável. Aceita PDF, imagens, planilhas, textos e exporta Google Docs/Sheets/Slides. Retorna documentId e estado de processamento; queued/processing ainda NÃO é leitura concluída. Depois use ver_documento/analisar_documento_profundo. Não cria cadastro nem move arquivos no Drive.',
    input_schema: { type: 'object', properties: { clienteId: { type: 'string' }, fileId: { type: 'string' } }, required: ['fileId'], additionalProperties: false },
  }, async raw => {
    const input = importInput.parse(raw)
    const clienteId = clientIdFor(input.clienteId)
    if (!context.sessionId) throw new Error('Abra uma conversa da ALIX antes de importar o arquivo.')
    const owner = requireActor()
    const read = await readDriveFileForImport({ actor: owner, clientId: clienteId, fileId: input.fileId, signal: context.signal })
    const source = read.source
    const documentId = driveImportDocumentId({ actor: owner, clientId: clienteId, sessionId: context.sessionId, source, buffer: read.buffer })
    const intake = getDocumentIntakeService()
    const existing = await intake.get(context.sessionId, documentId)
    const document = await intake.enqueue({
      buffer: read.buffer, filename: read.filename, mimetype: read.mimetype, sessionId: context.sessionId, source, documentId,
    }, { requestedBy: owner.userId, requestedClienteId: clienteId })
    assertActive()
    const processingState = String(document.metadata?.processingState || 'unknown')
    return {
      success: true, imported: true, reused: Boolean(existing), registeredInCrm: false, documentId: document.id, sessionId: document.sessionId, clienteId,
      filename: document.filename, processingState, source, needsReview: (document.metadata.clientScopeReview as { status?: string } | undefined)?.status !== 'verified',
      extractedTextAvailable: Boolean(document.extractedText?.trim()),
      instruction: 'O arquivo foi recebido para leitura nesta conversa e aguarda confirmação de destino pelo consultor antes de entrar no conhecimento do cliente. Consulte ver_documento para acompanhar a leitura. Peça ao usuário revisar o vínculo na interface; não confirme identidade por conta própria nem afirme cadastro ou análise concluídos.',
    }
  })
  return { tools, registry }
}
