/**
 * Fluxo de Caixa (método indireto) — ports of:
 *   - AA_ENGINE_FC_CLASSIFICAR   (encontra Seção/Grupo/Ordem p/ uma conta)
 *   - AA_ENGINE_FC_SALDO         (variação líquida de caixa p/ uma conta)
 *   - AA_ENGINE_FC_INDIRETO      (dados brutos do DFC)
 *   - AA_ENGINE_FC_MES           (DFC formatado — coluna única)
 *   - AA_FLUXO_CAIXA_INDIRETO    (DFC formatado — 2 colunas texto/valor)
 *
 * NOTE: `FC_Classificacao` é casada por prefixo — a entrada
 * com o **maior prefixo** que case com a conta vence. O campo
 * `Seção_FC` admite "Operacional", "Investimento", "Financiamento",
 * "Caixa" e "Excluir".
 */

import type {
  DadosContabeis,
  FCClassificacao,
  LinhaRelatorio,
  Relatorio,
  Lancamento,
} from './types.js';
import {
  ehAtivo,
  filtrarContas,
  flagFilhosVisuais,
  saldoBrutoPeriodo,
  somaPorConta,
} from './engine.js';

// ── AA_ENGINE_FC_CLASSIFICAR ────────────────────────────────
/**
 * Encontra a classificação (Seção, Grupo, Ordem) de uma conta.
 * Se nenhuma regra casa, retorna { secao: "N/C", grupo: "", ordem: 0 }.
 */
export function fcClassificar(
  classificacao: FCClassificacao[],
  codigoConta: string,
): { secao: string; grupo: string; ordem: number } {
  let melhor: FCClassificacao | null = null;
  let melhorLen = 0;
  for (const r of classificacao) {
    const prefix = String(r.conta);
    if (codigoConta.startsWith(prefix) && prefix.length > melhorLen) {
      melhor = r;
      melhorLen = prefix.length;
    }
  }
  if (!melhor) return { secao: 'N/C', grupo: '', ordem: 0 };
  return { secao: melhor.secao, grupo: melhor.grupo, ordem: melhor.ordem };
}

// ── AA_ENGINE_FC_SALDO ──────────────────────────────────────
/**
 * Variação líquida de caixa para uma conta patrimonial, multiplicada
 * pelo sinal FC:
 *   - Conta ativa (prefixo "1"):   sinal = -1  (aumento de ativo = saída)
 *   - Demais:                       sinal = +1  (aumento de passivo = entrada)
 *
 * `variação = saldo(dtFim) − saldo(dtIni - 1)`  (o saldo é expresso
 * como débito - crédito para ativas, o inverso para passivas).
 */
export function fcSaldo(
  lancamentos: Lancamento[],
  contaAlvo: string,
  dtIni: string,
  dtFim: string,
): number {
  const isAtivo = ehAtivo(contaAlvo);
  // saldo antes de dtIni
  const dAntes = somaPorConta(lancamentos, 'debito', contaAlvo, { dtAntes: dtIni });
  const cAntes = somaPorConta(lancamentos, 'credito', contaAlvo, { dtAntes: dtIni });
  // saldo até dtFim inclusive
  const dAte = somaPorConta(lancamentos, 'debito', contaAlvo, { dtAteInclusive: dtFim });
  const cAte = somaPorConta(lancamentos, 'credito', contaAlvo, { dtAteInclusive: dtFim });

  const saldoIni = isAtivo ? dAntes - cAntes : cAntes - dAntes;
  const saldoFim = isAtivo ? dAte - cAte : cAte - dAte;
  const variacao = saldoFim - saldoIni;
  const sinal = isAtivo ? -1 : 1;
  return variacao * sinal;
}

// ── AA_ENGINE_FC_INDIRETO ───────────────────────────────────
/**
 * Linhas-fonte do DFC indireto. Cada linha é uma tupla
 *   [tipo, secao, grupo, ordem, valor]
 * onde `tipo` ∈ {"LL", "AJUSTE", "PATRIM", "CX_INI", "CX_FIM"}.
 */
