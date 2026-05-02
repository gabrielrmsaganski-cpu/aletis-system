// ============================================================
// CronGestaoFinanceira — job que roda 1x/dia recalcula dashboard
// de cada grupo ativo, persiste insights e detecta mudanças
// críticas vs snapshot anterior (alerta de variação).
// ============================================================
import { getDb, isPgEnabled } from '../../db/client.js'
import { gfGrupo, gfSnapshotCalculo, gfChangelog } from '../../db/schema.js'
import { desc, eq } from 'drizzle-orm'
import { getGestaoFinanceiraServiceV2 } from './GestaoFinanceiraServiceV2.js'

const HORA_EXEC = parseInt(process.env.GF_CRON_HORA ?? '6', 10)  // default 06h

/** Diferença percentual entre dois números, segura para zero. */
function pctDelta(a: number, b: number): number {
  if (Math.abs(a) < 0.0001) return b !== 0 ? 100 : 0
  return ((b - a) / Math.abs(a)) * 100
}

export interface CronResultado {
  totalGrupos: number
  processados: number
  alertasGerados: number
  erros: number
  duracaoMs: number
}

let _timer: NodeJS.Timeout | null = null
let _lastRun: Date | null = null
let _lastResult: CronResultado | null = null

export function startCronGestaoFinanceira(): void {
  if (_timer) return
  // Calcula próximo agendamento
  const agora = new Date()
  const proxima = new Date()
  proxima.setHours(HORA_EXEC, 0, 0, 0)
  if (proxima <= agora) proxima.setDate(proxima.getDate() + 1)
  const ms = proxima.getTime() - agora.getTime()

  _timer = setTimeout(async () => {
    await executarCron()
    // re-agenda 24h depois
    setInterval(() => executarCron(), 24 * 60 * 60 * 1000).unref()
  }, ms)
  _timer.unref?.()

  console.log(`[gf-cron] agendado para ${proxima.toISOString()} (em ${Math.round(ms / 60000)} min)`)
}

export function stopCronGestaoFinanceira(): void {
  if (_timer) {
    clearTimeout(_timer)
    _timer = null
  }
}

export function getCronStatus() {
  return { lastRun: _lastRun?.toISOString() ?? null, lastResult: _lastResult }
}

/** Executa cron manualmente (também chamado pelo scheduler). */
export async function executarCron(): Promise<CronResultado> {
  const inicio = Date.now()
  const resultado: CronResultado = {
    totalGrupos: 0,
    processados: 0,
    alertasGerados: 0,
    erros: 0,
    duracaoMs: 0,
  }
  if (!isPgEnabled()) {
    resultado.duracaoMs = Date.now() - inicio
    _lastRun = new Date()
    _lastResult = resultado
    return resultado
  }

  const db = getDb()
  const svcV2 = getGestaoFinanceiraServiceV2()

  // Busca todos os grupos
  const grupos = await db.select().from(gfGrupo)
  resultado.totalGrupos = grupos.length

  for (const grupo of grupos) {
    try {
      // Pega snapshot anterior (mais recente)
      const ultimosSnapshots = await db
        .select()
        .from(gfSnapshotCalculo)
        .where(eq(gfSnapshotCalculo.grupoId, grupo.id))
        .orderBy(desc(gfSnapshotCalculo.calculadoEm))
        .limit(1)
      const ultimoSnap = ultimosSnapshots[0]

      // Calcula dashboard atual + persiste novo snapshot
      const dash = await svcV2.calcularDashboard360(grupo.id, { persistir: true })

      // Detecta variações críticas vs snapshot anterior
      if (ultimoSnap && ultimoSnap.payload) {
        const oldPayload = ultimoSnap.payload as any
        const oldKpis = oldPayload?.raioX?.indicadores ?? {}
        const newKpis = dash.raioX.indicadores

        const alertas: string[] = []
        const dEbitda = pctDelta(oldKpis.ebitdaTotal ?? 0, newKpis.ebitdaTotal)
        const dDivida = pctDelta(oldKpis.diviPorEbitda ?? 0, newKpis.diviPorEbitda)
        const dMargem = (newKpis.margemEbitda - (oldKpis.margemEbitda ?? 0)) * 100

        if (Math.abs(dEbitda) > 20) alertas.push(`EBITDA variou ${dEbitda > 0 ? '+' : ''}${dEbitda.toFixed(1)}% vs último snapshot`)
        if (Math.abs(dDivida) > 30) alertas.push(`Dívida/EBITDA variou ${dDivida > 0 ? '+' : ''}${dDivida.toFixed(1)}%`)
        if (Math.abs(dMargem) > 5) alertas.push(`Margem EBITDA variou ${dMargem > 0 ? '+' : ''}${dMargem.toFixed(1)}pp`)

        // Registra no changelog
        if (alertas.length > 0) {
          await db.insert(gfChangelog).values({
            grupoId: grupo.id,
            entidade: 'grupo',
            entidadeId: grupo.id,
            acao: 'update',
            diff: { variacoesDiarias: alertas } as any,
            ator: 'sistema',
            atorNome: 'Cron diário',
            origem: 'cron',
          })
          resultado.alertasGerados += alertas.length
        }
      }

      resultado.processados += 1
    } catch (e) {
      resultado.erros += 1
      console.warn(`[gf-cron] erro grupo ${grupo.id}:`, (e as any)?.message)
    }
  }

  resultado.duracaoMs = Date.now() - inicio
  _lastRun = new Date()
  _lastResult = resultado
  console.log(`[gf-cron] concluído: ${resultado.processados}/${resultado.totalGrupos} grupos, ${resultado.alertasGerados} alertas, ${resultado.erros} erros, ${resultado.duracaoMs}ms`)
  return resultado
}
