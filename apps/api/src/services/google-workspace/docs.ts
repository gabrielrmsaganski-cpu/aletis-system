import { randomUUID } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { googleDocument, type GoogleDocument } from '../../db/schema.js'
import { getClientCoreService } from '../core/ClientCoreService.js'
import type { GoogleWorkspaceActor } from './schemas.js'
import { GOOGLE_SCOPES, googleDocUrl } from './schemas.js'
import { getGoogleWorkspaceAuditService } from './audit.js'
import { getGoogleWorkspaceClient } from './client.js'
import { getGoogleDriveService } from './drive.js'

const memoryDocs = new Map<string, GoogleDocument[]>()

function key(tenantId: string, clientId: string): string {
  return `${tenantId}:${clientId}`
}

function datePt(value = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR').format(value)
}

function buildDocumentTitle(type: string, cliente: Record<string, any>): string {
  const names: Record<string, string> = {
    proposta_comercial: 'Proposta Comercial',
    relatorio_estrategico: 'Relatório Estratégico',
    ficha_cliente: 'Ficha do Cliente',
    contrato: 'Contrato',
    checklist_onboarding: 'Checklist de Onboarding',
  }
  const label = names[type] || 'Documento ALETIS'
  return `${label} - ${cliente.nome || cliente.razaoSocial || cliente.id || 'Cliente'}`
}

function buildDocumentBody(type: string, cliente: Record<string, any>): string {
  const nome = cliente.nome || cliente.razaoSocial || 'Cliente não identificado'
  const linhasBase = [
    `ALETIS - ${buildDocumentTitle(type, cliente)}`,
    '',
    `Cliente: ${nome}`,
    cliente.cpfCnpj ? `CPF/CNPJ: ${cliente.cpfCnpj}` : '',
    cliente.cidade || cliente.uf ? `Localização: ${[cliente.cidade, cliente.uf].filter(Boolean).join('/')}` : '',
    cliente.consultor ? `Consultor responsável: ${cliente.consultor}` : '',
    cliente.estagio ? `Estágio no CRM: ${cliente.estagio}` : '',
    cliente.valorTotalDivida != null ? `Dívida mapeada: R$ ${Number(cliente.valorTotalDivida).toLocaleString('pt-BR')}` : '',
    '',
    `Gerado pelo ALETIS em ${datePt()}.`,
    '',
  ].filter(Boolean)

  const blocos: Record<string, string[]> = {
    proposta_comercial: [
      'Objetivo da proposta',
      'Estruturar uma atuação consultiva para diagnóstico financeiro, organização documental e negociação estratégica conforme dados disponíveis no CRM.',
      '',
      'Escopo inicial',
      '- Revisão do histórico financeiro e documental.',
      '- Mapeamento de dívidas, garantias, contratos e riscos.',
      '- Preparação de estratégia de negociação e materiais de apoio.',
    ],
    relatorio_estrategico: [
      'Resumo estratégico',
      'Este documento consolida informações operacionais do cliente e deve ser complementado pelo consultor antes de envio externo.',
      '',
      'Pontos de atenção',
      '- Conferir documentos pendentes.',
      '- Validar valores e contratos diretamente nas fontes anexadas.',
      '- Registrar próximos passos no CRM.',
    ],
    ficha_cliente: [
      'Ficha cadastral',
      'Use esta ficha como base para validação dos dados do cliente, responsáveis, contatos, propriedades e relacionamento bancário.',
    ],
    contrato: [
      'Minuta / referência contratual',
      'Documento inicial para composição contratual. Deve ser revisado por responsável autorizado antes de assinatura ou envio.',
    ],
    checklist_onboarding: [
      'Checklist de onboarding',
      '- Documento pessoal / societário.',
      '- Comprovante de endereço.',
      '- Contratos bancários e aditivos.',
      '- Matrículas, garantias, CAR/CCIR/ITR quando aplicável.',
      '- Notificações, cobranças, execuções ou processos.',
    ],
  }

  return [...linhasBase, ...(blocos[type] || blocos.relatorio_estrategico)].join('\n')
}

function sharedDriveUrl(value: string): string {
  if (!process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID?.trim()) return value
  const url = new URL(value)
  url.searchParams.set('supportsAllDrives', 'true')
  return url.toString()
}

function toPublic(row: GoogleDocument) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    documentType: row.documentType,
    title: row.title,
    googleFileId: row.googleFileId,
    googleDocUrl: row.googleDocUrl,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  }
}

