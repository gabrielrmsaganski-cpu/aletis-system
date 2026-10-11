/**
 * Rotas de Contratos — geração de instrumentos contratuais para
 * reestruturação de dívida rural e comercialização de safra.
 *
 * Complementa as rotas de propostas (que são o documento estratégico
 * / apresentação); aqui entrega-se a peça jurídica formal pronta pra
 * assinatura (após revisão).
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  contratoGenerator,
  type DadosContrato,
  type TipoContrato,
} from '../services/ContratoGenerator.js'
import { generateContratoPdf } from '../services/PdfGenerator.js'
import { generatedContractPersistence } from '../db/GeneratedContractRepository.js'
import {
  GeneratedContractCatalog,
  GeneratedContractOriginError,
  contractOriginSchema,
} from '../services/contratos/GeneratedContractCatalog.js'
import { contractGenerationRequestSchema } from '../services/contratos/ContractGenerationValidation.js'

function persistenceFailure(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  // Não inclui payloads contratuais nem parâmetros da consulta no log.
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined
  request.log.error({ code }, '[contratos] Falha de persistência do catálogo')
  return reply.status(503).send({ success: false, error: 'Não foi possível acessar o catálogo de contratos. Tente novamente.' })
}

export default async function (fastify: FastifyInstance) {
  const contratos = new GeneratedContractCatalog(generatedContractPersistence)
  /* ---- LIST TIPOS DISPONÍVEIS ---- */
  fastify.get('/api/contratos/tipos', async () => {
    const data = contratoGenerator.listarTipos()
    return {
      success: true,
      data,
      total: data.length,
    }
  })

  /* ---- LIST CONTRATOS GERADOS ---- */
  fastify.get('/api/contratos', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tipo } = request.query as { tipo?: TipoContrato }
    let items
    try {
      items = await contratos.list()
    } catch (error) {
      return persistenceFailure(request, reply, error)
    }
    if (tipo) items = items.filter((c) => c.tipo === tipo)

    return {
      success: true,
      data: items.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        titulo: c.titulo,
        dataGeracao: c.dataGeracao,
        partes: c.partes,
        valorTotal: c.valorTotal,
        dataVencimentoOrVigencia: c.dataVencimentoOrVigencia,
        clienteId: c.clienteId,
        propostaId: c.propostaId,
        documento: c.documento,
      })),
      total: items.length,
    }
  })

  /* ---- GET CONTRATO ---- */
  fastify.get('/api/contratos/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    let contrato
    try {
      contrato = await contratos.get(id)
    } catch (error) {
      return persistenceFailure(request, reply, error)
    }
    if (!contrato) {
      reply.status(404)
      return { success: false, error: 'Contrato não encontrado' }
    }
    return { success: true, data: contrato }
  })

  /* ---- GERAR CONTRATO ---- */
  fastify.post('/api/contratos/gerar', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = contractGenerationRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Erro de validação', detalhes: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) })
    }
    const body = parsed.data as unknown as DadosContrato

    let generated
    try {
      generated = contratoGenerator.gerar(body)
    } catch {
      request.log.error('[contratos] Falha na geração do conteúdo contratual')
      return reply.status(500).send({ success: false, error: 'Erro ao gerar contrato. Confira os dados informados.' })
    }

    try {
      const contrato = await contratos.create(generated, contractOriginSchema.parse(parsed.data))

      reply.status(201)
      return {
        success: true,
        data: contrato,
        meta: {
          pdfUrl: contrato.documento.pdfUrl,
          clausulas: contrato.metadados.clausulas,
        },
      }
    } catch (error) {
      if (error instanceof GeneratedContractOriginError) {
        return reply.status(400).send({ success: false, error: error.message })
      }
      return persistenceFailure(request, reply, error)
    }
  })

  /* ---- GET MARKDOWN ---- */
  fastify.get('/api/contratos/:id/markdown', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    let contrato
    try {
      contrato = await contratos.get(id)
    } catch (error) {
      return persistenceFailure(request, reply, error)
    }
    if (!contrato) {
      reply.status(404)
      return { success: false, error: 'Contrato não encontrado' }
    }
    reply.header('Content-Type', 'text/markdown; charset=utf-8')
    return contrato.conteudoMarkdown
  })

  /* ---- GET PDF ---- */
  fastify.get('/api/contratos/:id/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    let contrato
    try {
      contrato = await contratos.get(id)
    } catch (error) {
      return persistenceFailure(request, reply, error)
    }
    if (!contrato) {
      reply.status(404)
      return { success: false, error: 'Contrato não encontrado' }
    }

    try {
      const pdfBuffer = await generateContratoPdf({
        id: contrato.id,
        titulo: contrato.titulo,
        tipo: contrato.tipo,
        dataGeracao: contrato.dataGeracao,
        partes: contrato.partes,
        valorTotal: contrato.valorTotal,
        conteudoMarkdown: contrato.conteudoMarkdown,
        fundamentoLegal: contrato.metadados.fundamentoLegal,
      })

      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="${contrato.id}.pdf"`)
        .header('Content-Length', pdfBuffer.length)
        .send(pdfBuffer)
    } catch {
      request.log.error({ contratoId: id }, '[contratos] Falha ao renderizar PDF')
      reply.status(500)
      return { success: false, error: 'Erro ao gerar PDF. O contrato permanece salvo no catálogo.' }
    }
  })

  /* ---- DELETE ---- */
  fastify.delete('/api/contratos/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    let existia
    try {
      existia = await contratos.delete(id)
    } catch (error) {
      return persistenceFailure(request, reply, error)
    }
    if (!existia) {
      reply.status(404)
      return { success: false, error: 'Contrato não encontrado' }
    }
    return { success: true, data: { id, deletado: true } }
  })
}
