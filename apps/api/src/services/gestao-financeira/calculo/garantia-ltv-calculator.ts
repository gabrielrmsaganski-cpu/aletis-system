// ============================================================
// GarantiaLtvCalculator — replica "14 - Garantias" da v2.0
// ============================================================
// Calcula LTV (Loan-to-Value) por garantia: razão saldo devedor /
// valor de mercado. Se LTV > 80% = stress; > 100% = sub-coleterizado.
// ============================================================
import type { GfGarantia, GfContratoDivida } from '../../../db/schema.js'
import type { ContratoSchedule } from './endividamento-calculator.js'

export interface GarantiaLtv {
  id: string
  descricao: string
  tipo: string
  matricula?: string | null
  valorMercado: number
  valorForcado: number
  saldoVinculado: number        // soma dos saldos dos contratos vinculados
  contratosCount: number
  saldoDispMercado: number      // = mercado - vinculado
  saldoDispForcado: number      // = forcado - vinculado
  ltvMercado: number             // = vinculado / mercado
  ltvForcado: number             // = vinculado / forcado
  status: 'liberada' | 'comprometida' | 'stress' | 'subcoleterizada'
}

export interface GarantiaLtvConsolidado {
  totalValorMercado: number
  totalValorForcado: number
  totalSaldoVinculado: number
  ltvMercadoMedio: number
  ltvForcadoMedio: number
  saldoDisponivelTotalMercado: number
  saldoDisponivelTotalForcado: number
  garantias: GarantiaLtv[]
  alertas: Array<{ garantiaId: string; tipo: string; mensagem: string }>
}

function n(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  const x = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(x) ? x : 0
}

function statusLtv(ltv: number): GarantiaLtv['status'] {
  if (ltv >= 1.0) return 'subcoleterizada'
  if (ltv >= 0.8) return 'stress'
  if (ltv >= 0.5) return 'comprometida'
  return 'liberada'
}

export function computeGarantiasLtv(input: {
  garantias: GfGarantia[]
  contratos: GfContratoDivida[]
  schedules: ContratoSchedule[]
}): GarantiaLtvConsolidado {
  const { garantias, contratos, schedules } = input
  const scheduleMap = new Map<string, ContratoSchedule>()
  for (const s of schedules) scheduleMap.set(s.contratoId, s)

  const result: GarantiaLtv[] = []
  const alertas: GarantiaLtvConsolidado['alertas'] = []
  let totalMerc = 0
  let totalForc = 0
  let totalVinc = 0

  for (const g of garantias) {
    const valorMercado = n(g.valorMercado)
    const valorForcado = n(g.valorForcado)
    const idsContratos = (g.contratoVinculado ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    let saldoVinculado = 0
    let contratosCount = 0
    for (const cid of idsContratos) {
      const sched = scheduleMap.get(cid)
      if (sched) {
        saldoVinculado += sched.saldoAtual
        contratosCount += 1
      }
    }
    // Fallback: se não há vínculo explícito, tenta match por matrícula no campo garantiaVinculada
    if (saldoVinculado === 0 && g.matricula) {
      for (const c of contratos) {
        if ((c.garantiaVinculada ?? '').includes(g.matricula)) {
          const sched = scheduleMap.get(c.id)
          if (sched) {
            saldoVinculado += sched.saldoAtual
            contratosCount += 1
          }
        }
      }
    }

    const saldoDispMercado = valorMercado - saldoVinculado
    const saldoDispForcado = valorForcado - saldoVinculado
    const ltvMercado = valorMercado > 0 ? saldoVinculado / valorMercado : 0
    const ltvForcado = valorForcado > 0 ? saldoVinculado / valorForcado : 0
    const status = statusLtv(ltvMercado)

    if (status === 'subcoleterizada') {
      alertas.push({
        garantiaId: g.id,
        tipo: 'subcoleterizada',
        mensagem: `Garantia "${g.descricao}" tem LTV ${(ltvMercado * 100).toFixed(0)}% — subcoleterizada (saldo > valor)`,
      })
    } else if (status === 'stress') {
      alertas.push({
        garantiaId: g.id,
        tipo: 'stress',
        mensagem: `Garantia "${g.descricao}" em stress: LTV ${(ltvMercado * 100).toFixed(0)}%`,
      })
    }

    totalMerc += valorMercado
    totalForc += valorForcado
    totalVinc += saldoVinculado

    result.push({
      id: g.id,
      descricao: g.descricao,
      tipo: g.tipo,
      matricula: g.matricula,
      valorMercado,
      valorForcado,
      saldoVinculado,
      contratosCount,
      saldoDispMercado,
      saldoDispForcado,
      ltvMercado,
      ltvForcado,
      status,
    })
  }

  return {
    totalValorMercado: totalMerc,
    totalValorForcado: totalForc,
    totalSaldoVinculado: totalVinc,
    ltvMercadoMedio: totalMerc > 0 ? totalVinc / totalMerc : 0,
    ltvForcadoMedio: totalForc > 0 ? totalVinc / totalForc : 0,
    saldoDisponivelTotalMercado: totalMerc - totalVinc,
    saldoDisponivelTotalForcado: totalForc - totalVinc,
    garantias: result,
    alertas,
  }
}