export interface LinhaFCIndireto {
  tipo: 'LL' | 'AJUSTE' | 'PATRIM' | 'CX_INI' | 'CX_FIM';
  secao: string;
  grupo: string;
  ordem: number;
  valor: number;
}

export function engineFCIndireto(
  dados: DadosContabeis,
  dtIni: string,
  dtFim: string,
): LinhaFCIndireto[] {
  const classif = dados.fcClassificacao ?? [];
  const ajustesLL = dados.fcAjustesLL ?? [];
  const minChars = dados.minCharsAnalitica ?? 13;

  // ── 1) Linhas patrimoniais (aggregadas por grupo)
  // Filtra contas analíticas cobertas por alguma entrada do FC_Classificacao.
  const contasAnaliticas = dados.planoContas.filter((c) => c.caracteres >= minChars);
  const contasCobertas = contasAnaliticas.filter((c) => {
    return classif.some((r) => c.codigo.startsWith(String(r.conta)));
  });

  // Classificar e calcular variação de cada conta coberta
  const classifPorConta = contasCobertas.map((c) => ({
    codigo: c.codigo,
    ...fcClassificar(classif, c.codigo),
  }));

  // Filtrar ativas (não-caixa, não-excluir, não-N/C)
  const contasAtivasFC = classifPorConta.filter(
    (c) => c.secao !== 'Caixa' && c.secao !== 'Excluir' && c.secao !== 'N/C',
  );

  const varPorConta = contasAtivasFC.map((c) => ({
    ...c,
    variacao: fcSaldo(dados.lancamentos, c.codigo, dtIni, dtFim),
  }));

  // Agrupar por (Seção, Grupo) e somar
  const gruposMap = new Map<string, { secao: string; grupo: string; ordem: number; valor: number }>();
  for (const v of varPorConta) {
    const key = `${v.secao}||${v.grupo}`;
    const existente = gruposMap.get(key);
    if (existente) {
      existente.valor += v.variacao;
    } else {
      // Ordem = primeira ordem encontrada para aquele grupo
      const regra = classif.find((r) => r.grupo === v.grupo);
      gruposMap.set(key, {
        secao: v.secao,
        grupo: v.grupo,
        ordem: regra?.ordem ?? 99,
        valor: v.variacao,
      });
    }
  }

  const patrimLinhas: LinhaFCIndireto[] = Array.from(gruposMap.values()).map((g) => ({
    tipo: 'PATRIM',
    secao: g.secao,
    grupo: g.grupo,
    ordem: g.ordem,
    valor: g.valor,
  }));

  // ── 2) Ajustes ao LL (ex: depreciação reverte)
  const ajusteLinhas: LinhaFCIndireto[] = ajustesLL.map((a) => {
    // `FnSomaRes`: Σ crédito − Σ débito (saldo líquido da conta de resultado),
    // multiplicado por -1 (revertendo o impacto no LL).
    const cred = somaPorConta(dados.lancamentos, 'credito', a.conta, { dtIni, dtFim });
    const deb = somaPorConta(dados.lancamentos, 'debito', a.conta, { dtIni, dtFim });
    const valor = (cred - deb) * -1;
    return {
      tipo: 'AJUSTE',
      secao: 'Operacional',
      grupo: a.grupo,
      ordem: a.ordem,
      valor,
    };
  });

  // ── 3) Lucro Líquido
  const llContas = filtrarContas(dados.planoContas, 'lucroLiquido');
  const cods = llContas.map((c) => c.codigo);
  const ehFilho = flagFilhosVisuais(cods);
  const llRaizes = llContas.filter((_, i) => !ehFilho[i]);
  const llValor = llRaizes.reduce(
    (acc, c) => acc + saldoBrutoPeriodo(dados.lancamentos, c.codigo, dtIni, dtFim),
    0,
  );
  const linhaLL: LinhaFCIndireto = {
    tipo: 'LL',
    secao: 'Operacional',
    grupo: 'Lucro Líquido do Período',
    ordem: 0,
    valor: llValor,
  };

  // ── 4) Saldos de Caixa (Ini / Fim)
  const contasCaixa = classifPorConta.filter((c) => c.secao === 'Caixa').map((c) => c.codigo);
  const saldoDe = (codigo: string, filtro: { dtAntes?: string; dtAteInclusive?: string }) => {
    const d = somaPorConta(dados.lancamentos, 'debito', codigo, filtro);
    const c = somaPorConta(dados.lancamentos, 'credito', codigo, filtro);
    return d - c; // caixa é sempre ativa → débito − crédito
  };
  const sdIni = contasCaixa.reduce((acc, c) => acc + saldoDe(c, { dtAntes: dtIni }), 0);
  const sdFim = contasCaixa.reduce((acc, c) => acc + saldoDe(c, { dtAteInclusive: dtFim }), 0);

  const linhaCxIni: LinhaFCIndireto = {
    tipo: 'CX_INI',
    secao: 'Caixa',
    grupo: 'Saldo Inicial de Caixa',
    ordem: 0,
    valor: sdIni,
  };
  const linhaCxFim: LinhaFCIndireto = {
    tipo: 'CX_FIM',
    secao: 'Caixa',
    grupo: 'Saldo Final de Caixa',
    ordem: 0,
    valor: sdFim,
  };

  return [linhaLL, ...ajusteLinhas, ...patrimLinhas, linhaCxIni, linhaCxFim];
}

