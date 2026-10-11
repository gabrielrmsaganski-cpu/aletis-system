// ============================================================
// /api/clientes/:id/documentos — listagem + upload de docs do cliente
// ============================================================
// Reusa a tabela portal_upload (cofre digital). Diferença vs portal:
//  - "enviado_por": 'consultor' (vs 'cliente' do portal)
//  - "categoria": fiscal | contrato | identidade | patrimonio | agro | outros
//  - Sem vínculo a pendência específica (pendenciaId = null)
// ============================================================
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { existsSync, mkdirSync } from 'fs'
import { writeFile, unlink, readFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID, createHash } from 'crypto'
import { eq, desc, and } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db/client.js'
import { upsertCliente as pgUpsertCliente } from '../db/ClienteRepository.js'
import { portalUpload, type PortalUploadRow } from '../db/schema.js'
import { clientes } from './clientes.js'
import { isMimeAllowed } from '../lib/upload-validation.js'
import { rememberDocumentoCliente } from '../services/alix/memory/AlixMemoryEvents.js'
import { isPrimaryLLMEnabled } from '../services/llm/ProviderConfig.js'
import { buildClienteDocumentoDossie, classificarDocumentoCliente } from '../services/documentos/ClienteDocumentoIntelligence.js'
import { buildClienteOperationalDossier } from '../services/cliente/ClienteOperationalDossierService.js'
import { attachAlixDocumentToCliente } from '../services/alix/intake/DocumentVaultBridgeService.js'
import { getClienteDemandaService } from '../services/cliente/ClienteDemandaService.js'
import { getDocumentIntakeService } from '../services/alix/intake/DocumentIntakeService.js'
import type { IngestedDocument } from '../services/alix/intake/types.js'
import { getGoogleDriveService } from '../services/google-workspace/drive.js'
import { actorFromRequest } from '../services/core/AccessControlService.js'

const ALLOWED_CATEGORIAS = ['fiscal', 'contrato', 'identidade', 'patrimonio', 'agro', 'outros']
const DOCUMENT_FOLDERS = ['notas_fiscais_xml', 'contratos', 'processos', 'cadastro', 'financeiro', 'patrimonio', 'agro', 'outros'] as const
const PROCESS_STATUSES = ['nao_iniciado', 'em_analise', 'aguardando_documentos', 'pendente', 'aprovado', 'concluido', 'arquivado'] as const
const MAX_BYTES = 20 * 1024 * 1024 // alinhado ao intake documental
const CRM_DOC_SESSION_PREFIX = 'crm-cliente'
const uploadQuerySchema = z.object({
  categoria: z.enum(['fiscal', 'contrato', 'identidade', 'patrimonio', 'agro', 'outros']).optional(),
  demandaId: z.string().trim().min(6).max(120).regex(/^[A-Za-z0-9_-]+$/).optional(),
  importBatchId: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9_.-]+$/).optional(),
  sourcePackage: z.string().trim().min(1).max(180).optional(),
  sourcePath: z.string().trim().min(1).max(700).optional(),
})
const documentPatchSchema = z.object({
  nome: z.string().trim().min(1).max(240).optional(),
  categoria: z.enum(['fiscal', 'contrato', 'identidade', 'patrimonio', 'agro', 'outros']).optional(),
  resumoIa: z.string().max(1100).optional(),
  observacaoConsultor: z.string().max(1600).optional(),
  demandaIds: z.array(z.string().trim().min(6).max(120).regex(/^[A-Za-z0-9_-]+$/)).max(50).optional(),
  pastaDocumento: z.enum(DOCUMENT_FOLDERS).optional(),
  tipoDocumento: z.string().max(180).optional(),
  processo: z.object({
    status: z.enum(PROCESS_STATUSES),
    etapa: z.string().max(180),
    responsavel: z.string().max(180),
    dataDocumento: z.string().max(30),
    vencimento: z.string().max(30),
  }).optional(),
  camposEditaveis: z.array(z.object({
    id: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_.-]+$/),
    nome: z.string().trim().min(1).max(140),
    valor: z.string().max(4000),
    origem: z.enum(['ia', 'revisado', 'manual']).optional(),
  })).max(100).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para atualizar.')

type UploadQuery = z.infer<typeof uploadQuerySchema>

type ImportSource = {
  batchId?: string
  pacote?: string
  caminhoRelativo?: string
  importadoEm: string
}

type DocumentoMetadata = Record<string, unknown> & {
  uploadedFromConsultor?: boolean
  resumoIa?: string
  resumoOrigem?: 'openai' | 'fallback'
  resumoModelo?: string
  resumoGeradoEm?: string
  analiseErro?: string
  alixDocumentId?: string
  alixSessionId?: string
  textoExtraidoChars?: number
  entitySummary?: string
  suggestedActions?: unknown
  observacaoConsultor?: string
  categoriaInteligente?: string
  grupoDocumento?: string
  prioridadeDocumento?: string
  precisaRevisao?: boolean
  sinais?: string[]
  demandaIds?: string[]
  importacoes?: ImportSource[]
  pastaDocumento?: typeof DOCUMENT_FOLDERS[number]
  tipoDocumento?: string
  processo?: {
    status: typeof PROCESS_STATUSES[number]
    etapa: string
    responsavel: string
    dataDocumento: string
    vencimento: string
  }
  camposEditaveis?: Array<{
    id: string
    nome: string
    valor: string
    origem: 'ia' | 'revisado' | 'manual'
  }>
  analiseProfunda?: {
    geradaEm: string
    tipoDocumento: string
    resumoExecutivo: string
    destino: string
    motivoDestino: string
    acoesSugeridas: string[]
    riscos: string[]
    lacunas: string[]
  }
  encaminhamentoConfirmado?: {
    destino: 'propostas' | 'negociacao' | 'financeiro' | 'cadastro' | 'documentos'
    confirmadoEm: string
  }
  googleDrive?: {
    status: 'uploaded' | 'failed'
    fileId?: string
    url?: string
    subfolder?: string
    syncedAt: string
    error?: string
  }
}

function googleDriveSubfolder(categoria: string): string {
  if (categoria === 'contrato') return 'Contratos'
  if (categoria === 'outros') return 'Anexos'
  return 'Documentos'
}

