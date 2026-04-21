/**
 * Rotas — Relatório Gerencial Agro (PDF sob demanda).
 *
 * Prefixo: /api/relatorios
 * - GET /api/relatorios/:clienteId/gerencial/pdf
 *   Consolida dados do cliente, custeio, fiscal, dossiê e fontes
 *   de dados e devolve um PDF A4.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { clientes } from './clientes.js'
import {
  gerarPdfRelatorioGerencial,
  type ClienteRelatorioSnapshot,
} from '../services/relatorios/RelatorioGerencialGenerator.js'

function safeId(raw: string): string {
  return (raw || '').replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Converte o Cliente in-memory (do CRM) para o snapshot usado pelo
 * relatório. O relatório só precisa de um subconjunto dos campos —
 * mantemos o duck-typing para não acoplar ao tipo interno.
 */
function toSnapshot(cliente: unknown, id: string): ClienteRelatorioSnapshot {
  const c = cliente as Record<string, unknown>
  return {
    id,
    nome: String(c.nome ?? ''),
    cpfCnpj: c.cpfCnpj ? String(c.cpfCnpj) : undefined,
    cidade: c.cidade ? String(c.cidade) : undefined,
    uf: c.uf ? String(c.uf) : undefined,
    telefone: c.telefone ? String(c.telefone) : undefined,
    email: c.email ? String(c.email) : undefined,
    atividade: c.atividade ? String(c.atividade) : undefined,
    areaTotalHa: typeof c.areaTotalHa === 'number' ? c.areaTotalHa : undefined,
    culturas: Array.isArray(c.culturas) ? (c.culturas as string[]) : [],
    estagio: c.estagio ? String(c.estagio) : undefined,
    consultor: c.consultor ? String(c.consultor) : undefined,
    credor: c.credor ? String(c.credor) : undefined,
    valorTotalDivida:
      typeof c.valorTotalDivida === 'number' ? c.valorTotalDivida : undefined,
    valorTotalPago:
      typeof c.valorTotalPago === 'number' ? c.valorTotalPago : undefined,
    dividas: Array.isArray(c.dividas)
      ? (c.dividas as ClienteRelatorioSnapshot['dividas'])
      : [],
    pagamentos: Array.isArray(c.pagamentos)
      ? (c.pagamentos as ClienteRelatorioSnapshot['pagamentos'])
      : [],
    saudeFinanceira:
      typeof c.saudeFinanceira === 'number' ? c.saudeFinanceira : undefined,
  }
}

export default async function (fastify: FastifyInstance) {
  /* ------------------------------------------------------------------
   * GET /api/relatorios/:clienteId/gerencial/pdf
   * ------------------------------------------------------------------ */
  fastify.get(
    '/api/relatorios/:clienteId/gerencial/pdf',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { clienteId } = request.params as { clienteId: string }
      const id = safeId(clienteId)
      const cliente = clientes.get(id)
      if (!cliente) {
        reply.status(404)
        return { success: false, error: 'Cliente não encontrado' }
      }

      try {
        const snapshot = toSnapshot(cliente, id)
        const bytes = await gerarPdfRelatorioGerencial(snapshot)
        const safeName = snapshot.nome.replace(/[^a-zA-Z0-9_-]+/g, '_') || id
        const filename = `relatorio-gerencial-${safeName}-${id}.pdf`
        reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .header('Content-Length', bytes.length.toString())
        return reply.send(Buffer.from(bytes))
      } catch (err) {
        reply.status(500)
        return {
          success: false,
          error: `Falha ao gerar relatório: ${(err as Error).message}`,
        }
      }
    },
  )
}
