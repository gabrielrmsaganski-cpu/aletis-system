import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { NormalizedEvolutionMessage } from './evolution/types.js'
import { getConversationStateService } from './ConversationStateService.js'
import { getEvolutionClient } from './evolution/EvolutionClient.js'

export interface DocumentIntakeResult {
  saved: boolean
  documentId?: string
  storageKey?: string
  categoria?: string
  resumo?: string
  reason?: string
}

const REQUIRED_DOCS = [
  { key: 'contrato', label: 'Contrato ou cedula original' },
  { key: 'proposta', label: 'Proposta/termo enviado pelo banco' },
  { key: 'extrato', label: 'Extrato ou demonstrativo da divida' },
  { key: 'documento_pessoal', label: 'Documento pessoal / CNPJ / contrato social' },
  { key: 'garantia', label: 'Garantias, matriculas, CPRs ou avalistas' },
]

function storageDir(): string {
  return process.env.WHATSAPP_STORAGE_DIR || join(process.cwd(), 'storage', 'whatsapp-media')
}

function safeFilename(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'documento'
}

function classify(filename: string, mime = '', caption = ''): { categoria: string; resumo: string; confidence: number } {
  const text = `${filename} ${mime} ${caption}`.toLowerCase()
  if (/contrato|cedula|c[ée]dula|cpr|confissao|confiss/.test(text)) {
    return { categoria: 'contrato', resumo: 'Documento recebido parece ser contrato, cedula, CPR ou confissao de divida.', confidence: 0.78 }
  }
  if (/proposta|renegoci|acordo|termo|sicoob|sicredi|banco|bradesco|santander|itau|bb/.test(text)) {
    return { categoria: 'proposta', resumo: 'Documento recebido parece ser proposta, termo de negociacao ou material do credor.', confidence: 0.74 }
  }
  if (/extrato|demonstrativo|saldo|evolu|memoria|planilha|xls|xlsx|csv/.test(text)) {
    return { categoria: 'extrato', resumo: 'Documento recebido parece ser extrato, demonstrativo ou memoria de calculo.', confidence: 0.72 }
  }
  if (/cnpj|cpf|rg|cnh|social|cartao|documento|identidade/.test(text)) {
    return { categoria: 'documento_pessoal', resumo: 'Documento recebido parece ser identificacao pessoal, CNPJ ou contrato social.', confidence: 0.7 }
  }
  if (/matricula|garantia|aval|hipoteca|penhor|imovel|fazenda|car\b/.test(text)) {
    return { categoria: 'garantia', resumo: 'Documento recebido parece ligado a garantia, imovel, aval ou CAR.', confidence: 0.7 }
  }
  return { categoria: 'nao_classificado', resumo: 'Documento recebido e salvo para revisao manual.', confidence: 0.45 }
}

export class DocumentIntakeService {
  getRequiredDocuments() {
    return REQUIRED_DOCS
  }

  async ingestFromWebhook(input: {
    conversationId: string
    clienteId?: string | null
    messageId?: string | null
    message: NormalizedEvolutionMessage
  }): Promise<DocumentIntakeResult> {
    const msg = input.message
    if (!['document', 'image', 'audio', 'video'].includes(msg.type)) {
      return { saved: false, reason: 'mensagem_sem_midia' }
    }

    const filename = safeFilename(msg.mediaFilename || `${msg.type}-${msg.providerMessageId || Date.now()}`)
    const mime = msg.mediaMime || 'application/octet-stream'
    const classification = classify(filename, mime, msg.caption || msg.text || '')
    const provider = process.env.WHATSAPP_STORAGE_PROVIDER || 'local'
    const baseDir = storageDir()
    const day = new Date().toISOString().slice(0, 10)
    const ext = extname(filename) || (mime.includes('pdf') ? '.pdf' : '')
    const finalName = filename.includes('.') ? filename : `${filename}${ext}`
    const storageKey = join(day, input.conversationId, finalName)

    let sha256: string | undefined
    let sizeBytes: number | undefined
    if ((msg.mediaBase64 || msg.mediaUrl) && provider === 'local') {
      const downloaded = await getEvolutionClient().downloadMedia({
        mediaBase64: msg.mediaBase64,
        mediaUrl: msg.mediaUrl,
        mimetype: mime,
      })
      const buffer = downloaded.buffer
      sha256 = createHash('sha256').update(buffer).digest('hex')
      sizeBytes = buffer.byteLength
      const fullPath = join(baseDir, storageKey)
      if (!existsSync(join(baseDir, day, input.conversationId))) {
        mkdirSync(join(baseDir, day, input.conversationId), { recursive: true })
      }
      writeFileSync(fullPath, buffer)
      await getConversationStateService().saveMediaFile({
        conversationId: input.conversationId,
        messageId: input.messageId ?? null,
        providerMediaId: msg.mediaId,
        mediaType: msg.type,
        mimeType: downloaded.mimeType,
        filename: finalName,
        storageProvider: provider,
        storageKey: fullPath,
        sha256,
        sizeBytes,
        payload: { source: downloaded.source, mediaUrl: msg.mediaUrl },
      })
    }

    const state = getConversationStateService()
    const doc = await state.saveDocument({
      conversationId: input.conversationId,
      clienteId: input.clienteId ?? null,
      messageId: input.messageId ?? null,
      filename: finalName,
      mimeType: mime,
      storageProvider: provider,
      storageKey: provider === 'local' ? join(baseDir, storageKey) : storageKey,
      sha256,
      categoria: classification.categoria,
      status: classification.categoria === 'nao_classificado' ? 'revisao' : 'recebido',
      resumoIa: classification.resumo,
      classification,
      payload: {
        source: 'whatsapp',
        mediaUrl: msg.mediaUrl,
        hasBase64: Boolean(msg.mediaBase64),
        caption: msg.caption,
        sizeBytes,
      },
    })

    return {
      saved: true,
      documentId: doc.id,
      storageKey: doc.storageKey,
      categoria: doc.categoria,
      resumo: doc.resumoIa || classification.resumo,
    }
  }

  async getChecklistStatus(conversationId: string) {
    const state = getConversationStateService()
    const bundle = await state.getConversationBundle(conversationId)
    const received = new Set(bundle.documents.map((d) => d.categoria).filter(Boolean))
    return REQUIRED_DOCS.map((doc) => ({
      ...doc,
      status: received.has(doc.key) ? 'recebido' : 'pendente',
    }))
  }
}

let cached: DocumentIntakeService | null = null
export function getDocumentIntakeService(): DocumentIntakeService {
  if (!cached) cached = new DocumentIntakeService()
  return cached
}