function googleWorkspaceActor(request: FastifyRequest) {
  const current = actorFromRequest(request)
  return {
    userId: current.id,
    userName: current.nome,
    role: current.role,
    tenantId: String(request.headers['x-tenant-id'] || process.env.ALETIS_TENANT_ID || 'default'),
  }
}

function shouldSyncToGoogleDrive(): boolean {
  return process.env.GOOGLE_DRIVE_SYNC_ENABLED === 'true'
}

function uploadDir(): string {
  const dir = process.env.ALETIS_PORTAL_UPLOAD_DIR || './storage/portal-uploads'
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }) } catch {/* ok */}
  }
  return dir
}

function metadataOf(value: unknown): DocumentoMetadata {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as DocumentoMetadata
  return {}
}

function cleanText(value: unknown, max = 1200): string {
  const text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 3)).trim()}...`
}

function fieldId(path: string): string {
  const normalized = path.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '')
  return (normalized || `campo_${createHash('sha1').update(path).digest('hex').slice(0, 8)}`).slice(0, 120)
}

function flattenEditableFields(value: unknown, prefix = '', depth = 0): NonNullable<DocumentoMetadata['camposEditaveis']> {
  if (value === null || value === undefined || value === '' || depth > 4) return []
  if (Array.isArray(value)) {
    if (value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      const text = cleanText(value.join(', '), 4000)
      return text && prefix ? [{ id: fieldId(prefix), nome: prefix, valor: text, origem: 'ia' }] : []
    }
    return value.slice(0, 15).flatMap((item, index) => flattenEditableFields(item, `${prefix}${prefix ? '.' : ''}${index + 1}`, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !['evidencias', 'acoesSugeridas', 'riscos', 'lacunas', 'entidades'].includes(key))
      .flatMap(([key, item]) => flattenEditableFields(item, `${prefix}${prefix ? '.' : ''}${key}`, depth + 1))
      .slice(0, 100)
  }
  const text = cleanText(value, 4000)
  return text && prefix ? [{ id: fieldId(prefix), nome: prefix, valor: text, origem: 'ia' }] : []
}

function editableFields(metadata: DocumentoMetadata, alixMetadata: Record<string, unknown>): NonNullable<DocumentoMetadata['camposEditaveis']> {
  const smart = alixMetadata.smartExtraction && typeof alixMetadata.smartExtraction === 'object'
    ? alixMetadata.smartExtraction as Record<string, unknown>
    : {}
  const aiFields = [
    ...flattenEditableFields(smart.clienteData, 'cliente'),
    ...flattenEditableFields(smart.dividas, 'dividas'),
    ...flattenEditableFields(smart.propriedades, 'propriedades'),
    ...flattenEditableFields(smart.contrato, 'contrato'),
    ...flattenEditableFields(alixMetadata.entityStructured, 'documento'),
    ...flattenEditableFields(alixMetadata.agroCampos, 'agro'),
  ]
  const uniqueAi = [...new Map(aiFields.map((field) => [field.id, field])).values()].slice(0, 80)
  const saved = Array.isArray(metadata.camposEditaveis) ? metadata.camposEditaveis : []
  const savedById = new Map(saved.map((field) => [field.id, field]))
  const merged = uniqueAi.map((field) => savedById.get(field.id) ?? field)
  const aiIds = new Set(uniqueAi.map((field) => field.id))
  return [...merged, ...saved.filter((field) => !aiIds.has(field.id))].slice(0, 100)
}

function inferDocumentFolder(row: PortalUploadRow, metadata: DocumentoMetadata, classification: ReturnType<typeof classificarDocumentoCliente>): typeof DOCUMENT_FOLDERS[number] {
  if (metadata.pastaDocumento && DOCUMENT_FOLDERS.includes(metadata.pastaDocumento)) return metadata.pastaDocumento
  const value = `${row.nomeOriginal} ${row.mime} ${row.categoria || ''} ${metadata.tipoDocumento || ''} ${classification.categoriaInteligente}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/xml|nfe|nf-e|nfse|nfs-e|nota fiscal|danfe/.test(value)) return 'notas_fiscais_xml'
  if (/processo|judicial|execucao|agravo|tribunal|acao judicial|peticao|sentenca/.test(value)) return 'processos'
  if (/contrato|acordo|aditivo|ccb|cedula|confissao|arrendamento/.test(value)) return 'contratos'
  if (/extrato|dre|balanco|fluxo|financeir|ofx|planilha|xlsx|spreadsheet/.test(value)) return 'financeiro'
  if (/identidade|cnh|cpf|cnpj|rg|certidao|comprovante de resid|cadastro/.test(value)) return 'cadastro'
  if (/matricula|imovel|patrimonio|garantia|car\b|ccir|itr|cafir|maquina/.test(value)) return 'patrimonio'
  if (/agro|safra|custeio|producao|laudo|vistoria|insumo/.test(value)) return 'agro'
  if (row.categoria === 'fiscal') return 'notas_fiscais_xml'
  if (row.categoria === 'contrato') return 'contratos'
  if (row.categoria === 'identidade') return 'cadastro'
  if (row.categoria === 'patrimonio') return 'patrimonio'
  if (row.categoria === 'agro') return 'agro'
  return 'outros'
}

function mergeImportMetadata(metadata: DocumentoMetadata, query: UploadQuery): DocumentoMetadata {
  const demandaIds = Array.from(new Set([
    ...(Array.isArray(metadata.demandaIds) ? metadata.demandaIds : []),
    ...(query.demandaId ? [query.demandaId] : []),
  ])).slice(0, 50)
  const hasSource = Boolean(query.importBatchId || query.sourcePackage || query.sourcePath)
  if (!hasSource) return { ...metadata, demandaIds }

  const source: ImportSource = {
    batchId: query.importBatchId,
    pacote: cleanText(query.sourcePackage, 180) || undefined,
    caminhoRelativo: cleanText(query.sourcePath, 700) || undefined,
    importadoEm: new Date().toISOString(),
  }
  const existing = Array.isArray(metadata.importacoes) ? metadata.importacoes : []
  const key = (item: ImportSource) => [item.batchId, item.pacote, item.caminhoRelativo].join('|')
  const importacoes = [...existing.filter((item) => key(item) !== key(source)), source].slice(-30)
  return { ...metadata, demandaIds, importacoes }
}

