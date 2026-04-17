import type { CnpjEnrichment, AreaEstimation, LeadRaw } from './types'
import { isAgroCnae } from './BrasilAPISource'

/**
 * Estima a área rural do lead em hectares — dado que o PGFN não fornece isso
 * diretamente e que o SICAR/INCRA não oferecem API pública sem captcha.
 *
 * Estratégia composta (proxies):
 *  1. **Nome**: padrões como "FAZENDA X LTDA" ou "AGROPECUARIA Y" sugerem
 *     posse de grande área. Nomes genéricos (FAZENDA pequena) recebem piso.
 *  2. **Capital social** (PJ): agropecuárias com capital > R$ 5M geralmente
 *     possuem >1000 ha; modelo linear com teto e piso.
 *  3. **CNAE**: CNAE principal em 01.xx confirma produção rural primária.
 *  4. **Valor da dívida**: dívidas > R$ 10M em FGTS/Previdenciário indicam
 *     folha de pagamento alta, proxy de operação agrícola extensa.
 *
 * Este estimador é conservador — confidence alta apenas quando múltiplos
 * sinais convergem. O valor retornado alimenta o filtro "min. hectares".
 */
export class AreaEstimator {
  estimate(lead: LeadRaw, cnpj: CnpjEnrichment | null): AreaEstimation {
    const signals: Array<{ ha: number; motivo: string; peso: number }> = []

    // (1) Padrões no nome
    const nome = lead.nome.toUpperCase()
    if (/\bFAZENDA\b/.test(nome) && /(S\.?A\.?|LTDA|AGROPECU)/.test(nome)) {
      signals.push({ ha: 2500, motivo: 'Nome contém "FAZENDA" + estrutura PJ formal', peso: 0.4 })
    } else if (/\bFAZENDAS?\b/.test(nome)) {
      signals.push({ ha: 1200, motivo: 'Nome contém "FAZENDA"', peso: 0.3 })
    }
    if (/\bAGROPECU[AÁ]RIA\b/.test(nome)) {
      signals.push({ ha: 1800, motivo: 'Razão social "AGROPECUARIA"', peso: 0.35 })
    }
    if (/\bAGRICOLA\b|\bAGR[IÍ]COLA\b/.test(nome) && lead.tipoPessoa === 'PJ') {
      signals.push({ ha: 2200, motivo: 'Razão social "AGRICOLA" (PJ)', peso: 0.35 })
    }
    if (/\bSOJA\b|\bGR[AÃ]OS\b|\bCEREALISTA\b/.test(nome)) {
      signals.push({ ha: 3000, motivo: 'Especialização em grãos/commodities', peso: 0.4 })
    }
    if (/\bPECU[AÁ]RIA\b|\bGADO\b/.test(nome)) {
      signals.push({ ha: 1500, motivo: 'Atividade pecuária', peso: 0.3 })
    }
    if (/\bAGROINDUSTRI/.test(nome)) {
      signals.push({ ha: 5000, motivo: 'Agroindustrial — escala grande', peso: 0.45 })
    }
    if (/\bS[IÍ]TIO\b|\bCHACARA\b/.test(nome)) {
      signals.push({ ha: 80, motivo: 'Nome sugere pequena propriedade', peso: 0.4 })
    }

    // (2) Capital social
    if (cnpj && cnpj.capitalSocial > 0) {
      const cap = cnpj.capitalSocial
      // Heurística: ~1 ha por R$ 3.000 de capital, com teto
      let ha = 0
      let motivo = ''
      if (cap >= 100_000_000) {
        ha = 30_000
        motivo = `Capital R$ ${(cap / 1e6).toFixed(1)}M — operação muito grande`
      } else if (cap >= 10_000_000) {
        ha = 10_000
        motivo = `Capital R$ ${(cap / 1e6).toFixed(1)}M — operação grande`
      } else if (cap >= 1_000_000) {
        ha = 3_000
        motivo = `Capital R$ ${(cap / 1e6).toFixed(2)}M — operação média`
      } else if (cap >= 100_000) {
        ha = 800
        motivo = `Capital R$ ${(cap / 1e3).toFixed(0)}k`
      } else if (cap >= 10_000) {
        ha = 150
        motivo = `Capital baixo R$ ${cap}`
      }
      if (ha > 0) signals.push({ ha, motivo, peso: 0.5 })
    }

    // (3) CNAE
    if (cnpj && isAgroCnae(cnpj.cnaeFiscal)) {
      signals.push({ ha: 800, motivo: `CNAE ${cnpj.cnaeFiscal} — produção rural primária`, peso: 0.25 })
    }

    // (4) Dívida FGTS/Previdenciário — proxy de folha
    const dividaMi = lead.totalDivida / 1_000_000
    if (dividaMi >= 100) {
      signals.push({ ha: 15_000, motivo: `Dívida R$ ${dividaMi.toFixed(1)}M — operação massiva`, peso: 0.4 })
    } else if (dividaMi >= 10) {
      signals.push({ ha: 3_500, motivo: `Dívida R$ ${dividaMi.toFixed(1)}M — folha alta`, peso: 0.3 })
    } else if (dividaMi >= 1) {
      signals.push({ ha: 800, motivo: `Dívida R$ ${dividaMi.toFixed(2)}M`, peso: 0.2 })
    }

    if (signals.length === 0) {
      return {
        hectaresEstimados: 0,
        confidence: 'baixa',
        metodo: 'tipo-pessoa',
        explicacao: 'Sem sinais suficientes para estimar área',
      }
    }

    // Média ponderada
    const total = signals.reduce((s, x) => s + x.ha * x.peso, 0)
    const wSum = signals.reduce((s, x) => s + x.peso, 0)
    const ha = Math.round(total / wSum)

    // Confiança: alta se ≥3 sinais e lead é PJ com CNAE agro
    let confidence: AreaEstimation['confidence']
    if (signals.length >= 3 && cnpj && isAgroCnae(cnpj.cnaeFiscal)) confidence = 'alta'
    else if (signals.length >= 2) confidence = 'media'
    else confidence = 'baixa'

    const metodo: AreaEstimation['metodo'] =
      signals.length >= 3 ? 'composto' : cnpj ? 'capital-social' : 'razao-social'

    return {
      hectaresEstimados: ha,
      confidence,
      metodo,
      explicacao: signals.map((s) => `• ${s.motivo} (~${s.ha.toLocaleString('pt-BR')} ha)`).join('\n'),
    }
  }
}
