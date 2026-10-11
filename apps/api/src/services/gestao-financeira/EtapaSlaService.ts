// ============================================================
// EtapaSlaService — gestão das 7 etapas do checklist de rotina
// (R.OP.009) com prazos SLA e cálculo de atrasos.
// ============================================================
import { eq, and, asc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { getDb, isPgEnabled } from '../../db/client.js'
import { gfEtapaSla, type GfEtapaSla } from '../../db/schema.js'

interface EtapaTemplate {
  codigo: string
  ordem: number
  tarefa: string
  prazoDias: number
}

/** Template das 7 etapas R.OP.009 com SLAs. */
const ETAPAS_DEFAULT: EtapaTemplate[] = [
  // Etapa 1 - Elegibilidade Inicial
  { codigo: 'elegibilidade', ordem: 1, tarefa: 'Entrevista inicial', prazoDias: 2 },
  { codigo: 'elegibilidade', ordem: 2, tarefa: 'Avaliação de critérios', prazoDias: 1 },
  { codigo: 'elegibilidade', ordem: 3, tarefa: 'Reunião de diagnóstico', prazoDias: 3 },
  // Etapa 2 - Mandato
  { codigo: 'mandato', ordem: 4, tarefa: 'Coleta de documentos iniciais', prazoDias: 2 },
  { codigo: 'mandato', ordem: 5, tarefa: 'Mandato assinado', prazoDias: 2 },
  { codigo: 'mandato', ordem: 6, tarefa: 'Recebimento do mandato', prazoDias: 2 },
  // Etapa 3 - Diagnóstico
  { codigo: 'diagnostico', ordem: 7, tarefa: 'Diagnóstico R$ 3 mil pago', prazoDias: 1 },
  { codigo: 'diagnostico', ordem: 8, tarefa: 'AgRisk após mandato', prazoDias: 2 },
  // Etapa 4 - Documentos
  { codigo: 'documentos', ordem: 9, tarefa: 'Checklist inicial enviado', prazoDias: 2 },
  { codigo: 'documentos', ordem: 10, tarefa: 'Retorno do cliente', prazoDias: 2 },
  { codigo: 'documentos', ordem: 11, tarefa: 'Conferência interna', prazoDias: 5 },
  { codigo: 'documentos', ordem: 12, tarefa: 'Checklist 2 enviado pós-conferência', prazoDias: 2 },
  // Etapa 5 - Análise
  { codigo: 'analise', ordem: 13, tarefa: 'Análise interna — Banco interno + Histórico', prazoDias: 7 },
  // Etapa 6 - Comitê
  { codigo: 'comite', ordem: 14, tarefa: 'Comitê interno de crédito', prazoDias: 7 },
  // Etapa 7 - Envio à IF
  { codigo: 'envio_if', ordem: 15, tarefa: 'Quadro Safra para IF', prazoDias: 5 },
  { codigo: 'envio_if', ordem: 16, tarefa: 'Kit Banco montado', prazoDias: 2 },
  { codigo: 'envio_if', ordem: 17, tarefa: 'Aguardar IF', prazoDias: 12 },
]

const ETAPA_META: Record<string, { rotulo: string; cor: string; ordem: number }> = {
  elegibilidade: { rotulo: 'Elegibilidade Inicial', cor: '#5A8A6E', ordem: 1 },
  mandato: { rotulo: 'Mandato', cor: '#17251b', ordem: 2 },
  diagnostico: { rotulo: 'Diagnóstico', cor: '#7B5B30', ordem: 3 },
  documentos: { rotulo: 'Documentos Cliente', cor: '#e3bd80', ordem: 4 },
  analise: { rotulo: 'Análise Interna', cor: '#4F46E5', ordem: 5 },
  comite: { rotulo: 'Comitê', cor: '#A855F7', ordem: 6 },
  envio_if: { rotulo: 'Envio à IF', cor: '#0EA5E9', ordem: 7 },
}

export interface EtapaComputed extends GfEtapaSla {
  atrasoDias: number
  prazoLimite: string | null
  pctTempoConsumido: number
  diasRestantes: number | null
}

export interface KanbanColuna {
  codigo: string
  rotulo: string
  cor: string
  ordem: number
  total: number
  concluidas: number
  emAndamento: number
  pendentes: number
  atrasadas: number
  bloqueadas: number
  etapas: EtapaComputed[]
}

export interface KanbanOutput {
  grupoId: string
  totalEtapas: number
  totalConcluidas: number
  totalAtrasadas: number
  totalBloqueadas: number
  pctConcluido: number
  proximaPendente: EtapaComputed | null
  colunas: KanbanColuna[]
}

function id(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

function diasUteisEntre(d1: Date, d2: Date): number {
  // simplificação: dias corridos. Em produção usar feriados BR.
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

function adicionarDiasUteis(d: Date, dias: number): Date {
  const out = new Date(d.getTime())
  out.setDate(out.getDate() + dias)
  return out
}

function computeEtapa(e: GfEtapaSla, hoje = new Date()): EtapaComputed {
  let prazoLimite: string | null = null
  let atrasoDias = 0
  let pctTempoConsumido = 0
  let diasRestantes: number | null = null

  if (e.iniciadaEm) {
    const inicio = new Date(e.iniciadaEm)
    const limite = adicionarDiasUteis(inicio, e.prazoDias)
    prazoLimite = limite.toISOString().slice(0, 10)
    if (e.status === 'concluida' && e.concluidaEm) {
      const concl = new Date(e.concluidaEm)
      atrasoDias = Math.max(0, diasUteisEntre(limite, concl))
      pctTempoConsumido = Math.min(100, (diasUteisEntre(inicio, concl) / e.prazoDias) * 100)
    } else if (e.status === 'em_andamento') {
      const transcorridos = diasUteisEntre(inicio, hoje)
      pctTempoConsumido = Math.min(100, (transcorridos / e.prazoDias) * 100)
      diasRestantes = e.prazoDias - transcorridos
      if (diasRestantes < 0) atrasoDias = Math.abs(diasRestantes)
    }
  }

  return {
    ...e,
    atrasoDias,
    prazoLimite,
    pctTempoConsumido,
    diasRestantes,
  }
}

export class EtapaSlaService {
  /** Cria as 17 etapas default para um grupo. Idempotente — pula se já existem. */
  async semearEtapas(grupoId: string): Promise<{ inseridas: number; existentes: number }> {
    if (!isPgEnabled()) return { inseridas: 0, existentes: 0 }
    const db = getDb()
    const existentes = await db
      .select()
      .from(gfEtapaSla)
      .where(eq(gfEtapaSla.grupoId, grupoId))
    if (existentes.length > 0) return { inseridas: 0, existentes: existentes.length }

    let inseridas = 0
    for (const tpl of ETAPAS_DEFAULT) {
      try {
        await db.insert(gfEtapaSla).values({
          id: id('etp'),
          grupoId,
          etapaCodigo: tpl.codigo,
          etapaOrdem: tpl.ordem,
          tarefa: tpl.tarefa,
          prazoDias: tpl.prazoDias,
          status: 'pendente',
          ordem: tpl.ordem,
        })
        inseridas++
      } catch {
        // ignora
      }
    }
    return { inseridas, existentes: 0 }
  }

  async listarEtapas(grupoId: string): Promise<GfEtapaSla[]> {
    if (!isPgEnabled()) return []
    return getDb().select().from(gfEtapaSla).where(eq(gfEtapaSla.grupoId, grupoId)).orderBy(asc(gfEtapaSla.etapaOrdem))
  }

  async upsertEtapa(input: Partial<GfEtapaSla> & { grupoId: string }): Promise<GfEtapaSla> {
    const db = getDb()
    if (input.id) {
      const set: any = { atualizadoEm: new Date() }
      const fields = ['tarefa', 'prazoDias', 'status', 'responsavel', 'iniciadaEm', 'concluidaEm', 'observacoes', 'bloqueioMotivo'] as const
      for (const f of fields) if ((input as any)[f] !== undefined) set[f] = (input as any)[f]
      // Auto-set iniciadaEm quando passa a "em_andamento" e ainda não tem data
      if (input.status === 'em_andamento' && set.iniciadaEm === undefined) {
        const cur = (await db.select().from(gfEtapaSla).where(eq(gfEtapaSla.id, input.id)).limit(1))[0]
        if (cur && !cur.iniciadaEm) set.iniciadaEm = new Date().toISOString().slice(0, 10)
      }
      // Auto-set concluidaEm quando passa a "concluida"
      if (input.status === 'concluida' && set.concluidaEm === undefined) {
        set.concluidaEm = new Date().toISOString().slice(0, 10)
      }
      await db.update(gfEtapaSla).set(set).where(eq(gfEtapaSla.id, input.id))
      const r = await db.select().from(gfEtapaSla).where(eq(gfEtapaSla.id, input.id)).limit(1)
      return r[0]
    }
    const novo = {
      id: id('etp'),
      grupoId: input.grupoId,
      etapaCodigo: input.etapaCodigo ?? 'elegibilidade',
      etapaOrdem: input.etapaOrdem ?? 0,
      tarefa: input.tarefa ?? 'Nova tarefa',
      prazoDias: input.prazoDias ?? 1,
      status: input.status ?? 'pendente',
      responsavel: input.responsavel ?? null,
      iniciadaEm: input.iniciadaEm ?? null,
      concluidaEm: input.concluidaEm ?? null,
      observacoes: input.observacoes ?? null,
      bloqueioMotivo: input.bloqueioMotivo ?? null,
      ordem: input.ordem ?? 0,
    }
    await db.insert(gfEtapaSla).values(novo)
    const r = await db.select().from(gfEtapaSla).where(eq(gfEtapaSla.id, novo.id)).limit(1)
    return r[0]
  }

  async deletarEtapa(id: string): Promise<void> {
    if (!isPgEnabled()) return
    await getDb().delete(gfEtapaSla).where(eq(gfEtapaSla.id, id))
  }

  async getKanban(grupoId: string): Promise<KanbanOutput> {
    const etapas = await this.listarEtapas(grupoId)
    const computed = etapas.map((e) => computeEtapa(e))

    const colunas: KanbanColuna[] = []
    for (const codigo of Object.keys(ETAPA_META)) {
      const meta = ETAPA_META[codigo]
      const filtradas = computed.filter((e) => e.etapaCodigo === codigo)
      colunas.push({
        codigo,
        rotulo: meta.rotulo,
        cor: meta.cor,
        ordem: meta.ordem,
        total: filtradas.length,
        concluidas: filtradas.filter((e) => e.status === 'concluida').length,
        emAndamento: filtradas.filter((e) => e.status === 'em_andamento').length,
        pendentes: filtradas.filter((e) => e.status === 'pendente').length,
        atrasadas: filtradas.filter((e) => e.atrasoDias > 0 && e.status !== 'concluida').length,
        bloqueadas: filtradas.filter((e) => e.status === 'bloqueada').length,
        etapas: filtradas,
      })
    }
    colunas.sort((a, b) => a.ordem - b.ordem)

    const total = computed.length
    const concluidas = computed.filter((e) => e.status === 'concluida').length
    const atrasadas = computed.filter((e) => e.atrasoDias > 0 && e.status !== 'concluida').length
    const bloqueadas = computed.filter((e) => e.status === 'bloqueada').length
    const proxima = computed.find((e) => e.status === 'pendente') ?? null

    return {
      grupoId,
      totalEtapas: total,
      totalConcluidas: concluidas,
      totalAtrasadas: atrasadas,
      totalBloqueadas: bloqueadas,
      pctConcluido: total > 0 ? (concluidas / total) * 100 : 0,
      proximaPendente: proxima,
      colunas,
    }
  }
}

let _instance: EtapaSlaService | null = null
export function getEtapaSlaService(): EtapaSlaService {
  if (!_instance) _instance = new EtapaSlaService()
  return _instance
}
