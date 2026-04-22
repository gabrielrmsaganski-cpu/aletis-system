/**
 * Balanced Scorecard Agro — Wave 8a
 *
 * Port TypeScript do framework BSC da planilha
 * `99_98 - Formulas Lambda-BSC_v5.xlsx` (LAMBDAs
 * `AA_BSC_BUSCAR_VALOR`, `AA_BSC_CALC_KPI`,
 * `AA_BSC_MAPA_ESTRATEGICO`). A planilha original é um template
 * educacional genérico — aqui adaptamos o mecanismo (polaridade,
 * score Real/Meta, thresholds 1.00/0.90) para um catálogo de **13
 * KPIs canônicos do agronegócio**, distribuídos nas 4 perspectivas
 * clássicas de Kaplan & Norton (1996).
 *
 * Catálogo resumido:
 *   - Financeira (4): ROIC, Margem EBITDA, Liquidez Corrente,
 *                     Endividamento.
 *   - Clientes (3): NPS, Prazo Médio Recebimento, % Inadimplência.
 *   - Processos (4): Giro Estoques, Custo por Hectare,
 *                    Produtividade t/ha, Tempo Ciclo Operacional.
 *   - Aprendizado (2): Treinamento per capita, Turnover.
 *
 * Uso:
 * ```ts
 * import { calcularBSC, BSC_KPIS } from '@aletis/contabil-calc';
 * const r = calcularBSC(ctx);  // r.scoreGeral, r.porPerspectiva, ...
 * ```
 */
import type {
  ContextoBSCCalculo,
  KpiBSCDefinicao,
  PerspectivaBSC,
  ResultadoBSC,
  ScorePerspectivaBSC,
  StatusKpi,
  TendenciaKpi,
  ValorKpi,
} from '@aletis/shared-types/src/bsc.js';

// ── Thresholds (idênticos aos do Excel) ─────────────────────────
/** Score >= este valor → 🟢 acima_meta. */
const TH_ACIMA = 1.0;
/** Score >= este valor e < TH_ACIMA → 🟡 na_meta. */
const TH_NA_META = 0.9;
/** Cap máximo do score de um KPI (evita outliers explodirem). */
const SCORE_CAP = 1.5;

// ── Pesos por perspectiva (Kaplan & Norton, pesos comuns) ───────
/** Soma = 1. Pesos default da média ponderada geral. */
const PESOS_PERSPECTIVA: Record<PerspectivaBSC, number> = {
  financeira: 0.3,
  clientes: 0.25,
  processos_internos: 0.25,
  aprendizado_crescimento: 0.2,
};

// ═══════════════════════════════════════════════════════════════
//  CATÁLOGO DE KPIs
// ═══════════════════════════════════════════════════════════════

/**
 * Catálogo canônico BSC Agro — 13 KPIs distribuídos nas 4
 * perspectivas de Kaplan & Norton. Metas padrão baseadas em
 * benchmarks do agro brasileiro (Sicoob/OCB AgroGestão,
 * Embrapa Soja/Milho 2024, CNA safra 2024/25).
 */