// ── AA_FLUXO_CAIXA_INDIRETO ─────────────────────────────────
/**
 * DFC formatado (relatório de 2 colunas: [descrição, R$]).
 *
 * Organização:
 *   ATIVIDADES OPERACIONAIS
 *     + Lucro Líquido do Período
 *     + Ajustes
 *     + Variações de contas operacionais
 *     = Caixa gerado atividades operacionais
 *   ATIVIDADES DE INVESTIMENTO
 *     + Variações de investimento
 *     = Caixa atividades de investimento
 *   ATIVIDADES DE FINANCIAMENTO
 *     + Variações de financiamento
 *     = Caixa atividades de financiamento
 *   VARIAÇÃO LÍQUIDA
 *   (+) Saldo Inicial de Caixa
 *   (=) Saldo Final de Caixa
 *   CHECK / Diferença / Status
 */
export function fluxoCaixaIndireto(
  dados: DadosContabeis,
  dtIni: string,
  dtFim: string,
): Relatorio {
  const linhas = engineFCIndireto(dados, dtIni, dtFim);

  const llVal = linhas.find((l) => l.tipo === 'LL')?.valor ?? 0;

  const bySecao = (secao: 'Operacional' | 'Investimento' | 'Financiamento') =>
    linhas
      .filter((l) => l.tipo === 'PATRIM' && l.secao === secao)
      .sort((a, b) => a.ordem - b.ordem);
  const ajustes = linhas.filter((l) => l.tipo === 'AJUSTE').sort((a, b) => a.ordem - b.ordem);
  const operacionais = bySecao('Operacional');
  const investimento = bySecao('Investimento');
  const financiamento = bySecao('Financiamento');

  const somaVals = (arr: LinhaFCIndireto[]) => arr.reduce((s, l) => s + l.valor, 0);
  const totOper = llVal + somaVals(ajustes) + somaVals(operacionais);
  const totInv = somaVals(investimento);
  const totFin = somaVals(financiamento);

  const cxIni = linhas.find((l) => l.tipo === 'CX_INI')?.valor ?? 0;
  const cxFim = linhas.find((l) => l.tipo === 'CX_FIM')?.valor ?? 0;
  const varLiq = totOper + totInv + totFin;
  const chkEsperado = cxIni + varLiq;
  const chkDif = cxFim - chkEsperado;
  const chkOk = Math.abs(chkDif) < 0.01;

  const corpo: LinhaRelatorio[] = [];
  const push = (descricao: string, valor: number | string = '', conta = '') =>
    corpo.push({ conta, descricao, valores: [valor] });

  push('ATIVIDADES OPERACIONAIS');
  push('  Lucro Líquido do Período', llVal);
  for (const a of ajustes) push(`  ${a.grupo}`, a.valor);
  for (const o of operacionais) push(`  ${o.grupo}`, o.valor);
  push('= Caixa Gerado Atividades Operacionais', totOper);
  push('');
  push('ATIVIDADES DE INVESTIMENTO');
  for (const i of investimento) push(`  ${i.grupo}`, i.valor);
  push('= Caixa Atividades de Investimento', totInv);
  push('');
  push('ATIVIDADES DE FINANCIAMENTO');
  for (const f of financiamento) push(`  ${f.grupo}`, f.valor);
  push('= Caixa Atividades de Financiamento', totFin);
  push('');
  push('VARIAÇÃO LÍQUIDA DE CAIXA', varLiq);
  push('(+) Saldo Inicial de Caixa', cxIni);
  push('(=) Saldo Final de Caixa', cxFim);
  push('');
  push('CHECK: Saldo Ini + Var Líq', chkEsperado);
  push('Diferença', chkDif);
  push('Status', chkOk ? '✓ OK' : `✗ Dif: ${chkDif.toFixed(2)}`);

  return {
    cabecalho: ['Descrição', 'R$'],
    corpo,
  };
}

