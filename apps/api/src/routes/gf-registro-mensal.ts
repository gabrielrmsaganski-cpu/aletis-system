/**
 * Registro Mensal / Foto Mensal — R.OP.007 / R.OP.008
 *
 * Prefixo: /api/gf-registro-mensal
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { eq, and, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../db/client.js'
import { gfRegistroMensal } from '../db/schema.js'

const ok = <T>(data: T) => ({ success: true, data })
const fail = (error: string, code = 'ERROR') => ({ success: false, error, code })

/* ─── In-Memory fallback ─── */
const memStore = new Map<string, any[]>() // key: grupoId
let memIdSeq = 1

function getMemItems(grupoId: string): any[] {
  if (!memStore.has(grupoId)) memStore.set(grupoId, [])
  return memStore.get(grupoId)!
}

export default async function (fastify: FastifyInstance) {
  /* ── Listar por grupo ── */
  fastify.get('/api/gf-registro-mensal/grupo/:grupoId', async (req: FastifyRequest) => {
    const { grupoId } = req.params as { grupoId: string }
    if (isPgEnabled()) {
      const db = getDb()
      const rows = await db
        .select()
        .from(gfRegistroMensal)
        .where(eq(gfRegistroMensal.grupoId, grupoId))
        .orderBy(gfRegistroMensal.competencia, gfRegistroMensal.criadoEm)
      return ok(rows)
    }
    return ok(getMemItems(grupoId))
  })

  /* ── Consolidado por competência ── */
  fastify.get('/api/gf-registro-mensal/grupo/:grupoId/consolidado', async (req: FastifyRequest) => {
    const { grupoId } = req.params as { grupoId: string }
    const query = req.query as { competencia?: string }

    if (isPgEnabled()) {
      const db = getDb()
      const conditions = [eq(gfRegistroMensal.grupoId, grupoId)]
      if (query.competencia) conditions.push(eq(gfRegistroMensal.competencia, query.competencia))
      const rows = await db
        .select()
        .from(gfRegistroMensal)
        .where(and(...conditions))
        .orderBy(gfRegistroMensal.competencia)

      // Agregar por competência
      const map = new Map<string, { competencia: string; receitas: number; despesas: number; saldo: number; itens: number }>()
      for (const r of rows) {
        const c = r.competencia
        if (!map.has(c)) map.set(c, { competencia: c, receitas: 0, despesas: 0, saldo: 0, itens: 0 })
        const m = map.get(c)!
        const v = Number(r.valor) || 0
        if (r.tipo === 'receita') m.receitas += v
        else m.despesas += v
        m.saldo = m.receitas - m.despesas
        m.itens += 1
      }
      return ok({ competencias: Array.from(map.values()), detalhe: rows })
    }

    const rows = getMemItems(grupoId)
    const map = new Map<string, any>()
    for (const r of rows) {
      const c = r.competencia
      if (!map.has(c)) map.set(c, { competencia: c, receitas: 0, despesas: 0, saldo: 0, itens: 0 })
      const m = map.get(c)
      const v = Number(r.valor) || 0
      if (r.tipo === 'receita') m.receitas += v
      else m.despesas += v
      m.saldo = m.receitas - m.despesas
      m.itens += 1
    }
    return ok({ competencias: Array.from(map.values()), detalhe: rows })
  })

  /* ── Criar ── */
  fastify.post('/api/gf-registro-mensal/grupo/:grupoId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { grupoId } = req.params as { grupoId: string }
    const body = req.body as {
      competencia: string
      tipo: 'receita' | 'despesa'
      descricao: string
      categoria?: string
      valor?: number | string
      dataLancamento?: string
      origem?: string
      observacoes?: string
    }
    if (!body.competencia || !body.tipo || !body.descricao) {
      reply.status(400); return fail('competencia, tipo e descricao são obrigatórios')
    }
    const payload = {
      grupoId,
      competencia: body.competencia,
      tipo: body.tipo,
      descricao: body.descricao,
      categoria: body.categoria ?? 'geral',
      valor: String(body.valor ?? 0) as string,
      dataLancamento: body.dataLancamento ?? null,
      origem: body.origem ?? 'manual',
      observacoes: body.observacoes ?? null,
    }

    if (isPgEnabled()) {
      const db = getDb()
      const inserted = await db.insert(gfRegistroMensal).values(payload).returning()
      return ok(inserted[0])
    }

    const item = { id: memIdSeq++, ...payload, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() }
    getMemItems(grupoId).push(item)
    return ok(item)
  })

  /* ── Atualizar ── */
  fastify.patch('/api/gf-registro-mensal/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{
      competencia: string; tipo: string; descricao: string; categoria: string
      valor: number | string; dataLancamento: string; origem: string; observacoes: string
    }>
    if (isPgEnabled()) {
      const db = getDb()
      const patch: Record<string, any> = { ...body, atualizadoEm: new Date() }
      if (patch.valor != null) patch.valor = String(patch.valor)
      const updated = await db
        .update(gfRegistroMensal)
        .set(patch)
        .where(eq(gfRegistroMensal.id, Number(id)))
        .returning()
      if (updated.length === 0) { reply.status(404); return fail('Registro não encontrado') }
      return ok(updated[0])
    }
    for (const [, list] of memStore) {
      const idx = list.findIndex((x) => String(x.id) === id)
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...body, atualizadoEm: new Date().toISOString() }
        return ok(list[idx])
      }
    }
    reply.status(404); return fail('Registro não encontrado')
  })

  /* ── Deletar ── */
  fastify.delete('/api/gf-registro-mensal/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string }
    if (isPgEnabled()) {
      const db = getDb()
      await db.delete(gfRegistroMensal).where(eq(gfRegistroMensal.id, Number(id)))
      return ok({ deleted: true })
    }
    for (const [key, list] of memStore) {
      const idx = list.findIndex((x) => String(x.id) === id)
      if (idx >= 0) { list.splice(idx, 1); return ok({ deleted: true }) }
    }
    reply.status(404); return fail('Registro não encontrado')
  })
}