export const BSC_KPIS: KpiBSCDefinicao[] = [
  // ────────────── Financeira (4) ──────────────
  {
    id: 'roic',
    nome: 'ROIC — Retorno sobre Capital Investido',
    perspectiva: 'financeira',
    formula: 'lucroLiquido / investimentoCapital',
    unidade: '%',
    meta: 0.15,
    tendencia: 'maior_melhor',
    descricao:
      'Mede a rentabilidade do capital alocado na operação rural. ' +
      'Meta de 15% a.a. é o benchmark Sicoob para produtor consolidado.',
  },
  {
    id: 'margem_ebitda',
    nome: 'Margem EBITDA',
    perspectiva: 'financeira',
    formula: 'ebitda / receitaBruta',
    unidade: '%',
    meta: 0.25,
    tendencia: 'maior_melhor',
    descricao:
      'Percentual da receita bruta que sobra após custos operacionais ' +
      'e despesas (antes de juros, impostos e depreciação). Saudável ' +
      'para grãos: 20–30%.',
  },
  {
    id: 'liquidez_corrente',
    nome: 'Liquidez Corrente',
    perspectiva: 'financeira',
    formula: 'ativoCirculante / passivoCirculante',
    unidade: 'ratio',
    meta: 1.5,
    tendencia: 'maior_melhor',
    descricao:
      'Capacidade de honrar obrigações de curto prazo. Meta de 1,5x ' +
      'significa R$ 1,50 de ativo para cada R$ 1,00 de passivo a vencer.',
  },
  {
    id: 'endividamento',
    nome: 'Endividamento (Dívida / Patrimônio Líquido)',
    perspectiva: 'financeira',
    formula: 'dividasTotal / patrimonioLiquido',
    unidade: 'ratio',
    meta: 1.0,
    tendencia: 'menor_melhor',
    descricao:
      'Alavancagem financeira. Acima de 1,0x o produtor opera mais ' +
      'com capital de terceiros do que próprio — risco de execução ' +
      'aumenta em safra ruim.',
  },

  // ────────────── Clientes (3) ──────────────
  {
    id: 'nps_cliente',
    nome: 'NPS — Net Promoter Score',
    perspectiva: 'clientes',
    formula: 'input direto (% promotores − % detratores)',
    unidade: 'score',
    meta: 50,
    tendencia: 'maior_melhor',
    descricao:
      'Lealdade dos compradores (tradings, cooperativas, indústria). ' +
      'NPS >= 50 é excelente no B2B agro.',
  },
  {
    id: 'prazo_medio_recebimento',
    nome: 'PMR — Prazo Médio de Recebimento',
    perspectiva: 'clientes',
    formula: 'contasReceber / (receitaBruta / 365)',
    unidade: 'dias',
    meta: 30,
    tendencia: 'menor_melhor',
    descricao:
      'Tempo médio entre a venda e o recebimento. No agro, contratos ' +
      'de entrega a termo podem alongar para 60–90 dias. Meta de 30 ' +
      'dias favorece fluxo de caixa.',
  },
  {
    id: 'perc_inadimplencia',
    nome: '% Inadimplência',
    perspectiva: 'clientes',
    formula: 'input direto (contas vencidas / total a receber)',
    unidade: '%',
    meta: 0.03,
    tendencia: 'menor_melhor',
    descricao:
      'Percentual da carteira de recebíveis vencida > 90 dias. ' +
      'Meta <= 3% mantém o risco sob controle.',
  },

  // ────────────── Processos Internos (4) ──────────────
  {
    id: 'giro_estoques',
    nome: 'Giro de Estoques',
    perspectiva: 'processos_internos',
    formula: 'receitaBruta / estoque',
    unidade: 'vezes/ano',
    meta: 6,
    tendencia: 'maior_melhor',
    descricao:
      'Quantas vezes o estoque é "girado" no ano. Grãos estocados ' +
      'em silo próprio geram giro menor (permite hedge de preço); ' +
      'gado de corte costuma girar 1–2x.',
  },
  {
    id: 'custo_por_hectare',
    nome: 'Custo por Hectare',
    perspectiva: 'processos_internos',
    formula: 'custosProducao / areaPlantadaHa',
    unidade: 'R$/ha',
    meta: 5000,
    tendencia: 'menor_melhor',
    descricao:
      'Custo total de produção dividido pela área plantada. Meta de ' +
      'R$ 5.000/ha é o benchmark Embrapa 2024 para soja de sequeiro ' +
      'no CO/MT.',
  },
  {
    id: 'produtividade_t_ha',
    nome: 'Produtividade (t/ha)',
    perspectiva: 'processos_internos',
    formula: 'producaoTotalTon / areaPlantadaHa',
    unidade: 't/ha',
    meta: 3.5,
    tendencia: 'maior_melhor',
    descricao:
      'Toneladas produzidas por hectare plantado. Benchmark soja ' +
      'safra 2024/25 — média nacional 3,4 t/ha; propriedades top ' +
      'decil > 4,2 t/ha.',
  },
  {
    id: 'tempo_ciclo_producao',
    nome: 'Tempo de Ciclo Operacional',
    perspectiva: 'processos_internos',
    formula: 'input direto (dias entre plantio → colheita → venda)',
    unidade: 'dias',
    meta: 120,
    tendencia: 'menor_melhor',
    descricao:
      'Duração média do ciclo operacional por talhão. Ciclos curtos ' +
      'liberam capital de giro. Safra + safrinha típica: 110–150 dias.',
  },

  // ────────────── Aprendizado e Crescimento (2) ──────────────
  {
    id: 'treinamento_per_capita',
    nome: 'Treinamento por Colaborador',
    perspectiva: 'aprendizado_crescimento',
    formula: 'horasTreinamento / numeroColaboradores',
    unidade: 'h/colab',
    meta: 20,
    tendencia: 'maior_melhor',
    descricao:
      'Horas de treinamento por colaborador no período. Senar ' +
      'recomenda >= 20h/ano por trabalhador rural como baseline.',
  },
  {
    id: 'turnover',
    nome: 'Turnover (Rotatividade)',
    perspectiva: 'aprendizado_crescimento',
    formula: 'input direto (demissões / headcount médio)',
    unidade: '%',
    meta: 0.1,
    tendencia: 'menor_melhor',
    descricao:
      'Rotatividade de pessoal. Acima de 10% a.a. compromete o ' +
      'conhecimento tácito da operação (manejo, tratos, máquinas).',
  },
];

