// ============================================================
// BenchmarkService — compara KPIs de 1 grupo vs média da carteira
// (do mesmo consultor) ou benchmarks setoriais agro.
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { gfGrupo } from '../../db/schema.js'
import { getGestaoFinanceiraServiceV2 } from './GestaoFinanceiraServiceV2.js'

export interface BenchmarkKpi {
  metrica: string
  rotulo: string
  unidade: string
  valor: number
  mediaCarteira: number
  medianaCarteira: number
  setorReferencia: number
  setorRotulo: string
  ranking: number      // 1 = melhor, N = pior
  totalCarteira: number
  classificacao: 'top' | 'media' | 'abaixo'
}

export interface BenchmarkOutput {
  grupoId: string
  grupoNome: string
  carteiraSize: number
  consultorId?: string | null
  kpis: BenchmarkKpi[]
}

/** Benchmarks setoriais (médias agro Brasil 2024-2025). */
const SETOR_REFS: Record<string, { valor: number; rotulo: string }> = {
  margem_ebitda: { valor: 0.30, rotulo: 'Setor agro saudável (25-40%)' },
  divida_ebitda: { valor: 3.0, rotulo: 'Limite bancário (3x)' },
  ltv_mercado: { valor: 0.5, rotulo: 'LTV liberada (<50%)' },
  fcl_medio: { valor: 0, rotulo: 'FCL positivo (>0)' },
  saldo_acumulado: { valor: 0, rotulo: 'Saldo acumulado positivo' },
  receita_por_ha: { valor: 8000, rotulo: 'Soja MT média (R$ 8.000/ha)' },
  margem_bruta: { valor: 0.30, rotulo: 'Margem bruta saudável (>30%)' },
}

function calcRanking(valores: number[], valor: number, descendente: boolean): number {
  const ordenados = [...valores].sort((a, b) => descendente ? b - a : a - b)
  return ordenados.indexOf(valor) + 1
}

function classificar(ranking: number, total: number): BenchmarkKpi['classificacao'] {
  if (total < 2) return 'media'
  const tercil = total / 3
  if (ranking <= tercil) return 'top'
  if (ranking <= 2 * tercil) return 'media'
  return 'abaixo'
}

function mediana(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export class BenchmarkService {
  async calcular(grupoId: string): Promise<BenchmarkOutput> {
    if (!isPgEnabled()) throw new Error('PG desabilitado')
    const db = getDb()
    const svcV2 = getGestaoFinanceiraServiceV2()

    // Carrega grupo alvo
    const target = await db.select().from(gfGrupo).where(eq(gfGrupo.id, grupoId)).limit(1)
    if (target.length === 0) throw new Error(`Grupo ${grupoId} não encontrado`)
    const grupoTarget = target[0]
    const consultorId = grupoTarget.consultorId

    // Lista carteira (mesmo consultor se houver, senão todos)
    const carteira = consultorId
      ? await db.select().from(gfGrupo).where(eq(gfGrupo.consultorId, consultorId))
      : await db.select().from(gfGrupo)

    // Calcula dashboard de cada grupo da carteira
    const dashboards: Array<{ id: string; nome: string; dash: any }> = []
    for (const g of carteira) {
      try {
        const d = await svcV2.calcularDashboard360(g.id)
        dashboards.push({ id: g.id, nome: g.nomeGrupo, dash: d })
      } catch {
        // pula grupos com erro
      }
    }

    const target_dash = dashboards.find((d) => d.id === grupoId)
    if (!target_dash) throw new Error('Falha ao calcular dashboard alvo')

    // Extrai métricas
    function extract(d: any) {
      const i = d.raioX.indicadores
      const safrasPlan = d.safras.filter((s: any) => s.cenario === 'planejado')
      const totalArea = safrasPlan.reduce((acc: number, s: any) => acc + (s.totalAreaHa ?? 0), 0)
      const totalReceitaPlan = safrasPlan.reduce((acc: number, s: any) => acc + (s.receitaTotal ?? 0), 0)
      const margemBruta = safrasPlan.length > 0
        ? safrasPlan.reduce((acc: number, s: any) => acc + (s.margemBruta ?? 0), 0) / safrasPlan.length
        : 0
      return {
        margem_ebitda: i.margemEbitda,
        divida_ebitda: i.diviPorEbitda,
        ltv_mercado: d.ltv.ltvMercadoMedio,
        fcl_medio: i.fclMedio,
        saldo_acumulado: i.saldoFinalAcumulado,
        receita_por_ha: totalArea > 0 ? totalReceitaPlan / totalArea : 0,
        margem_bruta: margemBruta,
      }
    }

    const targetMetrics = extract(target_dash.dash)
    const allMetrics = dashboards.map((d) => extract(d.dash))

    const kpis: BenchmarkKpi[] = []
    const definicoes: Array<{
      key: keyof typeof targetMetrics
      rotulo: string
      unidade: string
      maiorEhMelhor: boolean
    }> = [
      { key: 'margem_ebitda', rotulo: 'Margem EBITDA', unidade: '%', maiorEhMelhor: true },
      { key: 'divida_ebitda', rotulo: 'Dívida / EBITDA', unidade: 'x', maiorEhMelhor: false },
      { key: 'ltv_mercado', rotulo: 'LTV (Loan-to-Value)', unidade: '%', maiorEhMelhor: false },
      { key: 'fcl_medio', rotulo: 'FCL médio anual', unidade: 'R$', maiorEhMelhor: true },
      { key: 'saldo_acumulado', rotulo: 'Saldo acumulado 10a', unidade: 'R$', maiorEhMelhor: true },
      { key: 'receita_por_ha', rotulo: 'Receita por hectare', unidade: 'R$/ha', maiorEhMelhor: true },
      { key: 'margem_bruta', rotulo: 'Margem bruta', unidade: '%', maiorEhMelhor: true },
    ]

    for (const def of definicoes) {
      const valoresCarteira = allMetrics.map((m) => m[def.key]).filter((v) => isFinite(v))
      const media = valoresCarteira.length > 0 ? valoresCarteira.reduce((a, b) => a + b, 0) / valoresCarteira.length : 0
      const med = mediana(valoresCarteira)
      const valorAlvo = targetMetrics[def.key]
      const ranking = calcRanking(valoresCarteira, valorAlvo, def.maiorEhMelhor)
      const setorRef = SETOR_REFS[def.key]
      kpis.push({
        metrica: def.key,
        rotulo: def.rotulo,
        unidade: def.unidade,
        valor: valorAlvo,
        mediaCarteira: media,
        medianaCarteira: med,
        setorReferencia: setorRef.valor,
        setorRotulo: setorRef.rotulo,
        ranking,
        totalCarteira: valoresCarteira.length,
        classificacao: classificar(ranking, valoresCarteira.length),
      })
    }

    return {
      grupoId,
      grupoNome: grupoTarget.nomeGrupo,
      carteiraSize: dashboards.length,
      consultorId,
      kpis,
    }
  }
}

let _instance: BenchmarkService | null = null
export function getBenchmarkService(): BenchmarkService {
  if (!_instance) _instance = new BenchmarkService()
  return _instance
}
