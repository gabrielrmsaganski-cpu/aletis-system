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
  type ContratoGerado,
  type TipoContrato,
} from '../services/ContratoGenerator.js'
import { generateContratoPdf } from '../services/PdfGenerator.js'

const contratos: Map<string, ContratoGerado> = new Map()

export default async function (fastify: FastifyInstance) {
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
  fastify.get('/api/contratos', async (request: FastifyRequest) => {
    const { tipo } = request.query as { tipo?: TipoContrato }
    let items = Array.from(contratos.values())
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
      })),
      total: items.length,
    }
  })

  /* ---- GET CONTRATO ---- */
  fastify.get('/api/contratos/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const contrato = contratos.get(id)
    if (!contrato) {
      reply.status(404)
      return { success: false, error: 'Contrato não encontrado' }
    }
    return { success: true, data: contrato }
  })

  /* ---- GERAR CONTRATO ---- */
  fastify.post('/api/contratos/gerar', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as DadosContrato

    // Validações mínimas
    const errors: string[] = []
    if (!body.tipo) errors.push('tipo é obrigatório')
    if (!body.devedor) errors.push('devedor é obrigatório')
    if (!body.credor) errors.push('credor é obrigatório')
    if (!body.local) errors.push('local é obrigatório')
    if (!body.uf) errors.push('uf é obrigatório')
    if (body.devedor && !body.devedor.nomeCompleto) errors.push('devedor.nomeCompleto é obrigatório')
    if (body.devedor && !body.devedor.cpfCnpj) errors.push('devedor.cpfCnpj é obrigatório')
    if (body.credor && !body.credor.nomeCompleto) errors.push('credor.nomeCompleto é obrigatório')
    if (body.credor && !body.credor.cpfCnpj) errors.push('credor.cpfCnpj é obrigatório')

    const tiposValidos: TipoContrato[] = [
      'cpr_financeira',
      'cpr_fisica',
      'confissao_divida',
      'termo_renegociacao',
      'acordo_extrajudicial',
      'transacao_excepcional',
      'prestacao_servicos_aletis',
    ]
    if (body.tipo && !tiposValidos.includes(body.tipo)) {
      errors.push(`tipo inválido. Aceitos: ${tiposValidos.join(', ')}`)
    }

    // Validação extra para contrato de prestação de serviços ALETIS
    if (body.tipo === 'prestacao_servicos_aletis') {
      if (!body.servicos) {
        errors.push('servicos é obrigatório para tipo prestacao_servicos_aletis')
      } else {
        if (!body.servicos.modeloHonorarios) {
          errors.push('servicos.modeloHonorarios é obrigatório')
        }
        if (!body.servicos.prazoVigenciaMeses || body.servicos.prazoVigenciaMeses < 1) {
          errors.push('servicos.prazoVigenciaMeses deve ser >= 1')
        }
        if (!body.servicos.escopo) {
          errors.push('servicos.escopo é obrigatório')
        }
      }
    }

    if (errors.length > 0) {
      reply.status(400)
      return { success: false, error: 'Erro de validação', detalhes: errors }
    }

    try {
      const contrato = contratoGenerator.gerar(body)
      contratos.set(contrato.id, contrato)

      reply.status(201)
      return {
        success: true,
        data: contrato,
        meta: {
          pdfUrl: `/api/contratos/${contrato.id}/pdf`,
          clausulas: contrato.metadados.clausulas,
        },
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error('[Contrato] Falha na geração:', msg)
      reply.status(500)
      return { success: false, error: `Erro ao gerar contrato: ${msg}` }
    }
  })

  /* ---- GET MARKDOWN ---- */
  fastify.get('/api/contratos/:id/markdown', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const contrato = contratos.get(id)
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
    const contrato = contratos.get(id)
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido'
      console.error(`[Contrato PDF] Falha ao gerar PDF para ${id}:`, msg)
      reply.status(500)
      return { success: false, error: `Erro ao gerar PDF: ${msg}` }
    }
  })

  /* ---- DELETE ---- */
  fastify.delete('/api/contratos/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const existia = contratos.delete(id)
    if (!existia) {
      reply.status(404)
      return { success: false, error: 'Contrato não encontrado' }
    }
    return { success: true, data: { id, deletado: true } }
  })
}