async function validateAndLinkDemand(clienteId: string, demandaId: string | undefined, documentoId?: string): Promise<boolean> {
  if (!demandaId) return true
  const service = getClienteDemandaService()
  const demanda = await service.get(clienteId, demandaId)
  if (!demanda) return false
  if (documentoId && !demanda.documentoIds.includes(documentoId)) {
    await service.update(clienteId, demandaId, {
      documentoIds: [...demanda.documentoIds, documentoId],
      autor: 'importacao-documental',
    })
  }
  return true
}

function resumoFallback(params: {
  nome: string
  categoria: string
  mime: string
  tamanho: number
  texto?: string
  entitySummary?: string
}): string {
  const base = params.entitySummary || cleanText(params.texto, 420)
  const tamanhoMb = (params.tamanho / 1024 / 1024).toFixed(2).replace('.', ',')
  if (base) {
    return `Tipo provável: documento em ${params.categoria}. Dados encontrados: ${base}. Próxima conferência: validar partes, valores, datas e vínculo com o cliente antes de usar em análise conclusiva.`
  }
  return `Tipo provável: documento recebido em ${params.categoria}. Dados encontrados: arquivo "${params.nome}" (${params.mime || 'tipo não informado'}, ${tamanhoMb} MB). Próxima conferência: abrir o arquivo e validar conteúdo, pois não houve texto suficiente para extração automática.`
}

async function resumirDocumentoComIa(params: {
  clienteNome: string
  nome: string
  categoria: string
  mime: string
  tamanho: number
  texto?: string
  entitySummary?: string
}): Promise<Pick<DocumentoMetadata, 'resumoIa' | 'resumoOrigem' | 'resumoModelo' | 'resumoGeradoEm' | 'analiseErro'>> {
  const fallback = resumoFallback(params)
  if (!isPrimaryLLMEnabled()) {
    return {
      resumoIa: fallback,
      resumoOrigem: 'fallback',
      resumoGeradoEm: new Date().toISOString(),
      analiseErro: 'IA desativada ou provedor principal sem configuração completa',
    }
  }

  const texto = cleanText(
    [
      params.entitySummary ? `Resumo estruturado: ${params.entitySummary}` : '',
      params.texto ? `Texto extraído: ${params.texto}` : '',
    ].filter(Boolean).join('\n\n'),
    12000,
  )

  if (!texto) {
    return { resumoIa: fallback, resumoOrigem: 'fallback', resumoGeradoEm: new Date().toISOString() }
  }

  const { getModelForRole } = await import('../services/llm/LLMConfig.js')
  const model = getModelForRole('summarizer')
  try {
    const { runOpenAI } = await import('../services/llm/OpenAIClient.js')
    const result = await runOpenAI(
      [{
        role: 'user',
        content: [
          `Cliente: ${params.clienteNome}`,
          `Arquivo: ${params.nome}`,
          `Categoria: ${params.categoria}`,
          `MIME: ${params.mime}`,
          '',
          texto,
        ].join('\n'),
      }],
      {
        model,
        maxTokens: 520,
        temperature: 0.2,
        system:
          [
            'Você é a IA documental do CRM ALETIS, focada em crédito, gestão financeira e agrobusiness.',
            'Responda em português brasileiro, sem markdown, em até 1.300 caracteres.',
            'Use esta estrutura textual: Tipo provável; Dados encontrados; Riscos/pendências; Próxima conferência.',
            'Extraia quando existirem: partes, CPF/CNPJ, fazenda/imóvel, matrícula/CAR/CCIR/ITR, banco/credor, contrato, valores, datas, vencimentos, garantias, processo judicial e obrigações.',
            'Nunca invente campo ausente. Se não houver base, escreva "não consta na leitura".',
            'Termine a última frase completamente.',
          ].join(' '),
      },
    )
    const resumo = cleanText(result.text, 1500)
    return {
      resumoIa: resumo || fallback,
      resumoOrigem: resumo ? 'openai' : 'fallback',
      resumoModelo: result.model || model,
      resumoGeradoEm: new Date().toISOString(),
    }
  } catch (err) {
    return {
      resumoIa: fallback,
      resumoOrigem: 'fallback',
      resumoModelo: model,
      resumoGeradoEm: new Date().toISOString(),
      analiseErro: (err as Error).message,
    }
  }
}

function projetarDocumento(row: PortalUploadRow, alixDocument?: IngestedDocument | null) {
  const metadata = metadataOf(row.metadata)
  const classificacao = classificarDocumentoCliente(row)
  const alixMetadata = alixDocument?.metadata || {}
  const processingState = String(alixMetadata.processingState || metadata.estadoProcessamento || '')
  const smart = alixMetadata.smartExtraction && typeof alixMetadata.smartExtraction === 'object'
    ? alixMetadata.smartExtraction as { tipoDocumento?: string }
    : undefined
  const enrichedSummary = cleanText(alixMetadata.entitySummary || alixDocument?.summary, 1500)
  const pastaDocumento = inferDocumentFolder(row, metadata, classificacao)
  const tipoDocumentoIa = cleanText(smart?.tipoDocumento || alixMetadata.entityDocumentType || alixMetadata.agroTipo, 180)
  return {
    id: row.id,
    nome: row.nomeOriginal,
    mime: row.mime,
    tamanho: row.tamanho,
    categoria: row.categoria ?? 'outros',
    enviadoPor: row.enviadoPor as 'cliente' | 'consultor',
    enviadoEm: row.enviadoEm,
    sha256: row.sha256,
    resumoIa: enrichedSummary || metadata.resumoIa,
    resumoOrigem: metadata.resumoOrigem,
    resumoModelo: metadata.resumoModelo,
    resumoGeradoEm: metadata.resumoGeradoEm,
    analiseErro: processingState === 'failed' ? cleanText(alixMetadata.processingError || metadata.analiseErro, 600) : metadata.analiseErro,
    alixDocumentId: metadata.alixDocumentId,
    textoExtraidoChars: alixDocument?.extractedText?.length ?? metadata.textoExtraidoChars,
    estadoProcessamento: processingState || undefined,
    tipoDocumentoIa: tipoDocumentoIa || undefined,
    tipoDocumento: metadata.tipoDocumento || tipoDocumentoIa || classificacao.categoriaInteligente,
    pastaDocumento,
    processo: metadata.processo ?? {
      status: ['queued', 'processing', 'extracting'].includes(processingState) ? 'em_analise' : 'nao_iniciado',
      etapa: '',
      responsavel: '',
      dataDocumento: '',
      vencimento: '',
    },
    camposEditaveis: editableFields(metadata, alixMetadata),
    observacaoConsultor: metadata.observacaoConsultor,
    categoriaInteligente: metadata.categoriaInteligente ?? classificacao.categoriaInteligente,
    grupoDocumento: metadata.grupoDocumento ?? classificacao.grupoDocumento,
    prioridadeDocumento: metadata.prioridadeDocumento ?? classificacao.prioridade,
    precisaRevisao: metadata.precisaRevisao ?? classificacao.precisaRevisao,
    sinais: metadata.sinais ?? classificacao.sinais,
    demandaIds: metadata.demandaIds ?? [],
    importacoes: metadata.importacoes ?? [],
    analiseProfunda: metadata.analiseProfunda,
    downloadUrl: `/api/clientes/${row.clienteId}/documentos/${row.id}/download`,
  }
}

