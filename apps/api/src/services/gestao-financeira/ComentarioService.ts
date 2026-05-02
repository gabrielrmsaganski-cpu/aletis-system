// ============================================================
// ComentarioService — notas colaborativas em qualquer entidade
// ============================================================
import { eq, and, asc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb, isPgEnabled } from '../../db/client.js'
import { gfComentario, type GfComentario } from '../../db/schema.js'
import { publish } from './GfEventBus.js'

function id(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

export interface ComentarioInput {
  grupoId: string
  entidade: string
  entidadeId?: string
  conteudo: string
  autor?: string
  autorNome?: string
  parentId?: string
}

export interface ThreadComentario extends GfComentario {
  respostas: GfComentario[]
}

export class ComentarioService {
  async criar(input: ComentarioInput): Promise<GfComentario> {
    if (!isPgEnabled()) throw new Error('PG desabilitado')
    const db = getDb()
    const novo = {
      id: id('com'),
      grupoId: input.grupoId,
      entidade: input.entidade,
      entidadeId: input.entidadeId ?? null,
      conteudo: input.conteudo,
      autor: input.autor ?? 'consultor',
      autorNome: input.autorNome ?? null,
      parentId: input.parentId ?? null,
      resolvido: false,
    }
    await db.insert(gfComentario).values(novo)
    const r = await db.select().from(gfComentario).where(eq(gfComentario.id, novo.id)).limit(1)
    // Broadcast SSE
    try {
      publish('comentario', input.grupoId, { acao: 'create', comentario: r[0] })
    } catch {}
    return r[0]
  }

  async atualizar(comId: string, patch: { conteudo?: string; resolvido?: boolean }): Promise<GfComentario> {
    if (!isPgEnabled()) throw new Error('PG desabilitado')
    const db = getDb()
    const set: any = { atualizadoEm: new Date() }
    if (patch.conteudo !== undefined) set.conteudo = patch.conteudo
    if (patch.resolvido !== undefined) set.resolvido = patch.resolvido
    await db.update(gfComentario).set(set).where(eq(gfComentario.id, comId))
    const r = await db.select().from(gfComentario).where(eq(gfComentario.id, comId)).limit(1)
    return r[0]
  }

  async deletar(comId: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    // remove respostas também
    await db.delete(gfComentario).where(eq(gfComentario.parentId, comId))
    await db.delete(gfComentario).where(eq(gfComentario.id, comId))
  }

  async listarThreads(grupoId: string, entidade?: string, entidadeId?: string): Promise<ThreadComentario[]> {
    if (!isPgEnabled()) return []
    const db = getDb()
    const conditions = [eq(gfComentario.grupoId, grupoId)]
    if (entidade) conditions.push(eq(gfComentario.entidade, entidade))
    if (entidadeId) conditions.push(eq(gfComentario.entidadeId, entidadeId))

    const todos = await db
      .select()
      .from(gfComentario)
      .where(and(...conditions))
      .orderBy(asc(gfComentario.criadoEm))

    const raiz = todos.filter((c) => !c.parentId)
    return raiz.map((root) => ({
      ...root,
      respostas: todos.filter((c) => c.parentId === root.id),
    }))
  }

  async contarNaoResolvidos(grupoId: string): Promise<number> {
    if (!isPgEnabled()) return 0
    const db = getDb()
    const list = await db
      .select()
      .from(gfComentario)
      .where(and(eq(gfComentario.grupoId, grupoId), eq(gfComentario.resolvido, false)))
    return list.length
  }
}

let _instance: ComentarioService | null = null
export function getComentarioService(): ComentarioService {
  if (!_instance) _instance = new ComentarioService()
  return _instance
}
