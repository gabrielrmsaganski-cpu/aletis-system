/**
 * EBIT / EBITDA — ports of:
 *   - AA_EBIT
 *   - AA_EBITDA
 *   - AA_EBITDA_DRE               (simplified DRE limited by min-caracteres)
 *   - AA_EBITDA_DRE_Completo      (full EBITDA DRE with exclusion redutores)
 *   - AA_EBITDA_Comparativo       (real × budget × real₂)
 *   - AA_ENGINE_COMPARATIVO_EBITDA (matrix engine for the above)
 *
 * Signature convention:
 *   ebit(dados, dtIni, dtFim) -> number
 *   ebitda(dados, dtIni, dtFim) -> number
 *   ebitdaDRE(dados, dtIni, dtFim, minCaracteres) -> Relatorio
 *   ebitdaDRECompleto(dados, dtIni, dtFim) -> Relatorio
 *   comparativoEBITDA(dados, dtIni1, dtFim1, dtIni2, dtFim2) -> Relatorio
 */

import type {
  DadosContabeis,
  LinhaRelatorio,
  PlanoContas,
  Relatorio,
} from './types.js';
import {
  analiseVertical,
  calcularRedutor,
  filtrarContas,
  flagFilhosVisuais,
  indentarDescricao,
  particionarContas,
  saldoBrutoPeriodo,
  somaPorConta,
  varPerc,
} from './engine.js';

// ── AA_EBIT ──────────────────────────────────────────────────
/**
 * EBIT = Σ créditos − Σ débitos, restrito às contas com flag `EBIT = TRUE`.
 *
 * Segue a semântica do Excel: `SUMIFS(Conta2, _xlpm.ContasAtivas)` usa
 * match **exato** de `Conta2` (cada lançamento já tem a conta analítica
 * completa). Apenas as contas analíticas presentes em ContasAtivas
 * contribuem — a soma de um agregador pai + seus filhos seria
 * dupla contagem, que o Excel evita naturalmente.
 *
 * Mirrors `AA_EBIT`.
 */
export function ebit(dados: DadosContabeis, dtIni: string, dtFim: string): number {
  const contas = new Set(filtrarContas(dados.planoContas, 'ebit').map((c) => c.codigo));
  let cred = 0;
  let deb = 0;
  for (const l of dados.lancamentos) {
    if (!contas.has(l.contaCodigo)) continue;
    const d = l.data.slice(0, 10);
    if (d < dtIni || d > dtFim) continue;
    cred += l.credito ?? 0;
    deb += l.debito ?? 0;
  }
  return cred - deb;
}

// ── AA_EBITDA ────────────────────────────────────────────────
/**
 * EBITDA = Σ créditos − Σ débitos, restrito às contas com flag `EBITDA = TRUE`.
 *
 * Segue a mesma semântica exata de `AA_EBITDA` (match exato).
 */
export function ebitda(dados: DadosContabeis, dtIni: string, dtFim: string): number {
  const contas = new Set(filtrarContas(dados.planoContas, 'ebitda').map((c) => c.codigo));
  let cred = 0;
  let deb = 0;
  for (const l of dados.lancamentos) {
    if (!contas.has(l.contaCodigo)) continue;
    const d = l.data.slice(0, 10);
    if (d < dtIni || d > dtFim) continue;
    cred += l.credito ?? 0;
    deb += l.debito ?? 0;
  }
  return cred - deb;
}

// ── AA_EBITDA_DRE ───────────────────────────────────────────
/**
 * EBITDA DRE resumido, filtrado por nível mínimo de conta.
 *
 * Source: `AA_EBITDA_DRE(DataInicial, DataFinal, Ncarac_conta_contabil)`.
 */
export function ebitdaDRE(
  dados: DadosContabeis,
  dtIni: string,
  dtFim: string,
  nCaracMin: number,
): Relatorio {
  const ativas = dados.planoContas.filter((c) => c.ebitda && c.caracteres >= nCaracMin);

  const corpo: LinhaRelatorio[] = ativas.map((c) => {
    const cred = somaPorConta(dados.lancamentos, 'credito', c.codigo, { dtIni, dtFim });
    const deb = somaPorConta(dados.lancamentos, 'debito', c.codigo, { dtIni, dtFim });
    return {
      conta: c.codigo,
      descricao: c.descricao,
      valores: [cred - deb],
    };
  });

  const total = corpo.reduce((acc, l) => acc + (l.valores[0] as number), 0);

  return {
    cabecalho: ['Descrição', 'R$'],
    corpo,
    rodape: { conta: 'EBITDA', descricao: 'EBITDA', valores: [total] },
  };
}

// ── AA_EBITDA_DRE_Completo ──────────────────────────────────
/**
 * Full EBITDA DRE — respects the hierarchical structure and
 * applies the exclusion-redutor logic to avoid double-counting
 * when a parent is visible but one of its sub-accounts is excluded.
 *
 * Source: `AA_EBITDA_DRE_Completo(DataInicial, DataFinal)`.
 */