type DestinoInteligente = 'propostas' | 'negociacao' | 'financeiro' | 'cadastro' | 'documentos'

function definirDestinoInteligente(analise: {
  tipoDocumento?: string
  acoesSistema?: Array<{ tipo?: string }>
}): { destino: DestinoInteligente; motivo: string } {
  const acoes = new Set((analise.acoesSistema ?? []).map((acao) => acao.tipo))
  const texto = String(analise.tipoDocumento ?? '').toLowerCase()
  if (acoes.has('criar_proposta') || /proposta|acordo|renegocia/.test(texto)) {
    return { destino: 'propostas', motivo: 'O conteúdo indica uma proposta, acordo ou condição de renegociação.' }
  }
  if (/negocia|contraproposta|credor|cobrança|cobranca/.test(texto)) {
    return { destino: 'negociacao', motivo: 'O conteúdo traz elementos para acompanhamento com credor ou negociação.' }
  }
  if (acoes.has('gerar_fluxo_caixa') || /fluxo|financeir|balanço|balanco|dre|planilha/.test(texto)) {
    return { destino: 'financeiro', motivo: 'O conteúdo é útil para a gestão financeira e os cenários do cliente.' }
  }
  if (acoes.has('atualizar_cliente') || acoes.has('criar_cliente') || /cadastro|identifica/.test(texto)) {
    return { destino: 'cadastro', motivo: 'Foram identificados possíveis dados cadastrais para conferência.' }
  }
  return { destino: 'documentos', motivo: 'O documento foi organizado no cofre do cliente e pode apoiar as demais áreas.' }
}

function registrarTimelineDocumento(clienteId: string, nome: string, resumoIa?: string): void {
  const cliente = clientes.get(clienteId) as any
  if (!cliente) return
  const hoje = new Date().toISOString().slice(0, 10)
  cliente.timeline = Array.isArray(cliente.timeline) ? cliente.timeline : []
  cliente.timeline.push({
    data: hoje,
    tipo: 'documento',
    descricao: `Documento enviado: ${nome}`,
    detalhes: resumoIa ? cleanText(resumoIa, 500) : undefined,
  })
  cliente.ultimaAtualizacao = hoje
  void pgUpsertCliente(cliente as Parameters<typeof pgUpsertCliente>[0]).catch(() => {})
  rememberDocumentoCliente({
    clienteId,
    clienteNome: cliente.nome,
    nome,
    resumo: resumoIa,
  })
}

