/**
 * DRE / Lucro Líquido — ports of:
 *   - AA_DRE_LUCRO_LIQUIDO       (DRE simples)
 *   - AA_ENGINE_ANUAL_LL         (matriz mensal real × budget)
 *   - AA_ENGINE_ANUAL_LL_CC      (idem, filtrada por centro de custos)
 *   - AA_Net_Income              (variante "NET INCOME" da flag)
 */

import type { DadosContabeis, LinhaRelatorio, Lancamento, Matriz, Relatorio } from './types.js';
import {
  filtrarContas,
  firstOfMonth,
  flagFilhosVisuais,
  indentarDescricao,
  lastOfMonth,
  saldoBrutoPeriodo,
} from './engine.js';

// ── AA_DRE_LUCRO_LIQUIDO ────────────────────────────────────
/**
 * DRE de Lucro Líquido.
 *
 * Para cada conta com `LUCROLIQUIDO = TRUE`, calcula
 * `Σ Créditos − Σ Débitos` no período. O rodapé é a soma apenas
 * das contas "raiz" (sem pai entre as visíveis), evitando
 * dupla contagem hierárquica.
 *
 * Mirrors `AA_DRE_LUCRO_LIQUIDO(DataInicial, DataFinal)`.
 */
export function dreLucroLiquido(
  dados: DadosContabeis,
  dtIni: string,
  dtFim: string,
): Relatorio {
  const visuais = filtrarContas(dados.planoContas, 'lucroLiquido');
  const valores = visuais.map((c) =>
    saldoBrutoPeriodo(dados.lancamentos, c.codigo, dtIni, dtFim),
  );

  const cods = visuais.map((c) => c.codigo);
  const ehFilho = flagFilhosVisuais(cods);
  const total = valores.reduce((acc, v, i) => acc + (ehFilho[i] ? 0 : v), 0);

  const corpo: LinhaRelatorio[] = visuais.map((c, i) => ({
    conta: c.codigo,
    descricao: indentarDescricao(c.descricao, c.caracteres),
    valores: [valores[i]!],
  }));

  return {
    cabecalho: ['Descrição', 'R$'],
    corpo,
    rodape: { conta: 'LUCRO LÍQUIDO', descricao: 'LUCRO LÍQUIDO', valores: [total] },
  };
}

// ── AA_Net_Income ───────────────────────────────────────────
/**
 * `AA_Net_Income` — soma créditos − débitos das contas com
 * flag `NET INCOME = TRUE`. Retorna um único número.
 *
 * Match exato sobre `Conta2` (igual a `AA_EBIT`/`AA_EBITDA`).
 */
export function netIncome(dados: DadosContabeis, dtIni: string, dtFim: string): number {
  const contas = new Set(filtrarContas(dados.planoContas, 'netIncome').map((c) => c.codigo));
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

// ── AA_ENGINE_ANUAL_LL / AA_ENGINE_ANUAL_LL_CC ──────────────
/**
 * Matriz mensal de Lucro Líquido — 13 colunas de descrição +
 * 12 meses REAL + 12 meses BUDGET, com linha final "LUCRO LÍQUIDO"
 * somando apenas as contas-raiz.
 *
 * Optional `cc` (centro de custos) — quando informado, cada
 * SUMIFS adiciona o filtro `CentroCustos = cc`.
 *
 * Saída: matriz `(N+1) × 25` onde N = número de contas visíveis.
 *   Col 0 : descrição indentada (ou "LUCRO LÍQUIDO")
 *   Col 1..12 : valores real mensais (jan…dez)
 *   Col 13..24: valores budget mensais
 */
export function engineAnualLL(
  dados: DadosContabeis,
  ano: number,
  cc?: string,
): Matriz {
  const visuais = filtrarContas(dados.planoContas, 'lucroLiquido');
  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const budget = dados.lancamentosBudget ?? [];

  const calcPeriodo = (src: Lancamento[], codigo: string, di: string, df: string): number =>
    saldoBrutoPeriodo(src, codigo, di, df, cc);

  const realMensal: number[][] = meses.map((m) => {
    const di = firstOfMonth(ano, m);
    const df = lastOfMonth(di);
    return visuais.map((c) => calcPeriodo(dados.lancamentos, c.codigo, di, df));
  });
  const budgetMensal: number[][] = meses.map((m) => {
    const di = firstOfMonth(ano, m);
    const df = lastOfMonth(di);
    return visuais.map((c) => calcPeriodo(budget, c.codigo, di, df));
  });

  const cods = visuais.map((c) => c.codigo);
  const ehFilho = flagFilhosVisuais(cods);

  // Linha final: total mensal (só raízes)
  const totaisReal = meses.map((_, m) =>
    realMensal[m]!.reduce((acc, v, i) => acc + (ehFilho[i] ? 0 : v), 0),
  );
  const totaisBudget = meses.map((_, m) =>
    budgetMensal[m]!.reduce((acc, v, i) => acc + (ehFilho[i] ? 0 : v), 0),
  );

  const matriz: Matriz = visuais.map((c, i) => {
    const row: Array<number | string> = [indentarDescricao(c.descricao, c.caracteres)];
    for (let m = 0; m < 12; m++) row.push(realMensal[m]![i]!);
    for (let m = 0; m < 12; m++) row.push(budgetMensal[m]![i]!);
    return row;
  });

  const rodape: Array<number | string> = ['LUCRO LÍQUIDO'];
  for (let m = 0; m < 12; m++) rodape.push(totaisReal[m]!);
  for (let m = 0; m < 12; m++) rodape.push(totaisBudget[m]!);
  matriz.push(rodape);

  return matriz;
}

/**
 * `AA_ENGINE_ANUAL_LL_CC` — variante filtrada por centro de custos.
 */
export function engineAnualLLCC(
  dados: DadosContabeis,
  ano: number,
  centroCusto: string,
): Matriz {
  return engineAnualLL(dados, ano, centroCusto);
}
