import { REGRAS } from './rules/index.js'
import type { AdvisorContext, AdvisorRule, Prioridade, Recommendation } from './types.js'

/**
 * SmartAdvisor — avalia todas as regras declarativas contra um snapshot
 * (`AnaliseCliente`) e devolve a lista ordenada de recomendações.
 *
 * A ordenação é por prioridade (p1 > p2 > p3); empates preservam ordem
 * estável do registro. Regras que lançam exceção são ignoradas (best-effort),
 * para que uma regra mal formada não tire o advisor do ar.
 */
export class SmartAdvisor {
  constructor(private readonly regras: AdvisorRule[] = REGRAS) {}

  evaluate(ctx: AdvisorContext): Recommendation[] {
    const out: Recommendation[] = []
    for (const rule of this.regras) {
      try {
        const rec = rule.evaluate(ctx)
        if (rec) out.push(rec)
      } catch (err) {
        console.warn(`[SmartAdvisor] regra ${rule.id} falhou`, err)
      }
    }
    return ordenarPorPrioridade(out)
  }

  /** Lista metadata das regras registradas — útil para debugging e UI admin. */
  listarRegras(): Array<Pick<AdvisorRule, 'id' | 'titulo' | 'categoria' | 'prioridade'>> {
    return this.regras.map((r) => ({
      id: r.id,
      titulo: r.titulo,
      categoria: r.categoria,
      prioridade: r.prioridade,
    }))
  }
}

const ORDEM: Record<Prioridade, number> = { p1: 0, p2: 1, p3: 2 }

function ordenarPorPrioridade(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort((a, b) => ORDEM[a.prioridade] - ORDEM[b.prioridade])
}

let _instance: SmartAdvisor | null = null

export function getSmartAdvisor(): SmartAdvisor {
  if (!_instance) _instance = new SmartAdvisor()
  return _instance
}
