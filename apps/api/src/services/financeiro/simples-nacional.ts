/**
 * Tabelas do Simples Nacional — Anexos I a V (LC 123/2006, atualizada por LC 155/2016).
 *
 * Fórmula do DAS:
 *   alíquota efetiva = ((RBT12 * alíquotaNominal) - PD) / RBT12
 *   DAS = receita do mês * alíquota efetiva
 *
 * Consultoria/reestruturação de dívidas rurais = Anexo III
 * (atividades de consultoria = serviços profissionais).
 */

import type { CalculoDAS } from './types.js'

export type AnexoSimples = 'I' | 'II' | 'III' | 'IV' | 'V'

interface FaixaSimples {
  faixa: number
  receitaAte: number // RBT12 máximo da faixa
  aliquotaNominal: number // % nominal
  parcelaDeduzir: number // PD
  partilha: {
    irpj: number
    csll: number
    cofins: number
    pis: number
    cpp: number
    iss: number
    icms?: number
  }
}

/** Anexo III — Serviços profissionais (consultoria, escritório de contabilidade, etc). */
export const TABELA_ANEXO_III: FaixaSimples[] = [
  {
    faixa: 1,
    receitaAte: 180_000,
    aliquotaNominal: 6.0,
    parcelaDeduzir: 0,
    partilha: { irpj: 4.0, csll: 3.5, cofins: 12.82, pis: 2.78, cpp: 43.40, iss: 33.5 },
  },
  {
    faixa: 2,
    receitaAte: 360_000,
    aliquotaNominal: 11.2,
    parcelaDeduzir: 9_360,
    partilha: { irpj: 4.0, csll: 3.5, cofins: 14.05, pis: 3.05, cpp: 43.40, iss: 32.0 },
  },
  {
    faixa: 3,
    receitaAte: 720_000,
    aliquotaNominal: 13.5,
    parcelaDeduzir: 17_640,
    partilha: { irpj: 4.0, csll: 3.5, cofins: 13.64, pis: 2.96, cpp: 43.40, iss: 32.5 },
  },
  {
    faixa: 4,
    receitaAte: 1_800_000,
    aliquotaNominal: 16.0,
    parcelaDeduzir: 35_640,
    partilha: { irpj: 4.0, csll: 3.5, cofins: 13.64, pis: 2.96, cpp: 43.40, iss: 32.5 },
  },
  {
    faixa: 5,
    receitaAte: 3_600_000,
    aliquotaNominal: 21.0,
    parcelaDeduzir: 125_640,
    partilha: { irpj: 4.0, csll: 3.5, cofins: 12.82, pis: 2.78, cpp: 43.40, iss: 33.5 },
  },
  {
    faixa: 6,
    receitaAte: 4_800_000,
    aliquotaNominal: 33.0,
    parcelaDeduzir: 648_000,
    partilha: { irpj: 35.0, csll: 15.0, cofins: 16.03, pis: 3.47, cpp: 30.50, iss: 0 },
  },
]

/** Anexo I — Comércio. */
export const TABELA_ANEXO_I: FaixaSimples[] = [
  { faixa: 1, receitaAte: 180_000, aliquotaNominal: 4.0, parcelaDeduzir: 0, partilha: { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 41.5, iss: 0, icms: 34.0 } },
  { faixa: 2, receitaAte: 360_000, aliquotaNominal: 7.3, parcelaDeduzir: 5_940, partilha: { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 41.5, iss: 0, icms: 34.0 } },
  { faixa: 3, receitaAte: 720_000, aliquotaNominal: 9.5, parcelaDeduzir: 13_860, partilha: { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 42.0, iss: 0, icms: 33.5 } },
  { faixa: 4, receitaAte: 1_800_000, aliquotaNominal: 10.7, parcelaDeduzir: 22_500, partilha: { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 42.0, iss: 0, icms: 33.5 } },
  { faixa: 5, receitaAte: 3_600_000, aliquotaNominal: 14.3, parcelaDeduzir: 87_300, partilha: { irpj: 5.5, csll: 3.5, cofins: 12.74, pis: 2.76, cpp: 42.0, iss: 0, icms: 33.5 } },
  { faixa: 6, receitaAte: 4_800_000, aliquotaNominal: 19.0, parcelaDeduzir: 378_000, partilha: { irpj: 13.5, csll: 10.0, cofins: 28.27, pis: 6.13, cpp: 42.1, iss: 0 } },
]

export const TABELAS: Record<AnexoSimples, FaixaSimples[]> = {
  I: TABELA_ANEXO_I,
  II: TABELA_ANEXO_I, // indústria tem mesma estrutura mas alíquotas diferentes - simplificação
  III: TABELA_ANEXO_III,
  IV: TABELA_ANEXO_III, // alguns serviços
  V: TABELA_ANEXO_III, // alguns profissionais liberais
}

