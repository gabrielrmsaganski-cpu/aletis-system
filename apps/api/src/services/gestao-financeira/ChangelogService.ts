// ============================================================
// ChangelogService — log auditável das mudanças no grupo
// ============================================================
import { eq, desc } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { gfChangelog, type GfChangelog } from '../../db/schema.js'
import { publish } from './GfEventBus.js'
import type { GestaoFinanceiraDb } from './GestaoFinanceiraDb.js'

export interface RegistrarMudancaInput {
  grupoId: string
  entidade: string
  entidadeId?: string
  acao: 'create' | 'update' | 'delete'
  antes?: Record<string, any>
  depois?: Record<string, any>
  ator?: string
  atorNome?: string
  origem?: 'ui' | 'api' | 'import' | 'webhook' | 'cron'
  traceId?: string
}

/** Calcula diff campo a campo entre antes/depois. */
function calcularDiff(antes: Record<string, any> | undefined, depois: Record<string, any> | undefined): Record<string, { antes: any; depois: any }> {
  const out: Record<string, { antes: any; depois: any }> = {}
  const keys = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})])
  for (const k of keys) {
    if (k === 'criadoEm' || k === 'atualizadoEm' || k === 'id') continue
    const a = antes?.[k]
    const d = depois?.[k]
    if (JSON.stringify(a) !== JSON.stringify(d)) {
      out[k] = { antes: a ?? null, depois: d ?? null }
    }
  }
  return out
}

export class ChangelogService {
  constructor(private readonly options: {
    db?: GestaoFinanceiraDb
    strict?: boolean
    publishEvents?: boolean
    origem?: RegistrarMudancaInput['origem']
  } = {}) {}

  async registrar(input: RegistrarMudancaInput): Promise<void> {
    if (!this.options.db && !isPgEnabled()) return
    const db = this.options.db ?? getDb()
    const diff = calcularDiff(input.antes, input.depois)
    if (input.acao === 'update' && Object.keys(diff).length === 0) return // nada mudou
    try {
      await db.insert(gfChangelog).values({
        grupoId: input.grupoId,
        entidade: input.entidade,
        entidadeId: input.entidadeId ?? null,
        acao: input.acao,
        diff: diff as any,
        ator: input.ator ?? 'consultor',
        atorNome: input.atorNome ?? null,
        origem: input.origem ?? this.options.origem ?? 'api',
        traceId: input.traceId ?? null,
      })
      // Broadcast SSE
      try {
        if (this.options.publishEvents === false) return
        publish('changelog', input.grupoId, {
          entidade: input.entidade,
          entidadeId: input.entidadeId,
          acao: input.acao,
          diff,
          ator: input.atorNome ?? input.ator,
          origem: input.origem,
        })
      } catch {}
    } catch (error) {
      if (this.options.strict) throw error
      // best-effort
    }
  }

  async listarPorGrupo(grupoId: string, limit = 100): Promise<GfChangelog[]> {
    if (!this.options.db && !isPgEnabled()) return []
    return (this.options.db ?? getDb())
      .select()
      .from(gfChangelog)
      .where(eq(gfChangelog.grupoId, grupoId))
      .orderBy(desc(gfChangelog.criadoEm))
      .limit(limit)
  }

  async stats(grupoId: string): Promise<{
    total: number
    porEntidade: Record<string, number>
    porAcao: Record<string, number>
    ultimaAlteracao?: string
  }> {
    const list = await this.listarPorGrupo(grupoId, 500)
    const porEntidade: Record<string, number> = {}
    const porAcao: Record<string, number> = {}
    for (const c of list) {
      porEntidade[c.entidade] = (porEntidade[c.entidade] ?? 0) + 1
      porAcao[c.acao] = (porAcao[c.acao] ?? 0) + 1
    }
    return {
      total: list.length,
      porEntidade,
      porAcao,
      ultimaAlteracao: list[0]?.criadoEm.toISOString(),
    }
  }
}

let _instance: ChangelogService | null = null
export function getChangelogService(): ChangelogService {
  if (!_instance) _instance = new ChangelogService()
  return _instance
}
