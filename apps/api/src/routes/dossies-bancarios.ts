import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getDossieBancarioService } from '../services/dossies-bancarios/DossieBancarioService.js'
import { BANCOS_DOSSIE, type BancoDossieId } from '../services/dossies-bancarios/manifest.js'

function envelope<T>(data: T) {
  return { success: true, data }
}

function isBancoId(value: unknown): value is BancoDossieId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BANCOS_DOSSIE, value)
}

function invalidBank(reply: FastifyReply) {
  reply.status(400)
  return {
    success: false,
    error: 'Banco obrigatório ou inválido. Use btg, itau, santander, daycoval, bocom, geral ou safras.',
    code: 'BANCO_INVALIDO',
  }
}

function generationError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : 'Falha inesperada ao gerar o dossiê.'
  reply.status(/obrigat|inválid|não encontrad/i.test(message) ? 422 : 500)
  return {
    success: false,
    error: message,
    code: 'DOSSIE_GERACAO_FALHOU',
  }
}

function parseInput(body: Record<string, unknown> & { banco: BancoDossieId }) {
  return {
    banco: body.banco,
    clienteId: typeof body.clienteId === 'string' ? body.clienteId : undefined,
    perfilId: typeof body.perfilId === 'string' ? body.perfilId : 'produtor-pf',
    incluirOriginais: body.incluirOriginais === true,
    incluirInteligencia: body.incluirInteligencia === true,
    gerarModelosPreenchidos: body.gerarModelosPreenchidos !== false,
    cliente: typeof body.cliente === 'object' && body.cliente !== null ? body.cliente as any : undefined,
    dados: typeof body.dados === 'object' && body.dados !== null ? body.dados as any : undefined,
  }
}

export default async function dossiesBancariosRoutes(fastify: FastifyInstance) {
  const service = getDossieBancarioService()

  fastify.get('/api/dossies-bancarios/catalogo', async () => {
    return envelope(service.catalogo())
  })

  fastify.post('/api/dossies-bancarios/preparacao', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as Record<string, unknown>
    if (!isBancoId(body.banco)) {
      return invalidBank(reply)
    }
    try {
      return envelope(await service.analisarPreparacao(parseInput({ ...body, banco: body.banco })))
    } catch (error) {
      return generationError(reply, error)
    }
  })

  fastify.post('/api/dossies-bancarios/pacote', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as Record<string, unknown>
    if (!isBancoId(body.banco)) {
      return invalidBank(reply)
    }

    let result
    try {
      result = await service.gerarPacote(parseInput({ ...body, banco: body.banco }))
    } catch (error) {
      return generationError(reply, error)
    }

    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${result.filename}"`)
      .header('Content-Length', result.buffer.length.toString())
      .header('X-Dossie-Modelos', result.modelos.length.toString())
      .header('X-Dossie-Checklist', result.checklist.length.toString())
      .header('X-Dossie-Arquivos-Gerados', result.arquivosGerados.length.toString())
    return reply.send(result.buffer)
  })

  fastify.post('/api/dossies-bancarios/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as Record<string, unknown>
    if (!isBancoId(body.banco)) {
      return invalidBank(reply)
    }

    let result
    try {
      result = await service.gerarPdf(parseInput({ ...body, banco: body.banco }))
    } catch (error) {
      return generationError(reply, error)
    }
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${result.filename}"`)
      .header('Content-Length', result.buffer.length.toString())
      .header('X-Dossie-Paginas', result.paginas.toString())
    return reply.send(result.buffer)
  })

  fastify.post('/api/dossies-bancarios/html', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body ?? {}) as Record<string, unknown>
    if (!isBancoId(body.banco)) {
      return invalidBank(reply)
    }
    try {
      const result = await service.gerarHtml(parseInput({ ...body, banco: body.banco }))
      return reply
        .type('text/html; charset=utf-8')
        .header('Content-Disposition', `inline; filename="${result.filename}"`)
        .header('X-Dossie-Paginas', result.paginas.toString())
        .send(result.html)
    } catch (error) {
      return generationError(reply, error)
    }
  })
}