/**
 * Calcula o DAS do mês para uma receita específica no Simples Nacional.
 *
 * @param receitaMes Receita bruta do mês (competência) em R$.
 * @param rbt12 Receita bruta total dos últimos 12 meses em R$.
 * @param anexo Anexo da tabela Simples (default III — consultoria).
 * @param competencia YYYY-MM da competência.
 */
export function calcularDAS(
  receitaMes: number,
  rbt12: number,
  anexo: AnexoSimples = 'III',
  competencia?: string
): CalculoDAS {
  const tabela = TABELAS[anexo]
  const faixa = tabela.find((f) => rbt12 <= f.receitaAte) ?? tabela[tabela.length - 1]

  const aliquotaEfetiva = rbt12 > 0
    ? Math.max(0, ((rbt12 * faixa.aliquotaNominal) / 100 - faixa.parcelaDeduzir) / rbt12) * 100
    : faixa.aliquotaNominal

  const valorDAS = (receitaMes * aliquotaEfetiva) / 100

  const parts = faixa.partilha
  const detalhamentoPartilha = {
    irpj: Number(((valorDAS * parts.irpj) / 100).toFixed(2)),
    csll: Number(((valorDAS * parts.csll) / 100).toFixed(2)),
    cofins: Number(((valorDAS * parts.cofins) / 100).toFixed(2)),
    pis: Number(((valorDAS * parts.pis) / 100).toFixed(2)),
    cpp: Number(((valorDAS * parts.cpp) / 100).toFixed(2)),
    iss: Number(((valorDAS * parts.iss) / 100).toFixed(2)),
  }

  const comp = competencia ?? new Date().toISOString().slice(0, 7)
  const [ano, mes] = comp.split('-').map(Number)
  const proxMes = mes === 12 ? 1 : mes + 1
  const proxAno = mes === 12 ? ano + 1 : ano
  const vencimento = `${proxAno}-${String(proxMes).padStart(2, '0')}-20`

  const memoriaCalculo = `
DAS do Simples Nacional — Anexo ${anexo} — competência ${comp}

1. Receita bruta do mês: R$ ${receitaMes.toFixed(2)}
2. RBT12 (receita últimos 12 meses): R$ ${rbt12.toFixed(2)}
3. Faixa aplicável: ${faixa.faixa} (RBT12 ≤ R$ ${faixa.receitaAte.toLocaleString('pt-BR')})
4. Alíquota nominal da faixa: ${faixa.aliquotaNominal}%
5. Parcela a deduzir (PD): R$ ${faixa.parcelaDeduzir.toLocaleString('pt-BR')}
6. Alíquota efetiva: ((${rbt12.toFixed(2)} × ${faixa.aliquotaNominal}%) - ${faixa.parcelaDeduzir}) / ${rbt12.toFixed(2)} = ${aliquotaEfetiva.toFixed(4)}%
7. DAS = ${receitaMes.toFixed(2)} × ${aliquotaEfetiva.toFixed(4)}% = R$ ${valorDAS.toFixed(2)}

Vencimento: ${vencimento} (dia 20 do mês subsequente, conforme LC 123/2006).

Partilha:
• IRPJ: R$ ${detalhamentoPartilha.irpj.toFixed(2)}
• CSLL: R$ ${detalhamentoPartilha.csll.toFixed(2)}
• COFINS: R$ ${detalhamentoPartilha.cofins.toFixed(2)}
• PIS/Pasep: R$ ${detalhamentoPartilha.pis.toFixed(2)}
• CPP: R$ ${detalhamentoPartilha.cpp.toFixed(2)}
• ISS: R$ ${detalhamentoPartilha.iss.toFixed(2)}
`.trim()

  return {
    competencia: comp,
    receitaBrutaMes: Number(receitaMes.toFixed(2)),
    rbt12: Number(rbt12.toFixed(2)),
    faixa: faixa.faixa,
    aliquotaNominal: faixa.aliquotaNominal,
    valorDeduzir: faixa.parcelaDeduzir,
    aliquotaEfetiva: Number(aliquotaEfetiva.toFixed(4)),
    valorDAS: Number(valorDAS.toFixed(2)),
    vencimento,
    detalhamentoPartilha,
    memoriaCalculo,
  }
}

/** Verifica se o RBT12 está próximo do limite do Simples (R$ 4.8M). */
export function alertaLimiteSimples(rbt12: number): {
  nivel: 'ok' | 'atencao' | 'critico'
  mensagem: string
  pctLimite: number
} {
  const limite = 4_800_000
  const pct = (rbt12 / limite) * 100
  if (pct >= 95) return { nivel: 'critico', mensagem: `RBT12 em ${pct.toFixed(1)}% do limite do Simples (R$ 4,8M). Risco de desenquadramento iminente.`, pctLimite: pct }
  if (pct >= 80) return { nivel: 'atencao', mensagem: `RBT12 em ${pct.toFixed(1)}% do limite. Planejar estrutura fiscal.`, pctLimite: pct }
  return { nivel: 'ok', mensagem: `RBT12 em ${pct.toFixed(1)}% do limite do Simples.`, pctLimite: pct }
}
