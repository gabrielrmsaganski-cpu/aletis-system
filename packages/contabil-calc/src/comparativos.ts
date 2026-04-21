/**
 * Comparativos anuais / bi-periódicos — ports of:
 *   - AA_ENGINE_BLOCO_ANUAL        (helper: [blank, real, budget, varAbs, varPerc])
 *   - AA_COMPARATIVO_ANUAL         (matriz 12m + 4 trim + total)
 *   - AA_COMPARATIVO_ANUAL_CC      (idem, por centro de custos)
 *   - AA_ENGINE_COMPARATIVO_LL     (real × budget × real₂)
 *   - AA_COMPARATIVO_LUCROLIQUIDO  (apresentação do engine)
 */

import type { DadosContabeis, LinhaRelatorio, Lancamento, Matriz, Relatorio } from './types.js';
import {
  filtrarContas,
  firstOfMonth,
  flagFilhosVisuais,
  indentarDescricao,
  saldoBrutoPeriodo,
  varPerc,
} from './engine.js';
import { engineAnualLL, engineAnualLLCC } from './dre.js';

// ── AA_ENGINE_BLOCO_ANUAL (helper interno) ──────────────────
/**
 * Dado um vetor de real e um vetor de budget (mesmo tamanho),
 * retorna uma matriz com 5 colunas por linha:
 *   ["", real, budget, varAbs, varPerc]
 *
 * É chamado pelos comparativos mensais/trimestrais para
 * gerar cada bloco de 5 colunas.
 */
function engineBlocoAnual(real: number[], budget: number[]): Matriz {
  return real.map((r, i) => {
    const b = budget[i] ?? 0;
    const abs = r - b;
    return ['', r, b, abs, varPerc(r, b)];
  });
}

// ── AA_COMPARATIVO_ANUAL ────────────────────────────────────
/**
 * Comparativo anual Real × Budget por conta, com quebra mensal,
 * trimestral e total anual.
 *
 * Layout (por linha de conta):
 *   [descr]
 *   + blocos de 5 cols para (Jan, Fev, Mar, Q1, Abr, Mai, Jun, Q2, …, Total)
 *
 * São 17 blocos × 5 + 1 (descrição) = 86 células por linha.
 *
 * Mirrors `AA_COMPARATIVO_ANUAL(Ano)` (via `AA_ENGINE_ANUAL_LL` + `AA_ENGINE_BLOCO_ANUAL`).
 */
export function comparativoAnual(dados: DadosContabeis, ano: number, cc?: string): Relatorio {
  const D = cc ? engineAnualLLCC(dados, ano, cc) : engineAnualLL(dados, ano);
  return montarComparativoAnual(D, ano);
}

/**
 * `AA_COMPARATIVO_ANUAL_CC(Ano, CC)`.
 */
export function comparativoAnualCC(
  dados: DadosContabeis,
  ano: number,
  cc: string,
): Relatorio {
  return comparativoAnual(dados, ano, cc);
}

function montarComparativoAnual(D: Matriz, ano: number): Relatorio {
  // D: [descricao, R1..R12, B1..B12] por linha (última linha = LUCRO LÍQUIDO)
  const nLinhas = D.length;
  const desc = D.map((row) => String(row[0] ?? ''));
  const realM = (m: number) => D.map((row) => Number(row[m] ?? 0));
  const budgetM = (m: number) => D.map((row) => Number(row[m + 12] ?? 0));

  const realQ = (a: number, b: number, c: number) => {
    const xa = realM(a);
    const xb = realM(b);
    const xc = realM(c);
    return xa.map((_, i) => xa[i]! + xb[i]! + xc[i]!);
  };
  const budgetQ = (a: number, b: number, c: number) => {
    const xa = budgetM(a);
    const xb = budgetM(b);
    const xc = budgetM(c);
    return xa.map((_, i) => xa[i]! + xb[i]! + xc[i]!);
  };

  const realA = Array.from({ length: nLinhas }, () => 0);
  const budgetA = Array.from({ length: nLinhas }, () => 0);
  for (let m = 1; m <= 12; m++) {
    const rm = realM(m);
    const bm = budgetM(m);
    for (let i = 0; i < nLinhas; i++) {
      realA[i]! += rm[i]!;
      budgetA[i]! += bm[i]!;
    }
  }

  // Build column-oriented blocks
  const blocos: Matriz[] = [
    engineBlocoAnual(realM(1), budgetM(1)),
    engineBlocoAnual(realM(2), budgetM(2)),
    engineBlocoAnual(realM(3), budgetM(3)),
    engineBlocoAnual(realQ(1, 2, 3), budgetQ(1, 2, 3)),
    engineBlocoAnual(realM(4), budgetM(4)),
    engineBlocoAnual(realM(5), budgetM(5)),
    engineBlocoAnual(realM(6), budgetM(6)),
    engineBlocoAnual(realQ(4, 5, 6), budgetQ(4, 5, 6)),
    engineBlocoAnual(realM(7), budgetM(7)),
    engineBlocoAnual(realM(8), budgetM(8)),
    engineBlocoAnual(realM(9), budgetM(9)),
    engineBlocoAnual(realQ(7, 8, 9), budgetQ(7, 8, 9)),
    engineBlocoAnual(realM(10), budgetM(10)),
    engineBlocoAnual(realM(11), budgetM(11)),
    engineBlocoAnual(realM(12), budgetM(12)),
    engineBlocoAnual(realQ(10, 11, 12), budgetQ(10, 11, 12)),
    engineBlocoAnual(realA, budgetA),
  ];

  // Assemble linha-a-linha
  const corpo: LinhaRelatorio[] = [];
  for (let i = 0; i < nLinhas - 1; i++) {
    const valores: Array<number | string> = [];
    for (const bloco of blocos) valores.push(...bloco[i]!);
    corpo.push({
      conta: '',
      descricao: desc[i]!,
      valores,
    });
  }

  // Rodapé = última linha da matriz
  const rodapeRow = nLinhas - 1;
  const rodapeVals: Array<number | string> = [];
  for (const bloco of blocos) rodapeVals.push(...bloco[rodapeRow]!);

  // Cabeçalho: 17 blocos com etiqueta do período + sub-cabeçalho dentro de cada bloco
  const mesLabel = (m: number) => {
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const suf = String(ano % 100).padStart(2, '0');
    return `${nomes[m - 1]}/${suf}`;
  };
  const triLabel = (t: number) => `${t}T ${String(ano % 100).padStart(2, '0')}`;
  const labels = [
    mesLabel(1),
    mesLabel(2),
    mesLabel(3),
    triLabel(1),
    mesLabel(4),
    mesLabel(5),
    mesLabel(6),
    triLabel(2),
    mesLabel(7),
    mesLabel(8),
    mesLabel(9),
    triLabel(3),
    mesLabel(10),
    mesLabel(11),
    mesLabel(12),
    triLabel(4),
    `Total ${ano}`,
  ];

  // SubCab = ["", "Real", "Budget", "∆ Abs", "∆ %"] (5 cols por bloco)
  const cabecalho: string[] = ['Descrição'];
  for (const lbl of labels) {
    cabecalho.push(lbl, 'Real', 'Budget', '∆ Abs', '∆ %');
  }

  return {
    cabecalho,
    corpo,
    rodape: { conta: '', descricao: 'LUCRO LÍQUIDO', valores: rodapeVals },
  };
}