/** Mapa indexado por id para lookup O(1). */
const KPI_POR_ID: Record<string, KpiBSCDefinicao> = Object.freeze(
  BSC_KPIS.reduce<Record<string, KpiBSCDefinicao>>((acc, k) => {
    acc[k.id] = k;
    return acc;
  }, {}),
);

// ═══════════════════════════════════════════════════════════════
//  FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════

/**
 * Divisão segura: retorna `fallback` se `den` for 0 ou NaN.
 * Replica o comportamento do `IF(Den = 0, 0, Num/Den)` do Excel.
 */
function safeDiv(num: number, den: number, fallback = 0): number {
  if (!Number.isFinite(den) || den === 0) return fallback;
  const r = num / den;
  return Number.isFinite(r) ? r : fallback;
}

/** Arredonda para 4 casas (suficiente para percentuais/ratios). */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Arredonda para 2 casas (valores monetários / scores). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Score de um KPI, replicando `AA_BSC_CALC_KPI`:
 *   - maior_melhor → real / meta
 *   - menor_melhor → meta / real
 *   - meta = 0 ou ausente → sem_meta (score neutro = 1)
 *   - real = 0 em menor_melhor → score cap (sem custo → ótimo)
 * Capado em SCORE_CAP para evitar outliers.
 */
function scoreKpi(
  valor: number,
  meta: number | undefined,
  tendencia: TendenciaKpi,
): { score: number; status: StatusKpi } {
  if (meta === undefined || meta === 0 || !Number.isFinite(meta)) {
    return { score: 1, status: 'sem_meta' };
  }
  let raw: number;
  if (tendencia === 'maior_melhor') {
    raw = safeDiv(valor, meta, 0);
  } else {
    // menor_melhor: invertido. Se valor = 0 → score cap (ótimo).
    if (valor === 0) {
      raw = SCORE_CAP;
    } else {
      raw = safeDiv(meta, valor, 0);
    }
  }
  const capped = Math.min(Math.max(raw, 0), SCORE_CAP);
  let status: StatusKpi;
  if (capped >= TH_ACIMA) status = 'acima_meta';
  else if (capped >= TH_NA_META) status = 'na_meta';
  else status = 'abaixo_meta';
  return { score: round4(capped), status };
}

/**
 * Calcula o valor bruto de um KPI dado o contexto. Retorna
 * `undefined` quando o contexto não traz os insumos necessários —
 * nesse caso o KPI é omitido do resultado.
 */