export default async function clienteDocumentosRoutes(fastify: FastifyInstance): Promise<void> {
  // Listar documentos do cliente
  fastify.get<{ Params: { id: string }; Querystring: { categoria?: string } }>(
    '/api/clientes/:id/documentos',
    async (req, reply) => {
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        const db = getDb()
        const where = req.query.categoria
          ? and(eq(portalUpload.clienteId, req.params.id), eq(portalUpload.categoria, req.query.categoria))
          : eq(portalUpload.clienteId, req.params.id)
        const rows = await db
          .select()
          .from(portalUpload)
          .where(where)
          .orderBy(desc(portalUpload.enviadoEm))
          .limit(200)
        const intake = getDocumentIntakeService()
        await Promise.all([...new Set(rows.map((row) => String(metadataOf(row.metadata).alixSessionId || '')).filter(Boolean))]
          .map((sessionId) => intake.resumePending(sessionId)))
        const enriched = await Promise.all(rows.map(async (row) => {
          const metadata = metadataOf(row.metadata)
          const alix = metadata.alixDocumentId && metadata.alixSessionId
            ? await intake.get(metadata.alixSessionId, metadata.alixDocumentId)
            : null
          return projetarDocumento(row, alix)
        }))
        return reply.send({
          success: true,
          data: enriched,
          total: rows.length,
        })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/clientes/:id/documentos/dossie-inteligente',
    async (req, reply) => {
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        const rows = await getDb()
          .select()
          .from(portalUpload)
          .where(eq(portalUpload.clienteId, req.params.id))
          .orderBy(desc(portalUpload.enviadoEm))
          .limit(500)
        return reply.send({
          success: true,
          data: buildClienteDocumentoDossie(rows),
        })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  fastify.get<{ Params: { id: string } }>(
    '/api/clientes/:id/dossie-operacional',
    async (req, reply) => {
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        const data = await buildClienteOperationalDossier(req.params.id)
        if (!data) return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        return reply.send({ success: true, data })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Download de um documento
  fastify.get<{ Params: { id: string; docId: string } }>(
    '/api/clientes/:id/documentos/:docId/download',
    async (req, reply) => {
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        const db = getDb()
        const rows = await db
          .select()
          .from(portalUpload)
          .where(and(eq(portalUpload.id, req.params.docId), eq(portalUpload.clienteId, req.params.id)))
          .limit(1)
        const row = rows[0]
        if (!row) return reply.status(404).send({ success: false, error: 'Documento não encontrado' })
        const filePath = join(uploadDir(), row.nomeStorage)
        if (!existsSync(filePath)) {
          return reply.status(410).send({ success: false, error: 'Arquivo expirado/removido do storage' })
        }
        const buf = await readFile(filePath)
        reply.header('Content-Type', row.mime)
        reply.header('Content-Disposition', `attachment; filename="${row.nomeOriginal}"`)
        return reply.send(buf)
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Vincula em lote os arquivos já interpretados no onboarding.
  fastify.post<{
    Params: { id: string }
    Body: { sessionId?: string; documentos?: Array<{ documentoId?: string; categoria?: string }> }
  }>(
    '/api/clientes/:id/documentos/intake',
    async (req, reply) => {
      const cliente = clientes.get(req.params.id)
      if (!cliente) {
        return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
      }
      const sessionId = String(req.body?.sessionId || '').trim()
      const documentos = Array.isArray(req.body?.documentos) ? req.body.documentos.slice(0, 60) : []
      if (!/^crm-intake-[A-Za-z0-9_-]{6,120}$/.test(sessionId) || documentos.length === 0) {
        return reply.status(400).send({ success: false, error: 'Sessão ou documentos de intake inválidos.' })
      }

      const unique = [...new Map(documentos
        .map((item) => ({
          documentoId: String(item?.documentoId || '').trim(),
          categoria: String(item?.categoria || 'outros').trim(),
        }))
        .filter((item) => /^[A-Za-z0-9_-]{6,120}$/.test(item.documentoId))
        .map((item) => [item.documentoId, item])).values()]
      if (unique.length === 0) {
        return reply.status(400).send({ success: false, error: 'Nenhum documento válido para vincular.' })
      }

      const results = await Promise.all(unique.map(async (item) => {
        try {
          const attached = await attachAlixDocumentToCliente({
            sessionId,
            documentoId: item.documentoId,
            clienteId: req.params.id,
            clientName: String(cliente.nome || cliente.id),
            categoria: item.categoria,
            enviadoPor: 'consultor',
            googleWorkspaceActor: googleWorkspaceActor(req),
          })
          if (attached.ok) registrarTimelineDocumento(req.params.id, attached.nomeOriginal)
          return { documentoId: item.documentoId, ...attached }
        } catch (err) {
          req.log.warn({ err, documentoId: item.documentoId }, '[cliente-documentos] falha vinculando intake')
          return { documentoId: item.documentoId, ok: false as const, reason: (err as Error).message }
        }
      }))
      const salvos = results.filter((item) => item.ok).length
      return reply.status(salvos ? 200 : 422).send({
        success: salvos > 0,
        data: results,
        meta: { solicitados: unique.length, salvos, falhas: unique.length - salvos },
      })
    },
  )

  // Upload — multipart/form-data (1 arquivo + categoria opcional via header/query)
  fastify.post<{ Params: { id: string }; Querystring: UploadQuery }>(
    '/api/clientes/:id/documentos',
    async (req: FastifyRequest<{ Params: { id: string }; Querystring: UploadQuery }>, reply: FastifyReply) => {
      const parsedQuery = uploadQuerySchema.safeParse(req.query)
      if (!parsedQuery.success) {
        return reply.status(400).send({
          success: false,
          error: 'Metadados do upload inválidos.',
          detalhes: parsedQuery.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        })
      }
      const query = parsedQuery.data
      let file: MultipartFile | undefined
      try {
        file = await req.file()
      } catch {/* read fail */}
      if (!file) {
        return reply.status(400).send({ success: false, error: 'Nenhum arquivo enviado (campo multipart)' })
      }
      if (!isMimeAllowed(file.mimetype)) {
        return reply.status(415).send({ success: false, error: `Tipo de arquivo não suportado: ${file.mimetype}` })
      }
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        if (!await validateAndLinkDemand(req.params.id, query.demandaId)) {
          return reply.status(404).send({ success: false, error: 'Demanda não encontrada para este cliente.' })
        }
        let buffer: Buffer
        try {
          buffer = await file.toBuffer()
        } catch (err: any) {
          if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
            return reply.status(413).send({ success: false, error: `Arquivo excede ${MAX_BYTES / 1024 / 1024}MB` })
          }
          throw err
        }
        if (buffer.length > MAX_BYTES) {
          return reply.status(413).send({ success: false, error: `Arquivo excede ${MAX_BYTES / 1024 / 1024}MB` })
        }
        const sha256 = createHash('sha256').update(buffer).digest('hex')
        const db = getDb()
        const duplicado = await db
          .select()
          .from(portalUpload)
          .where(and(eq(portalUpload.clienteId, req.params.id), eq(portalUpload.sha256, sha256)))
          .limit(1)
        if (duplicado[0]) {
          const metadata = mergeImportMetadata(metadataOf(duplicado[0].metadata), query)
          await db.update(portalUpload).set({ metadata }).where(eq(portalUpload.id, duplicado[0].id))
          await validateAndLinkDemand(req.params.id, query.demandaId, duplicado[0].id)
          return reply.status(200).send({
            success: true,
            duplicate: true,
            data: projetarDocumento({ ...duplicado[0], metadata }),
          })
        }

        const id = `up_${randomUUID()}`
        const ext = file.filename.includes('.') ? file.filename.split('.').pop() : 'bin'
        const nomeStorage = `${id}.${ext}`
        await writeFile(join(uploadDir(), nomeStorage), buffer)

        const fields = file.fields as any
        const catRaw = String(query.categoria ?? fields?.categoria?.value ?? 'outros').toLowerCase()
        const categoria = ALLOWED_CATEGORIAS.includes(catRaw) ? catRaw : 'outros'
        const sessionId = `${CRM_DOC_SESSION_PREFIX}-${req.params.id}`

        const doc = await getDocumentIntakeService().enqueue({
          buffer, filename: file.filename, mimetype: file.mimetype, sessionId, clienteId: req.params.id, processingMode: 'fast',
        })
        let metadata: DocumentoMetadata = mergeImportMetadata({
          uploadedFromConsultor: true,
          resumoIa: 'Arquivo recebido. Leitura, OCR e extração estruturada em andamento.',
          resumoOrigem: 'fallback',
          resumoGeradoEm: new Date().toISOString(),
          alixDocumentId: doc.id,
          alixSessionId: sessionId,
          textoExtraidoChars: doc.extractedText?.length ?? 0,
          estadoProcessamento: doc.metadata?.processingState,
        }, query)
        const classificacao = classificarDocumentoCliente({
          id,
          clienteId: req.params.id,
          pendenciaId: null,
          nomeOriginal: file.filename,
          nomeStorage,
          mime: file.mimetype,
          tamanho: buffer.length,
          sha256,
          categoria,
          enviadoPor: 'consultor',
          enviadoEm: new Date(),
          metadata,
        } as PortalUploadRow)
        metadata = {
          ...metadata,
          categoriaInteligente: classificacao.categoriaInteligente,
          grupoDocumento: classificacao.grupoDocumento,
          prioridadeDocumento: classificacao.prioridade,
          precisaRevisao: classificacao.precisaRevisao,
          sinais: classificacao.sinais,
        }

        await db.insert(portalUpload).values({
          id,
          clienteId: req.params.id,
          pendenciaId: null,
          nomeOriginal: file.filename,
          nomeStorage,
          mime: file.mimetype,
          tamanho: buffer.length,
          sha256,
          categoria,
          enviadoPor: 'consultor',
          metadata,
        })

        if (shouldSyncToGoogleDrive()) {
          try {
            const synced = await getGoogleDriveService().uploadBufferToClientFolder({
              actor: googleWorkspaceActor(req),
              clientId: req.params.id,
              clientName: String(clientes.get(req.params.id)?.nome || req.params.id),
              filename: file.filename,
              mime: file.mimetype,
              buffer,
              subfolder: googleDriveSubfolder(categoria),
            })
            metadata = {
              ...metadata,
              googleDrive: {
                status: 'uploaded',
                fileId: synced.googleFileId,
                url: synced.url,
                subfolder: googleDriveSubfolder(categoria),
                syncedAt: new Date().toISOString(),
              },
            }
          } catch (driveError) {
            req.log.warn({ err: driveError, clienteId: req.params.id, filename: file.filename }, '[cliente-documentos] espelhamento Google Drive falhou')
            metadata = {
              ...metadata,
              googleDrive: {
                status: 'failed',
                subfolder: googleDriveSubfolder(categoria),
                syncedAt: new Date().toISOString(),
                error: cleanText((driveError as Error).message, 280),
              },
            }
          }
          await db.update(portalUpload).set({ metadata }).where(eq(portalUpload.id, id))
        }

        await validateAndLinkDemand(req.params.id, query.demandaId, id)

        registrarTimelineDocumento(req.params.id, file.filename, metadata.resumoIa)

        return reply.status(201).send({
          success: true,
          data: {
            id,
            nome: file.filename,
            mime: file.mimetype,
            tamanho: buffer.length,
            categoria,
            sha256,
            resumoIa: metadata.resumoIa,
            resumoOrigem: metadata.resumoOrigem,
            resumoModelo: metadata.resumoModelo,
            resumoGeradoEm: metadata.resumoGeradoEm,
            analiseErro: metadata.analiseErro,
            alixDocumentId: metadata.alixDocumentId,
            textoExtraidoChars: metadata.textoExtraidoChars,
            categoriaInteligente: metadata.categoriaInteligente,
            grupoDocumento: metadata.grupoDocumento,
            prioridadeDocumento: metadata.prioridadeDocumento,
            precisaRevisao: metadata.precisaRevisao,
            sinais: metadata.sinais,
            googleDrive: metadata.googleDrive,
            downloadUrl: `/api/clientes/${req.params.id}/documentos/${id}/download`,
          },
        })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Editar metadados do documento no CRM
  fastify.patch<{ Params: { id: string; docId: string }; Body: unknown }>(
    '/api/clientes/:id/documentos/:docId',
    async (req, reply) => {
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        const db = getDb()
        const rows = await db
          .select()
          .from(portalUpload)
          .where(and(eq(portalUpload.id, req.params.docId), eq(portalUpload.clienteId, req.params.id)))
          .limit(1)
        const row = rows[0]
        if (!row) return reply.status(404).send({ success: false, error: 'Documento não encontrado' })
        const parsed = documentPatchSchema.safeParse(req.body)
        if (!parsed.success) {
          return reply.status(400).send({
            success: false,
            error: 'Dados do documento inválidos.',
            detalhes: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`),
          })
        }
        const body = parsed.data

        const patch: Partial<PortalUploadRow> = {}
        const nome = cleanText(body.nome, 240)
        if (nome) patch.nomeOriginal = nome
        if (body.categoria) patch.categoria = body.categoria

        const metadata = metadataOf(row.metadata)
        const nextMetadata: DocumentoMetadata = {
          ...metadata,
          resumoIa: body.resumoIa !== undefined ? cleanText(body.resumoIa, 1100) : metadata.resumoIa,
          observacaoConsultor: body.observacaoConsultor !== undefined ? cleanText(body.observacaoConsultor, 1600) : metadata.observacaoConsultor,
          pastaDocumento: body.pastaDocumento ?? metadata.pastaDocumento,
          tipoDocumento: body.tipoDocumento !== undefined ? cleanText(body.tipoDocumento, 180) : metadata.tipoDocumento,
          processo: body.processo ? {
            status: body.processo.status,
            etapa: cleanText(body.processo.etapa, 180),
            responsavel: cleanText(body.processo.responsavel, 180),
            dataDocumento: cleanText(body.processo.dataDocumento, 30),
            vencimento: cleanText(body.processo.vencimento, 30),
          } : metadata.processo,
        }
        if (body.camposEditaveis !== undefined) {
          nextMetadata.camposEditaveis = [...new Map(body.camposEditaveis.map((field) => [field.id, {
            id: field.id,
            nome: cleanText(field.nome, 140),
            valor: cleanText(field.valor, 4000),
            origem: field.origem ?? 'manual',
          }])).values()].slice(0, 100)
        }
        if (body.demandaIds !== undefined) {
          const demandService = getClienteDemandaService()
          const clientDemands = await demandService.list(req.params.id)
          const desiredIds = Array.from(new Set(body.demandaIds))
          const knownIds = new Set(clientDemands.map((demanda) => demanda.id))
          const missing = desiredIds.filter((id) => !knownIds.has(id))
          if (missing.length > 0) {
            return reply.status(400).send({ success: false, error: `Demanda não encontrada: ${missing.join(', ')}` })
          }
          for (const demanda of clientDemands) {
            const linked = demanda.documentoIds.includes(row.id)
            const shouldLink = desiredIds.includes(demanda.id)
            if (linked === shouldLink) continue
            await demandService.update(req.params.id, demanda.id, {
              documentoIds: shouldLink
                ? [...demanda.documentoIds, row.id]
                : demanda.documentoIds.filter((id) => id !== row.id),
              autor: 'crm-documentos',
            })
          }
          nextMetadata.demandaIds = desiredIds
        }
        const classificacao = classificarDocumentoCliente({
          ...row,
          nomeOriginal: patch.nomeOriginal ?? row.nomeOriginal,
          categoria: patch.categoria ?? row.categoria,
          metadata: nextMetadata,
        })
        nextMetadata.categoriaInteligente = classificacao.categoriaInteligente
        nextMetadata.grupoDocumento = classificacao.grupoDocumento
        nextMetadata.prioridadeDocumento = classificacao.prioridade
        nextMetadata.precisaRevisao = classificacao.precisaRevisao
        nextMetadata.sinais = classificacao.sinais
        patch.metadata = nextMetadata

        await db.update(portalUpload).set(patch).where(eq(portalUpload.id, row.id))
        const updated = await db
          .select()
          .from(portalUpload)
          .where(eq(portalUpload.id, row.id))
          .limit(1)

        return reply.send({ success: true, data: projetarDocumento(updated[0]) })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Reanalisar documento com IA mantendo o mesmo dono/cliente
  fastify.post<{ Params: { id: string; docId: string } }>(
    '/api/clientes/:id/documentos/:docId/analisar',
    async (req, reply) => {
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        const db = getDb()
        const rows = await db
          .select()
          .from(portalUpload)
          .where(and(eq(portalUpload.id, req.params.docId), eq(portalUpload.clienteId, req.params.id)))
          .limit(1)
        const row = rows[0]
        if (!row) return reply.status(404).send({ success: false, error: 'Documento não encontrado' })

        const filePath = join(uploadDir(), row.nomeStorage)
        if (!existsSync(filePath)) {
          return reply.status(410).send({ success: false, error: 'Arquivo expirado/removido do storage' })
        }

        const buffer = await readFile(filePath)
        const cliente = clientes.get(req.params.id) as any
        const sessionId = `${CRM_DOC_SESSION_PREFIX}-${req.params.id}`
        const metadata = metadataOf(row.metadata)
        let nextMetadata: DocumentoMetadata = { ...metadata }

        try {
          const { getDocumentIntakeService } = await import('../services/alix/intake/DocumentIntakeService.js')
          const doc = await getDocumentIntakeService().ingest({
            buffer,
            filename: row.nomeOriginal,
            mimetype: row.mime,
            sessionId,
            clienteId: req.params.id,
          })
          const docMeta = metadataOf(doc.metadata)
          const entitySummary = cleanText(docMeta.entitySummary, 1200)
          const ai = await resumirDocumentoComIa({
            clienteNome: cliente?.nome || req.params.id,
            nome: row.nomeOriginal,
            categoria: row.categoria || 'outros',
            mime: row.mime,
            tamanho: row.tamanho,
            texto: doc.extractedText || doc.summary,
            entitySummary,
          })
          nextMetadata = {
            ...nextMetadata,
            ...ai,
            alixDocumentId: doc.id,
            alixSessionId: sessionId,
            textoExtraidoChars: doc.extractedText?.length ?? 0,
            entitySummary: entitySummary || undefined,
            suggestedActions: docMeta.suggestedActions,
          }
        } catch (err) {
          const ai = await resumirDocumentoComIa({
            clienteNome: cliente?.nome || req.params.id,
            nome: row.nomeOriginal,
            categoria: row.categoria || 'outros',
            mime: row.mime,
            tamanho: row.tamanho,
          })
          nextMetadata = {
            ...nextMetadata,
            ...ai,
            analiseErro: cleanText((err as Error).message || ai.analiseErro, 600),
          }
        }
        const classificacao = classificarDocumentoCliente({ ...row, metadata: nextMetadata })
        nextMetadata = {
          ...nextMetadata,
          categoriaInteligente: classificacao.categoriaInteligente,
          grupoDocumento: classificacao.grupoDocumento,
          prioridadeDocumento: classificacao.prioridade,
          precisaRevisao: classificacao.precisaRevisao,
          sinais: classificacao.sinais,
        }

        await db.update(portalUpload).set({ metadata: nextMetadata }).where(eq(portalUpload.id, row.id))
        registrarTimelineDocumento(req.params.id, row.nomeOriginal, nextMetadata.resumoIa)

        const updated = await db
          .select()
          .from(portalUpload)
          .where(eq(portalUpload.id, row.id))
          .limit(1)
        return reply.send({ success: true, data: projetarDocumento(updated[0]) })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  // Análise profunda com encaminhamento operacional. A IA apenas sugere o destino;
  // qualquer criação de proposta ou negociação permanece uma ação confirmada no CRM.
  fastify.post<{ Params: { id: string; docId: string }; Body: { foco?: string } }>(
    '/api/clientes/:id/documentos/:docId/inteligencia',
    async (req, reply) => {
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        const db = getDb()
        const rows = await db
          .select()
          .from(portalUpload)
          .where(and(eq(portalUpload.id, req.params.docId), eq(portalUpload.clienteId, req.params.id)))
          .limit(1)
        const row = rows[0]
        if (!row) return reply.status(404).send({ success: false, error: 'Documento não encontrado' })

        const metadata = metadataOf(row.metadata)
        const sessionId = String(metadata.alixSessionId || `${CRM_DOC_SESSION_PREFIX}-${req.params.id}`)
        let alixDocumentId = typeof metadata.alixDocumentId === 'string' ? metadata.alixDocumentId : ''
        const intake = (await import('../services/alix/intake/DocumentIntakeService.js')).getDocumentIntakeService()
        let doc = alixDocumentId ? await intake.get(sessionId, alixDocumentId) : null

        if (!doc) {
          const filePath = join(uploadDir(), row.nomeStorage)
          if (!existsSync(filePath)) {
            return reply.status(410).send({ success: false, error: 'Arquivo expirado/removido do storage' })
          }
          doc = await intake.ingest({
            buffer: await readFile(filePath),
            filename: row.nomeOriginal,
            mimetype: row.mime,
            sessionId,
            clienteId: req.params.id,
            processingMode: 'deep',
          })
          alixDocumentId = doc.id
        }

        const processingState = String(doc.metadata?.processingState || '')
        if (['queued', 'processing', 'extracting'].includes(processingState)) {
          await intake.resumePending(sessionId)
          return reply.status(202).send({
            success: true,
            data: {
              processing: true,
              estadoProcessamento: processingState,
              mensagem: 'OCR e extração estruturada ainda estão em andamento.',
              documento: projetarDocumento(row, doc),
            },
          })
        }
        if (processingState === 'failed') {
          return reply.status(422).send({
            success: false,
            error: cleanText(doc.metadata?.processingError || 'A leitura do documento falhou.', 600),
          })
        }

        const { analyzeDocumentDeep } = await import('../services/alix/intake/DocumentAnalysisService.js')
        const analise = await analyzeDocumentDeep({
          doc,
          foco: cleanText(req.body?.foco || 'Classifique e encaminhe este documento dentro do CRM ALETIS.', 700),
        })
        const encaminhamento = definirDestinoInteligente(analise)
        const analiseResumida = {
          geradaEm: new Date().toISOString(),
          tipoDocumento: cleanText(analise.tipoDocumento, 180),
          resumoExecutivo: cleanText(analise.resumoExecutivo, 1800),
          destino: encaminhamento.destino,
          motivoDestino: encaminhamento.motivo,
          acoesSugeridas: analise.acoesSugeridas.map((item) => cleanText(item, 400)).filter(Boolean).slice(0, 10),
          riscos: analise.riscos.map((item) => cleanText(item, 400)).filter(Boolean).slice(0, 8),
          lacunas: analise.lacunas.map((item) => cleanText(item, 400)).filter(Boolean).slice(0, 8),
        }
        const nextMetadata: DocumentoMetadata = {
          ...metadata,
          alixDocumentId,
          alixSessionId: sessionId,
          analiseProfunda: analiseResumida,
        }
        await db.update(portalUpload).set({ metadata: nextMetadata }).where(eq(portalUpload.id, row.id))
        const updated = await db.select().from(portalUpload).where(eq(portalUpload.id, row.id)).limit(1)

        return reply.send({
          success: true,
          data: {
            documento: projetarDocumento(updated[0]),
            analise,
            encaminhamento,
          },
        })
      } catch (err) {
        req.log.error({ err, docId: req.params.docId }, '[cliente-documentos] análise inteligente falhou')
        return reply.status(500).send({ success: false, error: (err as Error).message || 'Não foi possível analisar o documento.' })
      }
    },
  )

  // O encaminhamento inferido pela IA é apenas uma sugestão. Esta rota registra
  // a decisão explícita do consultor antes de o arquivo ser tratado como evidência
  // confirmada em uma área do CRM.
  fastify.post<{
    Params: { id: string; docId: string }
    Body: { destino?: 'propostas' | 'negociacao' | 'financeiro' | 'cadastro' | 'documentos' }
  }>(
    '/api/clientes/:id/documentos/:docId/confirmar-encaminhamento',
    async (req, reply) => {
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        const destino = String(req.body?.destino || '')
        if (!['propostas', 'negociacao', 'financeiro', 'cadastro', 'documentos'].includes(destino)) {
          return reply.status(400).send({ success: false, error: 'Destino de encaminhamento inválido.' })
        }
        const db = getDb()
        const rows = await db
          .select()
          .from(portalUpload)
          .where(and(eq(portalUpload.id, req.params.docId), eq(portalUpload.clienteId, req.params.id)))
          .limit(1)
        const row = rows[0]
        if (!row) return reply.status(404).send({ success: false, error: 'Documento não encontrado' })

        const metadata = metadataOf(row.metadata)
        if (!metadata.analiseProfunda) {
          return reply.status(409).send({ success: false, error: 'Analise o documento antes de confirmar o encaminhamento.' })
        }
        const nextMetadata: DocumentoMetadata = {
          ...metadata,
          encaminhamentoConfirmado: {
            destino: destino as NonNullable<DocumentoMetadata['encaminhamentoConfirmado']>['destino'],
            confirmadoEm: new Date().toISOString(),
          },
        }
        await db.update(portalUpload).set({ metadata: nextMetadata }).where(eq(portalUpload.id, row.id))
        const updated = await db.select().from(portalUpload).where(eq(portalUpload.id, row.id)).limit(1)
        return reply.send({ success: true, data: projetarDocumento(updated[0]) })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message || 'Não foi possível confirmar o encaminhamento.' })
      }
    },
  )

  // Deletar documento
  fastify.delete<{ Params: { id: string; docId: string } }>(
    '/api/clientes/:id/documentos/:docId',
    async (req, reply) => {
      try {
        if (!clientes.get(req.params.id)) {
          return reply.status(404).send({ success: false, error: 'Cliente não encontrado' })
        }
        const db = getDb()
        const rows = await db
          .select()
          .from(portalUpload)
          .where(and(eq(portalUpload.id, req.params.docId), eq(portalUpload.clienteId, req.params.id)))
          .limit(1)
        const row = rows[0]
        if (!row) return reply.status(404).send({ success: false, error: 'Documento não encontrado' })
        const demandService = getClienteDemandaService()
        for (const demanda of await demandService.list(req.params.id)) {
          if (!demanda.documentoIds.includes(row.id)) continue
          await demandService.update(req.params.id, demanda.id, {
            documentoIds: demanda.documentoIds.filter((id) => id !== row.id),
            autor: 'crm-documentos',
          })
        }
        try { await unlink(join(uploadDir(), row.nomeStorage)) } catch {/* já removido */}
        const metadata = metadataOf(row.metadata)
        if (typeof metadata.alixSessionId === 'string' && typeof metadata.alixDocumentId === 'string') {
          try {
            const { getDocumentIntakeService } = await import('../services/alix/intake/DocumentIntakeService.js')
            await getDocumentIntakeService().remove(metadata.alixSessionId, metadata.alixDocumentId)
          } catch (err) {
            req.log.warn({ err, docId: row.id }, '[cliente-documentos] falha removendo cópia ALIX')
          }
        }
        await db.delete(portalUpload).where(eq(portalUpload.id, row.id))
        return reply.send({ success: true })
      } catch (err) {
        return reply.status(500).send({ success: false, error: (err as Error).message })
      }
    },
  )

  console.log('[ClienteDocumentos] Rotas registradas: GET/POST/PATCH/DELETE/ANALISAR /api/clientes/:id/documentos[/:docId][/download]')
}