// ── AA_ENGINE_COMPARATIVO_LL ────────────────────────────────
/**
 * Compara Real × Budget × Real₂ (outro período) por conta LL.
 * Saída: linhas com [real, budget, real2, varAbsRR, varPercRR, varAbsRB, varPercRB]
 * + rodapé "LUCRO LÍQUIDO".
 */
export function engineComparativoLL(
  dados: DadosContabeis,
  dtIni1: string,
  dtFim1: string,
  dtIni2: string,
  dtFim2: string,
): Relatorio {
  const visuais = filtrarContas(dados.planoContas, 'lucroLiquido');
  const budget = dados.lancamentosBudget ?? [];

  const valLiq = (src: Lancamento[], codigo: string, di: string, df: string) =>
    saldoBrutoPeriodo(src, codigo, di, df);

  const valoresReal = visuais.map((c) => valLiq(dados.lancamentos, c.codigo, dtIni1, dtFim1));
  const valoresBudget = visuais.map((c) => valLiq(budget, c.codigo, dtIni1, dtFim1));
  const valoresReal2 = visuais.map((c) => valLiq(dados.lancamentos, c.codigo, dtIni2, dtFim2));

  const varAbsRR = valoresReal.map((v, i) => v - valoresReal2[i]!);
  const varPercRR = valoresReal.map((v, i) => varPerc(v, valoresReal2[i]!));
  const varAbsRB = valoresReal.map((v, i) => v - valoresBudget[i]!);
  const varPercRB = valoresReal.map((v, i) => varPerc(v, valoresBudget[i]!));

  const cods = visuais.map((c) => c.codigo);
  const ehFilho = flagFilhosVisuais(cods);
  const sumRoots = (arr: number[]) => arr.reduce((acc, v, i) => acc + (ehFilho[i] ? 0 : v), 0);

  const totalR = sumRoots(valoresReal);
  const totalB = sumRoots(valoresBudget);
  const totalR2 = sumRoots(valoresReal2);

  const corpo: LinhaRelatorio[] = visuais.map((c, i) => ({
    conta: c.codigo,
    descricao: indentarDescricao(c.descricao, c.caracteres),
    valores: [
      valoresReal[i]!,
      valoresBudget[i]!,
      valoresReal2[i]!,
      varAbsRR[i]!,
      varPercRR[i]!,
      varAbsRB[i]!,
      varPercRB[i]!,
    ],
  }));

  return {
    cabecalho: ['Descrição', 'Real', 'Budget', 'Real₂', '∆ Abs RR', '∆ % RR', '∆ Abs RB', '∆ % RB'],
    corpo,
    rodape: {
      conta: 'LUCRO LÍQUIDO',
      descricao: 'LUCRO LÍQUIDO',
      valores: [
        totalR,
        totalB,
        totalR2,
        totalR - totalR2,
        varPerc(totalR, totalR2),
        totalR - totalB,
        varPerc(totalR, totalB),
      ],
    },
  };
}

// ── AA_COMPARATIVO_LUCROLIQUIDO ─────────────────────────────
/**
 * Apresentação do comparativo LL — mesmo dado que o engine.
 */
export function comparativoLucroLiquido(
  dados: DadosContabeis,
  dtIni1: string,
  dtFim1: string,
  dtIni2: string,
  dtFim2: string,
): Relatorio {
  return engineComparativoLL(dados, dtIni1, dtFim1, dtIni2, dtFim2);
}
