/**
 * Checklist Assessoria — R.OP.003 / 004 / 005
 *
 * Prefixo: /api/checklist-assessoria
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { eq, and } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../db/client.js'
import { admChecklistCliente } from '../db/schema.js'
import { CHECKLIST_TEMPLATES, getTemplate } from '../data/checklistTemplates.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

/* ─── Helpers ─── */
function getEscritorioHeader(req: FastifyRequest): string {
  const h = (req.headers['x-escritorio'] as string) || ''
  // default to 'Aletis' if not provided
  return h || 'Aletis'
}

/* ─── In-Memory fallback store ─── */
const memChecklists = new Map<string, any>() // key: `${clienteId}:${codigo}`

function memKey(clienteId: string, codigo: string) {
  return `${clienteId}:${codigo}`
}

function ensureClienteChecklists(clienteId: string, escritorio: string) {
  for (const tpl of CHECKLIST_TEMPLATES) {
    const key = memKey(clienteId, tpl.codigo)
    if (!memChecklists.has(key)) {
      memChecklists.set(key, {
        id: Date.now() + Math.floor(Math.random() * 100000),
        clienteId,
        escritorio,
        checklistCodigo: tpl.codigo,
        checklistNome: tpl.nome,
        respostas: {},
        status: 'pendente',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      })
    }
  }
}

export default async function (fastify: FastifyInstance) {
  /* ── Templates ── */
  fastify.get('/api/checklist-assessoria/templates', async () => {
    return ok(CHECKLIST_TEMPLATES)
  })

  fastify.get('/api/checklist-assessoria/templates/:codigo', async (req: FastifyRequest, reply: FastifyReply) => {
    const { codigo } = req.params as { codigo: string }
    const tpl = getTemplate(codigo)
    if (!tpl) { reply.status(404); return fail('Template não encontrado') }
    return ok(tpl)
  })

  /* ── Listar respostas de um cliente (todos os checklists) ── */
  fastify.get('/api/checklist-assessoria/cliente/:clienteId', async (req: FastifyRequest) => {
    const { clienteId } = req.params as { clienteId: string }
    const escritorio = getEscritorioHeader(req)

    if (isPgEnabled()) {
      const db = getDb()
      const rows = await db
        .select()
        .from(admChecklistCliente)
        .where(
          and(
            eq(admChecklistCliente.clienteId, clienteId),
            eq(admChecklistCliente.escritorio, escritorio)
          )
        )
      // Ensure all three templates exist
      const existingCodes = new Set(rows.map((r) => r.checklistCodigo))
      for (const tpl of CHECKLIST_TEMPLATES) {
        if (!existingCodes.has(tpl.codigo)) {
          const inserted = await db
            .insert(admChecklistCliente)
            .values({
              clienteId,
              escritorio,
              checklistCodigo: tpl.codigo,
              checklistNome: tpl.nome,
              respostas: {},
              status: 'pendente',
            })
            .returning()
          rows.push(inserted[0])
        }
      }
      return ok(rows)
    }

    ensureClienteChecklists(clienteId, escritorio)
    const result: any[] = []
    for (const tpl of CHECKLIST_TEMPLATES) {
      result.push(memChecklists.get(memKey(clienteId, tpl.codigo)))
    }
    return ok(result)
  })

  /* ── Atualizar respostas de um checklist ── */
  fastify.post('/api/checklist-assessoria/cliente/:clienteId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clienteId } = req.params as { clienteId: string }
    const body = req.body as {
      checklistCodigo: string
      respostas?: Record<string, { valor?: any; observacao?: string }>
      status?: 'pendente' | 'em_andamento' | 'concluido'
    }
    if (!body?.checklistCodigo) { reply.status(400); return fail('checklistCodigo é obrigatório') }
    const tpl = getTemplate(body.checklistCodigo)
    if (!tpl) { reply.status(400); return fail('Código de checklist inválido') }

    const escritorio = getEscritorioHeader(req)
    const respostas = body.respostas ?? {}
    const status = body.status || 'em_andamento'

    if (isPgEnabled()) {
      const db = getDb()
      const existing = await db
        .select()
        .from(admChecklistCliente)
        .where(
          and(
            eq(admChecklistCliente.clienteId, clienteId),
            eq(admChecklistCliente.checklistCodigo, body.checklistCodigo),
            eq(admChecklistCliente.escritorio, escritorio)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        const updated = await db
          .update(admChecklistCliente)
          .set({
            respostas,
            status,
            atualizadoEm: new Date(),
          })
          .where(eq(admChecklistCliente.id, existing[0].id))
          .returning()
        return ok(updated[0])
      } else {
        const inserted = await db
          .insert(admChecklistCliente)
          .values({
            clienteId,
            escritorio,
            checklistCodigo: tpl.codigo,
            checklistNome: tpl.nome,
            respostas,
            status,
          })
          .returning()
        return ok(inserted[0])
      }
    }

    ensureClienteChecklists(clienteId, escritorio)
    const key = memKey(clienteId, body.checklistCodigo)
    const row = memChecklists.get(key)
    row.respostas = respostas
    row.status = status
    row.atualizadoEm = new Date().toISOString()
    return ok(row)
  })

  /* ── Limpar / resetar respostas de um checklist ── */
  fastify.delete('/api/checklist-assessoria/cliente/:clienteId/:codigo', async (req: FastifyRequest, reply: FastifyReply) => {
    const { clienteId, codigo } = req.params as { clienteId: string; codigo: string }
    const escritorio = getEscritorioHeader(req)

    if (isPgEnabled()) {
      const db = getDb()
      await db
        .delete(admChecklistCliente)
        .where(
          and(
            eq(admChecklistCliente.clienteId, clienteId),
            eq(admChecklistCliente.checklistCodigo, codigo),
            eq(admChecklistCliente.escritorio, escritorio)
          )
        )
    } else {
      const key = memKey(clienteId, codigo)
      if (memChecklists.has(key)) {
        memChecklists.delete(key)
      }
    }
    return ok({ clienteId, codigo, reset: true })
  })
}
