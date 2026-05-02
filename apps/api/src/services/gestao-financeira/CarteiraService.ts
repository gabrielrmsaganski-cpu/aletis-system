// ============================================================
// CarteiraService — visão consolidada da carteira do consultor
// (KPIs agregados, ranking, alertas críticos cruzados).
// ============================================================
import { eq } from 'drizzle-orm'
import { getDb, isPgEnabled } from '../../db/client.js'
import { gfGrupo } from '../../db/schema.js'
import { getGestaoFinanceiraServiceV2 } from './GestaoFinanceiraServiceV2.js'

export interface GrupoNaCarteira {
  grupoId: string
  nomeGrupo: string
  clienteId: string
  receitaProjetada: number
  ebitdaTotal: number
  margemEbitda: number
  dividaTotal: number
  diviPorEbitda: number
  ltvMedio: number
  insightsCriticos: number
  status: 'saudavel' | 'atencao' | 'critico'
  ultimaAtualizacao: string
}

export interface CarteiraOutput {
  consultorId?: string | null
  totalGrupos: number
  agregado: {
    receitaTotal: number
    ebitdaTotal: number
    dividaTotal: number
    margemEbitdaMedia: number
    diviPorEbitdaMedia: number
    insightsCriticosTotal: number
  }
  rankings: {
    melhorMargem: GrupoNaCarteira | null
    piorMargem: GrupoNaCarteira | null
    maisAlavancado: GrupoNaCarteira | null
    maiorReceita: GrupoNaCarteira | null
    maisCritico: GrupoNaCarteira | null
  }
  distribuicao: {
    saudavel: number
    atencao: number
    critico: number
  }
  grupos: GrupoNaCarteira[]
}

function classificarGrupo(g: GrupoNaCarteira): 'saudavel' | 'atencao' | 'critico' {
  if (g.insightsCriticos > 0 || g.diviPorEbitda > 5 || g.margemEbitda < 0.05) return 'critico'
  if (g.diviPorEbitda > 3 || g.margemEbitda < 0.15 || g.ltvMedio > 0.8) return 'atencao'
  return 'saudavel'
}

export class CarteiraService {
  async resumo(consultorId?: string): Promise<CarteiraOutput> {
    if (!isPgEnabled()) {
      return {
        consultorId: consultorId ?? null,
        totalGrupos: 0,
        agregado: { receitaTotal: 0, ebitdaTotal: 0, dividaTotal: 0, margemEbitdaMedia: 0, diviPorEbitdaMedia: 0, insightsCriticosTotal: 0 },
        rankings: { melhorMargem: null, piorMargem: null, maisAlavancado: null, maiorReceita: null, maisCritico: null },
        distribuicao: { saudavel: 0, atencao: 0, critico: 0 },
        grupos: [],
      }
    }

    const db = getDb()
    const svcV2 = getGestaoFinanceiraServiceV2()
    const grupos = consultorId
      ? await db.select().from(gfGrupo).where(eq(gfGrupo.consultorId, consultorId))
      : await db.select().from(gfGrupo)

    const out: GrupoNaCarteira[] = []
    for (const g of grupos) {
      try {
        const dash = await svcV2.calcularDashboard360(g.id)
        const i = dash.raioX.indicadores
        const item: GrupoNaCarteira = {
          grupoId: g.id,
          nomeGrupo: g.nomeGrupo,
          clienteId: g.clienteId,
          receitaProjetada: i.receitaTotal,
          ebitdaTotal: i.ebitdaTotal,
          margemEbitda: i.margemEbitda,
          dividaTotal: dash.endividamento.saldoTotalAtual,
          diviPorEbitda: i.diviPorEbitda,
          ltvMedio: dash.ltv.ltvMercadoMedio,
          insightsCriticos: dash.insights.filter((x: any) => x.severidade === 'critico').length,
          status: 'saudavel',
          ultimaAtualizacao: g.atualizadoEm.toISOString(),
        }
        item.status = classificarGrupo(item)
        out.push(item)
      } catch {
        // pula grupos com erro
      }
    }

    const agregado = {
      receitaTotal: out.reduce((a, g) => a + g.receitaProjetada, 0),
      ebitdaTotal: out.reduce((a, g) => a + g.ebitdaTotal, 0),
      dividaTotal: out.reduce((a, g) => a + g.dividaTotal, 0),
      margemEbitdaMedia: out.length > 0 ? out.reduce((a, g) => a + g.margemEbitda, 0) / out.length : 0,
      diviPorEbitdaMedia: out.length > 0 ? out.reduce((a, g) => a + g.diviPorEbitda, 0) / out.length : 0,
      insightsCriticosTotal: out.reduce((a, g) => a + g.insightsCriticos, 0),
    }

    const sorted = (k: keyof GrupoNaCarteira, asc = false) =>
      out.length === 0 ? null : [...out].sort((a, b) => asc ? (a[k] as number) - (b[k] as number) : (b[k] as number) - (a[k] as number))[0]

    const distribuicao = {
      saudavel: out.filter((g) => g.status === 'saudavel').length,
      atencao: out.filter((g) => g.status === 'atencao').length,
      critico: out.filter((g) => g.status === 'critico').length,
    }

    return {
      consultorId: consultorId ?? null,
      totalGrupos: out.length,
      agregado,
      rankings: {
        melhorMargem: sorted('margemEbitda'),
        piorMargem: sorted('margemEbitda', true),
        maisAlavancado: sorted('diviPorEbitda'),
        maiorReceita: sorted('receitaProjetada'),
        maisCritico: sorted('insightsCriticos'),
      },
      distribuicao,
      grupos: out.sort((a, b) => b.receitaProjetada - a.receitaProjetada),
    }
  }
}

let _instance: CarteiraService | null = null
export function getCarteiraService(): CarteiraService {
  if (!_instance) _instance = new CarteiraService()
  return _instance
}