function valorKpi(id: string, ctx: ContextoBSCCalculo): number | undefined {
  switch (id) {
    case 'roic':
      return safeDiv(ctx.lucroLiquido, ctx.investimentoCapital, 0);
    case 'margem_ebitda':
      return safeDiv(ctx.ebitda, ctx.receitaBruta, 0);
    case 'liquidez_corrente':
      return safeDiv(ctx.ativoCirculante, ctx.passivoCirculante, 0);
    case 'endividamento':
      return safeDiv(ctx.dividasTotal, ctx.patrimonioLiquido, 0);
    case 'nps_cliente':
      return ctx.npsCliente;
    case 'prazo_medio_recebimento': {
      if (ctx.prazoMedioRecebimentoDias !== undefined) {
        return ctx.prazoMedioRecebimentoDias;
      }
      // Fallback: PMR = contasReceber / (receitaBruta / 365)
      const diario = safeDiv(ctx.receitaBruta, 365, 0);
      if (diario === 0) return undefined;
      return safeDiv(ctx.contasReceber, diario, 0);
    }
    case 'perc_inadimplencia':
      return ctx.percInadimplencia;
    case 'giro_estoques':
      return safeDiv(ctx.receitaBruta, ctx.estoque, 0);
    case 'custo_por_hectare': {
      if (ctx.custoHectare !== undefined) return ctx.custoHectare;
      return safeDiv(ctx.custosProducao, ctx.areaPlantadaHa, 0);
    }
    case 'produtividade_t_ha':
      return safeDiv(ctx.producaoTotalTon, ctx.areaPlantadaHa, 0);
    case 'tempo_ciclo_producao':
      return ctx.tempoCicloProducao;
    case 'treinamento_per_capita':
      if (ctx.horasTreinamento === undefined || ctx.numeroColaboradores === undefined) {
        return undefined;
      }
      return safeDiv(ctx.horasTreinamento, ctx.numeroColaboradores, 0);
    case 'turnover':
      return ctx.turnoverPct;
    default:
      return undefined;
  }
}

/** Retorna a meta efetiva (override > padrão). */
function metaEfetiva(id: string, ctx: ContextoBSCCalculo): number | undefined {
  const over = ctx.metasOverride?.[id];
  if (over !== undefined && Number.isFinite(over)) return over;
  return KPI_POR_ID[id]?.meta;
}

// ═══════════════════════════════════════════════════════════════
//  API PÚBLICA
// ═══════════════════════════════════════════════════════════════

/** Retorna o catálogo completo de KPIs (cópia defensiva). */
export function listarKpis(): KpiBSCDefinicao[] {
  return BSC_KPIS.slice();
}

/** Retorna apenas os KPIs de uma perspectiva específica. */
export function listarPorPerspectiva(p: PerspectivaBSC): KpiBSCDefinicao[] {
  return BSC_KPIS.filter((k) => k.perspectiva === p);
}

/**
 * Gera observações e recomendações qualitativas baseadas nos
 * scores. Regras simples, auditáveis, alinhadas ao discurso de
 * reunião executiva agro.
 */
function gerarInsights(
  porPerspectiva: ScorePerspectivaBSC[],
  scoreGeral: number,
): { observacoes: string[]; recomendacoes: string[] } {
  const observacoes: string[] = [];
  const recomendacoes: string[] = [];

  observacoes.push(
    `Score BSC geral: ${scoreGeral.toFixed(1)}/100 (média ponderada das 4 perspectivas).`,
  );

  // Perspectiva financeira abaixo do piso → alerta estrutural
  const fin = porPerspectiva.find((p) => p.perspectiva === 'financeira');
  if (fin && fin.score < 70) {
    recomendacoes.push(
      `Perspectiva financeira em ${fin.score.toFixed(1)}/100 — revisar ` +
        `estrutura de capital (endividamento/liquidez) antes da próxima safra.`,
    );
  }
  const proc = porPerspectiva.find((p) => p.perspectiva === 'processos_internos');
  if (proc && proc.score < 70) {
    recomendacoes.push(
      `Processos internos em ${proc.score.toFixed(1)}/100 — avaliar custo ` +
        `por hectare e produtividade (benchmark Embrapa).`,
    );
  }
  const cli = porPerspectiva.find((p) => p.perspectiva === 'clientes');
  if (cli && cli.score < 70) {
    recomendacoes.push(
      `Perspectiva clientes em ${cli.score.toFixed(1)}/100 — atenção a PMR ` +
        `e inadimplência; negociar hedge de recebíveis.`,
    );
  }
  const apr = porPerspectiva.find((p) => p.perspectiva === 'aprendizado_crescimento');
  if (apr && apr.score < 70) {
    recomendacoes.push(
      `Aprendizado/crescimento em ${apr.score.toFixed(1)}/100 — plano de ` +
        `capacitação Senar (meta 20h/colab/ano) + retenção.`,
    );
  }

  if (scoreGeral >= 90) {
    observacoes.push('Desempenho excelente — manter rotina de revisão trimestral.');
  } else if (scoreGeral >= 75) {
    observacoes.push('Desempenho satisfatório com espaço de melhoria pontual.');
  } else if (scoreGeral >= 60) {
    observacoes.push('Desempenho médio — requer plano de ação para próxima safra.');
  } else {
    observacoes.push(
      'Desempenho crítico — recomenda-se reunião executiva imediata ' +
        'para reestruturação operacional e financeira.',
    );
  }

  return { observacoes, recomendacoes };
}

