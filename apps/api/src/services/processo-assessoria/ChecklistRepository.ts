// ============================================================
// ChecklistRepository — persistência dos checklists interativos
// (R.OP.003 / R.OP.004 / R.OP.005 / R.OP.009) por cliente × template.
// ============================================================
//
// Itens são armazenados em JSONB no formato:
// {
//   "<itemId>": {
//     marcado: boolean,
//     observacao?: string,
//     anexoId?: string,
//     atualizadoEm: string (ISO),
//   }
// }
// ============================================================
import { eq, and, sql } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { processoChecklist, type ProcessoChecklist } from '../../db/schema.js'
import { getProcessoTemplateBySlug, type ProcessoTemplate } from './manifest.js'

export interface ChecklistItemState {
  marcado?: boolean
  observacao?: string
  anexoId?: string
  atualizadoEm: string
}

export interface ChecklistState {
  clienteId: string
  templateSlug: string
  responsavel?: string | null
  itens: Record<string, ChecklistItemState>
  status: 'em_andamento' | 'concluido' | 'arquivado'
  totalItens: number
  itensConcluidos: number
  iniciadoEm: string
  atualizadoEm: string
  concluidoEm?: string | null
}

function rowToState(r: ProcessoChecklist): ChecklistState {
  const itens = (r.itens ?? {}) as Record<string, ChecklistItemState>
  return {
    clienteId: r.clienteId,
    templateSlug: r.templateSlug,
    responsavel: r.responsavel,
    itens,
    status: (r.status as ChecklistState['status']) ?? 'em_andamento',
    totalItens: r.totalItens ?? 0,
    itensConcluidos: r.itensConcluidos ?? 0,
    iniciadoEm: r.iniciadoEm.toISOString(),
    atualizadoEm: r.atualizadoEm.toISOString(),
    concluidoEm: r.concluidoEm?.toISOString() ?? null,
  }
}

function countConcluidos(items: Record<string, ChecklistItemState>): number {
  return Object.values(items).filter((it) => it && it.marcado).length
}

export class ChecklistRepository {
  /** Carrega o estado atual de um checklist; retorna null se nunca iniciado. */
  async get(clienteId: string, templateSlug: string): Promise<ChecklistState | null> {
    if (!isPgEnabled()) return null
    const db = getDb()
    const rows = await db
      .select()
      .from(processoChecklist)
      .where(
        and(
          eq(processoChecklist.clienteId, clienteId),
          eq(processoChecklist.templateSlug, templateSlug),
        ),
      )
      .limit(1)
    if (rows.length === 0) return null
    return rowToState(rows[0])
  }

  /** Lista todos os checklists do cliente. */
  async listByCliente(clienteId: string): Promise<ChecklistState[]> {
    if (!isPgEnabled()) return []
    const db = getDb()
    const rows = await db
      .select()
      .from(processoChecklist)
      .where(eq(processoChecklist.clienteId, clienteId))
    return rows.map(rowToState)
  }

  /**
   * Atualiza um item específico. Se o checklist nunca existiu, cria com totalItens
   * derivado do manifest.
   */
  async upsertItem(
    clienteId: string,
    templateSlug: string,
    itemId: string,
    state: Partial<Omit<ChecklistItemState, 'atualizadoEm'>>,
    opts?: { responsavel?: string },
  ): Promise<ChecklistState> {
    if (!isPgEnabled()) {
      throw new Error('Postgres não habilitado (ALETIS_PG_ENABLED=1)')
    }
    const tpl = getProcessoTemplateBySlug(templateSlug)
    if (!tpl) throw new Error(`Template "${templateSlug}" não existe`)
    if (!tpl.checklist) throw new Error(`Template "${templateSlug}" não tem checklist`)
    const validItem = tpl.checklist.find((c) => c.id === itemId)
    if (!validItem) throw new Error(`Item "${itemId}" não pertence ao checklist "${templateSlug}"`)

    const db = getDb()
    const current = await this.get(clienteId, templateSlug)
    const itens = { ...(current?.itens ?? {}) }
    const prev = itens[itemId] ?? { atualizadoEm: '' }
    itens[itemId] = {
      ...prev,
      ...state,
      atualizadoEm: new Date().toISOString(),
    }
    const totalItens = tpl.checklist.length
    const itensConcluidos = countConcluidos(itens)
    const status: ChecklistState['status'] =
      itensConcluidos >= totalItens ? 'concluido' : 'em_andamento'
    const concluidoEm = status === 'concluido' ? new Date() : null

    const responsavel = opts?.responsavel ?? current?.responsavel ?? null

    if (current) {
      await db
        .update(processoChecklist)
        .set({
          itens,
          totalItens,
          itensConcluidos,
          status,
          concluidoEm,
          atualizadoEm: new Date(),
          responsavel,
        })
        .where(
          and(
            eq(processoChecklist.clienteId, clienteId),
            eq(processoChecklist.templateSlug, templateSlug),
          ),
        )
    } else {
      await db.insert(processoChecklist).values({
        clienteId,
        templateSlug,
        itens,
        totalItens,
        itensConcluidos,
        status,
        concluidoEm,
        responsavel,
      })
    }
    return (await this.get(clienteId, templateSlug))!
  }

  /** Reset (apaga). Útil para testar UI. */
  async reset(clienteId: string, templateSlug: string): Promise<void> {
    if (!isPgEnabled()) return
    const db = getDb()
    await db
      .delete(processoChecklist)
      .where(
        and(
          eq(processoChecklist.clienteId, clienteId),
          eq(processoChecklist.templateSlug, templateSlug),
        ),
      )
  }

  /** Estatísticas globais para dashboard. */
  async stats(): Promise<{
    porTemplate: Array<{ templateSlug: string; total: number; concluidos: number; emAndamento: number }>
    totalChecklists: number
  }> {
    if (!isPgEnabled()) return { porTemplate: [], totalChecklists: 0 }
    const db = getDb()
    const rows = await db.execute(sql`
      SELECT template_slug,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status='concluido')::int AS concluidos,
             COUNT(*) FILTER (WHERE status='em_andamento')::int AS em_andamento
      FROM processo_checklist
      GROUP BY template_slug
    `)
    const list = (rows as any).rows ?? rows
    return {
      porTemplate: list.map((r: any) => ({
        templateSlug: r.template_slug,
        total: r.total,
        concluidos: r.concluidos,
        emAndamento: r.em_andamento,
      })),
      totalChecklists: list.reduce((acc: number, r: any) => acc + r.total, 0),
    }
  }
}

let _instance: ChecklistRepository | null = null
export function getChecklistRepository(): ChecklistRepository {
  if (!_instance) _instance = new ChecklistRepository()
  return _instance
}

/** Helper: retorna template com merge do estado atual (para UI). */
export async function getChecklistWithState(
  clienteId: string,
  templateSlug: string,
): Promise<{ template: ProcessoTemplate; state: ChecklistState | null } | null> {
  const tpl = getProcessoTemplateBySlug(templateSlug)
  if (!tpl) return null
  const state = await getChecklistRepository().get(clienteId, templateSlug)
  return { template: tpl, state }
}