export function ebitdaDRECompleto(
  dados: DadosContabeis,
  dtIni: string,
  dtFim: string,
): Relatorio {
  const { visuais, excluidas } = particionarContas(dados.planoContas, 'ebitda');

  const calcSaldo = (codigo: string) =>
    saldoBrutoPeriodo(dados.lancamentos, codigo, dtIni, dtFim);

  const valores = visuais.map((c) => {
    const bruto = calcSaldo(c.codigo);
    const redutor = calcularRedutor(excluidas, c.codigo, calcSaldo);
    return bruto - redutor;
  });

  const cods = visuais.map((c) => c.codigo);
  const ehFilho = flagFilhosVisuais(cods);

  const totalGeral = valores.reduce((acc, v, i) => acc + (ehFilho[i] ? 0 : v), 0);

  const corpo: LinhaRelatorio[] = visuais.map((c, i) => ({
    conta: c.codigo,
    descricao: indentarDescricao(c.descricao, c.caracteres),
    valores: [valores[i]!],
  }));

  return {
    cabecalho: ['Descrição', 'R$'],
    corpo,
    rodape: { conta: 'TOTAL EBITDA', descricao: 'TOTAL EBITDA', valores: [totalGeral] },
  };
}

// ── AA_ENGINE_COMPARATIVO_EBITDA ────────────────────────────
/**
 * Núcleo do comparativo de EBITDA. Retorna, por conta visível,
 *   [descricao, real, budget, real₂, ΔAbsRR, ΔPercRR, ΔAbsRB, ΔPercRB]
 * + linha de "TOTAL EBITDA" no rodapé.
 */
export function engineComparativoEBITDA(
  dados: DadosContabeis,
  dtIni1: string,
  dtFim1: string,
  dtIni2: string,
  dtFim2: string,
): Relatorio {
  const { visuais, excluidas } = particionarContas(dados.planoContas, 'ebitda');
  const budget = dados.lancamentosBudget ?? [];

  const calcLiq = (entries: typeof dados.lancamentos, codigo: string, di: string, df: string) => {
    const bruto = saldoBrutoPeriodo(entries, codigo, di, df);
    const red = calcularRedutor(excluidas, codigo, (c) => saldoBrutoPeriodo(entries, c, di, df));
    return bruto - red;
  };

  const real1 = visuais.map((c) => calcLiq(dados.lancamentos, c.codigo, dtIni1, dtFim1));
  const bdg = visuais.map((c) => calcLiq(budget, c.codigo, dtIni1, dtFim1));
  const real2 = visuais.map((c) => calcLiq(dados.lancamentos, c.codigo, dtIni2, dtFim2));

  const varAbsRR = real1.map((v, i) => v - real2[i]!);
  const varPercRR = real1.map((v, i) => varPerc(v, real2[i]!));
  const varAbsRB = real1.map((v, i) => v - bdg[i]!);
  const varPercRB = real1.map((v, i) => varPerc(v, bdg[i]!));

  const cods = visuais.map((c) => c.codigo);
  const ehFilho = flagFilhosVisuais(cods);

  const sumRoots = (arr: number[]) => arr.reduce((acc, v, i) => acc + (ehFilho[i] ? 0 : v), 0);
  const totalR = sumRoots(real1);
  const totalB = sumRoots(bdg);
  const totalR2 = sumRoots(real2);

  const corpo: LinhaRelatorio[] = visuais.map((c, i) => ({
    conta: c.codigo,
    descricao: indentarDescricao(c.descricao, c.caracteres),
    valores: [
      real1[i]!,
      bdg[i]!,
      real2[i]!,
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
      conta: 'TOTAL EBITDA',
      descricao: 'TOTAL EBITDA',
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

// ── AA_EBITDA_Comparativo ───────────────────────────────────
/**
 * Apresentação do comparativo EBITDA — usa o engine e acrescenta
 * colunas vazias de separação visual.
 *
 * Source: `AA_EBITDA_Comparativo(DtIni, DtFim, DtIni2, DtFim2)`.
 */
export function comparativoEBITDA(
  dados: DadosContabeis,
  dtIni1: string,
  dtFim1: string,
  dtIni2: string,
  dtFim2: string,
): Relatorio {
  return engineComparativoEBITDA(dados, dtIni1, dtFim1, dtIni2, dtFim2);
}

// ── Exported helpers (para testes / API externa) ───────────────
export function contasEBITDA(plano: PlanoContas[]): PlanoContas[] {
  return filtrarContas(plano, 'ebitda');
}

export function contasEBIT(plano: PlanoContas[]): PlanoContas[] {
  return filtrarContas(plano, 'ebit');
}

// utilitário re-export para quem precisar de AV no topo do relatório
export { analiseVertical };