async function save(row: GoogleDocument): Promise<GoogleDocument> {
  if (isPgEnabled()) {
    try {
      const [saved] = await getDb().insert(googleDocument).values(row as any).returning()
      return saved
    } catch {
      // fallback
    }
  }
  const list = memoryDocs.get(key(row.tenantId, row.clientId)) || []
  memoryDocs.set(key(row.tenantId, row.clientId), [row, ...list])
  return row
}

export class GoogleDocsService {
  async listClientDocuments(actor: GoogleWorkspaceActor, clientId: string): Promise<ReturnType<typeof toPublic>[]> {
    if (isPgEnabled()) {
      try {
        const rows = await getDb()
          .select()
          .from(googleDocument)
          .where(and(eq(googleDocument.tenantId, actor.tenantId), eq(googleDocument.clientId, clientId)))
          .orderBy(desc(googleDocument.createdAt))
          .limit(200)
        return rows.map(toPublic)
      } catch {
        // fallback
      }
    }
    return (memoryDocs.get(key(actor.tenantId, clientId)) || []).map(toPublic)
  }

  async createFromTemplate(input: {
    actor: GoogleWorkspaceActor
    clientId: string
    cliente: Record<string, any>
    documentType: string
    title?: string
    templateId?: string
  }): Promise<ReturnType<typeof toPublic>> {
    const folder = await getGoogleDriveService().createClientFolder({
      actor: input.actor,
      clientId: input.clientId,
      clientName: String(input.cliente.nome || input.clientId),
    })
    const subfolders = folder.subfolders as Record<string, { id: string }>
    const parentId = subfolders.Relatórios?.id || folder.googleFolderId
    const title = input.title?.trim() || buildDocumentTitle(input.documentType, input.cliente)
    const client = getGoogleWorkspaceClient()

    let googleFileId: string
    let googleDocLink: string | undefined

    if (input.templateId) {
      const copied = await client.googleFetch<{ id: string; webViewLink?: string }>(
        input.actor,
        sharedDriveUrl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.templateId)}/copy?fields=id,webViewLink`),
        {
          method: 'POST',
          body: JSON.stringify({ name: title, parents: [parentId] }),
        },
        GOOGLE_SCOPES.driveFile,
      )
      googleFileId = copied.id
      googleDocLink = copied.webViewLink
    } else {
      const created = await client.googleFetch<{ documentId: string }>(
        input.actor,
        'https://docs.googleapis.com/v1/documents',
        {
          method: 'POST',
          body: JSON.stringify({ title }),
        },
        GOOGLE_SCOPES.docs,
      )
      googleFileId = created.documentId
      await client.googleFetch(
        input.actor,
        sharedDriveUrl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(googleFileId)}?addParents=${encodeURIComponent(parentId)}&fields=id,webViewLink`),
        { method: 'PATCH' },
        GOOGLE_SCOPES.driveFile,
      )
      await client.googleFetch(
        input.actor,
        `https://docs.googleapis.com/v1/documents/${encodeURIComponent(googleFileId)}:batchUpdate`,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: [
              { insertText: { location: { index: 1 }, text: buildDocumentBody(input.documentType, input.cliente) } },
            ],
          }),
        },
        GOOGLE_SCOPES.docs,
      )
    }

    const row = await save({
      id: `gdoc_${randomUUID()}`,
      tenantId: input.actor.tenantId,
      clientId: input.clientId,
      documentType: input.documentType,
      title,
      googleFileId,
      googleDocUrl: googleDocLink || googleDocUrl(googleFileId),
      status: 'created',
      createdBy: input.actor.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { templateId: input.templateId || null },
    } as GoogleDocument)

    await getGoogleWorkspaceAuditService().record({
      actor: input.actor,
      action: 'google_doc_created',
      resourceType: 'cliente',
      resourceId: input.clientId,
      googleResourceId: googleFileId,
      metadata: { documentType: input.documentType, title },
    })
    await getClientCoreService().addTimelineEvent(input.clientId, {
      eventType: 'google_doc_created',
      title: 'Documento Google Docs gerado',
      description: title,
      source: 'google_workspace',
      sourceId: googleFileId,
      metadata: { googleDocUrl: row.googleDocUrl, documentType: input.documentType },
    }, input.actor.userId)
    return toPublic(row)
  }
}

let singleton: GoogleDocsService | null = null

export function getGoogleDocsService(): GoogleDocsService {
  if (!singleton) singleton = new GoogleDocsService()
  return singleton
}