// ── AA_ENGINE_FC_MES ────────────────────────────────────────
/**
 * Versão "coluna única" do DFC indireto, para uso em grids mensais.
 * Retorna um vetor de números (ou strings de separação) na ordem:
 *   ["", LL, ajustes…, operacionais…, totOper, "", "", invs…, totInv,
 *    "", "", fins…, totFin, "", varLiq, cxIni, cxFim, "",
 *    chkEsperado, chkDif, chkStatus]
 */
export function engineFCMes(
  dados: DadosContabeis,
  dtIni: string,
  dtFim: string,
): Array<number | string> {
  const linhas = engineFCIndireto(dados, dtIni, dtFim);
  const llVal = linhas.find((l) => l.tipo === 'LL')?.valor ?? 0;
  const ajustes = linhas.filter((l) => l.tipo === 'AJUSTE').sort((a, b) => a.ordem - b.ordem);
  const oper = linhas
    .filter((l) => l.tipo === 'PATRIM' && l.secao === 'Operacional')
    .sort((a, b) => a.ordem - b.ordem);
  const inv = linhas
    .filter((l) => l.tipo === 'PATRIM' && l.secao === 'Investimento')
    .sort((a, b) => a.ordem - b.ordem);
  const fin = linhas
    .filter((l) => l.tipo === 'PATRIM' && l.secao === 'Financiamento')
    .sort((a, b) => a.ordem - b.ordem);

  const somaVals = (arr: LinhaFCIndireto[]) => arr.reduce((s, l) => s + l.valor, 0);
  const totOper = llVal + somaVals(ajustes) + somaVals(oper);
  const totInv = somaVals(inv);
  const totFin = somaVals(fin);
  const cxIni = linhas.find((l) => l.tipo === 'CX_INI')?.valor ?? 0;
  const cxFim = linhas.find((l) => l.tipo === 'CX_FIM')?.valor ?? 0;
  const varLiq = totOper + totInv + totFin;
  const chkEsperado = cxIni + varLiq;
  const chkDif = cxFim - chkEsperado;
  const chkStatus = Math.abs(chkDif) < 0.01 ? '✓ OK' : `✗ Dif: ${chkDif.toFixed(2)}`;

  const out: Array<number | string> = [''];
  out.push(llVal);
  for (const a of ajustes) out.push(a.valor);
  for (const o of oper) out.push(o.valor);
  out.push(totOper);
  out.push('', '');
  for (const i of inv) out.push(i.valor);
  out.push(totInv);
  out.push('', '');
  for (const f of fin) out.push(f.valor);
  out.push(totFin);
  out.push('');
  out.push(varLiq);
  out.push(cxIni);
  out.push(cxFim);
  out.push('');
  out.push(chkEsperado);
  out.push(chkDif);
  out.push(chkStatus);
  return out;
}