/**
 * Calcula o Balanced Scorecard completo para o período informado.
 *
 * Mecânica:
 *   1. Para cada KPI no catálogo, obtém valor via `valorKpi(ctx)`;
 *      ignora silenciosamente os KPIs sem dados (ex.: NPS ausente).
 *   2. Calcula score por KPI (maior/menor_melhor) conforme polaridade.
 *   3. Score por perspectiva = média dos scores × 100.
 *   4. Score geral = média ponderada das perspectivas (pesos K&N).
 *
 * Função pura (sem efeitos colaterais).
 */
export function calcularBSC(ctx: ContextoBSCCalculo): ResultadoBSC {
  const perspectivas: PerspectivaBSC[] = [
    'financeira',
    'clientes',
    'processos_internos',
    'aprendizado_crescimento',
  ];
  const porPerspectiva: ScorePerspectivaBSC[] = [];

  for (const persp of perspectivas) {
    const defs = listarPorPerspectiva(persp);
    const valores: ValorKpi[] = [];
    for (const def of defs) {
      const valor = valorKpi(def.id, ctx);
      if (valor === undefined) continue;
      const meta = metaEfetiva(def.id, ctx);
      const { score, status } = scoreKpi(valor, meta, def.tendencia);
      valores.push({
        kpiId: def.id,
        valor: round4(valor),
        periodo: ctx.periodo,
        meta,
        status,
        score,
      });
    }
    // Score em 0..100: média dos scores de KPI × 100, clampado em 100
    // (acima disso é "acima da meta" mas não inflaciona o ranking).
    const scorePersp =
      valores.length > 0
        ? round2(
            Math.min(
              100,
              (valores.reduce((s, v) => s + v.score, 0) / valores.length) * 100,
            ),
          )
        : 0;
    porPerspectiva.push({ perspectiva: persp, score: scorePersp, kpis: valores });
  }

  // Score geral ponderado. Se alguma perspectiva não tem KPIs,
  // redistribui os pesos para as demais proporcionalmente.
  const pesosPresentes = porPerspectiva
    .filter((p) => p.kpis.length > 0)
    .map((p) => ({ p: p.perspectiva, w: PESOS_PERSPECTIVA[p.perspectiva] }));
  const somaPesos = pesosPresentes.reduce((s, x) => s + x.w, 0);
  const scoreGeral =
    somaPesos > 0
      ? round2(
          Math.min(
            100,
            porPerspectiva
              .filter((p) => p.kpis.length > 0)
              .reduce(
                (s, p) =>
                  s + p.score * (PESOS_PERSPECTIVA[p.perspectiva] / somaPesos),
                0,
              ),
          ),
        )
      : 0;

  const insights = gerarInsights(porPerspectiva, scoreGeral);

  return {
    periodo: ctx.periodo,
    scoreGeral,
    porPerspectiva,
    observacoes: insights.observacoes,
    recomendacoes: insights.recomendacoes,
  };
}
